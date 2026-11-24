'use client'

import { useTimeZone } from './TimeZoneProvider'

interface Props {
  date: Date | string | number
  format?: Intl.DateTimeFormatOptions
  className?: string
  hideTimezone?: boolean
}

export default function FormattedDate({ date, format, className, hideTimezone }: Props) {
  const { timeZone } = useTimeZone()

  return (
    <span suppressHydrationWarning className={className}>
      {new Date(date).toLocaleString(undefined, {
        timeZone,
        ...(hideTimezone ? {} : { timeZoneName: 'short' }),
        ...format,
      })}
    </span>
  )
}
