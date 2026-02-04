resource "google_cloud_run_v2_job" "migrate" {
  name     = "${var.app_name}-migrate"
  location = var.region
  deletion_protection = false

  template {
    task_count  = 1

    template {
      max_retries = 0
      service_account = google_service_account.cloud_run_sa.email

      containers {
        image = "us-docker.pkg.dev/cloudrun/container/hello"

        # We need the secrets for DATABASE_URL
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

  depends_on = [google_project_service.apis]
}
