// The navigation chips every page shares, and the one place the "Gestione" dot is drawn. It cannot
// live in banner.tsx, which only receives what each page hands it: the dot needs the alert count,
// and four pages each spelling out the same chips is how they had already drifted apart.
//
// Each page passes the count it computed from the state it had already loaded, so the nav costs
// no query of its own.
import type { Role } from '@/lib/model';
import type { ManagementAlerts } from '@/lib/notifications';

export type NavKey = 'dashboard' | 'gestione' | 'tree' | 'admin';

export function Nav({
  role,
  alerts,
  active,
}: {
  role: Role;
  alerts?: ManagementAlerts;
  active?: NavKey;
}) {
  const chip = (
    key: NavKey,
    href: string,
    label: string,
    extra?: React.ReactNode,
    aria?: string,
  ) => (
    <a className="chip" href={href} data-active={active === key ? '' : undefined} aria-label={aria}>
      {label}
      {extra}
    </a>
  );
  const count = alerts?.total ?? 0;
  // Never colour alone: the dot is decorative, the label says it in words (see the note on gold at
  // the top of globals.css — the same rule applies to orange).
  const dot = count > 0 ? <span className="nav-dot" aria-hidden="true" /> : undefined;
  const gestioneLabel =
    count > 0
      ? `Gestione, ${count} ${count === 1 ? 'persona da sistemare' : 'persone da sistemare'}`
      : undefined;
  return (
    <>
      {/* For an explorer the home page is the tree, so it is named for what it shows. */}
      {chip('dashboard', '/', role === 'explorer' ? 'Albero' : 'Dashboard')}
      {role !== 'explorer' && chip('gestione', '/gestione', 'Gestione', dot, gestioneLabel)}
      {role !== 'explorer' && chip('tree', '/tree', 'Albero')}
      {role === 'admin' && chip('admin', '/admin', 'Admin')}
      <form action="/auth/logout" method="post">
        <button data-variant="ghost">Esci</button>
      </form>
    </>
  );
}
