import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Text } from '@mantine/core'

// Safe Markdown renderer: react-markdown escapes HTML by default (no
// rehype-raw here). Used for Activity#desc and potentially similar free-text
// fields elsewhere.
//
// `stripHtmlPlugin` drops any `html` AST nodes (raw HTML tags typed or pasted
// by the user). Without this, react-markdown's default behavior is to render
// HTML as *escaped text* — safe, but shows ugly literal "<script>..." text in
// the output. Dropping them entirely is both XSS-safe and visually clean.
// Non-HTML uses of `<` (e.g., "<3") stay in text nodes unaffected.
function stripHtmlPlugin() {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.children)) {
      node.children = node.children.filter((c) => c && c.type !== 'html')
      node.children.forEach(visit)
    }
  }
  return (tree) => visit(tree)
}

const components = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  h1: ({ children }) => <Text fw={600} size="md" my={4}>{children}</Text>,
  h2: ({ children }) => <Text fw={600} size="sm" my={4}>{children}</Text>,
  h3: ({ children }) => <Text fw={600} size="sm" my={4}>{children}</Text>,
  p:  ({ children }) => <Text size="sm" my={2}>{children}</Text>,
  ul: ({ children }) => <Text component="ul" size="sm" my={2} pl="md">{children}</Text>,
  ol: ({ children }) => <Text component="ol" size="sm" my={2} pl="md">{children}</Text>,
  li: ({ children }) => <Text component="li" size="sm">{children}</Text>,
}

export default function MarkdownView({ source }) {
  if (!source) return null
  return (
    <ReactMarkdown
      remarkPlugins={[ remarkGfm, remarkBreaks, stripHtmlPlugin ]}
      components={components}
    >
      {source}
    </ReactMarkdown>
  )
}
