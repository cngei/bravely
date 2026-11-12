# Bravely

Applicazione Next.js con login Keycloak, API JSON e logica di dominio persistita in un **Postgres dedicato**. Dopo il login, `/` è l'albero delle skill per l'esploratore e la dashboard (coda di verifica e avanzamento pattuglie) per il capo; `/gestione` raccoglie pattuglie, assegnazioni ed export; `/tree` e `/admin` completano l'interfaccia. Le stesse operazioni sono disponibili attraverso le API descritte sotto.

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

Aprire http://localhost:3000. Il server ascolta **solo su `127.0.0.1`**: per renderlo raggiungibile da altre macchine (per esempio dentro un container che pubblica la porta) impostare `BRAVELY_HOST` nell'ambiente della shell o del container — non in `.env.local`, che Next legge dopo che npm ha già espanso la variabile. Vedere `.env.example`. Durante l'implementazione `.env.local` è già stato generato con un segreto casuale, il database è stato inizializzato e il client locale è stato registrato. Non sovrascrivere quel file per riavviare.

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

- Ogni esploratore può avere una sola pattuglia del proprio reparto; l'assegnazione può essere sostituita. Finché manca, tutte le API di dominio tranne la dashboard informativa e l'autoassegnazione sono bloccate.
- **Autoassegnazione.** Chi non ha ancora una pattuglia può entrare da sé in una del proprio reparto (`joinPatrol`): vale subito, e resta «da confermare» finché un capo non la conferma (`confirmAssignment`) o la sposta (`assignExplorer`). Cambiare pattuglia da sé non è possibile. Il segno «da confermare» sopravvive ai login, che ricostruiscono le persone dalle anagrafiche.
- Esistono esattamente due skill iniziali di reparto, caricate dai capi. Dopo l'approvazione valgono per tutte le pattuglie del reparto, anche create successivamente.
- Le due skill iniziali hanno definizioni **segnaposto configurabili**, perché il PDF non specifica titoli e prove effettivi. Anche le altre skill si aggiungono via API amministrativa: non è stato inventato un catalogo di sfide.
- Tutte le skill di pattuglia dipendono implicitamente dalle due iniziali, oltre che dai prerequisiti espliciti e transitivi. Grafo aciclico, riferimenti esistenti e identificatori dei campi unici dentro ogni form sono verificati sul server.
- Fino a **otto form** per skill, blu e ambra in qualunque combinazione. Il colore è solo un'etichetta: ogni form può chiedere testo, file multipli o entrambi, e cosa chiede lo dice il titolo scelto dall'admin. La prova indica il form compilato per id (`formId`); validazione dei campi obbligatori e della proprietà dei file. Una sola approvazione consegue la skill.
- All'invio la pattuglia può aggiungere un **commento** libero per chi verifica, fuori dalle domande del form. Vale per quell'invio: un reinvio senza commento cancella quello precedente.
- Ogni skill può avere un **PDF esplicativo** (uno, fino a 10 MiB), caricato e sostituito dall'admin, scaricabile da chiunque sia attivo anche se la skill è bloccata. Salvare la skill dal pannello non lo cancella; rimuoverlo toglie il riferimento, i byte restano.
- Inizio lavoro idempotente con timestamp, anche prima di risposte o file. Il primo upload/invio registra automaticamente l'inizio se non già segnato.
- Stati delle prove: `started`, `pending`, `approved`, `rejected`. `started` è lo stato di lavoro prima dell'invio; gli altri tre corrispondono a Da verificare, Verificata e Rigettata.
- Una prova approvata è immutabile fino a un rigetto motivato. Il nuovo invio, anche con un altro form, torna in attesa. Di ogni prova si conservano timestamp, autore e revisore, l'ultima motivazione e il form esatto a cui ha risposto; i giri precedenti di una prova reinviata non vengono conservati, i loro allegati sì.
- Rigettare una prova già approvata **non revoca le skill successive già conseguite**. Blocca nuovi inizi, upload, invii e approvazioni che richiedono quel prerequisito, anche transitivamente.
- Il CR gestisce, monitora e revisiona soltanto i propri reparti; può consultare le documentazioni di **tutti** i reparti, come concordato.
- L'esploratore vede i propri invii e i rigetti per poterli correggere. Per le altre pattuglie vede soltanto nome pattuglia/reparto e conseguimenti; vede la documentazione approvata solo se la skill è pubblica, la propria pattuglia l'ha conseguita **e un capo l'ha resa consultabile** con un secondo passaggio esplicito (`publishEvidence`). Se la skill non è pubblica, la documentazione non è mai consultabile; un rigetto o un reinvio annullano la pubblicazione. Le bozze precedenti degli altri restano riservate. I download applicano gli stessi controlli.
- La pagina `/gestione` segnala con un pallino arancione chi, nei reparti gestiti, è senza pattuglia o ha un'autoassegnazione da confermare (non le prove in attesa, che hanno la loro coda). Da lì si esporta la divisione in pattuglie come CSV (reparto, pattuglia, id persona, nome, stato dell'assegnazione), limitata ai reparti che si gestiscono.
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
| GET    | `/api/skill-docs/:skillId`                     | PDF esplicativo della skill, per chiunque sia attivo, anche su skill bloccata                           |
| POST   | `/api/commands`                                | Comando JSON; restituisce l'entità risultante                                                           |
| POST   | `/api/files?skillId=...&targetId=...&name=...` | Corpo binario del file; restituisce metadati e ID da inserire nelle risposte del form                   |
| POST   | `/api/skill-docs?skillId=...&name=...`         | Solo admin: corpo binario del PDF; lo associa alla skill sostituendo quello precedente                  |
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
{ "type": "joinPatrol", "patrolId": "ID_PATTUGLIA" }
```

```json
{ "type": "confirmAssignment", "personId": "ID_PERSONA" }
```

`joinPatrol` lo invia l'esploratore senza pattuglia e non nomina la persona: il server usa quella dell'utente collegato. `confirmAssignment` lo invia un capo del reparto.

```json
{ "type": "startSkill", "skillId": "ID_SKILL", "targetId": "ID_PATTUGLIA" }
```

```json
{
  "type": "submitEvidence",
  "skillId": "initial-1",
  "targetId": "ID_REPARTO",
  "formId": "ID_FORM",
  "answers": { "description": "Descrizione della prova" },
  "comment": "Facoltativo: una nota per chi verifica"
}
```

`formId` è l'id di uno dei form correnti della skill, da `skill.forms[].id` nel catalogo. Un id sconosciuto o di un form ritirato viene rifiutato con `INVALID_FORM`.

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

```json
{ "type": "publishEvidence", "evidenceId": "ID_PROVA" }
```

Il secondo passaggio prima che una prova approvata sia consultabile dalle altre pattuglie: solo su prove approvate di skill pubbliche, da un capo del reparto, idempotente.

Esempio di skill amministrativa (stesso comando e ID per aggiornare; inviare la definizione completa senza `revision` né id dei form, assegnati dal server — un form con titolo e domande invariati conserva il proprio id, uno modificato ne riceve uno nuovo e il precedente resta leggibile dalle prove che lo hanno usato). Da uno a otto form, di qualunque colore:

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

Upload: inviare i byte del file (non multipart) a `/api/files?...`; poi usare `"answers":{"media":["ID_FILE"]}` con il `formId` del form che contiene il campo `media`. JPEG, PNG, GIF, WebP, MP4 e WebM, fino a 25 MiB per file e 100 file per prova; il tipo viene riconosciuto dai byte, senza fidarsi dell'estensione. Download come allegati, mai HTML eseguibile. Limite JSON: 1 MiB.

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
{ "type": "clearSkillDocument", "skillId": "ID_SKILL" }
```

