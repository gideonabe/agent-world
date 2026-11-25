# Agent World

A standalone, reusable **3D visualization platform for AI agents**. Agents appear as animated robots
on a miniature low-poly island. They walk to workstations, work, celebrate, fail, and wander, and all
of it is driven by a standardized event stream that any backend can produce.

## Quick start

```bash
npm install
npm run build:dashboard   # build the developer console once
npm run server:empty      # server + console at http://127.0.0.1:8787
```

Open **http://127.0.0.1:8787** to reach the **console**. From there you can create projects, manage API keys, watch live islands,
inspect events, send test events, copy integration snippets, and read the docs. The docs are also in `docs/`.

| Command | What it does |
|---|---|
| `npm run dev` | Standalone playground with a built-in simulator (http://localhost:5173) |
| `npm run dev:dashboard` | The console with hot reload (http://localhost:5180) |
| `npm test` · `npm run typecheck` · `npm run build` | 65 tests, strict TypeScript, and app builds |
| `npm run build:packages` · `npm run verify:packages` | Build publishable npm packages into `release/`, then install them into a fresh project and test them |

Add `?stats` to the playground URL for an FPS meter.

### Live mode (real event stream over WebSocket)

```bash
npm run server        # Agent World server on :8787 with the built-in simulator
npm run server:empty  # same, no simulator; send your own events
npm run dev           # then open http://localhost:5173/?ws=ws://127.0.0.1:8787/ws
```

To drive it from any backend, POST events to the server:

```bash
curl -X POST http://127.0.0.1:8787/events -H 'content-type: application/json' -d '[
  {"type":"agent.registered","agent":{"id":"bot-1","name":"Webhook","kind":"automation"}},
  {"type":"task.assigned","task":{"id":"t-1","agentId":"bot-1","kind":"automation","title":"Sync CRM"}}
]'
curl -X POST http://127.0.0.1:8787/events -d '{"type":"task.completed","taskId":"t-1"}' -H 'content-type: application/json'
```

## Packages

| Package | Purpose | Depends on |
|---|---|---|
| `@agent-world/protocol` | Standard types and zod schemas: agents, tasks, events, world config | zod |
| `@agent-world/core` | Framework-agnostic store, pure reducer, station router, event sources (mock) | protocol, zustand |
| `@agent-world/engine` | React Three Fiber renderer: island, stations, robots, camera, themes | core, protocol |
| `@agent-world/server` | Authoritative hub: projects, API keys, persistence, REST + WebSocket, rate limits, simulator ([README](packages/server/README.md)) | core, protocol, ws |
| `@agent-world/sdk` | Client for any app: `agent().run(...)`, batching, retries ([README](packages/sdk/README.md)) | protocol |
| `apps/dashboard` | Developer console: projects, keys, live island, event inspector, test events, snippets, docs (the server hosts it at `/`) | engine, core |
| `apps/playground` | Demo app: full-screen world and overlay UI, using the local simulator or a live server | all |
| `integrations/claude-code` | Claude Code hooks bridge: your sessions as robots ([README](integrations/claude-code/README.md)) | – |

## Packaging

`npm run build:packages` bundles each library to ESM with esbuild, emits `.d.ts` files, writes a publish manifest, and packs a
tarball into `release/`. In the workspace, packages still import TypeScript source; only the `dist/` folders are published.

- `@agent-world/engine` ships the 3D models under `assets/`. Serve them at `/models/`, or set `theme.assetBaseUrl`.
- `@agent-world/server` inlines the world presets, so it doesn't pull in React or three. It ships the built console plus an
  `agent-world-server` bin.
- `npm run verify:packages` installs the tarballs into an empty project, starts the server from its bin, runs the SDK against it,
  and checks types, assets, and the console.

To publish, pick a license (none is set yet), then run `npm publish --access public` in each `packages/*/dist`.

## How it works

```
 producer (mock / WebSocket / SDK)
        │  EventEnvelope { id, ts, event }
        ▼
 core store ── applyEvent() ──► agents, tasks, station occupancy, log
        │  (zustand selectors)
        ▼
 engine: Robot reads agent state ─► MotionIntent ─► AgentMotion (path + clip) ─► GLB animation
```

* **Event-driven.** Every state change goes through one pure reducer, `applyEvent` (`packages/core/src/reducer.ts`).
* **Logical and visual state are separate.** The core only knows `assigned / working / completed / failed`.
  The engine turns that into walking, working, and reaction animations. Real systems don't wait for
  robots to walk, and the visuals catch up smoothly.
* **Nothing is hardcoded.** Worlds are data (`WorldConfig`: stations, slots, nav graph, props).
  Themes are data (palette, models, clip mapping, decor). Agents and tasks only come from events.
* **Performance.** Per-frame motion lives in refs inside `useFrame`. Components subscribe with
  narrow selectors. Paths are merged into one draw call. Water waves run on the GPU. Model
  geometry and materials are shared between clones. All assets are preloaded in parallel.

## Event vocabulary

```ts
{ type: 'agent.registered', agent: { id, name, kind, appearance? } }
{ type: 'agent.updated',    agent: { id, ...partial } }
{ type: 'agent.removed',    agentId }
{ type: 'agent.status',      agentId, status: 'idle'|'assigned'|'working'|'completed'|'failed'|'offline', message? }
{ type: 'agent.destination', agentId, destination: { stationId } | { nodeId } | null }
{ type: 'task.assigned',     task: { id, agentId, kind, title, stationId?, priority?, metadata? } }
{ type: 'task.started',      taskId }
{ type: 'task.progress',     taskId, progress: 0..1, message? }
{ type: 'task.completed',    taskId, result? }
{ type: 'task.failed',       taskId, error }
{ type: 'task.cancelled',    taskId, reason? }
{ type: 'task.stalled',      taskId }            // normally emitted by the store's lifecycle monitor
```

Envelopes carry `{ id, ts, projectId?, source?, event }`.

## Agent and task management

**Task lifecycle:** `queued → assigned → in_progress → completed | failed`. A task can be `cancelled`
from any state before it finishes.

* **One active task per agent, plus a backlog.** A task assigned to a busy agent is `queued`.
  The backlog is ordered by `priority` (highest first), then by arrival order. When the active task
  finishes, the next queued task becomes active right away and the robot walks to its station.
* **Routing.** The task `kind` picks the station (`StationDef.accepts`), and unknown kinds go to a `"*"`
  station. The least-loaded matching station wins. When a station is full, agents queue in front of it.
* **The producer is the source of truth.** If it starts or reports progress on a queued task, that task
  becomes active and the previous active task goes back to the front of the queue.
* **Lifecycle monitor.** One timer per store. It returns completed/failed agents to idle after
  `settleMs` (4s by default) and flags tasks that have been silent for `staleMs` (30s by default) as
  `stalled`. Stalled robots switch to a "thinking" animation. Any progress update clears the flag.
* **Destinations.** An idle agent with a destination rests at that station or nav node instead of roaming.
* **History and bounds.** Each agent keeps its last 25 finished tasks. The store keeps at most 500 tasks,
  dropping the oldest finished ones first.

### Commands (event-emitting)

```ts
const s = store.getState();
s.registerAgent({ id: 'a1', name: 'Ada', kind: 'research' });
const id = s.assignTask({ agentId: 'a1', kind: 'research', title: 'Read papers', priority: 5 });
s.reportProgress(id, 0.4, 'Reading…');
s.completeTask(id);            // or failTask(id, 'err') / cancelTask(id, 'reason')
s.retryTask(id);               // new task with metadata { retryOf, attempt }
s.moveAgent('a1', { stationId: 'plaza' });
```

### Selectors

`selectQueue`, `selectHistory`, `selectActiveTask`, `selectAgentMetrics` (success rate, average task
time), `selectWorldMetrics`, `selectStationLoad`, and `selectRoutableKinds`. Some selectors build new
objects; when you use one of those with `useStore`, wrap it in `useShallow` and return flat primitives.

## Embedding (today)

```tsx
import { createAgentWorldStore } from '@agent-world/core';
import { AgentWorld, meadowIsland } from '@agent-world/engine';

const store = createAgentWorldStore(meadowIsland /*, { lifecycle: { settleMs, staleMs }, onEvent } */);
store.getState().registerAgent({ id: 'a1', name: 'Ada', kind: 'research' });
store.getState().assignTask({ agentId: 'a1', kind: 'research', title: 'Read papers' });

<AgentWorld store={store} onSelectAgent={console.log} />;
```

Untrusted input (for example, from a socket) goes through `store.getState().ingest(json)`, which validates against the zod schema.

## Use it from your own app (Phase 5)

```bash
npm run server:auth                                          # prints an admin token once
npm run aw -- projects create my-app
npm run aw -- keys create --project my-app --role write      # for your app
npm run aw -- keys create --project my-app --role read       # for viewers
```

```ts
// in your app (Node or browser)
const world = new AgentWorldClient({ url: 'http://127.0.0.1:8787', project: 'my-app', apiKey: WRITE_KEY });
await world.agent({ name: 'Scout', kind: 'research' }).run('Find competitors', async (task) => {
  task.progress(0.5, 'Reading sites');
});
```

```tsx
// in any React app: a live view of the project
<AgentWorldView server="http://127.0.0.1:8787" project="my-app" token={READ_KEY} />
```

Or open the playground at `http://localhost:5173/?server=http://127.0.0.1:8787&project=my-app&token=<read key>`.

## Watch your Claude Code sessions

`integrations/claude-code` turns Claude Code hooks into Agent World events. Each session becomes a robot that walks
between stations as Claude reads, edits, and runs commands. See [integrations/claude-code/README.md](integrations/claude-code/README.md).

## Live streaming

```
 your backend ── POST /events ──┐
 (or WebSocket "events" frame)  ▼
                      server: core store (reducer + lifecycle) ── batched "events" frames ──► every viewer
                                 └── on connect: "hello" + "snapshot" (late joiners catch up)
```

* **Wire format** (`packages/protocol/src/wire.ts`): server→client `hello | snapshot | events | error | pong`,
  client→server `events | ping`. Every frame is validated with zod on both sides.
* **`WebSocketEventSource`** (in core; works in browsers and Node 22+): reconnects with jittered
  exponential backoff. It re-syncs from a fresh snapshot after every reconnect, so dropped events can't
  leave the world inconsistent, and buffers outgoing commands (with a cap) while offline. A close with
  code `4401`/`4403` (auth rejected) stops reconnecting. Pass `token` and it is sent as `?token=`.
* **The server is authoritative.** It re-stamps event times, runs the settle/stall timers (viewers turn
  theirs off with `lifecycle: false`), and batches broadcasts into 50 ms frames.
* **Endpoints:** `GET /health`, `GET /snapshot`, `POST /events` (one event, an array, or envelopes;
  max 256 KB), and `ws://…/ws`.

```ts
const store = createAgentWorldStore(meadowIsland, { lifecycle: false });
const socket = new WebSocketEventSource({ url: 'ws://127.0.0.1:8787/ws' });
socket.onStatus((s) => console.log(s));       // connecting | open | reconnecting | closed
store.getState().connect(socket);
socket.send([{ type: 'agent.destination', agentId: 'a1', destination: { stationId: 'plaza' } }]);
```

## Visual feedback

| Event | In the world |
|---|---|
| `agent.registered` | Robot pops in with a sparkle burst and a wave |
| `task.assigned` | Robot walks the paths to its station slot; the station beacon lights up |
| `task.started` / `task.progress` | Station work animation; progress bar on the label; the latest message shows when selected |
| `task.completed` | Confetti, a ✓ badge, and a thumbs-up; then the next queued task, or rest |
| `task.failed` | Sparks and smoke, a ! badge, and a head-shake |
| `task.cancelled` | A small puff, a – badge, and a wave |
| `task.stalled` | A ? badge; the robot switches to a "thinking" pose |
| `agent.removed` | A puff of smoke where the robot stood |

Effects watch the store directly (no React re-render per event), and all particles are drawn with one
pooled `InstancedMesh`. Turn them off with `<AgentWorld effects={false} />`.

## Customization

* **New world:** copy `packages/engine/src/presets/meadowIsland.ts` and change the stations, slots, nav nodes/edges, and props.
* **New theme:** copy `themes/meadow.ts` and change the palette, `materialColors`, robot model/clip mapping, and decor pools.
* **Per agent:** set `appearance: { color, model, scale }` on the descriptor.
* **Work animation per station:** use `workAnimation` (a key into `theme.robot.clips.work`). Set `workStyle: 'roaming'` to make agents move between `roamNodes` while they work.

## Roadmap

1. ✅ Scaffold and 3D environment (island, water, paths, decor, lighting, camera)
2. ✅ Robot characters, navigation, animation state machine
3. ✅ Agent/task management: backlogs with priority, cancel/retry, stall detection, settling, destinations, history, metrics, commands, and selectors
4. ✅ Events to visuals: WebSocket source with reconnect and snapshot sync, relay server, event-driven effects, live mode in the playground
5. ✅ Integration API and SDK: projects, API keys (hashed, write/read/admin), persistence, rate limits, a management CLI and HTTP API, `@agent-world/sdk`, and `<AgentWorldView>` / `useRemoteWorld`
6. ✅ Developer console (projects, keys, live island, event inspector, test events, snippets, rendered docs, full-screen view) hosted by the server, docs in `docs/`, and publish-ready npm packages verified by a clean-install test

See `docs/ARCHITECTURE.md` for the full design.

## Assets

The 3D models are CC0 (public domain). See `packages/engine/assets/models/CREDITS.md`.
