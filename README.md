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

## Dati reali dal catalogo 2026-27
`python3 tools/extract_catalog.py <catalogo.pdf>` rigenera da PDF: `data/products.json` (59 modelli: codice, varianti SX/DX, gamma, categoria, installazione, capacità, zone, dimensioni, classe energetica, rumorosità, EAN, tabella tecnica completa, pagina catalogo), le foto in `assets/img/products/` e una pagina PDF per modello in `docs/catalogo/` (richiede `pdfplumber`, `Pillow`, `pdfseparate`).
Il prezzo di listino è estratto in `listPrice` ma **non viene mostrato** nell'interfaccia.

## Cosa NON è ancora reale
- 8 modelli senza foto (Teca Vino, 3 Quadro Vino, NNW180-600T-B, NW93T-BFG-H, 2 Vortex T Rock): placeholder.
- Non estratti: configurazioni composte (integrabili in accosto), accessori/optional, schede senza tabella.
- Manuali d'uso, esplosi, ricambi, schemi, bollettini, codici errore, procedure diagnostiche: **da fornire** (le sezioni mostrano stati vuoti).
- Autenticazione, invio ticket, ricerca per seriale, assistente AI, admin: solo predisposizione. Il modulo supporto salva una bozza locale finché `data/config.json → ticketEndpoint` è `null`.
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
