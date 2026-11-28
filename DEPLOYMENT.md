# Deployment Guide

This guide describes how to deploy the Race Team Planner application to **Google Cloud Platform (GCP)** using **Terraform** and **Cloud Run**.

## Prerequisites

Before you begin, ensure you have the following installed locally:

- [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- [Terraform](https://developer.hashicorp.com/terraform/downloads)
- [Docker](https://docs.docker.com/get-docker/)

You also need a **Supabase** project for the database.

## Initial Setup

We have provided a helper script to set up your GCP project and remote state bucket for a specific environment (e.g., `staging` or `prod`).

1.  **Run the Setup Script**:

    ```bash
    ./scripts/setup-gcp.sh staging
    ```

    Follow the prompts to:
    - Login to Google Cloud.
    - Select or create a GCP Project for that environment.
    - Enable necessary initial APIs.
    - Create a GCS bucket to store Terraform state (e.g., `YOUR_PROJECT_ID-tf-state`).

    > **Important**: If you created a new project, make sure to [enable billing](https://console.cloud.google.com/billing) for it in the Google Cloud Console.

## Configuration

1.  **Navigate to the Terraform directory**:

    ```bash
    cd terraform
    ```

2.  **Create your variables file for the environment**:

    ```bash
    cp terraform.tfvars.example staging.tfvars
    ```

3.  **Update `staging.tfvars`**:
    Open the file and fill in the required values:
    - `project_id`: Your GCP Project ID (from step 1).
    - `region`: The GCP region (defaults to `us-west1`).
    - `supabase_...`: Credentials from your Supabase project settings.
    - `nextauth_secret`: Generate one using `npm run generate-secret`.
    - `discord_...`: Your Discord OAuth credentials.
    - `iracing_...`: Credentials for iRacing Data API.
    - `cron_secret`: A secure random string to authorize automated sync jobs.
    - `app_title`: (Optional) Custom application title for branding.

## Deploying

We have a script that handles the entire pipeline (Terraform, Docker build, Migration, and Cloud Run deployment) for a specific environment.

```bash
# Deploys to staging
./scripts/deploy.sh staging

# Deploys to production
./scripts/deploy.sh prod
```

### What `deploy.sh` does:

1.  **Initializes Terraform** with a unique state prefix for the environment (`terraform/state/ENV`).
2.  **Applies** Terraform infrastructure changes using the corresponding `.tfvars` file.
3.  **Builds** the application, migration, and db-tools Docker images.
4.  **Pushes** these images to Google Artifact Registry.
5.  **Updates** and **Executes** the Cloud Run Migration Job.
6.  **Deploys** the new application revision to Cloud Run.

## Pausing & Resuming an Environment (Cost Saving)

To minimize GCP billing when a non-production environment (like `staging`) is not actively in use—without tearing down DNS, SSL certificates, or Discord configuration—use `scripts/toggle-env.sh`:

```bash
# Check current state of Cloud Run ingress and Cloud Scheduler jobs
./scripts/toggle-env.sh staging status

# Preview what pausing will do without making changes
./scripts/toggle-env.sh staging pause --dry-run

# Pause staging (stops scheduled Cloud Run jobs and blocks public traffic)
./scripts/toggle-env.sh staging pause

# Resume staging when you need it again (takes a few seconds, no rebuild needed)
./scripts/toggle-env.sh staging resume
```

### What `pause` stops vs. preserves

- **Stopped (eliminates Cloud Run compute & scheduled job usage)**:
  - Pauses all 4 Cloud Scheduler jobs (`sync-job`, `weekly-notification`, `db-backup-hourly`, `db-restore-test-weekly`), stopping hourly backup jobs, 4-hour iRacing syncs, weekly 2 vCPU restore tests, and weekly Discord notifications.
  - Restricts Cloud Run service ingress to `internal` (and ensures `min-instances=0`) so external traffic/crawlers cannot wake container instances.
- **Preserved intact (no tedious re-setup required)**:
  - Cloud Run service definition and custom domain mapping (DNS records and managed TLS certificate stay intact).
  - Secret Manager secrets (Discord OAuth/bot tokens, iRacing credentials, NextAuth, Prisma encryption key).
  - GCS backup bucket, Artifact Registry `:latest` images, and Supabase database.

> **Notes**:
>
> - Pausing `prod` / `production` requires interactive confirmation (or `--force` in non-interactive shells).
> - Running `./scripts/deploy.sh <env>` later applies Terraform (`ingress = "INGRESS_TRAFFIC_ALL"`) and brings the service back online; run `./scripts/toggle-env.sh <env> resume` if you also want to resume the scheduler jobs without redeploying.

## Troubleshooting

- **Permission Errors**: Ensure your local `gcloud` user has the Editor or Owner role on the project.
- **Docker Push Fails**: Run `gcloud auth configure-docker us-central1-docker.pkg.dev` again.
- **Migration Fails**: Check the logs in the Cloud Run Jobs console. It often indicates a connection issue with Supabase or a mismatch in schema.
- **Billing**: Cloud Run and Secret Manager require billing to be enabled on the project.
