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

export interface TeamsAssignedNotificationData {
  eventName: string
  raceStartTime: Date
  raceUrl: string
  track?: string
  trackConfig?: string
  tempValue?: number | null
  precipChance?: number | null
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
  threadId?: string | null
  mentionRegistrationIds?: string[]
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
  teams: TeamsAssignedNotificationData['teams'],
  unassigned: TeamsAssignedNotificationData['unassigned']
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
