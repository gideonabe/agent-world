import { useEffect, useState, useSyncExternalStore } from 'react';
import { createAgentWorldStore, MockEventSource, WebSocketEventSource, type ConnectionStatus } from '@agent-world/core';
import { AgentWorld, meadowIsland, meadowTheme, remoteSocketUrl } from '@agent-world/engine';
import { TopBar } from './ui/TopBar';
import { Roster } from './ui/Roster';
import { Inspector } from './ui/Inspector';
import { EventFeed } from './ui/EventFeed';
import { createOrchestrator, createRemoteOrchestrator } from './orchestrator';

// Same world + UI, only the event source changes:
//   default                               local simulator (MockEventSource)
//   ?server=http://…:8787&project=x       live project on an Agent World server (&token=… with --auth)
//   ?ws=ws://…/ws                         raw socket URL (legacy)
const params = new URLSearchParams(location.search);
const serverUrl = params.get('server');
const projectId = params.get('project') ?? 'default';
const wsUrl = serverUrl ? remoteSocketUrl(serverUrl, projectId) : params.get('ws');
const showStats = params.has('stats');

// In live mode the server owns lifecycle timers (settle/stall), so the client doesn't run them.
const store = createAgentWorldStore(meadowIsland, { lifecycle: wsUrl ? false : {} });
const socket = wsUrl ? new WebSocketEventSource({ url: wsUrl, ...(params.get('token') ? { token: params.get('token')! } : {}) }) : undefined;
const mock = socket ? undefined : new MockEventSource({ agentCount: 9, seed: 7 });
const source = socket ?? mock!;
const orchestrator = socket ? createRemoteOrchestrator(store, socket) : createOrchestrator(store, mock!);

const subscribeStatus = (cb: () => void) => socket?.onStatus(cb) ?? (() => {});
const getStatus = (): ConnectionStatus | undefined => socket?.status;

export function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const connection = useSyncExternalStore(subscribeStatus, getStatus);

  useEffect(() => store.getState().connect(source), []);
  useEffect(() => void (mock && (mock.paused = paused)), [paused]);
  useEffect(() => mock?.setTimeScale(1 / speed), [speed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <AgentWorld store={store} theme={meadowTheme} selectedAgentId={selected} onSelectAgent={setSelected} stats={showStats} />
      <TopBar
        store={store}
        worldName={serverUrl ? `${meadowIsland.name} · ${projectId}` : meadowIsland.name}
        source={socket ? { kind: 'live', url: wsUrl!, status: connection ?? 'idle' } : { kind: 'mock' }}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        speed={speed}
        onSpeed={setSpeed}
        onSpawn={() => mock && setSelected(mock.spawn().id)}
      />
      <Roster store={store} selected={selected} onSelect={setSelected} />
      {selected && (
        <Inspector
          store={store}
          orchestrator={{ ...orchestrator, remove: (id) => { orchestrator.remove(id); setSelected(null); } }}
          agentId={selected}
          onClose={() => setSelected(null)}
        />
      )}
      <EventFeed store={store} />
      <div className="hint">Drag to orbit · Right-drag to pan · Scroll to zoom · Click a robot to follow</div>
    </div>
  );
}
