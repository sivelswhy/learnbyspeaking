import SwiftUI

// components/Conversation.tsx, à l'identique : Shuli parle, l'apprenant répond au micro (espace) ou au clavier,
// avis sous chaque réponse, missions de la scène, répétition notée, mains libres, bilan à la fin.

struct ChatMessage: Identifiable, Hashable {
    let id = uid()
    var role: String
    var text: String
    var translation: String?
    var transliteration: String?
    var machine = false
    var analyzing = false
    var missions: [String]?
    var feedback: Feedback?
    var reviewing = false
}

enum ChatStatus { case idle, listening, thinking, speaking }

@MainActor
final class ConversationModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var streaming = ""
    @Published var status: ChatStatus = .idle
    @Published var error: String?
    @Published var finishing = false
    @Published var handsFree = false
    @Published var repeatTarget: (target: String, heard: String?, score: Int?)?

    let app: AppModel
    let profile: Profile
    let sc: Scenario
    private var task: Task<Void, Never>?
    private var started = false
    private let t0 = Date()

    init(app: AppModel, profile: Profile, sc: Scenario) { self.app = app; self.profile = profile; self.sc = sc }

    var script: SceneScript? { C.scenes[sc.id] }
    var progress: SceneProgress? {
        guard let script else { return nil }
        let users = messages.filter { $0.role == "user" }
        return sceneProgress(script, users.map(\.text), credited: users.map(\.missions))
    }
    var lastAssistant: ChatMessage? { messages.last { $0.role == "assistant" } }

    func start() {
        guard !started else { return }
        started = true
        reply()
    }

    func say(_ text: String) {
        status = .speaking
        Task {
            await app.voice.say(text, rate: Voice.rate(profile.level))
            if status == .speaking { status = .idle }
            if handsFree && status == .idle {
                try? await Task.sleep(nanoseconds: 250_000_000)
                listen()
            }
        }
    }

    /// Traduction en arrière-plan (Gemma), signalée comme automatique.
    private func analyze(_ id: String) {
        Task {
            guard let m = messages.first(where: { $0.id == id }) else { return }
            let tr = await app.llm.translate(m.text)
            if let i = messages.firstIndex(where: { $0.id == id }) {
                messages[i].analyzing = false
                if let tr { messages[i].translation = tr; messages[i].machine = true }
            }
        }
    }

    func translate(_ id: String) async -> Bool {
        guard let m = messages.first(where: { $0.id == id }) else { return false }
        guard let tr = await app.llm.translate(m.text) else { return false }
        if let i = messages.firstIndex(where: { $0.id == id }) { messages[i].translation = tr; messages[i].machine = true }
        return true
    }

    private func reply(after userId: String? = nil, question: String = "") {
        status = .thinking
        error = nil
        streaming = ""
        task = Task {
            let g = profile.g
            if messages.isEmpty, let st = sc.starters?["he"] {
                // Première réplique écrite à la main : instantanée et sans faute.
                let tr = st.translation[profile.native]
                var m = ChatMessage(role: "assistant", text: st.text(g), translation: tr, transliteration: st.transliteration(g))
                m.analyzing = tr == nil
                messages.append(m)
                if tr == nil { analyze(m.id) }
                say(m.text)
                return
            }
            do {
                let turns = messages.map { Turn(role: $0.role, text: $0.text, missions: $0.missions) }
                let r = try await app.llm.humanReply(p: profile, sc: sc, turns: turns) { [weak self] t in
                    Task { @MainActor in self?.streaming = t }
                }
                streaming = ""
                guard let r, !Task.isCancelled else { status = .idle; return }
                // Mission validée par le juge : mémorisée sur le message de l'apprenant.
                if let mission = r.mission, let i = messages.lastIndex(where: { $0.role == "user" }) {
                    messages[i].missions = (messages[i].missions ?? []) + [mission]
                }
                var m = ChatMessage(role: "assistant", text: r.text)
                m.analyzing = true
                messages.append(m)
                analyze(m.id)
                say(r.text)
                // Avis de Shuli après sa réplique (sinon le juge retarderait la réponse).
                if let userId, let i = messages.firstIndex(where: { $0.id == userId }) {
                    let fb = await app.llm.review(question: question, answer: messages[i].text, p: profile)
                    if let j = messages.firstIndex(where: { $0.id == userId }) { messages[j].feedback = fb; messages[j].reviewing = false }
                }
            } catch {
                streaming = ""
                status = .idle
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
        }
    }

    func send(_ text: String) {
        let v = text.trimmed
        guard !v.isEmpty else { return }
        app.voice.stop()
        let question = lastAssistant?.text ?? ""
        let m = ChatMessage(role: "user", text: v, reviewing: true)
        messages.append(m)
        reply(after: m.id, question: question)
    }

    func listen() {
        repeatTarget = nil
        if app.ear.listening { app.ear.stop(); return }
        app.voice.stop()
        error = nil
        status = .listening
        Task {
            do {
                let heard = try await app.ear.listen()
                if status == .listening { status = .idle }
                if let heard { send(heard.text) }
            } catch {
                status = .idle
                self.error = "Je n'ai pas pu t'entendre : la reconnaissance de la voix ne répond pas."
            }
        }
    }

    /// « Répéter » une phrase : on mesure les mots retrouvés (pas l'accent).
    func practice(_ target: String) {
        app.voice.stop()
        repeatTarget = (target, nil, nil)
        status = .listening
        Task {
            let heard = (try? await app.ear.listen())?.text ?? ""
            status = .idle
            repeatTarget = (target, heard, wordMatch(target, heard))
        }
    }

    func interrupt() {
        task?.cancel()
        app.voice.stop()
        if app.ear.listening { app.ear.stop() }
        streaming = ""
        status = .idle
    }

    func finish() async -> SessionRecord? {
        interrupt()
        let users = messages.enumerated().filter { $0.element.role == "user" }
        guard !users.isEmpty else { return nil }
        finishing = true
        let turns = users.map { (i, m) in (question: messages[..<i].last { $0.role == "assistant" }?.text ?? "", answer: m.text) }
        let report = await app.llm.scoreSession(turns, level: profile.level)
        finishing = false
        return SessionRecord(id: uid(), date: nowISO(), scenarioId: sc.id, title: sc.title, seconds: Int(Date().timeIntervalSince(t0)),
                             turns: users.count, words: [], report: report)
    }
}

