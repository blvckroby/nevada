// Server del portale: serve il front-end statico e l'API /api/ask per l'assistente AI.
// Avvio:  ANTHROPIC_API_KEY=... npm start      (senza chiave l'API risponde in modalità "solo ricerca")
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT, buildIndex, retrieve } from "./retrieval.mjs";
import { ask, makeClient } from "./ai.mjs";

const PORT = +process.env.PORT || 8000;
const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasKey ? makeClient() : null;
let index = buildIndex();
fs.watch(path.join(ROOT, "data"), { persistent: false }, () => { try { index = buildIndex(); } catch { } });

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json" };
const PUBLIC = [/^\/(index\.html|style\.css|app\.js|sw\.js|manifest\.webmanifest)?$/, /^\/(data|assets|docs)\//];   // server/, tools/, node_modules/ non sono esposti

const hits = new Map();   // rate limit minimale per IP: 20 richieste/min
const limited = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 60000); a.push(now); hits.set(ip, a); return a.length > 20; };
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

async function api(req, res) {
  if (req.method === "GET") return send(res, 200, { ai: !!client, model: client ? (process.env.AI_MODEL || "claude-opus-5-5") : null, docs: index.docs.length });
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (limited(req.socket.remoteAddress)) return send(res, 429, { error: "Troppe richieste, riprova tra un minuto." });
  let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) return send(res, 413, { error: "Richiesta troppo grande" }); }
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "JSON non valido" }); }
  const question = String(body.question || "").trim().slice(0, 1000);
  if (!question) return send(res, 400, { error: "Domanda vuota" });
  const focusModel = typeof body.model === "string" ? body.model : null;
  if (!client) {   // niente chiave: nessuna generazione, solo i documenti pertinenti
    const docs = retrieve(index, question, { focusModel });
    return send(res, 200, { mode: "retrieval", answer: [], sources: [], consulted: docs.map(d => ({ id: d.id, title: d.title, href: d.href, kind: d.kind, excerpt: d.text.slice(0, 220) })) });
  }
  try { send(res, 200, await ask(client, index, { question, focusModel, history: Array.isArray(body.history) ? body.history : [] })); }
  catch (e) {
    console.error("AI error:", e?.status, e?.message);
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: "Servizio AI momentaneamente occupato, riprova." });
    if (e instanceof Anthropic.AuthenticationError) return send(res, 502, { error: "Chiave API non valida sul server." });
    if (e instanceof Anthropic.APIConnectionError) return send(res, 502, { error: "Impossibile raggiungere il servizio AI." });
    send(res, 502, { error: "Errore del servizio AI." });
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname);
    if (p === "/api/ask") return await api(req, res);
    if (!PUBLIC.some(r => r.test(p))) return send(res, 404, "Not found", "text/plain");
    if (p === "/") p = "/index.html";
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "x-content-type-options": "nosniff" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); send(res, 500, { error: "server" }); }
}).listen(PORT, () => console.log(`Nevada Service su http://localhost:${PORT}  ·  AI: ${client ? "attiva" : "non configurata (modalità solo ricerca)"}`));
