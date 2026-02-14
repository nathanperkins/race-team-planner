'use client'

import React, { useState, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  Users,
  Eye,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  syncTeamMembers,
} from './teams/actions'
import styles from './TeamManagement.module.css'

interface Team {
  id: string
  name: string
  alias?: string | null
  iracingTeamId: number
  memberCount?: number
}

interface TeamMember {
  custId: number
  displayName: string
  isOwner?: boolean
  isAdmin?: boolean
  teamName?: string
  ownerName?: string
  isEnrolled?: boolean
  userId?: string
  appName?: string | null
  appEmail?: string
}

interface TeamMembersData {
  teamName: string
  iracingTeamId: number
  members: TeamMember[]
  enrolledCount: number
  totalCount: number
}

export default function TeamManagement() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [newTeamIracingId, setNewTeamIracingId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editIracingId, setEditIracingId] = useState('')
  const [editAlias, setEditAlias] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [inspectingTeam, setInspectingTeam] = useState<TeamMembersData | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)

  useEffect(() => {
    fetchTeams()
  }, [])

  async function fetchTeams() {
    try {
      setLoading(true)
      const data = await getTeams()
      setTeams(data)
    } catch (err) {
      setError('Failed to load teams')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddTeam() {
    if (!newTeamIracingId.trim()) return
    setError(null)
    setProcessing('adding')
    try {
      const iracingId = parseInt(newTeamIracingId)
      if (isNaN(iracingId)) {
        setError('Please enter a valid team ID number')
        setProcessing(null)
        return
      }
      await createTeam(iracingId)
      setNewTeamIracingId('')
      await fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add team')
    } finally {
      setProcessing(null)
    }
  }

  async function handleUpdateTeam(id: string) {
    if (!editIracingId.trim()) return
    setError(null)
    setProcessing(id)
    try {
      const iracingId = parseInt(editIracingId)
      if (isNaN(iracingId)) {
        setError('Please enter a valid team ID number')
        setProcessing(null)
        return
      }
      await updateTeam(id, iracingId, editAlias.trim() || null)
      setEditingId(null)
      await fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update team')
    } finally {
      setProcessing(null)
    }
  }

  async function handleDeleteTeam(id: string) {
    if (!confirm('Are you sure you want to delete this team?')) return
    setError(null)
    setProcessing(id)
    try {
      await deleteTeam(id)
      await fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team')
    } finally {
      setProcessing(null)
    }
  }

  const startEditing = (team: Team) => {
    setEditingId(team.id)
    setEditIracingId(Math.abs(team.iracingTeamId).toString())
    setEditAlias(team.alias || '')
    setError(null)
  }

  async function handleInspectTeam(team: Team) {
    setLoadingMembers(true)
    setError(null)
    try {
      const data = await getTeamMembers(team.id)
      setInspectingTeam(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team members')
    } finally {
      setLoadingMembers(false)
    }
  }

  async function handleSyncTeam(teamId: string) {
    setProcessing(teamId)
    setError(null)
    try {
      await syncTeamMembers(teamId)
      await fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync team members')
    } finally {
      setProcessing(null)
    }
  }

  function closeInspectModal() {
    setInspectingTeam(null)
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.addForm}>
        <input
          type="number"
          value={newTeamIracingId}
          onChange={(e) => setNewTeamIracingId(e.target.value)}
          placeholder="Enter iRacing Team ID"
          className={styles.input}
          disabled={processing === 'adding'}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
        />
        <button
          onClick={handleAddTeam}
          disabled={!newTeamIracingId.trim() || processing === 'adding'}
          className={styles.addButton}
        >
          {processing === 'adding' ? (
            <Loader2 className={styles.spin} size={18} />
          ) : (
            <Plus size={18} />
          )}
          Add Team
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.teamList}>
        {loading ? (
          <div className={styles.loading}>
            <Loader2 className={styles.spin} size={24} />
            <span>Loading teams...</span>
          </div>
        ) : teams.length === 0 ? (
          <div className={styles.empty}>No teams created yet.</div>
        ) : (
          <div className={styles.grid}>
            {teams.map((team) => (
              <div key={team.id} className={styles.teamRow}>
                {editingId === team.id ? (
                  <>
                    <div className={styles.editFields}>
                      <input
                        type="number"
                        value={editIracingId}
                        onChange={(e) => setEditIracingId(e.target.value)}
                        className={styles.editInput}
                        placeholder="iRacing Team ID"
                        autoFocus
                        disabled={processing === team.id}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTeam(team.id)}
                      />
                      <input
                        type="text"
                        value={editAlias}
                        onChange={(e) => setEditAlias(e.target.value)}
                        className={styles.editInput}
                        placeholder="Alias (optional)"
                        disabled={processing === team.id}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTeam(team.id)}
                      />
                    </div>
                    <div className={styles.actions}>
                      <button
                        onClick={() => handleUpdateTeam(team.id)}
                        disabled={processing === team.id}
                        className={styles.saveBtn}
                        title="Save"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={processing === team.id}
                        className={styles.cancelBtn}
                        title="Cancel"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {(() => {
                      const isManualTeam = team.iracingTeamId < 0 && (team.memberCount ?? 0) === 0
                      return (
                        <>
                          <div className={styles.teamInfo}>
                            <div className={styles.teamHeader}>
                              <span className={styles.teamName}>{team.alias || team.name}</span>
                              {team.memberCount !== undefined && (
                                <span className={styles.memberCount}>
                                  <Users size={14} />
                                  {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <span className={styles.teamId}>
                              {isManualTeam
                                ? 'Manually added team'
                                : `iRacing ID: ${Math.abs(team.iracingTeamId)}`}
                            </span>
                            {team.alias && (
                              <span className={styles.teamId}>Official: {team.name}</span>
                            )}
                          </div>
                          <div className={styles.actions}>
                            {!isManualTeam && (
                              <button
                                onClick={() => handleSyncTeam(team.id)}
                                className={styles.syncBtn}
                                disabled={!!processing}
                                title="Sync members from iRacing"
                              >
                                {processing === team.id ? (
                                  <Loader2 className={styles.spin} size={16} />
                                ) : (
                                  <RefreshCw size={16} />
                                )}
                              </button>
                            )}
                            {!isManualTeam && (
                              <button
                                onClick={() => handleInspectTeam(team)}
                                className={styles.inspectBtn}
                                disabled={!!processing || loadingMembers}
                                title="View team members"
                              >
                                {loadingMembers ? (
                                  <Loader2 className={styles.spin} size={16} />
                                ) : (
                                  <Eye size={16} />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => startEditing(team)}
                              className={styles.editBtn}
                              disabled={!!processing}
                              title="Edit team"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(team.id)}
                              className={styles.deleteBtn}
                              disabled={!!processing}
                              title="Delete team"
                            >
                              {processing === team.id ? (
                                <Loader2 className={styles.spin} size={16} />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        </>
                      )
                    })()}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Members Modal */}
      {inspectingTeam && (
        <div className={styles.modalOverlay} onClick={closeInspectModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>{inspectingTeam.teamName}</h3>
                <p className={styles.modalSubtitle}>
                  {inspectingTeam.iracingTeamId < 0 && inspectingTeam.totalCount === 0
                    ? 'Manually added team'
                    : `iRacing ID: ${Math.abs(inspectingTeam.iracingTeamId)}`}{' '}
                  • {inspectingTeam.totalCount} member{inspectingTeam.totalCount !== 1 ? 's' : ''} •{' '}
                  {inspectingTeam.enrolledCount} enrolled in app
                </p>
              </div>
              <button onClick={closeInspectModal} className={styles.closeBtn}>
                <X size={24} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {inspectingTeam.members.length === 0 ? (
                <div className={styles.empty}>No members found</div>
              ) : (
                <div className={styles.memberList}>
                  {inspectingTeam.members.map((member) => (
                    <div
                      key={member.custId}
                      className={`${styles.memberRow} ${member.isEnrolled ? styles.enrolled : styles.notEnrolled}`}
                    >
                      <div className={styles.memberIcon}>
                        {member.isEnrolled ? (
                          <CheckCircle size={20} className={styles.enrolledIcon} />
                        ) : (
                          <XCircle size={20} className={styles.notEnrolledIcon} />
                        )}
                      </div>
                      <div className={styles.memberInfo}>
                        <div className={styles.memberNameRow}>
                          <span className={styles.memberName}>{member.displayName}</span>
                          {member.isEnrolled && (
                            <span className={styles.enrolledBadge}>Enrolled</span>
                          )}
                        </div>
                        <span className={styles.memberId}>iRacing ID: {member.custId}</span>
                        {member.isEnrolled && member.appName && (
                          <span className={styles.appInfo}>App: {member.appName}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
