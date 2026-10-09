import type { z } from 'zod';

export interface Box { x: number; y: number; w: number; h: number }

/** Everything an action may touch while it adds tweens to its timeline. */
export interface Ctx {
  sceneId: string;
  svg: SVGSVGElement;
  /** Element by its lesson-file id (scene prefix handled for you). Throws if missing. */
  el(id: string): SVGGraphicsElement;
  has(id: string): boolean;
  /** Bounding box in the scene's root user units, transforms included. */
  bbox(el: Element): Box;
  /** Converts a basic shape to a <path> so it can be morphed. */
  toPath(el: Element): SVGPathElement;
  camera: { home: Box; current: Box };
  /** Opacity bookkeeping: rendered opacity = shown × dim. */
  shown: Map<Element, number>;
  dim: Map<Element, number>;
  /** Free scratch space for actions that need to remember things within a scene. */
  state: Map<string, unknown>;
  /** The following scene, set only for `morphTo`. */
  next?: Ctx;
  stageAspect: number;
}

export interface ActionDef<P = any> {
  name: string;
  params: z.ZodType<P>;
  /** Element ids the step points at; validation checks each exists in the scene. */
  refs?: (p: P) => string[];
  /** Add tweens to `tl` only. No timers, no rAF: the timeline must stay seekable. */
  build(tl: gsap.core.Timeline, ctx: Ctx, p: P): void;
}

export function defineAction<S extends z.ZodType>(def: {
  name: string;
  params: S;
  refs?: (p: z.output<S>) => string[];
  build(tl: gsap.core.Timeline, ctx: Ctx, p: z.output<S>): void;
}): ActionDef<z.output<S>> {
  return def as unknown as ActionDef<z.output<S>>;
}
