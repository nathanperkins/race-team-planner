"use server"

import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"

interface Props {
  params: Promise<{ userId: string }>
}

export default async function UserSignupsPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/login")

  const { userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  // For now, any user is allowed to view anybody's sign-ups. We just want to
  // make sure they are a valid user.
  if (!user) {
    notFound()
  }

  const registrations = await prisma.registration.findMany({
    where: { userId },
    include: {
        event: true
    },
    orderBy: {
        event: {
            startTime: 'asc'
        }
    }
  })

  return (
    <div className="min-h-screen p-8 pb-20 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <div className="mb-8">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </Link>
      </div>

      <header className="mb-12">
         <h1 className="text-3xl font-bold">{user.name === session.user?.name ? "My Signups" : `${user.name}'s Signups`}</h1>
      </header>

      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-sm">
        {registrations.length === 0 ? (
            <p className="text-gray-500">No signups found for this user.</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="border-b border-gray-700 bg-gray-900/50 text-xs uppercase text-gray-400">
                        <tr>
                            <th className="px-6 py-3">Event</th>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Track</th>
                            <th className="px-6 py-3">Car Class</th>
                            <th className="px-6 py-3">Timeslot</th>
                        </tr>
                    </thead>
                    <tbody>
                        {registrations.map((reg) => (
                            <tr key={reg.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                                <td className="px-6 py-4 font-medium text-white">
                                    <Link href={`/events/${reg.eventId}`} className="hover:underline">
                                        {reg.event.name}
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    {new Date(reg.event.startTime).toLocaleString()}
                                </td>
                                <td className="px-6 py-4">{reg.event.track}</td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center rounded-md bg-green-900/30 px-2 py-1 text-xs font-medium text-green-400 ring-1 ring-inset ring-green-900/50">
                                        {reg.carClass}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-400">
                                    {reg.preferredTimeslot || "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  )
}
