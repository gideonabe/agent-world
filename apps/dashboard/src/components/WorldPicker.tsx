import { getWorldStyle } from '@agent-viz/engine';
import type { WorldInfo } from '../api';

/** A small colour swatch made from a world's palette (sky, floor, walkways, accent). */
export function WorldSwatch({ worldId }: { worldId: string }) {
  const p = getWorldStyle(worldId).theme.palette;
  return (
    <span className="world-swatch" aria-hidden>
      <span style={{ background: p.background }} />
      <span style={{ background: p.grass }} />
      <span style={{ background: p.path }} />
      <span style={{ background: p.cliff }} />
    </span>
  );
}

/** Cards for choosing a world. `value` is the selected world id. */
export function WorldPicker({ worlds, value, onChange, disabled }: { worlds: WorldInfo[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <div className="world-picker" role="radiogroup" aria-label="World">
      {worlds.map((w) => (
        <button
          key={w.id}
          type="button"
          role="radio"
          aria-checked={w.id === value}
          className={`world-card ${w.id === value ? 'on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(w.id)}
        >
          <WorldSwatch worldId={w.id} />
          <b>{w.name}</b>
          {w.description && <span className="muted small">{w.description}</span>}
        </button>
      ))}
    </div>
  );
}
