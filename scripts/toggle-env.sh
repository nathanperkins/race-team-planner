#!/bin/bash
set -eo pipefail

# Pause, resume, or inspect cost-generating GCP resources for an environment
# without deleting stateful or hard-to-recreate resources (Cloud Run service,
# custom domain DNS/TLS mapping, Secret Manager / Discord OAuth & bot config,
# GCS backup bucket, Artifact Registry :latest images, or Supabase).

cd "$(dirname "$0")/.."

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
TFVARS_DIR="${TFVARS_DIR:-terraform}"

usage() {
  cat <<'EOF'
Usage: ./scripts/toggle-env.sh <environment> <pause|resume|status> [--force] [--dry-run]

Actions:
  pause  (aliases: down, stop)   Pause all app Cloud Scheduler jobs and restrict Cloud Run
                                 ingress to internal-only (min-instances=0) to stop compute
                                 and background job billing without touching DNS or Discord.
  resume (aliases: up, start)    Restore Cloud Run public ingress (all) and resume all app
                                 Cloud Scheduler jobs.
  status                         Show current Cloud Run ingress/scaling and scheduler states.

Options:
  --force, -f    Required to pause prod/production in non-interactive shells (skips prompt).
  --dry-run, -n  Inspect current state and print gcloud commands without making changes.
  --help, -h     Show this help message.

Environment overrides:
  PROJECT_ID           Override project_id from terraform/<env>.tfvars
  REGION               Override region from terraform/<env>.tfvars
  APP_NAME             Override app_name from terraform/<env>.tfvars
  SCHEDULER_LOCATIONS  Comma-separated Cloud Scheduler locations to scan
                       (defaults to "<region>,us-central1")

Examples:
  ./scripts/toggle-env.sh staging status
  ./scripts/toggle-env.sh staging pause
  ./scripts/toggle-env.sh staging pause --dry-run
  ./scripts/toggle-env.sh staging resume
EOF
}

ENV=""
RAW_ACTION=""
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)
      FORCE=true
      shift
      ;;
    --dry-run|-n)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      echo "Error: Unknown option '$1'" >&2
      echo "" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -z "$ENV" ]]; then
        ENV="$1"
      elif [[ -z "$RAW_ACTION" ]]; then
        RAW_ACTION="$1"
      else
        echo "Error: Unexpected argument '$1'" >&2
        echo "" >&2
        usage >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$ENV" || -z "$RAW_ACTION" ]]; then
  usage
  exit 1
fi

ACTION_LOWER=$(printf '%s' "$RAW_ACTION" | tr '[:upper:]' '[:lower:]')
case "$ACTION_LOWER" in
  pause|down|stop)
    ACTION="pause"
    ;;
  resume|up|start)
    ACTION="resume"
    ;;
  status)
    ACTION="status"
    ;;
  *)
    echo "Error: Invalid action '$RAW_ACTION'. Expected: pause, resume, or status." >&2
    echo "" >&2
    usage >&2
    exit 1
    ;;
esac

