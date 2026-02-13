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
  DeleteOutlined,
  SearchOutlined,
  FolderOutlined,
  GlobalOutlined,
  CodeSandboxOutlined,
  BranchesOutlined,
  UnorderedListOutlined,
  QuestionCircleOutlined,
  LockOutlined,
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
  delete: <DeleteOutlined />,
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
  plan_enter: <QuestionCircleOutlined />,
  plan_exit: <QuestionCircleOutlined />,
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
    case "delete":
      return `删除 ${input.filePath ?? ""}`
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
    case "plan_enter":
      return "切换到计划模式"
    case "plan_exit":
      return "退出计划模式"
    default:
      return part.tool
  }
}

function StatusTag({ status, waitingPermission }: { status: string; waitingPermission?: boolean }) {
  if (waitingPermission) {
    return <Tag icon={<LockOutlined />} color="warning">等待批准</Tag>
  }
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
  const questionRequest = useQuestionRequest(part)
  // 优先从工具参数获取问题内容（question 工具），否则从 Bus 事件获取（plan_enter/plan_exit 等）
  const questions = (
    (state.input.questions as QuestionInfo[] | undefined)?.length
      ? state.input.questions
      : questionRequest?.questions ?? []
  ) as QuestionInfo[]
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

/** 从 session state 里找到与此 tool part 匹配的 permission request */
function usePermissionRequest(part: ToolPart) {
  const { state } = useSession()
  if (part.state.status !== "running") return undefined
  return state.permissions.find(
    (p) => p.tool?.messageID === part.messageID && p.tool?.callID === part.callID,
  )
}

/** 内联权限审批 */
function PermissionBody({ part }: { part: ToolPart }) {
  const { replyPermission } = useSession()
  const permReq = usePermissionRequest(part)
  if (!permReq) return null

  return (
    <Flex
      align="center"
      justify="space-between"
      wrap
      gap={8}
      style={{
        padding: "8px 12px",
        borderRadius: 6,
        background: "var(--ant-color-warning-bg)",
        border: "1px solid var(--ant-color-warning-border)",
      }}
    >
      <Space size={4}>
        <LockOutlined style={{ color: "var(--ant-color-warning)" }} />
        <Typography.Text style={{ fontSize: 12 }}>
          需要权限: <Tag color="warning" style={{ marginInlineEnd: 0 }}>{permReq.permission}</Tag>
        </Typography.Text>
        {permReq.patterns.length > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            ({permReq.patterns.join(", ")})
          </Typography.Text>
        )}
      </Space>
      <Space size={6}>
        <Button size="small" type="primary" onClick={() => replyPermission(permReq.id, "once")}>
          允许一次
        </Button>
        {permReq.always.length > 0 && (
          <Button size="small" onClick={() => replyPermission(permReq.id, "always")}>
            始终允许
          </Button>
        )}
        <Button size="small" danger onClick={() => replyPermission(permReq.id, "reject")}>
          拒绝
        </Button>
      </Space>
    </Flex>
  )
}

export function ToolCard({ part }: ToolCardProps) {
  const [_expanded] = useState(false)
  const { state } = part
  const title = getToolTitle(part)
  const icon = TOOL_ICONS[part.tool] ?? <CodeOutlined />

  const permReq = usePermissionRequest(part)
  const waitingPermission = !!permReq

  const duration =
    (state.status === "completed" || state.status === "error") && state.time
      ? ((state.time.end - state.time.start) / 1000).toFixed(1) + "s"
      : undefined

  // 任何使用 Question.ask() 的工具都应显示问答 UI（question、plan_enter、plan_exit 等）
  const questionReq = useQuestionRequest(part)
  const isQuestion = part.tool === "question" || !!questionReq

  // Auto-expand when waiting for permission or question
  const activeKey = waitingPermission
    ? [part.id]
    : isQuestion && (state.status === "running" || state.status === "pending")
      ? [part.id]
      : undefined

  return (
    <Collapse
      size="small"
      style={{ maxWidth: 600 }}
      defaultActiveKey={activeKey}
      activeKey={waitingPermission ? [part.id] : undefined}
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
              <StatusTag status={state.status} waitingPermission={waitingPermission} />
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
              {/* Inline permission approval */}
              {waitingPermission && <PermissionBody part={part} />}

              {/* Input */}
              <Typography.Text type="secondary" strong style={{ fontSize: 11, marginTop: waitingPermission ? 8 : 0, display: "block" }}>
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
