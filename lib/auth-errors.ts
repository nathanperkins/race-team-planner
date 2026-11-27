export enum GuildMembershipStatus {
  MEMBER = 'member',
  NOT_MEMBER = 'access_denied_guild_membership',
  CONFIG_ERROR = 'config_error',
  API_ERROR = 'api_error',
}

export const AUTH_ERROR_EMAIL_REQUIRED = 'email_required' as const
