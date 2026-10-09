import { useEffect, useMemo, useRef, useState } from 'react';
import { DotEngine, loadFonts } from './dots/engine';
import type { DotsLesson } from './dots/schema';
import { lessonInfo, type LoadedLesson } from './lessons';
import { allProgress, type Progress } from './store';

/** A still of a dots lesson: its most telling step, drawn by the real engine. */
function DotThumb({ lesson }: { lesson: DotsLesson }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    loadFonts().then(() => {
      const e = new DotEngine(lesson);
      // Prefer the first real diagram after the hook (arrays, trees, systems), else any shapes.
      const shapes = lesson.steps.map((s, i) => (s.form?.type === 'shapes' && !s.form.items.every((it) => it.shape === 'text' || it.shape === 'box') ? i : -1)).filter((i) => i >= 0);
      e.snap(shapes[0] ?? lesson.steps.findIndex((s) => s.form?.type === 'shapes') ?? 0);
      e.render(cv.getContext('2d')!, cv.width, cv.height, { bare: true });
    });
  }, [lesson]);
  return <canvas ref={ref} className="thumb" width={640} height={360} aria-hidden="true" />;
}

/** First scene of an SVG lesson as an inline still; ids re-prefixed so cards never collide. */
function SvgThumb({ l }: { l: LoadedLesson }) {
  const s = l.scenes[0];
  if (!s) return <div className="thumb thumb-empty">No playable scenes</div>;
  const html = s.svg.replaceAll(`${s.id}__`, `t-${l.slug}-${s.id}__`);
  return <div className="thumb thumb-light" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

const ORDER = ['DSA', 'System Design', 'Concepts'];
const byOrder = (a: string, b: string) => ((ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b);

export function Library({ lessons }: { lessons: LoadedLesson[] }) {
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string>(() => { try { return localStorage.getItem('lib.folder') ?? 'All'; } catch { return 'All'; } });
  const [company, setCompany] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  useEffect(() => { allProgress().then((ps) => setProgress(Object.fromEntries(ps.map((p) => [p.slug, p])))); }, []);
  useEffect(() => { try { localStorage.setItem('lib.folder', folder); } catch { /* private mode */ } }, [folder]);

  const rows = useMemo(() => lessons.map((l) => ({ l, info: lessonInfo(l) })), [lessons]);
  const folders = useMemo(() => [...new Set(rows.map((r) => r.l.category))].sort(byOrder), [rows]);
  const inFolder = rows.filter((r) => folder === 'All' || r.l.category === folder);
  // Companies present in the current folder, most frequent first.
  const companies = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of inFolder) for (const c of r.info.companies) n.set(c, (n.get(c) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [inFolder]);
  useEffect(() => { if (company && !companies.some(([c]) => c === company)) setCompany(null); }, [companies, company]);

  const shown = inFolder
    .filter(({ l, info }) => {
      const hay = [l.slug, info.title, info.request, ...info.tags, ...info.companies].join(' ').toLowerCase();
      return hay.includes(q.trim().toLowerCase()) && (!company || info.companies.includes(company));
    })
    .sort((a, b) => byOrder(a.l.category, b.l.category) || b.info.createdAt.localeCompare(a.info.createdAt) || a.info.title.localeCompare(b.info.title));

  const pctOf = (slug: string, steps: number) => {
    const p = progress[slug];
    return p?.completed ? 100 : steps ? Math.round((new Set(p?.beatsSeen.filter((b) => b < steps)).size / steps) * 100) : 0;
  };
  // Started but not finished, most recent first: shown as chips at the foot of the sidebar.
  const going = rows
    .filter(({ l, info }) => { const p = pctOf(l.slug, info.steps); return p > 0 && p < 100; })
    .sort((a, b) => (progress[b.l.slug]?.updatedAt ?? 0) - (progress[a.l.slug]?.updatedAt ?? 0))
    .slice(0, 4);

  return (
    <div className="lib">
      <aside className="lib-side" aria-label="Folders">
        <p className="lib-brand">Visual lessons</p>
        <nav className="folders">
          {['All', ...folders].map((f) => {
            const n = f === 'All' ? rows.length : rows.filter((r) => r.l.category === f).length;
            return (
              <button key={f} className={`folder ${folder === f ? 'on' : ''}`} aria-current={folder === f ? 'true' : undefined} onClick={() => setFolder(f)}>
                <span>{f === 'All' ? 'All lessons' : f}</span><span className="count">{n}</span>
              </button>
            );
          })}
        </nav>
        {going.length > 0 && (
          <section className="side-resume" aria-label="Continue where you left off">
            <p className="side-resume-title">Continue</p>
            <div className="side-chips">
              {going.map(({ l, info }) => (
                <a key={l.slug} className="resume-chip" href={`#/lesson/${encodeURIComponent(l.slug)}`} title={`${info.title} · ${pctOf(l.slug, info.steps)}% watched`}>
                  <span className="resume-chip-ring" style={{ ['--p' as string]: `${pctOf(l.slug, info.steps)}%` }} />
                  <span className="resume-chip-name">{info.title.split(/[:,]/)[0]}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </aside>

      <main className="lib-main">
        <header className="lib-top">
          <div className="lib-title">
            <p className="eyebrow">{folder === 'All' ? 'Library' : 'Folder'}</p>
            <h1>{folder === 'All' ? 'All lessons' : folder}</h1>
          </div>
          <input className="search" type="search" placeholder="Search lessons, topics, companies" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Search lessons" />
        </header>

        {companies.length > 0 && (
          <div className="companies" role="group" aria-label="Filter by company">
            <span className="companies-label">Asked at</span>
            <button className={`chip ${company === null ? 'on' : ''}`} aria-pressed={company === null} onClick={() => setCompany(null)}>Any company</button>
            {companies.map(([c, n]) => (
              <button key={c} className={`chip ${company === c ? 'on' : ''}`} aria-pressed={company === c} onClick={() => setCompany(company === c ? null : c)}>
                {c}<span className="chip-n">{n}</span>
              </button>
            ))}
          </div>
        )}

        {lessons.length === 0 && <p className="empty">No lessons yet. Ask Claude Code to “make a lesson on how DNS works” and it will appear here.</p>}
        {lessons.length > 0 && shown.length === 0 && <p className="empty">No lessons match.</p>}

        <ul className="grid">
          {shown.map(({ l, info }) => {
            const pct = pctOf(l.slug, info.steps);
            return (
              <li key={l.slug}>
                <a className="card" href={`#/lesson/${encodeURIComponent(l.slug)}`}>
                  <div className="thumb-wrap">
                    {l.dots ? <DotThumb lesson={l.dots} /> : <SvgThumb l={l} />}
                    <div className="thumb-tags">
                      {folder === 'All' && <span className="pill">{l.category}</span>}
                      {info.difficulty && <span className={`pill diff-${info.difficulty.toLowerCase()}`}>{info.difficulty}</span>}
                    </div>
                    {pct > 0 && <div className="thumb-bar"><span style={{ width: `${pct}%` }} /></div>}
                  </div>
                  <div className="card-body">
                    <h3>{info.title}{l.issues.length > 0 && <span className="warn" title="This lesson has problems"> ⚠</span>}</h3>
                    {info.companies.length > 0 && (
                      <div className="card-companies" aria-label="Asked at">
                        {info.companies.slice(0, 4).map((c) => <span key={c} className={`co ${c === company ? 'on' : ''}`}>{c}</span>)}
                        {info.companies.length > 4 && <span className="co more">+{info.companies.length - 4}</span>}
                      </div>
                    )}
                    <p className="meta">{info.steps} steps · {pct === 100 ? 'Completed' : pct > 0 ? `${pct}% watched` : 'Not started'}</p>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
