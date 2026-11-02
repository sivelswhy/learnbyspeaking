import Foundation

// lib/adaptive.ts (test adaptatif bayésien), lib/placement.ts (scoreAnswer), lib/placementTalk.ts (discussion).

// MARK: Test adaptatif

struct Item { var b: Double; var a: Double }
let LEVEL_B: [String: Double] = ["A1": -2, "A2": -0.7, "B1": 0.6, "B2": 1.9, "C1": 3, "C2": 4]
private let GRID = (0..<81).map { -4 + Double($0) * 0.1 }
let MIN_QUESTIONS = 8, MAX_QUESTIONS = 12
private func sigmoid(_ x: Double) -> Double { 1 / (1 + exp(-x)) }

struct Estimate { var theta: Double; var sd: Double; var post: [Double] }

private func normalize(_ p: [Double]) -> [Double] { let s = p.reduce(0, +); return p.map { $0 / (s == 0 ? 1 : s) } }
private func summarize(_ post: [Double]) -> Estimate {
    let theta = zip(post, GRID).reduce(0) { $0 + $1.0 * $1.1 }
    let sd = sqrt(zip(post, GRID).reduce(0) { $0 + $1.0 * pow($1.1 - theta, 2) })
    return Estimate(theta: theta, sd: sd, post: post)
}
func prior() -> Estimate { summarize(normalize(GRID.map { exp(-0.5 * pow(($0 + 0.7) / 1.5, 2)) })) }
func update(_ e: Estimate, _ item: Item, _ s: Double) -> Estimate {
    let sc = max(0, min(1, s))
    return summarize(normalize(zip(e.post, GRID).map { p, t in p * exp(-pow(sc - sigmoid(item.a * (t - item.b)), 2) / (2 * 0.04)) }))
}
func estimateFrom(_ answers: [(item: Item, s: Double)]) -> Estimate { answers.reduce(prior()) { update($0, $1.item, $1.s) } }
private func information(_ item: Item, _ theta: Double) -> Double { let P = sigmoid(item.a * (theta - item.b)); return pow(item.a * P * (1 - P), 2) }
func pickNext(_ e: Estimate, _ pool: [Item], seed: Int = 0) -> Int {
    var best = -1, bestScore = -Double.infinity
    for (i, it) in pool.enumerated() {
        let noise = 0.04 * abs(sin(Double(i + 1) * 12.9898 + Double(seed) * 78.233))
        let sc = information(it, e.theta) * (1 + noise)
        if sc > bestScore { bestScore = sc; best = i }
    }
    return best
}
func levelOf(_ theta: Double) -> String {
    for (lv, cut) in [("A1", -1.35), ("A2", -0.05), ("B1", 1.25)] where theta < cut { return lv }
    return "B2"
}
func levelProb(_ e: Estimate) -> Double { let lv = levelOf(e.theta); return zip(e.post, GRID).reduce(0) { $0 + (levelOf($1.1) == lv ? $1.0 : 0) } }
func shouldStop(_ e: Estimate, _ asked: Int) -> Bool { asked >= MAX_QUESTIONS || (asked >= MIN_QUESTIONS && levelProb(e) >= 0.9) }
func confidence(_ e: Estimate) -> Int { Int((levelProb(e) * 100).rounded()) }
func itemOf(_ q: PlacementQuestion) -> Item { Item(b: LEVEL_B[q.level] ?? 0, a: 1.2) }

// MARK: Notation d'une réponse

struct AnswerScore: Hashable {
    var score: Int; var fluency: Int?; var fluencyHint: String?; var ai: Bool
    var relevance: Int; var grammar: Int?; var development: Int; var vocabulary: Int; var words: Int; var correction: String?
}
private let TARGET_WORDS: [String: Double] = ["A1": 2, "A2": 4, "B1": 7, "B2": 9, "C1": 12, "C2": 14]

func hasKeyword(_ q: PlacementQuestion, _ answer: String) -> Bool {
    let unprefix = { (w: String) in w.sub("^(ו|ש)?(ה|ב|ל|מ|כ)?", with: "") }
    return hebrewWords(answer).contains { w in
        q.keywords.contains { k in w == k || unprefix(w) == k || (k.count >= 3 && w.contains(k)) } || (q.pattern.map { w.test($0) } ?? false)
    }
}

