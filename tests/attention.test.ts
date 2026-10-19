import { describe, it, expect } from 'vitest';
import {
  attention,
  byAttention,
  IDLE_THRESHOLD,
  tally,
  type PatrolProgress,
  type ProofTimes,
} from '../app/ui/patrol-attention';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const DAY = 24 * 3600;

const patrol = (id: string, name = id, statuses: string[] = []): PatrolProgress => ({
  id,
  name,
  skills: statuses.map((status) => ({ status })),
});

describe('attention', () => {
  it('says nothing about a patrol that has never started anything', () => {
    expect(attention(patrol('p1'), [], NOW)).toEqual({
      waitingSeconds: undefined,
      idleSeconds: undefined,
    });
  });

  it('ignores proofs filed against the troop rather than the patrol', () => {
    // A troop-scoped proof is shared by every patrol in the troop. Counting it would make all of
    // them look equally urgent, which is the opposite of the point.
    const proofs: ProofTimes[] = [
      { targetId: 't1', status: 'pending', waitingSeconds: 9 * DAY, startedAt: ago(10 * DAY) },
    ];
    expect(attention(patrol('p1'), proofs, NOW).waitingSeconds).toBeUndefined();
  });

  it('reports the longest wait among the pending proofs, not the latest', () => {
    const proofs: ProofTimes[] = [
      { targetId: 'p1', status: 'pending', waitingSeconds: 2 * DAY, startedAt: ago(3 * DAY) },
      { targetId: 'p1', status: 'pending', waitingSeconds: 11 * DAY, startedAt: ago(12 * DAY) },
      { targetId: 'p1', status: 'approved', waitingSeconds: 0, startedAt: ago(40 * DAY) },
    ];
    expect(attention(patrol('p1'), proofs, NOW).waitingSeconds).toBe(11 * DAY);
  });

  it('measures silence from the most recent of start, submission and review', () => {
    const proofs: ProofTimes[] = [
      {
        targetId: 'p1',
        status: 'rejected',
        startedAt: ago(30 * DAY),
        submittedAt: ago(20 * DAY),
        reviewedAt: ago(9 * DAY),
      },
      { targetId: 'p1', status: 'started', startedAt: ago(40 * DAY) },
    ];
    expect(attention(patrol('p1'), proofs, NOW).idleSeconds).toBe(9 * DAY);
  });

  it('leaves waiting unset when a patrol has proofs but none pending', () => {
    const proofs: ProofTimes[] = [{ targetId: 'p1', status: 'started', startedAt: ago(3 * DAY) }];
    const result = attention(patrol('p1'), proofs, NOW);
    expect(result.waitingSeconds).toBeUndefined();
    expect(result.idleSeconds).toBe(3 * DAY);
  });
});

describe('byAttention', () => {
  const ranked = (entries: { patrol: PatrolProgress; proofs: ProofTimes[] }[]) =>
    entries
      .map(({ patrol: p, proofs }) => ({ patrol: p, ...attention(p, proofs, NOW) }))
      .sort(byAttention)
      .map((entry) => entry.patrol.id);

  it('puts whoever has waited longest first, then whoever has gone quietest', () => {
    expect(
      ranked([
        // Quiet for a month, nothing pending.
        {
          patrol: patrol('quiet'),
          proofs: [
            {
              targetId: 'quiet',
              status: 'approved',
              startedAt: ago(30 * DAY),
              reviewedAt: ago(30 * DAY),
            },
          ],
        },
        // Waiting two days.
        {
          patrol: patrol('recent'),
          proofs: [
            {
              targetId: 'recent',
              status: 'pending',
              waitingSeconds: 2 * DAY,
              startedAt: ago(2 * DAY),
            },
          ],
        },
        // Waiting eleven days — the one being ignored.
        {
          patrol: patrol('stale'),
          proofs: [
            {
              targetId: 'stale',
              status: 'pending',
              waitingSeconds: 11 * DAY,
              startedAt: ago(11 * DAY),
            },
          ],
        },
        // Brand new.
        { patrol: patrol('new'), proofs: [] },
      ]),
    ).toEqual(['stale', 'recent', 'quiet', 'new']);
  });

  it('sorts a patrol that has never started anything last, not first', () => {
    // The tempting bug: treating "no activity" as infinite silence and flagging every new patrol
    // as the most neglected one in the troop.
    expect(
      ranked(
        [
          { patrol: patrol('new') },
          {
            patrol: patrol('old'),
            proofs: [{ targetId: 'old', status: 'started', startedAt: ago(1) }],
          },
        ].map((e) => ({ patrol: e.patrol, proofs: e.proofs ?? [] })),
      ),
    ).toEqual(['old', 'new']);
  });

  it('falls back to Italian name order when nothing distinguishes two patrols', () => {
    expect(
      ranked([
        { patrol: patrol('b', 'Zèfiro'), proofs: [] },
        { patrol: patrol('a', 'Àquile'), proofs: [] },
      ]),
    ).toEqual(['a', 'b']);
  });
});

describe('tally', () => {
  it('omits the states a patrol has none of', () => {
    expect(tally(patrol('p1', 'p1', ['completed', 'completed', 'locked']))).toBe(
      '2 verificate · 1 bloccate',
    );
  });

  it('counts started alongside available, since neither is waiting on the leader', () => {
    expect(tally(patrol('p1', 'p1', ['available', 'started', 'pending']))).toBe(
      '1 in verifica · 2 disponibili',
    );
  });

  it('is empty for a catalogue with no skills', () => {
    expect(tally(patrol('p1'))).toBe('');
  });
});

describe('IDLE_THRESHOLD', () => {
  it('is a week, so a fortnight of silence is reported and three days is not', () => {
    expect(14 * DAY > IDLE_THRESHOLD).toBe(true);
    expect(3 * DAY > IDLE_THRESHOLD).toBe(false);
  });
});
