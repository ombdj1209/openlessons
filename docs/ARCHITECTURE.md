# Architecture

OpenLessons is a static single page app. There is no server: lessons are bundled at build time, progress lives in the browser, and video is encoded in the browser.

```
lesson.json ──► validate (zod) ──► DotEngine ──► <canvas>
                                        │
                                        ├──► Library thumbnails (one still frame)
                                        └──► exportDots ──► WebCodecs ──► MP4
```

## Modules

| Module | Role |
|---|---|
| `src/lessons.ts` | Collects every `lessons/*/*/lesson.json` with `import.meta.glob` as raw text, so a broken file becomes an error message instead of a broken build |
| `src/validate.ts` | Parses and validates one lesson; returns issues with paths. Shared by the app, the CLI and the tests |
| `src/dots/schema.ts` | The lesson schema (zod, strict). The single source of truth for the format |
| `src/dots/shapes.ts` | Turns each item into target points (position, radius, alpha, colour channel) |
| `src/dots/engine.ts` | `DotEngine`: the particle system, captions, checks, problem cards, hit testing, rendering |
| `src/dots/DotPlayer.tsx` | The full screen player: frame loop, input, notes, chapters, end screen, export dialog |
| `src/dots/exportDots.ts` | Replays a lesson with a fixed time step and encodes every frame to MP4. Loaded on first use |
| `src/Library.tsx` | Shelves, search, company filter, progress, live thumbnails |
| `src/store.ts` | Progress in IndexedDB, keyed by lesson slug |

## The engine in one page

**Dots never appear or disappear.** A lesson owns a fixed number of dots (`dots`). Every step describes a formation, and every dot is always travelling toward one target point in it.

**Shapes become points.** `shapes.ts` traces each item as outline points (bright) and fill points (faint) at a spacing `d`. Each point carries an owner (the item index, for hover and focus) and a colour channel: 0 ink, 1 accent, 2 failure red.

**Fitting the dots.** Without `spacing`, `fit()` binary searches the spacing so the formation uses every dot, trimming interior fill first so outlines stay intact. With `spacing`, `fixed()` samples at exactly that spacing and parks spare dots invisibly on existing points. Fixed sampling is deterministic, so an item with the same fields produces identical points in every step.

**Moving between formations.** `setForm()` assigns targets to dots. With fixed spacing it first matches every target that coincides with a dot's current target, and those dots get zero delay and zero curl: they do not move at all. The remaining targets take the nearest free dot, with a small delay that grows outward from the centre and a sideways curl, which gives the "burst" look. Flows are extra targets whose position is a function of time (`travel()`); `drop` fades a packet out near the end of its path.

**Time.** `update(dt)` advances one clock. Step durations come from reading time (about 0.23 seconds per word) or `dur`, whichever is longer. Quick checks hold the step until answered. Everything, including caption typing, is a pure function of the clock, so a replay with a fixed `dt` is frame identical.

**Rendering.** One 2D canvas. Dots are filled circles (accent and failure dots get a soft glow); text is drawn crisply on top: labels, values inside shapes, the problem card, the plain English card, and the caption panel with its quick check buttons. The stage is a 1600 × 900 design space scaled to the window.

## Validation everywhere

The same `validate()` runs in three places:

1. **In the app**: a broken lesson shows a ⚠ card and an error page listing each problem.
2. **On the command line**: `npm run check-lessons` for contributors.
3. **In CI**: `tests/lessons.test.ts` fails the build if any lesson is invalid, and the deploy workflow checks again before publishing.

`lesson.schema.json` is generated from the zod schema (`npm run schema`); a test fails if it is stale.

## Design decisions

* **Lessons are data, not code.** A lesson can only describe shapes, text and timing. Nothing in a lesson is executed, which keeps contributions safe to review and merge.
* **No backend.** Any static host can serve it, it works offline after the first load, and there is nothing to keep running or secure.
* **Canvas, not DOM or SVG.** Thousands of moving points at 60 fps need one draw surface, and the same renderer produces the video.
* **Strict schema.** Unknown keys are errors, so a typo in a contributed lesson is caught before review.
