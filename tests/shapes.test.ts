import { describe, expect, it } from 'vitest';
import type { DotItem } from '../src/dots/schema';
import { itemPoints } from '../src/dots/shapes';

const item = (o: Partial<DotItem>): DotItem => ({ shape: 'server', at: [800, 400], scale: 1, ...o } as DotItem);

describe('shapes', () => {
  it('draw the same points for the same part, so unchanged parts stay still between steps', () => {
    const a = itemPoints(item({}), 8, 0), b = itemPoints(item({}), 8, 0);
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });
  it('turn a failing part red without moving it', () => {
    const ok = itemPoints(item({}), 8, 0), bad = itemPoints(item({ fail: true }), 8, 0);
    expect(bad.map(({ x, y }) => [x, y])).toEqual(ok.map(({ x, y }) => [x, y]));
    expect(bad.every((p) => p.c === 2)).toBe(true);
  });
  it('draw one token per filled bucket slot', () => {
    const full = itemPoints(item({ shape: 'bucket', slots: 8, filled: 8 }), 8, 0).length;
    const empty = itemPoints(item({ shape: 'bucket', slots: 8, filled: 0 }), 8, 0).length;
    expect(full).toBeGreaterThan(empty);
  });
  it('mark found and wrong points on an embedding map', () => {
    const pts = itemPoints(item({ shape: 'space', pts: [[10, 10], [50, 50], [90, 90]], hi: [0], bad: [2] }), 8, 0);
    expect(pts.some((p) => p.c === 1)).toBe(true);
    expect(pts.some((p) => p.c === 2)).toBe(true);
  });
});
