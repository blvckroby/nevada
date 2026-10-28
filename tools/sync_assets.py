#!/usr/bin/env python3
"""Sincronizza il materiale caricato a mano:
 1) docs/schede/*.pdf  -> data/documents.json (tipo 'scheda'), abbinando il codice letto a pagina 1 al catalogo
 2) assets/img/products/*  -> ridimensiona (max 1000 px) le foto troppo pesanti
Uso: python3 tools/sync_assets.py"""
import os, re, json, glob, subprocess
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
os.chdir(ROOT)
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())

# --- immagini
for f in glob.glob("assets/img/products/*"):
    if os.path.getsize(f) < 350_000 or not f.lower().endswith((".jpg", ".jpeg", ".png")): continue
    im = Image.open(f)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA"); bg = Image.new("RGB", im.size, "white"); bg.paste(im, mask=im.split()[3]); im = bg
    im = im.convert("RGB"); im.thumbnail((1000, 1000))
    out = os.path.splitext(f)[0].lower() + ".jpg"
    im.save(out, "JPEG", quality=86, optimize=True)
    if out != f: os.remove(f)
    print("immagine ottimizzata", out, os.path.getsize(out) // 1024, "KB")

# --- schede
prods = json.load(open("data/products.json"))["products"]
docs = json.load(open("data/documents.json"))
for f in sorted(glob.glob("docs/schede/*.pdf")):
    txt = subprocess.run(["pdftotext", "-f", "1", "-l", "1", "-layout", f, "-"], capture_output=True, text=True).stdout
    toks = {norm(t) for t in re.findall(r"[A-Z0-9][A-Z0-9\.\-]{4,}", txt)}
    hit = [p for p in prods if norm(p["code"]) in toks or any(norm(re.sub(r"\s+(SX|DX)$", "", v)) in toks for v in p.get("variants", []))]
    if not hit: print("NESSUN MODELLO per", f); continue
    for p in hit:
        docs = [d for d in docs if not (d["model"] == p["id"] and d["type"] == "scheda")]
        docs.append(dict(model=p["id"], type="scheda", title="Scheda prodotto (IT-EN-DE-FR)", file=f, pdfPage=None, page=None, revision="Scheda prodotto ufficiale", serial=None, demo=False))
    print("scheda", f, "->", [p["id"] for p in hit])
# rimuove riferimenti a file che non esistono più
docs = [d for d in docs if os.path.exists(d["file"])]
json.dump(docs, open("data/documents.json", "w"), ensure_ascii=False, indent=1)
# tiene solo le pagine di catalogo ancora usate
used = {d["file"] for d in docs}
for f in glob.glob("docs/catalogo/*.pdf"):
    if f not in used: os.remove(f); print("rimossa pagina catalogo inutilizzata", f)
# foto mancanti
for p in prods:
    if p["image"] and not os.path.exists(p["image"]): print("FOTO MANCANTE", p["id"], p["image"])
