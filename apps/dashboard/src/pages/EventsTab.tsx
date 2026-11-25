import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentWorldStore } from '@agent-world/core';
import type { EventEnvelope } from '@agent-world/protocol';
import { Empty } from '../components/ui';

const MAX = 500;

/** Who an event is about, for filtering + display. */
function subject(e: EventEnvelope['event'], store: AgentWorldStore): string {
  const s = store.getState();
  switch (e.type) {
    case 'agent.registered':
    case 'agent.updated':
      return e.agent.name ?? e.agent.id;
    case 'agent.removed':
    case 'agent.status':
    case 'agent.destination':
      return s.agents[e.agentId]?.descriptor.name ?? e.agentId;
    case 'task.assigned':
      return s.agents[e.task.agentId]?.descriptor.name ?? e.task.agentId;
    default: {
      const t = s.tasks[e.taskId];
      return t ? (s.agents[t.agentId]?.descriptor.name ?? t.agentId) : e.taskId;
    }
  }
}

function summary(e: EventEnvelope['event'], store: AgentWorldStore): string {
  switch (e.type) {
    case 'task.assigned':
      return e.task.title;
    case 'task.progress':
      return `${Math.round(e.progress * 100)}%${e.message ? ` · ${e.message}` : ''}${e.phase ? ` · → ${e.phase}` : ''}`;
    case 'task.failed':
      return e.error;
    case 'task.cancelled':
      return e.reason ?? '';
    case 'agent.status':
      return e.status + (e.message ? ` · ${e.message}` : '');
    case 'agent.destination':
      return e.destination ? JSON.stringify(e.destination) : 'free roam';
    case 'task.completed':
    case 'task.started':
    case 'task.stalled':
      return store.getState().tasks[e.taskId]?.title ?? '';
    default:
      return '';
  }
}

/** Live event inspector: everything the server applies, as it happens. */
export function EventsTab({ store }: { store: AgentWorldStore }) {
  const [items, setItems] = useState<EventEnvelope[]>([]);
  const [paused, setPaused] = useState(false);
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    setItems(store.getState().log.slice().reverse());
    let last = store.getState().log.at(-1);
    return store.subscribe((s, prev) => {
      if (s.log === prev.log || pausedRef.current) {
        last = s.log.at(-1);
        return;
      }
      const fresh: EventEnvelope[] = [];
      for (let i = s.log.length - 1; i >= 0 && s.log[i] !== last; i--) fresh.push(s.log[i]!);
      last = s.log.at(-1);
      if (fresh.length) setItems((cur) => [...fresh, ...cur].slice(0, MAX));
    });
  }, [store]);

  const types = useMemo(() => [...new Set(items.map((i) => i.event.type))].sort(), [items]);
  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (i) => (!type || i.event.type === type) && (!q || JSON.stringify(i).toLowerCase().includes(q) || subject(i.event, store).toLowerCase().includes(q)),
  );

  return (
    <div className="card events">
      <div className="toolbar">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All event types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input className="input grow" placeholder="Filter by agent, task, text…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className={`btn sm ${paused ? 'primary' : ''}`} onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        <button className="btn sm ghost" onClick={() => setItems([])}>
          Clear
        </button>
      </div>
      {shown.length === 0 ? (
        <Empty>{items.length ? 'No events match the filter.' : 'Waiting for events… they appear here the moment the server applies them.'}</Empty>
      ) : (
        <div className="event-table">
          {shown.map((i) => (
            <div key={i.id} className={`event-row ${open === i.id ? 'open' : ''}`}>
              <button className="event-line" onClick={() => setOpen(open === i.id ? null : i.id)}>
                <span className="muted mono">{new Date(i.ts).toLocaleTimeString()}</span>
                <span className={`etype ${i.event.type.split('.')[1]}`}>{i.event.type}</span>
                <span className="esubject">{subject(i.event, store)}</span>
                <span className="muted ellipsis">{summary(i.event, store)}</span>
                <span className="muted small">{i.source ?? ''}</span>
              </button>
              {open === i.id && <pre className="json">{JSON.stringify(i, null, 2)}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
