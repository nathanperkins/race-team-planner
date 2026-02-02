import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import styles from './profile.module.css'

import { Shield, User } from 'lucide-react'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const roleName = session.user.role?.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
  const isAdmin = session.user.role === 'ADMIN'

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Profile</h1>
      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <div className={styles.value}>{session.user.name}</div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <div className={styles.value}>{session.user.email}</div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Role</label>
          <div className={styles.value}>
            <span className={isAdmin ? styles.adminBadge : styles.userBadge}>
              {isAdmin ? <Shield size={14} /> : <User size={14} />}
              {roleName}
            </span>
          </div>
        </div>

        <ProfileForm
          userId={session.user.id!}
          initialCustomerId={session.user.iracingCustomerId || ''}
        />
      </div>
    </div>
  )
}
