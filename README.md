# Bravely

Applicazione Next.js con login Keycloak, API JSON e logica di dominio persistita in un **Postgres dedicato**. La pagina `/` mostra il JSON di `/api/dashboard` dopo il login. Non contiene ancora un'interfaccia di gestione: le operazioni si eseguono attraverso le API descritte sotto.

## Avvio locale

Richiede Node.js 22 LTS o successivo, Docker e il backend CNGEI con Keycloak avviati secondo `../backend/Tiltfile`.

```sh
npm ci
cp .env.example .env.local
# Sostituire SESSION_SECRET in .env.local con: openssl rand -hex 32
docker compose up -d --wait
npm run db:migrate
npm run keycloak:setup
npm run dev
```

Aprire http://localhost:3000. Durante l'implementazione `.env.local` è già stato generato con un segreto casuale, il database è stato inizializzato e il client locale è stato registrato. Non sovrascrivere quel file per riavviare.

In alternativa, dopo aver configurato `.env.local` e Keycloak: `tilt up` in questa directory. Il Tiltfile Bravely avvia soltanto il proprio database e Next.js; backend e Keycloak restano nello stack esistente.

- Postgres Bravely: porta **5434**, database e utente `bravely`, volume Docker `bravely_bravely-data`.
- Backend CNGEI: `http://localhost:8000`; Keycloak: `http://localhost:8081/realms/dev`.
- Client Keycloak `bravely`: Authorization Code + PKCE S256, redirect esatto `http://localhost:3000/auth/callback`.
- Lo script Keycloak aggiunge il client e il ruolo `ADMIN_BRAVELY`; non assegna privilegi agli utenti e non modifica il client `sc`. È idempotente. Dopo la ricreazione del Keycloak temporaneo, rieseguirlo.
- L'utente locale `dev-cr` / `dev` è quello già previsto dal backend; il login e il recupero delle sue anagrafiche sono stati verificati.
- Per accedere come amministratore, assegnare **esplicitamente** il ruolo realm `ADMIN_BRAVELY` al capo scelto nella console Keycloak, quindi effettuare nuovamente il login. Gli altri ruoli `ADMIN_*` non concedono accesso amministrativo a Bravely.

## Identità e anagrafiche

Per CNGEI, `preferred_username` contiene la tessera, come configurato dal mapper `profile` del backend. L'app chiama `/persona/me`, e per i CR `/persona` e `/gruppo`, inoltrando il token solo dal server. Gli incarichi correnti `CR`/`VCR` di livello `UNITA` determinano i reparti gestibili; gli incarichi `E` determinano gli esploratori. Vengono esclusi incarichi futuri, terminati e appartenenti ad altre unità. Un ruolo realm `CR` da solo non basta per gestire un reparto.

Il database Bravely memorizza soltanto ID, nome, reparto e assegnazione delle persone, senza copiare recapiti, dati sanitari o fiscali. Gli incarichi vengono ricontrollati a ogni richiesta; trasferimenti e rimozioni invalidano le vecchie assegnazioni. Non si scrive nel database del backend.

Per altre organizzazioni, un amministratore crea un reparto esterno (`createTroop`) e associa il **subject Keycloak** dell'utente (`saveExternalUser`). Questa associazione è esplicita e non usa email o nomi per collegare account. La creazione degli account rimane in Keycloak. Un account non associato vede soltanto il messaggio di assegnazione mancante. L'amministratore può configurare capi e singoli esploratori esterni.

## Regole implementate

