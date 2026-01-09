import DiscordLoginForm from "./DiscordLoginForm"
import MockLoginForm from "./MockLoginForm"
import styles from "./login.module.css"

import { features } from "@/lib/config"

// Helper component for the separator
function LoginSeparator() {
  return (
    <div className={styles.divider}>
      <span>OR</span>
    </div>
  )
}

// Helper function to build login forms
function getLoginElements() {
  const elements: React.ReactNode[] = []

  const addForm = (form: React.ReactNode, key: string) => {
    elements.push(form)
    elements.push(<LoginSeparator key={`sep-${key}`} />)
  }

  if (features.discordAuth) {
    addForm(<DiscordLoginForm key="discord" />, 'discord')
  }

  if (features.mockAuth) {
    addForm(<MockLoginForm key="mock" />, 'mock')
  }

  // Remove the last separator if we added any elements
  if (elements.length > 0) {
    elements.pop()
  }

  return elements
}

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Login</h1>
        {getLoginElements()}
      </div>
    </div>
  )
}
