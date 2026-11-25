import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { AgentWorldStore } from '@agent-world/core';
import { describe, timeAgo } from './format';

/** Latest notable events, newest first. */
export function EventFeed({ store }: { store: AgentWorldStore }) {
  const log = useStore(store, (s) => s.log);
  const state = store.getState();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const items: { id: string; ts: number; d: NonNullable<ReturnType<typeof describe>> }[] = [];
  for (let i = log.length - 1; i >= 0 && items.length < 6; i--) {
    const env = log[i]!;
    const d = describe(env, state);
    if (d) items.push({ id: env.id, ts: env.ts, d });
  }

  return (
    <section className="feed glass">
      <div className="panel-title">Activity</div>
      {items.map((it) => (
        <div key={it.id} className={`feed-item ${it.d.tone}`}>
          <span className="feed-icon">{it.d.icon}</span>
          <span className="feed-text">{it.d.text}</span>
          <span className="feed-time">{timeAgo(it.ts)}</span>
        </div>
      ))}
      {items.length === 0 && <div className="empty">No activity yet.</div>}
    </section>
  );
}
