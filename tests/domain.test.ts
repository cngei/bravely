import { describe, it, expect } from 'vitest';
import { initialState, type Actor, type State, type Skill, type Evidence } from '../lib/model';
import {
  execute,
  dashboard,
  skillDetail,
  missingPrerequisites,
  canReadEvidence,
  canReadUpload,
  formById,
  attachSkillDocument,
} from '../lib/domain';
import { commandSchema } from '../lib/commands';
import { validateDocument, validateMedia } from '../lib/files';
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
/** Id of a skill's first current form of the given colour: submissions name a form, not a colour. */
const formOf = (s: State, skillId: string, color: 'blue' | 'amber' = 'blue') =>
  s.skills.find((k) => k.id === skillId)!.forms.find((f) => f.color === color)!.id;
function submit(s: State, skillId: string, targetId: string, a: Actor = cr) {
  const skill = s.skills.find((k) => k.id === skillId)!;
  return execute(s, a, {
    type: 'submitEvidence',
    skillId,
    targetId,
    formId: formOf(s, skillId),
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
  it('requires two initial skills and prevents cycles, duplicate field ids and missing prerequisites', () => {
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
    // Two forms of one colour are allowed since the November review; two fields sharing an id
    // inside one form are still not, because answers are keyed by field id.
    const twin = { ...a.forms[0], fields: [a.forms[0].fields[0], a.forms[0].fields[0]] };
    expect(() => execute(s, admin, { type: 'saveSkill', skill: { ...a, forms: [twin] } })).toThrow(
      /campi duplicati/,
    );
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
    // Resubmitting clears the rejection outright. history[] used to retain the old reason; it was
    // dropped deliberately, so the latest decision is the only one kept.
    expect(e.reason).toBeUndefined();
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
    // The form the patrol answered is still resolvable after the admin rewrote it: saveSkill
    // minted a new id for the changed form and retired the old one instead of mutating it.
    expect(formById(s, e.formId)?.title).toBe('Blue');
    expect(s.skills.find((k) => k.id === 'a')?.forms[0].title).toBe('Nuovo titolo');
    expect(formById(s, e.formId)?.id).not.toBe(s.skills.find((k) => k.id === 'a')?.forms[0].id);
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
        formId: formOf(s, 'a'),
        answers: { text: ' ' },
      }),
    ).toThrow();
    expect(() =>
      execute(s, explorer, {
        type: 'submitEvidence',
        skillId: 'a',
        targetId: 'p1',
        formId: formOf(s, 'a', 'amber'),
        answers: { photo: ['not-owned'] },
      }),
    ).toThrow();
    expect(() =>
      execute(s, explorer, {
        type: 'submitEvidence',
        skillId: 'a',
        targetId: 'p1',
        formId: formOf(s, 'a'),
        answers: { text: 'ok', extra: 'no' },
      }),
    ).toThrow();
  });
});
describe('skill PDF', () => {
  const doc = { id: 'f-doc', name: 'guida.pdf', size: 1234 };

  it('only the admin attaches or removes it', () => {
    const s = fixture();
    add(s);
    expect(() => attachSkillDocument(s, cr, 'a', doc)).toThrow();
    attachSkillDocument(s, admin, 'a', doc);
    expect(() => execute(s, cr, { type: 'clearSkillDocument', skillId: 'a' })).toThrow();
    execute(s, admin, { type: 'clearSkillDocument', skillId: 'a' });
    expect(s.skills.find((k) => k.id === 'a')?.document).toBeUndefined();
  });

  it('survives a saveSkill, which never carries it', () => {
    const s = fixture();
    add(s);
    attachSkillDocument(s, admin, 'a', doc);
    add(s);
    expect(s.skills.find((k) => k.id === 'a')?.document).toEqual(doc);
  });

  it('is not settable through the command schema', () => {
    const parsed = commandSchema.safeParse({
      type: 'saveSkill',
      skill: {
        id: 'a',
        title: 'a',
        description: '',
        scope: 'patrol',
        prerequisites: [],
        public: false,
        forms: [
          {
            color: 'blue',
            title: 'B',
            fields: [{ id: 't', label: 'T', type: 'text', required: true }],
          },
        ],
        document: doc,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a PDF by its magic number and nothing else', () => {
    expect(validateDocument(Buffer.from('%PDF-1.4 ...'))).toBe('application/pdf');
    expect(() => validateDocument(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toThrow();
    expect(() => validateDocument(Buffer.alloc(0))).toThrow();
    expect(() => validateDocument(Buffer.alloc(10 * 1024 * 1024 + 1, '%PDF-'))).toThrow();
  });
});
describe('comment on a submission', () => {
  const send = (s: State, comment?: string) =>
    execute(s, explorer, {
      type: 'submitEvidence',
      skillId: 'a',
      targetId: 'p1',
      formId: formOf(s, 'a'),
      answers: { text: 'Prova' },
      ...(comment === undefined ? {} : { comment }),
    }) as Evidence;

  it('stores the comment with the submission', () => {
    const s = fixture();
    unlock(s);
    add(s);
    expect(send(s, 'Abbiamo usato la bussola di Marta').comment).toBe(
      'Abbiamo usato la bussola di Marta',
    );
  });

  it('drops the previous round’s comment when a rejected proof is resubmitted without one', () => {
    const s = fixture();
    unlock(s);
    add(s);
    const e = send(s, 'Prima versione');
    execute(s, cr, { type: 'reviewEvidence', evidenceId: e.id, decision: 'reject', reason: 'No' });
    send(s);
    expect(e.status).toBe('pending');
    expect(e.comment).toBeUndefined();
    // And a new comment replaces the old one rather than being appended to it.
    execute(s, cr, { type: 'reviewEvidence', evidenceId: e.id, decision: 'reject', reason: 'No' });
    expect(send(s, 'Seconda').comment).toBe('Seconda');
  });

  it('treats a blank comment as no comment', () => {
    const parsed = commandSchema.parse({
      type: 'submitEvidence',
      skillId: 'a',
      targetId: 'p1',
      formId: 'f',
      answers: {},
      comment: '   ',
    });
    // The schema trims, so whitespace arrives as '' — and '' must not be stored.
    expect(parsed.type === 'submitEvidence' && parsed.comment).toBe('');
    const s = fixture();
    unlock(s);
    add(s);
    expect(send(s, '').comment).toBeUndefined();
  });
});
// Blue and amber are only labels (review of 2026-11-03): a skill may offer several forms of each.
describe('several forms of the same colour', () => {
  const text = (id: string) => ({ id, label: id, type: 'text' as const, required: true });
  const drafts = [
    { color: 'blue' as const, title: 'Racconto scritto', fields: [text('a')] },
    { color: 'amber' as const, title: 'Video', fields: [text('b')] },
    { color: 'blue' as const, title: 'Intervista', fields: [text('c')] },
  ];
  const save = (s: State, forms = drafts) =>
    execute(s, admin, {
      type: 'saveSkill',
      skill: {
        id: 'multi',
        title: 'Multi',
        description: '',
        scope: 'patrol',
        prerequisites: [],
        public: false,
        forms,
      },
    }) as Skill;

  it('mints distinct ids for two blue forms and keeps them across an identical save', () => {
    const s = fixture();
    const first = save(s).forms.map((f) => f.id);
    expect(new Set(first).size).toBe(3);
    expect(first).toEqual(['multi:blue:r1:0', 'multi:amber:r1:0', 'multi:blue:r1:1']);
    // The October sameQuestions bug lived exactly here: an unchanged form must keep its id.
    const second = save(s).forms.map((f) => f.id);
    expect(second).toEqual(first);
    expect(s.retiredForms).toEqual([]);
  });

  it('retires only the edited one of two same-colour forms', () => {
    const s = fixture();
    const [blue0, , blue1] = save(s).forms;
    const edited = save(s, [drafts[0], drafts[1], { ...drafts[2], title: 'Intervista doppia' }]);
    expect(edited.forms[0].id).toBe(blue0.id);
    expect(edited.forms[2].id).toBe('multi:blue:r2:1');
    expect(s.retiredForms.map((f) => f.id)).toEqual([blue1.id]);
  });

  it('accepts up to eight forms and rejects a ninth at the schema', () => {
    const forms = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...drafts[0], title: `F${i}` }));
    const command = (n: number) => ({
      type: 'saveSkill',
      skill: {
        id: 'm',
        title: 'M',
        description: '',
        scope: 'patrol',
        prerequisites: [],
        public: false,
        forms: forms(n),
      },
    });
    expect(commandSchema.safeParse(command(8)).success).toBe(true);
    expect(commandSchema.safeParse(command(9)).success).toBe(false);
  });

  it('resolves a submission by form id, so the third form is answerable', () => {
    const s = fixture();
    unlock(s);
    const third = save(s).forms[2];
    const e = execute(s, explorer, {
      type: 'submitEvidence',
      skillId: 'multi',
      targetId: 'p1',
      formId: third.id,
      answers: { c: 'Abbiamo intervistato il guardiaparco' },
    }) as Evidence;
    expect(e.formId).toBe(third.id);
    expect(formById(s, e.formId)?.title).toBe('Intervista');
  });

  it('refuses an unknown or retired form id', () => {
    const s = fixture();
    unlock(s);
    const old = save(s).forms[2];
    save(s, [drafts[0], drafts[1], { ...drafts[2], title: 'Cambiato' }]);
    const send = (formId: string) => () =>
      execute(s, explorer, {
        type: 'submitEvidence',
        skillId: 'multi',
        targetId: 'p1',
        formId,
        answers: { c: 'x' },
      });
    expect(send('nope')).toThrow(/Modalità non disponibile/);
    // Retired forms stay readable through Evidence.formId but are never offered again.
    expect(send(old.id)).toThrow(/Modalità non disponibile/);
  });
});
// progress() feeds three screens — the explorer's tree, the leader's patrol cards and the meter on
// /tree — and until now had one oblique assertion covering it, through a single achievement
// threshold. These pin the status precedence and the counting, which are the parts a reader of the
// function has to work out for themselves.
describe('patrol progress', () => {
  const entry = (s: State, patrolId: string, skillId: string) => {
    const data = dashboard(s, admin);
    if (!('patrols' in data)) throw new Error('missing dashboard');
    return data.patrols.find((p) => p.id === patrolId)!.skills.find((k) => k.skillId === skillId)!;
  };
  const patrol = (s: State, patrolId: string) => {
    const data = dashboard(s, admin);
    if (!('patrols' in data)) throw new Error('missing dashboard');
    return data.patrols.find((p) => p.id === patrolId)!;
  };

  it('reports every patrol skill as locked until both initial troop skills are approved', () => {
    const s = fixture();
    add(s);
    expect(entry(s, 'p1', 'a').status).toBe('locked');
    expect(entry(s, 'p1', 'a').missingPrerequisites).toContain('initial-1');
    expect(patrol(s, 'p1').completed).toBe(0);
  });

  it('counts the two initial troop skills towards every patrol of that troop', () => {
    const s = fixture();
    unlock(s, 't1');
    add(s);
    // Both patrols of t1 jump to 2 without having done anything themselves: the loop runs over
    // every skill, and a troop-scoped one is filed against the troop. This is why the achievement
    // with threshold 3 needs only one patrol skill, which nothing else in the suite spells out.
    expect(patrol(s, 'p1').completed).toBe(2);
    expect(patrol(s, 'p2').completed).toBe(2);
    expect(patrol(s, 'p3').completed).toBe(0);
    expect(entry(s, 'p1', 'a').status).toBe('available');
  });

  it('keeps an approved skill completed after a prerequisite is revoked', () => {
    const s = fixture();
    unlock(s);
    add(s);
    add(s, 'b', ['a']);
    approve(s, submit(s, 'a', 'p1'));
    const b = submit(s, 'b', 'p1');
    approve(s, b);
    const a = s.evidence.find((e) => e.skillId === 'a')!;
    execute(s, admin, {
      type: 'reviewEvidence',
      evidenceId: a.id,
      decision: 'reject',
      reason: 'Errore',
    });
    // Approval is checked before prerequisites, so history is not rewritten under the patrol.
    expect(entry(s, 'p1', 'b').status).toBe('completed');
    expect(entry(s, 'p1', 'a').status).toBe('rejected');
  });

  // Decided: a proof keeps its own state even when a prerequisite is revoked under it. The other
  // way round, the patrol stopped seeing it had anything under review — their submission simply
  // vanished behind 'locked' — while the leader's queue still listed it, unapprovable and
  // unexplained. Both facts are now reported, and whether the patrol may act is
  // missingPrerequisites rather than the status.
  it('keeps a pending proof pending when it loses a prerequisite, and says what is missing', () => {
    const s = fixture();
    unlock(s);
    add(s);
    add(s, 'b', ['a']);
    approve(s, submit(s, 'a', 'p1'));
    submit(s, 'b', 'p1');
    expect(entry(s, 'p1', 'b').status).toBe('pending');
    const a = s.evidence.find((e) => e.skillId === 'a')!;
    execute(s, admin, {
      type: 'reviewEvidence',
      evidenceId: a.id,
      decision: 'reject',
      reason: 'Errore',
    });

    expect(entry(s, 'p1', 'b').status).toBe('pending');
    expect(entry(s, 'p1', 'b').missingPrerequisites).toContain('a');
    expect(s.evidence.find((e) => e.skillId === 'b')?.status).toBe('pending');
    // And the reviewer is told, rather than discovering it when the approve button refuses.
    const data = dashboard(s, admin);
    if (!('patrols' in data)) throw new Error('missing dashboard');
    expect(data.evidence.find((e) => e.skillId === 'b')?.missingPrerequisites).toContain('a');
    expect(() =>
      approve(
        s,
        s.evidence.find((e) => e.skillId === 'b')!,
      ),
    ).toThrow();
  });

  it('still reports locked when nothing has been sent at all', () => {
    // 'locked' now means only that: no proof, and none possible yet. It is no longer doing double
    // duty as the UI's gate.
    const s = fixture();
    add(s);
    expect(entry(s, 'p1', 'a').status).toBe('locked');
    expect(entry(s, 'p1', 'a').missingPrerequisites.length).toBeGreaterThan(0);
  });

  it('counts down remaining and stops at zero past the threshold', () => {
    const s = fixture();
    execute(s, admin, {
      type: 'saveAchievements',
      achievements: [{ id: 'due', title: 'Due', threshold: 2 }],
    });
    const remaining = () => patrol(s, 'p1').achievements[0];
    expect(remaining().remaining).toBe(2);
    expect(remaining().earned).toBe(false);
    // unlock() approves both troop skills, which already carries p1 past a threshold of two.
    unlock(s);
    expect(remaining().remaining).toBe(0);
    expect(remaining().earned).toBe(true);
    add(s);
    approve(s, submit(s, 'a', 'p1'));
    expect(patrol(s, 'p1').completed).toBe(3);
    expect(remaining().remaining).toBe(0);
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