/// Score 0-100. Avec l'IA : 35 % pertinence, 45 % grammaire, 10 % développement, 10 % variété ; voix : 10 % fluidité.
/// « Je ne sais pas » : honnête, mais ne montre rien du niveau (le modèle la juge pourtant pertinente).
func dontKnow(_ answer: String) -> Bool {
    let w = hebrewWords(answer)
    return w.count <= 5 && w.joined(separator: " ").test(C.rules.dontKnow)
}

func scoreAnswer(_ q: PlacementQuestion, _ answer: String, _ ai: AiJudgement?, _ speech: SpeechMetrics?) -> AnswerScore {
    let words = hebrewWords(answer)
    if dontKnow(answer) { return AnswerScore(score: 10, fluency: nil, fluencyHint: nil, ai: ai != nil, relevance: 0, grammar: ai != nil ? 0 : nil, development: 0, vocabulary: 0, words: words.count) }
    if words.isEmpty { return AnswerScore(score: 0, fluency: nil, fluencyHint: nil, ai: ai != nil, relevance: 0, grammar: ai != nil ? 0 : nil, development: 0, vocabulary: 0, words: 0) }
    let target = TARGET_WORDS[q.level] ?? 4
    let development = clamp100(Double(words.count) / target * 100)
    let vocabulary = clamp100(Double(Set(words).count) / (target * 0.8) * 100)
    let hit = hasKeyword(q, answer)
    let flu = fluencyScore(speech, words: words.count, level: q.level)
    guard let ai else {
        let raw = Double(development) * 0.35 + Double(vocabulary) * 0.25
        let score = hit ? Int((raw + 40).rounded()) : min(30, Int((raw / 2).rounded()))
        return AnswerScore(score: score, fluency: flu?.score, fluencyHint: flu?.hint, ai: false, relevance: hit ? 100 : 0, grammar: nil, development: development, vocabulary: vocabulary, words: words.count)
    }
    let r = readJudgement(answer, ai)
    var score = Int((Double(r.relevance) * 0.35 + Double(r.grammar) * 0.45 + Double(development) * 0.1 + Double(vocabulary) * 0.1).rounded())
    if let f = flu?.score { score = Int((Double(score) * 0.9 + Double(f) * 0.1).rounded()) }
    if r.relevance < 30 { score = min(score, 25) }
    return AnswerScore(score: score, fluency: flu?.score, fluencyHint: flu?.hint, ai: true, relevance: r.relevance, grammar: r.grammar, development: development, vocabulary: vocabulary, words: words.count, correction: r.correction)
}

// MARK: Test mené comme une discussion (lib/placementTalk.ts)

enum TalkKind { case answer, filler, clarify, french, askBack, offTopic }

private let CLARIFY_OTHER = "comprends? pas|compris|r[ée]p[ée]t|pardon|quoi\\s*\\?|sorry|understand|repeat|what\\s*\\?"
private let ABOUT_YOU = "(^|\\s)(ו?אתה|ו?את|לך|שלך|ממך|איתך|אותך)(\\s|$)"

func classify(_ said: String, retries: Int) -> TalkKind {
    let t = said.trimmed
    if t.isEmpty || retries >= 2 { return .answer }
    let f = flat(t)
    if t.test(C.rules.filler) { return .filler }
    if isClarify(t) || t.sub("[.!]", with: "").test("^מה\\s*\\?*$") || t.test(CLARIFY_OTHER, .caseInsensitive) { return .clarify }
    if hebrewWords(t).isEmpty && t.test("[a-zA-ZÀ-ÿ]{2,}") { return .french }
    let before = t.components(separatedBy: CharacterSet(charactersIn: "?,")).first.map { $0.sub("\\s(?:ו?אתה|ו?את)(?=[\\s?.!]|$).*", with: "") } ?? t
    if isQuestion(t) && f.test(ABOUT_YOU) && hebrewWords(before).count < 2 { return .askBack }
    return .answer
}

private func you(_ g: Gender, _ m: String, _ f: String) -> String { g == .f ? f : m }

