import { UserRole } from '@prisma/client'
import { ShieldCheck, User } from 'lucide-react'
import styles from './UserRoleBadge.module.css'

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.USER]: 'User',
}

function getRoleDisplayName(role: UserRole | string | null | undefined): string {
  const r = role as UserRole
  return ROLE_DISPLAY_NAMES[r] || ROLE_DISPLAY_NAMES[UserRole.USER]
}

interface UserRoleBadgeProps {
  role: UserRole | string | null | undefined
  className?: string
}

export default function UserRoleBadge({ role, className }: UserRoleBadgeProps) {
  const userRole = (role as UserRole) || UserRole.USER
  const isAdmin = userRole === UserRole.ADMIN
  const displayName = getRoleDisplayName(userRole)
  const Icon = isAdmin ? ShieldCheck : User

  return (
    <span className={`${isAdmin ? styles.adminBadge : styles.userBadge} ${className || ''}`}>
      <Icon size={14} />
      {displayName}
    </span>
  )
}
