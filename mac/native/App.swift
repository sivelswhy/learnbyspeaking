import AppKit
import SwiftUI

// LearnBySpeaking, app macOS entièrement native (SwiftUI). Les modèles tournent dans llama-server et whisper-server
// (mac/Models.swift), lancés et arrêtés par l'app ; aucune vue web.

final class AppModel: ObservableObject {
    let store = Store()
    let voice = Voice()
    let servers = [ModelServer(llamaSpec), ModelServer(whisperSpec)]
    lazy var downloads = Dictionary(uniqueKeysWithValues: servers.map { ($0.spec.id, ModelDownload($0)) })
    @Published var brainReady = false
    @Published var earReady = false
    lazy var llm = LLM(port: llamaSpec.port, key: servers[0].key)
    lazy var ear = Ear(port: whisperSpec.port, path: servers[1].key)

    func startServers() {
        for (i, s) in servers.enumerated() where s.start() {
            s.waitHealthy { [weak self] ok in
                if i == 0 { self?.brainReady = ok } else { self?.earReady = ok }
            }
        }
    }

    var modelsPresent: Bool { servers.allSatisfy { $0.modelURL != nil } && voiceFilesPresent }

    enum AiStatus { case ready, loading, missing, downloading }
    @Published var progress: [String: Double] = [:]
    @Published var downloadError: String?
    var ai: AiStatus {
        if brainReady && earReady { return .ready }
        if downloads.values.contains(where: \.active) || voiceDownloading { return .downloading }
        return modelsPresent ? .loading : .missing
    }

    @Published var voiceDownloading = false

    /// Voix Piper (3 fichiers, ≈ 371 Mo) : téléchargée dans models/voice/, puis chargée.
    func downloadVoice() {
        guard !voiceFilesPresent, !voiceDownloading else { return }
        voiceDownloading = true
        Task {
            try? FileManager.default.createDirectory(at: voiceDir, withIntermediateDirectories: true)
            let total = Double(VOICE_FILES.reduce(0) { $0 + $1.bytes })
            var before: Int64 = 0
            for f in VOICE_FILES {
                let dest = voiceDir.appendingPathComponent(f.name)
                if FileManager.default.fileExists(atPath: dest.path) { before += f.bytes; continue }
                do {
                    let (bytes, resp) = try await URLSession.shared.bytes(from: URL(string: f.url)!)
                    guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
                    let part = dest.appendingPathExtension("part")
                    FileManager.default.createFile(atPath: part.path, contents: nil)
                    let h = try FileHandle(forWritingTo: part)
                    var buf = Data(); buf.reserveCapacity(1 << 20)
                    var got: Int64 = 0
                    for try await b in bytes {
                        buf.append(b)
                        if buf.count >= 1 << 20 {
                            try h.write(contentsOf: buf); got += Int64(buf.count); buf.removeAll(keepingCapacity: true)
                            let p = Double(before + got) / total
                            await MainActor.run { self.progress["voice"] = p }
                        }
                    }
                    try h.write(contentsOf: buf); try h.close()
                    try FileManager.default.moveItem(at: part, to: dest)
                    before += f.bytes
                } catch {
                    await MainActor.run { self.downloadError = "Voix de Shuli : \(error.localizedDescription)"; self.voiceDownloading = false }
                    return
                }
            }
            await MainActor.run { self.progress["voice"] = 1; self.voiceDownloading = false; self.voice.loadPiper() }
        }
    }

    /// Télécharge les modèles absents (reprise, SHA-256 vérifié), puis démarre leurs serveurs.
    func downloadModels() {
        downloadError = nil
        downloadVoice()
        for s in servers where s.modelURL == nil {
            let d = downloads[s.spec.id]!
            d.onProgress = { [weak self] done, total in
                DispatchQueue.main.async { self?.progress[s.spec.id] = total > 0 ? Double(done) / Double(total) : 0 }
            }
            d.onDone = { [weak self] err in
                guard let self else { return }
                if let err { self.downloadError = err; self.objectWillChange.send(); return }
                self.progress[s.spec.id] = 1
                if s.start() { s.waitHealthy { ok in if s.spec.id == "llamacpp" { self.brainReady = ok } else { self.earReady = ok } } }
            }
            d.start()
        }
        objectWillChange.send()
    }

    func stop() { servers.forEach { $0.stop() } }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = AppModel()
    private var sigterm: DispatchSourceSignal?
    private var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ n: Notification) {
        // Garde l'app active (App Nap ralentirait téléchargements et modèles).
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .idleSystemSleepDisabled], reason: "Modèles d'IA de Shuli")
        // SIGTERM (pkill, fermeture de session) : quitter proprement, sinon les serveurs resteraient orphelins.
        signal(SIGTERM, SIG_IGN)
        sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        sigterm?.setEventHandler { NSApp.terminate(nil) }
        sigterm?.resume()
        model.startServers()
    }

    func applicationWillTerminate(_ n: Notification) { model.stop() }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
}

