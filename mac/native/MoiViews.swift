import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

// Onglet Moi : components/Vocab.tsx (révision espacée), Settings.tsx, DataTools.tsx, Onboarding.tsx (profil).

/// Rangée qui passe à la ligne (flex-wrap).
struct Flow: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, maxX: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x > 0 && x + sz.width > w { x = 0; y += row + spacing; row = 0 }
            x += sz.width + spacing; row = max(row, sz.height); maxX = max(maxX, x - spacing)
        }
        return CGSize(width: maxX, height: y + row)
    }
    func placeSubviews(in b: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = b.minX, y = b.minY, row: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x > b.minX && x + sz.width > b.maxX { x = b.minX; y += row + spacing; row = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing; row = max(row, sz.height)
        }
    }
}

struct MoiView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VocabView(onBack: nil)
            SettingsView()
        }
    }
}

struct ReviewScreen: View {
    @EnvironmentObject var nav: Nav
    var body: some View { ScrollView { Column { VocabView(onBack: nav.home).padding(.horizontal, 16) } }.background(Palette.bg) }
}

// MARK: - Vocabulaire

private func when(_ isoDate: String) -> String {
    let min = max(1, Int(((parseISO(isoDate) ?? Date()).timeIntervalSinceNow / 60).rounded()))
    if min < 60 { return "\(min) min" }
    let d = Int((Double(min) / 1440).rounded())
    return d < 1 ? "\(Int((Double(min) / 60).rounded())) h" : d < 60 ? "\(d) j" : "\(Int((Double(d) / 30).rounded())) mois"
}

struct VocabView: View {
    var onBack: (() -> Void)?
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @State private var flip = false
    @State private var reverse = false
    @State private var oral = false
    @State private var heard: String?
    @State private var done = 0
    @State private var snooze: [String] = []
    private let grades: [(Grade, String)] = [(.again, "À revoir"), (.hard, "Difficile"), (.good, "Bien"), (.easy, "Facile")]

