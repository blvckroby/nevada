// NEVADA SERVICE — prototipo front-end.
// Dati: /data/*.json (separati dalla presentazione). Stato utente: localStorage (solo prototipo → sostituire con API).
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, c = "") => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const TBD = `<span class="tbd">Da fornire</span>`;

/* ---------- storage utente ---------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("nv." + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nv." + k, JSON.stringify(v)); } catch { toast("Salvataggio locale non disponibile"); } }
};
const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); };

/* ---------- dati ---------- */
const DB = {};
async function load() {
  const names = ["products", "documents", "parts", "diagnostics", "errors", "updates", "contacts", "faq", "config"];
  const res = await Promise.all(names.map(n => fetch(`data/${n}.json`).then(r => { if (!r.ok) throw new Error(n); return r.json(); })));
  names.forEach((n, i) => DB[n] = res[i]);
  DB.meta = DB.products.meta; DB.products = DB.products.products;
}
const byId = id => DB.products.find(p => p.id === id);
const DOC_TYPES = [
  ["manuale", "Manuale d'uso", "book", "Visualizza PDF"], ["scheda", "Scheda tecnica (catalogo)", "file", "Visualizza PDF"],
  ["esploso", "Disegno esploso", "layers", "Visualizza"], ["ricambi", "Elenco ricambi", "wrench", "Visualizza codici"],
  ["schema", "Schema elettrico", "activity", "Visualizza"], ["installazione", "Istruzioni di installazione", "settings", "Visualizza"],
  ["servizio", "Manuale di servizio", "wrench", "Visualizza"], ["bollettini", "Bollettini tecnici", "bell", "Visualizza aggiornamenti"]
];

