import crypto from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface IRacingRace {
  externalId?: string
  startTime: string
  endTime: string
}

export interface IRacingEvent {
  externalId?: string
  name: string
  startTime: string // The earliest race start
  endTime: string // The latest race end
  track: string
  description: string
  races: IRacingRace[]
  carClassIds: number[]
  licenseGroup?: number
  tempValue?: number
  tempUnits?: number
  relHumidity?: number
  skies?: number
  durationMins?: number
}

export interface IRacingCarClass {
  carClassId: number
  name: string
  shortName: string
}

export interface IRacingLicense {
  categoryId: number
  category: string
  categoryName: string
  licenseLevel: number
  safetyRating: number
  cpi: number
  irating: number
  ttRating: number
  mprNumRaces: number
  color: string
  groupName: string
  groupId: number
  proPromotable: boolean
  seq: number
  mprNumTts: number
}

export interface IRacingMemberInfo {
  custId: number
  displayName: string
  licenses: Record<string, IRacingLicense>
}
const MOCK_MEMBER_INFO: IRacingMemberInfo = {
  custId: 123456,
  displayName: 'Local Dev User',
  licenses: {
    sports_car: {
      categoryId: 5,
      category: 'sports_car',
      categoryName: 'Sports Car',
      licenseLevel: 19,
      safetyRating: 3.55,
      cpi: 80.5,
      irating: 2500,
      ttRating: 1350,
      mprNumRaces: 0,
      color: '0153db',
      groupName: 'Class A',
      groupId: 5,
      proPromotable: false,
      seq: 2,
      mprNumTts: 0,
    },
    formula_car: {
      categoryId: 6,
      category: 'formula_car',
      categoryName: 'Formula Car',
      licenseLevel: 10,
      safetyRating: 2.15,
      cpi: 45.2,
      irating: 1800,
      ttRating: 1300,
      mprNumRaces: 2,
      color: '00c702',
      groupName: 'Class B',
      groupId: 4,
      proPromotable: false,
      seq: 3,
      mprNumTts: 0,
    },
  },
}

const MOCK_EVENTS: IRacingEvent[] = [
  {
    name: 'iRacing Bathurst 12 Hour (Mock)',
    startTime: '2026-02-07T12:00:00Z',
    endTime: '2026-02-08T00:00:00Z',
    track: 'Mount Panorama Circuit',
    description: 'Mock data. Set IRACING_CLIENT_ID/SECRET to sync real data.',
    races: [
      {
        startTime: '2026-02-07T12:00:00Z',
        endTime: '2026-02-08T00:00:00Z',
      },
      {
        startTime: '2026-02-07T18:00:00Z',
        endTime: '2026-02-08T06:00:00Z',
      },
    ],
    carClassIds: [],
    licenseGroup: 4,
    tempValue: 78,
    tempUnits: 0,
    relHumidity: 55,
    skies: 1,
    durationMins: 720,
  },
]

function maskCredential(plain: string, salt: string): string {
  const normalizedSalt = salt.trim().toLowerCase()
  const combined = plain + normalizedSalt
  const hash = crypto.createHash('sha256').update(combined).digest()
  return hash.toString('base64')
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.IRACING_CLIENT_ID
  const clientSecret = process.env.IRACING_CLIENT_SECRET
  const username = process.env.IRACING_USERNAME
  const password = process.env.IRACING_PASSWORD

  if (!clientId || !clientSecret || !username || !password) return null

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

    if (!response.ok) return null
    const data = await response.json()
    return data.access_token
  } catch {
    return null
  }
}

async function fetchFromIRacing(endpoint: string, token: string) {
  const response = await fetch(`https://members-ng.iracing.com${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`iRacing API Request Failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (data.link) {
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

/**
 * Main entry point for fetching events.
 * Dispatches to real API if credentials are present, otherwise returns mock data.
 */
export async function fetchSpecialEvents(): Promise<IRacingEvent[]> {
  // 1. If no credentials in Dev, use Mock
  const hasCreds =
    process.env.IRACING_CLIENT_ID &&
    process.env.IRACING_CLIENT_SECRET &&
    process.env.IRACING_USERNAME &&
    process.env.IRACING_PASSWORD

  if (!hasCreds) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ No iRacing credentials found. Using MOCK data.')
      return fetchMockEvents()
    }
    throw new Error('Missing iRacing credentials.')
  }

  // 2. If credentials exist, try to get token
  const token = await getAccessToken()

  // 3. If token fails but we had credentials, that's a REAL error
  if (!token) {
    throw new Error('Authentication failed. Please check your iRacing credentials.')
  }

  return fetchRealEvents(token)
}

/**
 * Fetches all car classes from iRacing.
 */
export async function fetchCarClasses(): Promise<IRacingCarClass[]> {
  const hasCreds =
    process.env.IRACING_CLIENT_ID &&
    process.env.IRACING_CLIENT_SECRET &&
    process.env.IRACING_USERNAME &&
    process.env.IRACING_PASSWORD

  if (!hasCreds) {
    if (process.env.NODE_ENV === 'development') {
      return []
    }
    throw new Error('Missing iRacing credentials.')
  }

  const token = await getAccessToken()
  if (!token) {
    throw new Error('Authentication failed. Please check your iRacing credentials.')
  }

  const data = await fetchFromIRacing('/data/carclass/get', token)
  if (!data || !Array.isArray(data)) return []

  return (data as { car_class_id: number; name: string; short_name: string }[]).map((item) => ({
    carClassId: item.car_class_id,
    name: item.name,
    shortName: item.short_name,
  }))
}

/**
 * Fetches stats for a specific customer ID using the authenticated session.
 * Uses /data/member/get to retrieve public info.
 */
export async function fetchDriverStats(custId: number): Promise<IRacingMemberInfo | null> {
  const token = await getAccessToken()
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      return MOCK_MEMBER_INFO
    }
    throw new Error('Failed to authenticate with iRacing API')
  }

  // Fetch member profile
  const response = await fetchFromIRacing(
    `/data/member/get?cust_ids=${custId}&include_licenses=true`,
    token
  )
  if (!response || !response.members || !response.members[0]) return null

  const member = response.members[0]

  // Also fetch recent stats to ensure accuracy if needed, but member/get usually has current licenses
  // The structure from member/get might differ slightly from member/info
  // We need to map it carefully.

  const licenses: Record<string, IRacingLicense> = {}

  if (member.licenses) {
    for (const lic of member.licenses) {
      // Map dictionary based on category
      const catKey =
        lic.category_id === 1
          ? 'oval'
          : lic.category_id === 2
            ? 'road' // Deprecated/Old?
            : lic.category_id === 3
              ? 'dirt_oval'
              : lic.category_id === 4
                ? 'dirt_road'
                : lic.category_id === 5
                  ? 'sports_car'
                  : lic.category_id === 6
                    ? 'formula_car'
                    : `cat_${lic.category_id}`

      licenses[catKey] = {
        categoryId: lic.category_id,
        category: lic.category_name, // member/get returns category_name usually
        categoryName: lic.category_name,
        licenseLevel: lic.license_level,
        safetyRating: lic.safety_rating,
        cpi: lic.cpi,
        irating: lic.irating,
        ttRating: lic.tt_rating,
        mprNumRaces: lic.mpr_num_races,
        color: lic.color,
        groupName: lic.group_name,
        groupId: lic.group_id,
        proPromotable: lic.pro_promotable,
        seq: lic.seq,
        mprNumTts: lic.mpr_num_tts,
      }
    }
  }

  return {
    custId: member.cust_id,
    displayName: member.display_name,
    licenses,
  }
}

