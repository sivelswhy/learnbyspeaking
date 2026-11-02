import Foundation

// Règles de texte, portées de lib/scenes.ts, lib/prompts.ts et lib/placement.ts (même comportement).

let C = Content.shared
let NIKUD = "[\\u0591-\\u05C7]"

/// Texte hébreu sans voyelles ni ponctuation, mots séparés par une espace.
func flat(_ s: String) -> String {
    s.sub(NIKUD, with: "").sub("[^א-ת\\sa-z0-9]", with: " ", .caseInsensitive).sub("\\s+", with: " ").trimmed
}
func isGreeting(_ t: String) -> Bool {
    flat(t).test("^(שלום|הי|היי|הלו|אהלן|בוקר טוב|ערב טוב|צהריים טובים|מה נשמע|מה שלומך)( שלום)?$")
}
func isQuestion(_ raw: String) -> Bool {
    raw.contains("?") || flat(raw).test("^(מה|איפה|למה|מתי|איך|כמה|מי|האם|אפשר|ולך|ואתה|ואת|איזה|איזו)(\\s|$)")
}
func isClarify(_ t: String) -> Bool { flat(t).test(C.regex["clarify"]!) }

private func stripWord(_ w: String) -> String { w.sub(NIKUD, with: "").sub("[^א-ת]", with: "") }
func hebrewWords(_ s: String) -> [String] { s.split(whereSeparator: { $0.isWhitespace }).map { stripWord(String($0)) }.filter { !$0.isEmpty } }
func clamp100(_ v: Double) -> Int { Int(max(0, min(100, v.rounded()))) }

/// Part des mots de la réponse gardés tels quels par la correction, dans l'ordre (plus longue sous-suite commune).
func keptRatio(_ answer: String, _ correction: String) -> Double {
    let x = hebrewWords(answer), y = hebrewWords(correction)
    if x.isEmpty { return 1 }
    var d = Array(repeating: Array(repeating: 0, count: y.count + 1), count: x.count + 1)
    for i in 1...x.count { for j in stride(from: 1, through: y.count, by: 1) {
        d[i][j] = x[i - 1] == y[j - 1] ? d[i - 1][j - 1] + 1 : max(d[i - 1][j], d[i][j - 1])
    } }
    return Double(d[x.count][y.count]) / Double(x.count)
}

/// Deux mots de même famille (lib/placement.ts, related).
private func related(_ a: String, _ b: String) -> Bool {
    let x = a.sub("^[והבלמשכ]{1,2}(?=.{2})", with: ""), y = b.sub("^[והבלמשכ]{1,2}(?=.{2})", with: "")
    let k = { (w: String) in w.sub("[וי]", with: "") }
    let same3 = { (p: String, q: String) in k(p).count >= 3 && k(q).count >= 3 && k(p).prefix(3) == k(q).prefix(3) }
    return a.contains(b) || b.contains(a) || x.contains(y) || y.contains(x)
        || (x.count >= 3 && y.count >= 3 && x.prefix(2) == y.prefix(2)) || same3(a, b) || same3(x, y)
}
func rewordedOnly(_ answer: String, _ correction: String) -> Bool {
    let a = hebrewWords(answer), c = hebrewWords(correction)
    let changed = a.filter { !c.contains($0) }, added = c.filter { !a.contains($0) }
    return !changed.isEmpty && changed.allSatisfy { w in !added.contains { related(w, $0) } }
}

struct AiJudgement { var relevance: Double; var grammar: Double; var correction: String }

/// Avis de l'IA → pertinence et grammaire sur 100, et correction à montrer si elle est fiable.
func readJudgement(_ answer: String, _ ai: AiJudgement) -> (relevance: Int, grammar: Int, correction: String?) {
    let relevance = clamp100((log10(max(ai.relevance, 1e-4)) + 2) / (2 + log10(0.5)) * 100)
    let styleOnly = rewordedOnly(answer, ai.correction) && ai.grammar >= 0.5
    let kept = styleOnly ? 1 : keptRatio(answer, ai.correction)
    let grammar = clamp100((0.3 * ai.grammar + 0.7 * kept - 0.6) / 0.35 * 100)
    let show = kept < 1 && kept >= 0.5 && hebrewWords(ai.correction).count <= hebrewWords(answer).count + 1
    return (relevance, grammar, show ? ai.correction.trimmed : nil)
}

/// Phrases complètes (« … ? », « … . »), la dernière éventuellement sans ponctuation.
func sentences(_ s: String) -> [String] { s.findAll("[^.!?]+[.!?]+|[^.!?]+$") }

