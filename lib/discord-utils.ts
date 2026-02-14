export interface WeeklyScheduleEvent {
  name: string
  track: string
  startTime: Date
  endTime: Date
  raceTimes: Date[]
  tempValue?: number | null
  precipChance?: number | null
  carClasses: string[]
  registeredUsers: { name: string; discordId?: string }[]
  eventUrl: string
}

export interface RaceTimeslotData {
  raceStartTime: Date
  teams: Array<{
    name: string
    carClassName?: string
    avgSof?: number
    threadUrl?: string
    members: Array<{
      name: string
      carClass: string
      discordId?: string
      registrationId?: string
    }>
  }>
  unassigned?: Array<{
    name: string
    carClass: string
    discordId?: string
    registrationId?: string
  }>
}

export type RosterChange =
  | { type: 'added'; driverName: string; teamName: string }
  | { type: 'dropped'; driverName: string; fromTeam?: string }
  | { type: 'moved'; driverName: string; fromTeam: string; toTeam: string }
  | { type: 'unassigned'; driverName: string; fromTeam: string }
  | {
      type: 'teamClassChanged'
      teamName: string
      fromClass: string
      toClass: string
      drivers: string[]
    }

export interface TeamsAssignedNotificationData {
  eventName: string
  raceUrl: string
  track?: string
  trackConfig?: string
  tempValue?: number | null
  precipChance?: number | null
  carClasses: string[]
  timeslots: RaceTimeslotData[]
  threadId?: string | null
  mentionRegistrationIds?: string[]
  sendChatNotification?: boolean
  chatNotificationLabel?: string
  rosterChanges?: RosterChange[]
  teamThreads?: Record<string, string>
  teamNameById?: Map<string, string>
  adminName?: string
}

export interface RegistrationNotificationData {
  userName: string
  userAvatarUrl?: string
  eventName: string
  raceStartTime: Date
  carClassName: string
  eventUrl: string
  discordUser?: { id: string; name: string }
  otherRegisteredDrivers?: Array<{ name: string; carClassName: string; discordId?: string }>
  threadId: string
  guildId: string
}

type DiscordMessageComponent = Record<string, unknown>

function buildRegisteredByClassGroups(
  entries: Array<{ name: string; carClassName: string; discordId?: string }>,
  maxDrivers = 16
) {
  const grouped = new Map<string, string[]>()

  entries.slice(0, maxDrivers).forEach((entry) => {
    const className = entry.carClassName || 'Unknown Class'
    const list = grouped.get(className) ?? []
    list.push(entry.discordId ? `<@${entry.discordId}>` : entry.name)
    grouped.set(className, list)
  })

  return {
    grouped,
    truncatedCount: Math.max(entries.length - maxDrivers, 0),
  }
}

function formatRegisteredByClass(
  entries: Array<{ name: string; carClassName: string; discordId?: string }>,
  maxDrivers = 16
): string {
  const { grouped, truncatedCount } = buildRegisteredByClassGroups(entries, maxDrivers)

  const lines: string[] = []
  grouped.forEach((drivers, className) => {
    lines.push(`**${className}**`)
    lines.push(...drivers)
  })

  if (truncatedCount > 0) {
    lines.push(`...and ${truncatedCount} more`)
  }

  return lines.length > 0 ? lines.join('\n') : 'No one else yet.'
}

export interface OnboardingNotificationData {
  userName: string
  userAvatarUrl?: string
  iracingCustomerId: string
  iracingName?: string
  profileUrl: string
  discordUser?: { id: string; name: string }
}

/** Build a `discord://-/channels/...` deep link that opens the Discord
 * desktop/mobile app.  Use this for links displayed on web pages (e.g.
 * RaceDetails) so that they open the app instead of the browser. */
export function buildDiscordAppLink(options: { guildId: string; threadId: string }) {
  return `discord://-/channels/${options.guildId}/${options.threadId}`
}

/** Build an `https://discord.com/channels/...` link that works well within any
 * Discord client.  Use this for links embedded in Discord notifications so they
 * render as clickable links appropriately within the same platform. */
