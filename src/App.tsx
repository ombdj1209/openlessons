import { useEffect, useState } from 'react';
import { DotPlayer } from './dots/DotPlayer';
import { Library } from './Library';
import { Player } from './Player';
import { lessonInfo, loadAll, type LoadedLesson } from './lessons';

export function App() {
  const [hash, setHash] = useState(location.hash);
  const [lessons, setLessons] = useState<LoadedLesson[] | null>(null);

  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { loadAll().then(setLessons); }, []);

  if (!lessons) return <p className="loading">Loading lessons…</p>;
  const slug = decodeURIComponent(hash.match(/^#\/lesson\/(.+)$/)?.[1] ?? '');
  const lesson = lessons.find((l) => l.slug === slug);
  if (slug && lesson?.dots) {
    // Next lesson in the same folder, in the library's order, so a finished lesson leads somewhere.
    const shelf = lessons.filter((l) => l.category === lesson.category && l.dots)
      .map((l) => ({ l, info: lessonInfo(l) }))
      .sort((a, b) => b.info.createdAt.localeCompare(a.info.createdAt) || a.info.title.localeCompare(b.info.title));
    const at = shelf.findIndex((r) => r.l.slug === slug);
    const n = shelf[at + 1] ?? null;
    return <DotPlayer key={slug} slug={slug} lesson={lesson.dots} next={n && { slug: n.l.slug, title: n.info.title }} />;
  }
  if (slug && lesson) return <Player key={slug} data={lesson} />;
  return <Library lessons={lessons} />;
}
