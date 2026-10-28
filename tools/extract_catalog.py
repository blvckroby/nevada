#!/usr/bin/env python3
"""Estrae schede prodotto, prezzi e foto dal catalogo/listino Nevada (PDF) -> data/products.json + assets/img/products/.
Uso: python3 tools/extract_catalog.py <catalogo.pdf>"""
import sys, re, json, os, pdfplumber
pdf_path = sys.argv[1]
out_img = os.path.join(os.path.dirname(__file__), "..", "assets", "img", "products")
os.makedirs(out_img, exist_ok=True)

# pagina PDF (1-based) -> (categoria, installazione, gamma)
SECTIONS = [
  (14, 15, "Frigoriferi 4 porte con cantina", "libera", "4 Porte"),
 (17, 32, "Cantine da incasso", "incasso", "Cantine Nevada"), (34, 38, "Cantine sottotop", "sottotop", "Cantine Nevada"),
 (40, 48, "Cantine integrabili", "integrabile", "Cantine Nevada"), 
 (58, 60, "VINUMdesign Big Size", "libera", "VINUMdesign"), (61, 62, "VINUMdesign Countertop", "libera", "VINUMdesign"),
 (65, 66, "VINUMdesign Vintage", "libera", "VINUMdesign"), (68, 71, "VINUMdesign Vinum", "libera", "VINUMdesign"), (72, 72, "Linea promo", "incasso", "Promo"),
]
def section(n):
    for a, b, c, i, g in SECTIONS:
        if a <= n <= b: return c, i, g
    return None, None, None

def price(s):
    m = re.search(r"€\s*([\d\.]+)", s); return int(m.group(1).replace(".", "")) if m else None

def slug(c): return re.sub(r"[^a-z0-9]+", "-", c.lower()).strip("-")

import io
from PIL import Image
def save_img(im, name):
    """Salva l'immagine JPEG incorporata; se ha maschera (cutout) la appiattisce su bianco."""
    try:
        data = im["stream"].get_data(); img = Image.open(io.BytesIO(data)).convert("RGB")
        sm = im["stream"].get("SMask")
        if sm is not None:
            m = Image.open(io.BytesIO(sm.resolve().get_data())).convert("L").resize(img.size)
            bg = Image.new("RGB", img.size, (255, 255, 255)); bg.paste(img, mask=m); img = bg
        img.thumbnail((700, 700)); img.save(os.path.join(out_img, name), "JPEG", quality=88)
        return "assets/img/products/" + name
    except Exception as e:
        print("img err", name, e); return None
def is_dct(im): return "DCT" in str(im["stream"].get("Filter")) and im["srcsize"][0] > 60 and im["srcsize"][1] > 60

