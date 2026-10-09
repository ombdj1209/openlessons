import { useCallback, useEffect, useRef, useState } from 'react';
import { getProgress, saveProgress } from '../store';
import { DotEngine, loadFonts } from './engine';
import type { Lesson } from './schema';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Chapters from the steps' `chapter` fields (each carries forward until the next). */
function chaptersOf(lesson: Lesson) {
  const out: { name: string; start: number }[] = [];
  lesson.steps.forEach((s, i) => { if (s.chapter && s.chapter !== out[out.length - 1]?.name) out.push({ name: s.chapter, start: i }); });
  return out;
}

/** Full-screen, black, interactive player for dots lessons. */
export function DotPlayer({ slug, lesson, next }: { slug: string; lesson: Lesson; next?: { slug: string; title: string } | null }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const eng = useRef<DotEngine | null>(null);
  const cursor = useRef<[number, number] | null>(null);
  const lastMove = useRef(-1e9);
  const hoverRef = useRef(-1);
  const pinnedRef = useRef(-1);
  const seen = useRef(new Set<number>());
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState(-1);
  const [pinned, setPinned] = useState(-1);
  const [idle, setIdle] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [overControl, setOverControl] = useState(false);
  const [, tick] = useState(0); // re-render the note card while its item moves
  const [finished, setFinished] = useState(false);
  const idleTimer = useRef(0);
  const chapters = chaptersOf(lesson);
  const chapterIdx = chapters.reduce((c, ch, i) => (ch.start <= step ? i : c), -1);

  // Canvas fills the window at device resolution.
  useEffect(() => {
    const fit = () => {
      const cv = cvRef.current;
      if (!cv) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  // Engine + frame loop.
  useEffect(() => {
    const e = new DotEngine(lesson);
    eng.current = e;
    (window as unknown as { __dots?: DotEngine }).__dots = e; // handle for automated visual checks
    let raf = 0, last = performance.now(), dead = false, shownStep = -1, done = false;
    const save = (completed: boolean) => saveProgress({
      slug, position: completed ? 0 : e.step, beatsSeen: [...seen.current], completed, updatedAt: Date.now(),
    });
    (async () => {
      await loadFonts();
      const p = await getProgress(slug);
      if (dead) return;
      p?.beatsSeen.forEach((b) => seen.current.add(b));
      e.go(p && !p.completed ? Math.min(p.position, lesson.steps.length - 1) : 0);
      const loop = (now: number) => {
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        e.update(dt);
        const cv = cvRef.current;
        // The ripple follows a moving cursor and eases away ~0.5s after it stops.
        const cursorK = Math.max(0, Math.min(1, 1 - (now - lastMove.current - 500) / 700));
        if (cv) e.render(cv.getContext('2d')!, cv.width, cv.height, {
          cursor: cursor.current, cursorK, hover: pinnedRef.current >= 0 ? pinnedRef.current : hoverRef.current,
          dpr: cv.width / Math.max(1, cv.getBoundingClientRect().width),
        });
        if (e.step !== shownStep) {
          shownStep = e.step;
          seen.current.add(e.step);
          setStep(e.step);
          setPinned(-1); pinnedRef.current = -1;
          save(false);
        }
        if (!done && e.finished) { done = true; save(true); setFinished(true); }
        if (done && !e.finished) { done = false; setFinished(false); }
        if (pinnedRef.current >= 0 || hoverRef.current >= 0) tick((n) => (n + 1) % 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => { dead = true; cancelAnimationFrame(raf); if (e.step >= 0 && !done) save(false); };
  }, [lesson, slug]);

  useEffect(() => { if (eng.current) eng.current.paused = paused || exporting; }, [paused, exporting]);
  useEffect(() => { if (eng.current) eng.current.speed = speed; }, [speed]);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2600);
  }, []);
  useEffect(() => { wake(); return () => clearTimeout(idleTimer.current); }, [wake]);

  const go = useCallback((k: number) => { eng.current?.go(k); }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  const unpin = () => { setPinned(-1); pinnedRef.current = -1; };

  useEffect(() => {
    if (exporting) return;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as Element).matches('input, select, textarea') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const e = eng.current;
      if (!e) return;
      const map: Record<string, () => void> = {
        ' ': () => setPaused((p) => !p),
        ArrowRight: () => go(e.step + 1), ArrowLeft: () => go(e.step - 1),
        Home: () => go(0), End: () => go(lesson.steps.length - 1),
        r: () => go(0), R: () => go(0), f: toggleFull, F: toggleFull,
        Escape: unpin,
        // Quick-check answers.
        1: () => e.choose(0), 2: () => e.choose(1), 3: () => e.choose(2), 4: () => e.choose(3),
      };
      if (map[ev.key]) { ev.preventDefault(); map[ev.key](); wake(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [exporting, go, lesson.steps.length, wake]);

  /** Pointer position in canvas pixels (the caption panel works in these). */
  const canvasPx = (ev: React.MouseEvent): [number, number] => {
    const cv = cvRef.current!, rect = cv.getBoundingClientRect();
    return [(ev.clientX - rect.left) * (cv.width / rect.width), (ev.clientY - rect.top) * (cv.height / rect.height)];
  };
  const onMove = (ev: React.MouseEvent) => {
    wake();
    const e = eng.current;
    if (!e) return;
    const [px, py] = canvasPx(ev);
    const d = e.toDesign(px, py);
    cursor.current = d;
    lastMove.current = performance.now();
    const h = e.hitItem(d[0], d[1]);
    if (h !== hoverRef.current) { hoverRef.current = h; setHover(h); }
    const over = e.optionAt(px, py) >= 0 || e.segmentAt(px, py) >= 0;
    if (over !== overControl) setOverControl(over);
  };
  const onLeave = () => { cursor.current = null; hoverRef.current = -1; setHover(-1); };
  const onClick = (ev: React.MouseEvent) => {
    const e = eng.current;
    if (!e) return;
    const [px, py] = canvasPx(ev);
    const [dx, dy] = e.toDesign(px, py);
    const opt = e.optionAt(px, py);
    if (opt >= 0) { e.choose(opt); return; }
    const seg = e.segmentAt(px, py);
    if (seg >= 0) { unpin(); go(seg); return; }
    if (e.waitingForAnswer) return; // a stray tap never skips an unanswered question
    const h = e.hitItem(dx, dy);
    if (h >= 0 && e.items[h]?.note) {
      if (pinnedRef.current === h) unpin(); else { setPinned(h); pinnedRef.current = h; setPaused(true); }
      return;
    }
    if (pinnedRef.current >= 0) { unpin(); return; }
    go(e.step + 1);
  };

  // Note card beside the hovered or pinned item.
  const e = eng.current, focus = pinned >= 0 ? pinned : hover, item = e && focus >= 0 ? e.items[focus] : undefined;
  let card: React.ReactNode = null;
  if (e && item?.note && cvRef.current) {
    const cv = cvRef.current, k = cv.getBoundingClientRect().width / cv.width;
    const [rx, ty] = e.toScreen(item.box.x2, item.box.y1), [lx] = e.toScreen(item.box.x1, 0);
    // Beside the item when there's room; on narrow screens, a sheet across the top.
    const cw = Math.min(320, innerWidth - 32), right = rx * k + 24, left = lx * k - 24 - cw;
    const x = innerWidth < 640 ? 16 : right + cw < innerWidth - 16 ? right : Math.max(16, left);
    const y = innerWidth < 640 ? 72 : Math.max(16, ty * k);
    card = (
      <aside className="dot-note" style={{ left: x, top: y, width: cw }} role="dialog" aria-label={item.label ?? 'Note'}>
        {item.label && <span className="dot-note-label">{item.label}</span>}
        <p>{item.note}</p>
        {pinned >= 0 && <span className="dot-note-hint">click anywhere to close</span>}
      </aside>
    );
  }

  return (
    <div className={`dot-player ${idle && !paused ? 'idle' : ''} ${(focus >= 0 && item?.note) || overControl ? 'pointing' : ''}`} onMouseMove={onMove}>
      <canvas ref={cvRef} className="dot-canvas" onClick={onClick} onMouseLeave={onLeave} onDoubleClick={toggleFull}
        aria-label={`${lesson.title}. Step ${step + 1} of ${lesson.steps.length}: ${lesson.steps[step]?.caption}`} />
      <p className="sr-only" aria-live="polite">{lesson.steps[step]?.caption}</p>
      {card}

      <div className="dot-top">
        <div className="dot-top-left">
          <a href="#/" className="dot-btn ghost">← Library</a>
          {/* Where you are: chapters you can jump to, plus the step count. */}
          {chapters.length > 1 && (
            <nav className="dot-chapters" aria-label="Chapters">
              {chapters.map((c, i) => (
                <button key={c.name} className={`dot-chapter ${i === chapterIdx ? 'on' : ''} ${i < chapterIdx ? 'done' : ''}`}
                  aria-current={i === chapterIdx ? 'step' : undefined} onClick={() => go(c.start)}>{c.name}</button>
              ))}
            </nav>
          )}
          <span className="dot-count">{step + 1} / {lesson.steps.length}</span>
        </div>
        <div className="dot-top-right">
          <div className="dot-controls" role="group" aria-label="Playback">
            <button className="dot-round" onClick={() => go(step - 1)} aria-label="Previous step" title="Previous (←)">‹</button>
            <button className="dot-round main" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} title="Play / pause (Space)">
              {paused ? '▶' : '❚❚'}
            </button>
            <button className="dot-round" onClick={() => go(step + 1)} aria-label="Next step" title="Next (→)">›</button>
          </div>
          <select className="dot-btn" value={speed} onChange={(ev) => setSpeed(Number(ev.target.value))} aria-label="Speed">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <button className="dot-btn" onClick={() => { setPaused(true); setExporting(true); }} disabled={typeof VideoEncoder === 'undefined'}
            title={typeof VideoEncoder === 'undefined' ? 'Video export needs Chrome or Edge' : 'Export as MP4'}>Export video</button>
          <button className="dot-btn" onClick={toggleFull} title="Full screen (F)">⤢</button>
        </div>
      </div>

      {finished && (
        <div className="dot-end" role="dialog" aria-label="Lesson complete">
          <div className="dot-end-card">
            <span className="dot-note-label">Lesson complete ✓</span>
            <h2>{lesson.title}</h2>
            <p className="dot-end-take">{lesson.steps[lesson.steps.length - 1].caption.replace(/\*/g, '')}</p>
            <div className="dot-end-actions">
              {next && <a className="dot-btn solid" href={`#/lesson/${encodeURIComponent(next.slug)}`}>Next: {next.title} →</a>}
              <button className="dot-btn" onClick={() => { setFinished(false); go(0); }}>Watch again</button>
              <a className="dot-btn ghost" href="#/">Library</a>
            </div>
          </div>
        </div>
      )}

      {exporting && <DotExport lesson={lesson} slug={slug} onClose={() => setExporting(false)} />}
    </div>
  );
}

function DotExport({ lesson, slug, onClose }: { lesson: Lesson; slug: string; onClose(): void }) {
  const [height, setHeight] = useState<720 | 1080>(1080);
  const [fps, setFps] = useState<30 | 60>(30);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); if (url) URL.revokeObjectURL(url); }, [url]);

  const start = async () => {
    abort.current = new AbortController();
    setError(null); setProgress(0);
    try {
      // The encoder is large and only needed here, so it loads on first export.
      const { exportDots } = await import('./exportDots');
      const blob = await exportDots(lesson, { height, fps, onProgress: setProgress, signal: abort.current.signal });
      const u = URL.createObjectURL(blob);
      setUrl(u);
      const a = document.createElement('a'); a.href = u; a.download = `${slug}.mp4`; a.click();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally { setProgress(null); }
  };

  return (
    <div className="dot-modal-bg" role="dialog" aria-modal="true" aria-label="Export video">
      <div className="dot-modal">
        <span className="dot-note-label">Export</span>
        <h2>Save as video</h2>
        <p className="dot-meta">MP4 · rendered in your browser · plays the whole lesson start to finish</p>
        <div className="dot-fields">
          <label>Resolution
            <select className="dot-btn" value={height} disabled={progress !== null} onChange={(ev) => setHeight(Number(ev.target.value) as 720 | 1080)}>
              <option value={720}>720p</option><option value={1080}>1080p</option>
            </select>
          </label>
          <label>Frame rate
            <select className="dot-btn" value={fps} disabled={progress !== null} onChange={(ev) => setFps(Number(ev.target.value) as 30 | 60)}>
              <option value={30}>30 fps</option><option value={60}>60 fps</option>
            </select>
          </label>
        </div>
        {progress !== null && <div className="dot-bar"><span style={{ width: `${progress * 100}%` }} /></div>}
        {error && <p className="dot-error">{error}</p>}
        {url && <p className="dot-meta">Done. <a href={url} download={`${slug}.mp4`}>Download again</a></p>}
        <div className="dot-modal-actions">
          {progress === null
            ? <><button className="dot-btn" onClick={onClose}>Close</button><button className="dot-btn solid" onClick={start}>{url ? 'Export again' : 'Export'}</button></>
            : <button className="dot-btn" onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
