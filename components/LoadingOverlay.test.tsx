import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import LoadingOverlay from './LoadingOverlay'

describe('LoadingOverlay', () => {
  it('renders with the default message', async () => {
    render(<LoadingOverlay />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Working...' })).toBeInTheDocument()
    })
  })

  it('renders with a custom message', async () => {
    render(<LoadingOverlay message="Saving data..." />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Saving data...' })).toBeInTheDocument()
    })
  })

  it('renders via a portal into document.body', async () => {
    render(<LoadingOverlay message="Portal check" />)
    await waitFor(() => {
      expect(document.body).toHaveTextContent('Portal check')
    })
  })
})
