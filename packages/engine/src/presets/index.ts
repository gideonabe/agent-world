import type { WorldConfig } from '@agent-viz/protocol';
import { meadowIsland } from './meadowIsland';
import { office } from './office';
import { city } from './city';
import { market } from './market';
import { party } from './party';

export { meadowIsland, office, city, market, party };

/** Every built-in world, in picker order. The first is the default. */
export const allWorlds: WorldConfig[] = [meadowIsland, office, city, market, party];

/** Looks up a built-in world by id. */
export function getWorld(id: string): WorldConfig | undefined {
  return allWorlds.find((w) => w.id === id);
}
