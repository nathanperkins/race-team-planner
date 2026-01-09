resource "supabase_project" "main" {
  organization_id   = var.supabase_organization_id
  name              = "${var.app_name}"
  database_password = var.supabase_db_password
  region            = var.supabase_region

  lifecycle {
    ignore_changes = [database_password]
  }
}
