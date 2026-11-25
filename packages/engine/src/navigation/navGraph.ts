import type { NavGraphDef, NavNode, Vec2 } from '@agent-world/protocol';

/** Waypoint graph with A* search. Pure: no three.js, fully testable. */
export class NavGraph {
  readonly nodes = new Map<string, NavNode>();
  private adj = new Map<string, string[]>();

  constructor(def: NavGraphDef) {
    for (const n of def.nodes) {
      this.nodes.set(n.id, n);
      this.adj.set(n.id, []);
    }
    for (const [a, b] of def.edges) {
      if (!this.nodes.has(a) || !this.nodes.has(b)) continue;
      this.adj.get(a)!.push(b);
      this.adj.get(b)!.push(a);
    }
  }

  get edges(): [NavNode, NavNode][] {
    const out: [NavNode, NavNode][] = [];
    for (const [a, list] of this.adj) for (const b of list) if (a < b) out.push([this.nodes.get(a)!, this.nodes.get(b)!]);
    return out;
  }

  nearest(p: Vec2): NavNode | undefined {
    let best: NavNode | undefined;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      const d = dist2(n.position, p);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** Nearest point on any edge (useful to step back onto the path network). */
  nearestOnEdges(p: Vec2): { point: Vec2; a: NavNode; b: NavNode } | undefined {
    let best: { point: Vec2; a: NavNode; b: NavNode } | undefined;
    let bestD = Infinity;
    for (const [a, b] of this.edges) {
      const q = closestOnSegment(p, a.position, b.position);
      const d = dist2(p, q);
      if (d < bestD) {
        bestD = d;
        best = { point: q, a, b };
      }
    }
    return best;
  }

  /** A* returning node ids from `from` to `to` inclusive, or [] if unreachable. */
  findPath(from: string, to: string): string[] {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return [];
    if (from === to) return [from];
    const goal = this.nodes.get(to)!.position;
    const g = new Map<string, number>([[from, 0]]);
    const f = new Map<string, number>([[from, Math.sqrt(dist2(this.nodes.get(from)!.position, goal))]]);
    const came = new Map<string, string>();
    const open = new Set([from]);
    while (open.size) {
      let cur = '';
      let curF = Infinity;
      for (const id of open) {
        const v = f.get(id) ?? Infinity;
        if (v < curF) {
          curF = v;
          cur = id;
        }
      }
      if (cur === to) {
        const path = [cur];
        while (came.has(cur)) {
          cur = came.get(cur)!;
          path.unshift(cur);
        }
        return path;
      }
      open.delete(cur);
      const cp = this.nodes.get(cur)!.position;
      for (const nb of this.adj.get(cur) ?? []) {
        const np = this.nodes.get(nb)!.position;
        const tentative = (g.get(cur) ?? Infinity) + Math.sqrt(dist2(cp, np));
        if (tentative < (g.get(nb) ?? Infinity)) {
          came.set(nb, cur);
          g.set(nb, tentative);
          f.set(nb, tentative + Math.sqrt(dist2(np, goal)));
          open.add(nb);
        }
      }
    }
    return [];
  }

  /**
   * Full route between arbitrary points: hop onto the network at the closest
   * edge point, follow A*, then step off to the target.
   */
  route(from: Vec2, to: Vec2, toNodeId?: string): Vec2[] {
    const start = this.nearestOnEdges(from);
    const endNode = toNodeId ? this.nodes.get(toNodeId) : this.nearest(to);
    if (!start || !endNode) return [to];
    // choose the entry endpoint giving the shorter total path
    const viaA = this.findPath(start.a.id, endNode.id);
    const viaB = this.findPath(start.b.id, endNode.id);
    const len = (ids: string[], first: Vec2) => {
      if (!ids.length) return Infinity;
      let l = Math.sqrt(dist2(first, this.nodes.get(ids[0]!)!.position));
      for (let i = 1; i < ids.length; i++) l += Math.sqrt(dist2(this.nodes.get(ids[i - 1]!)!.position, this.nodes.get(ids[i]!)!.position));
      return l;
    };
    const ids = len(viaA, start.point) <= len(viaB, start.point) ? viaA : viaB;
    const pts: Vec2[] = [];
    if (dist2(from, start.point) > 0.04) pts.push(start.point);
    for (const id of ids) pts.push(this.nodes.get(id)!.position);
    pts.push(to);
    return dedupe(pts);
  }

  nodesWithTag(tag: string): NavNode[] {
    return [...this.nodes.values()].filter((n) => n.tags?.includes(tag));
  }
}

export function dist2(a: Vec2, b: Vec2) {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return dx * dx + dz * dz;
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const l2 = abx * abx + abz * abz;
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
  return [a[0] + abx * t, a[1] + abz * t];
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2) {
  return Math.sqrt(dist2(p, closestOnSegment(p, a, b)));
}

function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || dist2(last, p) > 0.01) out.push(p);
  }
  return out;
}
