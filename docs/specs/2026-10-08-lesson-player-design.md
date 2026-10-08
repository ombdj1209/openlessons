# Lesson Player — Design

**Date:** 2026-10-08
**Status:** draft, awaiting review

## 1. Purpose

Turn the static diagrams of the `diagram-design` skill into animated, captioned lessons for visual learning. A lesson walks through a concept scene by scene: overview, zoom into a component, animate *how it works* inside it, pull back to the result.

The app is a **player, library, and exporter**. It does not author lessons. Claude Code writes lesson files on request; the app plays them, remembers progress, and exports them to MP4.

### Success criteria

- A user asks Claude Code "explain how X works"; Claude writes a lesson folder, `npm run check-lessons` passes, and the lesson appears in the library without a restart.
- Playback is smooth (60fps on a typical laptop), pausable, scrubbable, and steppable by beat.
- The exported MP4 matches what the player shows, frame for frame.
- A broken lesson never crashes the app; it shows a precise error.

### Out of scope (v1)

Spoken narration (planned next), quizzes, in-app AI authoring, scene editor UI, accounts, cloud sync, mobile layout.

## 2. Stack

| Layer | Choice | Reason |
|---|---|---|
| App | Vite + React + TypeScript | Fast HMR; picks up lesson edits instantly |
| Animation | GSAP (core + MorphSVG, DrawSVG, MotionPath) | Seekable, deterministic timelines; one engine for play, scrub, and export |
| Auto-layout | elkjs in a Web Worker | Kind B scenes only |
| Schema | zod | Shared by app and CLI checker |
| Storage | IndexedDB (via `idb`) | Local progress; no backend |
| Video | WebCodecs + Mediabunny (MP4 muxing) | In-browser, frame-accurate, faster than real time |
| Tests | Vitest, Playwright | Unit + smoke + export |

No backend. No Remotion (company licence required).

## 3. Architecture

```
app/
  lessons/
    <lesson-slug>/
      lesson.json          title, request, tags, scenes[]
      scenes/*.svg         kind A scene art
      actions/*.ts         kind C custom actions (optional)
  src/
    library/               lesson grid, search, tag filter, progress badges
    player/                stage + camera, caption bar, controls, scene rail, note panel
    engine/
      schema.ts            zod schema for lesson.json
      build.ts             lesson -> one GSAP master timeline
      actions/             built-in action set
      layout/              ELK worker for kind B
      validate.ts          schema + target-existence checks
    export/                seek -> canvas -> WebCodecs -> MP4
    store/                 IndexedDB progress
  scripts/check-lessons.ts CLI wrapper over validate.ts
  .claude/skills/lesson-author/SKILL.md
```

**Data flow.** Vite discovers `lessons/*/lesson.json` with `import.meta.glob` (HMR on edit) → `validate` → `build` produces one master timeline → the player only plays or seeks that timeline → export seeks the same timeline frame by frame. One timeline means what you see is what you export.

## 4. Lesson naming

Lessons are named from the user's own request so they are easy to find later.

- **Folder slug:** derived from the request wording, lowercase, hyphenated, filler words dropped, ≤ 48 chars. "How does OAuth token refresh work?" → `how-oauth-token-refresh-works`.
- **Title:** the same phrasing in sentence case: "How OAuth token refresh works".
- **`request`:** the user's original sentence, verbatim, stored in `lesson.json`.
- **`createdAt`:** ISO date.
- **Collision:** if the slug exists and the user asked for a new lesson, append `-2`, `-3`; if they asked to revise, edit in place.
- **Search** in the library matches title, request, and tags.

## 5. Lesson format

```json
{
  "title": "How OAuth token refresh works",
  "request": "How does OAuth token refresh work?",
  "createdAt": "2026-10-08",
  "tags": ["auth", "web"],
  "scenes": [
    {
      "id": "overview",
      "kind": "svg",
      "src": "scenes/overview.svg",
      "notes": { "auth-service": "Issues and validates tokens." },
      "timeline": [
        { "do": "reveal", "targets": ["client", "gateway", "auth-service"], "stagger": 0.15 },
        { "do": "caption", "text": "A client calls the API through a gateway." },
        { "do": "zoom", "target": "auth-service", "pad": 40 },
        { "do": "caption", "text": "The gateway forwards the token to Auth." },
        { "do": "flowToken", "along": "edge-gateway-auth", "dur": 1.2 },
        { "do": "setState", "target": "auth-status", "state": "fail", "text": "✕ EXPIRED", "at": "+0.2" },
        { "do": "resetCamera" }
      ]
    }
  ]
}
```

### Scene kinds (Claude chooses per scene)

