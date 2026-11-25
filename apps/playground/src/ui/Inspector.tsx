import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  MOCK_TASKS,
  selectAgentMetrics,
  selectHistory,
  selectQueue,
  selectRoutableKinds,
  taskDurationMs,
  type AgentWorldStore,
} from '@agent-world/core';
import type { Task } from '@agent-world/protocol';
import { meadowTheme, STATUS_COLORS } from '@agent-world/engine';
import { STATUS_LABEL, formatDuration } from './format';
import type { Orchestrator } from '../orchestrator';

interface Props {
  store: AgentWorldStore;
  orchestrator: Orchestrator;
  agentId: string;
  onClose: () => void;
}

const OUTCOME_ICON: Record<string, string> = { completed: '✓', failed: '!', cancelled: '–' };

export function Inspector({ store, orchestrator, agentId, onClose }: Props) {
  const agent = useStore(store, (s) => s.agents[agentId]);
  const tasks = useStore(store, (s) => s.tasks);
  const world = useStore(store, (s) => s.world);
  const state = store.getState();
  const queue = useMemo(() => selectQueue(state, agentId), [tasks, agent, agentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const history = useMemo(() => selectHistory(state, agentId, 6), [tasks, agent, agentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const metrics = useStore(store, useShallow((s) => selectAgentMetrics(s, agentId) ?? null));
  if (!agent) return null;

  const d = agent.descriptor;
  const color = d.appearance?.color ?? meadowTheme.kindColors[d.kind] ?? '#999';
  const task = agent.currentTaskId ? tasks[agent.currentTaskId] : undefined;
  const station = world.stations.find((st) => st.id === agent.stationId);
  const dest = agent.destination ? ('stationId' in agent.destination ? `s:${agent.destination.stationId}` : `n:${agent.destination.nodeId}`) : '';

  return (
    <aside className="inspector glass">
      <div className="insp-head">
        <span className="avatar lg" style={{ background: color }}>
          {d.name[0]}
        </span>
        <div>
          <div className="insp-name">{d.name}</div>
          <div className="muted">{d.kind} agent</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="insp-scroll">
        <div className="insp-row">
          <span className="muted">Status</span>
          <span className="chip" style={{ color: STATUS_COLORS[agent.status], background: `${STATUS_COLORS[agent.status]}1f` }}>
            {STATUS_LABEL[agent.status]}
          </span>
        </div>
        {station && (
          <div className="insp-row">
            <span className="muted">Station</span>
            <span>
              <span className="dot" style={{ background: station.color }} /> {station.name}
            </span>
          </div>
        )}
        <div className="insp-row">
          <span className="muted">Rests at</span>
          <select
            className="select"
            value={dest}
            onChange={(e) => {
              const v = e.target.value;
              orchestrator.moveAgent(agentId, v ? (v.startsWith('s:') ? { stationId: v.slice(2) } : { nodeId: v.slice(2) }) : null);
            }}
          >
            <option value="">Free roam</option>
            {world.stations.map((s) => (
              <option key={s.id} value={`s:${s.id}`}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {task ? (
          <div className="insp-task">
            <div className="task-head">
              <span className="muted small">{task.status === 'assigned' ? 'Heading to station' : 'Current task'}</span>
              <button className="link-btn danger" onClick={() => orchestrator.cancel(task.id)}>
                Cancel
              </button>
            </div>
            <div className="task-title">{task.title}</div>
            <div className="progress lg">
              <span style={{ width: `${Math.round(task.progress * 100)}%`, background: color }} />
            </div>
            <div className="task-meta">
              <span>{task.stalled ? <b className="warn">No updates — stalled</b> : (task.message ?? 'Starting…')}</span>
              <span>{Math.round(task.progress * 100)}%</span>
            </div>
          </div>
        ) : (
          <div className="insp-task muted">{agent.message ?? 'No active task — exploring the island.'}</div>
        )}

        {queue.length > 0 && (
          <Section title={`Queue · ${queue.length}`}>
            {queue.map((t) => (
              <TaskRow key={t.id} task={t} icon={t.priority ? '↑' : '•'} action={{ label: '×', title: 'Cancel', onClick: () => orchestrator.cancel(t.id) }} />
            ))}
          </Section>
        )}

        <AssignForm kinds={selectRoutableKinds(state)} onAssign={(kind, title, urgent) => orchestrator.assign(agentId, kind, title, urgent ? 10 : 0)} />

        {history.length > 0 && (
          <Section title="Recent">
            {history.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                icon={OUTCOME_ICON[t.status] ?? '•'}
                tone={t.status}
                meta={formatDuration(taskDurationMs(t))}
                action={t.status !== 'completed' ? { label: '↻', title: 'Retry', onClick: () => orchestrator.retry(t.id) } : undefined}
              />
            ))}
          </Section>
        )}

        {metrics && (
          <div className="insp-stats">
            <Metric value={metrics.completed} label="completed" color={STATUS_COLORS.completed} />
            <Metric value={metrics.failed} label="failed" color={STATUS_COLORS.failed} />
            <Metric value={metrics.successRate === null ? '–' : `${Math.round(metrics.successRate * 100)}%`} label="success" />
            <Metric value={formatDuration(metrics.avgTaskMs ?? undefined)} label="avg task" />
          </div>
        )}

        <button className="btn ghost danger full" onClick={() => orchestrator.remove(agentId)}>
          Remove agent
        </button>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="insp-section">
      <div className="muted small section-title">{title}</div>
      {children}
    </div>
  );
}

function TaskRow({
  task,
  icon,
  tone,
  meta,
  action,
}: {
  task: Task;
  icon: string;
  tone?: string;
  meta?: string;
  action?: { label: string; title: string; onClick: () => void } | undefined;
}) {
  return (
    <div className={`task-row ${tone ?? ''}`} title={task.error ?? task.title}>
      <span className="task-icon">{icon}</span>
      <span className="task-row-title">{task.title}</span>
      {meta && <span className="muted small">{meta}</span>}
      {action && (
        <button className="mini-btn" title={action.title} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function Metric({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div>
      <b style={color ? { color } : undefined}>{value}</b>
      <span className="muted small">{label}</span>
    </div>
  );
}

function AssignForm({ kinds, onAssign }: { kinds: string[]; onAssign: (kind: string, title: string, urgent: boolean) => void }) {
  const [kind, setKind] = useState(kinds[0] ?? 'general');
  const [title, setTitle] = useState('');
  const [urgent, setUrgent] = useState(false);
  const suggestion = (MOCK_TASKS[kind] ?? [`Run ${kind} job`])[0]!;
  return (
    <form
      className="assign"
      onSubmit={(e) => {
        e.preventDefault();
        onAssign(kind, title.trim() || suggestion, urgent);
        setTitle('');
        setUrgent(false);
      }}
    >
      <div className="muted small section-title">Assign task</div>
      <div className="assign-row">
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input className="input" value={title} placeholder={suggestion} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <div className="assign-row">
        <label className="check">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent (jumps the queue)
        </label>
        <button className="btn primary sm" type="submit">
          Assign
        </button>
      </div>
    </form>
  );
}
