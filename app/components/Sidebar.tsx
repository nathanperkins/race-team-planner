'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './sidebar.module.css'
import { signOut } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'

interface SidebarProps {
  session: Session
}

export default function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true
    if (path !== '/' && pathname.startsWith(path)) return true
    return false
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.title}>Race Team Planner</div>

      <nav className={styles.nav}>
        <Link
          href="/events"
          className={`${styles.link} ${isActive('/events') ? styles.activeLink : ''}`}
        >
          Events
        </Link>

        <Link
          href={`/users/${session.user?.id}/signups`}
          className={`${styles.link} ${isActive(`/users/${session.user?.id}`) ? styles.activeLink : ''}`}
        >
          My Signups
        </Link>

        <Link
          href="/roster"
          className={`${styles.link} ${isActive('/roster') ? styles.activeLink : ''}`}
        >
          Roster
        </Link>

        <Link
          href="/expectations"
          className={`${styles.link} ${isActive('/expectations') ? styles.activeLink : ''}`}
        >
          Team Expectations
        </Link>

        <Link
          href="/profile"
          className={`${styles.link} ${isActive('/profile') ? styles.activeLink : ''}`}
        >
          My Profile
        </Link>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name || 'User'}
                width={32}
                height={32}
                className={styles.avatar}
              />
            )}
            <span className={styles.welcome}>{session.user?.name}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/' })} className={styles.signOutButton}>
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  )
}
