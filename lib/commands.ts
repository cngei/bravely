import { z } from 'zod';
const id = z.string().min(1).max(150);
const label = z.string().trim().min(1).max(300);
const field = z
  .object({
    id,
    label,
    type: z.enum(['text', 'file']),
    required: z.boolean(),
    minFiles: z.number().int().min(1).max(10).optional(),
    maxFiles: z.number().int().min(1).max(10).optional(),
  })
  .strict();
const form = z
  .object({ color: z.enum(['blue', 'amber']), title: label, fields: z.array(field).min(1).max(50) })
  .strict();
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createPatrol'), troopId: id, name: label }).strict(),
  z.object({ type: z.literal('assignExplorer'), personId: id, patrolId: id }).strict(),
  z
    .object({
      type: z.literal('saveSkill'),
      skill: z
        .object({
          id,
          title: label,
          description: z.string().max(10000),
          scope: z.enum(['troop', 'patrol']),
          prerequisites: z.array(id).max(100),
          forms: z.array(form).min(1).max(2),
          public: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('saveAchievements'),
      achievements: z
        .array(
          z.object({ id, title: label, threshold: z.number().int().min(1).max(10000) }).strict(),
        )
        .max(100),
    })
    .strict(),
  z.object({ type: z.literal('createTroop'), name: label }).strict(),
  z
    .object({
      type: z.literal('saveExternalUser'),
      user: z
        .object({
          subject: id,
          name: label,
          role: z.enum(['explorer', 'leader']),
          troopIds: z.array(id).min(1).max(50),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('startSkill'), skillId: id, targetId: id }).strict(),
  z
    .object({
      type: z.literal('submitEvidence'),
      skillId: id,
      targetId: id,
      color: z.enum(['blue', 'amber']),
      answers: z.record(z.string(), z.union([z.string().max(20000), z.array(z.string()).max(10)])),
    })
    .strict(),
  z
    .object({
      type: z.literal('reviewEvidence'),
      evidenceId: id,
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().max(5000).optional(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;

// Which commands still have to serialize against each other, now that the domain lives in tables
// instead of one row whose lock serialized everything.
//
// Only two need it, and both for the same reason: they enforce an invariant that spans rows and
// that the schema cannot express, so two concurrent runs can each be valid alone and invalid
// together.
//   createPatrol  the duplicate-name check is case-insensitive per troop, in application code.
//   saveSkill     validateGraph() checks the whole DAG and the "exactly two initial skills" rule;
//                 two concurrent saves could compose a cycle neither of them sees.
//
// Everything else is safe to run concurrently:
//   startSkill / submitEvidence  UNIQUE (skill_id, target_id) now enforces one proof per target,
//                 which is precisely what the global lock was protecting. A submission racing a
//                 revoked prerequisite is still caught, because reviewEvidence re-checks them
//                 before approving.
//   reviewEvidence / assignExplorer / saveAchievements / saveExternalUser  single-row outcomes
//                 where two racing writers want the same end state or the later one legitimately
//                 wins — a human race, not a corrupted invariant.
//   createTroop   a fresh uuid cannot collide.
const SERIALIZED = new Set<Command['type']>(['createPatrol', 'saveSkill']);
export const needsGlobalLock = (command: Command) => SERIALIZED.has(command.type);