@main
struct LearnBySpeakingApp: App {
    init() { Fonts.register() }
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        Window("LearnBySpeaking", id: "main") {
            RootView()
                .environmentObject(delegate.model)
                .environmentObject(delegate.model.store)
                .frame(minWidth: 760, minHeight: 560)
                .background(Palette.bg)
                .preferredColorScheme(.light)
                .tint(Palette.accent)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
            DevCommands(store: delegate.model.store)
        }
    }
}

// MARK: - Navigation (app/page.tsx)

enum Tab: String, CaseIterable, Identifiable {
    case parler = "Parler", cours = "Cours", bilan = "Bilan", moi = "Moi"
    var id: String { rawValue }
}

enum ModeId: String { case talk, daily, teacher, grammar, translate, define }

/// Écran ouvert par-dessus les onglets.
enum Screen: Hashable {
    case setup, placement, hub, review, scenarios
    case chat(Scenario, dayId: String?)
    case tool(ModeId)
    case day(String)
    case practice(String)
    case report(SessionRecord)
}

final class Nav: ObservableObject {
    @Published var tab: Tab = .parler
    @Published var screen: Screen?
    /// Onglet de Cours à ouvrir (ressources › grammaire depuis le hub).
    @Published var coursTab: String?
    func open(_ s: Screen) { screen = s }
    func home() { screen = nil }
}

struct RootView: View {
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @StateObject private var nav = Nav()
    @AppStorage("textScale") private var textScale = 1.0

    var body: some View {
        Group {
            if store.profile == nil { WelcomeSetup() }
            else if store.profile?.onboarding == "goal" { GoalSetupView() }
            else if store.profile?.onboarding == "placement" { PlacementView(onboarding: true) }
            else if let s = nav.screen { screen(s) }
            else { tabs }
        }
        .environmentObject(nav)
        .id(textScale)
        .font(.app(16))
        .foregroundStyle(Palette.ink)
    }

    @ViewBuilder private func screen(_ s: Screen) -> some View {
        switch s {
        case .setup: SetupScreen()
        case .placement: PlacementView(onboarding: false)
        case .hub: TutorHubView()
        case .review: ReviewScreen()
        case .scenarios: ScenarioListView()
        case .chat(let sc, let dayId): ConversationView(scenario: sc, dayId: dayId).id(sc.id + "\(store.sessions.count)")
        case .tool(let m): ToolChatView(mode: m)
        case .day(let id): DayScreen(dayId: id)
        case .practice(let id): SpeakingPracticeView(dayId: id)
        case .report(let rec): ReportView(rec: rec)
        }
    }

    private var tabs: some View {
        HStack(alignment: .top, spacing: 32) {
            // Barre latérale (lg) : Shuli, nom de l'app, onglets.
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 12) {
                    Avatar(size: 44)
                    Text("LearnBy\nSpeaking").font(.app(18, .black)).foregroundStyle(Palette.accent).lineSpacing(-2)
                }
                VStack(spacing: 4) {
                    ForEach(Array(Tab.allCases.enumerated()), id: \.element) { i, t in
                        Button { nav.tab = t; nav.coursTab = nil } label: {
                            Text(t.rawValue).font(.app(16, .bold))
                                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).padding(.horizontal, 16)
                                .background(nav.tab == t ? Palette.soft : .clear, in: RoundedRectangle(cornerRadius: 16))
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(nav.tab == t ? Palette.accent.opacity(0.4) : .clear, lineWidth: 2))
                                .foregroundStyle(nav.tab == t ? Palette.accent : Palette.ink)
                        }
                        .buttonStyle(PressStyle())
                        .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                    }
                }
                Spacer()
            }
            .frame(width: 208)
            .padding(.top, 32)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    AiBanner()
                    switch nav.tab {
                    case .parler: ParlerView()
                    case .cours: CoursView()
                    case .bilan: ProgressView_()
                    case .moi: MoiView()
                    }
                }
                .padding(.top, 32).padding(.bottom, 40)
            }
            .scrollIndicators(.never)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: 1024)
        .frame(maxWidth: .infinity)
        .background(Palette.bg)
        .overlay(alignment: .bottom) { if nav.tab == .parler { HubBar() } }
    }
}

/// Bandeaux d'état de l'IA (Shuli se réveille / pas encore téléchargé).
struct AiBanner: View {
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var nav: Nav
    var body: some View {
        switch app.ai {
        case .loading:
            Label("Shuli se réveille : chargement depuis ton appareil (rien à télécharger).", systemImage: "arrow.triangle.2.circlepath")
                .font(.app(14, .semibold)).foregroundStyle(Palette.accent)
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.accent.opacity(0.3)))
        case .missing:
            Button { nav.open(.setup) } label: {
                Text("Shuli n'est pas encore téléchargé sur cet appareil. Touche ici pour le préparer.")
                    .font(.app(14)).foregroundStyle(Palette.warn).multilineTextAlignment(.leading)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.warn.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.warn.opacity(0.4)))
            }.buttonStyle(PressStyle())
        case .downloading:
            Button { nav.open(.setup) } label: {
                Text("Téléchargement en cours… touche ici pour suivre la progression.")
                    .font(.app(14, .semibold)).foregroundStyle(Palette.accent)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(PressStyle())
        case .ready: EmptyView()
        }
    }
}

func uid() -> String { String(UUID().uuidString.prefix(8)).lowercased() }
