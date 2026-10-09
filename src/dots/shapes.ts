import type { DotItem } from './schema';

/**
 * One target point: position, radius, alpha, accent (0/1), owning item (-1 = none),
 * and whether it is interior fill (fill yields to outlines and is thinned first).
 */
export interface Pt { x: number; y: number; r: number; a: number; c: number; o: number; f: boolean }
type XY = [number, number];
const TAU = Math.PI * 2;

/** Points every `d` along a polyline, measured by length (so curves get even spacing). */
function resample(pts: XY[], d: number): XY[] {
  const out: XY[] = [pts[0]];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (!seg) continue;
    let s = d - carry;
    while (s <= seg) { const f = s / seg; out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]); s += d; }
    carry = seg - (s - d);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > d * .5) out.push(last);
  return out;
}
/** A straight run with dots spaced as evenly as its length allows, ends included. */
export const line = (x1: number, y1: number, x2: number, y2: number, d: number): XY[] => {
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / d));
  return Array.from({ length: n + 1 }, (_, k) => [x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n]);
};
/** An elliptical arc with dots evenly spaced along its length (flat ellipses included). */
export const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, d: number): XY[] => {
  const M = 360, fine: XY[] = [];
  for (let k = 0; k <= M; k++) { const t = a0 + (a1 - a0) * k / M; fine.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
  // Closed curves: even spacing all the way round, so the seam doesn't double up.
  if (Math.abs(Math.abs(a1 - a0) - TAU) < 1e-6) {
    const L = fine.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - fine[i][0], p[1] - fine[i][1]), 0);
    const n = Math.max(3, Math.round(L / d));
    return resample(fine, L / n).slice(0, n);
  }
  const L = fine.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - fine[i][0], p[1] - fine[i][1]), 0);
  return resample(fine, L / Math.max(1, Math.round(L / d)));
};
/** Rounded rectangle traced as one continuous path, evenly spaced. */
export const rrect = (x0: number, y0: number, w: number, h: number, q: number, d: number): XY[] => {
  q = Math.min(q, w / 2, h / 2);
  // One closed loop: top edge, corners and sides in order, ending back at the start.
  const loop: XY[] = [[x0 + q, y0]];
  const corner = (cx: number, cy: number, a0: number) => { for (let k = 0; k <= 12; k++) { const t = a0 + (Math.PI / 2) * k / 12; loop.push([cx + q * Math.cos(t), cy + q * Math.sin(t)]); } };
  corner(x0 + w - q, y0 + q, -Math.PI / 2); corner(x0 + w - q, y0 + h - q, 0);
  corner(x0 + q, y0 + h - q, Math.PI / 2); corner(x0 + q, y0 + q, Math.PI);
  const L = loop.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - loop[i][0], p[1] - loop[i][1]), 0);
  const n = Math.max(4, Math.round(L / d));
  return resample(loop, L / n).slice(0, n);
};
export const fill = (x0: number, y0: number, w: number, h: number, d: number, inside: (x: number, y: number) => boolean = () => true): XY[] => {
  const out: XY[] = [];
  const nx = Math.max(1, Math.floor(w / d)), ny = Math.max(1, Math.floor(h / d));
  const sx = w / nx, sy = h / ny; // centre the grid in the area so edges look even
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + sx * (i + .5), y = y0 + sy * (j + .5);
    if (inside(x, y)) out.push([x, y]);
  }
  return out;
};
const polyline = (pts: XY[], d: number): XY[] => resample(pts, d);

/** Crisp text a shape places on itself (array values, map keys), drawn by the engine, not with dots. */
export interface Ann { text: string; x: number; y: number; size: number; accent?: boolean; alpha?: number }

