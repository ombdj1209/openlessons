// Validates lesson folders the same way the app does. Usage: npm run check-lessons [slug]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ActionDef } from '../src/engine/action';
import { validate, type Issue } from '../src/engine/validate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'lessons');
const only = process.argv[2];
const list = (dir: string, ext: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)) : []);

// lessons/<Category>/<slug>/
const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const found = dirs(root).flatMap((cat) => dirs(join(root, cat)).map((slug) => ({ cat, slug })))
  .filter((l) => !only || l.slug === only);
if (only && !found.length) {
  console.error(`No lesson folder "${only}" in lessons/<Category>/`);
  process.exit(1);
}
const seenSlugs = new Set<string>();

let failed = 0;
const slugs = found.map((l) => l.slug);
for (const { cat, slug } of found) {
  const dir = join(root, cat, slug);
  const issues: Issue[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 48) {
    issues.push({ path: slug, message: 'folder name must be lowercase-hyphenated, ≤ 48 chars, taken from the request' });
  }
  if (seenSlugs.has(slug)) issues.push({ path: slug, message: 'another category already has a lesson with this folder name' });
  seenSlugs.add(slug);
  const jsonPath = join(dir, 'lesson.json');
  if (!existsSync(jsonPath)) {
    issues.push({ path: 'lesson.json', message: 'missing' });
  } else {
    const svgs = Object.fromEntries(list(join(dir, 'scenes'), '.svg').map((f) => [`scenes/${f}`, readFileSync(join(dir, 'scenes', f), 'utf8')]));
    const actions: Record<string, ActionDef> = {};
    const actionSources: Record<string, string> = {};
    for (const f of list(join(dir, 'actions'), '.ts')) {
      const name = f.replace(/\.ts$/, '');
      const file = join(dir, 'actions', f);
      actionSources[name] = readFileSync(file, 'utf8');
      try {
        const mod = await import(pathToFileURL(file).href);
        if (!mod.default?.build) throw new Error('default export must be defineAction({...})');
        actions[name] = mod.default;
      } catch (e) {
        issues.push({ path: `actions/${f}`, message: (e as Error).message });
      }
    }
    issues.push(...validate({ slug, json: readFileSync(jsonPath, 'utf8'), svgs, actions, actionSources }).issues);
  }

  if (issues.length) {
    failed++;
    console.log(`✕ ${cat} / ${slug}`);
    for (const i of issues) console.log(`    ${i.path}: ${i.message}`);
  } else {
    console.log(`✓ ${cat} / ${slug}`);
  }
}
console.log(`\n${slugs.length - failed}/${slugs.length} lessons OK`);
process.exit(failed ? 1 : 0);
