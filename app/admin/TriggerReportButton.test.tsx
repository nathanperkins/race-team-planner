import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TriggerReportButton from './TriggerReportButton'
import { triggerWeeklyReportAction } from './actions'

vi.mock('./actions', () => ({
  triggerWeeklyReportAction: vi.fn(),
}))

describe('TriggerReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the trigger button', () => {
    render(<TriggerReportButton />)
    expect(screen.getByRole('button', { name: /send weekly report/i })).toBeInTheDocument()
  })

  it('does not show a modal initially', () => {
    render(<TriggerReportButton />)
    expect(screen.queryByText(/sending in progress/i)).not.toBeInTheDocument()
  })

  it('shows loading modal while action is running', async () => {
    const user = userEvent.setup()
    vi.mocked(triggerWeeklyReportAction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, message: 'Done.' }), 100)
        )
    )

    render(<TriggerReportButton />)
    await user.click(screen.getByRole('button', { name: /send weekly report/i }))

    expect(screen.getByText(/sending in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/generating and sending/i)).toBeInTheDocument()
  })

  it('disables the trigger button while action is running', async () => {
    const user = userEvent.setup()
    vi.mocked(triggerWeeklyReportAction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true, message: 'Done.' }), 100)
        )
    )

    render(<TriggerReportButton />)
    await user.click(screen.getByRole('button', { name: /send weekly report/i }))

    expect(screen.getByRole('button', { name: /send weekly report/i })).toBeDisabled()
  })

  it('shows success state and message on success', async () => {
    const user = userEvent.setup()
    vi.mocked(triggerWeeklyReportAction).mockResolvedValue({
      success: true,
      message: 'Sent to #general.',
    })

    render(<TriggerReportButton />)
    await user.click(screen.getByRole('button', { name: /send weekly report/i }))

    expect(await screen.findByText(/sent successfully/i)).toBeInTheDocument()
    expect(screen.getByText('Sent to #general.')).toBeInTheDocument()
  })

  it('shows error state when action returns success: false', async () => {
    const user = userEvent.setup()
    vi.mocked(triggerWeeklyReportAction).mockResolvedValue({
      success: false,
      message: 'No channel configured',
    })

    render(<TriggerReportButton />)
    await user.click(screen.getByRole('button', { name: /send weekly report/i }))

    expect(await screen.findByText(/sending failed/i)).toBeInTheDocument()
    expect(screen.getByText(/error: no channel configured/i)).toBeInTheDocument()
  })

  it('shows error state when action throws', async () => {
    const user = userEvent.setup()
    vi.mocked(triggerWeeklyReportAction).mockRejectedValue(new Error('Network error'))

    render(<TriggerReportButton />)
    await user.click(screen.getByRole('button', { name: /send weekly report/i }))

    expect(await screen.findByText(/sending failed/i)).toBeInTheDocument()
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })

  it('closes the modal when Close is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(triggerWeeklyReportAction).mockResolvedValue({
      success: true,
      message: 'Done.',
    })

    render(<TriggerReportButton />)
    await user.click(screen.getByRole('button', { name: /send weekly report/i }))

    expect(await screen.findByText(/sent successfully/i)).toBeInTheDocument()

    await user.click(screen.getByText('Close'))

    expect(screen.queryByText(/sent successfully/i)).not.toBeInTheDocument()
  })
})
