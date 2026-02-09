import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ProfileForm from './ProfileForm'
import { updateProfile, validateCustomerId } from '../actions/update-profile'
import { SessionContextValue, useSession } from 'next-auth/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}))

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

vi.mock('@/app/actions/update-profile', () => ({
  updateProfile: vi.fn(),
  validateCustomerId: vi.fn(),
}))

vi.mock('lucide-react', () => ({
  Lock: () => <span data-testid="lock-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  UserRoleBadge: () => <span data-testid="user-role-badge" />,
  Camera: () => <span data-testid="camera-icon" />,
  Upload: () => <span data-testid="upload-icon" />,
  AlertTriangle: () => <span data-testid="alert-icon" />,
  Check: () => <span data-testid="check-icon" />,
}))

vi.mock('@/lib/onboarding', () => ({
  getOnboardingStatus: vi.fn(),
  OnboardingStatus: {
    COMPLETED: 'COMPLETED',
    NO_CUSTOMER_ID: 'NO_CUSTOMER_ID',
  },
}))

describe('ProfileForm', () => {
  const mockUpdateSession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'user-123' } },
      update: mockUpdateSession,
      status: 'authenticated',
    } as unknown as SessionContextValue)
  })

  it('submits directly when Customer ID is unchanged', async () => {
    vi.mocked(updateProfile).mockResolvedValue({
      success: true,
      data: { iracingCustomerId: 123456, expectationsVersion: 1 },
    })

    render(
      <ProfileForm userId="user-123" initialCustomerId="123456" initialIracingName="Test User" />
    )

    const saveButton = screen.getByRole('button', { name: /save changes/i })

    // In JSDOM/RTL, clicking a submit button inside a form triggers submission
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalled()
    })

    expect(validateCustomerId).not.toHaveBeenCalled()
  })

  it('shows confirmation modal when Customer ID is changed to a valid number', async () => {
    vi.mocked(validateCustomerId).mockResolvedValue({
      success: true,
      name: 'New Racer',
    })

    render(
      <ProfileForm userId="user-123" initialCustomerId="123456" initialIracingName="Test User" />
    )

    // Change input
    const input = screen.getByLabelText(/iracing customer id/i)
    fireEvent.change(input, { target: { value: '987654' } })

    // Click Save
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    // Wait for validation to complete
    await waitFor(() => {
      expect(validateCustomerId).toHaveBeenCalledWith(987654)
    })

    // Expect Modal to appear
    expect(screen.getByText(/confirm iracing identity/i)).toBeTruthy()
    expect(screen.getByText(/New Racer/)).toBeTruthy()
    // The number might be split or formatted, but it should be present in the document text
    expect(screen.getByText((content) => content.includes('987654'))).toBeTruthy()

    // updateProfile should NOT have been called yet
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('calls updateProfile when confirmed in modal', async () => {
    vi.mocked(validateCustomerId).mockResolvedValue({
      success: true,
      name: 'New Racer',
    })

    // Mock updateProfile success
    vi.mocked(updateProfile).mockResolvedValue({
      success: true,
      data: { iracingCustomerId: 987654, expectationsVersion: 1 },
    })

    render(
      <ProfileForm userId="user-123" initialCustomerId="123456" initialIracingName="Test User" />
    )

    // Change input & Submit
    fireEvent.change(screen.getByLabelText(/iracing customer id/i), { target: { value: '987654' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // Wait for modal
    await waitFor(() => expect(screen.getByText(/New Racer/)).toBeTruthy())

    // Click "Yes, That's Me"
    const confirmButton = screen.getByRole('button', { name: /yes, that's me/i })
    fireEvent.click(confirmButton)

    // Expect updateProfile to be called
    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalled()
    })

    // Check arguments
    const formData = vi.mocked(updateProfile).mock.calls[0][0]
    expect(formData.get('customerId')).toBe('987654')
  })

  it('does NOT call updateProfile when cancelled', async () => {
    vi.mocked(validateCustomerId).mockResolvedValue({
      success: true,
      name: 'New Racer',
    })

    render(
      <ProfileForm userId="user-123" initialCustomerId="123456" initialIracingName="Test User" />
    )

    // Change input & Submit
    fireEvent.change(screen.getByLabelText(/iracing customer id/i), { target: { value: '987654' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // Wait for modal
    await waitFor(() => expect(screen.getByText(/New Racer/)).toBeTruthy())

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    // Modal should disappear
    await waitFor(() => {
      expect(screen.queryByText(/confirm iracing identity/i)).toBeNull()
    })

    // updateProfile should NOT have been called
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('shows error if validation fails', async () => {
    vi.mocked(validateCustomerId).mockResolvedValue({
      success: false,
      error: 'ID Not Found',
    })

    render(
      <ProfileForm userId="user-123" initialCustomerId="123456" initialIracingName="Test User" />
    )

    // Change input & Submit
    fireEvent.change(screen.getByLabelText(/iracing customer id/i), { target: { value: '999999' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/ID Not Found/i)).toBeTruthy()
    })

    // Modal should NOT appear
    expect(screen.queryByText(/confirm iracing identity/i)).toBeNull()
  })
})
