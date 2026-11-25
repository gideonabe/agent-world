import type { StationDef, WorldConfig } from '@agent-viz/protocol';
import { BACK, backWalls, facingCenter, hubSlots, ringNav } from './layout';

/**
 * Open-plan office: a library corner, dev pods, a meeting room, a mailroom and a lounge in the middle.
 * Same station kinds as every built-in world, so any producer works here unchanged.
 */
const D = 6.6;
const R = 12;

const research: StationDef = {
  id: 'library-corner',
  name: 'Library Corner',
  kind: 'research',
  accepts: ['research', 'analysis', 'search'],
  position: [-D, -D],
  rotation: facingCenter(-D, -D),
  entryNode: 'nw',
  color: '#4f9dff',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-0.85, -0.45], facing: BACK },
    { position: [1.1, -0.2], facing: BACK },
    { position: [0.1, 0.6], facing: BACK },
  ],
  props: [
    { model: 'furniture/bookcaseClosedWide', position: [-1.15, -1.6] },
    { model: 'furniture/bookcaseOpen', position: [0.15, -1.6] },
    { model: 'furniture/desk', position: [1.35, -1.15] },
    { model: 'furniture/laptop', position: [1.25, -1.2], y: 0.84, scale: 0.9 },
    { model: 'furniture/books', position: [1.8, -1.25], y: 0.84 },
    { model: 'furniture/lampRoundFloor', position: [-2.2, -0.6] },
    { model: 'furniture/loungeChair', position: [-1.9, 0.6], rotation: 2.2 },
  ],
};

const coding: StationDef = {
  id: 'dev-pods',
  name: 'Dev Pods',
  kind: 'coding',
  accepts: ['coding', 'debugging', 'review'],
  position: [D, -D],
  rotation: facingCenter(D, -D),
  entryNode: 'ne',
  color: '#ff7a59',
  workAnimation: 'type',
  radius: 2.9,
  slots: [
    { position: [-0.95, -0.25], facing: BACK },
    { position: [0.95, -0.25], facing: BACK },
    { position: [0, 0.65], facing: BACK },
  ],
  props: [
    { model: 'furniture/desk', position: [-0.95, -1.15] },
    { model: 'furniture/computerScreen', position: [-0.95, -1.4], y: 0.84 },
    { model: 'furniture/computerKeyboard', position: [-0.95, -0.95], y: 0.84 },
    { model: 'furniture/desk', position: [0.95, -1.15] },
    { model: 'furniture/computerScreen', position: [0.95, -1.4], y: 0.84 },
    { model: 'furniture/computerKeyboard', position: [0.95, -0.95], y: 0.84 },
    { model: 'furniture/plantSmall2', position: [-1.75, -1.25], y: 0.84 },
    { model: 'furniture/trashcan', position: [2.1, -0.9], scale: 0.6 },
    { model: 'furniture/chairDesk', position: [-2.05, 0.2], rotation: 0.8 },
  ],
};

const writing: StationDef = {
  id: 'meeting-room',
  name: 'Meeting Room',
  kind: 'writing',
  accepts: ['writing', 'editing', 'docs'],
  position: [-D, D],
  rotation: facingCenter(-D, D),
  entryNode: 'sw',
  color: '#ffc94d',
  workAnimation: 'read',
  radius: 2.9,
  slots: [
    { position: [-1.05, -0.35], facing: Math.atan2(1.05, -0.65) },
    { position: [1.05, -0.35], facing: Math.atan2(-1.05, -0.65) },
    { position: [0, 0.3], facing: BACK },
  ],
  props: [
    { model: 'furniture/rugRectangle', position: [0, -0.9], castShadow: false },
    { model: 'furniture/table', position: [0, -1.0] },
    { model: 'furniture/laptop', position: [-0.35, -1.0], y: 0.73, scale: 0.85, rotation: 0.3 },
    { model: 'furniture/books', position: [0.4, -1.1], y: 0.73 },
    { model: 'furniture/chair', position: [-0.6, -1.85] },
    { model: 'furniture/chair', position: [0.6, -1.85] },
    { model: 'furniture/televisionModern', position: [0, -2.35], y: 0, scale: 1.2 },
    { model: 'furniture/pottedPlant', position: [2.0, -1.6] },
  ],
};

