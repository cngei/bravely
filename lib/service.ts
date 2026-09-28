import { session } from './auth';
import { readState, mutate } from './db';
import { resolveIdentity, syncIdentity } from './backend';
import { devIdentity } from './dev-actor';
export async function currentActor() {
  // devIdentity() is undefined unless BRAVELY_DEV_ACTOR is set, so the real path — session,
  // then the CNGEI lookup — is what runs everywhere else. Both feed the same syncIdentity().
  const resolved = devIdentity() ?? (await resolveIdentity(await session(), await readState()));
  await mutate((s) => syncIdentity(s, resolved));
  return resolved.actor;
}
