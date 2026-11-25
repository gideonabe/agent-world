# Core concepts

## Agents

An agent is anything that does work: an LLM agent, a worker process, a Claude Code session. Each one has an `id`, a `name`, and a
`kind` (for example `research` or `coding`). The kind is the default for which station its tasks go to. On the island, each agent
is a robot, which you can tint and scale with `appearance`.

Agent status is one of `idle`, `assigned` (walking to a station), `working`, `completed`, `failed`, or `offline`. The server returns
`completed` and `failed` agents to `idle` after a few seconds.

## Tasks

A task is one piece of work given to one agent:

```
queued ──► assigned ──► in_progress ──► completed | failed
   └──────────┴──────────────┴──────────► cancelled
```

- **One active task per agent.** Extra tasks wait in that agent's queue, highest `priority` first. When the active task finishes,
  the next one starts, and the robot reacts first and then walks on.
- **Progress** is a number from 0 to 1, plus an optional message, which is shown on the robot's label.
- **Phases.** `task.progress` can include a `phase`, which is a task kind for the current step. A new phase sends the robot to a
  matching station, for example research → coding → automation.
- **Stalled.** A task with no updates for 30 seconds is flagged as stalled, and the robot looks puzzled. The next update clears it.

## Stations

Stations are the places on the island where work happens. Each station lists the task kinds it `accepts`, and has a few work
**slots**. When it's full, extra agents queue in front of it. Tasks of unknown kinds go to a station that accepts `"*"` (the town
plaza in the default world).

| Default station | Accepts |
|---|---|
| Research Lab | `research`, `analysis`, `search` |
| Code Forge | `coding`, `debugging`, `review` |
| Writer's Nook | `writing`, `editing`, `docs` |
| Automation Hub | `automation`, `workflow`, `integration` (agents walk between stops while working) |
| Town Plaza | anything else |

## Events

Everything is driven by a small, fixed set of [events](#/docs/events). Nothing about your agents is hardcoded. Events can arrive
out of order or be duplicated, and the world stays consistent:

- Unknown agents and tasks are ignored.
- Re-registering an agent updates it.
- Re-assigning the same task id updates it.

## Projects and keys

A **project** is one island with its own agents, history, viewers and keys. A **write key** sends events, a **read key** only
watches, and the **admin token** manages projects and keys. In local dev mode, keys are optional.

## How the pieces fit

```
your system ──events──► server (state + rules) ──WebSocket──► viewers (3D island)
```

The server is the source of truth. It saves state to disk, and anyone who opens a viewer later gets a snapshot first, then live
updates. See [Architecture](#/docs/architecture) for the details.
