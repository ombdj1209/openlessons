import type { DotsLesson } from './dots/schema';
import type { ActionDef } from './engine/action';
import { graphSvg } from './engine/graph';
import { prepareSvg } from './engine/prepare';
import type { Lesson } from './engine/schema';
import { validate, type Issue, type LessonSource } from './engine/validate';

// Raw text, not JSON imports: a malformed lesson must show an error, not break the app.
// Lessons live in lessons/<Category>/<slug>/ (DSA, System Design, Concepts, …).
const jsons = import.meta.glob<string>('/lessons/*/*/lesson.json', { eager: true, query: '?raw', import: 'default' });
const svgs = import.meta.glob<string>('/lessons/*/*/scenes/*.svg', { eager: true, query: '?raw', import: 'default' });
const actionMods = import.meta.glob<ActionDef>('/lessons/*/*/actions/*.ts', { eager: true, import: 'default' });
const actionRaw = import.meta.glob<string>('/lessons/*/*/actions/*.ts', { eager: true, query: '?raw', import: 'default' });

const categoryOf = (path: string) => path.split('/')[2];
const slugOf = (path: string) => path.split('/')[3];
const rest = (path: string) => path.split('/').slice(4).join('/');
const nameOf = (path: string) => path.split('/').pop()!.replace(/\.ts$/, '');

export function lessonSources(): LessonSource[] {
  return Object.entries(jsons).map(([path, json]) => {
    const slug = slugOf(path);
    const mine = <T,>(rec: Record<string, T>) => Object.entries(rec).filter(([p]) => slugOf(p) === slug);
    return {
      slug,
      category: categoryOf(path),
      json,
      svgs: Object.fromEntries(mine(svgs).map(([p, v]) => [rest(p), v])),
      actions: Object.fromEntries(mine(actionMods).map(([p, v]) => [nameOf(p), v])),
      actionSources: Object.fromEntries(mine(actionRaw).map(([p, v]) => [nameOf(p), v])),
    };
  });
}

export interface PreparedScene { id: string; title: string; svg: string; notes: Record<string, string> }
export interface LoadedLesson {
  slug: string;
  category: string;
  lesson?: Lesson;
  dots?: DotsLesson;
  issues: Issue[];
  /** Valid scenes in lesson order, ids prefixed and ready to mount. */
  scenes: PreparedScene[];
  actions: Record<string, ActionDef>;
}

export async function loadLesson(src: LessonSource): Promise<LoadedLesson> {
  const { lesson, dots, issues, badScenes } = validate(src);
  const out: LoadedLesson = { slug: src.slug, category: src.category ?? 'Lessons', lesson, dots, issues: [...issues], scenes: [], actions: src.actions };
  if (!lesson) return out;
  for (const [i, scene] of lesson.scenes.entries()) {
    if (badScenes.has(scene.id)) continue;
    try {
      const raw = scene.kind === 'svg' ? src.svgs[scene.src.replace(/^\.\//, '')] : await graphSvg(scene, i + 1);
      out.scenes.push({ id: scene.id, title: scene.title ?? scene.id, svg: prepareSvg(raw, scene.id), notes: scene.notes });
    } catch (e) {
      out.issues.push({ path: `scenes[${i}]`, message: (e as Error).message });
    }
  }
  return out;
}

export const loadAll = () => Promise.all(lessonSources().map(loadLesson));

/** Library-facing facts that both lesson engines share. */
export function lessonInfo(l: LoadedLesson) {
  const m = l.dots ?? l.lesson;
  const steps = l.dots
    ? l.dots.steps.length
    : l.lesson?.scenes.filter((s) => l.scenes.some((p) => p.id === s.id))
      .reduce((n, s) => n + s.timeline.filter((t) => t.do === 'caption').length, 0) ?? 0;
  return {
    title: m?.title ?? l.slug,
    request: m?.request,
    tags: m?.tags ?? [],
    createdAt: m?.createdAt ?? '',
    steps,
    scenes: l.dots ? undefined : l.scenes.length,
    companies: l.dots?.companies ?? [],
    difficulty: l.dots?.difficulty,
  };
}
