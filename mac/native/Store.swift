import Foundation
import SQLite3

// Données de l'apprenant, mêmes formes que lib/types.ts : un fichier JSON par clé dans
// ~/Library/Application Support/LearnBySpeaking/data/ (lbs.profile.json…). Au premier lancement, reprises
// depuis le stockage de l'app web (localStorage de WebKit), pour ne rien perdre.

/// Valeur JSON quelconque : garde intactes les parties que l'app native ne lit pas (corrections, anciens champs).
enum JSONValue: Codable, Hashable {
    case null, bool(Bool), num(Double), str(String), arr([JSONValue]), obj([String: JSONValue])
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .num(n) }
        else if let s = try? c.decode(String.self) { self = .str(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .arr(a) }
        else { self = .obj(try c.decode([String: JSONValue].self)) }
    }
    func encode(to e: Encoder) throws {
        var c = e.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .num(let n): try c.encode(n)
        case .str(let s): try c.encode(s)
        case .arr(let a): try c.encode(a)
        case .obj(let o): try c.encode(o)
        }
    }
}

struct Profile: Codable, Equatable {
    var name: String?
    var native: String = "fr"
    var target: String = "he"
    var level: String = "A1"
    var goal: String = "daily"
    var dailyMinutes: Int = 10
    var gender: Gender?
    var placementDone: Bool?
    var targetLevel: String?
    var focus: [String]?
    var onboarding: String?

    var g: Gender { gender ?? .m }
    static let levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    /// Niveau visé : choisi, sinon le niveau suivant (lib/languages.ts, targetLevelOf).
    var target_: String {
        if let t = targetLevel { return t }
        let i = Profile.levels.firstIndex(of: level) ?? 0
        return Profile.levels[min(i + 1, Profile.levels.count - 1)]
    }
}

struct NewWord: Codable, Hashable { var word: String; var transliteration: String; var meaning: String }

struct SessionReport: Codable, Hashable {
    var score: Int
    var scoreExplanation: String
    var participation: Int
    var vocabulary: Int
    var fluency: Int
    var grammar: Int?
    var relevance: Int?
    var mainErrors: [String]?
    var tips: [String]
    var summary: String
}

struct SessionRecord: Codable, Hashable, Identifiable {
    var id: String
    var date: String
    var scenarioId: String
    var title: String?
    var seconds: Int
    var turns: Int
    var corrections: [JSONValue] = []
    var words: [NewWord] = []
    var report: SessionReport?
}

struct VocabCard: Codable, Hashable {
    var word: String
    var transliteration: String
    var meaning: String
    var added: String
    var box: Int
    var due: String
    var ease: Double?
    var ivl: Double?
    var reps: Int?
    var lapses: Int?
}

struct DayProgress: Codable, Hashable { var speaking: String?; var scenario: String?; var fluency: Double? }

struct PlacementAnswer: Codable, Hashable { var question: String; var answer: String; var score: Int; var fluency: Int?; var wpm: Int? }
struct PlacementResult: Codable, Hashable {
    var date: String
    var level: String
    var axes: [String: Double?]
    var ai: Bool?
    var answers: [PlacementAnswer]
    var theta: Double?
    var confidence: Int?
    var voice: [String: Double?]?
    /// Niveau estimé par le test, quand l'apprenant a choisi de partir plus bas (`level` = son choix).
    var estimatedLevel: String?
}

let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
func nowISO() -> String { iso.string(from: Date()) }
func parseISO(_ s: String) -> Date? { iso.date(from: s) ?? ISO8601DateFormatter().date(from: s) }

final class Store: ObservableObject {
    @Published var profile: Profile? { didSet { save("lbs.profile", profile) } }
    @Published var sessions: [SessionRecord] = [] { didSet { save("lbs.sessions", sessions) } }
    @Published var vocab: [VocabCard] = [] { didSet { save("lbs.vocab", vocab) } }
    @Published var course: [String: DayProgress] = [:] { didSet { save("lbs.course", course) } }
    @Published var placement: PlacementResult? { didSet { save("lbs.placement", placement) } }

