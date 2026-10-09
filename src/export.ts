import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } from 'mediabunny';
import { CALLOUT, Placer, arrowHead, collectObstacles, relRect } from './callout';
import type { Built } from './engine/build';
import { fonts, tokens } from './engine/tokens';

let fontCss: Promise<string> | undefined;

/**
 * An SVG drawn as an image cannot reach the page's web fonts, so the Latin
 * subsets of the Google Fonts the page uses are inlined as data URLs.
 * Offline, this resolves to '' and text falls back to system fonts.
 */
function embeddedFonts(): Promise<string> {
  fontCss ??= (async () => {
    const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css2"]');
    if (!link) return '';
    const css = await (await fetch(link.href)).text();
    const latin = css.split('/* ').filter((b) => b.startsWith('latin */')).map((b) => b.slice('latin */'.length));
    const out = await Promise.all(latin.map(async (block) => {
      const url = block.match(/url\((https:[^)]+)\)/)?.[1];
      if (!url) return block;
      const blob = await (await fetch(url)).blob();
      const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
      return block.replace(url, data);
    }));
    return out.join('\n');
  })().catch(() => '');
  return fontCss;
}

async function svgImage(svg: SVGSVGElement, w: number, h: number, css: string): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.style.opacity = '';
  clone.style.pointerEvents = '';
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (css) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The in-diagram caption card, leader and anchor dot: the canvas twin of the player's callout. */
function drawCallout(g: G, stage: Element, built: Built, placer: Placer, w: number, h: number) {
  const t = built.tl.time();
  const cap = built.captionAt(t);
  if (!cap.text) return;
  const fs = w * CALLOUT.font, padX = fs * CALLOUT.padX, padY = fs * CALLOUT.padY;
  const efs = fs * CALLOUT.eyebrow, lh = fs * CALLOUT.line;
  const eyebrow = `STEP ${String(cap.beat + 1).padStart(2, '0')} / ${String(built.beats.length).padStart(2, '0')}`;

  g.font = `italic 400 ${fs}px ${fonts.serif}`;
  const lines: string[] = [];
  let line = '';
  for (const word of cap.text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > w * CALLOUT.maxW - 2 * padX && line) { lines.push(line); line = word; } else line = next;
  }
  lines.push(line);
  const textW = Math.max(...lines.map((l) => g.measureText(l).width));
  g.font = `500 ${efs}px ${fonts.mono}`;
  const cw = Math.max(textW, g.measureText(eyebrow).width * 1.2) + 2 * padX;
  const ch = 2 * padY + efs * 1.9 + lines.length * lh;

  const anchor = cap.anchor ? relRect(cap.anchor, stage, { w, h }) : null;
  const p = placer.place(cap.beat, anchor, { w: cw, h: ch }, { w, h }, collectObstacles(stage, { w, h }, cap.anchor));
  const since = t - built.beats[cap.beat].t;
  g.globalAlpha = Math.min(1, Math.max(0, since / 0.35));

  if (p.leader) {
    const l = p.leader;
    g.strokeStyle = tokens.accent;
    g.lineWidth = Math.max(1.5, w / 900);
    g.setLineDash([fs * 0.35, fs * 0.28]);
    g.beginPath();
    g.moveTo(l.x1, l.y1);
    g.bezierCurveTo(l.c1x, l.c1y, l.c2x, l.c2y, l.x2, l.y2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = tokens.accent;
    const [tip, b1, b2] = arrowHead(l, fs * 0.6);
    g.beginPath();
    g.moveTo(...tip);
    g.lineTo(...b1);
    g.lineTo(...b2);
    g.closePath();
    g.fill();
  }
  g.fillStyle = tokens.white;
  g.strokeStyle = 'rgba(45,49,66,0.16)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(p.x, p.y, cw, ch, fs * 0.3);
  g.fill();
  g.stroke();
  g.fillStyle = tokens.accent;
  g.fillRect(p.x, p.y, Math.max(3, w / 430), ch);

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = tokens.accent;
  g.font = `500 ${efs}px ${fonts.mono}`;
  g.fillText(eyebrow, p.x + padX, p.y + padY + efs);
  g.fillStyle = tokens.ink;
  g.font = `italic 400 ${fs}px ${fonts.serif}`;
  lines.forEach((l, i) => g.fillText(l, p.x + padX, p.y + padY + efs * 1.9 + lh * i + fs * 0.95));
  g.globalAlpha = 1;
}

/** Draws the stage as it looks right now, at the playhead's current time. */
export async function drawFrame(stage: Element, built: Built, g: G, w: number, h: number, captions: Placer | null) {
  const css = await embeddedFonts();
  g.globalAlpha = 1;
  g.fillStyle = tokens.paper;
  g.fillRect(0, 0, w, h);
  for (const svg of stage.querySelectorAll<SVGSVGElement>('svg[data-scene]')) {
    const op = parseFloat(svg.style.opacity || '1');
    if (op < 0.002) continue;
    g.globalAlpha = op;
    g.drawImage(await svgImage(svg, w, h, css), 0, 0, w, h);
  }
  g.globalAlpha = 1;
  if (captions) drawCallout(g, stage, built, captions, w, h);
}

/** A still of the current frame as an object URL (storyboard view). */
export async function snapshot(stage: Element, built: Built, w = 1280, h = 720): Promise<string> {
  const canvas = new OffscreenCanvas(w, h);
  await drawFrame(stage, built, canvas.getContext('2d')!, w, h, null);
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
}

export interface ExportOptions {
  height: 720 | 1080;
  fps: 30 | 60;
  captions: boolean;
  onProgress(fraction: number): void;
  signal: AbortSignal;
}

export const canExport = () => typeof VideoEncoder !== 'undefined';

export async function exportMp4(stage: Element, built: Built, o: ExportOptions): Promise<Blob> {
  const h = o.height, w = Math.round((h * 16) / 9);
  if (!(await canEncodeVideo('avc', { width: w, height: h }))) throw new Error('This browser cannot encode H.264 video.');
  await document.fonts.load(`500 32px Geist`);

  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: o.fps });
  await output.start();

  const tl = built.tl;
  const saved = tl.time();
  const placer = o.captions ? new Placer() : null;
  const frames = Math.ceil(tl.duration() * o.fps);
  try {
    for (let i = 0; i <= frames; i++) {
      if (o.signal.aborted) { await output.cancel(); throw new DOMException('Export cancelled', 'AbortError'); }
      tl.seek(Math.min(i / o.fps, tl.duration()), false);
      await drawFrame(stage, built, g, w, h, placer);
      await source.add(i / o.fps, 1 / o.fps);
      o.onProgress(i / frames);
    }
    await output.finalize();
  } finally {
    tl.seek(saved, false);
  }
  return new Blob([target.buffer!], { type: 'video/mp4' });
}
