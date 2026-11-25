import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { selectAgentList, selectStationLoad, selectWorldMetrics, type AgentWorldStore } from '@agent-world/core';
import { AgentWorld, meadowTheme, STATUS_COLORS, useRemoteWorld } from '@agent-world/engine';
import type { AdminApi, ProjectInfo } from '../api';
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
            <code>{projectId}</code> · world <code>{project?.worldId ?? '…'}</code> ·{' '}
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

  return (
    <div className="overview">
      <section className="world-frame card">
        <AgentWorld store={store} theme={meadowTheme} selectedAgentId={selected} onSelectAgent={setSelected} />
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
