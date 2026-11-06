"""Corrige les verbes du dictionnaire : le Wiktionnaire donne souvent la racine au passé (כתב) ou un participe (אוכל)
au lieu de l'infinitif. Les infinitifs vérifiés passent en tête ; les sens faux (naissance → ברא) sont retirés.
Usage : python3 -I scripts/fix_verbs.py public/dict-fr-he.json"""
import json, sys

V = "verbe"
INF = {  # mot français -> [(hébreu, nikud, transcription)]
    "manger": [("לאכול", "לֶאֱכֹל", "le'ekhol")], "dormir": [("לישון", "לִישֹׁן", "lishon")],
    "écrire": [("לכתוב", "לִכְתֹּב", "likhtov")], "venir": [("לבוא", "לָבוֹא", "lavo")],
    "voler": [("לעוף", "לָעוּף", "la'uf"), ("לגנוב", "לִגְנֹב", "lignov")], "traduire": [("לתרגם", "לְתַרְגֵּם", "letargem")],
    "chanter": [("לשיר", "לָשִׁיר", "lashir")], "admirer": [("להעריץ", "לְהַעֲרִיץ", "leha'aritz")],
    "apercevoir": [("להבחין", "לְהַבְחִין", "lehavkhin")], "cuire": [("לבשל", "לְבַשֵּׁל", "levashel")],
    "danser": [("לרקוד", "לִרְקֹד", "lirkod")], "répondre": [("לענות", "לַעֲנוֹת", "la'anot")],
    "garder": [("לשמור", "לִשְׁמֹר", "lishmor")], "protéger": [("להגן", "לְהָגֵן", "lehagen")],
    "répéter": [("לחזור על", "לַחֲזֹר עַל", "lakhzor al")], "couper": [("לחתוך", "לַחְתֹּךְ", "lakhtokh")],
    "abattre": [("להפיל", "לְהַפִּיל", "lehapil")], "comprendre": [("להבין", "לְהָבִין", "lehavin")],
    "mettre": [("לשים", "לָשִׂים", "lasim")], "trahir": [("לבגוד", "לִבְגֹּד", "livgod")],
    "se souvenir": [("לזכור", "לִזְכֹּר", "lizkor")], "chercher": [("לחפש", "לְחַפֵּשׂ", "lekhapes")],
    "voyager": [("לנסוע", "לִנְסֹעַ", "linso'a")], "se rencontrer": [("להיפגש", "לְהִפָּגֵשׁ", "lehipagesh")],
    "demander": [("לשאול", "לִשְׁאֹל", "lish'ol"), ("לבקש", "לְבַקֵּשׁ", "levakesh")],
    "habiter": [("לגור", "לָגוּר", "lagur")], "demeurer": [("לגור", "לָגוּר", "lagur")],
    "imiter": [("לחקות", "לְחַקּוֹת", "lekhakot")], "copier": [("להעתיק", "לְהַעְתִּיק", "leha'atik")],
    "jouer": [("לשחק", "לְשַׂחֵק", "lesakhek")], "rire": [("לצחוק", "לִצְחֹק", "litskhok")],
    "boire": [("לשתות", "לִשְׁתּוֹת", "lishtot")],
}
# Sens faux venus d'une mauvaise extraction : on les retire, ou on les remplace.
WRONG = {"naissance": "ברא", "miracles": "ברא", "couper": "ברא", "abattre": "ברא", "être gras": "ברא", "comprendre": "בן", "fou": "רץ", "manger": "אוכל"}
NOUN = {"fou": ("משוגע", "מְשֻׁגָּע", "meshuga", "m"), "naissance": ("לידה", "לֵדָה", "leda", "f"), "déjeuner": ("ארוחת צהריים", "אֲרוּחַת צָהֳרַיִם", "arukhat tsohorayim", "f")}

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8"))
fr = d["fr"]
for w, bad in WRONG.items():
    if w in fr:
        fr[w] = [e for e in fr[w] if e[0] != bad]
for w, (he, nik, tr, g) in NOUN.items():
    fr[w] = [[he, nik, tr, g, "", "nom"]] + [e for e in fr.get(w, []) if e[0] != he and e[0] != "ארוחתבוקר"]
for w, forms in INF.items():
    keep = [e for e in fr.get(w, []) if e[0] not in {f[0] for f in forms}]
    fr[w] = [[he, nik, tr, "", "", V] for he, nik, tr in forms] + keep
    for he, nik, tr in forms:
        cur = d["he"].get(he)
        if cur:
            if w not in cur[5]: cur[5].append(w)
        else:
            d["he"][he] = [nik, tr, "", "", V, [w]]
fr["fou"][0][5] = "adjectif"
for w in [k for k, v in fr.items() if not v]:
    del fr[w]
json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ok", len(fr))