Il PDF di una skill si carica inviando i byte (non multipart) a `/api/skill-docs?skillId=...&name=...`: solo PDF riconosciuti dai byte (`%PDF-`), fino a 10 MiB.

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

Il dominio sta in tabelle: `troops`, `patrols`, `people`, `external_users`, `skills`, `forms`, `evidence`, `uploads`, `achievements`. I file sono in una tabella `bytea` nello stesso database, e `uploads.id` la referenzia, quindi i metadati non possono esistere senza i byte. Sessioni e flussi OIDC hanno tabelle separate. Nessun dato di dominio vive soltanto in memoria.

Fino alla prima versione l'aggregato era un **unico documento JSONB** su una riga, aggiornato con `SELECT ... FOR UPDATE`: una scelta che privilegiava semplicità e coerenza, e che a scala di reparto le pagava entrambe. Le migrazioni `002`–`004` l'hanno suddiviso in tabelle, come questo paragrafo prevedeva.

`execute()` è rimasta una funzione pura sull'intero `State`: `lib/repo.ts` lo carica dalle tabelle, il reducer lo muta, e `save()` riscrive **la differenza**. Due conseguenze da conoscere prima di toccare quel file:

- **I form sono immutabili per id.** Modificare le domande inserisce una riga nuova e ritira la precedente, così una prova continua a mostrare le domande a cui ha davvero risposto. È il meccanismo che ha sostituito la copia del form dentro ogni prova.
- **Solo alcuni comandi serializzano**, e la lista con il motivo di ciascuno sta in `lib/commands.ts`: `createPatrol` e `saveSkill` impongono un invariante che attraversa più righe; `clearSkillDocument` (e il caricamento del PDF) per non far riscrivere a un `saveSkill` concorrente il documento vecchio; `publishEvidence` e `reviewEvidence` insieme, perché una revoca in corsa con una pubblicazione non venga sovrascritta; `joinPatrol` perché legge persone e pattuglie per decidere. Per l'unicità delle prove ci pensa `UNIQUE (skill_id, target_id)`.

