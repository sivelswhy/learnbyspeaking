import SwiftUI

// components/SpeakingPractice.tsx : Shuli parle (sous-titres), puis l'apprenant répète ou répond à voix haute.

struct SpeakingPracticeView: View {
    let dayId: String
    @EnvironmentObject var app: AppModel
    var body: some View { PracticeBody(day: Content.allDays.first { $0.day.id == dayId }!.day, ear: app.ear, voice: app.voice) }
}

private struct PracticeBody: View {
    let day: Day
    @ObservedObject var ear: Ear
    @ObservedObject var voice: Voice
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @State private var i = 0
    @State private var heard: String?
    @State private var metrics: SpeechMetrics?
    @State private var hint = false
    @State private var countdown: Int?
    @State private var fluencies: [Int?] = []
    @State private var t0 = Date()
    @State private var summary: (fluency: Int?, seconds: Int, turns: Int, measured: Int)?
    @State private var timer: Timer?
    // Étape « écoute » : mauvaises réponses déjà essayées, bonne réponse trouvée.
    @State private var tried: [Int] = []
    @State private var solved = false
    @State private var replayed = false

    var g: Gender { (store.profile ?? NEW_PROFILE).g }
    var level: String { (store.profile ?? NEW_PROFILE).level }
    var finished: Bool { i >= day.steps.count }

    var body: some View {
        Group {
            if finished { done } else { stepView }
        }
        .background(Palette.bg)
        .onAppear { play() }
        .onDisappear { stopAll() }
    }

