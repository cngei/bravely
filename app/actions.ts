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

export type ActionResult = { error?: string };

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

async function run(command: unknown): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await mutate((state) => execute(state, actor, commandSchema.parse(command)));
  } catch (error) {
    // Domain rules already carry a user-facing Italian message; anything else is a real
    // fault and belongs to the error boundary, not to a form field.
    if (error instanceof AppError) return { error: error.message };
    if (error instanceof ZodError) return { error: 'Dati non validi.' };
    throw error;
  }
  // Outside the try: refresh() must not be mistaken for a failed mutation.
  refresh();
  return {};
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
