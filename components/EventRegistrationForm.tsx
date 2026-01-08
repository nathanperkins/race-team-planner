
"use client"

import { useActionState } from "react"
import { registerForEvent } from "@/app/actions"


import styles from "./EventRegistrationForm.module.css"

type State = {
  message: string
  errors?: {
    carClass?: string[]
    preferredTimeslot?: string[]
  }
}

const initialState: State = {
  message: "",
}

export default function EventRegistrationForm({ eventId }: { eventId: string }) {
  const [state, formAction, isPending] = useActionState(registerForEvent, initialState)

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="eventId" value={eventId} />

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

      <div className={styles.field}>
        <label htmlFor="preferredTimeslot" className={styles.label}>
          Preferred Timeslot (Optional)
        </label>
        <input
          type="text"
          id="preferredTimeslot"
          name="preferredTimeslot"
          placeholder="e.g. Fri Night, Sat Morning"
          className={styles.input}
        />
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
