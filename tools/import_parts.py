#!/usr/bin/env python3
"""Importa un 'SPARE PARTS LIST' Nevada (PDF) in data/parts.json: disegno esploso (immagine nell'ultima pagina, ruotata) + tabella ricambi.
Uso: python3 tools/import_parts.py <pdf> <id-esploso> "<titolo>" <id-modello>[,<id-modello>...] [--rev v03]
I numeri di riferimento sono assegnati solo se leggibili senza ambiguità; il PDF originale resta la fonte."""
import sys, re, os, json, io, subprocess, tempfile, pdfplumber
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), "..")
pdf_path, xid, title, models = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(",")
rev = sys.argv[sys.argv.index("--rev") + 1] if "--rev" in sys.argv else None

pdf = pdfplumber.open(pdf_path)
first = pdf.pages[0].extract_text()
names = re.search(r"Product name:(.*?)Date:\s*([\d/]+)", first, re.S)
product_names = [n for n in re.split(r"\s+", names.group(1).strip()) if n]
date = names.group(2)

rows = []  # (top, ref_word, code, desc, qty)
for page in pdf.pages:
    words = page.extract_words(x_tolerance=2)
    hdr = {w["text"]: w for w in words if w["text"] in ("No", "Code", "Description", "Q.ty")}
    if len(hdr) < 4: continue
    x_code, x_desc, x_qty = hdr["Code"]["x0"] - 3, hdr["Description"]["x0"] - 3, hdr["Q.ty"]["x0"] - 12
    y0 = hdr["No"]["bottom"]
    body = [w for w in words if w["top"] > y0 and not w["text"] == "Page" and w["top"] < page.height - 60]
    nos = [w for w in body if w["x1"] < x_code and re.fullmatch(r"\d+", w["text"])]
    lines = {}
    for w in body:
        if w["x0"] >= x_code: lines.setdefault(round(w["top"] / 4), []).append(w)
    page_rows = []
    for k, ws in sorted(lines.items()):
        ws.sort(key=lambda z: z["x0"])
        code = " ".join(w["text"] for w in ws if x_code <= w["x0"] < x_desc)
        desc = " ".join(w["text"] for w in ws if x_desc <= w["x0"] < x_qty)
        qty = " ".join(w["text"] for w in ws if w["x0"] >= x_qty)
        top = ws[0]["top"]
        if page_rows and not re.fullmatch(r"\d+", qty or "x") and not code:      # continuazione descrizione
            page_rows[-1]["desc"] += " " + desc; continue
        page_rows.append(dict(top=top, code=code, desc=desc, qty=int(qty) if re.fullmatch(r"\d+", qty) else None))
    # riferimento: il numero nella stessa riga; se la cella è unita, la riga più vicina senza riferimento
    for n in nos:
        cand = sorted(page_rows, key=lambda r: abs(r["top"] - n["top"]))
        if cand and abs(cand[0]["top"] - n["top"]) <= 12 and "ref" not in cand[0]: cand[0]["ref"] = int(n["text"])
    rows += page_rows

# codice e descrizione possono essere su righe separate (es. celle verticalmente centrate)
fixed = []
for r in rows:
    if not r["code"] and r["desc"] and fixed and not fixed[-1]["desc"]: fixed[-1]["desc"] = r["desc"]; fixed[-1]["qty"] = fixed[-1]["qty"] or r["qty"]; continue
    if r["code"] and not r["desc"] and not r["qty"] and fixed and False: pass
    fixed.append(r)
rows = [r for r in fixed if r["code"] or r["desc"]]
for i, r in enumerate(rows[1:], 1):     # nome centrato su due righe di codici (es. "Evaporator")
    if r["code"] and not r["desc"] and rows[i - 1]["desc"] and rows[i - 1]["code"].rsplit("-", 1)[0] == r["code"].rsplit("-", 1)[0]: r["desc"] = rows[i - 1]["desc"]
for i, r in enumerate(rows[:-1]):   # codice centrato su due righe ("Fan - bottom" / "Fan - middle")
    n = rows[i + 1]
    if not r["code"] and n["code"] and r["desc"].split(" ")[0] == n["desc"].split(" ")[0]: r["code"] = n["code"]
# propaga il riferimento tra varianti della stessa voce ("Top hinge for A" / "Top hinge for B")
key = lambda d: re.split(r"\s+for\s+", d, maxsplit=1)[0].lower().strip()
for i, r in enumerate(rows):
    if "ref" in r: continue
    if " for " in r["desc"]:
        for j in (i - 1, i + 1, i - 2, i + 2):
            if 0 <= j < len(rows) and "ref" in rows[j] and key(rows[j]["desc"]) == key(r["desc"]): r["ref"] = rows[j]["ref"]; break

norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
catalog = {p["id"]: p["code"] for p in json.load(open(os.path.join(ROOT, "data", "products.json")))["products"]}
def mentions(desc):
    return [m for m in product_names if re.search(r"(?<![A-Z0-9\-])" + re.escape(m) + r"(?![A-Z0-9\-])", desc)]
parts = []
for r in rows:
    m = mentions(r["desc"])
    starts_with_model = any(r["desc"].startswith(x) for x in product_names)
    ref = None if starts_with_model else r.get("ref")      # righe di gruppo (es. "NW24S-SS-H Handle"): numero non attribuibile con certezza
    nm = r["desc"].strip()
    if ref is None and parts and parts[-1]["ref"] and parts[-1]["name"] == nm and not m: ref = parts[-1]["ref"]   # stessa voce su due codici
    group_item = ref is None and not m          # voce senza numero e senza modello: appartiene a un gruppo/variante
    compat = [] if group_item else models if not m else [x for x in models if any(norm(catalog.get(x, "")) == norm(y) for y in m)]
    parts.append(dict(ref=ref, code=r["code"] or None, name=nm, qty=r["qty"],
        note=("Specifico per: " + ", ".join(m)) if m else ("Voce di gruppo o variante: verificare l'applicabilità nell'elenco PDF originale" if group_item else None), compatible=compat))

# disegno: ultima immagine dell'ultima pagina, ruotata in verticale
last = len(pdf.pages)
with tempfile.TemporaryDirectory() as t:
    subprocess.run(["pdfimages", "-j", "-f", str(last), "-l", str(last), pdf_path, os.path.join(t, "im")], check=True)
    f = sorted(os.listdir(t))[-1]
    im = Image.open(os.path.join(t, f)).convert("RGB").rotate(-90, expand=True)
    im.thumbnail((1800, 1800))
    out = f"assets/img/esplosi/{xid}.jpg"; im.save(os.path.join(ROOT, out), "JPEG", quality=88)

path = os.path.join(ROOT, "data", "parts.json")
data = json.load(open(path))
data = [d for d in data if d["id"] != xid]
data.append(dict(id=xid, models=models, title=title, image=out, hotspots=[], parts=parts, productNames=product_names, date=date, revision=rev,
                 source=os.path.relpath(pdf_path, os.path.join(ROOT)) if pdf_path.startswith(ROOT) else pdf_path, demo=False))
json.dump(data, open(path, "w"), ensure_ascii=False, indent=1)
print(xid, len(parts), "ricambi,", sum(1 for p in parts if p["ref"]), "con riferimento")
