# Agent World — Architecture

## Context
Greenfield project: a standalone, reusable AI-agent visualization platform. A miniature low-poly 3D island where robot characters represent AI agents; their position and animation are driven by real (initially mock) agent events. It must stay independent of any host app, be event-driven, and later ship as an SDK + API. This session: propose the architecture, scaffold `C:\Users\USER\Desktop\agent-world`, and deliver a working, visually strong 3D world with animated agents driven by a mock event stream (Phases 1–2, plus the minimal event/store core they depend on).

Environment: Node v26.13, npm 11.20, no pnpm → **npm workspaces** monorepo.

## Technology choices
| Concern | Choice | Why |
|---|---|---|
| Build | Vite + React 19 + TypeScript (strict) | fast HMR, first-class R3F support |
| 3D | three, @react-three/fiber, @react-three/drei | as requested; drei for camera controls, shadows, Html labels, Instances |
| State | zustand (vanilla store + React hook) | engine core usable outside React (SDK, server) |
| Realtime | native WebSocket (browser) / `ws` (Node) | no socket.io dependency |
| Server | Node + Fastify + `ws` (Phase 5) | small, typed, fast |
| Validation | zod in `@agent-world/protocol` | one schema shared by client, server, SDK |
| Tests | vitest | unit tests for store reducers, pathing, protocol |
| Assets | CC0 GLB packs (Quaternius robot, Kenney nature + furniture) + procedural terrain/water/paths | rich rigged animations, swappable via theme config |

No physics engine, no post-processing lib initially (maybe drei `<SoftShadows>`/`<ContactShadows>` only) to keep bundle and deps lean.

## Monorepo structure
```
agent-world/
  package.json                # npm workspaces, root scripts (dev, build, test, typecheck)
  tsconfig.base.json
  README.md
  packages/
    protocol/                 # @agent-world/protocol — PURE types + zod schemas, no deps beyond zod
      src/agent.ts            # AgentDescriptor, AgentKind, AgentStatus
      src/task.ts             # Task, TaskStatus, progress
      src/events.ts           # AgentWorldEvent discriminated union (agent.registered, task.assigned,
                              #   task.progress, task.completed, task.failed, agent.status, agent.removed)
      src/world.ts            # WorldConfig, StationDef, ThemeDef
    core/                     # @agent-world/core — framework-agnostic agent management (no React, no three)
      src/store.ts            # zustand/vanilla store: agents, tasks, stations, event log
      src/reducer.ts          # applyEvent(state, event) — single source of truth for state transitions
      src/stationRouter.ts    # task kind → station selection, occupancy/queueing
      src/sources/            # EventSource interface + MockEventSource (+ WebSocketEventSource in Phase 4)
    engine/                   # @agent-world/engine — React Three Fiber visualization (consumes core store)
      src/AgentWorld.tsx      # public <AgentWorld store theme world /> component (Canvas root)
      src/environment/        # Island, Water, Paths, Trees, Rocks, Clouds, Lighting, Sky
      src/stations/           # Workstation base + ResearchLab, CodingDesk, WritingDesk, AutomationHub, IdlePlaza
      src/characters/         # Robot (GLB + clip mapping), agentMotion (behaviour state machine), Agents layer
      src/navigation/         # waypoint graph on island paths + A*; smooth steering along path
      src/camera/             # isometric-ish orbit rig, focus-on-agent
      src/themes/             # theme registry (palettes, robot variants, station meshes or GLB urls)
      src/hooks/              # useAgentMotion, useAgents (selectors)
    sdk/                      # @agent-world/sdk — Phase 5 (client.registerAgent / emit / task helpers)
    server/                   # @agent-world/server — Phase 5 (Fastify REST + WS hub, projects, API keys)
  apps/
    playground/               # Vite app: full-screen world + overlay UI, wired to MockEventSource
      src/App.tsx
      src/ui/                 # AgentRoster, AgentInspector, EventFeed, TopBar (glassy overlay, not admin-dashboard)
    dashboard/                # Phase 6 developer dashboard + docs
```
Dependency direction: `protocol ← core ← engine ← apps`; `protocol ← sdk`, `protocol ← server`. Engine never imports app code; agents/stations/tasks only come from config + events (nothing hardcoded).

