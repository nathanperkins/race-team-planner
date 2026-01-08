import { signIn } from "@/lib/auth"
import prisma from "@/lib/prisma"
import styles from "./login.module.css"

export default async function MockLoginForm() {
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' }
  })

  return (
    <div className={styles.devLogin}>
      <div className={styles.separator}>
        <span>OR (Dev Mode)</span>
      </div>
      <form
        className={styles.form}
        action={async (formData) => {
          "use server"
          const id = formData.get("id")
          await signIn("credentials", { id, redirectTo: "/" })
        }}
      >
        <select name="id" className={styles.select} defaultValue="">
          <option value="" disabled>
            Select a mock user...
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
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
