import { z } from 'zod';
import { defineAction, type ActionDef, type Box, type Ctx } from './action';
import { color } from './tokens';

const id = z.string().min(1);
const dur = (d: number) => z.number().positive().max(30).default(d);
const EASE = 'power2.inOut';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SHAPES = 'rect,circle,ellipse,path,polygon,line,polyline';

// `data-mask` marks opaque paper rects behind tinted boxes; they never take a state colour.
const shapesOf = (el: Element) => (el.matches(SHAPES) ? [el] : [...el.querySelectorAll(SHAPES)].filter((s) => !s.hasAttribute('data-mask')));
const firstShape = (el: Element) => shapesOf(el)[0];
const textOf = (el: Element) => (el.matches('text') ? el : [...el.querySelectorAll('text')].pop());

const vb = (b: Box) => `${b.x} ${b.y} ${b.w} ${b.h}`;

/** Grow `box` to the home viewBox's aspect ratio around its centre, never tighter than 1/5 of home. */
export function fitBox(box: Box, home: Box): Box {
  const aspect = home.w / home.h;
  let w = Math.max(box.w, home.w / 5);
  let h = Math.max(box.h, home.h / 5);
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

function moveCamera(tl: gsap.core.Timeline, ctx: Ctx, to: Box, duration: number) {
  tl.fromTo(ctx.svg, { attr: { viewBox: vb(ctx.camera.current) } },
    { attr: { viewBox: vb(to) }, duration, ease: EASE, immediateRender: false });
  ctx.camera.current = to;
}

/** Opacity changes that compose: an element can be hidden/revealed and dimmed/undimmed independently. */
function fade(tl: gsap.core.Timeline, ctx: Ctx, els: Element[], change: { shown?: number; dim?: number },
  vars: { from?: gsap.TweenVars; to?: gsap.TweenVars; stagger?: number } = {}) {
  els.forEach((el, i) => {
    const s0 = ctx.shown.get(el) ?? 1, d0 = ctx.dim.get(el) ?? 1;
    const s1 = change.shown ?? s0, d1 = change.dim ?? d0;
    ctx.shown.set(el, s1);
    ctx.dim.set(el, d1);
    tl.fromTo(el, { opacity: s0 * d0, ...vars.from },
      { opacity: s1 * d1, duration: 0.5, ...vars.to, immediateRender: false },
      i === 0 ? 0 : `<${vars.stagger ?? 0}`);
  });
}

const targetsOf = (p: { target?: string; targets?: string[] }) => [...(p.target ? [p.target] : []), ...(p.targets ?? [])];
const oneOrMany = {
  target: id.optional(),
  targets: z.array(id).optional(),
};
const needsTarget = (p: { target?: string; targets?: string[] }) => targetsOf(p).length > 0;

/** Swap a label by cross-fading to a clone, so seeking backwards restores the old text. */
function swapText(tl: gsap.core.Timeline, ctx: Ctx, el: Element, text: string, fill: string | undefined, duration: number) {
  const original = textOf(el);
  if (!original) throw new Error(`#${el.id} has no <text> to change`);
  const key = `label:${original.id || el.id}`;
  const current = (ctx.state.get(key) as Element | undefined) ?? original;
  const next = current.cloneNode(true) as SVGTextElement;
  next.removeAttribute('id');
  next.textContent = text;
  if (fill) next.setAttribute('fill', fill);
  next.style.opacity = '0';
  current.after(next);
  ctx.state.set(key, next);
  tl.to(current, { opacity: 0, duration: duration / 2 })
    .fromTo(next, { opacity: 0 }, { opacity: 1, duration: duration / 2, immediateRender: false });
}

export const builtins: Record<string, ActionDef> = Object.fromEntries([
  defineAction({
    name: 'zoom',
    params: z.object({
      target: id.optional(),
      rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      pad: z.number().min(0).default(32),
      dur: dur(1),
    }).refine((p) => p.target || p.rect, 'zoom needs a target or a rect'),
    refs: (p) => (p.target ? [p.target] : []),
    build(tl, ctx, p) {
      const b = p.rect ? { x: p.rect[0], y: p.rect[1], w: p.rect[2], h: p.rect[3] } : ctx.bbox(ctx.el(p.target!));
      moveCamera(tl, ctx, fitBox({ x: b.x - p.pad, y: b.y - p.pad, w: b.w + 2 * p.pad, h: b.h + 2 * p.pad }, ctx.camera.home), p.dur);
    },
  }),
  defineAction({
    name: 'resetCamera',
    params: z.object({ dur: dur(1) }),
    build(tl, ctx, p) { moveCamera(tl, ctx, ctx.camera.home, p.dur); },
  }),
  defineAction({
    name: 'focus',
    params: z.object({ ...oneOrMany, dim: z.number().min(0).max(1).default(0.15), dur: dur(0.6) }).refine(needsTarget, 'focus needs target or targets'),
    refs: targetsOf,
    build(tl, ctx, p) {
      const keep = targetsOf(p).map((t) => ctx.el(t));
      const dimmed: Element[] = [];
      const walk = (node: Element) => {
        for (const child of node.children) {
          if (child.matches('defs,title,desc,style,[data-bg],[data-token]') || keep.includes(child as SVGGraphicsElement)) continue;
          if (keep.some((k) => child.contains(k))) walk(child);
          else dimmed.push(child);
        }
      };
      walk(ctx.svg);
      const undim = keep.filter((k) => (ctx.dim.get(k) ?? 1) !== 1);
      fade(tl, ctx, dimmed, { dim: p.dim }, { to: { duration: p.dur } });
      fade(tl, ctx, undim, { dim: 1 }, { to: { duration: p.dur } });
    },
  }),
  defineAction({
    name: 'unfocus',
    params: z.object({ dur: dur(0.5) }),
    build(tl, ctx, p) {
      const els = [...ctx.dim].filter(([, d]) => d !== 1).map(([el]) => el);
      fade(tl, ctx, els, { dim: 1 }, { to: { duration: p.dur } });
    },
  }),
  defineAction({
    name: 'reveal',
    params: z.object({ ...oneOrMany, stagger: z.number().min(0).default(0.12), dur: dur(0.5), y: z.number().default(8) }).refine(needsTarget, 'reveal needs target or targets'),
    refs: targetsOf,
    build(tl, ctx, p) {
      const els = targetsOf(p).map((t) => ctx.el(t));
      for (const el of els) {
        // First mention is a reveal: the element starts hidden. The static source still shows it.
        if (!ctx.shown.has(el)) { ctx.shown.set(el, 0); el.style.opacity = '0'; }
      }
      fade(tl, ctx, els, { shown: 1 }, { from: { y: p.y }, to: { y: 0, duration: p.dur, ease: 'power2.out' }, stagger: p.stagger });
    },
  }),
  defineAction({
    name: 'hide',
    params: z.object({ ...oneOrMany, stagger: z.number().min(0).default(0), dur: dur(0.4) }).refine(needsTarget, 'hide needs target or targets'),
    refs: targetsOf,
    build(tl, ctx, p) {
      fade(tl, ctx, targetsOf(p).map((t) => ctx.el(t)), { shown: 0 }, { to: { duration: p.dur }, stagger: p.stagger });
    },
  }),
  defineAction({
    name: 'pulse',
    params: z.object({ target: id, times: z.number().int().min(1).max(4).default(1), scale: z.number().min(1).max(1.3).default(1.06) }),
    refs: (p) => [p.target],
    build(tl, ctx, p) {
      tl.fromTo(ctx.el(p.target), { scale: 1 }, {
        scale: p.scale, transformOrigin: '50% 50%', duration: 0.22, yoyo: true, repeat: p.times * 2 - 1, ease: 'sine.inOut', immediateRender: false,
      });
    },
  }),
  defineAction({
    name: 'highlight',
    params: z.object({ target: id, color: z.string().default('accent'), dur: dur(0.4) }),
    refs: (p) => [p.target],
    build(tl, ctx, p) {
      tl.to(shapesOf(ctx.el(p.target)), { stroke: color(p.color), strokeWidth: 2, duration: p.dur });
    },
  }),
  defineAction({
    name: 'drawPath',
    params: z.object({ along: id, dur: dur(0.8) }),
    refs: (p) => [p.along],
    build(tl, ctx, p) {
      const path = firstShape(ctx.el(p.along));
      tl.fromTo(path, { drawSVG: '0%' }, { drawSVG: '100%', duration: p.dur, ease: 'power1.inOut' });
    },
  }),
  defineAction({
    name: 'flowToken',
    params: z.object({
      along: id, count: z.number().int().min(1).max(8).default(1), dur: dur(1.2),
      gap: z.number().min(0).default(0.35), color: z.string().default('accent'), r: z.number().positive().default(6),
      reverse: z.boolean().default(false),
    }),
    refs: (p) => [p.along],
    build(tl, ctx, p) {
      const path = firstShape(ctx.el(p.along)) as SVGPathElement;
      const along = (start: number, end: number) => ({ path, align: path, alignOrigin: [0.5, 0.5] as [number, number], start, end });
      const [a, b] = p.reverse ? [1, 0] : [0, 1];
      for (let i = 0; i < p.count; i++) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('r', String(p.r));
        dot.setAttribute('fill', color(p.color));
        dot.setAttribute('data-token', '');
        dot.setAttribute('aria-hidden', 'true');
        dot.style.opacity = '0';
        ctx.svg.appendChild(dot);
        const t0 = i * p.gap;
        tl.fromTo(dot, { opacity: 0 }, { opacity: 1, duration: 0.15, immediateRender: false }, t0)
          .fromTo(dot, { motionPath: along(a, a) },
            { motionPath: along(a, b), duration: p.dur, ease: 'power1.inOut', immediateRender: false }, t0)
          .to(dot, { opacity: 0, duration: 0.15 }, t0 + p.dur - 0.15);
      }
    },
  }),
  defineAction({
    name: 'swapLabel',
    params: z.object({ target: id, text: z.string(), color: z.string().optional(), dur: dur(0.4) }),
    refs: (p) => [p.target],
    build(tl, ctx, p) { swapText(tl, ctx, ctx.el(p.target), p.text, p.color && color(p.color), p.dur); },
  }),
  defineAction({
    name: 'setState',
    params: z.object({ target: id, state: z.enum(['pass', 'fail', 'warn', 'active', 'idle']), text: z.string().min(1), dur: dur(0.4) }),
    refs: (p) => [p.target],
    build(tl, ctx, p) {
      const el = ctx.el(p.target);
      const c = color(p.state);
      const shape = el.matches('text') ? undefined : firstShape(el);
      swapText(tl, ctx, el, p.text, c, p.dur);
      if (shape) tl.to(shape, { stroke: c, strokeWidth: 2, duration: p.dur }, 0);
    },
  }),
  defineAction({
    name: 'countUp',
    params: z.object({
      target: id, from: z.number().default(0), to: z.number(), dur: dur(1),
      decimals: z.number().int().min(0).max(4).default(0), prefix: z.string().default(''), suffix: z.string().default(''),
    }),
    refs: (p) => [p.target],
    build(tl, ctx, p) {
      const text = textOf(ctx.el(p.target));
      if (!text) throw new Error(`#${p.target} has no <text> to count`);
      const fmt = (v: number) => `${p.prefix}${v.toFixed(p.decimals)}${p.suffix}`;
      const proxy = { v: p.from };
      // Only the first count on an element sets its starting text; later counts continue from there.
      const key = `count:${p.target}`;
      if (!ctx.state.has(key)) { ctx.state.set(key, true); text.textContent = fmt(p.from); }
      tl.fromTo(proxy, { v: p.from }, {
        v: p.to, duration: p.dur, ease: 'power1.out', immediateRender: false,
        onUpdate: () => { text.textContent = fmt(proxy.v); },
      });
    },
  }),
  defineAction({
    name: 'morph',
    params: z.object({ target: id, to: id, dur: dur(0.8) }),
    refs: (p) => [p.target, p.to],
    build(tl, ctx, p) {
      const from = ctx.toPath(firstShape(ctx.el(p.target)));
      tl.to(from, { morphSVG: ctx.toPath(firstShape(ctx.el(p.to))), duration: p.dur, ease: EASE });
    },
  }),
  defineAction({
    name: 'caption',
    params: z.object({
      text: z.string().min(1),
      hold: z.number().min(0).max(10).optional(),
      /** Element the callout points at. Omitted: the next step's target. false: no pointer. */
      anchor: z.union([id, z.literal(false)]).optional(),
    }),
    refs: (p) => (typeof p.anchor === 'string' ? [p.anchor] : []),
    build(tl, _ctx, p) {
      tl.data = { caption: p.text, anchor: p.anchor };
      // Brief reading pause before the next step; longer captions pause a little longer.
      const words = p.text.split(/\s+/).length;
      tl.to({}, { duration: p.hold ?? Math.min(2, Math.max(0.6, words * 0.12)) });
    },
  }),
  defineAction({
    name: 'wait',
    params: z.object({ dur: dur(1) }),
    build(tl, _ctx, p) { tl.to({}, { duration: p.dur }); },
  }),
  defineAction({
    name: 'morphTo',
    params: z.object({ scene: id, shared: z.array(id).optional(), dur: dur(1) }),
    refs: (p) => p.shared ?? [],
    build(tl, ctx, p) {
      const next = ctx.next;
      if (!next) throw new Error('morphTo must be followed by a scene');
      const home = ctx.camera.home;
      if (vb(ctx.camera.current) !== vb(home)) moveCamera(tl, ctx, home, p.dur * 0.5);
      const ids = p.shared ?? sharedIds(ctx, next);
      const pairs = ids.map((i) => [ctx.el(i), next.el(i)] as const);
      const t = tl.duration();
      for (const [a, b] of pairs) {
        const ra = toStage(ctx, ctx.bbox(a)), rb = toStage(next, next.bbox(b));
        const s = scaleOf(ctx);
        tl.to(a, {
          x: (rb.cx - ra.cx) / s, y: (rb.cy - ra.cy) / s, scale: rb.w / ra.w,
          transformOrigin: '50% 50%', duration: p.dur, ease: EASE,
        }, t);
      }
      const keep = pairs.map(([a]) => a);
      const others = ([...ctx.svg.children] as Element[]).filter((c) => !c.matches('defs,title,desc,style,[data-bg]') && !keep.some((k) => c === k || c.contains(k)));
      tl.to(others, { opacity: 0, duration: p.dur * 0.6 }, t);
      tl.fromTo(next.svg, { opacity: 0 }, { opacity: 1, duration: 0.35, immediateRender: false }, t + p.dur);
      tl.to(ctx.svg, { opacity: 0, duration: 0.35 }, t + p.dur);
    },
  }),
].map((d) => [d.name, d as ActionDef]));

