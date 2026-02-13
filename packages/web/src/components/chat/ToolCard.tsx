import { useState } from "react"
import { Collapse, Tag, Typography, Space, Flex, Button } from "antd"
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  FileTextOutlined,
  FileAddOutlined,
  EditOutlined,
  SearchOutlined,
  FolderOutlined,
  GlobalOutlined,
  CodeSandboxOutlined,
  BranchesOutlined,
  UnorderedListOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons"
import { useSession } from "../../context/session"
import type { ToolPart } from "../../lib/types"

interface ToolCardProps {
  part: ToolPart
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  read: <FileTextOutlined />,
  write: <FileAddOutlined />,
  edit: <EditOutlined />,
  apply_patch: <EditOutlined />,
  bash: <CodeSandboxOutlined />,
  grep: <SearchOutlined />,
  glob: <FolderOutlined />,
  ls: <FolderOutlined />,
  webfetch: <GlobalOutlined />,
  websearch: <SearchOutlined />,
  todo: <UnorderedListOutlined />,
  todowrite: <UnorderedListOutlined />,
  task: <BranchesOutlined />,
  lsp: <CodeOutlined />,
  question: <QuestionCircleOutlined />,
}

function getToolTitle(part: ToolPart): string {
  const { state } = part
  if (state.status === "completed" && state.title) return state.title
  if (state.status === "running" && state.title) return state.title

  const input = state.input
  switch (part.tool) {
    case "read":
      return `读取 ${input.path ?? ""}`
    case "write":
      return `写入 ${input.path ?? ""}`
    case "edit":
      return `编辑 ${input.path ?? ""}`
    case "bash":
      return `$ ${typeof input.command === "string" ? input.command.slice(0, 80) : "..."}`
    case "grep":
      return `搜索: ${input.pattern ?? ""}`
    case "glob":
      return `匹配: ${input.pattern ?? ""}`
    case "ls":
      return `列出 ${input.path ?? "."}`
    case "webfetch":
      return `获取 ${input.url ?? ""}`
    case "websearch":
      return `搜索: ${input.query ?? ""}`
    case "question": {
      const questions = input.questions as Array<{ question: string }> | undefined
      if (questions?.length) return `询问: ${questions[0].question}`
      return "询问用户"
    }
    default:
      return part.tool
  }
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Tag icon={<ClockCircleOutlined />} color="default">等待中</Tag>
    case "running":
      return <Tag icon={<LoadingOutlined spin />} color="processing">运行中</Tag>
    case "completed":
      return <Tag icon={<CheckCircleOutlined />} color="success">完成</Tag>
    case "error":
      return <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Question 内联交互
// ---------------------------------------------------------------------------

interface QuestionOption {
  label: string
  description?: string
}

interface QuestionInfo {
  question: string
  options: QuestionOption[]
  header?: string
}

function QuestionBody({ part }: { part: ToolPart }) {
  const { state } = part
  const { replyQuestion, rejectQuestion } = useSession()
  const questions = (state.input.questions ?? []) as QuestionInfo[]
  const [selected, setSelected] = useState<Record<number, string[]>>({})

  // 已完成：显示结果
  if (state.status === "completed") {
    return (
      <div style={{ fontSize: 12, padding: "4px 0" }}>
        <Typography.Text type="secondary" strong style={{ fontSize: 11 }}>
          结果
        </Typography.Text>
        <pre
          style={{
            fontSize: 11,
            maxHeight: 200,
            overflow: "auto",
            margin: "4px 0",
            padding: 8,
            borderRadius: 6,
            background: "var(--ant-color-fill-tertiary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {state.output}
        </pre>
      </div>
    )
  }

  // 错误
  if (state.status === "error") {
    return (
      <div style={{ fontSize: 12, padding: "4px 0" }}>
        <Typography.Text type="danger" strong style={{ fontSize: 11 }}>
          错误
        </Typography.Text>
        <pre
          style={{
            fontSize: 11,
            margin: "4px 0",
            padding: 8,
            borderRadius: 6,
            background: "var(--ant-color-error-bg)",
            color: "var(--ant-color-error)",
            whiteSpace: "pre-wrap",
          }}
        >
          {state.error}
        </pre>
      </div>
    )
  }

  // 等待中 / 运行中：显示可交互的问题列表
  // 找到对应的 question request
  const questionRequest = useQuestionRequest(part)

  return (
    <Flex vertical gap={12} style={{ padding: "4px 0" }}>
      {questions.map((q, i) => (
        <div key={i}>
          {q.header && (
            <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              {q.header}
            </Typography.Text>
          )}
          <Typography.Text strong style={{ fontSize: 12 }}>
            {q.question}
          </Typography.Text>
          <Flex gap={6} wrap style={{ marginTop: 6 }}>
            {q.options.map((opt) => {
              const sel = (selected[i] ?? []).includes(opt.label)
              return (
                <Tag
                  key={opt.label}
                  color={sel ? "blue" : "default"}
                  style={{ cursor: questionRequest ? "pointer" : "default", fontSize: 12, padding: "2px 8px" }}
                  onClick={() => {
                    if (!questionRequest) return
                    setSelected((prev) => {
                      const cur = prev[i] ?? []
                      return {
                        ...prev,
                        [i]: sel ? cur.filter((l) => l !== opt.label) : [...cur, opt.label],
                      }
                    })
                  }}
                >
                  {opt.label}
                  {opt.description && (
                    <Typography.Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                      {opt.description}
                    </Typography.Text>
                  )}
                </Tag>
              )
            })}
          </Flex>
        </div>
      ))}
      {questionRequest && (
        <Flex gap={8} style={{ marginTop: 4 }}>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              const answers = questions.map((_, i) => selected[i] ?? [])
              replyQuestion(questionRequest.id, answers)
              setSelected({})
            }}
          >
            提交
          </Button>
          <Button size="small" onClick={() => rejectQuestion(questionRequest.id)}>
            忽略
          </Button>
        </Flex>
      )}
      {!questionRequest && (state.status === "running" || state.status === "pending") && (
        <Typography.Text type="secondary" italic style={{ fontSize: 11 }}>
          等待回答中...
        </Typography.Text>
      )}
    </Flex>
  )
}

/** 从 session state 里找到与此 tool part 匹配的 question request */
function useQuestionRequest(part: ToolPart) {
  const { state } = useSession()
  return state.questions.find(
    (q) => q.tool?.messageID === part.messageID && q.tool?.callID === part.callID,
  )
}

// ---------------------------------------------------------------------------
// 通用 ToolCard
// ---------------------------------------------------------------------------

export function ToolCard({ part }: ToolCardProps) {
  const [_expanded] = useState(false)
  const { state } = part
  const title = getToolTitle(part)
  const icon = TOOL_ICONS[part.tool] ?? <CodeOutlined />

  const duration =
    (state.status === "completed" || state.status === "error") && state.time
      ? ((state.time.end - state.time.start) / 1000).toFixed(1) + "s"
      : undefined

  const isQuestion = part.tool === "question"

  return (
    <Collapse
      size="small"
      style={{ maxWidth: 600 }}
      defaultActiveKey={isQuestion && state.status === "running" ? [part.id] : undefined}
      items={[
        {
          key: part.id,
          label: (
            <Space size={8}>
              {icon}
              <Typography.Text
                style={{ fontSize: 12, maxWidth: 400 }}
                ellipsis={{ tooltip: title }}
              >
                {title}
              </Typography.Text>
              <StatusTag status={state.status} />
              {duration && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {duration}
                </Typography.Text>
              )}
            </Space>
          ),
          children: isQuestion ? (
            <QuestionBody part={part} />
          ) : (
            <div style={{ fontSize: 12 }}>
              {/* Input */}
              <Typography.Text type="secondary" strong style={{ fontSize: 11 }}>
                输入
              </Typography.Text>
              <pre
                style={{
                  fontSize: 11,
                  maxHeight: 150,
                  overflow: "auto",
                  margin: "4px 0 8px",
                  padding: 8,
                  borderRadius: 6,
                  background: "var(--ant-color-fill-tertiary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(state.input, null, 2)}
              </pre>

              {/* Output */}
              {state.status === "completed" && (
                <>
                  <Typography.Text type="secondary" strong style={{ fontSize: 11 }}>
                    输出
                  </Typography.Text>
                  <pre
                    style={{
                      fontSize: 11,
                      maxHeight: 250,
                      overflow: "auto",
                      margin: "4px 0",
                      padding: 8,
                      borderRadius: 6,
                      background: "var(--ant-color-fill-tertiary)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {state.output}
                  </pre>
                </>
              )}

              {/* Error */}
              {state.status === "error" && (
                <>
                  <Typography.Text type="danger" strong style={{ fontSize: 11 }}>
                    错误
                  </Typography.Text>
                  <pre
                    style={{
                      fontSize: 11,
                      margin: "4px 0",
                      padding: 8,
                      borderRadius: 6,
                      background: "var(--ant-color-error-bg)",
                      color: "var(--ant-color-error)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {state.error}
                  </pre>
                </>
              )}
            </div>
          ),
        },
      ]}
    />
  )
}
