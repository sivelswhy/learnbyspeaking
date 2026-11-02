#!/usr/bin/env python3
"""Nettoie entries2.jsonl -> dico2.jsonl/csv (+ dico2_fiable.*). Usage : python3 -I clean_dictionary2.py <dossier>"""
import json, re, sys, csv
from pathlib import Path
d = Path(sys.argv[1])
NOISE = re.compile(r"(?:\s+(?:[A-Za-z]{1,2}|[A-Z]{2,3}\d*|\d+\)?|[^\w\s()'’,;.\-]+))+\s*$")
def fix_fr(s):
    s = s.replace("’", "'")
    s = re.sub(r"\(\s*\d*\s*\)", " ", s)          # renvois « ( 222) » vides
    s = re.sub(r"\(\s*[\d\s|!]+\)", " ", s)
    s = re.sub(r"[|!«»~•]+", " ", s)
    s = re.sub(r"\b([a-zéèêàç]+) w\b", r"\1 m", s)  # « tabouret w » : m mal lu
    s = re.sub(r"(?<=[a-zé])/(?=\s|$)", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    for _ in range(3):
        n = NOISE.sub("", s).strip()
        if n == s: break
        s = n
    s = re.sub(r"\s+([,;.)])", r"\1", s)
    return re.sub(r"\s*/+\s*$", "", s).strip(" ,;/")
out, seen = [], set()
for l in open(d / "entries2.jsonl"):
    e = json.loads(l)
    he = e["he"].strip("־- ")
    fr = fix_fr(e["fr"])
    if len(re.findall(r"[א-ת]", he)) < 2: continue
    if len(fr) < 2 or not re.search(r"[A-Za-zÀ-ÿ]{3}", fr): continue
    k = (he, fr)
    if k in seen: continue
    seen.add(k)
    out.append({"he": he, "alts": [w for w in e["he_words"] if w != e["he"]], "tags": " ".join(e["tags"]), "fr": fr, "page": e["page"]})
def fiable(r):
    fr = r["fr"]
    if len(r["alts"]) > 2: return False
    if re.search(r"[^\w\s(),;.'\-éèêëàâîïôûùüçœÉÀÈ/!?:]", fr): return False
    if len(fr) > 120: return False
    return len(re.findall(r"\b[a-zA-Z]{1,2}\b", fr)) <= 2 + len(fr.split()) // 4
ok = [r for r in out if fiable(r)]
for name, rows in (("dico2", out), ("dico2_fiable", ok)):
    with open(d / f"{name}.jsonl", "w") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(d / f"{name}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["he", "alts", "tags", "fr", "page"])
        for r in rows: w.writerow([r["he"], " ".join(r["alts"]), r["tags"], r["fr"], r["page"]])
print(len(out), "entrées,", len(ok), "fiables")
