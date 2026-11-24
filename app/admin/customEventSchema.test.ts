import { describe, it, expect } from 'vitest'
import { validateCustomEventForm } from './customEventSchema'

describe('validateCustomEventForm', () => {
  it('successfully validates a complete well-formed FormData defaulting to UTC', () => {
    const formData = new FormData()
    formData.append('name', 'Sebring 12hr')
    formData.append('track', 'Sebring International Raceway')
    formData.append('carClasses', 'GTP, LMP2')
    formData.append('startTimes', '2027-06-01T10:00:00')
    formData.append('durationMins', '720')

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Sebring 12hr')
      expect(result.data.track).toBe('Sebring International Raceway')
      expect(result.data.carClasses).toBe('GTP, LMP2')
      expect(result.data.timeZone).toBe('UTC')
      expect(result.data.startTimes[0]).toBeInstanceOf(Date)
      expect(result.data.startTimes[0].toISOString()).toBe('2027-06-01T10:00:00.000Z')
      expect(result.data.durationMins).toBe(720)
    }
  })

  it('interprets startTimes in the specified IANA timeZone without drift', () => {
    const formData = new FormData()
    formData.append('name', 'Watkins Glen 6hr')
    formData.append('track', 'Watkins Glen International')
    formData.append('carClasses', 'GTP')
    formData.append('timeZone', 'America/Los_Angeles')
    formData.append('startTimes', '2027-06-26T05:00')

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.timeZone).toBe('America/Los_Angeles')
      // 05:00 PDT (UTC-7) === 12:00 UTC
      expect(result.data.startTimes[0].toISOString()).toBe('2027-06-26T12:00:00.000Z')
    }
  })

  it('keeps raceIds aligned with startTimes when blank timeslot rows are filtered', () => {
    const formData = new FormData()
    formData.append('eventId', 'evt-1')
    formData.append('name', 'Rolex 24')
    formData.append('track', 'Daytona')
    formData.append('carClasses', 'GTP')
    formData.append('timeZone', 'UTC')

    formData.append('startTimes', '')
    formData.append('raceIds', 'race-dropped')

    formData.append('startTimes', '2027-01-23T13:00')
    formData.append('raceIds', 'race-kept')

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startTimes).toHaveLength(1)
      expect(result.data.startTimes[0].toISOString()).toBe('2027-01-23T13:00:00.000Z')
      expect(result.data.raceIds).toEqual(['race-kept'])
    }
  })

  it('fails when an invalid timeZone is provided', () => {
    const formData = new FormData()
    formData.append('name', 'Rolex 24')
    formData.append('track', 'Daytona')
    formData.append('carClasses', 'GTP')
    formData.append('timeZone', 'Not/AZone')
    formData.append('startTimes', '2027-01-23T13:00')

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid time zone selected')
      expect(result.error).not.toContain('Invalid date format')
    }
  })

  it('fails when required fields are missing completely', () => {
    const formData = new FormData()

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Event Name is required')
      expect(result.error).toContain('Track is required')
      expect(result.error).toContain('Car Classes are required')
      expect(result.error).toContain('At least one timeslot is required')
    }
  })

  it('fails when required fields are empty strings', () => {
    const formData = new FormData()
    formData.append('name', '')
    formData.append('track', '')
    formData.append('carClasses', '')
    formData.append('startTimes', '')

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Event Name is required')
      expect(result.error).toContain('Track is required')
      expect(result.error).toContain('Car Classes are required')
      expect(result.error).toContain('At least one timeslot is required')
    }
  })

  it('fails when timeslot list contains an invalid date', () => {
    const formData = new FormData()
    formData.append('name', 'Rolex 24')
    formData.append('track', 'Daytona')
    formData.append('carClasses', 'GTP')
    formData.append('startTimes', 'not-a-valid-date')

    const result = validateCustomEventForm(formData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid date format')
    }
  })
})
