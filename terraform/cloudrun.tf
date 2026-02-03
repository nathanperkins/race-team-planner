# Cloud Run Service
resource "google_cloud_run_v2_service" "default" {
  name     = var.app_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello" # Placeholder to bootstrap service. Real image updated by CI/CD.

      env {
        name  = "NEXTAUTH_URL"
        value = var.nextauth_url != "" ? var.nextauth_url : (var.domain_name != "" ? "https://${var.domain_name}" : "https://${var.app_name}-${data.google_project.project.number}.${var.region}.run.app")
      }
      env {
        name  = "AUTH_URL"
        value = var.nextauth_url != "" ? var.nextauth_url : (var.domain_name != "" ? "https://${var.domain_name}" : "https://${var.app_name}-${data.google_project.project.number}.${var.region}.run.app")
      }
      env {
        name  = "AUTH_TRUST_HOST"
        value = "true"
      }

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

  depends_on = [
    google_artifact_registry_repository.app_repo,
    google_secret_manager_secret_iam_member.runner_access_env
  ]

  lifecycle {
    ignore_changes = [
        template[0].containers[0].image, # Ignore image changes as Cloud Build updates it
        client,
        client_version
    ]
  }
}

# Allow unauthenticated access
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_v2_service.default.name
  location = google_cloud_run_v2_service.default.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Custom Domain Mapping (Native)
resource "google_cloud_run_domain_mapping" "custom_domain" {
  count    = var.domain_name != "" ? 1 : 0
  location = var.region
  name     = var.domain_name

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.default.name
  }

  lifecycle {
    ignore_changes = [
      metadata,
    ]
  }
}
