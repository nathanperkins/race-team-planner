#!/bin/bash
set -eo pipefail

# Configuration
# Ensure we are in the project root
cd "$(dirname "$0")/.."

ENV=$1
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

echo "🚀 Deploying to environment: $ENV"

# Extract project_id and region from tfvars if not provided as env vars
# Using a simpler awk approach to extract quoted values
EXTRACTED_PROJECT_ID=$(grep '^\s*project_id\s*=' "$TFVARS_FILE" | head -1 | awk -F '"' '{print $2}')
EXTRACTED_REGION=$(grep '^\s*region\s*=' "$TFVARS_FILE" | head -1 | awk -F '"' '{print $2}')

PROJECT_ID=${PROJECT_ID:-$EXTRACTED_PROJECT_ID}
REGION=${REGION:-$EXTRACTED_REGION}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: project_id not found in $TFVARS_FILE. Please add it."
  exit 1
fi

if [ -z "$REGION" ]; then
  echo "Error: region not found in $TFVARS_FILE. Please add it."
  exit 1
fi

APP_NAME="${APP_NAME:-race-team-planner}"
REPO_NAME="$APP_NAME"
IMAGE_NAME="$APP_NAME"
TAG="latest"

echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "App: $APP_NAME"


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
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

echo "Building Docker image..."
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:${TAG}"
# Use --platform linux/amd64 for Cloud Run compatibility
docker build --platform linux/amd64 -t $IMAGE_URI .

echo "Building Migration Docker image..."
MIGRATE_IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}-migrate:latest"
docker build --platform linux/amd64 -t $MIGRATE_IMAGE_URI -f Dockerfile.migrate .

echo "Building Database Tools Docker image..."
DBTOOLS_IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}-dbtools:latest"
docker build --platform linux/amd64 -t $DBTOOLS_IMAGE_URI -f Dockerfile.dbtools .

echo "Pushing images to Artifact Registry..."
docker push $IMAGE_URI
docker push $MIGRATE_IMAGE_URI
docker push $DBTOOLS_IMAGE_URI

echo "Updating migration job with new image..."
gcloud run jobs update ${APP_NAME}-migrate \
  --image $MIGRATE_IMAGE_URI \
  --region $REGION \
  --project $PROJECT_ID

echo "Updating backup job with new image..."
gcloud run jobs update ${APP_NAME}-db-backup \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION \
  --project $PROJECT_ID

echo "Updating restore job with new image..."
gcloud run jobs update ${APP_NAME}-db-restore \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION \
  --project $PROJECT_ID

echo "Updating restore-test job with new image..."
gcloud run jobs update ${APP_NAME}-db-restore-test \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION \
  --project $PROJECT_ID

echo "Updating wipe job with new image..."
gcloud run jobs update ${APP_NAME}-db-wipe \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION \
  --project $PROJECT_ID

echo "Running database migrations..."
echo "Monitor migration job here: https://console.cloud.google.com/run/jobs/details/${REGION}/${APP_NAME}-migrate/executions?project=${PROJECT_ID}"
gcloud run jobs execute ${APP_NAME}-migrate \
  --region $REGION \
  --project $PROJECT_ID \
  --wait

echo "Deploying to Cloud Run..."
gcloud run deploy $APP_NAME \
  --image $IMAGE_URI \
  --region $REGION \
  --project $PROJECT_ID \
  --platform managed \
  --allow-unauthenticated

echo "✅ Deployment to $ENV complete!"
