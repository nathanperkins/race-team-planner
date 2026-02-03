#!/bin/bash
set -e

# Configuration
# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Attempt to get project ID from gcloud, otherwise set manually
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
APP_NAME="iracing-team-planner"
REPO_NAME="$APP_NAME"
IMAGE_NAME="$APP_NAME"
TAG="latest"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Could not determine Google Cloud Project ID. Please run 'gcloud config set project YOUR_PROJECT_ID' or set PROJECT_ID environment variable."
  exit 1
fi

echo "Deploying to Project: $PROJECT_ID"
echo "Region: $REGION"
echo "App: $APP_NAME"

# 1. Authenticate Docker with Artifact Registry
echo "Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# 2. Build Docker Image
echo "Building Docker image..."
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:${TAG}"
# Use --platform linux/amd64 for Cloud Run compatibility
docker build --platform linux/amd64 -t $IMAGE_URI .

# 2b. Build Migration Image
echo "Building Migration Docker image..."
MIGRATE_IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}-migrate:latest"
docker build --platform linux/amd64 -t $MIGRATE_IMAGE_URI -f Dockerfile.migrate .

# 2c. Build Database Tools Image (backup, restore)
echo "Building Database Tools Docker image..."
DBTOOLS_IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}-dbtools:latest"
docker build --platform linux/amd64 -t $DBTOOLS_IMAGE_URI -f Dockerfile.dbtools .

# 3. Push to Artifact Registry
echo "Pushing images to Artifact Registry..."
docker push $IMAGE_URI
docker push $MIGRATE_IMAGE_URI
docker push $DBTOOLS_IMAGE_URI

# 4a. Apply Terraform Changes
 echo "Applying Terraform changes..."
 (cd terraform && terraform apply)

# 4b. Update Cloud Run Jobs
echo "Updating migration job with new image..."
gcloud run jobs update ${APP_NAME}-migrate \
  --image $MIGRATE_IMAGE_URI \
  --region $REGION

echo "Updating backup job with new image..."
gcloud run jobs update ${APP_NAME}-db-backup \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION

echo "Updating restore job with new image..."
gcloud run jobs update ${APP_NAME}-db-restore \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION

echo "Updating restore-test job with new image..."
gcloud run jobs update ${APP_NAME}-db-restore-test \
  --image $DBTOOLS_IMAGE_URI \
  --region $REGION

# 5. Run Database Migrations
echo "Running database migrations..."
echo "Monitor migration job here: https://console.cloud.google.com/run/jobs/details/${REGION}/${APP_NAME}-migrate/executions?project=${PROJECT_ID}"
gcloud run jobs execute ${APP_NAME}-migrate \
  --region $REGION \
  --wait

# 4c. Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy $APP_NAME \
  --image $IMAGE_URI \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated


echo "Deployment complete!"
