import { CURRENT_EXPECTATIONS_VERSION } from "@/lib/config"

import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Image from "next/image"
import RaceRegistrationForm from "@/components/RaceRegistrationForm"
import RaceDetails from "@/components/RaceDetails"
import { Cloud } from "lucide-react"
import { deleteRegistration } from "@/app/actions"

import styles from "./event.module.css"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { expectationsVersion: true }
  })

  const hasAgreedToExpectations = (user?.expectationsVersion ?? 0) >= CURRENT_EXPECTATIONS_VERSION

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      races: {
        include: {
          registrations: {
            include: {
              user: true,
            },
            orderBy: {
              createdAt: 'asc'
            }
          },
        },
        orderBy: {
          startTime: 'asc'
        }
      },
    },
  })

  if (!event) {
    notFound()
  }

  // Check if current user is already registered for ANY race in this event
  const userRegistrations = event.races.flatMap((race: any) => race.registrations).filter((reg: any) => reg.userId === session.user?.id)

  const isCompleted = new Date() > event.endTime

  return (
    <div className={styles.container}>
      <div className={styles.layout}>
        <div style={{ position: 'relative' }}>
          {event.externalId && (
            <div
              className={styles.sourceBadge}
              data-tooltip="Synced from iRacing"
            >
              <Cloud size={16} />
            </div>
          )}
          <h1 className={styles.title}>{event.name}</h1>
          <div className={styles.meta}>
             <span className={styles.metaItem}>
                📍 {event.track}
             </span>
             <span className={styles.metaItem}>
                📅 {new Date(event.startTime).toLocaleString()} - {new Date(event.endTime).toLocaleString()}
             </span>
          </div>

          <div className={styles.prose}>
            <h3 className="text-xl font-semibold">Event Description</h3>
            <p className="text-gray-300">{event.description || "No description provided."}</p>
          </div>

          <div className={styles.racesSection}>
            <h3 className={styles.sectionTitle}>Races & Driver Lineups</h3>
            {event.races.length === 0 ? (
                <p className="text-gray-500">No races scheduled for this event.</p>
            ) : (
                <div className={styles.raceList}>
                    {event.races.map((race: any) => (
                        <RaceDetails key={race.id} race={race} userId={session.user.id} />
                    ))}
                </div>
            )}
          </div>
        </div>

        <div>
           <div className={styles.sidebar}>
              <h3 className={styles.sectionTitle}>Registration</h3>
               {isCompleted ? (
                   <div className={styles.completedBox}>
                       <p className={styles.completedTitle}>🏁 Event Completed</p>
                       <p className={styles.completedDetail}>
                           This event ended on {new Date(event.endTime).toLocaleDateString()}. Registration is closed.
                       </p>
                   </div>
               ) : !hasAgreedToExpectations ? (
                   <div className={styles.warningBox}>
                       <p className={styles.warningTitle}>Action Required</p>
                       <p className={styles.warningDetail}>
                           You must review and agree to the latest Team Expectations before signing up.
                       </p>
                       <a
                           href="/expectations"
                           className={styles.reviewButton}
                       >
                           Review Expectations
                       </a>
                   </div>
               ) : (
                   <RaceRegistrationForm races={event.races.map((r: any) => ({ id: r.id, startTime: r.startTime, endTime: r.endTime }))} userId={session.user.id} existingRegistrationRaceIds={userRegistrations.map((r: any) => r.raceId)} />
               )}
           </div>
        </div>
      </div>
    </div>
  )
}
