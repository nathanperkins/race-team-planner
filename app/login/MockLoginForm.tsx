import { signIn } from "@/lib/auth"
import prisma from "@/lib/prisma"
import styles from "./login.module.css"
import MockLoginClient from "./MockLoginClient"

export default async function MockLoginForm() {
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' }
  })

  async function loginAction(formData: FormData) {
    "use server"
    const id = formData.get("id")
    if (id) {
      await signIn("credentials", { id, redirectTo: "/" })
    }
  }

  return (
    <div className={styles.devLogin}>
      <div className={styles.separator}>
        <span>OR (Dev Mode)</span>
      </div>
      <MockLoginClient users={users} loginAction={loginAction} />
    </div>
  )
}
