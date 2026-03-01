import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import BackfillNicknamesButton from './BackfillNicknamesButton'
import { backfillDiscordNicknamesAction } from './actions'

vi.mock('./actions', () => ({
  backfillDiscordNicknamesAction: vi.fn(),
}))

vi.mock('lucide-react', () => ({
  UserCheck: () => <svg data-testid="icon-user-check" />,
  X: () => <svg data-testid="icon-x" />,
}))

describe('BackfillNicknamesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the trigger button', () => {
    render(<BackfillNicknamesButton />)
    expect(screen.getByRole('button', { name: /backfill discord nicknames/i })).toBeInTheDocument()
  })

  it('does not show popup initially', () => {
    render(<BackfillNicknamesButton />)
    expect(screen.queryByText(/backfill in progress/i)).not.toBeInTheDocument()
  })

  it('shows in-progress state while action is running', async () => {
    const user = userEvent.setup()
    vi.mocked(backfillDiscordNicknamesAction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, message: 'Done.' }), 100)
        )
    )

    render(<BackfillNicknamesButton />)
    await user.click(screen.getByRole('button', { name: /backfill discord nicknames/i }))

    expect(screen.getByText(/backfill in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/fetching discord nicknames/i)).toBeInTheDocument()
  })

  it('disables the trigger button while running', async () => {
    const user = userEvent.setup()
    vi.mocked(backfillDiscordNicknamesAction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, message: 'Done.' }), 100)
        )
    )

    render(<BackfillNicknamesButton />)
    await user.click(screen.getByRole('button', { name: /backfill discord nicknames/i }))

    expect(screen.getByRole('button', { name: /backfill discord nicknames/i })).toBeDisabled()
  })

  it('shows success state and message on success', async () => {
    const user = userEvent.setup()
    vi.mocked(backfillDiscordNicknamesAction).mockResolvedValue({
      success: true,
      message: 'Done. Updated: 3, Skipped (no nick): 1, Failed: 0.',
    })

    render(<BackfillNicknamesButton />)
    await user.click(screen.getByRole('button', { name: /backfill discord nicknames/i }))

    await waitFor(() => {
      expect(screen.getByText(/backfill complete/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Done. Updated: 3/)).toBeInTheDocument()
  })

  it('shows error state when action returns success: false', async () => {
    const user = userEvent.setup()
    vi.mocked(backfillDiscordNicknamesAction).mockResolvedValue({
      success: false,
      message: 'Unauthorized',
    })

    render(<BackfillNicknamesButton />)
    await user.click(screen.getByRole('button', { name: /backfill discord nicknames/i }))

    await waitFor(() => {
      expect(screen.getByText(/backfill failed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/error: unauthorized/i)).toBeInTheDocument()
  })

  it('shows error state when action throws', async () => {
    const user = userEvent.setup()
    vi.mocked(backfillDiscordNicknamesAction).mockRejectedValue(new Error('Network error'))

    render(<BackfillNicknamesButton />)
    await user.click(screen.getByRole('button', { name: /backfill discord nicknames/i }))

    await waitFor(() => {
      expect(screen.getByText(/backfill failed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })

  it('closes the popup when Close is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(backfillDiscordNicknamesAction).mockResolvedValue({
      success: true,
      message: 'Done. Updated: 0, Skipped (no nick): 0, Failed: 0.',
    })

    render(<BackfillNicknamesButton />)
    await user.click(screen.getByRole('button', { name: /backfill discord nicknames/i }))

    await waitFor(() => {
      expect(screen.getByText(/backfill complete/i)).toBeInTheDocument()
    })

    // Use getByText to avoid ambiguity with the X icon button (also aria-label="Close")
    await user.click(screen.getByText('Close'))

    expect(screen.queryByText(/backfill complete/i)).not.toBeInTheDocument()
  })
})
