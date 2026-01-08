
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import EventRegistrationForm from "@/components/EventRegistrationForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

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

  return (
    <div className="min-h-screen p-8 pb-20 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <div className="mb-8">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{event.name}</h1>
          <div className="mb-8 flex flex-wrap gap-4 text-sm text-gray-400">
             <span className="flex items-center gap-1">
                📍 {event.track}
             </span>
             <span className="flex items-center gap-1">
                📅 {new Date(event.startTime).toLocaleString()}
             </span>
          </div>

          <div className="prose prose-invert mb-12 max-w-none">
            <h3 className="text-xl font-semibold">Event Description</h3>
            <p className="text-gray-300">{event.description || "No description provided."}</p>
          </div>

          <div className="rounded-lg bg-gray-900 p-6">
            <h3 className="mb-6 text-xl font-semibold">Registered Drivers ({event.registrations.length})</h3>

            {event.registrations.length === 0 ? (
                <p className="text-gray-500">No drivers registered yet. Be the first!</p>
            ) : (
                <div className="space-y-4">
                    {event.registrations.map((reg) => (
                        <div key={reg.id} className="flex items-center justify-between border-b border-gray-800 pb-4 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
                                {reg.user.image && (
                                    <Image src={reg.user.image} alt={reg.user.name || "User"} width={40} height={40} className="rounded-full" />
                                )}
                                <div>
                                    <p className="font-medium text-white">{reg.user.name}</p>
                                    <p className="text-xs text-gray-500">Class: {reg.carClass}</p>
                                </div>
                            </div>
                            <div className="text-right text-sm text-gray-400">
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
           <div className="sticky top-8 rounded-lg border border-gray-700 bg-gray-800 p-6">
              <h3 className="mb-4 text-xl font-semibold">Registration</h3>
               {userRegistration ? (
                   <div className="rounded bg-green-900/50 p-4 border border-green-800 text-green-200">
                       <p className="font-medium">✅ You are registered!</p>
                       <p className="mt-1 text-sm">Car Class: {userRegistration.carClass}</p>
                       <p className="text-sm">Timeslot: {userRegistration.preferredTimeslot || "None"}</p>
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