export function buildDiscordWebLink(options: { guildId: string; threadId: string }) {
  return `https://discord.com/channels/${options.guildId}/${options.threadId}`
}

export function normalizeSeriesName(name: string) {
  return name
    .replace(/\s[-–—]\s\d{4}.*$/i, '')
    .replace(/\s[-–—]\sSeason\s?\d+.*$/i, '')
    .replace(/\s[-–—]\sWeek\s?\d+.*$/i, '')
    .trim()
}

export function chunkLines(lines: string[], maxLength = 1800) {
  const chunks: string[] = []
  let current = ''

  for (let line of lines) {
    // If the single line itself is longer than maxLength, it must be split
    if (line.length > maxLength) {
      // First push current if it has content
      if (current.length) {
        chunks.push(current)
        current = ''
      }

      // Split the long line into multiple chunks
      while (line.length > maxLength) {
        chunks.push(line.slice(0, maxLength))
        line = line.slice(maxLength)
      }
      current = line
      continue
    }

    const next = current.length ? `${current}\n${line}` : line
    if (next.length > maxLength) {
      chunks.push(current)
      current = line
    } else {
      current = next
    }
  }

  if (current.length) {
    chunks.push(current)
  }
  return chunks
}

export function formatTeamLines(
  teams: RaceTimeslotData['teams'],
  unassigned: RaceTimeslotData['unassigned']
) {
  const lines: string[] = []
  teams.forEach((team) => {
    const classLabel = team.carClassName ? ` • ${team.carClassName}` : ''
    const sofLabel = typeof team.avgSof === 'number' ? ` • ${team.avgSof} SOF` : ''
    lines.push(`**${team.name}**${classLabel}${sofLabel}`)
    if (team.threadUrl) {
      lines.push(`↳ [Team Thread](${team.threadUrl})`)
    }
    if (team.members.length === 0) {
      lines.push('• _No drivers assigned_')
      lines.push('')
      return
    }
    team.members.forEach((member) => {
      const label = member.discordId ? `<@${member.discordId}>` : member.name
      lines.push(`• ${label}`)
    })
    lines.push('')
  })

  if (unassigned && unassigned.length > 0) {
    lines.push('**Unassigned**')
    unassigned.forEach((member) => {
      const label = member.discordId ? `<@${member.discordId}>` : member.name
      lines.push(`• ${label}`)
    })
    lines.push('')
  }

  return lines
}

