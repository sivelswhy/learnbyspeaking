import Foundation

// Ce que Shuli pense : réplique en conversation libre (lib/humanDialogue.ts), juge (lib/judge.ts),
// avis sur une réponse (lib/feedback.ts), bilan de séance (lib/sessionScore.ts), traduction.

let T = C.templates

struct Turn: Hashable { var role: String; var text: String; var missions: [String]? = nil }

struct Feedback: Hashable {
    var context: String
    var praise: String?
    var tips: [String]
    var correction: String?
    var example: String?
}

struct DialogueReply { var text: String; var flaws: [String]; var mission: String? }

// MARK: Mise au féminin de « je » (lib/sayInHebrew.ts)

private func bareHe(_ w: String) -> String { w.sub("[^א-ת]", with: "") }
private func isAni(_ w: String) -> Bool { bareHe(w).test("^(ו|ש|כש|וש|וכש)?אני$") }
private func afterAni(_ a: [String], _ i: Int) -> Bool {
    var k = i - 1
    while k >= 0 && bareHe(a[k]) == "לא" { k -= 1 }
    return k >= 0 && i - k <= 2 && isAni(a[k])
}
/// Formes les plus courantes après « אני », sans passer par le modèle.
func feminizeKnown(_ he: String) -> String {
    let a = he.split(separator: " ").map(String.init)
    return a.enumerated().map { i, w in
        guard afterAni(a, i) else { return w }
        let x = bareHe(w)
        return C.rules.fem[x].map { w.replacingOccurrences(of: x, with: $0) } ?? w
    }.joined(separator: " ")
}
/// Garde seulement les changements « au féminin » du modèle : mots juste après « אני », même début, 0 à 2 lettres de plus.
func applyFeminine(_ orig: String, _ cand: String) -> String {
    let a = orig.split(separator: " ").map(String.init), b = cand.trimmed.split(separator: " ").map(String.init)
    guard a.count == b.count else { return orig }
    return a.enumerated().map { i, w in
        let x = bareHe(w), y = bareHe(b[i])
        if !afterAni(a, i) || x.isEmpty || x == y || !y.hasPrefix(String(x.prefix(2))) || y.count < x.count || y.count > x.count + 2 { return w }
        return w.replacingOccurrences(of: x, with: y)
    }.joined(separator: " ")
}

extension LLM {
    /// Met au féminin ce que dit « je » ; sans « אני », rien à faire.
    func feminize(_ text: String) async -> String {
        guard text.split(separator: " ").contains(where: { isAni(String($0)) }) else { return text }
        let he = feminizeKnown(text)
        let after = he.findAll("(?:^|\\s)(?:ו|ש|כש|וש|וכש)?אני\\s+(?:לא\\s+)?([\\u05d0-\\u05ea]+)").map { $0.split(separator: " ").last.map(String.init) ?? "" }
        if after.allSatisfy({ C.rules.fem.values.contains($0) || $0.test("(ת|ה|ית)$") }) { return he }
        let out = ((try? await complete(fill(T.feminine, ["T": he]), temperature: 0, maxTokens: 60)) ?? "").components(separatedBy: "\n").first ?? ""
        return applyFeminine(he, out)
    }

    // MARK: Juge

    /// La réponse répond-elle à la question, est-elle correcte ? nil sans mot hébreu.
    func judge(question: String, answer: String, female: Bool = false) async throws -> AiJudgement? {
        guard !hebrewWords(answer).isEmpty else { return nil }
        let relevance = try await yesProbability(fill(T.relevance, ["Q": question, "A": answer]))
        let correct = try await yesProbability(fill(T.grammarCorrect, ["A": answer]))
        let mistake = try await yesProbability(fill(T.grammarMistake, ["A": answer]))
        var correction = try await complete(fill(T.correction, ["A": answer]), temperature: 0, maxTokens: 60)
            .components(separatedBy: "\n").first ?? ""
        // Les exemples de correction sont surtout au masculin : pour une apprenante, « je » repasse au féminin.
        if female { correction = await feminize(correction) }
        return AiJudgement(relevance: relevance, grammar: (correct + 1 - mistake) / 2, correction: correction)
    }

    // MARK: Avis de Shuli

