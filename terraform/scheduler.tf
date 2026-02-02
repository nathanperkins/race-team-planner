resource "google_cloud_scheduler_job" "sync_job" {
  name             = "${var.app_name}-sync-job"
  description      = "Triggers iRacing synchronization every 4 hours"
  schedule         = "0 */4 * * *"
  time_zone        = "UTC"
  attempt_deadline = "320s"

  http_target {
    http_method = "GET"
    uri         = "${google_cloud_run_v2_service.default.uri}/api/cron/sync"

    headers = {
      "Authorization" = "Bearer ${var.cron_secret}"
      "Content-Type"  = "application/json"
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_service.default
  ]
}
