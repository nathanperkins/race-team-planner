import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: Props) {
  const { id } = await params
  redirect(`/events?eventId=${id}`)
}