    var body: some View {
        let due = dueCards(store.vocab).filter { !snooze.contains($0.word) }
        let card = due.first
        let match = card.flatMap { c in heard.map { wordMatch(c.word, $0) } }
        let showWord = oral ? flip : reverse ? !flip : flip
        VStack(alignment: .leading, spacing: 16) {
            Header(title: "Vocabulaire", onBack: onBack).padding(.horizontal, -16)
            if store.vocab.isEmpty {
                HStack(spacing: 12) { Avatar(size: 64); Text("Tes mots appris en conversation et dans le cours apparaîtront ici automatiquement.").foregroundStyle(Palette.muted) }
            }
            if !store.vocab.isEmpty && card == nil {
                HStack(spacing: 16) {
                    Avatar(mood: done > 0 ? .cheer : .happy, size: 72)
                    VStack(alignment: .leading) {
                        Text(done > 0 ? "Bravo, \(done) mot\(done > 1 ? "s" : "") révisé\(done > 1 ? "s" : "") !" : "Rien à réviser pour l'instant.").bold()
                        Text("Reviens plus tard : Shuli te prévient quand des mots seront à revoir.").font(.app(14)).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                }.card()
            }
            if let card {
                Text("\(due.count) à réviser · maîtrise \(card.box + 1)/5\(done > 0 ? " · \(done) fait\(done > 1 ? "s" : "")" : "")").font(.app(14)).foregroundStyle(Palette.muted)
                Button { if !oral { flip.toggle() } } label: {
                    VStack(spacing: 8) {
                        if showWord {
                            Text(card.word).font(.he(36))
                            Text(card.transliteration).foregroundStyle(Palette.muted)
                            if oral { Text(card.meaning).font(.app(14)) }
                        } else {
                            if oral || reverse { Text(card.meaning).font(.app(24)) } else { Text(card.word).font(.he(36)) }
                            Text(oral ? "Dis le mot en hébreu" : "Touche pour voir la réponse").font(.app(14)).foregroundStyle(Palette.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 224).padding(24)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 24))
                    .overlay(RoundedRectangle(cornerRadius: 24).stroke(Palette.line, lineWidth: 2))
                    .background(Color.lineDeep, in: RoundedRectangle(cornerRadius: 24).offset(y: 4))
                }.buttonStyle(PressStyle())
                if oral, let heard, let match {
                    Text("Compris : « \(heard) » · \(match)% \(match >= 70 ? "— bien dit !" : "— réécoute et réessaie.")")
                        .font(.app(14)).foregroundStyle(match >= 70 ? Palette.good : Palette.muted).frame(maxWidth: .infinity)
                }
                HStack(spacing: 8) {
                    Button { Task { await app.voice.say(card.word, rate: 0.8) } } label: { Label("Écouter", systemImage: "speaker.wave.2") }.buttonStyle(Btn(variant: .ghost, full: true))
                    if oral {
                        Button {
                            if app.ear.listening { app.ear.stop() } else {
                                app.voice.stop(); heard = nil
                                Task { if let r = try? await app.ear.listen() { heard = r.text; flip = true } }
                            }
                        } label: { Label(app.ear.transcribing ? "Transcription…" : app.ear.listening ? "Arrêter" : "Parler", systemImage: app.ear.listening ? "pause.fill" : "mic.fill") }
                            .buttonStyle(Btn(variant: .soft, full: true)).disabled(app.ear.transcribing)
                    } else {
                        Button { reverse.toggle(); flip = false } label: { Label(reverse ? "Mot → sens" : "Sens → mot", systemImage: "arrow.left.arrow.right") }.buttonStyle(Btn(variant: .ghost, full: true))
                    }
                }
                HStack(spacing: 8) {
                    ForEach([(false, "Lire"), (true, "Dire à voix haute")], id: \.1) { o, label in
                        Button { oral = o; flip = false; heard = nil } label: {
                            Text(label).font(.app(14, .bold)).frame(maxWidth: .infinity, minHeight: 44)
                                .background(oral == o ? Palette.soft : Palette.card, in: RoundedRectangle(cornerRadius: 16))
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(oral == o ? Palette.accent : Palette.line, lineWidth: 2))
                                .foregroundStyle(oral == o ? Palette.accent : Palette.ink)
                        }.buttonStyle(PressStyle())
                    }
                }
                if oral && !flip { Button("Voir le mot") { flip = true }.buttonStyle(Btn(variant: .ghost, full: true)) }
                if flip {
                    HStack(spacing: 8) {
                        ForEach(grades, id: \.0) { g, label in
                            Button { answer(card, g) } label: {
                                VStack(spacing: 0) { Text(label); Text(when(schedule(card, g).due)).font(.app(11)).opacity(0.75) }
                                    .foregroundStyle(g == .again ? Palette.warn : g == .good ? .white : Palette.ink)
                            }.buttonStyle(Btn(variant: g == .good ? .solid : .ghost, full: true, height: 52))
                        }
                    }
                }
            }
            Text("Tous les mots (\(store.vocab.count))").font(.app(16, .semibold)).padding(.top, 8)
            VStack(spacing: 4) {
                ForEach(store.vocab, id: \.word) { c in
                    HStack {
                        Text(c.word).font(.he(18)); Text(c.transliteration).font(.app(14)).foregroundStyle(Palette.muted)
                        Spacer(); Text(c.meaning).font(.app(14))
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8).background(Palette.card, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                }
            }
        }
    }

    private func answer(_ c: VocabCard, _ g: Grade) {
        if let i = store.vocab.firstIndex(where: { $0.word == c.word }) { store.vocab[i] = schedule(c, g) }
        if g == .again { snooze.append(c.word) }
        done += 1; flip = false; heard = nil
        app.voice.stop()
    }
}

// MARK: - Réglages

struct SettingsView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Header(title: "Réglages").padding(.horizontal, -16)
            ModelsCard()
            BackupCard()
            TextSizeCard()
            DiagnosticCard()
            Text("Profil").font(.app(16, .semibold))
            if let p = store.profile { ProfileEditor(initial: p) { store.profile = $0 } }
        }
    }
}

