import type { PropPlacement, StationDef, WorldConfig } from '@agent-viz/protocol';
import { BACK, facingCenter, hubSlots, ringNav } from './layout';

/**
 * A city block: a ring road with traffic, tall buildings along the back, shops and lamps along the front,
 * and five places on the sidewalks inside the ring. Same station kinds as every built-in world.
 */
const D = 6.2;
const R = 16;
/** Centre line of the ring road (the scene draws the road and the traffic on it). */
export const CITY_ROAD = 11.5;

const library: StationDef = {
  id: 'city-library',
  name: 'City Library',
  kind: 'research',
  accepts: ['research', 'analysis', 'search'],
  position: [-D, -D],
  rotation: facingCenter(-D, -D),
  entryNode: 'nw',
  color: '#4f9dff',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.9, -0.2], facing: BACK },
    { position: [0.9, -0.2], facing: BACK },
    { position: [0, 0.7], facing: BACK },
  ],
  props: [
    { model: 'shape/shop', position: [0, -1.85], color: '#c9d6e3', variant: 1 },
    { model: 'furniture/bookcaseOpen', position: [-2.05, -0.9], rotation: Math.PI / 2 },
    { model: 'furniture/bench', position: [2.1, -0.4], rotation: -Math.PI / 2 },
    { model: 'shape/streetLamp', position: [-2.3, 0.9] },
  ],
};

const techHub: StationDef = {
  id: 'tech-hub',
  name: 'Tech Hub',
  kind: 'coding',
  accepts: ['coding', 'debugging', 'review'],
  position: [D, -D],
  rotation: facingCenter(D, -D),
  entryNode: 'ne',
  color: '#ff7a59',
  workAnimation: 'type',
  radius: 2.9,
  slots: [
    { position: [-0.95, -0.1], facing: BACK },
    { position: [0.95, -0.1], facing: BACK },
    { position: [0, 0.8], facing: BACK },
  ],
  props: [
    { model: 'shape/shop', position: [0, -2.0], color: '#d5e0c8', variant: 3 },
    { model: 'furniture/desk', position: [-0.95, -1.0] },
    { model: 'furniture/computerScreen', position: [-0.95, -1.2], y: 0.84 },
    { model: 'furniture/desk', position: [0.95, -1.0] },
    { model: 'furniture/laptop', position: [0.95, -1.0], y: 0.84, scale: 0.9 },
    { model: 'shape/neon', position: [2.2, -0.6], color: '#ff7a59' },
  ],
};

const cafe: StationDef = {
  id: 'corner-cafe',
  name: 'Corner Café',
  kind: 'writing',
  accepts: ['writing', 'editing', 'docs'],
  position: [-D, D],
  rotation: facingCenter(-D, D),
  entryNode: 'sw',
  color: '#ffc94d',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-1.1, -0.15], facing: BACK },
    { position: [1.1, -0.15], facing: BACK },
    { position: [0, 0.75], facing: BACK },
  ],
  props: [
    { model: 'shape/shop', position: [0, -1.95], color: '#f0e2b6', variant: 4 },
    { model: 'shape/parasol', position: [-1.1, -0.95], color: '#e4572e' },
    { model: 'shape/parasol', position: [1.1, -0.95], color: '#2a9d8f' },
    { model: 'furniture/plantSmall2', position: [2.2, 0.4] },
  ],
};

const depot: StationDef = {
  id: 'delivery-depot',
  name: 'Delivery Depot',
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
    { model: 'shape/car', position: [-0.6, -1.7], color: '#f2c14e' },
    { model: 'furniture/cardboardBoxClosed', position: [1.0, -1.5] },
    { model: 'furniture/cardboardBoxClosed', position: [1.05, -1.5], y: 0.62, rotation: 0.4 },
    { model: 'furniture/cardboardBoxOpen', position: [1.8, -1.2], rotation: -0.3 },
    { model: 'shape/cone', position: [-2.1, -0.3] },
    { model: 'shape/cone', position: [-2.2, 0.5] },
  ],
};

const square: StationDef = {
  id: 'town-square',
  name: 'Town Square',
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
    { model: 'furniture/bench', position: [-2.0, 2.0], rotation: Math.PI * 0.75 },
    { model: 'furniture/bench', position: [2.0, -2.0], rotation: -Math.PI * 0.25 },
  ],
};

/** Buildings beyond the road: tall ones along the back two sides, low shops along the front, plus lamps and hydrants. */
function skyline(): PropPlacement[] {
  const out: PropPlacement[] = [];
  const edge = 14.5;
  for (let i = 0; i < 9; i++) {
    const t = -13.2 + i * 3.3;
    out.push({ model: 'shape/building', position: [t, -edge], variant: i, scale: 0.85 });
    out.push({ model: 'shape/building', position: [-edge, t + 1.6], rotation: Math.PI / 2, variant: i + 20, scale: 0.85 });
  }
  for (let i = 0; i < 4; i++) {
    const t = -7.5 + i * 5;
    // front-side shops turn their storefronts toward the viewer
    out.push({ model: 'shape/shop', position: [t, edge], variant: i + 7, scale: 0.85 });
    out.push({ model: 'shape/shop', position: [edge, t], rotation: Math.PI / 2, variant: i + 11, scale: 0.85 });
  }
  // lamps on the inner sidewalk corners, hydrants, a billboard
  for (const [x, z] of [
    [-9.6, -9.6],
    [9.6, -9.6],
    [-9.6, 9.6],
    [9.6, 9.6],
    [-9.6, 0],
    [9.6, 3.2],
    [3.2, -9.6],
    [0, 9.6],
  ] as [number, number][])
    out.push({ model: 'shape/streetLamp', position: [x, z], rotation: Math.atan2(-z, x) });
  out.push({ model: 'shape/hydrant', position: [-3.2, 9.6] });
  out.push({ model: 'shape/hydrant', position: [9.6, -3.2] });
  out.push({ model: 'shape/billboard', position: [14.6, -14.2], rotation: -Math.PI / 4, color: '#06d6a0' });
  return out;
}

export const city: WorldConfig = {
  id: 'city',
  name: 'City',
  description: 'A busy city block with traffic, shops and a café. Day turns to night.',
  island: { radius: R, seed: 777, decorDensity: 1, decorInset: 6.3 },
  ground: { shape: 'square' },
  homeStationId: 'town-square',
  stations: [library, techHub, cafe, depot, square],
  navigation: ringNav(3.4, 4.2, 8.6),
  props: skyline(),
};
