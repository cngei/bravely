import { describe, it, expect } from 'vitest';
import { initialState, type Actor, type State, type Skill, type Evidence } from '../lib/model';
import {
  execute,
  dashboard,
  skillDetail,
  missingPrerequisites,
  canReadEvidence,
  canReadUpload,
} from '../lib/domain';
import { commandSchema } from '../lib/commands';
import { validateMedia } from '../lib/files';
const admin: Actor = {
  id: 'admin',
  name: 'Admin',
  role: 'admin',
  troopIds: [],
  explorerTroopIds: [],
};
const cr: Actor = { id: 'cr', name: 'CR', role: 'leader', troopIds: ['t1'], explorerTroopIds: [] };
const explorer: Actor = {
  id: 'e1',
  name: 'Explorer',
  role: 'explorer',
  troopIds: [],
  explorerTroopIds: ['t1'],
};
function fixture() {
  const s = initialState();
  s.troops = [
    { id: 't1', name: 'Uno', source: 'cngei' },
    { id: 't2', name: 'Due', source: 'cngei' },
  ];
  s.patrols = [
    { id: 'p1', name: 'Lupi', troopId: 't1' },
    { id: 'p2', name: 'Falchi', troopId: 't1' },
    { id: 'p3', name: 'Aquile', troopId: 't2' },
  ];
  s.people = [
    { id: 'e1', name: 'Explorer', troopId: 't1', patrolId: 'p1' },
    { id: 'e2', name: 'Other', troopId: 't2', patrolId: 'p3' },
  ];
  return s;
}
function add(s: State, id = 'a', prerequisites: string[] = [], isPublic = false) {
  execute(s, admin, {
    type: 'saveSkill',
    skill: {
      id,
      title: id,
      description: '',
      scope: 'patrol',
      prerequisites,
      public: isPublic,
      forms: [
        {
          color: 'blue',
          title: 'Blue',
          fields: [{ id: 'text', label: 'Testo', type: 'text', required: true }],
        },
        {
          color: 'amber',
          title: 'Amber',
          fields: [
            { id: 'photo', label: 'Foto', type: 'file', required: true, minFiles: 1, maxFiles: 2 },
          ],
        },
      ],
    },
  });
}
function submit(s: State, skillId: string, targetId: string, a: Actor = cr) {
  const skill = s.skills.find((k) => k.id === skillId)!;
  return execute(s, a, {
    type: 'submitEvidence',
    skillId,
    targetId,
    color: 'blue',
    answers: { [skill.scope === 'troop' ? 'description' : 'text']: 'Prova' },
  }) as Evidence;
}
function approve(s: State, e: Evidence, a = admin) {
  execute(s, a, { type: 'reviewEvidence', evidenceId: e.id, decision: 'approve' });
}
function unlock(s: State, troopId = 't1') {
  for (const k of s.skills.filter((k) => k.scope === 'troop'))
    approve(s, submit(s, k.id, troopId, admin));
}
describe('authorization and patrol membership', () => {
  it('unassigned explorer receives only an informational response and cannot read skills or mutate', () => {
    const s = fixture();
    delete s.people[0].patrolId;
    expect(dashboard(s, explorer)).toEqual({
      user: { id: 'e1', name: 'Explorer', role: 'explorer' },
      assignmentRequired: true,
      message: expect.any(String),
    });
    expect(() => skillDetail(s, explorer, 'initial-1')).toThrow();
    expect(() =>
      execute(s, explorer, { type: 'startSkill', skillId: 'initial-1', targetId: 't1' }),
    ).toThrow();
  });
  it('excludes other troops from the leader dashboard', () => {
    const s = fixture(),
      data = dashboard(s, cr);
    if (!('patrols' in data)) throw new Error('missing dashboard');
    expect(data.patrols?.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(data.people?.map((p) => p.id)).toEqual(['e1']);
  });
  it('rejects cross-troop management and assignments even by admins', () => {
    const s = fixture();
    expect(() => execute(s, cr, { type: 'createPatrol', troopId: 't2', name: 'No' })).toThrow();
    expect(() =>
      execute(s, admin, { type: 'assignExplorer', personId: 'e1', patrolId: 'p3' }),
    ).toThrow();
  });
  it('reassignment replaces the single membership and immediately removes access to old patrol', () => {
    const s = fixture();
    unlock(s);
    add(s);
    execute(s, cr, { type: 'assignExplorer', personId: 'e1', patrolId: 'p2' });
    expect(s.people[0].patrolId).toBe('p2');
    expect(() => submit(s, 'a', 'p1', explorer)).toThrow();
    expect(submit(s, 'a', 'p2', explorer).targetId).toBe('p2');
  });
  it('stale membership after a backend transfer cannot grant access', () => {
    const s = fixture();
    expect(dashboard(s, { ...explorer, explorerTroopIds: ['t2'] }).assignmentRequired).toBe(true);
  });
});
describe('skill DAG and shared initial skills', () => {
  it('requires two initial skills and prevents cycles, duplicate forms and missing prerequisites', () => {
    const s = fixture();
    add(s);
    add(s, 'b', ['a']);
    const a = s.skills.find((k) => k.id === 'a')!;
    expect(() =>
      execute(s, admin, { type: 'saveSkill', skill: { ...a, prerequisites: ['b'] } }),
    ).toThrow();
    expect(() => add(s, 'c', ['unknown'])).toThrow();
    expect(() =>
      execute(s, admin, { type: 'saveSkill', skill: { ...a, id: 'third', scope: 'troop' } }),
    ).toThrow();
    expect(() =>
      execute(s, admin, { type: 'saveSkill', skill: { ...a, forms: [a.forms[0], a.forms[0]] } }),
    ).toThrow();
  });
  it('all patrol skills require both initial approvals; scouts cannot submit initial skills', () => {
    const s = fixture();
    add(s);
    expect(() => submit(s, 'a', 'p1', explorer)).toThrow();
    expect(() => submit(s, 'initial-1', 't1', explorer)).toThrow();
    unlock(s);
    expect(
      missingPrerequisites(
        s,
        s.skills.find((k) => k.id === 'a')!,
        'p2',
      ),
    ).toEqual([]);
    expect(submit(s, 'a', 'p1', explorer).status).toBe('pending');
  });
  it('enforces all transitive prerequisites', () => {
    const s = fixture();
    unlock(s);
    add(s);
    add(s, 'b', ['a']);
    add(s, 'c', ['b']);
    approve(s, submit(s, 'a', 'p1'));
    approve(s, submit(s, 'b', 'p1'));
    const a = s.evidence.find((e) => e.skillId === 'a')!;
    execute(s, cr, {
      type: 'reviewEvidence',
      evidenceId: a.id,
      decision: 'reject',
      reason: 'Da correggere',
    });
    expect(
      missingPrerequisites(
        s,
        s.skills.find((k) => k.id === 'c')!,
        'p1',
      ),
    ).toContain('a');
    expect(() => submit(s, 'c', 'p1', explorer)).toThrow();
  });
});
describe('evidence lifecycle', () => {
  it('persists the first start timestamp before any upload', () => {
    const s = fixture();
    unlock(s);
    add(s);
    const c = { type: 'startSkill' as const, skillId: 'a', targetId: 'p1' };
    execute(s, explorer, c, '2026-01-01T00:00:00Z');
    execute(s, explorer, c, '2026-02-01T00:00:00Z');
    expect(s.evidence.find((e) => e.skillId === 'a')?.startedAt).toBe('2026-01-01T00:00:00Z');
    expect(s.evidence.find((e) => e.skillId === 'a')?.answers).toBeUndefined();
  });
  it('locks approved forms, requires rejection reasons, and permits resubmission in either color', () => {
    const s = fixture();
    unlock(s);
    add(s);
    const e = submit(s, 'a', 'p1', explorer);
    approve(s, e, cr);
    expect(() => submit(s, 'a', 'p1', explorer)).toThrow();
    expect(() =>
      execute(s, cr, { type: 'reviewEvidence', evidenceId: e.id, decision: 'reject' }),
    ).toThrow();
    execute(s, cr, {
      type: 'reviewEvidence',
      evidenceId: e.id,
      decision: 'reject',
      reason: 'Rifare',
    });
    expect(e.reason).toBe('Rifare');
    submit(s, 'a', 'p1', explorer);
    expect(e.status).toBe('pending');
    expect(e.reason).toBeUndefined();
    expect(e.history.some((h) => h.reason === 'Rifare')).toBe(true);
  });
  it('retains downstream achievements after revocation but blocks new descendants', () => {
    const s = fixture();
    unlock(s);
    add(s);
    add(s, 'b', ['a']);
    add(s, 'c', ['b']);
    const a = submit(s, 'a', 'p1');
    approve(s, a);
    const b = submit(s, 'b', 'p1');
    approve(s, b);
    execute(s, admin, {
      type: 'reviewEvidence',
      evidenceId: a.id,
      decision: 'reject',
      reason: 'Errore',
    });
    expect(b.status).toBe('approved');
    expect(() => submit(s, 'c', 'p1')).toThrow();
  });
  it('cannot approve pending descendants after a prerequisite is revoked', () => {
    const s = fixture();
    unlock(s);
    add(s);
    add(s, 'b', ['a']);
    const a = submit(s, 'a', 'p1');
    approve(s, a);
    const b = submit(s, 'b', 'p1');
    execute(s, cr, {
      type: 'reviewEvidence',
      evidenceId: a.id,
      decision: 'reject',
      reason: 'Errore',
    });
    expect(() => approve(s, b)).toThrow();
  });
  it('keeps submitted form snapshots after administrator edits', () => {
    const s = fixture();
    unlock(s);
    add(s);
    const e = submit(s, 'a', 'p1');
    const k = s.skills.find((k) => k.id === 'a')!;
    execute(s, admin, {
      type: 'saveSkill',
      skill: { ...k, forms: [{ ...k.forms[0], title: 'Nuovo titolo' }] },
    });
    expect(e.formSnapshot?.title).toBe('Blue');
    expect(s.skills.find((k) => k.id === 'a')?.revision).toBe(2);
  });
  it('validates required fields, unknown fields, alternative forms and file ownership', () => {
    const s = fixture();
    unlock(s);
    add(s);
    expect(() =>
      execute(s, explorer, {
        type: 'submitEvidence',
        skillId: 'a',
        targetId: 'p1',
        color: 'blue',
        answers: { text: ' ' },
      }),
    ).toThrow();
    expect(() =>
      execute(s, explorer, {
        type: 'submitEvidence',
        skillId: 'a',
        targetId: 'p1',
        color: 'amber',
        answers: { photo: ['not-owned'] },
      }),
    ).toThrow();
    expect(() =>
      execute(s, explorer, {
        type: 'submitEvidence',
        skillId: 'a',
        targetId: 'p1',
        color: 'blue',
        answers: { text: 'ok', extra: 'no' },
      }),
    ).toThrow();
  });
});
describe('documentation visibility', () => {
  it('leaders read other troops but cannot review them', () => {
    const s = fixture();
    unlock(s, 't2');
    add(s);
    const e = submit(s, 'a', 'p3', admin);
    expect(canReadEvidence(s, cr, e)).toBe(true);
    expect(() => approve(s, e, cr)).toThrow();
  });
  it('scouts see achievers before unlocking but no foreign answers', () => {
    const s = fixture();
    unlock(s, 't2');
    add(s, 'a', [], true);
    const e = submit(s, 'a', 'p3', admin);
    approve(s, e);
    const d = skillDetail(s, explorer, 'a');
    expect(d.achieverCount).toBe(1);
    expect(d.documentation).toHaveLength(0);
  });
  it('foreign documents require public skill and own approval; private own attempts remain accessible', () => {
    const s = fixture();
    unlock(s);
    unlock(s, 't2');
    add(s, 'a', [], true);
    const e = submit(s, 'a', 'p3', admin);
    approve(s, e);
    const own = submit(s, 'a', 'p1', explorer);
    expect(canReadEvidence(s, explorer, own)).toBe(true);
    expect(canReadEvidence(s, explorer, e)).toBe(false);
    approve(s, own);
    expect(canReadEvidence(s, explorer, e)).toBe(true);
    s.skills.find((k) => k.id === 'a')!.public = false;
    expect(canReadEvidence(s, explorer, e)).toBe(false);
  });
  it('does not expose unattached foreign files even on a public approved skill', () => {
    const s = fixture();
    unlock(s);
    add(s, 'a', [], true);
    approve(s, submit(s, 'a', 'p1'));
    const u = {
      id: 'f',
      targetId: 'p3',
      targetType: 'patrol' as const,
      skillId: 'a',
      name: 'a.png',
      type: 'image/png',
      size: 10,
      createdBy: 'e2',
      createdAt: 'now',
    };
    expect(canReadUpload(s, explorer, u)).toBe(false);
  });
});
describe('administration and validation', () => {
  it('computes configured achievement thresholds from distinct completed skills', () => {
    const s = fixture();
    unlock(s);
    add(s);
    approve(s, submit(s, 'a', 'p1'));
    const d = dashboard(s, explorer);
    if (!('patrols' in d)) throw new Error('missing dashboard');
    expect(d.patrols?.[0].achievements.find((x) => x.id === 'three')?.earned).toBe(true);
  });
  it('external explorers have exactly one troop and require explicit administrator provisioning', () => {
    const s = fixture();
    const t = execute(s, admin, { type: 'createTroop', name: 'Esterni' }) as { id: string };
    execute(s, admin, {
      type: 'saveExternalUser',
      user: { subject: 'sub', name: 'Scout', role: 'explorer', troopIds: [t.id] },
    });
    expect(s.people.find((p) => p.id === 'oidc:sub')?.patrolId).toBeUndefined();
    expect(() => execute(s, cr, { type: 'saveAchievements', achievements: [] })).toThrow();
  });
  it('rejects unknown command fields and invalid types', () => {
    expect(() =>
      commandSchema.parse({
        type: 'reviewEvidence',
        evidenceId: 'x',
        decision: 'approve',
        role: 'admin',
      }),
    ).toThrow();
    expect(() =>
      commandSchema.parse({
        type: 'saveAchievements',
        achievements: [{ id: 'a', title: 'X', threshold: 0 }],
      }),
    ).toThrow();
  });
  it('rejects active content masquerading as an image', () => {
    expect(() => validateMedia(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow();
    expect(validateMedia(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  });
});
