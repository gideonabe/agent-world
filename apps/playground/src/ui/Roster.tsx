import { useStore } from 'zustand';
import type { AgentWorldStore } from '@agent-viz/core';
import { meadowTheme, STATUS_COLORS } from '@agent-viz/engine';
import { STATUS_LABEL } from './format';

interface Props {
  store: AgentWorldStore;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function Roster({ store, selected, onSelect }: Props) {
  const agents = useStore(store, (s) => s.agents);
  const tasks = useStore(store, (s) => s.tasks);
  const list = Object.values(agents).sort((a, b) => a.registeredAt - b.registeredAt);

  return (
    <aside className="roster glass">
      <div className="panel-title">
        Agents <span className="muted">{list.length}</span>
      </div>
      <div className="roster-list">
        {list.length === 0 && <div className="empty">Waiting for agents to register…</div>}
        {list.map((a) => {
          const task = a.currentTaskId ? tasks[a.currentTaskId] : undefined;
          const color = a.descriptor.appearance?.color ?? meadowTheme.kindColors[a.descriptor.kind] ?? '#999';
          const active = a.status === 'working' || a.status === 'assigned';
          return (
            <button
              key={a.descriptor.id}
              className={`agent-card ${selected === a.descriptor.id ? 'selected' : ''}`}
              onClick={() => onSelect(selected === a.descriptor.id ? null : a.descriptor.id)}
            >
              <span className="avatar" style={{ background: color }}>
                {a.descriptor.name[0]}
              </span>
              <span className="agent-main">
                <span className="agent-top">
                  <span className="agent-name">
                    {a.descriptor.name}
                    {a.taskQueue.length > 0 && <span className="queue-badge">+{a.taskQueue.length}</span>}
                    {task?.stalled && <span className="stall-badge">stalled</span>}
                  </span>
                  <span className="chip" style={{ color: STATUS_COLORS[a.status], background: `${STATUS_COLORS[a.status]}1f` }}>
                    {STATUS_LABEL[a.status]}
                  </span>
                </span>
                <span className="agent-sub">{active && task ? task.title : a.descriptor.kind}</span>
                {active && task && (
                  <span className="progress">
                    <span style={{ width: `${Math.round(task.progress * 100)}%`, background: color }} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
