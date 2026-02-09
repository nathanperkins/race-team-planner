'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './sidebar.module.css'
import { signOut, useSession } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'
import { getOnboardingStatus, OnboardingStatus } from '@/lib/onboarding'

interface NavLinkProps {
  href: string
  label: string
  isActive: boolean
  onClick?: () => void
  className?: string
  disabled?: boolean
}

function NavLink({ href, label, isActive, onClick, className = '', disabled }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`${styles.link} ${isActive ? styles.activeLink : ''} ${disabled ? styles.setupDisabled : ''} ${className}`}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
    >
      {label}
    </Link>
  )
}

function ExternalNavLink({
  href,
  label,
  onClick,
}: {
  href: string
  label: string
  onClick?: () => void
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      onClick={onClick}
    >
      {label}
    </a>
  )
}

interface SidebarProps {
  onLinkClick?: () => void
  session?: Session | null
}

export default function Sidebar({ onLinkClick, session: propSession }: SidebarProps) {
  const pathname = usePathname()
  const { data: hookSession } = useSession()
  const session = propSession || hookSession

  if (!session?.user) return null

  const onboardingStatus = getOnboardingStatus(session)
  const isSetupComplete = onboardingStatus === OnboardingStatus.COMPLETE
  const userId = session.user.id

  const checkActive = (path: string) => {
    if (path === '/' && pathname === '/') return true
    if (path !== '/' && pathname.startsWith(path)) return true
    return false
  }

  return (
    <div className={styles.navWrapper}>
      <nav className={styles.nav}>
        {isSetupComplete ? (
          <MainSection userId={userId} checkActive={checkActive} onLinkClick={onLinkClick} />
        ) : (
          <OnboardingSection
            status={onboardingStatus}
            checkActive={checkActive}
            onLinkClick={onLinkClick}
          />
        )}

        {session.user.role === 'ADMIN' && (
          <NavLink
            href="/admin"
            label="Admin Panel"
            isActive={checkActive('/admin')}
            onClick={onLinkClick}
          />
        )}
      </nav>

      <div className={styles.footer}>
        <UserSection user={session.user} />
      </div>
    </div>
  )
}

function MainSection({
  userId,
  checkActive,
  onLinkClick,
}: {
  userId: string
  checkActive: (p: string) => boolean
  onLinkClick?: () => void
}) {
  return (
    <>
      <NavLink
        href="/events"
        label="Events"
        isActive={checkActive('/events')}
        onClick={onLinkClick}
      />
      <NavLink
        href={`/users/${userId}/registrations`}
        label="My Registrations"
        isActive={checkActive(`/users/${userId}`)}
        onClick={onLinkClick}
      />
      <NavLink
        href="/roster"
        label="Roster"
        isActive={checkActive('/roster')}
        onClick={onLinkClick}
      />

      <div className={styles.navDivider} />

      <NavLink
        href="/expectations"
        label="Team Expectations"
        isActive={checkActive('/expectations')}
        onClick={onLinkClick}
      />
      <NavLink
        href="/profile"
        label="My Profile"
        isActive={checkActive('/profile')}
        onClick={onLinkClick}
      />

      {process.env.NEXT_PUBLIC_FEEDBACK_URL && (
        <ExternalNavLink
          href={process.env.NEXT_PUBLIC_FEEDBACK_URL}
          label="Report Feedback / Bugs"
          onClick={onLinkClick}
        />
      )}
    </>
  )
}

function OnboardingSection({
  status,
  checkActive,
  onLinkClick,
}: {
  status: OnboardingStatus
  checkActive: (p: string) => boolean
  onLinkClick?: () => void
}) {
  const needsExpectations = status === OnboardingStatus.NO_EXPECTATIONS
  const needsProfile = status === OnboardingStatus.NO_CUSTOMER_ID

  return (
    <>
      <div className={styles.setupHeader}>Account Setup</div>

      <NavLink
        href="/expectations"
        label="1. Team Expectations"
        isActive={checkActive('/expectations')}
        className={!needsExpectations ? styles.completedStep : styles.currentStep}
        onClick={onLinkClick}
      />

      <NavLink
        href="/profile"
        label="2. Set Up Your Profile"
        isActive={checkActive('/profile')}
        className={needsProfile ? styles.currentStep : ''}
        disabled={needsExpectations}
        onClick={onLinkClick}
      />
    </>
  )
}

function UserSection({ user }: { user: Session['user'] }) {
  return (
    <div className={styles.userSection}>
      <div className={styles.userInfo}>
        {user?.image && (
          <Image
            src={user.image}
            alt={user.name || 'User'}
            width={32}
            height={32}
            className={styles.avatar}
          />
        )}
        <span className={styles.welcome}>{user?.name}</span>
      </div>
      <button onClick={() => signOut({ callbackUrl: '/' })} className={styles.signOutButton}>
        Sign Out
      </button>
    </div>
  )
}