extract_tfvar() {
  local key="$1"
  local file="$2"
  grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" 2>/dev/null \
    | head -1 \
    | sed -E 's/^[^=]*=[[:space:]]*"([^"]*)".*/\1/' || true
}

TFVARS_FILE="${TFVARS_DIR}/${ENV}.tfvars"
if [[ -f "$TFVARS_FILE" ]]; then
  EXTRACTED_PROJECT_ID=$(extract_tfvar "project_id" "$TFVARS_FILE")
  EXTRACTED_REGION=$(extract_tfvar "region" "$TFVARS_FILE")
  EXTRACTED_APP_NAME=$(extract_tfvar "app_name" "$TFVARS_FILE")
elif [[ -z "${PROJECT_ID:-}" || -z "${REGION:-}" ]]; then
  echo "Error: Variable file $TFVARS_FILE not found." >&2
  echo "Available environments (based on .tfvars files in ${TFVARS_DIR}/):" >&2
  ls "${TFVARS_DIR}"/*.tfvars 2>/dev/null | xargs -n 1 basename 2>/dev/null | sed 's/\.tfvars//' >&2 || true
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-${EXTRACTED_PROJECT_ID:-}}"
REGION="${REGION:-${EXTRACTED_REGION:-}}"
APP_NAME="${APP_NAME:-${EXTRACTED_APP_NAME:-race-team-planner}}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: project_id not found in $TFVARS_FILE (or PROJECT_ID env var)." >&2
  exit 1
fi

if [[ -z "$REGION" ]]; then
  echo "Error: region not found in $TFVARS_FILE (or REGION env var)." >&2
  exit 1
fi

if ! command -v "$GCLOUD_BIN" >/dev/null 2>&1; then
  echo "Error: '$GCLOUD_BIN' not found in PATH. Install Google Cloud SDK first." >&2
  exit 1
fi

# Production safety guard for pause
if [[ "$ACTION" == "pause" && ( "$ENV" == "prod" || "$ENV" == "production" ) && "$DRY_RUN" == "false" && "$FORCE" == "false" ]]; then
  if [[ -t 0 ]]; then
    echo "⚠️  WARNING: You are about to PAUSE the production environment ($ENV / $PROJECT_ID)."
    echo "This will block public traffic to Cloud Run and pause all scheduled jobs."
    read -r -p "Type 'pause ${ENV}' to confirm: " CONFIRM
    if [[ "$CONFIRM" != "pause ${ENV}" ]]; then
      echo "Aborted."
      exit 1
    fi
  else
    echo "Error: Refusing to pause '$ENV' in a non-interactive shell without --force." >&2
    exit 1
  fi
fi

# Determine Cloud Scheduler locations to inspect (Cloud Scheduler jobs may live
# in the project's primary region or in us-central1, GCP's default scheduler region).
SEARCH_LOCATIONS=()
if [[ -n "${SCHEDULER_LOCATIONS:-}" ]]; then
  IFS=',' read -r -a RAW_LOCATIONS <<< "$SCHEDULER_LOCATIONS"
  for loc in "${RAW_LOCATIONS[@]}"; do
    trimmed=$(printf '%s' "$loc" | tr -d '[:space:]')
    if [[ -n "$trimmed" ]]; then
      SEARCH_LOCATIONS+=("$trimmed")
    fi
  done
else
  SEARCH_LOCATIONS+=("$REGION")
  if [[ "$REGION" != "us-central1" ]]; then
    SEARCH_LOCATIONS+=("us-central1")
  fi
fi

EXPECTED_SCHEDULER_JOBS=(
  "${APP_NAME}-sync-job"
  "${APP_NAME}-weekly-notification"
  "${APP_NAME}-db-backup-hourly"
  "${APP_NAME}-db-restore-test-weekly"
)

is_not_found_error() {
  printf '%s' "$1" | grep -qiE "(NOT_FOUND|not found|cannot find|could not be found)"
}

describe_service() {
  local output
  if ! output=$("$GCLOUD_BIN" run services describe "$APP_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(metadata.annotations['run.googleapis.com/ingress'],spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])" 2>&1); then
    if is_not_found_error "$output"; then
      echo "NOT_FOUND"
      return 0
    fi
    echo "Error describing Cloud Run service ${APP_NAME}:" >&2
    echo "$output" >&2
    return 1
  fi
  printf '%s\n' "$output"
}

describe_service_url() {
  "$GCLOUD_BIN" run services describe "$APP_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)" 2>/dev/null || true
}

# Populates DISCOVERED_JOBS with entries of the form "job_id|location|state"
# for every Cloud Scheduler job matching "${APP_NAME}-*" across SEARCH_LOCATIONS.
DISCOVERED_JOBS=()

discover_scheduler_jobs() {
  local loc output line full_name job_state job_id
  for loc in "${SEARCH_LOCATIONS[@]}"; do
    if ! output=$("$GCLOUD_BIN" scheduler jobs list \
      --location="$loc" \
      --project="$PROJECT_ID" \
      --format="value(name,state)" 2>&1); then
      if is_not_found_error "$output"; then
        continue
      fi
      echo "Error listing Cloud Scheduler jobs in ${loc}:" >&2
      echo "$output" >&2
      return 1
    fi

    while IFS=$'\t' read -r full_name job_state; do
      [[ -z "$full_name" ]] && continue
      job_id="${full_name##*/}"
      case "$job_id" in
        "${APP_NAME}-"*)
          DISCOVERED_JOBS+=("${job_id}|${loc}|${job_state}")
          ;;
      esac
    done <<< "$output"
  done
}

