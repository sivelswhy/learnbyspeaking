import SwiftUI

// components/Placement.tsx : intro (anneaux ondulés), test adaptatif mené comme une discussion, rapport.

struct PlacementView: View {
    let onboarding: Bool
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @State private var phase = "intro"
    @State private var result: PlacementResult?

    var body: some View {
        let p = (store.profile ?? NEW_PROFILE)
        Group {
            switch phase {
            case "intro":
                PlacementIntro(gender: p.gender, askGender: onboarding, onGender: { store.profile?.gender = $0 },
                               onStart: { phase = "test" }, onSkip: skip)
            case "report":
                PlacementReport(r: result!, g: p.g) { level in
                    var r = result!
                    if level != r.level { r.estimatedLevel = r.level; r.level = level }
                    done(r)
                }
            default:
                PlacementTest(profile: p, ear: app.ear, voice: app.voice, onExit: onboarding ? nil : { nav.home() }) { r in result = r; phase = "report" }
            }
        }
    }
    private func skip() {
        if onboarding { store.profile?.onboarding = "goal" } else { nav.home() }
    }
    private func done(_ r: PlacementResult) {
        store.placement = r
        store.profile?.level = r.level
        store.profile?.placementDone = true
        store.profile?.onboarding = onboarding ? "goal" : nil
        if !onboarding { nav.home() }
    }
}

/// Anneau ondulé : cercle déformé par quelques harmoniques.
private func wavyPath(_ r: Double, _ amp: Double, _ k: Double, _ phase: Double) -> Path {
    var p = Path()
    for i in 0...96 {
        let a = Double(i) / 96 * .pi * 2
        let rr = r + amp * sin(k * a + phase) + amp * 0.6 * sin((k + 2) * a - phase * 1.7)
        let pt = CGPoint(x: 100 + rr * cos(a), y: 100 + rr * sin(a))
        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
    p.closeSubpath()
    return p
}

private struct PlacementIntro: View {
    let gender: Gender?
    let askGender: Bool
    let onGender: (Gender) -> Void
    let onStart: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text("Découvre ton niveau d'hébreu en 3 minutes").font(.app(30, .bold)).multilineTextAlignment(.center).padding(.top, 40)
            Spacer()
            ZStack {
                TimelineView(.animation) { tl in
                    let t = tl.date.timeIntervalSinceReferenceDate
                    Canvas { ctx, sz in
                        let k = min(sz.width, sz.height) / 200
                        ctx.scaleBy(x: k, y: k)
                        let grad = GraphicsContext.Shading.linearGradient(Gradient(colors: [Color(hex: 0xffd166), Color(hex: 0xf29b2f), Color(hex: 0x46b97f)]), startPoint: .zero, endPoint: CGPoint(x: 200, y: 200))
                        for i in 0..<18 {
                            // rotation de 0 à 8° et échelle 1 → 1,04, cycle de 7 s décalé par anneau
                            let ph = (sin((t + Double(i) * 0.35) / 7 * 2 * .pi) + 1) / 2
                            var c = ctx
                            c.translateBy(x: 100, y: 100); c.rotate(by: .degrees(8 * ph)); c.scaleBy(x: 1 + 0.04 * ph, y: 1 + 0.04 * ph); c.translateBy(x: -100, y: -100)
                            c.opacity = 0.35 + Double(i % 3) * 0.12
                            c.stroke(wavyPath(62 + Double(i % 6) * 1.6, 3 + Double(i % 4), 3 + Double(i % 3), Double(i) * 0.45), with: grad, lineWidth: 0.6)
                        }
                    }
                }
                VStack(spacing: 12) {
                    HStack(spacing: 3) { ForEach([14, 26, 40, 26, 16], id: \.self) { h in Capsule().fill(.white).frame(width: 6, height: CGFloat(h)) } }
                    Text("LearnBySpeaking").font(.app(26, .bold))
                }
            }.frame(width: 288, height: 288)
            Spacer()
            Text("6 questions à l'oral, de A1 à B2").font(.app(18, .semibold)).foregroundStyle(Color(hex: 0xffd166)).padding(.top, 8)
            Text("Notée par l'IA, sur ton appareil").font(.app(14)).foregroundStyle(Color(hex: 0xcfe9dc, opacity: 0.8)).padding(.bottom, 16)
            VStack(spacing: 0) {
                if askGender {
                    VStack(spacing: 8) {
                        Text("En hébreu, Shuli s'adresse à toi au…").font(.app(14, .medium))
                        HStack(spacing: 8) {
                            ForEach([(Gender.m, "Masculin"), (.f, "Féminin")], id: \.0) { g, label in
                                Button { onGender(g) } label: {
                                    Text(label).font(.app(14, .semibold)).frame(maxWidth: .infinity, minHeight: 44)
                                        .foregroundStyle(gender == g ? Palette.accent : .white)
                                        .background(gender == g ? .white : .clear, in: Capsule())
                                        .overlay(Capsule().stroke(gender == g ? .white : .white.opacity(0.5)))
                                }.buttonStyle(PressStyle())
                            }
                        }
                    }.frame(maxWidth: 448).padding(.bottom, 16)
                }
                Button(action: onStart) {
                    Text(askGender && gender == nil ? "Choisis d'abord ci-dessus" : "Démarrer").font(.app(18, .semibold)).foregroundStyle(Palette.accent)
                        .frame(maxWidth: 448, minHeight: 56).background(.white, in: Capsule())
                }.buttonStyle(PressStyle()).disabled(askGender && gender == nil).opacity(askGender && gender == nil ? 0.5 : 1)
                    .keyboardShortcut(.return, modifiers: [])
                // Au premier lancement le test est obligatoire : pas de « Plus tard » (gardé quand on l'ouvre depuis l'app).
                if !askGender { Button("Plus tard", action: onSkip).buttonStyle(.plain).font(.app(14)).underline().foregroundStyle(.white.opacity(0.8)).frame(minHeight: 44).padding(.top, 8) }
            }.padding(.bottom, 16)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LinearGradient(colors: [Color(hex: 0x3f9a77), Color(hex: 0x1f6f50), Color(hex: 0x14513a)], startPoint: .top, endPoint: .bottom))
    }
}

