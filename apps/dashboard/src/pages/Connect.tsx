import { useEffect, useState } from 'react';
import { AdminApi, type Connection } from '../api';
import { ErrorNote } from '../components/ui';

/** Same origin when the server hosts the console; otherwise the default dev server. */
const defaultServer = () => (location.protocol.startsWith('http') && location.port !== '5180' ? location.origin : 'http://127.0.0.1:8787');

export function ConnectPage({ onConnect }: { onConnect: (c: Connection, remember: boolean) => void }) {
  const [server, setServer] = useState(defaultServer);
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [needsToken, setNeedsToken] = useState<boolean | undefined>();

  // Served by a local dev server (no API keys)? Then there's nothing to fill in: connect straight away.
  useEffect(() => {
    if (!location.protocol.startsWith('http') || location.port === '5180') return;
    const conn = { server: location.origin, token: '' };
    let cancelled = false;
    new AdminApi(conn)
      .health()
      .then((h) => {
        if (!cancelled && !h.auth) onConnect(conn, false);
        else if (!cancelled) setNeedsToken(h.auth);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // run once on mount (onConnect is a new function on every render of the parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const conn = { server: server.trim().replace(/\/+$/, ''), token: token.trim() };
    const api = new AdminApi(conn);
    try {
      const h = await api.health();
      setNeedsToken(h.auth);
      if (h.auth && !conn.token) throw new Error('This server requires the admin token (printed when it first started).');
      await api.projects(); // verifies the token
      onConnect(conn, remember);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connect">
      <form className="connect-card card" onSubmit={submit}>
        <div className="brand big">
          <span className="logo">◆</span>
          <span>
            <b>Agent World</b>
            <small>Developer console</small>
          </span>
        </div>
        <p className="muted">Connect to an Agent World server to manage projects, keys and live worlds.</p>
        <label>
          Server URL
          <input className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://127.0.0.1:8787" required />
        </label>
        <label>
          Admin token {needsToken === false && <small className="muted">(not needed: server is in dev mode)</small>}
          <input
            className="input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="awadm_…  (leave empty for a local dev server)"
            autoComplete="off"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
        </label>
        <ErrorNote error={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <p className="muted small">
          No server yet? Run <code>npx @agent-viz/server</code>. Or read the{' '}
          <a href="#/docs/getting-started">getting started guide</a>.
        </p>
      </form>
    </div>
  );
}
