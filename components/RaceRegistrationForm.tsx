'use client'

import { useActionState } from 'react'
import { registerForRace } from '@/app/actions'

import styles from './RaceRegistrationForm.module.css'

type State = {
  message: string
  errors?: {
    carClass?: string[]
    raceId?: string[]
  }
}

const initialState: State = {
  message: '',
}

interface Props {
  races: { id: string; startTime: Date; endTime: Date }[]
  carClasses: { id: string; name: string; shortName: string }[]
  existingRegistrationRaceIds: string[]
}

export default function RaceRegistrationForm({
  races,
  carClasses,
  existingRegistrationRaceIds,
}: Props) {
  const [state, formAction, isPending] = useActionState(registerForRace, initialState)

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="raceId" className={styles.label}>
          Select Race
        </label>
        <select id="raceId" name="raceId" required defaultValue="" className={styles.select}>
          <option value="" disabled>
            Select a session
          </option>
          {races.map((race) => {
            const isRegistered = existingRegistrationRaceIds.includes(race.id)
            const isPast = new Date() > race.endTime

            return (
              <option
                key={race.id}
                value={race.id}
                disabled={isRegistered || isPast}
                suppressHydrationWarning
              >
                {new Date(race.startTime).toLocaleString(undefined, {
                  timeZoneName: 'short',
                })}{' '}
                {isRegistered ? '(Registered)' : isPast ? '(Past)' : ''}
              </option>
            )
          })}
        </select>
        {state?.errors?.raceId && <p className={styles.error}>{state.errors.raceId[0]}</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor="carClassId" className={styles.label}>
          Car Class
        </label>
        <select
          id="carClassId"
          name="carClassId"
          required
          defaultValue=""
          className={styles.select}
        >
          <option value="" disabled>
            Select a class
          </option>
          {carClasses.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.name} ({cc.shortName})
            </option>
          ))}
        </select>
        {state?.errors?.carClassId && <p className={styles.error}>{state.errors.carClassId[0]}</p>}
      </div>

      <button type="submit" disabled={isPending} className={styles.button}>
        {isPending ? 'Signing up...' : 'Sign Up'}
      </button>

      {state?.message && state.message !== 'Success' && (
        <p className={styles.message}>{state.message}</p>
      )}
    </form>
  )
}
