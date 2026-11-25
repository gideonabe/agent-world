import type { StationDef, WorldConfig } from '@agent-world/protocol';

/**
 * Default world: a round island with a central plaza and four workstations.
 * Pure data — duplicate and edit it (or load JSON) to build new worlds.
 *
 * Station-local frame: +z points toward the island centre (the "front"),
 * furniture sits at negative z, agents stand in between facing it.
 */

const D = 6.6; // station distance along each axis
const facingCenter = (x: number, z: number) => Math.atan2(-x, -z);
const S = Math.PI; // face the back of the station (toward the furniture)

const research: StationDef = {
  id: 'research-lab',
  name: 'Research Lab',
  kind: 'research',
  accepts: ['research', 'analysis', 'search'],
  position: [-D, -D],
  rotation: facingCenter(-D, -D),
  entryNode: 'nw',
  color: '#4f9dff',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.85, -0.55], facing: S },
    { position: [1.1, -0.3], facing: S },
    { position: [0.1, 0.5], facing: S },
  ],
  props: [
    { model: 'furniture/bookcaseOpen', position: [-1.3, -1.55] },
    { model: 'furniture/bookcaseOpen', position: [-0.4, -1.55] },
    { model: 'furniture/desk', position: [1.1, -1.15] },
    { model: 'furniture/laptop', position: [1.0, -1.2], y: 0.84, scale: 0.9 },
    { model: 'furniture/books', position: [0.55, -1.25], y: 0.84 },
    { model: 'furniture/lampSquareTable', position: [1.65, -1.35], y: 0.84 },
    { model: 'furniture/pottedPlant', position: [-2.1, -0.4] },
  ],
};

const coding: StationDef = {
  id: 'code-forge',
  name: 'Code Forge',
  kind: 'coding',
  accepts: ['coding', 'debugging', 'review'],
  position: [D, -D],
  rotation: facingCenter(D, -D),
  entryNode: 'ne',
  color: '#ff7a59',
  workAnimation: 'type',
  radius: 2.9,
  slots: [
    { position: [-0.95, -0.25], facing: S },
    { position: [0.95, -0.25], facing: S },
    { position: [0, 0.65], facing: S },
  ],
  props: [
    { model: 'furniture/desk', position: [-0.95, -1.15] },
    { model: 'furniture/computerScreen', position: [-0.95, -1.4], y: 0.84 },
    { model: 'furniture/computerKeyboard', position: [-0.95, -0.95], y: 0.84 },
    { model: 'furniture/desk', position: [0.95, -1.15] },
    { model: 'furniture/computerScreen', position: [0.95, -1.4], y: 0.84 },
    { model: 'furniture/computerKeyboard', position: [0.95, -0.95], y: 0.84 },
    { model: 'furniture/speaker', position: [2.05, -1.3] },
    { model: 'furniture/speaker', position: [-2.05, -1.3] },
  ],
};

const writing: StationDef = {
  id: 'writers-nook',
  name: "Writer's Nook",
  kind: 'writing',
  accepts: ['writing', 'editing', 'docs'],
  position: [-D, D],
  rotation: facingCenter(-D, D),
  entryNode: 'sw',
  color: '#ffc94d',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.95, -0.45], facing: Math.atan2(0.95, -0.55) },
    { position: [0.95, -0.45], facing: Math.atan2(-0.95, -0.55) },
    { position: [0, 0.25], facing: S },
  ],
  props: [
    { model: 'furniture/rugRound', position: [0, -0.8], castShadow: false },
    { model: 'furniture/tableRound', position: [0, -1.0] },
    { model: 'furniture/books', position: [-0.2, -1.05], y: 0.8 },
    { model: 'furniture/lampSquareTable', position: [0.25, -1.2], y: 0.8 },
    { model: 'furniture/bookcaseOpen', position: [-1.7, -1.6], rotation: 0.35 },
    { model: 'furniture/pottedPlant', position: [1.8, -1.5] },
    { model: 'furniture/sideTable', position: [1.9, -0.35], rotation: -1.2 },
    { model: 'furniture/radio', position: [1.9, -0.35], y: 0.84, rotation: -1.2 },
  ],
};