pdf = pdfplumber.open(pdf_path)
PENDING = []
products, seen = [], {}
for pn, page in enumerate(pdf.pages, 1):
    cat, inst, gamma = section(pn)
    if not cat: continue
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=2)
    anchors = [w for w in words if w["text"] == "Listino"]
    cap = [w for w in words if w["text"].startswith("Capacit")]
    for a in anchors:
        # prodotto = "Listino" preceduto da una riga "Installazione:" e seguito da una tabella
        if not any(w["text"].startswith("Installazione") and 0 < a["top"] - w["top"] < 40 and abs(w["x0"] - a["x0"]) < 25 for w in words): continue
        below = [w for w in words if 8 < w["top"] - a["top"] < 40 and -20 < w["x0"] - a["x0"] < 30]
        if not below: continue
        tb = [min(below, key=lambda w: (w["top"], w["x0"]))]
        tx = min(w["x0"] for w in below if abs(w["top"] - tb[0]["top"]) < 3)
        right = [c["x0"] for c in words if c["x0"] > tx + 60 and abs(c["top"] - tb[0]["top"]) < 3 and c["text"] == tb[0]["text"]]
        # larghezza colonna: fino alla prossima tabella a destra
        x1 = min(right) - 6 if right else tx + 235
        cluster = {}
        for w in words:
            if tb[0]["top"] - 2 <= w["top"] < tb[0]["top"] + 300 and tx + 60 <= w["x0"] <= tx + 95 and w["x0"] < x1: cluster[round(w["x0"])] = cluster.get(round(w["x0"]), 0) + 1
        vx = max(cluster, key=cluster.get) if cluster else tx + 71
        # intestazione (titolo, codici, installazione): righe sopra il Listino
        head = [w for w in words if a["top"] - 62 < w["top"] < a["top"] - 1 and tx - 10 <= w["x0"] < x1]
        lines = {}
        for w in head: lines.setdefault(round(w["top"] / 3), []).append(w)
        hl = [" ".join(x["text"] for x in sorted(v, key=lambda z: z["x0"])) for k, v in sorted(lines.items())]
        title = next((l for l in hl if re.match(r"(CANTINA|FRIGO|COUNTERTOP|\d+ )", l, re.I)), hl[0] if hl else "")
        inst_line = next((l for l in hl if l.startswith("Installazione")), "")
        codes_lines = [l for l in hl if l != title and not l.startswith("Installazione") and not l.startswith("NEW")]
        codes = [c.strip() for l in codes_lines for c in l.split("|") if re.search(r"\d", c) and re.match(r"^[A-Z0-9][A-Z0-9\-]+(\s+(SX|DX))?$", c.strip())]
        # tabella
        body = [w for w in words if tb[0]["top"] - 2 <= w["top"] < tb[0]["top"] + 330 and tx - 2 <= w["x0"] < x1]
        rows = {}
        for w in body: rows.setdefault(round(w["top"] / 2.2), []).append(w)
        spec, last, lastend = [], None, tb[0]["top"]
        for k, v in sorted(rows.items()):
            v = sorted(v, key=lambda z: z["x0"])
            top = v[0]["top"]
            if top - lastend > 30: break
            lab = " ".join(w["text"] for w in v if w["x0"] < vx - 1); val = " ".join(w["text"] for w in v if w["x0"] >= vx - 1)
            if lab: spec.append([lab, val]); last = spec[-1]
            elif last and val: last[1] += " / " + val
            lastend = top
        # foto: immagine più grande nella colonna sopra il titolo
        cand = [im for im in page.images if is_dct(im) and tx - 30 <= im["x0"] < x1 and im["bottom"] <= a["top"] + 2 and im["top"] > a["top"] - 460 and im["srcsize"][0] > 90 and im["srcsize"][1] > 90]
        PENDING.append((len(products), cand, codes, title, pn, a, tx, x1))
        if not codes:
            above = [l for l in hl if l != title and not l.startswith("Installazione") and not l.startswith("GELA") and not l.startswith("TECA")]
            toks = [t for l in hl for t in l.split() if re.match(r"^[A-Z0-9]{2,}-[A-Z0-9\-]+$", t) and re.search(r"\d", t)]
            nm = toks[0] if toks else (above[-1] if above else title).strip()
            if nm:
                tok = nm.split()[0]; codes = [tok] if re.search(r"\d", tok) and "-" in tok else [nm]
        primary = re.sub(r"\s+(SX|DX)$", "", codes[0]) if codes else None
        pid = slug(primary or title)
        if pid in seen: pid += f"-p{pn}"
        seen[pid] = 1
        txt = " ".join(w["text"] for w in words if abs(w["top"] - a["top"]) < 2 and w["x0"] >= a["x0"] and w["x0"] < x1)
        products.append(dict(id=pid, code=primary, variants=codes, title=title, category=cat, installation=inst, range=gamma,
            installationNote=inst_line.replace("Installazione:", "").strip() or None, listPrice=price(txt), image=None,
            spec=spec, catalogPage=pn, demo=False, verified=True, source="Catalogo/Listino Nevada Vinum 2026-27"))
# --- foto: 1) immagine sopra la scheda; 2) fallback: immagine sopra il codice nelle pagine panoramiche
CODEPOS = {}
for pn, page in enumerate(pdf.pages, 1):
    for w in page.extract_words():
        CODEPOS.setdefault(w["text"], []).append((pn, w))
for idx, cand, codes, title, pn, a, tx, x1 in PENDING:
    p = products[idx]; fn = p["id"] + ".jpg"
    for im in sorted(cand, key=lambda i: -i["srcsize"][0] * i["srcsize"][1]):
        p["image"] = save_img(im, fn)
        if p["image"]: break
    if not p["image"] and p["code"]:
        for ppn, w in CODEPOS.get(p["code"].split()[0], []):
            if ppn == p["catalogPage"]: continue
            c = [im for im in pdf.pages[ppn - 1].images if is_dct(im) and -70 < w["top"] - im["bottom"] < 40 and im["x0"] - 40 < w["x0"] < im["x1"] + 40]
            for im in sorted(c, key=lambda i: -i["srcsize"][0] * i["srcsize"][1]):
                p["image"] = save_img(im, fn)
                if p["image"]: break
            if p["image"]: break
