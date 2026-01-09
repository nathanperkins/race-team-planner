import { features } from '@/lib/config'

export function register() {
  console.log('🚧 iRacing Team Planner Startup 🚧')

  console.log(`[Feature] Discord Auth: ${features.discordAuth ? 'Enabled ✅' : 'Disabled ❌'}`)
  console.log(`[Feature] Mock Auth: ${features.mockAuth ? 'Enabled (Dev Mode) ✅' : 'Disabled ❌'}`)
  console.log(`[Feature] iRacing Sync: ${features.iracingSync ? 'Enabled ✅' : 'Disabled ❌'}`)

  if (!features.discordAuth && !features.mockAuth) {
    console.error('❌ CRITICAL: No authentication providers enabled. Application will not start.')
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      process.exit(1)
    }
  }
}
