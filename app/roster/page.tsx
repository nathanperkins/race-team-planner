import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import styles from './roster.module.css'
import UserRoleBadge from '@/components/UserRoleBadge'
import { getLicenseColor } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'
import CompletedEventsButton from '@/components/CompletedEventsButton'

import RosterSortControls from './RosterSortControls'

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function RosterPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const params = await searchParams
  const sort = typeof params.sort === 'string' ? params.sort : 'name'
  const view = typeof params.view === 'string' ? params.view : 'grid'

  // Fetch users with their registrations and event times
  const usersData = await prisma.user.findMany({
    include: {
      racerStats: true,
      registrations: {
        include: {
          race: {
            select: {
              endTime: true,
              event: {
                select: { name: true },
              },
            },
          },
          carClass: {
            select: { name: true },
          },
        },
      },
      teams: {
        select: {
          id: true,
          name: true,
          alias: true,
          iracingTeamId: true,
        },
      },
    },
  })

  // Process counts and sort
  const now = new Date()
  const users = usersData.map((user) => {
    const upcomingRegs = user.registrations.filter((r) => r.race.endTime > now)
    const completedRegs = user.registrations
      .filter((r) => r.race.endTime <= now)
      .sort((a, b) => b.race.endTime.getTime() - a.race.endTime.getTime())

    return {
      ...user,
      upcoming: upcomingRegs.length,
      completed: completedRegs.length,
      completedRegs,
    }
  })

  users.sort((a, b) => {
    switch (sort) {
      case 'total':
        return b.registrations.length - a.registrations.length || a.name!.localeCompare(b.name!)
      case 'upcoming':
        return b.upcoming - a.upcoming || a.name!.localeCompare(b.name!)
      case 'completed':
        return b.completed - a.completed || a.name!.localeCompare(b.name!)
      default: // name
        return (a.name || '').localeCompare(b.name || '')
    }
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Team Roster</h1>
        <RosterSortControls />
      </header>

      <div className={view === 'list' ? styles.list : styles.grid}>
        {users.map((user) => {
          const stats =
            user.racerStats?.find((s) => s.categoryId === 5) ||
            user.racerStats?.find((s) => s.categoryId === 6) ||
            user.racerStats?.find((s) => s.categoryId === 1) ||
            user.racerStats?.[0]
          const licenseColor = stats ? getLicenseColor(stats.groupName) : null
          const licenseLabel = stats?.groupName.replace('Class ', '').substring(0, 1)
          const lightBg = licenseColor ? licenseColor + '26' : '#ffffff26'

          return (
            <div
              key={user.id}
              className={styles.card}
              style={licenseColor ? { borderColor: licenseColor, borderWidth: '1px' } : undefined}
            >
              <div className={styles.header}>
                <Image
                  src={user.image || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.name}`}
                  alt={user.name || 'User'}
                  className={styles.avatar}
                  width={40}
                  height={40}
                />
                <h2 className={styles.name}>{user.name || 'Unknown Driver'}</h2>
              </div>
              <div className={styles.roleContainer}>
                <UserRoleBadge role={user.role} />
                {stats && (
                  <span
                    className={styles.statsBadge}
                    style={{
                      borderColor: licenseColor || undefined,
                      backgroundColor: lightBg,
                      color: licenseColor || undefined,
                    }}
                  >
                    {licenseLabel} {stats.safetyRating.toFixed(2)} {stats.irating}
                  </span>
                )}
              </div>

              {view === 'grid' && (
                <div className={styles.stats}>
                  <Link
                    href={`/users/${user.id}/registrations`}
                    className={`${styles.statItem} ${styles.upcomingPill}`}
                  >
                    <span className={styles.statValue}>{user.upcoming}</span>
                    <span className={styles.statLabel}>
                      <CalendarDays size={14} />
                      Upcoming
                    </span>
                  </Link>
                  <CompletedEventsButton
                    registrations={user.completedRegs}
                    className={styles.completedPill}
                  />
                </div>
              )}

              {view === 'list' && (
                <div className={styles.stats}>
                  {stats && (
                    <span
                      className={styles.statsBadge}
                      style={{
                        borderColor: licenseColor || undefined,
                        backgroundColor: lightBg,
                        color: licenseColor || undefined,
                      }}
                    >
                      {licenseLabel} {stats.safetyRating.toFixed(2)} {stats.irating}
                    </span>
                  )}
                  <Link
                    href={`/users/${user.id}/registrations`}
                    className={`${styles.statItem} ${styles.upcomingPill}`}
                  >
                    <span className={styles.statValue}>{user.upcoming}</span>
                    <span className={styles.statLabel}>
                      <CalendarDays size={14} />
                      Upcoming
                    </span>
                  </Link>
                  <CompletedEventsButton
                    registrations={user.completedRegs}
                    className={styles.completedPill}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
