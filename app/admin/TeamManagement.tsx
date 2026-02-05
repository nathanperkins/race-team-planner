'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'
import { getTeams, createTeam, updateTeam, deleteTeam } from './teams/actions'
import styles from './TeamManagement.module.css'

interface Team {
  id: string
  name: string
}

export default function TeamManagement() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [newTeamName, setNewTeamName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)

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
    if (!newTeamName.trim()) return
    setError(null)
    setProcessing('adding')
    try {
      await createTeam(newTeamName)
      setNewTeamName('')
      await fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add team')
    } finally {
      setProcessing(null)
    }
  }

  async function handleUpdateTeam(id: string) {
    if (!editName.trim()) return
    setError(null)
    setProcessing(id)
    try {
      await updateTeam(id, editName)
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
    setEditName(team.name)
    setError(null)
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.addForm}>
        <input
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New team name (e.g. Cobalt)"
          className={styles.input}
          disabled={processing === 'adding'}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
        />
        <button
          onClick={handleAddTeam}
          disabled={!newTeamName.trim() || processing === 'adding'}
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
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={styles.editInput}
                      autoFocus
                      disabled={processing === team.id}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateTeam(team.id)}
                    />
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
                    <span className={styles.teamName}>{team.name}</span>
                    <div className={styles.actions}>
                      <button
                        onClick={() => startEditing(team)}
                        className={styles.editBtn}
                        disabled={!!processing}
                        title="Edit name"
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
