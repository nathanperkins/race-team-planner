import DiscordLoginForm from './DiscordLoginForm'
import MockLoginForm from './MockLoginForm'
import styles from './login.module.css'

import { features, appTitle } from '@/lib/config'

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

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

import Image from 'next/image'

export default async function LoginPage() {
  const session = await auth()
  if (session) {
    redirect('/')
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Image
          src="/logo.png"
          alt={`${appTitle} Logo`}
          width={120}
          height={120}
          className={styles.logo}
          priority
        />
        <h1 className={styles.appName}>{appTitle}</h1>
      </header>
      <div className={styles.card}>
        <h2 className={styles.title}>Sign In</h2>
        {getLoginElements()}
      </div>
    </div>
  )
}
