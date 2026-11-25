/**
 * Themes describe how a world looks. Logic never depends on them, so a
 * different art style is just a different theme object.
 */
export interface ThemePalette {
  background: string;
  fog: string;
  skyTop: string;
  water: string;
  waterDeep: string;
  foam: string;
  grass: string;
  grassDark: string;
  cliff: string;
  cliffDark: string;
  sand: string;
  path: string;
  pathEdge: string;
  deck: string;
  sun: string;
  hemiSky: string;
  hemiGround: string;
}

/** Logical animation states mapped to clip names in the robot GLB. */
export interface RobotClipMap {
  idle: string;
  walk: string;
  run: string;
  wave: string;
  celebrate: string;
  fail: string;
  /** Played when a task is cancelled. */
  cancel: string;
  /** Named work clips that stations can reference via `workAnimation`. */
  work: Record<string, string>;
  defaultWork: string;
}

export interface RobotModelDef {
  url: string;
  /** Target height in world units after normalization. */
  height: number;
  /** Material names to tint with the agent color. */
  tintMaterials: string[];
  /** Material names to tint with the accent color (optional). */
  accentMaterials?: string[];
  clips: RobotClipMap;
  walkSpeed: number;
  runSpeed: number;
}

export interface DecorDef {
  /** Model keys with relative weights. */
  trees: [string, number][];
  rocks: [string, number][];
  plants: [string, number][];
  shoreline: [string, number][];
}

export interface Theme {
  id: string;
  name: string;
  palette: ThemePalette;
  /** Base URL that model keys are resolved against. */
  assetBaseUrl: string;
  robot: RobotModelDef;
  /** Robot variants by agent kind (overrides appearance defaults). */
  kindColors: Record<string, string>;
  decor: DecorDef;
  /** Uniform scale applied to Kenney-style unit props. */
  propScale: number;
  /** Recolour asset materials by name (e.g. { leafsGreen: '#5cae4a' }). */
  materialColors?: Record<string, string>;
  /** How many decor items of each kind are scattered (defaults: 22 trees, 12 rocks, 80 plants, 9 shoreline). */
  decorCounts?: Partial<Record<'trees' | 'rocks' | 'plants' | 'shoreline', number>>;
  /** Floor plate under each station: hexagon (default), square, or none. */
  stationBase?: 'hex' | 'square' | 'none';
  /** Light levels; omitted values keep the sunny outdoor defaults. */
  lighting?: { sun?: number; hemi?: number; ambient?: number; fogNear?: number; fogFar?: number };
  /**
   * Time of day. `night` fixes it (0 = noon, 1 = midnight, e.g. 1 for a party), `cycleSeconds` loops day → dusk → night → dawn.
   * Windows, lamps and neon glow brighter as it gets dark.
   */
  time?: { night?: number; cycleSeconds?: number; nightSky?: string };
}

/** Resolves a model key ("nature/tree_oak") or absolute URL to a URL. */
export function resolveModelUrl(theme: Theme, key: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(key)) return key;
  const base = theme.assetBaseUrl.endsWith('/') ? theme.assetBaseUrl : `${theme.assetBaseUrl}/`;
  return `${base}${key}${key.endsWith('.glb') || key.endsWith('.gltf') ? '' : '.glb'}`;
}
