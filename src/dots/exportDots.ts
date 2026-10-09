import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } from 'mediabunny';
import { DotEngine, loadFonts } from './engine';
import type { Lesson } from './schema';

export interface DotsExportOptions {
  height: 720 | 1080;
  fps: 30 | 60;
  onProgress(fraction: number): void;
  signal: AbortSignal;
}

/**
 * Plays the lesson from the start in its own engine with a fixed time step and records
 * every frame, so the video is the same each time and never depends on the live player.
 */
export async function exportDots(lesson: Lesson, o: DotsExportOptions): Promise<Blob> {
  const h = o.height, w = Math.round((h * 16) / 9);
  if (!(await canEncodeVideo('avc', { width: w, height: h }))) throw new Error('This browser cannot encode H.264 video.');
  await loadFonts();

  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: o.fps });
  await output.start();

  const engine = new DotEngine(lesson);
  engine.autoAnswer = true; // a video can't click: quick checks pause, then reveal their answer
  engine.go(0);
  const frames = Math.ceil(engine.totalDuration() * o.fps);
  for (let i = 0; i < frames; i++) {
    if (o.signal.aborted) { await output.cancel(); throw new DOMException('Export cancelled', 'AbortError'); }
    engine.update(1 / o.fps);
    engine.render(g, w, h);
    await source.add(i / o.fps, 1 / o.fps);
    if (i % 10 === 0) o.onProgress(i / frames);
  }
  await output.finalize();
  o.onProgress(1);
  return new Blob([target.buffer!], { type: 'video/mp4' });
}
