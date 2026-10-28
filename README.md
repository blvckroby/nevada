# NEVADA SERVICE — Technical Support Portal (prototipo v0.1)

Portale per i centri assistenza autorizzati Nevada Europe. Front-end statico (HTML5/CSS3/JS ES modules), dati in JSON, PWA.

## Avvio
```bash
python3 -m http.server 8000   # poi http://localhost:8000
```
(serve un server HTTP: i JSON sono letti con `fetch`.)

## Struttura
```
index.html  style.css  app.js  sw.js  manifest.webmanifest
data/       products documents parts diagnostics errors updates contacts faq config (.json)
assets/img  assets/icons   docs/   (PDF; in produzione → storage protetto)
```
Il router è a hash (`#/catalogo`, `#/modello/<id>/documenti`, `#/esplosi/<id>`, `#/diagnostica/<sintomo>`, `#/supporto`…).

## Cosa è reale e cosa no
- **Reali (da verificare):** solo i 4 codici indicati dal committente — NNW82-20S-BFG-NH, NNW82-30S-BFG-NH, NW24S-BFG-H, NNW72-29DA-BFG-PL. Ogni altro campo è `null` → "Da fornire".
- **DEMO:** modelli `DEMO-*`, PDF `docs/demo/documento-demo.pdf`, esploso `assets/img/esploso-demo.svg`, scheda diagnostica d'esempio. Inventati, marcati col badge DEMO.
- **Non implementato di proposito:** autenticazione, invio ticket, ricerca per seriale, assistente AI, pannello admin. Il modulo supporto salva solo una bozza locale finché `data/config.json → ticketEndpoint` è `null`.
- Preferiti, cronologia, note: `localStorage` del browser (da spostare su API).
- Il sito nevadaeurope.com **non era raggiungibile** dall'ambiente di sviluppo: catalogo, foto, logo e palette ufficiali non sono stati importati. Palette/tipografia sono token in `:root` di `style.css`.

## Dati ancora da fornire
Elenco completo modelli con specifiche e foto · logo e linee guida · PDF (manuali, schede, esplosi, schemi, installazione, servizio, bollettini) con revisione e range seriali · tabelle ricambi e coordinate hotspot · codici errore · procedure diagnostiche verificate · contatti · endpoint ticket Nevada · banca dati seriali.

## Versione definitiva (proposta)
- **Backend:** Node.js (NestJS) o Django; **PostgreSQL** (prodotti, revisioni, documenti, ricambi, hotspot, errori, utenti, audit); ricerca con PostgreSQL `pg_trgm`/Meilisearch.
- **Auth:** OIDC/SSO o email + MFA, sessione cookie HttpOnly, RBAC (Tecnico / Admin Nevada) applicato lato server.
- **PDF:** bucket privato (S3/Azure Blob) con URL firmati a scadenza, versioning, log download.
- **Admin:** CRUD catalogo, upload PDF versionati, editor hotspot esplosi, gestione utenti.
- **GDPR:** minimizzazione dati, informativa, retention log, DPA col provider, hosting UE.
- **AI:** RAG sui soli PDF autorizzati, con citazioni documento/pagina e rifiuto se manca la fonte.
- **Deploy:** `service.nevadaeurope.com` dietro CDN/WAF.
