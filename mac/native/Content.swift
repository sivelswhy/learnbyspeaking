import Foundation

// Contenus partagés avec le site (scènes, cours, test de niveau…), exportés depuis le TypeScript par
// scripts/export-native.ts dans Resources/content.json. Les règles (expressions régulières) gardent leur source JS,
// lue par NSRegularExpression (même syntaxe pour ce qu'on utilise : alternatives, classes hébraïques, lookbehind).

enum Gender: String, Codable { case m, f }

/// Texte au genre de l'apprenant : une seule forme, ou {m, f}.
enum G: Codable, Hashable {
    case one(String)
    case two(m: String, f: String)

    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let s = try? c.decode(String.self) { self = .one(s); return }
        let o = try c.decode([String: String].self)
        self = .two(m: o["m"] ?? "", f: o["f"] ?? o["m"] ?? "")
    }
    func encode(to e: Encoder) throws {
        var c = e.singleValueContainer()
        switch self {
        case .one(let s): try c.encode(s)
        case .two(let m, let f): try c.encode(["m": m, "f": f])
        }
    }
    func callAsFunction(_ g: Gender) -> String {
        switch self {
        case .one(let s): return s
        case .two(let m, let f): return g == .f ? f : m
        }
    }
}

struct Line: Codable, Hashable { let he: G; let tr: G; let fr: String }

struct Starter: Codable, Hashable {
    let text: G
    let transliteration: G
    let translation: [String: String]
}

struct Scenario: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let goal: String
    let role: String
    let opening: String
    let difficulty: Int
    let starters: [String: Starter]?
}

struct Topic: Codable, Hashable, Identifiable { let id: String; let label: String; let starter: Starter }

struct HeScene: Codable { let role: String; let goal: String; let asks: String?; let learner: String? }

struct Detect: Codable { let kind: String; let re: String }
struct Mission: Codable, Identifiable {
    let id: String
    let fr: String
    let example: Line
    let requires: [String]?
    let reply: Line
    let detect: Detect
}
struct SceneExtra: Codable { let detect: String; let reply: Line }
struct SceneScript: Codable {
    let facts: String
    let never: [String]
    let fallback: Line
    let missions: [Mission]
    let extras: [SceneExtra]
}

struct PlacementQuestion: Codable, Hashable {
    let level: String
    let text: G
    let transliteration: G
    let translation: [String: String]
    let keywords: [String]
    let pattern: String?
    let sample: Line
    let tip: String
}

struct ListenOption: Codable, Hashable { let fr: String; let ok: Bool? }
struct Blank: Codable, Hashable { let he: G; let tr: G }

/// Étapes d'une journée d'entraînement (voir lib/content/course-he.ts).
enum Step: Codable, Hashable {
    case intro(fr: String)
    case repeatLine(Line)
    case answer(q: Line, a: Line)
    case listen(say: Line, ask: String, options: [ListenOption])
    case fill(line: Line, blank: Blank)
    case free(q: Line, example: Line)
    case swap(instr: String, from: Line, to: Line)
    case other(kind: String)

    private enum K: String, CodingKey { case kind, fr, line, q, a, say, ask, options, blank, example, instr, from, to }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "intro": self = .intro(fr: try c.decode(String.self, forKey: .fr))
        case "repeat": self = .repeatLine(try c.decode(Line.self, forKey: .line))
        case "answer": self = .answer(q: try c.decode(Line.self, forKey: .q), a: try c.decode(Line.self, forKey: .a))
        case "listen": self = .listen(say: try c.decode(Line.self, forKey: .say), ask: try c.decode(String.self, forKey: .ask), options: try c.decode([ListenOption].self, forKey: .options))
        case "fill": self = .fill(line: try c.decode(Line.self, forKey: .line), blank: try c.decode(Blank.self, forKey: .blank))
        case "free": self = .free(q: try c.decode(Line.self, forKey: .q), example: try c.decode(Line.self, forKey: .example))
        case "swap": self = .swap(instr: try c.decode(String.self, forKey: .instr), from: try c.decode(Line.self, forKey: .from), to: try c.decode(Line.self, forKey: .to))
        default: self = .other(kind: kind)
        }
    }
    func encode(to e: Encoder) throws {}

    /// Toutes les phrases de l'étape (recherche « Comment dire… ? », vocabulaire).
    var lines: [Line] {
        switch self {
        case .repeatLine(let l), .fill(let l, _): return [l]
        case .answer(let q, let a): return [q, a]
        case .listen(let s, _, _): return [s]
        case .free(let q, let e): return [q, e]
        case .swap(_, let f, let t): return [f, t]
        default: return []
        }
    }
}

