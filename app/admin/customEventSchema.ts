import { z } from 'zod'

export const customEventSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Event Name is required'),
  track: z.string().min(1, 'Track is required'),
  trackConfig: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  carClasses: z.string().min(1, 'Car Classes are required'),
  startTimes: z
    .array(
      z.coerce.date({
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
  // Extract all fields
  const data = {
    id: formData.get('eventId')?.toString() || undefined,
    name: formData.get('name')?.toString() || '',
    track: formData.get('track')?.toString() || '',
    trackConfig: formData.get('trackConfig')?.toString() || null,
    description: formData.get('description')?.toString() || null,
    carClasses: formData.get('carClasses')?.toString() || '',
    startTimes: formData.getAll('startTimes').filter((val) => val !== ''),
    raceIds: formData.getAll('raceIds'),
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
    // Generate detailed error message string
    const errorMessages = result.error.issues.map((err) => `${err.message}`)
    return {
      success: false as const,
      error: `Please fix the following: ${errorMessages.join(', ')}`,
    }
  }

  return { success: true as const, data: result.data, startDates: result.data.startTimes }
}
