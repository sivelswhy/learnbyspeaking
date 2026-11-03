import Foundation

// Portage Swift de lib/phonikud/ (diacritize.ts, numbers.ts, phonemize.ts), lui-même portage des règles de Phonikud
// (github.com/thewh1teagle/phonikud, CC BY 4.0). Tout se fait sur les points de code (unicodeScalars), comme en JS :
// un Character Swift regroupe la lettre et ses voyelles, ce qui fausserait les règles.

typealias Scalars = [Unicode.Scalar]
private func S(_ s: String) -> Scalars { Array(s.unicodeScalars) }
private func str(_ s: Scalars) -> String { var r = ""; r.unicodeScalars.append(contentsOf: s); return r }
private func u(_ s: String) -> Unicode.Scalar { s.unicodeScalars.first! }

/// Remplacement par expression régulière avec une fonction (sur des unités UTF-16, comme en JS).
func reReplace(_ text: String, _ pattern: String, _ f: (_ match: String, _ offset: Int, _ groups: [String]) -> String) -> String {
    guard let re = RX.re(pattern) else { return text }
    let ns = text as NSString
    var out = ""
    var last = 0
    for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
        out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
        let groups = (0..<m.numberOfRanges).map { m.range(at: $0).location == NSNotFound ? "" : ns.substring(with: m.range(at: $0)) }
        out += f(groups[0], m.range.location, groups)
        last = m.range.location + m.range.length
    }
    return out + ns.substring(from: last)
}

// MARK: - Nombres (numbers.ts)

