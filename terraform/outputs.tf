output "cloud_run_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.default.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry Repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.app_name}"
}

output "supabase_project_ref" {
  value = supabase_project.main.id
}

output "sync_scheduler_job" {
  value = google_cloud_scheduler_job.sync_job.name
}

output "domain_mapping_records" {
  description = "DNS records to create for the custom domain"
  value       = length(google_cloud_run_domain_mapping.custom_domain) > 0 ? google_cloud_run_domain_mapping.custom_domain[0].status[0].resource_records : null
}
