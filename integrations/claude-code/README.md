# Claude Code → Agent World

This bridge shows your Claude Code sessions as robots on the island, live.

| In Claude Code | On the island |
|---|---|
| A session starts | A robot named after the project folder appears |
| You send a prompt | It becomes the robot's task (title = your prompt); the robot thinks at the plaza |
| `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch` | The robot walks to the **Research Lab** ("Reading auth.ts") |
| `Edit`, `Write`, `MultiEdit` | The robot goes to the **Code Forge** ("Editing App.tsx") |
| `Bash`, `PowerShell`, MCP tools | The robot goes to the **Automation Hub** ("$ Run tests") |
| `TodoWrite`, plan mode | The robot goes to the **Writer's Nook** |
| Claude waits for your permission | A **?** badge appears and the robot switches to a "thinking" pose |
| A subagent runs (`Explore`, …) | A smaller helper robot joins, works, and leaves when done |
| Claude finishes its reply | Confetti and a ✓ badge |
| A turn ends with an API error | Sparks and a ! badge |
| The session ends | The robot disappears in a puff |

## Setup

```bash
# 1. in the agent-world folder: start a server without the simulator
npm run server:empty   # the console is at http://127.0.0.1:8787

# 2. install the hooks into the project you're working on (personal file, not committed)
npm run aw -- claude-install --project "C:/path/to/your/project"
#    or for every Claude Code session on this machine:
npm run aw -- claude-install --user
```

Then restart that Claude Code session, or run `/hooks` in it to confirm the hooks are listed. Your session shows up in
the console under the `default` project.

The same commands ship in the server package, so once it's installed from npm you don't need this repo:
`npx @agent-viz/server claude-install` (defaults to the current folder). That copies the hook scripts to
`~/.agent-world/claude-code` so they keep working after npx cleans up.

### Reporting into a project on a secured server

```bash
npm run aw -- keys create --project my-app --role write --name claude-code
npm run aw -- claude-install --project "C:/path/to/project" --world-project my-app --key aww_…
```

The key is saved in that project's `.claude/settings.local.json`, so keep that file out of version control. Watch
the session in the console under the `my-app` project.

To remove the hooks: `npm run aw -- claude-uninstall --project "<path>"`. Add `--dry-run` to print the result
without writing. The installer keeps your other settings and hooks, and writes a timestamped
backup before it changes anything.

## Safety

- Hooks run with `async: true`, so Claude never waits on them. The script prints nothing and always exits 0.
  Per the Claude Code docs, that means it has no effect on Claude's behavior or context.
- If the Agent World server isn't running, events are dropped silently.
- Everything goes to `127.0.0.1` only. Your prompts, file names, and commands are shown in the world. Set
  `AGENT_WORLD_DETAIL=minimal` to hide them (the robot shows only tool names).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_WORLD_URL` | `http://127.0.0.1:8787` | Server to send events to |
| `AGENT_WORLD_DETAIL` | `full` | `minimal` hides prompts, file names, and commands |
| `AGENT_WORLD_PROJECT` | – | Project id (the installer flag is `--world-project`) |
| `AGENT_WORLD_TOKEN` | – | Write key for `--auth` servers (the installer flag is `--key`) |
| `AGENT_WORLD_DEBUG` | – | A file path; every raw hook payload is appended to it, for troubleshooting |

## How it works

`agent-world-hook.mjs` reads the hook payload from stdin. `mapping.mjs` (a pure function, unit tested in `test/`)
turns it into standard Agent World events, which are POSTed to `/events`. The ids come from `session_id`,
`prompt_id` and `agent_id`, so the separate hook processes don't need to share state. Async hooks can arrive out
of order, so every batch includes an idempotent `agent.registered` plus a placeholder `task.assigned`, and nothing
is lost if a tool event arrives before its prompt. Station changes use the `phase` field on `task.progress`.
