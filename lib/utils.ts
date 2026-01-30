export function getLicenseForId(id: string, licenseGroup?: number | null): string {
  // Mapping based on iRacing license_group values
  // 1: Rookie, 2: D, 3: C, 4: B, 5: A
  const licenseMap: Record<number, string> = {
    1: 'R',
    2: 'D',
    3: 'C',
    4: 'B',
    5: 'A',
    6: 'Pro',
    7: 'PWC',
  }

  if (licenseGroup && licenseMap[licenseGroup]) {
    return licenseMap[licenseGroup]
  }

  // Fallback to hashing for mock/legacy data
  const map = ['A', 'B', 'C', 'D', 'R']
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return map[sum % map.length]
}

export function getLicenseColor(letter: string): string {
  switch (String(letter).toUpperCase()) {
    case 'A':
      return '#3b82f6'
    case 'B':
      return '#22c55e'
    case 'C':
      return '#facc15'
    case 'D':
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
