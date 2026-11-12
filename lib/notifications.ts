// What the orange dot on the "Gestione" chip counts (decision 4 of the November review): people in
// the troops a leader manages who are either without a patrol or self-assigned and waiting for a
// confirmation. Proofs awaiting review are deliberately *not* counted — they have their own queue
// on the dashboard.
//
// One function, so the dot, the dashboard hint and the roster's ordering cannot disagree about who
// needs attention. Pure and structurally typed, like app/ui/patrol-attention.ts, so it is tested
// without a server component in the test run.

export interface AlertPerson {
  troopId: string;
  patrolId?: string;
  selfAssigned?: boolean;
}

export interface AlertActor {
  role: 'explorer' | 'leader' | 'admin';
  troopIds: string[];
}

/** True for exactly the people the dot counts. */
export const needsManagement = (p: AlertPerson) => !p.patrolId || p.selfAssigned === true;

export interface ManagementAlerts {
  unassigned: number;
  toConfirm: number;
  total: number;
}

export function managementAlerts(people: AlertPerson[], actor: AlertActor): ManagementAlerts {
  // An explorer manages nothing. An admin counts only their own troops, like dashboard(): the
  // dot points at /gestione, which shows exactly those.
  if (actor.role === 'explorer') return { unassigned: 0, toConfirm: 0, total: 0 };
  const mine = people.filter((p) => actor.troopIds.includes(p.troopId));
  const unassigned = mine.filter((p) => !p.patrolId).length;
  // A person without a patrol cannot be self-assigned, so the two never overlap.
  const toConfirm = mine.filter((p) => p.patrolId && p.selfAssigned).length;
  return { unassigned, toConfirm, total: unassigned + toConfirm };
}

/** Roster order: whoever needs a leader first, then by name. Stable for everyone else. */
export const byManagement = <P extends AlertPerson & { name: string }>(a: P, b: P) =>
  Number(needsManagement(b)) - Number(needsManagement(a)) || a.name.localeCompare(b.name, 'it');
