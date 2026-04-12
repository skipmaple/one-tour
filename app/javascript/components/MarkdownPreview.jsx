import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { ScrollArea, Text } from '@mantine/core'

export default function MarkdownPreview({ content }) {
  if (!content || content.trim() === '') {
    return <Text c="dimmed" ta="center" py="xl">No content to preview</Text>
  }

  return (
    <ScrollArea h="100%" type="auto" offsetScrollbars>
      <div className="markdown-body" style={{ padding: '16px' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {content}
        </ReactMarkdown>
      </div>
    </ScrollArea>
  )
}
