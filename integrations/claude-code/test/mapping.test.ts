import { describe, expect, it } from 'vitest';
import { createAgentWorldStore } from '@agent-world/core';
import { meadowIsland } from '@agent-world/engine/presets';
import { parseClientMessage } from '@agent-world/protocol';
// @ts-expect-error plain JS module without type declarations
import { describeTool, mapHook, phaseForTool } from '../mapping.mjs';

const base = { session_id: 'abc12345-xyz', prompt_id: 'p-1', cwd: 'C:\\work\\shop-api', transcript_path: 'x' };

/** Feeds hook payloads through the mapping into a real store, exactly like the server would. */
function replay(payloads: object[]) {
  const store = createAgentWorldStore(meadowIsland, { lifecycle: false });
  for (const p of payloads) {
    const { events, later } = mapHook(p, { toolCount: 3 });
    // every mapped batch must be valid wire input
    expect(parseClientMessage({ kind: 'events', events })).not.toBeNull();
    for (const e of [...events, ...(later?.events ?? [])]) store.getState().emit(e);
  }
  return store.getState();
}

describe('Claude Code mapping', () => {
  it('turns a prompt + tool calls + stop into one task that tours the stations', () => {
    let s = replay([
      { ...base, hook_event_name: 'SessionStart', source: 'startup' },
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Fix the flaky checkout test please' },
    ]);
    const agent = s.agents['cc-abc12345']!;
    expect(agent.descriptor.name).toBe('shop-api');
    expect(s.tasks[agent.currentTaskId!]!.title).toBe('Fix the flaky checkout test please');
    expect(agent.stationId).toBe('plaza'); // thinking

    s = replay([
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Fix it' },
      { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'src/checkout.test.ts' } },
    ]);
    expect(s.agents['cc-abc12345']!.stationId).toBe('research-lab');
    expect(s.tasks['cc-abc12345-p-1']!.message).toBe('Reading checkout.test.ts');

    s = replay([
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Fix it' },
      { ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'a/b.ts' } },
      { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run tests' } },
    ]);
    expect(s.agents['cc-abc12345']!.stationId).toBe('automation-hub');
    expect(s.tasks['cc-abc12345-p-1']!.message).toBe('$ Run tests');
    expect(s.tasks['cc-abc12345-p-1']!.title).toBe('Fix it'); // placeholders from tool hooks never overwrite the prompt

    s = replay([
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Fix it' },
      { ...base, hook_event_name: 'Stop', stop_hook_active: false },
    ]);
    expect(s.agents['cc-abc12345']!.status).toBe('completed');
  });

  it('survives out-of-order async hooks (tool call before the prompt arrives)', () => {
    const s = replay([
      { ...base, hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'TODO' } },
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Find all TODOs' },
    ]);
    const t = s.tasks['cc-abc12345-p-1']!;
    expect(t.title).toBe('Find all TODOs'); // placeholder upgraded
    expect(s.agents['cc-abc12345']!.taskQueue).toEqual([]);
  });

  it('waiting for permission shows as stalled until the next tool call', () => {
    let s = replay([
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Deploy' },
      { ...base, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'needs permission' },
    ]);
    expect(s.tasks['cc-abc12345-p-1']!.stalled).toBe(true);
    s = replay([
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Deploy' },
      { ...base, hook_event_name: 'Notification', notification_type: 'permission_prompt' },
      { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'deploy' } },
    ]);
    expect(s.tasks['cc-abc12345-p-1']!.stalled).toBe(false);
    // idle notifications are ignored
    expect(mapHook({ ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt' }).events).toEqual([]);
  });

  it('subagents get their own robot that leaves when done', () => {
    const sub = { ...base, agent_id: 'agent-777', agent_type: 'Explore' };
    const s = replay([
      { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Research X' },
      { ...sub, hook_event_name: 'SubagentStart' },
      { ...sub, hook_event_name: 'PreToolUse', tool_name: 'WebSearch', tool_input: { query: 'agent frameworks' } },
    ]);
    const subId = 'cc-abc12345-sub-agent777';
    expect(s.agents[subId]!.descriptor.name).toBe('Explore');
    expect(s.tasks[`${subId}-task`]!.message).toBe('Web search: agent frameworks');
    expect(s.agents['cc-abc12345']!.currentTaskId).toBe('cc-abc12345-p-1'); // main agent unaffected

    const end = mapHook({ ...sub, hook_event_name: 'SubagentStop' });
    expect(end.events.at(-1)).toEqual({ type: 'task.completed', taskId: `${subId}-task` });
    expect(end.later).toMatchObject({ events: [{ type: 'agent.removed', agentId: subId }] });
  });

  it('session end removes the robot; minimal detail hides content', () => {
    expect(mapHook({ ...base, hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' }).events).toEqual([
      { type: 'agent.removed', agentId: 'cc-abc12345' },
    ]);
    const ev = mapHook({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'secret plan' }, { detail: 'minimal' }).events;
    expect(JSON.stringify(ev)).not.toContain('secret plan');
    expect(describeTool('Bash', { command: 'export KEY=abc' }, 'minimal')).toBe('Using Bash');
  });

  it('maps tools to station phases', () => {
    expect(phaseForTool('Read')).toBe('research');
    expect(phaseForTool('MultiEdit')).toBe('coding');
    expect(phaseForTool('PowerShell')).toBe('automation');
    expect(phaseForTool('TodoWrite')).toBe('writing');
    expect(phaseForTool('mcp__github__create_pr')).toBe('automation');
    expect(phaseForTool('Agent')).toBe('delegating');
  });
});
