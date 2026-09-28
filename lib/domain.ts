import { randomUUID } from 'node:crypto';
import type { Actor, State, Skill, Evidence, Patrol, Upload } from './model';
import type { Command } from './commands';
import { assert } from './errors';
const unique = (items: string[]) => new Set(items).size === items.length;
export function assignedPatrol(s: State, a: Actor): Patrol | undefined {
  const person = s.people.find((p) => p.id === a.id && a.explorerTroopIds.includes(p.troopId));
  return s.patrols.find((p) => p.id === person?.patrolId && p.troopId === person?.troopId);
}
export function active(s: State, a: Actor) {
  assert(
    a.role !== 'explorer' || assignedPatrol(s, a),
    403,
    'ASSIGNMENT_REQUIRED',
    'Contatta il tuo capo reparto per essere assegnato a una pattuglia.',
  );
}
export function manage(a: Actor, troopId: string) {
  assert(
    a.role === 'admin' || (a.role === 'leader' && a.troopIds.includes(troopId)),
    403,
    'FORBIDDEN',
    'Reparto non gestibile.',
  );
}
function admin(a: Actor) {
  assert(a.role === 'admin', 403, 'FORBIDDEN', 'Riservato agli amministratori Bravely.');
}
export function skillById(s: State, id: string): Skill {
  const skill = s.skills.find((k) => k.id === id);
  assert(skill, 404, 'NOT_FOUND', 'Skill non trovata.');
  return skill;
}
export function evidenceTroop(s: State, e: Pick<Evidence, 'targetId' | 'targetType'>): string {
  if (e.targetType === 'troop') return e.targetId;
  const p = s.patrols.find((p) => p.id === e.targetId);
  assert(p, 404, 'NOT_FOUND', 'Pattuglia non trovata.');
  return p.troopId;
}
function context(s: State, skill: Skill, targetId: string) {
  const target =
    skill.scope === 'troop'
      ? s.troops.find((t) => t.id === targetId)
      : s.patrols.find((p) => p.id === targetId);
  assert(target, 404, 'NOT_FOUND', 'Destinatario non trovato.');
  return {
    troopId: skill.scope === 'troop' ? target.id : (target as Patrol).troopId,
    patrolId: skill.scope === 'patrol' ? target.id : undefined,
  };
}
export function missingPrerequisites(s: State, skill: Skill, targetId: string): string[] {
  const ctx = context(s, skill, targetId);
  const needed = new Set<string>();
  function visit(k: Skill) {
    for (const id of k.prerequisites)
      if (!needed.has(id)) {
        needed.add(id);
        visit(skillById(s, id));
      }
  }
  visit(skill);
  if (skill.scope === 'patrol')
    for (const k of s.skills.filter((k) => k.scope === 'troop')) needed.add(k.id);
  return [...needed].filter((id) => {
    const k = skillById(s, id);
    const target = k.scope === 'troop' ? ctx.troopId : ctx.patrolId;
    return !s.evidence.some(
      (e) => e.skillId === id && e.targetId === target && e.status === 'approved',
    );
  });
}
export function canWriteTarget(s: State, a: Actor, skill: Skill, targetId: string) {
  active(s, a);
  const ctx = context(s, skill, targetId);
  if (skill.scope === 'troop') manage(a, ctx.troopId);
  else if (a.role === 'explorer')
    assert(
      assignedPatrol(s, a)?.id === targetId,
      403,
      'FORBIDDEN',
      'Puoi inviare soltanto per la tua pattuglia.',
    );
  else manage(a, ctx.troopId);
}
export function writable(s: State, a: Actor, skill: Skill, targetId: string) {
  canWriteTarget(s, a, skill, targetId);
  assert(
    missingPrerequisites(s, skill, targetId).length === 0,
    409,
    'PREREQUISITES_MISSING',
    'Completa tutti i prerequisiti antecedenti.',
  );
  const e = s.evidence.find((e) => e.skillId === skill.id && e.targetId === targetId);
  assert(
    e?.status !== 'approved',
    409,
    'EVIDENCE_LOCKED',
    'La prova approvata non può essere modificata.',
  );
  return e;
}
function validateGraph(skills: Skill[]) {
  assert(
    skills.filter((k) => k.scope === 'troop').length === 2,
    400,
    'INITIAL_SKILLS',
    'Sono richieste esattamente due skill iniziali di reparto.',
  );
  const done = new Set<string>(),
    visiting = new Set<string>();
  function visit(k: Skill) {
    assert(!visiting.has(k.id), 400, 'CYCLE', 'I prerequisiti devono formare un grafo aciclico.');
    if (done.has(k.id)) return;
    visiting.add(k.id);
    assert(unique(k.prerequisites), 400, 'DUPLICATE', 'Prerequisiti duplicati.');
    assert(
      k.scope !== 'troop' || k.prerequisites.length === 0,
      400,
      'INITIAL_SKILLS',
      'Le skill iniziali non hanno prerequisiti.',
    );
    for (const id of k.prerequisites) {
      const p = skills.find((k) => k.id === id);
      assert(p, 400, 'UNKNOWN_PREREQUISITE', 'Prerequisito inesistente.');
      visit(p);
    }
    visiting.delete(k.id);
    done.add(k.id);
  }
  for (const k of skills) visit(k);
}
function start(s: State, a: Actor, skill: Skill, targetId: string, now: string): Evidence {
  let e = writable(s, a, skill, targetId);
  if (!e) {
    e = {
      id: randomUUID(),
      skillId: skill.id,
      targetId,
      targetType: skill.scope,
      startedAt: now,
      status: 'started',
      history: [{ at: now, actor: a.id, action: 'started' }],
    };
    s.evidence.push(e);
  }
  return e;
}
export function execute(s: State, a: Actor, c: Command, now = new Date().toISOString()): unknown {
  active(s, a);
  switch (c.type) {
    case 'createPatrol': {
      manage(a, c.troopId);
      assert(
        s.troops.some((t) => t.id === c.troopId),
        404,
        'NOT_FOUND',
        'Reparto non trovato.',
      );
      assert(
        !s.patrols.some(
          (p) =>
            p.troopId === c.troopId && p.name.toLocaleLowerCase() === c.name.toLocaleLowerCase(),
        ),
        409,
        'DUPLICATE',
        'Nome pattuglia già presente nel reparto.',
      );
      const p = { id: randomUUID(), name: c.name, troopId: c.troopId };
      s.patrols.push(p);
      return p;
    }
    case 'assignExplorer': {
      const p = s.people.find((p) => p.id === c.personId),
        ptg = s.patrols.find((p) => p.id === c.patrolId);
      assert(p && ptg, 404, 'NOT_FOUND', 'Esploratore o pattuglia non trovato.');
      manage(a, p.troopId);
      manage(a, ptg.troopId);
      assert(
        p.troopId === ptg.troopId,
        400,
        'CROSS_TROOP',
        'La pattuglia deve appartenere al reparto dell’esploratore.',
      );
      p.patrolId = ptg.id;
      return p;
    }
    case 'saveSkill': {
      admin(a);
      const old = s.skills.find((k) => k.id === c.skill.id);
      assert(
        !old || old.scope === c.skill.scope,
        409,
        'SCOPE_IMMUTABLE',
        'Non è possibile cambiare l’ambito di una skill.',
      );
      assert(
        unique(c.skill.forms.map((f) => f.color)),
        400,
        'DUPLICATE',
        'Un solo form per colore.',
      );
      for (const f of c.skill.forms) {
        assert(
          unique(f.fields.map((f) => f.id)),
          400,
          'DUPLICATE',
          'Identificatori dei campi duplicati.',
        );
        for (const field of f.fields)
          assert(
            (field.minFiles ?? 1) <= (field.maxFiles ?? 10),
            400,
            'INVALID_FILES',
            'Limiti file non validi.',
          );
      }
      const skill = { ...c.skill, revision: (old?.revision ?? 0) + 1 };
      const next = s.skills.filter((k) => k.id !== skill.id).concat(skill);
      validateGraph(next);
      s.skills = next;
      return skill;
    }
    case 'saveAchievements':
      admin(a);
      assert(unique(c.achievements.map((x) => x.id)), 400, 'DUPLICATE', 'Achievement duplicati.');
      s.achievements = c.achievements;
      return s.achievements;
    case 'createTroop': {
      admin(a);
      const troop = { id: `external:${randomUUID()}`, name: c.name, source: 'external' as const };
      s.troops.push(troop);
      return troop;
    }
    case 'saveExternalUser': {
      admin(a);
      const u = c.user;
      assert(
        unique(u.troopIds) &&
          u.troopIds.every((id) => s.troops.some((t) => t.id === id && t.source === 'external')),
        400,
        'INVALID_TROOP',
        'Seleziona reparti esterni validi.',
      );
      assert(
        u.role !== 'explorer' || u.troopIds.length === 1,
        400,
        'INVALID_TROOP',
        'Un esploratore appartiene a un solo reparto.',
      );
      s.externalUsers = s.externalUsers.filter((x) => x.subject !== u.subject).concat(u);
      const id = `oidc:${u.subject}`,
        old = s.people.find((p) => p.id === id);
      s.people = s.people.filter((p) => p.id !== id);
      if (u.role === 'explorer')
        s.people.push({
          id,
          name: u.name,
          troopId: u.troopIds[0],
          patrolId: old?.troopId === u.troopIds[0] ? old.patrolId : undefined,
        });
      return u;
    }
    case 'startSkill':
      return start(s, a, skillById(s, c.skillId), c.targetId, now);
    case 'submitEvidence': {
      const skill = skillById(s, c.skillId);
      writable(s, a, skill, c.targetId);
      const form = skill.forms.find((f) => f.color === c.color);
      assert(form, 400, 'INVALID_FORM', 'Modalità non disponibile.');
      assert(
        Object.keys(c.answers).every((key) => form.fields.some((f) => f.id === key)),
        400,
        'INVALID_ANSWERS',
        'Campo sconosciuto.',
      );
      for (const f of form.fields) {
        const v = c.answers[f.id];
        if (f.type === 'text') {
          assert(
            v === undefined || typeof v === 'string',
            400,
            'INVALID_ANSWERS',
            'Risposta testuale richiesta.',
          );
          assert(
            !f.required || (typeof v === 'string' && v.trim().length > 0),
            400,
            'REQUIRED_FIELD',
            `Campo obbligatorio: ${f.label}`,
          );
        } else {
          assert(
            v === undefined || Array.isArray(v),
            400,
            'INVALID_ANSWERS',
            'Elenco file richiesto.',
          );
          const ids = (v ?? []) as string[];
          assert(
            unique(ids) &&
              ids.length <= (f.maxFiles ?? 10) &&
              (!f.required || ids.length >= (f.minFiles ?? 1)),
            400,
            'INVALID_FILES',
            `Numero di file non valido: ${f.label}`,
          );
          for (const id of ids)
            assert(
              s.uploads.some(
                (u) => u.id === id && u.skillId === skill.id && u.targetId === c.targetId,
              ),
              400,
              'INVALID_FILES',
              'Allegato non appartenente a questa prova.',
            );
        }
      }
      const e = start(s, a, skill, c.targetId, now);
      e.color = c.color;
      e.answers = structuredClone(c.answers);
      e.formSnapshot = structuredClone(form);
      e.skillRevision = skill.revision;
      e.submittedAt = now;
      e.submittedBy = a.id;
      e.status = 'pending';
      delete e.reason;
      delete e.reviewedAt;
      delete e.reviewedBy;
      e.history.push({
        at: now,
        actor: a.id,
        action: 'submitted',
        answers: structuredClone(c.answers),
        form: structuredClone(form),
      });
      return e;
    }
    case 'reviewEvidence': {
      const e = s.evidence.find((e) => e.id === c.evidenceId);
      assert(e, 404, 'NOT_FOUND', 'Prova non trovata.');
      manage(a, evidenceTroop(s, e));
      assert(
        e.status === 'pending' || (c.decision === 'reject' && e.status === 'approved'),
        409,
        'INVALID_TRANSITION',
        'La prova non è revisionabile in questo stato.',
      );
      if (c.decision === 'reject')
        assert(c.reason?.trim(), 400, 'REASON_REQUIRED', 'Specifica la motivazione del rigetto.');
      if (c.decision === 'approve')
        assert(
          missingPrerequisites(s, skillById(s, e.skillId), e.targetId).length === 0,
          409,
          'PREREQUISITES_MISSING',
          'I prerequisiti non sono più soddisfatti.',
        );
      e.status = c.decision === 'approve' ? 'approved' : 'rejected';
      e.reason = c.decision === 'reject' ? c.reason : undefined;
      e.reviewedAt = now;
      e.reviewedBy = a.id;
      e.history.push({ at: now, actor: a.id, action: e.status, reason: e.reason });
      return e;
    }
    default: {
      // Assigning to `never` turns a forgotten Command variant into a compile error
      // instead of a silent `undefined` response.
      const unhandled: never = c;
      assert(
        false,
        400,
        'UNKNOWN_COMMAND',
        `Comando non supportato: ${(unhandled as Command).type}`,
      );
    }
  }
}
export function canReadEvidence(s: State, a: Actor, e: Evidence): boolean {
  if (a.role === 'admin' || a.role === 'leader') return true;
  const p = assignedPatrol(s, a);
  if (!p) return false;
  if (e.targetType === 'patrol' && e.targetId === p.id) return true;
  const skill = skillById(s, e.skillId);
  const ownTarget = skill.scope === 'troop' ? p.troopId : p.id;
  return (
    skill.public &&
    e.status === 'approved' &&
    s.evidence.some(
      (x) => x.skillId === skill.id && x.targetId === ownTarget && x.status === 'approved',
    )
  );
}
export function evidenceView(s: State, a: Actor, e: Evidence) {
  if (
    a.role !== 'explorer' ||
    (e.targetType === 'patrol' && assignedPatrol(s, a)?.id === e.targetId)
  )
    return e;
  // Public documentation exposes the accepted version, never earlier rejected drafts.
  const { history, submittedBy, reviewedBy, ...visible } = e;
  return visible;
}
export function canReadUpload(s: State, a: Actor, u: Upload): boolean {
  if (a.role === 'admin' || a.role === 'leader') return true;
  const p = assignedPatrol(s, a);
  if (!p) return false;
  if (u.targetType === 'patrol' && u.targetId === p.id) return true;
  return s.evidence.some(
    (e) =>
      canReadEvidence(s, a, e) &&
      e.status === 'approved' &&
      e.formSnapshot?.fields
        .filter((f) => f.type === 'file')
        .some(
          (f) => Array.isArray(e.answers?.[f.id]) && (e.answers![f.id] as string[]).includes(u.id),
        ),
  );
}
function progress(s: State, p: Patrol) {
  const skills = s.skills.map((k) => {
    const target = k.scope === 'troop' ? p.troopId : p.id,
      e = s.evidence.find((e) => e.skillId === k.id && e.targetId === target),
      missing = missingPrerequisites(s, k, target);
    return {
      skillId: k.id,
      targetId: target,
      status:
        e?.status === 'approved'
          ? 'completed'
          : missing.length
            ? 'locked'
            : (e?.status ?? 'available'),
      missingPrerequisites: missing,
      startedAt: e?.startedAt,
    };
  });
  const completed = skills.filter((k) => k.status === 'completed').length;
  return {
    ...p,
    skills,
    completed,
    achievements: s.achievements.map((x) => ({
      ...x,
      earned: completed >= x.threshold,
      remaining: Math.max(0, x.threshold - completed),
    })),
  };
}
export function dashboard(s: State, a: Actor, now = Date.now()) {
  const user = { id: a.id, name: a.name, role: a.role };
  const own = assignedPatrol(s, a);
  if (a.role === 'explorer' && !own)
    return {
      user,
      assignmentRequired: true,
      message: 'Contatta il tuo capo reparto per essere assegnato a una pattuglia.',
    };
  const patrols = s.patrols.filter(
    (p) =>
      a.role === 'admin' ||
      (a.role === 'leader' ? a.troopIds.includes(p.troopId) : p.id === own?.id),
  );
  const troops = s.troops.filter(
    (t) =>
      a.role === 'admin' ||
      (a.role === 'leader' ? a.troopIds.includes(t.id) : t.id === own?.troopId),
  );
  const evidence = s.evidence
    .filter(
      (e) =>
        a.role === 'admin' ||
        (a.role === 'leader' ? a.troopIds.includes(evidenceTroop(s, e)) : e.targetId === own?.id),
    )
    .map((e) => ({
      ...e,
      waitingSeconds:
        e.status === 'pending'
          ? Math.max(0, Math.floor((now - Date.parse(e.submittedAt!)) / 1000))
          : 0,
    }));
  return {
    user,
    assignmentRequired: false,
    troops,
    people: s.people.filter(
      (p) =>
        troops.some((t) => t.id === p.troopId) && (a.role !== 'explorer' || p.patrolId === own?.id),
    ),
    patrols: patrols.map((p) => progress(s, p)),
    skills: s.skills,
    evidence,
    achievements: s.achievements,
    ...(a.role === 'admin' ? { externalUsers: s.externalUsers } : {}),
  };
}
export function skillDetail(s: State, a: Actor, id: string) {
  active(s, a);
  const skill = skillById(s, id);
  const achievers = s.patrols
    .filter((p) =>
      s.evidence.some(
        (e) =>
          e.skillId === id &&
          e.status === 'approved' &&
          e.targetId === (skill.scope === 'troop' ? p.troopId : p.id),
      ),
    )
    .map((p) => ({
      patrolId: p.id,
      patrolName: p.name,
      troopName: s.troops.find((t) => t.id === p.troopId)?.name,
    }));
  return {
    skill,
    achieverCount: achievers.length,
    achievers,
    documentation: s.evidence
      .filter((e) => e.skillId === id && canReadEvidence(s, a, e))
      .map((e) => ({
        ...evidenceView(s, a, e),
        files: s.uploads
          .filter((u) => u.skillId === id && u.targetId === e.targetId && canReadUpload(s, a, u))
          .map((u) => ({ ...u, url: `/api/files/${u.id}` })),
      })),
  };
}