/** Ids present in both scenes, outermost only (a shared group carries its shared children). */
function sharedIds(a: Ctx, b: Ctx): string[] {
  const prefix = `${a.sceneId}__`;
  const els = [...a.svg.querySelectorAll('[id]')].filter((e) => !e.closest('defs') && !e.matches('[data-bg]'));
  const ids = els.map((e) => e.id.slice(prefix.length)).filter((i) => b.has(i));
  const chosen = new Set<Element>(ids.map((i) => a.el(i)));
  return ids.filter((i) => {
    for (let p: Element | null = a.el(i).parentElement; p && p !== a.svg; p = p.parentElement) {
      if (chosen.has(p)) return false;
    }
    return true;
  });
}

/** Scene user units → normalised stage units (stage height = 1), honouring xMidYMid meet. */
function scaleOf(ctx: Ctx) {
  const h = ctx.camera.home;
  return Math.min(ctx.stageAspect / h.w, 1 / h.h);
}
function toStage(ctx: Ctx, b: Box) {
  const h = ctx.camera.home, s = scaleOf(ctx);
  const ox = (ctx.stageAspect - h.w * s) / 2, oy = (1 - h.h * s) / 2;
  return { cx: (b.x + b.w / 2 - h.x) * s + ox, cy: (b.y + b.h / 2 - h.y) * s + oy, w: b.w * s };
}
