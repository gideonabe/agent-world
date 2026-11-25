import { meadowTheme } from './meadow';
import type { Theme } from './theme';

/** Warm late-afternoon market square: cobbles, sandy walkways, string lights just coming on. */
export const marketTheme: Theme = {
  ...meadowTheme,
  id: 'market',
  name: 'Market',
  stationBase: 'none',
  palette: {
    ...meadowTheme.palette,
    background: '#f3d9b5',
    fog: '#f5e0c2',
    water: '#d9c3a3',
    grass: '#cdb99c',
    grassDark: '#b9a383',
    cliff: '#8c6f52',
    cliffDark: '#6b523b',
    sand: '#e8d8bd',
    path: '#e9d9b6',
    pathEdge: '#cdb58c',
    deck: '#e9dcc4',
    sun: '#ffe0b0',
    hemiSky: '#ffeccc',
    hemiGround: '#a8896a',
  },
  lighting: { sun: 2.2, hemi: 1.3, ambient: 0.3, fogNear: 3.8, fogFar: 8 },
  time: { night: 0.3, nightSky: '#3a2a4a' },
  decor: {
    trees: [['nature/tree_default', 1]],
    rocks: [],
    plants: [
      ['nature/plant_bush', 2],
      ['nature/flower_redA', 1],
      ['nature/flower_yellowA', 1],
      ['furniture/pottedPlant', 1],
    ],
    shoreline: [],
  },
  decorCounts: { trees: 3, plants: 14, rocks: 0, shoreline: 0 },
};
