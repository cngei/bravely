'use client';
// Admin-only preview of the alternative looks (PLAN, item K). Writes a cookie for this browser;
// BRAVELY_THEME sets the default for everyone else.
import { useState } from 'react';
import { setThemeAction } from '@/app/actions';
import { THEMES, type Theme } from '@/lib/theme';

export function ThemePicker({ current }: { current: Theme }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="row">
      {(Object.keys(THEMES) as Theme[]).map((theme) => (
        <button
          key={theme}
          type="button"
          data-variant={theme === current ? undefined : 'ghost'}
          aria-pressed={theme === current}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            const result = await setThemeAction(theme);
            if (result.error) setError(result.error);
            setBusy(false);
          }}
        >
          {THEMES[theme]}
        </button>
      ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
