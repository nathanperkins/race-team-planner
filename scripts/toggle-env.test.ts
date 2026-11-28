// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT_PATH = path.resolve(__dirname, 'toggle-env.sh')

interface FakeJob {
  name: string
  location: string
  state: 'ENABLED' | 'PAUSED'
}

interface FakeGcloudState {
  service?: {
    ingress: string
    minScale?: string
    url?: string
  } | null
  jobs?: FakeJob[]
  authError?: boolean
}

interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
  gcloudCalls: string[]
}

describe('scripts/toggle-env.sh', () => {
  let tempDir: string
  let tfvarsDir: string
  let fakeGcloudPath: string
  let logPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'toggle-env-test-'))
    tfvarsDir = path.join(tempDir, 'terraform')
    logPath = path.join(tempDir, 'gcloud-calls.log')
    fakeGcloudPath = path.join(tempDir, 'fake-gcloud')
    execFileSync('mkdir', ['-p', tfvarsDir])

    writeFileSync(
      path.join(tfvarsDir, 'staging.tfvars'),
      [
        'project_id = "my-staging-project"',
        'region     = "us-west1" # west coast',
        'app_name   = "race-team-planner"',
      ].join('\n')
    )
    writeFileSync(
      path.join(tfvarsDir, 'prod.tfvars'),
      ['project_id = "my-prod-project"', 'region     = "us-central1"'].join('\n')
    )
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function installFakeGcloud(state: FakeGcloudState) {
    writeFileSync(logPath, '')

    const jobsByLocation = new Map<string, FakeJob[]>()
    for (const job of state.jobs ?? []) {
      const list = jobsByLocation.get(job.location) ?? []
      list.push(job)
      jobsByLocation.set(job.location, list)
    }

    const locationCases = Array.from(jobsByLocation.entries())
      .map(([loc, jobs]) => {
        const lines = jobs
          .map(
            (j) =>
              `      printf '%s\\t%s\\n' "projects/test/locations/${loc}/jobs/${j.name}" "${j.state}"`
          )
          .join('\n')
        return `    "${loc}")\n${lines}\n      exit 0 ;;`
      })
      .join('\n')

    const serviceExists = Boolean(state.service)
    const serviceIngress = state.service?.ingress ?? 'all'
    const serviceMinScale = state.service?.minScale ?? ''
    const serviceUrl = state.service?.url ?? 'https://race-team-planner-staging.run.app'

    const script = `#!/bin/bash
echo "$*" >> ${JSON.stringify(logPath)}

if [[ "${state.authError ? 'true' : 'false'}" == "true" ]]; then
  echo "ERROR: (gcloud.scheduler.jobs.list) You do not currently have an active account selected." >&2
  exit 1
fi

if [[ "$1" == "run" && "$2" == "services" && "$3" == "describe" ]]; then
  if [[ "${serviceExists ? 'true' : 'false'}" != "true" ]]; then
    echo "ERROR: (gcloud.run.services.describe) Cannot find service [$4]" >&2
    exit 1
  fi
  if [[ "$*" == *"status.url"* ]]; then
    echo ${JSON.stringify(serviceUrl)}
  else
    printf '%s\\t%s\\n' ${JSON.stringify(serviceIngress)} ${JSON.stringify(serviceMinScale)}
  fi
  exit 0
fi

if [[ "$1" == "run" && "$2" == "services" && "$3" == "update" ]]; then
  exit 0
fi

if [[ "$1" == "scheduler" && "$2" == "jobs" && "$3" == "list" ]]; then
  loc=""
  for arg in "$@"; do
    case "$arg" in
      --location=*) loc="\${arg#--location=}" ;;
    esac
  done
  case "$loc" in
${locationCases}
    *)
      exit 0
      ;;
  esac
fi

if [[ "$1" == "scheduler" && "$2" == "jobs" && ( "$3" == "pause" || "$3" == "resume" ) ]]; then
  exit 0
fi

echo "Unexpected gcloud call: $*" >&2
exit 2
`
    writeFileSync(fakeGcloudPath, script)
    chmodSync(fakeGcloudPath, 0o755)
  }

  function runScript(args: string[], extraEnv: Record<string, string> = {}): RunResult {
    try {
      const stdout = execFileSync('bash', [SCRIPT_PATH, ...args], {
        env: {
          ...process.env,
          TFVARS_DIR: tfvarsDir,
          GCLOUD_BIN: fakeGcloudPath,
          ...extraEnv,
        },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const logContent = readFileSync(logPath, 'utf8').trim()
      return {
        exitCode: 0,
        stdout,
        stderr: '',
        gcloudCalls: logContent ? logContent.split('\n') : [],
      }
    } catch (err) {
      const error = err as { status?: number; stdout?: string; stderr?: string }
      let gcloudCalls: string[] = []
      try {
        const logContent = readFileSync(logPath, 'utf8').trim()
        gcloudCalls = logContent ? logContent.split('\n') : []
      } catch {
        // log may not exist if script failed before invoking gcloud
      }
      return {
        exitCode: error.status ?? 1,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        gcloudCalls,
      }
    }
  }

  const multiRegionEnabledJobs: FakeJob[] = [
    { name: 'race-team-planner-db-backup-hourly', location: 'us-west1', state: 'ENABLED' },
    { name: 'race-team-planner-sync-job', location: 'us-central1', state: 'ENABLED' },
    { name: 'race-team-planner-weekly-notification', location: 'us-central1', state: 'ENABLED' },
    { name: 'race-team-planner-db-restore-test-weekly', location: 'us-central1', state: 'ENABLED' },
    // Unrelated job in the same project should never be touched
    { name: 'unrelated-other-app-job', location: 'us-central1', state: 'ENABLED' },
  ]

  const multiRegionPausedJobs: FakeJob[] = multiRegionEnabledJobs.map((j) =>
    j.name.startsWith('race-team-planner-') ? { ...j, state: 'PAUSED' } : j
  )

  it('prints usage and exits non-zero when arguments are missing or invalid', () => {
    installFakeGcloud({ service: { ingress: 'all' }, jobs: multiRegionEnabledJobs })

    const noArgs = runScript([])
    expect(noArgs.exitCode).toBe(1)
    expect(noArgs.stdout + noArgs.stderr).toMatch(/Usage:/i)

    const badAction = runScript(['staging', 'destroy'])
    expect(badAction.exitCode).toBe(1)
    expect(badAction.stdout + badAction.stderr).toMatch(/Invalid action/i)
  })

  it('fails cleanly when the environment tfvars file does not exist', () => {
    installFakeGcloud({ service: { ingress: 'all' }, jobs: multiRegionEnabledJobs })

    const result = runScript(['nonexistent', 'status'])
    expect(result.exitCode).toBe(1)
    expect(result.stdout + result.stderr).toMatch(/not found/i)
  })

  it('discovers and pauses scheduler jobs across primary region and us-central1, and sets Cloud Run ingress to internal', () => {
    installFakeGcloud({
      service: { ingress: 'all', minScale: '0' },
      jobs: multiRegionEnabledJobs,
    })

    const result = runScript(['staging', 'pause'])
    expect(result.exitCode).toBe(0)

    // Pauses each discovered job in its actual location
    expect(result.gcloudCalls).toContain(
      'scheduler jobs pause race-team-planner-db-backup-hourly --location=us-west1 --project=my-staging-project'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs pause race-team-planner-sync-job --location=us-central1 --project=my-staging-project'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs pause race-team-planner-weekly-notification --location=us-central1 --project=my-staging-project'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs pause race-team-planner-db-restore-test-weekly --location=us-central1 --project=my-staging-project'
    )

    // Never touches unrelated scheduler jobs
    expect(result.gcloudCalls.some((c) => c.includes('unrelated-other-app-job'))).toBe(false)

    // Updates Cloud Run service ingress to internal (no --min-instances flag needed since already 0)
    expect(result.gcloudCalls).toContain(
      'run services update race-team-planner --ingress=internal --region=us-west1 --project=my-staging-project --quiet'
    )

    // Never deletes any resources (preserves DNS domain mapping, TLS cert, Discord OAuth/secrets)
    expect(result.gcloudCalls.some((c) => c.includes('delete'))).toBe(false)
  })

  it('also scales min-instances down to 0 during pause if currently > 0', () => {
    installFakeGcloud({
      service: { ingress: 'all', minScale: '1' },
      jobs: multiRegionEnabledJobs,
    })

    const result = runScript(['staging', 'down'])
    expect(result.exitCode).toBe(0)
    expect(result.gcloudCalls).toContain(
      'run services update race-team-planner --ingress=internal --min-instances=0 --region=us-west1 --project=my-staging-project --quiet'
    )
  })

  it('is idempotent when pausing an already-paused environment', () => {
    installFakeGcloud({
      service: { ingress: 'internal', minScale: '0' },
      jobs: multiRegionPausedJobs,
    })

    const result = runScript(['staging', 'pause'])
    expect(result.exitCode).toBe(0)
    expect(result.gcloudCalls.some((c) => c.includes(' pause '))).toBe(false)
    expect(result.gcloudCalls.some((c) => c.includes(' update '))).toBe(false)
    expect(result.stdout).toMatch(/already paused/i)
    expect(result.stdout).toMatch(/already internal/i)
  })

  it('resumes Cloud Run ingress to all before resuming all discovered scheduler jobs in their respective locations', () => {
    installFakeGcloud({
      service: { ingress: 'internal', minScale: '0' },
      jobs: multiRegionPausedJobs,
    })

    const result = runScript(['staging', 'resume'])
    expect(result.exitCode).toBe(0)

    const updateIndex = result.gcloudCalls.indexOf(
      'run services update race-team-planner --ingress=all --region=us-west1 --project=my-staging-project --quiet'
    )
    const firstResumeIndex = result.gcloudCalls.findIndex((c) =>
      c.startsWith('scheduler jobs resume ')
    )

    expect(updateIndex).toBeGreaterThan(-1)
    expect(firstResumeIndex).toBeGreaterThan(updateIndex)
    expect(result.gcloudCalls).toContain(
      'scheduler jobs resume race-team-planner-db-backup-hourly --location=us-west1 --project=my-staging-project'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs resume race-team-planner-sync-job --location=us-central1 --project=my-staging-project'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs resume race-team-planner-weekly-notification --location=us-central1 --project=my-staging-project'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs resume race-team-planner-db-restore-test-weekly --location=us-central1 --project=my-staging-project'
    )
  })

  it('is idempotent when resuming an already-running environment', () => {
    installFakeGcloud({
      service: { ingress: 'all', minScale: '0' },
      jobs: multiRegionEnabledJobs,
    })

    const result = runScript(['staging', 'up'])
    expect(result.exitCode).toBe(0)
    expect(result.gcloudCalls.some((c) => c.includes(' resume '))).toBe(false)
    expect(result.gcloudCalls.some((c) => c.includes(' update '))).toBe(false)
    expect(result.stdout).toMatch(/already enabled/i)
    expect(result.stdout).toMatch(/already all/i)
  })

  it('supports --dry-run without running any mutating gcloud commands', () => {
    installFakeGcloud({
      service: { ingress: 'all', minScale: '0' },
      jobs: multiRegionEnabledJobs,
    })

    const result = runScript(['staging', 'pause', '--dry-run'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/DRY RUN/i)
    expect(result.gcloudCalls.some((c) => c.includes(' pause '))).toBe(false)
    expect(result.gcloudCalls.some((c) => c.includes(' update '))).toBe(false)
  })

  it('blocks pausing prod without --force in non-interactive shells and allows it with --force', () => {
    const prodJobs: FakeJob[] = [
      { name: 'race-team-planner-sync-job', location: 'us-central1', state: 'ENABLED' },
    ]
    installFakeGcloud({
      service: { ingress: 'all', minScale: '0' },
      jobs: prodJobs,
    })

    const blocked = runScript(['prod', 'pause'])
    expect(blocked.exitCode).toBe(1)
    expect(blocked.stdout + blocked.stderr).toMatch(/--force/i)
    expect(blocked.gcloudCalls).toHaveLength(0)

    const forced = runScript(['prod', 'pause', '--force'])
    expect(forced.exitCode).toBe(0)
    expect(forced.gcloudCalls).toContain(
      'run services update race-team-planner --ingress=internal --region=us-central1 --project=my-prod-project --quiet'
    )
  })

  it('reports RUNNING, PAUSED, and PARTIAL states accurately with job locations for status command', () => {
    installFakeGcloud({
      service: { ingress: 'all', minScale: '0', url: 'https://staging.example.com' },
      jobs: multiRegionEnabledJobs,
    })
    const running = runScript(['staging', 'status'])
    expect(running.exitCode).toBe(0)
    expect(running.stdout).toMatch(/Overall:\s+RUNNING/)
    expect(running.stdout).toContain('https://staging.example.com')
    expect(running.stdout).toContain('race-team-planner-db-backup-hourly (us-west1): ENABLED')
    expect(running.stdout).toContain('race-team-planner-sync-job (us-central1): ENABLED')

    installFakeGcloud({
      service: { ingress: 'internal', minScale: '0' },
      jobs: multiRegionPausedJobs,
    })
    const paused = runScript(['staging', 'status'])
    expect(paused.exitCode).toBe(0)
    expect(paused.stdout).toMatch(/Overall:\s+PAUSED/)

    installFakeGcloud({
      service: { ingress: 'internal', minScale: '0' },
      jobs: multiRegionPausedJobs.map((j) =>
        j.name === 'race-team-planner-sync-job' ? { ...j, state: 'ENABLED' } : j
      ),
    })
    const partial = runScript(['staging', 'status'])
    expect(partial.exitCode).toBe(0)
    expect(partial.stdout).toMatch(/Overall:\s+PARTIAL/)
  })

  it('fails loudly on gcloud auth errors instead of treating them as missing resources', () => {
    installFakeGcloud({ authError: true })

    const result = runScript(['staging', 'pause'])
    expect(result.exitCode).toBe(1)
    expect(result.stdout + result.stderr).toMatch(/active account/i)
  })

  it('supports custom app_name from tfvars, SCHEDULER_LOCATIONS, and PROJECT_ID env overrides', () => {
    writeFileSync(
      path.join(tfvarsDir, 'custom.tfvars'),
      [
        'project_id = "tfvars-proj"',
        'region     = "europe-west1"',
        'app_name   = "custom-planner"',
      ].join('\n')
    )
    installFakeGcloud({
      service: { ingress: 'all', minScale: '0' },
      jobs: [
        { name: 'custom-planner-db-backup-hourly', location: 'europe-west1', state: 'ENABLED' },
        { name: 'custom-planner-sync-job', location: 'europe-west2', state: 'ENABLED' },
      ],
    })

    const result = runScript(['custom', 'pause'], {
      PROJECT_ID: 'override-proj',
      SCHEDULER_LOCATIONS: 'europe-west1,europe-west2',
    })
    expect(result.exitCode).toBe(0)
    expect(result.gcloudCalls).toContain(
      'run services update custom-planner --ingress=internal --region=europe-west1 --project=override-proj --quiet'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs pause custom-planner-db-backup-hourly --location=europe-west1 --project=override-proj'
    )
    expect(result.gcloudCalls).toContain(
      'scheduler jobs pause custom-planner-sync-job --location=europe-west2 --project=override-proj'
    )
  })
})