is_job_discovered() {
  local target="$1"
  local entry job_id
  for entry in "${DISCOVERED_JOBS[@]}"; do
    job_id="${entry%%|*}"
    if [[ "$job_id" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

run_mutation() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] $*"
    return 0
  fi
  "$@"
}

echo "Environment: $ENV"
echo "Project:     $PROJECT_ID"
echo "Region:      $REGION"
echo "App:         $APP_NAME"
echo "Action:      $ACTION$([[ "$DRY_RUN" == "true" ]] && echo " (DRY RUN)")"
echo "------------------------------------------------------------"

discover_scheduler_jobs

case "$ACTION" in
  status)
    found_count=0
    running_count=0
    paused_count=0

    service_info=$(describe_service)
    if [[ "$service_info" == "NOT_FOUND" ]]; then
      echo "Cloud Run Service ($APP_NAME): NOT FOUND"
    else
      found_count=$((found_count + 1))
      IFS=$'\t' read -r current_ingress current_min_scale <<< "$service_info"
      current_ingress="${current_ingress:-all}"
      current_min_scale="${current_min_scale:-0}"
      service_url=$(describe_service_url)

      if [[ "$current_ingress" == "internal" && "$current_min_scale" == "0" ]]; then
        paused_count=$((paused_count + 1))
        svc_status="PAUSED"
      else
        running_count=$((running_count + 1))
        svc_status="RUNNING"
      fi

      echo "Cloud Run Service ($APP_NAME): $svc_status (ingress=$current_ingress, min-instances=$current_min_scale)"
      if [[ -n "$service_url" ]]; then
        echo "  URL: $service_url"
      fi
    fi

    echo "Cloud Scheduler Jobs (scanned: ${SEARCH_LOCATIONS[*]}):"
    for entry in "${DISCOVERED_JOBS[@]}"; do
      IFS='|' read -r job_id job_loc job_state <<< "$entry"
      echo "  - ${job_id} (${job_loc}): ${job_state}"
      found_count=$((found_count + 1))
      if [[ "$job_state" == "PAUSED" ]]; then
        paused_count=$((paused_count + 1))
      elif [[ "$job_state" == "ENABLED" ]]; then
        running_count=$((running_count + 1))
      fi
    done

    for expected_job in "${EXPECTED_SCHEDULER_JOBS[@]}"; do
      if ! is_job_discovered "$expected_job"; then
        echo "  - ${expected_job}: NOT_FOUND"
      fi
    done

    echo "------------------------------------------------------------"
    if [[ "$found_count" -eq 0 ]]; then
      echo "Overall: NOT DEPLOYED"
    elif [[ "$paused_count" -eq "$found_count" ]]; then
      echo "Overall: PAUSED"
    elif [[ "$running_count" -eq "$found_count" ]]; then
      echo "Overall: RUNNING"
    else
      echo "Overall: PARTIAL"
    fi
    ;;

  pause)
    echo "1. Pausing Cloud Scheduler jobs..."
    if [[ "${#DISCOVERED_JOBS[@]}" -eq 0 ]]; then
      echo "  ⚠️  No ${APP_NAME}-* Cloud Scheduler jobs found in: ${SEARCH_LOCATIONS[*]}"
    else
      for entry in "${DISCOVERED_JOBS[@]}"; do
        IFS='|' read -r job_id job_loc job_state <<< "$entry"
        if [[ "$job_state" == "PAUSED" ]]; then
          echo "  ✓  ${job_id} (${job_loc}): already paused"
        else
          echo "  ⏸  Pausing ${job_id} (${job_loc})..."
          run_mutation "$GCLOUD_BIN" scheduler jobs pause "$job_id" \
            --location="$job_loc" \
            --project="$PROJECT_ID"
        fi
      done
    fi

    echo "2. Restricting Cloud Run service ingress to internal..."
    service_info=$(describe_service)
    if [[ "$service_info" == "NOT_FOUND" ]]; then
      echo "  ⚠️  ${APP_NAME}: not found — skipping"
    else
      IFS=$'\t' read -r current_ingress current_min_scale <<< "$service_info"
      current_ingress="${current_ingress:-all}"
      current_min_scale="${current_min_scale:-0}"

      if [[ "$current_ingress" == "internal" && "$current_min_scale" == "0" ]]; then
        echo "  ✓  ${APP_NAME}: already internal with min-instances=0"
      elif [[ "$current_min_scale" != "0" ]]; then
        echo "  ⏸  Updating ${APP_NAME} (ingress=internal, min-instances=0)..."
        run_mutation "$GCLOUD_BIN" run services update "$APP_NAME" \
          --ingress=internal \
          --min-instances=0 \
          --region="$REGION" \
          --project="$PROJECT_ID" \
          --quiet
      else
        echo "  ⏸  Updating ${APP_NAME} (ingress=internal)..."
        run_mutation "$GCLOUD_BIN" run services update "$APP_NAME" \
          --ingress=internal \
          --region="$REGION" \
          --project="$PROJECT_ID" \
          --quiet
      fi
    fi

    echo ""
    echo "✅ Environment '$ENV' paused$([[ "$DRY_RUN" == "true" ]] && echo " (DRY RUN — no changes applied)")."
    echo "Preserved intact: Cloud Run service & custom domain DNS/TLS mapping, Secret Manager (Discord OAuth/bot), GCS backups, Artifact Registry :latest images, and Supabase."
    echo "To resume later: ./scripts/toggle-env.sh ${ENV} resume"
    ;;

  resume)
    echo "1. Restoring Cloud Run service public ingress..."
    service_info=$(describe_service)
    if [[ "$service_info" == "NOT_FOUND" ]]; then
      echo "  ⚠️  ${APP_NAME}: not found — skipping"
    else
      IFS=$'\t' read -r current_ingress _ <<< "$service_info"
      current_ingress="${current_ingress:-all}"

      if [[ "$current_ingress" == "all" ]]; then
        echo "  ✓  ${APP_NAME}: ingress already all"
      else
        echo "  ▶  Updating ${APP_NAME} (ingress=all)..."
        run_mutation "$GCLOUD_BIN" run services update "$APP_NAME" \
          --ingress=all \
          --region="$REGION" \
          --project="$PROJECT_ID" \
          --quiet
      fi
    fi

    echo "2. Resuming Cloud Scheduler jobs..."
    if [[ "${#DISCOVERED_JOBS[@]}" -eq 0 ]]; then
      echo "  ⚠️  No ${APP_NAME}-* Cloud Scheduler jobs found in: ${SEARCH_LOCATIONS[*]}"
    else
      for entry in "${DISCOVERED_JOBS[@]}"; do
        IFS='|' read -r job_id job_loc job_state <<< "$entry"
        if [[ "$job_state" == "ENABLED" ]]; then
          echo "  ✓  ${job_id} (${job_loc}): already enabled"
        else
          echo "  ▶  Resuming ${job_id} (${job_loc})..."
          run_mutation "$GCLOUD_BIN" scheduler jobs resume "$job_id" \
            --location="$job_loc" \
            --project="$PROJECT_ID"
        fi
      done
    fi

    echo ""
    echo "✅ Environment '$ENV' resumed$([[ "$DRY_RUN" == "true" ]] && echo " (DRY RUN — no changes applied)")."
    ;;
esac
