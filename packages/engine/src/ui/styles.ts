import type { CSSProperties } from 'react';
import type { AgentStatus } from '@agent-viz/protocol';

/** Status colours shared by in-world labels (apps can reuse them). */
export const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#94a3b8',
  assigned: '#60a5fa',
  working: '#34d399',
  completed: '#22c55e',
  failed: '#f43f5e',
  offline: '#64748b',
};

const font = "500 13px/1.2 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Inline styles so the engine never depends on host-app CSS. */
export const labelStyles = {
  station: (color: string, active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.88)',
    boxShadow: active ? `0 0 0 2px ${color}, 0 6px 18px rgba(20,40,60,.18)` : '0 4px 14px rgba(20,40,60,.14)',
    color: '#1e293b',
    font,
    fontWeight: 650,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'box-shadow .3s',
  }),
  dot: (color: string): CSSProperties => ({ width: 8, height: 8, borderRadius: 99, background: color, flex: 'none' }),
  count: {
    marginLeft: 2,
    padding: '0 6px',
    borderRadius: 99,
    background: '#1e293b',
    color: '#fff',
    fontSize: 11,
    lineHeight: '16px',
  } satisfies CSSProperties,
  agent: (selected: boolean): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '4px 8px 5px',
    borderRadius: 10,
    background: selected ? 'rgba(15,23,42,0.92)' : 'rgba(15,23,42,0.72)',
    color: '#f8fafc',
    font,
    fontSize: 12,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 4px 14px rgba(0,0,0,.18)',
  }),
  agentRow: { display: 'flex', alignItems: 'center', gap: 5 } satisfies CSSProperties,
  queue: {
    padding: '0 5px',
    borderRadius: 99,
    background: 'rgba(255,255,255,.2)',
    fontSize: 10,
    lineHeight: '15px',
    fontWeight: 700,
  } satisfies CSSProperties,
  bar: { width: 64, height: 4, borderRadius: 4, background: 'rgba(255,255,255,.18)', overflow: 'hidden' } satisfies CSSProperties,
  barFill: (p: number, color: string): CSSProperties => ({
    width: `${Math.round(p * 100)}%`,
    height: '100%',
    background: color,
    transition: 'width .6s ease',
  }),
};
