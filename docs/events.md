# Event reference

Send events to `POST /v1/projects/<project>/events`, either one JSON object or an array of up to a few hundred. With `--auth`, add
`Authorization: Bearer <write key>`. The response says how many events were accepted and rejected:
`{ "accepted": 2, "rejected": 0, "errors": [] }`.

## Agents

| Event | Fields | Effect |
|---|---|---|
| `agent.registered` | `agent: { id, name, kind, description?, appearance?: { color?, scale?, model? }, metadata? }` | Adds the agent (a robot pops in), or updates it if it exists |
| `agent.updated` | `agent: { id, ...any fields }` | Changes the name, appearance, etc. |
| `agent.status` | `agentId, status, message?` | Sets the status directly (`idle`, `offline`, …) |
| `agent.destination` | `agentId, destination: { stationId } \| { nodeId } \| null` | Where the agent rests while idle (`null` = roam) |
| `agent.removed` | `agentId` | Removes the robot and cancels its tasks |

## Tasks

| Event | Fields | Effect |
|---|---|---|
| `task.assigned` | `task: { id, agentId, kind, title, priority?, stationId?, metadata? }` | Starts the task, or queues it if the agent is busy. Reusing an id updates the title |
| `task.started` | `taskId` | The task is in progress, and the robot works once it arrives |
| `task.progress` | `taskId, progress (0–1), message?, phase?` | Updates the progress bar and message. A new `phase` moves the robot to a matching station |
| `task.completed` | `taskId, result?` | Confetti and a ✓, then the next queued task or rest |
| `task.failed` | `taskId, error` | Sparks and a ! |
| `task.cancelled` | `taskId, reason?` | A puff of smoke, and the task is removed from the queue |
| `task.stalled` | `taskId` | A ? badge and a thinking pose. Usually the server sends this itself |

## Envelopes (optional)

You can wrap an event as `{ "id": "...", "ts": 1712345678901, "source": "my-worker", "event": { ... } }`. The server keeps your `id`
and `source` but uses its own clock for `ts`. Bare events are wrapped for you.

## Rules worth knowing

- **Order matters only per task.** Send `task.assigned` before progress on the same task. If progress arrives first, it's ignored,
  but a repeated `task.assigned` is harmless.
- **Unknown ids are ignored**, so a stray event can never break the world.
- **Finished tasks can't change.** Events for a completed, failed or cancelled task are ignored.
- **Limits.** Payloads can be up to 256 KB. Each key gets a burst of about 2000 events and a sustained 500 per second; beyond that,
  requests get `429` and should be retried.
