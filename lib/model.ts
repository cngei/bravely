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
export interface SkillForm {
  color: 'blue' | 'amber';
  title: string;
  fields: Field[];
}
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
  color?: 'blue' | 'amber';
  answers?: Record<string, string | string[]>;
  formSnapshot?: SkillForm;
  skillRevision?: number;
  status: 'started' | 'pending' | 'approved' | 'rejected';
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  history: {
    at: string;
    actor: string;
    action: string;
    reason?: string;
    answers?: Record<string, string | string[]>;
    form?: SkillForm;
  }[];
}
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
  evidence: Evidence[];
  uploads: Upload[];
  achievements: Achievement[];
}
export function initialState(): State {
  const form: SkillForm = {
    color: 'blue',
    title: 'Documentazione di reparto',
    fields: [
      { id: 'description', label: 'Descrivi la prova svolta', type: 'text', required: true },
    ],
  };
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
      forms: [form],
      public: false,
      revision: 1,
    })),
    evidence: [],
    uploads: [],
    achievements: [
      { id: 'three', title: 'Spillette al campo nazionale', threshold: 3 },
      { id: 'ten', title: 'Stretta di mano con Luca Pennisi', threshold: 10 },
      { id: 'twenty', title: 'Autografo di Mariano', threshold: 20 },
    ],
  };
}