// MARK: - Test

private struct PTurn { var answer: String; var score: AnswerScore?; var speech: SpeechMetrics?; var reaction: String? }
private struct Aside: Hashable { var me: Bool; var text: String }

private let clockFmt: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH:mm"; return f }()

private struct PlacementTest: View {
    let profile: Profile
    @ObservedObject var ear: Ear
    @ObservedObject var voice: Voice
    let onExit: (() -> Void)?
    let onFinish: (PlacementResult) -> Void
    @EnvironmentObject var app: AppModel
    @State private var qs: [PlacementQuestion] = []
    @State private var i = 0
    @State private var times: [String] = [clockFmt.string(from: Date())]
    @State private var turns: [PTurn] = []
    @State private var asides: [Int: [Aside]] = [:]
    @State private var revealed = false
    @State private var showTr = false
    @State private var showEx = false
    @State private var typing = false
    @State private var thinking = false
    @State private var text = ""

    var g: Gender { profile.g }
    var bank: [PlacementQuestion] { C.placement }
    var q: PlacementQuestion? { i < qs.count ? qs[i] : nil }
    var done: Bool { turns.count > i }

    var body: some View {
        VStack(spacing: 0) {
            Column { Header(title: "Test de niveau", onBack: onExit) }
            Column {
                let est = estimate()
                let frac = min(1, Double(turns.count) / Double(MAX_QUESTIONS))
                VStack(spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Question \(min(i + 1, MAX_QUESTIONS))").font(.app(14, .semibold))
                        Text("sur \(MIN_QUESTIONS) à \(MAX_QUESTIONS)").font(.app(14)).foregroundStyle(Palette.muted)
                        Spacer()
                        Text("Fiabilité \(confidence(est)) %").font(.app(14)).foregroundStyle(Palette.muted)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.accent.opacity(0.15))
                            Capsule().fill(LinearGradient(colors: [Palette.accent.opacity(0.7), Palette.accent], startPoint: .leading, endPoint: .trailing))
                                .frame(width: geo.size.width * frac)
                                .animation(.easeOut(duration: 0.5), value: frac)
                            ForEach(1..<MAX_QUESTIONS, id: \.self) { k in
                                Rectangle().fill(Palette.bg.opacity(0.7)).frame(width: 2).offset(x: geo.size.width * Double(k) / Double(MAX_QUESTIONS) - 1)
                            }
                        }.clipShape(Capsule())
                    }.frame(height: 10)
                }.padding(.horizontal, 24).padding(.top, 8)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    Column {
                        VStack(alignment: .leading, spacing: 16) {
                            ForEach(qs.indices, id: \.self) { k in questionBlock(k) }
                            Color.clear.frame(height: 1).id("bottom")
                        }.padding(16)
                    }
                }
                .onChange(of: turns.count) { _ in withAnimation { proxy.scrollTo("bottom") } }
                .onChange(of: asides) { _ in withAnimation { proxy.scrollTo("bottom") } }
                .onChange(of: turns.last?.reaction) { _ in withAnimation { proxy.scrollTo("bottom") } }
            }
            Column { bottom.padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 12) }.background(Palette.bg)
        }
        .background(Palette.bg)
        .onAppear {
            if qs.isEmpty { let k = pickNext(prior(), bank.map(itemOf)); if k >= 0 { qs = [bank[k]] }; sayQuestion() }
        }
        .onDisappear { app.voice.stop(); if ear.listening { ear.stop() } }
    }

    private func estimate() -> Estimate {
        estimateFrom(turns.enumerated().map { (itemOf(qs[$0.offset]), Double($0.element.score?.score ?? 0) / 100) })
    }

    private func say(_ t: String) { Task { await app.voice.say(t, rate: Voice.rate(profile.level)) } }
    private func sayQuestion() { if let q, !done { say(q.text(g)) } }

    @ViewBuilder private func questionBlock(_ k: Int) -> some View {
        let qq = qs[k]
        let t: PTurn? = k < turns.count ? turns[k] : nil
        let current = k == i
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Avatar(mood: t == nil ? (current && ear.listening ? .wow : .happy) : t!.score == nil ? .think : t!.score!.score >= 75 ? .cheer : t!.score!.score >= 40 ? .happy : .sad, size: 36)
                    Text("Shuli").font(.app(14, .medium))
                    Text(times[min(k, times.count - 1)]).font(.app(14)).foregroundStyle(Palette.muted)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Button { revealed = true } label: {
                        Text(qq.text(g)).font(.he(20)).frame(maxWidth: .infinity, alignment: .trailing)
                            .blur(radius: current && !revealed && !done ? 8 : 0)
                    }.buttonStyle(.plain).disabled(!current || revealed)
                    if !current || revealed || done { Text(qq.transliteration(g)).font(.app(14)).foregroundStyle(Palette.muted) }
                    if current && (showTr || k < i) || k < i { Text(qq.translation[profile.native] ?? qq.translation["fr"] ?? "").font(.app(14)) }
                    if current && !done {
                        HStack(spacing: 12) {
                            Button { Task { await app.voice.say(qq.text(g), rate: 0.8) } } label: { Label("Écouter", systemImage: "speaker.wave.2") }
                            if !revealed { Button { revealed = true } label: { Label("Afficher", systemImage: "eye") } }
                            Button { showTr.toggle() } label: { Label("Traduire", systemImage: "character.bubble") }
                            Button { showEx.toggle() } label: { Label("Exemple", systemImage: "lightbulb") }
                        }.buttonStyle(.plain).font(.app(14, .medium)).frame(minHeight: 36).padding(.top, 8)
                    }
                    if current && showEx && !done {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(qq.sample.he(g)).font(.he(16)).frame(maxWidth: .infinity, alignment: .trailing)
                            Text(qq.sample.tr(g)).font(.app(14))
                        }.padding(12).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 8)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).card()
            }
            ForEach(Array((asides[k] ?? []).enumerated()), id: \.offset) { _, x in
                if x.me {
                    Text(x.text.isEmpty ? "…" : x.text).font(.he(16)).foregroundStyle(.white)
                        .padding(.horizontal, 16).padding(.vertical, 8).background(Palette.accent.opacity(0.8), in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 16, topTrailingRadius: 6))
                        .frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 80)
                } else { shuliSays(x.text, mood: .happy) }
            }
            if current && thinking { Text("Shuli réfléchit…").font(.app(14)).foregroundStyle(Palette.muted) }
            if let t {
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 8) {
                        Text("moi").font(.app(14)).foregroundStyle(Palette.muted)
                        Text(String((profile.name ?? "?").prefix(1)).uppercased()).font(.app(12, .bold)).foregroundStyle(Palette.accent).frame(width: 28, height: 28).background(Palette.soft, in: Circle())
                    }
                    Text(t.answer.isEmpty ? "—" : t.answer).font(.he(18)).foregroundStyle(.white)
                        .padding(.horizontal, 16).padding(.vertical, 12).background(Palette.accent, in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 16, topTrailingRadius: 6))
                }.frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 80)
                if let r = t.reaction { shuliSays(r, mood: (t.score?.score ?? 0) >= 55 ? .cheer : .happy) }
                PFeedback(t: t, q: qq, g: g, say: { say($0) })
            }
        }
    }

    private func shuliSays(_ text: String, mood: Mood) -> some View {
        ShuliBubble(text: text, mood: mood, say: { say($0) })
    }

    @ViewBuilder private var bottom: some View {
        if done {
            Button(turns[i].reaction == nil ? "Shuli t'écoute…" : "Continuer", action: next).buttonStyle(Btn(full: true, height: 56, fontSize: 16)).disabled(turns[i].reaction == nil)
                .keyboardShortcut(.return, modifiers: [])
        } else {
            VStack(spacing: 8) {
                if typing {
                    HStack(spacing: 8) {
                        TextField("Écris en hébreu…", text: $text).textFieldStyle(.plain).padding(.horizontal, 12).frame(minHeight: 48)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                            .onSubmit { if !text.trimmed.isEmpty { answer(text.trimmed, nil) } }
                        Button("OK") { answer(text.trimmed, nil) }.buttonStyle(Btn()).disabled(text.trimmed.isEmpty)
                    }
                } else {
                    if ear.listening { LivePanel(level: ear.level) }
                    Button { mic() } label: {
                        Label(ear.transcribing ? "Transcription…" : ear.listening ? "Je t'écoute… appuie pour terminer" : "Appuie pour enregistrer (espace)",
                              systemImage: ear.listening ? "stop.fill" : "waveform")
                            .font(.app(16, .semibold)).foregroundStyle(Palette.accent).frame(maxWidth: .infinity, minHeight: 56)
                            .background(Palette.soft, in: Capsule())
                            .shadow(color: Palette.accent.opacity(ear.listening ? 0.25 : 0), radius: 0, x: 0, y: 0)
                            .overlay(Capsule().stroke(Palette.accent.opacity(0.25), lineWidth: ear.listening ? 2 + ear.level * 10 : 0))
                    }.buttonStyle(PressStyle()).disabled(ear.transcribing || thinking).keyboardShortcut(.space, modifiers: [])
                }
                HStack {
                    Button { typing.toggle() } label: { Label(typing ? "Parler plutôt" : "Écrire", systemImage: "keyboard") }
                    Spacer()
                    Button("Je ne sais pas") { answer("", nil) }
                }.buttonStyle(.plain).font(.app(14)).foregroundStyle(Palette.muted).frame(minHeight: 36)
            }
        }
    }

    private func mic() {
        if ear.listening { ear.stop(); return }
        app.voice.stop()
        Task {
            guard let r = try? await app.ear.listen() else { return }
            answer(r.text, analyzeSpeech(r.audio, words: hebrewWordCount(r.text)))
        }
    }

    private func answer(_ a: String, _ speech: SpeechMetrics?) {
        guard let q, !done, !thinking else { return }
        let k = i
        let question = q.text(g)
        text = ""; typing = false
        // Comme un humain : ce qui n'est pas une réponse reçoit une réplique, et la question reste ouverte.
        let retries = (asides[k] ?? []).filter(\.me).count
        let kind = classify(a, retries: retries)
        if kind != .answer {
            asides[k, default: []].append(Aside(me: true, text: a))
            if kind == .clarify { showTr = true }
            if kind == .french { showEx = true }
            thinking = true
            Task {
                let line = await app.llm.shuliLine(kind: kind, question: question, said: a, g: g, level: profile.level)
                asides[k, default: []].append(Aside(me: false, text: line))
                thinking = false
                say(line)
            }
            return
        }
        turns.append(PTurn(answer: a, speech: speech))
        Task {
            let ai = try? await app.llm.judge(question: question, answer: a, female: g == .f)
            let score = scoreAnswer(q, a, ai ?? nil, speech)
            // Hors sujet : Shuli réagit et repose la question une fois ; la réponse suivante est notée.
            if let ai = ai ?? nil, ai.relevance < 0.25, retries < 2, !dontKnow(a) {
                let line = await app.llm.shuliLine(kind: .offTopic, question: question, said: a, g: g, level: profile.level)
                turns.removeLast()
                asides[k, default: []] += [Aside(me: true, text: a), Aside(me: false, text: line)]
                say(line)
                return
            }
            turns[k].score = score
            let reaction = await app.llm.shuliLine(kind: .answer, question: question, said: a, g: g, level: profile.level, score: score.score)
            turns[k].reaction = reaction
            say(reaction)
        }
    }

    private func next() {
        let est = estimate()
        let pool = bank.filter { b in !qs.contains(b) }
        if !shouldStop(est, qs.count) && !pool.isEmpty {
            qs.append(pool[pickNext(est, pool.map(itemOf), seed: qs.count)])
            i += 1
            times.append(clockFmt.string(from: Date()))
            revealed = false; showTr = false; showEx = false
            sayQuestion()
            return
        }
        let sc = turns.compactMap(\.score)
        func avg(_ f: (AnswerScore) -> Int) -> Double { Double((Double(sc.map(f).reduce(0, +)) / Double(max(1, sc.count))).rounded()) }
        let ai = sc.contains { $0.ai }
        let measured = turns.filter { $0.speech != nil && $0.score?.fluency != nil }
        let mean = { (f: (SpeechMetrics) -> Double) in measured.map { f($0.speech!) }.reduce(0, +) / Double(max(1, measured.count)) }
        let wpms = measured.compactMap { $0.speech!.wpm }
        var axes: [String: Double?] = ["relevance": avg(\.relevance), "development": avg(\.development), "vocabulary": avg(\.vocabulary)]
        axes["grammar"] = ai ? avg { $0.grammar ?? 0 } : nil
        axes["fluency"] = avgFluency(sc.map(\.fluency)).map(Double.init)
        var voiceStats: [String: Double?]?
        if !measured.isEmpty {
            voiceStats = ["wpm": wpms.isEmpty ? nil : Double((Double(wpms.reduce(0, +)) / Double(wpms.count)).rounded()),
                          "pauseRatio": mean { $0.pauseRatio }, "longPauses": (mean { Double($0.longPauses) } * 10).rounded() / 10,
                          "latency": (mean { $0.latency } * 10).rounded() / 10, "spoken": Double(measured.count)]
        }
        onFinish(PlacementResult(date: nowISO(), level: levelOf(est.theta), axes: axes, ai: ai,
                                 answers: turns.enumerated().map { k, t in PlacementAnswer(question: qs[k].text(g), answer: t.answer, score: t.score?.score ?? 0, fluency: t.score?.fluency, wpm: t.speech?.wpm) },
                                 theta: (est.theta * 100).rounded() / 100, confidence: confidence(est), voice: voiceStats))
    }
}

