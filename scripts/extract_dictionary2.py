#!/usr/bin/env python3
"""Extraction v2 : appariement hébreu/français par position verticale (spans PyMuPDF avec police et taille).
Usage : python3 -I extract_dictionary2.py DICTIONNAIRE.pdf SORTIE/ [--pages 1-50]
Sortie : SORTIE/entries2.jsonl  {page, col, he, he_words, tags, fr, head_size}
Principe : dans chaque colonne, les lignes hébraïques (groupées par hauteur) ouvrent une entrée ;
les lignes françaises prennent l'entrée hébraïque la plus proche au-dessus (tolérance 6 pt)."""
import argparse, json, re, warnings
warnings.filterwarnings("ignore")
import pymupdf

HEBL = re.compile(r"[א-ת]")
LAT = re.compile(r"[A-Za-zÀ-ÿŒœ]")
TAGS = set("נ ז ת ר פי פע פ״י פ״ע פיע פיי נית נים ניות ש שפ תהפ דר צמח צבא עוף חקל רפא דת דית לית תית טית מום לים עת ו ה י ד ג ל ק ן ם ך ף ץ בלי בהש בהשאלה שעמ שמ שת תה״ב תה״פ מ״ר ר״ת ז״ר נ״ר מחשב מוס כימ רפ ספורט דקדוק ארמית או".split())

def heb_tokens(text):
    """Tokens hébreux d'un texte d'OCR : (mot, dans_parenthèses)."""
    out = []
    for t in re.split(r"\s+", text):
        core = re.sub(r"[^א-ת־'\"׳״]", "", t)
        if not HEBL.search(core): continue
        out.append(core)
    return out

def page_entries(page, pno):
    w = page.rect.width
    spans = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"]
                if not t.strip() or s["size"] < 5 or s["bbox"][1] < 28 or s["bbox"][1] > page.rect.height - 25: continue
                spans.append(s)
    res = []
    for col, (lo, hi) in enumerate(((0, w / 2), (w / 2, w + 1))):
        cs = [s for s in spans if lo <= (s["bbox"][0] + s["bbox"][2]) / 2 < hi]
        he_t, fr_t = [], []  # (y, x2, size, font, token)
        for s in cs:
            for t in s["text"].split():
                nh, nl = len(HEBL.findall(t)), len(LAT.findall(t))
                rec = (s["bbox"][1], s["bbox"][2], s["size"], s["font"], t)
                if nh and not nl: he_t.append(rec)
                elif nl and not nh: fr_t.append(rec)
                elif nh and nl: (he_t if nh >= nl else fr_t).append(rec)
        he_t.sort(key=lambda r: (r[0], -r[1]))
        clusters = []
        for r in he_t:
            if clusters and r[0] - clusters[-1]["y0"] <= 5.5: clusters[-1]["toks"].append(r)
            else: clusters.append({"y0": r[0], "toks": [r], "fr": []})
        pre = []
        for r in sorted(fr_t, key=lambda r: (r[0], -r[1] * 0)):
            tgt = None
            for c in clusters:
                if c["y0"] <= r[0] + 6: tgt = c
                else: break
            (tgt["fr"] if tgt else pre).append(r)
        for c in clusters:
            toks = sorted(c["toks"], key=lambda r: -r[1])
            words, big = [], 0
            for r in toks:
                for t in heb_tokens(r[4]):
                    words.append(t)
                    if r[2] >= 10.4 and "Bold" not in r[3]: big = max(big, r[2])
            heads = [t for t in words if t not in TAGS and len(t) >= 2]
            tags = [t for t in words if t in TAGS]
            fr = " ".join(r[4] for r in c["fr"])
            fr = re.sub(r"\s+", " ", fr).strip(" /,;")
            res.append({"page": pno, "col": col, "he": heads[0] if heads else "", "he_words": heads, "tags": tags, "fr": fr, "head_size": round(big, 1)})
        res.append({"_pre": " ".join(r[4] for r in pre), "page": pno, "col": col})
    return res

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("pdf"); ap.add_argument("out"); ap.add_argument("--pages")
    a = ap.parse_args()
    import pathlib; o = pathlib.Path(a.out); o.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(a.pdf)
    lo, hi = (1, len(doc))
    if a.pages: lo, hi = map(int, a.pages.split("-"))
    allr = []
    for p in range(lo, hi + 1):
        for r in page_entries(doc[p - 1], p):
            if "_pre" in r:
                if r["_pre"] and allr: allr[-1]["fr"] = (allr[-1]["fr"] + " " + re.sub(r"\s+", " ", r["_pre"])).strip(" /,;")
            else: allr.append(r)
    with open(o / "entries2.jsonl", "w") as f:
        for r in allr: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(len(allr), "entrées")
