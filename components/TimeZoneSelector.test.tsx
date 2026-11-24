import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { TIMEZONE_COOKIE_NAME } from '@/lib/timezone-utils'
import { TimeZoneProvider } from './TimeZoneProvider'
import TimeZoneSelector from './TimeZoneSelector'
import FormattedDate from './FormattedDate'

describe('TimeZoneProvider & TimeZoneSelector', () => {
  beforeEach(() => {
    document.cookie = `${TIMEZONE_COOKIE_NAME}=; max-age=0; path=/`
  })

  it('renders initialTimeZone from server cookie and persists new selection to cookie', async () => {
    const user = userEvent.setup()

    render(
      <TimeZoneProvider initialTimeZone="UTC">
        <TimeZoneSelector />
        <FormattedDate
          date="2026-03-21T12:00:00.000Z"
          format={{ hour: 'numeric', minute: '2-digit', hour12: true }}
        />
      </TimeZoneProvider>
    )

    const select = screen.getByLabelText(/display time zone/i)
    expect(select).toHaveValue('UTC')
    expect(screen.getByText(/12:00 PM UTC/)).toBeInTheDocument()

    await user.selectOptions(select, 'America/New_York')

    expect(select).toHaveValue('America/New_York')
    expect(screen.getByText(/8:00 AM EDT/)).toBeInTheDocument()
    expect(document.cookie).toContain(`${TIMEZONE_COOKIE_NAME}=America%2FNew_York`)
  })
})