/** Styling context for one item: spacing, owner, whether it's accented, and where its text goes. */
interface Pen { d: number; o: number; accent: boolean; fail: boolean; texts: Ann[] }
type Paint = (pts: XY[], r?: number, a?: number, c?: number) => Pt[];
// Colour channel: 0 ink, 1 accent, 2 failure (red).
const tint = (pen: Pen, c: number) => (pen.fail ? 2 : pen.accent ? 1 : c);
const painters = (pen: Pen): [Paint, Paint] => [
  (pts, r = 2.2, a = .95, c = 0) => pts.map(([x, y]) => ({ x, y, r, a, c: tint(pen, c), o: pen.o, f: false })),
  (pts, r = 1.4, a = .4, c = 0) => pts.map(([x, y]) => ({ x, y, r, a, c: tint(pen, c), o: pen.o, f: true })),
];

type ShapeFn = (it: DotItem, pen: Pen) => Pt[];

const shapes: Record<DotItem['shape'], ShapeFn> = {
  laptop(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    return [
      ...S(rrect(cx - 120 * s, cy - 92 * s, 240 * s, 142 * s, 10 * s, d)),
      ...S(polyline([[cx - 120 * s, cy + 50 * s], [cx - 156 * s, cy + 76 * s], [cx + 156 * s, cy + 76 * s], [cx + 120 * s, cy + 50 * s]], d)),
      ...F(fill(cx - 108 * s, cy - 80 * s, 216 * s, 118 * s, d * 1.9)),
    ];
  },
  phone(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    return [
      ...S(rrect(cx - 56 * s, cy - 100 * s, 112 * s, 200 * s, 16 * s, d)),
      ...S(line(cx - 16 * s, cy + 84 * s, cx + 16 * s, cy + 84 * s, d * .8), 1.8, .8),
      ...F(fill(cx - 46 * s, cy - 86 * s, 92 * s, 156 * s, d * 1.9)),
    ];
  },
  server(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const out: Pt[] = [];
    for (const dy of [-100, -28, 44]) {
      const top = cy + dy * s, mid = top + 28 * s;
      out.push(...S(rrect(cx - 110 * s, top, 220 * s, 56 * s, 8 * s, d)));
      out.push(...S([[cx - 84 * s, mid], [cx - 64 * s, mid]], 3.4, 1, 1));
      out.push(...F(fill(cx - 4 * s, top + 12 * s, 96 * s, 32 * s, d * 1.6), 1.4, .45));
    }
    return out;
  },
  database(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const rx = 110 * s, ry = 28 * s, top = cy - 90 * s, h = 180 * s;
    // Body shading keeps clear of the three front rims.
    const nearRim = (x: number, y: number) => [top + h / 3, top + 2 * h / 3, top + h].some((ly) => {
      const yy = ly + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
      return Math.abs(y - yy) < d * 1.2;
    });
    return [
      ...S(arc(cx, top, rx, ry, 0, TAU, d)),
      ...S(line(cx - rx, top, cx - rx, top + h, d)), ...S(line(cx + rx, top, cx + rx, top + h, d)),
      ...S(arc(cx, top + h / 3, rx, ry, 0, Math.PI, d)), ...S(arc(cx, top + 2 * h / 3, rx, ry, 0, Math.PI, d)),
      ...S(arc(cx, top + h, rx, ry, 0, Math.PI, d)),
      ...F(fill(cx - rx, top - ry, 2 * rx, 2 * ry, d * 1.4, (x, y) => ((x - cx) / rx) ** 2 + ((y - top) / ry) ** 2 < .62), 1.5, .45),
      ...F(fill(cx - rx, top + ry, 2 * rx, h, d * 2.2, (x, y) => Math.abs(x - cx) < rx - d * 1.2 && !nearRim(x, y)), 1.2, .22),
    ];
  },
  user(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    return [
      ...S(arc(cx, cy - 46 * s, 30 * s, 30 * s, 0, TAU, d)),
      ...S(arc(cx, cy + 62 * s, 66 * s, 58 * s, Math.PI, TAU, d)),
      ...S(line(cx - 66 * s, cy + 62 * s, cx + 66 * s, cy + 62 * s, d)),
      ...F(fill(cx - 30 * s, cy - 76 * s, 60 * s, 60 * s, d * 1.6, (x, y) => (x - cx) ** 2 + (y - cy + 46 * s) ** 2 < (20 * s) ** 2), 1.5, .45),
    ];
  },
  cloud(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const lobes: [number, number, number][] = [[-70, 6, 40], [-18, -22, 56], [58, 2, 44]];
    const inLobe = (x: number, y: number, pad: number) => lobes.some(([lx, ly, r]) => (x - cx - lx * s) ** 2 + (y - cy - ly * s) ** 2 < (r * s - pad) ** 2);
    return [
      ...S(arc(cx - 70 * s, cy + 6 * s, 40 * s, 40 * s, Math.PI / 2, 1.5 * Math.PI, d)),
      ...S(arc(cx - 18 * s, cy - 22 * s, 56 * s, 56 * s, Math.PI * 1.08, Math.PI * 1.92, d)),
      ...S(arc(cx + 58 * s, cy + 2 * s, 44 * s, 44 * s, Math.PI * 1.35, Math.PI * 2.5, d)),
      ...S(line(cx - 70 * s, cy + 46 * s, cx + 58 * s, cy + 46 * s, d)),
      ...F(fill(cx - 100 * s, cy - 80 * s, 200 * s, 120 * s, d * 2, (x, y) => y < cy + 46 * s - d && (inLobe(x, y, d) || (y > cy && x > cx - 70 * s && x < cx + 58 * s))), 1.3, .3),
    ];
  },
  lock(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    return [
      ...S(arc(cx, cy - 34 * s, 38 * s, 44 * s, Math.PI, TAU, d)),
      ...S(line(cx - 38 * s, cy - 34 * s, cx - 38 * s, cy - 4 * s, d)), ...S(line(cx + 38 * s, cy - 34 * s, cx + 38 * s, cy - 4 * s, d)),
      ...S(rrect(cx - 64 * s, cy - 4 * s, 128 * s, 96 * s, 10 * s, d)),
      ...S(arc(cx, cy + 40 * s, 10 * s, 10 * s, 0, TAU, Math.min(d, 7)), 2.4, 1, 1),
      ...F(fill(cx - 58 * s, cy + 2 * s, 116 * s, 84 * s, d * 1.8, (x, y) => (x - cx) ** 2 + (y - cy - 40 * s) ** 2 > (16 * s) ** 2), 1.4, .35),
    ];
  },
  globe(it, pen) {
    const [S] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!, R = 84 * s;
    return [
      ...S(arc(cx, cy, R, R, 0, TAU, d)),
      ...S(arc(cx, cy, R * .42, R, 0, TAU, d * 1.1), 1.8, .7),
      ...S(line(cx - R, cy, cx + R, cy, d * 1.1), 1.8, .7),
      ...S(arc(cx, cy - R * .5, R * .86, R * .16, 0, TAU, d * 1.25), 1.5, .5),
      ...S(arc(cx, cy + R * .5, R * .86, R * .16, 0, TAU, d * 1.25), 1.5, .5),
    ];
  },
  queue(it, pen) {
    const [S] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const n = it.slots ?? 5, filled = Math.min(n, it.filled ?? 3), sw = 48 * s, g = 10 * s;
    const w = n * sw + (n - 1) * g + 32 * s, h = 76 * s, x0 = cx - w / 2;
    const out = [...S(rrect(x0, cy - h / 2, w, h, 10 * s, d))];
    for (let k = 0; k < n; k++) {
      const sx = x0 + 16 * s + k * (sw + g), on = k >= n - filled;
      out.push(...(on ? S(fill(sx, cy - 22 * s, sw, 44 * s, d), 2, .9) : S(rrect(sx, cy - 22 * s, sw, 44 * s, 4 * s, d * 1.3), 1.4, .4)));
    }
    return out;
  },
  table(it, pen) {
    const [S] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const cols = it.cols ?? 5, rows = it.rows ?? 8, lit = it.lit ?? -1, cw = 92 * s, ch = 30 * s, g = 10 * s;
    const x0 = cx - (cols * cw + (cols - 1) * g) / 2, y0 = cy - (rows * ch + (rows - 1) * g) / 2;
    const out: Pt[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const head = r === 0, hot = r === lit;
      out.push(...S(fill(x0 + c * (cw + g), y0 + r * (ch + g) + 4 * s, cw, ch - 8 * s, d), head ? 2.3 : 1.7, head || hot ? 1 : .55, hot ? 1 : 0));
    }
    return out;
  },
  tree(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!, hot = it.hot ?? true;
    const out: Pt[] = [];
    const node = (nx: number, ny: number, h: boolean) => {
      out.push(...S(rrect(nx - 52 * s, ny - 16 * s, 104 * s, 32 * s, 8 * s, d), 2.1, h ? 1 : .9, h ? 1 : 0));
      out.push(...F(line(nx - 34 * s, ny, nx + 34 * s, ny, d * 1.5), 1.4, .45, h ? 1 : 0));
    };
    const edge = (x1: number, y1: number, x2: number, y2: number, h: boolean) =>
      out.push(...S(line(x1, y1 + 20 * s, x2, y2 - 20 * s, d * 1.1), 1.6, h ? 1 : .5, h ? 1 : 0));
    const rootY = cy - 190 * s, l1Y = cy - 60 * s, l2Y = cy + 70 * s, rowY = cy + 190 * s;
    node(cx, rootY, hot);
    [-360, 0, 360].forEach((dx, i) => {
      const h1 = hot && i === 1;
      edge(cx, rootY, cx + dx * s, l1Y, h1); node(cx + dx * s, l1Y, h1);
      [-118, 0, 118].forEach((dx2, j) => {
        const h2 = h1 && j === 2, nx = cx + (dx + dx2) * s;
        edge(cx + dx * s, l1Y, nx, l2Y, h2); node(nx, l2Y, h2);
        if (h2) out.push(...S(line(nx, l2Y + 20 * s, nx, rowY - 14 * s, d), 1.7, 1, 1));
      });
    });
    out.push(...S(line(cx - 520 * s, rowY, cx + 520 * s, rowY, d * 1.2), 1.6, .4));
    if (hot) out.push(...S(line(cx + 70 * s, rowY, cx + 170 * s, rowY, d * .8), 2.8, 1, 1));
    return out;
  },
  box(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const w = (it.w ?? 200) * s, h = (it.h ?? 100) * s;
    if (it.text) pen.texts.push({ text: it.text, x: cx, y: cy + Math.min(h * .4, 22 * s) * .36, size: Math.min(h * .4, 22 * s), accent: it.accent });
    // Faint, sparse fill so text laid over a box (code, token values) stays readable.
    return [...S(rrect(cx - w / 2, cy - h / 2, w, h, Math.min(12 * s, h / 3), d)), ...F(fill(cx - w / 2 + 10, cy - h / 2 + 10, w - 20, h - 20, d * 2.8), 1.1, .16)];
  },
  circle(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!, R = (it.r ?? 60) * s;
    // A value inside (a linked-list node, a set member): crisp text, so the fill stays light.
    if (it.text) {
      pen.texts.push({ text: it.text, x: cx, y: cy + R * .2, size: R * .58, accent: it.accent });
      return S(arc(cx, cy, R, R, 0, TAU, d));
    }
    return [...S(arc(cx, cy, R, R, 0, TAU, d)), ...F(fill(cx - R, cy - R, 2 * R, 2 * R, d * 1.8, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < (R - d * 1.2) ** 2), 1.3, .35)];
  },
  text(it, pen) {
    const [S] = painters(pen), [cx, cy] = it.at!;
    return S(textPoints(it.text!, (it.size ?? 96) * it.scale, cx, cy, Math.max(4, pen.d * .8)), 2, .95);
  },
  array(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const vals = it.values ?? [], n = vals.length, cw = 84 * s, g = 14 * s, hi = new Set(it.hi ?? []), dim = new Set(it.dim ?? []);
    const x0 = cx - (n * cw + (n - 1) * g) / 2, top = cy - cw / 2;
    const out: Pt[] = [];
    vals.forEach((v, k) => {
      const x = x0 + k * (cw + g), on = hi.has(k), off = dim.has(k) && !on;
      out.push(...S(rrect(x, top, cw, cw, 8 * s, d), on ? 2.4 : off ? 1.5 : 2.1, on ? 1 : off ? .22 : .9, on ? 1 : 0));
      if (on) out.push(...F(fill(x + 8, top + 8, cw - 16, cw - 16, d * 1.9), 1.3, .28, 1));
      pen.texts.push({ text: String(v), x: x + cw / 2, y: cy + 10 * s, size: 28 * s, accent: on, alpha: off ? .25 : undefined });
      pen.texts.push({ text: String(k), x: x + cw / 2, y: top + cw + 24 * s, size: 12 * s, alpha: off ? .15 : .45 });
    });
    for (const m of it.marks ?? []) {
      const mx = x0 + m.i * (cw + g) + cw / 2, y1 = top + cw + 40 * s, y2 = y1 + 34 * s;
      out.push(...S(line(mx, y2, mx, y1, Math.min(d, 8)), 2, 1, 1));
      out.push(...S([...line(mx, y1, mx - 9, y1 + 10, 6), ...line(mx, y1, mx + 9, y1 + 10, 6)], 2, 1, 1));
      pen.texts.push({ text: m.text, x: mx, y: y2 + 24 * s, size: 15 * s, accent: true });
    }
    return out;
  },
  map(it, pen) {
    const [S] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const entries = it.entries ?? [], rows = Math.max(entries.length, it.slots ?? entries.length, 1);
    const kw = 112 * s, rh = 52 * s, g = 10 * s, hi = new Set(it.hi ?? []);
    const x0 = cx - (2 * kw + g) / 2, y0 = cy - (rows * rh + (rows - 1) * g) / 2 + 18 * s;
    const [hk, hv] = it.head ?? ['VALUE', 'INDEX'];
    pen.texts.push({ text: hk, x: x0 + kw / 2, y: y0 - 18 * s, size: 11 * s, alpha: .5 });
    pen.texts.push({ text: hv, x: x0 + kw * 1.5 + g, y: y0 - 18 * s, size: 11 * s, alpha: .5 });
    const out: Pt[] = [];
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * (rh + g), e = entries[r], on = hi.has(r);
      for (const col of [0, 1]) {
        const x = x0 + col * (kw + g);
        out.push(...(e ? S(rrect(x, y, kw, rh, 6 * s, d), on ? 2.3 : 2, on ? 1 : .9, on ? 1 : 0) : S(rrect(x, y, kw, rh, 6 * s, d * 1.5), 1.3, .3)));
        if (e) pen.texts.push({ text: String(e[col]), x: x + kw / 2, y: y + rh / 2 + 8 * s, size: 22 * s, accent: on });
      }
    }
    return out;
  },
  bars(it, pen) {
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const vals = (it.values ?? []).map(Number), n = vals.length, bw = 56 * s, g = 22 * s, H = (it.h ?? 300) * s;
    const unit = H / Math.max(1, ...vals), base = cy + H / 2, x0 = cx - (n * bw + (n - 1) * g) / 2;
    const mid = (k: number) => x0 + k * (bw + g) + bw / 2, hi = new Set(it.hi ?? []), dim = new Set(it.dim ?? []);
    const out: Pt[] = [...S(line(x0 - 20 * s, base, x0 + n * (bw + g) - g + 20 * s, base, d * 1.2), 1.6, .4)];
    if (it.span) {
      // The water a pair of walls holds: as wide as the gap, as high as the shorter wall.
      const [i, j] = [Math.min(...it.span), Math.max(...it.span)], top = base - Math.min(vals[i], vals[j]) * unit;
      out.push(...F(fill(mid(i), top, mid(j) - mid(i), base - top, d * 1.5), 1.5, .45, 1));
      out.push(...S(line(mid(i), top, mid(j), top, d), 2, 1, 1));
    }
    vals.forEach((v, k) => {
      const x = mid(k) - bw / 2, h = Math.max(v * unit, 6 * s), on = hi.has(k), off = dim.has(k) && !on;
      out.push(...S(rrect(x, base - h, bw, h, 6 * s, d), on ? 2.4 : off ? 1.5 : 2.1, on ? 1 : off ? .22 : .9, on ? 1 : 0));
      if (on) out.push(...F(fill(x + 8, base - h + 8, bw - 16, h - 16, d * 1.9), 1.3, .28, 1));
      pen.texts.push({ text: String(it.values![k]), x: mid(k), y: base - h - 12 * s, size: 22 * s, accent: on, alpha: off ? .25 : undefined });
      pen.texts.push({ text: String(k), x: mid(k), y: base + 26 * s, size: 12 * s, alpha: off ? .15 : .45 });
    });
    for (const m of it.marks ?? []) {
      const mx = mid(m.i), y1 = base + 40 * s, y2 = y1 + 34 * s;
      out.push(...S(line(mx, y2, mx, y1, Math.min(d, 8)), 2, 1, 1));
      out.push(...S([...line(mx, y1, mx - 9, y1 + 10, 6), ...line(mx, y1, mx + 9, y1 + 10, 6)], 2, 1, 1));
      pen.texts.push({ text: m.text, x: mx, y: y2 + 24 * s, size: 15 * s, accent: true });
    }
    return out;
  },
  intervals(it, pen) {
    // Ranges on a number line, one lane each, so overlaps are easy to see.
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const ivs = (it.entries ?? []).map(([a, b]) => [Number(a), Number(b)]), n = ivs.length;
    const lo = Math.min(...ivs.map((v) => v[0])), top = Math.max(...ivs.map((v) => v[1])), W = (it.w ?? 1000) * s;
    const px = W / Math.max(1, top - lo), X = (v: number) => cx - W / 2 + (v - lo) * px;
    const lane = 50 * s, bh = 32 * s, y0 = cy - (n * lane) / 2, axis = y0 + n * lane + 14 * s;
    const hi = new Set(it.hi ?? []), dim = new Set(it.dim ?? []);
    const out: Pt[] = [...S(line(X(lo) - 20 * s, axis, X(top) + 20 * s, axis, d * 1.2), 1.6, .4)];
    const step = Math.max(1, Math.ceil((top - lo) / 10));
    for (let v = lo; v <= top; v += step) {
      out.push(...S(line(X(v), axis - 6 * s, X(v), axis + 6 * s, 5), 1.4, .4));
      pen.texts.push({ text: String(v), x: X(v), y: axis + 28 * s, size: 13 * s, alpha: .5 });
    }
    ivs.forEach(([a, b], k) => {
      const x = X(a), w = Math.max(X(b) - x, 14 * s), y = y0 + k * lane, on = hi.has(k), off = dim.has(k) && !on;
      out.push(...S(rrect(x, y, w, bh, 6 * s, d), on ? 2.4 : off ? 1.5 : 2.1, on ? 1 : off ? .22 : .9, on ? 1 : 0));
      if (on) out.push(...F(fill(x + 6, y + 6, w - 12, bh - 12, d * 1.9), 1.3, .28, 1));
      pen.texts.push({ text: `[${a}, ${b}]`, x: x + w + 40 * s, y: y + bh / 2 + 6 * s, size: 16 * s, accent: on, alpha: off ? .25 : undefined });
    });
    return out;
  },
  grid(it, pen) {
    // Map cells (geohash, quadtree leaves): hi lights a cell, values label them row by row.
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const rows = it.rows ?? 4, cols = it.cols ?? 4, c = (it.size ?? 96) * s, g = 8 * s;
    const x0 = cx - (cols * c + (cols - 1) * g) / 2, y0 = cy - (rows * c + (rows - 1) * g) / 2;
    const hi = new Set(it.hi ?? []), dim = new Set(it.dim ?? []), out: Pt[] = [];
    for (let k = 0; k < rows * cols; k++) {
      const x = x0 + (k % cols) * (c + g), y = y0 + Math.floor(k / cols) * (c + g), on = hi.has(k), off = dim.has(k) && !on;
      out.push(...S(rrect(x, y, c, c, 6 * s, d), on ? 2.3 : 1.7, on ? 1 : off ? .2 : .6, on ? 1 : 0));
      if (on) out.push(...F(fill(x + 8, y + 8, c - 16, c - 16, d * 1.9), 1.3, .3, 1));
      const v = it.values?.[k];
      if (v !== undefined && v !== '') pen.texts.push({ text: String(v), x: x + c / 2, y: y + c / 2 + 7 * s, size: 18 * s, accent: on, alpha: off ? .25 : undefined });
    }
    return out;
  },
  bucket(it, pen) {
    // A bucket of tokens: `slots` is how many it can hold, `filled` how many are in it now.
    const [S, F] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const top = cy - 100 * s, bot = cy + 100 * s, tw = 120 * s, bw = 92 * s;
    const out = [...S(polyline([[cx - tw, top], [cx - bw, bot], [cx + bw, bot], [cx + tw, top]], d))];
    out.push(...S(arc(cx, top, tw, 14 * s, 0, TAU, d * 1.2), 1.5, .45));
    const cap = it.slots ?? 8, n = Math.min(cap, it.filled ?? cap), per = 4, R = 17 * s, gap = 44 * s;
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / per), inRow = Math.min(per, n - row * per), col = k % per;
      const x = cx + (col - (inRow - 1) / 2) * gap, y = bot - 28 * s - row * 40 * s;
      out.push(...S(arc(x, y, R, R, 0, TAU, Math.min(d, 9)), 2.2, 1, 1));
      out.push(...F(fill(x - R, y - R, 2 * R, 2 * R, d * 1.4, (px, py) => (px - x) ** 2 + (py - y) ** 2 < (R * .6) ** 2), 1.5, .7, 1));
    }
    return out;
  },
  doc(it, pen) {
    // A page with a folded corner and lines of text; `rows` lines, `hi` lights some of them.
    const [S] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const w = (it.w ?? 130) * s, h = (it.h ?? 170) * s, x0 = cx - w / 2, y0 = cy - h / 2, f = 30 * s;
    const out = [...S(polyline([[x0, y0], [x0 + w - f, y0], [x0 + w, y0 + f], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]], d))];
    out.push(...S(polyline([[x0 + w - f, y0], [x0 + w - f, y0 + f], [x0 + w, y0 + f]], d), 1.6, .6));
    const rows = it.rows ?? 5, hi = new Set(it.hi ?? []), len = [.78, .6, .78, .45, .7, .55, .78, .5];
    const top = y0 + f + 18 * s, gap = (h - f - 36 * s) / Math.max(1, rows - 1);
    for (let k = 0; k < rows; k++) {
      const on = hi.has(k), y = top + k * gap;
      out.push(...S(line(x0 + 12 * s, y, x0 + 12 * s + (w - 24 * s) * len[k % 8], y, d * 1.1), on ? 2.2 : 1.6, on ? 1 : .55, on ? 1 : 0));
    }
    return out;
  },
  space(it, pen) {
    // A map of points: embeddings, where nearness means similar meaning. `hi` = found, `bad` = wrong, `dim` = ruled out.
    const [S] = painters(pen), d = pen.d, s = it.scale, [cx, cy] = it.at!;
    const w = (it.w ?? 380) * s, h = (it.h ?? 260) * s, x0 = cx - w / 2, y0 = cy - h / 2;
    const at = ([a, b]: XY): XY => [x0 + a / 100 * w, y0 + b / 100 * h];
    const hi = new Set(it.hi ?? []), dim = new Set(it.dim ?? []), bad = new Set(it.bad ?? []);
    const out: Pt[] = [...S(rrect(x0, y0, w, h, 10 * s, d * 1.4), 1.5, .35)];
    (it.pts ?? []).forEach((p, k) => {
      const [x, y] = at(p), on = hi.has(k), no = bad.has(k), off = dim.has(k) && !on && !no;
      out.push(...S([[x, y]], on || no ? 5.4 : 3.4, on || no ? 1 : off ? .22 : .8, no ? 2 : on ? 1 : 0));
      if (on || no) out.push(...S(arc(x, y, 11 * s, 11 * s, 0, TAU, d * 1.1), 1.5, .75, no ? 2 : 1));
    });
    for (const m of it.marks ?? []) {
      const [x, y] = at(it.pts![m.i]);
      pen.texts.push({ text: m.text, x, y: y - 20 * s, size: 14 * s, accent: true });
    }
    (it.queries ?? []).forEach((q, k) => {
      const [x, y] = at(q), R = 10 * s;
      out.push(...S(arc(x, y, R, R, 0, TAU, d * .9), 2.4, 1, 1));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push(...S(line(x + dx * R * 1.3, y + dy * R * 1.3, x + dx * R * 2.1, y + dy * R * 2.1, d * .8), 2, 1, 1));
      if (k === 0 && it.r) out.push(...S(arc(x, y, it.r * s, it.r * s, 0, TAU, d * 1.2), 1.4, .5, 1));
    });
    return out;
  },
  pipe(it, pen) {
    const [S] = painters(pen), d = pen.d, path = it.path!;
    const out = S(polyline(path, d * 1.3), 1.3, .35);
    if (it.arrow) {
      const [p, q] = [path[path.length - 2], path[path.length - 1]];
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), L = 14;
      for (const da of [2.6, -2.6]) out.push(...S(line(q[0], q[1], q[0] + L * Math.cos(ang + da), q[1] + L * Math.sin(ang + da), 6), 1.6, .7));
    }
    return out;
  },
};

