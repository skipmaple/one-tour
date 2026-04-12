import { useState, useDeferredValue, useMemo } from 'react'
import matter from 'gray-matter'

export function useFrontmatter(initialContent) {
  const [rawContent, setRawContent] = useState(initialContent || '')
  const deferredContent = useDeferredValue(rawContent)

  const parsed = useMemo(() => {
    try {
      const { data, content } = matter(deferredContent)
      return { frontmatter: data, body: content, error: null }
    } catch (e) {
      return { frontmatter: null, body: deferredContent, error: e.message }
    }
  }, [deferredContent])

  return {
    rawContent,
    setRawContent,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    parseError: parsed.error,
  }
}