/// Modèles de l'app (llama.cpp, whisper.cpp) : état, téléchargement.
struct ModelsCard: View {
    @EnvironmentObject var app: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Shuli sur ton Mac").font(.app(16, .semibold))
            row("Cerveau : Gemma 4 E2B", "3,1 Go", app.servers[0].modelURL != nil, app.brainReady, app.progress["llamacpp"])
            row("Oreille : Whisper hébreu (ivrit-ai)", "874 Mo", app.servers[1].modelURL != nil, app.earReady, app.progress["whisper"])
            row("Voix : Piper (Phonikud TTS)", "371 Mo", voiceFilesPresent, app.voice.natural, app.progress["voice"])
            if !app.modelsPresent && app.ai != .downloading {
                Button("Télécharger les modèles") { app.downloadModels() }.buttonStyle(Btn(full: true))
            }
            if let e = app.downloadError { Text(e).font(.app(14)).foregroundStyle(Palette.warn) }
        }.frame(maxWidth: .infinity, alignment: .leading).card()
    }
    private func row(_ name: String, _ size: String, _ present: Bool, _ ready: Bool, _ progress: Double?) -> some View {
        HStack(spacing: 8) {
            Image(systemName: ready ? "checkmark.circle.fill" : present ? "hourglass" : "arrow.down.circle")
                .foregroundStyle(ready ? Palette.good : Palette.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.app(14, .semibold))
                Text(ready ? "Prêt" : present ? "Chargement…" : progress.map { "Téléchargement \(Int($0 * 100)) %" } ?? "À télécharger · \(size)").font(.app(12)).foregroundStyle(Palette.muted)
                if let p = progress, p < 1 { ProgressView(value: p).tint(Palette.accent) }
            }
        }
    }
}

struct BackupCard: View {
    @EnvironmentObject var store: Store
    @State private var msg: (ok: Bool, text: String)?
    @State private var confirmReset = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Sauvegarde").font(.app(16, .semibold))
            Text("Tes progrès restent sur cet appareil, sans compte. Pour changer d'appareil ou garder une copie, exporte un fichier.").font(.app(14)).foregroundStyle(Palette.muted)
            HStack(spacing: 8) {
                Button("Exporter") { export() }.buttonStyle(Btn(variant: .soft, full: true))
                Button("Importer") { importFile() }.buttonStyle(Btn(variant: .soft, full: true))
            }.padding(.top, 8)
            if let msg { Text(msg.text).font(.app(14)).foregroundStyle(msg.ok ? Palette.good : Palette.warn) }
            Button("Effacer toutes mes données") { confirmReset = true }
                .buttonStyle(Btn(variant: .ghost, full: true)).foregroundStyle(Palette.warn).padding(.top, 8)
                .confirmationDialog("Tout effacer ? Pense à exporter une sauvegarde avant.", isPresented: $confirmReset) {
                    Button("Tout effacer", role: .destructive) { store.reset() }
                }
        }.frame(maxWidth: .infinity, alignment: .leading).card()
    }

    /// Même format que l'export du site (lib/backup.ts) : { app, version, date, data: { "lbs.profile": "…" } }.
    private func export() {
        let enc = JSONEncoder()
        func s<T: Encodable>(_ v: T) -> Any? { (try? enc.encode(v)).flatMap { try? JSONSerialization.jsonObject(with: $0, options: .fragmentsAllowed) } }
        var data: [String: Any] = [:]
        data["lbs.profile"] = store.profile.flatMap(s); data["lbs.sessions"] = s(store.sessions); data["lbs.vocab"] = s(store.vocab)
        data["lbs.course"] = s(store.course); data["lbs.placement"] = store.placement.flatMap(s)
        let obj: [String: Any] = ["app": "learnbyspeaking", "version": 1, "date": nowISO(), "data": data]
        guard let json = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "learnbyspeaking-\(nowISO().prefix(10)).json"
        panel.allowedContentTypes = [.json]
        if panel.runModal() == .OK, let url = panel.url { try? json.write(to: url); msg = (true, "Sauvegarde exportée.") }
    }

    private func importFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url, let d = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any], obj["app"] as? String == "learnbyspeaking",
              let data = obj["data"] as? [String: Any] else {
            msg = (false, "Fichier illisible : ce n'est pas une sauvegarde LearnBySpeaking."); return
        }
        let dec = JSONDecoder()
        func v<T: Decodable>(_ k: String) -> T? {
            data[k].flatMap { try? JSONSerialization.data(withJSONObject: $0, options: .fragmentsAllowed) }.flatMap { try? dec.decode(T.self, from: $0) }
        }
        store.profile = v("lbs.profile"); store.sessions = v("lbs.sessions") ?? []; store.vocab = v("lbs.vocab") ?? []
        store.course = v("lbs.course") ?? [:]; store.placement = v("lbs.placement")
        msg = (true, "Sauvegarde importée.")
    }
}

