import { useMemo, useState } from 'react';
import type { AgentWorldStore } from '@agent-world/core';
import type { AdminApi } from '../api';
import { ErrorNote } from '../components/ui';

type Template = { label: string; build: (ctx: { agentId: string; taskId: string }) => unknown };

const TEMPLATES: Template[] = [
  {
    label: 'Register an agent',
    build: ({ agentId }) => ({ type: 'agent.registered', agent: { id: agentId, name: 'Test Bot', kind: 'research', appearance: { color: '#38bdf8' } } }),
  },
  {
    label: 'Assign a task',
    build: ({ agentId, taskId }) => ({ type: 'task.assigned', task: { id: taskId, agentId, kind: 'research', title: 'Summarize the latest papers' } }),
  },
  {
    label: 'Report progress (with phase)',
    build: ({ taskId }) => ({ type: 'task.progress', taskId, progress: 0.5, message: 'Drafting the summary', phase: 'writing' }),
  },
  { label: 'Complete the task', build: ({ taskId }) => ({ type: 'task.completed', taskId }) },
  { label: 'Fail the task', build: ({ taskId }) => ({ type: 'task.failed', taskId, error: 'Rate limit exceeded' }) },
  {
    label: 'Full demo (5 events)',
    build: ({ agentId, taskId }) => [
      { type: 'agent.registered', agent: { id: agentId, name: 'Test Bot', kind: 'coding' } },
      { type: 'task.assigned', task: { id: taskId, agentId, kind: 'research', title: 'Fix the login bug' } },
      { type: 'task.started', taskId },
      { type: 'task.progress', taskId, progress: 0.4, message: 'Reading auth.ts' },
      { type: 'task.progress', taskId, progress: 0.7, message: 'Editing auth.ts', phase: 'coding' },
    ],
  },
  { label: 'Remove the agent', build: ({ agentId }) => ({ type: 'agent.removed', agentId }) },
];

/** Hand-craft events to see exactly how the world reacts (great for debugging an integration). */
export function SendTab({ api, projectId, store }: { api: AdminApi; projectId: string; store: AgentWorldStore }) {
  const ctx = useMemo(() => ({ agentId: 'test-bot', taskId: `test-task-${Date.now().toString(36)}` }), []);
  const [text, setText] = useState(() => JSON.stringify(TEMPLATES[5]!.build(ctx), null, 2));
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<unknown>();

  const send = async () => {
    setError(undefined);
    setResult(undefined);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return setError(new Error('That is not valid JSON.'));
    }
    try {
      const r = await api.sendEvents(projectId, body);
      setResult(`Accepted ${r.accepted}${r.rejected ? `, rejected ${r.rejected}: ${r.errors.join('; ')}` : ''}. Watch the Overview tab.`);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="send">
      <div className="card">
        <h4>Templates</h4>
        <div className="template-list">
          {TEMPLATES.map((t) => (
            <button key={t.label} className="btn sm" onClick={() => setText(JSON.stringify(t.build(ctx), null, 2))}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted small">
          They all use agent <code>{ctx.agentId}</code> and task <code>{ctx.taskId}</code>, so you can send them in order. Agents in this
          project: {Object.keys(store.getState().agents).length}.
        </p>
      </div>
      <div className="card">
        <h4>Event JSON</h4>
        <textarea className="input code-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={16} />
        <div className="row">
          <button className="btn primary" onClick={send}>
            Send to {projectId}
          </button>
          {result && <span className="ok-text">{result}</span>}
        </div>
        <ErrorNote error={error} />
      </div>
    </div>
  );
}
