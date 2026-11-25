import { meadowTheme } from './meadow';
import type { Theme } from './theme';

/** Bright open-plan office: warm wood floor, blue carpet walkways, soft indoor light. */
export const officeTheme: Theme = {
  ...meadowTheme,
  id: 'office',
  name: 'Office',
  stationBase: 'square',
  palette: {
    ...meadowTheme.palette,
    background: '#dfe7ef',
    fog: '#e6edf4',
    water: '#c9d3de',
    grass: '#d9c7a7',
    grassDark: '#c7b18c',
    cliff: '#8d8174',
    cliffDark: '#6b6157',
    sand: '#f1ece3',
    path: '#8fa7bd',
    pathEdge: '#7d95ab',
    deck: '#efe9df',
    sun: '#fff6e8',
    hemiSky: '#f4f8ff',
    hemiGround: '#b9a98f',
  },
  lighting: { sun: 2.0, hemi: 1.5, ambient: 0.35, fogNear: 4, fogFar: 8 },
  materialColors: {},
  decor: {
    trees: [],
    rocks: [],
    plants: [
      ['furniture/pottedPlant', 2],
      ['furniture/plantSmall2', 1],
    ],
    shoreline: [],
  },
  decorCounts: { plants: 6 },
};
