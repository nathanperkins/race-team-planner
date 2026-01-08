
import { signIn } from "@/lib/auth"
import styles from "./login.module.css"

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign In</h1>
        <form
          action={async () => {
            "use server"
            await signIn("discord", { redirectTo: "/" })
          }}
        >
          <button
            type="submit"
            className={styles.button}
          >
            Sign in with Discord
          </button>
        </form>
      </div>
    </div>
  )
}
