// The look is chosen per browser, from a short allowlist (PLAN, item K). A theme is a value of
// data-theme on <html> plus, for anything but the default, a stylesheet in app/themes/ that
// overrides globals.css under html[data-theme='…']. Adding one = a file + an entry here.
export const THEMES = {
  pergamena: 'Pergamena',
  moderno: 'Moderno',
} as const;
export type Theme = keyof typeof THEMES;
export const THEME_COOKIE = 'bravely-theme';

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && Object.hasOwn(THEMES, value);

/** The cookie if valid, else BRAVELY_THEME if valid, else the parchment look. Never trusts input. */
export function resolveTheme(cookie?: string): Theme {
  if (isTheme(cookie)) return cookie;
  const fallback = process.env.BRAVELY_THEME;
  return isTheme(fallback) ? fallback : 'pergamena';
}

export { isTheme };
