import type { ComponentType } from 'react';
import type { WorldConfig } from '@agent-viz/protocol';
import { allWorlds, getWorld, meadowIsland } from './presets';
import { meadowTheme } from './themes/meadow';
import { officeTheme } from './themes/office';
import type { Theme } from './themes/theme';
import { MeadowScene } from './scenes/MeadowScene';
import { OfficeScene } from './scenes/OfficeScene';

/** How a world looks: its theme plus the scene that draws the ground, walkways and ambience. */
export interface WorldStyle {
  theme: Theme;
  /** Drawn inside the canvas, before decor, stations and agents. */
  Scene: ComponentType;
}

const styles: Record<string, WorldStyle> = {
  [meadowIsland.id]: { theme: meadowTheme, Scene: MeadowScene },
  office: { theme: officeTheme, Scene: OfficeScene },
};

/** The look for a world id. Unknown ids (custom worlds) get Meadow Island's look. */
export function getWorldStyle(worldId: string): WorldStyle {
  return styles[worldId] ?? styles[meadowIsland.id]!;
}

/** Registers (or replaces) the look of a custom world. */
export function registerWorldStyle(worldId: string, style: WorldStyle) {
  styles[worldId] = style;
}

export { allWorlds, getWorld };
export type { WorldConfig };
