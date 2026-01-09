resource "google_service_account" "cloud_run_sa" {
  account_id   = "${var.app_name}-runner"
  display_name = "Cloud Run Service Account for ${var.app_name}"
}
