import type { WorldConfig } from '@agent-viz/protocol';
import { meadowIsland } from './meadowIsland';
import { office } from './office';

export { meadowIsland, office };

/** Every built-in world, in picker order. The first is the default. */
export const allWorlds: WorldConfig[] = [meadowIsland, office];

/** Looks up a built-in world by id. */
export function getWorld(id: string): WorldConfig | undefined {
  return allWorlds.find((w) => w.id === id);
}
