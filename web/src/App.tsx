import { useState } from 'react';
import { SessionList } from './components/SessionList';
import { ChatPanel } from './components/ChatPanel';
import { nanoid } from 'nanoid';

function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const handleNewSession = () => {
    // Create a new session ID immediately
    const newId = nanoid();
    setCurrentSessionId(newId);
  };

  return (
    <div className="flex h-screen">
      <SessionList
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewSession={handleNewSession}
      />
      <ChatPanel 
        sessionId={currentSessionId}
        onSessionCreated={setCurrentSessionId}
      />
    </div>
  );
}

export default App;
