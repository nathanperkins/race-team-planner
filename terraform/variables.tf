variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "supabase_organization_id" {
  description = "Supabase Organization ID"
  type        = string
}

variable "supabase_access_token" {
  description = "Supabase Personal Access Token"
  type        = string
  sensitive   = true
}

variable "supabase_db_password" {
  description = "Password for the Supabase Database"
  type        = string
  sensitive   = true
}

variable "nextauth_secret" {
  description = "NextAuth Secret"
  type        = string
  sensitive   = true
}

variable "prisma_encryption_key" {
  description = "Prisma Field Encryption Key (32 bytes base64)"
  type        = string
  sensitive   = true
}

variable "discord_id" {
  description = "Discord Application ID"
  type        = string
  sensitive   = true
}

variable "discord_secret" {
  description = "Discord Application Secret"
  type        = string
  sensitive   = true
}

variable "discord_bot_token" {
  description = "Discord Bot Token for membership verification"
  type        = string
  sensitive   = true
}

variable "discord_guild_id" {
  description = "Discord Guild ID to check membership against"
  type        = string
  sensitive   = true
}

variable "discord_admin_role_ids" {
  description = "Comma-separated list of Discord Role IDs that have admin privileges"
  type        = string
  default     = ""
}

variable "iracing_username" {
  description = "iRacing Username for API synchronization"
  type        = string
  sensitive   = true
}

variable "iracing_password" {
  description = "iRacing Password for API synchronization"
  type        = string
  sensitive   = true
}

variable "iracing_client_id" {
  description = "iRacing Client ID (for Data API)"
  type        = string
  sensitive   = true
}

variable "iracing_client_secret" {
  description = "iRacing Client Secret (for Data API)"
  type        = string
  sensitive   = true
}

variable "cron_secret" {
  description = "A secret token to authorize the cron API route"
  type        = string
  sensitive   = true
}


##########
# Defaults

variable "region" {
  description = "The GCP region to deploy to"
  type        = string
  default     = "us-central1"
}

variable "app_name" {
  description = "The name of the application"
  type        = string
  default     = "iracing-team-planner"
}

variable "supabase_region" {
  description = "Supabase Region (e.g. us-west-1)"
  type        = string
  default     = "us-west-1"
}

variable "nextauth_url" {
  description = "NextAuth URL (optional, can be inferred from Cloud Run URL if configured dynamically, but explicit is better)"
  type        = string
  default     = ""
}
