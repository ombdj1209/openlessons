import type { z } from 'zod';
import { Lesson } from './dots/schema';

/** A lesson file as raw text. The app reads it through Vite, the CLI and tests read it from disk. */
export interface LessonSource {
  slug: string;
  /** The folder the lesson sits in: DSA, System Design, AI Engineer… */
  category: string;
  json: string;
}

export interface Issue { path: string; message: string }

const zodPath = (e: z.core.$ZodIssue) =>
  e.path.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)), '') || '(root)';

/** Parses and checks one lesson. Never throws: a broken lesson comes back as a list of issues. */
export function validate(src: LessonSource): { lesson?: Lesson; issues: Issue[] } {
  let raw: unknown;
  try { raw = JSON.parse(src.json); } catch (e) {
    return { issues: [{ path: 'lesson.json', message: `invalid JSON: ${(e as Error).message}` }] };
  }
  const parsed = Lesson.safeParse(raw);
  if (!parsed.success) return { issues: parsed.error.issues.map((e) => ({ path: zodPath(e), message: e.message })) };
  return { lesson: parsed.data, issues: [] };
}

/** Folder names must be stable URLs: lowercase words joined by hyphens, at most 48 characters. */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slugIssue = (slug: string): Issue | null =>
  SLUG.test(slug) && slug.length <= 48 ? null : { path: slug, message: 'folder name must be lowercase words joined by hyphens, at most 48 characters' };
