export function getLicenseForId(id: string): string {
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
