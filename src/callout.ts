/**
 * Where a caption card goes, and the arrow from it to the element it explains.
 * The card avoids covering the diagram: everything drawn (boxes, labels, connectors
 * sampled along their length, moving tokens) is an obstacle, and the card takes the
 * nearby spot that covers the least of it. Shared by the player (CSS px) and the
 * video export (canvas px), so both place cards identically.
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }
export interface Obstacle extends Rect { weight: number }
export interface Leader { x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number; angle: number }
export interface Placement { x: number; y: number; key: string; leader?: Leader }

type Side = 'right' | 'left' | 'bottom' | 'top';
type Cand = { key: string; x: number; y: number; dock: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Callout type scale, as fractions of stage width (CSS mirrors these with cqw units). */
export const CALLOUT = { font: 0.016, maxW: 0.3, padX: 1.1, padY: 0.85, eyebrow: 0.55, line: 1.3 } as const;

export class Placer {
  /** Chosen candidate per step: kept while it stays nearly as good, so the card doesn't jitter. */
  private memo = new Map<number, string>();

  place(step: number, anchor: Rect | null, card: Size, stage: Size, obstacles: Obstacle[] = []): Placement {
    const m = stage.w * 0.022;
    const visible = !!anchor && anchor.w * anchor.h > 0 &&
      anchor.x < stage.w && anchor.y < stage.h && anchor.x + anchor.w > 0 && anchor.y + anchor.h > 0;
    const a = visible ? anchor : null;
    // Zoomed right into the anchor: the frame is the subject, so only corners make sense.
    const fills = !!a && a.w * a.h > stage.w * stage.h * 0.55;

    const cands = candidates(a && !fills ? a : null, card, stage, m);
    const area = card.w * card.h;
    const score = (c: Cand) => {
      const box = { x: c.x - 8, y: c.y - 8, w: card.w + 16, h: card.h + 16 };
      let s = 0;
      for (const o of obstacles) s += overlap(box, o) * o.weight;
      s = (s / area) * 40;
      if (a) {
        s += (overlap(box, a) / area) * (fills ? 4 : 200);
        const dx = Math.max(a.x - (c.x + card.w), 0, c.x - (a.x + a.w));
        const dy = Math.max(a.y - (c.y + card.h), 0, c.y - (a.y + a.h));
        s += (Math.hypot(dx, dy) / stage.w) * 10;
      } else {
        s += (c.x / stage.w + (stage.h - c.y - card.h) / stage.h) * 0.8; // free captions prefer lower left
      }
      return s + (c.dock && a && !fills ? 1.5 : 0);
    };

    const scored = cands.map((c) => ({ c, s: score(c) })).sort((p, q) => p.s - q.s);
    const kept = scored.find((p) => p.c.key === this.memo.get(step));
    const pick = kept && kept.s <= scored[0].s + 0.8 ? kept : scored[0];
    this.memo.set(step, pick.c.key);
    const { x, y, key } = pick.c;
    return { x, y, key, leader: a ? leader({ x, y, ...card }, a) : undefined };
  }
}

function candidates(a: Rect | null, c: Size, stage: Size, m: number): Cand[] {
  const fit = (key: string, x: number, y: number, dock = false): Cand =>
    ({ key, x: clamp(x, m, stage.w - c.w - m), y: clamp(y, m + stage.w * 0.012, stage.h - c.h - m), dock });
  const out: Cand[] = [
    fit('dock-bl', m, stage.h, true), fit('dock-br', stage.w, stage.h, true),
    fit('dock-tl', m, 0, true), fit('dock-tr', stage.w, 0, true),
    fit('dock-bc', (stage.w - c.w) / 2, stage.h, true), fit('dock-tc', (stage.w - c.w) / 2, 0, true),
  ];
  if (!a) return out;
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  for (const far of [1, 2.2]) {
    const gap = stage.w * 0.035 * far;
    for (const k of [0, -1, 1]) {
      const sx = k * c.w * 0.45, sy = k * c.h * 0.6;
      const at: Record<Side, [number, number]> = {
        right: [a.x + a.w + gap, cy - c.h / 2 + sy],
        left: [a.x - gap - c.w, cy - c.h / 2 + sy],
        bottom: [cx - c.w / 2 + sx, a.y + a.h + gap],
        top: [cx - c.w / 2 + sx, a.y - gap - c.h],
      };
      for (const side of Object.keys(at) as Side[]) out.push(fit(`${side}${k}${far}`, ...at[side]));
    }
  }
  return out;
}

