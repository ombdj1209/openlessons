import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CALLOUT, Placer, arrowHead, collectObstacles, leaderPath, relRect, type Size } from './callout';
import { buildLesson, type Built } from './engine/build';
import { canExport, exportMp4, snapshot } from './export';
import type { LoadedLesson } from './lessons';
import { getProgress, saveProgress } from './store';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pad2 = (n: number) => String(n).padStart(2, '0');
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Player({ data }: { data: LoadedLesson }) {
  const theaterRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [note, setNote] = useState<{ title: string; text: string } | null>(null);
  const [view, setView] = useState<'play' | 'story'>(() =>
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 'story' : 'play');
  const [exporting, setExporting] = useState(false);
  const [stageSize, setStageSize] = useState<Size>({ w: 0, h: 0 });
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(0);
  const placer = useRef(new Placer());
  const stopAt = useRef<number | null>(null);
  const seen = useRef(new Set<number>());
  const lastSave = useRef(0);
  const { lesson } = data;

  // Mount scenes and build the one master timeline everything else drives.
  useEffect(() => {
    let dead = false;
    let b: Built | undefined;
    (async () => {
      await document.fonts.ready; // label metrics feed zoom framing
      const stage = stageRef.current;
      if (dead || !stage || !lesson || !data.scenes.length) return;
      stage.innerHTML = data.scenes.map((s) => s.svg).join('');
      b = buildLesson(stage, lesson, data.scenes.map((s) => s.id), data.actions);
      for (const s of data.scenes) {
        for (const id of Object.keys(s.notes)) stage.querySelector(`#${CSS.escape(`${s.id}__${id}`)}`)?.classList.add('has-note');
      }
      const p = await getProgress(data.slug);
      if (dead) return;
      const tl = b.tl;
      if (p) {
        p.beatsSeen.forEach((i) => seen.current.add(i));
        tl.seek(Math.min(p.position, tl.duration()), false);
      }
      tl.eventCallback('onUpdate', () => {
        if (stopAt.current !== null && tl.time() >= stopAt.current) {
          const at = stopAt.current;
          stopAt.current = null;
          tl.pause();
          tl.seek(at, false);
          setPlaying(false);
        }
        setTime(tl.time());
      });
      tl.eventCallback('onComplete', () => setPlaying(false));
      setBuilt(b);
      setTime(tl.time());
    })();
    return () => {
      dead = true;
      b?.tl.kill();
      if (stageRef.current) stageRef.current.innerHTML = '';
    };
  }, [data, lesson]);

  // Callouts are laid out in stage pixels, so track the stage's size (window resize, full view).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === theaterRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else theaterRef.current?.requestFullscreen();
  }, []);
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2200);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const beats = built?.beats ?? [];
  const duration = built?.tl.duration() ?? 0;
  const curBeat = beats.findLastIndex((b) => b.t <= time + 0.01);
  const sceneIdx = built ? built.scenes.findIndex((s) => time < s.end) : 0;
  const activeScene = built?.scenes[sceneIdx === -1 ? built.scenes.length - 1 : sceneIdx];

  // Only the visible scene takes clicks (scenes are stacked).
  useEffect(() => {
    stageRef.current?.querySelectorAll('svg[data-scene]').forEach((svg) =>
      svg.classList.toggle('active', svg.getAttribute('data-scene') === activeScene?.id));
  }, [activeScene?.id, built]);

  // Progress: beats passed, position, completion. Saved at most once a second.
  const persist = useCallback((force = false) => {
    if (!built || (!force && Date.now() - lastSave.current < 1000)) return;
    lastSave.current = Date.now();
    const atEnd = time >= duration - 0.05;
    const completed = atEnd || (beats.length > 0 && seen.current.size >= beats.length);
    // A finished lesson reopens at the start.
    saveProgress({ slug: data.slug, position: atEnd ? 0 : time, beatsSeen: [...seen.current], completed, updatedAt: Date.now() });
  }, [built, time, duration, beats.length, data.slug]);
  useEffect(() => {
    if (curBeat >= 0) seen.current.add(curBeat);
    persist(time >= duration - 0.05);
  }, [curBeat, time, duration, persist]);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => () => persistRef.current(true), []);

  const tl = built?.tl;
  const pause = useCallback(() => { stopAt.current = null; tl?.pause(); setPlaying(false); }, [tl]);
  const play = useCallback(() => {
    if (!tl) return;
    if (tl.time() >= tl.duration() - 0.01) tl.seek(0, false);
    stopAt.current = null;
    tl.timeScale(speed).play();
    setPlaying(true);
    setNote(null);
  }, [tl, speed]);
  const seek = useCallback((t: number) => { pause(); tl?.seek(Math.max(0, Math.min(t, tl.duration())), false); }, [tl, pause]);
  /** Plays exactly one beat: from its caption to the next caption, then pauses. */
  const playBeat = useCallback((i: number) => {
    if (!tl || !beats.length) return;
    const k = Math.max(0, Math.min(i, beats.length - 1));
    tl.pause();
    tl.seek(beats[k].t, false);
    stopAt.current = beats[k + 1]?.t ?? null;
    tl.timeScale(speed).play();
    setPlaying(true);
    setNote(null);
  }, [tl, beats, speed]);
  const next = useCallback(() => playBeat(curBeat + 1), [playBeat, curBeat]);
  const prev = useCallback(() => {
    playBeat(curBeat >= 0 && time - beats[curBeat].t > 0.6 ? curBeat : curBeat - 1);
  }, [playBeat, curBeat, time, beats]);

  useEffect(() => { tl?.timeScale(speed); }, [tl, speed]);

  useEffect(() => {
    if (view !== 'play' || exporting) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k: Record<string, () => void> = {
        ' ': () => (playing ? pause() : play()),
        ArrowRight: next, ArrowLeft: prev,
        Home: () => seek(0), End: () => seek(duration),
        f: toggleFull, F: toggleFull,
        Escape: () => setNote(null),
      };
      if (k[e.key]) { e.preventDefault(); k[e.key](); wake(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [view, exporting, playing, play, pause, next, prev, seek, duration, toggleFull]);

  const onStageClick = (e: React.MouseEvent) => {
    if (playing) return;
    for (let el = e.target as Element | null; el && el !== stageRef.current; el = el.parentElement) {
      const [sid, ...rest] = el.id ? el.id.split('__') : [];
      const text = data.scenes.find((s) => s.id === sid)?.notes[rest.join('__')];
      if (text) {
        setNote({ title: el.querySelector('text')?.textContent ?? rest.join('__'), text });
        return;
      }
    }
    setNote(null);
  };

  const issues = [...data.issues, ...(built?.errors ?? [])];
  const caption = built?.captionAt(time);

  return (
    <main className="player">
      <header className="player-head">
        <a href="#/" className="back">← All lessons</a>
        <div>
          <h1>{lesson?.title ?? data.slug}</h1>
          {lesson && <p className="request">“{lesson.request}”</p>}
        </div>
        <div className="head-actions">
          <button onClick={() => { pause(); setView(view === 'play' ? 'story' : 'play'); }} disabled={!built}>
            {view === 'play' ? 'Storyboard' : 'Animated'}
          </button>
          <button onClick={() => { pause(); setExporting(true); }} disabled={!built || !canExport()}
            title={canExport() ? 'Export as MP4' : 'Video export needs a browser with WebCodecs (Chrome, Edge)'}>Export video</button>
        </div>
      </header>

      {issues.length > 0 && (
        <details className="issues" open={!data.scenes.length}>
          <summary>⚠ {issues.length} problem{issues.length > 1 ? 's' : ''} in this lesson{data.scenes.length ? ' (affected steps or scenes are skipped)' : ''}</summary>
          <ul>{issues.map((i, k) => <li key={k}><code>{i.path}</code> {i.message}</li>)}</ul>
        </details>
      )}

      <div className="player-body">
        <section className="stage-col" aria-label="Lesson">
          <div ref={theaterRef} onMouseMove={wake}
            className={['theater', full && 'full', idle && 'idle', playing ? 'playing' : 'paused', view === 'story' && 'offscreen'].filter(Boolean).join(' ')}>
            <div className="stage-box">
              <div ref={stageRef} className="stage" onClick={onStageClick} onDoubleClick={toggleFull} />
              {built && caption && stageRef.current && (
                <Callout built={built} caption={caption} stage={stageRef.current} size={stageSize} placer={placer.current} />
              )}
              {built && beats.length > 0 && (
                <div className="segments" role="group" aria-label="Steps">
                  {beats.map((b, i) => {
                    const end = beats[i + 1]?.t ?? duration;
                    const f = Math.max(0, Math.min(1, (time - b.t) / (end - b.t)));
                    return (
                      <button key={i} className="seg" onClick={() => playBeat(i)} aria-label={`Step ${i + 1}: ${b.text}`} title={b.text}>
                        <span style={{ transform: `scaleX(${f})` }} />
                      </button>
                    );
                  })}
                </div>
              )}
              {!built && data.scenes.length > 0 && <p className="stage-msg">Preparing…</p>}
              {note && (
                <aside className="note" role="dialog" aria-label={note.title}>
                  <button className="x" onClick={() => setNote(null)} aria-label="Close note">×</button>
                  <h3>{note.title}</h3>
                  <p>{note.text}</p>
                </aside>
              )}
              <p className="sr-only" aria-live="polite">{caption?.text}</p>
            </div>

            {view === 'play' && built && (
              <div className="controls">
                <button onClick={prev} aria-label="Previous step" title="Previous step (←)">◀◀</button>
                <button className="primary" onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
                  {playing ? '❚❚' : '▶'}
                </button>
                <button onClick={next} aria-label="Next step" title="Next step (→)">▶▶</button>
                <span className="step-count">{curBeat >= 0 ? pad2(curBeat + 1) : '00'} / {pad2(beats.length)}</span>
                <div className="scrub">
                  <div className="track">
                    <span className="fill" style={{ width: `${(time / duration) * 100}%` }} />
                    {built.scenes.slice(1).map((s) => <span key={s.id} className="scene-mark" style={{ left: `${(s.start / duration) * 100}%` }} />)}
                    {beats.map((b, i) => <span key={i} className="tick" style={{ left: `${(b.t / duration) * 100}%` }} />)}
                  </div>
                  <input type="range" min={0} max={duration} step={0.01} value={time} aria-label="Seek"
                    onChange={(e) => seek(Number(e.target.value))} />
                </div>
                <span className="time">{fmt(time)} / {fmt(duration)}</span>
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
                  {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                </select>
                <button onClick={toggleFull} aria-label={full ? 'Exit full view' : 'Full view'} title="Full view (F)">{full ? '⤡' : '⤢'}</button>
              </div>
            )}
          </div>
          {view === 'play' && built && !playing && !full && (
            <p className="hint">{time === 0 ? 'Press ▶ to watch, or → to go one step at a time. F for full view.' : 'Paused: click a part of the diagram to learn more about it.'}</p>
          )}

          {view === 'story' && built && stageRef.current && <Storyboard stage={stageRef.current} built={built} />}
        </section>

        {built && (
          <nav className="rail" aria-label="Scenes">
            <p className="eyebrow">Scenes</p>
            <ol>
              {built.scenes.map((s, i) => {
                const done = beats.filter((b) => b.scene === i).every((b) => seen.current.has(beats.indexOf(b)));
                return (
                  <li key={s.id}>
                    <button className={s.id === activeScene?.id ? 'current' : ''} onClick={() => { seek(s.start); setView('play'); }}>
                      <span className="n">{i + 1}</span>{s.title}{done && <span className="done" aria-label="watched"> ✓</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </div>

      {exporting && built && stageRef.current && (
        <ExportDialog stage={stageRef.current} built={built} slug={data.slug} onClose={() => setExporting(false)} />
      )}
    </main>
  );
}

/**
 * The caption, placed inside the diagram next to what it explains, with a dashed leader
 * to the element. It follows the element through camera moves.
 */
function Callout({ built, caption, stage, size, placer }: {
  built: Built; caption: NonNullable<ReturnType<Built['captionAt']>>; stage: HTMLElement; size: Size; placer: Placer;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCard({ w: el.offsetWidth, h: el.offsetHeight });
  }, [caption.text, size.w]);

  if (!caption.text || !size.w) return null;
  const anchor = caption.anchor ? relRect(caption.anchor, stage, size) : null;
  const p = card ? placer.place(caption.beat, anchor, card, size, collectObstacles(stage, size, caption.anchor)) : null;
  const fs = size.w * CALLOUT.font;
  // Re-keyed when the step or the chosen spot changes, so the card fades in rather than sliding over the diagram.
  const key = `${caption.beat}-${p?.key}`;
  return (
    <div className="callout-layer" aria-hidden="true">
      {p?.leader && (
        <svg key={`l${key}`} className="leader" width={size.w} height={size.h}>
          <path d={leaderPath(p.leader)} strokeDasharray={`${fs * 0.35} ${fs * 0.28}`} />
          <polygon points={arrowHead(p.leader, fs * 0.6).map((q) => q.join(',')).join(' ')} />
        </svg>
      )}
      <div ref={cardRef} className="callout" style={{ transform: `translate(${p?.x ?? 0}px, ${p?.y ?? 0}px)`, visibility: p ? 'visible' : 'hidden' }}>
        <div key={key} className="callout-in">
          <span className="step">STEP {pad2(caption.beat + 1)} / {pad2(built.beats.length)}</span>
          <p>{caption.text}</p>
        </div>
      </div>
    </div>
  );
}

/** Every step's end frame as a still with its caption. The reduced-motion view, and a handout. */
function Storyboard({ stage, built }: { stage: HTMLElement; built: Built }) {
  const [frames, setFrames] = useState<{ url: string; text: string; scene: string }[]>([]);
  useEffect(() => {
    let dead = false;
    const urls: string[] = [];
    (async () => {
      const saved = built.tl.time();
      const out: typeof frames = [];
      for (const [i, b] of built.beats.entries()) {
        const end = (built.beats[i + 1]?.t ?? built.tl.duration()) - 0.02;
        built.tl.seek(end, false);
        const url = await snapshot(stage, built);
        urls.push(url);
        out.push({ url, text: b.text, scene: built.scenes[b.scene].title });
        if (dead) break;
      }
      built.tl.seek(saved, false);
      if (!dead) setFrames(out);
    })();
    return () => { dead = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [stage, built]);

  if (!frames.length) return <p className="stage-msg static">Rendering storyboard…</p>;
  return (
    <ol className="storyboard">
      {frames.map((f, i) => (
        <li key={i}>
          <img src={f.url} alt={f.text} />
          <p><span className="beat-no">{pad2(i + 1)}</span><span className="eyebrow">{f.scene}</span><br />{f.text}</p>
        </li>
      ))}
    </ol>
  );
}

function ExportDialog({ stage, built, slug, onClose }: { stage: HTMLElement; built: Built; slug: string; onClose(): void }) {
  const [height, setHeight] = useState<720 | 1080>(1080);
  const [fps, setFps] = useState<30 | 60>(30);
  const [captions, setCaptions] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); if (result) URL.revokeObjectURL(result); }, [result]);

  const start = async () => {
    abort.current = new AbortController();
    setError(null);
    setProgress(0);
    try {
      const blob = await exportMp4(stage, built, { height, fps, captions, onProgress: setProgress, signal: abort.current.signal });
      const url = URL.createObjectURL(blob);
      setResult(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.mp4`;
      a.click();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Export video">
      <div className="modal">
        <h2>Export video</h2>
        <p className="meta">{fmt(built.tl.duration())} · MP4 (H.264) · rendered in your browser</p>
        <fieldset disabled={progress !== null}>
          <label>Resolution
            <select value={height} onChange={(e) => setHeight(Number(e.target.value) as 720 | 1080)}>
              <option value={720}>720p</option><option value={1080}>1080p</option>
            </select>
          </label>
          <label>Frame rate
            <select value={fps} onChange={(e) => setFps(Number(e.target.value) as 30 | 60)}>
              <option value={30}>30 fps</option><option value={60}>60 fps</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Include captions in the diagram</label>
        </fieldset>
        {progress !== null && (
          <div className="bar big" aria-label={`${Math.round(progress * 100)}%`}><span style={{ width: `${progress * 100}%` }} /></div>
        )}
        {error && <p className="error">{error}</p>}
        {result && <p className="meta">Done. <a href={result} download={`${slug}.mp4`}>Download again</a></p>}
        <div className="modal-actions">
          {progress === null
            ? <><button onClick={onClose}>Close</button><button className="primary" onClick={start}>{result ? 'Export again' : 'Export'}</button></>
            : <button onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
