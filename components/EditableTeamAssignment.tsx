'use client'

import React, { useState } from 'react'
import { Users, Loader2 } from 'lucide-react'
import { assignRegistrationToTeam } from '@/app/admin/teams/actions'
import styles from './EditableTeamAssignment.module.css'

interface Team {
  id: string
  name: string
}

interface Props {
  registrationId: string
  currentTeamId: string | null
  teams: Team[]
  isAdmin: boolean
}

export default function EditableTeamAssignment({
  registrationId,
  currentTeamId,
  teams,
  isAdmin,
}: Props) {
  const [loading, setLoading] = useState(false)

  async function handleTeamChange(newTeamId: string) {
    if (newTeamId === (currentTeamId || 'unassigned')) return

    setLoading(true)
    try {
      await assignRegistrationToTeam(registrationId, newTeamId === 'unassigned' ? null : newTeamId)
    } catch (err) {
      console.error('Failed to assign team:', err)
      alert(err instanceof Error ? err.message : 'Failed to assign team')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) return null

  return (
    <div className={styles.container}>
      <div className={styles.buttonLike}>
        <Users size={14} className={styles.icon} />
        <select
          className={styles.select}
          value={currentTeamId || 'unassigned'}
          onChange={(e) => handleTeamChange(e.target.value)}
          disabled={loading}
          title="Move to another team"
        >
          <option value="" disabled hidden>
            Move
          </option>
          <option value="unassigned" className={styles.option}>
            Unassigned
          </option>
          {teams.map((team) => (
            <option key={team.id} value={team.id} className={styles.option}>
              {team.name}
            </option>
          ))}
        </select>
        {loading ? (
          <Loader2 className={styles.spin} size={14} />
        ) : (
          <span className={styles.label}>Move</span>
        )}
      </div>
    </div>
  )
}