    private let dir = supportDir.appendingPathComponent("data")
    private var loading = true

    init() {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: dir.appendingPathComponent("lbs.profile.json").path) { migrateFromWebKit() }
        profile = load("lbs.profile")
        sessions = load("lbs.sessions") ?? []
        vocab = load("lbs.vocab") ?? []
        course = load("lbs.course") ?? [:]
        placement = load("lbs.placement")
        loading = false
    }

    private func url(_ key: String) -> URL { dir.appendingPathComponent("\(key).json") }

    private func load<T: Decodable>(_ key: String) -> T? {
        guard let d = try? Data(contentsOf: url(key)) else { return nil }
        do { return try JSONDecoder().decode(T.self, from: d) } catch {
            NSLog("Donnée illisible \(key) : \(error)")
            return nil
        }
    }

    private func save<T: Encodable>(_ key: String, _ v: T?) {
        guard !loading else { return }
        if let v, let d = try? JSONEncoder().encode(v) { try? d.write(to: url(key), options: .atomic) }
        else { try? FileManager.default.removeItem(at: url(key)) }
    }

    /// Réécrit tout sur le disque (avant une fermeture voulue, comme l'installation d'une mise à jour).
    func flush() {
        save("lbs.profile", profile); save("lbs.sessions", sessions); save("lbs.vocab", vocab)
        save("lbs.course", course); save("lbs.placement", placement)
    }

    // MARK: Actions (mêmes règles que lib/store.ts)

    func addSession(_ s: SessionRecord) { sessions.append(s) }

    func addWords(_ words: [NewWord]) {
        for w in words where !w.word.isEmpty && !vocab.contains(where: { $0.word == w.word }) {
            let now = nowISO()
            vocab.append(VocabCard(word: w.word, transliteration: w.transliteration, meaning: w.meaning, added: now, box: 0, due: now))
        }
    }

    func completeActivity(_ dayId: String, _ activity: String, fluency: Double? = nil) {
        var d = course[dayId] ?? DayProgress()
        if activity == "speaking" { d.speaking = nowISO() } else { d.scenario = nowISO() }
        if let fluency { d.fluency = fluency }
        course[dayId] = d
    }

    func reset() {
        profile = nil; sessions = []; vocab = []; course = [:]; placement = nil
    }

    // MARK: Reprise des données de l'app web

    /// Lit le localStorage de WebKit (SQLite, valeurs en UTF-16) de l'app web (app.parle.mac) et copie les clés lbs.*.
    private func migrateFromWebKit() {
        let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/WebKit/app.parle.mac/WebsiteData")
        guard let en = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return }
        for case let f as URL in en where f.lastPathComponent == "localstorage.sqlite3" {
            var db: OpaquePointer?
            guard sqlite3_open_v2(f.path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { continue }
            defer { sqlite3_close(db) }
            var st: OpaquePointer?
            guard sqlite3_prepare_v2(db, "SELECT key, value FROM ItemTable WHERE key LIKE 'lbs.%'", -1, &st, nil) == SQLITE_OK else { continue }
            defer { sqlite3_finalize(st) }
            while sqlite3_step(st) == SQLITE_ROW {
                guard let k = sqlite3_column_text(st, 0), let blob = sqlite3_column_blob(st, 1) else { continue }
                let key = String(cString: k)
                let n = Int(sqlite3_column_bytes(st, 1))
                guard ["lbs.profile", "lbs.sessions", "lbs.vocab", "lbs.course", "lbs.placement"].contains(key),
                      let text = String(data: Data(bytes: blob, count: n), encoding: .utf16LittleEndian) else { continue }
                try? Data(text.utf8).write(to: url(key), options: .atomic)
            }
            NSLog("Données reprises de l'app web : \(f.path)")
            return
        }
    }
}