## Key design points
- **Event-driven core**: every change is an `AgentWorldEvent` passed through `applyEvent`. Mock source, WebSocket source and SDK all produce the same events, so swapping mock → real is a one-line change.
- **Logical vs visual state**: core holds logical state (`status: idle|walking|working|completed|failed`, `targetStationId`, `progress`). Engine derives the visual state per frame: agent assigned → path to station → walk anim → arrive → `working` anim; complete → celebrate → return to plaza/wander; failed → sad/spark anim + red bubble.
- **Performance**: per-frame motion lives in refs inside `useFrame`, not React state; components subscribe with narrow zustand selectors; shared geometries/materials; instanced trees/rocks/grass; shadow map sized once; `frameloop` default with dpr clamp `[1, 2]`.
- **Stations**: defined in `WorldConfig` (id, kind, position, slots, accepts task kinds). Each has N work slots so multiple agents can work without overlapping; overflow queues nearby.
- **Navigation**: hand-authored waypoint graph matching the visible paths, A* between nearest nodes, Catmull-Rom smoothing, idle wandering picks random reachable nodes.

## Assets (user chose: download CC0 GLB packs)
- **Robot**: `RobotExpressive.glb` (CC0, Tomás Laulhé/Quaternius, hosted in the three.js repo examples) — rigged with Idle, Walking, Running, Wave, ThumbsUp, Yes, No, Sitting, Death, Dance clips. Mapped: idle→Idle, walking→Walking, working→Sitting/Punch loop or Idle+typing overlay, completed→ThumbsUp/Wave, failed→No/Death. Per-agent tint via cloned materials; cloned with `SkeletonUtils.clone` so each agent has its own mixer.
- **Nature/props**: Kenney Nature Kit (CC0) GLBs for trees, rocks, flowers, fences; Kenney furniture/space kits (CC0) for desks, computers, bookshelves at stations.
- Downloads go into a fresh `agent-world/assets-src/_download/` dir first; only the selected `.glb` files are copied into `packages/engine/assets/models/` (served at `/models/` by host apps), with `CREDITS.md` listing source + license. Archives are not executed, only unpacked.
- Load via drei `useGLTF` (preloaded) + `useAnimations`; consider `gltf-transform`/Draco compression later if size grows.
- **Fallback**: if a pack can't be fetched, the island terrain, water, paths and that prop category are generated procedurally (flat-shaded low-poly). The terrain/water/paths are procedural regardless.
- Theme system maps `robotModel` / station prop slots to GLB URLs so assets are swappable without touching logic.

## Roadmap
1. **Phase 1 — Scaffold + environment**: workspaces, tsconfig, protocol types, playground app, island, water, lighting/shadows, sky, camera controls, stations placed from config, subtle ambient animation.
2. **Phase 2 — Robots + movement**: GLB robot, animation states, waypoint nav, smooth walking, nameplates/status bubbles.
3. **Phase 3 — Agent/task management**: core store + reducer, station router/occupancy, progress, completed/failed handling, unit tests.
4. **Phase 4 — Events → visuals**: MockEventSource producing realistic random task lifecycles; overlay UI (roster, inspector, event feed, click-to-focus); WebSocketEventSource.
5. **Phase 5 — Integration API + SDK**: Fastify server (projects, API keys, REST ingest, WS fan-out), `@agent-world/sdk` (Node + browser), React `<AgentWorld source=… />`.
6. **Phase 6 — Dev dashboard + docs**: project/key management UI, live event inspector, theme editor, docs site/README guides.

**This session's deliverable**: Phases 1–2 plus the minimum of 3–4 needed to see it alive (core store/reducer, mock source driving agents to stations). Stop after that for your review before Phase 3 hardening.

## Verification
- `npm install` then `npm run typecheck` and `npm test` (vitest on reducer/router/nav) pass.
- `npm run dev` starts the playground; open it in the browser and confirm: island renders with soft shadows, orbit/zoom works, robots spawn from mock `agent.registered` events, walk along paths to the matching station, switch to working animation, show progress, and return/celebrate or show failure.
- Production `npm run build` succeeds; check bundle size and FPS (drei `<Stats>` in dev).