private let ONES_F = ["", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע"]
private let ONES_M = ["", "אחד", "שניים", "שלושה", "ארבעה", "חמישה", "שישה", "שבעה", "שמונה", "תשעה"]
private let TENS = ["", "עשר", "עשרים", "שלושים", "ארבעים", "חמישים", "שישים", "שבעים", "שמונים", "תשעים"]
private let THOUSANDS_CONSTRUCT = ["", "", "", "שלושת", "ארבעת", "חמשת", "ששת", "שבעת", "שמונת", "תשעת", "עשרת"]

private func below1000(_ n: Int, _ masc: Bool) -> [String] {
    let ones = masc ? ONES_M : ONES_F
    var parts: [String] = []
    let h = n / 100, r = n % 100
    if h == 1 { parts.append("מאה") } else if h == 2 { parts.append("מאתיים") } else if h > 2 { parts.append("\(ONES_F[h]) מאות") }
    if r == 0 { return parts }
    if r < 10 { parts.append(ones[r]) }
    else if r == 10 { parts.append(masc ? "עשרה" : "עשר") }
    else if r < 20 { parts.append(masc ? "\(r == 12 ? "שנים" : ones[r % 10]) עשר" : "\(r == 12 ? "שתים" : ones[r % 10]) עשרה") }
    else { parts.append(r % 10 != 0 ? "\(TENS[r / 10]) ו\(ones[r % 10])" : TENS[r / 10]) }
    return parts
}
private func withVav(_ p: [String]) -> String {
    var parts = p
    let last = parts.count - 1
    if last > 0 && !parts[last].contains(" ו") { parts[last] = "ו\(parts[last])" }
    return parts.joined(separator: " ")
}
func numberToHebrew(_ n: Int) -> String {
    if n < 0 || n >= 1_000_000 { return String(n) }
    if n == 0 { return "אפס" }
    var parts: [String] = []
    let th = n / 1000
    if th == 1 { parts.append("אלף") } else if th == 2 { parts.append("אלפיים") }
    else if th > 2 && th <= 10 { parts.append("\(THOUSANDS_CONSTRUCT[th]) אלפים") }
    else if th > 10 { parts.append("\(withVav(below1000(th, true))) אלף") }
    parts += below1000(n % 1000, false)
    return withVav(parts)
}
func expandNumbers(_ text: String) -> String { reReplace(text, "\\d+") { d, _, _ in numberToHebrew(Int(d) ?? 0) } }

// MARK: - Vocalisation (diacritize.ts)

enum Diacritizer {
    static let vocab: [String: Int64] = {
        guard let url = Bundle.main.url(forResource: "phonikud-vocab", withExtension: "json"), let d = try? Data(contentsOf: url),
              let v = try? JSONDecoder().decode([String: Int64].self, from: d) else { return [:] }
        return v
    }()
    static let NIKUD_CLASSES = ["", "<MAT_LECT>", "ּ", "ְ", "ֱ", "ֲ", "ֳ", "ִ", "ֵ", "ֶ", "ַ", "ָ", "ֹ", "ֺ", "ֻ", "ְּ", "ֱּ", "ֲּ", "ֳּ", "ִּ", "ֵּ", "ֶּ", "ַּ", "ָּ", "ֹּ", "ֺּ", "ֻּ", "ׇ", "ׇּ"]
    static let SHIN_CLASSES = ["ׁ", "ׂ"]
    static let ALLOWED = "[\\u0590-\\u05FF\\u0000-\\u007f\\u200C-\\u203F\\u20A0-\\u20BF\\u2200-\\u22FF\\u2150-\\u218B\\uFB00-\\uFB4F]"

    struct Encoded { var chars: Scalars; var tokens: [(start: Int, end: Int, id: Int64)]; var ids: [Int64] }

    static func encode(_ text: String) -> Encoded {
        let chars = S(text.sub("[\\u0590-\\u05C7|]", with: ""))
        let CLS = vocab["[CLS]"] ?? 1, SEP = vocab["[SEP]"] ?? 2, UNK = vocab["[UNK]"] ?? 0
        var tokens: [(start: Int, end: Int, id: Int64)] = []
        let allowed = { (c: Unicode.Scalar) in String(c).test(ALLOWED) }
        for (i, c) in chars.enumerated() {
            if !allowed(c) {
                if let prev = tokens.last, prev.id == UNK, prev.end == i, i > 0, !allowed(chars[i - 1]) { tokens[tokens.count - 1].end = i + 1 }
                else { tokens.append((i, i + 1, UNK)) }
                continue
            }
            let n = String(c).precomposedStringWithCompatibilityMapping.lowercased()
            let bare = str(S(n.decomposedStringWithCanonicalMapping).filter { !isMark($0) })
            tokens.append((i, i + 1, vocab[n] ?? vocab[bare] ?? UNK))
        }
        return Encoded(chars: chars, tokens: tokens, ids: [CLS] + tokens.map(\.id) + [SEP])
    }

    private static func argmax(_ a: [Float], _ off: Int, _ n: Int) -> Int {
        var best = 0
        for k in 1..<n where a[off + k] > a[off + best] { best = k }
        return best
    }

    static func decode(_ e: Encoded, nikud: [Float], shin: [Float], extra: [Float]) -> String {
        var out = ""
        var prev = 0
        for (k, t) in e.tokens.enumerated() {
            let pos = k + 1
            if t.start > prev { out += str(Array(e.chars[prev..<t.start])) }
            if t.end - t.start != 1 { continue }
            let ch = e.chars[t.start]
            prev = t.end
            if ch.value < 0x05D0 || ch.value > 0x05EA { out.unicodeScalars.append(ch); continue }
            var nk = NIKUD_CLASSES[argmax(nikud, pos * NIKUD_CLASSES.count, NIKUD_CLASSES.count)]
            let sh = ch == "ש" ? SHIN_CLASSES[argmax(shin, pos * 2, 2)] : ""
            if nk == "<MAT_LECT>" {
                if !"אוי".unicodeScalars.contains(ch) { nk = "" } else { out.unicodeScalars.append(ch); continue }
            }
            let x = pos * 3
            out.unicodeScalars.append(ch)
            out += sh + nk + (extra[x] > 0 ? "\u{05AB}" : "") + (extra[x + 1] > 0 ? "\u{05BD}" : "") + (extra[x + 2] > 0 ? "|" : "")
        }
        out += str(Array(e.chars[prev...]))
        return out
    }
}

private func isMark(_ c: Unicode.Scalar) -> Bool {
    switch c.properties.generalCategory { case .nonspacingMark, .spacingMark, .enclosingMark: return true; default: return false }
}
private func isLetter(_ c: Unicode.Scalar) -> Bool {
    switch c.properties.generalCategory { case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true; default: return false }
}

// MARK: - Phonèmes (phonemize.ts)

enum Phonemizer {
    static let VOCAL_SHVA = u("\u{05BD}"), HATAMA = u("\u{05AB}"), PREFIX = u("|"), NIKUD_HASER = u("\u{05AF}")
    static let ENHANCED: Set<Unicode.Scalar> = [HATAMA, PREFIX, VOCAL_SHVA]
    static let HE_PATTERN = "[\\u05B0-\\u05EA\\u05BD\\u05AB|\\u05AF'\"]+"
    static let HE_NIKUD_PATTERN = "[\\u05B0-\\u05C7\\u05BD\\u05AB|\\u05AF']"
    static let STRESS = "ˈ"
    static let GERESH: [String: String] = ["ג": "dʒ", "ז": "ʒ", "ת": "ta", "צ": "tʃ", "ץ": "tʃ"]
    static let LETTERS: [String: String] = [
        "א": "ʔ", "ב": "v", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "x", "ט": "t", "י": "j",
        "ך": "x", "כ": "x", "ל": "l", "ם": "m", "מ": "m", "ן": "n", "נ": "n", "ס": "s", "ע": "ʔ", "פ": "f",
        "ף": "f", "ץ": "ts", "צ": "ts", "ק": "k", "ר": "r", "ש": "ʃ", "ת": "t",
        "ב\u{05BC}": "b", "כ\u{05BC}": "k", "פ\u{05BC}": "p", "ש\u{05C1}": "ʃ", "ש\u{05C2}": "s", "'": "",
    ]
    static let NIKUD: [Unicode.Scalar: String] = [
        u("\u{05B4}"): "i", u("\u{05B1}"): "e", u("\u{05B5}"): "e", u("\u{05B6}"): "e", u("\u{05B2}"): "a", u("\u{05B7}"): "a", u("\u{05C7}"): "o",
        u("\u{05B9}"): "o", u("\u{05BA}"): "o", u("\u{05BB}"): "u", u("\u{05B3}"): "o", u("\u{05B8}"): "a", HATAMA: STRESS, VOCAL_SHVA: "e",
    ]
    /// Caractères gardés en sortie (l'original teste caractère par caractère : seules les entrées d'un caractère comptent).
    static let SET: Set<Unicode.Scalar> = {
        let all = Array(NIKUD.values) + Array(LETTERS.values) + Array(GERESH.values) + ["χ", "ʁ", "ɡ", "w"]
        return Set(all.filter { $0.unicodeScalars.count == 1 }.map { u($0) })
    }()
    static let PUNCT: Set<Unicode.Scalar> = [".", ",", "!", "?", " "]
    static let SHVA = u("\u{05B0}"), SIN = u("\u{05C2}"), PATAH = u("\u{05B7}"), KAMATZ = u("\u{05B8}"), HATAF_KAMATZ = u("\u{05B3}"), DAGESH = u("\u{05BC}")
    static let HOLAM = u("\u{05B9}"), HIRIK = u("\u{05B4}"), KUBUTS = u("\u{05BB}"), TSERE = u("\u{05B5}"), SEGOL = u("\u{05B6}")

    /// NFD, voyelles de chaque lettre triées, guillemets et makaf hébreux normalisés.
    static func normalize(_ text: String) -> String {
        let sc = S(text.decomposedStringWithCanonicalMapping)
        var out: Scalars = []
        var i = 0
        while i < sc.count {
            out.append(sc[i])
            if isLetter(sc[i]) {
                var j = i + 1
                var marks: Scalars = []
                while j < sc.count, isMark(sc[j]) { marks.append(sc[j]); j += 1 }
                out += marks.sorted { $0.value < $1.value }
                i = j
            } else { i += 1 }
        }
        return str(out).replacingOccurrences(of: "״", with: "\"").replacingOccurrences(of: "׳", with: "'").replacingOccurrences(of: "־", with: "-")
    }
    static func removeNikud(_ t: String) -> String { t.sub(HE_NIKUD_PATTERN, with: "") }

    final class Letter: CustomStringConvertible {
        var char: Scalars
        var allDiac: Scalars
        init(_ c: String, _ d: String) { char = S(normalize(c)); allDiac = S(normalize(d)) }
        var diac: Scalars { allDiac.filter { !ENHANCED.contains($0) } }
        var description: String { str(char + allDiac) }
        var ch: String { str(char) }
    }

    static func getLetters(_ word: String) -> [Letter] {
        var out: [Letter] = []
        _ = reReplace(word, "(\\p{L})([\\p{M}'|]*)") { _, _, g in out.append(Letter(g[1], g[2])); return "" }
        return out
    }

    static func sortStress(_ phonemes: [String]) -> [String] {
        let joined = phonemes.joined()
        if !joined.contains(STRESS) || !joined.test("[aeiou]") { return phonemes }
        var ps = phonemes.filter { $0 != STRESS }
        for i in ps.indices {
            if let r = ps[i].range(of: "[aeiou]", options: .regularExpression) {
                ps[i] = String(ps[i][..<r.lowerBound]) + STRESS + String(ps[i][r.lowerBound...])
                return ps
            }
        }
        return ps
    }

    static func sortHatama(_ letters: [Letter]) -> [Letter] {
        guard letters.count > 1 else { return letters }
        for i in 0..<(letters.count - 1) {
            let d = letters[i].allDiac
            if d.contains(HATAMA) && d.contains(NIKUD_HASER) {
                if let k = d.firstIndex(of: HATAMA) { letters[i].allDiac.remove(at: k) }
                letters[i + 1].allDiac.append(HATAMA)
            }
        }
        return letters
    }

    static func postNormalize(_ p: String) -> String {
        p.components(separatedBy: " ").map { $0.sub("ʔ$", with: "").sub("h$", with: "").sub("ˈh$", with: "").sub("ij$", with: "i") }.joined(separator: " ")
    }
    static func postClean(_ p: String) -> String {
        var out = ""
        for c in p.unicodeScalars {
            if c == "-" { out += " " } else if SET.contains(c) || PUNCT.contains(c) { out.unicodeScalars.append(c) }
        }
        return out
    }

    // syllables.py
    static let VOWEL_DIACS: Set<Unicode.Scalar> = Set((0x05B1..<0x05BC).compactMap { Unicode.Scalar($0) } + [u("\u{05C7}"), u("\u{05BD}")])
    static func hasVowelDiacs(_ s: Scalars) -> Bool { s == S("ו\u{05BC}") || s.contains { VOWEL_DIACS.contains($0) } }

    static func getSyllables(_ word: String) -> [String] {
        let letters = getLetters(word)
        var syl: [String] = []
        var cur = ""
        var vowel = false
        var i = 0
        while i < letters.count {
            let l = letters[i]
            let hasVowel = hasVowelDiacs(l.char + l.allDiac) || (i == 0 && l.allDiac.contains(SHVA))
            let vav1 = i + 2 < letters.count && letters[i + 2].ch == "ו"
            let vav2 = i + 3 < letters.count && letters[i + 3].ch == "ו"
            if hasVowel {
                if vowel { syl.append(cur); cur = l.description } else { cur += l.description }
                vowel = true
            } else { cur += l.description }
            i += 1
            if vav1 && vav2 {
                if !cur.isEmpty { syl.append(cur + letters[i].description); cur = "" }
                cur = letters[i + 1].description + letters[i + 2].description
                i += 3
                vowel = true
            } else if vav1 && !letters[i + 1].diac.isEmpty {
                if !cur.isEmpty { syl.append(cur); cur = "" }
                vowel = false
            }
        }
        if !cur.isEmpty { syl.append(cur) }
        return syl
    }

    static func addMilraHatama(_ word: String) -> String {
        var syl = getSyllables(word)
        guard !syl.isEmpty else { return word }
        let letters = getLetters(syl[syl.count - 1])
        guard !letters.isEmpty else { return word }
        letters[0].allDiac.append(HATAMA)
        syl[syl.count - 1] = letters.map(\.description).joined()
        return syl.joined()
    }

    // hebrew.py
    static func handleYud(_ cur: Letter, _ prev: Letter?, _ next: Letter?) -> Bool {
        guard let next, let prev, cur.diac.isEmpty else { return false }
        return str(prev.char + prev.diac) != str(S("א\u{05B5}")) && !(next.ch == "ו" && !next.diac.isEmpty && !next.diac.contains(SHVA))
    }

    static func handleVav(_ cur: Letter, _ prev: Letter?, _ next: Letter?) -> ([String], Bool, Bool, Int) {
        let d = cur.diac
        if let prev, prev.diac.contains(SHVA), d.contains(HOLAM) { return (["vo"], true, true, 0) }
        if let next, next.ch == "ו" {
            let both = d + next.diac
            if both.contains(HOLAM) { return (["vo"], true, true, 1) }
            if d == next.diac { return (["vu"], true, true, 1) }
            if d.contains(HIRIK) { return (["vi"], true, true, 0) }
            if d.contains(SHVA) && next.diac.isEmpty { return (["v"], true, true, 0) }
            if d.contains(KAMATZ) || d.contains(PATAH) { return (["va"], true, true, 0) }
            if d.contains(TSERE) || d.contains(SEGOL) { return (["ve"], true, true, 0) }
            return ([], false, false, 0)
        }
        if d.contains(where: { $0.value >= 0x05B7 && $0.value <= 0x05B8 }) { return (["va"], true, true, 0) }
        if d.contains(TSERE) || d.contains(SEGOL) { return (["ve"], true, true, 0) }
        if d.contains(HOLAM) { return (["o"], true, true, 0) }
        if d.contains(KUBUTS) || d.contains(DAGESH) { return (["u"], true, true, 0) }
        if d.contains(SHVA) && prev == nil { return (["ve"], true, true, 0) }
        if d.contains(HIRIK) { return (["vi"], true, true, 0) }
        if next != nil && d.isEmpty { return ([], true, true, 0) }
        return (["v"], true, true, 0)
    }

    static func letterToPhonemes(_ cur: Letter, _ prev: Letter?, _ next: Letter?) -> ([String], Int) {
        var out: [String] = []
        var skipD = false, skipC = false, skipO = 0
        let d = cur.diac
        let c = cur.ch
        if cur.allDiac.contains(NIKUD_HASER) { skipC = true; skipD = true }
        else if c == "א" && d.isEmpty && prev != nil { if let next, next.ch != "ו" { skipC = true } }
        else if c == "י" && handleYud(cur, prev, next) { skipC = true }
        else if c == "ש" && d.contains(SIN) {
            if let next, next.ch == "ש", next.diac.isEmpty, d.contains(where: { $0 == PATAH || $0 == KAMATZ }) { out.append("sa"); skipC = true; skipD = true; skipO += 1 }
            else { out.append("s"); skipC = true }
        } else if c == "ש" && d.isEmpty && prev?.diac.contains(SIN) == true { out.append("s"); skipC = true }
        else if next == nil && c == "ח" && d.contains(PATAH) { out.append("ax"); skipD = true; skipC = true }
        else if next == nil && c == "ה" && d.contains(PATAH) { out.append("ah"); skipD = true; skipC = true }
        else if next == nil && c == "ע" && d.contains(PATAH) { out.append("a"); skipD = true; skipC = true }

        if d.contains("'") && GERESH[c] != nil {
            out.append(GERESH[c]!); skipC = true
            if c == "ת" { skipD = true }
        } else if d.contains(DAGESH), let p = LETTERS[c + "\u{05BC}"] {
            out.append(p); skipC = true
        } else if c == "ו" && !cur.allDiac.contains(NIKUD_HASER) {
            let (ps, sc, sd, so) = handleVav(cur, prev, next)
            out += ps; skipC = sc; skipD = sd; skipO += so
        }
        if !skipC { out.append(LETTERS[c] ?? "") }
        if d.contains(KAMATZ), let next, next.diac.contains(HATAF_KAMATZ) { out.append("o"); skipD = true }
        if !skipD { out += cur.allDiac.map { NIKUD[$0] ?? "" } }
        else if cur.allDiac.contains(HATAMA) { out.append(STRESS) }
        out = sortStress(out).filter { !$0.isEmpty && $0.unicodeScalars.allSatisfy { SET.contains($0) } }
        return (out, skipO)
    }

    static func phonemizeHebrew(_ letters: [Letter]) -> [String] {
        var out: [String] = []
        var i = 0
        while i < letters.count {
            let (ps, skip) = letterToPhonemes(letters[i], i > 0 ? letters[i - 1] : nil, i + 1 < letters.count ? letters[i + 1] : nil)
            out += ps
            i += skip + 1
        }
        return out
    }

    static let DICT: [String: String] = {
        let raw = ["וַאלְלָה": "wˈala", "וַסַבִּי": "wasˈabi", "פינגוין": "pinguwˈin", "וואצאפ": "wˈatsʔap", "וואו": "wˈau", "וואוו": "wˈau", "וואווו": "wˈau", "ווואו": "wˈau", "וואוי": "wˈauj",  "וואטסאפ": "wˈatsʔap",
                   "יאללה": "jˈala", "וולטר": "wˈolter", "₪": "ʃˈekel", "$": "dˈolar", "%": "axˈuz", "צה״ל": "tsˈahal"]
        return Dictionary(raw.map { (normalize($0.key), $0.value) }, uniquingKeysWith: { a, _ in a })
    }()
    /// Clé de dictionnaire comparée point de code par point de code (comme les objets JS).
    private static func lookup(_ k: String) -> String? { DICT.first { S($0.key) == S(k) }?.value }

    static func expandDictionary(_ text: String) -> String {
        reReplace(text, "\\S+") { raw, _, _ in
            if raw.test("^\\p{N}+$") { return raw }
            if let v = lookup(raw) { return v }
            return reReplace(raw, HE_PATTERN) { src, _, _ in
                let s = src.decomposedStringWithCanonicalMapping
                return lookup(s) ?? lookup(removeNikud(s)) ?? lookup(normalize(s)) ?? s
            }
        }
    }

    static func phonemize(_ input: String) -> String {
        var text = expandDictionary(normalize(input).split(whereSeparator: { $0.isWhitespace }).joined(separator: " "))
        let ns = text as NSString
        text = reReplace(text, HE_PATTERN) { w, off, _ in
            if off > 0 && ns.substring(with: NSRange(location: off - 1, length: 1)) == "[" { return w }
            var word = w
            if !S(word).contains(HATAMA) { word = addMilraHatama(word) }
            var ph = postNormalize(phonemizeHebrew(sortHatama(getLetters(word))).joined())
            ph = ph.replacingOccurrences(of: "x", with: "χ").replacingOccurrences(of: "r", with: "ʁ").replacingOccurrences(of: "g", with: "ɡ")
            return ph
        }
        text = reReplace(text, "\\[(.+?)\\]\\(/(.+?)/\\)") { _, _, g in g[2] }
        return postClean(text)
    }
}
