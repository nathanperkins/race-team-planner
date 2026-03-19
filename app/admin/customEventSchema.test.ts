import { describe, it, expect } from 'vitest'
import { validateCustomEventForm } from './customEventSchema'

describe('validateCustomEventForm', () => {
  it('successfully validates a complete well-formed FormData', () => {
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
      expect(result.data.startTimes[0]).toBeInstanceOf(Date)
      expect(result.data.startTimes[0].getFullYear()).toBe(2027)
      expect(result.data.startTimes[0].getMonth()).toBe(5) // 0-indexed, so 5 is June
      expect(result.data.startTimes[0].getDate()).toBe(1)
      expect(result.data.durationMins).toBe(720)
    }
  })

  it('fails when required fields are missing completely', () => {
    const formData = new FormData()
    // missing track, carClasses, name, startTimes

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
    formData.append('name', '') // empty string
    formData.append('track', '') // empty string
    formData.append('carClasses', '') // empty string
    formData.append('startTimes', '') // empty string

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
    // Zod schema only checks length, but our helper explicitly checks `isNaN(getTime())`
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid date format')
    }
  })
})
