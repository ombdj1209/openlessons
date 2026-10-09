import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { edgeId, GraphScene } from './schema';
import type { z } from 'zod';
import { fonts, tokens } from './tokens';

// ponytail: ELK runs on the main thread. Fine for the ≤ ~40-node scenes lessons use;
// move to elk-worker.min.js if a big graph ever stalls the UI.
const elk = new ELK();

type Graph = z.output<typeof GraphScene>;
const M = 48; // margin around the laid-out graph
const snap = (n: number) => Math.ceil(n / 4) * 4;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Pt { x: number; y: number }

/** Orthogonal polyline with r=8 rounded elbows (diagram-design connector rule 1). */
export function roundedPath(pts: Pt[], r = 8): string {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const p1 = { x: b.x - ((b.x - a.x) / l1) * k, y: b.y - ((b.y - a.y) / l1) * k };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * k, y: b.y + ((c.y - b.y) / l2) * k };
    d += ` L${p1.x} ${p1.y} Q${b.x} ${b.y} ${p2.x} ${p2.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x} ${last.y}`;
}

/** Lays out a graph scene with ELK and draws it in the diagram-design skin. */
export async function graphSvg(scene: Graph, sceneNo = 1): Promise<string> {
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': scene.direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.spacing.edgeLabel': '8',
    },
    children: scene.nodes.map((n) => ({
      id: n.id,
      width: snap(Math.max(128, n.label.length * 8.6 + 40, (n.sub?.length ?? 0) * 7.4 + 40)),
      height: n.sub ? 64 : 48,
    })),
    edges: scene.edges.map((e) => ({
      id: edgeId(e),
      sources: [e.from],
      targets: [e.to],
      labels: e.label ? [{ text: e.label, width: e.label.length * 7 + 16, height: 16 }] : [],
    })),
  };
  const result = await elk.layout(input);

  // Room for the heading on top, then pad to 16:9 so the scene fills the stage.
  const HEAD = 112;
  let w = Math.max((result.width ?? 0) + 2 * M, 960), h = (result.height ?? 0) + 2 * M + HEAD;
  const ox = Math.max(0, (h * 16 / 9 - w) / 2), oy = Math.max(0, (w * 9 / 16 - h) / 2);
  w += 2 * ox; h += 2 * oy;
  const X = (x: number) => +(x + M + ox + (w - 2 * ox - (result.width ?? 0) - 2 * M) / 2).toFixed(1);
  const Y = (y: number) => +(y + M + HEAD + oy).toFixed(1);

  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const edgeMeta = new Map(scene.edges.map((e) => [edgeId(e), e]));

  const edges = (result.edges ?? []).map((e) => {
    const meta = edgeMeta.get(e.id)!;
    const s = e.sections?.[0];
    if (!s) return '';
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: X(p.x), y: Y(p.y) }));
    const label = e.labels?.[0];
    const labelSvg = label && meta.label ? `
    <rect x="${X(label.x!)}" y="${Y(label.y!)}" width="${label.width}" height="${label.height}" fill="${tokens.paper}"/>
    <text x="${X(label.x!) + label.width! / 2}" y="${Y(label.y!) + 12}" text-anchor="middle" font-family="${fonts.mono}" font-size="10" letter-spacing="0.08em" fill="${tokens.muted}">${esc(meta.label.toUpperCase())}</text>` : '';
    return `<g id="${esc(e.id)}-group"><path id="${esc(e.id)}" d="${roundedPath(pts)}" fill="none" stroke="${tokens.muted}" stroke-width="1.25"${meta.dashed ? ' stroke-dasharray="5,4"' : ''} marker-end="url(#arrow)"/>${labelSvg}</g>`;
  }).join('\n  ');

  const nodes = (result.children ?? []).map((c) => {
    const n = byId.get(c.id)!;
    const x = X(c.x!), y = Y(c.y!), cw = c.width!, ch = c.height!;
    const fill = n.accent ? tokens.accentTint : tokens.white, stroke = n.accent ? tokens.accent : tokens.ink;
    const nameY = n.sub ? y + 27 : y + ch / 2 + 5;
    return `<g id="${esc(n.id)}">
    <rect data-mask="" x="${x}" y="${y}" width="${cw}" height="${ch}" rx="6" fill="${tokens.paper}"/>
    <rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="6" fill="${fill}" stroke="${stroke}"/>
    <text id="${esc(n.id)}-name" x="${x + cw / 2}" y="${nameY}" text-anchor="middle" font-family="${fonts.sans}" font-weight="600" font-size="14" fill="${tokens.ink}">${esc(n.label)}</text>${n.sub ? `
    <text id="${esc(n.id)}-sub" x="${x + cw / 2}" y="${y + 47}" text-anchor="middle" font-family="${fonts.mono}" font-size="11" fill="${tokens.muted}">${esc(n.sub)}</text>` : ''}
  </g>`;
  }).join('\n  ');

  const title = esc(scene.title ?? scene.id);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${snap(w)} ${snap(h)}" role="img" aria-labelledby="t">
  <title id="t">${title}</title>
  <defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${tokens.muted}"/></marker></defs>
  <rect data-bg="" width="${snap(w)}" height="${snap(h)}" fill="${tokens.paper}"/>
  <text x="${M + 24}" y="${M + 24}" font-family="${fonts.mono}" font-size="12" letter-spacing="2" fill="${tokens.muted}">SCENE ${sceneNo}</text>
  <text x="${M + 24}" y="${M + 64}" font-family="${fonts.serif}" font-size="36" fill="${tokens.ink}">${title}</text>
  ${edges}
  ${nodes}
</svg>`;
}
