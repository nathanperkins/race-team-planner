import { describe, it, expect } from 'vitest'
import { serializeCustomEventFormState } from './useUnsavedCustomEventGuard'

function buildForm(fields: Record<string, string>): HTMLFormElement {
  const form = document.createElement('form')
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  return form
}

describe('serializeCustomEventFormState', () => {
  it('produces identical snapshots for equivalent instants across timezones', () => {
    const form = buildForm({ name: 'Sebring 12hr', track: 'Sebring', timeZone: 'UTC' })
    const utcSnapshot = serializeCustomEventFormState(
      form,
      [{ id: 'r1', startTime: '2027-06-01T10:00' }],
      'UTC'
    )
    const pdtSnapshot = serializeCustomEventFormState(
      form,
      [{ id: 'r1', startTime: '2027-06-01T03:00' }],
      'America/Los_Angeles'
    )

    expect(utcSnapshot).toBe(pdtSnapshot)
  })

  it('falls back safely without throwing on malformed or invalid datetime strings', () => {
    const form = buildForm({ name: 'Draft' })
    const snapA = serializeCustomEventFormState(
      form,
      [{ id: '', startTime: 'not-a-valid-date' }],
      'UTC'
    )
    const snapB = serializeCustomEventFormState(
      form,
      [{ id: '', startTime: 'not-a-valid-date-2' }],
      'Invalid/TimeZone'
    )

    expect(snapA).not.toBe(snapB)
    expect(snapA).toContain('not-a-valid-date')
    expect(snapB).toContain('not-a-valid-date-2')
  })

  it('tracks arbitrary DOM form fields while excluding timeZone, startTimes, raceIds, and eventId', () => {
    const formA = buildForm({
      eventId: 'ev-1',
      timeZone: 'UTC',
      startTimes: '2027-06-01T10:00',
      raceIds: 'r1',
      name: 'Event A',
      description: 'Notes',
      skies: '1',
    })
    const formB = buildForm({
      eventId: 'ev-2',
      timeZone: 'America/New_York',
      startTimes: '2027-06-01T06:00',
      raceIds: 'r2',
      name: 'Event A',
      description: 'Notes',
      skies: '1',
    })
    const formC = buildForm({
      eventId: 'ev-1',
      timeZone: 'UTC',
      name: 'Event A',
      description: 'Notes',
      skies: '2',
    })

    const slots = [{ id: 'r1', startTime: '2027-06-01T10:00' }]
    expect(serializeCustomEventFormState(formA, slots, 'UTC')).toBe(
      serializeCustomEventFormState(formB, slots, 'UTC')
    )
    expect(serializeCustomEventFormState(formA, slots, 'UTC')).not.toBe(
      serializeCustomEventFormState(formC, slots, 'UTC')
    )
  })
})
