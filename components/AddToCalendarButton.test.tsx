import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import AddToCalendarButton from './AddToCalendarButton'
import { downloadIcs } from '@/lib/calendar-utils'

vi.mock('@/lib/calendar-utils', () => ({
  buildCalendarDescription: vi.fn().mockReturnValue('Event description'),
  buildGoogleCalendarUrl: vi.fn().mockReturnValue('https://calendar.google.com/test'),
  buildOutlookCalendarUrl: vi.fn().mockReturnValue('https://outlook.live.com/test'),
  downloadIcs: vi.fn(),
}))

vi.mock('lucide-react', () => ({
  CalendarPlus: () => <svg data-testid="icon-calendar-plus" />,
  Chrome: () => <svg data-testid="icon-chrome" />,
  Mail: () => <svg data-testid="icon-mail" />,
  Download: () => <svg data-testid="icon-download" />,
}))

const defaultProps = {
  raceId: 'race-1',
  startTime: new Date('2027-01-01T10:00:00Z'),
  endTime: new Date('2027-01-01T12:00:00Z'),
  eventId: 'evt-1',
  eventName: 'Test Series',
  track: 'Sebring',
}

describe('AddToCalendarButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a trigger button with aria-label "Add to calendar"', () => {
    render(<AddToCalendarButton {...defaultProps} />)
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument()
  })

  it('dropdown is closed initially', () => {
    render(<AddToCalendarButton {...defaultProps} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens dropdown on trigger click', () => {
    render(<AddToCalendarButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('shows Google Calendar, Outlook, and Apple / iCal options when open', () => {
    render(<AddToCalendarButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    expect(screen.getByText(/google calendar/i)).toBeInTheDocument()
    expect(screen.getByText(/outlook/i)).toBeInTheDocument()
    expect(screen.getByText(/apple/i)).toBeInTheDocument()
  })

  it('closes dropdown on second trigger click', () => {
    render(<AddToCalendarButton {...defaultProps} />)
    const trigger = screen.getByRole('button', { name: /add to calendar/i })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('calls window.open with Google Calendar URL and closes dropdown', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<AddToCalendarButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    fireEvent.click(screen.getByText(/google calendar/i))
    expect(openSpy).toHaveBeenCalledWith(
      'https://calendar.google.com/test',
      '_blank',
      'noopener,noreferrer'
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    openSpy.mockRestore()
  })

  it('calls window.open with Outlook URL and closes dropdown', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<AddToCalendarButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    fireEvent.click(screen.getByText(/outlook/i))
    expect(openSpy).toHaveBeenCalledWith(
      'https://outlook.live.com/test',
      '_blank',
      'noopener,noreferrer'
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    openSpy.mockRestore()
  })

  it('calls downloadIcs and closes dropdown when Apple / iCal is clicked', () => {
    render(<AddToCalendarButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    fireEvent.click(screen.getByText(/apple/i))
    expect(downloadIcs).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders children inside the trigger button', () => {
    render(
      <AddToCalendarButton {...defaultProps}>
        <span>My Pill</span>
      </AddToCalendarButton>
    )
    const trigger = screen.getByRole('button', { name: /add to calendar/i })
    expect(trigger).toContainElement(screen.getByText('My Pill'))
  })

  it('dropdown still opens when children trigger is clicked', () => {
    render(
      <AddToCalendarButton {...defaultProps}>
        <span>My Pill</span>
      </AddToCalendarButton>
    )
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
