'use client'

interface Props {
  date: Date | string | number
  format?: Intl.DateTimeFormatOptions
  className?: string
  hideTimezone?: boolean
}

export default function FormattedDate({ date, format, className, hideTimezone }: Props) {
  return (
    <span suppressHydrationWarning className={className}>
      {new Date(date).toLocaleString(undefined, {
        ...(hideTimezone ? {} : { timeZoneName: 'short' }),
        ...format,
      })}
    </span>
  )
}
