import { Session } from 'next-auth'
import { CURRENT_EXPECTATIONS_VERSION } from './config'
import { isMockUser } from './utils'

export enum OnboardingStatus {
  NOT_LOGGED_IN = 'NOT_LOGGED_IN',
  NO_EXPECTATIONS = 'NO_EXPECTATIONS', // Policy: Expectations first
  NO_CUSTOMER_ID = 'NO_CUSTOMER_ID', // Then Customer ID
  COMPLETE = 'COMPLETE',
}

export const ONBOARDING_PATHS: Record<OnboardingStatus, string | null> = {
  [OnboardingStatus.NOT_LOGGED_IN]: '/login',
  [OnboardingStatus.NO_EXPECTATIONS]: '/expectations',
  [OnboardingStatus.NO_CUSTOMER_ID]: '/profile',
  [OnboardingStatus.COMPLETE]: null,
}

export function getOnboardingStatus(session: Session | null): OnboardingStatus {
  if (!session?.user) {
    return OnboardingStatus.NOT_LOGGED_IN
  }

  const { iracingCustomerId, expectationsVersion } = session.user

  // Step 1: Force expectations first
  if ((expectationsVersion || 0) < CURRENT_EXPECTATIONS_VERSION) {
    return OnboardingStatus.NO_EXPECTATIONS
  }

  // Step 2: Force Customer ID
  if (!iracingCustomerId && !isMockUser(session.user)) {
    return OnboardingStatus.NO_CUSTOMER_ID
  }

  return OnboardingStatus.COMPLETE
}
