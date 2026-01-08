import DiscordLoginForm from "./DiscordLoginForm"
import MockLoginForm from "./MockLoginForm"
import styles from "./login.module.css"

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign In</h1>
        <DiscordLoginForm />

        {process.env.NODE_ENV === "development" && <MockLoginForm />}
      </div>
    </div>
  )
}
