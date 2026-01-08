"use client"

import { useRef } from "react"
import styles from "./login.module.css"

interface User {
  id: string
  name: string | null
  email: string | null
}

interface MockLoginClientProps {
  users: User[]
  loginAction: (formData: FormData) => Promise<void>
}

export default function MockLoginClient({ users, loginAction }: MockLoginClientProps) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className={styles.form}
      action={loginAction}
    >
      <select
        name="id"
        className={styles.select}
        defaultValue=""
        onChange={() => {
          if (formRef.current) {
            formRef.current.requestSubmit()
          }
        }}
      >
        <option value="" disabled>
          Force login with existing user...
        </option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.email})
          </option>
        ))}
      </select>
    </form>
  )
}
