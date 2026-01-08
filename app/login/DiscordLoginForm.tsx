import { signIn } from "@/lib/auth"
import styles from "./login.module.css"

export default function DiscordLoginForm() {
  return (
    <form
      className={styles.form}
      action={async () => {
        "use server"
        await signIn("discord", { redirectTo: "/" })
      }}
    >
      <button type="submit" className={styles.button}>
        Sign in with Discord
      </button>
    </form>
  )
}
