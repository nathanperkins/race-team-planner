import { vi } from 'vitest'

/**
 * Shared mock logger for tests
 *
 * Usage in test files:
 * ```typescript
 * import { mockLogger, resetMockLogger } from '@/lib/test-helpers/mock-logger'
 *
 * vi.mock('@/lib/logger', () => ({
 *   createLogger: () => mockLogger,
 *   logger: mockLogger,
 * }))
 *
 * beforeEach(() => {
 *   resetMockLogger()
 * })
 *
 * // In tests:
 * expect(mockLogger.info).toHaveBeenCalledWith('message')
 * ```
 */
export const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}

/**
 * Reset all mock logger function calls
 * Call this in beforeEach to clear previous test state
 */
export function resetMockLogger() {
  mockLogger.info.mockClear()
  mockLogger.error.mockClear()
  mockLogger.warn.mockClear()
  mockLogger.debug.mockClear()
}
