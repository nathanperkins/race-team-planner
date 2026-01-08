
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import styles from "../dashboard/dashboard.module.css";

interface EventFiltersProps {
  carClasses: string[];
  currentFilters: {
    hasSignups?: string;
    carClass?: string;
    from?: string;
    to?: string;
  };
}

export default function EventFilters({ carClasses, currentFilters }: EventFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
        <label htmlFor="hasSignups" className={styles.filterLabel}>Signups</label>
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
        <label htmlFor="carClass" className={styles.filterLabel}>Car Class</label>
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
        <label htmlFor="from" className={styles.filterLabel}>From</label>
        <input
          id="from"
          type="date"
          className={styles.filterInput}
          value={currentFilters.from || ""}
          onChange={(e) => handleFilterChange("from", e.target.value)}
        />
      </div>

      <div className={styles.filterGroup}>
        <label htmlFor="to" className={styles.filterLabel}>To</label>
        <input
          id="to"
          type="date"
          className={styles.filterInput}
          value={currentFilters.to || ""}
          onChange={(e) => handleFilterChange("to", e.target.value)}
        />
      </div>

      {(currentFilters.hasSignups || currentFilters.carClass || currentFilters.from || currentFilters.to) && (
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
