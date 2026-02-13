import Markdown from "@ant-design/x-markdown"

interface MarkdownBubbleProps {
  text: string
}

export function MarkdownBubble({ text }: MarkdownBubbleProps) {
  if (!text) return null
  return <Markdown>{text}</Markdown>
}
