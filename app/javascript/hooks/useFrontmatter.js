import { useState, useDeferredValue, useMemo } from 'react'
import yaml from 'js-yaml'

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)

  if (!match) {
    return { data: {}, content }
  }

  try {
    const data = yaml.load(match[1]) || {}
    return { data, content: match[2] }
  } catch (e) {
    throw new Error(`YAML parse error: ${e.message}`)
  }
}

export function useFrontmatter(initialContent) {
  const [rawContent, setRawContent] = useState(initialContent || '')
  const deferredContent = useDeferredValue(rawContent)

  const parsed = useMemo(() => {
    try {
      const { data, content } = parseFrontmatter(deferredContent)
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
