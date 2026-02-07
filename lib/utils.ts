export enum LicenseLevel {
  ROOKIE = 1,
  D = 2,
  C = 3,
  B = 4,
  A = 5,
  PRO = 6,
  PWC = 7,
}

const LICENSE_NAMES: Record<LicenseLevel, string> = {
  [LicenseLevel.ROOKIE]: 'Rookie',
  [LicenseLevel.D]: 'Class D',
  [LicenseLevel.C]: 'Class C',
  [LicenseLevel.B]: 'Class B',
  [LicenseLevel.A]: 'Class A',
  [LicenseLevel.PRO]: 'Pro',
  [LicenseLevel.PWC]: 'PWC',
}

export function getLicenseForId(id: string, licenseGroup?: number | null): string {
  if (licenseGroup && LICENSE_NAMES[licenseGroup as LicenseLevel]) {
    return LICENSE_NAMES[licenseGroup as LicenseLevel]
  }

  // Fallback to hashing for mock/legacy data
  const map = [
    LICENSE_NAMES[LicenseLevel.A],
    LICENSE_NAMES[LicenseLevel.B],
    LICENSE_NAMES[LicenseLevel.C],
    LICENSE_NAMES[LicenseLevel.D],
    LICENSE_NAMES[LicenseLevel.ROOKIE],
  ]
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return map[sum % map.length]
}

export function getLicenseColor(name: string): string {
  switch (name) {
    case LICENSE_NAMES[LicenseLevel.A]:
      return '#3b82f6'
    case LICENSE_NAMES[LicenseLevel.B]:
      return '#22c55e'
    case LICENSE_NAMES[LicenseLevel.C]:
      return '#facc15'
    case LICENSE_NAMES[LicenseLevel.D]:
      return '#fb923c'
    default:
      return '#ef4444'
  }
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function getRaceDurationMinutes(startTime: Date, endTime: Date): number {
  const diffMs = endTime.getTime() - startTime.getTime()
  return Math.round(diffMs / 60000)
}

export function getAutoMaxDriversPerTeam(durationMinutes: number): number | null {
  switch (durationMinutes) {
    case 120:
      return 2
    case 160:
      return 3
    case 180:
      return 3
    case 360:
      return 4
    case 720:
      return 5
    case 1440:
      return 7
    default:
      return null
  }
}

export function getSeriesNameOnly(eventName: string): string {
  // Extract series name by removing year, season, and week info
  // Patterns to remove: "- 2025", "- 2026", "- 2027", etc., "Season 1", "Week 1", etc.
  return eventName
    .replace(/\s*-\s*20\d{2}\b.*$/i, '') // Remove year and everything after it
    .trim()
}
