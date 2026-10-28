# NEVADA SERVICE — Technical Support Portal (prototipo v0.1)

Portale per i centri assistenza autorizzati Nevada Europe. Front-end statico (HTML5/CSS3/JS ES modules), dati in JSON, PWA.

## Avvio
```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start     # http://localhost:8000 — portale + assistente AI
```
Senza chiave il portale funziona ugualmente e l'assistente ricade sulla **ricerca documentale** (nessun testo generato). Solo front-end: `python3 -m http.server 8000` (l'AI usa allora la ricerca nel browser).

## Assistente AI (`server/`)
- `POST /api/ask` · `server/retrieval.mjs` indicizza **solo** dati autorizzati (schede catalogo, elenchi ricambi, FAQ, diagnostica, codici errore) e sceglie i documenti pertinenti (anche per codice modello parziale).
- `server/ai.mjs` li passa a Claude (`claude-opus-5-5`, variabile `AI_MODEL`) come blocchi `document` con **citazioni abilitate**; il prompt di sistema vieta di inventare diagnosi, codici o compatibilità. Se non trova fonti il modello **non viene chiamato**. Include il fallback server-side per i rifiuti dei classificatori.
- La chiave API resta sul server; rate limit 20 richieste/min per IP; il server espone solo `index.html`, asset, `data/`, `docs/`.
- `npm test` verifica recupero, costruzione della richiesta e parsing delle citazioni con un client finto (nessuna rete).
- Da fare per la produzione: autenticazione degli utenti sull'endpoint, log delle domande, indicizzazione del testo dei PDF (RAG) e valutazione di qualità delle risposte.

## Struttura
```
index.html  style.css  app.js  sw.js  manifest.webmanifest
data/       products documents parts diagnostics errors updates contacts faq config (.json)
assets/img  assets/icons   docs/   (PDF; in produzione → storage protetto)
```
Il router è a hash (`#/catalogo`, `#/modello/<id>/documenti`, `#/esplosi/<id>`, `#/diagnostica/<sintomo>`, `#/supporto`…).

## Dati reali dal catalogo 2026-27
`python3 tools/extract_catalog.py <catalogo.pdf>` rigenera da PDF: `data/products.json` (59 modelli: codice, varianti SX/DX, gamma, categoria, installazione, capacità, zone, dimensioni, classe energetica, rumorosità, EAN, tabella tecnica completa, pagina catalogo), le foto in `assets/img/products/` e una pagina PDF per modello in `docs/catalogo/` (richiede `pdfplumber`, `Pillow`, `pdfseparate`).
Il prezzo di listino è estratto in `listPrice` ma **non viene mostrato** nell'interfaccia.

## Importare un elenco ricambi / esploso
```bash
python3 tools/import_parts.py docs/ricambi/<file>.pdf <id-esploso> "<titolo>" <id-modello>[,<id-modello>] --rev v03
```
Estrae il disegno (ruotato in verticale) e la tabella ricambi in `data/parts.json`. I numeri di riferimento si assegnano solo dove non ambigui; le voci di gruppo/variante restano senza numero e il PDF ufficiale è sempre la fonte. I punti cliccabili sul disegno (`hotspots`) non sono estraibili in automatico: vanno aggiunti a mano.

## Cosa NON è ancora reale
- 1 modello senza foto (NNW180-600T-B): placeholder.
- Non estratti: configurazioni composte (integrabili in accosto), accessori/optional, schede senza tabella.
- Esplosi e ricambi disponibili solo per NW24S/45.24B-REV, NNW120-64DA-BFG-H, NW93T-BFG-H (da `tools/import_parts.py`). Manuali d'uso, schemi, bollettini, codici errore, procedure diagnostiche: **da fornire** (stati vuoti).
- Autenticazione, invio ticket, ricerca per seriale, admin: solo predisposizione (l'assistente AI richiede la chiave API sul server). Il modulo supporto salva una bozza locale finché `data/config.json → ticketEndpoint` è `null`.
- Preferiti, cronologia, note: `localStorage` del browser.
- Le schede PDF sono pagine del catalogo (contengono anche i prezzi di listino): sostituirle con schede tecniche senza prezzi prima di aprire il portale ai tecnici.

## Versione definitiva (proposta)
- **Backend:** Node.js (NestJS) o Django; **PostgreSQL** (prodotti, revisioni, documenti, ricambi, hotspot, errori, utenti, audit); ricerca con PostgreSQL `pg_trgm`/Meilisearch.
- **Auth:** OIDC/SSO o email + MFA, sessione cookie HttpOnly, RBAC (Tecnico / Admin Nevada) applicato lato server.
- **PDF:** bucket privato (S3/Azure Blob) con URL firmati a scadenza, versioning, log download.
- **Admin:** CRUD catalogo, upload PDF versionati, editor hotspot esplosi, gestione utenti.
- **GDPR:** minimizzazione dati, informativa, retention log, DPA col provider, hosting UE.
- **AI:** RAG sui soli PDF autorizzati, con citazioni documento/pagina e rifiuto se manca la fonte.
- **Deploy:** `service.nevadaeurope.com` dietro CDN/WAF.

## Materiale caricato a mano
Metti le schede ufficiali in `docs/schede/` e le foto in `assets/img/products/`, poi `python3 tools/sync_assets.py`: abbina ogni scheda al modello dal codice a pagina 1, ottimizza le foto pesanti e aggiorna `data/documents.json`.
