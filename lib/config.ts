export const CURRENT_EXPECTATIONS_VERSION = 1
export const SESSION_VERSION = 1

export const features = {
  discordAuth: !!process.env.AUTH_DISCORD_ID,
  mockAuth: process.env.NODE_ENV === 'development',
  iracingSync: !!process.env.IRACING_CLIENT_ID,
  discordMembership: !!process.env.DISCORD_GUILD_ID && !!process.env.DISCORD_BOT_TOKEN,
  feedback: !!process.env.NEXT_PUBLIC_FEEDBACK_URL,
} as const

export const appTitle = process.env.APP_TITLE || 'iRacing Team Planner (dev)'