    func review(question: String, answer: String, p: Profile) async -> Feedback? {
        guard let ai = try? await judge(question: question, answer: answer, female: p.g == .f) else { return nil }
        let r = readJudgement(answer, ai)
        let target = p.target_
        let words = hebrewWords(answer).count
        let asked = question.contains("?")
        let focus = p.focus ?? []
        let devWords = (C.rules.devWords[target] ?? 8) + (focus.contains("speaking") ? 2 : 0)
        let grammarAlert = focus.contains("grammar") ? 75 : 60
        var tips: [String] = []
        if asked && r.relevance < 40 { tips.append("Ta réponse ne répond pas vraiment à la question de Shuli. Réécoute-la ou traduis-la, puis réponds-y directement.") }
        if r.correction == nil && r.grammar < grammarAlert { tips.append("Il reste sans doute une faute d'accord ou de conjugaison : vérifie le genre et la personne du verbe.") }
        if words <= 2 { tips.append("Fais une phrase complète, avec un verbe : « אני… ».") }
        else if words < devWords { tips.append("Au niveau \(target), on développe davantage : vise au moins \(devWords) mots, avec un détail ou une raison.") }
        if let skill = C.rules.levelSkill[target], words > 2, !answer.sub(NIKUD, with: "").test(skill.has) { tips.append(skill.tip) }

        var example: String?
        if asked && (!tips.isEmpty || r.correction != nil), let msgs = T.better[target]?[p.g.rawValue] {
            var b = (try? await complete(fill(msgs, ["Q": question, "A": answer]), temperature: 0.2, maxTokens: 70))?.components(separatedBy: "\n").first?.trimmed ?? ""
            if p.g == .f { b = await feminize(b) }
            if !b.isEmpty, hebrewWords(b) != hebrewWords(answer), !b.test("[a-zA-Z]"), hebrewWords(b).count <= 25 {
                let rel = (try? await yesProbability(fill(T.relevance, ["Q": question, "A": b]))) ?? 0
                if rel >= 0.5, ((try? await yesProbability(fill(T.grammarCorrect, ["A": b]))) ?? 0) >= 0.85 { example = b }
            }
        }
        let good = tips.isEmpty && r.correction == nil
        let praise = good ? (words >= devWords + 3 && r.grammar >= 75 ? "Excellente réponse : claire, correcte et développée !" : "Bonne réponse, correcte !") : nil
        if good, let t = C.rules.goalTip[p.goal] { tips.append(t) }
        return Feedback(context: "\(p.level) → \(target) · \(C.goals[p.goal] ?? p.goal)", praise: praise, tips: tips, correction: r.correction, example: example)
    }

    // MARK: Traduction

    func translate(_ he: String) async -> String? {
        let out = try? await complete(fill(T.translate, ["T": he]), temperature: 0.1, maxTokens: 100)
        let line = out?.components(separatedBy: "\n").first?.trimmed ?? ""
        return line.isEmpty ? nil : line
    }

    // MARK: Réplique de Shuli (conversation libre)

