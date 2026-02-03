import { redirect } from 'next/navigation'
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  redirect('/users/' + userId + '/registrations')
}
