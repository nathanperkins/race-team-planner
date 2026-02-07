'use client'

import { UserCog, Users } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import FormattedDate from './FormattedDate'
import styles from './RaceDetails.module.css'
import DropRegistrationButton from './DropRegistrationButton'
import QuickRegistration from './QuickRegistration'
import EditableCarClass from './EditableCarClass'
import AdminDriverSearch from './AdminDriverSearch'
import TeamPickerTrigger from './TeamPickerTrigger'
import { saveRaceEdits } from '@/app/actions'
import { getAutoMaxDriversPerTeam, getLicenseColor, getRaceDurationMinutes } from '@/lib/utils'

export interface RaceWithRegistrations {
  id: string
  startTime: Date
  endTime: Date
  maxDriversPerTeam: number | null
  teamAssignmentStrategy: 'BALANCED_IRATING'
  registrations: Array<{
    id: string
    carClass: {
      id: string
      name: string
      shortName: string
    }
    userId: string | null
    manualDriverId?: string | null
    manualDriver?: {
      id: string
      name: string
      irating: number
      image: string | null
    } | null
    teamId?: string | null
    team?: {
      id: string
      name: string
    } | null
    user?: {
      name: string | null
      image: string | null
      racerStats: Array<{
        category: string
        categoryId: number
        irating: number
        safetyRating: number
        groupName: string
      }>
    } | null
  }>
}

export type ExtendedRegistration = RaceWithRegistrations['registrations'][0] & {
  raceId: string
  raceStartTime: Date
}

interface Driver {
  id: string
  name: string | null
  image: string | null
}

interface Props {
  race: RaceWithRegistrations
  userId: string
  isAdmin?: boolean
  carClasses: { id: string; name: string; shortName: string }[]
  teams: Array<{ id: string; name: string }>
  allDrivers?: Driver[]
  dateFormat?: Intl.DateTimeFormatOptions
}

function MaxDriversPerTeamInput({
  textValue,
  strategy,
  onTextChange,
  onStrategyChange,
  onRebalance,
  disabled = false,
  hideRebalance = false,
}: {
  textValue: string
  strategy: 'BALANCED_IRATING'
  onTextChange: (value: string) => void
  onStrategyChange: (value: 'BALANCED_IRATING') => void
  onRebalance: () => void
  disabled?: boolean
  hideRebalance?: boolean
}) {
  return (
    <div className={styles.maxDriversField} suppressHydrationWarning>
      <label className={styles.maxDriversLabel}>
        Max/team
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          className={styles.maxDriversInput}
          value={textValue}
          placeholder="-"
          onChange={(event) => onTextChange(event.target.value)}
          disabled={disabled}
        />
      </label>
      <label className={styles.maxDriversLabel}>
        Group by
        <select
          className={styles.strategySelect}
          value={strategy}
          onChange={(event) => onStrategyChange(event.target.value as 'BALANCED_IRATING')}
          disabled={disabled}
        >
          <option value="BALANCED_IRATING">Avg iRating</option>
        </select>
      </label>
      {!hideRebalance && (
        <button
          type="button"
          className={styles.rebalanceButton}
          onClick={onRebalance}
          disabled={disabled}
        >
          Rebalance
        </button>
      )}
    </div>
  )
}

