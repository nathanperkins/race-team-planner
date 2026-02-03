# GCS Bucket for database backups
resource "google_storage_bucket" "db_backups" {
  name          = "${var.project_id}-db-backups"
  location      = var.region
  force_destroy = false

  # Enable versioning for extra safety
  versioning {
    enabled = true
  }

  # Lifecycle rules for backup retention
  # Files are organized by prefix: hourly/, daily/, weekly/, monthly/, yearly/

  # Hourly backups: keep 24 hours (1 day)
  lifecycle_rule {
    condition {
      age            = 1  # 1 day
      matches_prefix = ["hourly/"]
      with_state     = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  # Daily backups: keep 7 days
  lifecycle_rule {
    condition {
      age                   = 7
      matches_prefix        = ["daily/"]
      with_state            = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  # Weekly backups: keep 4 weeks (28 days)
  lifecycle_rule {
    condition {
      age                   = 28
      matches_prefix        = ["weekly/"]
      with_state            = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  # Monthly backups: keep 12 months (365 days)
  lifecycle_rule {
    condition {
      age                   = 365
      matches_prefix        = ["monthly/"]
      with_state            = "ANY"
    }
    action {
      type = "Delete"
    }
  }

  # Yearly backups: no lifecycle rule (kept indefinitely)

  uniform_bucket_level_access = true

  depends_on = [google_project_service.apis]
}

# Grant the Cloud Run service account access to write to the bucket
resource "google_storage_bucket_iam_member" "backup_writer" {
  bucket = google_storage_bucket.db_backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Cloud Run Job for database backup
resource "google_cloud_run_v2_job" "db_backup" {
  name     = "${var.app_name}-db-backup"
  location = var.region

  template {
    task_count = 1

    template {
      max_retries     = 1
      timeout         = "300s"
      service_account = google_service_account.cloud_run_sa.email

      containers {
        image   = "${var.region}-docker.pkg.dev/${var.project_id}/${var.app_name}/${var.app_name}-dbtools:latest"
        command = ["/scripts/backup.sh"]

        env {
          name  = "BACKUP_BUCKET"
          value = google_storage_bucket.db_backups.name
        }

        # Mount secrets for DATABASE_URL
        volume_mounts {
          name       = "secrets"
          mount_path = "/secrets"
        }
      }

      volumes {
        name = "secrets"
        secret {
          secret = google_secret_manager_secret.app_env.secret_id
          items {
            version = "latest"
            path    = ".env"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_storage_bucket.db_backups
  ]
}

# Cloud Scheduler to trigger hourly backups
resource "google_cloud_scheduler_job" "db_backup_job" {
  name             = "${var.app_name}-db-backup-hourly"
  description      = "Triggers database backup every hour"
  schedule         = "0 * * * *"
  time_zone        = "UTC"
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.db_backup.name}:run"

    oauth_token {
      service_account_email = google_service_account.cloud_run_sa.email
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_job.db_backup
  ]
}

# Cloud Run Job for database restore (manual trigger only)
# Usage: gcloud run jobs execute iracing-team-planner-db-restore \
#          --update-env-vars BACKUP_PATH=gs://bucket/daily/backup-xxx.sql.gz.gpg
resource "google_cloud_run_v2_job" "db_restore" {
  name     = "${var.app_name}-db-restore"
  location = var.region

  template {
    task_count = 1

    template {
      max_retries     = 0  # No retries for restore - must be intentional
      timeout         = "600s"  # 10 minutes for large restores
      service_account = google_service_account.cloud_run_sa.email

      containers {
        image   = "${var.region}-docker.pkg.dev/${var.project_id}/${var.app_name}/${var.app_name}-dbtools:latest"
        command = ["/scripts/restore.sh"]

        # BACKUP_PATH must be provided when executing the job
        env {
          name  = "BACKUP_PATH"
          value = ""  # Override this when executing
        }

        # Mount secrets for DATABASE_URL and BACKUP_ENCRYPTION_KEY
        volume_mounts {
          name       = "secrets"
          mount_path = "/secrets"
        }
      }

      volumes {
        name = "secrets"
        secret {
          secret = google_secret_manager_secret.app_env.secret_id
          items {
            version = "latest"
            path    = ".env"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      template[0].template[0].containers[0].env,  # Ignore env changes from job executions
      client,
      client_version
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_storage_bucket.db_backups
  ]
}
