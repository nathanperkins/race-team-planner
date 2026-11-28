#!/bin/bash
set -eo pipefail

# Configuration
# Ensure we are in the project root
cd "$(dirname "$0")/.."

ENV="${1:-}"
if [[ -z "$ENV" ]]; then
  echo "Usage: ./scripts/deploy.sh [environment]"
  echo "Example: ./scripts/deploy.sh staging"
  echo ""
  echo "Available environments (based on .tfvars files in terraform/):"
  ls terraform/*.tfvars 2>/dev/null | xargs -n 1 basename | sed 's/\.tfvars//'
  exit 1
fi

TFVARS_FILE="terraform/${ENV}.tfvars"
if [[ ! -f "$TFVARS_FILE" ]]; then
  echo "Error: Variable file $TFVARS_FILE not found."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: deploy.sh must be run from inside a git repository."
  exit 1
fi

GIT_STATUS=$(git status --porcelain)
if [[ "$ENV" == "prod" || "$ENV" == "production" ]]; then
  if [[ -n "$GIT_STATUS" ]]; then
    echo "Error: Working tree has uncommitted or untracked changes."
    echo "Commit or stash all changes before deploying to $ENV."
    git status --short
    exit 1
  fi
fi

echo "🚀 Deploying to environment: $ENV"

# Extract project_id, region, and optional app_name from tfvars if not provided as env vars
extract_tfvar() {
  local key="$1"
  local file="$2"
  grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" 2>/dev/null \
    | head -1 \
    | sed -E 's/^[^=]*=[[:space:]]*"([^"]*)".*/\1/' || true
}

EXTRACTED_PROJECT_ID=$(extract_tfvar "project_id" "$TFVARS_FILE")
EXTRACTED_REGION=$(extract_tfvar "region" "$TFVARS_FILE")
EXTRACTED_APP_NAME=$(extract_tfvar "app_name" "$TFVARS_FILE")

PROJECT_ID="${PROJECT_ID:-${EXTRACTED_PROJECT_ID:-}}"
REGION="${REGION:-${EXTRACTED_REGION:-}}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: project_id not found in $TFVARS_FILE. Please add it."
  exit 1
fi

if [ -z "$REGION" ]; then
  echo "Error: region not found in $TFVARS_FILE. Please add it."
  exit 1
fi

APP_NAME="${APP_NAME:-${EXTRACTED_APP_NAME:-race-team-planner}}"
REPO_NAME="$APP_NAME"
IMAGE_NAME="$APP_NAME"

if [[ -z "${IMAGE_TAG:-}" ]]; then
  GIT_SHA=$(git rev-parse --short=7 HEAD)
  EXACT_TAG=$(git describe --tags --exact-match 2>/dev/null || true)
  EXACT_TAG="${EXACT_TAG//\//-}"
  if [[ -n "$GIT_STATUS" ]]; then
    IMAGE_TAG="${GIT_SHA}-dirty"
  elif [[ -n "$EXACT_TAG" ]]; then
    IMAGE_TAG="${EXACT_TAG}-${GIT_SHA}"
  else
    IMAGE_TAG="$GIT_SHA"
  fi
fi

echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "App: $APP_NAME"
echo "Image Tag: $IMAGE_TAG"

# Initialize Terraform with environment-specific state prefix
echo "Initializing Terraform for $ENV..."
BUCKET_NAME="${PROJECT_ID}-tf-state"
(cd terraform && terraform init \
  -reconfigure \
  -backend-config="bucket=${BUCKET_NAME}" \
  -backend-config="prefix=terraform/state/${ENV}")

echo "Applying Terraform changes..."
(cd terraform && terraform apply -var-file="${ENV}.tfvars")

echo "Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "Building Docker image..."
IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}"
IMAGE_URI="${IMAGE_REPO}:${IMAGE_TAG}"
IMAGE_LATEST_URI="${IMAGE_REPO}:latest"
# Use --platform linux/amd64 for Cloud Run compatibility
docker build --platform linux/amd64 -t "$IMAGE_URI" -t "$IMAGE_LATEST_URI" .

echo "Building Migration Docker image..."
MIGRATE_IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}-migrate"
MIGRATE_IMAGE_URI="${MIGRATE_IMAGE_REPO}:${IMAGE_TAG}"
MIGRATE_IMAGE_LATEST_URI="${MIGRATE_IMAGE_REPO}:latest"
docker build --platform linux/amd64 -t "$MIGRATE_IMAGE_URI" -t "$MIGRATE_IMAGE_LATEST_URI" -f Dockerfile.migrate .

echo "Building Database Tools Docker image..."
DBTOOLS_IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}-dbtools"
DBTOOLS_IMAGE_URI="${DBTOOLS_IMAGE_REPO}:${IMAGE_TAG}"
DBTOOLS_IMAGE_LATEST_URI="${DBTOOLS_IMAGE_REPO}:latest"
docker build --platform linux/amd64 -t "$DBTOOLS_IMAGE_URI" -t "$DBTOOLS_IMAGE_LATEST_URI" -f Dockerfile.dbtools .

echo "Pushing images to Artifact Registry..."
docker push "$IMAGE_URI"
docker push "$IMAGE_LATEST_URI"
docker push "$MIGRATE_IMAGE_URI"
docker push "$MIGRATE_IMAGE_LATEST_URI"
docker push "$DBTOOLS_IMAGE_URI"
docker push "$DBTOOLS_IMAGE_LATEST_URI"

echo "Updating migration job with new image..."
gcloud run jobs update "${APP_NAME}-migrate" \
  --image "$MIGRATE_IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID"

echo "Updating backup job with new image..."
gcloud run jobs update "${APP_NAME}-db-backup" \
  --image "$DBTOOLS_IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID"

echo "Updating restore job with new image..."
gcloud run jobs update "${APP_NAME}-db-restore" \
  --image "$DBTOOLS_IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID"

echo "Updating restore-test job with new image..."
gcloud run jobs update "${APP_NAME}-db-restore-test" \
  --image "$DBTOOLS_IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID"

echo "Updating wipe job with new image..."
gcloud run jobs update "${APP_NAME}-db-wipe" \
  --image "$DBTOOLS_IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID"

echo "Running database migrations..."
echo "Monitor migration job here: https://console.cloud.google.com/run/jobs/details/${REGION}/${APP_NAME}-migrate/executions?project=${PROJECT_ID}"
gcloud run jobs execute "${APP_NAME}-migrate" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --wait

echo "Deploying to Cloud Run..."
gcloud run deploy "$APP_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated

echo "✅ Deployment to $ENV complete (image tag: $IMAGE_TAG)!"
