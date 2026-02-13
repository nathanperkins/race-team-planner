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
  | { type: 'dropped'; driverName: string }
  | { type: 'moved'; driverName: string; fromTeam: string; toTeam: string }
  | { type: 'unassigned'; driverName: string; fromTeam: string }

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
  threadId: string
  guildId: string
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

/** Build a Discord thread name for an event (date only, no specific time). */
export function buildEventThreadName(
  eventName: string,
  firstStartTime: Date,
  options?: { locale?: string; timeZone?: string }
): string {
  const locale = options?.locale ?? 'en-US'
  const timeZone = options?.timeZone ?? 'America/Los_Angeles'
  const cleanName = normalizeSeriesName(eventName)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    timeZone,
  }).format(firstStartTime)
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
  threadUrl: string,
  title: string,
  appTitle: string
): Record<string, unknown> {
  return {
    embeds: [
      {
        title,
        description: `Teams have been assigned for **${eventName}**!`,
        color: 0x5865f2,
        url: threadUrl,
        fields: [
          {
            name: '🕐 Race Times',
            value: formatRaceTimesValue(timeslots),
            inline: true,
          },
          {
            name: '🔗 Discussion',
            value: `[View Event Thread](${threadUrl})`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: appTitle,
        },
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

export function buildRegistrationEmbed(data: RegistrationNotificationData, appTitle: string) {
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
    {
      name: '💬 Discussion',
      value: `[View Event Thread](${threadUrl})`,
      inline: true,
    },
  ]

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

export type RegistrationSnapshot = Record<string, { teamId: string | null; driverName: string }>

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

  // Detect additions and modifications
  Object.entries(currentSnapshot).forEach(([regId, current]) => {
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
  Object.keys(normalizedPrevious).forEach((regId) => {
    if (!(regId in currentSnapshot)) {
      const previous = normalizedPrevious[regId]
      rosterChanges.push({ type: 'dropped', driverName: previous.driverName })
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
      value: dropped.map((c) => `**${c.driverName}**`).join('\n'),
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