    func humanReply(p: Profile, sc: Scenario, turns: [Turn], onToken: ((String) -> Void)? = nil) async throws -> DialogueReply? {
        let g = p.g
        let script = C.scenes[sc.id]
        let users = turns.filter { $0.role == "user" }
        let said = users.last?.text ?? ""

        // Mission dite autrement que prévu : validée par le juge si elle répond à la question que Shuli vient de poser.
        var mission: String?
        if let script, !users.isEmpty {
            let prog = sceneProgress(script, users.map(\.text), credited: users.map(\.missions))
            let prevAi = turns.count >= 2 && turns[turns.count - 2].role == "assistant" ? turns[turns.count - 2].text : ""
            if prog.newly.isEmpty, let next = prog.next, !answersOnlyByAsking(next), prevAi.contains("?"), !isQuestion(said), !isGreeting(said), !isClarify(said) {
                if (try? await yesProbability(fill(T.relevance, ["Q": prevAi, "A": said]))) ?? 0 >= 0.5 { mission = next.id }
            }
        }

        let lastAi = turns.last { $0.role == "assistant" }?.text ?? ""
        // Silence ou hésitation : encourager et reposer la dernière question, sans avancer.
        if !users.isEmpty && said.test(C.rules.filler) {
            let take = g == .f ? "לא נורא, קחי את הזמן." : "לא נורא, קח את הזמן."
            let q = lastAi.findAll("[^.!?]*\\?").last?.trimmed
            return DialogueReply(text: q.map { "\(take) \($0)" } ?? "\(take) מה \(g == .f ? "תרצי" : "תרצה") להגיד?", flaws: [], mission: mission)
        }

        let tpl = T.humanSystem[sc.id]?[g.rawValue] ?? T.humanSystem["*"]![g.rawValue]!
        var system = fill(tpl, ["LEVEL": p.level, "LEVELDESC": C.heLevel[p.level] ?? "", "ROLE": sc.role])
        if !users.isEmpty {
            if isClarify(said) && !lastAi.isEmpty { system += fill(T.hintClarify[g.rawValue]!, ["LASTAI": lastAi]) }
            else if isQuestion(said) { system += T.hintQuestion[g.rawValue]!.replacingOccurrences(of: "{{SAID}}?", with: said) }
        }
        var history = turns.map { Msg(role: $0.role, content: $0.text) }
        if history.isEmpty { history = [Msg(role: "user", content: "(Start the conversation in character with one short greeting and one question.)")] }
        let before = turns.filter { $0.role == "assistant" }.map(\.text)
        let never = script?.never ?? []

        var best = "", bestFlaws: [String] = [], bestCost = Int.max
        for temperature in [0.7, 0.9, 1.0] {
            try Task.checkCancellation()
            let out = try await complete([Msg(role: "system", content: system)] + history, temperature: temperature, maxTokens: 90, antiRepeat: true, onToken: onToken)
            let cand = pickGender(tidyReply(out), g)
            var flaws = replyFlaws(cand, g, said: before, needQuestion: false)
            if g == .m && cand.test(C.rules.atToMan) && !flaws.contains("genre") { flaws.append("genre") }
            let asks = cand.findAll("[^.!?]*\\?").joined(separator: " ")
            if !asks.isEmpty && never.contains(where: { asks.test($0) }) { flaws.append("rôle inversé") }
            if !users.isEmpty && C.rules.mustAnswer.contains(where: { said.test($0[0]) && !cand.test($0[1]) }) { flaws.append("à côté") }
            let cost = flaws.reduce(0) { $0 + ($1 == "long" || $1 == "sans question" ? 1 : 3) }
            if cost < bestCost { (best, bestFlaws, bestCost) = (cand, flaws, cost) }
            if cost == 0 { break }
        }
        if best.isEmpty { return nil }
        // Phrases au mauvais genre retirées ; on garde le reste.
        if bestFlaws.contains("genre") {
            let ok = sentences(best).filter { !replyFlaws($0, g).contains("genre") && !(g == .m && $0.test(C.rules.atToMan)) }.joined(separator: " ").trimmed
            if !ok.isEmpty { best = ok; bestFlaws.removeAll { $0 == "genre" } }
        }
        return DialogueReply(text: best, flaws: bestFlaws, mission: mission)
    }

    // MARK: Bilan de séance

