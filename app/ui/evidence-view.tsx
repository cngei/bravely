// Rendering shared by the explorer's own skill card and the reviewer's queue. Extracted so the
// two cannot drift: a reviewer must see exactly the submission the patrol sent, labelled with the
// form as it was at submission time rather than as the catalogue reads today.
import type { Evidence } from '@/lib/model';

export const waiting = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) return `da ${Math.floor(hours / 24)} g`;
  return hours >= 1 ? `da ${hours} h` : `da ${Math.max(1, Math.floor(seconds / 60))} min`;
};

// Italian locale, explicit timezone-free display: these are ISO strings from the server.
const when = (iso?: string) => {
  if (!iso) return undefined;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

// Labels the stored answers with the form as it was when submitted, not as it reads today.
export function Answers({ evidence }: { evidence: Evidence }) {
  const fields = evidence.formSnapshot?.fields ?? [];
  if (!evidence.answers || !fields.length) return null;
  return (
    <dl>
      {fields.map((entry) => {
        const value = evidence.answers?.[entry.id];
        if (value === undefined) return null;
        return (
          <div key={entry.id} style={{ display: 'contents' }}>
            <dt>{entry.label}</dt>
            <dd>
              {Array.isArray(value) ? (
                value.length === 0 ? (
                  <span className="muted">nessun allegato</span>
                ) : (
                  <span className="row">
                    {value.map((id, index) => (
                      <a key={id} href={`/api/files/${id}`}>
                        Allegato {index + 1}
                      </a>
                    ))}
                  </span>
                )
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// The timestamps the specification asks a reviewer to see. All three are persisted by the domain
// and were previously never printed anywhere.
export function EvidenceTimes({ evidence }: { evidence: Evidence & { waitingSeconds?: number } }) {
  const started = when(evidence.startedAt);
  const submitted = when(evidence.submittedAt);
  const reviewed = when(evidence.reviewedAt);
  return (
    <p className="muted">
      {started && <>Iniziata il {started}. </>}
      {submitted ? <>Inviata il {submitted}. </> : <>Non ancora inviata. </>}
      {evidence.status === 'pending' && evidence.waitingSeconds !== undefined && (
        <>In attesa {waiting(evidence.waitingSeconds)}. </>
      )}
      {reviewed && evidence.status !== 'pending' && (
        <>
          {evidence.status === 'approved' ? 'Verificata' : 'Rigettata'} il {reviewed}.
        </>
      )}
    </p>
  );
}
