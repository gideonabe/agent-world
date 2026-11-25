import { useCallback, useEffect, useState } from 'react';
import type { AdminApi, KeyInfo } from '../api';
import { ago, CopyButton, Empty, ErrorNote, Modal } from '../components/ui';

export function KeysTab({ api, projectId }: { api: AdminApi; projectId: string }) {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [error, setError] = useState<unknown>();
  const [role, setRole] = useState<'write' | 'read'>('write');
  const [name, setName] = useState('');
  const [revealed, setRevealed] = useState<{ key: string; record: KeyInfo }>();

  const load = useCallback(() => api.keys(projectId).then(setKeys, setError), [api, projectId]);
  useEffect(() => void load(), [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const r = await api.createKey(projectId, role, name.trim() || `${role} key`);
      setRevealed(r);
      setName('');
      void load();
    } catch (err) {
      setError(err);
    }
  };

  const revoke = async (k: KeyInfo) => {
    if (!confirm(`Revoke "${k.name}" (${k.prefix}…)? Anything using it stops working immediately.`)) return;
    try {
      await api.revokeKey(projectId, k.id);
      void load();
    } catch (err) {
      setError(err);
    }
  };

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="keys">
      <form className="card key-create" onSubmit={create}>
        <h4>Create a key</h4>
        <div className="role-pick">
          <label className={`role ${role === 'write' ? 'on' : ''}`}>
            <input type="radio" checked={role === 'write'} onChange={() => setRole('write')} />
            <b>Write</b>
            <span className="muted small">For your app or agent runtime: sends events. It can also watch.</span>
          </label>
          <label className={`role ${role === 'read' ? 'on' : ''}`}>
            <input type="radio" checked={role === 'read'} onChange={() => setRole('read')} />
            <b>Read</b>
            <span className="muted small">For viewers and embeds: watch only. Safe to put in a web page.</span>
          </label>
        </div>
        <div className="row">
          <input className="input grow" placeholder="Label, e.g. production backend" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <button className="btn primary">Create {role} key</button>
        </div>
        <ErrorNote error={error} />
      </form>

      <div className="card">
        <h4>Active keys</h4>
        {active.length === 0 ? (
          <Empty>No keys yet. On a dev-mode server keys are optional; on an --auth server your app needs a write key.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <code>{k.prefix}…</code>
                  </td>
                  <td>
                    <span className={`pill ${k.role}`}>{k.role}</span>
                  </td>
                  <td className="muted">{ago(k.createdAt)}</td>
                  <td className="muted">{ago(k.lastUsedAt)}</td>
                  <td>
                    <button className="btn sm ghost danger" onClick={() => revoke(k)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {revoked.length > 0 && <p className="muted small">{revoked.length} revoked key(s) hidden.</p>}
      </div>

      {revealed && (
        <Modal title="Your new key" onClose={() => setRevealed(undefined)}>
          <p>
            Copy it now. <b>It won't be shown again.</b> Only a hash is stored on the server.
          </p>
          <div className="reveal">
            <code>{revealed.key}</code>
            <CopyButton text={revealed.key} />
          </div>
          <p className="muted small">
            {revealed.record.role === 'write'
              ? 'Use it as apiKey in the SDK, as a Bearer token for POST /events, or as --key for the Claude Code installer. Keep it server-side.'
              : 'Use it as the token for <AgentWorldView>, or in a viewer URL (?token=…).'}
          </p>
          <button className="btn primary" onClick={() => setRevealed(undefined)}>
            I've copied it
          </button>
        </Modal>
      )}
    </div>
  );
}
