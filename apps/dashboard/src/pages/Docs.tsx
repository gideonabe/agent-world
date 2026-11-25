import { useMemo } from 'react';
import { marked } from 'marked';
import { href } from '../router';
import gettingStarted from '../../../../docs/getting-started.md?raw';
import concepts from '../../../../docs/concepts.md?raw';
import events from '../../../../docs/events.md?raw';
import embedding from '../../../../docs/embedding.md?raw';
import customization from '../../../../docs/customization.md?raw';
import architecture from '../../../../docs/ARCHITECTURE.md?raw';
import sdk from '../../../../packages/sdk/README.md?raw';
import server from '../../../../packages/server/README.md?raw';
import claudeCode from '../../../../integrations/claude-code/README.md?raw';

/** One source of truth: the markdown files in the repo, rendered here. */
export const DOCS: { slug: string; title: string; group: string; body: string }[] = [
  { slug: 'getting-started', title: 'Getting started', group: 'Start here', body: gettingStarted },
  { slug: 'concepts', title: 'Core concepts', group: 'Start here', body: concepts },
  { slug: 'events', title: 'Event reference', group: 'Integrate', body: events },
  { slug: 'sdk', title: 'SDK', group: 'Integrate', body: sdk },
  { slug: 'embedding', title: 'Embedding the world', group: 'Integrate', body: embedding },
  { slug: 'claude-code', title: 'Claude Code', group: 'Integrate', body: claudeCode },
  { slug: 'server', title: 'Server, projects & keys', group: 'Operate', body: server },
  { slug: 'customization', title: 'Worlds & themes', group: 'Operate', body: customization },
  { slug: 'architecture', title: 'Architecture', group: 'Reference', body: architecture },
];

marked.setOptions({ gfm: true });

export function DocsPage({ slug }: { slug?: string }) {
  const doc = DOCS.find((d) => d.slug === slug) ?? DOCS[0]!;
  // Our own repo files only, so rendering their HTML is safe.
  const html = useMemo(() => marked.parse(doc.body, { async: false }), [doc]);
  const groups = [...new Set(DOCS.map((d) => d.group))];
  return (
    <div className="docs">
      <nav className="docs-nav">
        {groups.map((g) => (
          <div key={g}>
            <div className="nav-title">{g}</div>
            {DOCS.filter((d) => d.group === g).map((d) => (
              <a key={d.slug} className={`nav-item ${d.slug === doc.slug ? 'on' : ''}`} href={href('docs', d.slug)}>
                {d.title}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
