import SwiftUI

// components/ToolChat.tsx et lib/define.ts : « Comment dire… ? », traduction, dictionnaire.
// Réponses écrites à la main d'abord (ressources, cours), dictionnaire du Wiktionnaire, puis Gemma vérifié.

private let HEBREW = "[\\u0590-\\u05FF]"

/// Dictionnaire Wiktionnaire (CC BY-SA) : fr → [[hébreu, nikud, transcription, genre, pluriel, nature]] ; he → [nikud, transcription, genre, pluriel, nature, [sens]].
final class Dict {
    static let shared = Dict()
    private(set) var fr: [String: [[String]]] = [:]
    private(set) var he: [String: [JSONValue]] = [:]
    private var plain: [String: String] = [:]
    private init() {
        guard let url = Bundle.main.url(forResource: "dict-fr-he", withExtension: "json"), let d = try? Data(contentsOf: url),
              let j = try? JSONDecoder().decode([String: JSONValue].self, from: d) else { return }
        if case .obj(let f)? = j["fr"] {
            fr = f.mapValues { v in if case .arr(let a) = v { return a.map { e in if case .arr(let x) = e { return x.map { if case .str(let s) = $0 { return s }; return "" } }; return [] } }; return [] }
        }
        if case .obj(let h)? = j["he"] { he = h.mapValues { if case .arr(let a) = $0 { return a }; return [] } }
        plain = Dictionary(fr.keys.map { (fold($0), $0) }, uniquingKeysWith: { a, _ in a })
    }
    func fold(_ s: String) -> String {
        s.lowercased().folding(options: .diacriticInsensitive, locale: nil).replacingOccurrences(of: "’", with: "'").sub("[^a-z' -]", with: "").trimmed
    }
    func lookupFrench(_ word: String) -> (key: String, entries: [[String]])? {
        let w = word.trimmed.lowercased()
        let bare = w.sub("^(le |la |les |l'|l’|un |une |des |du |de la |se |s'|s’)", with: "")
        for c in [w, bare, bare.sub("s$", with: ""), bare.sub("x$", with: "")] {
            let k = fr[c] != nil ? c : plain[fold(c)]
            if let k, let e = fr[k], !e.isEmpty { return (k, e) }
        }
        return nil
    }
    func lookupHebrew(_ word: String) -> (nikud: String, tr: String, gender: String, plural: String, pos: String, senses: [String])? {
        let w = word.sub(NIKUD, with: "").sub("[^א-ת ]", with: "").trimmed
        guard let e = he[w] ?? (w.hasPrefix("ה") ? he[String(w.dropFirst())] : nil), e.count >= 6 else { return nil }
        func s(_ v: JSONValue) -> String { if case .str(let x) = v { return x }; return "" }
        var senses: [String] = []
        if case .arr(let a) = e[5] { senses = a.map(s) }
        return (s(e[0]), s(e[1]), s(e[2]), s(e[3]), s(e[4]), senses)
    }
}

func grammarLine(_ pos: String, _ gender: String, _ plural: String) -> String {
    if pos == "nom propre" { return "" }
    var head = pos.isEmpty ? "" : pos.prefix(1).uppercased() + pos.dropFirst()
    if let g = ["m": "masculin", "f": "féminin"][gender] { head = [head, g].filter { !$0.isEmpty }.joined(separator: " ") }
    return [head, plural.isEmpty ? "" : "pluriel : \(plural)"].filter { !$0.isEmpty }.joined(separator: " · ")
}

private func stripKey(_ w: String) -> String {
    w.lowercased().folding(options: .diacriticInsensitive, locale: nil).sub(NIKUD, with: "").sub("[^\\p{L}\\s']", with: "").trimmed
}

