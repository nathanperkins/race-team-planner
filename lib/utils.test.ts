import { describe, it, expect } from 'vitest'
import { getLicenseForId, LicenseLevel } from './utils'

describe('getLicenseForId', () => {
  const mockEventId = 'event-123'

  it('returns "Rookie" when licenseGroup is 1', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.ROOKIE)).toBe('Rookie')
  })

  it('returns "Class D" when licenseGroup is 2', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.D)).toBe('Class D')
  })

  it('returns "Class C" when licenseGroup is 3', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.C)).toBe('Class C')
  })

  it('returns "Class B" when licenseGroup is 4', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.B)).toBe('Class B')
  })

  it('returns "Class A" when licenseGroup is 5', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.A)).toBe('Class A')
  })

  it('returns "Pro" when licenseGroup is 6', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.PRO)).toBe('Pro')
  })

  it('returns "PWC" when licenseGroup is 7', () => {
    expect(getLicenseForId(mockEventId, LicenseLevel.PWC)).toBe('PWC')
  })

  it('returns "N/A" when licenseGroup is null', () => {
    expect(getLicenseForId(mockEventId, null)).toBe('N/A')
  })

  it('returns "N/A" when licenseGroup is undefined', () => {
    expect(getLicenseForId(mockEventId, undefined)).toBe('N/A')
  })

  it('returns "N/A" when licenseGroup is 0', () => {
    expect(getLicenseForId(mockEventId, 0)).toBe('N/A')
  })

  it('returns "N/A" when licenseGroup is an invalid number', () => {
    expect(getLicenseForId(mockEventId, 99)).toBe('N/A')
    expect(getLicenseForId(mockEventId, -1)).toBe('N/A')
  })
})
