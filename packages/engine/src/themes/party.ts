import { meadowTheme } from './meadow';
import type { Theme } from './theme';

/** Night party: dark floor, violet haze, everything lit by the dance floor, neon and beams. */
export const partyTheme: Theme = {
  ...meadowTheme,
  id: 'party',
  name: 'Party',
  stationBase: 'square',
  palette: {
    ...meadowTheme.palette,
    background: '#1c1430',
    fog: '#22173a',
    water: '#140e24',
    grass: '#5a4d7a',
    grassDark: '#4a3f68',
    cliff: '#3a3050',
    cliffDark: '#271f36',
    sand: '#6e6191',
    path: '#76699c',
    pathEdge: '#5e5285',
    deck: '#6a5d90',
    sun: '#c7b8ff',
    hemiSky: '#8a7bd6',
    hemiGround: '#2a2040',
  },
  lighting: { sun: 4.5, hemi: 3.2, ambient: 0.9, fogNear: 4, fogFar: 9 },
  time: { night: 1, nightSky: '#1c1430' },
  decor: { trees: [], rocks: [], plants: [], shoreline: [] },
  decorCounts: { trees: 0, rocks: 0, plants: 0, shoreline: 0 },
};
