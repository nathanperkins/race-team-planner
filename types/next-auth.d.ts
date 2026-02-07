import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      iracingCustomerId?: number | null
      role: UserRole
      expectationsVersion: number
    }
  }

  interface User {
    role: UserRole
    iracingCustomerId?: number | null
    expectationsVersion: number
  }
}

declare module '@auth/core/adapters' {
  interface AdapterUser {
    role: UserRole
    iracingCustomerId?: number | null
    expectationsVersion: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    iracingCustomerId?: number | null
    expectationsVersion: number
  }
}