| Kind | `kind` | When | Content |
|---|---|---|---|
| A | `svg` | Default; editorial hand-placed layout | `src` to an SVG built with the diagram-design skill |
| B | `graph` | Large regular structures (≥ ~10 nodes, trees, dependency graphs) | `nodes[]`, `edges[]`, `direction`; ELK lays out, tokens style it; node ids become element ids |
| C | any + custom action | Mechanism the built-in set cannot express | `{ "do": "custom", "action": "tokenSwap", "params": {…} }` resolving to `actions/tokenSwap.ts` |

### Timing

Steps run sequentially by default. `at` accepts `"+N"` (gap after previous), `"-N"` (overlap), `"<"` (with previous). No absolute seconds.

### Built-in actions (v1)

| Group | Actions |
|---|---|
| Camera | `zoom` (target id or `rect`, `pad`), `resetCamera` |
| Emphasis | `focus` (dims all else), `pulse`, `highlight` (concept colour) |
| Appear | `reveal`, `hide` (optional `stagger`) |
| Movement | `drawPath`, `flowToken` (`along`, `count`, `dur`) |
| State | `swapLabel`, `countUp`, `setState` (state + required text), `morph` |
| Narrative | `caption` (defines a beat), `wait` |
| Scene change | `morphTo` (shared ids glide into the next scene; the rest cross-fades) |

### Custom actions (kind C)

```ts
export default defineAction({
  name: 'tokenSwap',
  params: z.object({ from: z.string(), to: z.string() }),
  build(tl, ctx, p) { /* add tweens to tl using ctx.el(id), ctx.tokens */ },
});
```

They may only add tweens to `tl`. An ESLint rule bans `setTimeout`, `setInterval`, and `requestAnimationFrame` under `lessons/`. A custom action reused in two lessons is promoted into `engine/actions/`.

### The "zoom then show how it works" pattern

zoom onto component → `focus` dims surroundings → `reveal` internal parts → mechanism (`flowToken`, `setState`, `countUp`, custom) → `caption` → `resetCamera` or `morphTo` with the result visible. The authoring skill teaches this as the default beat structure.

## 6. Player

- **Library:** card grid with first-scene still as thumbnail, title, duration, scene count, progress; search (title, request, tags) and tag filter; ⚠ badge for invalid lessons.
- **Stage:** SVG with camera (animated `viewBox`), scene rail with completion ticks, caption bar.
- **Controls:** play/pause, previous/next beat, scrubber with beat ticks, speed 0.5–2×; keys Space, ←/→ (beats), Home/End.
- **Explore:** while paused, clicking an element with a `notes` entry opens a side panel.
- **Smoothness:** animate only transforms, opacity, and SVG attributes; one shared easing set; camera eases, never cuts.
- **Theme:** light/dark from the diagram-design brand tokens.
- **Reduced motion:** storyboard view; each beat's end frame as a still with its caption.

## 7. Progress storage

IndexedDB store `progress`, keyed by slug: `{ position, beatsSeen: number[], completed, updatedAt }`. Reopening resumes at `position`. Percentage = `beatsSeen / totalBeats`. A lesson whose beat count changes keeps `position`, clamped.

## 8. Video export

Dialog: 720p / 1080p, 30 / 60 fps, captions burned in on/off. For each frame: `timeline.seek(t)` → serialize stage SVG (+ caption) → draw to `OffscreenCanvas` → `VideoEncoder` → Mediabunny MP4 muxer. Progress bar and cancel. Fonts are embedded before export starts. If WebCodecs is unavailable, the export button is disabled with an explanation.

## 9. Validation and errors

`validate(lesson)` checks schema, unknown actions, missing custom-action files, every `target`/`along`/`targets` id existing in its scene, and unique scene ids. Errors carry a path: `scenes[1].timeline[3].target "auth-svc" not found in scenes/overview.svg`.

- CLI: `npm run check-lessons [slug]` exits non-zero on errors.
- App: invalid lesson → library ⚠ + error panel in player; an invalid scene is skipped, the rest plays.
- Runtime exception in a custom action → that scene is skipped and the error is shown.

## 10. Authoring skill

`.claude/skills/lesson-author/SKILL.md` covers: lesson naming (§4), file format, action set, scene-kind choice, the zoom pattern, building kind A SVGs with the diagram-design skill (tokens, grid, connector rules), keeping each scene within diagram-design's complexity budget, and running `check-lessons` before reporting done.

## 11. Testing

- **Vitest:** schema accept/reject cases, timing resolution (`+N`, `<`), timeline duration, validation paths.
- **Determinism:** seek to t twice → identical stage DOM.
- **Playwright smoke:** load every lesson, seek to every beat, fail on console errors; export a 2-second clip and assert a non-empty MP4.
- **Sample lesson:** one shipped lesson using all three scene kinds, used by the tests.
