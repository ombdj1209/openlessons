# Changelog

All notable changes are recorded here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

Nothing yet. Add a line here in your pull request.

## 0.1.0 (2026-10-09)

First public release as **OpenLessons**, under the Apache License 2.0.

### Added

* **Concepts:** new lesson *How DNS finds a website* (referral chain, caching, TTL, safe migrations)
* **AI Engineer** shelf with four RAG lessons:
  * *How RAG works, step by step*: chunks, embeddings, the vector map, nearest neighbours, prompts and citations
  * *When RAG breaks, and how to fix it*: contextual retrieval, hybrid keyword and vector search, reranking, grounded refusals, re-indexing, permission filters, and evaluation with Anthropic's published retrieval numbers
  * *Types of RAG: naive, advanced, modular*: query rewriting, HyDE, multi query, advanced RAG, routers
  * *Types of RAG: corrective, agentic, graph and more*: CRAG, Self RAG, agentic RAG, Graph RAG, multimodal and adaptive RAG
* Shapes `doc` (a document page) and `space` (an embedding map with search points, hits, wrong hits and a search radius)
* `authors` field: lesson writers are credited on library cards
* `lesson.schema.json`, generated from the schema, for autocomplete and live errors in VS Code
* Error page for missing or invalid lessons, and a crash boundary around the player
* Test suite (Vitest): every lesson validates, schema rules, shape stability, the README example, schema freshness
* GitHub Actions: CI on every pull request, and automatic deploy to GitHub Pages from `main`
* Open source files: README with demos, CONTRIBUTING, lesson format reference, architecture notes, code of conduct, security policy, issue and pull request templates, CODEOWNERS, Dependabot
* Social preview image, favicon and page metadata

### Changed

* Renamed the project from "Lessons" / `lesson-player` to **OpenLessons** / `openlessons`
* Lesson field `request` is now `question`: the learner's question, used in search
* The lesson schema is strict: unknown or misspelled keys are reported instead of ignored
* System design chapters are named after each topic (Many servers, A cache, ID blocks...) instead of repeating "Where it breaks" and "Fix it"
* The video exporter loads on first export; the initial download dropped from 245 kB to 197 kB gzipped
* The production build uses relative paths, so it runs from any folder or host

### Removed

* The unused SVG and GSAP lesson engine with its actions, ELK graph layout and SVG exporter (every lesson uses the dot engine). Drops the `gsap` and `elkjs` dependencies
* The unused "think about it first" pause and its button
* Unused web fonts and styles

### Fixed

* The chapter bar overflowed into the playback controls on lessons with many chapters; it now scrolls and keeps the current chapter in view
* Buttons in the player no longer wrap their labels onto two lines

## Development history before 0.1.0

### 2026-10-08

* **System design rebuilt as growing systems.** URL shortener, rate limiter, chat app, news feed and ride hailing lessons now start with one server, fail visibly under load, and add one fix at a time
* **Engine:** fixed `spacing` keeps unchanged parts perfectly still between steps; `fail` draws a part in red; flows can `fail` and `drop` to show refused requests
* **New shapes:** `bars`, `intervals`, `grid` and `bucket`
* **Six new DSA lessons** from public company question lists (snapshot of June 2025): Longest Substring Without Repeating Characters, 3Sum, Container With Most Water, Merge Intervals, LRU Cache, Top K Frequent Elements
* **Lesson style:** removed the "say your first idea" pause; replaced generic "three ways" comparisons with *If the rules change*, which ties each alternative to the condition where it wins
* **First lessons:** Two Sum, Binary Search, Kadane's algorithm, Floyd's cycle detection, Trapping Rain Water, How data moves, Production system design, OAuth token refresh
* **Player:** particle engine, problem cards, plain English cards, quick checks, chapters, notes on hover, progress, company filter, MP4 export
