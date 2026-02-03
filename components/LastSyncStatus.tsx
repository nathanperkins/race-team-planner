import prisma from '@/lib/prisma'
import FormattedDate from '@/components/FormattedDate'
import styles from './LastSyncStatus.module.css'

export default async function LastSyncStatus({ className }: { className?: string }) {
  const lastSync = await prisma.syncLog.findFirst({
    where: { status: 'SUCCESS' },
    orderBy: { endTime: 'desc' },
  })

  if (!lastSync?.endTime) return null

  return (
    <span className={`${styles.lastSynced} ${className || ''}`}>
      Data syncs every hour • Last: <FormattedDate date={lastSync.endTime} />
    </span>
  )
}
