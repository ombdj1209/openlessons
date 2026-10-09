import { z } from 'zod';

/** Design space every dots lesson is authored in (16:9). Captions own the band below y = 760. */
export const DW = 1600, DH = 900;

export const SHAPES = [
  'laptop', 'phone', 'server', 'database', 'user', 'cloud', 'lock', 'globe',
  'queue', 'table', 'tree', 'box', 'circle', 'text', 'pipe', 'array', 'map',
  'bars', 'intervals', 'grid', 'bucket', 'doc', 'space',
] as const;

const XY = z.tuple([z.number(), z.number()]);

export const DotItem = z.object({
  shape: z.enum(SHAPES),
  at: XY.optional(),
  scale: z.number().positive().max(4).default(1),
  id: z.string().optional(),
  label: z.string().optional(),
  note: z.string().optional(),
  accent: z.boolean().optional(),
  /** Drawn in red: the part that is breaking right now. */
  fail: z.boolean().optional(),
  // shape-specific
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  r: z.number().positive().optional(),
  text: z.string().optional(),
  size: z.number().positive().optional(),
  rows: z.number().int().min(1).max(14).optional(),
  cols: z.number().int().min(1).max(10).optional(),
  lit: z.number().int().min(-1).optional(),
  slots: z.number().int().min(1).max(10).optional(),
  filled: z.number().int().min(0).max(10).optional(),
  hot: z.boolean().optional(),
  path: z.array(XY).min(2).optional(),
  arrow: z.boolean().optional(),
  /** array: cell values; bars: heights; grid: cell text (row by row). entries: map rows of [key, value], or intervals as [start, end]. */
  values: z.array(z.union([z.string(), z.number()])).max(16).optional(), // 16 cells fit across at scale 0.7
  /** space: points on a 0–100 map (embeddings, geo…); queries: bright search points; bad: points drawn red; r: search radius in px. */
  pts: z.array(XY).max(80).optional(),
  queries: z.array(XY).max(4).optional(),
  bad: z.array(z.number().int().min(0)).optional(),
  /** bars: shade the water held between bars i and j (up to the shorter one). */
  span: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  entries: z.array(z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])])).max(8).optional(),
  head: z.tuple([z.string(), z.string()]).optional(),
  /** array cells / bars / intervals / grid cells / map rows to highlight. */
  hi: z.array(z.number().int().min(0)).optional(),
  /** array cells / bars / intervals / grid cells to grey out (ruled out, already processed). */
  dim: z.array(z.number().int().min(0)).optional(),
  /** array: pointer arrows under cells, e.g. { "i": 2, "text": "j" }. */
  marks: z.array(z.object({ i: z.number().int().min(0), text: z.string() })).optional(),
}).superRefine((it, ctx) => {
  if (it.shape === 'pipe' ? !it.path : !it.at) {
    ctx.addIssue({ code: 'custom', message: it.shape === 'pipe' ? 'pipe needs a path' : `${it.shape} needs at: [x, y]` });
  }
  if (it.shape === 'text' && !it.text) ctx.addIssue({ code: 'custom', message: 'text needs text' });
  if ((it.shape === 'array' || it.shape === 'bars') && !it.values?.length) ctx.addIssue({ code: 'custom', message: `${it.shape} needs values` });
  if (it.shape === 'bars' && it.values?.some((v) => !Number.isFinite(Number(v)))) ctx.addIssue({ code: 'custom', message: 'bars values must be numbers' });
  if (it.shape === 'space' && !it.pts?.length) ctx.addIssue({ code: 'custom', message: 'space needs pts' });
  if (it.shape === 'intervals' && (!it.entries?.length || it.entries.some(([a, b]) => !(Number(a) <= Number(b))))) {
    ctx.addIssue({ code: 'custom', message: 'intervals needs entries of [start, end] numbers with start <= end' });
  }
});
export type DotItem = z.infer<typeof DotItem>;

