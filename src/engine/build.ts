import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { ActionDef, Box, Ctx } from './action';
import type { Lesson } from './schema';
import { resolveStep, type Issue } from './validate';

gsap.registerPlugin(DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin);

export const STAGE_ASPECT = 16 / 9;
const CROSSFADE = 0.5;
const TAIL = 0.6;

export interface Beat { t: number; text: string; scene: number; anchor: Element | null }
export interface SceneSpan { id: string; title: string; start: number; end: number }
export interface Caption { text: string; anchor: Element | null; beat: number }
export interface Built {
  tl: gsap.core.Timeline;
  beats: Beat[];
  scenes: SceneSpan[];
  /** Runtime failures (e.g. a custom action that threw). Those steps are skipped. */
  errors: Issue[];
  /** The caption showing at time t (beat -1 and empty text between scenes). */
  captionAt(t: number): Caption;
}

/**
 * Which element a caption points at: its explicit `anchor`, else the first element
 * a following step in the same beat acts on. `false` means a free-standing caption.
 */
export function captionAnchors(timeline: Lesson['scenes'][number]['timeline'], actions: Record<string, ActionDef>): (string | null)[] {
  return timeline.map((step, ti) => {
    if (step.do !== 'caption') return null;
    if (step.anchor === false) return null;
    if (typeof step.anchor === 'string') return step.anchor;
    for (const later of timeline.slice(ti + 1)) {
      if (later.do === 'caption') break;
      const { def, params, name } = resolveStep(later, actions);
      if (!def || name === 'morphTo') continue;
      const p = def.params.safeParse(params);
      const ref = p.success ? def.refs?.(p.data)[0] : undefined;
      if (ref) return ref;
    }
    return null;
  });
}

/** "+0.3" → "+=0.3", "-0.2" → "-=0.2", "<" stays, undefined = after the previous step. */
export function position(at?: string): string | undefined {
  if (!at || at === '<') return at;
  return `${at[0]}=${at.slice(1)}`;
}

function parseViewBox(svg: SVGSVGElement): Box {
  const [x, y, w, h] = (svg.getAttribute('viewBox') ?? '0 0 960 540').split(/[\s,]+/).map(Number);
  return { x, y, w, h };
}

export function makeCtx(svg: SVGSVGElement, sceneId: string): Ctx {
  const home = parseViewBox(svg);
  const find = (id: string) => svg.querySelector<SVGGraphicsElement>(`#${CSS.escape(`${sceneId}__${id}`)}`);
  return {
    sceneId,
    svg,
    el(id) {
      const e = find(id);
      if (!e) throw new Error(`"${id}" not found in scene "${sceneId}"`);
      return e;
    },
    has: (id) => !!find(id),
    bbox(el) {
      const g = el as SVGGraphicsElement;
      const b = g.getBBox();
      const m = svg.getScreenCTM()!.inverse().multiply(g.getScreenCTM()!);
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
        .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    },
    toPath: (el) => (el.tagName === 'path' ? el : MorphSVGPlugin.convertToPath(el as SVGRectElement, true)[0]) as SVGPathElement,
    camera: { home, current: home },
    shown: new Map(),
    dim: new Map(),
    state: new Map(),
    stageAspect: STAGE_ASPECT,
  };
}

/**
 * Builds one paused master timeline for the playable scenes, whose prepared SVGs are
 * already mounted in `stage` as `svg[data-scene=<id>]`. Play, scrub and export all drive it.
 */
export function buildLesson(stage: Element, lesson: Lesson, playable: string[], actions: Record<string, ActionDef>): Built {
  const scenes = playable.map((id) => lesson.scenes.find((s) => s.id === id)!);
  const svgs = playable.map((id) => stage.querySelector<SVGSVGElement>(`svg[data-scene="${CSS.escape(id)}"]`)!);
  const ctxs = svgs.map((svg, i) => makeCtx(svg, playable[i]));
  svgs.forEach((svg, i) => { svg.style.opacity = i === 0 ? '1' : '0'; });

  const master = gsap.timeline({ paused: true });
  const beats: Beat[] = [];
  const spans: SceneSpan[] = [];
  const errors: Issue[] = [];
  const track: { t: number; text: string; anchor: Element | null }[] = [];
  let enteredByMorph = false;

  scenes.forEach((scene, i) => {
    const ctx = ctxs[i];
    if (i > 0 && !enteredByMorph) {
      master.fromTo(svgs[i - 1], { opacity: 1 }, { opacity: 0, duration: CROSSFADE, immediateRender: false })
        .fromTo(svgs[i], { opacity: 0 }, { opacity: 1, duration: CROSSFADE, immediateRender: false }, '<');
    }
    const start = master.duration();
    track.push({ t: start, text: '', anchor: null });
    enteredByMorph = false;

    const anchors = captionAnchors(scene.timeline, actions);
    const sceneTl = gsap.timeline();
    const captions: { tl: gsap.core.Timeline; text: string; anchor: Element | null }[] = [];
    scene.timeline.forEach((step, ti) => {
      const { def, params, name } = resolveStep(step, actions);
      const path = `scenes[${lesson.scenes.indexOf(scene)}].timeline[${ti}]`;
      if (!def) return;
      const parsed = def.params.safeParse(params);
      if (!parsed.success) return;
      if (name === 'morphTo') {
        // The target scene was skipped (invalid): fall back to the default crossfade.
        if (playable[i + 1] !== (parsed.data as { scene: string }).scene) return;
        ctx.next = ctxs[i + 1];
      }
      const sub = gsap.timeline();
      try {
        def.build(sub, ctx, parsed.data);
      } catch (e) {
        sub.kill();
        errors.push({ path, message: `${name} failed: ${(e as Error).message}` });
        return;
      }
      sceneTl.add(sub, position(step.at));
      if (sub.data?.caption) {
        const id = anchors[ti];
        captions.push({ tl: sub, text: sub.data.caption, anchor: id && ctx.has(id) ? ctx.el(id) : null });
      }
      if (name === 'morphTo') enteredByMorph = true;
    });
    master.add(sceneTl, start);
    for (const c of captions) {
      const t = start + c.tl.startTime();
      beats.push({ t, text: c.text, scene: i, anchor: c.anchor });
      track.push({ t, text: c.text, anchor: c.anchor });
    }
    spans.push({ id: scene.id, title: scene.title ?? scene.id, start: i === 0 ? 0 : start, end: master.duration() });
  });
  master.to({}, { duration: TAIL });
  spans[spans.length - 1].end = master.duration();
  for (let i = 0; i < spans.length - 1; i++) spans[i].end = spans[i + 1].start;

  beats.sort((a, b) => a.t - b.t);
  track.sort((a, b) => a.t - b.t);
  return {
    tl: master,
    beats,
    scenes: spans,
    errors,
    captionAt(t) {
      let cur: (typeof track)[number] | undefined;
      for (const c of track) { if (c.t <= t + 1e-6) cur = c; else break; }
      if (!cur?.text) return { text: '', anchor: null, beat: -1 };
      return { text: cur.text, anchor: cur.anchor, beat: beats.findIndex((b) => b.t === cur.t && b.text === cur.text) };
    },
  };
}
