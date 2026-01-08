
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useRef, useEffect } from "react";
import styles from "../dashboard/dashboard.module.css";

interface EventFiltersProps {
  carClasses: string[];
  racers: { id: string; name: string | null }[];
  currentFilters: {
    hasSignups?: string;
    carClass?: string;
    racer?: string;
    from?: string;
    to?: string;
    sort?: string;
  };
}

export default function EventFilters({ carClasses, racers, currentFilters }: EventFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isRacerDropdownOpen, setIsRacerDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRacerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      return params.toString();
    },
    [searchParams]
  );

  const handleFilterChange = (name: string, value: string) => {
    router.push(pathname + "?" + createQueryString(name, value));
  };

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterGroup}>
        <label
          htmlFor="hasSignups"
          className={styles.filterLabel}
          data-tooltip="Show only events with or without active signups."
        >
          Signups
        </label>
        <select
          id="hasSignups"
          className={styles.filterSelect}
          value={currentFilters.hasSignups || ""}
          onChange={(e) => handleFilterChange("hasSignups", e.target.value)}
        >
          <option value="">All Events</option>
          <option value="true">Has Signups</option>
          <option value="false">No Signups</option>
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label
          htmlFor="carClass"
          className={styles.filterLabel}
          data-tooltip="Filter by car class (e.g., GT3, LMP2)."
        >
          Car Class
        </label>
        <select
          id="carClass"
          className={styles.filterSelect}
          value={currentFilters.carClass || ""}
          onChange={(e) => handleFilterChange("carClass", e.target.value)}
        >
          <option value="">All Classes</option>
          {carClasses.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label
          htmlFor="racer"
          className={styles.filterLabel}
          data-tooltip="Shows events where ALL selected racers are signed up."
        >
          Racers
        </label>
        <div className={styles.relative} ref={dropdownRef}>
          <button
            id="racer"
            className={styles.filterSelect}
            onClick={() => setIsRacerDropdownOpen(!isRacerDropdownOpen)}
            style={{ minWidth: '150px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            {currentFilters.racer ? `${currentFilters.racer.split(',').length} Selected` : "All Racers"}
            <span style={{ fontSize: '0.75em', marginLeft: '0.5rem' }}>▼</span>
          </button>

          {isRacerDropdownOpen && (
            <div className={styles.multiSelectDropdown}>
              {racers.map((racer) => {
                const selectedRacers = currentFilters.racer ? currentFilters.racer.split(',') : [];
                const isSelected = selectedRacers.includes(racer.id);

                return (
                  <label key={racer.id} className={styles.multiSelectItem}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={isSelected}
                      onChange={() => {
                        let newSelected = [...selectedRacers];
                        if (isSelected) {
                          newSelected = newSelected.filter(id => id !== racer.id);
                        } else {
                          newSelected.push(racer.id);
                        }
                        handleFilterChange("racer", newSelected.join(","));
                      }}
                    />
                    {racer.name || "Unknown"}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={styles.filterGroup}>
        <label
          htmlFor="from"
          className={styles.filterLabel}
          data-tooltip="Show events starting on or after this date."
        >
          From
        </label>
        <input
          id="from"
          type="date"
          className={styles.filterInput}
          value={currentFilters.from || ""}
          onChange={(e) => handleFilterChange("from", e.target.value)}
        />
      </div>

      <div className={styles.filterGroup}>
        <label
          htmlFor="to"
          className={styles.filterLabel}
          data-tooltip="Show events starting on or before this date."
        >
          To
        </label>
        <input
          id="to"
          type="date"
          className={styles.filterInput}
          value={currentFilters.to || ""}
          onChange={(e) => handleFilterChange("to", e.target.value)}
        />
      </div>

      <div className={styles.filterGroup}>
        <label
          htmlFor="sort"
          className={styles.filterLabel}
          data-tooltip="Sort events by date, name, or popularity."
        >
          Sort By
        </label>
        <select
          id="sort"
          className={styles.filterSelect}
          value={currentFilters.sort || "date"}
          onChange={(e) => handleFilterChange("sort", e.target.value)}
        >
          <option value="date">Date (Earliest)</option>
          <option value="dateDesc">Date (Latest)</option>
          <option value="name">Name (A-Z)</option>
          <option value="signups">Most Signups</option>
        </select>
      </div>

      {(currentFilters.hasSignups || currentFilters.carClass || currentFilters.racer || currentFilters.from || currentFilters.to || currentFilters.sort) && (
        <button
          className={styles.clearButton}
          onClick={() => router.push(pathname)}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