/// Analyse en direct pendant l'enregistrement : ondes, durée, temps parlé, pauses.
private struct LivePanel: View {
    let level: Double
    @State private var t0 = Date()
    @State private var bars = [Double](repeating: 0, count: 28)
    @State private var speech = 0.0
    @State private var pauses = 0
    @State private var spoke = false
    @State private var voiced = false
    @State private var inPause = false
    @State private var lastVoice = Date()
    @State private var now = Date()
    private let tick = Timer.publish(every: 0.08, on: .main, in: .common).autoconnect()

    var body: some View {
        let silent = spoke ? now.timeIntervalSince(lastVoice) : 0
        VStack(spacing: 4) {
            HStack(spacing: 3) {
                ForEach(bars.indices, id: \.self) { k in
                    Capsule().fill(Palette.accent).frame(width: 4, height: max(4, min(40, bars[k] * 60))).opacity(0.35 + Double(k) / Double(bars.count) * 0.65)
                }
            }.frame(height: 40)
            HStack {
                Text("\(Int(now.timeIntervalSince(t0))) s"); Spacer(); Text("Parlé : \(Int(speech)) s"); Spacer(); Text("Pauses : \(pauses)")
            }.font(.app(12)).foregroundStyle(Palette.muted)
            Text(!spoke ? "Prends ton temps, lance-toi quand tu es prêt." : silent > 1 ? "Continue, ajoute un détail ou termine ta phrase." : voiced ? "Je t'entends bien." : "…")
                .font(.app(14, .medium))
        }
        .card(12)
        .onReceive(tick) { d in
            let dt = d.timeIntervalSince(now); now = d
            voiced = level > (voiced ? 0.1 : 0.16)
            if voiced { spoke = true; speech += dt; lastVoice = d; inPause = false }
            else if spoke && !inPause && d.timeIntervalSince(lastVoice) >= 0.25 { inPause = true; pauses += 1 }
            bars.append(level); bars.removeFirst()
        }
    }
}

