import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import styles from './roster.module.css'
import UserRoleBadge from '@/components/UserRoleBadge'

import RosterSortControls from './RosterSortControls'

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function RosterPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const params = await searchParams
  const sort = typeof params.sort === 'string' ? params.sort : 'name'

  // Fetch users with their registrations and event times
  const usersData = await prisma.user.findMany({
    include: {
      racerStats: true,
      registrations: {
        include: {
          race: {
            select: { endTime: true },
          },
        },
      },
    },
  })

  // Process counts and sort
  const now = new Date()
  const users = usersData.map((user) => {
    const upcoming = user.registrations.filter((r) => r.race.endTime > now).length
    const completed = user.registrations.filter((r) => r.race.endTime <= now).length
    return { ...user, upcoming, completed }
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

      <div className={styles.grid}>
        {users.map((user) => (
          <div key={user.id} className={styles.card}>
            <Image
              src={user.image || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.name}`}
              alt={user.name || 'User'}
              className={styles.avatar}
              width={80}
              height={80}
            />
            <h2 className={styles.name}>{user.name || 'Unknown Driver'}</h2>
            <p className={styles.email}>{user.email}</p>
            <div className={styles.roleContainer}>
              <UserRoleBadge role={user.role} />
            </div>

            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{user.upcoming}</span>
                <span className={styles.statLabel}>Upcoming</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{user.completed}</span>
                <span className={styles.statLabel}>Completed</span>
              </div>
            </div>

            {user.racerStats && user.racerStats.length > 0 && (
              <div className={styles.paramGrid}>
                {(() => {
                  // Prioritize Sports Car (5), then Formula (6), then Oval (1)
                  const stats =
                    user.racerStats.find((s) => s.categoryId === 5) ||
                    user.racerStats.find((s) => s.categoryId === 6) ||
                    user.racerStats.find((s) => s.categoryId === 1) ||
                    user.racerStats[0]

                  if (!stats) return null

                  // Format license: "A 2.45"
                  const licText = `${stats.groupName.replace('Class ', '').substring(0, 1)} ${stats.safetyRating.toFixed(2)}`

                  return (
                    <>
                      <div className={styles.paramItem} style={{ borderColor: '#' + stats.color }}>
                        <span className={styles.paramValue}>{stats.irating}</span>
                        <span className={styles.paramLabel}>
                          {stats.category === 'sports_car'
                            ? 'Sports Car'
                            : stats.category === 'formula_car'
                              ? 'Formula'
                              : stats.category === 'oval'
                                ? 'Oval'
                                : stats.category === 'dirt_oval'
                                  ? 'Dirt Oval'
                                  : stats.category === 'dirt_road'
                                    ? 'Dirt Road'
                                    : 'iRating'}
                        </span>
                      </div>
                      <div className={styles.paramItem} style={{ borderColor: '#' + stats.color }}>
                        <span className={styles.paramValue}>{licText}</span>
                        <span className={styles.paramLabel}>License</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            <Link href={`/users/${user.id}/signups`} className={styles.viewButton}>
              View Schedule
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
