import { signIn } from "@/lib/auth"
import { MOCK_USERS } from "@/lib/mock-users"
import styles from "./login.module.css"

export default function MockLoginForm() {
  return (
    <div className={styles.devLogin}>
      <div className={styles.separator}>
        <span>OR (Dev Mode)</span>
      </div>
      <form
        className={styles.form}
        action={async (formData) => {
          "use server"
          const email = formData.get("email")
          await signIn("credentials", { email, redirectTo: "/" })
        }}
      >
        <select name="email" className={styles.select} defaultValue="">
          <option value="" disabled>
            Select a mock user...
          </option>
          {MOCK_USERS.map((user) => (
            <option key={user.email} value={user.email}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <button type="submit" className={styles.button}>
          Login with Mock User
        </button>
      </form>
    </div>
  )
}
