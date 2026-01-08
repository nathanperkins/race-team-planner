"use client"

import { useActionState } from "react"
import { registerForRace } from "@/app/actions"


import styles from "./RaceRegistrationForm.module.css"

type State = {
  message: string
  errors?: {
    carClass?: string[]
    raceId?: string[]
  }
}

const initialState: State = {
  message: "",
}

interface Props {
  races: { id: string; startTime: Date; endTime: Date }[]
  userId: string
  existingRegistrationRaceIds: string[]
}

export default function RaceRegistrationForm({ races, userId, existingRegistrationRaceIds }: Props) {
  const [state, formAction, isPending] = useActionState(registerForRace, initialState)

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="raceId" className={styles.label}>
          Select Race
        </label>
        <select
          id="raceId"
          name="raceId"
          required
          defaultValue=""
          className={styles.select}
        >
            <option value="" disabled>Select a session</option>
            {races.map(race => {
              const isRegistered = existingRegistrationRaceIds.includes(race.id)
              const isPast = new Date() > race.endTime

              return (
                <option
                  key={race.id}
                  value={race.id}
                  disabled={isRegistered || isPast}
                >
                  {new Date(race.startTime).toLocaleString()} {isRegistered ? "(Registered)" : isPast ? "(Past)" : ""}
                </option>
              )
            })}
        </select>
        {state?.errors?.raceId && (
          <p className={styles.error}>{state.errors.raceId[0]}</p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="carClass" className={styles.label}>
          Car Class
        </label>
        <select
          id="carClass"
          name="carClass"
          required
          defaultValue=""
          className={styles.select}
        >
            <option value="" disabled>Select a class</option>
            <option value="GTP">GTP</option>
            <option value="LMP2">LMP2</option>
            <option value="GTD">GTD / GT3</option>
        </select>
        {state?.errors?.carClass && (
          <p className={styles.error}>{state.errors.carClass[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={styles.button}
      >
        {isPending ? "Signing up..." : "Sign Up"}
      </button>

      {state?.message && state.message !== "Success" && (
         <p className={styles.message}>{state.message}</p>
      )}
    </form>
  )
}
