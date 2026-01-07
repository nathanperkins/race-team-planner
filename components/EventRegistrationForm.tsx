
"use client"

import { useActionState } from "react"
import { registerForEvent } from "@/app/actions"


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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div>
        <label htmlFor="carClass" className="mb-1 block text-sm font-medium text-gray-300">
          Car Class
        </label>
        <select
          id="carClass"
          name="carClass"
          required
          defaultValue=""
          className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-white focus:border-blue-500 focus:outline-none"
        >
            <option value="" disabled>Select a class</option>
            <option value="GTP">GTP</option>
            <option value="LMP2">LMP2</option>
            <option value="GTD">GTD / GT3</option>
        </select>
        {state?.errors?.carClass && (
          <p className="mt-1 text-xs text-red-500">{state.errors.carClass[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="preferredTimeslot" className="mb-1 block text-sm font-medium text-gray-300">
          Preferred Timeslot (Optional)
        </label>
        <input
          type="text"
          id="preferredTimeslot"
          name="preferredTimeslot"
          placeholder="e.g. Fri Night, Sat Morning"
          className="w-full rounded border border-gray-600 bg-gray-700 p-2 text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "Signing up..." : "Sign Up"}
      </button>

      {state?.message && state.message !== "Success" && (
         <p className="mt-2 text-center text-sm text-red-400">{state.message}</p>
      )}
    </form>
  )
}
