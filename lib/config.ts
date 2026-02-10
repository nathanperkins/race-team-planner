export const CURRENT_EXPECTATIONS_VERSION = 1
export const SESSION_VERSION = 1

export const features = {
  discordAuth: !!process.env.AUTH_DISCORD_ID,
  mockAuth: process.env.NODE_ENV === 'development',
  iracingSync: !!process.env.IRACING_CLIENT_ID,
  discordMembership: !!process.env.DISCORD_GUILD_ID && !!process.env.DISCORD_BOT_TOKEN,
  feedback: !!process.env.FEEDBACK_URL,
} as const

export const appTitle = process.env.APP_TITLE || 'iRacing Team Planner (dev)'
export const appLocale = process.env.APP_LOCALE || 'en-US'
export const appTimeZone = process.env.APP_TIMEZONE || 'America/Los_Angeles'
export const feedbackUrl = process.env.FEEDBACK_URL