Sessioni opache, casuali, hashate nel database e cookie `HttpOnly`/`SameSite=Lax`; token cifrati a riposo con AES-GCM. Code flow verificato dalla libreria `openid-client` con state, nonce e PKCE. Le sessioni scadono insieme al token di accesso (massimo un'ora): un nuovo login può riutilizzare la sessione SSO Keycloak. Questa versione non rinnova automaticamente i token; uscire da Bravely non chiude la sessione SSO globale. In produzione servono HTTPS per app e issuer e un segreto dedicato; il client può essere confidential tramite `KEYCLOAK_CLIENT_SECRET`.

## Verifiche

Non c'è CI: si verifica a mano, e questi tre comandi sono tutto.

```sh
npm run typecheck
TEST_DATABASE_URL=postgres://bravely:bravely-local@localhost:5434/bravely npm test
npm run build
```

> **`TEST_DATABASE_URL` non è opzionale, è la differenza fra 96 test e 86.** Senza quella
> variabile `npm test` salta i 10 test che richiedono un database **e esce comunque verde**: vedi
> `Tests 86 passed | 10 skipped (96)` e sembra tutto a posto. Sono anche i test che contano di più,
> perché alcune cose si rompono **solo** passando per un vero Postgres — il confronto dei form per
> serializzazione, per esempio, passava ogni test in memoria e sbagliava in produzione, perché
> jsonb non conserva l'ordine delle chiavi. Lancia sempre la riga completa.

L'URL è quello di `compose.yaml`; serve il database su (`finch compose up -d bravely-db`, o
`docker compose` se usi Docker).

I test Postgres creano e rimuovono un proprio schema: non azzerano i dati dell'app. Le suite
coprono isolamento tra reparti, assegnazione mancante/trasferimenti, DAG e prerequisiti
transitivi, timestamp, revisione/reinvio/revoca, visibilità documenti e seconda verifica,
più form per colore, commento all'invio, autoassegnazione, PDF delle skill, avvisi di gestione,
export CSV, achievement, avanzamento delle pattuglie, mapping backend, transazioni, scritture
concorrenti, upload/download e protezione dell'origine. Sul database reale, in più: il runner delle migrazioni (applicazione singola, no-op
alla seconda corsa, rifiuto di una migrazione modificata), il round-trip di uno `State` completo
attraverso le tabelle, e l'immutabilità dei form attraverso jsonb.

Il login reale Keycloak con `dev-cr` è stato verificato nel browser. `lib/auth.ts` resta però senza
test automatici, e `lib/service.ts` è l'unico modulo mockato: tutto il percorso dell'identità è
coperto solo da quella verifica manuale.

Riferimenti: specifiche nel PDF fornito; integrazione ricavata dal codice del backend; convenzioni Next.js da [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) e [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies).
