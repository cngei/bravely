'use client';
// Saves the CSV built by exportPatrolsAction. A Blob rather than a route: one endpoint fewer to
// authorize, and the action already runs as the signed-in leader.
import { useState } from 'react';
import { exportPatrolsAction } from '@/app/actions';

export function ExportPatrols() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function download() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await exportPatrolsAction();
      if (!result.csv) throw new Error(result.error ?? 'Esportazione non riuscita.');
      // The BOM makes Excel read the file as UTF-8, so accented names survive.
      const url = URL.createObjectURL(
        new Blob(['﻿', result.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `bravely-pattuglie-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Esportazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ marginBottom: '1rem' }}>
      <button type="button" data-variant="ghost" onClick={download} disabled={busy}>
        {busy ? 'Esportazione…' : 'Esporta pattuglie (CSV)'}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
