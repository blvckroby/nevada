// Test senza rete: recupero + costruzione richiesta + parsing citazioni con un client finto.
import assert from "node:assert/strict";
import { buildIndex, retrieve } from "./retrieval.mjs";
import { ask, buildMessages } from "./ai.mjs";

const index = buildIndex();
const r1 = retrieve(index, "Qual è il codice del compressore dell'NNW120-64DA-BFG-H?");
assert.ok(r1.some(d => d.id.startsWith("parts:esploso-nnw120")), "deve trovare l'elenco ricambi");
const r2 = retrieve(index, "codice maniglia nw24s bfg h");
assert.ok(r2.some(d => d.id === "parts:esploso-nw24s"));
assert.equal(retrieve(index, "ricetta della carbonara").length, 0, "domanda fuori ambito: nessuna fonte");
const m = buildMessages(r1, "q", [{ role: "user", text: "a" }, { role: "assistant", text: "b" }, { role: "user", text: "c" }]);
assert.equal(m.at(-1).role, "user"); assert.ok(m.at(-1).content.every(b => b.type === "text" || b.citations.enabled));
assert.deepEqual(m.slice(0, -1).map(x => x.role), ["user", "assistant"]);

let sent;
const fake = { beta: { messages: { create: async p => { sent = p; return { stop_reason: "end_turn", model: "claude-opus-5-5", content: [
  { type: "text", text: "Il compressore è ", citations: [] },
  { type: "text", text: "222426801025004 (Inverter Compressor, rif. 27)", citations: [{ type: "char_location", document_index: 0, cited_text: "27 | 222426801025004 | Inverter Compressor", start_char_index: 0, end_char_index: 10 }] }] }; } } } };
const out = await ask(fake, index, { question: "Qual è il codice del compressore dell'NNW120-64DA-BFG-H?" });
assert.equal(sent.model, "claude-opus-5-5"); assert.equal(sent.fallbacks, "default"); assert.deepEqual(sent.betas, ["server-side-fallback-2026-07-01"]);
assert.equal(out.mode, "ai"); assert.equal(out.sources.length, 1); assert.deepEqual(out.answer[1].cites, [1]);
const none = await ask({ beta: { messages: { create: () => { throw new Error("non deve chiamare il modello"); } } } }, index, { question: "ricetta della carbonara" });
assert.equal(none.mode, "no-source");
const ref = await ask({ beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } }, index, { question: "compressore nnw120-64da-bfg-h" });
assert.equal(ref.mode, "refusal");
console.log("OK — documenti indicizzati:", index.docs.length, "· domanda 1 →", r1.slice(0, 3).map(d => d.id).join(", "));
