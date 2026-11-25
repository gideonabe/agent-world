import type { PropPlacement, StationDef, WorldConfig } from '@agent-viz/protocol';
import { BACK, facingCenter, hubSlots, ringNav } from './layout';

/**
 * A night-time party: a lit dance floor under a disco ball, a DJ booth, a bar, a quiz table and a photo
 * wall. Agents with nothing specific to do dance. Same station kinds as every built-in world.
 */
const D = 6.4;
const R = 12;

const quiz: StationDef = {
  id: 'quiz-table',
  name: 'Quiz Table',
  kind: 'research',
  accepts: ['research', 'analysis', 'search'],
  position: [-D, -D],
  rotation: facingCenter(-D, -D),
  entryNode: 'nw',
  color: '#4f9dff',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-1.0, -0.3], facing: Math.atan2(1.0, -0.8) },
    { position: [1.0, -0.3], facing: Math.atan2(-1.0, -0.8) },
    { position: [0, 0.45], facing: BACK },
  ],
  props: [
    { model: 'shape/partyTable', position: [0, -1.1], color: '#118ab2' },
    { model: 'furniture/books', position: [0.15, -1.1], y: 0.78 },
    { model: 'shape/neon', position: [0, -2.3], color: '#4f9dff' },
    { model: 'shape/balloons', position: [-2.1, -0.9], variant: 1 },
  ],
};

const dj: StationDef = {
  id: 'dj-booth',
  name: 'DJ Booth',
  kind: 'coding',
  accepts: ['coding', 'debugging', 'review'],
  position: [D, -D],
  rotation: facingCenter(D, -D),
  entryNode: 'ne',
  color: '#ff7a59',
  workAnimation: 'type',
  radius: 2.9,
  slots: [
    { position: [-0.7, -0.45], facing: BACK },
    { position: [0.7, -0.45], facing: BACK },
    { position: [0, 0.55], facing: BACK },
  ],
  props: [
    { model: 'shape/djBooth', position: [0, -1.3] },
    { model: 'shape/speakers', position: [-2.0, -1.2], color: '#ff7a59' },
    { model: 'shape/speakers', position: [2.0, -1.2], color: '#ff7a59' },
  ],
};

const photo: StationDef = {
  id: 'photo-wall',
  name: 'Photo Wall',
  kind: 'writing',
  accepts: ['writing', 'editing', 'docs'],
  position: [-D, D],
  rotation: facingCenter(-D, D),
  entryNode: 'sw',
  color: '#ffc94d',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.9, -0.2], facing: BACK },
    { position: [0.9, -0.2], facing: BACK },
    { position: [0, 0.65], facing: BACK },
  ],
  props: [
    { model: 'shape/billboard', position: [0, -1.7], color: '#ffc94d', scale: 0.85 },
    { model: 'furniture/sideTable', position: [1.9, -0.9] },
    { model: 'furniture/books', position: [1.9, -0.9], y: 0.84 },
    { model: 'shape/balloons', position: [-2.0, -0.8], variant: 3 },
  ],
};

const bar: StationDef = {
  id: 'bar',
  name: 'Bar & Kitchen',
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
    { position: [-1.0, -0.4], facing: BACK },
    { position: [0.3, -0.4], facing: BACK },
    { position: [1.6, -0.3], facing: BACK },
  ],
  props: [
    { model: 'furniture/kitchenBar', position: [-0.95, -1.25] },
    { model: 'furniture/kitchenBar', position: [0.0, -1.25] },
    { model: 'furniture/kitchenBar', position: [0.95, -1.25] },
    { model: 'furniture/kitchenBarEnd', position: [1.62, -1.25] },
    { model: 'furniture/kitchenCoffeeMachine', position: [-0.6, -1.3], y: 0.92 },
    { model: 'furniture/kitchenFridge', position: [2.2, -1.4] },
    { model: 'furniture/stoolBar', position: [-0.4, -0.2] },
    { model: 'furniture/stoolBar', position: [1.0, 0.1] },
  ],
};

const floor: StationDef = {
  id: 'dance-floor',
  name: 'Dance Floor',
  kind: 'dancefloor',
  accepts: ['*'],
  position: [0, 0],
  rotation: 0,
  entryNode: 's',
  color: '#c084fc',
  // thinking agents dance it out
  workAnimation: 'dance',
  radius: 2.6,
  slots: hubSlots(1.25),
  props: [{ model: 'shape/discoBall', position: [0, 0], rotation: Math.PI / 4 }],
};

function partyDressing(): PropPlacement[] {
  return [
    { model: 'shape/speakers', position: [-10.6, -10.6], rotation: Math.PI / 4, color: '#9b5de5' },
    { model: 'shape/speakers', position: [10.6, -10.6], rotation: -Math.PI / 4, color: '#06d6a0' },
    { model: 'shape/speakers', position: [-10.6, 10.6], rotation: Math.PI * 0.75, color: '#ef476f' },
    { model: 'shape/neon', position: [0, -11.0], color: '#ef476f' },
    { model: 'shape/neon', position: [-11.0, 0], rotation: Math.PI / 2, color: '#06d6a0' },
    { model: 'shape/stringLights', position: [-3.5, -10.6], variant: 3 },
    { model: 'shape/stringLights', position: [3.5, -10.6], variant: 3 },
    { model: 'shape/stringLights', position: [-10.6, -3.5], rotation: Math.PI / 2, variant: 3 },
    { model: 'shape/stringLights', position: [-10.6, 3.5], rotation: Math.PI / 2, variant: 3 },
    { model: 'shape/partyTable', position: [10.4, 1.5], color: '#ffd166' },
    { model: 'shape/partyTable', position: [1.5, 10.4], color: '#06d6a0' },
    { model: 'shape/balloons', position: [10.6, 10.6], variant: 4 },
    { model: 'shape/balloons', position: [-4.5, 10.6], variant: 5 },
    { model: 'shape/balloons', position: [10.6, -4.5], variant: 6 },
    { model: 'furniture/loungeSofaLong', position: [-10.9, 6.6], rotation: Math.PI / 2 },
  ];
}

export const party: WorldConfig = {
  id: 'party',
  name: 'Party',
  description: 'A night party with a lit dance floor, a DJ booth and a bar. Robots dance while they think.',
  island: { radius: R, seed: 1999, decorDensity: 0 },
  ground: { shape: 'square' },
  homeStationId: 'dance-floor',
  stations: [quiz, dj, photo, bar, floor],
  navigation: ringNav(3.6, 4.4, 9.0),
  props: partyDressing(),
};
