'use client';
// Admin editor for the skill DAG. Deliberately not optimistic: every gesture round-trips to
// the server and refresh() re-renders from the stored state, so what you see is always what
// validateGraph() accepted. Dragging an edge that would create a cycle simply snaps back with
// the server's own message.
//
// Each gesture saves immediately rather than batching. There is no command that writes several
// skills at once, so a batch would apply skill by skill and could half-fail, leaving the
// catalogue in a state the admin never asked for. The cost is a bumped `revision` per edit,
// which is only bookkeeping.
import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  addPrerequisiteAction,
  createSkillAction,
  removePrerequisiteAction,
  saveSkillMetaAction,
  type ActionResult,
} from '@/app/actions';

export interface EditorSkill {
  id: string;
  title: string;
  description: string;
  scope: 'troop' | 'patrol';
  prerequisites: string[];
  public: boolean;
  revision: number;
  x: number;
  y: number;
}

export interface EditorEdge {
  id: string;
  source: string;
  target: string;
  implicit: boolean;
}

type EditorData = { title: string; id: string; scope: 'troop' | 'patrol'; isPublic: boolean };

function EditorNode({ data, selected }: NodeProps<Node<EditorData>>) {
  return (
    <>
      {/* Troop skills may not have prerequisites, so they expose no target handle. */}
      {data.scope === 'patrol' && <Handle type="target" position={Position.Top} />}
      <div className="editor-node" data-scope={data.scope} data-selected={selected || undefined}>
        <span className="editor-node-title">{data.title}</span>
        <span className="editor-node-id">{data.id}</span>
        <span className="editor-node-tags">
          {data.scope === 'troop' ? 'reparto' : 'pattuglia'}
          {data.isPublic ? ' · allegati pubblici' : ''}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

const nodeTypes = { editorSkill: EditorNode };

export function SkillEditor({ skills, edges }: { skills: EditorSkill[]; edges: EditorEdge[] }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const selected = skills.find((skill) => skill.id === selectedId);

  // Canvas gestures have no form to anchor a message to, so the confirmation is transient.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function apply(action: () => Promise<ActionResult>, done = 'Salvato.') {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await action();
      if (result.error) setError(result.error);
      else setNotice(done);
    } catch {
      setError('Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  const flowNodes = useMemo<Node<EditorData>[]>(
    () =>
      skills.map((skill) => ({
        id: skill.id,
        type: 'editorSkill',
        position: { x: skill.x, y: skill.y },
        data: {
          title: skill.title,
          id: skill.id,
          scope: skill.scope,
          isPublic: skill.public,
        },
      })),
    [skills],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        // Implicit edges are not stored anywhere, so they must not be deletable.
        deletable: !edge.implicit,
        style: edge.implicit ? { strokeDasharray: '5 5' } : undefined,
      })),
    [edges],
  );

  // Advisory only — execute() is the authority. This just avoids obviously doomed gestures.
  const isValidConnection = (connection: Connection | Edge) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;
    return skills.find((skill) => skill.id === connection.target)?.scope === 'patrol';
  };

  return (
    <div className="editor">
      <div>
        <div className="tree-flow">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            // Removal lives in the panel, not on the canvas: a controlled flow would need
            // onEdgesChange to apply a key-press deletion, and Backspace does not exist on a
            // phone. The canvas navigates and connects; the panel edits.
            deleteKeyCode={null}
            edgesFocusable={false}
            isValidConnection={isValidConnection}
            onConnect={(connection) => {
              if (!connection.source || !connection.target) return;
              // Edge direction is prerequisite → dependant, so the target is what we edit.
              void apply(() => addPrerequisiteAction(connection.target, connection.source));
            }}
            onNodeClick={(_event, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(undefined)}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <p className="muted">
          Trascina da un pallino inferiore a quello superiore di un’altra skill per aggiungere un
          prerequisito, oppure usa il pannello. I prerequisiti si rimuovono dal pannello. Le linee
          tratteggiate sono il requisito implicito delle due skill iniziali: non si modificano.
        </p>
        {busy && <p className="muted">Salvataggio…</p>}
        {notice && !busy && (
          <p className="ok" role="status">
            {notice}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <aside className="editor-panel">
        {selected ? (
          <>
            <h3>{selected.title}</h3>
            <p className="muted">
              <code>{selected.id}</code> · revisione {selected.revision} ·{' '}
              {selected.scope === 'troop' ? 'skill iniziale di reparto' : 'skill di pattuglia'}
            </p>

            <Prerequisites
              skill={selected}
              skills={skills}
              busy={busy}
              onAdd={(id) => apply(() => addPrerequisiteAction(selected.id, id))}
              onRemove={(id) => apply(() => removePrerequisiteAction(selected.id, id))}
            />

            {/* Keyed so switching selection resets the uncontrolled inputs to the new skill. */}
            <SkillMetaForm key={selected.id} skill={selected} />
          </>
        ) : (
          <>
            <h3>Nuova skill</h3>
            <NewSkillForm />
            <p className="muted" style={{ marginTop: '1rem' }}>
              Clicca una skill nel grafo per modificarla.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

// Outside the metadata <form>: these are separate commands, and a nested form is invalid HTML.
function Prerequisites({
  skill,
  skills,
  busy,
  onAdd,
  onRemove,
}: {
  skill: EditorSkill;
  skills: EditorSkill[];
  busy: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const titleOf = (id: string) => skills.find((s) => s.id === id)?.title ?? id;
  // Troop skills may never have prerequisites, so there is nothing to offer them.
  if (skill.scope === 'troop')
    return <p className="muted">Le skill iniziali di reparto non hanno prerequisiti.</p>;
  const candidates = skills.filter(
    (other) => other.id !== skill.id && !skill.prerequisites.includes(other.id),
  );
  return (
    <section style={{ marginTop: '0.75rem' }}>
      <h4 style={{ fontSize: '0.875rem', margin: '0 0 0.35rem' }}>Prerequisiti espliciti</h4>
      {skill.prerequisites.length === 0 && <p className="muted">Nessuno.</p>}
      <ul className="prereq-list">
        {skill.prerequisites.map((id) => (
          <li key={id}>
            <span>{titleOf(id)}</span>
            <button
              type="button"
              data-variant="danger"
              disabled={busy}
              onClick={() => onRemove(id)}
              aria-label={`Rimuovi il prerequisito ${titleOf(id)}`}
            >
              Rimuovi
            </button>
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <select
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            aria-label="Skill da aggiungere come prerequisito"
          >
            <option value="">Aggiungi…</option>
            {candidates.map((other) => (
              <option key={other.id} value={other.id}>
                {other.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-variant="ghost"
            disabled={busy || !choice}
            onClick={() => {
              onAdd(choice);
              setChoice('');
            }}
          >
            Aggiungi
          </button>
        </div>
      )}
    </section>
  );
}

function SkillMetaForm({ skill }: { skill: EditorSkill }) {
  const [state, action, pending] = useActionState(
    saveSkillMetaAction.bind(null, skill.id),
    {} as ActionResult,
  );
  return (
    <form action={action} style={{ marginTop: '1rem' }}>
      <label htmlFor="title">Titolo</label>
      <input id="title" name="title" defaultValue={skill.title} maxLength={300} required />

      <label htmlFor="description" style={{ marginTop: '0.75rem' }}>
        Descrizione
      </label>
      <textarea
        id="description"
        name="description"
        defaultValue={skill.description}
        rows={4}
        maxLength={10000}
      />

      <label className="row" style={{ marginTop: '0.75rem' }}>
        <input type="checkbox" name="public" defaultChecked={skill.public} />
        Allegati pubblici
      </label>
      <p className="muted">
        Se attivo, le altre pattuglie possono vedere la documentazione approvata di questa skill.
      </p>

      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button type="submit" disabled={pending}>
          {pending ? 'Salvataggio…' : 'Salva'}
        </button>
        {/* revisione nel titolo del pannello aumenta a ogni salvataggio: questa è la conferma
            esplicita, quella è la prova. */}
        {state.ok && !pending && (
          <span className="ok" role="status">
            Salvato · revisione {skill.revision}
          </span>
        )}
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}

function NewSkillForm() {
  const [state, action, pending] = useActionState(createSkillAction, {} as ActionResult);
  return (
    <form action={action}>
      <label htmlFor="new-title">Titolo</label>
      <input id="new-title" name="title" maxLength={300} required />

      <label htmlFor="new-id" style={{ marginTop: '0.75rem' }}>
        Identificatore <span className="muted">(opzionale)</span>
      </label>
      <input id="new-id" name="id" maxLength={150} placeholder="derivato dal titolo" />

      <label htmlFor="new-description" style={{ marginTop: '0.75rem' }}>
        Descrizione
      </label>
      <textarea id="new-description" name="description" rows={3} maxLength={10000} />

      <p className="muted">
        Nasce come skill di pattuglia, senza prerequisiti, con un solo form blu da personalizzare.
      </p>
      <div className="row">
        <button type="submit" disabled={pending}>
          {pending ? 'Creazione…' : 'Crea skill'}
        </button>
        {state.ok && !pending && (
          <span className="ok" role="status">
            Skill creata.
          </span>
        )}
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
