import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'ids use letters, digits, - and _');

export const Step = z.looseObject({
  do: z.string(),
  /** "+0.3" gap after previous, "-0.2" overlap, "<" start with previous. Default: after previous. */
  at: z.string().regex(/^([+-]\d+(\.\d+)?|<)$/, 'at must look like "+0.3", "-0.2" or "<"').optional(),
});
export type Step = z.infer<typeof Step>;

const sceneBase = {
  id,
  title: z.string().optional(),
  notes: z.record(z.string(), z.string()).default({}),
  timeline: z.array(Step),
};

export const GraphNode = z.object({
  id,
  label: z.string(),
  sub: z.string().optional(),
  accent: z.boolean().optional(),
});
export const GraphEdge = z.object({
  id: id.optional(),
  from: id,
  to: id,
  label: z.string().max(14).optional(),
  dashed: z.boolean().optional(),
});
export type GraphNode = z.infer<typeof GraphNode>;
export type GraphEdge = z.infer<typeof GraphEdge>;
export const edgeId = (e: GraphEdge) => e.id ?? `edge-${e.from}-${e.to}`;

export const SvgScene = z.object({ ...sceneBase, kind: z.literal('svg'), src: z.string() });
export const GraphScene = z.object({
  ...sceneBase,
  kind: z.literal('graph'),
  direction: z.enum(['RIGHT', 'DOWN']).default('RIGHT'),
  nodes: z.array(GraphNode).min(1),
  edges: z.array(GraphEdge).default([]),
});
export const Scene = z.discriminatedUnion('kind', [SvgScene, GraphScene]);
export type Scene = z.infer<typeof Scene>;

export const Lesson = z.object({
  title: z.string().min(1),
  request: z.string().min(1),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  scenes: z.array(Scene).min(1),
});
export type Lesson = z.infer<typeof Lesson>;
