import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { ScrollArea, Text } from '@mantine/core'
import '../styles/markdown.css'

export default function MarkdownPreview({ content }) {
  if (!content || content.trim() === '') {
    return <Text c="dimmed" ta="center" py="xl">暂无内容</Text>
  }

  return (
    <ScrollArea h="100%" type="auto" offsetScrollbars>
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {content}
        </ReactMarkdown>
      </div>
    </ScrollArea>
  )
}