export function formatMultiTimeslotTeamLines(
  timeslots: RaceTimeslotData[],
  options?: { locale?: string; timeZone?: string }
) {
  const locale = options?.locale ?? 'en-US'
  const timeZone = options?.timeZone ?? 'America/Los_Angeles'
  const lines: string[] = []

  for (const slot of timeslots) {
    const timeLabel = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone,
    }).format(slot.raceStartTime)

    lines.push(`━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`⏰ **${timeLabel}**`)
    lines.push(`━━━━━━━━━━━━━━━━━━━━`)
    lines.push('')

    const teamLines = formatTeamLines(slot.teams, slot.unassigned)
    if (teamLines.length === 0) {
      lines.push('_No teams or drivers assigned yet._')
      lines.push('')
    } else {
      lines.push(...teamLines)
    }
  }

  return lines
}

/** Collect a map of registrationId → discordId from all timeslots. */
export function collectDiscordIds(timeslots: RaceTimeslotData[]): Map<string, string> {
  const ids = new Map<string, string>()
  for (const slot of timeslots) {
    for (const team of slot.teams) {
      for (const member of team.members) {
        if (member.registrationId && member.discordId) {
          ids.set(member.registrationId, member.discordId)
        }
      }
    }
    if (slot.unassigned) {
      for (const member of slot.unassigned) {
        if (member.registrationId && member.discordId) {
          ids.set(member.registrationId, member.discordId)
        }
      }
    }
  }
  return ids
}

/** Format a date in ISO format (YYYY-MM-DD) for Discord thread names. */
export function formatISODate(
  date: Date,
  options?: { locale?: string; timeZone?: string }
): string {
  const timeZone = options?.timeZone ?? 'America/Los_Angeles'

  // en-CA locale naturally uses YYYY-MM-DD format
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  })
  return formatter.format(date)
}

/** Build a Discord thread name for an event (date only, no specific time). */
export function buildEventThreadName(
  eventName: string,
  firstStartTime: Date,
  options?: { locale?: string; timeZone?: string }
): string {
  const cleanName = normalizeSeriesName(eventName)
  const dateLabel = formatISODate(firstStartTime, options)
  return `${cleanName} (${dateLabel})`
}

/** Format race times as Discord timestamps. */
export function formatRaceTimesValue(timeslots: RaceTimeslotData[]): string {
  return timeslots
    .map((slot) => {
      const unix = Math.floor(slot.raceStartTime.getTime() / 1000)
      return `<t:${unix}:F>`
    })
    .join('\n')
}

/** Build embeds for teams assigned notification. */
export function buildTeamsAssignedEmbeds(
  data: TeamsAssignedNotificationData,
  appTitle: string,
  options?: { locale?: string; timeZone?: string }
) {
  const locale = options?.locale ?? 'en-US'
  const timeZone = options?.timeZone ?? 'America/Los_Angeles'

  const carClasses = [...data.carClasses].sort()

  // Build event info header
  const eventInfoLines: string[] = []

  if (data.track) {
    let trackVal = data.track
    if (data.trackConfig) trackVal += ` (${data.trackConfig})`
    eventInfoLines.push(`**🏟️ Track:** ${trackVal}`)
    eventInfoLines.push('')
  }

  if (typeof data.tempValue === 'number') {
    let weather = `${data.tempValue}°F`
    if (typeof data.precipChance === 'number') {
      weather += `, ${data.precipChance}% Rain`
    }
    eventInfoLines.push(`**🌤️ Weather:** ${weather}`)
    eventInfoLines.push('')
  }

  eventInfoLines.push(`**🕐 Race Times:**`)
  data.timeslots.forEach((slot) => {
    const unix = Math.floor(slot.raceStartTime.getTime() / 1000)
    eventInfoLines.push(`• <t:${unix}:F>`)
  })
  eventInfoLines.push('')

  if (carClasses.length > 0) {
    eventInfoLines.push(`**🏎 Classes:**`)
    carClasses.forEach((carClass) => {
      eventInfoLines.push(`• ${carClass}`)
    })
    eventInfoLines.push('')
  }

  const teamLines = formatMultiTimeslotTeamLines(data.timeslots, { locale, timeZone })
  const allLines = [...eventInfoLines, ...teamLines]
  const chunks = chunkLines(allLines, 3800)

  return chunks.map((chunk, index) => {
    const seriesName = normalizeSeriesName(data.eventName)
    const title =
      index === 0 ? `🏁 Event Thread: ${seriesName}` : `🏁 Event Thread: ${seriesName} (cont.)`

    // Add official description before event info for first chunk
    let description = chunk
    if (index === 0) {
      const officialDesc = `Official preparation and coordination thread for **${seriesName}**.\n\n`
      description = officialDesc + chunk
    }

    const embed: {
      title: string
      description: string
      color: number
      url: string
      timestamp: string
      footer: { text: string }
    } = {
      title,
      description,
      color: 0x5865f2, // Blurple
      url: data.raceUrl,
      timestamp: new Date().toISOString(),
      footer: {
        text: appTitle,
      },
    }

    return embed
  })
}

/** Build a chat channel notification for teams assigned (forum-based setups). */
export function buildTeamsAssignedChatNotification(
  eventName: string,
  timeslots: RaceTimeslotData[],
  eventUrl: string,
  threadUrl: string,
  title: string,
  appTitle: string,
  adminName?: string
): Record<string, unknown> {
  const description = adminName
    ? `Teams have been assigned for **${eventName}**.\nUpdated by **${adminName}**.`
    : `Teams have been assigned for **${eventName}**!`
  return {
    embeds: [
      {
        title,
        description,
        color: 0x5865f2,
        url: threadUrl,
        fields: [
          {
            name: '🕐 Race Times',
            value: formatRaceTimesValue(timeslots),
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: appTitle,
        },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Join Event',
            url: eventUrl,
          },
          {
            type: 2,
            style: 5,
            label: 'View Thread',
            url: threadUrl,
          },
        ],
      },
    ],
  }
}

export function buildWeeklyScheduleEmbeds(events: WeeklyScheduleEvent[]) {
  return events.map((event) => {
    // Determine weather string
    let weather = 'Unknown'
    if (typeof event.tempValue === 'number') {
      weather = `${event.tempValue}°F`
      if (typeof event.precipChance === 'number') {
        weather += `, ${event.precipChance}% Rain`
      }
    }

    // Format lists
    const raceTimesList = event.raceTimes
      .sort((a, b) => a.getTime() - b.getTime())
      .map((time) => {
        const unix = Math.floor(time.getTime() / 1000)
        return `• <t:${unix}:F>`
      })
      .join('\n')

    const classesList = event.carClasses
      .sort()
      .map((c) => `• ${c}`)
      .join('\n')

    const usersList =
      event.registeredUsers.length > 0
        ? event.registeredUsers
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((u) => (u.discordId ? `• <@${u.discordId}>` : `• ${u.name}`))
            .join('\n')
        : '• 👻 _No registrations yet — be the first!_'

    const description = [
      `🏟️ **Track:** ${event.track}`,
      `🌤️ **Weather:** ${weather}`,
      '',
      `🕐 **Race Times:**`,
      raceTimesList,
      '',
      `🏎️ **Classes:**`,
      classesList,
      '',
      `👥 **Registered Drivers:**`,
      usersList,
    ].join('\n')

    return {
      title: `📅 ${event.name}`,
      url: event.eventUrl,
      description,
      color: 0x3498db, // Blue
    }
  })
}

export function buildRegistrationEmbed(
  data: RegistrationNotificationData,
  appTitle: string,
  options?: {
    includeOtherRegisteredDrivers?: boolean
    includeJoinEventLink?: boolean
    includeDiscussionLink?: boolean
  }
) {
  const unixTimestamp = Math.floor(data.raceStartTime.getTime() / 1000)
  const discordTimestamp = `<t:${unixTimestamp}:F>`

  const threadUrl = buildDiscordWebLink({ guildId: data.guildId, threadId: data.threadId })

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    {
      name: '🏎️ Car Class',
      value: data.carClassName,
      inline: true,
    },
    {
      name: '🕐 Race Time',
      value: discordTimestamp,
      inline: true,
    },
  ]

  if (options?.includeDiscussionLink ?? true) {
    fields.push({
      name: '💬 Discussion',
      value: `[View Event Thread](${threadUrl})`,
      inline: true,
    })
  }

  if (options?.includeOtherRegisteredDrivers) {
    const others = (data.otherRegisteredDrivers ?? []).filter(
      (entry) => entry.name.trim().length > 0 && entry.carClassName.trim().length > 0
    )
    const { grouped, truncatedCount } = buildRegisteredByClassGroups(others)
    if (grouped.size === 0) {
      fields.push({
        name: '👥 Already Registered By Class',
        value: 'No one else yet.',
        inline: false,
      })
    } else {
      fields.push({
        name: '👥 Already Registered By Class',
        value: '\u200b',
        inline: false,
      })

      grouped.forEach((drivers, className) => {
        fields.push({
          name: className,
          value: drivers.join('\n'),
          inline: true,
        })
      })

      if (truncatedCount > 0) {
        fields.push({
          name: 'More',
          value: `...and ${truncatedCount} more`,
          inline: false,
        })
      }
    }
  }

  if (options?.includeJoinEventLink) {
    fields.push({
      name: '🔗 Join Event',
      value: `[Open Event Page](${data.eventUrl})`,
      inline: false,
    })
  }

  const embed: {
    title: string
    description: string
    color: number
    fields: Array<{ name: string; value: string; inline: boolean }>
    url: string
    timestamp: string
    footer: { text: string }
    thumbnail?: { url: string }
  } = {
    title: '🏁 New Race Registration',
    description: data.discordUser
      ? `<@${data.discordUser.id}> has registered for **${data.eventName}**`
      : `**${data.userName}** has registered for **${data.eventName}**`,
    color: 0x5865f2, // Discord blurple color
    fields,
    url: data.eventUrl,
    timestamp: new Date().toISOString(),
    footer: {
      text: appTitle,
    },
  }

  if (data.userAvatarUrl) {
    embed.thumbnail = {
      url: data.userAvatarUrl,
    }
  }

  return embed
}

export function buildRegistrationComponentsV2(
  data: RegistrationNotificationData
): DiscordMessageComponent[] {
  const unixTimestamp = Math.floor(data.raceStartTime.getTime() / 1000)
  const discussionUrl = buildDiscordWebLink({ guildId: data.guildId, threadId: data.threadId })
  const actor = data.discordUser ? `<@${data.discordUser.id}>` : `**${data.userName}**`
  const others = (data.otherRegisteredDrivers ?? []).filter(
    (entry) => entry.name.trim().length > 0 && entry.carClassName.trim().length > 0
  )

  const headerSummary = [
    '\uD83C\uDFC1 **New Race Registration**',
    `${actor} has registered for **${data.eventName}**`,
  ].join('\n')
  const rosterSummary = [
    '\uD83D\uDC65 **Already Registered By Class**',
    formatRegisteredByClass(others),
  ].join('\n')
  const carClassLine = `\uD83C\uDFCE\uFE0F **Car Class:** ${data.carClassName}`
  const raceTimeLine = `\uD83D\uDD52 **Race Time:** <t:${unixTimestamp}:F>`

  const joinEventButton = {
    type: 2,
    style: 5,
    label: 'Join Event',
    url: data.eventUrl,
  }
  const viewThreadButton = {
    type: 2,
    style: 5,
    label: 'View Thread',
    url: discussionUrl,
  }

  const headerComponent = data.userAvatarUrl
    ? {
        type: 9,
        components: [
          {
            type: 10,
            content: headerSummary,
          },
        ],
        accessory: {
          type: 11,
          media: {
            url: data.userAvatarUrl,
          },
        },
      }
    : {
        type: 10,
        content: headerSummary,
      }

  if (data.userAvatarUrl) {
    return [
      {
        type: 17,
        components: [
          headerComponent,
          {
            type: 9,
            components: [{ type: 10, content: carClassLine }],
            accessory: joinEventButton,
          },
          {
            type: 9,
            components: [{ type: 10, content: raceTimeLine }],
            accessory: viewThreadButton,
          },
          {
            type: 10,
            content: rosterSummary,
          },
        ],
      },
    ]
  }

  return [
    {
      type: 17,
      components: [
        headerComponent,
        {
          type: 10,
          content: [carClassLine, raceTimeLine].join('\n'),
        },
        {
          type: 10,
          content: rosterSummary,
        },
        {
          type: 1,
          components: [joinEventButton, viewThreadButton],
        },
      ],
    },
  ]
}

export type RegistrationSnapshot = Record<
  string,
  { teamId: string | null; driverName: string; carClassId?: string; carClassName?: string }
>

/**
 * Detects roster changes between two snapshots.
 * Returns an array of changes categorized by type.
 *
 * TODO: Remove legacy snapshot format handling after all production snapshots have been migrated.
 */
export function detectRosterChanges(
  previousSnapshot: RegistrationSnapshot | Record<string, string | null> | null,
  currentSnapshot: RegistrationSnapshot,
  teamNameById: Map<string, string>
): RosterChange[] {
  const rosterChanges: RosterChange[] = []

  // Handle legacy snapshot format (just teamId strings)
  // TODO: Remove this legacy handling after migration
  const normalizedPrevious: RegistrationSnapshot | null = previousSnapshot
    ? isLegacySnapshot(previousSnapshot)
      ? Object.fromEntries(
          Object.entries(previousSnapshot).map(([id, teamId]) => [
            id,
            { teamId: teamId as string | null, driverName: 'Driver' },
          ])
        )
      : (previousSnapshot as RegistrationSnapshot)
    : null

  if (!normalizedPrevious) {
    // First-time assignment - no changes to report
    return []
  }

  // Track team class changes to group them
  const teamClassChanges = new Map<
    string,
    {
      fromClass: string
      toClass: string
      drivers: Array<{ regId: string; name: string }>
    }
  >()

  // First pass: detect team class changes
  Object.entries(currentSnapshot).forEach(([regId, current]) => {
    if (!(regId in normalizedPrevious)) return

    const previous = normalizedPrevious[regId]

    // Check if car class changed while staying in the same team
    if (
      current.teamId &&
      previous.teamId === current.teamId &&
      previous.carClassId &&
      current.carClassId &&
      previous.carClassId !== current.carClassId &&
      previous.carClassName &&
      current.carClassName
    ) {
      const key = `${current.teamId}:${previous.carClassId}->${current.carClassId}`
      const existing = teamClassChanges.get(key)

      if (existing) {
        existing.drivers.push({ regId, name: current.driverName })
      } else {
        teamClassChanges.set(key, {
          fromClass: previous.carClassName,
          toClass: current.carClassName,
          drivers: [{ regId, name: current.driverName }],
        })
      }
    }
  })

  // Convert team class changes to roster changes
  const processedForTeamClassChange = new Set<string>()
  for (const [key, change] of teamClassChanges) {
    const teamId = key.split(':')[0]
    const teamName = teamNameById.get(teamId) || 'Team'

    rosterChanges.push({
      type: 'teamClassChanged',
      teamName,
      fromClass: change.fromClass,
      toClass: change.toClass,
      drivers: change.drivers.map((d) => d.name),
    })

    // Mark these registrations as processed
    change.drivers.forEach((d) => processedForTeamClassChange.add(d.regId))
  }

  // Second pass: detect additions and modifications (skip those already processed as team class changes)
  Object.entries(currentSnapshot).forEach(([regId, current]) => {
    if (processedForTeamClassChange.has(regId)) return

    if (!(regId in normalizedPrevious)) {
      // New registration
      if (current.teamId) {
        const teamName = teamNameById.get(current.teamId) || 'Team'
        rosterChanges.push({ type: 'added', driverName: current.driverName, teamName })
      }
      return
    }

    const previous = normalizedPrevious[regId]
    if (previous.teamId !== current.teamId) {
      if (previous.teamId === null && current.teamId !== null) {
        // Was unassigned, now assigned
        const teamName = teamNameById.get(current.teamId) || 'Team'
        rosterChanges.push({ type: 'added', driverName: current.driverName, teamName })
      } else if (previous.teamId !== null && current.teamId === null) {
        // Was assigned, now unassigned
        const fromTeam = teamNameById.get(previous.teamId) || 'Team'
        rosterChanges.push({ type: 'unassigned', driverName: current.driverName, fromTeam })
      } else if (previous.teamId !== null && current.teamId !== null) {
        // Moved between teams
        const fromTeam = teamNameById.get(previous.teamId) || 'Team'
        const toTeam = teamNameById.get(current.teamId) || 'Team'
        rosterChanges.push({
          type: 'moved',
          driverName: current.driverName,
          fromTeam,
          toTeam,
        })
      }
    }
  })

  // Detect drops (removed registrations)
  // But skip drivers who were unassigned and are now assigned (even with different reg ID)
  const assignedDriverNames = new Set(
    Object.values(currentSnapshot)
      .filter((reg) => reg.teamId !== null)
      .map((reg) => reg.driverName)
  )

  Object.keys(normalizedPrevious).forEach((regId) => {
    if (!(regId in currentSnapshot)) {
      const previous = normalizedPrevious[regId]
      // Don't report as dropped if this driver was unassigned and is now assigned to a team
      if (previous.teamId === null && assignedDriverNames.has(previous.driverName)) {
        return
      }
      const fromTeam =
        previous.teamId === null ? 'Unassigned' : (teamNameById.get(previous.teamId) ?? 'Team')
      rosterChanges.push({ type: 'dropped', driverName: previous.driverName, fromTeam })
    }
  })

  return rosterChanges
}

/** Type guard to check if snapshot is in legacy format (string teamId instead of object) */
function isLegacySnapshot(
  snapshot: RegistrationSnapshot | Record<string, string | null>
): snapshot is Record<string, string | null> {
  const firstEntry = Object.values(snapshot)[0]
  return typeof firstEntry === 'string' || firstEntry === null
}

/**
 * Builds a Discord embed for roster changes notifications.
 */
export function buildRosterChangesEmbed(
  rosterChanges: RosterChange[],
  appTitle: string,
  adminName?: string
): {
  title: string
  description: string
  color: number
  fields: Array<{ name: string; value: string; inline: boolean }>
  timestamp: string
  footer: { text: string }
} {
  // Group changes by type for better organization
  const added = rosterChanges.filter((c) => c.type === 'added')
  const dropped = rosterChanges.filter((c) => c.type === 'dropped')
  const moved = rosterChanges.filter((c) => c.type === 'moved')
  const unassigned = rosterChanges.filter((c) => c.type === 'unassigned')
  const teamClassChanged = rosterChanges.filter((c) => c.type === 'teamClassChanged')

  const fields: Array<{ name: string; value: string; inline: boolean }> = []

  if (added.length > 0) {
    fields.push({
      name: '✅ Added',
      value: added.map((c) => `**${c.driverName}** → ${c.teamName}`).join('\n'),
      inline: false,
    })
  }

  if (moved.length > 0) {
    fields.push({
      name: '🔄 Moved',
      value: moved.map((c) => `**${c.driverName}**: ${c.fromTeam} → ${c.toTeam}`).join('\n'),
      inline: false,
    })
  }

  if (teamClassChanged.length > 0) {
    fields.push({
      name: '🏎️ Car Class Changed',
      value: teamClassChanged
        .map((c) => {
          const driversList = c.drivers.map((d) => `• ${d}`).join('\n')
          return `**${c.teamName}**: ${c.fromClass} → ${c.toClass}\n${driversList}`
        })
        .join('\n\n'),
      inline: false,
    })
  }

  if (unassigned.length > 0) {
    fields.push({
      name: '⚠️ Unassigned',
      value: unassigned.map((c) => `**${c.driverName}** (from ${c.fromTeam})`).join('\n'),
      inline: false,
    })
  }

  if (dropped.length > 0) {
    fields.push({
      name: '❌ Dropped',
      value: dropped
        .map((c) =>
          c.fromTeam ? `**${c.driverName}** (from ${c.fromTeam})` : `**${c.driverName}**`
        )
        .join('\n'),
      inline: false,
    })
  }

  const changeCount = `${rosterChanges.length} change${rosterChanges.length === 1 ? '' : 's'}`
  const description = adminName
    ? `${changeCount} made by **${adminName}**`
    : `${changeCount} to the roster`

  return {
    title: '📋 Roster Changes',
    description,
    color: 0xffa500, // Orange
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: appTitle,
    },
  }
}

export function buildOnboardingEmbed(data: OnboardingNotificationData, appTitle: string) {
  const embed: {
    title: string
    description: string
    color: number
    fields: Array<{ name: string; value: string; inline: boolean }>
    url: string
    timestamp: string
    footer: { text: string }
    thumbnail?: { url: string }
  } = {
    title: '👋 New User Onboarded',
    description: data.discordUser
      ? `<@${data.discordUser.id}> has completed the onboarding process.`
      : `**${data.userName}** has completed the onboarding process.`,
    color: 0x00ff00, // Green
    fields: [
      {
        name: '🆔 iRacing ID',
        value: data.iracingCustomerId,
        inline: true,
      },
    ],
    url: data.profileUrl,
    timestamp: new Date().toISOString(),
    footer: {
      text: appTitle,
    },
  }

  if (data.iracingName) {
    embed.fields.push({
      name: '🏎️ iRacing Name',
      value: data.iracingName,
      inline: true,
    })
  }

  if (data.userAvatarUrl) {
    embed.thumbnail = {
      url: data.userAvatarUrl,
    }
  }

  return embed
}