/// Cherche dans les ressources et le cours (hébreu, translittération ou sens).
private func lookupKnown(_ q: String, _ g: Gender) -> Word? {
    let k = stripKey(q)
    if k.isEmpty { return nil }
    let lines: [Line] = Content.allDays.flatMap { d in [d.day.key] + d.day.steps.flatMap { s -> [Line] in
        switch s { case .repeatLine(let l): return [l]; case .answer(let q, let a): return [q, a]; default: return [] } } }
    let r = C.resources
    let all: [Word] = r.themes.flatMap(\.words) + r.phrases + r.grammar.flatMap(\.examples) + r.alphabet.map(\.example)
        + lines.map { Word(he: $0.he(g), tr: $0.tr(g), fr: $0.fr, note: nil) }
    return all.first { stripKey($0.he) == k || stripKey($0.tr) == k || $0.fr.split(whereSeparator: { ",;".contains($0) }).contains { stripKey(String($0)) == k } }
}

func wordOf(_ q: String) -> String {
    q.sub("^\\s*(que veut dire|ça veut dire quoi|c'est quoi|définition de|définis|définir|traduis|traduire|le mot)\\s*", with: "", .caseInsensitive).sub("[«»\"“”?!.:]", with: "").trimmed
}
private func plainFr(_ s: String) -> String {
    s.lowercased().folding(options: .diacriticInsensitive, locale: nil).sub("[^a-z\\s'-]", with: " ").sub("\\b(l'|d'|le|la|les|un|une|des|du|de)\\s*", with: "").sub("\\s+", with: " ").trimmed
}
private func mentions(_ text: String, _ word: String) -> Bool {
    let w = plainFr(word)
    if w.isEmpty { return false }
    let stem = w.count > 5 ? String(w.prefix(max(5, w.count - 2))) : w
    return plainFr(text).split(separator: " ").map(String.init).contains { $0 == w || $0.hasPrefix(stem) || ($0.count >= 4 && w.hasPrefix($0)) }
}
private func candidates(_ raw: String) -> [String] {
    raw.sub("\\([^)]*\\)", with: "").components(separatedBy: CharacterSet(charactersIn: ",/;")).map { $0.sub("[^א-ת\\s'\"״׳-]", with: "").sub("\\s+", with: " ").trimmed }.filter { $0.test(HEBREW) }
}
private func containsWord(_ sentence: String, _ he: String) -> Bool {
    let tokens = sentence.sub("[^\\u05d0-\\u05ea\\s]", with: " ").split(separator: " ").map(String.init)
    let words = he.sub("[^\\u05d0-\\u05ea\\s]", with: " ").split(separator: " ").map(String.init)
    if words.isEmpty { return false }
    let stem = { (w: String) in w.count > 3 ? w.sub("[הםןת]$", with: "") : w }
    func match(_ t: String, _ w: String) -> Bool {
        for k in 0...min(2, t.count - 1) {
            if k > 0 && !String(t.prefix(k)).test("^[והבלמשכ]+$") { break }
            if t.dropFirst(k).hasPrefix(stem(w)) { return true }
        }
        return false
    }
    return tokens.indices.contains { i in words.enumerated().allSatisfy { j, w in i + j < tokens.count && match(tokens[i + j], w) } }
}

extension LLM {
    /// Vers l'hébreu, au genre de l'apprenant (lib/sayInHebrew.ts).
    func toHebrew(_ text: String, g: Gender) async -> String {
        if Translator.shared.available(native(), toHebrew: true),
           let t = await Translator.shared.translate(text, native: native(), toHebrew: true), !t.isEmpty {
            return g == .f ? await feminize(t) : t
        }
        let he = ((try? await complete(fill(T.toHebrew[g.rawValue]!, ["T": text]), temperature: 0.1, maxTokens: 120)) ?? "").components(separatedBy: "\n").first?.trimmed ?? ""
        return g == .f ? await feminize(he) : he
    }