/* ---------- ricerca fuzzy ---------- */
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function lev(a, b) { // distanza di Levenshtein
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
// punteggio 0..100: contenimento > inizio > tolleranza errori sulle sottostringhe
function score(q, target) {
  const t = norm(target); if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 92;
  if (t.includes(q)) return 85;
  if (q.length < 4) return 0;
  const tol = q.length >= 8 ? 2 : 1; let best = 99;
  for (let L = q.length - 1; L <= q.length + 1; L++) for (let i = 0; i + L <= t.length; i++) best = Math.min(best, lev(q, t.slice(i, i + L)));
  return best <= tol ? 70 - best * 10 : 0;
}
function searchAll(raw) {
  const q = norm(raw); if (!q) return [];
  const out = [];
  const push = (type, s, o) => s > 0 && out.push({ type, s, ...o });
  DB.products.forEach(p => push("Modelli", Math.max(score(q, p.code), ...(p.variants || []).map(v => score(q, v)), score(q, p.series) * .5, score(q, p.category) * .5, score(q, p.title) * .45), { p, title: p.code, sub: [p.title, p.category].filter(Boolean).join(" · "), href: `#/modello/${p.id}` }));
  DB.documents.forEach(d => { const p = byId(d.model); push("Documenti", score(q, d.title), { title: d.title, sub: p?.code, href: `#/modello/${d.model}/doc/${d.type}`, demo: d.demo }); });
  DB.parts.forEach(x => x.parts.forEach(pt => push("Ricambi", Math.max(score(q, pt.name), score(q, pt.code)), { title: pt.name, sub: `Rif. ${pt.ref} · ${x.title}`, href: `#/esplosi/${x.id}?ref=${pt.ref}`, demo: x.demo })));
  DB.errors.forEach(e => push("Codici errore", Math.max(score(q, e.code), score(q, e.title)), { title: e.code, sub: e.title, href: `#/errori?q=${encodeURIComponent(e.code)}` }));
  DB.diagnostics.symptoms.forEach(s => push("Diagnostica", score(q, s.label), { title: s.label, sub: "Diagnostica per sintomo", href: `#/diagnostica/${s.id}` }));
  DB.faq.forEach(f => push("Articoli", score(q, f.q), { title: f.q, sub: "FAQ", href: "#/faq" }));
  return out.sort((a, b) => b.s - a.s);
}

/* ---------- immagini prodotto (foto dal catalogo; placeholder se assente) ---------- */
const imgOf = p => p.image ? `<img src="${esc(p.image)}" alt="${esc(p.code)}" loading="lazy" decoding="async">` : `<div class="noimg">${ic("grid")}Foto non disponibile</div>`;
const instLabel = k => DB.meta.installations[k] || null;
const zoneLabel = z => z ? ({ 1: "Singola temp.", 2: "Doppia temp.", 3: "Tripla temp.", 4: "4 temperature" }[z] || z + " zone") : null;
const fmtDims = d => d ? `${d.h} × ${d.l} × ${d.p} cm` : null;
const SHORT = c => c.replace("VINUMdesign ", "").replace("Cantine ", "").replace("Frigoriferi 4 porte con cantina", "4 Porte");

/* ---------- preferiti / cronologia / note ---------- */
const favs = () => store.get("favs", []);
const toggleFav = id => { const f = favs(), i = f.indexOf(id); i >= 0 ? f.splice(i, 1) : f.unshift(id); store.set("favs", f); return i < 0; };
const pushHist = (kind, id, label) => { const h = store.get("hist", []).filter(x => !(x.kind === kind && x.id === id)); h.unshift({ kind, id, label, t: Date.now() }); store.set("hist", h.slice(0, 30)); };

/* ---------- componenti UI ---------- */
function pcard(p) {
  const on = favs().includes(p.id);
  return `<article class="card pcard"><button class="icon-btn fav ${on ? "on" : ""}" data-fav="${p.id}" aria-label="Preferito">${ic("star", "sm")}</button><a href="#/modello/${p.id}">
    <div class="pimg">${imgOf(p)}<span class="badge">${esc(SHORT(p.category))}</span></div>
    <div class="pbody"><b>${esc(p.code)}</b><div class="small muted" style="margin-top:2px">${esc(p.title)}</div>
    <div class="meta">${[p.bottles && p.bottles + " bt", zoneLabel(p.zones), p.dimensions && "H " + p.dimensions.h + " cm"].filter(Boolean).map(x => `<span class="badge">${esc(x)}</span>`).join("")}</div></div></a></article>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-fav]"); if (!b) return; e.preventDefault(); const on = toggleFav(b.dataset.fav); b.classList.toggle("on", on); toast(on ? "Aggiunto ai preferiti" : "Rimosso dai preferiti"); });
const empty = (icon, t, s = "") => `<div class="empty">${ic(icon)}<b>${t}</b>${s}</div>`;
const crumbs = (...c) => `<nav class="crumbs" aria-label="Percorso">${c.map((x, i) => i < c.length - 1 ? `<a href="${x[1]}">${x[0]}</a>${ic("chev", "sm")}` : `<span aria-current="page">${x[0]}</span>`).join("")}</nav>`;
const skeleton = () => `<div class="grid g-prod">${'<div class="sk" style="aspect-ratio:4/5"></div>'.repeat(8)}</div>`;

/* ---------- navigazione ---------- */
const NAV = [["", "Home", "home"], ["catalogo", "Catalogo", "grid"], ["esplosi", "Esplosi", "layers"], ["diagnostica", "Diagnostica", "activity"], ["documentazione", "Manuali", "book"], ["errori", "Errori", "alert"], ["supporto", "Supporto", "phone"], ["preferiti", "Preferiti", "star"], ["cronologia", "Cronologia", "clock"], ["note", "Note", "note"], ["assistente-ai", "Assistente AI", "bot"], ["admin", "Admin", "settings"]];
const BNAV = [["", "Home", "home"], ["catalogo", "Catalogo", "grid"], ["diagnostica", "Diagnosi", "activity"], ["supporto", "Supporto", "phone"], ["altro", "Altro", "menu"]];
function renderNav(seg) {
  $("#sidenav").innerHTML = NAV.map(([h, l, i]) => `<a href="#/${h}" ${h === seg ? 'aria-current="page"' : ""}>${ic(i)}<span>${l}</span></a>`).join("");
  $("#bnav").innerHTML = BNAV.map(([h, l, i]) => `<a href="#/${h}" ${(h === seg || (h === "altro" && !BNAV.some(b => b[0] === seg))) ? 'aria-current="page"' : ""}>${ic(i)}<span>${l}</span></a>`).join("");
}

const routes = {};
async function route() {
  closeModal();
  const [path, qs = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean), seg = parts[0] || "";
  renderNav(seg);
  const view = $("#view"), fn = routes[seg];
  view.innerHTML = skeleton();
  try {
    if (!DB.products) await load();
    view.innerHTML = fn ? await fn(parts.slice(1), new URLSearchParams(qs)) : notFound();
    const after = view._after; view._after = null; after?.();
  } catch (e) {
    console.error(e);
    view.innerHTML = empty("alert", "Impossibile caricare i dati", `<p class="small">Il prototipo legge <code>data/*.json</code> via HTTP: avvia un server locale (<code>python3 -m http.server</code>) invece di aprire il file direttamente.</p><button class="btn" onclick="location.reload()">Riprova</button>`);
  }
  view.focus({ preventScroll: true }); window.scrollTo(0, 0);
}
const notFound = () => empty("search", "Pagina non trovata", `<a class="btn" href="#/">Torna alla home</a>`);
const after = f => { $("#view")._after = f; };

/* ---------- HOME ---------- */
routes[""] = () => {
  const shorts = [["catalogo", "Catalogo prodotti", "Tutte le cantine", "grid"], ["documentazione", "Manuali e documentazione", "PDF per modello", "book"], ["esplosi", "Esplosi e ricambi", "Disegni e codici", "layers"], ["errori", "Codici errore", "Ricerca rapida", "alert"], ["diagnostica", "Diagnostica guasti", "Per sintomo", "activity"], ["supporto", "Contatta Nevada", "Richiesta tecnica", "phone"]];
  const hist = store.get("hist", []).filter(h => h.kind === "model").slice(0, 4).map(h => byId(h.id)).filter(Boolean);
  const cats = DB.meta.categories.map(c => ({ c, list: DB.products.filter(p => p.category === c) })).filter(x => x.list.length);
  after(() => $("#bigq")?.addEventListener("input", e => { $("#gq").value = e.target.value; $("#gq").dispatchEvent(new Event("input")); $("#gq").focus(); e.target.value = ""; }));
  return `<section class="hero"><span class="eyebrow"><i><b style="background:#99002e"></b><b style="background:#b65674"></b><b style="background:#d3a0b3"></b></i>Technical Support Portal</span>
  <h1>Benvenuto nel Centro Assistenza Nevada</h1><p>Tutte le informazioni tecniche di cui hai bisogno, in un unico posto.</p>
  <label class="bigsearch">${ic("search", "lg")}<input id="bigq" type="search" placeholder="Cerca un modello, codice prodotto o numero seriale..." aria-label="Cerca un modello, codice prodotto o numero seriale"></label>
  <div class="stats"><div class="glass stat card"><b>${DB.products.length}</b><small>modelli a catalogo</small></div><div class="glass stat card"><b>${cats.length}</b><small>gamme</small></div><div class="glass stat card"><b>${DB.documents.length}</b><small>schede disponibili</small></div></div></section>
  <div class="grid g-short sec" style="margin-top:22px">${shorts.map(([h, t, s, i]) => `<a class="card short" href="#/${h}"><span class="ico">${ic(i)}</span><b>${t}</b><small>${s}</small></a>`).join("")}</div>
  <section class="sec"><div class="sec-h"><h2>Sfoglia per gamma</h2><a href="#/catalogo">Tutto il catalogo</a></div>
  <div class="cats">${cats.map(({ c, list }) => `<a class="cat" href="#/catalogo?cat=${encodeURIComponent(c)}">${list.find(p => p.image) ? `<img src="${esc(list.find(p => p.image).image)}" alt="" loading="lazy">` : ""}<span>${esc(c)}<small>${list.length} ${list.length === 1 ? "modello" : "modelli"}</small></span></a>`).join("")}</div></section>
  <section class="sec"><div class="sec-h"><h2>Prodotti consultati di recente</h2><a href="#/cronologia">Cronologia</a></div>
  ${hist.length ? `<div class="grid g-prod">${hist.map(pcard).join("")}</div>` : empty("clock", "Nessun prodotto consultato", `<p class="small">I modelli che apri compariranno qui, su questo dispositivo.</p>`)}</section>
  <section class="sec" id="upd"><div class="sec-h"><h2>Ultimi aggiornamenti tecnici</h2></div>
  ${DB.updates.length ? `<div class="card list">${DB.updates.map(u => `<div class="li"><span class="ico">${ic("bell")}</span><div class="grow"><b>${esc(u.title)} <span class="badge new">${esc(u.tag || "")}</span></b><span class="small muted">${esc(u.date)} — ${esc(u.text)}</span></div></div>`).join("")}</div>` : empty("bell", "Nessun aggiornamento")}</section>`;
};

/* ---------- CATALOGO ---------- */
routes.catalogo = (_, qp) => {
  const F = { q: qp.get("q") || "", cat: qp.get("cat") || "", inst: "", cap: "", zones: "", status: "", series: "" };
  const opt = (arr, fmt = x => x) => arr.map(x => `<option value="${esc(Array.isArray(x) ? x[0] : x)}">${esc(Array.isArray(x) ? x[1] : fmt(x))}</option>`).join("");
  const sel = (id, label, o) => `<div><label for="${id}">${label}</label><select id="${id}"><option value="">Tutti</option>${o}</select></div>`;
  const usedCats = DB.meta.categories.filter(c => DB.products.some(p => p.category === c));
  const series = [...new Set(DB.products.map(p => p.series).filter(Boolean))];
  after(() => {
    const apply = () => {
      const q = norm(F.q);
      let list = DB.products.filter(p => (!F.cat || p.category === F.cat) && (!F.inst || p.installation === F.inst) && (!F.zones || String(p.zones) === F.zones) && (!F.status || p.status === F.status) && (!F.series || p.series === F.series)
        && (!F.cap || (p.bottles != null && (F.cap === "s" ? p.bottles <= 24 : F.cap === "m" ? p.bottles > 24 && p.bottles <= 60 : p.bottles > 60))));
      if (q) list = list.map(p => ({ p, s: Math.max(score(q, p.code), ...(p.variants || []).map(v => score(q, v)), score(q, p.title) * .5) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.p);
      $("#count").textContent = `${list.length} ${list.length === 1 ? "modello" : "modelli"}`;
      $("#plist").innerHTML = list.length ? list.map(pcard).join("") : `<div style="grid-column:1/-1">${empty("search", "Nessun modello trovato", `<p class="small">Prova a togliere qualche filtro o a cercare un codice parziale.</p>`)}</div>`;
    };
    const bind = (id, k) => $("#" + id).addEventListener("input", e => { F[k] = e.target.value; apply(); });
    [["f-q", "q"], ["f-cat", "cat"], ["f-inst", "inst"], ["f-cap", "cap"], ["f-z", "zones"], ["f-st", "status"], ["f-se", "series"]].forEach(([i, k]) => bind(i, k));
    $("#f-q").value = F.q; $("#f-cat").value = F.cat; $(".fbtn").onclick = () => $("#filtersWrap").classList.toggle("open");
    $("#reset").onclick = () => { $$("#filtersWrap select").forEach(s => s.value = ""); $("#f-q").value = ""; Object.assign(F, { q: "", cat: "", inst: "", cap: "", zones: "", status: "", series: "" }); apply(); };
    apply();
  });
  return `<h1>Catalogo prodotti</h1><p class="muted">Dati dal catalogo/listino Nevada Vinum 2026-27. Cerca anche per codice parziale, senza trattini o con piccoli errori.</p>
  <div class="row" style="margin:16px 4px"><button class="btn fbtn">${ic("filter", "sm")} Filtri</button><span id="count" class="muted small"></span></div>
  <div class="cat-wrap"><aside class="filters" id="filtersWrap" aria-label="Filtri catalogo">
    <div><label for="f-q">Codice modello</label><input id="f-q" type="search" placeholder="es. nnw8230 o 72 29 da" autocomplete="off"></div>
    ${sel("f-cat", "Categoria", opt(usedCats))}${sel("f-inst", "Installazione", opt(Object.entries(DB.meta.installations)))}
    ${sel("f-cap", "Capacità bottiglie", opt([["s", "fino a 24"], ["m", "25 – 60"], ["l", "oltre 60"]]))}${sel("f-z", "Temperature", opt([["1", "Singola"], ["2", "Doppia"], ["3", "Tripla"], ["4", "Quadrupla"]]))}
    ${sel("f-se", "Gamma / serie", opt(series))}${sel("f-st", "Stato", opt(Object.entries(DB.meta.statuses)))}
    <button class="btn" id="reset">Azzera filtri</button></aside>
  <div class="grid g-prod" id="plist"></div></div>`;
};

/* ---------- SCHEDA MODELLO ---------- */
routes.modello = ([id, sub, key]) => {
  const p = byId(id);
  if (!p) return notFound();
  pushHist("model", p.id, p.code);
  const docs = DB.documents.filter(d => d.model === p.id);
  const tab = !sub || sub === "doc" ? "scheda" : sub;
  after(() => {
    $("#favBtn").onclick = e => { const on = toggleFav(p.id); e.currentTarget.classList.toggle("on", on); toast(on ? "Aggiunto ai preferiti" : "Rimosso dai preferiti"); };
    $$("[data-view]").forEach(b => b.onclick = () => openDoc(docs.find(d => d.type === b.dataset.view), p));
    $$("[data-save]").forEach(b => b.onclick = () => saveOffline(b.dataset.save, b));
    $("#noteSave")?.addEventListener("click", () => { const n = store.get("notes", {}); n[p.id] = $("#noteTxt").value; store.set("notes", n); toast("Nota salvata su questo dispositivo"); });
    if (sub === "doc" && key) openDoc(docs.find(d => d.type === key), p);
  });
  const kv = [["Codice modello", p.code], ["Serie / gamma", p.series], ["Categoria", p.category], ["Installazione", p.installationNote || instLabel(p.installation)], ["Capacità", p.bottles && p.bottles + " bottiglie"], ["Zone di temperatura", zoneLabel(p.zones)], ["Dimensioni (A×L×P)", fmtDims(p.dimensions)], ["Classe energetica", p.energyClass], ["Rumorosità", p.noiseDb && p.noiseDb + " dB"]];
  const tabs = [["scheda", "Scheda tecnica"], ["documenti", "Documentazione"], ["esploso", "Esploso e ricambi"], ["diagnostica", "Diagnostica"], ["revisioni", "Revisioni"], ["nota", "Note"]];
  let body = "";
  if (tab === "scheda") body = p.spec?.length ? `<div class="card" style="overflow:hidden"><table class="spec">${p.spec.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v) || TBD}</td></tr>`).join("")}</table></div><p class="small muted" style="margin:10px 4px">Fonte: ${esc(p.source)}, pag. ${p.catalogPage}. Valori riportati come da catalogo, non rielaborati.</p>` : empty("file", "Scheda tecnica non disponibile");
  if (tab === "documenti") body = `<div class="docs">${DOC_TYPES.map(([t, l, i, act]) => {
    const d = docs.find(x => x.type === t);
    return d?.file ? `<div class="card doc"><span class="ico">${ic(i)}</span><div class="grow"><b>${d.title}</b><div class="small muted">${esc(d.revision || "—")}${d.pdfPage ? ` · pag. ${d.pdfPage}` : ""} · Seriali: ${esc(d.serial || "non specificati")}</div></div>
      <div class="row"><button class="btn sm primary" data-view="${t}">${ic("eye", "sm")} ${act}</button><a class="btn sm" href="${esc(d.file)}" download>${ic("download", "sm")} Scarica</a><button class="btn sm" data-save="${esc(d.file)}" title="Salva per uso offline" aria-label="Salva per uso offline">${ic("wifioff", "sm")}</button></div></div>`
      : `<div class="card doc na"><span class="ico">${ic(i)}</span><div class="grow"><b>${l}</b><div class="small muted">Documento non disponibile</div></div></div>`;
  }).join("")}</div><p class="small muted" style="margin:10px 4px">La scheda è la pagina del catalogo 2026-27 che contiene il modello (può includere altri modelli della stessa gamma). Gli altri documenti saranno aggiunti dal pannello amministrativo.</p>`;
  if (tab === "esploso") { const ex = DB.parts.filter(x => x.models.includes(p.id)); body = ex.length ? ex.map(x => `<a class="card li" href="#/esplosi/${x.id}?model=${p.id}"><span class="ico">${ic("layers")}</span><div class="grow"><b>${esc(x.title)}</b><span class="small muted">${x.parts.length} riferimenti</span></div>${ic("chev")}</a>`).join("") : empty("layers", "Esploso non disponibile", `<p class="small">Nessun disegno esploso associato a ${esc(p.code)}: da fornire da Nevada.</p>`); }
  if (tab === "diagnostica") { const en = DB.diagnostics.entries.filter(e => e.models.includes(p.id)); body = en.length ? en.map(e => { const s = DB.diagnostics.symptoms.find(s => s.id === e.symptom); return `<a class="card li" href="#/diagnostica/${e.symptom}?model=${p.id}"><span class="ico">${ic("activity")}</span><div class="grow"><b>${esc(s.label)}</b></div>${ic("chev")}</a>`; }).join("") : empty("activity", "Nessuna procedura verificata per questo modello", `<p class="small">Le procedure vanno fornite e validate da Nevada.</p>`); }
  if (tab === "revisioni") body = p.revisions.length ? `<div class="tscroll card"><table><tr><th>Rev.</th><th>Note</th><th>Intervallo seriali</th></tr>${p.revisions.map(r => `<tr><td>${esc(r.rev)}</td><td>${esc(r.note)}</td><td>${esc(r.serial)}</td></tr>`).join("")}</table></div>` : empty("columns", "Nessuna revisione documentata", `<p class="small">Il confronto tra versioni si attiva quando esistono almeno due revisioni nei dati.</p>`);
  if (tab === "nota") body = `<div class="card pad"><label for="noteTxt" class="small"><b>Appunti su ${esc(p.code)}</b> (salvati solo su questo dispositivo)</label><textarea id="noteTxt" class="fld" style="margin:8px 0">${esc(store.get("notes", {})[p.id] || "")}</textarea><button class="btn primary" id="noteSave">Salva nota</button></div>`;
  const vars = (p.variants || []).filter(v => v !== p.code);
  return `${crumbs(["Catalogo", "#/catalogo"], [esc(p.code)])}
  <div class="detail"><div class="pimg">${imgOf(p)}</div>
  <div><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="badge new">${esc(p.category)}</span><h1 style="word-break:break-all;margin-top:10px;font-size:clamp(1.6rem,4vw,2.4rem)">${esc(p.code)}</h1><p class="muted">${esc(p.title)}</p></div>
  <button id="favBtn" class="icon-btn fav ${favs().includes(p.id) ? "on" : ""}" style="position:static" aria-label="Preferito">${ic("star")}</button></div>
  ${vars.length ? `<p class="small" style="margin:6px 0"><b>Varianti:</b> ${vars.map(esc).join(" · ")}</p>` : ""}
  <div class="kv" style="margin-top:14px">${kv.map(([k, v]) => `<div><small>${k}</small><b>${v ? esc(v) : TBD}</b></div>`).join("")}</div>
  <div class="row" style="margin-top:16px"><a class="btn wine" href="#/supporto?model=${p.id}">${ic("phone", "sm")} Richiedi supporto</a><button class="btn" id="viewDoc" data-view="scheda">${ic("eye", "sm")} Apri pagina catalogo</button></div></div></div>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a href="#/modello/${p.id}/${k}" ${k === tab ? 'aria-current="true"' : ""}>${l}</a>`).join("")}</div>${body}`;
};

/* ---------- visualizzatore documenti ---------- */
function modal(title, inner) {
  const m = $("#modal"); m.hidden = false;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-h"><h3>${esc(title)}</h3><button class="icon-btn" id="mclose" aria-label="Chiudi">${ic("x")}</button></div><div class="sheet-b">${inner}</div></div>`;
  $("#mclose").onclick = closeModal; m.onclick = e => { if (e.target === m) closeModal(); };
  document.body.style.overflow = "hidden";
}
function closeModal() { const m = $("#modal"); if (!m || m.hidden) return; m.hidden = true; m.innerHTML = ""; document.body.style.overflow = ""; window.__stopCam?.(); }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function openDoc(d, p) {
  if (!d?.file) return toast("Documento non disponibile");
  pushHist("doc", p.id + ":" + d.type, `${d.title} — ${p.code}`);
  let zoom = 100;
  modal(`${d.title} — ${p.code}`, `<div class="viewer-wrap" id="vw"><div class="viewer-tools">
    <button class="icon-btn" data-z="-" aria-label="Riduci zoom">${ic("minus")}</button><span id="zv" class="small" style="min-width:42px;text-align:center">100%</span><button class="icon-btn" data-z="+" aria-label="Aumenta zoom">${ic("plus")}</button>
    <button class="icon-btn" id="vfs" aria-label="Schermo intero">${ic("max")}</button><button class="icon-btn" id="vpr" aria-label="Stampa">${ic("print")}</button>
    <a class="btn sm" style="margin-left:auto" href="${esc(d.file)}" target="_blank" rel="noopener">Apri in nuova scheda</a><a class="btn sm" href="${esc(d.file)}" download>${ic("download", "sm")} Scarica</a></div>
    <iframe class="viewer-frame" id="vf" title="${esc(d.title)}" src="${esc(d.file)}#page=${d.page || 1}&zoom=100"></iframe></div>`);
  const fr = $("#vf");
  $$("[data-z]").forEach(b => b.onclick = () => { zoom = Math.min(400, Math.max(50, zoom + (b.dataset.z === "+" ? 25 : -25))); $("#zv").textContent = zoom + "%"; fr.src = `${d.file}#page=${d.page || 1}&zoom=${zoom}`; });
  $("#vfs").onclick = () => $("#vw").requestFullscreen?.().catch(() => toast("Schermo intero non supportato"));
  $("#vpr").onclick = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch { window.open(d.file); } };
}
async function saveOffline(file, btn) {
  if (!("caches" in window)) return toast("Cache offline non supportata");
  try { const c = await caches.open("nv-docs-v1"); await c.add(file); const s = store.get("offline", []); if (!s.includes(file)) s.push(file); store.set("offline", s); btn.classList.add("primary"); toast("Documento salvato per l'uso offline"); }
  catch { toast("Salvataggio offline non riuscito (serve connessione e service worker attivo)"); }
}

/* ---------- menu "Altro" (mobile) ---------- */
routes.altro = () => `<h1>Menu</h1><div class="sec card list">${NAV.filter(n => !BNAV.some(b => b[0] === n[0])).map(([h, l, i]) => `<a class="li" href="#/${h}"><span class="ico">${ic(i)}</span><div class="grow"><b>${l}</b></div>${ic("chev")}</a>`).join("")}<a class="li" href="#/contatti"><span class="ico">${ic("phone")}</span><div class="grow"><b>Contatti</b></div>${ic("chev")}</a><a class="li" href="#/faq"><span class="ico">${ic("help")}</span><div class="grow"><b>FAQ</b></div>${ic("chev")}</a><a class="li" href="#/accesso"><span class="ico">${ic("user")}</span><div class="grow"><b>Accesso</b></div>${ic("chev")}</a></div>`;

/* ---------- DOCUMENTAZIONE (indice) ---------- */
routes.documentazione = () => {
  const withDocs = DB.products.filter(p => DB.documents.some(d => d.model === p.id));
  return `<h1>Manuali e documentazione</h1><p class="muted">Ogni documento è collegato al codice modello corretto. Per cercare un modello usa il <a href="#/catalogo"><u>catalogo</u></a>.</p>
  <div class="sec">${withDocs.length ? `<div class="card list">${withDocs.map(p => `<a class="li" href="#/modello/${p.id}/documenti"><span class="ico">${ic("file")}</span><div class="grow"><b>${esc(p.code)} </b><span class="small muted">${DB.documents.filter(d => d.model === p.id).length} documenti disponibili</span></div>${ic("chev")}</a>`).join("")}</div>` : empty("file", "Nessun documento caricato")}</div>
  <div class="notice" style="margin-top:16px">${ic("alert", "sm")}<span>Per ora è disponibile solo la scheda del catalogo 2026-27. Manuali d'uso, esplosi, schemi elettrici, manuali di servizio e bollettini sono <b>ancora da fornire</b>.</span></div>`;
};

/* ---------- ESPLOSI ---------- */
routes.esplosi = ([id], qp) => {
  if (!id) return `<h1>Esplosi e ricambi</h1><p class="muted">Disegni esplosi con riferimenti cliccabili e tabella ricambi collegata.</p><div class="sec">${DB.parts.length ? `<div class="card list">${DB.parts.map(x => `<a class="li" href="#/esplosi/${x.id}"><span class="ico">${ic("layers")}</span><div class="grow"><b>${esc(x.title)}</b><span class="small muted">Modelli: ${x.models.map(m => byId(m)?.code).join(", ")}</span></div>${ic("chev")}</a>`).join("")}</div>` : empty("layers", "Nessun esploso caricato")}</div>`;
  const x = DB.parts.find(e => e.id === id); if (!x) return notFound();
  const model = qp.get("model"); let sel = +qp.get("ref") || null, scale = 1, tx = 0, ty = 0;
  after(() => {
    const cv = $("#xc"), st = $("#xs"), img = $("#xi");
    const paint = () => { st.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; st.style.setProperty("--inv", 1 / scale); };
    const fit = () => { const w = cv.clientWidth, iw = img.naturalWidth || 600, ih = img.naturalHeight || 460; scale = Math.min(w / iw, cv.clientHeight / ih); tx = (w - iw * scale) / 2; ty = (cv.clientHeight - ih * scale) / 2; paint(); };
    const zoomAt = (f, cx = cv.clientWidth / 2, cy = cv.clientHeight / 2) => { const ns = Math.min(8, Math.max(.3, scale * f)); tx = cx - (cx - tx) * ns / scale; ty = cy - (cy - ty) * ns / scale; scale = ns; paint(); };
    img.complete ? fit() : img.onload = fit;
    $("#zin").onclick = () => zoomAt(1.4); $("#zout").onclick = () => zoomAt(1 / 1.4); $("#zfit").onclick = fit;
    cv.addEventListener("wheel", e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    // pan + pinch con pointer events
    const ptrs = new Map(); let d0 = 0;
    cv.addEventListener("pointerdown", e => { ptrs.set(e.pointerId, e); if (ptrs.size === 2) { const [p1, p2] = [...ptrs.values()]; d0 = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY); } });
    cv.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, e);
      if (ptrs.size === 1) { tx += e.clientX - prev.clientX; ty += e.clientY - prev.clientY; paint(); }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (d0) { const r = cv.getBoundingClientRect(); zoomAt(d / d0, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); } d0 = d; }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => cv.addEventListener(ev, e => { ptrs.delete(e.pointerId); d0 = 0; }));
    const select = (ref, focus) => {
      sel = ref; $$(".hot").forEach(h => h.classList.toggle("sel", +h.dataset.ref === ref)); $$("tr[data-ref]").forEach(r => r.classList.toggle("sel", +r.dataset.ref === ref));
      const pt = x.parts.find(p => p.ref === ref), box = $("#pdet");
      if (!pt) { box.innerHTML = `<p class="muted small">Seleziona un riferimento sul disegno o nella tabella.</p>`; return; }
      const comp = pt.compatible?.map(m => byId(m)?.code).filter(Boolean);
      box.innerHTML = `<h3>Rif. ${pt.ref} — ${esc(pt.name)}</h3><div class="kv" style="grid-template-columns:1fr;margin:10px 0"><div><small>Codice ricambio originale Nevada</small><b>${pt.code ? esc(pt.code) : TBD}</b></div><div><small>Modelli compatibili</small><b>${comp?.length ? esc(comp.join(", ")) : TBD}</b></div><div><small>Note tecniche</small><b style="font-weight:400">${pt.note ? esc(pt.note) : TBD}</b></div></div>
        <a class="btn wine" href="#/supporto?model=${esc(model || x.models[0])}&part=${encodeURIComponent(`Rif. ${pt.ref} ${pt.name}${pt.code ? " (" + pt.code + ")" : ""}`)}">${ic("send", "sm")} Richiedi questo ricambio</a>`;
      const h = x.hotspots.find(h => h.ref === ref); if (focus && h) { tx = cv.clientWidth / 2 - h.x * scale; ty = cv.clientHeight / 2 - h.y * scale; paint(); }
    };
    $$(".hot").forEach(h => h.addEventListener("click", () => select(+h.dataset.ref)));
    $$("tr[data-ref]").forEach(r => r.addEventListener("click", () => select(+r.dataset.ref, true)));
    $("#pq").addEventListener("input", e => { const q = norm(e.target.value); $$("tr[data-ref]").forEach(r => r.hidden = q && !norm(r.textContent).includes(q)); });
    select(sel);
  });
  return `${crumbs(["Esplosi", "#/esplosi"], [esc(x.title)])}<h1>${esc(x.title)} ${x.demo ? '<span class="badge demo">DEMO</span>' : ""}</h1>
  <div class="xv" style="margin-top:14px"><div><div class="xcanvas" id="xc"><div class="xtools"><button class="icon-btn" id="zin" aria-label="Ingrandisci">${ic("plus")}</button><button class="icon-btn" id="zout" aria-label="Riduci">${ic("minus")}</button><button class="icon-btn" id="zfit" aria-label="Adatta">${ic("max")}</button></div>
    <div class="xstage" id="xs"><img id="xi" src="${esc(x.image)}" alt="${esc(x.title)}" draggable="false">${x.hotspots.map(h => `<button class="hot" data-ref="${h.ref}" style="left:${h.x}px;top:${h.y}px" aria-label="Riferimento ${h.ref}">${h.ref}</button>`).join("")}</div></div>
    <p class="small muted">Trascina per spostarti, rotellina o pizzico per ingrandire.</p></div>
  <div class="grid"><div class="card pad" id="pdet"></div>
  <div class="card"><div class="pad" style="padding-bottom:0"><input id="pq" type="search" class="fld" placeholder="Cerca ricambio per codice o descrizione" aria-label="Cerca ricambio"></div>
  <div class="tscroll"><table><tr><th>Rif.</th><th>Componente</th><th>Codice</th></tr>${x.parts.map(p => `<tr data-ref="${p.ref}"><td>${p.ref}</td><td>${esc(p.name)}</td><td>${p.code ? esc(p.code) : TBD}</td></tr>`).join("")}</table></div></div></div></div>`;
};

