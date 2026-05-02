import { describe, it, expect } from 'vitest'
import { OUTBOX_PATHS, isOutboxPath } from '../paths'

describe('OUTBOX_PATHS', () => {
  it('matches 4 JSON mutation paths', () => {
    expect(isOutboxPath('/tours/123/expenses')).toBe(true)
    expect(isOutboxPath('/expenses/456')).toBe(true)
    expect(isOutboxPath('/activities/789')).toBe(true)
    expect(isOutboxPath('/tours/123/settlements')).toBe(true)
    expect(isOutboxPath('/tours/123/days/4')).toBe(true)
  })

  it('rejects non-listed paths', () => {
    expect(isOutboxPath('/tours/123')).toBe(false)
    expect(isOutboxPath('/auth/github')).toBe(false)
    expect(isOutboxPath('/activities/789/position')).toBe(false)
    expect(isOutboxPath('/activities/789/images')).toBe(false) // photo 走应用层
    expect(isOutboxPath('/random')).toBe(false)
  })
})
