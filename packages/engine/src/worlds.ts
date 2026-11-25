import type { ComponentType } from 'react';
import type { WorldConfig } from '@agent-viz/protocol';
import { allWorlds, getWorld, meadowIsland } from './presets';
import { meadowTheme } from './themes/meadow';
import { officeTheme } from './themes/office';
import { cityTheme } from './themes/city';
import { marketTheme } from './themes/market';
import { partyTheme } from './themes/party';
import type { Theme } from './themes/theme';
import { MeadowScene } from './scenes/MeadowScene';
import { OfficeScene } from './scenes/OfficeScene';
import { CityScene } from './scenes/CityScene';
import { MarketScene } from './scenes/MarketScene';
import { PartyScene } from './scenes/PartyScene';

/** How a world looks: its theme plus the scene that draws the ground, walkways and ambience. */
export interface WorldStyle {
  theme: Theme;
  /** Drawn inside the canvas, before decor, stations and agents. */
  Scene: ComponentType;
}

const styles: Record<string, WorldStyle> = {
  [meadowIsland.id]: { theme: meadowTheme, Scene: MeadowScene },
  office: { theme: officeTheme, Scene: OfficeScene },
  city: { theme: cityTheme, Scene: CityScene },
  market: { theme: marketTheme, Scene: MarketScene },
  party: { theme: partyTheme, Scene: PartyScene },
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
