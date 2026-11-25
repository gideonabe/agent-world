// Pure mapping: Claude Code hook payload -> Agent World protocol events.
// No I/O here so it can be unit tested. Plain JS (no build step): the hook
// runs with bare `node`.

const PALETTE = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#facc15', '#60a5fa', '#fb7185'];

/** Which station each tool's work belongs to (a task "phase"). */
const PHASES = {
  research: ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'NotebookRead', 'ToolSearch', 'ListMcpResourcesTool', 'ReadMcpResourceTool'],
  coding: ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'],
  automation: ['Bash', 'BashOutput', 'KillShell', 'KillBash', 'PowerShell', 'Monitor', 'Workflow'],
  writing: ['TodoWrite', 'ExitPlanMode', 'EnterPlanMode', 'AskUserQuestion'],
};
const TOOL_PHASE = new Map(Object.entries(PHASES).flatMap(([phase, tools]) => tools.map((t) => [t, phase])));

export function phaseForTool(tool = '') {
  if (TOOL_PHASE.has(tool)) return TOOL_PHASE.get(tool);
  if (tool === 'Task' || tool === 'Agent') return 'delegating'; // unknown kind → the plaza ("*") station
  if (tool.startsWith('mcp__')) return 'automation';
  return 'automation';
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const base = (p) => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
const clip = (s, n) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** Human-readable one-liner for a tool call. `detail: 'minimal'` hides arguments. */
export function describeTool(tool, input = {}, detail = 'full') {
  if (detail === 'minimal') return `Using ${tool}`;
  switch (tool) {
    case 'Read':
      return `Reading ${base(input.file_path)}`;
    case 'Edit':
    case 'MultiEdit':
      return `Editing ${base(input.file_path)}`;
    case 'Write':
      return `Writing ${base(input.file_path)}`;
    case 'NotebookEdit':
      return `Editing ${base(input.notebook_path)}`;
    case 'Grep':
      return `Searching “${clip(input.pattern, 40)}”`;
    case 'Glob':
      return `Finding ${clip(input.pattern, 40)}`;
    case 'Bash':
    case 'PowerShell':
      return `$ ${clip(input.description || input.command, 60)}`;
    case 'WebFetch':
      try {
        return `Fetching ${new URL(input.url).host}`;
      } catch {
        return 'Fetching a page';
      }
    case 'WebSearch':
      return `Web search: ${clip(input.query, 50)}`;
    case 'TodoWrite':
      return 'Updating the plan';
    case 'Task':
    case 'Agent':
      return `Delegating: ${clip(input.description || input.subagent_type, 50)}`;
    default:
      return tool.startsWith('mcp__') ? `Calling ${tool.split('__').slice(1).join(' › ')}` : `Using ${tool}`;
  }
}

/** Stable ids derived from the payload — no state shared between hook processes. */
export function idsFor(p) {
  const session = String(p.session_id ?? 'unknown');
  const short = session.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'session';
  const agentId = `cc-${short}`;
  const sub = p.agent_id ? `${agentId}-sub-${String(p.agent_id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}` : undefined;
  return {
    agentId,
    subAgentId: sub,
    // the user's prompt is one task; prompt_id is shared by every hook in that turn
    taskId: p.prompt_id ? `${agentId}-${String(p.prompt_id).slice(0, 40)}` : undefined,
    subTaskId: sub ? `${sub}-task` : undefined,
  };
}

function mainAgent(p, ids) {
  const folder = base(p.cwd) || 'Claude';
  return {
    type: 'agent.registered',
    agent: {
      id: ids.agentId,
      name: clip(p.session_title || folder, 40),
      kind: 'coding',
      description: `Claude Code session in ${clip(p.cwd, 200)}`,
      appearance: { color: PALETTE[hash(ids.agentId) % PALETTE.length] },
      metadata: { source: 'claude-code', sessionId: p.session_id, cwd: p.cwd },
    },
  };
}

function subAgent(p, ids) {
  return {
    type: 'agent.registered',
    agent: {
      id: ids.subAgentId,
      name: clip(p.agent_type || 'Subagent', 40),
      kind: 'research',
      appearance: { color: PALETTE[hash(ids.subAgentId) % PALETTE.length], scale: 0.85 },
      metadata: { source: 'claude-code', parent: ids.agentId, agentId: p.agent_id },
    },
  };
}

/** Placeholder task so events still land if this hook beats UserPromptSubmit. */
const ensureTask = (agentId, taskId, title, kind = 'thinking', placeholder = true) => ({
  type: 'task.assigned',
  task: { id: taskId, agentId, kind, title, ...(placeholder ? { metadata: { placeholder: true } } : {}) },
});

/**
 * @param {object} p hook stdin payload
 * @param {{ detail?: 'full'|'minimal', toolCount?: number }} opts
 * @returns {{ events: object[], later?: { delayMs: number, events: object[] } }}
 */
export function mapHook(p, opts = {}) {
  const detail = opts.detail ?? 'full';
  const ids = idsFor(p);
  const ev = p.hook_event_name;
  const inSub = Boolean(ids.subAgentId);
  const progress = Math.min(0.95, 1 - Math.pow(0.88, Math.max(1, opts.toolCount ?? 1)));

  // Activity inside a subagent belongs to the subagent's own robot.
  const actor = inSub ? ids.subAgentId : ids.agentId;
  const actorTask = inSub ? ids.subTaskId : ids.taskId;
  const prelude = () => {
    const out = [mainAgent(p, ids)];
    if (inSub) out.push(subAgent(p, ids), ensureTask(ids.subAgentId, ids.subTaskId, clip(p.agent_type || 'Subtask', 80), 'research'));
    else if (ids.taskId) out.push(ensureTask(ids.agentId, ids.taskId, 'Working…'));
    return out;
  };

  switch (ev) {
    case 'SessionStart':
      return { events: [mainAgent(p, ids)] };

    case 'UserPromptSubmit': {
      if (!ids.taskId) return { events: [mainAgent(p, ids)] };
      const title = detail === 'minimal' ? 'New request' : clip(p.prompt, 90) || 'New request';
      return {
        events: [
          mainAgent(p, ids),
          ensureTask(ids.agentId, ids.taskId, title, 'thinking', false),
          { type: 'task.started', taskId: ids.taskId },
          { type: 'task.progress', taskId: ids.taskId, progress: 0.02, message: 'Thinking…', phase: 'thinking' },
        ],
      };
    }

    case 'PreToolUse': {
      if (!actorTask) return { events: [mainAgent(p, ids)] };
      return {
        events: [
          ...prelude(),
          {
            type: 'task.progress',
            taskId: actorTask,
            progress,
            message: describeTool(p.tool_name ?? '', p.tool_input ?? {}, detail),
            phase: phaseForTool(p.tool_name),
          },
        ],
      };
    }

    case 'PostToolUseFailure': {
      if (!actorTask) return { events: [] };
      const msg = p.is_interrupt ? 'Interrupted' : `${p.tool_name} failed — retrying`;
      return { events: [...prelude(), { type: 'task.progress', taskId: actorTask, progress, message: msg }] };
    }

    case 'Notification':
    case 'PermissionRequest': {
      const waiting = ev === 'PermissionRequest' || p.notification_type === 'permission_prompt' || p.notification_type === 'elicitation_dialog';
      if (!waiting || !ids.taskId) return { events: [] };
      // "stalled" = visibly waiting on you (? badge + thinking pose); the next tool call clears it
      return { events: [mainAgent(p, ids), { type: 'task.stalled', taskId: ids.taskId }] };
    }

    case 'SubagentStart': {
      if (!inSub) return { events: [] };
      return {
        events: [
          mainAgent(p, ids),
          subAgent(p, ids),
          ensureTask(ids.subAgentId, ids.subTaskId, clip(p.agent_type || 'Subtask', 80), 'research', false),
          { type: 'task.started', taskId: ids.subTaskId },
        ],
      };
    }

    case 'SubagentStop': {
      if (!inSub) return { events: [] };
      return {
        events: [...prelude(), { type: 'task.completed', taskId: ids.subTaskId }],
        // let the celebration play, then the helper robot leaves
        later: { delayMs: 3500, events: [{ type: 'agent.removed', agentId: ids.subAgentId }] },
      };
    }

    case 'Stop':
      if (!ids.taskId) return { events: [] };
      return { events: [mainAgent(p, ids), ensureTask(ids.agentId, ids.taskId, 'Working…'), { type: 'task.completed', taskId: ids.taskId }] };

    case 'StopFailure':
      if (!ids.taskId) return { events: [] };
      return {
        events: [
          mainAgent(p, ids),
          ensureTask(ids.agentId, ids.taskId, 'Working…'),
          { type: 'task.failed', taskId: ids.taskId, error: clip(p.error || p.error_type || 'Turn ended with an error', 200) },
        ],
      };

    case 'SessionEnd':
      return { events: [{ type: 'agent.removed', agentId: ids.agentId }] };

    default:
      return { events: [] };
  }
}