private struct PFeedback: View {
    let t: PTurn
    let q: PlacementQuestion
    let g: Gender
    let say: (String) -> Void
    var body: some View {
        if let sc = t.score {
            let verdict = sc.score >= 75 ? "Très bien !" : sc.score >= 55 ? "Bien joué !" : sc.words > 0 ? "Bon début !" : "Pas de souci, voici un modèle."
            let notes = notesFor(sc)
            VStack(alignment: .leading, spacing: 8) {
                if let m = t.speech, let f = sc.fluency {
                    HStack(spacing: 6) {
                        ForEach([("Fluidité", "\(f)"), ("Débit", m.wpm.map { "\($0)/min" } ?? "—"), ("Pauses", "\(m.pauses)"), ("Réaction", String(format: "%.1f s", m.latency))], id: \.0) { l, v in
                            VStack(spacing: 0) { Text(v).font(.app(16, .bold)).foregroundStyle(Palette.accent); Text(l).font(.app(11)).foregroundStyle(Palette.muted) }
                                .frame(maxWidth: .infinity).padding(.vertical, 6).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
                HStack {
                    Avatar(mood: sc.score >= 75 ? .cheer : sc.score >= 55 ? .happy : sc.words > 0 ? .wink : .sad, size: 40)
                    Text(verdict).font(.app(14, .semibold))
                    Spacer()
                    Text("\(sc.score)/100").font(.app(14, .semibold)).foregroundStyle(Palette.accent)
                }
                ForEach(notes, id: \.self) { Text("• \($0)").font(.app(14)) }
                if let c = sc.correction {
                    Text("Correction proposée par l'IA").font(.app(14, .semibold))
                    Text(c).font(.he(16)).frame(maxWidth: .infinity, alignment: .trailing)
                    Text("L'IA peut se tromper : vérifie avec l'exemple.").font(.app(12)).foregroundStyle(Palette.muted)
                }
                (Text("Conseil : ").bold() + Text(q.tip)).font(.app(14))
                VStack(alignment: .leading, spacing: 2) {
                    Text("EXEMPLE").font(.app(12, .semibold)).foregroundStyle(Palette.accent)
                    HStack {
                        Button { say(q.sample.he(g)) } label: { Image(systemName: "speaker.wave.2").foregroundStyle(Palette.accent) }.buttonStyle(.plain)
                        Text(q.sample.he(g)).font(.he(16)).frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    Text(q.sample.tr(g)).font(.app(14)).foregroundStyle(Palette.muted)
                    Text(q.sample.fr).font(.app(14))
                }.padding(12).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12))
            }.frame(maxWidth: .infinity, alignment: .leading).card()
        } else {
            Text("Shuli analyse ta réponse…").font(.app(14)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, alignment: .leading).card()
        }
    }
    private func notesFor(_ sc: AnswerScore) -> [String] {
        var n: [String] = []
        if sc.words > 0 {
            n.append(sc.relevance >= 50 ? "Tu réponds bien à la question." : "Ta réponse ne semble pas répondre à la question : relis-la, ou touche « Traduire ».")
            if let gr = sc.grammar {
                let fixes = gr < 60 ? concreteFixes(t.answer, g, sc.correction) : []
                if fixes.isEmpty { if gr >= 60 { n.append("Ta phrase semble correcte.") } } else { n.append(contentsOf: fixes.map(fixText)) }
            }
            if sc.development < 100 { n.append("Développe un peu plus : ajoute un détail, ou une deuxième idée avec ו (et) ou כי (parce que).") }
        } else if !t.answer.isEmpty {
            n.append("Je n'ai pas trouvé d'hébreu dans ta réponse : essaie de répondre en hébreu, même avec deux mots.")
        }
        if let h = sc.fluencyHint { n.append(h) }
        return n
    }
}

// MARK: - Rapport

private let LEVEL_TEXT = [
    "A1": "Tu sais te présenter et répondre à des questions très simples.",
    "A2": "Tu te débrouilles dans les situations du quotidien avec des phrases simples.",
    "B1": "Tu peux raconter et expliquer tes choix avec des phrases reliées.",
    "B2": "Tu t'exprimes avec aisance, même sur des hypothèses.",
    "C1": "Tu t'exprimes avec aisance et nuance.",
    "C2": "Ton niveau est proche de celui d'un natif.",
]
private let SCORING = "Chaque réponse est notée par l'IA (Gemma, sur ton Mac) et par des règles : 35 % pertinence (l'IA juge si tu réponds à la question, sans tenir compte des fautes), 45 % grammaire (l'IA juge si la phrase est correcte et propose une correction), 10 % développement (réponse assez fournie pour le niveau), 10 % vocabulaire (60 % variété des mots, 40 % mots avancés au-delà du vocabulaire de base) ; quand ta voix est mesurée, 10 % viennent de ta fluidité (pauses, hésitations, débit, temps de réaction). Une réponse à côté de la question est plafonnée à 25. Les questions sont choisies une à une selon tes réponses (test adaptatif) : ton niveau est l'estimation statistique de ta compétence, avec sa fiabilité. L'IA peut se tromper, surtout sur la grammaire ; la prononciation n'est pas notée."
private let SCORING_NO_AI = "Notation par règles seulement, sans IA : 35 % développement, 25 % vocabulaire (variété et mots avancés), 40 % pertinence (présence des mots ou formes attendus). Une réponse sans les mots attendus est plafonnée à 30. La grammaire et la prononciation ne sont pas notées."

struct PlacementReport: View {
    let r: PlacementResult
    let g: Gender
    let onContinue: (String) -> Void
    @State private var chosen: String?
    private let LEVEL_LIST = ["A1", "A2", "B1", "B2", "C1", "C2"]

    private var radarValues: [(label: String, v: Int)] {
        func ax(_ k: String) -> Int { Int((r.axes[k] ?? nil) ?? 0) }
        var v: [(label: String, v: Int)] = [("Pertinence", ax("relevance"))]
        if (r.axes["grammar"] ?? nil) != nil { v.append(("Grammaire", ax("grammar"))) }
        if (r.axes["fluency"] ?? nil) != nil { v.append(("Fluidité", ax("fluency"))) }
        v.append(("Développement", ax("development")))
        v.append(("Vocabulaire", ax("vocabulary")))
        return v
    }
    @State private var tab = "report"
    @State private var filter = "all"

    var body: some View {
        let list = r.answers.enumerated().filter { filter == "all" || $0.element.score < 55 }
        let toReview = r.answers.filter { $0.score < 55 }.count
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                Column {
                    VStack(spacing: 8) {
                        HStack {
                            Color.clear.frame(width: 44, height: 44)
                            Text("Rapport d'expression orale").font(.app(16, .bold)).frame(maxWidth: .infinity)
                            ShareLink(item: "Niveau estimé : \(r.level). \(LEVEL_TEXT[r.level] ?? "")") {
                                Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44).background(Palette.card, in: Circle()).cardShadow()
                            }.buttonStyle(.plain)
                        }.padding(.horizontal, 16).padding(.top, 12)
                        HStack(spacing: 0) {
                            ForEach([("report", "Rapport"), ("answers", "Mes réponses")], id: \.0) { k, l in
                                Button { tab = k } label: {
                                    Text(l).font(.app(15, tab == k ? .semibold : .regular)).foregroundStyle(tab == k ? Palette.ink : Palette.muted)
                                        .padding(.vertical, 8).overlay(alignment: .bottom) { if tab == k { Rectangle().fill(Palette.ink).frame(height: 2) } }
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                }.buttonStyle(.plain)
                            }
                        }.overlay(alignment: .bottom) { Rectangle().fill(Palette.line).frame(height: 1) }
                    }
                }
                ScrollView {
                    Column {
                        VStack(spacing: 16) {
                            if tab == "report" {
                                VStack(spacing: 4) {
                                    Text("Niveau").font(.app(16, .medium))
                                    Text(r.level).font(.app(48, .bold)).foregroundStyle(Palette.accent)
                                    Text(LEVEL_TEXT[r.level] ?? "").font(.app(14)).foregroundStyle(Palette.muted).multilineTextAlignment(.center).frame(maxWidth: 320)
                                    Radar(values: radarValues)
                                    if let c = r.confidence {
                                        (Text("Fiabilité de l'estimation : \(c) % ").font(.app(14, .medium)) + Text("(\(r.answers.count) questions choisies pour toi)").font(.app(14)).foregroundColor(Palette.muted))
                                    }
                                    if let v = r.voice { VoiceBox(v: v) }
                                    Text(r.ai == true ? SCORING : SCORING_NO_AI).font(.app(12)).foregroundStyle(Palette.muted).multilineTextAlignment(.center).padding(.top, 12)
                                }.frame(maxWidth: .infinity).card()
                            }
                            VStack(alignment: .leading, spacing: 0) {
                                (Text(tab == "report" ? "Conseils d'amélioration " : "Mes réponses ").font(.app(16, .semibold)) + Text("(\(r.answers.count))").font(.app(14))).padding(.horizontal, 16)
                                HStack(spacing: 20) {
                                    ForEach([("all", "Toutes"), ("review", "À revoir (\(toReview))")], id: \.0) { f, l in
                                        Button { filter = f } label: {
                                            Text(l).font(.app(15)).foregroundStyle(filter == f ? Palette.accent : Palette.muted).frame(minHeight: 40)
                                                .overlay(alignment: .bottom) { Rectangle().fill(filter == f ? Palette.accent : .clear).frame(height: 2) }
                                        }.buttonStyle(.plain)
                                    }
                                    Spacer()
                                }.padding(.horizontal, 16).padding(.top, 8).overlay(alignment: .bottom) { Rectangle().fill(Palette.line).frame(height: 1) }
                                VStack(spacing: 12) {
                                    if list.isEmpty { Text("Rien à revoir, bravo !").font(.app(14)).foregroundStyle(Palette.muted).padding(.vertical, 16) }
                                    ForEach(list, id: \.offset) { k, a in AnswerItem(k: k, a: a, tab: tab, g: g) }
                                }.padding(.horizontal, 16).padding(.top, 12)
                            }.padding(.vertical, 16).background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).cardShadow()
                        }.padding(16).padding(.bottom, 112)
                    }
                }
            }
            VStack(spacing: 8) {
                let idx = LEVEL_LIST.firstIndex(of: r.level) ?? 0
                if tab == "report" && idx > 0 {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Le test te met \(r.level). Tu préfères démarrer plus bas ?").font(.app(14, .semibold))
                        Text("Un niveau plus bas rend les exercices plus faciles pour prendre confiance. Tu pourras refaire le test quand tu veux.").font(.app(12)).foregroundStyle(Palette.muted)
                        HStack(spacing: 8) {
                            ForEach(Array(LEVEL_LIST.prefix(idx + 1)), id: \.self) { l in
                                Button(l == r.level ? "\(l) · test" : l) { chosen = l }.buttonStyle(ChipStyle(active: (chosen ?? r.level) == l))
                            }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).card()
                }
                Button("Fixer mon objectif et progresser") { onContinue(chosen ?? r.level) }.buttonStyle(Btn(full: true, height: 56, fontSize: 16))
            }
                .frame(maxWidth: 768).padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 16).frame(maxWidth: .infinity)
                .background(LinearGradient(colors: [Palette.bg.opacity(0), Palette.bg, Palette.bg], startPoint: .top, endPoint: .bottom))
        }.background(Palette.bg)
    }
}

