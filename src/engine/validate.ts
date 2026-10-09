import type { z } from 'zod';
import type { ActionDef } from './action';
import { builtins } from './actions';
import { DotsLesson } from '../dots/schema';
import { Lesson, edgeId, type Scene, type Step } from './schema';

/** A lesson folder as raw files. The app builds this from Vite globs, the CLI from disk. */
export interface LessonSource {
  slug: string;
  /** The category folder the lesson sits in (DSA, System Design, Concepts…). */
  category?: string;
  json: string;
  /** Keyed by path relative to the lesson folder, e.g. "scenes/overview.svg". */
  svgs: Record<string, string>;
  /** Custom actions keyed by file name (= action name). */
  actions: Record<string, ActionDef>;
  /** Raw source of custom action files, for the banned-API check. */
  actionSources: Record<string, string>;
}

export interface Issue { path: string; message: string }

export interface Checked {
  lesson?: Lesson;
  /** Set instead of `lesson` for `"engine": "dots"` lessons. */
  dots?: DotsLesson;
  issues: Issue[];
  /** Scene ids with problems; the player skips them and plays the rest. */
  badScenes: Set<string>;
}

const BANNED = /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/;

export function svgIds(svg: string): Set<string> {
  return new Set([...svg.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
}

export function sceneIds(scene: Scene, src: LessonSource): Set<string> | undefined {
  if (scene.kind === 'svg') {
    const svg = src.svgs[scene.src.replace(/^\.\//, '')];
    return svg === undefined ? undefined : svgIds(svg);
  }
  return new Set([
    ...scene.nodes.flatMap((n) => [n.id, `${n.id}-name`, `${n.id}-sub`]),
    ...scene.edges.map(edgeId),
  ]);
}

/** Which action a step runs and with what params. */
export function resolveStep(step: Step, actions: Record<string, ActionDef>):
  { def?: ActionDef; params: unknown; name: string } {
  if (step.do === 'custom') {
    const name = String(step.action ?? '');
    return { def: actions[name], params: step.params ?? {}, name };
  }
  const { do: name, at: _at, ...params } = step;
  return { def: builtins[name], params, name };
}

const zodPath = (base: string, e: z.core.$ZodIssue) =>
  e.path.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)), base);

export function validate(src: LessonSource): Checked {
  const issues: Issue[] = [];
  const badScenes = new Set<string>();

  for (const [name, code] of Object.entries(src.actionSources)) {
    if (BANNED.test(code)) {
      issues.push({ path: `actions/${name}.ts`, message: 'timers and requestAnimationFrame are not allowed; add tweens to the timeline instead' });
    }
  }

  let raw: unknown;
  try { raw = JSON.parse(src.json); } catch (e) {
    return { issues: [{ path: 'lesson.json', message: `invalid JSON: ${(e as Error).message}` }], badScenes };
  }
  if ((raw as { engine?: string } | null)?.engine === 'dots') {
    const d = DotsLesson.safeParse(raw);
    if (!d.success) {
      for (const e of d.error.issues) issues.push({ path: zodPath('', e) || '(root)', message: e.message });
      return { issues, badScenes };
    }
    return { dots: d.data, issues, badScenes };
  }

  const parsed = Lesson.safeParse(raw);
  if (!parsed.success) {
    for (const e of parsed.error.issues) issues.push({ path: zodPath('', e) || '(root)', message: e.message });
    return { issues, badScenes };
  }
  const lesson = parsed.data;

  const seen = new Set<string>();
  lesson.scenes.forEach((scene, si) => {
    const at = `scenes[${si}]`;
    const fail = (path: string, message: string) => { issues.push({ path, message }); badScenes.add(scene.id); };
    if (seen.has(scene.id)) fail(`${at}.id`, `duplicate scene id "${scene.id}"`);
    seen.add(scene.id);

    const ids = sceneIds(scene, src);
    if (!ids) { fail(`${at}.src`, `file "${scene.kind === 'svg' ? scene.src : ''}" not found`); return; }
    const where = scene.kind === 'svg' ? scene.src : `scene "${scene.id}"`;

    if (scene.kind === 'graph') {
      const nodes = new Set(scene.nodes.map((n) => n.id));
      scene.edges.forEach((e, ei) => {
        for (const end of [e.from, e.to] as const) {
          if (!nodes.has(end)) fail(`${at}.edges[${ei}]`, `edge end "${end}" is not a node`);
        }
      });
    }
    for (const noteId of Object.keys(scene.notes)) {
      if (!ids.has(noteId)) fail(`${at}.notes.${noteId}`, `"${noteId}" not found in ${where}`);
    }

    scene.timeline.forEach((step, ti) => {
      const sp = `${at}.timeline[${ti}]`;
      const { def, params, name } = resolveStep(step, src.actions);
      if (!def) {
        fail(sp, step.do === 'custom' ? `custom action "${name}" not found in actions/` : `unknown action "${name}"`);
        return;
      }
      const p = def.params.safeParse(params);
      if (!p.success) {
        for (const e of p.error.issues) fail(zodPath(sp, e), e.message);
        return;
      }
      for (const ref of def.refs?.(p.data) ?? []) {
        if (!ids.has(ref)) fail(sp, `"${ref}" not found in ${where}`);
      }
      if (name === 'morphTo') {
        const next = lesson.scenes[si + 1];
        const target = (p.data as { scene: string }).scene;
        if (ti !== scene.timeline.length - 1) fail(sp, 'morphTo must be the last step of its scene');
        if (!next || next.id !== target) fail(sp, `morphTo scene must be the next scene${next ? ` ("${next.id}")` : ''}`);
        else {
          const nextIds = sceneIds(next, src);
          for (const ref of (p.data as { shared?: string[] }).shared ?? []) {
            if (nextIds && !nextIds.has(ref)) fail(sp, `shared "${ref}" not found in scene "${next.id}"`);
          }
        }
      }
    });
  });

  return { lesson, issues, badScenes };
}
