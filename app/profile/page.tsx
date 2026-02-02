import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import styles from './profile.module.css'
import UserRoleBadge from '@/components/UserRoleBadge'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
import DeleteAccountButton from './DeleteAccountButton'
import prisma from '@/lib/prisma'
import { Lock, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) redirect('/login')

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Profile</h1>

      {(!user.iracingCustomerId || user.expectationsVersion < CURRENT_EXPECTATIONS_VERSION) && (
        <div className={styles.onboardingBanner}>
          <div className={styles.onboardingIcon}>!</div>
          <div className={styles.onboardingText}>
            <h3>Account Setup Required</h3>
            <p>
              Please resolve the required steps to access the rest of the site, enable event
              registration, and track your statistics.
            </p>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <div className={styles.readOnlyField}>
            <span>{user.name}</span>
            <Lock size={14} style={{ opacity: 0.5 }} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <div className={styles.readOnlyField}>
            <span>{user.email}</span>
            <Lock size={14} style={{ opacity: 0.5 }} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Role</label>
          <div className={styles.readOnlyField}>
            <UserRoleBadge role={user.role} />
            <Lock size={14} style={{ opacity: 0.5 }} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>
            Team Expectations
            {user.expectationsVersion < CURRENT_EXPECTATIONS_VERSION && (
              <span className={styles.requiredBadge}>REQUIRED</span>
            )}
          </label>
          <Link href="/expectations" className={styles.clickableValue}>
            {user.expectationsVersion >= CURRENT_EXPECTATIONS_VERSION ? (
              <span className={styles.success}>Accepted (v{user.expectationsVersion})</span>
            ) : (
              <span className={styles.error}>Not Accepted</span>
            )}
            <ChevronRight size={14} style={{ opacity: 0.5 }} />
          </Link>
        </div>

        <ProfileForm
          userId={user.id}
          initialCustomerId={user.iracingCustomerId || ''}
          initialIracingName={user.iracingName || ''}
        />

        <DeleteAccountButton userName={user.name || ''} />
      </div>
    </div>
  )
}
