import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import styles from "./roster.module.css"

import RosterSortControls from "./RosterSortControls"

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function RosterPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect("/login")

  const params = await searchParams
  const sort = typeof params.sort === 'string' ? params.sort : 'name'

  let orderBy: any = { name: 'asc' }
  if (sort === 'signups') {
    orderBy = [
      {
        registrations: {
          _count: 'desc'
        }
      },
      {
        name: 'asc'
      }
    ]
  }

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { registrations: true }
      }
    },
    orderBy
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
              alt={user.name || "User"}
              className={styles.avatar}
              width={80}
              height={80}
            />
            <h2 className={styles.name}>{user.name || "Unknown Driver"}</h2>
            <p className={styles.email}>{user.email}</p>

            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{user._count.registrations}</span>
                <span className={styles.statLabel}>Signups</span>
              </div>
            </div>

            <Link href={`/users/${user.id}/signups`} className={styles.viewButton}>
              View Schedule
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
