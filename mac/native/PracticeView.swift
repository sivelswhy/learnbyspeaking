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

    var g: Gender { store.profile!.g }
    var level: String { store.profile!.level }
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
                store.addSession(SessionRecord(id: "p-\(Int(Date().timeIntervalSince1970 * 1000))", date: nowISO(), scenarioId: "daily", title: "Entraînement · \(day.title)", seconds: max(30, s.seconds), turns: s.turns))
                nav.open(.day(day.id))
            }.buttonStyle(Btn(full: true)).frame(maxWidth: 384)
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
                    if case .intro(let fr) = step {
                        Button(action: next) {
                            ZStack(alignment: .bottom) {
                                VStack { Avatar(speaking: voice.speaking, size: 200) }.padding(.horizontal, 24).padding(.top, 40).padding(.bottom, 64)
                                Text(fr).font(.app(15, .semibold)).foregroundStyle(.white).multilineTextAlignment(.center)
                                    .padding(.horizontal, 12).padding(.vertical, 6).background(Color(hex: 0x2b2622, opacity: 0.85), in: RoundedRectangle(cornerRadius: 6))
                                    .padding(16)
                            }
                            .frame(maxWidth: 320).background(Palette.card, in: RoundedRectangle(cornerRadius: 24)).cardShadow()
                        }.buttonStyle(PressStyle())
                    } else { speak(step) }
                }.padding(.horizontal, 24)
            }
            Spacer()
            Column {
                Group {
                    if case .intro = step {
                        Text("TOUCHE POUR CONTINUER\(countdown.map { " · SUITE DANS \($0)…" } ?? "")").font(.app(14)).tracking(0.6).foregroundStyle(Palette.muted)
                    } else if heard != nil {
                        Button("Continuer", action: next).buttonStyle(Btn(full: true, height: 48))
                    } else {
                        Button("PASSER", action: next).buttonStyle(.plain).font(.app(14)).tracking(0.6).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, minHeight: 48)
                    }
                }.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 16)
            }
        }
    }

    private func lineOf(_ s: Step) -> Line? { if case .repeatLine(let l) = s { return l }; if case .answer(let q, _) = s { return q }; return nil }
    private func target(_ s: Step) -> String { if case .repeatLine(let l) = s { return l.he(g) }; if case .answer(_, let a) = s { return a.he(g) }; return "" }

    @ViewBuilder private func speak(_ step: Step) -> some View {
        let isRepeat: Bool = { if case .repeatLine = step { return true }; return false }()
        let line = lineOf(step)!
        let match = heard.map { wordMatch(target(step), $0) }
        VStack(spacing: 0) {
            Avatar(mood: match == nil ? .happy : match! >= 70 ? .cheer : .think, speaking: voice.speaking, size: 72)
            Text(voice.speaking ? "Écoute…" : ear.listening ? (isRepeat ? "Répète maintenant…" : "Réponds maintenant…") : ear.transcribing ? "Transcription…" : isRepeat ? "Répète" : "Réponds")
                .font(.app(18, .bold)).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 6)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: 6)).padding(.top, 16)
            Text(line.he(g)).font(.he(30, .semibold)).foregroundStyle(Palette.muted).multilineTextAlignment(.center).padding(.top, 24)
            Text(line.tr(g)).foregroundStyle(Palette.muted).padding(.top, 4)
            Text(line.fr).padding(.top, 24)
            if case .answer(_, let a) = step, hint || heard != nil {
                VStack(alignment: .leading, spacing: 2) {
                    Text("TU PEUX DIRE").font(.app(12, .semibold)).foregroundStyle(Palette.accent)
                    Text(a.he(g)).font(.he(18)).frame(maxWidth: .infinity, alignment: .trailing)
                    Text("\(a.tr(g)) — \(a.fr)").font(.app(14)).foregroundStyle(Palette.muted)
                }.padding(12).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 16)
            }
            if let heard {
                VStack(spacing: 2) {
                    Text("Compris : « \(heard) »").font(.app(14))
                    if let match {
                        Text("\(match)% des mots \(isRepeat ? "de la phrase" : "de l'exemple") retrouvés\(match >= 70 ? " — bravo !" : "")").font(.app(14)).foregroundStyle(match >= 70 ? Palette.good : Palette.muted)
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
                if case .answer = step { round("lightbulb", 48) { hint.toggle() } }
            }.padding(.top, 20)
        }
        .padding(24).frame(maxWidth: .infinity).background(Palette.card, in: RoundedRectangle(cornerRadius: 24)).cardShadow()
    }

    private func round(_ icon: String, _ size: CGFloat, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.system(size: 22)).foregroundStyle(Palette.accent).frame(width: size, height: size).background(Palette.bg, in: Circle()) }.buttonStyle(PressStyle(scale: 0.95))
    }

    // MARK: Déroulé

    private func play() {
        guard !finished else { return }
        let at = i
        let step = day.steps[i]
        if case .intro(let fr) = step {
            Task {
                await app.voice.sayFrench(fr)
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
        } else {
            listenAfter(lineOf(step)!.he(g), rate: Voice.rate(level))
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
    }

    private func next() {
        timer?.invalidate(); timer = nil; countdown = nil
        app.voice.stop()
        if ear.listening { ear.stop() }
        heard = nil; metrics = nil; hint = false
        if i + 1 >= day.steps.count {
            let turns = day.steps.filter { if case .intro = $0 { return false }; return true }.count
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
