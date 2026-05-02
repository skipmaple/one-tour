import { describe, it, expect } from 'vitest'
import { OUTBOX_PATHS, isOutboxPath } from '../paths'

describe('OUTBOX_PATHS', () => {
  it('has 5 regex entries (length canary — SW task duplicates inline)', () => {
    // Workbox SW build 不能 import lib 模块,Task 7 在 vite.config.ts 内联复一份。
    // 加 / 减 entry 时两处都要改,length 锁锚一份预期数防漏改。
    expect(OUTBOX_PATHS).toHaveLength(5)
  })

  it('matches all whitelisted mutation paths', () => {
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
