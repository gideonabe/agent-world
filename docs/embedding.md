# Embedding the world

## Drop-in live view

```tsx
import { AgentWorldView } from '@agent-viz/engine';

export function AgentsPanel() {
  return (
    <div style={{ height: 600 }}>
      <AgentWorldView
        server="http://127.0.0.1:8787"
        project="my-app"
        token={import.meta.env.VITE_AGENT_WORLD_READ_KEY} // a READ key: safe to ship to browsers
        onSelectAgent={(id) => console.log('clicked', id)}
        onStatusChange={(status, error) => console.log(status, error)}
      />
    </div>
  );
}
```

`AgentWorldView` connects to the project over WebSocket. It loads the current snapshot, streams live updates, and reconnects on its
own. It shows the project's world (Office, City, …) and follows when someone switches it. It fills its parent, so give the parent a
height.

**Sound.** Add `sound` (and optionally `volume`, 0..1) to play the world's ambient sound. Browsers only allow audio after the viewer
interacts with the page, so turn it on from a button click.

**Models.** The 3D models ship in `@agent-viz/engine/assets`. Serve that folder so the files are reachable at `/models/…`, for
example by pointing Vite's `publicDir` at it, or set `theme.assetBaseUrl` to wherever you host them.

## Your own UI around the same live state

```tsx
import { AgentWorld, useRemoteWorld } from '@agent-viz/engine';
import { selectWorldMetrics } from '@agent-viz/core';
import { useStore } from 'zustand';

function Ops() {
  const { store, status } = useRemoteWorld({ server: URL, project: 'my-app', token: READ_KEY });
  const working = useStore(store, (s) => selectWorldMetrics(s).byStatus.working);
  return (
    <>
      <header>{status} · {working} working</header>
      <AgentWorld store={store} />
    </>
  );
}
```

## Without a server

The engine only needs a store. You can feed events in directly, for example in a demo, a test, or an app that already has the data:

```tsx
import { createAgentWorldStore, MockEventSource } from '@agent-viz/core';
import { AgentWorld, city } from '@agent-viz/engine';

const store = createAgentWorldStore(city); // or meadowIsland, office, market, party
store.getState().connect(new MockEventSource({ agentCount: 6 })); // or call store.getState().assignTask(...)

<AgentWorld store={store} />;
```

## `<AgentWorld>` props

| Prop | Default | |
|---|---|---|
| `store` | required | From `createAgentWorldStore` or `useRemoteWorld` |
| `theme` | `meadowTheme` | Colors, models, animation names |
| `selectedAgentId` / `onSelectAgent` | – | Controlled selection; the camera follows the selected robot |
| `effects` | `true` | Confetti, sparks and badges |
| `stats` | `false` | FPS meter |
