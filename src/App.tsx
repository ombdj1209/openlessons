import { Component, useEffect, useState, type ReactNode } from 'react';
import { DotPlayer } from './dots/DotPlayer';
import { Library } from './Library';
import { lessonInfo, loadAll, type LoadedLesson } from './lessons';

// Lessons are bundled at build time, so they are parsed once.
const lessons = loadAll();

const slugFromHash = (hash: string) => decodeURIComponent(hash.match(/^#\/lesson\/(.+)$/)?.[1] ?? '');

export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const slug = slugFromHash(hash);
  const found = slug ? lessons.find((l) => l.slug === slug) : undefined;
  useEffect(() => {
    document.title = found?.lesson ? `${found.lesson.title} · OpenLessons` : 'OpenLessons';
  }, [found]);

  if (!slug) return <Library lessons={lessons} />;
  if (!found) return <Problem title="Lesson not found" detail={`No lesson is called “${slug}”.`} />;
  if (!found.lesson) return <Problem title={`“${slug}” has problems`} issues={found} />;
  return (
    <Recover key={slug}>
      <DotPlayer slug={slug} lesson={found.lesson} next={nextIn(found)} />
    </Recover>
  );
}

/** The next lesson on the same shelf, in library order, so a finished lesson leads somewhere. */
function nextIn(current: LoadedLesson) {
  const shelf = lessons.filter((l) => l.category === current.category && l.lesson)
    .map((l) => ({ l, info: lessonInfo(l) }))
    .sort((a, b) => b.info.createdAt.localeCompare(a.info.createdAt) || a.info.title.localeCompare(b.info.title));
  const n = shelf[shelf.findIndex((r) => r.l.slug === current.slug) + 1];
  return n ? { slug: n.l.slug, title: n.info.title } : null;
}

function Problem({ title, detail, issues }: { title: string; detail?: string; issues?: LoadedLesson }) {
  return (
    <main className="problem">
      <a href="#/" className="dot-btn ghost">← Library</a>
      <h1>{title}</h1>
      {detail && <p className="muted">{detail}</p>}
      {issues && (
        <>
          <p className="muted">Fix these in <code>lessons/{issues.category}/{issues.slug}/lesson.json</code>, or run <code>npm run check-lessons {issues.slug}</code>.</p>
          <ul>{issues.issues.map((i) => <li key={i.path + i.message}><code>{i.path}</code> {i.message}</li>)}</ul>
        </>
      )}
    </main>
  );
}

/** A crash inside one lesson shows a way back instead of a blank page. */
class Recover extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    return this.state.error
      ? <Problem title="This lesson crashed" detail={this.state.error.message} />
      : this.props.children;
  }
}
