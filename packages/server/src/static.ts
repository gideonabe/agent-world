import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves a built single-page app (the dashboard). Unknown paths fall back to
 * index.html so client-side routes work. Never serves files outside `root`.
 */
export function createStaticHandler(root: string) {
  const base = path.resolve(root);
  const index = path.join(base, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`No index.html in ${base}`);

  return (req: IncomingMessage, res: ServerResponse, pathname: string): boolean => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    const file = path.resolve(base, `.${rel}`);
    if (file !== base && !file.startsWith(base + path.sep)) return false; // traversal attempt
    let target = file;
    try {
      if (!fs.statSync(target).isFile()) target = index;
    } catch {
      // missing asset (has an extension) → 404; client route → app shell
      if (path.extname(rel)) return false;
      target = index;
    }
    const type = TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
    const immutable = /[.-][A-Za-z0-9_-]{8,}\.(js|css)$/.test(target); // hashed build assets
    res.writeHead(200, {
      'content-type': type,
      'cache-control': target === index ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') return void res.end(), true;
    fs.createReadStream(target).pipe(res);
    return true;
  };
}
