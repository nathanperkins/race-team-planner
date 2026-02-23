'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './sidebar.module.css'
import { signOut, useSession } from 'next-auth/react'
import { Session } from 'next-auth'
import Image from 'next/image'
import { getOnboardingStatus, OnboardingStatus } from '@/lib/onboarding'
import { resolveDiscordHref } from '@/lib/discord-utils'

interface NavLinkProps {
  href: string
  label?: string
  children?: React.ReactNode
  isActive: boolean
  onClick?: () => void
  className?: string
  disabled?: boolean
}

function NavLink({
  href,
  label,
  children,
  isActive,
  onClick,
  className = '',
  disabled,
}: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`${styles.link} ${isActive ? styles.activeLink : ''} ${disabled ? styles.setupDisabled : ''} ${className}`}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
    >
      {label || children}
    </Link>
  )
}

function SidebarButton({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button onClick={onClick} className={`${styles.link} ${styles.sidebarButton} ${className}`}>
      {children}
    </button>
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
      href={resolveDiscordHref(href, typeof navigator !== 'undefined' ? navigator.userAgent : '')}
      suppressHydrationWarning
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
  feedbackUrl?: string
  userGuideUrl?: string
}

export default function Sidebar({
  onLinkClick,
  session: propSession,
  feedbackUrl,
  userGuideUrl,
}: SidebarProps) {
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
          <MainSection
            userId={userId}
            checkActive={checkActive}
            onLinkClick={onLinkClick}
            feedbackUrl={feedbackUrl}
            userGuideUrl={userGuideUrl}
          />
        ) : (
          <OnboardingSection
            status={onboardingStatus}
            checkActive={checkActive}
            onLinkClick={onLinkClick}
          />
        )}
      </nav>

      <div className={styles.footer}>
        <UserSection
          user={session.user}
          isActive={checkActive('/profile')}
          checkActive={checkActive}
          onLinkClick={onLinkClick}
        />
        <div className={styles.copyright}>
          &copy; {new Date().getFullYear()} Nathan Perkins & Steven Case
        </div>
      </div>
    </div>
  )
}

function MainSection({
  userId,
  checkActive,
  onLinkClick,
  feedbackUrl,
  userGuideUrl,
}: {
  userId: string
  checkActive: (p: string) => boolean
  onLinkClick?: () => void
  feedbackUrl?: string
  userGuideUrl?: string
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
      {userGuideUrl && (
        <ExternalNavLink href={userGuideUrl} label="User Guide" onClick={onLinkClick} />
      )}
      <NavLink
        href="/changelog"
        label="Changelog"
        isActive={checkActive('/changelog')}
        onClick={onLinkClick}
      />

      {feedbackUrl && (
        <ExternalNavLink href={feedbackUrl} label="Report Feedback / Bugs" onClick={onLinkClick} />
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

function UserSection({
  user,
  isActive,
  checkActive,
  onLinkClick,
}: {
  user: Session['user']
  isActive: boolean
  checkActive: (path: string) => boolean
  onLinkClick?: () => void
}) {
  return (
    <div className={styles.userSection}>
      <NavLink href="/profile" isActive={isActive} onClick={onLinkClick}>
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
      </NavLink>
      {user.role === 'ADMIN' && (
        <NavLink
          href="/admin"
          label="Admin Panel"
          isActive={checkActive('/admin')}
          onClick={onLinkClick}
          className={styles.adminLink}
        />
      )}
      <SidebarButton onClick={() => signOut({ callbackUrl: '/' })}>Sign Out</SidebarButton>
    </div>
  )
}
