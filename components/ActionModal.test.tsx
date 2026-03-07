import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ActionModal from './ActionModal'

describe('ActionModal', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing before the deferred mount resolves', () => {
    render(<ActionModal status="loading" title="Working..." />)
    expect(screen.queryByRole('heading', { name: 'Working...' })).not.toBeInTheDocument()
  })

  it('renders into document.body via portal after mount', async () => {
    render(<ActionModal status="loading" title="Working..." />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Working...' })).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows the spinner', async () => {
      const { container } = render(<ActionModal status="loading" title="Loading..." />)
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Loading...' })).toBeInTheDocument()
      )
      // Spinner is rendered as a div with the spinner class; check it exists in document
      const overlay = document.body.querySelector('[class*="spinner"]')
      expect(overlay).toBeInTheDocument()
      void container
    })

    it('does not render a Close button', async () => {
      render(<ActionModal status="loading" title="Loading..." onClose={mockOnClose} />)
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Loading...' })).toBeInTheDocument()
      )
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    })
  })

  describe('success state', () => {
    it('shows the success icon', async () => {
      render(<ActionModal status="success" title="Done!" onClose={mockOnClose} />)
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Done!' })).toBeInTheDocument()
      )
      expect(screen.getByText('✅')).toBeInTheDocument()
    })

    it('renders Dismiss (X icon) and Close (action) buttons', async () => {
      render(<ActionModal status="success" title="Done!" onClose={mockOnClose} />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
      })
    })

    it('calls onClose when the Close button is clicked', async () => {
      const user = userEvent.setup()
      render(<ActionModal status="success" title="Done!" onClose={mockOnClose} />)
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not render Close buttons when onClose is not provided', async () => {
      render(<ActionModal status="success" title="Done!" />)
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Done!' })).toBeInTheDocument()
      )
      expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows the error icon', async () => {
      render(<ActionModal status="error" title="Failed!" onClose={mockOnClose} />)
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Failed!' })).toBeInTheDocument()
      )
      expect(screen.getByText('❌')).toBeInTheDocument()
    })

    it('renders Dismiss (X icon) and Close (action) buttons', async () => {
      render(<ActionModal status="error" title="Failed!" onClose={mockOnClose} />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
      })
    })

    it('calls onClose when the Close button is clicked', async () => {
      const user = userEvent.setup()
      render(<ActionModal status="error" title="Failed!" onClose={mockOnClose} />)
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('description', () => {
    it('renders description text when provided', async () => {
      render(
        <ActionModal
          status="success"
          title="Done!"
          description="All 5 events synced."
          onClose={mockOnClose}
        />
      )
      await waitFor(() => expect(screen.getByText('All 5 events synced.')).toBeInTheDocument())
    })

    it('does not render description element when omitted', async () => {
      render(<ActionModal status="success" title="Done!" onClose={mockOnClose} />)
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Done!' })).toBeInTheDocument()
      )
      expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
    })
  })
})
