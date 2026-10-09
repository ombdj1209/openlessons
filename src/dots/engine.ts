import { DH, DW, type DotForm, type DotStep, type Lesson } from './schema';
import { itemPoints, type Ann, type Pt } from './shapes';

export const ACCENT = '#ff7a3d';
const INK_ACCENT = '#d4541a';            // accent dark enough to read on the white slab
const DANGER = '#ff4d5e';                // a part that is failing, a request that is refused
const TAU = Math.PI * 2;
const VIA_GATHER = 1.35;                 // seconds folding back into the sphere before a `via` step builds
const WORD = .23;                        // seconds per word: captions arrive at reading pace (~260 wpm)
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (k: number) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Symbol fonts come before the generic family, so ✓ ✕ → ← never fall through to the
// system's CJK font (on a Japanese Windows that turns them into MS Gothic glyphs).
const SYMBOLS = '"Noto Sans Symbols 2", "Segoe UI Symbol", "Apple Symbols"';
export const FONT = {
  caption: `"Fraunces", Georgia, ${SYMBOLS}, serif`,
  mono: `"IBM Plex Mono", Consolas, ${SYMBOLS}, monospace`,
  ui: `Inter, "Segoe UI", ${SYMBOLS}, sans-serif`,
};
/** Canvas text never triggers webfont loading, so load what the engine draws with up front. */
export function loadFonts() {
  return Promise.all(['400 28px Fraunces', '600 28px Fraunces', '500 13px "IBM Plex Mono"', '400 17px "IBM Plex Mono"',
    '600 11px "IBM Plex Mono"', '500 16px Inter', '600 16px Inter', '700 100px Inter']
    .map((f) => document.fonts.load(f)).concat(document.fonts.load('400 16px "Noto Sans Symbols 2"', '✓✕→←'))).catch(() => []);
}

/** Height of the design space lessons draw in; the caption panel sits below it. */
const CONTENT_H = 728;
const CAP = 31, LH = 40;               // caption size and line height at the 1600-wide reference size

interface Target { x: number; y: number; r: number; a: number; c: number }
export interface ItemInfo { id?: string; label?: string; note?: string; fail?: boolean; box: { x1: number; y1: number; x2: number; y2: number } }
interface Form {
  center: [number, number];
  pulse: boolean;
  at(j: number, t: number): Target;
  owner: Int16Array;
  items: ItemInfo[];
  texts: Ann[];
}
/** Any text drawn over the dots: item labels, free labels, code lines, shape annotations. */
interface Lbl { text: string; x: number; y: number; accent?: boolean; code?: boolean; fail?: boolean; ann?: Ann; item?: number }
interface Word { w: string; em: boolean }
type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function fib(n: number): [number, number, number][] {
  const out: [number, number, number][] = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), th = g * i;
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
}
/** A point on a rotating, breathing sphere, in perspective; depth sets size and brightness. */
function onSphere(u: [number, number, number], cx: number, cy: number, R0: number, t: number, ph = 0): Target {
  const R = R0 * (1 + .13 * Math.sin(t * 2 + ph)) * (1 + .045 * Math.sin(t * 3.1 + u[1] * 6 + ph));
  const ry = t * .42 + ph, rx = .42;
  const x1 = u[0] * Math.cos(ry) + u[2] * Math.sin(ry), z1 = -u[0] * Math.sin(ry) + u[2] * Math.cos(ry);
  const y1 = u[1] * Math.cos(rx) - z1 * Math.sin(rx), z2 = u[1] * Math.sin(rx) + z1 * Math.cos(rx);
  const p = 700 / (700 - z2 * R), d = (z2 + 1) / 2;
  return { x: cx + x1 * R * p, y: cy + y1 * R * p, r: .9 + 1.9 * d, a: .28 + .72 * d, c: 0 };
}

/** Packets: dots that keep travelling along a polyline, brightest mid-route. */
function travel(path: [number, number][], phase: number, speed: number, c: number, drop = false) {
  const lens: number[] = [];
  let total = 0;
  for (let k = 0; k < path.length - 1; k++) { const L = Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]); lens.push(L); total += L; }
  return (t: number): Target => {
    const u = ((t * speed + phase) % 1 + 1) % 1;
    let dd = u * total;
    for (let k = 0; k < lens.length; k++) {
      if (dd <= lens[k] || k === lens.length - 1) {
        const f = lens[k] ? dd / lens[k] : 0, p = path[k], q = path[k + 1];
        // A dropped request swells and fades where it is refused, instead of arriving.
        const a = drop ? (u < .75 ? .35 + .65 * Math.sin(Math.PI * u / 1.5) : (1 - u) / .25) : .35 + .65 * Math.sin(Math.PI * u);
        return { x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f, r: drop && u > .75 ? 3.3 + (u - .75) * 14 : 3.3, a, c };
      }
      dd -= lens[k];
    }
    return { x: path[0][0], y: path[0][1], r: 3, a: 0, c };
  };
}

/**
 * The widest spacing at which the shapes need at least `need` dots, trimmed to exactly
 * `need`. Surplus comes out of interior fill first, so outlines keep every dot.
 */
