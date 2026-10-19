export type Role = 'explorer' | 'leader' | 'admin';
export interface Actor {
  id: string;
  name: string;
  role: Role;
  troopIds: string[];
  explorerTroopIds: string[];
}
export interface Troop {
  id: string;
  name: string;
  source: 'cngei' | 'external';
}
export interface Person {
  id: string;
  name: string;
  troopId: string;
  patrolId?: string;
}
export interface ExternalUser {
  subject: string;
  name: string;
  role: 'explorer' | 'leader';
  troopIds: string[];
}
export interface Patrol {
  id: string;
  name: string;
  troopId: string;
}
export interface Field {
  id: string;
  label: string;
  type: 'text' | 'file';
  required: boolean;
  minFiles?: number;
  maxFiles?: number;
}
// Immutable by id. Editing the questions mints a new id and retires the old form into
// State.retiredForms, so a proof that points at the old one keeps the questions it answered.
// This is what replaced Evidence.formSnapshot, which copied the whole form into every proof.
export interface SkillForm {
  id: string;
  /** Carried explicitly rather than parsed out of the id: retired forms outlive their place in
      Skill.forms and still have to say which skill they belong to. */
  skillId: string;
  color: 'blue' | 'amber';
  title: string;
  fields: Field[];
}
// What a caller submits: ids are the domain's to mint, because minting one is what decides
// whether a proof keeps answering the old questions or the new ones. Matches the shape
// commandSchema accepts for saveSkill.
export type SkillFormDraft = Omit<SkillForm, 'id' | 'skillId'>;
/** A skill as submitted: no revision (the domain bumps it) and no form ids (the domain mints them). */
export type SkillDraft = Omit<Skill, 'revision' | 'forms'> & { forms: SkillFormDraft[] };
export interface Skill {
  id: string;
  title: string;
  description: string;
  scope: 'troop' | 'patrol';
  prerequisites: string[];
  forms: SkillForm[];
  public: boolean;
  revision: number;
}
export interface Evidence {
  id: string;
  skillId: string;
  targetId: string;
  targetType: 'troop' | 'patrol';
  startedAt: string;
  submittedAt?: string;
  submittedBy?: string;
  /** The exact form answered. Absent while 'started': no path chosen yet. Replaces formSnapshot,
      skillRevision and color — the first two by reference, the third because a form knows its own
      colour. */
  formId?: string;
  answers?: Record<string, string | string[]>;
  status: 'started' | 'pending' | 'approved' | 'rejected';
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}
// history[] is deliberately gone. It was append-only, never read by any rule, and duplicated
// what the columns above already say: who submitted, who decided, when, and why. All it added
// were the earlier rounds of a resubmitted proof, which the team decided they do not need.
// Attachments from those rounds survive regardless — nothing deletes uploads or files.
export interface Upload {
  id: string;
  targetId: string;
  targetType: 'troop' | 'patrol';
  skillId: string;
  name: string;
  type: string;
  size: number;
  createdBy: string;
  createdAt: string;
}
export interface Achievement {
  id: string;
  title: string;
  threshold: number;
}
export interface State {
  troops: Troop[];
  people: Person[];
  externalUsers: ExternalUser[];
  patrols: Patrol[];
  skills: Skill[];
  /** Forms superseded by an edit, kept only so proofs submitted against them can still be read.
      Never offered to a patrol again — Skill.forms is what is on offer. */
  retiredForms: SkillForm[];
  evidence: Evidence[];
  uploads: Upload[];
  achievements: Achievement[];
}
// Form ids follow <skill>:<colour>:r<revision>, the same scheme the migrations used, so the next
// edit of a form naturally lands on a new id rather than overwriting the one proofs point at.
export const formId = (skillId: string, color: 'blue' | 'amber', revision: number) =>
  `${skillId}:${color}:r${revision}`;
/** Diff base for a first write: everything in a State, empty. */
export const emptyState = (): State => ({
  troops: [],
  people: [],
  externalUsers: [],
  patrols: [],
  skills: [],
  retiredForms: [],
  evidence: [],
  uploads: [],
  achievements: [],
});
export function initialState(): State {
  const form = (skillId: string): SkillForm => ({
    id: formId(skillId, 'blue', 1),
    skillId,
    color: 'blue',
    title: 'Documentazione di reparto',
    fields: [
      { id: 'description', label: 'Descrivi la prova svolta', type: 'text', required: true },
    ],
  });
  return {
    troops: [],
    people: [],
    externalUsers: [],
    patrols: [],
    skills: [1, 2].map((n) => ({
      id: `initial-${n}`,
      title: `Skill iniziale di reparto ${n}`,
      description: 'Configurare titolo e prove dal pannello amministratore.',
      scope: 'troop' as const,
      prerequisites: [],
      forms: [form(`initial-${n}`)],
      public: false,
      revision: 1,
    })),
    retiredForms: [],
    evidence: [],
    uploads: [],
    achievements: [
      { id: 'three', title: 'Spillette al campo nazionale', threshold: 3 },
      { id: 'ten', title: 'Stretta di mano con Luca Pennisi', threshold: 10 },
      { id: 'twenty', title: 'Autografo di Mariano', threshold: 20 },
    ],
  };
}
