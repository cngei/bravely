// The skill tree as a whole screen, shared by two routes: it is the explorer's home page ('/')
// and the leaders' tree view ('/tree'). Extracted when the explorer's card list was dropped in
// favour of the tree, so the two cannot drift — there is one tree screen, rendered twice.
//
// Server component: it builds the client payload for <SkillGraph> and decides what each node is
// allowed to do, so no authorisation logic travels to the browser.
import type { ReactNode } from 'react';
import { dashboard } from '@/lib/domain';
import { layout } from '@/lib/tree';
import { SkillGraph } from './skill-graph';
import { QuestMeter } from './quest-meter';
import { STATUS_LABELS } from './labels';

export type Dashboard = Extract<ReturnType<typeof dashboard>, { patrols: unknown }>;

// One tree per patrol: the DAG is shared, the progress on it is not. Exported because the page
// headers name the selected patrol, and choosing it twice with two expressions would let the
// title drift from the tree underneath it.
export const selectPatrol = (data: Dashboard, requested?: string) =>
  data.patrols.find((p) => p.id === requested) ?? data.patrols[0];

// The card clamps to three lines and the sheet shows a preview; the full text lives on the
// detail page. This only stops a 10000-character description travelling to the client.
const summarise = (text: string, limit = 400) => {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return cut.slice(0, cut.lastIndexOf(' ') + 1 || limit).trimEnd() + '…';
};

export function TreeScreen({
  data,
  role,
  requestedPatrol,
  children,
}: {
  data: Dashboard;
  role: string;
  /** Ignored for explorers, who only ever have one patrol. */
  requestedPatrol?: string;
  /** Rendered between the progress block and the graph — the patrol switcher, when there is one. */
  children?: ReactNode;
}) {
  const tree = layout(data.skills);
  const selected = selectPatrol(data, requestedPatrol);
  const progress = new Map((selected?.skills ?? []).map((s) => [s.skillId, s]));
  const titleOf = (id: string) => data.skills.find((k) => k.id === id)?.title ?? id;
  const evidenceFor = (skillId: string, targetId?: string) =>
    targetId === undefined
      ? undefined
      : data.evidence.find((e) => e.skillId === skillId && e.targetId === targetId);

  if (tree.nodes.length === 0)
    return (
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        Nessuna skill in catalogo. Eseguire <code>npm run db:seed</code>.
      </p>
    );

  return (
    <>
      {selected && (
        <>
          <QuestMeter
            label="Cammino della pattuglia"
            value={selected.completed}
            total={data.skills.length}
          />
          <div className="row">
            {selected.achievements.map((achievement) => (
              <span
                key={achievement.id}
                className="ribbon"
                data-earned={achievement.earned || undefined}
              >
                {achievement.title}
                {achievement.earned ? '' : ` · ne mancano ${achievement.remaining}`}
              </span>
            ))}
          </div>
        </>
      )}

      {children}

      {/* The graph is the visual layer; the <details> list below is the accessible one. */}
      <SkillGraph
        nodes={tree.nodes.map((node) => {
          const entry = progress.get(node.skill.id);
          const evidence = evidenceFor(node.skill.id, entry?.targetId);
          return {
            id: node.skill.id,
            title: node.skill.title,
            // Capped here, not in CSS: descriptions may be 10000 characters and all of
            // them would be serialised into the client payload for three visible lines.
            description: summarise(node.skill.description),
            scope: node.skill.scope,
            // Field ids included: the sheet now submits, and EvidenceForm keys answers by them.
            forms: node.skill.forms,
            missing: (entry?.missingPrerequisites ?? []).map(titleOf),
            status: entry?.status,
            targetId: entry?.targetId,
            // Troop-scoped skills belong to the leaders; an explorer only reads them. Decided
            // here rather than in the browser so the rule never ships to the client.
            canSubmit: node.skill.scope === 'patrol' || role !== 'explorer',
            hasEvidence: evidence !== undefined,
            // The pip shows which form colour the patrol actually chose.
            color: evidence?.form?.color,
            reason: evidence?.status === 'rejected' ? evidence.reason : undefined,
            waitingSeconds: evidence?.status === 'pending' ? evidence.waitingSeconds : undefined,
            x: node.x,
            y: node.y,
          };
        })}
        edges={tree.edges.map((edge) => ({
          id: edge.id,
          source: edge.from,
          target: edge.to,
          implicit: edge.implicit,
        }))}
      />

      <p className="muted">
        Le linee tratteggiate sono il requisito implicito: ogni skill di pattuglia richiede entrambe
        le skill iniziali di reparto, anche senza indicarle. Le skill più in basso lo ereditano dai
        propri prerequisiti.
      </p>

      <details style={{ marginTop: '1.5rem' }}>
        <summary className="muted">Elenco testuale</summary>
        <ul style={{ marginTop: '0.75rem' }}>
          {tree.nodes.map((node) => {
            const state = progress.get(node.skill.id)?.status;
            return (
              <li key={node.skill.id}>
                <strong>{node.skill.title}</strong>
                {state ? ` — ${STATUS_LABELS[state] ?? state}` : ''}
                {node.skill.prerequisites.length > 0 && (
                  <span className="muted">
                    {' '}
                    · richiede {node.skill.prerequisites.map(titleOf).join(', ')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}
