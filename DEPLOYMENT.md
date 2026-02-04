# Deployment Guide

This guide describes how to deploy the iRacing Team Planner application to **Google Cloud Platform (GCP)** using **Terraform** and **Cloud Run**.

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

## Troubleshooting

- **Permission Errors**: Ensure your local `gcloud` user has the Editor or Owner role on the project.
- **Docker Push Fails**: Run `gcloud auth configure-docker us-central1-docker.pkg.dev` again.
- **Migration Fails**: Check the logs in the Cloud Run Jobs console. It often indicates a connection issue with Supabase or a mismatch in schema.
- **Billing**: Cloud Run and Secret Manager require billing to be enabled on the project.
