import * as oidc from 'openid-client';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { cookies } from 'next/headers';
import { pool } from './db';
import { AppError, assert } from './errors';
import type { LoginIdentity } from './backend';
export const appUrl = () => new URL(process.env.APP_URL ?? 'http://localhost:3000');
export const cookieOptions = () => ({
  httpOnly: true,
  secure: appUrl().protocol === 'https:',
  sameSite: 'lax' as const,
  path: '/',
});
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
function key() {
  assert(
    process.env.NODE_ENV !== 'production' || appUrl().protocol === 'https:',
    500,
    'CONFIGURATION',
    'APP_URL richiede HTTPS in produzione.',
  );
  const secret = process.env.SESSION_SECRET;
  assert(
    secret && secret.length >= 32 && !secret.startsWith('replace-'),
    500,
    'CONFIGURATION',
    'Impostare SESSION_SECRET con un segreto casuale.',
  );
  return createHash('sha256').update(secret).digest();
}
function seal(data: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
function unseal(data: string): LoginIdentity {
  try {
    const b = Buffer.from(data, 'base64url'),
      cipher = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    cipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString());
  } catch (error) {
    // A rotated SESSION_SECRET or a tampered cookie is a stale session, not a server
    // fault. Configuration errors raised by key() must still surface as themselves.
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'SESSION_EXPIRED', 'Sessione non più valida. Accedi nuovamente.');
  }
}
let configPromise: Promise<oidc.Configuration> | undefined;
export function config() {
  return (configPromise ??= getConfig().catch((error) => {
    configPromise = undefined;
    throw error;
  }));
}
async function getConfig() {
  const issuer = new URL(process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8081/realms/dev');
  assert(
    issuer.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' &&
        ['localhost', '127.0.0.1'].includes(issuer.hostname)),
    500,
    'CONFIGURATION',
    'Keycloak richiede HTTPS in produzione.',
  );
  return oidc.discovery(
    issuer,
    process.env.KEYCLOAK_CLIENT_ID ?? 'bravely',
    process.env.KEYCLOAK_CLIENT_SECRET || undefined,
    undefined,
    issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
}
export async function beginLogin() {
  key();
  const cfg = await config(),
    verifier = oidc.randomPKCECodeVerifier(),
    state = oidc.randomState(),
    nonce = oidc.randomNonce(),
    id = randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM auth_flows WHERE expires_at < now()');
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query("INSERT INTO auth_flows VALUES($1,$2,now()+interval '10 minutes')", [
    digest(id),
    JSON.stringify({ verifier, state, nonce }),
  ]);
  (await cookies()).set('bravely_flow', id, { ...cookieOptions(), maxAge: 600 });
  return oidc.buildAuthorizationUrl(cfg, {
    redirect_uri: new URL('/auth/callback', appUrl()).href,
    scope: 'openid profile email',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
}
export async function finishLogin(url: URL) {
  const jar = await cookies(),
    flow = jar.get('bravely_flow')?.value;
  assert(flow, 400, 'INVALID_LOGIN', 'Accesso scaduto o non valido.');
  jar.delete('bravely_flow');
  const { rows } = await pool.query(
    'DELETE FROM auth_flows WHERE id=$1 AND expires_at>now() RETURNING payload',
    [digest(flow)],
  );
  assert(rows[0], 400, 'INVALID_LOGIN', 'Accesso scaduto o già utilizzato.');
  const { verifier, state, nonce } = rows[0].payload;
  const tokens = await oidc.authorizationCodeGrant(await config(), url, {
    pkceCodeVerifier: verifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  assert(claims?.sub, 401, 'INVALID_LOGIN', 'Identità non valida.');
  // This token comes directly from the trusted issuer's successful code exchange,
  // never from a browser-supplied bearer token. ID token signature/nonce checked by oidc.
  const access = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
  assert(access.sub === claims.sub, 401, 'INVALID_LOGIN', 'Identità dei token non coerenti.');
  const identity: LoginIdentity = {
    subject: claims.sub,
    name: String(claims.name ?? claims.preferred_username ?? claims.sub),
    username: String(access.preferred_username ?? claims.preferred_username ?? ''),
    roles: Array.isArray(access.realm_access?.roles)
      ? access.realm_access.roles.filter((r: unknown) => typeof r === 'string')
      : [],
    accessToken: tokens.access_token,
  };
  const maxAge = Math.min(tokens.expires_in ?? 300, 3600);
  const session = randomBytes(32).toString('base64url');
  const old = jar.get('bravely_session')?.value;
  if (old) await pool.query('DELETE FROM sessions WHERE id=$1', [digest(old)]);
  await pool.query('INSERT INTO sessions VALUES($1,$2,$3)', [
    digest(session),
    seal(identity),
    new Date(Date.now() + maxAge * 1000),
  ]);
  jar.set('bravely_session', session, { ...cookieOptions(), maxAge });
}
export async function session(): Promise<LoginIdentity> {
  const raw = (await cookies()).get('bravely_session')?.value;
  assert(raw, 401, 'UNAUTHENTICATED', 'Accedi con Keycloak.');
  const { rows } = await pool.query(
    'SELECT payload FROM sessions WHERE id=$1 AND expires_at>now()',
    [digest(raw)],
  );
  assert(rows[0], 401, 'SESSION_EXPIRED', 'Sessione scaduta. Accedi nuovamente.');
  return unseal(rows[0].payload);
}
export async function logout() {
  const jar = await cookies(),
    id = jar.get('bravely_session')?.value;
  if (id) await pool.query('DELETE FROM sessions WHERE id=$1', [digest(id)]);
  jar.delete('bravely_session');
}
export function checkOrigin(request: Request) {
  assert(
    request.headers.get('origin') === appUrl().origin,
    403,
    'INVALID_ORIGIN',
    'Origine della richiesta non consentita.',
  );
}
export function authError(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  console.error('Authentication failed:', error instanceof Error ? error.name : 'unknown');
  return Response.json(
    {
      error: {
        code: 'LOGIN_FAILED',
        message: 'Accesso non riuscito. Verifica configurazione e disponibilità di Keycloak.',
      },
    },
    { status: 502 },
  );
}
