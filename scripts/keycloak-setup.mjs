// Add only the Bravely client and role to the existing local dev realm.
const issuer = new URL(process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8081/realms/dev');
if (!['localhost', '127.0.0.1'].includes(issuer.hostname))
  throw new Error('Questo script è riservato al Keycloak locale.');
const realm = issuer.pathname.split('/').at(-1),
  base = issuer.origin;
const tokenResponse = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
  }),
});
if (!tokenResponse.ok)
  throw new Error(`Autenticazione amministratore fallita (${tokenResponse.status})`);
const { access_token } = await tokenResponse.json();
async function admin(path, method = 'GET', body) {
  const res = await fetch(`${base}/admin/realms/${encodeURIComponent(realm)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Keycloak ${method} ${path}: ${res.status}`);
  return res.status === 204 || res.headers.get('content-length') === '0'
    ? undefined
    : res.text().then((t) => (t ? JSON.parse(t) : undefined));
}
const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'bravely',
  origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
const clients = await admin(`/clients?clientId=${encodeURIComponent(clientId)}`);
const client = {
  clientId,
  name: 'Bravely locale',
  enabled: true,
  protocol: 'openid-connect',
  publicClient: true,
  standardFlowEnabled: true,
  implicitFlowEnabled: false,
  directAccessGrantsEnabled: false,
  redirectUris: [`${origin}/auth/callback`],
  webOrigins: [origin],
  attributes: { 'pkce.code.challenge.method': 'S256' },
};
if (!clients.length) await admin('/clients', 'POST', client);
else {
  const existing = await admin(`/clients/${clients[0].id}`);
  await admin(`/clients/${clients[0].id}`, 'PUT', {
    ...existing,
    redirectUris: [...new Set([...(existing.redirectUris ?? []), ...client.redirectUris])],
    webOrigins: [...new Set([...(existing.webOrigins ?? []), origin])],
  });
}
const roles = await admin('/roles');
if (!roles.some((r) => r.name === 'ADMIN_BRAVELY'))
  await admin('/roles', 'POST', { name: 'ADMIN_BRAVELY', description: 'Amministratore Bravely' });
console.log(
  'Client Bravely e ruolo ADMIN_BRAVELY pronti. Assegna il ruolo solo ai capi autorizzati nella console Keycloak.',
);