private struct AnswerItem: View {
    let k: Int
    let a: PlacementAnswer
    let tab: String
    let g: Gender
    var body: some View {
        let q = C.placement.first { $0.text(.m) == a.question || $0.text(.f) == a.question }
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(k + 1).").font(.app(16, .medium))
                Text(a.question).font(.he(16, .medium))
                Spacer()
                Text("\(a.score)").underline().font(.app(14, .semibold)).foregroundStyle(Color(hex: 0xf59e0b))
                Text("pts").font(.app(14, .semibold)).foregroundStyle(Color(hex: 0xf59e0b))
            }.padding(.horizontal, 12).padding(.vertical, 10).background(Palette.soft)
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading) {
                    Text("Ta réponse").font(.app(14, .semibold))
                    Text(a.answer.isEmpty ? "—" : a.answer).font(.he(14)).foregroundStyle(Palette.muted)
                }
                if tab == "report", let q {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Conseil").font(.app(14, .semibold)).underline(color: Palette.accent.opacity(0.4))
                        Text(q.tip).font(.app(14))
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Exemple").font(.app(14, .semibold)).underline(color: Palette.accent.opacity(0.4))
                        Text(q.sample.he(g)).font(.he(16))
                        Text("\(q.sample.tr(g)) — \(q.sample.fr)").font(.app(14)).foregroundStyle(Palette.muted)
                    }
                }
            }.padding(12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
    }
}