/// Réplique nettoyée : sans markdown, en deux phrases au plus, sans phrase coupée.
func tidyReply(_ text: String) -> String {
    let f = text.sub("[*#_`>]", with: "").sub("^\\s*[-•]\\s*", with: "", .anchorsMatchLines)
        .sub("\\s*\\n+\\s*", with: " ").trimmed
    var parts = sentences(f)
    if parts.isEmpty { parts = [f] }
    if parts.count > 1, !(parts.last!.trimmed.test("[.!?]$")) { parts.removeLast() }
    return parts.prefix(2).joined().trimmed
}

/// « את/ה », « אוהב/ת » : garde la forme du genre de l'apprenant (masculin après « אני » : Shuli parle de lui).
func pickGender(_ text: String, _ g: Gender) -> String {
    guard let re = RX.re("(\\S*?)([\\u05d0-\\u05ea]+)/([\\u05d0-\\u05ea]{1,2})(?![\\u05d0-\\u05ea])") else { return text }
    let ns = text as NSString
    var out = ""
    var last = 0
    let finals: [Character: Character] = ["ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"]
    for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
        out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
        let pre = ns.substring(with: m.range(at: 1)), base = ns.substring(with: m.range(at: 2)), suf = ns.substring(with: m.range(at: 3))
        let before = ns.substring(with: NSRange(location: max(0, m.range.location - 6), length: min(6, m.range.location)))
        let gg: Gender = before.test("אני\\s+$") ? .m : g
        if base.hasSuffix("את") && base.count <= 3 && suf == "ה" { out += pre + String(base.dropLast(2)) + (gg == .m ? "אתה" : "את") }
        else if gg == .m { out += pre + base }
        else { let l = base.last!; out += pre + String(base.dropLast()) + String(finals[l] ?? l) + suf }
        last = m.range.location + m.range.length
    }
    out += ns.substring(from: last)
    return out
}

/// Deux phrases partagent plus de 60 % de leurs mots hébreux.
func similar(_ a: String, _ b: String) -> Bool {
    let w = { (t: String) in Set(t.split(separator: " ").map { String($0).sub("[^\\u05d0-\\u05ea]", with: "") }.filter { $0.count > 1 }) }
    let x = w(a), y = w(b)
    if x.count < 3 || y.count < 3 { return false }
    return Double(x.intersection(y).count) / Double(min(x.count, y.count)) > 0.6
}

/// Défauts d'une réplique de Shuli (vide = parfaite).
func replyFlaws(_ text: String, _ g: Gender, said: [String] = [], needQuestion: Bool = true, never: [String] = []) -> [String] {
    let norm = { (t: String) in t.sub("[^\\u05d0-\\u05ea]", with: "") }
    var f: [String] = []
    if text.isEmpty { f.append("vide") }
    if text.test("[a-zA-Z]") { f.append("latin") }
    if text.test(g == .f ? C.rules.mascYou : C.rules.femYou) || text.test(C.rules.noamFem) { f.append("genre") }
    if text.wordCount > 16 { f.append("long") }
    if needQuestion && !text.contains("?") { f.append("sans question") }
    if never.contains(where: { text.test($0) }) { f.append("rôle inversé") }
    if said.contains(where: { norm($0) == norm(text) }) || (said.last.map { similar($0, text) } ?? false) { f.append("répétition") }
    return f
}

// MARK: - Missions des scènes

struct SceneProgress { var done: [String]; var newly: [Mission]; var next: Mission? }

func detects(_ m: Mission, _ t: String, turn: Int, raw: String) -> Bool {
    if m.detect.kind == "first" && turn == 0 && !isGreeting(raw) { return true }
    return t.test(m.detect.re)
}

/// État des missions d'après les messages de l'apprenant (lib/scenes.ts, sceneProgress).
func sceneProgress(_ s: SceneScript, _ userTexts: [String], credited: [[String]?] = []) -> SceneProgress {
    var done: [String] = []
    var newly: [Mission] = []
    var spoken = 0
    for (i, raw) in userTexts.enumerated() {
        let turn = spoken
        if !isGreeting(raw) { spoken += 1 }
        let t = flat(raw)
        let before = Set(done)
        var got: [Mission] = []
        for m in s.missions where !before.contains(m.id) && (m.requires ?? []).allSatisfy(before.contains) {
            if (!t.isEmpty && detects(m, t, turn: turn, raw: raw)) || (i < credited.count && credited[i]?.contains(m.id) == true) {
                done.append(m.id); got.append(m)
            }
        }
        newly = got
    }
    let next = s.missions.first { !done.contains($0.id) && ($0.requires ?? []).allSatisfy(done.contains) }
    return SceneProgress(done: done, newly: newly, next: next)
}

func answersOnlyByAsking(_ m: Mission) -> Bool { m.example.he(.m).contains("?") }
