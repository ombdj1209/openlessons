# Contributing to OpenLessons

Thank you for helping people learn. This guide takes you from an idea to a merged lesson, and covers code changes too.

* [Ways to help](#ways-to-help)
* [Set up](#set-up)
* [Write a lesson](#write-a-lesson)
* [What makes a lesson great](#what-makes-a-lesson-great)
* [Before you open a pull request](#before-you-open-a-pull-request)
* [Code changes](#code-changes)
* [Review and merging](#review-and-merging)

## Ways to help

* **Write a new lesson.** Check [open lesson requests](https://github.com/ombdj1209/openlessons/issues?q=is%3Aissue+is%3Aopen+label%3Alesson) or propose your own with the *Lesson request* template, so nobody duplicates work.
* **Fix a lesson.** A wrong fact, a confusing caption, a label that overlaps a shape. Small fixes are very welcome.
* **Improve the engine or player.** New shapes, accessibility, performance. Open an issue first for anything large.
* **Report a problem** with the *Bug report* template. Include the lesson link and step number.

## Set up

You need Node.js 20 or newer (the repo pins 22 in `.nvmrc`).

```bash
git clone https://github.com/<you>/openlessons.git
cd openlessons
npm install
npm run dev
```

The library opens at http://localhost:5173 and reloads whenever you save a lesson.

## Write a lesson

### 1. Create the folder

```
lessons/<Category>/<slug>/lesson.json
```

* **Category** is the shelf: `DSA`, `System Design`, `AI Engineer` or `Concepts`. A new category is just a new folder; mention it in your pull request.
* **slug** is the URL name: lowercase words joined by hyphens, at most 48 characters, unique across all categories. Example: `consistent-hashing-explained`.

### 2. Start from the minimal lesson

Copy the example from the [README](README.md#write-a-lesson). Keep the `$schema` line: VS Code then autocompletes every field and flags mistakes as you type.

Put your GitHub username in `authors`. That is how you are credited in the app.

### 3. Build it step by step

Each step has a **caption** (one idea, at most 170 characters) and usually a **form** (what the dots draw). If a step has no form, the previous picture stays and only the caption changes, which is perfect for quick checks.

The stage is 1600 by 900 units. Keep shapes and labels between y = 100 and y = 720; the caption panel owns the bottom.

The full reference for every field, all 23 shapes, flows, labels and checks is in [docs/LESSON_FORMAT.md](docs/LESSON_FORMAT.md).

### 4. Watch it, then check it

Open the lesson in `npm run dev` and watch every step at 1× speed. Then:

```bash
npm run check-lessons <slug>
```

## What makes a lesson great

These patterns are what make a lesson click. Reviewers look for them.

### For every lesson

* **One idea per step.** If a caption needs "and also", split the step.
* **Plain words first, the term second.** "a fast memory store, called a *cache*". Wrap key terms in `*asterisks*` so they light up.
* **Show, then tell.** The picture should already make the point before the caption finishes.
* **Ask, don't just tell.** Add one or two quick checks (`check`) at the moments that matter. Wrong options should be mistakes people really make. The explanation says *why*.
* **Be correct and cite.** Put sources for facts and numbers in your pull request description. Numbers must add up.
* **Short labels.** Labels are uppercase and small. Long sentences belong in captions or `note`s.

### For system design and concepts: grow the system

1. Start with the smallest thing that works, and show a request flowing through it.
2. Add real load until one part fails. Mark it `"fail": true` and send red, dropping flows (`"fail": true, "drop": true`) into it.
3. Name the fix in plain words, then add **only** the new part. Everything else keeps its exact `at` position.
4. Repeat for the next bottleneck. Close with trade offs ("if the rules change, use X") and a recap.

Set `"spacing": 8` and `"dots": 2400` on these lessons. With a fixed spacing, parts you did not change keep every dot still between steps, so the eye goes straight to what changed. Define each part's position once in your head (or a script) and reuse it.

### For algorithms

1. The problem card (`problem`) exactly as an interviewer reads it, then `plain` for what it really asks.
2. A small example and its answer.
3. The key idea, then walk the example step by step with `array`, `bars`, `map`, `intervals` and pointer `marks`. Trace it by hand; every state shown must be correct.
4. A quick check, then the code (labels with `"code": true`). Run the code.
5. **If the rules change:** two or three other methods, each tied to the condition where it wins (sorted input, tight memory, streaming data...). Never a generic "slow, medium, fast" list.

### Things to avoid

* Generic filler steps ("think about it first"), walls of text, or boxes that only hold sentences
* Inventing company names. `companies` only lists companies publicly reported to ask the question
* Copying text from paid courses or books. Explain it in your own words and cite the idea

## Before you open a pull request

```bash
npm run verify
```

This runs exactly what CI runs: typecheck, lesson checks, tests and a production build. Then:

* [ ] Watched every step of new or changed lessons
* [ ] `authors` includes your GitHub username
* [ ] Sources for facts are in the pull request description
* [ ] A line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for anything a learner would notice

Use a short, descriptive commit message, for example `Add consistent hashing lesson` or `Fix wrong TTL in DNS lesson`.

## Code changes

* **Lessons are data.** The engine must never execute anything from a lesson file.
* **Schema changes** go in `src/dots/schema.ts`. Run `npm run schema` to regenerate `lesson.schema.json`, and update [docs/LESSON_FORMAT.md](docs/LESSON_FORMAT.md). Every existing lesson must still pass.
* **New shapes** go in `src/dots/shapes.ts` and the `SHAPES` list. Add a test if the shape has logic, and use it in a lesson so reviewers can see it.
* **Keep it light.** Ask before adding a runtime dependency. The whole app is a static site with no backend; keep it that way.
* **Accessibility.** Controls need keyboard access and labels. Respect `prefers-reduced-motion` where you add CSS animation.
* **Style** follows the surrounding code: TypeScript strict mode, small functions, comments that explain *why*.

## Review and merging

A maintainer reviews every pull request (see `.github/CODEOWNERS`). Lessons are checked for correctness, clarity and the patterns above; expect a round of suggestions, especially on your first one. Once CI is green and a maintainer approves, it is merged and goes live on the next deploy.

By contributing, you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), and you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
