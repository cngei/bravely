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