- Ogni esploratore può avere una sola pattuglia del proprio reparto; l'assegnazione può essere sostituita. Finché manca, tutte le API di dominio tranne la dashboard informativa sono bloccate.
- Esistono esattamente due skill iniziali di reparto, caricate dai capi. Dopo l'approvazione valgono per tutte le pattuglie del reparto, anche create successivamente.
- Le due skill iniziali hanno definizioni **segnaposto configurabili**, perché il PDF non specifica titoli e prove effettivi. Anche le altre skill si aggiungono via API amministrativa: non è stato inventato un catalogo di sfide.
- Tutte le skill di pattuglia dipendono implicitamente dalle due iniziali, oltre che dai prerequisiti espliciti e transitivi. Grafo aciclico, riferimenti esistenti e unicità dei form sono verificati sul server.
- Form blu e ambra alternativi, uno o entrambi, con campi testuali e file multipli; validazione dei campi obbligatori e della proprietà dei file. Una sola approvazione consegue la skill.
- Inizio lavoro idempotente con timestamp, anche prima di risposte o file. Il primo upload/invio registra automaticamente l'inizio se non già segnato.
- Stati delle prove: `started`, `pending`, `approved`, `rejected`. `started` è lo stato di lavoro prima dell'invio; gli altri tre corrispondono a Da verificare, Verificata e Rigettata.
- Una prova approvata è immutabile fino a un rigetto motivato. Il nuovo invio, anche con l'altro colore, torna in attesa. Vengono conservati timestamp, revisore, motivazioni e versioni inviate del form e delle risposte.
- Rigettare una prova già approvata **non revoca le skill successive già conseguite**. Blocca nuovi inizi, upload, invii e approvazioni che richiedono quel prerequisito, anche transitivamente.
- Il CR gestisce, monitora e revisiona soltanto i propri reparti; può consultare le documentazioni di **tutti** i reparti, come concordato.
- L'esploratore vede i propri invii e i rigetti per poterli correggere. Per le altre pattuglie vede soltanto nome pattuglia/reparto e conseguimenti; vede la documentazione approvata solo se la skill è pubblica e anche la propria pattuglia l'ha conseguita. Le bozze precedenti degli altri restano riservate. I download applicano gli stessi controlli.
- Achievement con soglie modificabili. Il conteggio usa skill distinte conseguite, comprese le due iniziali condivise; non conta gli invii o i due colori separatamente. Le soglie 3/10/20 derivano dagli esempi del PDF.

## Contratto API

Tutte le API richiedono il cookie di sessione `HttpOnly`. Nessun token viene restituito al frontend. Risposte private con `Cache-Control: no-store`. Le richieste POST richiedono `Origin` uguale a `APP_URL` (il browser lo invia automaticamente).

