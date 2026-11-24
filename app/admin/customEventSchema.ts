import { z } from 'zod'
import { DEFAULT_TIMEZONE, isValidTimeZone, parseDateTimeInTimeZone } from '@/lib/timezone-utils'

export const customEventSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Event Name is required'),
  track: z.string().min(1, 'Track is required'),
  trackConfig: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  carClasses: z.string().min(1, 'Car Classes are required'),
  timeZone: z
    .string()
    .default(DEFAULT_TIMEZONE)
    .refine((tz) => isValidTimeZone(tz), {
      message: 'Invalid time zone selected.',
    }),
  startTimes: z
    .array(
      z.date({
        message: 'Invalid date format in one of the start times.',
      })
    )
    .min(1, 'At least one timeslot is required'),
  raceIds: z.array(z.string()).optional(),
  durationMins: z.number().positive().nullable().optional(),
  licenseGroup: z.number().positive().nullable().optional(),
  tempValue: z.number().nullable().optional(),
  tempUnits: z.number().nullable().optional(),
  relHumidity: z.number().min(0).max(100).nullable().optional(),
  skies: z.number().nullable().optional(),
  precipChance: z.number().min(0).max(100).nullable().optional(),
})

export type ParsedCustomEventData = z.infer<typeof customEventSchema>

// The UI components expect the carClasses to be passed from the DB as an array.
export interface CustomEventData {
  id?: string
  name?: string
  track?: string
  trackConfig?: string | null
  description?: string | null
  durationMins?: number | null
  licenseGroup?: number | null
  tempValue?: number | null
  tempUnits?: number | null
  relHumidity?: number | null
  skies?: number | null
  precipChance?: number | null
  carClasses?: Array<{ shortName: string }>
  races?: Array<{
    id: string
    startTime: Date | string
    endTime?: Date | string
  }>
  startTime?: Date | string
  endTime?: Date | string
}

export function validateCustomEventForm(formData: FormData) {
  const rawTimeZone = formData.get('timeZone')?.toString() || DEFAULT_TIMEZONE
  const rawStartTimes = formData.getAll('startTimes').map((val) => val.toString())
  const rawRaceIds = formData.getAll('raceIds').map((val) => val.toString())

  // Pair startTimes and raceIds BEFORE filtering blank rows so indices stay aligned
  const pairedTimeslots = rawStartTimes
    .map((rawTime, index) => ({
      rawTime,
      raceId: rawRaceIds[index] ?? '',
    }))
    .filter((slot) => slot.rawTime !== '')

  const parseTimeZone = isValidTimeZone(rawTimeZone) ? rawTimeZone : DEFAULT_TIMEZONE
  const parsedStartTimes = pairedTimeslots.map((slot) =>
    parseDateTimeInTimeZone(slot.rawTime, parseTimeZone)
  )

  const data = {
    id: formData.get('eventId')?.toString() || undefined,
    name: formData.get('name')?.toString() || '',
    track: formData.get('track')?.toString() || '',
    trackConfig: formData.get('trackConfig')?.toString() || null,
    description: formData.get('description')?.toString() || null,
    carClasses: formData.get('carClasses')?.toString() || '',
    timeZone: rawTimeZone,
    startTimes: parsedStartTimes,
    raceIds: rawRaceIds.length > 0 ? pairedTimeslots.map((slot) => slot.raceId) : undefined,
    durationMins: formData.get('durationMins') ? Number(formData.get('durationMins')) : null,
    licenseGroup: formData.get('licenseGroup') ? Number(formData.get('licenseGroup')) : null,
    tempValue: formData.get('tempValue') ? Number(formData.get('tempValue')) : null,
    tempUnits: formData.get('tempUnits') ? Number(formData.get('tempUnits')) : null,
    relHumidity: formData.get('relHumidity') ? Number(formData.get('relHumidity')) : null,
    skies: formData.get('skies') ? Number(formData.get('skies')) : null,
    precipChance: formData.get('precipChance') ? Number(formData.get('precipChance')) : null,
  }

  const result = customEventSchema.safeParse(data)

  if (!result.success) {
    const errorMessages = result.error.issues.map((err) => `${err.message}`)
    return {
      success: false as const,
      error: `Please fix the following: ${errorMessages.join(', ')}`,
    }
  }

  return { success: true as const, data: result.data, startDates: result.data.startTimes }
}
