import { describe, it, expect } from 'vitest'
import { authConfig } from './auth.config'
import { SESSION_VERSION } from '@/lib/config'
import { UserRole } from '@prisma/client'

describe('auth.config', () => {
  describe('callbacks', () => {
    describe('authorized', () => {
      it('returns true for public routes even if not logged in', () => {
        const nextUrl = { pathname: '/login' } as any
        const result = (authConfig.callbacks as any).authorized({
          auth: null,
          request: { nextUrl },
        })
        expect(result).toBe(true)
      })

      it('returns true for api routes', () => {
        const nextUrl = { pathname: '/api/something' } as any
        const result = (authConfig.callbacks as any).authorized({
          auth: null,
          request: { nextUrl },
        })
        expect(result).toBe(true)
      })

      it('returns false for protected route if not logged in', () => {
        const nextUrl = { pathname: '/admin' } as any
        const result = (authConfig.callbacks as any).authorized({
          auth: null,
          request: { nextUrl },
        })
        expect(result).toBe(false)
      })

      it('returns true for protected route if logged in', () => {
        const nextUrl = { pathname: '/admin' } as any
        const result = (authConfig.callbacks as any).authorized({
          auth: { user: { id: '1' } },
          request: { nextUrl },
        })
        expect(result).toBe(true)
      })
    })

    describe('jwt', () => {
      it('copies user fields to token on initial login', async () => {
        const user = {
          id: 'user-123',
          role: UserRole.ADMIN,
          iracingCustomerId: 456,
          expectationsVersion: 1,
        }
        const token = {} as any
        const result = await (authConfig.callbacks as any).jwt({ token, user })

        expect(result.id).toBe(user.id)
        expect(result.role).toBe(user.role)
        expect(result.iracingCustomerId).toBe(user.iracingCustomerId)
        expect(result.expectationsVersion).toBe(user.expectationsVersion)
        expect(result.version).toBe(SESSION_VERSION)
      })

      it('updates token fields on update trigger', async () => {
        const token = { id: 'user-123', iracingCustomerId: 1 } as any
        const session = { iracingCustomerId: 999, expectationsVersion: 2 }
        const result = await (authConfig.callbacks as any).jwt({
          token,
          trigger: 'update',
          session,
        })

        expect(result.iracingCustomerId).toBe(999)
        expect(result.expectationsVersion).toBe(2)
      })
    })

    describe('session', () => {
      it('transfers fields from token to session', async () => {
        const token = {
          id: 'user-123',
          role: UserRole.ADMIN,
          iracingCustomerId: 456,
          expectationsVersion: 1,
          version: SESSION_VERSION,
        }
        const session = { user: {} } as any
        const result = await (authConfig.callbacks as any).session({ session, token })

        expect(result.user.id).toBe(token.id)
        expect(result.user.role).toBe(token.role)
        expect(result.user.iracingCustomerId).toBe(token.iracingCustomerId)
        expect(result.user.expectationsVersion).toBe(token.expectationsVersion)
        expect(result.version).toBe(token.version)
      })
    })
  })
})