/* ---------- DIAGNOSTICA ---------- */
const SYM_ICONS = { snowflake: "activity", thermometer: "activity", cpu: "settings", volume: "bell", droplet: "activity", fan: "settings", monitor: "eye", lightbulb: "star", bell: "bell", alert: "alert" };
routes.diagnostica = ([sid], qp) => {
  const safety = `<div class="notice safe">${ic("shield", "sm")}<span><b>Sicurezza.</b> Gli interventi su impianto elettrico e circuito frigorifero sono riservati a personale qualificato. Scollegare l'alimentazione prima di aprire i pannelli, salvo diverse indicazioni documentate.</span></div>`;
  if (!sid) return `<h1>Diagnostica guasti</h1><p class="muted">Scegli il sintomo. Le procedure compaiono solo se verificate da Nevada.</p><div style="margin:14px 0">${safety}</div>
    <div class="grid g-short">${DB.diagnostics.symptoms.map(s => `<a class="card short" href="#/diagnostica/${s.id}"><span class="ico">${ic(SYM_ICONS[s.icon] || "activity")}</span><b>${s.label}</b></a>`).join("")}</div>`;
  const s = DB.diagnostics.symptoms.find(x => x.id === sid); if (!s) return notFound();
  const en = DB.diagnostics.entries.filter(e => e.symptom === sid), L = a => `<ol class="steps">${a.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;
  return `${crumbs(["Diagnostica", "#/diagnostica"], [esc(s.label)])}<h1>${esc(s.label)}</h1><div style="margin:14px 0">${safety}</div>
  ${en.length ? en.map(e => `<div class="card pad" style="margin-bottom:12px"><div class="row"><b>Modelli: ${e.models.map(m => esc(byId(m)?.code)).join(", ")}</b>${e.demo ? '<span class="badge demo">DEMO</span>' : ""}${e.qualifiedOnly ? '<span class="badge bad">Solo personale qualificato</span>' : ""}</div>
    <p>${esc(e.description)}</p><h3>Possibili cause documentate</h3>${L(e.causes)}<h3>Controlli preliminari</h3>${L(e.prechecks)}<h3>Procedura di diagnosi</h3>${L(e.procedure)}<h3>Componenti coinvolti</h3>${L(e.components)}
    <h3>Quando contattare Nevada</h3><p>${esc(e.contactNevada)}</p><div class="row"><a class="btn sm" href="#/supporto">${ic("phone", "sm")} Contatta Nevada</a></div></div>`).join("")
    : empty("activity", "Nessuna procedura verificata", `<p class="small">Il contenuto per questo sintomo deve essere fornito e approvato da Nevada. Nessuna procedura viene inventata.</p><a class="btn" href="#/supporto">Chiedi supporto</a>`)}`;
};

/* ---------- CODICI ERRORE ---------- */
routes.errori = (_, qp) => {
  after(() => {
    const run = () => { const q = norm($("#eq").value), r = DB.errors.filter(e => !q || norm(e.code + e.title + (e.models || []).join("")).includes(q));
      $("#eres").innerHTML = r.length ? `<div class="card list">${r.map(e => `<div class="li"><div class="grow"><b>${esc(e.code)} — ${esc(e.title)}</b><span class="small muted">${esc(e.meaning || "")}</span></div></div>`).join("")}</div>` : empty("alert", DB.errors.length ? "Nessun codice trovato" : "Database codici errore vuoto", `<p class="small">${DB.errors.length ? "Verifica il codice sul display." : "I codici errore e il loro significato devono essere forniti da Nevada (<code>data/errors.json</code>)."}</p>`); };
    $("#eq").oninput = run; $("#eq").value = qp.get("q") || ""; run();
  });
  return `<h1>Codici errore</h1><label class="bigsearch">${ic("search")}<input id="eq" type="search" placeholder="Inserisci il codice mostrato sul display" aria-label="Codice errore"></label><div id="eres"></div>`;
};

/* ---------- SUPPORTO ---------- */
routes.supporto = (_, qp) => {
  const draft = { ...store.get("draft", {}), ...(qp.get("model") ? { model: byId(qp.get("model"))?.code || "" } : {}), ...(qp.get("part") ? { part: qp.get("part") } : {}) };
  const f = [["center", "Centro assistenza richiedente", "text"], ["model", "Codice modello", "text"], ["serial", "Numero seriale", "text"], ["error", "Codice errore (se presente)", "text"]];
  const configured = !!DB.config.ticketEndpoint;
  after(() => {
    const read = () => Object.fromEntries($$("#sf [name]").map(e => [e.name, e.value]));
    const summary = () => { const d = read(); return `RICHIESTA SUPPORTO NEVADA (${configured ? "" : "BOZZA, NON INVIATA"})\nCentro: ${d.center}\nModello: ${d.model}\nSeriale: ${d.serial}\nCodice errore: ${d.error}\nMalfunzionamento: ${d.issue}\nVerifiche già eseguite: ${d.checks}\nRicambio richiesto: ${d.part}\nAllegati: ${[...$("#att").files].map(x => x.name).join(", ") || "—"}`; };
    $("#sf").addEventListener("input", () => store.set("draft", read()));
    $("#att").onchange = e => $("#attl").textContent = [...e.target.files].map(x => x.name).join(", ");
    $("#bsave").onclick = () => { store.set("draft", read()); toast("Bozza salvata su questo dispositivo — NON inviata"); };
    $("#bcopy").onclick = () => navigator.clipboard?.writeText(summary()).then(() => toast("Riepilogo copiato"), () => toast("Copia non riuscita"));
    $("#bdl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([summary()], { type: "text/plain" })); a.download = "bozza-richiesta-nevada.txt"; a.click(); };
    $("#bclr").onclick = () => { store.set("draft", {}); $("#sf").reset(); $("#attl").textContent = ""; };
    $("#sf").onsubmit = async e => {
      e.preventDefault(); if (!configured) return;
      const fd = new FormData($("#sf")); [...$("#att").files].forEach(x => fd.append("attachments", x));
      try { const r = await fetch(DB.config.ticketEndpoint, { method: "POST", body: fd, credentials: "include" }); if (!r.ok) throw 0; toast("Richiesta INVIATA a Nevada"); store.set("draft", {}); }
      catch { toast("Invio non riuscito: la richiesta resta bozza"); }
    };
  });
  return `<h1>Supporto Nevada</h1><p class="muted">Usa il modulo quando la documentazione non è sufficiente.</p>
  <div style="margin:14px 0" class="notice ${configured ? "" : "warn"}">${ic("alert", "sm")}<span>${configured ? "Servizio ticket collegato." : `<b>Servizio ticket non configurato.</b> Il modulo salva solo una <b>bozza locale</b>: nessuna richiesta viene inviata. Per garanzia e assistenza il catalogo indica di aprire un Ticket con la procedura sul sito Nevada Europe. <a href="${esc(DB.config.siteUrl)}" target="_blank" rel="noopener"><u>Vai a nevadaeurope.com</u></a>. Per attivare l'invio da qui imposta <code>ticketEndpoint</code> in <code>data/config.json</code>.`}</span></div>
  <form id="sf" class="card pad form"><div class="two">${f.map(([n, l, t]) => `<div><label for="s-${n}">${l}</label><input class="fld" id="s-${n}" name="${n}" type="${t}" value="${esc(draft[n])}" ${n === "model" ? 'list="models"' : ""}></div>`).join("")}</div>
  <datalist id="models">${DB.products.map(p => `<option value="${esc(p.code)}">`).join("")}</datalist>
  <div><label for="s-issue">Descrizione del malfunzionamento</label><textarea class="fld" id="s-issue" name="issue">${esc(draft.issue)}</textarea></div>
  <div><label for="s-checks">Verifiche già eseguite</label><textarea class="fld" id="s-checks" name="checks">${esc(draft.checks)}</textarea></div>
  <div><label for="s-part">Ricambio richiesto (se pertinente)</label><input class="fld" id="s-part" name="part" value="${esc(draft.part)}"></div>
  <div><label for="att">Fotografie e allegati</label><input id="att" type="file" multiple accept="image/*,application/pdf"><div id="attl" class="small muted"></div></div>
  <div class="row"><span class="badge ${configured ? "ok" : "warn"}">Stato: ${configured ? "pronta all'invio" : "bozza — non inviata"}</span></div>
  <div class="row"><button type="submit" class="btn wine" ${configured ? "" : "disabled"} title="${configured ? "" : "Servizio ticket non configurato"}">${ic("send", "sm")} Invia a Nevada</button><button type="button" class="btn" id="bsave">Salva bozza</button><button type="button" class="btn" id="bcopy">${ic("copy", "sm")} Copia riepilogo</button><button type="button" class="btn" id="bdl">${ic("download", "sm")} Scarica .txt</button><button type="button" class="btn" id="bclr">${ic("trash", "sm")} Svuota</button></div></form>
  <section class="sec"><div class="sec-h"><h2>Contatti</h2><a href="#/contatti">Rubrica</a></div></section>`;
};
routes.contatti = () => `<h1>Rubrica contatti</h1><div class="sec">${DB.contacts.length ? `<div class="grid" style="gap:12px">${DB.contacts.map(c => `<div class="card pad"><h3>${esc(c.name)}</h3><p class="muted small">${esc(c.address || "")}</p><div class="row" style="margin-top:10px">${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone.replace(/\s/g, ""))}">${ic("phone", "sm")} ${esc(c.phone)}</a>` : ""}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}${c.web ? `<a class="btn sm" href="${esc(c.web)}" target="_blank" rel="noopener">Sito web</a>` : ""}</div></div>`).join("")}</div>` : empty("phone", "Contatti da fornire")}</div><div class="notice" style="margin-top:14px">${ic("alert", "sm")}<span>Fonte: catalogo 2026-27. Contatti del supporto tecnico dedicato ai centri assistenza: da fornire.</span></div>`;
routes.faq = () => `<h1>FAQ per i tecnici</h1><div class="sec grid">${DB.faq.map(f => `<details class="card pad"><summary><b>${esc(f.q)}</b></summary><p>${esc(f.a)}</p><p class="small muted">Fonte: ${esc(f.src || "")}</p></details>`).join("")}</div><div class="notice" style="margin-top:14px">${ic("alert", "sm")}<span>FAQ tecniche di diagnosi e riparazione: da fornire da Nevada.</span></div>`;

/* ---------- PREFERITI / CRONOLOGIA / NOTE ---------- */
routes.preferiti = () => { const l = favs().map(byId).filter(Boolean); return `<h1>Preferiti</h1><div class="sec">${l.length ? `<div class="grid g-prod">${l.map(pcard).join("")}</div>` : empty("star", "Nessun preferito", `<p class="small">Tocca la stella nella scheda di un modello.</p>`)}</div>`; };
routes.cronologia = () => { const h = store.get("hist", []); return `<h1>Cronologia</h1><div class="sec">${h.length ? `<div class="card list">${h.map(x => `<a class="li" href="#/modello/${esc(x.id.split(":")[0])}"><span class="ico">${ic(x.kind === "doc" ? "file" : "grid")}</span><div class="grow"><b>${esc(x.label)}</b><span class="small muted">${new Date(x.t).toLocaleString("it-IT")}</span></div></a>`).join("")}</div><button class="btn" style="margin-top:12px" onclick="localStorage.removeItem('nv.hist');location.reload()">Cancella cronologia</button>` : empty("clock", "Cronologia vuota")}</div>`; };
routes.note = () => { const n = store.get("notes", {}), ks = Object.keys(n).filter(k => n[k]); return `<h1>Note di intervento</h1><div class="sec">${ks.length ? `<div class="card list">${ks.map(k => `<a class="li" href="#/modello/${k}/nota"><div class="grow"><b>${esc(byId(k)?.code || k)}</b><span class="small muted">${esc(n[k].slice(0, 120))}</span></div>${ic("chev")}</a>`).join("")}</div>` : empty("note", "Nessuna nota", `<p class="small">Aggiungi appunti dalla scheda di un modello (scheda “Note di intervento”).</p>`)}</div>`; };

/* ---------- ASSISTENTE AI / ACCESSO / ADMIN (solo predisposizione) ---------- */
routes["assistente-ai"] = () => `<h1>Assistente AI</h1><div class="sec">${empty("bot", "Funzione in preparazione", `<p class="small" style="max-width:520px;margin:0 auto">Sarà basata <b>solo</b> sulla documentazione tecnica autorizzata, con citazione precisa di documento e pagina, e rifiuterà di rispondere quando la fonte non c'è. Richiede backend con indicizzazione dei PDF (RAG). Non attiva nel prototipo.</p>`)}</div>`;
routes.accesso = () => `<h1>Accesso riservato</h1><div class="notice warn" style="margin:14px 0">${ic("lock", "sm")}<span>L'autenticazione <b>non è implementata</b> nel prototipo: un login solo JavaScript non sarebbe sicuro. Con il backend: SSO/OAuth2 o email + MFA, sessioni con cookie HttpOnly, ruoli Tecnico / Amministratore verificati lato server, PDF serviti con URL firmati a scadenza.</span></div>
  <form class="card pad form" style="max-width:420px" onsubmit="return false"><div><label>Email</label><input class="fld" disabled></div><div><label>Password</label><input class="fld" type="password" disabled></div><button class="btn primary" disabled>Accedi (non disponibile)</button></form>`;
routes.admin = () => `<h1>Amministrazione</h1><div class="notice warn" style="margin:14px 0">${ic("lock", "sm")}<span>Il pannello amministrativo richiede backend e autenticazione lato server. Qui è mostrato lo stato dei dati e la possibilità di esportare il catalogo corrente.</span></div>
  <div class="grid g-short">${[["Prodotti", DB.products.length], ["Documenti", DB.documents.length], ["Esplosi", DB.parts.length], ["Codici errore", DB.errors.length], ["Schede diagnostiche", DB.diagnostics.entries.length], ["Contatti", DB.contacts.length]].map(([l, n]) => `<div class="card pad"><small class="muted">${l}</small><div style="font-size:1.8rem;font-weight:600">${n}</div></div>`).join("")}</div>
  <div class="row" style="margin-top:16px"><a class="btn" download="products.json" href="data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ meta: DB.meta, products: DB.products }, null, 1))}">${ic("download", "sm")} Esporta products.json</a></div>
  <p class="small muted">Funzioni previste: CRUD prodotti, upload PDF con versioni, editor hotspot esplosi, ricambi, codici errore, bollettini, utenti e permessi, log accessi.</p>`;

/* ---------- ricerca globale (header) ---------- */
function initSearch() {
  const gq = $("#gq"), box = $("#sugg"); let items = [], idx = -1;
  const show = () => {
    const q = gq.value.trim(); if (!q) { box.hidden = true; return; }
    items = searchAll(q).slice(0, 12); idx = -1;
    let last = "", html = "";
    if (!items.length) html = `<div class="li"><div class="grow"><b>Nessun risultato per “${esc(q)}”</b><span class="small muted">Se è un numero seriale: la ricerca per seriale richiede un database dedicato (non ancora fornito).</span></div></div>`;
    items.forEach(r => {
      if (r.type !== last) { html += `<div class="grp">${r.type}</div>`; last = r.type; }
      html += `<a href="${r.href}" role="option"><span class="thumb">${r.p ? imgOf(r.p).replace(/<span class="ph">.*?<\/span>/, "") : ic(r.type === "Documenti" ? "file" : r.type === "Ricambi" ? "wrench" : "search")}</span><div><b>${esc(r.title)} ${r.demo || r.p?.demo ? '<span class="badge demo">DEMO</span>' : ""}</b><span>${esc(r.sub)}</span></div></a>`;
    });
    box.innerHTML = html; box.hidden = false; gq.setAttribute("aria-expanded", "true");
  };
  gq.addEventListener("input", show); gq.addEventListener("focus", async () => { if (!DB.products) await load(); show(); });
  gq.addEventListener("input", async () => { if (!DB.products) { await load(); show(); } });
  gq.addEventListener("keydown", e => {
    const a = $$("a", box);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + a.length) % a.length; a.forEach((x, i) => x.setAttribute("aria-selected", i === idx)); a[idx]?.scrollIntoView({ block: "nearest" }); }
    if (e.key === "Enter") { (a[idx] || a[0])?.click(); }
    if (e.key === "Escape") { box.hidden = true; }
  });
  box.addEventListener("click", () => { box.hidden = true; gq.blur(); });
  document.addEventListener("click", e => { if (!e.target.closest(".gsearch")) box.hidden = true; });
}