async function fetchMockEvents(): Promise<IRacingEvent[]> {
  return [...MOCK_EVENTS]
}

async function fetchRealEvents(token: string): Promise<IRacingEvent[]> {
  const seasons = await fetchFromIRacing('/data/series/seasons', token)
  if (!seasons || !Array.isArray(seasons)) return []
  if (process.env.IRACING_DEBUG_SEASONS === 'true') {
    const dump = JSON.stringify(seasons, null, 2)
    const outPath = path.join(process.cwd(), 'iracing-seasons.json')
    await writeFile(outPath, dump, 'utf-8')
    console.log('iRacing seasons raw written to:', outPath)
  }

  const specialKeywords = [
    'special event',
    'roar',
    '24h',
    '12h',
    '10h',
    '6h',
    '1000',
    'endurance',
    'major',
    'petit le mans',
    'sebring 12',
    'bathurst 12',
    'daytona 24',
    'spa 24',
    'nürburgring 24',
  ]

  const now = new Date()
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(now.getDate() + 30)

  const events: IRacingEvent[] = []

  for (const season of seasons) {
    const name = season.season_name || ''
    const lowerName = name.toLowerCase()

    const isTeam = season.driver_changes || (season.max_team_drivers ?? 1) > 1

    if (!isMatch(lowerName, isTeam, specialKeywords)) continue
    if (!season.schedules) continue

    for (const week of season.schedules) {
      const weekEnd = new Date(week.week_end_time || week.start_date)
      const weekStart = new Date(week.start_date)

      if (weekEnd > now && weekStart <= thirtyDaysFromNow) {
        const races: IRacingRace[] = []

        if (week.race_time_descriptors) {
          for (const descriptor of week.race_time_descriptors) {
            if (descriptor.session_times) {
              for (let i = 0; i < descriptor.session_times.length; i++) {
                const sessionTime = descriptor.session_times[i]
                const start = new Date(sessionTime)
                const durationMinutes = week.race_time_limit || descriptor.session_minutes || 60
                const end = new Date(start.getTime() + durationMinutes * 60000)
                const externalId = `ir_${season.series_id}_${season.season_id}_w${week.race_week_num}_s${i}`
                races.push({
                  externalId,
                  startTime: start.toISOString(),
                  endTime: end.toISOString(),
                })
              }
            }
          }
        }

        if (races.length === 0) {
          const start = new Date(week.start_date)
          const durationMinutes =
            week.race_time_limit ||
            (week.race_time_descriptors && week.race_time_descriptors[0]?.session_minutes) ||
            60
          const end = new Date(start.getTime() + durationMinutes * 60000)
          races.push({
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          })
        }

        // Sort races by start time
        races.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

        // Estimated duration
        const estimatedDuration =
          week.race_time_limit ||
          (week.race_time_descriptors && week.race_time_descriptors[0]?.session_minutes) ||
          60

        const eventStart = races[0].startTime
        const eventEnd = races[races.length - 1].endTime

        events.push({
          externalId: `ir_${season.series_id}_${season.season_id}_w${week.race_week_num}`,
          name: week.race_week_num === 0 ? name : `${name} - Week ${week.race_week_num + 1}`,
          startTime: eventStart,
          endTime: eventEnd,
          track: week.track?.track_name || 'TBA',
          description: season.schedule_description || name,
          races,
          carClassIds: season.car_class_ids || [],
          licenseGroup: season.license_group,
          tempValue: week.weather?.temp_value,
          tempUnits: week.weather?.temp_units,
          relHumidity: week.weather?.rel_humidity,
          skies: week.weather?.skies,
          durationMins: estimatedDuration,
        })
      }
    }
  }

  return events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
}

function isMatch(name: string, isTeam: boolean, keywords: string[]): boolean {
  if (name.includes('special event') || name.includes('roar before the 24')) return true
  if (!isTeam) return false
  return keywords.some((kw) => name.includes(kw))
}
