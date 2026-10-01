import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { FormBuilder } from '../../ui/form-builder';
import { Banner } from '../../ui/banner';

export const dynamic = 'force-dynamic';

export default async function SkillFormsPage({ params }: { params: Promise<{ skill: string }> }) {
  try {
    const actor = await currentActor();
    // UX gate only: execute() rejects a non-admin saveSkill regardless of what is rendered.
    if (actor.role !== 'admin')
      return (
        <main>
          <Header title="Form" />
          <p>Questa sezione è riservata agli amministratori Bravely.</p>
        </main>
      );

    const { skill: skillId } = await params;
    const skill = (await readState()).skills.find((k) => k.id === skillId);
    if (!skill)
      return (
        <main>
          <Header title="Form" />
          <p>Skill non trovata.</p>
        </main>
      );

    return (
      <main>
        <Header title={skill.title} />
        <p className="muted">
          Ogni skill può avere un form blu, uno ambra o entrambi. Le domande possono chiedere una
          risposta testuale oppure il caricamento di immagini e video.
        </p>
        <FormBuilder skillId={skill.id} skillTitle={skill.title} initialForms={skill.forms} />
      </main>
    );
  } catch (error) {
    return (
      <main>
        <Header title="Form" />
        <p>
          {error instanceof AppError && error.status === 401
            ? 'Accedi per amministrare il catalogo.'
            : error instanceof AppError
              ? error.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a href="/auth/login">Accedi con Keycloak</a>
      </main>
    );
  }
}

function Header({ title }: { title: string }) {
  return (
    <>
      <Banner>
        <a className="chip" href="/admin">
          ← Amministrazione
        </a>
      </Banner>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          <p className="muted">Form della skill</p>
        </div>
      </div>
    </>
  );
}