struct ConversationView: View {
    let scenario: Scenario
    let dayId: String?
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    var body: some View {
        if app.ai != .ready {
            SetupScreen(title: "Préparer le tuteur")
        } else {
            ConversationBody(model: ConversationModel(app: app, profile: (store.profile ?? NEW_PROFILE), sc: scenario), ear: app.ear, dayId: dayId)
        }
    }
}

private struct ConversationBody: View {
    @StateObject var model: ConversationModel
    @ObservedObject var ear: Ear
    let dayId: String?
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @State private var text = ""
    @FocusState private var typing: Bool

    init(model: ConversationModel, ear: Ear, dayId: String?) {
        _model = StateObject(wrappedValue: model)
        self.ear = ear; self.dayId = dayId
    }

    var busy: Bool { model.status == .thinking }

    var body: some View {
        VStack(spacing: 0) {
            Column {
                Header(title: model.sc.title, onBack: { model.interrupt(); nav.home() }) {
                    Button(model.finishing ? "Bilan…" : "Terminer") { finish() }.buttonStyle(Btn(variant: .ghost)).disabled(model.finishing)
                }
            }
            ScrollViewReader { proxy in
                ScrollView {
                    Column {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(Text(model.sc.opening).bold())\(Text(" Objectif : \(model.sc.goal)."))")
                                .font(.app(14)).foregroundStyle(Palette.accent)
                                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                .background(Palette.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                            if let script = model.script, let prog = model.progress { MissionList(script: script, progress: prog) }
                            ForEach(model.messages) { m in Bubble(m: m, model: model, setText: { text = $0 }) }
                            if !model.streaming.isEmpty {
                                Text(model.streaming).font(.he(18)).rtl()
                                    .padding(.horizontal, 16).padding(.vertical, 12)
                                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 16))
                                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line))
                                    .frame(maxWidth: 560, alignment: .leading)
                            }
                            if busy && model.streaming.isEmpty {
                                HStack(spacing: 8) { Avatar(mood: .think, size: 36); Text("Shuli réfléchit…").font(.app(14)).foregroundStyle(Palette.muted) }
                            }
                            if let script = model.script, let prog = model.progress, !busy, model.streaming.isEmpty, !model.messages.isEmpty {
                                MissionHint(progress: prog, g: model.profile.g, say: model.say, use: { text = $0 })
                                let _ = script
                            }
                            if let r = model.repeatTarget { RepeatCard(r: r, listening: ear.listening) }
                            if let e = model.error {
                                HStack(spacing: 12) { Avatar(mood: .sad, size: 40); Text(e) }
                                    .font(.app(14)).foregroundStyle(Palette.warn).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Palette.warn.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                }
                .onChange(of: model.messages) { withAnimation { proxy.scrollTo("bottom") } }
                .onChange(of: model.streaming) { proxy.scrollTo("bottom") }
            }
            bottomBar
        }
        .background(Palette.bg)
        .onAppear { model.start() }
        .onDisappear { model.interrupt() }
    }

    private func finish() {
        Task {
            if let rec = await model.finish() {
                store.addSession(rec)
                if let dayId { store.completeActivity(dayId, "scenario") }
                nav.open(.report(rec))
            } else { nav.home() }
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Divider().overlay(Palette.line)
            Column {
                VStack(spacing: 0) {
                    HStack(spacing: 8) {
                        TextField("Ou écris ta réponse…", text: $text)
                            .textFieldStyle(.plain).font(.app(16)).padding(.horizontal, 12).frame(minHeight: 44)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                            .focused($typing)
                            .onSubmit { model.send(text); text = "" }
                        Button { model.send(text); text = "" } label: { Image(systemName: "paperplane.fill").font(.system(size: 18)) }
                            .buttonStyle(Btn(height: 44)).frame(width: 64).disabled(text.trimmed.isEmpty || busy)
                    }
                    .padding(.bottom, 12)
                    HStack {
                        VStack(spacing: 4) {
                            Button { if let m = model.lastAssistant { model.say(m.text) } } label: { Label("Répéter", systemImage: "repeat") }
                                .buttonStyle(Btn(variant: .ghost, full: true)).disabled(model.lastAssistant == nil)
                        }.frame(width: 120)
                        Spacer()
                        Button { model.listen() } label: {
                            Image(systemName: ear.listening ? "stop.fill" : "mic.fill").font(.system(size: ear.listening ? 30 : 34))
                                .foregroundStyle(.white).frame(width: 80, height: 80).background(Palette.accent, in: Circle())
                                .shadow(color: Palette.accent.opacity(ear.listening ? 0.25 : 0), radius: 0)
                                .overlay(Circle().stroke(Palette.accent.opacity(0.25), lineWidth: ear.listening ? 4 + ear.level * 22 : 0).padding(-(2 + ear.level * 11)))
                        }
                        .buttonStyle(PressStyle(scale: 0.96))
                        .disabled(busy || model.finishing || ear.transcribing)
                        .opacity(busy || model.finishing || ear.transcribing ? 0.4 : 1)
                        .keyboardShortcut(typing ? KeyEquivalent("§") : .space, modifiers: [])
                        Spacer()
                        VStack(spacing: 4) {
                            Button { model.interrupt() } label: { Label("Stop", systemImage: "hand.raised") }
                                .buttonStyle(Btn(variant: .ghost, full: true)).disabled(model.status == .idle)
                            Button { model.handsFree.toggle() } label: { Label("Mains libres", systemImage: "headphones") }
                                .buttonStyle(Btn(variant: model.handsFree ? .solid : .ghost, full: true))
                        }.frame(width: 120)
                    }
                    Text(ear.transcribing ? "Transcription…" : [ChatStatus.idle: "Appuie sur le micro pour parler (ou espace)", .listening: "Je t'écoute… (arrêt auto quand tu te tais)",
                                                                .thinking: "Réflexion…", .speaking: "Le tuteur parle…"][model.status]!)
                        .font(.app(12)).foregroundStyle(Palette.muted).padding(.top, 8)
                }
                .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 12)
            }
        }
        .background(Palette.bg)
    }
}

