#!/usr/bin/env python3
"""Ajoute à public/dict-fr-he.json des sens français venus du dictionnaire papier extrait,
uniquement pour les mots confirmés par le Wiktionnaire (le sens du dictionnaire papier recoupe un sens déjà connu).
Usage : python3 -I merge_dictionary.py <dico2.jsonl> <public/dict-fr-he.json> [--dry]"""
import json, re, sys, unicodedata
src, dst = sys.argv[1], sys.argv[2]
dry = "--dry" in sys.argv
D = json.load(open(dst, encoding="utf8"))
he = D["he"]
def fold(s): return re.sub(r"[^a-z ]", "", unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode())
def toks(s): return {t[:5] for t in fold(s).split() if len(t) > 3}
added = words = 0
for l in open(src, encoding="utf8"):
    r = json.loads(l)
    e = he.get(r["he"])
    if not e or r["alts"]: continue
    known = " ".join(e[5])
    if not (toks(known) & toks(r["fr"])): continue
    new = []
    for part in re.split(r"[,;]", r["fr"]):
        p = re.sub(r"\s+(m|f|mpl|fpl|pl)$", "", part.strip())
        if len(p) < 3 or len(p) > 40 or re.search(r"[\d|/\u0590-\u05FF]", p): continue
        if fold(p) and fold(p) not in fold(known) and p not in e[5]: new.append(p)
    if new:
        e[5].extend(new[:3]); added += len(new[:3]); words += 1
print(words, "mots enrichis,", added, "sens ajoutés")
if not dry:
    json.dump(D, open(dst, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
