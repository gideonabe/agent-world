# Worlds & themes

Both a world and a theme are plain data. You can build a new island or a new art style without touching engine code.

## Worlds (layout and rules)

A `WorldConfig` (`packages/protocol/src/world.ts`) defines:

- **`island`**: radius, random seed (it shapes the coastline and decoration), and decoration density.
- **`navigation`**: waypoint `nodes` and `edges`. The paths you see are drawn from these, and robots only walk on them. Nodes tagged
  `wander` are where idle robots stroll.
- **`stations`**: position, rotation, which task kinds they `accept`, work `slots` (position and facing), the `entryNode` robots
  approach from, the `workAnimation`, an optional `workStyle: 'roaming'` with `roamNodes`, and `props` (furniture).
- **`homeStationId`** and extra world `props`.

To start, copy `packages/engine/src/presets/meadowIsland.ts`. Station-local coordinates have `+z` pointing toward the island centre,
with furniture at negative `z`.

```ts
const myWorld: WorldConfig = {
  ...meadowIsland,
  id: 'my-world',
  stations: [
    ...meadowIsland.stations,
    { id: 'qa-bay', name: 'QA Bay', kind: 'qa', accepts: ['testing', 'qa'], position: [0, -8], entryNode: 'n-look',
      color: '#f472b6', slots: [{ position: [0, 0], facing: Math.PI }], props: [{ model: 'furniture/desk', position: [0, -1] }] },
  ],
};
```

Give the server the same world (`worlds: [myWorld]`), and give viewers the same world too (the `world` prop).

## Themes (look)

A `Theme` (`packages/engine/src/themes/theme.ts`) defines:

- **`palette`**: sky, fog, water, grass, cliffs, sand, paths, and sun colors.
- **`materialColors`**: recolors GLB materials by name, for example `{ leafsGreen: '#5cb04a' }`.
- **`robot`**: the GLB URL, its height, which materials take the agent color, walk and run speeds, and the **clip map** from
  logical states (`idle`, `walk`, `celebrate`, `fail`, `work.read`, …) to the animation names in your model.
- **`decor`**: weighted model pools for trees, rocks, plants, and shoreline.
- **`kindColors`**: the default robot color for each agent kind.
- **`assetBaseUrl`**: where model keys like `nature/tree_oak` are resolved from.

```ts
const nightTheme: Theme = {
  ...meadowTheme,
  id: 'night',
  palette: { ...meadowTheme.palette, background: '#0b1a2e', fog: '#0b1a2e', water: '#1d4e89', sun: '#9db8ff' },
};
<AgentWorld store={store} theme={nightTheme} />;
```

## Per-agent appearance

```json
{ "type": "agent.registered", "agent": { "id": "a1", "name": "Ada", "kind": "research",
  "appearance": { "color": "#f97316", "scale": 1.2, "model": "https://cdn.example.com/my-robot.glb" } } }
```

A custom model needs the same clip names as the theme's robot, or a theme whose clip map matches it.

## Assets

The default models are public domain (CC0): the Quaternius robot and Kenney's nature and furniture kits. See
`packages/engine/assets/models/CREDITS.md`.
