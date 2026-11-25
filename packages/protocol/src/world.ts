/**
 * World configuration: everything about the place agents live in.
 * Worlds are data, so new environments can be shipped without code changes.
 */

/** [x, z] on the ground plane, world units. */
export type Vec2 = [number, number];

export interface PropPlacement {
  /** Theme model key (e.g. "furniture/desk") or absolute GLB URL. */
  model: string;
  /** Offset relative to the station origin. */
  position: Vec2;
  /** Height offset. */
  y?: number;
  /** Rotation around Y in radians. */
  rotation?: number;
  scale?: number;
  castShadow?: boolean;
}

export interface StationSlot {
  /** Offset relative to station origin where the agent stands while working. */
  position: Vec2;
  /** Direction the agent faces while working (radians, Y axis). */
  facing: number;
  /** Nav node to approach this slot from (defaults to the station's entryNode). */
  entryNode?: string;
}

export interface StationDef {
  id: string;
  name: string;
  /** Station kind (e.g. "research"); used for theming and default routing. */
  kind: string;
  /** Task kinds this station accepts. "*" accepts anything. */
  accepts: string[];
  position: Vec2;
  /** Rotation of the whole station around Y. */
  rotation?: number;
  /** Navigation node agents walk to before stepping into a slot. */
  entryNode: string;
  slots: StationSlot[];
  /** Theme accent for roof / holograms. */
  color?: string;
  /** Animation clip (theme clip key) played while working here. */
  workAnimation?: string;
  /**
   * "stationary": stay in slot. "roaming": walk between `roamNodes`
   * while working (e.g. automation agents moving between stations).
   */
  workStyle?: 'stationary' | 'roaming';
  roamNodes?: string[];
  props?: PropPlacement[];
  /** Footprint radius, used to keep decoration away. */
  radius?: number;
}

export interface NavNode {
  id: string;
  position: Vec2;
  /** Idle agents wander between nodes tagged "wander". */
  tags?: string[];
}

export interface NavGraphDef {
  nodes: NavNode[];
  edges: [string, string][];
}

export interface IslandDef {
  radius: number;
  /** Seed for deterministic shoreline + decoration. */
  seed: number;
  /** Decoration density multiplier (0 disables decor). */
  decorDensity?: number;
}

export interface WorldConfig {
  id: string;
  name: string;
  island: IslandDef;
  navigation: NavGraphDef;
  stations: StationDef[];
  /** Station used for idle/home behaviour. */
  homeStationId?: string;
  /** Extra hand-placed props (world coordinates). */
  props?: PropPlacement[];
}
