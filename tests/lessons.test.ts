// Every lesson in the repo must load in the app. This is the gate for contributed lessons.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { slugIssue, validate } from '../src/validate';

const root = join(__dirname, '..', 'lessons');
const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const all = dirs(root).flatMap((category) => dirs(join(root, category)).map((slug) => ({ category, slug })));

describe('lessons', () => {
  it('exist', () => expect(all.length).toBeGreaterThan(0));
  it('have unique folder names across categories', () => {
    expect(new Set(all.map((l) => l.slug)).size).toBe(all.length);
  });
  for (const { category, slug } of all) {
    it(`${category}/${slug} is valid`, () => {
      const json = readFileSync(join(root, category, slug, 'lesson.json'), 'utf8');
      expect(slugIssue(slug)).toBeNull();
      expect(validate({ slug, category, json }).issues).toEqual([]);
    });
  }
});
