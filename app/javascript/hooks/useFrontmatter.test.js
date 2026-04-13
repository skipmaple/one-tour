import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useFrontmatter } from './useFrontmatter'

describe('useFrontmatter', () => {
  it('parses valid frontmatter and body', () => {
    const content = "---\ntitle: Test\ndays: []\n---\n\n# Hello"
    const { result } = renderHook(() => useFrontmatter(content))

    expect(result.current.frontmatter).toEqual({ title: 'Test', days: [] })
    expect(result.current.body.trim()).toBe('# Hello')
    expect(result.current.parseError).toBeNull()
  })

  it('returns empty frontmatter for content without frontmatter', () => {
    const content = "# Just markdown"
    const { result } = renderHook(() => useFrontmatter(content))

    expect(result.current.frontmatter).toEqual({})
    expect(result.current.body).toBe(content)
    expect(result.current.parseError).toBeNull()
  })

  it('returns error for invalid YAML', () => {
    const content = "---\ntitle: [broken yaml\n---\n\n# Body"
    const { result } = renderHook(() => useFrontmatter(content))

    expect(result.current.frontmatter).toBeNull()
    expect(result.current.parseError).toBeTruthy()
  })

  it('updates when setRawContent is called', () => {
    const { result } = renderHook(() => useFrontmatter("---\ntitle: A\n---\n\n# A"))

    expect(result.current.frontmatter.title).toBe('A')

    act(() => {
      result.current.setRawContent("---\ntitle: B\n---\n\n# B")
    })

    expect(result.current.frontmatter.title).toBe('B')
    expect(result.current.body.trim()).toBe('# B')
  })

  it('handles empty initial content', () => {
    const { result } = renderHook(() => useFrontmatter(''))

    expect(result.current.rawContent).toBe('')
    expect(result.current.frontmatter).toEqual({})
    expect(result.current.parseError).toBeNull()
  })

  it('handles null initial content', () => {
    const { result } = renderHook(() => useFrontmatter(null))

    expect(result.current.rawContent).toBe('')
  })

  it('parses complex frontmatter with nested data', () => {
    const content = `---
title: Trip
days:
  - day: 1
    title: Day One
    coordinates: [43.83, 87.62]
---

# Content`
    const { result } = renderHook(() => useFrontmatter(content))

    expect(result.current.frontmatter.title).toBe('Trip')
    expect(result.current.frontmatter.days).toHaveLength(1)
    expect(result.current.frontmatter.days[0].coordinates).toEqual([43.83, 87.62])
  })
})