/// Petit bouton arrondi sous une bulle.
struct Pill<L: View>: View {
    let action: () -> Void
    @ViewBuilder var label: L
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) { label }.font(.app(12)).foregroundStyle(Palette.muted)
                .padding(.horizontal, 12).frame(minHeight: 36).overlay(Capsule().stroke(Palette.line))
        }.buttonStyle(PressStyle(scale: 0.97))
    }
}

private struct Bubble: View {
    let m: ChatMessage
    @ObservedObject var model: ConversationModel
    let setText: (String) -> Void
    @State private var showTr = false
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        let user = m.role == "user"
        VStack(alignment: user ? .trailing : .leading, spacing: 8) {
            if !user { HStack(spacing: 8) { Avatar(size: 26); Text("Shuli").font(.app(14, .bold)) } }
            VStack(alignment: .leading, spacing: 4) {
                Text(m.text).font(.he(18)).lineSpacing(2).rtl().frame(maxWidth: .infinity, alignment: .trailing).textSelection(.enabled)
                if !user, let tl = m.transliteration { Text(tl).font(.app(14)).foregroundStyle(Palette.muted) }
                if !user && showTr {
                    Divider().overlay(Palette.line)
                    if busy { Text("Traduction…").font(.app(14)).foregroundStyle(Palette.muted) }
                    else if failed { Text("Traduction impossible pour l'instant. Réessaie.").font(.app(14)).foregroundStyle(Palette.warn) }
                    else if let tr = m.translation {
                        Text(tr).font(.app(14))
                        if m.machine { Text("Traduction automatique, peut contenir des erreurs.").font(.app(12)).foregroundStyle(Palette.muted) }
                    }
                }
            }
            .foregroundStyle(user ? .white : Palette.ink)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(user ? Palette.accent : Palette.card, in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: user ? 16 : 6, bottomTrailingRadius: user ? 6 : 16, topTrailingRadius: 16))
            .overlay(user ? nil : UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 6, bottomTrailingRadius: 16, topTrailingRadius: 16).stroke(Palette.line))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: 560, alignment: user ? .trailing : .leading)
            if !user {
                HStack(spacing: 6) {
                    Pill(action: { model.say(m.text) }) { Image(systemName: "speaker.wave.2") }
                    Pill(action: { toggleTr() }) {
                        Image(systemName: "character.bubble")
                        Text(busy || (m.analyzing && m.translation == nil) ? "…" : "Traduire (français)")
                    }
                }
            }
            if user && m.reviewing { Text("Shuli regarde ta réponse…").font(.app(12)).foregroundStyle(Palette.muted) }
            if user, let f = m.feedback { FeedbackCard(f: f, say: model.say, practice: model.practice) }
        }
        .frame(maxWidth: .infinity, alignment: user ? .trailing : .leading)
    }

    private func toggleTr() {
        if m.translation != nil { showTr.toggle(); return }
        showTr = true; failed = false; busy = true
        Task { let ok = await model.translate(m.id); busy = false; failed = !ok }
    }
}

