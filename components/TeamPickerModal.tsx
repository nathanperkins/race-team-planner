'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { X, Search, Shuffle, Trash2, Plus, Save, Loader2, RefreshCw, Users } from 'lucide-react'
import { batchAssignTeams } from '@/app/admin/teams/actions'
import FormattedDate from './FormattedDate'
import styles from './TeamPickerModal.module.css'
import { RaceWithRegistrations } from './RaceDetails'

interface Driver {
  id: string
  name: string
  irating: number
  license: string
  isManual?: boolean
}

interface TeamComposition {
  teamId: string
  teamName: string
  drivers: Driver[]
}

interface Props {
  raceStartTime: Date
  className: string
  registrations: RaceWithRegistrations['registrations']
  teams: { id: string; name: string }[]
  onClose: () => void
}

export default function TeamPickerModal({
  raceStartTime,
  className: carClassName,
  registrations: initialRegistrations,
  teams,
  onClose,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [maxDriversPerTeam, setMaxDriversPerTeam] = useState<number>(3)
  const [manualDrivers, setManualDrivers] = useState<Driver[]>([])
  const [newManualName, setNewManualName] = useState('')
  const [newManualIR, setNewManualIR] = useState('1')
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<TeamComposition[]>([])
  const [saving, setSaving] = useState(false)

  // Map registrations to Driver objects
  const rosterDrivers = useMemo(() => {
    return initialRegistrations.map((reg) => {
      const stats = reg.user.racerStats?.find((s) => s.categoryId === 5) || reg.user.racerStats?.[0]
      return {
        id: reg.id,
        name: reg.user.name || 'Unknown',
        irating: stats?.irating || 0,
        license: stats?.groupName || 'R',
        isManual: false,
      } as Driver
    })
  }, [initialRegistrations])

  // Initialize selection when roster is loaded
  useEffect(() => {
    setSelectedDriverIds(new Set(rosterDrivers.map((d) => d.id)))
  }, [rosterDrivers])

  const allAvailableDrivers = useMemo(
    () => [...rosterDrivers, ...manualDrivers],
    [rosterDrivers, manualDrivers]
  )

  const filteredDrivers = allAvailableDrivers.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleSelection = (id: string) => {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAddManual = () => {
    if (!newManualName.trim()) return
    const id = `M-${Math.random().toString(36).substr(2, 9)}`
    const newDriver = {
      id,
      name: newManualName.trim(),
      irating: parseInt(newManualIR) || 1,
      license: '',
      isManual: true,
    }
    setManualDrivers([...manualDrivers, newDriver])
    setSelectedDriverIds((prev) => new Set([...Array.from(prev), id]))
    setNewManualName('')
    setNewManualIR('1')
  }

  const removeManual = (id: string) => {
    setManualDrivers(manualDrivers.filter((d) => d.id !== id))
    setSelectedDriverIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleClearResults = () => {
    setResults([])
  }

  const calculateBalances = (strategy: 'balanced' | 'random' | 'seeded') => {
    const drivers = allAvailableDrivers.filter((d) => selectedDriverIds.has(d.id))
    if (drivers.length === 0) return

    const count = Math.min(teams.length, Math.max(1, Math.ceil(drivers.length / maxDriversPerTeam)))

    // Create empty compositions
    const compositions: TeamComposition[] = teams.slice(0, count).map((t) => ({
      teamId: t.id,
      teamName: t.name,
      drivers: [],
    }))

    if (compositions.length === 0) {
      alert('No teams available. Please create teams in the Admin panel first.')
      return
    }

    if (strategy === 'balanced') {
      // Sort by iRating descending
      drivers.sort((a, b) => b.irating - a.irating)

      // Snake distribution
      drivers.forEach((driver, index) => {
        const cycle = Math.floor(index / count)
        const isReversed = cycle % 2 !== 0
        const teamIndex = isReversed ? count - 1 - (index % count) : index % count

        // Final safety check
        if (compositions[teamIndex]) {
          compositions[teamIndex].drivers.push(driver)
        } else {
          compositions[index % count].drivers.push(driver)
        }
      })
    } else if (strategy === 'random') {
      // Shuffle
      for (let i = drivers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[drivers[i], drivers[j]] = [drivers[j], drivers[i]]
      }
      drivers.forEach((driver, index) => {
        compositions[index % count].drivers.push(driver)
      })
    } else if (strategy === 'seeded') {
      // ranked distribution: 1,2,3 into A,B,C then 4,5,6 into A,B,C
      drivers.sort((a, b) => b.irating - a.irating)
      drivers.forEach((driver, index) => {
        compositions[index % count].drivers.push(driver)
      })
    }

    setResults(compositions)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const assignments = results.flatMap((comp) =>
        comp.drivers
          .filter((d) => !d.isManual) // Can't assign manual drivers to DB registrations
          .map((d) => ({
            registrationId: d.id,
            teamId: comp.teamId,
          }))
      )

      await batchAssignTeams(assignments)
      onClose()
    } catch (err) {
      console.error(err)
      alert('Failed to save team assignments')
    } finally {
      setSaving(false)
    }
  }

  const getTeamAvgIR = (drivers: Driver[]) => {
    if (drivers.length === 0) return 0
    return Math.round(drivers.reduce((acc, d) => acc + d.irating, 0) / drivers.length)
  }

  const moveDriver = (driverId: string, toTeamId: string | 'pool') => {
    setResults((prev) => {
      const newResults = [...prev]
      let driverToMove: Driver | null = null

      // Find and remove driver from current team
      newResults.forEach((comp) => {
        const idx = comp.drivers.findIndex((d) => d.id === driverId)
        if (idx !== -1) {
          driverToMove = comp.drivers.splice(idx, 1)[0]
        }
      })

      // If moving to a team, add them
      if (driverToMove && toTeamId !== 'pool') {
        const target = newResults.find((c) => c.teamId === toTeamId)
        if (target) target.drivers.push(driverToMove)
      }

      return newResults
    })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>SRG Team Balancer</h2>
            <p className={styles.subtitle}>
              <FormattedDate
                date={raceStartTime}
                format={{ month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }}
              />{' '}
              • {carClassName} • {allAvailableDrivers.length} Drivers Loaded
            </p>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchWrapper}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search drivers (name or ID)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.statusBadge}>Selected: {selectedDriverIds.size}</div>

          <div className={styles.teamCount}>
            <span>Max Drivers:</span>
            <input
              type="number"
              min="1"
              value={maxDriversPerTeam}
              onChange={(e) => setMaxDriversPerTeam(parseInt(e.target.value) || 1)}
              className={styles.smallInput}
            />
          </div>

          <div className={styles.buttonGroup}>
            <button onClick={() => calculateBalances('balanced')} className={styles.actionButton}>
              Balance
            </button>
            <button
              onClick={() => calculateBalances('random')}
              className={styles.iconButton}
              title="Randomize"
            >
              <Shuffle size={14} />
              Randomize
            </button>
            <button
              onClick={() => calculateBalances('seeded')}
              className={styles.iconButton}
              title="iR Seeded"
            >
              <RefreshCw size={14} />
              iR Seeded
            </button>
            <button
              onClick={handleClearResults}
              className={styles.iconButton}
              title="Clear Results"
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>
        </div>

        <div className={styles.statusBar}>
          Loaded {allAvailableDrivers.length} drivers (roster + manual).
        </div>

        <div className={styles.content}>
          <div className={styles.sidebar}>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Add Manual Driver</h3>
              <div className={styles.manualEntry}>
                <input
                  type="text"
                  placeholder="Driver name (required)"
                  value={newManualName}
                  onChange={(e) => setNewManualName(e.target.value)}
                  className={styles.input}
                />
                <div className={styles.row}>
                  <input
                    type="number"
                    placeholder="iR (default 1)"
                    value={newManualIR}
                    onChange={(e) => setNewManualIR(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <button onClick={handleAddManual} className={styles.addButton}>
                  <Plus size={16} />
                  Add + Select
                </button>
              </div>
            </div>

            <div className={styles.driverListSection}>
              <h3 className={styles.sectionTitle}>Driver Picker ({filteredDrivers.length})</h3>
              <div className={styles.driverList}>
                {filteredDrivers.map((d) => (
                  <div
                    key={d.id}
                    className={`${styles.driverCard} ${selectedDriverIds.has(d.id) ? styles.selected : ''}`}
                    onClick={() => toggleSelection(d.id)}
                  >
                    <div className={styles.driverInfo}>
                      <span className={styles.driverName}>{d.name}</span>
                      {d.isManual && <span className={styles.manualBadge}>Manual Entry</span>}
                    </div>
                    <div className={styles.driverStats}>
                      {!d.isManual && <span className={styles.licenseBadge}>{d.license}</span>}
                      <span className={styles.irBadge}>{d.irating}</span>
                      {d.isManual && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeManual(d.id)
                          }}
                          className={styles.deleteDriver}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.main}>
            {results.length > 0 ? (
              <div className={styles.resultsGrid}>
                {results.map((comp) => (
                  <div key={comp.teamId} className={styles.teamColumn}>
                    <div className={styles.teamHeader}>
                      <span className={styles.teamTitle}>{comp.teamName}</span>
                      <span className={styles.avgIR}>Avg iR: {getTeamAvgIR(comp.drivers)}</span>
                    </div>
                    <div className={styles.teamDrivers}>
                      {comp.drivers.map((d) => (
                        <div key={d.id} className={styles.memberCard}>
                          <div className={styles.memberName}>
                            <span>{d.name}</span>
                            <span className={styles.memberIR}>{d.irating}</span>
                          </div>
                          <select
                            className={styles.moveSelect}
                            onChange={(e) => moveDriver(d.id, e.target.value)}
                            value={comp.teamId}
                          >
                            <option value={comp.teamId} disabled>
                              Move to...
                            </option>
                            <option value="pool">Remove</option>
                            {results.map((target) => (
                              <option
                                key={target.teamId}
                                value={target.teamId}
                                disabled={target.teamId === comp.teamId}
                              >
                                {target.teamName}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {comp.drivers.length === 0 && (
                        <div className={styles.emptyTeam}>No drivers</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyResults}>
                <Users size={48} />
                <h3>No results yet</h3>
                <p>
                  Configure options and click <strong>Balance</strong> to generate teams.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.secondaryButton}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={styles.primaryButton}
            disabled={saving || results.length === 0}
          >
            {saving ? <Loader2 className={styles.spin} size={18} /> : <Save size={18} />}
            Submit Teams
          </button>
        </div>
      </div>
    </div>
  )
}