    /// « Définir un mot » : dictionnaire, sinon Gemma vérifié par retraduction ; exemple qui contient le mot.
    func defineWord(_ input: String, g: Gender) async -> String {
        let word = wordOf(input)
        let dict = Dict.shared
        var he = word, nikud: String?, tr: String?, meaning = "", grammar: String?, others: [String] = [], doubt: String?, fromDict = false
        func fillHe(_ w: String) {
            guard let info = dict.lookupHebrew(w) else { return }
            nikud = info.nikud.isEmpty ? nil : info.nikud; tr = info.tr.isEmpty ? nil : info.tr
            let gl = grammarLine(info.pos, info.gender, info.plural); grammar = gl.isEmpty ? nil : gl; fromDict = true
        }
        if word.test(HEBREW) {
            let senses = Array(Set((dict.lookupHebrew(word)?.senses ?? []).map { $0.prefix(1).lowercased() + $0.dropFirst() })).sorted { $0.count < $1.count }
            meaning = senses.prefix(3).joined(separator: " ; ")
            if meaning.isEmpty { meaning = await translate(word) ?? "" }
            fillHe(word)
        } else {
            let found = dict.lookupFrench(word)
            meaning = found?.key ?? word
            if let first = found?.entries.first, first.count >= 6 {
                he = first[0]; nikud = first[1].isEmpty ? nil : first[1]; tr = first[2].isEmpty ? nil : first[2]
                let gl = grammarLine(first[5], first[3], first[4]); grammar = gl.isEmpty ? nil : gl
                others = found!.entries.dropFirst().map { $0.first ?? "" }; fromDict = true
            } else {
                let cands = candidates(((try? await complete(fill(T.word, ["W": word]), temperature: 0, maxTokens: 16)) ?? "").components(separatedBy: "\n").first ?? "")
                he = cands.first ?? word
                var backs: [String] = []
                for c in cands {
                    let back = await translate(c) ?? ""
                    if mentions(back, word) { he = c; backs = []; break }
                    backs.append(back)
                }
                doubt = backs.first
                fillHe(he)
            }
        }
        var example: (String, String)?
        let frWord = word.test(HEBREW) ? "" : meaning
        for temperature in [0.0, 0.7] {
            let s = ((try? await complete(fill(T.example, ["W": he]), temperature: temperature, maxTokens: 30)) ?? "").components(separatedBy: "\n").first?.trimmed ?? ""
            guard s.test(HEBREW), containsWord(s, he) else { continue }
            let t = await translate(s) ?? ""
            if !frWord.isEmpty && !mentions(t, frWord) { continue }
            example = (s, t); break
        }
        if doubt != nil, let ex = example, mentions(ex.1, word) { doubt = nil }
        var lines = [nikud ?? he]
        if let tr { lines.append("(\(tr))") }
        lines.append("Sens : \(meaning)")
        if let grammar { lines.append(grammar) }
        if !others.isEmpty { lines.append("Aussi :"); lines += others }
        if let ex = example { lines += ["Exemple :", ex.0, ex.1] }
        if let doubt { lines.append("⚠ Le traducteur relit ce mot comme « \(doubt) » : vérifie-le dans un dictionnaire.") }
        if fromDict { lines.append("(Source : Wiktionnaire, licence CC BY-SA)") }
        return lines.joined(separator: "\n")
    }
}

struct ToolChatView: View {
    let mode: ModeId
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @State private var msgs: [Msg] = []
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    private var info: (title: String, hello: String, placeholder: String) {
        switch mode {
        case .teacher: return ("Comment dire… ?", "Écris une phrase en français : je te dis comment la dire en hébreu. Les phrases du cours ont leur prononciation, vérifiée.", "Ex. : j'ai faim")
        case .translate: return ("Traduction intelligente", "Écris une phrase en français ou en hébreu : je la traduis, avec la prononciation et des variantes.", "Ex. : On se voit demain ?")
        default: return ("Définir un mot", "Donne-moi un mot en français ou en hébreu : je te donne le mot dans l'autre langue et un exemple. Les mots des ressources ont leur prononciation, vérifiée.", "Ex. : hôpital ou שלום")
        }
    }

    var body: some View {
        if app.ai != .ready { SetupScreen(title: "Préparer le tuteur") } else { content }
    }

