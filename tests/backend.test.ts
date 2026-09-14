import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveIdentity, syncIdentity } from '../lib/backend';
import { initialState } from '../lib/model';
const identity = {
  subject: 's',
  name: 'CR',
  username: '1234',
  roles: ['CR'],
  accessToken: 'test-token',
};
const duty = (idTipoIncarico: string, idCompagine: string) => ({
  idTipoIncarico,
  idCompagine,
  compagineType: 'UNITA',
  inizio: '2020-01-01',
  fine: null as string | null,
});
const person = (id: string, incarichiCorrenti: ReturnType<typeof duty>[]) => ({
  id,
  nome: id,
  cognome: 'Test',
  incarichiCorrenti,
});
afterEach(() => vi.unstubAllGlobals());
describe('CNGEI backend adapter', () => {
  it('uses current unit duties, filters broad backend visibility and minimizes copied personal data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        Response.json(
          url.endsWith('/me')
            ? person('cr', [duty('CR', 't1')])
            : url.endsWith('/gruppo')
              ? [{ numero: 1, sezione: { nome: 'Roma' }, unita: [{ id: 't1', tipo: 'REPARTO' }] }]
              : [
                  {
                    ...person('e1', [duty('E', 't1')]),
                    email: 'private@example.test',
                    codiceFiscale: 'private',
                  },
                  person('e2', [duty('E', 't2')]),
                  person('adult', [duty('CR', 't1')]),
                ],
        ),
      ),
    );
    const s = initialState(),
      r = await resolveIdentity(identity, s);
    syncIdentity(s, r);
    expect(r.actor.troopIds).toEqual(['t1']);
    expect(s.people).toEqual([{ id: 'e1', name: 'e1 Test', troopId: 't1', patrolId: undefined }]);
    expect(JSON.stringify(s)).not.toContain('private');
    expect(s.troops[0].name).toBe('Roma 1 — Reparto');
  });
  it('realm CR role alone does not confer management scope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(person('x', []))),
    );
    const r = await resolveIdentity(identity, initialState());
    expect(r.actor.role).toBe('explorer');
    expect(r.actor.troopIds).toEqual([]);
  });
  it('fails closed on backend failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(resolveIdentity(identity, initialState())).rejects.toMatchObject({ status: 502 });
  });
  it('ignores expired and future assignments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          person('x', [
            { ...duty('CR', 't1'), fine: '2020-01-02' },
            { ...duty('CR', 't2'), inizio: '2999-01-01' },
          ]),
        ),
      ),
    );
    const r = await resolveIdentity(identity, initialState());
    expect(r.actor.troopIds).toEqual([]);
  });
  it('synchronization removes departed scouts and keeps existing valid assignments', () => {
    const s = initialState();
    s.people = [
      { id: 'e1', name: 'old', troopId: 't1', patrolId: 'p1' },
      { id: 'e2', name: 'gone', troopId: 't1', patrolId: 'p1' },
    ];
    syncIdentity(s, {
      actor: { id: 'cr', name: 'cr', role: 'leader', troopIds: ['t1'], explorerTroopIds: [] },
      troops: [],
      syncTroopIds: ['t1'],
      people: [{ id: 'e1', name: 'new', troopId: 't1' }],
    });
    expect(s.people).toEqual([{ id: 'e1', name: 'new', troopId: 't1', patrolId: 'p1' }]);
  });
});