function fit(make: (d: number) => Pt[], need: number): Pt[] {
  let lo = 2, hi = 70, over: Pt[] | null = null, under: Pt[] | null = null;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2, pts = make(mid);
    if (pts.length >= need) { over = pts; lo = mid; } else { under = pts; hi = mid; }
  }
  // Surplus may only come out of interior fill; outlines and letters keep every dot.
  if (over) {
    const fills = over.flatMap((p, i) => (p.f ? [i] : []));
    const excess = over.length - need;
    if (excess <= fills.length) {
      const drop = new Set<number>();
      for (let k = 0; k < excess; k++) drop.add(fills[Math.floor((k + .5) * fills.length / excess)]);
      return over.filter((_, i) => !drop.has(i));
    }
  }
  // Otherwise take the slightly sparser layout whole, and park the spare dots invisibly on
  // existing points, rather than punching holes in lines and letters.
  const base = under?.length ? under : over ?? make(2);
  if (!base.length) return Array.from({ length: need }, () => ({ x: DW / 2, y: DH / 2, r: 1, a: 0, c: 0, o: -1, f: true }));
  if (base.length >= need) return base.slice(0, need);
  const out = [...base];
  for (let k = 0; out.length < need; k++) out.push({ ...base[(k * 7919) % base.length], a: 0, r: .6 });
  return out;
}

/**
 * Shapes at a fixed spacing, padded with hidden dots, so an unchanged part lands on the very
 * same points in every step. Null when they need more dots than there are (caller re-spaces).
 */
function fixed(pts: Pt[], need: number): Pt[] | null {
  if (pts.length > need) return null;
  // Spares hide inside the shapes, so they never streak across the stage.
  const out = [...pts];
  for (let k = 0; out.length < need; k++) out.push(pts.length ? { ...pts[(k * 7919) % pts.length], a: 0, r: .6, o: -1 } : { x: DW / 2, y: DH / 2, r: .6, a: 0, c: 0, o: -1, f: true });
  return out;
}

