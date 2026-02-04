#!/bin/bash
set -e

# Configuration
APP_NAME="iracing-team-planner"

echo "🚀 GCP Setup Script for $APP_NAME"
echo "-----------------------------------"

ENV=$1
if [[ -z "$ENV" ]]; then
    read -p "Enter environment name (e.g. prod, staging): " ENV
fi

if [[ -z "$ENV" ]]; then
    echo "Error: Environment name is required."
    exit 1
fi



# Check if logged in
if ! gcloud auth list --format="value(account)" | grep -q "@"; then
    echo "Please login first:"
    gcloud auth login
fi

echo "Environment: $ENV"
echo "Select an option:"
echo "1. Create NEW Project"
echo "2. Use EXISTING Project"
read -p "Enter choice [1/2]: " CHOICE

if [ "$CHOICE" == "1" ]; then
    read -p "Enter New Project ID for $ENV (unique): " PROJECT_ID
    echo "Creating project $PROJECT_ID..."
    gcloud projects create $PROJECT_ID
    echo "Setting project..."
    gcloud config set project $PROJECT_ID

    # Link billing (User needs to do this manually usually on free trial, but we can prompt)
    echo "⚠️  IMPORTANT: You must enable billing for this project manually in the console: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    read -p "Press Enter after you have enabled billing..."
else
    read -p "Enter Existing Project ID for $ENV: " PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

# Enable Service Usage API first (needed to enable others)
echo "Enabling Service Usage API..."
gcloud services enable serviceusage.googleapis.com

# Region selection
read -p "Enter GCP Region (e.g., us-west1): " REGION

if [[ -z "$REGION" ]]; then
    echo "Error: Region is required."
    exit 1
fi


# Create State Bucket
BUCKET_NAME="${PROJECT_ID}-tf-state"
if ! gsutil ls -b gs://$BUCKET_NAME > /dev/null 2>&1; then
    echo "Creating Terraform state bucket: $BUCKET_NAME..."
    gcloud storage buckets create gs://$BUCKET_NAME --location=$REGION
    gcloud storage buckets update gs://$BUCKET_NAME --versioning
else
    echo "Bucket $BUCKET_NAME already exists."
fi

echo ""
echo "✅ Setup Complete for $ENV!"
echo "-----------------------------------"
echo "Next Steps:"
echo "1. cd terraform"
echo "2. cp terraform.tfvars.example ${ENV}.tfvars"
echo "3. Update ${ENV}.tfvars with project_id=\"$PROJECT_ID\", region=\"$REGION\", and other secrets."
echo "4. Deploy: ./scripts/deploy.sh $ENV"
