// Validates lesson files exactly as the app does. Usage: npm run check-lessons [slug]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugIssue, validate, type Issue } from '../src/validate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'lessons');
const only = process.argv[2];

const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const found = dirs(root).flatMap((category) => dirs(join(root, category)).map((slug) => ({ category, slug })))
  .filter((l) => !only || l.slug === only);
if (only && !found.length) {
  console.error(`No lesson folder "${only}" in lessons/<Category>/`);
  process.exit(1);
}

const seen = new Set<string>();
let failed = 0;
for (const { category, slug } of found) {
  const issues: Issue[] = [];
  const bad = slugIssue(slug);
  if (bad) issues.push(bad);
  if (seen.has(slug)) issues.push({ path: slug, message: 'another category already has a lesson with this folder name' });
  seen.add(slug);
  const file = join(root, category, slug, 'lesson.json');
  if (!existsSync(file)) issues.push({ path: 'lesson.json', message: 'missing' });
  else issues.push(...validate({ slug, category, json: readFileSync(file, 'utf8') }).issues);

  if (issues.length) {
    failed++;
    console.log(`✕ ${category} / ${slug}`);
    for (const i of issues) console.log(`    ${i.path}: ${i.message}`);
  } else {
    console.log(`✓ ${category} / ${slug}`);
  }
}
console.log(`\n${found.length - failed}/${found.length} lessons OK`);
process.exit(failed ? 1 : 0);
