import type { Lesson } from './dots/schema';
import { validate, type Issue, type LessonSource } from './validate';

// Raw text, not JSON imports: a malformed lesson must show an error, not break the app.
// Lessons live in lessons/<Category>/<slug>/lesson.json.
const files = import.meta.glob<string>('/lessons/*/*/lesson.json', { eager: true, query: '?raw', import: 'default' });

export interface LoadedLesson {
  slug: string;
  category: string;
  /** Missing when the file is invalid; `issues` then says why. */
  lesson?: Lesson;
  issues: Issue[];
}

export function lessonSources(): LessonSource[] {
  return Object.entries(files).map(([path, json]) => {
    const [, , category, slug] = path.split('/');
    return { slug, category, json };
  });
}

export const loadAll = (): LoadedLesson[] =>
  lessonSources().map((src) => ({ slug: src.slug, category: src.category, ...validate(src) }));

/** What the library shows about a lesson, valid or not. */
export function lessonInfo(l: LoadedLesson) {
  const m = l.lesson;
  return {
    title: m?.title ?? l.slug,
    question: m?.question ?? '',
    tags: m?.tags ?? [],
    createdAt: m?.createdAt ?? '',
    steps: m?.steps.length ?? 0,
    companies: m?.companies ?? [],
    authors: m?.authors ?? [],
    difficulty: m?.difficulty,
  };
}
