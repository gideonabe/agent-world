import { meadowTheme } from './meadow';
import type { Theme } from './theme';

/** City block: grey sidewalks, warm paving, little parks. Loops through day and night. */
export const cityTheme: Theme = {
  ...meadowTheme,
  id: 'city',
  name: 'City',
  stationBase: 'square',
  palette: {
    ...meadowTheme.palette,
    background: '#bcd9ea',
    fog: '#c8e0ee',
    water: '#a9b8c6',
    grass: '#c3c8cf',
    grassDark: '#adb3bb',
    cliff: '#7a828d',
    cliffDark: '#5b626c',
    sand: '#d9dde2',
    path: '#e6dccb',
    pathEdge: '#cbbfa9',
    deck: '#ece6da',
    hemiGround: '#8d949c',
  },
  lighting: { sun: 2.3, hemi: 1.3, ambient: 0.3, fogNear: 3.6, fogFar: 7.5 },
  time: { cycleSeconds: 150, nightSky: '#121a35' },
  decor: {
    trees: [
      ['nature/tree_default', 2],
      ['nature/tree_oak', 2],
      ['nature/tree_cone', 1],
    ],
    rocks: [],
    plants: [
      ['nature/plant_bush', 2],
      ['nature/grass', 2],
      ['nature/flower_redA', 1],
      ['nature/flower_yellowA', 1],
    ],
    shoreline: [],
  },
  decorCounts: { trees: 7, plants: 18, rocks: 0, shoreline: 0 },
};
