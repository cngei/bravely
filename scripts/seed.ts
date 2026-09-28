// Seeds a usable skill catalogue. Runs the same commands an administrator would POST to
// /api/commands, through commandSchema and execute(), so every rule is enforced exactly as
// it is over HTTP — no direct JSON writes. Re-running is safe: saveSkill replaces by id and
// bumps revision, and already-submitted evidence keeps its own formSnapshot.
import { pool, mutate } from '../lib/db';
import { execute } from '../lib/domain';
import { commandSchema, type Command } from '../lib/commands';
import type { Actor, Field, Skill } from '../lib/model';

const admin: Actor = {
  id: 'seed',
  name: 'Seed',
  role: 'admin',
  troopIds: [],
  explorerTroopIds: [],
};

const text = (id: string, label: string): Field => ({ id, label, type: 'text', required: true });
const photos = (label: string, minFiles = 1, maxFiles = 3): Field => ({
  id: 'media',
  label,
  type: 'file',
  required: true,
  minFiles,
  maxFiles,
});

// Ordered: a skill's prerequisites must already exist when it is saved, because
// validateGraph() re-checks the whole graph on every saveSkill.
const catalogue: Omit<Skill, 'revision'>[] = [
  {
    id: 'initial-1',
    title: 'Vita di Reparto',
    description:
      'Prova iniziale di reparto. Documentate come sono nate le pattuglie e come avete scelto di lavorare insieme.',
    scope: 'troop',
    prerequisites: [],
    public: true,
    forms: [
      {
        color: 'blue',
        title: 'Racconto del reparto',
        fields: [text('racconto', 'Come si è organizzato il reparto?')],
      },
      {
        color: 'amber',
        title: 'Foto del reparto',
        fields: [photos('Immagini delle prime attività insieme')],
      },
    ],
  },
  {
    id: 'initial-2',
    title: 'Tecniche Scout di Base',
    description:
      'Prova iniziale di reparto. Nodi, orientamento e pronto soccorso essenziali, verificati insieme.',
    scope: 'troop',
    prerequisites: [],
    public: true,
    forms: [
      {
        color: 'blue',
        title: 'Relazione tecnica',
        fields: [text('tecniche', 'Quali tecniche avete imparato e come le avete verificate?')],
      },
    ],
  },
  {
    id: 'orientamento',
    title: 'Orientamento',
    description:
      'Percorrete un itinerario con carta e bussola e raccontate come vi siete orientati.',
    scope: 'patrol',
    prerequisites: [],
    public: true,
    forms: [
      {
        color: 'blue',
        title: 'Racconto dell’itinerario',
        fields: [text('racconto', 'Che percorso avete fatto e come lo avete seguito?')],
      },
      { color: 'amber', title: 'Foto del percorso', fields: [photos('Foto lungo l’itinerario')] },
    ],
  },
  {
    id: 'pionieristica',
    title: 'Pionieristica',
    description: 'Costruite una struttura utile al campo usando legature e nodi.',
    scope: 'patrol',
    prerequisites: [],
    public: true,
    // Amber only: exercises a skill with no written alternative.
    forms: [
      {
        color: 'amber',
        title: 'Foto della costruzione',
        fields: [photos('Costruzione finita e dettaglio delle legature', 2, 5)],
      },
    ],
  },
  {
    id: 'cucina-trapper',
    title: 'Cucina Trapper',
    description: 'Preparate un pasto completo per la pattuglia senza fornelli a gas.',
    scope: 'patrol',
    prerequisites: [],
    // Non-public on purpose: its documentation must stay inside the troop.
    public: false,
    forms: [
      {
        color: 'blue',
        title: 'Menù e preparazione',
        fields: [text('menu', 'Cosa avete cucinato e come avete gestito il fuoco?')],
      },
    ],
  },
  {
    id: 'esplorazione',
    title: 'Esplorazione',
    description: 'Un’uscita di pattuglia di due giorni, progettata e raccontata da voi.',
    scope: 'patrol',
    prerequisites: ['orientamento'],
    public: true,
    forms: [
      {
        color: 'blue',
        title: 'Diario dell’esplorazione',
        fields: [text('diario', 'Come avete progettato e vissuto l’uscita?')],
      },
      { color: 'amber', title: 'Foto dell’uscita', fields: [photos('Momenti dell’esplorazione')] },
    ],
  },
  {
    id: 'campo-mobile',
    title: 'Campo Mobile',
    description:
      'Tre giorni in movimento con tutto sulle spalle: itinerario, accampamento e cucina autonomi.',
    scope: 'patrol',
    // Transitively also requires orientamento, via esplorazione.
    prerequisites: ['esplorazione', 'pionieristica'],
    public: true,
    forms: [
      {
        color: 'blue',
        title: 'Relazione del campo',
        fields: [text('relazione', 'Raccontate le tappe, gli accampamenti e gli imprevisti.')],
      },
      {
        color: 'amber',
        title: 'Foto del campo',
        fields: [photos('Foto delle tre giornate', 2, 5)],
      },
    ],
  },
];

const saved = await mutate((state) =>
  catalogue.map((skill) => {
    // Parsing first means a bad label or an extra key fails here exactly as it would over HTTP.
    const command: Command = commandSchema.parse({ type: 'saveSkill', skill });
    return execute(state, admin, command) as Skill;
  }),
);

for (const skill of saved)
  console.log(
    `  ${(skill.scope === 'troop' ? 'reparto' : 'pattuglia').padEnd(9)}  ${skill.id.padEnd(15)}` +
      `rev ${skill.revision}  ${skill.forms.map((f) => f.color).join('+')}` +
      `${skill.public ? '' : '  (non pubblica)'}`,
  );
console.log(`\n${saved.length} skill salvate.`);
console.log(
  'Le due skill di reparto vanno inviate e approvate da un capo prima che le skill\n' +
    'di pattuglia si sblocchino: fino a quel momento compaiono tutte come "locked".',
);

await pool.end();
