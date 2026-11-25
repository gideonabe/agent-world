import type { PropPlacement, StationDef, WorldConfig } from '@agent-viz/protocol';
import { BACK, facingCenter, hubSlots, ringNav } from './layout';

/**
 * An open-air market square: stalls around a fountain, string lights, crates of produce and shoppers.
 * Same station kinds as every built-in world.
 */
const D = 6.4;
const R = 13;

const spices: StationDef = {
  id: 'spice-and-books',
  name: 'Spice & Book Stall',
  kind: 'research',
  accepts: ['research', 'analysis', 'search'],
  position: [-D, -D],
  rotation: facingCenter(-D, -D),
  entryNode: 'nw',
  color: '#4f9dff',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.9, 0.05], facing: BACK },
    { position: [0.9, 0.05], facing: BACK },
    { position: [0, 0.9], facing: BACK },
  ],
  props: [
    { model: 'shape/stall', position: [0, -1.2], color: '#2e86ab', variant: 1 },
    { model: 'furniture/books', position: [-0.6, -1.05], y: 0.96 },
    { model: 'furniture/books', position: [0.5, -1.05], y: 0.96, rotation: 0.4 },
    { model: 'shape/crate', position: [-2.0, -0.5], variant: 1 },
    { model: 'shape/crate', position: [2.0, -0.6], variant: 4 },
  ],
};

const gadgets: StationDef = {
  id: 'gadget-stall',
  name: 'Gadget Stall',
  kind: 'coding',
  accepts: ['coding', 'debugging', 'review'],
  position: [D, -D],
  rotation: facingCenter(D, -D),
  entryNode: 'ne',
  color: '#ff7a59',
  workAnimation: 'type',
  radius: 2.9,
  slots: [
    { position: [-0.9, 0.05], facing: BACK },
    { position: [0.9, 0.05], facing: BACK },
    { position: [0, 0.9], facing: BACK },
  ],
  props: [
    { model: 'shape/stall', position: [0, -1.2], color: '#ff7a59', variant: 2 },
    { model: 'furniture/computerScreen', position: [-0.6, -1.2], y: 0.96 },
    { model: 'furniture/laptop', position: [0.55, -1.1], y: 0.96, scale: 0.9 },
    { model: 'furniture/radio', position: [0.0, -1.3], y: 0.96 },
    { model: 'shape/crate', position: [2.0, -0.5], variant: 2 },
  ],
};

const paper: StationDef = {
  id: 'print-and-paper',
  name: 'Print & Paper',
  kind: 'writing',
  accepts: ['writing', 'editing', 'docs'],
  position: [-D, D],
  rotation: facingCenter(-D, D),
  entryNode: 'sw',
  color: '#ffc94d',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.9, 0.05], facing: BACK },
    { position: [0.9, 0.05], facing: BACK },
    { position: [0, 0.9], facing: BACK },
  ],
  props: [
    { model: 'shape/stall', position: [0, -1.2], color: '#f2c14e', variant: 3 },
    { model: 'furniture/books', position: [-0.5, -1.1], y: 0.96 },
    { model: 'furniture/lampSquareTable', position: [0.6, -1.3], y: 0.96 },
    { model: 'shape/parasol', position: [2.1, -0.3], color: '#f2c14e' },
  ],
};

const dock: StationDef = {
  id: 'loading-dock',
  name: 'Loading Dock',
  kind: 'automation',
  accepts: ['automation', 'workflow', 'integration'],
  position: [D, D],
  rotation: facingCenter(D, D),
  entryNode: 'se',
  color: '#7ed957',
  workAnimation: 'build',
  workStyle: 'roaming',
  roamNodes: ['se', 'e', 's'],
  radius: 2.9,
  slots: [
    { position: [-1.0, -0.3], facing: BACK },
    { position: [0.6, -0.4], facing: BACK },
    { position: [1.7, 0.3], facing: BACK },
  ],
  props: [
    { model: 'shape/car', position: [-0.5, -1.7], color: '#4caf50' },
    { model: 'shape/crate', position: [1.1, -1.5], variant: 0 },
    { model: 'shape/crate', position: [1.1, -1.5], y: 0.47, variant: 2 },
    { model: 'shape/crate', position: [1.8, -1.0], variant: 5 },
    { model: 'furniture/cardboardBoxClosed', position: [-2.1, -0.4], rotation: 0.3 },
  ],
};

const fountain: StationDef = {
  id: 'fountain-square',
  name: 'Fountain Square',
  kind: 'square',
  accepts: ['*'],
  position: [0, 0],
  rotation: 0,
  entryNode: 's',
  color: '#c084fc',
  workAnimation: 'think',
  radius: 2.6,
  slots: hubSlots(2.0),
  props: [
    { model: 'shape/fountain', position: [0, 0], scale: 0.9 },
    { model: 'furniture/bench', position: [2.0, 2.0], rotation: -Math.PI * 0.75 },
    { model: 'furniture/bench', position: [-2.0, -2.0], rotation: Math.PI * 0.25 },
  ],
};

const STALL_COLORS = ['#e4572e', '#2e86ab', '#4caf50', '#f2a541', '#9c27b0', '#ef476f'];

/** A row of extra stalls along the back two sides, lights strung over the walkways, crates and parasols. */
function marketDressing(): PropPlacement[] {
  const out: PropPlacement[] = [];
  const edge = 11.4;
  for (let i = 0; i < 6; i++) {
    const t = -9.5 + i * 3.6;
    out.push({ model: 'shape/stall', position: [t, -edge], color: STALL_COLORS[i % 6], variant: i + 10 });
    out.push({ model: 'shape/stall', position: [-edge, t + 1.2], rotation: Math.PI / 2, color: STALL_COLORS[(i + 3) % 6], variant: i + 20 });
  }
  // string lights over the four walkways
  out.push({ model: 'shape/stringLights', position: [0, -6.4], variant: 0 });
  out.push({ model: 'shape/stringLights', position: [0, 6.4], variant: 0 });
  out.push({ model: 'shape/stringLights', position: [-6.4, 0], rotation: Math.PI / 2, variant: 0 });
  out.push({ model: 'shape/stringLights', position: [6.4, 0], rotation: Math.PI / 2, variant: 0 });
  // front edge: parasols and crates, kept low so the view stays open
  for (const [x, z, k] of [
    [-6, 11, 0],
    [-1.5, 11.3, 1],
    [3.5, 11, 2],
    [11, -5, 3],
    [11.3, 0.5, 4],
    [11, 5.5, 5],
  ] as [number, number, number][]) {
    out.push(k % 2 ? { model: 'shape/crate', position: [x, z], variant: k } : { model: 'shape/parasol', position: [x, z], color: STALL_COLORS[k % 6] });
  }
  out.push({ model: 'shape/balloons', position: [10.8, 10.8], variant: 2 });
  return out;
}

export const market: WorldConfig = {
  id: 'market',
  name: 'Market',
  description: 'An open-air market with stalls, string lights and a fountain square.',
  island: { radius: R, seed: 2024, decorDensity: 1, decorInset: 1.5 },
  ground: { shape: 'square' },
  homeStationId: 'fountain-square',
  stations: [spices, gadgets, paper, dock, fountain],
  navigation: ringNav(3.6, 4.4, 9.0),
  props: marketDressing(),
};
