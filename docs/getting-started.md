# Getting started

Agent World shows AI agents as robots on a small 3D island. Your system reports what its agents are doing, and each robot walks to a
workstation, works, celebrates, or fails, all in real time.

It takes about five minutes to get a robot on screen.

## 1. Install and start the server

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npx @agent-viz/server        # http://127.0.0.1:8787
```

Or with Docker: `docker run -p 8787:8787 -v agent-world-data:/data ghcr.io/gideonabe/agent-world` (API keys are always on
there; the admin token is printed in `docker logs`).

Open **http://127.0.0.1:8787**. The server hosts this console. Locally it runs in **dev mode**: no API keys are needed, and it only
accepts connections from your own machine.

## 2. Make a project

On the **Projects** page, create a project, for example `my-app`. Each project is its own island.

## 3. Send your first events

Open the project's **Send test events** tab and click **Full demo**, then **Send**. Switch to **Overview**: a robot appears,
walks to the Research Lab, then moves to the Code Forge.

To do the same from a terminal:

```bash
curl -X POST http://127.0.0.1:8787/v1/projects/my-app/events -H "content-type: application/json" -d '[
  {"type":"agent.registered","agent":{"id":"scout","name":"Scout","kind":"research"}},
  {"type":"task.assigned","task":{"id":"t1","agentId":"scout","kind":"research","title":"Find competitors"}},
  {"type":"task.progress","taskId":"t1","progress":0.6,"message":"Reading sites"}
]'
curl -X POST http://127.0.0.1:8787/v1/projects/my-app/events -H "content-type: application/json" \
  -d '{"type":"task.completed","taskId":"t1"}'
```

## 4. Connect your real agents

Pick whichever fits:

| You have | Use |
|---|---|
| A Node or browser app | The [SDK](#/docs/sdk): `agent.run('task', async (task) => …)` |
| A backend in another language | Plain HTTP `POST /v1/projects/<id>/events` (see the [event reference](#/docs/events)) |
| Claude Code | The [Claude Code bridge](#/docs/claude-code): one install command, no code |
| A React app where you want the island | [`<AgentWorldView>`](#/docs/embedding) |

## 5. Going beyond localhost

To let other machines or people use your server, turn on keys:

```bash
npx @agent-viz/server --auth   # prints an ADMIN TOKEN once; sign in to this console with it
```

Then create a **write key** for each app that sends events, and a **read key** for each viewer, in the project's **API keys** tab.
See [Server, projects & keys](#/docs/server).
