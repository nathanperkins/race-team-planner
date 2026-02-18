resource "google_service_account" "cloud_run_sa" {
  account_id   = "${var.app_name}-runner"
  display_name = "Cloud Run Service Account for ${var.app_name}"

  depends_on = [google_project_service.apis]
}

# Allow the Cloud Run SA to write traces to Cloud Trace
resource "google_project_iam_member" "cloud_run_sa_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Allow the Cloud Run SA to write metrics to Cloud Monitoring
resource "google_project_iam_member" "cloud_run_sa_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}