export default function RaceDetails({
  race,
  userId,
  isAdmin = false,
  carClasses,
  teams,
  allDrivers = [],
  dateFormat,
}: Props) {
  const [isSaving, startSaveTransition] = useTransition()
  const now = new Date()
  const isRaceCompleted = now > new Date(race.endTime)
  const isRaceLive = now >= new Date(race.startTime) && now <= new Date(race.endTime)

  const autoMaxDrivers =
    race.maxDriversPerTeam ??
    getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))
  const [pendingMaxDrivers, setPendingMaxDrivers] = useState<number | null>(autoMaxDrivers)
  const [pendingMaxDriversText, setPendingMaxDriversText] = useState(
    autoMaxDrivers ? String(autoMaxDrivers) : ''
  )
  const [pendingStrategy, setPendingStrategy] = useState<'BALANCED_IRATING'>(
    race.teamAssignmentStrategy
  )
  const [pendingRegistrations, setPendingRegistrations] = useState(race.registrations)
  const [applyRebalance, setApplyRebalance] = useState(false)

  const lastRaceIdRef = useRef<string | null>(null)
  const lastCountRef = useRef<number>(race.registrations.length)

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    teams.forEach((team) => map.set(team.id, team.name))
    return map
  }, [teams])

  const isUserRegistered = pendingRegistrations.some((reg) => reg.userId === userId)
  const registeredUserIds = pendingRegistrations
    .map((reg) => reg.userId || reg.manualDriverId)
    .filter((id): id is string => !!id)

  // Get the last driver's car class for default
  const lastDriverCarClass =
    pendingRegistrations.length > 0
      ? pendingRegistrations[pendingRegistrations.length - 1].carClass.id
      : carClasses[0]?.id || ''

  const getPreferredStats = useCallback((reg: RaceWithRegistrations['registrations'][0]) => {
    const stats = reg.user?.racerStats ?? []
    return (
      stats.find((s) => s.categoryId === 5 || s.category?.toLowerCase() === 'sports car') ||
      stats[0]
    )
  }, [])

  const getRegistrationRating = useCallback(
    (reg: RaceWithRegistrations['registrations'][0]) => {
      const preferred = getPreferredStats(reg)
      return preferred?.irating ?? reg.manualDriver?.irating ?? 0
    },
    [getPreferredStats]
  )

  const recomputeAssignments = useCallback(
    (
      registrations: typeof pendingRegistrations,
      maxDrivers: number | null,
      strategy: 'BALANCED_IRATING'
    ) => {
      if (!maxDrivers || maxDrivers < 1) return registrations

      const teamOrder = teams.map((team) => team.id)
      const usedTeamIds = new Set<string>()
      const classOrder: string[] = []

      registrations.forEach((reg) => {
        if (!classOrder.includes(reg.carClass.id)) {
          classOrder.push(reg.carClass.id)
        }
      })

      const classToTeamIds = new Map<string, string[]>()
      for (const classId of classOrder) {
        const classRegs = registrations.filter((reg) => reg.carClass.id === classId)
        const requiredTeams = Math.ceil(classRegs.length / maxDrivers)
        const availableTeams = teamOrder.filter((id) => !usedTeamIds.has(id))
        const selectedTeams = availableTeams.slice(0, requiredTeams)
        selectedTeams.forEach((id) => usedTeamIds.add(id))
        classToTeamIds.set(classId, selectedTeams)
      }

      const updated = registrations.map((reg) => ({ ...reg }))

      if (strategy === 'BALANCED_IRATING') {
        for (const classId of classOrder) {
          const teamIds = classToTeamIds.get(classId) || []
          if (teamIds.length === 0) continue

          const classRegs = updated.filter((reg) => reg.carClass.id === classId)
          const rated = classRegs.map((reg) => {
            const preferred = getPreferredStats(reg)
            return { reg, rating: preferred?.irating ?? reg.manualDriver?.irating ?? 0 }
          })
          rated.sort((a, b) => b.rating - a.rating)

          const buckets = teamIds.map((id) => ({
            id,
            total: 0,
            count: 0,
            regs: [] as typeof rated,
          }))
          for (const entry of rated) {
            const candidates = buckets.filter((b) => b.count < maxDrivers)
            const available = candidates.length > 0 ? candidates : buckets
            let target = available[0]
            for (const bucket of available) {
              if (bucket.total < target.total) target = bucket
            }
            target.total += entry.rating
            target.count += 1
            target.regs.push(entry)
          }

          const computeGap = () => {
            const avgs = buckets.map((b) => (b.count === 0 ? 0 : b.total / b.count))
            return Math.max(...avgs) - Math.min(...avgs)
          }

          let improved = true
          let guard = 0
          while (improved && guard < 50) {
            guard += 1
            improved = false
            let bestSwap: {
              a: number
              b: number
              i: number
              j: number
              delta: number
            } | null = null
            const currentGap = computeGap()

            for (let a = 0; a < buckets.length; a += 1) {
              for (let b = a + 1; b < buckets.length; b += 1) {
                const teamA = buckets[a]
                const teamB = buckets[b]
                for (let i = 0; i < teamA.regs.length; i += 1) {
                  for (let j = 0; j < teamB.regs.length; j += 1) {
                    const ra = teamA.regs[i].rating
                    const rb = teamB.regs[j].rating
                    const nextTotalA = teamA.total - ra + rb
                    const nextTotalB = teamB.total - rb + ra
                    const avgA = teamA.count === 0 ? 0 : nextTotalA / teamA.count
                    const avgB = teamB.count === 0 ? 0 : nextTotalB / teamB.count
                    const avgs = buckets.map((bucket, idx) => {
                      if (idx === a) return avgA
                      if (idx === b) return avgB
                      return bucket.count === 0 ? 0 : bucket.total / bucket.count
                    })
                    const gap = Math.max(...avgs) - Math.min(...avgs)
                    const delta = currentGap - gap
                    if (delta > 1 && (!bestSwap || delta > bestSwap.delta)) {
                      bestSwap = { a, b, i, j, delta }
                    }
                  }
                }
              }
            }

            if (bestSwap) {
              const teamA = buckets[bestSwap.a]
              const teamB = buckets[bestSwap.b]
              const entryA = teamA.regs[bestSwap.i]
              const entryB = teamB.regs[bestSwap.j]
              teamA.regs[bestSwap.i] = entryB
              teamB.regs[bestSwap.j] = entryA
              teamA.total = teamA.total - entryA.rating + entryB.rating
              teamB.total = teamB.total - entryB.rating + entryA.rating
              improved = true
            }
          }

          for (const bucket of buckets) {
            for (const { reg } of bucket.regs) {
              reg.teamId = bucket.id
              reg.team = { id: bucket.id, name: teamNameById.get(bucket.id) || 'Team' }
            }
          }
        }
      }

      return updated
    },
    [getPreferredStats, teamNameById, teams]
  )

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const nextAuto =
      race.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))

    if (lastRaceIdRef.current !== race.id) {
      lastRaceIdRef.current = race.id
      lastCountRef.current = race.registrations.length
      const nextStrategy = race.teamAssignmentStrategy
      setPendingMaxDrivers(nextAuto)
      setPendingMaxDriversText(nextAuto ? String(nextAuto) : '')
      setPendingStrategy(nextStrategy)
      setPendingRegistrations(recomputeAssignments(race.registrations, nextAuto, nextStrategy))
      setApplyRebalance(false)
      return
    }

    if (race.registrations.length !== lastCountRef.current) {
      lastCountRef.current = race.registrations.length
      const effectiveMax = pendingMaxDrivers ?? nextAuto
      setPendingRegistrations(
        recomputeAssignments(race.registrations, effectiveMax, pendingStrategy)
      )
    }
  }, [pendingMaxDrivers, pendingStrategy, race, recomputeAssignments])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleMaxDriversTextChange = useCallback((value: string) => {
    setPendingMaxDriversText(value)
    const trimmed = value.trim()
    if (!trimmed) {
      setPendingMaxDrivers(null)
      return
    }
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed) || parsed < 1) {
      setPendingMaxDrivers(null)
      return
    }
    setPendingMaxDrivers(Math.floor(parsed))
  }, [])

  const handleCarClassChange = (registrationId: string, newClassId: string) => {
    const carClass = carClasses.find((cc) => cc.id === newClassId)
    if (!carClass) return
    const updated = pendingRegistrations.map((reg) =>
      reg.id === registrationId
        ? {
            ...reg,
            carClass: {
              id: carClass.id,
              name: carClass.name,
              shortName: carClass.shortName,
            },
          }
        : reg
    )
    const rebalanced = recomputeAssignments(updated, pendingMaxDrivers, pendingStrategy)
    setPendingRegistrations(rebalanced)
  }

  const handleRebalance = () => {
    setPendingRegistrations(
      recomputeAssignments(pendingRegistrations, pendingMaxDrivers, pendingStrategy)
    )
    setApplyRebalance(true)
  }

  const handleSave = () => {
    const payload = pendingRegistrations
      .filter((reg) => isAdmin || reg.userId === userId)
      .map((reg) => ({
        id: reg.id,
        carClassId: reg.carClass.id,
        teamId: reg.teamId ?? reg.team?.id ?? null,
      }))

    const formData = new FormData()
    formData.set('raceId', race.id)
    formData.set('maxDriversPerTeam', pendingMaxDrivers ? String(pendingMaxDrivers) : '')
    formData.set('teamAssignmentStrategy', pendingStrategy)
    formData.set('applyRebalance', applyRebalance ? 'true' : 'false')
    formData.set('registrationUpdates', JSON.stringify(payload))

    startSaveTransition(() => {
      void saveRaceEdits(formData)
    })
  }

  return (
    <div className={styles.raceCard}>
      <div className={styles.raceHeader}>
        <h4 className={styles.raceTitle}>
          Timeslot:{' '}
          {new Intl.DateTimeFormat('en-US', {
            month: 'numeric',
            day: 'numeric',
          }).format(race.startTime)}{' '}
          •{' '}
          {new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          }).format(race.startTime)}
        </h4>
        {isRaceLive && (
          <span className={styles.liveBadge}>
            <span className={styles.liveDot} />
            LIVE
          </span>
        )}
        {isRaceCompleted && <span className={styles.completedBadge}>Completed</span>}

        {!isRaceCompleted && (
          <div className={styles.headerActions}>
            <MaxDriversPerTeamInput
              textValue={pendingMaxDriversText}
              strategy={pendingStrategy}
              onTextChange={handleMaxDriversTextChange}
              onStrategyChange={setPendingStrategy}
              onRebalance={handleRebalance}
              disabled={!isAdmin}
              hideRebalance
            />
          </div>
        )}
      </div>

      {pendingRegistrations.length === 0 ? (
        <p className="text-sm text-gray-500 mt-2">No drivers registered for this race.</p>
      ) : (
        <div className={styles.driverList}>
          {(() => {
            // Group registrations by team
            const grouped = pendingRegistrations.reduce(
              (acc, reg) => {
                const teamId = reg.teamId ?? reg.team?.id ?? null
                const teamName = teamId ? teamNameById.get(teamId) || 'Team' : 'Unassigned'
                if (!acc[teamName]) acc[teamName] = []
                acc[teamName].push(reg)
                return acc
              },
              {} as Record<string, typeof pendingRegistrations>
            )

            // Sort teams: Unassigned last, others alphabetical
            const sortedTeams = Object.keys(grouped).sort((a, b) => {
              if (a === 'Unassigned') return 1
              if (b === 'Unassigned') return -1
              return a.localeCompare(b)
            })

            return (
              <div className={styles.teamGrid}>
                {sortedTeams.map((teamName) => {
                  const teamRegistrations = grouped[teamName]
                  const ratings = teamRegistrations.map((reg) => getRegistrationRating(reg))
                  const avgRating =
                    ratings.length > 0
                      ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
                      : 0

                  return (
                    <div key={teamName} className={styles.teamGroup}>
                      <div className={styles.teamGroupHeader}>
                        <Users size={14} />
                        <span>{teamName}</span>
                        <span className={styles.teamCount}>({teamRegistrations.length})</span>
                        <span className={styles.teamSof}>{avgRating} SOF</span>
                      </div>
                      {teamRegistrations.map((reg) => {
                        const driverName = reg.user?.name || reg.manualDriver?.name || 'Driver'
                        const driverImage = reg.user?.image || reg.manualDriver?.image
                        const preferredStats = getPreferredStats(reg)
                        const manualRating = reg.manualDriver?.irating
                        const licenseColor = preferredStats
                          ? getLicenseColor(preferredStats.groupName)
                          : manualRating !== undefined
                            ? '#94a3b8'
                            : null
                        const licenseLabel = preferredStats
                          ? preferredStats.groupName.replace('Class ', '').substring(0, 1)
                          : manualRating !== undefined
                            ? 'M'
                            : ''
                        const safetyRating = preferredStats
                          ? preferredStats.safetyRating.toFixed(2)
                          : manualRating !== undefined
                            ? '--'
                            : ''
                        const irating = preferredStats?.irating ?? manualRating
                        const lightBg = licenseColor ? `${licenseColor}26` : '#ffffff26'

                        return (
                          <div key={reg.id} className={styles.driverRow}>
                            <div className={styles.driverInfo}>
                              {driverImage && (
                                <Image
                                  src={driverImage}
                                  alt={driverName}
                                  width={32}
                                  height={32}
                                  className={styles.avatar}
                                />
                              )}
                              <div className={styles.driverMeta}>
                                <div className={styles.nameWrapper}>
                                  <p className={styles.driverName}>{driverName}</p>
                                  {reg.manualDriver && (
                                    <div className={styles.manualIcon} title="Manual Entry">
                                      <UserCog size={14} />
                                    </div>
                                  )}
                                </div>
                                <div className={styles.driverPills}>
                                  {irating !== undefined && (
                                    <span
                                      className={styles.statsBadge}
                                      style={{
                                        borderColor: licenseColor || undefined,
                                        backgroundColor: lightBg,
                                        color: licenseColor || undefined,
                                      }}
                                    >
                                      {licenseLabel} {safetyRating} {irating}
                                    </span>
                                  )}
                                  <EditableCarClass
                                    registrationId={reg.id}
                                    currentCarClassId={reg.carClass.id}
                                    currentCarClassShortName={
                                      reg.carClass.shortName || reg.carClass.name
                                    }
                                    carClasses={carClasses}
                                    deferSubmit
                                    onChange={(classId) => handleCarClassChange(reg.id, classId)}
                                    readOnly={
                                      (!isAdmin && reg.userId !== userId) || isRaceCompleted
                                    }
                                    showLabel={false}
                                    variant="pill"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className={styles.driverTimeslot}>
                              {(reg.userId === userId || isAdmin) && !isRaceCompleted && (
                                <div className={styles.actionRow}>
                                  <DropRegistrationButton registrationId={reg.id} />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {isAdmin && !isRaceCompleted && (
        <div className={styles.registrationControls}>
          <div className={styles.adminSearchWrapper}>
            <AdminDriverSearch
              raceId={race.id}
              registeredUserIds={registeredUserIds}
              allDrivers={allDrivers}
              defaultCarClassId={lastDriverCarClass}
            />
          </div>
          {!isUserRegistered && (
            <div className={styles.quickRegWrapper}>
              <QuickRegistration raceId={race.id} carClasses={carClasses} compact />
            </div>
          )}
          <div className={styles.teamPickerWrapper}>
            <TeamPickerTrigger
              raceId={race.id}
              raceStartTime={race.startTime}
              registrations={pendingRegistrations}
              carClasses={carClasses}
              teams={teams}
            />
          </div>
        </div>
      )}

      {!isUserRegistered && !isRaceCompleted && !isAdmin && (
        <QuickRegistration raceId={race.id} carClasses={carClasses} />
      )}

      {isAdmin && !isRaceCompleted && (
        <div className={styles.saveRow}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}
