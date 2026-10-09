# Lesson format

Every lesson is one file, `lessons/<Category>/<slug>/lesson.json`. This page lists every field. The source of truth is [`src/dots/schema.ts`](../src/dots/schema.ts); [`lesson.schema.json`](../lesson.schema.json) is generated from it so editors can autocomplete.

The schema is **strict**: an unknown or misspelled key is an error, so typos never pass silently. Run `npm run check-lessons <slug>` to see every problem with its path, for example `steps[4].form.items[2].at: Required`.

* [The stage](#the-stage)
* [Lesson](#lesson)
* [Step](#step)
* [Forms](#forms)
* [Items and shapes](#items-and-shapes)
* [Flows](#flows)
* [Labels](#labels)
* [Quick checks](#quick-checks)
* [Problem card and plain English](#problem-card-and-plain-english)
* [Recipes](#recipes)

## The stage

Lessons are drawn on a 1600 × 900 stage (16:9), scaled to fit any screen. `[0, 0]` is the top left. The caption panel covers the bottom, so keep shapes and labels between **y = 100 and y = 720**. All positions in a lesson use these units.

## Lesson

| Field | Type | Default | Notes |
|---|---|---|---|
| `$schema` | string | | `"../../../lesson.schema.json"` for editor autocomplete |
| `title` | string | required | Shown on the card and the end screen |
| `question` | string | required | The question the lesson answers, in a learner's words. Searchable |
| `createdAt` | `YYYY-MM-DD` | required | Newest lessons sort first within a shelf |
| `tags` | string[] | `[]` | Searchable |
| `companies` | string[] | `[]` | Only companies publicly reported to ask this. Powers the "Asked at" filter |
| `authors` | string[] | `[]` | GitHub usernames, without `@`. Shown on the card |
| `difficulty` | `Easy` · `Medium` · `Hard` | | Badge on the card |
| `dots` | integer 300 to 2500 | `960` | How many dots the lesson owns. Bigger diagrams need more |
| `spacing` | number 4 to 40 | | Fixed distance between dots. Set it (8 works well) for growing diagrams so unchanged parts never move. See [Recipes](#a-system-that-grows) |
| `steps` | Step[] | required | At least one. The first step must have a `form` |

## Step

| Field | Type | Default | Notes |
|---|---|---|---|
| `caption` | string | required | At most 170 characters. Wrap key terms in `*asterisks*` to highlight them |
| `eyebrow` | string | | Small heading above the caption |
| `chapter` | string | | Starts a chapter in the top bar; carries forward until the next one. Use topic names ("A cache"), not repeated labels |
| `form` | Form | previous step's | What the dots draw. Omit it to keep the picture and change only the words |
| `labels` | Label[] | `[]` | Extra text on the stage |
| `focus` | string[] | | Item `id`s this step talks about; everything else dims |
| `via` | boolean | `false` | Fold back into a sphere before building this form. Use it when the scene changes completely |
| `dur` | seconds 2 to 30 | `6` | Minimum time on screen. The player also waits until the caption has been read |
| `panel` | boolean | `true` | `false` hides the caption panel (used by the opening problem card) |
| `check` | Check | | A quick check: the lesson waits for an answer |
| `problem` | Problem | | Interview problem card, see below |
| `plain` | Plain | | "What the interviewer is really asking", shown in yellow |

## Forms

Each `form` has a `type`.

| Type | Fields | Use for |
|---|---|---|
| `sphere` | `at` (default `[800, 410]`), `r` (default `150`) | Openings, recaps, transitions |
| `spheres` | `items`: up to 6 of `{ at, label?, id?, note? }`, `r` (default `90`) | Comparing a few things |
| `shapes` | `items`: Item[], `flows`: Flow[] | Everything else |

## Items and shapes

Every item has a `shape` and an `at` position (except `pipe`, which has a `path`).

### Fields every item accepts

| Field | Notes |
|---|---|
| `shape` | One of the 23 shapes below |
| `at` | `[x, y]` centre on the stage |
| `scale` | Size multiplier, default `1`, at most `4` |
| `id` | Name it so `focus` can refer to it |
| `label` | Small uppercase caption under the shape |
| `note` | Longer explanation, shown on hover or click |
| `accent` | Draw in orange: "look here", "this is new" |
| `fail` | Draw in red: "this part is breaking" |

### Shapes

| Shape | Draws | Extra fields |
|---|---|---|
| `laptop` `phone` `user` | Clients and people | |
| `server` | A rack of three units | |
| `database` | A cylinder | |
| `cloud` | A cloud (great for an AI model or external service) | |
| `globe` | The internet, a CDN, the web | |
| `lock` | Security, a lock, a reservation | |
| `box` | A rounded box | `w` (200), `h` (100), `text` (one short line) |
| `circle` | A circle, or a node with a value | `r` (60), `text` |
| `text` | Big text made of dots | `text` (use `\n` for a new line), `size` (96) |
| `pipe` | A connection line | `path`: `[[x, y], ...]`, `arrow` |
| `queue` | A queue of slots | `slots` (5), `filled` (3, filled from the right) |
| `table` | Rows of a database table | `rows` (8), `cols` (5), `lit` (row to highlight) |
| `tree` | A search tree index | `hot` (true lights a root to leaf path) |
| `array` | Cells with values and indexes | `values` (up to 16), `hi`, `dim`, `marks` |
| `map` | A two column key and value table | `entries`: `[[key, value], ...]` (up to 8), `head`: `[left, right]`, `hi`, `slots` |
| `bars` | Bars from numbers | `values` (numbers), `h` (300), `hi`, `dim`, `marks`, `span`: `[i, j]` shades the water between two bars |
| `intervals` | Ranges on a number line | `entries`: `[[start, end], ...]`, `w` (1000), `hi`, `dim` |
| `grid` | Map cells (geohash, quadtree) | `rows` (4), `cols` (4), `size` (96), `values` (cell text), `hi`, `dim` |
| `bucket` | A bucket of tokens | `slots` (8, capacity), `filled` |
| `doc` | A document page | `w` (130), `h` (170), `rows` (5 text lines), `hi` |
| `space` | A map of points, such as embeddings | `pts`: `[[x, y], ...]` on 0 to 100, `w` (380), `h` (260), `hi` (found), `bad` (wrong, red), `dim`, `marks`, `queries` (search points), `r` (search radius) |

**Highlighting:** `hi` lists indexes to light up, `dim` lists indexes to grey out. **Markers:** `marks` is `[{ "i": 2, "text": "left" }]`, an arrow under cell `i` (array, bars) or a tag above point `i` (space).

## Flows

Flows are dots travelling along a path, forever, while the step is on screen. They show requests, data and tokens moving.

| Field | Default | Notes |
|---|---|---|
| `path` | required | `[[x, y], ...]`, usually the same points as a `pipe` |
| `count` | `5` | Dots on the path at once (1 to 30) |
| `speed` | `0.5` | Trips per second |
| `phase` | `0` | Offset 0 to 1, so parallel flows don't march in step |
| `accent` | `true` | Orange; `false` for white background traffic |
| `fail` | `false` | Red: refused or failing requests |
| `drop` | `false` | Dots swell and fade at the end of the path: the request dies there |

`"fail": true, "drop": true` is the standard picture of rejected traffic.

## Labels

```json
{ "text": "TOP 3 NEAREST", "at": [1180, 400], "accent": true }
```

| Field | Notes |
|---|---|
| `text`, `at` | Required. Labels are centred on `at` and drawn in small uppercase |
| `accent` | Orange |
| `fail` | Red |
| `code` | Monospace, left aligned at `at`, for code and formulas. Space lines 36 units apart |

## Quick checks

```json
{
  "eyebrow": "Quick check",
  "caption": "Your turn.",
  "check": {
    "question": "Your total is −3 and the next number is 2. What's the new total?",
    "options": ["−1", "2", "5"],
    "answer": 1,
    "explain": "Start fresh at 2, because a negative total is *dead weight*."
  }
}
```

Two to four `options`; `answer` is the index of the right one. Learners click an option or press 1 to 4. In a video export the right answer is revealed after a pause.

## Problem card and plain English

The opening of most lessons:

```json
{
  "eyebrow": "The problem",
  "panel": false,
  "caption": "The interviewer reads you the problem.",
  "form": { "type": "shapes", "items": [{ "shape": "text", "at": [800, 168], "text": "TWO SUM", "size": 110 }] },
  "problem": {
    "statement": "Given an array of integers *nums* and an integer *target*, return the indices of the two numbers that add up to target.",
    "example": ["Input:  nums = [2, 7, 11, 15], target = 9", "Output: [0, 1]"],
    "constraints": ["2 <= nums.length <= 10^4"],
    "followUp": "Can you do it in better than O(n²)?"
  }
}
```

followed by

```json
{
  "eyebrow": "In plain English",
  "panel": false,
  "caption": "What the interviewer is really asking.",
  "plain": {
    "asking": "Find *two numbers* that add up to the target.",
    "points": ["*You get:* a list and a target.", "*You return:* their positions.", "*The catch:* look at each number once."]
  }
}
```

## Recipes

### A system that grows

Set `"dots": 2400, "spacing": 8`. Give every part one fixed position for the whole lesson, and in each step list only the parts that exist so far. A part that keeps its exact fields keeps every dot still; changing only `fail` or `accent` recolours it without moving it.

```json
{ "shape": "server", "at": [620, 430], "scale": 0.42, "label": "APP SERVER", "fail": true }
```

Pair each failing step with a flow such as `{ "path": [[170, 430], [572, 430]], "fail": true, "drop": true, "count": 14 }`, then add the fix in the next step.

### An algorithm walkthrough

Keep the same `array` (or `bars`, `map`) at the same `at` for every step, and change only `hi`, `dim` and `marks`. Put the running state in one label above it, for example `"total: 4 → 3 → 5 → 6   best: 6"`.

### Many dots, many parts

If a step needs more dots than `dots` allows at your `spacing`, the engine falls back to spreading dots evenly and that step loses its stillness. Raise `dots` (up to 2500) or `spacing`.
