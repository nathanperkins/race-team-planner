terraform {
  required_version = ">= 1.14"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 7.15"
    }
    supabase = {
      source  = "supabase/supabase"
      version = ">= 1.6"
    }
  }

  backend "gcs" {
    # Bucket and prefix will be provided via CLI or backend config file during init
    # bucket = "YOUR_STATE_BUCKET"
    # prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "supabase" {
  access_token = var.supabase_access_token
}

# Enable necessary APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com", # Often required for various networking features
    "iam.googleapis.com",
    "secretmanager.googleapis.com"
  ])

  project = var.project_id
  service = each.key

  disable_on_destroy = false
}

data "google_project" "project" {}
