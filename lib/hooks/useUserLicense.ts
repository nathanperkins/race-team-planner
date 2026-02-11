import { useEffect, useState } from 'react'

/**
 * Hook to fetch the current user's license level.
 * Always fetches fresh data from the API to ensure it reflects
 * the latest iRacing stats synced from the API.
 */
export function useUserLicense() {
  const [license, setLicense] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLicense = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/api/user/license')

        if (!response.ok) {
          throw new Error(`Failed to fetch license: ${response.statusText}`)
        }

        const data = await response.json()
        setLicense(data.license)
        setError(null)
      } catch (err) {
        console.error('Error fetching user license:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLicense(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLicense()
  }, [])

  return { license, isLoading, error }
}