struct TextSizeCard: View {
    @AppStorage("textScale") private var scale = 1.0
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Taille du texte").font(.app(16, .semibold))
            HStack(spacing: 8) {
                ForEach([(1.0, "Normal"), (1.125, "Grand"), (1.25, "Très grand")], id: \.0) { k, l in
                    Button(l) { scale = k }.buttonStyle(ChipStyle(active: scale == k)).frame(maxWidth: .infinity)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).card()
    }
}

struct DiagnosticCard: View {
    @EnvironmentObject var app: AppModel
    @State private var checks: [(label: String, state: Int, detail: String)]?
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Diagnostic").font(.app(16, .semibold))
            Text("Vérifie que ton Mac peut faire tourner Shuli.").font(.app(14)).foregroundStyle(Palette.muted)
            Button(checks == nil ? "Lancer le diagnostic" : "Relancer") { run() }.buttonStyle(Btn(variant: .soft, full: true)).padding(.top, 8)
            ForEach(checks ?? [], id: \.label) { c in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: c.state == 0 ? "checkmark.circle.fill" : c.state == 1 ? "exclamationmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(c.state == 0 ? Palette.good : c.state == 1 ? Color(hex: 0xc98a1a) : Palette.warn).font(.system(size: 17))
                    VStack(alignment: .leading) { Text(c.label).bold(); Text(c.detail).foregroundStyle(Palette.muted) }.font(.app(14))
                }.padding(.top, 6)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).card()
    }
    private func run() {
        var out: [(String, Int, String)] = []
        let mic = AVCaptureDevice.authorizationStatus(for: .audio)
        out.append(("Micro", mic == .authorized ? 0 : mic == .notDetermined ? 1 : 2,
                    mic == .authorized ? "Autorisé." : mic == .notDetermined ? "Pas encore demandé : macOS te le proposera au premier enregistrement." : "Refusé : autorise le micro dans Réglages Système › Confidentialité › Micro."))
        out.append(("Cerveau (llama.cpp, Metal)", app.brainReady ? 0 : app.servers[0].modelURL != nil ? 1 : 2, app.brainReady ? "Prêt." : app.servers[0].modelURL != nil ? "En chargement." : "Modèle absent : télécharge-le."))
        out.append(("Oreille (whisper.cpp, Metal)", app.earReady ? 0 : app.servers[1].modelURL != nil ? 1 : 2, app.earReady ? "Prête." : app.servers[1].modelURL != nil ? "En chargement." : "Modèle absent : télécharge-le."))
        out.append(("Voix hébraïque", Voice.hebrew != nil ? 0 : 2, Voice.hebrew != nil ? "Disponible (\(Voice.hebrew!.name))." : "Absente : Réglages Système › Accessibilité › Contenu énoncé › Voix › Hébreu."))
        if let free = try? URL(fileURLWithPath: NSHomeDirectory()).resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage {
            let go = Double(free) / 1e9
            out.append(("Espace disque", go > 6 ? 0 : go > 4 ? 1 : 2, String(format: "%.1f Go libres (modèles : environ 4 Go).", go).replacingOccurrences(of: ".", with: ",")))
        }
        checks = out
    }
}

