// The patrol split as CSV, so this year's data can be reused in the portal (decision 7 of the
// November review: CSV only, no endpoint or machine token). No dependency: quoting is doubling the
// quotes and wrapping any field that holds a separator, a quote or a newline.
//
// Pure and structurally typed so it is tested without a server action in the test run.

export interface ExportTroop {
  id: string;
  name: string;
}
export interface ExportPatrol {
  id: string;
  name: string;
  troopId: string;
}
export interface ExportPerson {
  id: string;
  name: string;
  troopId: string;
  patrolId?: string;
  selfAssigned?: boolean;
}

// A cell starting with one of these is run as a formula by Excel and LibreOffice when the file is
// opened — names come from CNGEI and from the external-users form, neither of which we control.
// An apostrophe makes the spreadsheet show the text as text.
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function patrolsCsv(
  troops: ExportTroop[],
  patrols: ExportPatrol[],
  people: ExportPerson[],
): string {
  const troopName = new Map(troops.map((t) => [t.id, t.name]));
  const patrolName = new Map(patrols.map((p) => [p.id, p.name]));
  const rows = people
    .filter((p) => troopName.has(p.troopId))
    .map((p) => [
      troopName.get(p.troopId)!,
      p.patrolId ? (patrolName.get(p.patrolId) ?? '') : '',
      p.id,
      p.name,
      // Spelled out rather than true/false: the reader is a person opening a spreadsheet.
      p.patrolId ? (p.selfAssigned ? 'da confermare' : 'confermata') : 'senza pattuglia',
    ])
    .sort(
      (a, b) =>
        a[0].localeCompare(b[0], 'it') ||
        a[1].localeCompare(b[1], 'it') ||
        a[3].localeCompare(b[3], 'it'),
    );
  const header = ['reparto', 'pattuglia', 'id_persona', 'nome', 'assegnazione'];
  // CRLF per RFC 4180, which is what spreadsheet importers expect.
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
