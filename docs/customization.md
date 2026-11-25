# Worlds & themes

Every project lives in a **world**. There are five built-in worlds, and you can switch a project between them at any time:
everyone watching switches with you, and robots keep their tasks and walk to the matching spot in the new world.

| World | id | What's going on |
|---|---|---|
| Meadow Island | `meadow-island` | The original: a low-poly island with trees, water and drifting clouds (the default) |
| Office | `office` | Open-plan office with dev pods, a meeting room, a mailroom and a lounge; coworkers wander about |
| City | `city` | A city block with a ring road, two lanes of traffic, shops and a café; day slowly turns to night and the windows light up |
| Market | `market` | An open-air market: striped stalls with produce, string lights, a fountain square and shoppers |
| Party | `party` | A night party: a light-up dance floor, a disco ball, sweeping beams, a DJ booth and a bar; thinking robots dance |

Each world can play ambient sound (traffic, market chatter, party music, office keyboards, birds and waves). It's off by default;
use the 🔈 button in the console, or `<AgentWorld sound />`.

## Choosing a world

- **Console:** pick one when you create a project, or click **Change world** on the project page.
- **CLI:** `agent-world-server projects create my-app --world city`, or `agent-world-server projects set-world my-app party`.
  `agent-world-server worlds` lists them. Start the server with `--world office` to make that the default for new projects.
- **HTTP:** `PATCH /v1/projects/my-app` with `{ "worldId": "market" }` (admin token, or anyone in dev mode). `GET /v1/worlds` lists them.
- **Playground:** `http://localhost:5173/?world=city`.

Viewers (`<AgentWorldView>`, `useRemoteWorld`, the console) learn the project's world from the server and switch on their own.

## How worlds map your tasks

Every built-in world has a station for each standard task kind, so producers work the same everywhere:

| Task kind (or `phase`) | Meadow Island | Office | City | Market | Party |
|---|---|---|---|---|---|
| `research`, `analysis`, `search` | Research Lab | Library Corner | City Library | Spice & Book Stall | Quiz Table |
| `coding`, `debugging`, `review` | Code Forge | Dev Pods | Tech Hub | Gadget Stall | DJ Booth |
| `writing`, `editing`, `docs` | Writer's Nook | Meeting Room | Corner Café | Print & Paper | Photo Wall |
| `automation`, `workflow`, `integration` | Automation Hub | Ops & Mailroom | Delivery Depot | Loading Dock | Bar & Kitchen |
| anything else | Town Plaza | Lounge | Town Square | Fountain Square | Dance Floor |

## Making your own world

A world is plain data (`WorldConfig`, `packages/protocol/src/world.ts`):

- **`island`**: size (`radius`; for square ground it's half the side), random seed, decoration density, and `decorInset`
  (keeps decoration away from the edge, e.g. inside a ring road).
- **`ground`**: `{ shape: 'island' }` (default, round shoreline) or `{ shape: 'square' }` (a square diorama block).
- **`navigation`**: waypoint `nodes` and `edges`. The walkways you see are drawn from these, and robots only walk on them. Nodes
  tagged `wander` are where idle robots stroll.
- **`stations`**: position, rotation, which task kinds they `accept`, work `slots` (position and facing), the `entryNode` robots
  approach from, the `workAnimation`, an optional `workStyle: 'roaming'` with `roamNodes`, and `props`.
- **`homeStationId`**, extra world `props`, and a `description` for pickers.

Copy one of `packages/engine/src/presets/*.ts` to start. Station-local coordinates have `+z` pointing toward the centre, with
furniture at negative `z`. `presets/layout.ts` has helpers for the standard walkway layout and back walls.

Props are GLB models (`furniture/desk`, `nature/tree_oak`, or any URL) or **built-in shapes** drawn in code, which take an optional
`color` and `variant`:

`shape/building`, `shape/shop`, `shape/car`, `shape/streetLamp`, `shape/fountain`, `shape/hydrant`, `shape/cone`, `shape/billboard`,
`shape/crate`, `shape/stall`, `shape/parasol`, `shape/stringLights`, `shape/discoBall`, `shape/speakers`, `shape/djBooth`,
`shape/balloons`, `shape/partyTable`, `shape/neon`.

```ts
const myWorld: WorldConfig = {
  ...office,
  id: 'my-office',
  name: 'My Office',
  stations: [
    ...office.stations,
    { id: 'qa-bay', name: 'QA Bay', kind: 'qa', accepts: ['testing', 'qa'], position: [0, -8], entryNode: 'n-look',
      color: '#f472b6', slots: [{ position: [0, 0], facing: Math.PI }], props: [{ model: 'furniture/desk', position: [0, -1] }] },
  ],
};

// give it a look (theme + scene), otherwise it gets Meadow Island's
registerWorldStyle('my-office', getWorldStyle('office'));
```

Give the server the world too (`createAgentWorldServer({ worlds: [...allWorlds, myWorld] })`), and pass
`resolveWorld={(id) => id === 'my-office' ? myWorld : undefined}` to viewers so they can find it.

## Themes (look)

A `Theme` (`packages/engine/src/themes/theme.ts`) defines:

- **`palette`**: sky, fog, water, floor (`grass`), sides (`cliff`), trim (`sand`), walkways (`path`), station plates (`deck`), and light colours.
- **`lighting`** (light levels) and **`time`**: a fixed time of day (`night: 0..1`) or a loop (`cycleSeconds`). Windows, lamps and
  neon glow brighter at night.
- **`stationBase`**: `hex`, `square` or `none` plates under stations.
- **`materialColors`**: recolours GLB materials by name, for example `{ leafsGreen: '#5cb04a' }`.
- **`robot`**: the GLB URL, its height, which materials take the agent colour, walk and run speeds, and the **clip map** from
  logical states (`idle`, `walk`, `celebrate`, `fail`, `work.read`, `work.dance`, …) to the animation names in your model.
- **`decor`** and **`decorCounts`**: weighted model pools for trees, rocks, plants and shoreline, and how many of each to scatter.
- **`kindColors`**: the default robot colour for each agent kind.
- **`assetBaseUrl`**: where model keys like `nature/tree_oak` are resolved from.

By default `<AgentWorld>` uses the world's own theme; pass `theme` to override it.

```ts
const nightMeadow: Theme = {
  ...meadowTheme,
  id: 'night-meadow',
  palette: { ...meadowTheme.palette, background: '#0b1a2e', fog: '#0b1a2e', water: '#1d4e89', sun: '#9db8ff' },
  time: { night: 0.8 },
};
<AgentWorld store={store} theme={nightMeadow} />;
```

## Per-agent appearance

```json
{ "type": "agent.registered", "agent": { "id": "a1", "name": "Ada", "kind": "research",
  "appearance": { "color": "#f97316", "scale": 1.2, "model": "https://cdn.example.com/my-robot.glb" } } }
```

A custom model needs the same clip names as the theme's robot, or a theme whose clip map matches it.

## Assets

The models are public domain (CC0): the Quaternius robot and Kenney's nature and furniture kits. See
`packages/engine/assets/models/CREDITS.md`. City, market and party props are built-in shapes, and the ambient sound is synthesized,
so neither needs extra files.