const automation: StationDef = {
  id: 'mailroom',
  name: 'Ops & Mailroom',
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
    { position: [-1.0, -0.5], facing: BACK },
    { position: [0.55, -0.55], facing: BACK },
    { position: [1.65, -0.4], facing: BACK },
  ],
  props: [
    { model: 'furniture/cardboardBoxClosed', position: [-1.5, -1.45] },
    { model: 'furniture/cardboardBoxClosed', position: [-1.45, -1.45], y: 0.62, rotation: 0.4 },
    { model: 'furniture/cardboardBoxOpen', position: [-0.75, -1.5], rotation: -0.2 },
    { model: 'furniture/sideTable', position: [0.55, -1.45] },
    { model: 'furniture/computerScreen', position: [0.55, -1.5], y: 0.84 },
    { model: 'furniture/kitchenCoffeeMachine', position: [1.65, -1.35] },
    { model: 'furniture/coatRackStanding', position: [2.2, 0.4] },
  ],
};

const lounge: StationDef = {
  id: 'lounge',
  name: 'Lounge',
  kind: 'lounge',
  accepts: ['*'],
  position: [0, 0],
  rotation: 0,
  entryNode: 's',
  color: '#c084fc',
  workAnimation: 'think',
  radius: 2.4,
  slots: hubSlots(),
  props: [
    { model: 'furniture/rugRound', position: [0, 0], scale: 1.5, castShadow: false },
    { model: 'furniture/tableCoffee', position: [0, 0] },
    { model: 'furniture/loungeSofa', position: [1.55, 1.55], rotation: -Math.PI * 0.75 },
    { model: 'furniture/loungeSofa', position: [-1.55, -1.55], rotation: Math.PI * 0.25 },
    { model: 'furniture/loungeChair', position: [-1.6, 1.6], rotation: Math.PI * 0.75 },
    { model: 'furniture/loungeChair', position: [1.6, -1.6], rotation: -Math.PI * 0.25 },
  ],
};

export const office: WorldConfig = {
  id: 'office',
  name: 'Office',
  description: 'An open-plan office with dev pods, a meeting room and a lounge.',
  island: { radius: R, seed: 4242, decorDensity: 1 },
  ground: { shape: 'square' },
  homeStationId: 'lounge',
  stations: [research, coding, writing, automation, lounge],
  navigation: ringNav(3.6, 4.4, 9.2),
  props: [
    ...backWalls(R, ['furniture/wall', 'furniture/wallWindow', 'furniture/wallWindow']),
    // kitchenette along the back wall
    { model: 'furniture/kitchenCabinet', position: [2.4, -11.2] },
    { model: 'furniture/kitchenCabinet', position: [3.35, -11.2] },
    { model: 'furniture/kitchenCoffeeMachine', position: [3.35, -11.2], y: 0.99 },
    { model: 'furniture/kitchenFridge', position: [4.45, -11.25] },
    { model: 'furniture/stoolBar', position: [2.6, -9.9] },
    // reading nook by the west windows
    { model: 'furniture/loungeSofaLong', position: [-11.0, 2.5], rotation: Math.PI / 2 },
    { model: 'furniture/lampSquareFloor', position: [-11.1, 4.6] },
    // plants in the corners
    { model: 'furniture/pottedPlant', position: [-11.0, -11.0] },
    { model: 'furniture/pottedPlant', position: [11.0, -11.0] },
    { model: 'furniture/pottedPlant', position: [-11.0, 11.0] },
    { model: 'furniture/coatRackStanding', position: [10.9, 10.9] },
  ],
};
