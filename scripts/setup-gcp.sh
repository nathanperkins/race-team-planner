#!/bin/bash
set -e

# Configuration
REGION="us-central1"
APP_NAME="iracing-team-planner"

echo "🚀 GCP Setup Script for $APP_NAME"
echo "-----------------------------------"

# Check if logged in
if ! gcloud auth list --format="value(account)" | grep -q "@"; then
    echo "Please login first:"
    gcloud auth login
fi

echo "Select an option:"
echo "1. Create NEW Project"
echo "2. Use EXISTING Project"
read -p "Enter choice [1/2]: " CHOICE

if [ "$CHOICE" == "1" ]; then
    read -p "Enter New Project ID (unique): " PROJECT_ID
    echo "Creating project $PROJECT_ID..."
    gcloud projects create $PROJECT_ID
    echo "Setting project..."
    gcloud config set project $PROJECT_ID

    # Link billing (User needs to do this manually usually on free trial, but we can prompt)
    echo "⚠️  IMPORTANT: You must enable billing for this project manually in the console: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    read -p "Press Enter after you have enabled billing..."
else
    read -p "Enter Existing Project ID: " PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

# Enable Service Usage API first (needed to enable others)
echo "Enabling Service Usage API..."
gcloud services enable serviceusage.googleapis.com

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
echo "✅ Setup Complete!"
echo "-----------------------------------"
echo "Next Steps:"
echo "1. cd terraform"
echo "2. cp terraform.tfvars.example terraform.tfvars"
echo "3. Update terraform.tfvars with your Supabase tokens and other info."
echo "4. Initialize: terraform init -backend-config=\"bucket=$BUCKET_NAME\" -backend-config=\"prefix=terraform/state\""
echo "5. Apply: terraform apply"
