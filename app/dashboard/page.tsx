
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  const events = await prisma.event.findMany({
    orderBy: {
      startTime: 'asc',
    },
  })

  return (
    <div className="min-h-screen p-8 pb-20 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <header className="mb-12 flex items-center justify-between">
         <h1 className="text-3xl font-bold">Upcoming Events</h1>
         <div className="flex items-center gap-4">
            <Link href={`/users/${session.user?.id}/signups`} className="text-sm hover:underline">My Signups</Link>
            <span className="text-sm text-gray-400">Signed in as {session.user?.name}</span>
            <Link href="/" className="text-sm hover:underline">Home</Link>
         </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event: any) => (
          <div key={event.id} className="rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-sm transition-colors hover:bg-gray-750">
            <div className="mb-4 flex items-start justify-between">
               <h2 className="text-xl font-semibold text-white">{event.name}</h2>
               <span className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200">
                  {new Date(event.startTime).toLocaleDateString()}
               </span>
            </div>

            <p className="mb-2 text-sm text-gray-400">{event.track}</p>
            {event.description && (
                <p className="mb-6 line-clamp-3 text-sm text-gray-500">{event.description}</p>
            )}

            <Link
                href={`/events/${event.id}`}
                className="block w-full rounded bg-white py-2 text-center text-sm font-medium text-black hover:bg-gray-200"
            >
                View Details
            </Link>
          </div>
        ))}

        {events.length === 0 && (
            <p className="col-span-full text-center text-gray-500">No upcoming events found.</p>
        )}
      </div>
    </div>
  )
}
