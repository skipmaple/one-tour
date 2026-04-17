import { describe, test, expect } from 'vitest'
import { formatDateISO } from '../Constitution'

describe('formatDateISO', () => {
  test('returns an already-ISO string unchanged', () => {
    expect(formatDateISO('2026-04-16')).toBe('2026-04-16')
  })

  test('normalizes a non-padded ISO-ish string by parsing it', () => {
    expect(formatDateISO('2026-4-16')).toBe('2026-04-16')
  })

  test('formats a Date object (month is 0-indexed in JS)', () => {
    expect(formatDateISO(new Date(2026, 3, 16))).toBe('2026-04-16')
  })

  test('returns null for null', () => {
    expect(formatDateISO(null)).toBeNull()
  })

  test('returns null for undefined', () => {
    expect(formatDateISO(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(formatDateISO('')).toBeNull()
  })

  test('returns null for Invalid Date', () => {
    expect(formatDateISO(new Date('bogus'))).toBeNull()
  })

  test('returns null for a plain object', () => {
    expect(formatDateISO({})).toBeNull()
  })

  test('returns null for a number', () => {
    expect(formatDateISO(12345)).toBeNull()
  })
})
