'use client'

import { X } from 'lucide-react'
import { useActionState, useEffect, useRef } from 'react'
import { createCustomEvent } from './actions'
import styles from './AddEventModal.module.css'

interface AddEventModalProps {
  onClose: () => void
}

export default function AddEventModal({ onClose }: AddEventModalProps) {
  const [state, formAction, pending] = useActionState(createCustomEvent, { message: '' })
  const modalRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Close on successful submission
  useEffect(() => {
    if (state.message === 'Success') {
      if (formRef.current) {
        formRef.current.reset()
      }
      setTimeout(() => onClose(), 500)
    }
  }, [state.message, onClose])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose()
    }
  }

  return (
    <div className={styles.backdrop} ref={modalRef} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add Custom Event</h2>
          <button className={styles.closeButton} onClick={onClose} type="button">
            <X size={24} />
          </button>
        </div>

        <form action={formAction} className={styles.form} ref={formRef}>
          <div className={styles.field}>
            <label htmlFor="name" className={styles.label}>
              Event Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              className={styles.input}
              placeholder="e.g., Sebring 12hr"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="track" className={styles.label}>
              Track *
            </label>
            <input
              type="text"
              id="track"
              name="track"
              className={styles.input}
              placeholder="e.g., Sebring International Raceway"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="trackConfig" className={styles.label}>
              Track Configuration
            </label>
            <input
              type="text"
              id="trackConfig"
              name="trackConfig"
              className={styles.input}
              placeholder="e.g., Grand Prix, Road Course (optional)"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="description" className={styles.label}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              className={styles.textarea}
              placeholder="Event description (optional)"
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="startTime" className={styles.label}>
              Start Time *
            </label>
            <input
              type="datetime-local"
              id="startTime"
              name="startTime"
              className={styles.input}
              required
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="durationMins" className={styles.label}>
                Duration (minutes)
              </label>
              <input
                type="number"
                id="durationMins"
                name="durationMins"
                className={styles.input}
                placeholder="e.g., 720 for 12 hours"
                min="1"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="licenseGroup" className={styles.label}>
                License Level
              </label>
              <select id="licenseGroup" name="licenseGroup" className={styles.input}>
                <option value="">Select license (optional)</option>
                <option value="1">Rookie</option>
                <option value="2">Class D</option>
                <option value="3">Class C</option>
                <option value="4">Class B</option>
                <option value="5">Class A</option>
                <option value="6">Pro</option>
                <option value="7">PWC</option>
              </select>
            </div>
          </div>

          <div className={styles.weatherSection}>
            <h3 className={styles.sectionTitle}>Weather (Optional)</h3>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="tempValue" className={styles.label}>
                  Temperature
                </label>
                <input
                  type="number"
                  id="tempValue"
                  name="tempValue"
                  className={styles.input}
                  placeholder="e.g., 78"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="tempUnits" className={styles.label}>
                  Temp Units
                </label>
                <select id="tempUnits" name="tempUnits" className={styles.input}>
                  <option value="">Select</option>
                  <option value="0">Fahrenheit</option>
                  <option value="1">Celsius</option>
                </select>
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="relHumidity" className={styles.label}>
                  Humidity (%)
                </label>
                <input
                  type="number"
                  id="relHumidity"
                  name="relHumidity"
                  className={styles.input}
                  placeholder="e.g., 65"
                  min="0"
                  max="100"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="skies" className={styles.label}>
                  Skies
                </label>
                <select id="skies" name="skies" className={styles.input}>
                  <option value="">Select</option>
                  <option value="0">Clear</option>
                  <option value="1">Partly Cloudy</option>
                  <option value="2">Mostly Cloudy</option>
                  <option value="3">Overcast</option>
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="precipChance" className={styles.label}>
                Precipitation Chance (%)
              </label>
              <input
                type="number"
                id="precipChance"
                name="precipChance"
                className={styles.input}
                placeholder="e.g., 15"
                min="0"
                max="100"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="carClassesInput" className={styles.label}>
              Car Classes
            </label>
            <input
              type="text"
              id="carClassesInput"
              name="carClassesInput"
              className={styles.input}
              placeholder="e.g., GTP, LMP2, GT3 (comma-separated, optional)"
            />
          </div>

          {state.message && state.message !== 'Success' && (
            <div className={styles.error}>{state.message}</div>
          )}

          {state.message === 'Success' && (
            <div className={styles.success}>Event created successfully!</div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitButton} disabled={pending}>
              {pending ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