/** Caption words, with *key terms* flagged (asterisks may span several words). */
function words(text: string): Word[] {
  let em = false;
  return text.split(/\s+/).filter(Boolean).map((raw) => {
    let w = raw, on = em;
    if (w.startsWith('*')) { w = w.slice(1); on = true; em = true; }
    const m = w.match(/^(.*?)\*([.,;:!?)'"”’]*)$/);
    if (m) { w = m[1] + m[2]; em = false; }
    return { w, em: on };
  });
}
const readTime = (text: string) => .35 + words(text).length * WORD + .4;
/** Seconds to read a problem card: statement, then example, constraints and follow-up. */
const problemTime = (p: NonNullable<DotStep['problem']>) =>
  readTime(p.statement) + (p.example.length ? 1 + p.example.length * .45 : 0)
  + (p.constraints.length ? 1 + p.constraints.length * .45 : 0) + (p.followUp ? readTime(p.followUp) : 0) + 1.5;
/** Seconds to read the plain-English slide: the one-line ask, then each point. */
const plainTime = (p: NonNullable<DotStep['plain']>) => readTime(p.asking) + p.points.reduce((t, x) => t + readTime(x) * .8, 0) + 1.5;
/** Plain-English explanations are yellow, so they read as "the interviewer, translated". */
const PLAIN = '#ffd23f';

/**
 * A dots lesson as a living particle system. Every dot is always on screen; steps move
 * them between formations (sphere, several spheres, or shapes). Pure state + canvas
 * drawing, shared by the player, the library thumbnails and the video export.
 */
export class DotEngine {
  readonly n: number;
  private x: Float32Array; private y: Float32Array; private r: Float32Array; private a: Float32Array; private c: Float32Array;
  private fx: Float32Array; private fy: Float32Array; private fr: Float32Array; private fa: Float32Array; private fc: Float32Array;
  private delay: Float32Array; private curl: Float32Array; private slot: Int32Array;
  private form!: Form;
  private formDef: DotForm | null = null;
  private formT0 = 0; private formDur = 1.7;
  /** Labels wait for rebuilt shapes to land; when the shapes stay, they change almost at once. */
  private labelDelay = 1.4;
  private s = 11;
  private U: [number, number, number][];
  private prev = { caption: '', labels: [] as Lbl[], t: -10 };
  private scale = 1; private ox = 0; private oy = 0;
  private optRects: { x: number; y: number; w: number; h: number }[] = [];
  private segRects: { x: number; y: number; w: number; h: number }[] = [];
  private panelCache: { key: string; L: PanelLayout } | null = null;
  private panelTop = Infinity;
  /** 1 = caption panel in place, 0 = slid away (a question is on stage). */
  private panelK = 1;
  /** Answers given to quick checks, by step, and when. */
  readonly answers = new Map<number, { choice: number; t: number }>();

  step = -1; stepT0 = 0; pending = -1; pendingAt = 0; clock = 0;
  /** When this step's caption started; unlike stepT0 it never restarts mid-step. */
  private captionT0 = 0;
  paused = false; speed = 1; autoAdvance = true;
  /** Export mode: answer quick checks by itself after a reading pause. */
  autoAnswer = false;

  constructor(readonly lesson: Lesson) {
    const n = this.n = lesson.dots;
    const F = () => new Float32Array(n);
    this.x = F(); this.y = F(); this.r = F(); this.a = F(); this.c = F();
    this.fx = F(); this.fy = F(); this.fr = F(); this.fa = F(); this.fc = F();
    this.delay = F(); this.curl = F(); this.slot = new Int32Array(n);
    this.U = fib(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = DW / 2 + (this.rnd() - .5) * 4; this.y[i] = 410 + (this.rnd() - .5) * 4;
      this.r[i] = 1; this.a[i] = .9; this.slot[i] = i;
      this.fx[i] = this.x[i]; this.fy[i] = this.y[i]; this.fr[i] = 1; this.fa[i] = .9;
    }
    this.form = this.sphere(800, 410, 150);
  }

  private rnd() {
    let s = this.s = (this.s + 0x6D2B79F5) | 0;
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s = (s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ s;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  }

  get steps() { return this.lesson.steps; }
  get current(): DotStep { return this.steps[Math.max(0, this.step)]; }
  /** Seconds since this step's shapes started building; -1 while gathering into the sphere. */
  get shapeT() { return this.pending >= 0 ? -1 : this.clock - this.stepT0; }
  get items() { return this.form.items; }
  get waitingForAnswer() { return !!this.current.check && !this.answers.has(this.step); }

  /** How long a step stays: its minimum, but never before the caption (and any answer) has been read. */
  stepDuration(k: number): number {
    const s = this.steps[k];
    const base = Math.max(s.dur, (s.problem ? problemTime(s.problem) : s.plain ? plainTime(s.plain) : readTime(s.caption)) + 2.2);
    if (!s.check) return base;
    const ans = this.answers.get(k);
    if (!ans) return Infinity;
    return (ans.t - (k === this.step ? this.stepT0 : 0)) + readTime(`Correct. ${s.check.explain}`) + 3;
  }
  get finished() { return this.step === this.steps.length - 1 && this.pending < 0 && this.shapeT >= this.stepDuration(this.step); }
  /** Length of an uninterrupted play-through with checks answered after a short pause (export). */
  totalDuration() {
    return this.steps.reduce((t, s, i) => {
      const read = readTime(s.check ? `${s.caption} ${s.check.question}` : s.caption);
      const body = s.check ? read + 2 + readTime(`Correct. ${s.check.explain}`) + 3
        : Math.max(s.dur, (s.problem ? problemTime(s.problem) : s.plain ? plainTime(s.plain) : read) + 2.2);
      return t + (s.via && i > 0 ? VIA_GATHER : 0) + body;
    }, 0) + 1.2;
  }

  private sphere(cx: number, cy: number, R: number): Form {
    return { center: [cx, cy], pulse: false, at: (j, t) => onSphere(this.U[j], cx, cy, R, t), owner: new Int16Array(this.n).fill(-1), items: [], texts: [] };
  }

  private build(f: DotForm): Form {
    const n = this.n;
    if (f.type === 'sphere') return this.sphere(f.at[0], f.at[1], f.r);
    if (f.type === 'spheres') {
      const k = f.items.length, u = fib(Math.ceil(n / k)), R = f.r;
      return {
        center: [800, 410], pulse: false, owner: new Int16Array(n).map((_, j) => j % k), texts: [],
        at: (j, t) => { const g = j % k, it = f.items[g]; return onSphere(u[Math.floor(j / k)], it.at[0], it.at[1], R, t, g * 1.7); },
        items: f.items.map((it) => ({ ...it, box: { x1: it.at[0] - R * 1.15, y1: it.at[1] - R * 1.15, x2: it.at[0] + R * 1.15, y2: it.at[1] + R * 1.15 } })),
      };
    }
    const texts: Ann[] = [];
    f.items.forEach((it, o) => itemPoints(it, 20, o, texts));
    const packets = f.flows.flatMap((fl) => Array.from({ length: fl.count }, (_, m) => travel(fl.path, fl.phase + m / fl.count, fl.speed, fl.fail ? 2 : fl.accent ? 1 : 0, fl.drop)));
    const make = (d: number) => f.items.flatMap((it, o) => itemPoints(it, d, o));
    const pts = this.lesson.spacing ? fixed(make(this.lesson.spacing), n - packets.length) ?? fit(make, n - packets.length) : fit(make, n - packets.length);
    const owner = new Int16Array(n).fill(-1);
    pts.forEach((p, j) => { owner[j] = p.o; });
    const boxes = f.items.map(() => ({ x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }));
    let X1 = Infinity, Y1 = Infinity, X2 = -Infinity, Y2 = -Infinity;
    for (const p of pts) {
      X1 = Math.min(X1, p.x); Y1 = Math.min(Y1, p.y); X2 = Math.max(X2, p.x); Y2 = Math.max(Y2, p.y);
      if (p.o < 0) continue;
      const b = boxes[p.o];
      b.x1 = Math.min(b.x1, p.x); b.y1 = Math.min(b.y1, p.y); b.x2 = Math.max(b.x2, p.x); b.y2 = Math.max(b.y2, p.y);
    }
    return {
      center: [(X1 + X2) / 2, (Y1 + Y2) / 2], pulse: true, owner, texts,
      at: (j, t) => (j < pts.length ? pts[j] : packets[j - pts.length](t)),
      items: f.items.map((it, o) => ({ id: it.id, label: it.label, note: it.note, fail: it.fail, box: boxes[o] })),
    };
  }

  /** The form a step shows: its own, or the nearest earlier step's. */
  private formOf(k: number): DotForm {
    for (let i = k; i >= 0; i--) { const f = this.steps[i].form; if (f) return f; }
    return { type: 'sphere', at: [800, 410], r: 150 };
  }

  /** Send every dot to the new formation: each target takes the nearest free dot. */
  private setForm(f: Form, { dur = 1.7, burst = true } = {}) {
    const n = this.n;
    this.fx.set(this.x); this.fy.set(this.y); this.fr.set(this.r); this.fa.set(this.a); this.fc.set(this.c);
    const tg = Array.from({ length: n }, (_, j) => f.at(j, this.clock));
    const free = new Uint8Array(n).fill(1);
    let order = tg.map((_, j) => j);
    for (let k = order.length - 1; k > 0; k--) { const m = Math.floor(this.rnd() * (k + 1)); [order[k], order[m]] = [order[m], order[k]]; }
    const [cx, cy] = f.center;
    let maxD = 1;
    for (const p of tg) maxD = Math.max(maxD, Math.hypot(p.x - cx, p.y - cy));
    if (this.lesson.spacing) {
      // Unchanged parts: a dot already resting on a new target keeps it and doesn't move at all.
      const key = (p: Target) => `${Math.round(p.x * 4)},${Math.round(p.y * 4)},${p.a > 0 ? 1 : 0}`;
      const resting = new Map<string, number[]>();
      for (let i = 0; i < n; i++) {
        const k = key(this.form.at(this.slot[i], this.clock));
        const list = resting.get(k);
        if (list) list.push(i); else resting.set(k, [i]);
      }
      const done = new Uint8Array(n);
      for (const j of order) {
        const i = resting.get(key(tg[j]))?.pop();
        if (i === undefined) continue;
        free[i] = 0; done[j] = 1; this.slot[i] = j; this.delay[i] = 0; this.curl[i] = 0;
      }
      order = order.filter((j) => !done[j]);
    }
    for (const j of order) {
      const p = tg[j];
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) {
        if (!free[i]) continue;
        const dd = (this.x[i] - p.x) ** 2 + (this.y[i] - p.y) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      free[best] = 0;
      this.slot[best] = j;
      // Burst outward from the centre: near points land first, far points follow.
      this.delay[best] = burst ? (Math.hypot(p.x - cx, p.y - cy) / maxD) * .55 + this.rnd() * .12 : this.rnd() * .18;
      this.curl[best] = (this.rnd() - .5) * (burst ? 120 : 60);
    }
    this.form = f; this.formT0 = this.clock; this.formDur = dur;
  }

  go(k: number) {
    k = clamp(k, 0, this.steps.length - 1);
    if (k === this.step && this.pending < 0) return;
    if (this.step >= 0) this.prev = { caption: this.captionText(), labels: this.labelsOf(), t: this.clock };
    this.step = k; this.stepT0 = this.clock; this.captionT0 = this.clock;
    const def = this.formOf(k);
    if (def === this.formDef) { this.pending = -1; this.labelDelay = .1; return; } // same shapes: the dots stay put
    this.formDef = def;
    this.labelDelay = 1.4;
    if (this.steps[k].via && this.form.pulse) {
      this.setForm(this.sphere(800, 420, 120), { dur: 1, burst: false });
      this.pending = k; this.pendingAt = this.clock + VIA_GATHER;
    } else {
      this.pending = -1;
      this.setForm(this.build(def));
    }
  }

  /** Answer the current step's quick check. */
  choose(i: number) {
    const chk = this.current.check;
    if (!chk || this.answers.has(this.step) || i < 0 || i >= chk.options.length) return;
    this.answers.set(this.step, { choice: i, t: this.clock });
  }

  /** Jump straight to a step's finished formation (thumbnails). */
  snap(k: number) {
    this.step = clamp(k, 0, this.steps.length - 1); this.pending = -1;
    this.formDef = this.formOf(this.step);
    this.form = this.build(this.formDef);
    this.clock = 4; this.stepT0 = -100; this.formT0 = -100; this.captionT0 = -100;
    for (let i = 0; i < this.n; i++) this.slot[i] = i;
    this.panelK = this.current.panel ? 1 : 0;
    // A still must stay on this step: without this, update() would auto-advance to the next one.
    const auto = this.autoAdvance;
    this.autoAdvance = false;
    this.update(0);
    this.autoAdvance = auto;
  }

  update(dt: number) {
    if (!this.paused) this.clock += dt * this.speed;
    if (this.pending >= 0 && this.clock >= this.pendingAt) {
      this.pending = -1; this.stepT0 = this.clock;
      this.setForm(this.build(this.formDef!));
    }
    const chk = this.current.check;
    if (this.autoAnswer && chk && !this.answers.has(this.step) && this.shapeT > readTime(this.captionText()) + 2) this.choose(chk.answer);
    // The caption panel slides away for stage-only steps (the opening question), and back afterwards.
    const target = this.current.panel ? 1 : 0;
    this.panelK += (target - this.panelK) * (1 - Math.exp(-dt * 7));
    if (this.autoAdvance && !this.paused && this.pending < 0 && this.step < this.steps.length - 1 && this.shapeT > this.stepDuration(this.step)) this.go(this.step + 1);

    const f = this.form, t = this.clock - this.formT0;
    // A growing diagram holds still, so the parts that change are the only thing moving.
    const breath = f.pulse && !this.lesson.spacing ? 1 + .014 * Math.sin(this.clock * 2.1) : 1;
    const [pcx, pcy] = f.center;
    for (let i = 0; i < this.n; i++) {
      const e = ease(clamp((t - this.delay[i]) / this.formDur));
      const T = f.at(this.slot[i], this.clock);
      const X = pcx + (T.x - pcx) * breath, Y = pcy + (T.y - pcy) * breath;
      const dx = X - this.fx[i], dy = Y - this.fy[i], len = Math.hypot(dx, dy) || 1, bow = Math.sin(Math.PI * e) * this.curl[i];
      this.x[i] = this.fx[i] + dx * e - dy / len * bow;
      this.y[i] = this.fy[i] + dy * e + dx / len * bow;
      this.r[i] = this.fr[i] + (T.r - this.fr[i]) * e;
      this.a[i] = this.fa[i] + (T.a - this.fa[i]) * e;
      this.c[i] = this.fc[i] + (T.c - this.fc[i]) * e;
    }
  }

  /** Item indexes the current step talks about, or null when everything is in focus. */
  private focused(): Set<number> | null {
    const ids = this.current.focus;
    if (!ids?.length) return null;
    return new Set(this.form.items.flatMap((it, i) => (it.id && ids.includes(it.id) ? [i] : [])));
  }

  private labelsOf(): Lbl[] {
    const s = this.current;
    const auto = this.form.items.flatMap((it, i): Lbl[] => (it.label && isFinite(it.box.x1)
      ? [{ text: it.label, x: (it.box.x1 + it.box.x2) / 2, y: it.box.y2 + 34, fail: it.fail, item: i }] : []));
    return [
      ...auto,
      ...this.form.texts.map((a): Lbl => ({ text: a.text, x: a.x, y: a.y, accent: a.accent, ann: a })),
      ...s.labels.map((l): Lbl => ({ text: l.text, x: l.at[0], y: l.at[1], accent: l.accent, code: l.code, fail: l.fail })),
    ];
  }


  /** Screen pixel → design coordinates for the last render size, and back. */
  toDesign(px: number, py: number): [number, number] { return [(px - this.ox) / this.scale, (py - this.oy) / this.scale]; }
  toScreen(dx: number, dy: number): [number, number] { return [dx * this.scale + this.ox, dy * this.scale + this.oy]; }

  /** The labelled or annotated item under a design-space point, or -1. */
  hitItem(dx: number, dy: number): number {
    if (this.pending >= 0 || this.shapeT < 1.2 || this.toScreen(dx, dy)[1] > this.panelTop) return -1;
    let best = -1, bd = 22 * 22;
    for (let i = 0; i < this.n; i++) {
      const o = this.form.owner[this.slot[i]];
      if (o < 0) continue;
      const it = this.form.items[o];
      if (!it.label && !it.note) continue;
      const d = (this.x[i] - dx) ** 2 + (this.y[i] - dy) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /** Step segment under a canvas-pixel point, or -1. */
  segmentAt(px: number, py: number): number {
    return this.segRects.findIndex((r) => px >= r.x - 3 && px <= r.x + r.w + 3 && py >= r.y - 10 && py <= r.y + r.h + 10);
  }
  /** Quick-check option under a canvas-pixel point, or -1. */
  optionAt(px: number, py: number): number {
    if (!this.waitingForAnswer) return -1;
    return this.optRects.findIndex((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
  }
  /** True when a canvas-pixel point is on the caption panel. */
  onPanel(py: number) { return py >= this.panelTop; }

  render(g: G, w: number, h: number, o: { cursor?: [number, number] | null; cursorK?: number; hover?: number; bare?: boolean; dpr?: number } = {}) {
    // The panel claims the bottom of the screen; the diagram fits into what is left above it.
    const P = o.bare ? null : this.panelLayout(g, w, h, o.dpr ?? 1);
    const avail = P ? P.top + P.u * .4 : h;
    this.scale = Math.min(w / DW, avail / (o.bare ? DH : CONTENT_H));
    this.ox = (w - DW * this.scale) / 2;
    this.oy = Math.max(0, (avail - (o.bare ? DH : CONTENT_H) * this.scale) / 2);
    this.panelTop = P ? P.top : h;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const vg = g.createRadialGradient(w / 2, avail * .48, 40, w / 2, avail * .48, Math.max(w, avail) * .7);
    vg.addColorStop(0, '#101014'); vg.addColorStop(1, '#000');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    g.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);

    const hover = o.hover ?? -1, cur = o.cursor, ck = o.cursorK ?? 1;
    const focus = this.shapeT > .8 ? this.focused() : null;
    for (let i = 0; i < this.n; i++) {
      let px = this.x[i], py = this.y[i], rr = Math.max(.6, this.r[i]), aa = this.a[i];
      if (cur && ck > 0) {
        // Dots lean away from a moving cursor, like a hand through sand, and settle back once it rests.
        const dx = px - cur[0], dy = py - cur[1], d = Math.hypot(dx, dy);
        if (d < 110 && d > .01) { const k = (1 - d / 110) ** 2 * 22 * ck; px += dx / d * k; py += dy / d * k; rr *= 1 + (1 - d / 110) * .5 * ck; }
      }
      const own = this.form.owner[this.slot[i]];
      if (hover >= 0) { if (own === hover) { rr *= 1.35; aa = Math.min(1, aa + .35); } else aa *= .4; }
      else if (focus && own >= 0 && !focus.has(own)) aa *= .28;
      const col = this.c[i] > 1.5 ? DANGER : this.c[i] > .5 ? ACCENT : null;
      if (col) { g.globalAlpha = aa * .16; g.fillStyle = col; g.beginPath(); g.arc(px, py, rr * 3.4, 0, TAU); g.fill(); }
      g.globalAlpha = aa; g.fillStyle = col ?? '#fff';
      g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
    }
    if (!P) {
      // Thumbnails: the values inside shapes and the item labels, without captions or chrome.
      for (const l of this.labelsOf()) if (l.ann || l.item !== undefined) this.drawLabel(g, l, 1);
      g.globalAlpha = 1;
      return;
    }
    this.drawLabels(g, hover, focus);
    if (this.current.problem) this.drawProblem(g, w, P);
    if (this.current.plain) this.drawPlain(g, w, P);
    if (this.panelK > .01) this.drawPanel(g, w, h, P);
  }

  /**
   * "What the interviewer is really asking": the problem retold in simple English, in yellow,
   * word by word, then a few short points (what you get, what you return, the catch).
   */
  private drawPlain(g: G, w: number, P: PanelLayout) {
    const p = this.current.plain!, u = P.u;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const t = this.clock - this.stepT0 - .5;
    const cardW = Math.min(w - P.padX * 2, u * 34), x0 = (w - cardW) / 2;
    let y = this.toScreen(0, 300)[1];
    this.text(g, 'WHAT THE INTERVIEWER IS REALLY ASKING', x0, y, `600 ${u * .42}px ${FONT.mono}`, clamp(t / .4), 'left', PLAIN, `${u * .14}px`);
    y += u * 1.5;
    const size = u * 1.1, lh = size * 1.35;
    let k = 0;
    const lines = this.layout(g, words(p.asking), cardW, size);
    lines.forEach((ln, li) => {
      for (const wd of ln.words) {
        const wa = clamp((t - .3 - k++ * WORD) / .25);
        if (wa > 0) this.text(g, wd.w, x0 + wd.x, y + li * lh + (1 - wa) * u * .15, `${wd.em ? 600 : 400} ${size}px ${FONT.caption}`, wa, 'left', PLAIN);
      }
    });
    y += lines.length * lh + u * .4;
    let at = .3 + readTime(p.asking);
    const ps = u * .8, plh = ps * 1.4;
    for (const pt of p.points) {
      const a = clamp((t - at) / .4);
      const pl = this.layout(g, words(pt), cardW - u * 1.2, ps);
      this.text(g, '→', x0, y, `500 ${ps}px ${FONT.ui}`, a, 'left', PLAIN);
      pl.forEach((ln, li) => ln.words.forEach((wd) => this.text(g, wd.w, x0 + u * 1.2 + wd.x, y + li * plh,
        `${wd.em ? 600 : 400} ${ps}px ${FONT.caption}`, a, 'left', wd.em ? PLAIN : '#ececef')));
      y += pl.length * plh + u * .35;
      at += readTime(pt) * .8;
    }
    g.globalAlpha = 1;
  }


  /**
   * The problem as the interviewer reads it: statement (word by word, at reading pace),
   * then the example, the constraints and the follow-up, each once the previous is read.
   */
  private drawProblem(g: G, w: number, P: PanelLayout) {
    const p = this.current.problem!, u = P.u;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const t = this.clock - this.stepT0 - .8;
    const cardW = Math.min(w - P.padX * 2, u * 34), x0 = (w - cardW) / 2;
    let y = this.toScreen(0, 300)[1];

    const sSize = u * .92, sLH = sSize * 1.4;
    let k = 0;
    const sLines = this.layout(g, words(p.statement), cardW, sSize);
    sLines.forEach((ln, li) => {
      for (const wd of ln.words) {
        const wa = clamp((t - k++ * WORD) / .25);
        if (wa > 0) this.text(g, wd.w, x0 + wd.x, y + li * sLH + (1 - wa) * u * .15, `${wd.em ? 600 : 400} ${sSize}px ${FONT.caption}`, wa, 'left', wd.em ? ACCENT : '#f2f2f4');
      }
    });
    y += sLines.length * sLH + u * .5;

    let at = readTime(p.statement);
    const block = (title: string, lines: string[], size: number, color: string) => {
      if (!lines.length) return;
      const a = clamp((t - at) / .4);
      this.text(g, title, x0, y, `600 ${u * .4}px ${FONT.mono}`, a, 'left', ACCENT, `${u * .14}px`);
      y += u * .9;
      lines.forEach((ln, i) => {
        const la = clamp((t - at - .3 - i * .45) / .35);
        this.text(g, ln, x0, y, `400 ${size}px ${FONT.mono}`, la, 'left', color);
        y += size * 1.55;
      });
      y += u * .35;
      at += .6 + lines.length * .45 + .4;
    };
    block('EXAMPLE', p.example, u * .58, '#dcdce0');
    block('CONSTRAINTS', p.constraints, u * .5, '#a3a3aa');
    if (p.followUp) {
      const a = clamp((t - at) / .4);
      const fl = this.layout(g, words(`Follow-up: ${p.followUp}`), cardW, u * .82);
      fl.forEach((ln, li) => this.text(g, ln.words.map((x) => x.w).join(' '), x0, y + u * .3 + li * u * 1.15, `italic 400 ${u * .82}px ${FONT.caption}`, a, 'left', ACCENT));
    }
    g.globalAlpha = 1;
  }

  private text(g: G, str: string, x: number, y: number, font: string, alpha: number, align: CanvasTextAlign = 'center', color = '#fff', spacing = '0px') {
    if (alpha <= .005) return;
    g.globalAlpha = alpha; g.fillStyle = color; g.font = font; g.textAlign = align;
    g.letterSpacing = spacing; g.fillText(str, x, y); g.letterSpacing = '0px';
  }

  private drawLabel(g: G, l: Lbl, alpha: number, hot = false) {
    const color = l.fail ? DANGER : l.accent || hot ? ACCENT : '#fff';
    if (l.ann) this.text(g, l.text, l.x, l.y, `500 ${l.ann.size}px ${FONT.mono}`, alpha * (l.ann.alpha ?? .95), 'center', color);
    else if (l.code) this.text(g, l.text, l.x, l.y, `400 17px ${FONT.mono}`, alpha * .92, 'left', l.accent ? ACCENT : '#e8e8ea');
    else this.text(g, l.text, l.x, l.y, `500 13px ${FONT.mono}`, alpha * (hot ? 1 : .72), 'center', color, '3px');
  }

  private drawLabels(g: G, hover: number, focus: Set<number> | null) {
    const outA = 1 - clamp((this.clock - this.prev.t) / .35);
    // Text that is identical in both steps (same words, same place) stays put. Fading the old
    // copy out while the new copy fades in made it look like it rendered twice.
    const key = (l: Lbl) => `${l.text}|${Math.round(l.x)}|${Math.round(l.y)}`;
    const now = this.labelsOf();
    const nowKeys = new Set(now.map(key)), prevKeys = new Set(this.prev.labels.map(key));
    for (const l of this.prev.labels) if (!nowKeys.has(key(l))) this.drawLabel(g, l, outA * .8);
    const inA = this.shapeT < 0 ? 0 : clamp((this.shapeT - this.labelDelay) / .6);
    let codeLine = 0;
    for (const l of now) {
      const dim = focus && l.item !== undefined && !focus.has(l.item) ? .35 : 1;
      const steady = prevKeys.has(key(l)) && this.pending < 0;
      // Code arrives one line at a time, so it reads like being written rather than a wall of text.
      const a = steady ? 1 : l.code ? (this.shapeT < 0 ? 0 : clamp((this.shapeT - this.labelDelay - codeLine++ * .45) / .4)) : inA;
      this.drawLabel(g, l, a * dim, hover >= 0 && l.item === hover);
    }
    // In the player the top bar names the lesson; videos have no top bar, so they carry the title.
    if (this.autoAnswer) this.text(g, this.lesson.title.toUpperCase(), 80, 64, `500 12px ${FONT.mono}`, .42, 'left', '#fff', '4px');
  }

  /** What the panel is saying now: the caption, a check's question, or its explanation. */
  private captionText(): string {
    const s = this.current, ans = this.answers.get(this.step);
    if (!s.check) return s.caption;
    if (!ans) return `${s.caption} ${s.check.question}`.trim();
    return `${ans.choice === s.check.answer ? '*Correct.*' : '*Not quite.*'} ${s.check.explain}`;
  }

  /** Lay out words centred on lines no wider than maxW, at font size `size` px. */
  private layout(g: G, ws: Word[], maxW: number, size: number) {
    const lines: { words: (Word & { x: number; width: number })[]; width: number }[] = [];
    let cur: (Word & { x: number; width: number })[] = [], width = 0;
    g.font = `400 ${size}px ${FONT.caption}`;
    const space = g.measureText(' ').width;
    for (const wd of ws) {
      g.font = `${wd.em ? 600 : 400} ${size}px ${FONT.caption}`;
      const ww = g.measureText(wd.w).width;
      if (cur.length && width + space + ww > maxW) { lines.push({ words: cur, width }); cur = []; width = 0; }
      cur.push({ ...wd, x: width + (cur.length ? space : 0), width: ww });
      width += (cur.length > 1 ? space : 0) + ww;
    }
    if (cur.length) lines.push({ words: cur, width });
    return lines;
  }

  /** Answer pills flowed into centred rows no wider than maxW. */
  private pillRows(g: G, options: string[], u: number, maxW: number) {
    g.font = `500 ${u * .56}px ${FONT.ui}`;
    const labels = options.map((t, i) => `${String.fromCharCode(65 + i)}   ${t}`);
    const widths = labels.map((t) => g.measureText(t).width + u * 1.3), gap = u * .4;
    const rows: { i: number; w: number }[][] = [[]];
    let used = 0;
    widths.forEach((wd, i) => {
      const row = rows[rows.length - 1];
      if (row.length && used + gap + wd > maxW) { rows.push([]); used = 0; }
      rows[rows.length - 1].push({ i, w: wd });
      used += (rows[rows.length - 1].length > 1 ? gap : 0) + wd;
    });
    return { labels, rows, gap, h: u * 1.25 };
  }

  /**
   * Panel geometry in canvas pixels: always exactly two caption lines tall, so it stays slim
   * and the stage above never jumps. Quick checks add a row for their answers on that step only.
   * Type is sized to the screen (never under 16 CSS px).
   */
  private panelLayout(g: G, w: number, h: number, dpr: number): PanelLayout {
    const chk = this.current.check;
    const key = `${w}x${h}x${dpr}x${chk ? this.step : -1}`;
    if (this.panelCache?.key === key) return this.panelCache.L;
    const u = Math.max(16 * dpr, Math.min(w / DW * CAP, h / DH * CAP));
    const padX = Math.max(u * 1.1, w * .06);
    const textW = Math.min(w - padX * 2, u * 42);
    const LHpx = u * LH / CAP;
    const capY = u * 1.15;                                     // first caption baseline, from the panel top
    const capEnd = capY + LHpx + u * .3;                       // two lines
    const optRows = chk ? this.pillRows(g, chk.options, u, textW).rows.length : 0;
    const optY = capEnd + u * .4;
    const optH = optRows ? optRows * (u * 1.25) + (optRows - 1) * u * .35 : 0;
    const height = (optRows ? optY + optH : capEnd) + u * .55;
    const L: PanelLayout = { u, padX, textW, top: h - height, height, capY, maxLines: 2, LH: LHpx, optY };
    this.panelCache = { key, L };
    return L;
  }

  /** Lines for a caption, with the type shrunk just enough (at most to 72%) to fit two lines. */
  private fitCaption(g: G, text: string, L: PanelLayout) {
    let size = L.u, lines = this.layout(g, words(text), L.textW, size);
    while (lines.length > L.maxLines && size > L.u * .72) { size *= .94; lines = this.layout(g, words(text), L.textW, size); }
    return { size, lines, lh: L.LH * size / L.u };
  }

  /**
   * The caption panel: white, full width, rounded top corners, its top edge set slightly in
   * from the sides so it reads as a surface leaning back. Drawn in canvas pixels.
   */
  private drawPanel(g: G, w: number, h: number, L: PanelLayout) {
    const s = this.current, u = L.u, top = L.top;
    // Slides down out of view while a question is on stage.
    g.setTransform(1, 0, 0, 1, 0, (1 - this.panelK) * (L.height + u * 4));
    const inset = Math.min(w * .035, u * 2.2), rad = u * 1.1;

    // Soft light thrown up onto the stage.
    const glow = g.createLinearGradient(0, top - u * 3, 0, top);
    glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(1, 'rgba(255,255,255,0.07)');
    g.globalAlpha = 1; g.fillStyle = glow;
    g.beginPath(); g.moveTo(inset * 2, top - u * 3); g.lineTo(w - inset * 2, top - u * 3); g.lineTo(w - inset, top); g.lineTo(inset, top); g.closePath(); g.fill();

    // The surface: narrower at the top, full width at the bottom, rounded top corners.
    const panel = () => {
      g.beginPath(); g.moveTo(0, h);
      g.arcTo(inset, top, w - inset, top, rad);
      g.arcTo(w - inset, top, w, h, rad);
      g.lineTo(w, h); g.closePath();
    };
    const face = g.createLinearGradient(0, top, 0, top + L.height);
    face.addColorStop(0, '#dedbd5'); face.addColorStop(.1, '#f2f0ec'); face.addColorStop(.45, '#ffffff'); face.addColorStop(1, '#fbfaf8');
    g.fillStyle = face; panel(); g.fill();
    // A bright rim along the top edge and a faint crease just under it.
    g.save(); panel(); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(1, u * .07);
    g.beginPath(); g.moveTo(inset + rad, top + g.lineWidth / 2); g.lineTo(w - inset - rad, top + g.lineWidth / 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(inset + rad, top + u * .5); g.lineTo(w - inset - rad, top + u * .5); g.stroke();
    g.restore();

    // The caption runs on its own clock, started once when the step begins. stepT0 restarts
    // when a `via` step's new shapes start building; using it here made captions type twice.
    const tc = this.clock - this.captionT0;

    // Caption: the previous one fades; the new one arrives word by word at reading pace.
    const outA = 1 - clamp((this.clock - this.prev.t) / .3);
    const ans = this.answers.get(this.step);
    // The same caption carried into the next step stays fully written instead of re-typing.
    const same = !ans && this.prev.caption === this.captionText();
    const tw = same ? 1e4 : tc - (ans ? ans.t - this.captionT0 : 0);
    const { size: cs, lines, lh } = this.fitCaption(g, this.captionText(), L);
    const y0 = top + L.capY + Math.max(0, L.maxLines - lines.length) * lh / 2;
    if (outA > 0 && this.prev.caption && !same) {
      const { size: ps, lines: pl, lh: plh } = this.fitCaption(g, this.prev.caption, L);
      const py0 = top + L.capY + Math.max(0, L.maxLines - pl.length) * plh / 2;
      pl.forEach((ln, li) => ln.words.forEach((wd) => this.text(g, wd.w, w / 2 - ln.width / 2 + wd.x, py0 + li * plh - (1 - outA) * u * .2,
        `${wd.em ? 600 : 400} ${ps}px ${FONT.caption}`, outA * .45, 'left', '#17171b')));
    }
    let k = 0;
    lines.forEach((ln, li) => ln.words.forEach((wd) => {
      const appear = .35 + k * WORD, wa = clamp((tw - appear) / .25);
      k++;
      if (wa <= 0) return;
      const x = w / 2 - ln.width / 2 + wd.x, y = y0 + li * lh;
      // Reading cursor: a soft highlight that sits on the word just arrived, then lets go.
      const fresh = clamp(1 - (tw - appear) / .6);
      if (fresh > 0) {
        g.globalAlpha = fresh * .22 * wa; g.fillStyle = ACCENT;
        g.beginPath(); g.roundRect(x - cs * .16, y - cs * .86, wd.width + cs * .32, cs * 1.16, cs * .22); g.fill();
      }
      this.text(g, wd.w, x, y + (1 - wa) * cs * .16, `${wd.em ? 600 : 400} ${cs}px ${FONT.caption}`, wa, 'left', wd.em ? INK_ACCENT : '#17171b');
    }));

    // Quick-check answers, once the question has been read.
    this.optRects = [];
    const chk = s.check;
    if (chk) {
      const optsA = ans ? 1 : clamp((tw - readTime(this.captionText()) + .2) / .5);
      const { labels, rows, gap, h: ph } = this.pillRows(g, chk.options, u, L.textW);
      rows.forEach((row, ri) => {
        let x = w / 2 - (row.reduce((a, b) => a + b.w, 0) + gap * (row.length - 1)) / 2;
        const y = top + L.optY + ri * (ph + u * .35);
        for (const { i, w: pw } of row) {
          const r = { x, y, w: pw, h: ph };
          this.optRects[i] = r;
          const correct = i === chk.answer, chosen = ans?.choice === i;
          g.globalAlpha = optsA * (ans && !correct && !chosen ? .5 : 1);
          g.fillStyle = ans ? (correct ? INK_ACCENT : chosen ? '#e4e2de' : '#ffffff') : '#f4f3f0';
          g.strokeStyle = ans && correct ? INK_ACCENT : 'rgba(30,25,15,0.2)'; g.lineWidth = Math.max(1, u * .045);
          g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, ph / 2); g.fill(); g.stroke();
          this.text(g, labels[i], r.x + r.w / 2, r.y + ph * .66, `${chosen || (ans && correct) ? 600 : 500} ${u * .56}px ${FONT.ui}`, g.globalAlpha, 'center',
            ans && correct ? '#ffffff' : chosen ? '#6b655a' : '#1d1b17');
          if (ans && chosen && !correct) {
            g.strokeStyle = '#6b655a'; g.beginPath(); g.moveTo(r.x + u * .5, r.y + ph / 2); g.lineTo(r.x + r.w - u * .5, r.y + ph / 2); g.stroke();
          }
          x += pw + gap;
        }
      });
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
  }
}

interface PanelLayout {
  u: number; padX: number; textW: number; top: number; height: number;
  capY: number; maxLines: number; LH: number; optY: number;
}
