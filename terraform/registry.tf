resource "google_artifact_registry_repository" "app_repo" {
  location      = var.region
  repository_id = var.app_name
  description   = "Docker repository for ${var.app_name}"
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-old-versions"
    action = "DELETE"
    condition {
      older_than = "604800s" # 7 days
    }
  }

  depends_on = [google_project_service.apis]
}