export const DotFlow = z.object({
  path: z.array(XY).min(2),
  count: z.number().int().min(1).max(30).default(5),
  speed: z.number().positive().max(3).default(0.5),
  accent: z.boolean().default(true),
  phase: z.number().default(0),
  /** Red packets: requests that are refused or failing. */
  fail: z.boolean().default(false),
  /** Packets fade out at the end of the path: the request dies there. */
  drop: z.boolean().default(false),
});

const Ball = z.object({ at: XY, label: z.string().optional(), id: z.string().optional(), note: z.string().optional() });

export const DotForm = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sphere'), at: XY.default([800, 410]), r: z.number().positive().max(400).default(150) }),
  z.object({ type: z.literal('spheres'), items: z.array(Ball).min(1).max(6), r: z.number().positive().max(300).default(90) }),
  z.object({ type: z.literal('shapes'), items: z.array(DotItem).min(1), flows: z.array(DotFlow).default([]) }),
]);
export type DotForm = z.infer<typeof DotForm>;

/** Retrieval practice: the lesson waits for an answer, then explains it. */
export const DotCheck = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
  answer: z.number().int().min(0),
  explain: z.string().min(1),
}).refine((c) => c.answer < c.options.length, 'answer must index into options');

export const DotStep = z.object({
  eyebrow: z.string().optional(),
  /** Words wrapped in *asterisks* are key terms and light up. */
  caption: z.string().min(1),
  /** Minimum seconds on screen; the engine also waits until the caption has been read. */
  dur: z.number().min(2).max(30).default(6),
  /** Gather back into the sphere before building this step's shapes. */
  via: z.boolean().default(false),
  /** Omit to keep the previous step's shapes in place (useful for checks). */
  form: DotForm.optional(),
  /** Item ids this step talks about; every other item dims. */
  focus: z.array(z.string()).optional(),
  /** false keeps the caption panel away, leaving the whole stage to the dots (e.g. the opening question). */
  panel: z.boolean().default(true),
  /** The problem exactly as an interviewer reads it, shown crisp on the stage under the dots. */
  problem: z.object({
    statement: z.string().min(1),
    example: z.array(z.string()).default([]),
    constraints: z.array(z.string()).default([]),
    followUp: z.string().optional(),
  }).optional(),
  /** What the interviewer is really asking, in simple English (shown in yellow, after the problem). */
  plain: z.object({
    asking: z.string().min(1),
    points: z.array(z.string()).default([]),
  }).optional(),
  /** A thinking pause: the lesson waits here until the learner moves on. */
  think: z.boolean().default(false),
  /** Chapter this step starts or belongs to (Problem, Approaches, Solution, Code…); carried forward. */
  chapter: z.string().optional(),
  check: DotCheck.optional(),
  /** Free text. `code: true` sets it left-aligned in monospace, for code and formulas. */
  labels: z.array(z.object({ text: z.string(), at: XY, accent: z.boolean().optional(), code: z.boolean().optional(), fail: z.boolean().optional() })).default([]),
});
export type DotStep = z.infer<typeof DotStep>;

export const DotsLesson = z.object({
  engine: z.literal('dots'),
  title: z.string().min(1),
  request: z.string().min(1),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  /** Companies publicly reported to ask this problem; shown as tags and used by the library filter. */
  companies: z.array(z.string()).default([]),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
  dots: z.number().int().min(300).max(2500).default(960),
  /**
   * Fixed dot spacing. Without it every step re-spaces all shapes to use every dot; with it a
   * part that is unchanged between steps keeps each dot exactly in place, so a growing system
   * diagram only moves what changed. Spare dots stay hidden.
   */
  spacing: z.number().min(4).max(40).optional(),
  steps: z.array(DotStep).min(1),
}).superRefine((l, ctx) => {
  if (!l.steps[0].form) ctx.addIssue({ code: 'custom', path: ['steps', 0, 'form'], message: 'the first step needs a form' });
  l.steps.forEach((s, i) => {
    if (s.caption.length > 170) ctx.addIssue({ code: 'custom', path: ['steps', i, 'caption'], message: 'keep captions under 170 characters (about two lines)' });
  });
});
export type DotsLesson = z.infer<typeof DotsLesson>;
