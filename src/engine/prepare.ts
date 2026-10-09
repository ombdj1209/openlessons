/**
 * Makes a scene SVG safe to mount next to other scenes: every id gets a `<scene>__` prefix
 * (so two scenes may both have `auth-service`), references are rewritten, scripts and
 * event handlers are dropped, and the root is set up for camera moves.
 */
export function prepareSvg(svgText: string, sceneId: string): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) throw new Error('not a valid SVG file');

  if (!root.getAttribute('viewBox')) {
    const w = parseFloat(root.getAttribute('width') ?? ''), h = parseFloat(root.getAttribute('height') ?? '');
    if (!(w > 0 && h > 0)) throw new Error('SVG needs a viewBox');
    root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.removeAttribute('style');
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.setAttribute('data-scene', sceneId);

  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  const prefix = `${sceneId}__`;
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) { el.removeAttribute(attr.name); continue; }
      if (attr.name === 'id') { el.setAttribute('id', prefix + attr.value); continue; }
      let v = attr.value;
      if (/(^|:)href$/.test(attr.name) && v.startsWith('#')) v = `#${prefix}${v.slice(1)}`;
      v = v.replace(/url\(\s*#([^)\s]+)\s*\)/g, (_, i) => `url(#${prefix}${i})`);
      if (v !== attr.value) el.setAttribute(attr.name, v);
    }
  }
  return new XMLSerializer().serializeToString(root);
}
