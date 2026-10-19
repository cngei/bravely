<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dipendenze: sempre da npm pubblico

`package-lock.json` deve risolvere tutto da `https://registry.npmjs.org/`.

La macchina su cui si sviluppa ha un `~/.npmrc` che punta al CodeArtifact interno di Amazon, quindi
**ogni `npm install` fatto qui riscrive il lockfile con host interni**. È già successo all'albero di
`@xyflow/react` (20 pacchetti, corretto nel commit `5540350`): quelle URL contengono un id account
AWS e rendono `npm ci` impossibile per chiunque non abbia un token CodeArtifact — in un repository
che sta su GitHub, in un'organizzazione esterna, e che dei volontari devono poter clonare.

Quando aggiungi o aggiorni una dipendenza:

```sh
npm install --registry=https://registry.npmjs.org/ <pacchetto>
```

E prima di committare un lockfile toccato, questo deve dare `0`:

```sh
grep -c codeartifact package-lock.json
```

Se è già sporco, si riscrive **solo l'host** invece di rigenerare il lockfile: rigenerarlo può far
salire versioni dentro i range semver, che è precisamente ciò che un lockfile serve a impedire. Gli
`integrity` restano validi, perché CodeArtifact proxya i tarball originali di npm byte per byte —
verificato con un `npm ci` da zero contro il registry pubblico.

Un `.npmrc` nel repo risolverebbe la cosa alla radice, **ma non è stato aggiunto di proposito**: non
sappiamo se esistano regole aziendali che impongono CodeArtifact su quella macchina. Non aggiungerlo
senza chiedere.