const automation: StationDef = {
  id: 'automation-hub',
  name: 'Automation Hub',
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
    { position: [-1.0, -0.5], facing: S },
    { position: [0.55, -0.55], facing: S },
    { position: [1.65, -0.4], facing: S },
  ],
  props: [
    { model: 'furniture/cardboardBoxClosed', position: [-1.5, -1.45] },
    { model: 'furniture/cardboardBoxClosed', position: [-1.45, -1.45], y: 0.62, rotation: 0.4 },
    { model: 'furniture/cardboardBoxOpen', position: [-0.75, -1.5], rotation: -0.2 },
    { model: 'furniture/sideTable', position: [0.55, -1.45] },
    { model: 'furniture/televisionModern', position: [0.55, -1.5], y: 0.84 },
    { model: 'furniture/kitchenCoffeeMachine', position: [1.65, -1.35] },
  ],
};

const plaza: StationDef = {
  id: 'plaza',
  name: 'Town Plaza',
  kind: 'plaza',
  accepts: ['*'],
  position: [0, 0],
  rotation: 0,
  entryNode: 's',
  color: '#c084fc',
  workAnimation: 'think',
  radius: 2.4,
  slots: [
    { position: [0, 1.25], facing: S, entryNode: 's' },
    { position: [1.25, 0], facing: -Math.PI / 2, entryNode: 'e' },
    { position: [0, -1.25], facing: 0, entryNode: 'n' },
    { position: [-1.25, 0], facing: Math.PI / 2, entryNode: 'w' },
  ],
  props: [
    { model: 'nature/campfire_stones', position: [0, 0], scale: 1.1 },
    { model: 'nature/log_stack', position: [0.12, 0], scale: 0.55, rotation: 0.7 },
    { model: 'furniture/bench', position: [1.45, 1.45], rotation: -Math.PI * 0.75 },
    { model: 'furniture/bench', position: [-1.45, 1.45], rotation: Math.PI * 0.75 },
    { model: 'furniture/bench', position: [1.45, -1.45], rotation: -Math.PI * 0.25 },
    { model: 'furniture/bench', position: [-1.45, -1.45], rotation: Math.PI * 0.25 },
  ],
};

export const meadowIsland: WorldConfig = {
  id: 'meadow-island',
  name: 'Meadow Island',
  island: { radius: 13.5, seed: 1337, decorDensity: 1 },
  homeStationId: 'plaza',
  stations: [research, coding, writing, automation, plaza],
  navigation: {
    nodes: [
      { id: 'n', position: [0, -3.6], tags: ['wander'] },
      { id: 'e', position: [3.6, 0], tags: ['wander'] },
      { id: 's', position: [0, 3.6], tags: ['wander'] },
      { id: 'w', position: [-3.6, 0], tags: ['wander'] },
      { id: 'nw', position: [-4.4, -4.4] },
      { id: 'ne', position: [4.4, -4.4] },
      { id: 'sw', position: [-4.4, 4.4] },
      { id: 'se', position: [4.4, 4.4] },
      { id: 'n-look', position: [0, -9.6], tags: ['wander'] },
      { id: 'e-look', position: [9.6, 0], tags: ['wander'] },
      { id: 's-look', position: [0, 10.2], tags: ['wander'] },
      { id: 'w-look', position: [-9.6, 0], tags: ['wander'] },
    ],
    edges: [
      ['n', 'e'], ['e', 's'], ['s', 'w'], ['w', 'n'],
      ['n', 'nw'], ['w', 'nw'], ['n', 'ne'], ['e', 'ne'],
      ['s', 'sw'], ['w', 'sw'], ['s', 'se'], ['e', 'se'],
      ['n', 'n-look'], ['e', 'e-look'], ['s', 's-look'], ['w', 'w-look'],
    ],
  },
  props: [
    { model: 'nature/sign', position: [0.9, -4.3], rotation: 0.3 },
    { model: 'nature/tent_detailedOpen', position: [-9.4, -3.0], rotation: 1.2 },
    { model: 'nature/statue_obelisk', position: [1.6, -10.2] },
    { model: 'nature/stump_round', position: [-1.2, -9.6] },
    { model: 'nature/log_stack', position: [9.8, 2.2], rotation: 0.4 },
    { model: 'nature/canoe', position: [3.3, 12.6], y: -0.55, rotation: 1.1 },
  ],
};
