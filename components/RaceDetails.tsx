'use client'

import { Check, Lock, Pencil, Trash2, Unlock, UserCog, Users, X } from 'lucide-react'
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
  teams: Array<{ id: string; name: string; iracingTeamId: number | null; memberCount?: number }>
  allDrivers?: Driver[]
  onDropdownToggle?: (open: boolean) => void
}

type LocalTeam = { id: string; name: string }
type PendingAddition = {
  tempId: string
  userId?: string | null
  manualDriverId?: string | null
  carClassId: string
  teamId: string | null
}

const tempRegistrationPrefix = 'temp-reg-'

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
          Form/Rebalance Teams
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
  const [saveError, setSaveError] = useState('')
  const [extraTeams, setExtraTeams] = useState<LocalTeam[]>([])
  const [revealedTeamIds, setRevealedTeamIds] = useState<string[]>([])
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false)
  const [teamsAssigned, setTeamsAssigned] = useState(!!race.teamsAssigned)
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null)
  const [lockedTeamIds, setLockedTeamIds] = useState<Set<string>>(new Set())
  const [pendingAdditions, setPendingAdditions] = useState<PendingAddition[]>([])
  const [pendingDrops, setPendingDrops] = useState<Set<string>>(new Set())
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editingTeamName, setEditingTeamName] = useState('')
  const [teamNameOverrides, setTeamNameOverrides] = useState<Record<string, string>>({})
  const lastDropdownState = useRef<boolean | null>(null)
  const extraTeamCounter = useRef(1)
  const teamOverridesRef = useRef<Map<string, { teamId: string | null; teamName?: string }>>(
    new Map()
  )

  const lastRaceIdRef = useRef<string | null>(null)
  const lastRegistrationIdsRef = useRef<string>('')

  const teamList = useMemo(() => [...teams, ...extraTeams], [extraTeams, teams])
  const revealedTeamSet = useMemo(() => new Set(revealedTeamIds), [revealedTeamIds])

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    teamList.forEach((team) => map.set(team.id, team.name))
    Object.entries(teamNameOverrides).forEach(([id, name]) => map.set(id, name))
    return map
  }, [teamList, teamNameOverrides])

  const isOfficialTeamId = useCallback(
    (teamId: string) => teams.some((team) => team.id === teamId && (team.memberCount ?? 0) > 0),
    [teams]
  )

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
      strategy: 'BALANCED_IRATING',
      lockedTeams: Set<string>,
      teamIds: string[],
      teamNameLookup: Map<string, string>,
      preferredTeamIds: string[]
    ) => {
      if (!maxDrivers || maxDrivers < 1) return registrations.map((reg) => ({ ...reg }))

      const teamOrder = teamIds
      const usedTeamIds = new Set<string>(lockedTeams)
      const lockedTeamsByClass = new Map<string, Set<string>>()
      const classOrder: string[] = []

      registrations.forEach((reg) => {
        if (!classOrder.includes(reg.carClass.id)) {
          classOrder.push(reg.carClass.id)
        }
        const teamId = reg.teamId ?? reg.team?.id ?? null
        if (teamId && lockedTeams.has(teamId)) {
          const locked = lockedTeamsByClass.get(reg.carClass.id) ?? new Set<string>()
          locked.add(teamId)
          lockedTeamsByClass.set(reg.carClass.id, locked)
        }
      })

      const classToTeamIds = new Map<string, string[]>()
      for (const classId of classOrder) {
        const classRegs = registrations.filter((reg) => reg.carClass.id === classId)
        const lockedTeamsForClass = new Set(lockedTeamsByClass.get(classId) ?? [])
        const assignableRegs = classRegs.filter((reg) => {
          const teamId = reg.teamId ?? reg.team?.id ?? null
          return !teamId || !lockedTeamsForClass.has(teamId)
        })
        const requiredTeams = Math.ceil(assignableRegs.length / maxDrivers)
        const availableTeams = preferredTeamIds.filter(
          (id) =>
            teamOrder.includes(id) &&
            !usedTeamIds.has(id) &&
            !lockedTeams.has(id) &&
            !lockedTeamsForClass.has(id)
        )
        const selectedTeams = availableTeams.slice(0, requiredTeams)
        selectedTeams.forEach((id) => usedTeamIds.add(id))
        classToTeamIds.set(classId, selectedTeams)
      }

      const updated = registrations.map((reg) => ({ ...reg }))

      if (strategy === 'BALANCED_IRATING') {
        for (const classId of classOrder) {
          const teamIds = classToTeamIds.get(classId) || []
          if (teamIds.length === 0) continue

          if (teamIds.length === 0) continue

          const classRegs = updated.filter((reg) => reg.carClass.id === classId)
          const rated = classRegs
            .filter((reg) => {
              const teamId = reg.teamId ?? reg.team?.id ?? null
              return !teamId || !lockedTeams.has(teamId)
            })
            .map((reg) => {
              const preferred = getPreferredStats(reg)
              return { reg, rating: preferred?.irating ?? reg.manualDriver?.irating ?? 0 }
            })

          if (rated.length === 0) continue

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
              reg.team = { id: bucket.id, name: teamNameLookup.get(bucket.id) || 'Team' }
            }
          }
        }
      }

      return updated
    },
    [getPreferredStats]
  )

  const computeTeamShortfall = useCallback(
    (
      registrations: typeof pendingRegistrations,
      maxDrivers: number | null,
      lockedTeams: Set<string>,
      teamIds: string[],
      preferredTeamIds: string[]
    ) => {
      if (!maxDrivers || maxDrivers < 1) return 0
      const usedTeamIds = new Set<string>(lockedTeams)
      const classOrder: string[] = []

      registrations.forEach((reg) => {
        if (!classOrder.includes(reg.carClass.id)) {
          classOrder.push(reg.carClass.id)
        }
      })

      let shortfall = 0

      for (const classId of classOrder) {
        const classRegs = registrations.filter((reg) => reg.carClass.id === classId)
        const lockedTeamsForClass = new Set<string>()
        classRegs.forEach((reg) => {
          const teamId = reg.teamId ?? reg.team?.id ?? null
          if (teamId && lockedTeams.has(teamId)) {
            lockedTeamsForClass.add(teamId)
          }
        })

        const assignableRegs = classRegs.filter((reg) => {
          const teamId = reg.teamId ?? reg.team?.id ?? null
          return !teamId || !lockedTeamsForClass.has(teamId)
        })

        const requiredTeams = Math.ceil(assignableRegs.length / maxDrivers)
        if (requiredTeams === 0) continue

        const availableTeams = preferredTeamIds.filter(
          (id) =>
            teamIds.includes(id) &&
            !usedTeamIds.has(id) &&
            !lockedTeams.has(id) &&
            !lockedTeamsForClass.has(id)
        )
        const selectedTeams = availableTeams.slice(0, requiredTeams)
        if (selectedTeams.length < requiredTeams) {
          shortfall += requiredTeams - selectedTeams.length
        }
        selectedTeams.forEach((id) => usedTeamIds.add(id))
      }

      return shortfall
    },
    []
  )

  const buildTeamNameLookup = useCallback((teamEntries: Array<{ id: string; name: string }>) => {
    return new Map(teamEntries.map((team) => [team.id, team.name]))
  }, [])

  const runRebalance = useCallback(
    (strategyOverride?: 'BALANCED_IRATING') => {
      if (!isTeamModalOpen) return
      if (!pendingMaxDrivers || pendingMaxDrivers < 1) return

      const strategy = strategyOverride ?? pendingStrategy
      const baseTeams = [...teams, ...extraTeams]
      const officialTeamIds = teams
        .filter((team) => (team.memberCount ?? 0) > 0)
        .map((team) => team.id)
      const nonOfficialTeamIds = teams
        .filter((team) => (team.memberCount ?? 0) === 0)
        .map((team) => team.id)
      const preferredTeamIds = [
        ...officialTeamIds,
        ...nonOfficialTeamIds,
        ...extraTeams.map((team) => team.id),
      ]
      let teamIds = baseTeams.map((team) => team.id)
      const teamNameLookup = buildTeamNameLookup(baseTeams)
      Object.entries(teamNameOverrides).forEach(([id, name]) => teamNameLookup.set(id, name))

      const shortfall = computeTeamShortfall(
        pendingRegistrations,
        pendingMaxDrivers,
        lockedTeamIds,
        teamIds,
        preferredTeamIds
      )

      if (shortfall > 0) {
        const created: LocalTeam[] = []
        const baseIndex = teams.length + extraTeams.length
        for (let i = 0; i < shortfall; i += 1) {
          const nextTeam: LocalTeam = {
            id: `temp-team-${extraTeamCounter.current}`,
            name: `Team ${baseIndex + i + 1}`,
          }
          extraTeamCounter.current += 1
          created.push(nextTeam)
        }
        if (created.length > 0) {
          setExtraTeams((prev) => [...prev, ...created])
          teamIds = [...teamIds, ...created.map((team) => team.id)]
          created.forEach((team) => teamNameLookup.set(team.id, team.name))
        }
      }

      const next = recomputeAssignments(
        pendingRegistrations,
        pendingMaxDrivers,
        strategy,
        lockedTeamIds,
        teamIds,
        teamNameLookup,
        preferredTeamIds
      )
      setPendingRegistrations(next)
      teamOverridesRef.current = new Map(
        next.map((reg) => [
          reg.id,
          { teamId: reg.teamId ?? reg.team?.id ?? null, teamName: reg.team?.name },
        ])
      )
    },
    [
      buildTeamNameLookup,
      computeTeamShortfall,
      extraTeams,
      isTeamModalOpen,
      lockedTeamIds,
      pendingMaxDrivers,
      pendingRegistrations,
      pendingStrategy,
      recomputeAssignments,
      teamNameOverrides,
      teams,
    ]
  )

  const initializeLockedTeams = useCallback(() => {
    const initialLocked = new Set<string>()
    pendingRegistrations.forEach((reg) => {
      const teamId = reg.teamId ?? reg.team?.id ?? null
      if (teamId) initialLocked.add(teamId)
    })
    setLockedTeamIds(initialLocked)
  }, [pendingRegistrations])

  const toggleTeamLock = useCallback((teamId: string) => {
    setLockedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }, [])

  const isTeamLocked = useCallback((teamId: string) => lockedTeamIds.has(teamId), [lockedTeamIds])

  const isTempRegistrationId = useCallback(
    (registrationId: string) => registrationId.startsWith(tempRegistrationPrefix),
    []
  )

  const updatePendingAddition = useCallback(
    (registrationId: string, updates: Partial<PendingAddition>) => {
      setPendingAdditions((prev) =>
        prev.map((entry) => (entry.tempId === registrationId ? { ...entry, ...updates } : entry))
      )
    },
    []
  )

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const nextAuto =
      race.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))
    const nextRegistrationIds = race.registrations
      .map((reg) => reg.id)
      .sort()
      .join('|')

    if (lastRaceIdRef.current !== race.id) {
      lastRaceIdRef.current = race.id
      lastRegistrationIdsRef.current = nextRegistrationIds
      const nextStrategy = race.teamAssignmentStrategy
      setExtraTeams([])
      setRevealedTeamIds([])
      setTeamsAssigned(!!race.teamsAssigned)
      teamOverridesRef.current = new Map()
      extraTeamCounter.current = 1
      setPendingAdditions([])
      setPendingDrops(new Set())
      setTeamNameOverrides({})
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

    if (nextRegistrationIds !== lastRegistrationIdsRef.current) {
      lastRegistrationIdsRef.current = nextRegistrationIds
      setPendingRegistrations((prev) => {
        if (!isTeamModalOpen) {
          return race.registrations.map((reg) => {
            const override = teamOverridesRef.current.get(reg.id)
            if (!override) return reg
            const teamId = override.teamId
            return {
              ...reg,
              teamId,
              team: teamId
                ? {
                    id: teamId,
                    name: override.teamName || reg.team?.name || teamNameById.get(teamId) || 'Team',
                  }
                : null,
            }
          })
        }

        const prevById = new Map(prev.map((reg) => [reg.id, reg]))
        const incomingIds = new Set(race.registrations.map((reg) => reg.id))

        for (const key of teamOverridesRef.current.keys()) {
          if (!incomingIds.has(key)) {
            teamOverridesRef.current.delete(key)
          }
        }

        return race.registrations.map((reg) => {
          const existing = prevById.get(reg.id)
          if (existing) return existing
          const override = teamOverridesRef.current.get(reg.id)
          if (!override) return reg
          const teamId = override.teamId
          return {
            ...reg,
            teamId,
            team: teamId
              ? {
                  id: teamId,
                  name: override.teamName || reg.team?.name || teamNameById.get(teamId) || 'Team',
                }
              : null,
          }
        })
      })
    }
  }, [race, isTeamModalOpen, teamNameById])
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
    const nextMax = Math.floor(parsed)
    setPendingMaxDrivers(nextMax)
  }, [])

  const handleMaxDriversStep = useCallback(
    (delta: number) => {
      const current = pendingMaxDrivers ?? autoMaxDrivers ?? 1
      const next = Math.max(1, current + delta)
      setPendingMaxDrivers(next)
      setPendingMaxDriversText(String(next))
    },
    [autoMaxDrivers, pendingMaxDrivers]
  )

  const moveRegistrationToTeamWithClass = useCallback(
    (registrationId: string, teamId: string, classId: string) => {
      const carClass = carClasses.find((cc) => cc.id === classId)
      if (!carClass) return
      const teamName = teamNameById.get(teamId) || 'Team'
      if (isTempRegistrationId(registrationId)) {
        updatePendingAddition(registrationId, { teamId, carClassId: classId })
      }
      teamOverridesRef.current.set(registrationId, { teamId, teamName })
      setPendingRegistrations((prev) =>
        prev.map((reg) =>
          reg.id === registrationId
            ? {
                ...reg,
                carClass: {
                  id: carClass.id,
                  name: carClass.name,
                  shortName: carClass.shortName,
                },
                teamId,
                team: { id: teamId, name: teamName },
              }
            : reg
        )
      )
    },
    [carClasses, isTempRegistrationId, teamNameById, updatePendingAddition]
  )

  const handleRebalance = () => {
    runRebalance()
  }

  const handleStrategyChange = (value: 'BALANCED_IRATING') => {
    setPendingStrategy(value)
    runRebalance(value)
  }

  const handleSave = () => {
    const payload = pendingRegistrations
      .filter((reg) => !isTempRegistrationId(reg.id))
      .filter((reg) => isAdmin || reg.userId === userId)
      .map((reg) => ({
        id: reg.id,
        carClassId: reg.carClass.id,
        teamId: reg.teamId ?? reg.team?.id ?? null,
      }))
    const teamsWithDrivers = new Set(
      pendingRegistrations
        .map((reg) => reg.teamId ?? reg.team?.id ?? null)
        .filter((id): id is string => !!id)
    )
    const newTeamsPayload = extraTeams.filter((team) => teamsWithDrivers.has(team.id))

    const formData = new FormData()
    formData.set('raceId', race.id)
    formData.set('maxDriversPerTeam', pendingMaxDrivers ? String(pendingMaxDrivers) : '')
    formData.set('teamAssignmentStrategy', pendingStrategy)
    formData.set('applyRebalance', 'false')
    formData.set('registrationUpdates', JSON.stringify(payload))
    formData.set('newTeams', JSON.stringify(newTeamsPayload))
    formData.set('pendingAdditions', JSON.stringify(pendingAdditions))
    formData.set('pendingDrops', JSON.stringify(Array.from(pendingDrops)))
    formData.set('teamNameOverrides', JSON.stringify(teamNameOverrides))

    setSaveError('')
    startSaveTransition(() => {
      void saveRaceEdits(formData)
        .then((result) => {
          if (!result || result.message !== 'Success') {
            setSaveError(result?.message || 'Failed to save changes')
            return
          }
          setIsTeamModalOpen(false)
          setExtraTeams([])
          setRevealedTeamIds([])
          setLockedTeamIds(new Set())
          setEditingTeamId(null)
          setEditingTeamName('')
          setTeamNameOverrides({})
          if (isAdmin) {
            setTeamsAssigned(pendingRegistrations.some((reg) => !!(reg.teamId || reg.team?.id)))
          }
        })
        .catch(() => {
          setSaveError('Failed to save changes')
        })
    })
  }

  const handleCloseTeamModal = () => {
    setIsTeamModalOpen(false)
    teamOverridesRef.current = new Map()
    setPendingRegistrations(race.registrations)
    setExtraTeams([])
    setRevealedTeamIds([])
    setLockedTeamIds(new Set())
    setPendingAdditions([])
    setPendingDrops(new Set())
    setEditingTeamId(null)
    setEditingTeamName('')
    setTeamNameOverrides({})
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

  const revealOrCreateTeam = useCallback(
    (options?: { allowOfficial?: boolean }) => {
      const allowOfficial = options?.allowOfficial ?? true
      const usedTeamIds = new Set<string>()
      pendingRegistrations.forEach((reg) => {
        const teamId = reg.teamId ?? reg.team?.id
        if (teamId) usedTeamIds.add(teamId)
      })
      revealedTeamIds.forEach((id) => usedTeamIds.add(id))

      if (allowOfficial) {
        const availableOfficial = teams.find((team) => !usedTeamIds.has(team.id))
        if (availableOfficial) {
          setRevealedTeamIds((prev) =>
            prev.includes(availableOfficial.id) ? prev : [...prev, availableOfficial.id]
          )
          return { id: availableOfficial.id, name: availableOfficial.name, isTemp: false }
        }
      }

      const created = createTempTeam()
      return { id: created.id, name: created.name, isTemp: true }
    },
    [createTempTeam, pendingRegistrations, revealedTeamIds, teams]
  )

  const resolveTeamForClass = useCallback(
    (registrationId: string, classId: string, preferredTeamId?: string | null) => {
      const currentTeamId = preferredTeamId ?? null
      if (currentTeamId) {
        const currentTeamRegs = pendingRegistrations.filter(
          (reg) => reg.id !== registrationId && (reg.teamId ?? reg.team?.id) === currentTeamId
        )
        const currentTeamOk = currentTeamRegs.every((reg) => reg.carClass.id === classId)
        if (currentTeamOk) {
          return {
            id: currentTeamId,
            name: teamNameById.get(currentTeamId) || 'Team',
          }
        }
      }

      const sameClassMatch = pendingRegistrations.find((reg) => {
        if (reg.id === registrationId) return false
        const teamId = reg.teamId ?? reg.team?.id
        return teamId && reg.carClass.id === classId
      })
      if (sameClassMatch) {
        const teamId = sameClassMatch.teamId ?? sameClassMatch.team?.id
        if (teamId) {
          return {
            id: teamId,
            name: teamNameById.get(teamId) || sameClassMatch.team?.name || 'Team',
          }
        }
      }

      const created = revealOrCreateTeam()
      return { id: created.id, name: created.name }
    },
    [pendingRegistrations, revealOrCreateTeam, teamNameById]
  )

  const handleCarClassChange = useCallback(
    (registrationId: string, newClassId: string, options?: { enforceTeamClass?: boolean }) => {
      const carClass = carClasses.find((cc) => cc.id === newClassId)
      if (!carClass) return
      if (isTempRegistrationId(registrationId)) {
        updatePendingAddition(registrationId, { carClassId: newClassId })
      }
      setPendingRegistrations((prev) => {
        const current = prev.find((reg) => reg.id === registrationId)
        if (!current) return prev
        let nextTeamId = current.teamId ?? current.team?.id ?? null
        let nextTeamName = current.team?.name
        if (options?.enforceTeamClass && isTeamModalOpen) {
          const resolved = resolveTeamForClass(registrationId, newClassId, nextTeamId)
          nextTeamId = resolved.id
          nextTeamName = resolved.name
          teamOverridesRef.current.set(registrationId, {
            teamId: nextTeamId,
            teamName: nextTeamName,
          })
        }
        return prev.map((reg) =>
          reg.id === registrationId
            ? {
                ...reg,
                carClass: {
                  id: carClass.id,
                  name: carClass.name,
                  shortName: carClass.shortName,
                },
                teamId: nextTeamId,
                team: nextTeamId ? { id: nextTeamId, name: nextTeamName || 'Team' } : null,
              }
            : reg
        )
      })
    },
    [carClasses, isTempRegistrationId, isTeamModalOpen, resolveTeamForClass, updatePendingAddition]
  )

  const removeTeam = useCallback(
    (teamId: string) => {
      if (!teamId || teamId === 'unassigned') return
      const affectedIds: string[] = []
      setPendingRegistrations((prev) =>
        prev.map((reg) => {
          if ((reg.teamId ?? reg.team?.id) !== teamId) return reg
          affectedIds.push(reg.id)
          return { ...reg, teamId: null, team: null }
        })
      )
      affectedIds.forEach((id) => teamOverridesRef.current.set(id, { teamId: null }))
      setExtraTeams((prev) => prev.filter((team) => team.id !== teamId))
      setRevealedTeamIds((prev) => prev.filter((id) => id !== teamId))
      setTeamNameOverrides((prev) => {
        if (!(teamId in prev)) return prev
        const next = { ...prev }
        delete next[teamId]
        return next
      })
      if (editingTeamId === teamId) {
        setEditingTeamId(null)
        setEditingTeamName('')
      }
    },
    [editingTeamId]
  )

  const startTeamRename = useCallback(
    (teamId: string) => {
      if (teamId === 'unassigned' || isOfficialTeamId(teamId)) return
      const currentName = teamNameById.get(teamId) || 'Team'
      setEditingTeamId(teamId)
      setEditingTeamName(currentName)
    },
    [isOfficialTeamId, teamNameById]
  )

  const saveTeamRename = useCallback(() => {
    if (!editingTeamId) return
    const nextName = editingTeamName.trim() || 'Team'
    const isExtra = extraTeams.some((team) => team.id === editingTeamId)
    if (isExtra) {
      setExtraTeams((prev) =>
        prev.map((team) => (team.id === editingTeamId ? { ...team, name: nextName } : team))
      )
    } else {
      setTeamNameOverrides((prev) => ({ ...prev, [editingTeamId]: nextName }))
    }
    setEditingTeamId(null)
    setEditingTeamName('')
  }, [editingTeamId, editingTeamName, extraTeams])

  const moveRegistrationToTeam = useCallback(
    (registrationId: string, teamId: string | null, teamName?: string) => {
      if (isTempRegistrationId(registrationId)) {
        updatePendingAddition(registrationId, { teamId })
      }
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
    [isTempRegistrationId, teamNameById, updatePendingAddition]
  )

  const handleDropOnTeam = useCallback(
    (teamId: string | null) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const registrationId = event.dataTransfer.getData('text/plain')
      if (!registrationId) return
      if (teamId && isTeamLocked(teamId)) {
        return
      }
      if (teamId === null) {
        moveRegistrationToTeam(registrationId, null)
        return
      }
      if (isTeamModalOpen) {
        const targetTeamClass = pendingRegistrations.find(
          (reg) => (reg.teamId ?? reg.team?.id) === teamId
        )?.carClass.id
        const draggedReg = pendingRegistrations.find((reg) => reg.id === registrationId)
        if (targetTeamClass && draggedReg && draggedReg.carClass.id !== targetTeamClass) {
          moveRegistrationToTeamWithClass(registrationId, teamId, targetTeamClass)
          return
        }
      }
      moveRegistrationToTeam(registrationId, teamId)
    },
    [
      isTeamLocked,
      isTeamModalOpen,
      moveRegistrationToTeam,
      moveRegistrationToTeamWithClass,
      pendingRegistrations,
    ]
  )

  const handleDropOnNewTeam = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const registrationId = event.dataTransfer.getData('text/plain')
      if (!registrationId) return
      const newTeam = revealOrCreateTeam({ allowOfficial: false })
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

  const handleLocalAddDriver = useCallback(
    (driver: Driver, teamId: string | null, carClassId: string) => {
      const existingReg = race.registrations.find(
        (reg) => reg.userId === driver.id || reg.manualDriverId === driver.id
      )
      const carClass =
        carClasses.find((cc) => cc.id === carClassId) ?? carClasses[0] ?? carClasses[0]
      if (!carClass) return

      if (existingReg) {
        if (pendingDrops.has(existingReg.id)) {
          setPendingDrops((prev) => {
            const next = new Set(prev)
            next.delete(existingReg.id)
            return next
          })
        }
        const teamName = teamId ? teamNameById.get(teamId) || 'Team' : undefined
        teamOverridesRef.current.set(existingReg.id, { teamId, teamName })
        setPendingRegistrations((prev) => {
          const exists = prev.find((reg) => reg.id === existingReg.id)
          const updatedReg = {
            ...existingReg,
            carClass: {
              id: carClass.id,
              name: carClass.name,
              shortName: carClass.shortName,
            },
            teamId,
            team: teamId ? { id: teamId, name: teamName || 'Team' } : null,
          }
          if (exists) {
            return prev.map((reg) => (reg.id === existingReg.id ? updatedReg : reg))
          }
          return [...prev, updatedReg]
        })
        return
      }

      const tempId = `${tempRegistrationPrefix}${driver.id}-${Date.now()}`
      const teamName = teamId ? teamNameById.get(teamId) || 'Team' : undefined
      const tempReg: RaceWithRegistrations['registrations'][0] & { isPending?: boolean } = {
        id: tempId,
        carClass: {
          id: carClass.id,
          name: carClass.name,
          shortName: carClass.shortName,
        },
        userId: driver.id,
        manualDriverId: null,
        manualDriver: null,
        teamId,
        team: teamId ? { id: teamId, name: teamName || 'Team' } : null,
        user: {
          name: driver.name,
          image: driver.image,
          racerStats: [],
        },
        isPending: true,
      }

      setPendingRegistrations((prev) => [...prev, tempReg])
      setPendingAdditions((prev) => [
        ...prev,
        {
          tempId,
          userId: driver.id,
          carClassId: carClass.id,
          teamId,
        },
      ])
    },
    [carClasses, pendingDrops, race.registrations, teamNameById]
  )

  const handleLocalDrop = useCallback(
    (reg: RaceWithRegistrations['registrations'][0]) => {
      if (isTempRegistrationId(reg.id)) {
        setPendingAdditions((prev) => prev.filter((entry) => entry.tempId !== reg.id))
      } else {
        setPendingDrops((prev) => new Set(prev).add(reg.id))
      }
      teamOverridesRef.current.delete(reg.id)
      setPendingRegistrations((prev) => prev.filter((entry) => entry.id !== reg.id))
    },
    [isTempRegistrationId]
  )

  const showTeamsInCard = teamsAssigned
  const canAssignTeams = isAdmin && !isRaceCompleted
  const enableDrag = canAssignTeams && isTeamModalOpen

  const renderDriverRow = (
    reg: RaceWithRegistrations['registrations'][0],
    options?: { allowAdminEdits?: boolean; inUnassignedTile?: boolean }
  ) => {
    const allowAdminEdits = options?.allowAdminEdits ?? false
    const inUnassignedTile = options?.inUnassignedTile ?? false
    const hasTeamAssigned = !!(reg.teamId ?? reg.team?.id)
    const canEditCarClass = allowAdminEdits && isAdmin && !isRaceCompleted && !hasTeamAssigned
    const canEditUnassignedCarClass =
      inUnassignedTile &&
      !isRaceCompleted &&
      (isTeamModalOpen ? allowAdminEdits : isAdmin || reg.userId === userId)
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
              {!showTeamsInCard && !inUnassignedTile && !(allowAdminEdits && isTeamModalOpen) && (
                <EditableCarClass
                  registrationId={reg.id}
                  currentCarClassId={reg.carClass.id}
                  currentCarClassShortName={reg.carClass.shortName || reg.carClass.name}
                  carClasses={carClasses}
                  deferSubmit
                  onChange={(classId) =>
                    handleCarClassChange(reg.id, classId, { enforceTeamClass: allowAdminEdits })
                  }
                  readOnly={
                    hasTeamAssigned || (!canEditCarClass && (!isAdmin || reg.userId !== userId))
                  }
                  showLabel={false}
                  variant="pill"
                  className={styles.carClassPill}
                />
              )}
            </div>
          </div>
        </div>
        <div className={styles.driverTimeslot}>
          {(reg.userId === userId || isAdmin) && !isRaceCompleted && (
            <div className={styles.actionRow}>
              {canEditUnassignedCarClass && carClasses && (
                <EditableCarClass
                  registrationId={reg.id}
                  currentCarClassId={reg.carClass.id}
                  currentCarClassShortName={reg.carClass.shortName || reg.carClass.name}
                  carClasses={carClasses}
                  variant="icon"
                  showLabel={false}
                  deferSubmit={isTeamModalOpen}
                  onChange={(classId) => handleCarClassChange(reg.id, classId)}
                />
              )}
              {allowAdminEdits && isTeamModalOpen ? (
                <button
                  type="button"
                  className={styles.driverRemoveButton}
                  onClick={() => handleLocalDrop(reg)}
                  title="Remove driver"
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <DropRegistrationButton
                  registrationId={reg.id}
                  onConfirmingChange={setIsDropConfirming}
                />
              )}
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
    if (includeAddTeam && !grouped.unassigned) {
      grouped.unassigned = []
    }

    const orderedTeamIds = teamList.map((team) => team.id)
    const extraTeamIds = new Set(extraTeams.map((team) => team.id))
    const visibleOrderedTeams = orderedTeamIds.filter((id) => {
      if (grouped[id]) return true
      if (extraTeamIds.has(id)) return true
      if (revealedTeamSet.has(id)) return true
      return false
    })
    const unknownTeams = Object.keys(grouped).filter((id) => !orderedTeamIds.includes(id))
    const sortedTeams = [...visibleOrderedTeams, ...unknownTeams]

    const getTeamLabel = (teamId: string) =>
      teamId === 'unassigned' ? 'Unassigned' : teamNameById.get(teamId) || 'Team'

    const filteredTeams = sortedTeams.filter(
      (teamId) => includeAddTeam || (grouped[teamId]?.length ?? 0) > 0
    )
    const assignedTeams = filteredTeams.filter((teamId) => teamId !== 'unassigned')
    const unassignedTeams = filteredTeams.filter((teamId) => teamId === 'unassigned')

    const renderTeamTile = (
      teamId: string,
      teamRegistrations: typeof pendingRegistrations,
      options?: { unassignedLabel?: string }
    ) => {
      const ratings = teamRegistrations.map((reg) => getRegistrationRating(reg))
      const avgRating =
        ratings.length > 0
          ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
          : 0
      const isLocked = allowAdminEdits && teamId !== 'unassigned' && isTeamLocked(teamId)
      const teamCarClassId = teamRegistrations[0]?.carClass.id
      const teamCarClassLabel =
        teamRegistrations[0]?.carClass.shortName || teamRegistrations[0]?.carClass.name
      const unassignedLabel = options?.unassignedLabel

      return (
        <div
          key={unassignedLabel ? `${teamId}-${unassignedLabel}` : teamId}
          className={`${styles.teamGroup} ${
            dragOverTeamId === teamId ? styles.teamGroupDragOver : ''
          } ${teamId === 'unassigned' ? styles.unassignedTile : ''} ${
            isLocked ? styles.teamGroupLocked : ''
          }`}
          onDragOver={(event) => {
            if (!canAssignTeams) return
            if (isLocked) return
            event.preventDefault()
            setDragOverTeamId(teamId)
          }}
          onDragLeave={() => setDragOverTeamId(null)}
          onDrop={(event) => {
            if (!canAssignTeams) return
            if (isLocked) return
            setDragOverTeamId(null)
            handleDropOnTeam(teamId === 'unassigned' ? null : teamId)(event)
          }}
        >
          <div className={styles.teamGroupHeader}>
            <Users size={14} />
            <div className={styles.teamHeaderContent}>
              <div className={styles.teamHeaderRow}>
                {allowAdminEdits &&
                teamId !== 'unassigned' &&
                editingTeamId === teamId &&
                !isOfficialTeamId(teamId) ? (
                  <div className={styles.teamNameEdit}>
                    <input
                      className={styles.teamNameInput}
                      value={editingTeamName}
                      onChange={(event) => setEditingTeamName(event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.teamNameSave}
                      onClick={(event) => {
                        event.stopPropagation()
                        saveTeamRename()
                      }}
                      title="Save team name"
                    >
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <span>{unassignedLabel ?? getTeamLabel(teamId)}</span>
                )}
                {allowAdminEdits &&
                  teamId !== 'unassigned' &&
                  !isOfficialTeamId(teamId) &&
                  editingTeamId !== teamId && (
                    <button
                      type="button"
                      className={styles.teamNameEditButton}
                      onClick={(event) => {
                        event.stopPropagation()
                        startTeamRename(teamId)
                      }}
                      title="Edit team name"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                {allowAdminEdits && teamId !== 'unassigned' && (
                  <button
                    type="button"
                    className={`${styles.teamLockButton} ${
                      isTeamLocked(teamId) ? styles.teamLockActive : ''
                    }`}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleTeamLock(teamId)
                    }}
                    title={isTeamLocked(teamId) ? 'Unlock team' : 'Lock team'}
                  >
                    {isTeamLocked(teamId) ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                )}
                <span className={styles.teamCount}>({teamRegistrations.length})</span>
              </div>
              {allowAdminEdits && isTeamModalOpen && teamId !== 'unassigned' && teamCarClassId && (
                <div className={styles.teamGroupMeta}>
                  <EditableCarClass
                    registrationId={`${teamId}-header`}
                    currentCarClassId={teamCarClassId}
                    currentCarClassShortName={teamCarClassLabel}
                    carClasses={carClasses}
                    deferSubmit
                    pillStyle="group"
                    onChange={(classId) => {
                      teamRegistrations.forEach((reg) =>
                        handleCarClassChange(reg.id, classId, { enforceTeamClass: allowAdminEdits })
                      )
                    }}
                    readOnly={!allowAdminEdits}
                    showLabel={false}
                    variant="pill"
                    className={styles.carClassPill}
                  />
                  <span className={styles.teamSof}>{avgRating} SOF</span>
                </div>
              )}
              {!isTeamModalOpen && teamId !== 'unassigned' && teamCarClassId && (
                <div className={styles.teamGroupMeta}>
                  <EditableCarClass
                    registrationId={`${teamId}-header`}
                    currentCarClassId={teamCarClassId}
                    currentCarClassShortName={teamCarClassLabel}
                    carClasses={carClasses}
                    readOnly
                    showLabel={false}
                    variant="pill"
                    pillStyle="group"
                    className={styles.carClassPill}
                  />
                  <span className={styles.teamSof}>{avgRating} SOF</span>
                </div>
              )}
            </div>
            {includeAddTeam && canAssignTeams && teamId !== 'unassigned' && (
              <button
                type="button"
                className={styles.teamRemoveButton}
                onClick={() => removeTeam(teamId)}
                title="Remove team"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className={teamId === 'unassigned' ? styles.unassignedGrid : undefined}>
            {teamRegistrations.map((reg) =>
              renderDriverRow(reg, { allowAdminEdits, inUnassignedTile: teamId === 'unassigned' })
            )}
          </div>
          {includeAddTeam && canAssignTeams && teamId !== 'unassigned' && (
            <div className={styles.addDriverInline}>
              <AdminDriverSearch
                raceId={race.id}
                registeredUserIds={registeredUserIds}
                allDrivers={allDrivers}
                defaultCarClassId={teamRegistrations[0]?.carClass.id || lastDriverCarClass}
                onDropdownToggle={setIsAddDriverOpen}
                buttonLabel="Register Driver"
                onSelectDriver={(driver) => {
                  const resolvedTeamId = teamId === 'unassigned' ? null : teamId
                  handleLocalAddDriver(
                    driver,
                    resolvedTeamId,
                    teamRegistrations[0]?.carClass.id || lastDriverCarClass
                  )
                  setAddDriverMessage(driver.name || 'Driver')
                  setTimeout(() => setAddDriverMessage(''), 3000)
                }}
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
          {isLocked && (
            <div className={styles.teamLockedOverlay}>Team Locked, unlock to make changes</div>
          )}
        </div>
      )
    }

    const assignedTiles = assignedTeams.map((teamId) =>
      renderTeamTile(teamId, grouped[teamId] ?? [])
    )
    const unassignedTiles = unassignedTeams.flatMap((teamId) => {
      const unassignedRegs = grouped[teamId] ?? []
      const byClass = new Map<string, typeof pendingRegistrations>()
      unassignedRegs.forEach((reg) => {
        const key = reg.carClass.id
        const list = byClass.get(key) ?? []
        list.push(reg)
        byClass.set(key, list)
      })
      return Array.from(byClass.entries()).map(([classId, regs]) =>
        renderTeamTile(teamId, regs, {
          unassignedLabel: `Unassigned - ${
            regs[0]?.carClass.shortName || regs[0]?.carClass.name || classId
          }`,
        })
      )
    })

    const addTeamTile =
      includeAddTeam && canAssignTeams ? (
        <div
          key="add-team"
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
            revealOrCreateTeam({ allowOfficial: false })
          }}
        >
          <div className={styles.addTeamContent}>
            <span className={styles.addTeamIcon}>+</span>
            <span>Add Team</span>
          </div>
        </div>
      ) : null

    const baseAssigned =
      addTeamTile && isTeamModalOpen ? [...assignedTiles, addTeamTile] : [...assignedTiles]

    const renderedTeams = isTeamModalOpen
      ? [
          ...baseAssigned,
          ...(baseAssigned.length > 0 && unassignedTiles.length > 0
            ? [<div key="unassigned-separator" className={styles.teamGridSeparator} aria-hidden />]
            : []),
          ...unassignedTiles,
        ]
      : [...assignedTiles, ...unassignedTiles, ...(addTeamTile ? [addTeamTile] : [])]

    return <div className={styles.teamGrid}>{renderedTeams}</div>
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
          <div className={styles.driverList}>{renderTeamGrid()}</div>
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
                onOpen={() => {
                  setIsTeamModalOpen(true)
                  initializeLockedTeams()
                }}
                disabled={!canAssignTeams}
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
                <div className={styles.teamModalHeaderContent}>
                  <h3 className={styles.teamModalTitle}>Assign Teams</h3>
                  <p className={styles.teamModalSubtitle}>
                    Drag drivers between teams, then save when you are ready.
                  </p>
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
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.teamModalClose}
                  onClick={handleCloseTeamModal}
                  aria-label="Close team assignment"
                >
                  <X size={18} />
                </button>
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
                {saveError && <div className={styles.saveError}>{saveError}</div>}
                <button
                  type="button"
                  className={styles.teamModalSave}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save and Notify'}
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
