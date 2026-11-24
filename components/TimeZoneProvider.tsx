'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_COOKIE_NAME,
  isValidTimeZone,
  resolveTimeZone,
} from '@/lib/timezone-utils'

export interface TimeZoneContextValue {
  timeZone: string
  localTimeZone: string
  setTimeZone: (nextTimeZone: string) => void
}

const TimeZoneContext = createContext<TimeZoneContextValue | null>(null)

export function getBrowserTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
    return resolveTimeZone(resolved, DEFAULT_TIMEZONE)
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function persistTimeZonePreference(tz: string) {
  if (typeof document !== 'undefined') {
    const secureFlag =
      typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${TIMEZONE_COOKIE_NAME}=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`
  }
  if (typeof window !== 'undefined') {
    try {
      if (typeof window.localStorage?.setItem === 'function') {
        window.localStorage.setItem(TIMEZONE_COOKIE_NAME, tz)
      }
    } catch {
      // Ignore storage restrictions (e.g. private browsing or Node 25 --localstorage-file)
    }
  }
}

interface TimeZoneProviderProps {
  initialTimeZone?: string | null
  children: React.ReactNode
}

export function TimeZoneProvider({ initialTimeZone, children }: TimeZoneProviderProps) {
  const hasServerPreference = isValidTimeZone(initialTimeZone)
  const [timeZone, setTimeZoneState] = useState<string>(() =>
    hasServerPreference ? initialTimeZone : DEFAULT_TIMEZONE
  )
  const [localTimeZone, setLocalTimeZone] = useState<string>(DEFAULT_TIMEZONE)

  useEffect(() => {
    const browserTz = getBrowserTimeZone()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalTimeZone(browserTz)

    if (hasServerPreference) {
      return
    }

    let savedTz: string | null = null
    try {
      if (typeof window.localStorage?.getItem === 'function') {
        savedTz = window.localStorage.getItem(TIMEZONE_COOKIE_NAME)
      }
    } catch {
      savedTz = null
    }

    const effectiveTz = isValidTimeZone(savedTz) ? savedTz : browserTz
    setTimeZoneState(effectiveTz)
    persistTimeZonePreference(effectiveTz)
  }, [hasServerPreference])

  const setTimeZone = useCallback((nextTimeZone: string) => {
    if (!isValidTimeZone(nextTimeZone)) return
    setTimeZoneState(nextTimeZone)
    persistTimeZonePreference(nextTimeZone)
  }, [])

  const value = useMemo<TimeZoneContextValue>(
    () => ({
      timeZone,
      localTimeZone,
      setTimeZone,
    }),
    [timeZone, localTimeZone, setTimeZone]
  )

  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>
}

export function useTimeZone(): TimeZoneContextValue {
  const ctx = useContext(TimeZoneContext)
  if (ctx) return ctx

  const fallback = getBrowserTimeZone()
  return {
    timeZone: fallback,
    localTimeZone: fallback,
    setTimeZone: () => {},
  }
}