    private var done: some View {
        VStack(spacing: 16) {
            Avatar(mood: .cheer, size: 120)
            Text("Entraînement terminé !").font(.app(24, .bold))
            Text("Tu as pratiqué « \(day.title) ». Passe au jeu de rôle pour l'utiliser en vraie conversation.").foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            if let f = summary?.fluency {
                Text("Fluidité moyenne : \(f)/100 · \(summary!.measured) réponse(s) mesurée(s)").font(.app(14, .semibold)).foregroundStyle(Palette.accent)
                    .padding(.horizontal, 16).padding(.vertical, 8).background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
            }
            Button("Continuer") {
                let s = summary ?? (nil, 30, 0, 0)
                store.completeActivity(day.id, "speaking", fluency: s.fluency.map(Double.init))
                store.addWords(day.cards(g))
                store.addSession(SessionRecord(id: "p-\(Int(Date().timeIntervalSince1970 * 1000))", date: nowISO(), scenarioId: "daily", title: "Entraînement · \(day.title)", seconds: max(30, s.seconds), turns: s.turns))
                nav.open(.day(day.id))
            }.buttonStyle(Btn(full: true)).keyboardShortcut(.defaultAction).frame(maxWidth: 384)
        }.padding(24).frame(maxWidth: 768).frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder private var stepView: some View {
        let step = day.steps[i]
        VStack(spacing: 0) {
            Column { Header(title: day.title, onBack: { stopAll(); nav.open(.day(day.id)) }) }
            Column {
                HStack(spacing: 4) {
                    ForEach(day.steps.indices, id: \.self) { k in Capsule().fill(Palette.accent.opacity(k < i ? 1 : k == i ? 0.5 : 0.15)).frame(height: 4) }
                }.padding(.horizontal, 16).padding(.top, 4)
            }
            Spacer()
            Column {
                Group {
                    if case .intro(let fr, _) = step {
                        Button(action: next) {
                            ZStack(alignment: .bottom) {
                                VStack { Avatar(speaking: voice.speaking, size: 200) }.padding(.horizontal, 24).padding(.top, 40).padding(.bottom, 64)
                                Text(fr).font(.app(15, .semibold)).foregroundStyle(.white).multilineTextAlignment(.center)
                                    .padding(.horizontal, 12).padding(.vertical, 6).background(Color(hex: 0x2b2622, opacity: 0.85), in: RoundedRectangle(cornerRadius: 6))
                                    .padding(16)
                            }
                            .frame(maxWidth: 320).background(Palette.card, in: RoundedRectangle(cornerRadius: 24)).cardShadow()
                        }.buttonStyle(PressStyle())
                    } else if case .listen(let say, let ask, let options) = step { listenCard(say, ask, options) }
                    else { speak(step) }
                }.padding(.horizontal, 24)
            }
            Spacer()
            Column {
                Group {
                    if case .intro = step {
                        Text("TOUCHE POUR CONTINUER\(countdown.map { " · SUITE DANS \($0)…" } ?? "")").font(.app(14)).tracking(0.6).foregroundStyle(Palette.muted)
                    } else if case .listen = step {
                        if solved { Button("Continuer", action: next).buttonStyle(Btn(full: true, height: 48)).keyboardShortcut(.defaultAction) }
                        else { Button("PASSER", action: next).buttonStyle(.plain).font(.app(14)).tracking(0.6).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, minHeight: 48) }
                    } else if heard != nil {
                        Button("Continuer", action: next).buttonStyle(Btn(full: true, height: 48)).keyboardShortcut(.defaultAction)
                    } else {
                        Button("PASSER", action: next).buttonStyle(.plain).font(.app(14)).tracking(0.6).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, minHeight: 48)
                    }
                }.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 16)
            }
        }
    }

    /// Ce que demande chaque étape à micro : phrase affichée, phrase attendue, consigne, phrase dite par Shuli, aide.
    private struct Info { let shown: Line; let target: String; let verb: String; let say: String?; let help: Line? }
    private func info(_ s: Step) -> Info? {
        switch s {
        case .repeatLine(let l): return Info(shown: l, target: l.he(g), verb: "Répète", say: l.he(g), help: nil)
        case .answer(let q, let a): return Info(shown: q, target: a.he(g), verb: "Réponds", say: q.he(g), help: a)
        case .fill(let l, _): return Info(shown: l, target: l.he(g), verb: "Complète", say: nil, help: l)
        case .swap(_, let f, let t): return Info(shown: f, target: t.he(g), verb: "Transforme", say: f.he(g), help: t)
        case .free(let q, let e): return Info(shown: q, target: "", verb: "Réponds", say: q.he(g), help: e)
        default: return nil
        }
    }
    private func lineOf(_ s: Step) -> Line? { info(s)?.shown }

    /// Ordre mélangé (graine fixe) des réponses d'une étape « écoute ».
    private func order(_ n: Int) -> [Int] {
        var idx = Array(0..<n)
        var seed = (i + 1) * 7919 + day.id.count * 104729
        for k in stride(from: n - 1, to: 0, by: -1) { seed = (seed * 48271) % 2147483647; idx.swapAt(k, seed % (k + 1)) }
        return idx
    }

    @ViewBuilder private func listenCard(_ say: Line, _ ask: String, _ options: [ListenOption]) -> some View {
        VStack(spacing: 0) {
            Avatar(mood: solved ? .cheer : tried.isEmpty ? .happy : .think, speaking: voice.speaking, size: 72)
            Text(voice.speaking ? "Écoute…" : "Écoute et choisis").font(.app(18, .bold)).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 6)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: 6)).padding(.top, 16)
            Text(ask).foregroundStyle(Palette.muted).padding(.top, 16)
            VStack(spacing: 8) {
                ForEach(order(options.count), id: \.self) { k in
                    let o = options[k]
                    let wrong = tried.contains(k)
                    let right = solved && o.ok == true
                    Button {
                        if o.ok == true { solved = true } else { tried.append(k) }
                    } label: {
                        Text(o.fr).font(.app(16, .semibold)).strikethrough(wrong).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).padding(.horizontal, 16)
                            .foregroundStyle(right ? Color.white : wrong ? Palette.muted : Palette.ink)
                            .background(right ? Palette.good : Palette.bg, in: RoundedRectangle(cornerRadius: 12)).opacity(wrong ? 0.6 : 1)
                    }.buttonStyle(PressStyle(scale: 0.98)).disabled(solved || wrong)
                }
            }.padding(.top, 16)
            if !tried.isEmpty && !solved { Text("Pas tout à fait. Réécoute et réessaie.").font(.app(14)).foregroundStyle(Palette.muted).padding(.top, 12) }
            if solved {
                VStack(alignment: .leading, spacing: 2) {
                    Text("SHULI A DIT").font(.app(12, .semibold)).foregroundStyle(Palette.accent)
                    Text(say.he(g)).font(.he(18)).frame(maxWidth: .infinity, alignment: .trailing)
                    Text("\(say.tr(g)) — \(say.fr)").font(.app(14)).foregroundStyle(Palette.muted)
                }.padding(12).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 16)
            }
            round("arrow.counterclockwise", 48) { Task { await app.voice.say(say.he(g), rate: 0.75) } }.padding(.top, 20)
        }
        .padding(24).frame(maxWidth: .infinity).background(Palette.card, in: RoundedRectangle(cornerRadius: 24)).cardShadow()
    }

    @ViewBuilder private func speak(_ step: Step) -> some View {
        let inf = info(step)!
        let line = inf.shown
        let match = heard.map { wordMatch(inf.target, $0) }
        let gap: (he: String, tr: String)? = { if case .fill(let l, let b) = step { return (cut(l.he(g), b.he(g)), cut(l.tr(g), b.tr(g))) }; return nil }()
        let freeOk: Bool? = { if case .free = step, let h = heard { return hebrewWordCount(h) >= 2 }; return nil }()
        VStack(spacing: 0) {
            Avatar(mood: match == nil ? .happy : match! >= 70 ? .cheer : .think, speaking: voice.speaking, size: 72)
            Text(voice.speaking ? "Écoute…" : ear.listening ? "\(inf.verb) maintenant…" : ear.transcribing ? "Transcription…" : inf.verb)
                .font(.app(18, .bold)).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 6)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: 6)).padding(.top, 16)
            if case .swap(let instr, _, _) = step {
                Text(instr).font(.app(14, .semibold)).foregroundStyle(Palette.accent).padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 16)
            }
            if case .free = step { Text("Réponds avec tes vraies infos.").font(.app(14)).foregroundStyle(Palette.muted).padding(.top, 16) }
            Text(gap?.he ?? line.he(g)).font(.he(30, .semibold)).foregroundStyle(Palette.muted).multilineTextAlignment(.center).padding(.top, 24)
            Text(gap?.tr ?? line.tr(g)).foregroundStyle(Palette.muted).padding(.top, 4)
            Text(line.fr).padding(.top, 24)
            if let help = inf.help, hint || heard != nil {
                VStack(alignment: .leading, spacing: 2) {
                    Text(isFree(step) ? "PAR EXEMPLE" : "TU PEUX DIRE").font(.app(12, .semibold)).foregroundStyle(Palette.accent)
                    Text(help.he(g)).font(.he(18)).frame(maxWidth: .infinity, alignment: .trailing)
                    Text("\(help.tr(g)) — \(help.fr)").font(.app(14)).foregroundStyle(Palette.muted)
                }.padding(12).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 16)
            }
            if let heard {
                VStack(spacing: 2) {
                    Text("Compris : « \(heard) »").font(.app(14))
                    if let match {
                        Text("\(match)% des mots \(isAnswer(step) ? "de l'exemple" : "de la phrase") retrouvés\(match >= 70 ? " — bravo !" : "")").font(.app(14)).foregroundStyle(match >= 70 ? Palette.good : Palette.muted)
                    }
                    if let freeOk {
                        Text(freeOk ? "Bien : une vraie réponse, avec tes infos !" : "Essaie avec une phrase complète, au moins deux mots.").font(.app(14)).foregroundStyle(freeOk ? Palette.good : Palette.muted)
                    }
                    if let m = metrics {
                        Text("Fluidité \(fluencyScore(m, words: hebrewWordCount(heard), level: level).map { "\($0.score)" } ?? "—")\(m.wpm.map { " · \($0) mots/min" } ?? "") · \(m.pauses) pause\(m.pauses > 1 ? "s" : "") · réaction \(String(format: "%.1f", m.latency)) s")
                            .font(.app(12)).foregroundStyle(Palette.muted).padding(.top, 4)
                    }
                    Text("Le texte reconnu est mesuré, pas ton accent.").font(.app(12)).foregroundStyle(Palette.muted)
                }.padding(.top, 16)
            }
            HStack(spacing: 16) {
                round("arrow.counterclockwise", 48) { listenAfter(line.he(g), rate: 0.75) }
                Button { mic() } label: {
                    Image(systemName: ear.listening ? "pause.fill" : "mic.fill").font(.system(size: 34)).foregroundStyle(Palette.accent)
                        .frame(width: 80, height: 80).background(Palette.bg, in: Circle())
                        .overlay(Circle().stroke(Palette.accent.opacity(0.22), lineWidth: ear.listening ? 3 + ear.level * 16 : 0).padding(-(1.5 + ear.level * 8)))
                }.buttonStyle(PressStyle(scale: 0.96)).disabled(ear.transcribing)
                    .keyboardShortcut(.space, modifiers: [])
                if inf.help != nil { round("lightbulb", 48) { hint.toggle() } }
            }.padding(.top, 20)
        }
        .padding(24).frame(maxWidth: .infinity).background(Palette.card, in: RoundedRectangle(cornerRadius: 24)).cardShadow()
    }

    private func isFree(_ s: Step) -> Bool { if case .free = s { return true }; return false }
    private func isAnswer(_ s: Step) -> Bool { if case .answer = s { return true }; return false }
    /// Phrase à trou : le mot caché devient « ___ ».
    private func cut(_ text: String, _ word: String) -> String { !word.isEmpty && text.contains(word) ? text.replacingOccurrences(of: word, with: "___") : text }

    private func round(_ icon: String, _ size: CGFloat, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.system(size: 22)).foregroundStyle(Palette.accent).frame(width: size, height: size).background(Palette.bg, in: Circle()) }.buttonStyle(PressStyle(scale: 0.95))
    }

    // MARK: Déroulé

    private func play() {
        guard !finished else { return }
        let at = i
        let step = day.steps[i]
        if case .intro(let fr, let parts) = step {
            Task {
                await app.voice.sayIntro(parts, fr: fr, g: g, rate: 0.85)
                guard i == at else { return }
                countdown = 3
                timer?.invalidate()
                timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                    Task { @MainActor in
                        countdown = (countdown ?? 1) - 1
                        if (countdown ?? 0) <= 0 { next() }
                    }
                }
            }
        } else if case .listen(let say, _, _) = step {
            Task { await app.voice.say(say.he(g), rate: Voice.rate(level)) }
        } else if let say = info(step)?.say {
            listenAfter(say, rate: Voice.rate(level))
        }
    }

    /// Shuli dit la phrase, puis le micro s'ouvre (si on est toujours sur la même étape).
    private func listenAfter(_ text: String, rate: Double) {
        let at = i
        if ear.listening { ear.stop() }
        heard = nil
        Task {
            await app.voice.say(text, rate: rate)
            if i == at { await capture() }
        }
    }

    private func mic() {
        if ear.listening { ear.stop(); return }
        app.voice.stop(); heard = nil
        Task { await capture() }
    }

    private func capture() async {
        guard let r = try? await app.ear.listen() else { return }
        heard = r.text
        metrics = analyzeSpeech(r.audio, words: hebrewWordCount(r.text))
        fluencies.append(fluencyScore(metrics, words: hebrewWordCount(r.text), level: level)?.score)
        // Comme un professeur : si on est loin du modèle, on le redit lentement (une fois par étape), puis on laisse réessayer.
        if i < day.steps.count, let t = info(day.steps[i])?.target, !t.isEmpty, wordMatch(t, r.text) < 60, !replayed {
            replayed = true
            await app.voice.say(t, rate: 0.7)
        }
    }

    private func next() {
        timer?.invalidate(); timer = nil; countdown = nil
        app.voice.stop()
        if ear.listening { ear.stop() }
        heard = nil; metrics = nil; hint = false; tried = []; solved = false; replayed = false
        if i + 1 >= day.steps.count {
            let turns = day.steps.filter { switch $0 { case .intro, .listen: return false; default: return true } }.count
            summary = (avgFluency(fluencies), Int(Date().timeIntervalSince(t0)), turns, fluencies.compactMap { $0 }.count)
        }
        i += 1
        play()
    }

    private func stopAll() {
        timer?.invalidate()
        app.voice.stop()
        if ear.listening { ear.stop() }
    }
}