/** Text drawn with dots: rasterise once, sample filled pixels on a grid of spacing d. */
const textCache = new Map<string, { img: ImageData; w: number; h: number }>();
function textPoints(str: string, size: number, cx: number, cy: number, d: number): XY[] {
  const key = `${str}|${size}`;
  let t = textCache.get(key);
  if (!t) {
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true })!;
    const font = `700 ${size}px Inter, system-ui, sans-serif`;
    // "\n" starts a new line; lines are centred, so a question can wrap across the stage.
    const lines = str.split('\n'), lh = size * 1.18;
    g.font = font;
    const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 8, h = Math.ceil(lh * lines.length + size * .1);
    c.width = w; c.height = h;
    g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff';
    lines.forEach((l, i) => g.fillText(l, w / 2, lh * (i + .5) + size * .05));
    t = { img: g.getImageData(0, 0, w, h), w, h };
    textCache.set(key, t);
  }
  const out: XY[] = [];
  for (let y = d / 2; y < t.h; y += d) for (let x = d / 2; x < t.w; x += d) {
    if (t.img.data[(Math.floor(y) * t.w + Math.floor(x)) * 4 + 3] > 140) out.push([cx - t.w / 2 + x, cy - t.h / 2 + y]);
  }
  return out;
}

/**
 * Removes crowding: outline points closer than 0.6·d to a kept one are dropped (joints
 * where lines meet), and fill points keep 0.9·d clear of everything, so shading never
 * sits on a line.
 */
function tidy(pts: Pt[], d: number): Pt[] {
  const cell = d * .9, grid = new Map<string, Pt[]>(), out: Pt[] = [];
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const near = (p: Pt, min: number) => {
    const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const q of grid.get(`${gx + i},${gy + j}`) ?? []) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < min * min) return true;
    }
    return false;
  };
  for (const p of [...pts.filter((q) => !q.f), ...pts.filter((q) => q.f)]) {
    if (near(p, p.f ? d * .9 : d * .6)) continue;
    out.push(p);
    const k = key(p.x, p.y);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(p);
  }
  return out;
}

export function itemPoints(it: DotItem, d: number, o: number, texts: Ann[] = []): Pt[] {
  return tidy(shapes[it.shape](it, { d, o, accent: !!it.accent, fail: !!it.fail, texts }), d);
}
