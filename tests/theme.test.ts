import { afterEach, describe, expect, it } from 'vitest';
import { resolveTheme } from '../lib/theme';

describe('theme resolution', () => {
  afterEach(() => {
    delete process.env.BRAVELY_THEME;
  });

  it('takes a known cookie, then BRAVELY_THEME, then the parchment look', () => {
    expect(resolveTheme('moderno')).toBe('moderno');
    process.env.BRAVELY_THEME = 'moderno';
    expect(resolveTheme(undefined)).toBe('moderno');
    delete process.env.BRAVELY_THEME;
    expect(resolveTheme(undefined)).toBe('pergamena');
  });

  it('never lets an arbitrary value through to data-theme', () => {
    expect(resolveTheme('"><script>')).toBe('pergamena');
    expect(resolveTheme('toString')).toBe('pergamena');
    process.env.BRAVELY_THEME = 'inesistente';
    expect(resolveTheme('__proto__')).toBe('pergamena');
  });
});
