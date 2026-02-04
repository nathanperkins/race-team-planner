resource "supabase_project" "main" {
  organization_id   = var.supabase_organization_id
  name              = "${var.app_name}-${var.environment}"
  database_password = var.supabase_db_password
  region            = var.supabase_region

  lifecycle {
    ignore_changes = [database_password]
  }
}

data "supabase_pooler" "main" {
  project_ref = supabase_project.main.id
}