    func scoreSession(_ turns: [(question: String, answer: String)], level: String) async -> SessionReport {
        let rules = scoreByRules(turns.map(\.answer), level: level)
        let judged = Array(turns.filter { !hebrewWords($0.answer).isEmpty }.suffix(8))
        var read: [(q: String, a: String, relevance: Int, grammar: Int, correction: String?)] = []
        for t in judged {
            guard var ai = try? await judge(question: t.question, answer: t.answer) else { return rules }
            if !t.question.contains("?") || t.answer.trimmed.hasSuffix("?") { ai.relevance = 1 }
            let r = readJudgement(t.answer, ai)
            read.append((t.question, t.answer, r.relevance, r.grammar, r.correction))
        }
        if read.isEmpty { return rules }
        let relevance = read.map(\.relevance).reduce(0, +) / read.count
        let grammar = read.map(\.grammar).reduce(0, +) / read.count
        let onTopic = read.filter { $0.relevance >= 50 }.count
        let correct = read.filter { $0.grammar >= 60 }.count
        let mainErrors = read.compactMap { r in r.correction.map { "« \(r.a.trimmed) » → « \($0) »" } }.prefix(4)
        var tips: [String] = []
        if onTopic < read.count { tips.append("Certaines réponses ne suivaient pas la question de Shuli : écoute-la jusqu'au bout, ou touche « Traduire » avant de répondre.") }
        if !mainErrors.isEmpty { tips.append("Relis les corrections ci-dessus à voix haute : c'est le moyen le plus rapide de retenir la bonne forme. (L'IA peut se tromper.)") }
        if rules.fluency < 70 { tips.append("Ajoute un détail à tes réponses : une deuxième idée avec ו (et) ou כי (parce que).") }
        if turns.count < 6 { tips.append("Reste plus longtemps dans la conversation : 6 échanges ou plus.") }
        tips.append("Révise les nouveaux mots de la session dans « Moi › Vocabulaire ».")
        var r = rules
        r.relevance = relevance
        r.grammar = grammar
        r.score = Int((Double(relevance) * 0.35 + Double(grammar) * 0.4 + Double(rules.participation) * 0.1 + Double(rules.vocabulary) * 0.15).rounded())
        r.scoreExplanation = "Score calculé par l'IA (Gemma, sur ton Mac) et par des règles : 35 % pertinence (tes réponses suivent-elles la question de Shuli ?), 40 % grammaire (l'IA juge chaque phrase et propose une correction), 10 % participation (objectif 6 réponses), 15 % variété du vocabulaire.\(judged.count < turns.count ? " L'IA a noté tes \(judged.count) dernières réponses." : "") L'IA peut se tromper ; la prononciation n'est pas notée."
        r.mainErrors = Array(mainErrors)
        r.tips = tips
        r.summary = "\(onTopic) de tes \(read.count) réponses suivent bien la conversation, et \(correct) sont correctes selon l'IA."
        return r
    }
}

/// Bilan sans IA (lib/sessionScore.ts, scoreSession).
func scoreByRules(_ answers: [String], level: String) -> SessionReport {
    let target = ["A1": 3, "A2": 5, "B1": 7, "B2": 9, "C1": 11, "C2": 13][level] ?? 5
    let words = answers.map { $0.split(separator: " ").map(String.init).filter { $0.test("[א-ת]") } }
    let total = words.reduce(0) { $0 + $1.count }
    let unique = Set(words.flatMap { $0 }.map { $0.sub("[^א-ת]", with: "") }).count
    let avg = answers.isEmpty ? 0 : Double(total) / Double(answers.count)
    let participation = min(100, Int((Double(answers.count) / 6 * 100).rounded()))
    let fluency = min(100, Int((avg / Double(target) * 100).rounded()))
    let vocabulary = min(100, Int((Double(unique) / Double(target * 3) * 100).rounded()))
    var tips: [String] = []
    if zip(answers, words).contains(where: { !$0.0.trimmed.isEmpty && $0.1.isEmpty }) { tips.append("Essaie de répondre en hébreu, même avec des mots simples : c'est en parlant qu'on progresse.") }
    if avg < Double(target) { tips.append("Fais des réponses un peu plus longues : vise environ \(target) mots par réponse à ton niveau.") }
    if answers.count < 6 { tips.append("Reste plus longtemps dans la conversation : 6 échanges ou plus.") }
    tips.append("Révise les nouveaux mots de la session dans « Moi › Vocabulaire ».")
    let s = answers.count > 1 ? "s" : ""
    return SessionReport(
        score: Int((Double(participation) * 0.3 + Double(fluency) * 0.4 + Double(vocabulary) * 0.3).rounded()),
        scoreExplanation: "Score calculé sans IA, sur ce que tu as dit : 30 % participation (nombre de réponses, objectif 6), 40 % longueur des réponses (objectif \(target) mots en hébreu au niveau \(level)), 30 % variété du vocabulaire.",
        participation: participation, vocabulary: vocabulary, fluency: fluency, tips: tips,
        summary: "Tu as fait \(answers.count) réponse\(s) avec \(total) mot\(total > 1 ? "s" : "") en hébreu, dont \(unique) différent\(unique > 1 ? "s" : "").")
}