private struct VoiceBox: View {
    let v: [String: Double?]
    private func n(_ k: String) -> Double { (v[k] ?? nil) ?? 0 }
    var body: some View {
        let spoken = Int(n("spoken"))
        let longP = n("longPauses")
        let s = spoken > 1 ? "s" : ""
        let ls = longP >= 2 ? "s" : ""
        let pct = Int((n("pauseRatio") * 100).rounded())
        VStack(alignment: .leading, spacing: 2) {
            Text("Analyse de ta voix · \(spoken) réponse\(s) mesurée\(s)").font(.app(14, .semibold))
            if let w = v["wpm"] ?? nil { Text("• Débit : \(Int(w)) mots/min en parlant (un natif : 120 à 160).") }
            Text("• Pauses : \(pct) % du temps de parole, \(String(format: "%g", longP)) hésitation\(ls) longue\(ls) par réponse.")
            Text("• Temps de réaction : \(String(format: "%g", n("latency"))) s avant de commencer.")
        }
        .font(.app(14)).frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 12)
    }
}


/// Réplique de Shuli dans le test : écouter et traduire (comme la question).
private struct ShuliBubble: View {
    let text: String
    let mood: Mood
    let say: (String) -> Void
    @EnvironmentObject var app: AppModel
    @State private var tr: String?
    @State private var busy = false
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Avatar(mood: mood, size: 28)
            VStack(alignment: .trailing, spacing: 4) {
                Text(text).font(.he(18))
                HStack(spacing: 12) {
                    Button { say(text) } label: { Label("Écouter", systemImage: "speaker.wave.2") }
                    Button { translate() } label: { Label(busy ? "…" : "Traduire", systemImage: "character.bubble") }.disabled(busy)
                }.buttonStyle(.plain).font(.app(14, .medium)).frame(minHeight: 32)
                if let tr { Text(tr).font(.app(14)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, alignment: .leading) }
            }.padding(.horizontal, 16).padding(.vertical, 8).background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).cardShadow()
            Spacer(minLength: 40)
        }
    }
    private func translate() {
        if tr != nil { tr = nil; return }
        busy = true
        Task { tr = await app.llm.translate(text) ?? "Traduction indisponible."; busy = false }
    }
}
