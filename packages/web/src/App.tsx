import { useState, useEffect } from "react"
import { Flex } from "antd"
import { SSEProvider } from "./context/sse"
import { ThemeProvider } from "./context/theme"
import { SessionProvider, useSession } from "./context/session"
import { Sidebar } from "./components/layout/Sidebar"
import { ChatPanel } from "./components/chat/ChatPanel"
import { SettingsDialog } from "./components/settings/SettingsDialog"

function AppLayout() {
  const { loadSessions } = useSession()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  return (
    <Flex style={{ height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      {/* Main content */}
      <ChatPanel />

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Flex>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <SSEProvider>
        <SessionProvider>
          <AppLayout />
        </SessionProvider>
      </SSEProvider>
    </ThemeProvider>
  )
}
