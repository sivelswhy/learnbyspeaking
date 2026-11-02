import SwiftUI

// Premier lancement (app/page.tsx) : téléchargement des modèles (LlmSetup « required »), test de niveau, objectifs (GoalSetup.tsx).

/// Profil du premier lancement : objectif, genre et prénom sont demandés autour du test de niveau.
let NEW_PROFILE = Profile(native: "fr", target: "he", level: "A1", goal: "daily", dailyMinutes: 10, onboarding: "placement")

/// Carte de téléchargement des modèles (LlmSetup, mode obligatoire).
struct DownloadCard: View {
    var onReady: () -> Void
    @EnvironmentObject var app: AppModel
    var body: some View {
        let loading = app.ai == .downloading
        let failed = app.downloadError != nil
        let ready = app.ai == .ready
        let items: [(String, Int, Bool)] = [
            ("Cerveau de Shuli (Gemma 4)", 3107, app.servers[0].modelURL != nil),
            ("Reconnaissance de ta voix (Whisper)", 874, app.servers[1].modelURL != nil),
            ("Voix de Shuli (Piper)", 371, voiceFilesPresent),
        ]
        let toDownload = items.filter { !$0.2 }.reduce(0) { $0 + $1.1 }
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Avatar(mood: failed ? .sad : loading ? .think : ready ? .cheer : .happy, size: 64)
                Text(failed ? "Le téléchargement a échoué. Vérifie ta connexion puis touche « Télécharger » : il reprend où il s'est arrêté."
                     : loading ? "Je m'installe… tu peux me laisser travailler." : ready ? "C'est prêt, on y va !" : app.modelsPresent ? "Je me réveille…" : "Un seul téléchargement, et tout marche ensuite sans connexion.")
                    .font(.app(14, .semibold))
            }
            VStack(spacing: 8) {
                ForEach(items, id: \.0) { label, mb, ok in
                    HStack {
                        Text(label).font(.app(14))
                        Spacer()
                        if ok { Label("Sur l'appareil", systemImage: "checkmark.circle.fill").font(.app(12)).foregroundStyle(Palette.good) }
                        else { Text("≈ \(mb) Mo").font(.app(12)).monospacedDigit().foregroundStyle(Palette.muted) }
                    }
                }
            }
            ForEach(["llamacpp", "whisper", "voice"], id: \.self) { id in
                if let p = app.progress[id], p < 1 {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(id == "llamacpp" ? "Cerveau de Shuli" : id == "whisper" ? "Reconnaissance de ta voix" : "Voix de Shuli").font(.app(14, .medium))
                            Spacer()
                            Text("\(Int(p * 100)) %").font(.app(14)).monospacedDigit().foregroundStyle(Palette.muted)
                        }
                        GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Palette.line); Capsule().fill(Palette.accent).frame(width: g.size.width * max(0.02, p)) } }.frame(height: 8)
                    }
                }
            }
            if let e = app.downloadError { Text(e).font(.app(14)).foregroundStyle(Palette.warn) }
            Text("Une seule fois, de préférence en Wi-Fi : ensuite tout se charge depuis l'appareil, même hors ligne.").font(.app(12)).foregroundStyle(Palette.muted)
            Button {
                if ready { onReady() } else { app.downloadModels() }
            } label: {
                HStack(spacing: 8) {
                    if loading || (app.modelsPresent && !ready) { ProgressView().controlSize(.small).tint(.white) }
                    Text(loading ? "Chargement en cours…" : ready ? "Prêt — continuer" : app.modelsPresent ? "Chargement en cours…"
                         : "Télécharger (≈ \(String(format: "%.1f", Double(toDownload) / 1000).replacingOccurrences(of: ".", with: ",")) Go)")
                }
            }
            .buttonStyle(Btn(full: true)).disabled(loading || (app.modelsPresent && !ready))
        }
        .frame(maxWidth: .infinity, alignment: .leading).card()
    }
}

/// Premier lancement, étape 1 : modèles (obligatoire).
struct WelcomeSetup: View {
    @EnvironmentObject var store: Store
    var body: some View {
        ScrollView {
            Column {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 16) {
                        Avatar(mood: .cheer, size: 96)
                        Text("Bienvenue ! Prépare Shuli, ton tuteur").font(.app(24, .heavy))
                    }
                    Text("Tout tourne sur ton Mac, sans compte ni serveur. Avant de commencer, télécharge une fois les modèles d'IA : le cerveau de Shuli et la reconnaissance de ta voix.")
                        .foregroundStyle(Palette.muted)
                    DownloadCard { store.profile = NEW_PROFILE }
                }.padding(.horizontal, 16).padding(.vertical, 32)
            }
        }.background(Palette.bg)
    }
}

/// « Prépare Shuli » depuis l'app (IA absente).
struct SetupScreen: View {
    var title = "Prépare Shuli, ton tuteur"
    @EnvironmentObject var nav: Nav
    var body: some View {
        ScrollView {
            Column {
                VStack(alignment: .leading, spacing: 16) {
                    HStack { BackButton(action: nav.home); Spacer() }
                    Text(title).font(.app(24, .bold))
                    Text("Tout tourne sur ton Mac : télécharge une fois le cerveau de Shuli et la reconnaissance de ta voix.").foregroundStyle(Palette.muted)
                    DownloadCard { nav.home() }
                }.padding(.horizontal, 16).padding(.vertical, 32)
            }
        }.background(Palette.bg)
    }
}

