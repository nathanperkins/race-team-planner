'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import {
  X,
  Search,
  Shuffle,
  TrendingUp,
  Trash2,
  Plus,
  Save,
  Loader2,
  RefreshCw,
  Users,
  Check,
  Lock,
  Unlock,
  AlertTriangle,
  UserCog,
} from 'lucide-react'
import { batchAssignTeams } from '@/app/admin/teams/actions'
import FormattedDate from './FormattedDate'
import styles from './TeamPickerModal.module.css'
import { RaceWithRegistrations, ExtendedRegistration } from './RaceDetails'

interface Driver {
  id: string
  name: string
  irating: number
  image?: string | null
  isManual?: boolean
  category?:
    | 'Unassigned'
    | 'Assigned'
    | 'Different Class'
    | 'Different Time'
    | 'Different Time and Class'
  originalClass?: string
  originalTime?: Date
  userId?: string
  originalTeam?: string
}

interface TeamComposition {
  teamId: string
  teamName: string
  drivers: Driver[]
  locked?: boolean
  isGeneric?: boolean
}

interface Props {
  raceStartTime: Date
  className: string
  registrations: RaceWithRegistrations['registrations']
  teams: { id: string; name: string }[]
  onClose: () => void
  eventRegistrations?: ExtendedRegistration[]
  raceId: string
  carClassId: string
}

