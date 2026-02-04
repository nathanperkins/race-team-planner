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
DATABASE_URL="postgresql://postgres.${supabase_project.main.id}:${urlencode(var.supabase_db_password)}@aws-0-${var.supabase_region}.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:${urlencode(var.supabase_db_password)}@db.${supabase_project.main.id}.supabase.co:5432/postgres"
AUTH_SECRET="${var.nextauth_secret}"
NEXTAUTH_SECRET="${var.nextauth_secret}"
PRISMA_FIELD_ENCRYPTION_KEY="${var.prisma_encryption_key}"
AUTH_DISCORD_ID="${var.discord_id}"
AUTH_DISCORD_SECRET="${var.discord_secret}"
IRACING_USERNAME="${var.iracing_username}"
IRACING_PASSWORD="${var.iracing_password}"
IRACING_CLIENT_ID="${var.iracing_client_id}"
IRACING_CLIENT_SECRET="${var.iracing_client_secret}"
DISCORD_BOT_TOKEN="${var.discord_bot_token}"
DISCORD_GUILD_ID="${var.discord_guild_id}"
DISCORD_ADMIN_ROLE_IDS="${var.discord_admin_role_ids}"
DISCORD_NOTIFICATIONS_CHANNEL_ID="${var.discord_notifications_channel_id}"
CRON_SECRET="${var.cron_secret}"
BACKUP_ENCRYPTION_KEY="${var.backup_encryption_key}"
APP_TITLE="${var.app_title}"
EOT
}

resource "google_secret_manager_secret_iam_member" "runner_access_env" {
  secret_id = google_secret_manager_secret.app_env.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}
