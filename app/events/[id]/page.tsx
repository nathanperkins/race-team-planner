import { CURRENT_EXPECTATIONS_VERSION } from "@/lib/config"

import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Image from "next/image"
import EventRegistrationForm from "@/components/EventRegistrationForm"
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
      registrations: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
  })

  if (!event) {
    notFound()
  }

  // Check if current user is already registered
  const userRegistration = event.registrations.find((r) => r.userId === session.user?.id)

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
                📅 {new Date(event.startTime).toLocaleString()}
             </span>
          </div>

          <div className={styles.prose}>
            <h3 className="text-xl font-semibold">Event Description</h3>
            <p className="text-gray-300">{event.description || "No description provided."}</p>
          </div>

          <div className={styles.driversSection}>
            <h3 className={styles.sectionTitle}>Registered Drivers ({event.registrations.length})</h3>

            {event.registrations.length === 0 ? (
                <p className="text-gray-500">No drivers registered yet. Be the first!</p>
            ) : (
                <div className={styles.driverList}>
                    {event.registrations.map((reg) => (
                        <div key={reg.id} className={styles.driverRow}>
                            <div className={styles.driverInfo}>
                                {reg.user.image && (
                                    <Image src={reg.user.image} alt={reg.user.name || "User"} width={40} height={40} className={styles.avatar} />
                                )}
                                <div>
                                    <p className={styles.driverName}>{reg.user.name}</p>
                                    <p className={styles.driverClass}>Class: {reg.carClass}</p>
                                </div>
                            </div>
                            <div className={styles.driverTimeslot}>
                                {reg.preferredTimeslot && <p>{reg.preferredTimeslot}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        <div>
           {/* Registration Form will go here */}
           <div className={styles.sidebar}>
              <h3 className={styles.sectionTitle}>Registration</h3>
               {isCompleted ? (
                   <div className={styles.completedBox}>
                       <p className={styles.completedTitle}>🏁 Event Completed</p>
                       <p className={styles.completedDetail}>
                           This event ended on {new Date(event.endTime).toLocaleDateString()}. Registration is closed.
                       </p>
                   </div>
               ) : userRegistration ? (
                   <div className={styles.registeredBox}>
                       <p className={styles.registeredTitle}>✅ You are registered!</p>
                       <p className={styles.registeredDetail}>Car Class: {userRegistration.carClass}</p>
                       <p className={styles.registeredDetail}>Timeslot: {userRegistration.preferredTimeslot || "None"}</p>
                       <form action={async () => {
                         "use server"
                         await deleteRegistration(event.id)
                       }}>
                         <button type="submit" className={styles.deleteButton}>
                           Drop Signup
                         </button>
                       </form>
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
                   <EventRegistrationForm eventId={event.id} />
               )}
           </div>
        </div>
      </div>
    </div>
  )
}
