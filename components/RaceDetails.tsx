'use client'

import {
  CornerDownLeft,
  Check,
  ChevronDown,
  GripVertical,
  Lock,
  ShieldX,
  Trash2,
  Unlock,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { buildDiscordAppLink } from '@/lib/discord-utils'
import { Prisma } from '@prisma/client'
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
import { buildTeamChangeSummary } from '@/lib/team-change-summary'

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
      alias?: string | null
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
  discordTeamsThreadId?: string | null
  discordTeamThreads?: Prisma.JsonValue | null
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

type DriverDetailsResponse =
  | {
      id: string
      type: 'user'
      name: string | null
      image: string | null
      racerStats: Array<{
        category: string
        categoryId: number
        irating: number
        safetyRating: number
        groupName: string
      }>
    }
  | {
      id: string
      type: 'manual'
      name: string | null
      image: string | null
      irating: number
    }

interface Props {
  race: RaceWithRegistrations
  userId: string
  isAdmin?: boolean
  carClasses: { id: string; name: string; shortName: string }[]
  teams: Array<{ id: string; name: string; iracingTeamId: number | null; memberCount?: number }>
  allDrivers?: Driver[]
  onDropdownToggle?: (open: boolean) => void
  discordGuildId?: string
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

const DiscussionIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M4.913 2.658c2.075-.21 4.19-.322 6.337-.322 2.146 0 4.262.112 6.337.322a.75.75 0 0 1 .677.743V12a.75.75 0 0 1-.677.743 48.33 48.33 0 0 1-3.411.308c-1.856.118-3.598.804-5.048 1.943l-2.408 1.9a.75.75 0 0 1-1.223-.585V14.54a.75.75 0 0 0-.75-.75 49.784 49.784 0 0 1-3.033-.376.75.75 0 0 1-.627-.74V3.401a.75.75 0 0 1 .676-.743Z" />
    <path d="M15.857 15.346c.866.044 1.72.11 2.565.196l2.181 1.735c.539.429 1.341.047 1.341-.64V12.94a.75.75 0 0 1 .75-.75 48.138 48.138 0 0 1 1.05.037.75.75 0 0 1 .69.742V18.4a.75.75 0 0 1-.674.745 49.14 49.14 0 0 1-5.18.398c-1.58.079-3.054.67-4.26 1.63L11.7 22.18c-.538.43-1.34.047-1.34-.64V19.34a.75.75 0 0 1 .75-.75 48.307 48.307 0 0 1 1.62-.123c1.245-.142 2.391-.643 3.127-1.511Z" />
  </svg>
)

export default function RaceDetails({
  race,
  userId,
  isAdmin = false,
  carClasses,
  teams,
  allDrivers = [],
  onDropdownToggle,
  discordGuildId,
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
  const [saveConfirming, setSaveConfirming] = useState(false)
  const [crossClassWarning, setCrossClassWarning] = useState<{
    registrationId: string
    teamId: string
    targetClassId: string
  } | null>(null)
  const [teamClassWarning, setTeamClassWarning] = useState<{
    teamId: string
    targetClassId: string
  } | null>(null)
  const [extraTeams, setExtraTeams] = useState<LocalTeam[]>([])
  const [revealedTeamIds, setRevealedTeamIds] = useState<string[]>([])
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false)
  const [teamsAssigned, setTeamsAssigned] = useState(!!race.teamsAssigned)
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null)
  const [lockedTeamIds, setLockedTeamIds] = useState<Set<string>>(new Set())
  const [pendingAdditions, setPendingAdditions] = useState<PendingAddition[]>([])
  const [pendingDrops, setPendingDrops] = useState<Set<string>>(new Set())
  const [teamPickerId, setTeamPickerId] = useState<string | null>(null)
  const [teamPickerQuery, setTeamPickerQuery] = useState('')
  const [teamNameOverrides, setTeamNameOverrides] = useState<Record<string, string>>({})
  const [emptyTeamCarClassOverrides, setEmptyTeamCarClassOverrides] = useState<
    Record<string, string>
  >({})
  const [teamOrder, setTeamOrder] = useState<string[]>([])
  const lastDropdownState = useRef<boolean | null>(null)
  const extraTeamCounter = useRef(1)
  const teamPickerRef = useRef<HTMLDivElement | null>(null)
  const teamOverridesRef = useRef<Map<string, { teamId: string | null; teamName?: string }>>(
    new Map()
  )

  const lastRaceIdRef = useRef<string | null>(null)
  const lastRegistrationIdsRef = useRef<string>('')
  const lastRegistrationSnapshotRef = useRef<string>('')

  const teamList = useMemo(() => [...teams, ...extraTeams], [extraTeams, teams])
  const revealedTeamSet = useMemo(() => new Set(revealedTeamIds), [revealedTeamIds])

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    teamList.forEach((team) => map.set(team.id, team.name))
    Object.entries(teamNameOverrides).forEach(([id, name]) => map.set(id, name))
    return map
  }, [teamList, teamNameOverrides])

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
      preferredTeamIds: string[],
      classOverrides: Record<string, string>
    ) => {
      if (!maxDrivers || maxDrivers < 1) return registrations.map((reg) => ({ ...reg }))

      const teamOrder = teamIds
      const availableTeamIds = teamIds.filter((id) => !lockedTeams.has(id))
      const usedTeamIds = new Set<string>()
      const classOrder: string[] = []
      const classSeedTeams = new Map<string, Set<string>>()

      registrations.forEach((reg) => {
        if (!classOrder.includes(reg.carClass.id)) {
          classOrder.push(reg.carClass.id)
        }
        const teamId = reg.teamId ?? reg.team?.id ?? null
        if (teamId) {
          const existing = classSeedTeams.get(reg.carClass.id) ?? new Set<string>()
          existing.add(teamId)
          classSeedTeams.set(reg.carClass.id, existing)
        }
      })
      Object.entries(classOverrides).forEach(([teamId, classId]) => {
        if (!classId) return
        if (!classOrder.includes(classId)) classOrder.push(classId)
        const existing = classSeedTeams.get(classId) ?? new Set<string>()
        existing.add(teamId)
        classSeedTeams.set(classId, existing)
      })

      const classToTeamIds = new Map<string, string[]>()
      for (const classId of classOrder) {
        const classRegs = registrations.filter((reg) => reg.carClass.id === classId)
        const assignableRegs = classRegs.filter((reg) => {
          const teamId = reg.teamId ?? reg.team?.id ?? null
          return !teamId || !lockedTeams.has(teamId)
        })
        const requiredTeams = Math.ceil(assignableRegs.length / maxDrivers)
        const seedSet = classSeedTeams.get(classId) ?? new Set<string>()
        const seedTeams = availableTeamIds.filter((id) => seedSet.has(id) && !usedTeamIds.has(id))
        const availableTeams = preferredTeamIds.filter(
          (id) =>
            teamOrder.includes(id) &&
            availableTeamIds.includes(id) &&
            !seedSet.has(id) &&
            !usedTeamIds.has(id)
        )
        const selectedTeams: string[] = []
        for (const teamId of seedTeams) {
          if (selectedTeams.length >= requiredTeams) break
          selectedTeams.push(teamId)
        }
        for (const teamId of availableTeams) {
          if (selectedTeams.length >= requiredTeams) break
          selectedTeams.push(teamId)
        }
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
      preferredTeamIds: string[],
      classOverrides: Record<string, string>
    ) => {
      if (!maxDrivers || maxDrivers < 1) return 0
      const availableTeamIds = teamIds.filter((id) => !lockedTeams.has(id))
      const usedTeamIds = new Set<string>()
      const classSeedTeams = new Map<string, Set<string>>()
      const classOrder: string[] = []

      registrations.forEach((reg) => {
        if (!classOrder.includes(reg.carClass.id)) {
          classOrder.push(reg.carClass.id)
        }
        const teamId = reg.teamId ?? reg.team?.id ?? null
        if (teamId) {
          const existing = classSeedTeams.get(reg.carClass.id) ?? new Set<string>()
          existing.add(teamId)
          classSeedTeams.set(reg.carClass.id, existing)
        }
      })
      Object.entries(classOverrides).forEach(([teamId, classId]) => {
        if (!classId) return
        if (!classOrder.includes(classId)) classOrder.push(classId)
        const existing = classSeedTeams.get(classId) ?? new Set<string>()
        existing.add(teamId)
        classSeedTeams.set(classId, existing)
      })

      let shortfall = 0

      for (const classId of classOrder) {
        const classRegs = registrations.filter((reg) => reg.carClass.id === classId)

        const assignableRegs = classRegs.filter((reg) => {
          const teamId = reg.teamId ?? reg.team?.id ?? null
          return !teamId || !lockedTeams.has(teamId)
        })

        const requiredTeams = Math.ceil(assignableRegs.length / maxDrivers)
        if (requiredTeams === 0) continue

        const seedSet = classSeedTeams.get(classId) ?? new Set<string>()
        const seedTeams = availableTeamIds.filter((id) => seedSet.has(id) && !usedTeamIds.has(id))
        seedTeams.forEach((id) => usedTeamIds.add(id))

        const availableTeams = preferredTeamIds.filter(
          (id) => availableTeamIds.includes(id) && !seedSet.has(id) && !usedTeamIds.has(id)
        )
        const selectedTeams: string[] = []
        for (const teamId of seedTeams) {
          if (selectedTeams.length >= requiredTeams) break
          selectedTeams.push(teamId)
        }
        for (const teamId of availableTeams) {
          if (selectedTeams.length >= requiredTeams) break
          selectedTeams.push(teamId)
        }
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
      let preferredTeamIds = [
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
        preferredTeamIds,
        emptyTeamCarClassOverrides
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
          preferredTeamIds = [...preferredTeamIds, ...created.map((team) => team.id)]
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
        preferredTeamIds,
        emptyTeamCarClassOverrides
      )
      setPendingRegistrations(next)
      const usedTeamIds = new Set(
        next.map((reg) => reg.teamId ?? reg.team?.id ?? null).filter((id): id is string => !!id)
      )
      setExtraTeams((prev) => prev.filter((team) => usedTeamIds.has(team.id)))
      setRevealedTeamIds((prev) => prev.filter((id) => usedTeamIds.has(id)))
      setTeamNameOverrides((prev) => {
        const nextOverrides: Record<string, string> = {}
        Object.entries(prev).forEach(([id, name]) => {
          if (usedTeamIds.has(id)) nextOverrides[id] = name
        })
        return nextOverrides
      })
      setEmptyTeamCarClassOverrides((prev) => {
        const nextOverrides: Record<string, string> = {}
        Object.entries(prev).forEach(([id, classId]) => {
          if (usedTeamIds.has(id)) nextOverrides[id] = classId
        })
        return nextOverrides
      })
      setLockedTeamIds((prev) => new Set(Array.from(prev).filter((id) => usedTeamIds.has(id))))
      setTeamOrder(() => {
        const preferredOrdered = preferredTeamIds.filter((id) => usedTeamIds.has(id))
        const remaining = Array.from(usedTeamIds).filter((id) => !preferredOrdered.includes(id))
        return ['unassigned', ...preferredOrdered, ...remaining]
      })
      teamOverridesRef.current = new Map(
        next.map((reg) => [
          reg.id,
          {
            teamId: reg.teamId ?? reg.team?.id ?? null,
            teamName: reg.team?.alias || reg.team?.name,
          },
        ])
      )
    },
    [
      buildTeamNameLookup,
      computeTeamShortfall,
      emptyTeamCarClassOverrides,
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
    if (!teamsAssigned) {
      setLockedTeamIds(new Set())
      return
    }

    const initialLocked = new Set<string>()
    pendingRegistrations.forEach((reg) => {
      const teamId = reg.teamId ?? reg.team?.id ?? null
      if (teamId) initialLocked.add(teamId)
    })
    setLockedTeamIds(initialLocked)
  }, [pendingRegistrations, teamsAssigned])

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
    const nextRegistrationSnapshot = race.registrations
      .map((reg) => {
        const teamId = reg.teamId ?? reg.team?.id ?? ''
        return `${reg.id}:${reg.carClass.id}:${teamId}`
      })
      .sort()
      .join('|')

    if (lastRaceIdRef.current !== race.id) {
      lastRaceIdRef.current = race.id
      lastRegistrationIdsRef.current = nextRegistrationIds
      lastRegistrationSnapshotRef.current = nextRegistrationSnapshot
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
              ? {
                  id: teamId,
                  name: override.teamName || reg.team?.alias || reg.team?.name || 'Team',
                }
              : null,
          }
        })
      )
      return
    }

    if (nextRegistrationIds !== lastRegistrationIdsRef.current) {
      lastRegistrationIdsRef.current = nextRegistrationIds
      lastRegistrationSnapshotRef.current = nextRegistrationSnapshot
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
                    name:
                      override.teamName ||
                      reg.team?.alias ||
                      reg.team?.name ||
                      teamNameById.get(teamId) ||
                      'Team',
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
                  name:
                    override.teamName ||
                    reg.team?.alias ||
                    reg.team?.name ||
                    teamNameById.get(teamId) ||
                    'Team',
                }
              : null,
          }
        })
      })
    } else if (nextRegistrationSnapshot !== lastRegistrationSnapshotRef.current) {
      lastRegistrationSnapshotRef.current = nextRegistrationSnapshot
      if (!isTeamModalOpen) {
        setPendingRegistrations(
          race.registrations.map((reg) => {
            const override = teamOverridesRef.current.get(reg.id)
            if (!override) return reg
            const teamId = override.teamId
            return {
              ...reg,
              teamId,
              team: teamId
                ? {
                    id: teamId,
                    name:
                      override.teamName ||
                      reg.team?.alias ||
                      reg.team?.name ||
                      teamNameById.get(teamId) ||
                      'Team',
                  }
                : null,
            }
          })
        )
      }
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
    setSaveConfirming(false)
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
          teamOverridesRef.current = new Map()
          setPendingAdditions([])
          setPendingDrops(new Set())
          setTeamPickerId(null)
          setTeamPickerQuery('')
          setTeamNameOverrides({})
          setEmptyTeamCarClassOverrides({})
          setTeamClassWarning(null)
          if (isAdmin) {
            setTeamsAssigned(pendingRegistrations.some((reg) => !!(reg.teamId || reg.team?.id)))
          }
        })
        .catch((error) => {
          const message =
            error instanceof Error && error.message ? error.message : 'Failed to save changes'
          setSaveError(message)
        })
    })
  }

  const handleCloseTeamModal = () => {
    setIsTeamModalOpen(false)
    setSaveConfirming(false)
    teamOverridesRef.current = new Map()
    setPendingRegistrations(race.registrations)
    setExtraTeams([])
    setRevealedTeamIds([])
    setLockedTeamIds(new Set())
    setPendingAdditions([])
    setPendingDrops(new Set())
    setCrossClassWarning(null)
    setTeamClassWarning(null)
    setTeamPickerId(null)
    setTeamPickerQuery('')
    setTeamNameOverrides({})
    setEmptyTeamCarClassOverrides({})
    setTeamOrder([])
  }

  const createTempTeam = useCallback(
    (nameOverride?: string) => {
      const nextIndex = teams.length + extraTeams.length + 1
      const nextTeam: LocalTeam = {
        id: `temp-team-${extraTeamCounter.current}`,
        name: nameOverride?.trim() || `Team ${nextIndex}`,
      }
      extraTeamCounter.current += 1
      setExtraTeams((prev) => [...prev, nextTeam])
      setTeamOrder((prev) => (prev.includes(nextTeam.id) ? prev : [...prev, nextTeam.id]))
      return nextTeam
    },
    [extraTeams.length, teams.length]
  )

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
        const availableOfficial = teams.find(
          (team) => (team.memberCount ?? 0) > 0 && !usedTeamIds.has(team.id)
        )
        if (availableOfficial) {
          setRevealedTeamIds((prev) =>
            prev.includes(availableOfficial.id) ? prev : [...prev, availableOfficial.id]
          )
          setTeamOrder((prev) =>
            prev.includes(availableOfficial.id) ? prev : [...prev, availableOfficial.id]
          )
          return { id: availableOfficial.id, name: availableOfficial.name, isTemp: false }
        }

        const availableManual = teams.find(
          (team) => (team.memberCount ?? 0) === 0 && !usedTeamIds.has(team.id)
        )
        if (availableManual) {
          setRevealedTeamIds((prev) =>
            prev.includes(availableManual.id) ? prev : [...prev, availableManual.id]
          )
          setTeamOrder((prev) =>
            prev.includes(availableManual.id) ? prev : [...prev, availableManual.id]
          )
          return { id: availableManual.id, name: availableManual.name, isTemp: false }
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

  const handlePendingDrop = useCallback(
    (registrationId: string) => {
      const reg = pendingRegistrations.find((entry) => entry.id === registrationId)
      if (!reg) return

      if (isTempRegistrationId(registrationId)) {
        setPendingAdditions((prev) => prev.filter((entry) => entry.tempId !== registrationId))
      } else {
        setPendingDrops((prev) => {
          const next = new Set(prev)
          next.add(registrationId)
          return next
        })
      }

      teamOverridesRef.current.delete(registrationId)
      setPendingRegistrations((prev) => prev.filter((entry) => entry.id !== registrationId))
    },
    [isTempRegistrationId, pendingRegistrations]
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
      setTeamOrder((prev) => prev.filter((id) => id !== teamId))
      setTeamNameOverrides((prev) => {
        if (!(teamId in prev)) return prev
        const next = { ...prev }
        delete next[teamId]
        return next
      })
      if (teamPickerId === teamId) {
        setTeamPickerId(null)
        setTeamPickerQuery('')
      }
    },
    [teamPickerId]
  )

  const openTeamPicker = useCallback((teamId: string) => {
    setTeamPickerId(teamId)
    setTeamPickerQuery('')
  }, [])

  const closeTeamPicker = useCallback(() => {
    setTeamPickerId(null)
    setTeamPickerQuery('')
  }, [])

  const replaceTeamAssignments = useCallback(
    (currentTeamId: string, nextTeamId: string, nextTeamName: string) => {
      if (!currentTeamId || currentTeamId === nextTeamId) {
        closeTeamPicker()
        return
      }
      setTeamOrder((prev) => {
        if (prev.length === 0) return prev
        if (prev.includes(nextTeamId) && nextTeamId !== currentTeamId) return prev
        return prev.map((id) => (id === currentTeamId ? nextTeamId : id))
      })
      setPendingRegistrations((prev) =>
        prev.map((reg) => {
          const regTeamId = reg.teamId ?? reg.team?.id ?? null
          if (regTeamId !== currentTeamId) return reg
          if (isTempRegistrationId(reg.id)) {
            updatePendingAddition(reg.id, { teamId: nextTeamId })
          }
          teamOverridesRef.current.set(reg.id, { teamId: nextTeamId, teamName: nextTeamName })
          return {
            ...reg,
            teamId: nextTeamId,
            team: { id: nextTeamId, name: nextTeamName },
          }
        })
      )

      setExtraTeams((prev) => prev.filter((team) => team.id !== currentTeamId))
      setRevealedTeamIds((prev) => prev.filter((id) => id !== currentTeamId))
      setTeamNameOverrides((prev) => {
        if (!(currentTeamId in prev)) return prev
        const next = { ...prev }
        delete next[currentTeamId]
        return next
      })
      setLockedTeamIds((prev) => {
        if (!prev.has(currentTeamId)) return prev
        const next = new Set(prev)
        next.delete(currentTeamId)
        next.add(nextTeamId)
        return next
      })
      closeTeamPicker()
    },
    [closeTeamPicker, isTempRegistrationId, updatePendingAddition]
  )

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
      const draggedReg = pendingRegistrations.find((reg) => reg.id === registrationId)
      const draggedTeamId = draggedReg?.teamId ?? draggedReg?.team?.id ?? null
      if (draggedTeamId && isTeamLocked(draggedTeamId)) {
        return
      }
      if (teamId && isTeamLocked(teamId)) {
        return
      }
      if (teamId === null) {
        moveRegistrationToTeam(registrationId, null)
        return
      }
      if (isTeamModalOpen) {
        const targetTeamClass =
          pendingRegistrations.find((reg) => (reg.teamId ?? reg.team?.id) === teamId)?.carClass
            .id || emptyTeamCarClassOverrides[teamId]
        if (targetTeamClass && draggedReg && draggedReg.carClass.id !== targetTeamClass) {
          setCrossClassWarning({
            registrationId,
            teamId,
            targetClassId: targetTeamClass,
          })
          return
        }
      }
      moveRegistrationToTeam(registrationId, teamId)
    },
    [
      emptyTeamCarClassOverrides,
      isTeamLocked,
      isTeamModalOpen,
      moveRegistrationToTeam,
      pendingRegistrations,
    ]
  )

  const handleDropOnNewTeam = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const registrationId = event.dataTransfer.getData('text/plain')
      if (!registrationId) return
      const draggedReg = pendingRegistrations.find((reg) => reg.id === registrationId)
      const draggedTeamId = draggedReg?.teamId ?? draggedReg?.team?.id ?? null
      if (draggedTeamId && isTeamLocked(draggedTeamId)) {
        return
      }
      const newTeam = revealOrCreateTeam()
      moveRegistrationToTeam(registrationId, newTeam.id, newTeam.name)
    },
    [isTeamLocked, moveRegistrationToTeam, pendingRegistrations, revealOrCreateTeam]
  )

  const isDropdownOpen = isAddDriverOpen || isRegisterOpen
  const isOverlayOpen = isDropdownOpen || isDropConfirming || isTeamModalOpen

  useEffect(() => {
    if (lastDropdownState.current === isOverlayOpen) return
    lastDropdownState.current = isOverlayOpen
    onDropdownToggle?.(isOverlayOpen)
  }, [isOverlayOpen, onDropdownToggle])

  useEffect(() => {
    if (!teamPickerId) return
    const handleClickOutside = (event: MouseEvent) => {
      if (teamPickerRef.current && !teamPickerRef.current.contains(event.target as Node)) {
        setTeamPickerId(null)
        setTeamPickerQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [teamPickerId])

  useEffect(() => {
    if (!isTeamModalOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeamOrder((prev) => {
      const seen = new Set(prev)
      const next = [...prev]

      teamList.forEach((team) => {
        if (seen.has(team.id)) return
        if (!revealedTeamSet.has(team.id)) {
          const hasRegs = pendingRegistrations.some(
            (reg) => (reg.teamId ?? reg.team?.id) === team.id
          )
          if (!hasRegs) return
        }
        seen.add(team.id)
        next.push(team.id)
      })

      revealedTeamIds.forEach((id) => {
        if (seen.has(id)) return
        seen.add(id)
        next.push(id)
      })

      pendingRegistrations.forEach((reg) => {
        const id = reg.teamId ?? reg.team?.id ?? 'unassigned'
        if (seen.has(id)) return
        seen.add(id)
        next.push(id)
      })

      return next
    })
  }, [isTeamModalOpen, pendingRegistrations, revealedTeamIds, revealedTeamSet, teamList])

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
    async (driver: Driver, teamId: string | null, carClassId: string) => {
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
      let driverDetails: DriverDetailsResponse | null = null
      try {
        const response = await fetch(`/api/drivers/${driver.id}`)
        if (response.ok) {
          driverDetails = (await response.json()) as DriverDetailsResponse
        }
      } catch (error) {
        console.error('Failed to fetch selected driver details:', error)
      }
      const isManual = driverDetails?.type === 'manual'
      const name = driverDetails?.name ?? driver.name
      const image = driverDetails?.image ?? driver.image
      const tempReg: RaceWithRegistrations['registrations'][0] & { isPending?: boolean } = {
        id: tempId,
        carClass: {
          id: carClass.id,
          name: carClass.name,
          shortName: carClass.shortName,
        },
        userId: isManual ? null : driver.id,
        manualDriverId: isManual ? driver.id : null,
        manualDriver: isManual
          ? {
              id: driver.id,
              name: name || 'Manual Driver',
              irating: driverDetails && driverDetails.type === 'manual' ? driverDetails.irating : 0,
              image: image || null,
            }
          : null,
        teamId,
        team: teamId ? { id: teamId, name: teamName || 'Team' } : null,
        user: isManual
          ? null
          : {
              name,
              image: image || null,
              racerStats:
                driverDetails && driverDetails.type === 'user' ? driverDetails.racerStats : [],
            },
        isPending: true,
      }

      setPendingRegistrations((prev) => [...prev, tempReg])
      setPendingAdditions((prev) => [
        ...prev,
        isManual
          ? {
              tempId,
              manualDriverId: driver.id,
              carClassId: carClass.id,
              teamId,
            }
          : {
              tempId,
              userId: driver.id,
              carClassId: carClass.id,
              teamId,
            },
      ])
    },
    [carClasses, pendingDrops, race.registrations, teamNameById]
  )

  const showTeamsInCard = teamsAssigned
  const canAssignTeams = isAdmin && !isRaceCompleted
  const enableDrag = canAssignTeams && isTeamModalOpen
  const currentUserRegistration = pendingRegistrations.find((reg) => reg.userId === userId)
  const isCurrentUserAssignedToTeam = !!(
    currentUserRegistration &&
    (currentUserRegistration.teamId ?? currentUserRegistration.team?.id)
  )
  const canShowClassChangeAction = !!currentUserRegistration && !isCurrentUserAssignedToTeam

  const saveChangeSummary = useMemo(() => {
    const originalRecords = race.registrations.map((reg) => ({
      id: reg.id,
      driverName: reg.user?.name || reg.manualDriver?.name || 'Driver',
      teamId: reg.teamId ?? reg.team?.id ?? null,
      teamName: reg.team?.alias || reg.team?.name,
      carClassName: reg.carClass.shortName || reg.carClass.name,
    }))
    const pendingRecords = pendingRegistrations.map((reg) => ({
      id: reg.id,
      driverName: reg.user?.name || reg.manualDriver?.name || 'Driver',
      teamId: reg.teamId ?? reg.team?.id ?? null,
      teamName: reg.team?.alias || reg.team?.name,
      carClassName: reg.carClass.shortName || reg.carClass.name,
    }))
    const assignedTeamIds = new Set(
      pendingRecords.map((reg) => reg.teamId).filter((id): id is string => Boolean(id))
    )
    const newlyFormedTeamNames = extraTeams
      .filter((team) => assignedTeamIds.has(team.id))
      .map((team) => team.name)

    return buildTeamChangeSummary({
      originalRecords,
      pendingRecords,
      existingThreads: (race.discordTeamThreads as Record<string, string> | null) ?? null,
      teamNameById,
      newlyFormedTeamNames,
    })
  }, [extraTeams, pendingRegistrations, race.registrations, race.discordTeamThreads, teamNameById])

  const renderDriverRow = (
    reg: RaceWithRegistrations['registrations'][0],
    options?: { allowAdminEdits?: boolean; inUnassignedTile?: boolean; isTeamLocked?: boolean }
  ) => {
    const allowAdminEdits = options?.allowAdminEdits ?? false
    const inUnassignedTile = options?.inUnassignedTile ?? false
    const isTeamLockedForRow = options?.isTeamLocked ?? false
    const canShowAdminTeamPickerActions = isAdmin && allowAdminEdits && isTeamModalOpen
    const showRowActions = canShowAdminTeamPickerActions && !isRaceCompleted
    const canDragThisRow =
      enableDrag && allowAdminEdits && isTeamModalOpen && canAssignTeams && !isTeamLockedForRow
    const hasTeamAssigned = !!(reg.teamId ?? reg.team?.id)
    const canEditCarClass = allowAdminEdits && isAdmin && !isRaceCompleted && !hasTeamAssigned
    const driverName = reg.user?.name || reg.manualDriver?.name || 'Driver'
    const driverImage = reg.user?.image || reg.manualDriver?.image
    const preferredStats = getPreferredStats(reg)
    const manualRating = reg.manualDriver?.irating
    const hasStats = preferredStats || manualRating !== undefined
    const licenseColor = preferredStats ? getLicenseColor(preferredStats.groupName) : '#94a3b8'
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
        draggable={canDragThisRow}
        onDragStart={(event) => {
          if (!canDragThisRow) return
          event.dataTransfer.setData('text/plain', reg.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
        {canDragThisRow && (
          <span className={styles.dragHandle} title="Drag to move driver">
            <GripVertical size={14} />
          </span>
        )}
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
              <span
                className={styles.statsBadge}
                style={{
                  borderColor: licenseColor || undefined,
                  backgroundColor: lightBg,
                  color: licenseColor || undefined,
                }}
              >
                {hasStats ? (
                  <>
                    {licenseLabel} {safetyRating} {irating}
                  </>
                ) : (
                  <>
                    <ShieldX size={14} color="#ef4444" /> Unknown
                  </>
                )}
              </span>
            </div>
            <div className={styles.driverPills}>
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
        {showRowActions && (
          <div className={styles.driverTimeslot}>
            <div className={styles.actionRow}>
              {inUnassignedTile ? (
                <DropRegistrationButton
                  registrationId={reg.id}
                  onConfirmingChange={setIsDropConfirming}
                  isAssignedToTeam={hasTeamAssigned}
                  confirmStyle="inline"
                  onConfirmDrop={() => handlePendingDrop(reg.id)}
                />
              ) : (
                !isTeamLockedForRow && (
                  <button
                    type="button"
                    className={styles.driverUnassignButton}
                    onClick={() => moveRegistrationToTeam(reg.id, null)}
                    title="Move to unassigned"
                  >
                    <CornerDownLeft size={14} />
                  </button>
                )
              )}
            </div>
          </div>
        )}
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

    const sortedTeams: string[] = []
    const seenTeams = new Set<string>()

    if (isTeamModalOpen) {
      teamOrder.forEach((teamId) => {
        if (seenTeams.has(teamId)) return
        seenTeams.add(teamId)
        sortedTeams.push(teamId)
      })

      teamList.forEach((team) => {
        if (seenTeams.has(team.id)) return
        if (!grouped[team.id] && !revealedTeamSet.has(team.id)) return
        seenTeams.add(team.id)
        sortedTeams.push(team.id)
      })

      revealedTeamIds.forEach((teamId) => {
        if (seenTeams.has(teamId)) return
        seenTeams.add(teamId)
        sortedTeams.push(teamId)
      })

      Object.keys(grouped).forEach((teamId) => {
        if (seenTeams.has(teamId)) return
        seenTeams.add(teamId)
        sortedTeams.push(teamId)
      })

      if (includeAddTeam && !seenTeams.has('unassigned')) {
        sortedTeams.push('unassigned')
      }
    } else {
      teamList.forEach((team) => {
        if (seenTeams.has(team.id)) return
        if (!grouped[team.id] && !revealedTeamSet.has(team.id)) return
        seenTeams.add(team.id)
        sortedTeams.push(team.id)
      })

      revealedTeamIds.forEach((teamId) => {
        if (seenTeams.has(teamId)) return
        seenTeams.add(teamId)
        sortedTeams.push(teamId)
      })

      Object.keys(grouped).forEach((teamId) => {
        if (seenTeams.has(teamId)) return
        seenTeams.add(teamId)
        sortedTeams.push(teamId)
      })

      if (includeAddTeam && !seenTeams.has('unassigned')) {
        sortedTeams.push('unassigned')
      }
    }

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
      const teamCarClassId = teamRegistrations[0]?.carClass.id || emptyTeamCarClassOverrides[teamId]
      const teamCarClassLabel =
        teamRegistrations[0]?.carClass.shortName ||
        teamRegistrations[0]?.carClass.name ||
        carClasses.find((cc) => cc.id === emptyTeamCarClassOverrides[teamId])?.shortName ||
        carClasses.find((cc) => cc.id === emptyTeamCarClassOverrides[teamId])?.name
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
            if (!canAssignTeams || !allowAdminEdits) return
            if (isLocked) return
            event.preventDefault()
            setDragOverTeamId(teamId)
          }}
          onDragLeave={() => setDragOverTeamId(null)}
          onDrop={(event) => {
            if (!canAssignTeams || !allowAdminEdits) return
            if (isLocked) return
            setDragOverTeamId(null)
            handleDropOnTeam(teamId === 'unassigned' ? null : teamId)(event)
          }}
        >
          <div className={styles.teamGroupHeader}>
            <Users size={14} />
            <div className={styles.teamHeaderContent}>
              <div className={styles.teamHeaderRow}>
                {allowAdminEdits && isTeamModalOpen && teamId !== 'unassigned' ? (
                  <div
                    className={styles.teamNamePicker}
                    ref={teamPickerId === teamId ? teamPickerRef : null}
                  >
                    <button
                      type="button"
                      className={styles.teamNameButton}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isLocked) return
                        if (teamPickerId === teamId) {
                          closeTeamPicker()
                        } else {
                          openTeamPicker(teamId)
                        }
                      }}
                      title="Change team"
                      disabled={isLocked}
                    >
                      <span className={styles.teamNameText}>
                        {unassignedLabel ?? getTeamLabel(teamId)}
                      </span>
                      <ChevronDown size={12} />
                    </button>
                    {teamPickerId === teamId && !isLocked && (
                      <div className={styles.teamPickerDropdown}>
                        <input
                          className={styles.teamPickerInput}
                          placeholder="Search teams..."
                          value={teamPickerQuery}
                          onChange={(event) => setTeamPickerQuery(event.target.value)}
                          autoFocus
                        />
                        <div className={styles.teamPickerList}>
                          {(() => {
                            const usedTeamIds = new Set<string>()
                            pendingRegistrations.forEach((reg) => {
                              const id = reg.teamId ?? reg.team?.id
                              if (id) usedTeamIds.add(id)
                            })
                            revealedTeamIds.forEach((id) => usedTeamIds.add(id))
                            const availableTeams = teams.filter(
                              (team) => !usedTeamIds.has(team.id) || team.id === teamId
                            )
                            const rawQuery = teamPickerQuery.trim()
                            const queryLower = rawQuery.toLowerCase()
                            const filteredTeams = queryLower
                              ? availableTeams.filter((team) =>
                                  team.name.toLowerCase().includes(queryLower)
                                )
                              : availableTeams
                            const hasExactMatch = availableTeams.some(
                              (team) => team.name.toLowerCase() === queryLower
                            )

                            if (filteredTeams.length === 0 && !rawQuery) {
                              return (
                                <div className={styles.teamPickerEmpty}>No teams available</div>
                              )
                            }

                            return (
                              <>
                                {filteredTeams.map((team) => (
                                  <button
                                    key={team.id}
                                    type="button"
                                    className={styles.teamPickerItem}
                                    onClick={() =>
                                      replaceTeamAssignments(teamId, team.id, team.name)
                                    }
                                  >
                                    {team.name}
                                  </button>
                                ))}
                                {rawQuery && !hasExactMatch && (
                                  <button
                                    type="button"
                                    className={styles.teamPickerCreate}
                                    onClick={() => {
                                      const created = createTempTeam(rawQuery)
                                      replaceTeamAssignments(teamId, created.id, created.name)
                                    }}
                                  >
                                    Create &quot;{rawQuery}&quot;
                                  </button>
                                )}
                                {filteredTeams.length === 0 && rawQuery && hasExactMatch && (
                                  <div className={styles.teamPickerEmpty}>No teams available</div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span>{unassignedLabel ?? getTeamLabel(teamId)}</span>
                )}
                {teamId !== 'unassigned' && (
                  <div style={{ marginLeft: 'auto' }}>
                    {(() => {
                      const guildId = discordGuildId
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const threads = race.discordTeamThreads as any
                      const threadId = threads?.[teamId]
                      if (guildId && threadId) {
                        return (
                          <a
                            href={buildDiscordAppLink({ guildId, threadId })}
                            className={styles.discordLink}
                            title="Join the team discussion on Discord"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DiscussionIcon size={16} />
                          </a>
                        )
                      }
                      return (
                        <span
                          className={`${styles.discordLink} ${styles.discordLinkInactive}`}
                          title="The team thread has not been generated yet"
                        >
                          <DiscussionIcon size={16} />
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>
              {teamId !== 'unassigned' && (
                <div className={styles.teamGroupMeta}>
                  <EditableCarClass
                    registrationId={`${teamId}-header`}
                    currentCarClassId={teamCarClassId ?? ''}
                    currentCarClassShortName={teamCarClassLabel || ''}
                    placeholderLabel="-"
                    carClasses={carClasses}
                    deferSubmit
                    pillStyle="group"
                    onChange={(classId) => {
                      if (isLocked) return
                      if (!isTeamModalOpen) return
                      if (teamRegistrations.length > 0 && classId !== teamCarClassId) {
                        setTeamClassWarning({ teamId, targetClassId: classId })
                        return
                      }
                      if (teamRegistrations.length === 0) {
                        setEmptyTeamCarClassOverrides((prev) => {
                          if (prev[teamId] === classId) return prev
                          return { ...prev, [teamId]: classId }
                        })
                        return
                      }
                      teamRegistrations.forEach((reg) =>
                        handleCarClassChange(reg.id, classId, { enforceTeamClass: false })
                      )
                    }}
                    readOnly={!allowAdminEdits || !isTeamModalOpen || isLocked}
                    showLabel={false}
                    variant="pill"
                    className={styles.carClassPill}
                  />
                  <span className={styles.teamSof}>{avgRating} SOF</span>
                </div>
              )}
            </div>
            {allowAdminEdits && teamId !== 'unassigned' && (
              <div className={styles.teamHeaderActions}>
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
                {includeAddTeam && canAssignTeams && (
                  <button
                    type="button"
                    className={styles.teamRemoveButton}
                    onClick={() => removeTeam(teamId)}
                    title="Remove team"
                    disabled={isLocked}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={teamId === 'unassigned' ? styles.unassignedGrid : undefined}>
            {teamRegistrations.map((reg) =>
              renderDriverRow(reg, {
                allowAdminEdits,
                inUnassignedTile: teamId === 'unassigned',
                isTeamLocked: isLocked,
              })
            )}
          </div>
          {teamClassWarning?.teamId === teamId && (
            <div className={styles.teamInlineWarningOverlay}>
              <div className={styles.teamInlineWarning}>
                <p>This will change everyone’s car class within this team.</p>
                <div className={styles.teamInlineWarningActions}>
                  <button
                    type="button"
                    className={styles.warningConfirm}
                    onClick={() => {
                      const { targetClassId } = teamClassWarning
                      setTeamClassWarning(null)
                      teamRegistrations.forEach((reg) =>
                        handleCarClassChange(reg.id, targetClassId, { enforceTeamClass: false })
                      )
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.warningCancel}
                    onClick={() => setTeamClassWarning(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
          {includeAddTeam && canAssignTeams && teamId !== 'unassigned' && !isLocked && (
            <div className={styles.addDriverInline}>
              <AdminDriverSearch
                raceId={race.id}
                registeredUserIds={registeredUserIds}
                allDrivers={allDrivers}
                defaultCarClassId={
                  teamRegistrations[0]?.carClass.id ||
                  emptyTeamCarClassOverrides[teamId] ||
                  lastDriverCarClass
                }
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

    const classOrderById = new Map<string, number>()
    carClasses.forEach((carClass, index) => {
      classOrderById.set(carClass.id, index)
    })
    pendingRegistrations.forEach((reg) => {
      if (!classOrderById.has(reg.carClass.id)) {
        classOrderById.set(reg.carClass.id, classOrderById.size)
      }
    })

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
      return Array.from(byClass.entries())
        .sort(([leftClassId, leftRegs], [rightClassId, rightRegs]) => {
          const leftOrder = classOrderById.get(leftClassId) ?? Number.MAX_SAFE_INTEGER
          const rightOrder = classOrderById.get(rightClassId) ?? Number.MAX_SAFE_INTEGER
          if (leftOrder !== rightOrder) return leftOrder - rightOrder

          const leftLabel =
            leftRegs[0]?.carClass.shortName || leftRegs[0]?.carClass.name || leftClassId
          const rightLabel =
            rightRegs[0]?.carClass.shortName || rightRegs[0]?.carClass.name || rightClassId
          return leftLabel.localeCompare(rightLabel)
        })
        .map(([classId, regs]) =>
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
            revealOrCreateTeam()
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

    if (!isTeamModalOpen) {
      return (
        <>
          <div className={styles.teamGrid}>
            {[...assignedTiles, ...(addTeamTile ? [addTeamTile] : [])]}
          </div>
          {unassignedTiles.length > 0 && (
            <>
              {(assignedTiles.length > 0 || addTeamTile) && (
                <div className={styles.teamGridSeparatorStandalone} aria-hidden />
              )}
              <div className={styles.teamGrid}>{unassignedTiles}</div>
            </>
          )}
        </>
      )
    }

    const renderedTeams = [
      ...baseAssigned,
      ...(baseAssigned.length > 0 && unassignedTiles.length > 0
        ? [<div key="unassigned-separator" className={styles.teamGridSeparator} aria-hidden />]
        : []),
      ...unassignedTiles,
    ]

    return <div className={styles.teamGrid}>{renderedTeams}</div>
  }

  return (
    <div className={styles.raceCard} data-timeslot-tile>
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
          {(() => {
            const guildId = discordGuildId
            const threadId = race.discordTeamsThreadId
            if (guildId && threadId) {
              return (
                <a
                  href={buildDiscordAppLink({ guildId, threadId })}
                  className={styles.discordLink}
                  title="Join the event discussion in Discord"
                >
                  <DiscussionIcon size={20} />
                </a>
              )
            }
            return (
              <span
                className={`${styles.discordLink} ${styles.discordLinkInactive}`}
                style={{ marginLeft: '12px' }}
                title="The event thread has not been generated yet"
              >
                <DiscussionIcon size={20} />
              </span>
            )
          })()}
        </div>

        {pendingRegistrations.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">No drivers registered for this race.</p>
        ) : (
          <div className={styles.driverList}>{renderTeamGrid()}</div>
        )}

        {isAdmin && !isRaceCompleted && (
          <div className={styles.registrationControls}>
            {isUserRegistered && currentUserRegistration ? (
              <>
                {canShowClassChangeAction && (
                  <div className={styles.quickRegWrapper}>
                    <EditableCarClass
                      registrationId={currentUserRegistration.id}
                      currentCarClassId={currentUserRegistration.carClass.id}
                      currentCarClassShortName={
                        currentUserRegistration.carClass.shortName ||
                        currentUserRegistration.carClass.name
                      }
                      carClasses={carClasses}
                      variant="full"
                      showLabel={false}
                    />
                  </div>
                )}
                <div className={styles.quickRegWrapper}>
                  <DropRegistrationButton
                    registrationId={currentUserRegistration.id}
                    onConfirmingChange={setIsDropConfirming}
                    variant="full"
                    isAssignedToTeam={isCurrentUserAssignedToTeam}
                  />
                </div>
              </>
            ) : (
              <div className={styles.quickRegWrapper}>
                <QuickRegistration
                  raceId={race.id}
                  carClasses={carClasses}
                  compact
                  onDropdownToggle={setIsRegisterOpen}
                />
              </div>
            )}
            <div className={styles.adminActionsCluster}>
              <div className={styles.adminActionsLabel}>Admin Actions</div>
              <div className={styles.adminActionsRow}>
                <div className={styles.adminActionSlot}>
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
                <div className={styles.adminActionSlot}>
                  <TeamPickerTrigger
                    onOpen={() => {
                      teamOverridesRef.current = new Map()
                      setPendingAdditions([])
                      setPendingDrops(new Set())
                      setIsTeamModalOpen(true)
                      initializeLockedTeams()
                    }}
                    disabled={!canAssignTeams}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {!isRaceCompleted &&
          !isAdmin &&
          (isUserRegistered && currentUserRegistration ? (
            <div className={styles.registrationActionContainer}>
              <div
                className={`${styles.userActionStack} ${
                  !canShowClassChangeAction ? styles.userActionStackSingle : ''
                }`}
              >
                {canShowClassChangeAction && (
                  <EditableCarClass
                    registrationId={currentUserRegistration.id}
                    currentCarClassId={currentUserRegistration.carClass.id}
                    currentCarClassShortName={
                      currentUserRegistration.carClass.shortName ||
                      currentUserRegistration.carClass.name
                    }
                    carClasses={carClasses}
                    variant="full"
                    showLabel={false}
                  />
                )}
                <DropRegistrationButton
                  registrationId={currentUserRegistration.id}
                  onConfirmingChange={setIsDropConfirming}
                  variant="full"
                  isAssignedToTeam={isCurrentUserAssignedToTeam}
                />
              </div>
            </div>
          ) : (
            <QuickRegistration
              raceId={race.id}
              carClasses={carClasses}
              onDropdownToggle={setIsRegisterOpen}
            />
          ))}

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
                {saveError && (
                  <div className={styles.errorModalOverlay} onClick={() => setSaveError('')}>
                    <div className={styles.errorModal} onClick={(event) => event.stopPropagation()}>
                      <h4 className={styles.errorModalTitle}>Save failed</h4>
                      <p className={styles.errorModalMessage}>{saveError}</p>
                      <button
                        type="button"
                        className={styles.errorModalButton}
                        onClick={() => setSaveError('')}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {crossClassWarning && (
                  <div
                    className={styles.warningModalOverlay}
                    onClick={() => setCrossClassWarning(null)}
                  >
                    <div
                      className={styles.warningModal}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <h4 className={styles.warningModalTitle}>Confirm car class change</h4>
                      <p className={styles.warningModalMessage}>
                        Placing the driver on this team will change their car class. Are you sure
                        you want to do this?
                      </p>
                      <div className={styles.warningModalActions}>
                        <button
                          type="button"
                          className={styles.warningConfirm}
                          onClick={() => {
                            const { registrationId, teamId, targetClassId } = crossClassWarning
                            setCrossClassWarning(null)
                            moveRegistrationToTeamWithClass(registrationId, teamId, targetClassId)
                          }}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          className={styles.warningCancel}
                          onClick={() => setCrossClassWarning(null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className={styles.saveConfirmWrapper}>
                  <button
                    type="button"
                    className={styles.teamModalSave}
                    onClick={() => setSaveConfirming(true)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save and Notify'}
                  </button>
                </div>
              </div>
              {saveConfirming && (
                <div
                  className={styles.warningModalOverlay}
                  onClick={() => setSaveConfirming(false)}
                >
                  <div className={styles.warningModal} onClick={(event) => event.stopPropagation()}>
                    <h4 className={styles.warningModalTitle}>Confirm Save and Notify</h4>
                    {saveChangeSummary.teamChanges.length === 0 &&
                      saveChangeSummary.newlyFormedTeams.length === 0 &&
                      saveChangeSummary.destructiveChanges.length === 0 &&
                      saveChangeSummary.discordThreadsToCreate.length === 0 && (
                        <p className={styles.warningModalMessage}>No changes detected.</p>
                      )}
                    {(saveChangeSummary.teamChanges.length > 0 ||
                      saveChangeSummary.newlyFormedTeams.length > 0) && (
                      <div className={styles.saveReviewSection}>
                        <p className={styles.saveReviewTitle}>Team Changes</p>
                        <div className={styles.saveSummaryList}>
                          {saveChangeSummary.teamChanges.map((line) => (
                            <p key={line} className={styles.saveSummaryItem}>
                              {line}
                            </p>
                          ))}
                          {saveChangeSummary.newlyFormedTeams.map((teamName) => (
                            <p key={`created-${teamName}`} className={styles.saveSummaryItem}>
                              Created team {teamName}.
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {saveChangeSummary.destructiveChanges.length > 0 && (
                      <div className={styles.saveReviewSection}>
                        <p className={styles.saveReviewTitle}>Destructive Changes</p>
                        <div className={styles.saveSummaryList}>
                          {saveChangeSummary.destructiveChanges.map((line) => (
                            <p
                              key={line}
                              className={`${styles.saveSummaryItem} ${styles.saveSummaryDestructive}`}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {saveChangeSummary.discordThreadsToCreate.length > 0 && (
                      <div className={styles.saveReviewSection}>
                        <p className={styles.saveReviewTitle}>Discord Threads To Create</p>
                        <div className={styles.saveSummaryList}>
                          {saveChangeSummary.discordThreadsToCreate.map((teamName) => (
                            <p key={teamName} className={styles.saveSummaryItem}>
                              Create thread for {teamName}.
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={styles.warningModalActions}>
                      <button
                        type="button"
                        className={styles.warningConfirm}
                        onClick={handleSave}
                        aria-label="Confirm save and notify"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        className={styles.warningCancel}
                        onClick={() => setSaveConfirming(false)}
                        aria-label="Cancel save and notify"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
