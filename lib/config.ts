export const CURRENT_EXPECTATIONS_VERSION = 1;

export const features = {
  discordAuth: !!process.env.AUTH_DISCORD_ID,
  mockAuth: process.env.NODE_ENV === "development",
  iracingSync: !!process.env.IRACING_CLIENT_ID,
} as const;