| Metodo | Percorso                                       | Risultato                                                                                               |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/api/dashboard`                               | Dati filtrati per ruolo, persone, pattuglie, progressi, skill, prove con attesa in secondi, achievement |
| GET    | `/api/skills`                                  | Catalogo completo e definizioni dei form, anche per skill bloccate                                      |
| GET    | `/api/skills/:id`                              | Skill, numero ed elenco delle pattuglie che l'hanno conseguita, documentazioni consentite e URL file    |
| GET    | `/api/evidence/:id`                            | Prova e risposte se autorizzate                                                                         |
| GET    | `/api/files/:id`                               | File binario con controllo di accesso, mai URL pubblico                                                 |
| POST   | `/api/commands`                                | Comando JSON; restituisce l'entità risultante                                                           |
| POST   | `/api/files?skillId=...&targetId=...&name=...` | Corpo binario del file; restituisce metadati e ID da inserire nelle risposte del form                   |
| GET    | `/auth/login`                                  | Avvia il login Keycloak                                                                                 |
| GET    | `/auth/callback`                               | Callback OIDC verificato                                                                                |
| POST   | `/auth/logout`                                 | Chiude la sessione Bravely                                                                              |

Errori: `{ "error": { "code": "PREREQUISITES_MISSING", "message": "..." } }`. Stati HTTP: 400 validazione, 401 login necessario/scaduto, 403 permessi/origine, 404 risorsa inesistente o riservata, 409 conflitto/regola di dominio, 413 dimensione eccessiva, 415 formato non supportato, 502/503 backend indisponibile. Nessun ripiego su dati fittizi in caso di errore del backend.

### Comandi

Inviare `Content-Type: application/json` a `/api/commands`. Gli ID si ricavano dalla dashboard o dalle risposte delle operazioni. `targetId` è l'ID del reparto per le iniziali, altrimenti l'ID della pattuglia.

```json
{ "type": "createPatrol", "troopId": "ID_REPARTO", "name": "Lupi" }
```

```json
{ "type": "assignExplorer", "personId": "ID_PERSONA", "patrolId": "ID_PATTUGLIA" }
```

```json
{ "type": "startSkill", "skillId": "ID_SKILL", "targetId": "ID_PATTUGLIA" }
```

```json
{
  "type": "submitEvidence",
  "skillId": "initial-1",
  "targetId": "ID_REPARTO",
  "color": "blue",
  "answers": { "description": "Descrizione della prova" }
}
```

```json
{ "type": "reviewEvidence", "evidenceId": "ID_PROVA", "decision": "approve" }
```

```json
{
  "type": "reviewEvidence",
  "evidenceId": "ID_PROVA",
  "decision": "reject",
  "reason": "Manca la documentazione dell'attività"
}
```

Esempio di skill amministrativa (stesso comando e ID per aggiornare; inviare la definizione completa senza il campo `revision`, generato dal server):

```json
{
  "type": "saveSkill",
  "skill": {
    "id": "orientamento",
    "title": "Orientamento",
    "description": "Documentare l'attività di orientamento.",
    "scope": "patrol",
    "prerequisites": ["initial-1", "initial-2"],
    "public": true,
    "forms": [
      {
        "color": "blue",
        "title": "Racconto",
        "fields": [
          {
            "id": "racconto",
            "label": "Come avete svolto l'attività?",
            "type": "text",
            "required": true
          }
        ]
      },
      {
        "color": "amber",
        "title": "Foto o video",
        "fields": [
          {
            "id": "media",
            "label": "Documentazione",
            "type": "file",
            "required": true,
            "minFiles": 1,
            "maxFiles": 3
          }
        ]
      }
    ]
  }
}
```

Upload: inviare i byte del file (non multipart) a `/api/files?...`; poi usare `"answers":{"media":["ID_FILE"]}` con `color: "amber"`. JPEG, PNG, GIF, WebP, MP4 e WebM, fino a 25 MiB per file e 100 file per prova; il tipo viene riconosciuto dai byte, senza fidarsi dell'estensione. Download come allegati, mai HTML eseguibile. Limite JSON: 1 MiB.

Comandi riservati all'amministratore:

```json
{
  "type": "saveAchievements",
  "achievements": [{ "id": "tre", "title": "Spilletta", "threshold": 3 }]
}
```

```json
{ "type": "createTroop", "name": "Reparto organizzazione partner" }
```

```json
{
  "type": "saveExternalUser",
  "user": {
    "subject": "SUB_KEYCLOAK",
    "name": "Nome Cognome",
    "role": "explorer",
    "troopIds": ["ID_REPARTO_ESTERNO"]
  }
}
```

Per un capo esterno usare `role: "leader"`; può avere più reparti. Gli esploratori esterni devono averne esattamente uno.

Esempio dalla console del browser dopo il login:

```js
const response = await fetch('/api/commands', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'createPatrol', troopId: 'ID_REPARTO', name: 'Lupi' }),
});
console.log(await response.json());
```

## Persistenza e autenticazione

`bravely_state` contiene l'aggregato di dominio in JSONB, aggiornato dentro una transazione con `SELECT ... FOR UPDATE`; i file sono in una tabella `bytea` nello stesso database. Questo modello privilegia la semplicità e la coerenza della prima versione: le scritture sono serializzate anche con più processi Next.js. Per volumi elevati, suddividere l'aggregato in tabelle e spostare i media in uno storage privato. Sessioni e flussi OIDC hanno tabelle separate. Nessun dato di dominio vive soltanto in memoria.

Sessioni opache, casuali, hashate nel database e cookie `HttpOnly`/`SameSite=Lax`; token cifrati a riposo con AES-GCM. Code flow verificato dalla libreria `openid-client` con state, nonce e PKCE. Le sessioni scadono insieme al token di accesso (massimo un'ora): un nuovo login può riutilizzare la sessione SSO Keycloak. Questa versione non rinnova automaticamente i token; uscire da Bravely non chiude la sessione SSO globale. In produzione servono HTTPS per app e issuer e un segreto dedicato; il client può essere confidential tramite `KEYCLOAK_CLIENT_SECRET`.

## Verifiche

```sh
npm run typecheck
npm test
# Include persistenza, concorrenza e route HTTP su schema temporaneo isolato:
TEST_DATABASE_URL=postgres://bravely:bravely-local@localhost:5434/bravely npm test
npm run build
```

I test Postgres creano e rimuovono un proprio schema: non azzerano i dati dell'app. Le suite coprono isolamento tra reparti, assegnazione mancante/trasferimenti, DAG e prerequisiti transitivi, timestamp, revisione/reinvio/revoca, versioni dei form, visibilità documenti, achievement, mapping backend, transazioni, scritture concorrenti, upload/download e protezione dell'origine. Il login reale Keycloak con `dev-cr` è stato verificato nel browser.

Riferimenti: specifiche nel PDF fornito; integrazione ricavata dal codice del backend; convenzioni Next.js da [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) e [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies).
