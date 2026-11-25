import { useState } from 'react';
import type { AdminApi, ProjectInfo } from '../api';
import { href, navigate } from '../router';
import { ErrorNote, Empty, pct } from '../components/ui';

export function ProjectsPage({ api, projects, onChanged, authMode }: { api: AdminApi; projects: ProjectInfo[]; onChanged: () => void; authMode?: boolean }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const slug = id.trim().toLowerCase();
      await api.createProject(slug, name.trim() || undefined);
      onChanged();
      navigate('p', slug, 'integrate');
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">Each project is its own island, with its own agents, API keys and viewers.</p>
        </div>
      </header>

      {authMode === false && (
        <div className="notice">
          This server runs in <b>dev mode</b>: no API keys are needed, and it only accepts local connections. Start it with{' '}
          <code>--auth</code> to require keys.
        </div>
      )}

      <div className="grid">
        {projects.map((p) => {
          const m = p.metrics;
          const working = m ? m.byStatus.working + m.byStatus.assigned : 0;
          return (
            <a key={p.id} className="card project-card" href={href('p', p.id)}>
              <div className="project-top">
                <div>
                  <h3>{p.name}</h3>
                  <code className="muted">{p.id}</code>
                </div>
                <span className={`pill ${working ? 'live' : ''}`}>{working ? `${working} working` : p.live ? 'idle' : 'asleep'}</span>
              </div>
              <div className="mini-stats">
                <span>
                  <b>{m?.agents ?? 0}</b> agents
                </span>
                <span>
                  <b>{m?.completed ?? 0}</b> done
                </span>
                <span>
                  <b>{pct(m?.successRate)}</b> success
                </span>
                <span>
                  <b>{p.viewers}</b> watching
                </span>
              </div>
            </a>
          );
        })}

        <form className="card project-card new" onSubmit={create}>
          <h3>New project</h3>
          <input className="input" placeholder="id (e.g. my-app)" value={id} onChange={(e) => setId(e.target.value)} pattern="[a-z0-9][a-z0-9-]{0,47}" required />
          <input className="input" placeholder="Display name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <ErrorNote error={error} />
          <button className="btn primary">Create project</button>
        </form>
      </div>
      {projects.length === 0 && <Empty>No projects yet.</Empty>}
    </div>
  );
}