func fallbackLine(_ kind: TalkKind, _ question: String, _ g: Gender, score: Int? = nil, said: String = "") -> String {
    switch kind {
    case .filler: return "\(you(g, "לא נורא, קח את הזמן.", "לא נורא, קחי את הזמן.")) \(question)"
    case .clarify: return "אין בעיה, אני שואל שוב, לאט: \(question)"
    case .french: return "\(you(g, "נסה בעברית, אפילו מילה אחת זה בסדר!", "נסי בעברית, אפילו מילה אחת זה בסדר!")) \(question)"
    case .offTopic: return "מעניין! אבל שאלתי: \(question)"
    case .askBack: return "שאלה טובה! \(you(g, "קודם אתה:", "קודם את:")) \(question)"
    case .answer:
        if hebrewWords(said).isEmpty || dontKnow(said) { return "לא נורא, נמשיך!" }
        return (score ?? 50) >= 55 ? "יופי, הבנתי!" : "אוקיי, תודה!"
    }
}

private let SHULI = "אתה שולי, ישראלי מתל אביב, נחמד ורגוע. אתה מדבר בעל פה"

private func talkPrompt(_ kind: TalkKind, _ question: String, _ said: String, _ g: Gender, _ level: String) -> String {
    let common = "\(SHULI) עם \(you(g, "תלמיד", "תלמידה")) עברית ברמה \(level). \(you(g, "פנה אליו בלשון זכר (אתה).", "פנה אליה בלשון נקבה (את).")) עברית פשוטה, בלי אנגלית, בלי אימוג'י, בלי רשימות."
    switch kind {
    case .offTopic:
        return "\(common)\nשאלת: \"\(question)\". \(you(g, "הוא ענה", "היא ענתה")): \"\(said)\", וזה לא תשובה לשאלה. תגיב רק למה ש\(you(g, "הוא אמר", "היא אמרה")), בקצרה ובטבעיות: משפט אחד, עד שמונה מילים, בלי שאלה."
    case .askBack:
        return "\(SHULI). מישהו שואל אותך: \"\(question)\". ענה עליך, בגוף ראשון, כמו בן אדם (פרט אישי פשוט ואמיתי). משפט אחד קצר, עד עשר מילים, בלי שאלה, בלי אנגלית."
    default:
        return "\(common)\nשאלת: \"\(question)\". \(you(g, "הוא ענה", "היא ענתה")): \"\(said)\".\nתגיב כמו בן אדם אמיתי למה ש\(you(g, "הוא אמר", "היא אמרה")): תגובה קצרה וחמה, משפט אחד, עד שמונה מילים. בלי שאלה, בלי תיקון, בלי ציון.\(isQuestion(said) ? " אם יש שאלה אליך, ענה עליה בקצרה." : "")\nדוגמאות: \"אני עובד בבנק\" ← \"בבנק? עבודה רצינית!\". \"אני לא אוהב לבשל\" ← \"גם אני לא, אני מזמין אוכל!\"."
    }
}

extension LLM {
    /// Réplique de Shuli pendant le test : par le modèle (vérifiée), sinon la phrase écrite à la main.
    func shuliLine(kind: TalkKind, question: String, said: String, g: Gender, level: String, score: Int? = nil) async -> String {
        let fallback = fallbackLine(kind, question, g, score: score, said: said)
        // Silence, français, « je n'ai pas compris » : la phrase écrite suffit (Gemma changeait le sens en simplifiant).
        if kind == .filler || kind == .french || kind == .clarify || ((hebrewWords(said).isEmpty || dontKnow(said)) && kind == .answer) { return fallback }
        for temperature in [0.6, 0.9] {
            guard let out = try? await complete([Msg(role: "user", content: talkPrompt(kind, question, said, g, level))], temperature: temperature, maxTokens: 70, antiRepeat: true) else { break }
            let line = pickGender(tidyReply(out).sub("^[\"«»“”']+|[\"«»“”']+$", with: ""), g)
            let flaws = replyFlaws(line, g).filter { $0 != "sans question" && $0 != "long" }
            let ok = !line.contains("?") && line.wordCount <= (kind == .askBack ? 12 : kind == .offTopic ? 9 : 14)
            if line.isEmpty || !flaws.isEmpty || !ok { continue }
            if kind == .askBack { return "\(line) \(you(g, "ועכשיו אתה:", "ועכשיו את:")) \(question)" }
            if kind == .offTopic { return "\(line) אבל שאלתי: \(question)" }
            return line
        }
        return fallback
    }
}
