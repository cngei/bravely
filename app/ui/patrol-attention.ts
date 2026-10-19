// What a leader opens the dashboard asking: who is waiting on me, and who has gone quiet?
//
// Both answers were already in the data and thrown away — dashboard() computes waitingSeconds and
// progress() returns startedAt per skill — so this is arithmetic, not new state. Kept out of
// page.tsx and typed structurally so it can be tested without dragging a server component into
// the test run: the real dashboard() shapes satisfy these interfaces.

export interface PatrolProgress {
  id: string;
  name: string;
  skills: { status: string }[];
}

export interface ProofTimes {
  targetId: string;
  status: string;
  waitingSeconds?: number;
  startedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
}

/** Under a week of quiet is just a week; past it, worth saying out loud. */
export const IDLE_THRESHOLD = 7 * 24 * 3600;

export interface Attention {
  /** The longest wait among this patrol's pending proofs — the one that has been ignored. */
  waitingSeconds?: number;
  /** Seconds since anything at all happened to this patrol's proofs. */
  idleSeconds?: number;
}

/**
 * Only the patrol's own proofs count. A troop-scoped proof is filed against the troop and shared
 * by every patrol in it, so letting it through would make all of them look equally urgent.
 */
export function attention(patrol: PatrolProgress, proofs: ProofTimes[], now: number): Attention {
  const own = proofs.filter((e) => e.targetId === patrol.id);
  const pending = own.filter((e) => e.status === 'pending');
  const touched = own.flatMap((e) =>
    [e.startedAt, e.submittedAt, e.reviewedAt]
      .filter((t): t is string => t !== undefined)
      .map((t) => Date.parse(t)),
  );
  return {
    waitingSeconds: pending.length
      ? Math.max(...pending.map((e) => e.waitingSeconds ?? 0))
      : undefined,
    idleSeconds: touched.length ? Math.floor((now - Math.max(...touched)) / 1000) : undefined,
  };
}

/**
 * Longest wait first, then longest silence, then by name. A patrol with nothing of its own sorts
 * last rather than first: it is new, not neglected — which is why `undefined` maps to -1 and not
 * to Infinity.
 */
export const byAttention = <T extends Attention & { patrol: PatrolProgress }>(a: T, b: T) =>
  (b.waitingSeconds ?? -1) - (a.waitingSeconds ?? -1) ||
  (b.idleSeconds ?? -1) - (a.idleSeconds ?? -1) ||
  a.patrol.name.localeCompare(b.patrol.name, 'it');

/**
 * "3 verificate · 2 in verifica · 12 disponibili" — zeros omitted, so the line says only what is
 * true of this patrol instead of printing five counters every time.
 */
export function tally(patrol: PatrolProgress): string {
  const count = (...statuses: string[]) =>
    patrol.skills.filter((entry) => statuses.includes(entry.status)).length;
  const parts: string[] = [];
  const add = (n: number, label: string) => {
    if (n > 0) parts.push(`${n} ${label}`);
  };
  add(count('completed'), 'verificate');
  add(count('pending'), 'in verifica');
  add(count('rejected'), 'rigettate');
  add(count('available', 'started'), 'disponibili');
  add(count('locked'), 'bloccate');
  return parts.join(' · ');
}
