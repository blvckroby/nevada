// Recupero documentale: costruisce "documenti" testuali dai dati autorizzati (catalogo, ricambi, FAQ, diagnostica, errori)
// e seleziona i più pertinenti alla domanda. L'AI vede SOLO questi documenti.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f + ".json"), "utf8"));
export const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const words = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(w => w.length > 1);
const STOP = new Set("il lo la le gli un una di da in con su per tra fra che e è del della dei delle al alla ai alle come quale quali quanto quanti cosa cui si no non mi ci the of and for what how which is are".split(" "));

export function buildIndex() {
  const { products } = read("products");
  const parts = read("parts"), faq = read("faq"), diag = read("diagnostics"), errors = read("errors"), docs = read("documents");
  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const out = [];
  for (const p of products) {
    const d = docs.filter(x => x.model === p.id).map(x => `${x.title} (${x.revision || ""})`).join("; ");
    out.push({
      id: `prod:${p.id}`, kind: "modello", title: `Scheda tecnica ${p.code}`, href: `#/modello/${p.id}`, models: [p.id],
      text: [`Modello: ${p.code}`, p.variants?.length > 1 ? `Varianti: ${p.variants.join(", ")}` : "", `Descrizione: ${p.title}`, `Categoria: ${p.category}`, p.installationNote ? `Installazione: ${p.installationNote}` : "",
        ...p.spec.map(([k, v]) => `${k}: ${v}`), d ? `Documenti disponibili nel portale: ${d}` : "Nessun documento PDF dedicato disponibile nel portale.", `Fonte: ${p.source}, pag. ${p.catalogPage}`].filter(Boolean).join("\n"),
    });
  }
  for (const x of parts) {
    const codes = x.models.map(m => byId[m]?.code).filter(Boolean);
    out.push({
      id: `parts:${x.id}`, kind: "ricambi", title: `Elenco ricambi ${x.title} (rev. ${x.revision || "—"}, ${x.date || ""})`, href: `#/esplosi/${x.id}`, models: x.models,
      text: [`Elenco ricambi ufficiale. Valido per: ${(x.productNames || codes).join(", ")}. Revisione ${x.revision || "—"} del ${x.date || ""}.`, "Rif. | Codice | Descrizione | Q.tà | Note",
        ...x.parts.map(p => `${p.ref ?? "-"} | ${p.code ?? "-"} | ${p.name} | ${p.qty ?? "-"} | ${p.note ?? ""}`)].join("\n"),
    });
  }
  for (const f of faq) out.push({ id: `faq:${norm(f.q).slice(0, 24)}`, kind: "faq", title: `FAQ: ${f.q}`, href: "#/faq", models: [], text: `${f.q}\n${f.a}\nFonte: ${f.src || ""}` });
  for (const e of diag.entries || []) {
    const s = diag.symptoms.find(s => s.id === e.symptom);
    out.push({ id: `diag:${e.symptom}:${e.models.join("+")}`, kind: "diagnostica", title: `Diagnostica: ${s?.label}`, href: `#/diagnostica/${e.symptom}`, models: e.models,
      text: [e.description, "Cause: " + e.causes.join("; "), "Controlli: " + e.prechecks.join("; "), "Procedura: " + e.procedure.join("; "), "Contattare Nevada: " + e.contactNevada].join("\n") });
  }
  for (const e of errors) out.push({ id: `err:${norm(e.code)}`, kind: "codice errore", title: `Codice errore ${e.code}`, href: `#/errori?q=${encodeURIComponent(e.code)}`, models: e.models || [], text: `${e.code} — ${e.title}\n${e.meaning || ""}` });
  for (const d of out) { d.tokens = words(d.title + " " + d.text); d.norm = norm(d.title + d.text); }
  return { docs: out, products };
}

// Modelli citati nella domanda (codice completo o parziale senza trattini, almeno 5 caratteri)
export function modelsMentioned(q, products) {
  const nq = norm(q), hit = new Set();
  for (const p of products) {
    for (const c of [p.code, ...(p.variants || [])]) { const n = norm(c.replace(/\s+(SX|DX)$/, "")); if (n.length >= 5 && nq.includes(n)) hit.add(p.id); }
  }
  return [...hit];
}

export function retrieve(index, question, { focusModel = null, max = 6 } = {}) {
  const { docs, products } = index;
  const mentioned = new Set([...modelsMentioned(question, products), ...(focusModel ? [focusModel] : [])]);
  const qw = [...new Set(words(question).filter(w => !STOP.has(w)))];
  const df = {}; for (const d of docs) for (const w of new Set(d.tokens)) df[w] = (df[w] || 0) + 1;
  const scored = docs.map(d => {
    let s = 0; const tf = {}; for (const w of d.tokens) tf[w] = (tf[w] || 0) + 1;
    for (const w of qw) if (tf[w]) s += Math.log(1 + docs.length / df[w]) * (tf[w] / (tf[w] + 1.5));
    for (const w of qw) if (w.length >= 5 && d.norm.includes(w)) s += 0.3;            // codici/sigle parziali
    if (d.models.some(m => mentioned.has(m))) s += 6;                                    // documenti del modello citato
    return { d, s };
  }).filter(x => x.s > (mentioned.size ? 0 : 1.2)).sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map(x => ({ ...x.d, score: +x.s.toFixed(2) }));
}