print(len(products), "prodotti,", sum(1 for p in products if p["image"]), "con foto")
json.dump(products, open("/tmp/products_raw.json", "w"), ensure_ascii=False, indent=1)

# ---------- normalizzazione -> data/*.json ----------
ROOT = os.path.join(os.path.dirname(__file__), "..")
ZW = {"singola": 1, "doppia": 2, "tripla": 3, "quadrupla": 4}
def norm_product(p):
    spec = [[k, v] for k, v in p["spec"] if not re.fullmatch(r"\d+", k.strip())]
    d = {k.lower(): v for k, v in spec}
    t = p["title"]
    m = re.search(r"(\d+)\s*BOTTIGLIE", t); bottles = int(m.group(1)) if m else None
    if bottles is None and d.get("capacità ca."): m = re.match(r"(\d+)", d["capacità ca."]); bottles = int(m.group(1)) if m else None
    if bottles is None:
        m = re.search(r"(\d+)\s*bottigli", " ".join(v for _, v in spec), re.I); bottles = int(m.group(1)) if m else None
    inst = p["installation"]; note = (p["installationNote"] or "").lower()
    if note.startswith("libero") and inst in ("incasso", "integrabile"): inst = "libera"
    zones = None
    m = re.search(r"(\d)\s*TEMPERATUR", t)
    if m: zones = int(m.group(1))
    else:
        z = d.get("n° zone temperatura", "").split(" ")[0].lower(); zones = ZW.get(z)
    dims = None; mis = d.get("misure (hxlxp) cm", "")
    m = re.search(r"([\d,\.]+)\s*x\s*([\d,\.]+)\s*x\s*([\d,\.]+)", mis)
    if m: dims = dict(zip("hlp", [float(x.replace(",", ".")) for x in m.groups()]))
    en = d.get("classe energetica", ""); m = re.match(r"([A-G])\b", en)
    noise = re.search(r"(\d+)\s*dB", " ".join(v for _, v in spec))
    ean = d.get("codice ean")
    return dict(id=p["id"], code=p["code"], variants=p["variants"], title=t.title() if t.isupper() else t, series=p["range"], category=p["category"],
        installation=inst, installationNote=p["installationNote"], bottles=bottles, zones=zones, dimensions=dims,
        energyClass=m.group(1) if m else None, noiseDb=int(noise.group(1)) if noise else None, ean=ean, listPrice=p["listPrice"],
        status="attuale", image=p["image"], revisions=[], spec=spec, catalogPage=p["catalogPage"], demo=False, verified=True, source=p["source"])
prods = [norm_product(p) for p in products]
CATS = ["Cantine da incasso", "Cantine sottotop", "Cantine integrabili", "VINUMdesign Big Size", "VINUMdesign Countertop", "VINUMdesign Vintage", "VINUMdesign Vinum",
        "Frigoriferi 4 porte con cantina", "Linea promo"]
json.dump(dict(meta=dict(categories=CATS, installations={"incasso": "Incasso", "sottotop": "Sottotop", "integrabile": "Integrabile", "libera": "Libera installazione", "parete": "A parete"},
    statuses={"attuale": "Attuale", "fuori produzione": "Fuori produzione"}, source="Catalogo/Listino Nevada Vinum 2026-27"), products=prods),
    open(os.path.join(ROOT, "data", "products.json"), "w"), ensure_ascii=False, indent=1)
# una pagina PDF per modello (più leggera e affidabile nel viewer mobile); richiede `pdfseparate` (poppler)
import subprocess
os.makedirs(os.path.join(ROOT, "docs", "catalogo"), exist_ok=True)
for n in sorted({p["catalogPage"] for p in prods}):
    subprocess.run(["pdfseparate", "-f", str(n), "-l", str(n), pdf_path, os.path.join(ROOT, "docs", "catalogo", f"catalogo-2026-27-p{n:02d}.pdf")], check=True)
docs = [dict(model=p["id"], type="scheda", title="Scheda tecnica (catalogo 2026-27)", file=f"docs/catalogo/catalogo-2026-27-p{p['catalogPage']:02d}.pdf", pdfPage=p["catalogPage"], page=None, revision="Catalogo 2026-27", serial=None, demo=False) for p in prods]
json.dump(docs, open(os.path.join(ROOT, "data", "documents.json"), "w"), ensure_ascii=False, indent=1)
print("scritti", len(prods), "prodotti e", len(docs), "documenti")
