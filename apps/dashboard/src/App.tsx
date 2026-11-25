import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminApi, loadConnection, saveConnection, type Connection, type ProjectInfo } from './api';
import { href, useRoute } from './router';
import { ConnectPage } from './pages/Connect';
import { ProjectsPage } from './pages/Projects';
import { ProjectPage } from './pages/Project';
import { ViewPage } from './pages/View';
import { DocsPage } from './pages/Docs';

export function App() {
  const route = useRoute();
  const [conn, setConn] = useState<Connection | null>(loadConnection);
  const api = useMemo(() => (conn ? new AdminApi(conn) : null), [conn]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [authMode, setAuthMode] = useState<boolean | undefined>();

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      setProjects(await api.projects());
    } catch {
      /* page-level views show their own errors */
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void api.health().then((h) => setAuthMode(h.auth), () => {});
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [api, refresh]);

  const signOut = () => {
    saveConnection(null);
    setConn(null);
    location.hash = '#/';
  };

  // The full-screen viewer and docs work without the sidebar chrome.
  if (route[0] === 'view' && api && route[1]) return <ViewPage api={api} projectId={route[1]} />;
  if (!api && route[0] !== 'docs') {
    return (
      <ConnectPage
        onConnect={(c, remember) => {
          saveConnection(c, remember);
          setConn(c);
        }}
      />
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="logo">◆</span>
          <span>
            <b>Agent World</b>
            <small>Console</small>
          </span>
        </a>
        {api && (
          <nav className="nav">
            <div className="nav-title">Projects</div>
            <a className={`nav-item ${route.length === 0 ? 'on' : ''}`} href="#/">
              All projects
            </a>
            {projects.map((p) => (
              <a key={p.id} className={`nav-item ${route[0] === 'p' && route[1] === p.id ? 'on' : ''}`} href={href('p', p.id)}>
                <span className={`dot ${p.live && (p.metrics?.agents ?? 0) > 0 ? 'live' : ''}`} />
                {p.name}
              </a>
            ))}
          </nav>
        )}
        <nav className="nav">
          <div className="nav-title">Learn</div>
          <a className={`nav-item ${route[0] === 'docs' ? 'on' : ''}`} href="#/docs">
            Documentation
          </a>
        </nav>
        <div className="sidebar-foot">
          {api ? (
            <>
              <div className="conn" title={api.base}>
                <span className="dot live" /> {api.base.replace(/^https?:\/\//, '')}
                <small>{authMode === false ? 'dev mode · no auth' : authMode ? 'authenticated' : ''}</small>
              </div>
              <button className="btn sm ghost" onClick={signOut}>
                Disconnect
              </button>
            </>
          ) : (
            <a className="btn sm" href="#/">
              Connect to a server
            </a>
          )}
        </div>
      </aside>
      <main className="main">
        {route[0] === 'docs' ? (
          <DocsPage slug={route[1]} />
        ) : route[0] === 'p' && route[1] && api ? (
          <ProjectPage key={route[1]} api={api} projectId={route[1]} tab={route[2] ?? 'overview'} onChanged={refresh} />
        ) : api ? (
          <ProjectsPage api={api} projects={projects} onChanged={refresh} authMode={authMode} />
        ) : null}
      </main>
    </div>
  );
}