/// Avis de Shuli sous une réponse de l'apprenant.
struct FeedbackCard: View {
    let f: Feedback
    let say: (String) -> Void
    let practice: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Avatar(mood: f.praise != nil ? .cheer : .happy, size: 24)
                Text(f.praise ?? "Pour améliorer ta réponse").font(.app(14, .semibold))
                Spacer()
                Text(f.context).font(.app(12, .semibold)).foregroundStyle(Palette.accent)
                    .padding(.horizontal, 8).padding(.vertical, 2).background(Palette.soft, in: Capsule()).help("Ton niveau → niveau visé · objectif")
            }
            if let c = f.correction { line("Plus correct", c) }
            ForEach(f.tips, id: \.self) { t in
                HStack(alignment: .top, spacing: 6) { Image(systemName: "lightbulb").foregroundStyle(Palette.accent); Text(t) }.font(.app(14))
            }
            if let e = f.example { line("Exemple", e) }
        }
        .padding(12)
        .frame(maxWidth: 600, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line))
    }
    private func line(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.app(12, .semibold)).foregroundStyle(Palette.muted)
            HStack(spacing: 8) {
                Text(text).font(.he(18, .medium)).foregroundStyle(Palette.good).rtl().frame(maxWidth: .infinity, alignment: .trailing)
                Pill(action: { say(text) }) { Image(systemName: "speaker.wave.2") }
                Pill(action: { practice(text) }) { Image(systemName: "mic") }
            }
        }
    }
}