/// Après le test de niveau : objectif, niveau visé, points à améliorer, prénom, temps par jour.
struct GoalSetupView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @State private var goal: String?
    @State private var focus: [String] = []
    @State private var name = ""
    @State private var minutes = 10
    @State private var target = "A2"
    @State private var loaded = false

    /// Axes du test qui révèlent un point à travailler (< 60).
    private var weak: [String] {
        guard store.profile?.placementDone == true, let r = store.placement else { return [] }
        let map: [(String, String)] = [("grammar", "grammar"), ("vocabulary", "vocabulary"), ("development", "speaking"), ("relevance", "listening")]
        return map.filter { k, _ in (r.axes[k] ?? nil).map { $0 < 60 } ?? false }.map(\.1)
    }

    var body: some View {
        let p = store.profile!
        ZStack(alignment: .bottom) {
            ScrollView {
                Column {
                    VStack(alignment: .leading, spacing: 24) {
                        VStack(alignment: .leading, spacing: 4) {
                            if p.placementDone == true {
                                Text("Ton niveau : \(p.level)").font(.app(14, .semibold)).foregroundStyle(Palette.accent)
                                    .padding(.horizontal, 12).padding(.vertical, 4).background(Palette.soft, in: Capsule())
                            }
                            HStack(spacing: 12) { Avatar(mood: .wink, size: 72); Text("Qu'est-ce qui te motive ?").font(.app(24, .heavy)) }.padding(.top, 12)
                            Text("Shuli adapte les conversations et le cours à ton objectif.").foregroundStyle(Palette.muted)
                        }
                        section("Ton objectif en hébreu") { ForEach(goalOrder, id: \.self) { g in Button(C.goals[g] ?? g) { goal = g }.buttonStyle(ChipStyle(active: goal == g)) } }
                        section("Quel niveau veux-tu atteindre ?", hint: "Shuli te conseille, après chaque réponse, ce qui te rapproche de ce niveau.") {
                            ForEach(Profile.levels.filter { (Profile.levels.firstIndex(of: $0) ?? 0) > (Profile.levels.firstIndex(of: p.level) ?? 0) }, id: \.self) { l in
                                Button(l) { target = l }.buttonStyle(ChipStyle(active: target == l))
                            }
                        }
                        section("En quoi veux-tu t'améliorer ?", hint: weak.isEmpty ? "Plusieurs choix possibles." : "D'après ton test, à travailler en priorité : \(weak.map { (C.focus[$0] ?? $0).lowercased() }.joined(separator: ", ")). Plusieurs choix possibles.") {
                            ForEach(focusOrder, id: \.self) { f in
                                Button(C.focus[f] ?? f) { if focus.contains(f) { focus.removeAll { $0 == f } } else { focus.append(f) } }.buttonStyle(ChipStyle(active: focus.contains(f)))
                            }
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            (Text("Ton prénom ").font(.app(16, .semibold)) + Text("(facultatif)").font(.app(14)).foregroundColor(Palette.muted))
                            TextField("Ex. : Léa", text: $name).textFieldStyle(.plain).padding(.horizontal, 12).frame(minHeight: 44)
                                .background(Palette.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                        }
                        section("Temps par jour") { ForEach([5, 10, 15, 20, 30], id: \.self) { m in Button("\(m) min") { minutes = m }.buttonStyle(ChipStyle(active: minutes == m)) } }
                    }.padding(.horizontal, 16).padding(.top, 32).padding(.bottom, 128)
                }
            }
            Button(goal == nil ? "Choisis ton objectif" : focus.isEmpty ? "Choisis au moins un point" : "C'est parti") {
                guard let goal else { return }
                var q = p
                q.goal = goal; q.focus = focus; q.targetLevel = target; q.name = name.trimmed.isEmpty ? nil : name.trimmed; q.dailyMinutes = minutes; q.onboarding = nil
                store.profile = q
                nav.tab = .cours; nav.home()
            }
            .buttonStyle(Btn(full: true, height: 56, fontSize: 16)).disabled(goal == nil || focus.isEmpty)
            .frame(maxWidth: 768).padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 16).frame(maxWidth: .infinity)
            .background(LinearGradient(colors: [Palette.bg.opacity(0), Palette.bg, Palette.bg], startPoint: .top, endPoint: .bottom))
        }
        .background(Palette.bg)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            goal = p.focus != nil ? p.goal : nil
            focus = p.focus ?? weak
            name = p.name ?? ""
            minutes = p.dailyMinutes
            target = p.target_
        }
    }

    private func section<V: View>(_ title: String, hint: String? = nil, @ViewBuilder _ content: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.app(16, .semibold))
            if let hint { Text(hint).font(.app(14)).foregroundStyle(Palette.muted) }
            Flow { content() }
        }
    }
}
