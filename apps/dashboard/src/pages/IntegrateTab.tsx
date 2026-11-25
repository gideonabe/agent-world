import { useEffect, useState } from 'react';
import type { AdminApi } from '../api';
import { href } from '../router';
import { Code } from '../components/ui';

/** Copy-paste snippets with this server + project filled in. */
export function IntegrateTab({ api, projectId }: { api: AdminApi; projectId: string }) {
  const [auth, setAuth] = useState(true);
  useEffect(() => void api.health().then((h) => setAuth(h.auth), () => {}), [api]);
  const url = api.base;
  const W = auth ? '<WRITE_KEY>' : '';
  const R = auth ? '<READ_KEY>' : '';
  const bearer = auth ? ` \\\n  -H "authorization: Bearer ${W}"` : '';

  return (
    <div className="integrate">
      {auth && (
        <div className="notice">
          This server requires API keys. Create them in <a href={href('p', projectId, 'keys')}>API keys</a>, then replace <code>{W}</code> /{' '}
          <code>{R}</code> below.
        </div>
      )}

      <section className="card">
        <h3>1 · Send events from any backend (HTTP)</h3>
        <p className="muted">Any language works. POST one event or an array of them.</p>
        <Code
          lang="bash"
          code={`curl -X POST ${url}/v1/projects/${projectId}/events${bearer} \\
  -H "content-type: application/json" -d '[
  {"type":"agent.registered","agent":{"id":"scout","name":"Scout","kind":"research"}},
  {"type":"task.assigned","task":{"id":"t1","agentId":"scout","kind":"research","title":"Find competitors"}},
  {"type":"task.progress","taskId":"t1","progress":0.5,"message":"Reading sites"}
]'`}
        />
      </section>

      <section className="card">
        <h3>2 · Use the SDK (Node or browser)</h3>
        <Code
          lang="ts"
          code={`import { AgentWorldClient } from '@agent-viz/sdk';

const world = new AgentWorldClient({
  url: '${url}',
  project: '${projectId}',${auth ? `\n  apiKey: process.env.AGENT_WORLD_KEY, // ${W}` : ''}
});

const scout = world.agent({ name: 'Scout', kind: 'research' });
await scout.run('Find competitors', async (task) => {
  task.progress(0.3, 'Searching the web');
  task.step('Writing the report', 'writing'); // walks to the Writer's Nook
});
await world.close();`}
        />
      </section>

      <section className="card">
        <h3>3 · Embed the live island in a React app</h3>
        <Code
          lang="tsx"
          code={`import { AgentWorldView } from '@agent-viz/engine';

<div style={{ height: 600 }}>
  <AgentWorldView server="${url}" project="${projectId}"${auth ? ` token="${R}"` : ''} />
</div>`}
        />
        <p className="muted small">
          Serve the engine's <code>assets/</code> folder at <code>/models/</code> (or set <code>theme.assetBaseUrl</code>).
        </p>
      </section>

      <section className="card">
        <h3>4 · Watch Claude Code sessions</h3>
        <p className="muted small">Run this in the folder you use Claude Code in, then restart Claude Code there.</p>
        <Code
          lang="bash"
          code={`npx @agent-viz/server@latest claude-install ${projectId}${url.replace(/\/+$/, '') === 'http://127.0.0.1:8787' ? '' : ` --url ${url}`}${auth ? ` --key ${W}` : ''}`}
        />
        <p className="muted small">
          Add <code>--user</code> to watch every Claude Code session on this machine. Undo with <code>npx @agent-viz/server claude-uninstall</code>.
        </p>
      </section>

      <section className="card">
        <h3>5 · Share a viewer link</h3>
        <Code lang="url" code={`${location.origin}${location.pathname}#/view/${projectId}`} />
        <p className="muted small">The person opening it connects with their own server URL and token. For a read-only embed, use option 3 with a read key.</p>
      </section>
    </div>
  );
}
