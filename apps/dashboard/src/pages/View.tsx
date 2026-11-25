import { useState } from 'react';
import { useStore } from 'zustand';
import { AgentWorld, useRemoteWorld } from '@agent-viz/engine';
import type { AdminApi } from '../api';
import { href } from '../router';

/** Full-screen world for a project (great on a wall display). */
export function ViewPage({ api, projectId }: { api: AdminApi; projectId: string }) {
  const remote = useRemoteWorld({ server: api.base, project: projectId, ...(api.conn.token ? { token: api.conn.token } : {}) });
  const agents = useStore(remote.store, (s) => Object.keys(s.agents).length);
  const [selected, setSelected] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const worldName = useStore(remote.store, (s) => s.world.name);
  return (
    <div className="fullview">
      <AgentWorld store={remote.store} selectedAgentId={selected} onSelectAgent={setSelected} sound={sound} />
      <div className="fullview-bar">
        <a className="btn sm" href={href('p', projectId)}>
          ← Console
        </a>
        <b>{projectId}</b>
        <span className={`conn-state ${remote.status}`}>{remote.status === 'open' ? 'live' : remote.status}</span>
        <span className="muted">
          {worldName} · {agents} agents
        </span>
        <button className="btn sm" onClick={() => setSound((v) => !v)} aria-pressed={sound}>
          {sound ? '🔊' : '🔈'}
        </button>
      </div>
    </div>
  );
}
