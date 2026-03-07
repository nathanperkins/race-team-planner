import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SyncButton from './SyncButton'
import { syncGlobalDataAction } from '@/app/actions/sync'

vi.mock('@/app/actions/sync', () => ({
  syncGlobalDataAction: vi.fn(),
}))

describe('SyncButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the sync button', () => {
    render(<SyncButton />)
    expect(screen.getByRole('button', { name: /sync with iracing/i })).toBeInTheDocument()
  })

  it('does not show a modal initially', () => {
    render(<SyncButton />)
    expect(screen.queryByText(/syncing in progress/i)).not.toBeInTheDocument()
  })

  it('shows loading modal while sync is running', async () => {
    const user = userEvent.setup()
    vi.mocked(syncGlobalDataAction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ success: true, eventsCount: 5, carClassesCount: 3, usersCount: 10 }),
            100
          )
        )
    )

    render(<SyncButton />)
    await user.click(screen.getByRole('button', { name: /sync with iracing/i }))

    expect(screen.getByText(/syncing in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/syncing events from iracing/i)).toBeInTheDocument()
  })

  it('disables the button while sync is running', async () => {
    const user = userEvent.setup()
    vi.mocked(syncGlobalDataAction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ success: true, eventsCount: 5, carClassesCount: 3, usersCount: 10 }),
            100
          )
        )
    )

    render(<SyncButton />)
    await user.click(screen.getByRole('button', { name: /sync with iracing/i }))

    expect(screen.getByRole('button', { name: /sync with iracing/i })).toBeDisabled()
  })

  it('shows success state with counts on success', async () => {
    const user = userEvent.setup()
    vi.mocked(syncGlobalDataAction).mockResolvedValue({
      success: true,
      eventsCount: 12,
      carClassesCount: 6,
      usersCount: 48,
    })

    render(<SyncButton />)
    await user.click(screen.getByRole('button', { name: /sync with iracing/i }))

    await waitFor(() => {
      expect(screen.getByText(/sync complete/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/12 events/)).toBeInTheDocument()
    expect(screen.getByText(/6 car classes/)).toBeInTheDocument()
    expect(screen.getByText(/48 users/)).toBeInTheDocument()
  })

  it('shows error state when action returns success: false', async () => {
    const user = userEvent.setup()
    vi.mocked(syncGlobalDataAction).mockResolvedValue({
      success: false,
      error: 'iRacing API unavailable',
    })

    render(<SyncButton />)
    await user.click(screen.getByRole('button', { name: /sync with iracing/i }))

    await waitFor(() => {
      expect(screen.getByText(/sync failed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/iracing api unavailable/i)).toBeInTheDocument()
  })

  it('shows error state when action throws', async () => {
    const user = userEvent.setup()
    vi.mocked(syncGlobalDataAction).mockRejectedValue(new Error('Network error'))

    render(<SyncButton />)
    await user.click(screen.getByRole('button', { name: /sync with iracing/i }))

    await waitFor(() => {
      expect(screen.getByText(/sync failed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })

  it('closes the modal when Close is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(syncGlobalDataAction).mockResolvedValue({
      success: true,
      eventsCount: 0,
      carClassesCount: 0,
      usersCount: 0,
    })

    render(<SyncButton />)
    await user.click(screen.getByRole('button', { name: /sync with iracing/i }))

    await waitFor(() => {
      expect(screen.getByText(/sync complete/i)).toBeInTheDocument()
    })

    await user.click(screen.getByText('Close'))

    expect(screen.queryByText(/sync complete/i)).not.toBeInTheDocument()
  })
})
