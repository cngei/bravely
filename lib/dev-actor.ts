// DEVELOPMENT ONLY — this file exists to skip authentication.
//
// When BRAVELY_DEV_ACTOR is set it substitutes a fixed identity for the Keycloak session and
// the CNGEI backend lookup, so the UI can be exercised against nothing but the local Postgres.
// It is inert unless that variable is set, and refuses outright under NODE_ENV=production.
//
// It returns a ResolvedIdentity and goes through the same syncIdentity() path as a real login,
// so the state it produces is shaped exactly like production state — no second code path.
import type { ResolvedIdentity } from './backend';
import { assert } from './errors';

const TROOP = 'dev-troop';
const EXPLORER = { id: 'dev:explorer', name: 'Esploratore di prova', troopId: TROOP };
// Named "Reparto …" so syncIdentity() treats it as a placeholder and never renames it.
const TROOPS: ResolvedIdentity['troops'] = [
  { id: TROOP, name: 'Reparto di prova', source: 'cngei' },
];

let announced = false;

export function devIdentity(): ResolvedIdentity | undefined {
  const role = process.env.BRAVELY_DEV_ACTOR?.trim();
  if (!role) return undefined;
  assert(
    process.env.NODE_ENV !== 'production',
    500,
    'CONFIGURATION',
    'BRAVELY_DEV_ACTOR non può essere usato in produzione.',
  );
  assert(
    role === 'leader' || role === 'explorer' || role === 'admin',
    500,
    'CONFIGURATION',
    "BRAVELY_DEV_ACTOR accetta soltanto 'leader', 'explorer' o 'admin'.",
  );
  if (!announced) {
    announced = true;
    console.warn(`[bravely] BRAVELY_DEV_ACTOR=${role}: autenticazione disattivata (sviluppo).`);
  }

  if (role === 'explorer')
    return {
      actor: {
        id: EXPLORER.id,
        name: EXPLORER.name,
        role: 'explorer',
        troopIds: [],
        explorerTroopIds: [TROOP],
      },
      troops: TROOPS,
      people: [EXPLORER],
      // Empty on purpose: only a leader's sync may prune a troop roster.
      syncTroopIds: [],
    };

  return {
    actor: {
      id: `dev:${role}`,
      name: role === 'admin' ? 'Amministratore di prova' : 'Capo di prova',
      role,
      troopIds: [TROOP],
      explorerTroopIds: [],
    },
    troops: TROOPS,
    // Stands in for the CNGEI roster, so there is somebody to assign to a patrol.
    people: [EXPLORER],
    syncTroopIds: [TROOP],
  };
}
