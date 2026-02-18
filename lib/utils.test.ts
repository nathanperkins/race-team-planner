import { describe, it, expect } from 'vitest'
import { getLicenseForGroup, LicenseLevel } from './utils'

describe('getLicenseForGroup', () => {
  it('returns "Rookie" when licenseGroup is 1', () => {
    expect(getLicenseForGroup(LicenseLevel.ROOKIE)).toBe('Rookie')
  })

  it('returns "Class D" when licenseGroup is 2', () => {
    expect(getLicenseForGroup(LicenseLevel.D)).toBe('Class D')
  })

  it('returns "Class C" when licenseGroup is 3', () => {
    expect(getLicenseForGroup(LicenseLevel.C)).toBe('Class C')
  })

  it('returns "Class B" when licenseGroup is 4', () => {
    expect(getLicenseForGroup(LicenseLevel.B)).toBe('Class B')
  })

  it('returns "Class A" when licenseGroup is 5', () => {
    expect(getLicenseForGroup(LicenseLevel.A)).toBe('Class A')
  })

  it('returns "Pro" when licenseGroup is 6', () => {
    expect(getLicenseForGroup(LicenseLevel.PRO)).toBe('Pro')
  })

  it('returns "PWC" when licenseGroup is 7', () => {
    expect(getLicenseForGroup(LicenseLevel.PWC)).toBe('PWC')
  })

  it('returns "N/A" when licenseGroup is null', () => {
    expect(getLicenseForGroup(null)).toBe('N/A')
  })

  it('returns "N/A" when licenseGroup is undefined', () => {
    expect(getLicenseForGroup(undefined)).toBe('N/A')
  })

  it('returns "N/A" when licenseGroup is 0', () => {
    expect(getLicenseForGroup(0)).toBe('N/A')
  })

  it('returns "N/A" when licenseGroup is an invalid number', () => {
    expect(getLicenseForGroup(99)).toBe('N/A')
    expect(getLicenseForGroup(-1)).toBe('N/A')
  })
})
