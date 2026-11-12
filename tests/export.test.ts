import { describe, expect, it } from 'vitest';
import { csvCell, patrolsCsv } from '../lib/export';

describe('patrol CSV export', () => {
  const troops = [
    { id: 't1', name: 'Reparto Uno' },
    { id: 't2', name: 'Reparto Due' },
  ];
  const patrols = [
    { id: 'p1', name: 'Lupi', troopId: 't1' },
    { id: 'p2', name: 'Falchi', troopId: 't2' },
  ];

  it('writes one row per person, with the assignment spelled out', () => {
    const csv = patrolsCsv(troops, patrols, [
      { id: 'u1', name: 'Anna', troopId: 't1', patrolId: 'p1' },
      { id: 'u2', name: 'Bruno', troopId: 't1', patrolId: 'p1', selfAssigned: true },
      { id: 'u3', name: 'Carla', troopId: 't1' },
      { id: 'u4', name: 'Dario', troopId: 't2', patrolId: 'p2' },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'reparto,pattuglia,id_persona,nome,assegnazione',
      'Reparto Due,Falchi,u4,Dario,confermata',
      'Reparto Uno,,u3,Carla,senza pattuglia',
      'Reparto Uno,Lupi,u1,Anna,confermata',
      'Reparto Uno,Lupi,u2,Bruno,da confermare',
      '',
    ]);
  });

  it('leaves out people whose troop the caller was not given', () => {
    const csv = patrolsCsv([troops[0]], patrols, [
      { id: 'u4', name: 'Dario', troopId: 't2', patrolId: 'p2' },
    ]);
    expect(csv).not.toContain('Dario');
  });

  it('quotes separators, quotes and newlines', () => {
    expect(csvCell('Rossi, Mario')).toBe('"Rossi, Mario"');
    expect(csvCell('detto "il Lupo"')).toBe('"detto ""il Lupo"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('Anna')).toBe('Anna');
  });

  it('defuses spreadsheet formulas in names', () => {
    expect(csvCell('=HYPERLINK("http://x","clic")')).toBe('"\'=HYPERLINK(""http://x"",""clic"")"');
    expect(csvCell('+39 333')).toBe("'+39 333");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});
