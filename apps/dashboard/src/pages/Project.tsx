import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { selectAgentList, selectStationLoad, selectWorldMetrics, type AgentWorldStore } from '@agent-viz/core';
import { AgentWorld, STATUS_COLORS, useRemoteWorld } from '@agent-viz/engine';
import type { AdminApi, ProjectInfo, WorldInfo } from '../api';
import { WorldPicker } from '../components/WorldPicker';
import { href, navigate } from '../router';
import { ErrorNote, pct, Stat } from '../components/ui';
import { EventsTab } from './EventsTab';
import { KeysTab } from './KeysTab';
import { SendTab } from './SendTab';
import { IntegrateTab } from './IntegrateTab';

const TABS = [
  ['overview', 'Overview'],
  ['events', 'Live events'],
  ['keys', 'API keys'],
  ['send', 'Send test events'],
  ['integrate', 'Integrate'],
] as const;

export function ProjectPage({ api, projectId, tab, onChanged }: { api: AdminApi; projectId: string; tab: string; onChanged: () => void }) {
  const [project, setProject] = useState<ProjectInfo>();
  const [error, setError] = useState<unknown>();
  // One live connection per project, shared by every tab.
  const remote = useRemoteWorld({ server: api.base, project: projectId, ...(api.conn.token ? { token: api.conn.token } : {}) });

  useEffect(() => {
    api.project(projectId).then(setProject, setError);
  }, [api, projectId]);

  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [picking, setPicking] = useState(false);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    api.worlds().then((r) => setWorlds(r.worlds));
  }, [api]);
  const worldName = worlds.find((w) => w.id === project?.worldId)?.name ?? project?.worldId ?? '…';
  const switchWorld = useCallback(
    async (worldId: string) => {
      if (worldId === project?.worldId) return setPicking(false);
      setSwitching(true);
      try {
        setProject(await api.updateProject(projectId, { worldId }));
        setPicking(false);
        onChanged();
      } catch (e) {
        setError(e);
      } finally {
        setSwitching(false);
      }
    },
    [api, projectId, project?.worldId, onChanged],
  );

  const remove = useCallback(async () => {
    if (!confirm(`Delete project "${projectId}"? Its agents, history and API keys are removed permanently.`)) return;
    try {
      await api.deleteProject(projectId);
      onChanged();
      navigate();
    } catch (e) {
      setError(e);
    }
  }, [api, projectId, onChanged]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{project?.name ?? projectId}</h1>
          <p className="muted">
            <code>{projectId}</code> · {worldName}
            {worlds.length > 1 && (
              <button className="btn ghost sm" style={{ marginLeft: 4 }} onClick={() => setPicking((v) => !v)}>
                {picking ? 'Close' : 'Change world'}
              </button>
            )}{' '}
            ·{' '}
            <span className={`conn-state ${remote.status}`}>{remote.status === 'open' ? 'live' : remote.status}</span>
            {remote.error && <span className="error-inline"> — {remote.error}</span>}
          </p>
        </div>
        <div className="head-actions">
          <a className="btn" href={href('view', projectId)}>
            Open full view ↗
          </a>
          {projectId !== 'default' && (
            <button className="btn ghost danger" onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </header>
      <ErrorNote error={error} />

      {picking && project && (
        <section className="card world-panel">
          <div className="world-panel-head">
            <h4 style={{ margin: 0 }}>Choose a world</h4>
            <span className="muted small">Everyone watching switches with you. Robots keep their tasks and walk to the matching spot.</span>
          </div>
          <WorldPicker worlds={worlds} value={project.worldId} onChange={switchWorld} disabled={switching} />
        </section>
      )}

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <a key={id} className={`tab ${tab === id ? 'on' : ''}`} href={href('p', projectId, id)}>
            {label}
          </a>
        ))}
      </nav>

      {tab === 'overview' && <Overview store={remote.store} />}
      {tab === 'events' && <EventsTab store={remote.store} />}
      {tab === 'keys' && <KeysTab api={api} projectId={projectId} />}
      {tab === 'send' && <SendTab api={api} projectId={projectId} store={remote.store} />}
      {tab === 'integrate' && <IntegrateTab api={api} projectId={projectId} />}
    </div>
  );
}

function Overview({ store }: { store: AgentWorldStore }) {
  const m = useStore(
    store,
    useShallow((s) => {
      const w = selectWorldMetrics(s);
      return {
        agents: w.agents,
        working: w.byStatus.working + w.byStatus.assigned,
        queued: w.queuedTasks,
        stalled: w.stalledTasks,
        completed: w.completed,
        failed: w.failed,
        success: w.successRate,
      };
    }),
  );
  const agents = useStore(store, useShallow((s) => selectAgentList(s)));
  const tasks = useStore(store, (s) => s.tasks);
  const load = useStore(store, useShallow((s) => selectStationLoad(s).map((l) => `${l.station.id}|${l.station.name}|${l.station.color}|${l.occupied}|${l.capacity}|${l.waiting}`)));
  const [selected, setSelected] = useState<string | null>(null);
  const [sound, setSound] = useState(false);

  return (
    <div className="overview">
      <section className="world-frame card">
        <AgentWorld store={store} selectedAgentId={selected} onSelectAgent={setSelected} sound={sound} />
        <button className="btn sm sound-toggle" onClick={() => setSound((v) => !v)} aria-pressed={sound} title="Ambient sound">
          {sound ? '🔊 Sound on' : '🔈 Sound off'}
        </button>
        {m.agents === 0 && (
          <div className="world-empty">
            No agents yet. Send events from your app, or try the <b>Send test events</b> tab.
          </div>
        )}
      </section>
      <section className="side">
        <div className="card stats-row">
          <Stat label="Agents" value={m.agents} />
          <Stat label="Working" value={m.working} tone="ok" />
          <Stat label="Queued" value={m.queued} />
          <Stat label="Done" value={m.completed} tone="ok" />
          <Stat label="Failed" value={m.failed} tone="bad" />
          <Stat label="Success" value={pct(m.success)} />
        </div>
        <div className="card">
          <h4>Agents</h4>
          {agents.length === 0 && <p className="muted small">Agents appear here when they register.</p>}
          <ul className="agent-list">
            {agents.map((a) => {
              const t = a.currentTaskId ? tasks[a.currentTaskId] : undefined;
              return (
                <li key={a.descriptor.id} className={selected === a.descriptor.id ? 'on' : ''} onClick={() => setSelected(selected === a.descriptor.id ? null : a.descriptor.id)}>
                  <span className="dot" style={{ background: STATUS_COLORS[a.status] }} />
                  <span className="agent-name">{a.descriptor.name}</span>
                  <span className="muted small ellipsis">{t ? (t.message ?? t.title) : a.status}</span>
                  {a.taskQueue.length > 0 && <span className="pill">+{a.taskQueue.length}</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card">
          <h4>Stations</h4>
          {load.map((row) => {
            const [id, name, color, occ, cap, wait] = row.split('|');
            return (
              <div key={id} className="station-row">
                <span className="dot" style={{ background: color }} />
                <span className="grow">{name}</span>
                <span className="bar">
                  <span style={{ width: `${(Number(occ) / Math.max(1, Number(cap))) * 100}%`, background: color }} />
                </span>
                <span className="muted small">
                  {occ}/{cap}
                  {Number(wait) > 0 ? ` +${wait}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
