import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AdminDriverSearch from './AdminDriverSearch'

vi.mock('@/app/actions', () => ({
  adminRegisterDriver: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const mockDrivers = [
  { id: 'user-1', name: 'Alice', image: null },
  { id: 'user-2', name: 'Bob', image: null },
]

describe('AdminDriverSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading overlay while adding a driver', async () => {
    const { adminRegisterDriver } = await import('@/app/actions')
    vi.mocked(adminRegisterDriver).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ message: 'Success', timestamp: 1 }), 200)
        )
    )

    const user = userEvent.setup()
    render(
      <AdminDriverSearch
        raceId="race-1"
        registeredUserIds={[]}
        allDrivers={mockDrivers}
        defaultCarClassId="class-1"
      />
    )

    await user.click(screen.getByRole('button', { name: /Add Driver/i }))
    await user.click(screen.getByRole('button', { name: /Alice/i }))

    await waitFor(() => {
      expect(screen.getByText('Adding driver...')).toBeInTheDocument()
    })

    // Wait for action to complete to prevent timer leaking into subsequent tests
    await waitFor(() => expect(screen.queryByText('Adding driver...')).not.toBeInTheDocument(), {
      timeout: 500,
    })
  })

  it('does not show loading overlay before selecting a driver', async () => {
    const user = userEvent.setup()
    render(
      <AdminDriverSearch
        raceId="race-1"
        registeredUserIds={[]}
        allDrivers={mockDrivers}
        defaultCarClassId="class-1"
      />
    )

    await user.click(screen.getByRole('button', { name: /Add Driver/i }))

    expect(screen.queryByText('Adding driver...')).not.toBeInTheDocument()
  })

  it('shows all registered message when all drivers are registered', () => {
    render(
      <AdminDriverSearch
        raceId="race-1"
        registeredUserIds={['user-1', 'user-2']}
        allDrivers={mockDrivers}
        defaultCarClassId="class-1"
      />
    )

    expect(screen.getByText(/All drivers registered/i)).toBeInTheDocument()
  })

  it('shows error message when action returns a failure message', async () => {
    const { adminRegisterDriver } = await import('@/app/actions')
    vi.mocked(adminRegisterDriver).mockResolvedValue({
      message: 'Driver already registered',
      timestamp: 1,
    })

    const user = userEvent.setup()
    render(
      <AdminDriverSearch
        raceId="race-1"
        registeredUserIds={[]}
        allDrivers={mockDrivers}
        defaultCarClassId="class-1"
      />
    )

    await user.click(screen.getByRole('button', { name: /Add Driver/i }))
    await user.click(screen.getByRole('button', { name: /Alice/i }))

    await waitFor(() => {
      expect(screen.getByText('Driver already registered')).toBeInTheDocument()
    })
  })

  it('shows generic error message when action throws', async () => {
    const { adminRegisterDriver } = await import('@/app/actions')
    vi.mocked(adminRegisterDriver).mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()
    render(
      <AdminDriverSearch
        raceId="race-1"
        registeredUserIds={[]}
        allDrivers={mockDrivers}
        defaultCarClassId="class-1"
      />
    )

    await user.click(screen.getByRole('button', { name: /Add Driver/i }))
    await user.click(screen.getByRole('button', { name: /Alice/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed to register driver')).toBeInTheDocument()
    })
  })
})
