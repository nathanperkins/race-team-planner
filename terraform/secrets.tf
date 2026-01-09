resource "google_secret_manager_secret" "app_env" {
  secret_id = "${var.app_name}-env"
  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "app_env" {
  secret      = google_secret_manager_secret.app_env.id
  secret_data = <<EOT
DATABASE_URL="postgresql://postgres.${supabase_project.main.id}:${urlencode(var.supabase_db_password)}@aws-1-${var.supabase_region}.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:${urlencode(var.supabase_db_password)}@db.${supabase_project.main.id}.supabase.co:5432/postgres"
NEXTAUTH_SECRET="${var.nextauth_secret}"
PRISMA_FIELD_ENCRYPTION_KEY="${var.prisma_encryption_key}"
AUTH_DISCORD_ID="${var.discord_id}"
AUTH_DISCORD_SECRET="${var.discord_secret}"
IRACING_USERNAME="${var.iracing_username}"
IRACING_PASSWORD="${var.iracing_password}"
IRACING_CLIENT_ID="${var.iracing_client_id}"
IRACING_CLIENT_SECRET="${var.iracing_client_secret}"
EOT
}

resource "google_secret_manager_secret_iam_member" "runner_access_env" {
  secret_id = google_secret_manager_secret.app_env.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}
