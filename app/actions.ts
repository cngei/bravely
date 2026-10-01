'use server';
// Server Actions are public POST endpoints, reachable without going through the UI, so each
// one re-resolves the actor and re-parses its input. They are a second transport over the
// same rules as POST /api/commands — never a shortcut around them. Next verifies Origin
// against Host itself, which is why checkOrigin() is not repeated here.
import { ZodError } from 'zod';
import { refresh } from 'next/cache';
import { currentActor } from '@/lib/service';
import { mutate } from '@/lib/db';
import { execute } from '@/lib/domain';
import { commandSchema } from '@/lib/commands';
import { AppError } from '@/lib/errors';
import type { Skill, SkillForm, State } from '@/lib/model';

// `ok` exists so a form can tell a successful save from its own initial state: useActionState
// starts at {}, and without the flag "saved" and "never submitted" look identical.
export type ActionResult = { error?: string; ok?: true };

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

async function run(command: unknown): Promise<ActionResult> {
  return runWith(() => command);
}

// saveSkill replaces the whole skill, so editing one field means reading the current value
// first. The build callback runs inside mutate(), under the same row lock as the write, so a
// concurrent edit cannot be silently clobbered between the read and the save.
async function runWith(build: (state: State) => unknown): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await mutate((state) => execute(state, actor, commandSchema.parse(build(state))));
  } catch (error) {
    // Domain rules already carry a user-facing Italian message; anything else is a real
    // fault and belongs to the error boundary, not to a form field.
    if (error instanceof AppError) return { error: error.message };
    if (error instanceof ZodError) return { error: 'Dati non validi.' };
    throw error;
  }
  // Outside the try: refresh() must not be mistaken for a failed mutation.
  refresh();
  return { ok: true };
}

export async function createPatrolAction(
  troopId: string,
  _previous: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  return run({ type: 'createPatrol', troopId, name: field(data, 'name') });
}

export async function assignExplorerAction(
  _previous: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  return run({
    type: 'assignExplorer',
    personId: field(data, 'personId'),
    patrolId: field(data, 'patrolId'),
  });
}

export async function startSkillAction(
  skillId: string,
  targetId: string,
  _previous: ActionResult,
): Promise<ActionResult> {
  return run({ type: 'startSkill', skillId, targetId });
}

export async function reviewEvidenceAction(
  evidenceId: string,
  _previous: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  const decision = field(data, 'decision') === 'reject' ? 'reject' : 'approve';
  const reason = field(data, 'reason').trim();
  // The schema is strict, so `reason` is sent only where the domain accepts it.
  return run({ type: 'reviewEvidence', evidenceId, decision, ...(reason ? { reason } : {}) });
}

// Called directly rather than through a <form action>: uploads must finish client-side first,
// because Server Action bodies are capped at 1 MB while an attachment may be up to 25 MiB.
export async function submitEvidenceAction(input: {
  skillId: string;
  targetId: string;
  color: 'blue' | 'amber';
  answers: Record<string, string | string[]>;
}): Promise<ActionResult> {
  return run({ type: 'submitEvidence', ...input });
}

// ---------------------------------------------------------------------------
// Catalogue administration. execute() enforces the admin role itself, so these
// are safe even though they are reachable as plain POSTs.
// ---------------------------------------------------------------------------

// `revision` is assigned by the server and rejected by the schema, so it is dropped here.
const asPayload = (skill: Skill) => {
  const { revision: _assignedByServer, ...payload } = skill;
  return payload;
};

const requireSkill = (state: State, skillId: string): Skill => {
  const skill = state.skills.find((k) => k.id === skillId);
  if (!skill) throw new AppError(404, 'NOT_FOUND', 'Skill non trovata.');
  return skill;
};

export async function addPrerequisiteAction(
  skillId: string,
  prerequisiteId: string,
): Promise<ActionResult> {
  return runWith((state) => {
    const skill = requireSkill(state, skillId);
    // validateGraph() rejects cycles, duplicates and unknown ids, so no check is repeated here.
    return {
      type: 'saveSkill',
      skill: {
        ...asPayload(skill),
        prerequisites: [...new Set([...skill.prerequisites, prerequisiteId])],
      },
    };
  });
}

export async function removePrerequisiteAction(
  skillId: string,
  prerequisiteId: string,
): Promise<ActionResult> {
  return runWith((state) => {
    const skill = requireSkill(state, skillId);
    return {
      type: 'saveSkill',
      skill: {
        ...asPayload(skill),
        prerequisites: skill.prerequisites.filter((id) => id !== prerequisiteId),
      },
    };
  });
}

export async function saveSkillMetaAction(
  skillId: string,
  _previous: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  return runWith((state) => ({
    type: 'saveSkill',
    skill: {
      ...asPayload(requireSkill(state, skillId)),
      title: field(data, 'title'),
      description: field(data, 'description'),
      public: data.get('public') !== null,
    },
  }));
}

// Ids are referenced by other skills' prerequisites, so they are slugs rather than uuids:
// readable in the API and in scripts/seed.ts.
const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);

// A skill cannot exist without at least one form (the schema requires 1..2), so a new one
// starts with a single blue text question that the form builder can then edit.
const STARTER_FORM: SkillForm = {
  color: 'blue',
  title: 'Racconto',
  fields: [{ id: 'racconto', label: 'Com’è andata la prova?', type: 'text', required: true }],
};

export async function createSkillAction(
  _previous: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  const title = field(data, 'title').trim();
  const id = slugify(field(data, 'id') || title);
  if (!id) return { error: 'Serve un titolo per generare l’identificatore.' };
  return runWith((state) => {
    if (state.skills.some((k) => k.id === id))
      throw new AppError(409, 'DUPLICATE', `Esiste già una skill con id "${id}".`);
    return {
      type: 'saveSkill',
      // Always patrol scope: validateGraph() requires exactly two troop skills, forever.
      skill: {
        id,
        title,
        description: field(data, 'description'),
        scope: 'patrol' as const,
        prerequisites: [],
        public: false,
        forms: [STARTER_FORM],
      },
    };
  });
}
