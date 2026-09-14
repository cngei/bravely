import { session } from './auth';
import { readState, mutate } from './db';
import { resolveIdentity, syncIdentity } from './backend';
export async function currentActor() {
  const identity = await session();
  const resolved = await resolveIdentity(identity, await readState());
  await mutate((s) => syncIdentity(s, resolved));
  return resolved.actor;
}