/// Profil (components/Onboarding.tsx) : choix en pastilles.
struct ProfileEditor: View {
    @State var p: Profile
    let onDone: (Profile) -> Void
    init(initial: Profile, onDone: @escaping (Profile) -> Void) { _p = State(initialValue: initial); self.onDone = onDone }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "waveform").font(.system(size: 30)).foregroundStyle(.white).frame(width: 56, height: 56).background(Palette.accent, in: RoundedRectangle(cornerRadius: 16))
                Text("Apprends en parlant").font(.app(30, .bold))
                Text("Règle ton profil : tout (niveau du tuteur, vocabulaire, scénarios) s'adapte.").foregroundStyle(Palette.muted)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Ton prénom").font(.app(14, .semibold)).foregroundStyle(Palette.muted)
                TextField("Ex. : Léa", text: Binding(get: { p.name ?? "" }, set: { p.name = $0.isEmpty ? nil : $0 }))
                    .textFieldStyle(.plain).padding(.horizontal, 12).frame(minHeight: 44)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
            }
            section("Ta langue maternelle") { chip("Français", true) {} }
            section("Langue à apprendre") { chip("Hébreu עברית", true) {} }
            section("En hébreu, on s'adresse à toi au…") {
                chip("Masculin", p.gender != .f) { p.gender = .m }
                chip("Féminin", p.gender == .f) { p.gender = .f }
            }
            section("Ton niveau") { ForEach(Profile.levels, id: \.self) { l in chip(l, p.level == l) { p.level = l } } }
            section("Niveau que tu veux atteindre") {
                ForEach(Profile.levels.filter { (Profile.levels.firstIndex(of: $0) ?? 0) > (Profile.levels.firstIndex(of: p.level) ?? 0) }, id: \.self) { l in
                    chip(l, p.target_ == l) { p.targetLevel = l }
                }
            }
            section("Ton objectif") { ForEach(goalOrder, id: \.self) { g in chip(C.goals[g] ?? g, p.goal == g) { p.goal = g } } }
            section("À améliorer") {
                ForEach(focusOrder, id: \.self) { f in
                    let on = p.focus?.contains(f) ?? false
                    chip(C.focus[f] ?? f, on) { p.focus = on ? p.focus!.filter { $0 != f } : (p.focus ?? []) + [f] }
                }
            }
            section("Temps par jour") { ForEach([5, 10, 15, 20, 30], id: \.self) { m in chip("\(m) min", p.dailyMinutes == m) { p.dailyMinutes = m } } }
            Button("Commencer") { onDone(p) }.buttonStyle(Btn(full: true))
        }.padding(.vertical, 32)
    }
    private func section<V: View>(_ title: String, @ViewBuilder _ content: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.app(14, .semibold)).foregroundStyle(Palette.muted)
            Flow { content() }
        }
    }
    private func chip(_ label: String, _ active: Bool, _ action: @escaping () -> Void) -> some View {
        Button(label, action: action).buttonStyle(ChipStyle(active: active))
    }
}

/// Ordre d'affichage (celui de lib/languages.ts).
let goalOrder = ["travel", "work", "study", "daily", "family", "move"]
let focusOrder = ["speaking", "listening", "vocabulary", "grammar", "pronunciation", "reading"]
