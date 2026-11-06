import Foundation

/// Fautes précises d'une réponse (miroir de lib/fixes.ts) : mot de l'apprenant, mot juste, raison.
struct Fix: Hashable { var from: String; var to: String; var why: String }

func fixText(_ f: Fix) -> String { "\(f.from.isEmpty ? "…" : f.from) → \(f.to.isEmpty ? "(rien)" : f.to) : \(f.why)" }

func whyChanged(_ from: String, _ to: String) -> String {
    let f = from.sub("^[והבלמכש]", with: ""), t = to.sub("^[והבלמכש]", with: "")
    if to == from + "ת" || to == from + "ה" || to == from.sub("ה$", with: "ת") || to == from.sub("ה$", with: "ית") || to == from + "ית" { return "accord au féminin" }
    if from == to + "ת" || from == to + "ה" { return "accord au masculin" }
    let pl = "(ים|ות)$"
    if to.test(pl) && !from.test(pl) && to.hasPrefix(String(from.prefix(2))) { return "il faut le pluriel" }
    if from.test(pl) && !to.test(pl) && from.hasPrefix(String(to.prefix(2))) { return "il faut le singulier" }
    if to.test("^ל") && !from.test("^ל") && to.count >= 4 { return "infinitif : après « רוצה / יכול / צריך », le verbe prend ל" }
    if from.test("תי$") && to.test("^[אינת]") && !to.test("תי$") { return "futur : la 1re personne prend le préfixe א" }
    if to.test("תי$") && !from.test("תי$") { return "passé, 1re personne : terminaison ־תי" }
    if from.test("תי$") && !to.test("תי$") { return "le verbe n'est pas au passé ici (\(to))" }
    if to.test("^[אינת]") && !from.test("^[אינת]") && abs(to.count - from.count) <= 1 && String(to.dropFirst().prefix(2)) == String(from.prefix(2)) { return "futur : préfixe du verbe (א / י / נ / ת)" }
    if from.test("^[אינת]") && !to.test("^[אינת]") && String(from.dropFirst().prefix(2)) == String(to.prefix(2)) { return "ce n'est pas le futur ici : forme du présent ou du passé" }
    if f == t, let a = from.first, let b = to.first, a != b, "בלמכ".contains(a), "בלמכ".contains(b) { return "préposition : « \(b) » au lieu de « \(a) »" }
    if f == t { return "article ou préfixe collé différent" }
    if f.prefix(3) == t.prefix(3) || t.contains(f) || f.contains(t) { return "autre forme du même mot (personne, temps ou nombre)" }
    return "autre mot plus naturel ici"
}

func explainFixes(_ answer: String, _ correction: String) -> [Fix] {
    let x = hebrewWords(answer), y = hebrewWords(correction)
    var d = Array(repeating: Array(repeating: 0, count: y.count + 1), count: x.count + 1)
    if !x.isEmpty && !y.isEmpty {
        for i in stride(from: x.count - 1, through: 0, by: -1) { for j in stride(from: y.count - 1, through: 0, by: -1) {
            d[i][j] = x[i] == y[j] ? d[i + 1][j + 1] + 1 : max(d[i + 1][j], d[i][j + 1])
        } }
    }
    var out: [Fix] = []
    var i = 0, j = 0
    while i < x.count || j < y.count {
        if i < x.count && j < y.count && x[i] == y[j] { i += 1; j += 1; continue }
        var a: [String] = [], c: [String] = []
        while (i < x.count || j < y.count) && !(i < x.count && j < y.count && x[i] == y[j]) {
            if j >= y.count || (i < x.count && d[i + 1][j] >= d[i][j + 1]) { a.append(x[i]); i += 1 } else { c.append(y[j]); j += 1 }
        }
        if a.count == c.count { for k in a.indices { out.append(Fix(from: a[k], to: c[k], why: whyChanged(a[k], c[k]))) } }
        else if c.isEmpty { for w in a { out.append(Fix(from: w, to: "", why: "mot en trop : on peut l'enlever")) } }
        else if a.isEmpty { out.append(Fix(from: "", to: c.joined(separator: " "), why: "mot manquant")) }
        else { out.append(Fix(from: a.joined(separator: " "), to: c.joined(separator: " "), why: a.count == 2 && c.count == 1 ? "un seul mot suffit : la forme conjuguée" : "à reformuler")) }
    }
    return Array(out.prefix(4))
}

/// Accord avec le genre de l'apprenant après « אני » (table des formes courantes, sans modèle).
func genderSlips(_ answer: String, _ g: Gender) -> [Fix] {
    let w = hebrewWords(answer)
    let fem = C.rules.fem
    let masc = Dictionary(fem.filter { $0.key != $0.value }.map { ($0.value, $0.key) }, uniquingKeysWith: { a, _ in a })
    var out: [Fix] = []
    for (i, x) in w.enumerated() {
        var k = i - 1
        while k >= 0 && w[k] == "לא" { k -= 1 }
        if k < 0 || i - k > 2 || !w[k].test("^(ו|ש|כש)?אני$") { continue }
        if g == .f, let f = fem[x], f != x { out.append(Fix(from: x, to: f, why: "tu parles au féminin : ajoute la terminaison féminine")) }
        if g == .m, let m = masc[x] { out.append(Fix(from: x, to: m, why: "tu parles au masculin : forme masculine")) }
    }
    return out
}

func concreteFixes(_ answer: String, _ g: Gender, _ correction: String?) -> [Fix] {
    let slips = genderSlips(answer, g)
    let rest = correction.map { explainFixes(answer, $0).filter { f in !slips.contains { f.from.split(separator: " ").map(String.init).contains($0.from) } } } ?? []
    return Array((slips + rest).prefix(4))
}
