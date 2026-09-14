import { z } from 'zod';
import type { Actor, State, Troop } from './model';
import { AppError, assert } from './errors';
const dutySchema = z.object({
  idTipoIncarico: z.string(),
  idCompagine: z.string().nullable().optional(),
  compagineType: z.string().nullable().optional(),
  inizio: z.string(),
  fine: z.string().nullable().optional(),
  terminato: z.boolean().optional(),
});
const personSchema = z.object({
  id: z.string(),
  nome: z.string(),
  cognome: z.string(),
  incarichiCorrenti: z.array(dutySchema),
});
type BackendPerson = z.infer<typeof personSchema>;
export interface LoginIdentity {
  subject: string;
  name: string;
  username: string;
  roles: string[];
  accessToken: string;
}
function unitIds(p: BackendPerson, roles: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    ...new Set(
      p.incarichiCorrenti
        .filter(
          (i) =>
            roles.includes(i.idTipoIncarico) &&
            i.compagineType === 'UNITA' &&
            i.idCompagine &&
            i.inizio <= today &&
            (!i.fine || i.fine > today) &&
            !i.terminato,
        )
        .map((i) => i.idCompagine!),
    ),
  ];
}
async function get(path: string, token: string): Promise<unknown> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL ?? 'http://localhost:8000'}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401)
      throw new AppError(401, 'SESSION_EXPIRED', 'Sessione scaduta. Accedi nuovamente.');
    if (!res.ok)
      throw new AppError(
        502,
        'BACKEND_ERROR',
        'Il backend CNGEI non ha restituito i dati richiesti.',
      );
    return await res.json();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(503, 'BACKEND_UNAVAILABLE', 'Backend CNGEI non disponibile.');
  }
}
export interface ResolvedIdentity {
  actor: Actor;
  troops: Troop[];
  people: { id: string; name: string; troopId: string }[];
  syncTroopIds: string[];
}
export async function resolveIdentity(
  identity: LoginIdentity,
  s: State,
): Promise<ResolvedIdentity> {
  const ext = s.externalUsers.find((u) => u.subject === identity.subject),
    isAdmin = identity.roles.includes('ADMIN_BRAVELY');
  if (ext)
    return {
      actor: {
        id: `oidc:${ext.subject}`,
        name: ext.name,
        role: isAdmin ? 'admin' : ext.role,
        troopIds: ext.role === 'leader' ? ext.troopIds : [],
        explorerTroopIds: ext.role === 'explorer' ? ext.troopIds : [],
      },
      troops: [],
      people: [],
      syncTroopIds: [],
    };
  if (!/^\d+$/.test(identity.username))
    return {
      actor: {
        id: `oidc:${identity.subject}`,
        name: identity.name,
        role: isAdmin ? 'admin' : 'explorer',
        troopIds: [],
        explorerTroopIds: [],
      },
      troops: [],
      people: [],
      syncTroopIds: [],
    };
  const me = personSchema.parse(await get('/persona/me', identity.accessToken));
  const troopIds = unitIds(me, ['CR', 'VCR']),
    explorerTroopIds = unitIds(me, ['E']);
  const actor: Actor = {
    id: me.id,
    name: `${me.nome} ${me.cognome}`.trim(),
    role: isAdmin ? 'admin' : troopIds.length ? 'leader' : 'explorer',
    troopIds,
    explorerTroopIds,
  };
  assert(
    explorerTroopIds.length <= 1,
    409,
    'AMBIGUOUS_MEMBERSHIP',
    'L’anagrafica indica più reparti per lo stesso esploratore.',
  );
  const troops: Troop[] = [...new Set([...troopIds, ...explorerTroopIds])].map((id) => ({
    id,
    name: `Reparto ${id}`,
    source: 'cngei',
  }));
  let people: ResolvedIdentity['people'] = [];
  if (troopIds.length) {
    const [roster, groups] = await Promise.all([
      get('/persona', identity.accessToken),
      get('/gruppo', identity.accessToken),
    ]);
    const groupSchema = z.array(
      z.object({
        numero: z.number(),
        sezione: z.object({ nome: z.string().optional() }).passthrough(),
        unita: z.array(z.object({ id: z.string(), tipo: z.string() })),
      }),
    );
    for (const g of groupSchema.parse(groups))
      for (const unit of g.unita) {
        const t = troops.find((t) => t.id === unit.id);
        if (t) t.name = `${g.sezione.nome ?? 'CNGEI'} ${g.numero} — Reparto`;
      }
    for (const p of z.array(personSchema).parse(roster)) {
      const ids = unitIds(p, ['E']).filter((id) => troopIds.includes(id));
      assert(
        ids.length <= 1,
        409,
        'AMBIGUOUS_MEMBERSHIP',
        'Un esploratore risulta in più reparti.',
      );
      if (ids[0]) people.push({ id: p.id, name: `${p.nome} ${p.cognome}`.trim(), troopId: ids[0] });
    }
  } else if (explorerTroopIds[0])
    people = [{ id: me.id, name: actor.name, troopId: explorerTroopIds[0] }];
  return { actor, troops, people, syncTroopIds: troopIds };
}
export function syncIdentity(s: State, r: ResolvedIdentity) {
  for (const t of r.troops) {
    const old = s.troops.find((x) => x.id === t.id);
    if (!old) s.troops.push(t);
    else if (!t.name.startsWith('Reparto ')) old.name = t.name;
  }
  s.people = s.people.filter(
    (p) => !r.syncTroopIds.includes(p.troopId) || r.people.some((x) => x.id === p.id),
  );
  for (const p of r.people) {
    const old = s.people.find((x) => x.id === p.id);
    s.people = s.people.filter((x) => x.id !== p.id);
    s.people.push({ ...p, patrolId: old?.troopId === p.troopId ? old.patrolId : undefined });
  }
}