private struct MissionList: View {
    let script: SceneScript
    let progress: SceneProgress
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("MISSIONS · \(progress.done.count)/\(script.missions.count)").font(.app(12, .bold)).tracking(0.6).foregroundStyle(Palette.muted).padding(.bottom, 2)
            ForEach(script.missions) { m in
                let ok = progress.done.contains(m.id)
                HStack(spacing: 8) {
                    Text(ok ? "✓" : "").font(.system(size: 11, weight: .bold)).foregroundStyle(.white).frame(width: 20, height: 20)
                        .background(ok ? Palette.good : .clear, in: Circle()).overlay(Circle().stroke(ok ? Palette.good : Palette.line, lineWidth: 2))
                    Text(m.fr).strikethrough(ok).font(.app(14, m.id == progress.next?.id ? .bold : .regular))
                        .foregroundStyle(ok ? Palette.good : m.id == progress.next?.id ? Palette.ink : Palette.muted)
                }
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line, lineWidth: 2))
    }
}

/// « À toi » : la prochaine mission, avec une phrase d'exemple à la demande.
private struct MissionHint: View {
    let progress: SceneProgress
    let g: Gender
    let say: (String) -> Void
    let use: (String) -> Void
    @State private var open = false
    var body: some View {
        if let m = progress.next {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) { Avatar(mood: .wink, size: 32); Text("À toi : \(m.fr)").font(.app(14, .bold)).foregroundStyle(Palette.accent) }
                if open {
                    Text(m.example.he(g)).font(.he(18)).rtl().frame(maxWidth: .infinity, alignment: .trailing)
                    Text(m.example.tr(g)).font(.app(14)).foregroundStyle(Palette.muted)
                    Text(m.example.fr).font(.app(14))
                    HStack(spacing: 8) {
                        Button { say(m.example.he(g)) } label: { Label("Écouter", systemImage: "speaker.wave.2") }.buttonStyle(Btn(variant: .soft))
                        Button("Utiliser") { use(m.example.he(g)) }.buttonStyle(Btn(variant: .soft))
                    }.padding(.top, 4)
                } else {
                    Button("Besoin d'aide ?") { open = true }.buttonStyle(.plain).underline().foregroundStyle(Palette.accent).font(.app(14)).frame(minHeight: 44)
                }
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.accent.opacity(0.4), lineWidth: 2))
        } else {
            HStack(spacing: 12) {
                Avatar(mood: .cheer, size: 52)
                Text("\(Text("Missions accomplies !").bold())\(Text(" Tu peux continuer à parler, ou toucher « Terminer » pour ton bilan."))").font(.app(14))
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

private struct RepeatCard: View {
    let r: (target: String, heard: String?, score: Int?)
    let listening: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("RÉPÈTE LA PHRASE").font(.app(12, .semibold)).foregroundStyle(Palette.muted)
            Text(r.target).font(.he(18)).rtl().frame(maxWidth: .infinity, alignment: .trailing)
            if let heard = r.heard {
                Text("Compris : « \(heard) »").font(.app(14))
                Text("\(r.score ?? 0)% des mots retrouvés. Mesure du texte reconnu, pas de ton accent.").font(.app(14)).foregroundStyle(Palette.muted)
            } else {
                Text(listening ? "Je t'écoute…" : "…").font(.app(14)).foregroundStyle(Palette.muted)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).card(12)
    }
}
