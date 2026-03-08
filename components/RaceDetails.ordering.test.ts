import { describe, it, expect } from 'vitest'
import { replaceTeamIdInOrder } from '@/lib/team-order'

describe('replaceTeamIdInOrder', () => {
  it('replaces in place and removes duplicate when replacement team already exists', () => {
    const order = ['team-1', 'team-2', 'temp-team-1']

    const updated = replaceTeamIdInOrder(order, 'team-1', 'temp-team-1')

    expect(updated).toEqual(['temp-team-1', 'team-2'])
  })

  it('replaces current team when replacement team does not yet exist in order', () => {
    const order = ['team-1', 'team-2']

    const updated = replaceTeamIdInOrder(order, 'team-1', 'team-3')

    expect(updated).toEqual(['team-3', 'team-2'])
  })
})