/** Dashed Bézier from the card edge facing the anchor to just outside the anchor's edge. */
export function leader(card: Rect, a: Rect): Leader | undefined {
  const cc = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const horizontal = Math.abs(ac.x - cc.x) / (card.w / 2 + a.w / 2) > Math.abs(ac.y - cc.y) / (card.h / 2 + a.h / 2);
  const gap = 5;
  let x1, y1, x2, y2;
  if (horizontal) {
    const right = ac.x > cc.x;
    x1 = right ? card.x + card.w : card.x;
    y1 = clamp(ac.y, card.y + 12, card.y + card.h - 12);
    x2 = right ? a.x - gap : a.x + a.w + gap;
    y2 = clamp(cc.y, a.y + a.h * 0.25, a.y + a.h * 0.75);
  } else {
    const down = ac.y > cc.y;
    y1 = down ? card.y + card.h : card.y;
    x1 = clamp(ac.x, card.x + 12, card.x + card.w - 12);
    y2 = down ? a.y - gap : a.y + a.h + gap;
    x2 = clamp(cc.x, a.x + a.w * 0.25, a.x + a.w * 0.75);
  }
  // Card and anchor overlap (zoomed in): no room for an arrow.
  if (horizontal ? (x2 - x1) * (ac.x - cc.x) <= 4 : (y2 - y1) * (ac.y - cc.y) <= 4) return undefined;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const [c1x, c1y, c2x, c2y] = horizontal ? [mx, y1, mx, y2] : [x1, my, x2, my];
  return { x1, y1, c1x, c1y, c2x, c2y, x2, y2, angle: Math.atan2(y2 - c2y, x2 - c2x) };
}

export const leaderPath = (l: Leader) => `M${l.x1} ${l.y1} C${l.c1x} ${l.c1y} ${l.c2x} ${l.c2y} ${l.x2} ${l.y2}`;

/** Arrowhead triangle at the leader's tip, `s` long. */
export function arrowHead(l: Leader, s: number): [number, number][] {
  const back = (da: number) => [l.x2 - s * Math.cos(l.angle + da), l.y2 - s * Math.sin(l.angle + da)] as [number, number];
  return [[l.x2, l.y2], back(0.42), back(-0.42)];
}

/** An element's on-screen box relative to the stage, scaled to a stage of size `to`. */
export function relRect(el: Element, stage: Element, to: Size): Rect {
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  const kx = to.w / s.width, ky = to.h / s.height;
  return { x: (r.x - s.x) * kx, y: (r.y - s.y) * ky, w: r.width * kx, h: r.height * ky };
}

const samples = new WeakMap<SVGGeometryElement, DOMPoint[]>();
const LINES = 'path,line,polyline';

function opacity(el: Element, root: Element) {
  let o = 1;
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) o *= parseFloat((e as SVGElement).style?.opacity || '1');
  return o;
}

/**
 * Everything drawn in the visible scene, in stage pixels scaled to `to`. Connectors are
 * sampled along their length (their bounding box would wrongly block the empty corner of
 * an elbow). Elements not revealed yet still count a little: they appear during the step.
 */
export function collectObstacles(stage: Element, to: Size, anchor: Element | null): Obstacle[] {
  const svgs = [...stage.querySelectorAll<SVGSVGElement>('svg[data-scene]')];
  if (!svgs.length) return [];
  const svg = svgs.reduce((p, q) => (parseFloat(q.style.opacity || '1') > parseFloat(p.style.opacity || '1') ? q : p));
  const s = stage.getBoundingClientRect();
  const kx = to.w / s.width, ky = to.h / s.height;
  const big = to.w * to.h * 0.15;
  const out: Obstacle[] = [];
  for (const el of svg.querySelectorAll<SVGGraphicsElement>('rect,circle,ellipse,polygon,text,path,line,polyline')) {
    if (el.closest('defs,marker,[data-bg]') || (anchor && anchor.contains(el))) continue;
    const vis = opacity(el, svg);
    if (el.hasAttribute('data-token') && vis < 0.05) continue;
    const weight = vis < 0.05 ? 0.5 : vis < 0.5 ? 0.35 : 1;
    if (el.matches(LINES)) {
      const g = el as unknown as SVGGeometryElement;
      let pts = samples.get(g);
      if (!pts) {
        const len = g.getTotalLength();
        const n = Math.max(2, Math.min(80, Math.ceil(len / 16)));
        pts = Array.from({ length: n + 1 }, (_, i) => g.getPointAtLength((len * i) / n));
        samples.set(g, pts);
      }
      const ctm = g.getScreenCTM();
      if (!ctm) continue;
      const r = 6;
      for (const p of pts) {
        const q = p.matrixTransform(ctm);
        out.push({ x: (q.x - s.x) * kx - r, y: (q.y - s.y) * ky - r, w: 2 * r, h: 2 * r, weight });
      }
      continue;
    }
    const b = el.getBoundingClientRect();
    const o = { x: (b.x - s.x) * kx, y: (b.y - s.y) * ky, w: b.width * kx, h: b.height * ky, weight };
    if (o.w * o.h > big) continue; // zone/background rects: only their contents matter
    out.push(o);
  }
  return out;
}