/* ---------- scansione QR / barcode ---------- */
function initScan() {
  $("#scanBtn").onclick = async () => {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) return toast("Scansione non supportata da questo browser. Digita il codice nella ricerca.");
    let stream, stop = false;
    modal("Scansiona codice", `<div class="pad" style="padding:16px"><video id="cam" playsinline muted></video><p id="scmsg" class="small muted">Inquadra il QR o il codice a barre dell'etichetta.</p></div>`);
    window.__stopCam = () => { stop = true; stream?.getTracks().forEach(t => t.stop()); window.__stopCam = null; };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const v = $("#cam"); v.srcObject = stream; await v.play();
      const det = new BarcodeDetector(); if (!DB.products) await load();
      (async function tick() {
        if (stop) return;
        try { const r = await det.detect(v); for (const c of r) { const q = norm(c.rawValue), p = DB.products.find(p => q.includes(norm(p.code))); if (p) { closeModal(); location.hash = `#/modello/${p.id}`; return; } $("#scmsg").textContent = `Codice letto “${c.rawValue}”: non presente nel database.`; } } catch { }
        setTimeout(tick, 400);
      })();
    } catch { closeModal(); toast("Fotocamera non disponibile o permesso negato"); }
  };
}

/* ---------- avvio ---------- */
function updateNet() { $("#netdot").classList.toggle("off", !navigator.onLine); $("#nettxt").textContent = navigator.onLine ? "Online" : "Offline"; }
window.addEventListener("online", updateNet); window.addEventListener("offline", updateNet); updateNet();
$("#bellBtn").onclick = () => { location.hash = "#/"; setTimeout(() => $("#view").querySelector(".sec:last-child")?.scrollIntoView({ behavior: "smooth" }), 200); };
window.addEventListener("hashchange", route);
initSearch(); initScan(); route();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
