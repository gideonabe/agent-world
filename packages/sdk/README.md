# @agent-world/sdk

The SDK sends your agents' activity to an Agent World server. It works in Node 18+ and in browsers, and its only
dependency is the protocol types.

```ts
import { AgentWorldClient } from '@agent-world/sdk';

const world = new AgentWorldClient({
  url: 'http://127.0.0.1:8787',
  project: 'my-app',
  apiKey: process.env.AGENT_WORLD_KEY, // a write key (only needed when the server runs with --auth)
});

const scout = world.agent({ name: 'Scout', kind: 'research' });

// run() is the easy path: started → your progress calls → completed (or failed if fn throws)
const report = await scout.run('Find competitors', async (task) => {
  task.progress(0.2, 'Searching the web');
  const pages = await search();
  task.step('Summarizing', 'writing'); // the robot walks to the Writer's Nook
  return summarize(pages);
});

await world.close(); // before your process exits
```

## API

| Call | What it does |
|---|---|
| `new AgentWorldClient({ url, project?, apiKey?, onError? })` | Creates a client |
| `client.agent({ id?, name, kind, appearance?, metadata? })` | Registers an agent (reusing an `id` updates that agent) → `AgentHandle` |
| `agent.task(title, { kind?, priority?, stationId?, metadata? })` | Assigns a task (it queues if the agent is busy) → `TaskHandle` |
| `agent.run(title, fn, opts?)` | Runs `fn` as a task; completes it or fails it, and waits for delivery |
| `agent.moveTo({ stationId } \| null)` · `agent.status(s)` · `agent.update(p)` · `agent.remove()` | Agent control |
| `task.start()` · `task.progress(0..1, msg?, phase?)` · `task.step(msg, phase?)` | Report progress. `phase` (a task kind) moves the robot to a matching station |
| `task.complete(result?)` · `task.fail(err)` · `task.cancel(reason?)` | Finish the task |
| `client.send(event[])` | Sends raw protocol events |
| `client.flush()` · `client.close()` · `client.pending` · `client.stats` | Delivery control |

## Delivery guarantees

- **It never throws into your code.** Failures go to `onError`.
- **Batched and ordered.** Calls made within 50 ms are sent as one request, and events are delivered in order.
- **Retries until the server is back.** If the server is unreachable or returns 5xx/429, the SDK retries with jittered
  backoff. Up to `maxQueue` events (5000 by default) are held in memory, and the oldest are dropped beyond that.
- **Rejected events are dropped.** Invalid events and bad keys (400, 401, 403, 404) are dropped and reported, not
  retried.