export default function TeamPickerModal({
  raceStartTime,
  className: carClassName,
  registrations: initialRegistrations,
  teams,
  onClose,
  eventRegistrations,
  raceId,
  carClassId,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [manualDrivers, setManualDrivers] = useState<Driver[]>([])
  const [newManualName, setNewManualName] = useState('')
  const [newManualIR, setNewManualIR] = useState('')
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<TeamComposition[]>([])
  const [saving, setSaving] = useState(false)

  // Map registrations to Driver objects
  const rosterDrivers = useMemo(() => {
    // If we have event registrations (full list), use them. Otherwise fallback to just this race.
    const source =
      eventRegistrations ||
      initialRegistrations.map((r) => ({ ...r, raceId: raceId || '', raceStartTime }))

    const rawDrivers = source.map((reg) => {
      const stats =
        reg.user?.racerStats?.find((s) => s.categoryId === 5) || reg.user?.racerStats?.[0]
      const name = reg.user?.name || reg.manualDriver?.name || 'Unknown'
      const irating = stats?.irating || reg.manualDriver?.irating || 0
      const image =
        reg.user?.image ||
        reg.manualDriver?.image ||
        `https://api.dicebear.com/9.x/avataaars/png?seed=${name}`

      let category: Driver['category'] = 'Unassigned'

      if (reg.raceId !== raceId && carClassId && reg.carClass.id !== carClassId) {
        category = 'Different Time and Class'
      } else if (reg.raceId !== raceId) {
        category = 'Different Time'
      } else if (carClassId && reg.carClass.id !== carClassId) {
        category = 'Different Class'
      } else if (reg.team) {
        category = 'Assigned'
      } else {
        category = 'Unassigned'
      }

      return {
        id: reg.id, // Registration ID
        name,
        irating,
        image,
        isManual: !reg.userId,
        category,
        originalClass: reg.carClass.name,
        originalTime: reg.raceStartTime,
        userId: reg.userId, // For deduplication
        originalTeam: reg.team?.name,
      } as Driver
    })

    // Deduplicate by userId, keeping higher priority category
    // Priority: Assigned > Unassigned > Different Class > Different Time > Different Time and Class
    // Actually Assigned/Unassigned are equal top priority (current context)
    const priorityMap: Record<string, number> = {
      Assigned: 0,
      Unassigned: 0,
      'Different Class': 1,
      'Different Time': 2,
      'Different Time and Class': 3,
    }

    const uniqueDrivers = new Map<string, Driver>()

    rawDrivers.forEach((d) => {
      // If no userId, can't dedup (shouldn't happen for real users), just add
      if (!d.userId) {
        uniqueDrivers.set(d.id, d)
        return
      }

      if (!uniqueDrivers.has(d.userId)) {
        uniqueDrivers.set(d.userId, d)
      } else {
        const current = uniqueDrivers.get(d.userId)!
        const currentPriority = priorityMap[current.category || 'Unassigned']
        const newPriority = priorityMap[d.category || 'Unassigned']

        if (newPriority < currentPriority) {
          uniqueDrivers.set(d.userId, d)
        }
      }
    })

    return Array.from(uniqueDrivers.values())
  }, [initialRegistrations, eventRegistrations, raceId, carClassId, raceStartTime])

  // Initialize selection and load existing teams
  useEffect(() => {
    // Select all drivers by default?
    // Maybe only select 'Unassigned' and 'Assigned' by default?
    // User requested "grouping", didn't specify default selection change.
    // But usually you wouldn't balance across different times.
    // Let's stick safe and select Unassigned + Assigned + Manual.
    // Wait, `rosterDrivers` includes different time/class.
    // If I balance, I probably don't want "Different Time" people unless checking them.
    // So let's default select only Unassigned/Assigned (Current Class, Current Time).
    const validIds = new Set(
      rosterDrivers
        .filter((d) => d.category === 'Unassigned' || d.category === 'Assigned')
        .map((d) => d.id)
    )
    setSelectedDriverIds(validIds)

    // Group existing assignments into locked teams
    const existingTeamsMap = new Map<string, TeamComposition>()

    initialRegistrations.forEach((reg) => {
      if (reg.team?.id) {
        if (!existingTeamsMap.has(reg.team.id)) {
          existingTeamsMap.set(reg.team.id, {
            teamId: reg.team.id,
            teamName: reg.team.name,
            drivers: [],
            locked: true,
            isGeneric: false,
          })
        }

        // Find the driver object from rosterDrivers to ensure consistency
        const driver = rosterDrivers.find((d) => d.id === reg.id)
        if (driver) {
          existingTeamsMap.get(reg.team.id)!.drivers.push(driver)
        }
      }
    })

    if (existingTeamsMap.size > 0) {
      setResults(Array.from(existingTeamsMap.values()))
    }
  }, [rosterDrivers, initialRegistrations])

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
      irating: parseInt(newManualIR) || 1350,
      image: `https://api.dicebear.com/9.x/avataaars/png?seed=${newManualName.trim()}`,
      isManual: true,
    }
    setManualDrivers([...manualDrivers, newDriver])
    setSelectedDriverIds((prev) => new Set([...Array.from(prev), id]))
    setNewManualName('')
    setNewManualIR('')
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
    // Only clear generic/unlocked teams? Or all?
    // Usually "Clear Results" implies resetting to initial state.
    // Existing teams were loaded from Props.
    // Let's reset to just the locked teams?
    // For now, let's just clear unlocked ones.
    setResults((prev) => prev.filter((r) => r.locked))
  }

  const handleAddTeam = () => {
    const nextNum = results.length + 1
    const newTeam: TeamComposition = {
      teamId: `GENERIC-${Date.now()}`,
      teamName: `Team ${nextNum}`,
      drivers: [],
      locked: false,
      isGeneric: true,
    }
    setResults((prev) => [...prev, newTeam])
  }

  const handleDeleteTeam = (teamId: string) => {
    setResults((prev) => prev.filter((t) => t.teamId !== teamId))
  }

  const calculateBalances = (strategy: 'balanced' | 'random' | 'seeded') => {
    // 1. Identify Target Teams (Open/Unlocked)
    const openTeams = results.filter((r) => !r.locked)

    if (openTeams.length === 0) {
      alert('No open teams available. Please add a team first or unlock an existing one.')
      return
    }

    // 2. Identify Assignable Drivers
    // Pool includes:
    // a) Drivers currently in open teams (since we are re-balancing them)
    // b) New unassigned drivers who are selected
    // Effectively: All selected drivers MINUS drivers in locked teams
    const lockedDriverIds = new Set(
      results.filter((r) => r.locked).flatMap((r) => r.drivers.map((d) => d.id))
    )

    const pool = allAvailableDrivers.filter(
      (d) => selectedDriverIds.has(d.id) && !lockedDriverIds.has(d.id)
    )

    if (pool.length === 0) {
      alert('No available drivers to balance (check selection or unlock teams).')
      return
    }

    // Clear open teams
    const newResults = results.map((r) => {
      if (!r.locked) {
        return { ...r, drivers: [] }
      }
      return r
    })

    const targets = newResults.filter((r) => !r.locked)
    const targetCount = targets.length

    if (strategy === 'balanced') {
      // Sort by iRating descending
      pool.sort((a, b) => b.irating - a.irating)

      // Snake distribution
      pool.forEach((driver, index) => {
        const cycle = Math.floor(index / targetCount)
        const isReversed = cycle % 2 !== 0
        const teamIndex = isReversed ? targetCount - 1 - (index % targetCount) : index % targetCount
        targets[teamIndex].drivers.push(driver)
      })
    } else if (strategy === 'random') {
      // Shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      pool.forEach((driver, index) => {
        targets[index % targetCount].drivers.push(driver)
      })
    } else if (strategy === 'seeded') {
      pool.sort((a, b) => b.irating - a.irating)
      pool.forEach((driver, index) => {
        targets[index % targetCount].drivers.push(driver)
      })
    }

    setResults(newResults)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (results.some((r) => r.isGeneric)) {
        alert('Please assign all teams to a real team name before submitting.')
        return
      }

      const assignments = results.flatMap((comp) =>
        comp.drivers.map((d) => {
          if (d.isManual && d.id.startsWith('M-')) {
            return {
              manualName: d.name,
              manualIR: d.irating,
              teamId: comp.teamId,
            }
          }
          return {
            registrationId: d.id,
            teamId: comp.teamId,
          }
        })
      )

      await batchAssignTeams(assignments, raceId, carClassId)
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

  const toggleTeamLock = (teamId: string) => {
    setResults((prev) =>
      prev.map((comp) => (comp.teamId === teamId ? { ...comp, locked: !comp.locked } : comp))
    )
  }

  const assignRealTeam = (tempId: string, realTeamId: string) => {
    const realTeam = teams.find((t) => t.id === realTeamId)
    if (!realTeam) return

    setResults((prev) =>
      prev.map((comp) =>
        comp.teamId === tempId
          ? { ...comp, teamId: realTeam.id, teamName: realTeam.name, isGeneric: false }
          : comp
      )
    )
  }

  const getValidationState = () => {
    const errors: string[] = []

    // Check for unassigned selected drivers
    const assignedIds = new Set(results.flatMap((r) => r.drivers.map((d) => d.id)))
    const unassignedCount = Array.from(selectedDriverIds).filter(
      (id) => !assignedIds.has(id)
    ).length

    if (unassignedCount > 0) {
      errors.push(`${unassignedCount} selected drivers are not assigned to a team`)
    }

    // Check for generic teams
    if (results.some((r) => r.isGeneric)) {
      errors.push('All teams must be assigned to a real team name')
    }

    // Check for empty teams
    // (Optional: user didn't strictly say empty teams are forbidden, but usually bad practice)
    if (results.some((r) => r.drivers.length === 0)) {
      errors.push('Some teams are empty')
    }

    // Check for Class/Team conflicts
    // Teams cannot run in multiple classes in the same race.
    if (eventRegistrations && raceId && carClassId) {
      const realTeamsInResults = results.filter((r) => !r.isGeneric)

      realTeamsInResults.forEach((team) => {
        const conflict = eventRegistrations.find(
          (r) =>
            r.team?.id === team.teamId &&
            r.raceId === raceId &&
            r.carClass.id !== carClassId &&
            !results.some((res) => res.drivers.some((d) => d.id === r.id)) // Driver is not being moved/updated in this session
        )

        if (conflict) {
          errors.push(
            `Team '${team.teamName}' is already fielding a '${conflict.carClass.name}' car. Teams cannot run multiple classes in one race.`
          )
        }
      })
    }

    return errors
  }

  const validationErrors = getValidationState()
  const hasErrors = validationErrors.length > 0

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Team Balancer</h2>
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

          <div className={styles.teamCount}>
            <button onClick={handleAddTeam} className={styles.secondaryButton}>
              <Plus size={16} />
              Add Team
            </button>
          </div>

          <div className={styles.buttonGroup}>
            <button onClick={() => calculateBalances('balanced')} className={styles.actionButton}>
              <TrendingUp size={16} />
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
                    placeholder="iR (default 1350)"
                    value={newManualIR}
                    onChange={(e) => setNewManualIR(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <button onClick={handleAddManual} className={styles.addButton}>
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>

            <div className={styles.driverListSection}>
              <h3 className={styles.sectionTitle}>
                Driver Picker ({selectedDriverIds.size}/{allAvailableDrivers.length})
              </h3>
              <div className={styles.driverList}>
                {/* Grouped Rendering */}
                {[
                  'Unassigned',
                  'Assigned',
                  'Different Class',
                  'Different Time',
                  'Different Time and Class',
                ].map((cat) => {
                  const driversInGroup = filteredDrivers.filter((d) => {
                    if (d.isManual) return cat === 'Unassigned' // Showing manual in unassigned? Or separate?
                    // Let's treat manual as unassigned for now or separate group?
                    // User didn't specify manual. Let's put manual in 'Unassigned' section for now.
                    // Actually, manual drivers don't have 'category' set in `rosterDrivers` logic.
                    // Let's check `d.category`.
                    if (!d.category && d.isManual) return cat === 'Unassigned'
                    return d.category === cat
                  })

                  if (driversInGroup.length === 0) return null

                  // Sort: selected drivers first, then alphabetical by name
                  const sortedDrivers = [...driversInGroup].sort((a, b) => {
                    const aSelected = selectedDriverIds.has(a.id) ? 0 : 1
                    const bSelected = selectedDriverIds.has(b.id) ? 0 : 1
                    if (aSelected !== bSelected) return aSelected - bSelected
                    return a.name.localeCompare(b.name)
                  })

                  // Mapping category specific titles
                  const titleMap: Record<string, string> = {
                    Unassigned: 'Unassigned (within class)',
                    Assigned: 'Assigned (within class)',
                    'Different Class': 'Different Class',
                    'Different Time': 'Different Time',
                    'Different Time and Class': 'Different Time & Class',
                  }

                  return (
                    <div key={cat} className={styles.driverGroupSection}>
                      <h4 className={styles.groupHeader}>{titleMap[cat]}</h4>
                      {sortedDrivers.map((d) => (
                        <div
                          key={d.id}
                          className={`${styles.driverCard} ${selectedDriverIds.has(d.id) ? styles.selected : ''}`}
                          onClick={() => toggleSelection(d.id)}
                        >
                          <div className={styles.driverInfo}>
                            <div className={styles.nameRow}>
                              <div className={styles.avatarWrapper}>
                                <Image
                                  src={d.image as string}
                                  alt={d.name}
                                  width={24}
                                  height={24}
                                  className={styles.avatar}
                                />
                              </div>
                              <div className={styles.nameAndManual}>
                                <div className={styles.nameWithCheck}>
                                  {selectedDriverIds.has(d.id) && (
                                    <Check size={14} className={styles.checkIcon} />
                                  )}
                                  <span className={styles.driverName}>{d.name}</span>
                                </div>
                                {d.isManual && (
                                  <span className={styles.manualBadge}>
                                    <UserCog size={10} style={{ marginRight: 3 }} />
                                    Manual
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className={styles.driverStats}>
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
                  )
                })}
              </div>
            </div>
          </div>

          <div className={styles.main}>
            {results.length > 0 ? (
              <div className={styles.resultsGrid}>
                {results.map((comp) => (
                  <div
                    key={comp.teamId}
                    className={`${styles.teamColumn} ${comp.locked ? styles.locked : ''}`}
                  >
                    <div className={styles.teamHeader}>
                      <div className={styles.teamMainInfo}>
                        {!comp.isGeneric && (
                          <button
                            onClick={() => toggleTeamLock(comp.teamId)}
                            className={`${styles.lockButton} ${comp.locked ? styles.isLocked : ''}`}
                            title={comp.locked ? 'Unlock Team' : 'Lock Team'}
                          >
                            {comp.locked ? <Lock size={14} /> : <Unlock size={14} />}
                          </button>
                        )}
                        <select
                          className={`${styles.teamNameSelect} ${comp.isGeneric ? styles.unassigned : ''}`}
                          value={comp.isGeneric ? '' : comp.teamId}
                          onChange={(e) => {
                            if (e.target.value) {
                              assignRealTeam(comp.teamId, e.target.value)
                            }
                          }}
                        >
                          <option value="" disabled>
                            Select Team...
                          </option>
                          {teams
                            .filter(
                              (t) => t.id === comp.teamId || !results.some((r) => r.teamId === t.id)
                            )
                            .map((t) => {
                              const conflictReg = eventRegistrations?.find(
                                (r) =>
                                  r.team?.id === t.id &&
                                  r.raceId === raceId &&
                                  r.carClass.id !== carClassId
                              )

                              if (conflictReg) {
                                return (
                                  <option
                                    key={t.id}
                                    value={t.id}
                                    disabled
                                    className={styles.disabledOption}
                                  >
                                    {t.name} (running {conflictReg.carClass.shortName})
                                  </option>
                                )
                              }

                              return (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              )
                            })}
                        </select>
                      </div>
                      <div className={styles.teamActions}>
                        <button
                          onClick={() => handleDeleteTeam(comp.teamId)}
                          className={styles.deleteTeamButton}
                          title="Delete Team"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className={styles.teamHeaderStats}>
                      <span className={styles.avgIR}>Avg iR: {getTeamAvgIR(comp.drivers)}</span>
                    </div>
                    <div className={styles.teamDrivers}>
                      {comp.drivers.map((d) => (
                        <div key={d.id} className={styles.memberCard}>
                          <div className={styles.memberName}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Image
                                src={d.image as string}
                                alt={d.name}
                                width={20}
                                height={20}
                                className={styles.avatar}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>{d.name}</span>
                                {d.isManual && (
                                  <div className={styles.manualIcon} title="Manual Entry">
                                    <UserCog size={14} />
                                  </div>
                                )}
                                {d.category && d.category.startsWith('Different') && (
                                  <div
                                    className={styles.warningIcon}
                                    data-tooltip={`Driver will be changed from:\n${
                                      d.category.includes('Class')
                                        ? `Class: ${d.originalClass}\n`
                                        : ''
                                    }${
                                      d.category.includes('Time') && d.originalTime
                                        ? `Time: ${d.originalTime.toLocaleString(undefined, {
                                            weekday: 'short',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                          })}\n`
                                        : ''
                                    }${
                                      d.originalTeam ? `⚠️ Will leave team: ${d.originalTeam}` : ''
                                    }`}
                                  >
                                    <AlertTriangle size={12} color="#f59e0b" />
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className={styles.memberIR}>{d.irating}</span>
                          </div>
                          {!comp.locked && (
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
                          )}
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
          <div
            className={styles.submitWrapper}
            data-tooltip={hasErrors ? validationErrors.join('\n') : undefined}
          >
            <button
              onClick={handleSave}
              className={`${styles.primaryButton} ${hasErrors ? styles.warningButton : ''}`}
              disabled={saving || hasErrors}
            >
              {saving ? (
                <Loader2 className={styles.spin} size={18} />
              ) : hasErrors ? (
                <AlertTriangle size={18} />
              ) : (
                <Save size={18} />
              )}
              {hasErrors ? 'Cannot Submit' : 'Submit Teams'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
