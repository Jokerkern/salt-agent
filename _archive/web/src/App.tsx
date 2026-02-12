import { useState } from 'react';
import { SessionList } from './components/SessionList';
import { ChatPanel } from './components/ChatPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { ThemeContext, useThemeProvider } from './hooks/useTheme';
import { nanoid } from 'nanoid';

function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const themeCtx = useThemeProvider();

  const handleNewSession = () => {
    const newId = nanoid();
    setCurrentSessionId(newId);
  };

  const handleSessionCreated = (id: string) => {
    setCurrentSessionId(id);
    setSessionRefreshKey((k) => k + 1);
  };

  const handleDeleteSession = (id: string) => {
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  };

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
  };

  return (
    <ThemeContext.Provider value={themeCtx}>
      <div className="flex h-screen bg-surface-0">
        {/* Sidebar */}
        <div
          className={`sidebar-transition flex-shrink-0 overflow-hidden ${
            sidebarOpen ? 'w-72 min-w-[18rem]' : 'w-0 min-w-0'
          }`}
        >
          <div className="w-72 h-full bg-surface-1 border-r border-surface-4/50 flex flex-col">
            <SessionList
              currentSessionId={currentSessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
              onDeleteSession={handleDeleteSession}
              refreshKey={sessionRefreshKey}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatPanel
            sessionId={currentSessionId}
            onSessionCreated={handleSessionCreated}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {/* Settings Dialog */}
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </ThemeContext.Provider>
  );
}

export default App;
