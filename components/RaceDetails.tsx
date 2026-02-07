'use client'

import { UserCog, Users, X } from 'lucide-react'
import Image from 'next/image'
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
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
  teamsAssigned?: boolean | null
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
  onDropdownToggle?: (open: boolean) => void
}

type LocalTeam = { id: string; name: string }

function MaxDriversPerTeamInput({
  textValue,
  strategy,
  onTextChange,
  onStep,
  onStrategyChange,
  onRebalance,
  disabled = false,
  hideRebalance = false,
}: {
  textValue: string
  strategy: 'BALANCED_IRATING'
  onTextChange: (value: string) => void
  onStep: (delta: number) => void
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
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => onStep(1)}
            disabled={disabled}
            aria-label="Increase max drivers per team"
          >
            ▲
          </button>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => onStep(-1)}
            disabled={disabled}
            aria-label="Decrease max drivers per team"
          >
            ▼
          </button>
        </div>
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
  onDropdownToggle,
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
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isDropConfirming, setIsDropConfirming] = useState(false)
  const [addDriverMessage, setAddDriverMessage] = useState('')
  const [extraTeams, setExtraTeams] = useState<LocalTeam[]>([])
  const [revealedTeamIds, setRevealedTeamIds] = useState<string[]>([])
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false)
  const [teamsAssigned, setTeamsAssigned] = useState(!!race.teamsAssigned)
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null)
  const lastDropdownState = useRef<boolean | null>(null)
  const extraTeamCounter = useRef(1)
  const teamOverridesRef = useRef<Map<string, { teamId: string | null; teamName?: string }>>(
    new Map()
  )

  const lastRaceIdRef = useRef<string | null>(null)
  const lastCountRef = useRef<number>(race.registrations.length)

  const teamList = useMemo(() => [...teams, ...extraTeams], [extraTeams, teams])
  const revealedTeamSet = useMemo(() => new Set(revealedTeamIds), [revealedTeamIds])

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    teamList.forEach((team) => map.set(team.id, team.name))
    return map
  }, [teamList])

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
      if (!maxDrivers || maxDrivers < 1) return registrations.map((reg) => ({ ...reg }))

      const teamOrder = teamList.map((team) => team.id)
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
    [getPreferredStats, teamList, teamNameById]
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
      setExtraTeams([])
      setRevealedTeamIds([])
      setTeamsAssigned(!!race.teamsAssigned)
      teamOverridesRef.current = new Map()
      extraTeamCounter.current = 1
      setPendingMaxDrivers(nextAuto)
      setPendingMaxDriversText(nextAuto ? String(nextAuto) : '')
      setPendingStrategy(nextStrategy)
      setPendingRegistrations(
        race.registrations.map((reg) => {
          const override = teamOverridesRef.current.get(reg.id)
          if (!override) return reg
          const teamId = override.teamId
          return {
            ...reg,
            teamId,
            team: teamId
              ? { id: teamId, name: override.teamName || reg.team?.name || 'Team' }
              : null,
          }
        })
      )
      return
    }

    if (race.registrations.length !== lastCountRef.current) {
      lastCountRef.current = race.registrations.length
      setPendingRegistrations(
        race.registrations.map((reg) => {
          const override = teamOverridesRef.current.get(reg.id)
          if (!override) return reg
          const teamId = override.teamId
          return {
            ...reg,
            teamId,
            team: teamId
              ? { id: teamId, name: override.teamName || reg.team?.name || 'Team' }
              : null,
          }
        })
      )
    }
  }, [race])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleMaxDriversTextChange = useCallback(
    (value: string) => {
      setPendingMaxDriversText(value)
      const trimmed = value.trim()
      if (!trimmed) {
        setPendingMaxDrivers(null)
        if (isTeamModalOpen) {
          const next = recomputeAssignments(pendingRegistrations, null, pendingStrategy)
          setPendingRegistrations(next)
          teamOverridesRef.current = new Map(
            next.map((reg) => [
              reg.id,
              { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
            ])
          )
        }
        return
      }
      const parsed = Number(trimmed)
      if (Number.isNaN(parsed) || parsed < 1) {
        setPendingMaxDrivers(null)
        if (isTeamModalOpen) {
          const next = recomputeAssignments(pendingRegistrations, null, pendingStrategy)
          setPendingRegistrations(next)
          teamOverridesRef.current = new Map(
            next.map((reg) => [
              reg.id,
              { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
            ])
          )
        }
        return
      }
      const nextMax = Math.floor(parsed)
      setPendingMaxDrivers(nextMax)
      if (isTeamModalOpen) {
        const next = recomputeAssignments(pendingRegistrations, nextMax, pendingStrategy)
        setPendingRegistrations(next)
        teamOverridesRef.current = new Map(
          next.map((reg) => [
            reg.id,
            { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
          ])
        )
      }
    },
    [isTeamModalOpen, pendingRegistrations, pendingStrategy, recomputeAssignments]
  )

  const handleMaxDriversStep = useCallback(
    (delta: number) => {
      const current = pendingMaxDrivers ?? autoMaxDrivers ?? 1
      const next = Math.max(1, current + delta)
      setPendingMaxDrivers(next)
      setPendingMaxDriversText(String(next))
      if (isTeamModalOpen) {
        const nextRegs = recomputeAssignments(pendingRegistrations, next, pendingStrategy)
        setPendingRegistrations(nextRegs)
        teamOverridesRef.current = new Map(
          nextRegs.map((reg) => [
            reg.id,
            { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
          ])
        )
      }
    },
    [
      autoMaxDrivers,
      isTeamModalOpen,
      pendingMaxDrivers,
      pendingRegistrations,
      pendingStrategy,
      recomputeAssignments,
    ]
  )

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
    setPendingRegistrations(updated)
  }

  const handleRebalance = () => {
    if (!isTeamModalOpen) return
    const next = recomputeAssignments(pendingRegistrations, pendingMaxDrivers, pendingStrategy)
    setPendingRegistrations(next)
    teamOverridesRef.current = new Map(
      next.map((reg) => [
        reg.id,
        { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
      ])
    )
  }

  const handleStrategyChange = (value: 'BALANCED_IRATING') => {
    setPendingStrategy(value)
    if (isTeamModalOpen) {
      const next = recomputeAssignments(pendingRegistrations, pendingMaxDrivers, value)
      setPendingRegistrations(next)
      teamOverridesRef.current = new Map(
        next.map((reg) => [
          reg.id,
          { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
        ])
      )
    }
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
    formData.set('applyRebalance', 'false')
    formData.set('registrationUpdates', JSON.stringify(payload))
    formData.set('newTeams', JSON.stringify(extraTeams))

    startSaveTransition(() => {
      void saveRaceEdits(formData)
    })

    if (isAdmin) {
      setTeamsAssigned(pendingRegistrations.some((reg) => !!(reg.teamId || reg.team?.id)))
    }
  }

  const handleCloseTeamModal = () => {
    setIsTeamModalOpen(false)
    teamOverridesRef.current = new Map()
    setPendingRegistrations(race.registrations)
  }

  const createTempTeam = useCallback(() => {
    const nextIndex = teams.length + extraTeams.length + 1
    const nextTeam: LocalTeam = {
      id: `temp-team-${extraTeamCounter.current}`,
      name: `Team ${nextIndex}`,
    }
    extraTeamCounter.current += 1
    setExtraTeams((prev) => [...prev, nextTeam])
    return nextTeam
  }, [extraTeams.length, teams.length])

  const revealOrCreateTeam = useCallback(() => {
    const usedTeamIds = new Set<string>()
    pendingRegistrations.forEach((reg) => {
      const teamId = reg.teamId ?? reg.team?.id
      if (teamId) usedTeamIds.add(teamId)
    })
    revealedTeamIds.forEach((id) => usedTeamIds.add(id))

    const availableOfficial = teams.find((team) => !usedTeamIds.has(team.id))
    if (availableOfficial) {
      setRevealedTeamIds((prev) =>
        prev.includes(availableOfficial.id) ? prev : [...prev, availableOfficial.id]
      )
      return { id: availableOfficial.id, name: availableOfficial.name, isTemp: false }
    }

    const created = createTempTeam()
    return { id: created.id, name: created.name, isTemp: true }
  }, [createTempTeam, pendingRegistrations, revealedTeamIds, teams])

  const moveRegistrationToTeam = useCallback(
    (registrationId: string, teamId: string | null, teamName?: string) => {
      teamOverridesRef.current.set(registrationId, { teamId, teamName })
      setPendingRegistrations((prev) =>
        prev.map((reg) =>
          reg.id === registrationId
            ? {
                ...reg,
                teamId,
                team: teamId
                  ? { id: teamId, name: teamName || teamNameById.get(teamId) || 'Team' }
                  : null,
              }
            : reg
        )
      )
    },
    [teamNameById]
  )

  const handleDropOnTeam = useCallback(
    (teamId: string | null) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const registrationId = event.dataTransfer.getData('text/plain')
      if (!registrationId) return
      if (teamId === null) {
        moveRegistrationToTeam(registrationId, null)
        return
      }
      moveRegistrationToTeam(registrationId, teamId)
    },
    [moveRegistrationToTeam]
  )

  const handleDropOnNewTeam = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const registrationId = event.dataTransfer.getData('text/plain')
      if (!registrationId) return
      const newTeam = revealOrCreateTeam()
      moveRegistrationToTeam(registrationId, newTeam.id, newTeam.name)
    },
    [moveRegistrationToTeam, revealOrCreateTeam]
  )

  const isDropdownOpen = isAddDriverOpen || isRegisterOpen
  const isOverlayOpen = isDropdownOpen || isDropConfirming || isTeamModalOpen

  useEffect(() => {
    if (lastDropdownState.current === isOverlayOpen) return
    lastDropdownState.current = isOverlayOpen
    onDropdownToggle?.(isOverlayOpen)
  }, [isOverlayOpen, onDropdownToggle])

  const upsertRegistration = useCallback(
    (
      registration: RaceWithRegistrations['registrations'][0],
      options?: { teamId?: string | null; teamName?: string }
    ) => {
      if (!registration) return
      if (options?.teamId !== undefined) {
        teamOverridesRef.current.set(registration.id, {
          teamId: options.teamId ?? null,
          teamName: options.teamName,
        })
      }
      setPendingRegistrations((prev) => {
        const exists = prev.find((reg) => reg.id === registration.id)
        const nextTeamId = options?.teamId ?? registration.teamId ?? registration.team?.id ?? null
        const nextTeam =
          nextTeamId === null
            ? null
            : {
                id: nextTeamId,
                name:
                  options?.teamName ||
                  registration.team?.name ||
                  teamNameById.get(nextTeamId) ||
                  'Team',
              }
        if (exists) {
          return prev.map((reg) =>
            reg.id === registration.id
              ? { ...registration, teamId: nextTeamId, team: nextTeam }
              : reg
          )
        }
        return [...prev, { ...registration, teamId: nextTeamId, team: nextTeam }]
      })
    },
    [teamNameById]
  )

  const showTeamsInCard = teamsAssigned
  const canAssignTeams = isAdmin && !isRaceCompleted
  const enableDrag = canAssignTeams && isTeamModalOpen

  const renderDriverRow = (
    reg: RaceWithRegistrations['registrations'][0],
    options?: { allowAdminEdits?: boolean }
  ) => {
    const allowAdminEdits = options?.allowAdminEdits ?? false
    const canEditCarClass = isAdmin
      ? allowAdminEdits && !isRaceCompleted
      : !teamsAssigned && !isRaceCompleted
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
      <div
        key={reg.id}
        className={styles.driverRow}
        draggable={enableDrag}
        onDragStart={(event) => {
          if (!enableDrag) return
          event.dataTransfer.setData('text/plain', reg.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
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
                currentCarClassShortName={reg.carClass.shortName || reg.carClass.name}
                carClasses={carClasses}
                deferSubmit
                onChange={(classId) => handleCarClassChange(reg.id, classId)}
                readOnly={!canEditCarClass && (!isAdmin || reg.userId !== userId)}
                showLabel={false}
                variant="pill"
              />
            </div>
          </div>
        </div>
        <div className={styles.driverTimeslot}>
          {(reg.userId === userId || isAdmin) && !isRaceCompleted && (
            <div className={styles.actionRow}>
              <DropRegistrationButton
                registrationId={reg.id}
                onConfirmingChange={setIsDropConfirming}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderTeamGrid = (options?: { includeAddTeam?: boolean; allowAdminEdits?: boolean }) => {
    const includeAddTeam = options?.includeAddTeam ?? false
    const allowAdminEdits = options?.allowAdminEdits ?? false
    const grouped = pendingRegistrations.reduce(
      (acc, reg) => {
        const teamId = reg.teamId ?? reg.team?.id ?? 'unassigned'
        if (!acc[teamId]) acc[teamId] = []
        acc[teamId].push(reg)
        return acc
      },
      {} as Record<string, typeof pendingRegistrations>
    )

    const orderedTeamIds = teamList.map((team) => team.id)
    const extraTeamIds = new Set(extraTeams.map((team) => team.id))
    const visibleOrderedTeams = orderedTeamIds.filter((id) => {
      if (grouped[id]) return true
      if (extraTeamIds.has(id)) return true
      if (revealedTeamSet.has(id)) return true
      return false
    })
    const unknownTeams = Object.keys(grouped).filter(
      (id) => id !== 'unassigned' && !orderedTeamIds.includes(id)
    )
    const sortedTeams = [...visibleOrderedTeams, ...unknownTeams]
    if (grouped.unassigned) sortedTeams.push('unassigned')

    const getTeamLabel = (teamId: string) =>
      teamId === 'unassigned' ? 'Unassigned' : teamNameById.get(teamId) || 'Team'

    return (
      <div className={styles.teamGrid}>
        {sortedTeams
          .filter((teamId) => includeAddTeam || (grouped[teamId]?.length ?? 0) > 0)
          .map((teamId) => {
            const teamRegistrations = grouped[teamId] ?? []
            const ratings = teamRegistrations.map((reg) => getRegistrationRating(reg))
            const avgRating =
              ratings.length > 0
                ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
                : 0

            return (
              <div
                key={teamId}
                className={`${styles.teamGroup} ${
                  dragOverTeamId === teamId ? styles.teamGroupDragOver : ''
                }`}
                onDragOver={(event) => {
                  if (!canAssignTeams) return
                  event.preventDefault()
                  setDragOverTeamId(teamId)
                }}
                onDragLeave={() => setDragOverTeamId(null)}
                onDrop={(event) => {
                  if (!canAssignTeams) return
                  setDragOverTeamId(null)
                  handleDropOnTeam(teamId === 'unassigned' ? null : teamId)(event)
                }}
              >
                <div className={styles.teamGroupHeader}>
                  <Users size={14} />
                  <span>{getTeamLabel(teamId)}</span>
                  <span className={styles.teamCount}>({teamRegistrations.length})</span>
                  <span className={styles.teamSof}>{avgRating} SOF</span>
                </div>
                {teamRegistrations.map((reg) => renderDriverRow(reg, { allowAdminEdits }))}
                {includeAddTeam && canAssignTeams && teamId !== 'unassigned' && (
                  <div className={styles.addDriverInline}>
                    <AdminDriverSearch
                      raceId={race.id}
                      registeredUserIds={registeredUserIds}
                      allDrivers={allDrivers}
                      defaultCarClassId={teamRegistrations[0]?.carClass.id || lastDriverCarClass}
                      onDropdownToggle={setIsAddDriverOpen}
                      onSuccess={({ message, registration }) => {
                        if (registration) {
                          upsertRegistration(registration, {
                            teamId: teamId === 'unassigned' ? null : teamId,
                            teamName: teamNameById.get(teamId) || 'Team',
                          })
                        }
                        setAddDriverMessage(message.replace(/\s+Added!$/, ''))
                        setTimeout(() => setAddDriverMessage(''), 3000)
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        {includeAddTeam && canAssignTeams && (
          <div
            className={`${styles.teamGroup} ${styles.addTeamTile} ${
              dragOverTeamId === 'add-team' ? styles.teamGroupDragOver : ''
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverTeamId('add-team')
            }}
            onDragLeave={() => setDragOverTeamId(null)}
            onDrop={(event) => {
              setDragOverTeamId(null)
              handleDropOnNewTeam(event)
            }}
            onClick={() => {
              if (!canAssignTeams) return
              revealOrCreateTeam()
            }}
          >
            <div className={styles.addTeamContent}>
              <span className={styles.addTeamIcon}>+</span>
              <span>Add Team</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.raceCard}>
      <div className={styles.raceCardContent}>
        <div className={styles.raceHeader}>
          <h4 className={styles.raceTitle}>
            Timeslot:{' '}
            {new Intl.DateTimeFormat('en-US', {
              month: 'numeric',
              day: 'numeric',
            }).format(race.startTime)}{' '}
            {' \u2022 '}
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
        </div>

        {pendingRegistrations.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">No drivers registered for this race.</p>
        ) : (
          <div className={styles.driverList}>
            {showTeamsInCard ? (
              renderTeamGrid()
            ) : (
              <div className={styles.unassignedGroup}>
                <div className={styles.unassignedHeader}>Teams pending assignment</div>
                {pendingRegistrations.map((reg) => renderDriverRow(reg))}
              </div>
            )}
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
                onDropdownToggle={setIsAddDriverOpen}
                onSuccess={({ message, registration }) => {
                  if (registration) {
                    upsertRegistration(registration)
                  }
                  setAddDriverMessage(message.replace(/\s+Added!$/, ''))
                  setTimeout(() => setAddDriverMessage(''), 3000)
                }}
              />
            </div>
            {!isUserRegistered && (
              <div className={styles.quickRegWrapper}>
                <QuickRegistration
                  raceId={race.id}
                  carClasses={carClasses}
                  compact
                  onDropdownToggle={setIsRegisterOpen}
                />
              </div>
            )}
            <div className={styles.teamPickerWrapper}>
              <TeamPickerTrigger
                onOpen={() => setIsTeamModalOpen(true)}
                disabled={!canAssignTeams || pendingRegistrations.length === 0}
              />
            </div>
          </div>
        )}

        {!isUserRegistered && !isRaceCompleted && !isAdmin && (
          <QuickRegistration
            raceId={race.id}
            carClasses={carClasses}
            onDropdownToggle={setIsRegisterOpen}
          />
        )}

        {isTeamModalOpen && canAssignTeams && (
          <div className={styles.teamModalOverlay} onClick={handleCloseTeamModal}>
            <div className={styles.teamModal} onClick={(event) => event.stopPropagation()}>
              <div className={styles.teamModalHeader}>
                <div>
                  <h3 className={styles.teamModalTitle}>Assign Teams</h3>
                  <p className={styles.teamModalSubtitle}>
                    Drag drivers between teams, then save when you are ready.
                  </p>
                </div>
                <div className={styles.teamModalActions}>
                  <MaxDriversPerTeamInput
                    textValue={pendingMaxDriversText}
                    strategy={pendingStrategy}
                    onTextChange={handleMaxDriversTextChange}
                    onStep={handleMaxDriversStep}
                    onStrategyChange={handleStrategyChange}
                    onRebalance={handleRebalance}
                    disabled={!isAdmin}
                  />
                  <button
                    type="button"
                    className={styles.teamModalClose}
                    onClick={handleCloseTeamModal}
                    aria-label="Close team assignment"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className={styles.teamModalBody}>
                {renderTeamGrid({ includeAddTeam: true, allowAdminEdits: true })}
              </div>
              <div className={styles.teamModalFooter}>
                {addDriverMessage && (
                  <div className={styles.addDriverToast} title={addDriverMessage}>
                    <span className={styles.addDriverName}>{addDriverMessage}</span>
                    <span className={styles.addDriverSuffix}>Added!</span>
                  </div>
                )}
                <button
                  type="button"
                  className={styles.teamModalSave}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && !isRaceCompleted && addDriverMessage && (
          <div className={styles.saveRow}>
            <div className={styles.addDriverToast} title={addDriverMessage}>
              <span className={styles.addDriverName}>{addDriverMessage}</span>
              <span className={styles.addDriverSuffix}>Added!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