struct DayScenario: Codable, Hashable { let goal: String; let role: String; let starter: Starter }
struct Day: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let key: Line
    let steps: [Step]
    let scenario: DayScenario
}
struct Unit: Codable, Hashable, Identifiable { let id: String; let title: String; let days: [Day] }
struct CourseLevel: Codable, Hashable, Identifiable { let id: String; let title: String; let cefr: String; let units: [Unit] }

struct Word: Codable, Hashable { let he: String; let tr: String; let fr: String; let note: String? }
struct Theme: Codable, Hashable, Identifiable { let id: String; let title: String; let words: [Word] }
struct GrammarPoint: Codable, Hashable, Identifiable { let id: String; let title: String; let rule: String; let examples: [Word] }
struct Letter: Codable, Hashable { let he: String; let final: String?; let name: String; let sound: String; let example: Word }
struct Resources: Codable { let alphabet: [Letter]; let themes: [Theme]; let phrases: [Word]; let grammar: [GrammarPoint] }

struct ContentFile: Codable {
    let regex: [String: String]
    let heLevel: [String: String]
    let heScene: [String: HeScene]
    let scenarios: [Scenario]
    let goals: [String: String]
    let focus: [String: String]
    let scenes: [String: SceneScript]
    let topics: [Topic]
    let placement: [PlacementQuestion]
    let course: [CourseLevel]
    let resources: Resources
    let templates: Templates
    let rules: Rules
}

/// Consignes de Gemma exportées depuis le TypeScript, avec des trous ({{Q}}, {{A}}, {{LEVEL}}…).
struct Templates: Codable {
    let humanSystem: [String: [String: String]]
    let hintClarify: [String: String]
    let hintQuestion: [String: String]
    let relevance: [Msg]
    let grammarCorrect: [Msg]
    let grammarMistake: [Msg]
    let correction: [Msg]
    let translate: [Msg]
    let toHebrew: [String: [Msg]]
    let word: [Msg]
    let example: [Msg]
    let feminine: [Msg]
    let better: [String: [String: [Msg]]]
}

struct Rules: Codable {
    let mascYou: String
    let femYou: String
    let noamFem: String
    let atToMan: String
    let filler: String
    let dontKnow: String
    let mustAnswer: [[String]]
    let fem: [String: String]
    let devWords: [String: Int]
    let goalTip: [String: String]
    let levelSkill: [String: SkillRule]
}
struct SkillRule: Codable { let has: String; let tip: String }

/// Remplit les trous d'une consigne.
func fill(_ s: String, _ v: [String: String]) -> String {
    v.reduce(s) { $0.replacingOccurrences(of: "{{\($1.key)}}", with: $1.value) }
}
func fill(_ m: [Msg], _ v: [String: String]) -> [Msg] { m.map { Msg(role: $0.role, content: fill($0.content, v)) } }

enum Content {
    static let shared: ContentFile = {
        guard let url = Bundle.main.url(forResource: "content", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { fatalError("content.json absent du paquet") }
        do { return try JSONDecoder().decode(ContentFile.self, from: data) } catch { fatalError("content.json illisible : \(error)") }
    }()
    static var allDays: [(level: CourseLevel, unit: Unit, day: Day)] {
        shared.course.flatMap { l in l.units.flatMap { u in u.days.map { (l, u, $0) } } }
    }
}

// MARK: - Expressions régulières (syntaxe JS)

/// Cache des expressions compilées : les règles sont appelées à chaque réplique.
final class RX {
    private static var cache: [String: NSRegularExpression] = [:]
    private static let lock = NSLock()
    static func re(_ src: String, _ opts: NSRegularExpression.Options = []) -> NSRegularExpression? {
        lock.lock(); defer { lock.unlock() }
        let k = "\(opts.rawValue)|\(src)"
        if let r = cache[k] { return r }
        let r = try? NSRegularExpression(pattern: src, options: opts)
        cache[k] = r
        return r
    }
}

extension String {
    func test(_ src: String, _ opts: NSRegularExpression.Options = []) -> Bool {
        guard let r = RX.re(src, opts) else { return false }
        return r.firstMatch(in: self, range: NSRange(startIndex..., in: self)) != nil
    }
    func sub(_ src: String, with tpl: String, _ opts: NSRegularExpression.Options = []) -> String {
        guard let r = RX.re(src, opts) else { return self }
        return r.stringByReplacingMatches(in: self, range: NSRange(startIndex..., in: self), withTemplate: tpl)
    }
    func findAll(_ src: String) -> [String] {
        guard let r = RX.re(src) else { return [] }
        return r.matches(in: self, range: NSRange(startIndex..., in: self)).compactMap { Range($0.range, in: self).map { String(self[$0]) } }
    }
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var wordCount: Int { split(whereSeparator: { $0.isWhitespace }).count }
}
