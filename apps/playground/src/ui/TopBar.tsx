import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { selectWorldMetrics, type AgentWorldStore, type ConnectionStatus } from '@agent-world/core';
import { STATUS_COLORS } from '@agent-world/engine';

interface Props {
  store: AgentWorldStore;
  worldName: string;
  source: { kind: 'mock' } | { kind: 'live'; url: string; status: ConnectionStatus };
  paused: boolean;
  onTogglePause: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  onSpawn: () => void;
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  idle: 'not connected',
  connecting: 'connecting…',
  open: 'live',
  reconnecting: 'reconnecting…',
  closed: 'disconnected',
};

export function TopBar({ store, worldName, source, paused, onTogglePause, speed, onSpeed, onSpawn }: Props) {
  const live = source.kind === 'live';
  const dotClass = live ? `live-dot ${source.status === 'open' ? '' : source.status === 'closed' ? 'off' : 'warn'}` : `live-dot ${paused ? 'off' : ''}`;
  // flatten so useShallow can compare primitives
  const m = useStore(
    store,
    useShallow((s) => {
      const w = selectWorldMetrics(s);
      return {
        working: w.byStatus.working + w.byStatus.assigned,
        idle: w.byStatus.idle + w.byStatus.offline + w.byStatus.completed + w.byStatus.failed,
        queued: w.queuedTasks,
        stalled: w.stalledTasks,
        completed: w.completed,
        failed: w.failed,
        success: w.successRate,
      };
    }),
  );

  return (
    <header className="topbar glass">
      <div className="brand">
        <span className="logo">◆</span>
        <div>
          <div className="brand-name">Agent World</div>
          <div className="brand-sub">
            <span className={dotClass} />
            {worldName} · {live ? <span title={source.url}>server {STATUS_TEXT[source.status]}</span> : 'local simulator'}
          </div>
        </div>
      </div>
      <div className="stats">
        <Stat label="Working" value={m.working} color={STATUS_COLORS.working} />
        <Stat label="Idle" value={m.idle} color={STATUS_COLORS.idle} />
        <Stat label="Queued" value={m.queued} color={STATUS_COLORS.assigned} />
        {m.stalled > 0 && <Stat label="Stalled" value={m.stalled} color="#f59e0b" />}
        <Stat label="Completed" value={m.completed} color={STATUS_COLORS.completed} />
        <Stat label="Failed" value={m.failed} color={STATUS_COLORS.failed} />
        <Stat label="Success" value={m.success === null ? '–' : `${Math.round(m.success * 100)}%`} color="#0f172a" />
      </div>
      <div className="controls">
        {live ? (
          <span className={`conn-pill ${source.status}`}>{STATUS_TEXT[source.status]}</span>
        ) : (
          <>
        <button className="btn" onClick={onTogglePause} title={paused ? 'Resume stream' : 'Pause stream'}>
          {paused ? '▶' : '❚❚'}
        </button>
        <div className="seg">
          {[0.5, 1, 2, 4].map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={onSpawn}>
          + Agent
        </button>
          </>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="stat">
      <span className="stat-value" style={{ color }}>
        {value}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
