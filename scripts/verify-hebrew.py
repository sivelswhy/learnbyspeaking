"""Vérifie avec Whisper l'hébreu pré-généré par BlueTTS et embarque les fichiers retenus dans l'app.
Lit ~/learnbyspeaking-models/bluetts/texts.json et he_wav/<clé>.wav (+ _slow.wav), écrit mac/native/Resources/he/<clé>[_slow].m4a.
Un fichier est retenu si Whisper retrouve le texte (similarité >= 0,85). Les autres sont listés dans bluetts/douteux.json
(à regénérer avec RETRY=… render_hebrew.py : vitesses différentes dans he_wav_alt/<vitesse>/).
Usage : python3 scripts/verify-hebrew.py"""
import difflib, json, os, re, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

B = os.path.expanduser("~/learnbyspeaking-models/bluetts")
M = os.path.expanduser("~/Library/Application Support/LearnBySpeaking/models/ggml-ivrit-large-v3-turbo-q8_0.bin")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mac/native/Resources/he")
texts = json.load(open(B + "/texts.json", encoding="utf-8"))
FIN = str.maketrans("םןךףץ", "מנכפצ")
NUMBERS = {"עשרים", "שלושים", "ארבעים", "חמישים", "שישים", "שבעים", "שמונים", "תשעים", "מאה", "אפס"}
SAME = [{"עם", "אם"}, {"את", "אתה"}]


def clean(t):
    return re.sub(r"[^א-ת]", "", re.sub(r"[֑-ׇ]", "", t)).translate(FIN)


def ok(target, heard_raw):
    a, b = clean(target), clean(heard_raw)
    if a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85:
        return True
    if not b and re.search(r"\d", heard_raw) and a in NUMBERS:
        return True
    return any(a in s and b in s for s in SAME)


def check(job):
    key, slow, text = job
    wav = f"{B}/he_wav/{key}{'_slow' if slow else ''}.wav"
    if not os.path.exists(wav):
        return job, None
    with tempfile.TemporaryDirectory() as d:
        w16 = d + "/w.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", wav, w16], check=True, capture_output=True)
        heard = subprocess.run(["whisper-cli", "-m", M, "-l", "he", "-f", w16, "-nt", "-np"], capture_output=True, text=True).stdout
    return job, (ok(text, heard), heard.strip())


os.makedirs(OUT, exist_ok=True)
jobs = [(k, s, t) for k, t in texts.items() for s in (False, True)
        if not os.path.exists(f"{OUT}/{k}{'_slow' if s else ''}.m4a")]
good, bad = 0, {}
with ThreadPoolExecutor(4) as ex:
    for n, (job, res) in enumerate(ex.map(check, jobs)):
        key, slow, text = job
        if res is None:
            continue
        if res[0]:
            wav = f"{B}/he_wav/{key}{'_slow' if slow else ''}.wav"
            subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", wav, f"{OUT}/{key}{'_slow' if slow else ''}.m4a"], check=True, capture_output=True)
            good += 1
        else:
            bad[key + ("_slow" if slow else "")] = {"texte": text, "entendu": res[1]}
        if n % 100 == 0:
            print(n, "/", len(jobs), flush=True)
json.dump(bad, open(B + "/douteux.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"Retenus : {good}. Douteux : {len(bad)} (voir {B}/douteux.json)")
