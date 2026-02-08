import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import styles from './profile.module.css'
import UserRoleBadge from '@/components/UserRoleBadge'
import DeleteAccountButton from './DeleteAccountButton'
import prisma from '@/lib/prisma'
import { Lock, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import LastSyncStatus from '@/components/LastSyncStatus'

import { getOnboardingStatus, OnboardingStatus } from '@/lib/onboarding'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      teams: {
        select: {
          id: true,
          name: true,
          iracingTeamId: true,
        },
      },
    },
  })

  if (!user) redirect('/login')

  // Use status for UI banners
  const onboardingStatus = getOnboardingStatus(session)

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Profile</h1>
      <LastSyncStatus className={styles.syncNote} />

      {onboardingStatus === OnboardingStatus.NO_CUSTOMER_ID && (
        <div className={styles.onboardingBanner}>
          <div className={styles.onboardingIcon}>!</div>
          <div className={styles.onboardingText}>
            <h3>Account Setup Required</h3>
            <p>
              Please provide your iRacing Customer ID to complete your profile and access the
              dashboard.
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
          <label className={styles.label}>Team Expectations</label>
          <Link href="/expectations" className={styles.clickableValue}>
            <span className={styles.success}>Accepted (v{user.expectationsVersion})</span>
            <ChevronRight size={14} style={{ opacity: 0.5 }} />
          </Link>
        </div>

        <ProfileForm
          userId={user.id}
          initialCustomerId={user.iracingCustomerId?.toString() || ''}
          initialIracingName={user.iracingName || ''}
        />

        {user.teams && user.teams.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>Teams</label>
            <div className={styles.teamsList}>
              {user.teams.map((team) => (
                <span key={team.id} className={styles.teamBadge}>
                  {team.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <DeleteAccountButton userName={user.name || ''} />
      </div>
    </div>
  )
}