    private var content: some View {
        VStack(spacing: 0) {
            Column { Header(title: info.title, onBack: nav.home) }
            ScrollViewReader { proxy in
                ScrollView {
                    Column {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Réponses d'une petite IA qui tourne sur ton appareil : elles peuvent contenir des erreurs. Vérifie dans Cours › Ressources.")
                                .font(.app(12)).foregroundStyle(Palette.muted).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                .background(Palette.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                            HStack(alignment: .top, spacing: 8) {
                                Avatar(size: 36)
                                Text(info.hello).padding(.horizontal, 16).padding(.vertical, 12).background(Palette.card, in: UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 16, bottomTrailingRadius: 16, topTrailingRadius: 16))
                                    .overlay(UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 16, bottomTrailingRadius: 16, topTrailingRadius: 16).stroke(Palette.line))
                            }
                            ForEach(Array(msgs.enumerated()), id: \.offset) { _, m in ToolBubble(m: m) }
                            if busy { HStack(spacing: 8) { Avatar(mood: .think, size: 32); Text("Shuli réfléchit…").font(.app(14)).foregroundStyle(Palette.muted) } }
                            if let error {
                                HStack(spacing: 12) { Avatar(mood: .sad, size: 40); Text(error) }.font(.app(14)).foregroundStyle(Palette.warn)
                                    .padding(12).background(Palette.warn.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }.padding(.horizontal, 16).padding(.vertical, 12)
                    }
                }.onChange(of: msgs.count) { _ in withAnimation { proxy.scrollTo("bottom") } }
            }
            Divider().overlay(Palette.line)
            Column {
                HStack(spacing: 8) {
                    TextField(info.placeholder, text: $text).textFieldStyle(.plain).padding(.horizontal, 12).frame(minHeight: 44)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                        .onSubmit(send)
                    Button(action: send) { Image(systemName: "paperplane.fill") }.buttonStyle(Btn()).frame(width: 64).disabled(text.trimmed.isEmpty || busy)
                }.padding(.horizontal, 16).padding(.vertical, 12)
            }
        }.background(Palette.bg)
    }

    private func send() {
        let q = text.trimmed
        guard !q.isEmpty, !busy else { return }
        msgs.append(Msg(role: "user", content: q)); text = ""; busy = true; error = nil
        let g = (store.profile ?? NEW_PROFILE).g
        Task {
            var out = ""
            let phrase = mode == .teacher ? q.sub("^\\s*(comment (on )?dire|comment dit-on|on dit comment)\\s*", with: "", .caseInsensitive).sub("[«»\"“”?]", with: "").trimmed : mode == .define ? wordOf(q) : q
            let known = mode == .define || mode == .teacher ? lookupKnown(phrase, g) : nil
            if let k = known {
                out = "\(k.he)\n(\(k.tr))\n\(k.fr)\(k.note.map { "\n- \($0)" } ?? "")"
            } else if mode == .define {
                out = await app.llm.defineWord(q, g: g)
            } else if mode == .translate && q.test(HEBREW) {
                out = await app.llm.translate(q) ?? ""
            } else {
                out = await app.llm.toHebrew(phrase, g: g)
            }
            if out.isEmpty { error = "Le tuteur a rencontré une erreur. Réessaie." } else { msgs.append(Msg(role: "assistant", content: out)) }
            busy = false
        }
    }
}

private struct ToolBubble: View {
    let m: Msg
    @EnvironmentObject var app: AppModel
    var body: some View {
        if m.role == "user" {
            Text(m.content).foregroundStyle(.white).padding(.horizontal, 16).padding(.vertical, 12)
                .background(Palette.accent, in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 6, topTrailingRadius: 16))
                .frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 80)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(m.content.components(separatedBy: "\n").filter { !$0.trimmed.isEmpty }.enumerated()), id: \.offset) { _, line in
                    if line.test(HEBREW) {
                        HStack(spacing: 8) {
                            Button { Task { await app.voice.say(line.sub("[^\\u0590-\\u05FF\\s?!.,]", with: "").trimmed, rate: 0.85) } } label: { Image(systemName: "speaker.wave.2").foregroundStyle(Palette.accent) }.buttonStyle(.plain)
                            Text(line).font(.he(18))
                        }
                    } else {
                        Text(line).foregroundStyle(line.trimmed.test("^\\(.*\\)$") ? Palette.muted : Palette.ink)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Palette.card, in: UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 16, bottomTrailingRadius: 16, topTrailingRadius: 16))
            .overlay(UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 16, bottomTrailingRadius: 16, topTrailingRadius: 16).stroke(Palette.line))
            .frame(maxWidth: 680, alignment: .leading)
        }
    }
}
