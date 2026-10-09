import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Lesson } from '../src/dots/schema';
import { validate } from '../src/validate';

const minimal = () => ({
  title: 'A tiny lesson',
  question: 'Does the smallest lesson load?',
  createdAt: '2026-10-09',
  steps: [{ caption: 'Hello.', form: { type: 'sphere' } }],
});
const check = (lesson: unknown) => validate({ slug: 'tiny', category: 'Test', json: JSON.stringify(lesson) });

describe('lesson schema', () => {
  it('accepts a minimal lesson and fills defaults', () => {
    const { lesson, issues } = check(minimal());
    expect(issues).toEqual([]);
    expect(lesson?.dots).toBe(960);
    expect(lesson?.steps[0].dur).toBe(6);
  });
  it('rejects unknown keys, so typos never pass silently', () => {
    const l = minimal() as Record<string, unknown>;
    (l.steps as Record<string, unknown>[])[0].captoin = 'typo';
    expect(check(l).issues.map((i) => i.message).join()).toMatch(/unrecognized/i);
  });
  it('requires a form on the first step', () => {
    const l = minimal();
    delete (l.steps[0] as { form?: unknown }).form;
    expect(check(l).issues[0].path).toBe('steps[0].form');
  });
  it('keeps captions to about two lines', () => {
    const l = minimal();
    l.steps[0].caption = 'x'.repeat(171);
    expect(check(l).issues[0].message).toMatch(/170/);
  });
  it('checks quick check answers point at an option', () => {
    const l = minimal() as { steps: Record<string, unknown>[] };
    l.steps.push({ caption: 'Quiz.', check: { question: 'Q?', options: ['a', 'b'], answer: 2, explain: 'Because.' } });
    expect(check(l).issues[0].message).toMatch(/answer/);
  });
  it('reports broken JSON instead of throwing', () => {
    expect(validate({ slug: 'x', category: 'y', json: '{ nope' }).issues[0].message).toMatch(/invalid JSON/);
  });
  it('ships an up to date lesson.schema.json (run npm run schema)', () => {
    const file = JSON.parse(readFileSync(join(__dirname, '..', 'lesson.schema.json'), 'utf8'));
    const fresh = JSON.parse(JSON.stringify(z.toJSONSchema(Lesson, { io: 'input' })));
    expect({ ...file, title: undefined, description: undefined }).toEqual({ ...fresh, title: undefined, description: undefined });
  });
});
