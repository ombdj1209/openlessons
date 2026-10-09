// Writes lesson.schema.json from the zod schema, so editors can autocomplete and check lesson files.
// Usage: npm run schema   (CI fails if the committed file is out of date)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Lesson } from '../src/dots/schema';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'lesson.schema.json');
const schema = { ...z.toJSONSchema(Lesson, { io: 'input' }), title: 'OpenLessons lesson', description: 'One animated lesson: lessons/<Category>/<slug>/lesson.json' };
writeFileSync(out, JSON.stringify(schema, null, 2) + '\n');
console.log('wrote lesson.schema.json');
