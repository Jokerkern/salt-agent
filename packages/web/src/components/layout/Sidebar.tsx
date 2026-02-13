import { useMemo, useState } from "react"
import { Conversations } from "@ant-design/x"
import { Button, Tooltip, message } from "antd"
import {
  PlusOutlined,
  DeleteOutlined,
  SunOutlined,
  MoonOutlined,
  SettingOutlined,
} from "@ant-design/icons"
import { useSession } from "../../context/session"
import { useTheme } from "../../context/theme"

interface SidebarProps {
  onOpenSettings: () => void
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const { state, setActive, deleteSession, createSession } = useSession()
  const { resolved, toggle } = useTheme()
  const [creating, setCreating] = useState(false)

  const items = useMemo(
    () =>
      state.sessions.map((s) => ({
        key: s.id,
        label: s.title || "新对话",
      })),
    [state.sessions],
  )

  const handleNew = async () => {
    if (creating) return
    setCreating(true)
    try {
      const session = await createSession()
      setActive(session.id)
    } catch (err) {
      console.error("Failed to create session:", err)
      message.error("创建会话失败，请检查后端是否正在运行。")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRight: "1px solid var(--ant-color-border)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--ant-color-border)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Salt Agent</span>
        <div style={{ display: "flex", gap: 4 }}>
          <Tooltip title={resolved === "dark" ? "浅色模式" : "深色模式"}>
            <Button
              type="text"
              size="small"
              icon={resolved === "dark" ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggle}
            />
          </Tooltip>
          <Tooltip title="设置">
            <Button
              type="text"
              size="small"
              icon={<SettingOutlined />}
              onClick={onOpenSettings}
            />
          </Tooltip>
        </div>
      </div>

      {/* New Chat */}
      <div style={{ padding: "8px 12px" }}>
        <Button type="primary" icon={<PlusOutlined />} block onClick={handleNew} loading={creating}>
          新对话
        </Button>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Conversations
          items={items}
          activeKey={state.activeID ?? undefined}
          onActiveChange={(key) => setActive(key)}
          menu={(conversation) => ({
            items: [
              {
                key: "delete",
                label: "删除",
                icon: <DeleteOutlined />,
                danger: true,
              },
            ],
            onClick: ({ key }) => {
              if (key === "delete") {
                deleteSession(conversation.key)
              }
            },
          })}
        />
      </div>
    </div>
  )
}
