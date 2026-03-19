import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CustomEventFormFields from './CustomEventFormFields'
import '@testing-library/jest-dom'

describe('CustomEventFormFields', () => {
  it('renders standard empty fields when no event is passed', () => {
    const mockSetTimeslots = vi.fn()
    const { container } = render(
      <CustomEventFormFields
        timeslots={[{ id: '', startTime: '2027-01-01T10:00' }]}
        setTimeslots={mockSetTimeslots}
      />
    )

    expect(screen.getByLabelText(/event name/i)).toHaveValue('')
    expect(screen.getByLabelText(/^track \*/i)).toHaveValue('')

    const timeInputs = container.querySelectorAll('input[name="startTimes"]')
    expect(timeInputs).toHaveLength(1)
    expect((timeInputs[0] as HTMLInputElement).value).toBe('2027-01-01T10:00')

    // raceIds shouldn't render when event prop is absent
    expect(container.querySelectorAll('input[name="raceIds"]')).toHaveLength(0)
  })

  it('renders with event default values and hidden raceIds inputs', () => {
    const mockSetTimeslots = vi.fn()
    const mockEvent = {
      id: 'evt-1',
      name: 'Rolex 24',
      track: 'Daytona',
    }
    const { container } = render(
      <CustomEventFormFields
        event={mockEvent}
        timeslots={[
          { id: 'race-1', startTime: '2027-01-01T10:00' },
          { id: 'race-2', startTime: '2027-01-02T10:00' },
        ]}
        setTimeslots={mockSetTimeslots}
      />
    )

    expect(screen.getByLabelText(/event name/i)).toHaveValue('Rolex 24')
    expect(screen.getByLabelText(/^track \*/i)).toHaveValue('Daytona')

    const raceIdInputs = container.querySelectorAll('input[name="raceIds"]')
    expect(raceIdInputs).toHaveLength(2)
    expect((raceIdInputs[0] as HTMLInputElement).value).toBe('race-1')
  })

  it('calls setTimeslots appropriately when add timeslot is clicked', async () => {
    const mockSetTimeslots = vi.fn()
    const user = userEvent.setup()

    render(
      <CustomEventFormFields
        timeslots={[{ id: '', startTime: '2027-01-01T10:00' }]}
        setTimeslots={mockSetTimeslots}
      />
    )

    await user.click(screen.getByRole('button', { name: /add timeslot/i }))

    expect(mockSetTimeslots).toHaveBeenCalledTimes(1)
    expect(mockSetTimeslots).toHaveBeenCalledWith([
      { id: '', startTime: '2027-01-01T10:00' },
      { id: '', startTime: '2027-01-01T10:00' }, // copies prior timeslot
    ])
  })

  it('calls setTimeslots appropriately when remove timeslot is clicked', async () => {
    const mockSetTimeslots = vi.fn()
    const user = userEvent.setup()

    render(
      <CustomEventFormFields
        timeslots={[
          { id: '', startTime: '2027-01-01T10:00' },
          { id: '', startTime: '2027-01-02T10:00' },
        ]}
        setTimeslots={mockSetTimeslots}
      />
    )

    // There will be two remove buttons, let's click the first one
    const removeButtons = screen.getAllByRole('button', { name: /remove timeslot/i })
    await user.click(removeButtons[0])

    expect(mockSetTimeslots).toHaveBeenCalledTimes(1)
    expect(mockSetTimeslots).toHaveBeenCalledWith([
      { id: '', startTime: '2027-01-02T10:00' }, // index 0 was removed
    ])
  })
})
