import { Plus, X } from 'lucide-react'
import styles from './AddEventModal.module.css'

interface Timeslot {
  id: string
  startTime: string
}

export interface CustomEventData {
  id?: string
  name?: string
  track?: string
  trackConfig?: string | null
  description?: string | null
  durationMins?: number | null
  licenseGroup?: number | null
  tempValue?: number | null
  tempUnits?: number | null
  relHumidity?: number | null
  skies?: number | null
  precipChance?: number | null
  carClasses?: Array<{ shortName: string }>
}

interface CustomEventFormFieldsProps {
  event?: CustomEventData
  timeslots: Timeslot[]
  setTimeslots: (ts: Timeslot[]) => void
}

export default function CustomEventFormFields({
  event,
  timeslots,
  setTimeslots,
}: CustomEventFormFieldsProps) {
  return (
    <>
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
          defaultValue={event?.name || ''}
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
          defaultValue={event?.track || ''}
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
          defaultValue={event?.trackConfig || ''}
        />
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
          defaultValue={
            event?.carClasses && event.carClasses.length > 0
              ? event.carClasses.map((cc) => cc.shortName).join(', ')
              : ''
          }
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
          defaultValue={event?.description || ''}
        />
      </div>

      <div className={styles.timeslotsContainer}>
        <div className={styles.sectionHeaderLine}>
          <label className={styles.label}>Timeslots *</label>
        </div>

        {timeslots.map((ts, index) => (
          <div key={index} className={styles.timeslotRow}>
            <div className={styles.field}>
              {/* Only include raceIds hidden input if in edit mode (event exists) */}
              {event && <input type="hidden" name="raceIds" value={ts.id || ''} />}
              <input
                type="datetime-local"
                name="startTimes"
                className={styles.input}
                value={ts.startTime}
                onChange={(e) => {
                  const newTs = [...timeslots]
                  newTs[index].startTime = e.target.value
                  setTimeslots(newTs)
                }}
                required
              />
            </div>
            {timeslots.length > 1 && (
              <button
                type="button"
                className={styles.removeTimeslotButton}
                onClick={() => {
                  const newTs = timeslots.filter((_, i) => i !== index)
                  setTimeslots(newTs)
                }}
                title="Remove timeslot"
              >
                <X size={18} />
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          className={styles.addTimeslotButton}
          onClick={() => {
            const lastTs = timeslots[timeslots.length - 1]
            setTimeslots([...timeslots, { id: '', startTime: lastTs ? lastTs.startTime : '' }])
          }}
        >
          <Plus size={16} /> Add Timeslot
        </button>
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
            defaultValue={event?.durationMins || ''}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="licenseGroup" className={styles.label}>
            License Level
          </label>
          <select
            id="licenseGroup"
            name="licenseGroup"
            className={styles.input}
            defaultValue={event?.licenseGroup || ''}
          >
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
              defaultValue={event?.tempValue || ''}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="tempUnits" className={styles.label}>
              Temp Units
            </label>
            <select
              id="tempUnits"
              name="tempUnits"
              className={styles.input}
              defaultValue={
                event?.tempUnits !== undefined && event?.tempUnits !== null ? event.tempUnits : ''
              }
            >
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
              defaultValue={event?.relHumidity || ''}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="skies" className={styles.label}>
              Skies
            </label>
            <select
              id="skies"
              name="skies"
              className={styles.input}
              defaultValue={event?.skies !== undefined && event?.skies !== null ? event.skies : ''}
            >
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
            defaultValue={event?.precipChance || ''}
          />
        </div>
      </div>
    </>
  )
}
