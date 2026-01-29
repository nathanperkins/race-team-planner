import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * iRacing Masking Logic
 */
function maskCredential(plain: string, salt: string): string {
  const normalizedSalt = salt.trim().toLowerCase()
  const combined = plain + normalizedSalt
  const hash = crypto.createHash('sha256').update(combined).digest()
  return hash.toString('base64')
}

/**
 * Self-contained OAuth flow
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.IRACING_CLIENT_ID
  const clientSecret = process.env.IRACING_CLIENT_SECRET
  const username = process.env.IRACING_USERNAME
  const password = process.env.IRACING_PASSWORD

  if (!clientId || !clientSecret || !username || !password) {
    console.error('Missing iRacing credentials in .env')
    return null
  }

  try {
    const maskedSecret = maskCredential(clientSecret, clientId)
    const maskedPassword = maskCredential(password, username)

    const params = new URLSearchParams()
    params.append('grant_type', 'password_limited')
    params.append('username', username)
    params.append('password', maskedPassword)
    params.append('client_id', clientId)
    params.append('client_secret', maskedSecret)
    params.append('scope', 'iracing.auth')

    const response = await fetch('https://oauth.iracing.com/oauth2/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (!response.ok) {
        console.error(`Auth failed: ${response.status} ${response.statusText}`)
        return null
    }
    const data = await response.json()
    return data.access_token
  } catch (error) {
    console.error('Auth error:', error)
    return null
  }
}

/**
 * Self-contained Fetch with Link following
 */
async function fetchFromIRacing(endpoint: string, token: string) {
  const response = await fetch(`https://members-ng.iracing.com${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`iRacing API Request Failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  // iRacing often returns a wrapper with a 'link' property where the JSON actually resides
  if (data.link) {
    console.log(`  ...following link: ${data.link.split('?')[0]}`)
    const dataResponse = await fetch(data.link)
    if (!dataResponse.ok) {
      throw new Error(
        `iRacing Link Request Failed: ${dataResponse.status} ${dataResponse.statusText}`
      )
    }
    return dataResponse.json()
  }
  return data
}

const ENDPOINTS = [
  { name: 'seasons', path: '/data/series/seasons' },
  { name: 'car_classes', path: '/data/carclass/get' },
  { name: 'cars', path: '/data/car/get' },
  { name: 'tracks', path: '/data/track/get' },
  { name: 'series', path: '/data/series/get' },
  { name: 'member_info', path: '/data/member/info' },
  { name: 'licenses', path: '/data/lookup/licenses' },
]

async function main() {
  if (existsSync('.env')) {
    process.loadEnvFile()
  }

  console.log('Authenticating with iRacing...')
  const token = await getAccessToken()

  if (!token) {
    process.exit(1)
  }

  const outputDir = path.join(process.cwd(), 'raw_data')
  await mkdir(outputDir, { recursive: true })

  for (const endpoint of ENDPOINTS) {
    console.log(`Fetching ${endpoint.name} [${endpoint.path}]...`)
    try {
      const data = await fetchFromIRacing(endpoint.path, token)
      const fileName = `${endpoint.name}.json`
      const filePath = path.join(outputDir, fileName)
      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`✅ Saved to raw_data/${fileName}`)
    } catch (error) {
      console.error(`❌ Failed to fetch ${endpoint.name}:`, error instanceof Error ? error.message : error)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
