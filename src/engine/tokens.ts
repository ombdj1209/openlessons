// Mirrors skills/diagram-design/references/style-guide.md (light skin).
export const tokens = {
  paper: '#f5f5f5',
  paper2: '#ececec',
  white: '#ffffff',
  ink: '#2d3142',
  muted: '#4f5d75',
  soft: '#7a8399',
  rule: 'rgba(45,49,66,0.12)',
  accent: '#eb6c36',
  accentTint: 'rgba(235,108,54,0.08)',
  link: '#2e5aa8',
  'series-1': '#7c8f6f',
  'series-2': '#5e7a9b',
  'series-3': '#b8915a',
  'series-4': '#9c6b50',
  'series-5': '#6e6479',
  pass: '#3f7d4e',
  fail: '#b8432f',
  warn: '#b8915a',
  active: '#eb6c36',
  idle: '#7a8399',
} as const;

export type TokenName = keyof typeof tokens;

/** A token name (`accent`, `series-2`, `pass`) or any literal CSS colour. */
export const color = (name: string): string => (tokens as Record<string, string>)[name] ?? name;

export const fonts = {
  sans: "Geist, system-ui, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
  mono: "'Geist Mono', ui-monospace, monospace",
};
