import { useState, useCallback, useMemo } from "react"
import { Bubble, Sender } from "@ant-design/x"
import { Flex, Typography, Alert, Button, Space, Tag } from "antd"
import {
  UserOutlined,
  RobotOutlined,
  StopOutlined,
} from "@ant-design/icons"
import type { BubbleListProps, BubbleItemType } from "@ant-design/x/es/bubble/interface"
import { useSession } from "../../context/session"
import { ToolCard } from "./ToolCard"
import { MarkdownBubble } from "./MarkdownBubble"
import type { MessageAssistant, MessagePart, ToolPart, PermissionRequest, PermissionReply } from "../../lib/types"

// ---------------------------------------------------------------------------
// Role config for Bubble.List
// ---------------------------------------------------------------------------

const role: BubbleListProps["role"] = {
  user: {
    placement: "end",
    avatar: (
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <UserOutlined />
      </div>
    ),
  },
  ai: {
    placement: "start",
    avatar: (
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <RobotOutlined />
      </div>
    ),
  },
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel() {
  const { state, sendMessage, abortSession, replyPermission } = useSession()
  const [input, setInput] = useState("")

  const isStreaming = useMemo(
    () =>
      state.messages.some(
        (m) => m.info.role === "assistant" && !(m.info as MessageAssistant).finish,
      ),
    [state.messages],
  )

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !state.activeID) return
      setInput("")
      await sendMessage(text.trim())
    },
    [state.activeID, sendMessage],
  )

  const handleAbort = useCallback(() => {
    if (state.activeID) abortSession(state.activeID)
  }, [state.activeID, abortSession])

  // ---------------------------------------------------------------------------
  // No session selected
  // ---------------------------------------------------------------------------
  if (!state.activeID) {
    return (
      <Flex vertical align="center" justify="center" style={{ flex: 1 }}>
        <div style={{ fontSize: 48, opacity: 0.4, marginBottom: 16 }}>🧂</div>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>
          Salt Agent
        </Typography.Title>
        <Typography.Text type="secondary">
          创建新对话或从侧边栏选择一个已有对话。
        </Typography.Text>
      </Flex>
    )
  }

  // ---------------------------------------------------------------------------
  // Build bubble items from messages
  // ---------------------------------------------------------------------------
  const bubbleItems: BubbleItemType[] = []

  for (const msg of state.messages) {
    const parts: MessagePart[] = state.parts[msg.info.id] ?? msg.parts

    if (msg.info.role === "user") {
      const text = parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n")

      bubbleItems.push({
        key: msg.info.id,
        role: "user",
        content: text,
      })
    } else if (msg.info.role === "assistant") {
      const assistantInfo = msg.info as MessageAssistant
      const toolParts = parts.filter((p): p is ToolPart => p.type === "tool")
      const textParts = parts.filter((p) => p.type === "text" && !("ignored" in p && p.ignored))
      const reasoningParts = parts.filter((p) => p.type === "reasoning")
      const msgStreaming = !assistantInfo.finish

      // Tool calls
      for (const tp of toolParts) {
        bubbleItems.push({
          key: tp.id,
          role: "ai",
          content: <ToolCard part={tp} />,
          variant: "borderless",
        })
      }

      // Reasoning
      for (const rp of reasoningParts) {
        if (rp.type === "reasoning" && rp.text) {
          bubbleItems.push({
            key: rp.id,
            role: "ai",
            content: (
              <Typography.Text type="secondary" italic style={{ fontSize: 12 }}>
                💭 {rp.text.length > 200 ? rp.text.slice(0, 200) + "..." : rp.text}
              </Typography.Text>
            ),
            variant: "borderless",
          })
        }
      }

      // Text response
      const fullText = textParts
        .map((p) => (p as { text: string }).text)
        .join("\n")

      if (fullText) {
        bubbleItems.push({
          key: msg.info.id + "-text",
          role: "ai",
          content: <MarkdownBubble text={fullText} />,
          loading: msgStreaming && !fullText,
          typing: msgStreaming ? { effect: "typing", step: 5, interval: 30 } : undefined,
        })
      } else if (msgStreaming) {
        bubbleItems.push({
          key: msg.info.id + "-loading",
          role: "ai",
          content: "",
          loading: true,
        })
      }

      // Error
      if (assistantInfo.error) {
        bubbleItems.push({
          key: msg.info.id + "-error",
          role: "ai",
          content: (
            <Alert
              type="error"
              message={assistantInfo.error.name}
              description={String(assistantInfo.error.message ?? "")}
              showIcon
              style={{ maxWidth: 500 }}
            />
          ),
          variant: "borderless",
        })
      }

      // Token usage
      if (assistantInfo.finish && (assistantInfo.tokens.input + assistantInfo.tokens.output > 0)) {
        bubbleItems.push({
          key: msg.info.id + "-usage",
          role: "ai",
          content: (
            <Space size={4}>
              <Tag bordered={false} style={{ fontSize: 11 }}>
                {assistantInfo.tokens.input + assistantInfo.tokens.output} tokens
              </Tag>
              {assistantInfo.cost > 0 && (
                <Tag bordered={false} style={{ fontSize: 11 }}>
                  ${assistantInfo.cost.toFixed(4)}
                </Tag>
              )}
              <Tag bordered={false} color="default" style={{ fontSize: 11 }}>
                {assistantInfo.modelID.split("/").pop()}
              </Tag>
            </Space>
          ),
          variant: "borderless",
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Flex vertical style={{ flex: 1, minWidth: 0, height: "100%" }}>
      {/* Permission banner */}
      {state.permissions.length > 0 && (
        <PermissionBar
          permission={state.permissions[0]!}
          onReply={(reply) => replyPermission(state.permissions[0]!.id, reply)}
        />
      )}

      {/* Messages */}
      <Bubble.List
        role={role}
        items={bubbleItems}
        autoScroll
        style={{ flex: 1, padding: "16px 24px", overflow: "auto" }}
      />

      {/* Input */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid var(--ant-color-border)" }}>
        <Flex gap={8} align="end" style={{ maxWidth: 720, margin: "0 auto" }}>
          <Sender
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            loading={isStreaming}
            placeholder={state.activeID ? "输入消息...（按 Enter 发送）" : "请先选择一个会话"}
            disabled={!state.activeID}
            style={{ flex: 1 }}
          />
          {isStreaming && (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleAbort}
            >
              停止
            </Button>
          )}
        </Flex>
      </div>
    </Flex>
  )
}

// ---------------------------------------------------------------------------
// Permission bar
// ---------------------------------------------------------------------------

function PermissionBar({
  permission,
  onReply,
}: {
  permission: PermissionRequest
  onReply: (reply: PermissionReply) => void
}) {
  return (
    <Alert
      type="warning"
      showIcon
      message={
        <Flex justify="space-between" align="center" wrap gap={8}>
          <span>
            需要权限: <Tag>{permission.permission}</Tag>
            {permission.patterns.length > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                ({permission.patterns.join(", ")})
              </Typography.Text>
            )}
          </span>
          <Space>
            <Button size="small" type="primary" onClick={() => onReply("once")}>
              允许一次
            </Button>
            {permission.always.length > 0 && (
              <Button size="small" onClick={() => onReply("always")}>
                始终允许
              </Button>
            )}
            <Button size="small" danger onClick={() => onReply("reject")}>
              拒绝
            </Button>
          </Space>
        </Flex>
      }
      style={{ borderRadius: 0 }}
    />
  )
}

