import SwiftUI

// components/Cours.tsx : parcours (niveaux, unités, frise des jours), écran du jour, ressources.

struct CoursView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    @State private var seg = "path"
    @State private var open: String?

    var body: some View {
        let p = (store.profile ?? NEW_PROFILE)
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 4) {
                ForEach([("path", "Parcours"), ("res", "Ressources")], id: \.0) { k, label in
                    Button { seg = k } label: {
                        Text(label).font(.app(14, .semibold)).foregroundStyle(seg == k ? Palette.accent : Palette.muted)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(seg == k ? Palette.card : .clear, in: Capsule())
                            .shadow(color: seg == k ? .black.opacity(0.05) : .clear, radius: 6, y: 3)
                    }.buttonStyle(PressStyle())
                }
            }.padding(4).background(Palette.line.opacity(0.6), in: Capsule())
            if seg == "res" {
                ResourcesView(startTab: nav.coursTab)
            } else {
                ForEach(Array(C.course.enumerated()), id: \.element.id) { n, lvl in
                    let days = lvl.units.flatMap(\.days)
                    let done = days.filter { dayDone(store.course, $0.id) }.count
                    let isOpen = (open ?? courseLevelFor(p.level).id) == lvl.id
                    VStack(spacing: 16) {
                        Button { open = isOpen ? "-" : lvl.id } label: {
                            HStack(spacing: 16) {
                                Avatar(size: 56)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(lvl.title).font(.app(18, .bold))
                                    Text("\(lvl.cefr) · \(lvl.units.isEmpty ? "Bientôt disponible" : "\(done)/\(days.count) jours")").foregroundStyle(Palette.muted)
                                    if isOpen && n == 0 { Text("Démarrage rapide").foregroundStyle(Palette.muted) }
                                }
                                Spacer()
                                Image(systemName: lvl.units.isEmpty ? "lock" : isOpen ? "chevron.up" : "chevron.down").foregroundStyle(Palette.accent)
                                    .frame(width: 40, height: 40).background(Palette.soft, in: Circle())
                            }
                            .padding(16).background(Palette.card, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.soft)).cardShadow()
                        }.buttonStyle(PressStyle()).disabled(lvl.units.isEmpty).opacity(lvl.units.isEmpty ? 0.6 : 1)
                        if isOpen {
                            ForEach(Array(lvl.units.enumerated()), id: \.element.id) { k, u in UnitPath(unit: u, index: k + 1) }
                        }
                    }
                }
            }
        }
        .onAppear { if nav.coursTab != nil { seg = "res" } }
    }
}

private struct UnitPath: View {
    let unit: Unit
    let index: Int
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    var body: some View {
        let done = unit.days.filter { dayDone(store.course, $0.id) }.count
        let firstOpen = unit.days.firstIndex { !dayDone(store.course, $0.id) }
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Image(systemName: "book.fill").font(.system(size: 22)).foregroundStyle(Palette.accent).frame(width: 48, height: 48).background(Palette.accent.opacity(0.1), in: Circle())
                VStack(alignment: .leading, spacing: 8) {
                    Text("Unité \(index) · \(unit.title)").font(.app(16, .bold))
                    GeometryReader { g in
                        ZStack(alignment: .leading) { Capsule().fill(Palette.line); Capsule().fill(Palette.accent).frame(width: g.size.width * Double(done) / Double(unit.days.count)) }
                    }.frame(height: 4)
                    Text("\(done)/\(unit.days.count)").font(.app(14, .semibold)).foregroundStyle(Palette.accent)
                        .padding(.horizontal, 10).padding(.vertical, 2).background(Palette.accent.opacity(0.1), in: Capsule())
                }
            }
            .padding(16).background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.accent.opacity(0.15)))
            ZStack {
                Rectangle().fill(Palette.line).frame(width: 2)
                VStack(spacing: 0) {
                    ForEach(Array(unit.days.enumerated()), id: \.element.id) { k, d in
                        let started = store.course[d.id] != nil
                        let complete = dayDone(store.course, d.id)
                        let card = Button { nav.open(.day(d.id)) } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 0) {
                                    Text("Jour \(k + 1)").font(.app(16, .bold))
                                    Text(d.title).font(.app(15)).multilineTextAlignment(.leading)
                                    Text(complete ? "Terminé" : started ? "En cours" : "À apprendre").font(.app(14)).foregroundStyle(Palette.muted)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "play.fill").foregroundStyle(Palette.accent)
                            }
                            .padding(12).background(Palette.card, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line, lineWidth: 2))
                            .background(Color.lineDeep, in: RoundedRectangle(cornerRadius: 16).offset(y: 3))
                        }.buttonStyle(PressStyle())
                        HStack(spacing: 0) {
                            Group { if k % 2 == 0 { card } else { Color.clear } }.frame(maxWidth: .infinity)
                            ZStack {
                                Circle().fill(complete ? Color(hex: 0x1f7347) : started ? Palette.accentDeep : .lineDeep).offset(y: 5)
                                Circle().fill(complete ? Palette.good : started ? Palette.accent : Palette.line)
                                if complete { Image(systemName: "checkmark").foregroundStyle(.white) }
                                else if k == firstOpen { Avatar(mood: .wink, size: 44) }
                                else { Image(systemName: "book.fill").foregroundStyle(started ? .white : Palette.muted) }
                            }.frame(width: 56, height: 56).frame(width: 64)
                            Group { if k % 2 == 1 { card } else { Color.clear } }.frame(maxWidth: .infinity)
                        }.padding(.vertical, 12)
                    }
                }
            }.padding(.vertical, 12)
        }.padding(.horizontal, 12)
    }
}

struct DayScreen: View {
    let dayId: String
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    var body: some View {
        let ref = Content.allDays.first { $0.day.id == dayId }!
        let d = ref.day
        let g = (store.profile ?? NEW_PROFILE).g
        let p = store.course[d.id]
        ScrollView {
            Column {
                VStack(spacing: 0) {
                    HStack { BackButton { nav.tab = .cours; nav.home() }; Spacer() }.padding(.top, 12)
                    Avatar(mood: .think, size: 120)
                    Text("\(ref.unit.title) · Jour \((ref.unit.days.firstIndex(of: d) ?? 0) + 1)").font(.app(14, .semibold)).foregroundStyle(Palette.muted).padding(.top, 12)
                    Text(d.title).font(.app(24, .bold))
                    Text(d.key.he(g)).font(.he(20)).padding(.top, 8)
                    Text("\(d.key.tr(g)) — \(d.key.fr)").font(.app(14)).foregroundStyle(Palette.muted)
                    Text("2 activités").font(.app(16, .semibold)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 32)
                    VStack(spacing: 0) {
                        act("Entraînement à la parole", "\(d.steps.count) étapes · ~4 min", "play.fill", [Color(hex: 0x2f9468), Palette.accent], done: p?.speaking != nil) { nav.open(.practice(d.id)) }
                        act("Jeu de rôle avec Shuli", "Conversation libre · ~5 min", "person.wave.2", [Color(hex: 0xf29b2f), Palette.honey], done: p?.scenario != nil) { nav.open(.chat(dayScenario(d), dayId: d.id)) }
                    }.background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).cardShadow().padding(.top, 8)
                }.padding(.horizontal, 16).padding(.bottom, 32)
            }
        }.background(Palette.bg)
    }
    private func act(_ title: String, _ sub: String, _ icon: String, _ tint: [Color], done: Bool, go: @escaping () -> Void) -> some View {
        Button { if app.ai == .ready { go() } else if app.ai != .loading { nav.open(.setup) } } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 22)).foregroundStyle(.white).frame(width: 48, height: 48)
                    .background(LinearGradient(colors: tint, startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                VStack(alignment: .leading) { Text(title).font(.app(16, .medium)); Text(sub).font(.app(14)).foregroundStyle(Palette.muted) }
                Spacer()
                Image(systemName: "checkmark").foregroundStyle(done ? .white : Palette.card).frame(width: 40, height: 40).background(done ? Palette.good : Palette.line, in: Circle())
            }.padding(16)
        }.buttonStyle(PressStyle()).opacity(app.ai == .ready ? 1 : 0.55)
    }
}

struct ResourcesView: View {
    var startTab: String?
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @State private var tab = "alpha"
    @State private var theme = C.resources.themes[0].id
    @State private var added: [String] = []
    private let tabs = [("alpha", "Alphabet"), ("vocab", "Vocabulaire"), ("phrases", "Phrases"), ("grammar", "Grammaire")]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(tabs, id: \.0) { k, l in
                    Button(l) { tab = k }.buttonStyle(PressStyle()).font(.app(14))
                        .padding(.horizontal, 12).frame(minHeight: 36)
                        .background(tab == k ? Palette.accent : Palette.card, in: Capsule()).foregroundStyle(tab == k ? .white : Palette.ink)
                        .overlay(Capsule().stroke(tab == k ? Palette.accent : Palette.line))
                }
            }
            switch tab {
            case "alpha":
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(C.resources.alphabet, id: \.he) { l in
                        Button { say(l.example.he) } label: {
                            VStack(spacing: 2) {
                                (Text(l.he).font(.he(36)) + Text(l.final.map { " \($0)" } ?? "").font(.he(24)).foregroundColor(Palette.muted))
                                Text(l.name).font(.app(14, .semibold))
                                Text(l.sound).font(.app(12)).foregroundStyle(Palette.muted)
                                (Text(l.example.he).font(.he(12)) + Text(" · \(l.example.fr)").font(.app(12))).padding(.top, 4)
                            }.frame(maxWidth: .infinity).card(12)
                        }.buttonStyle(PressStyle())
                    }
                }
            case "vocab":
                HStack(spacing: 8) {
                    ForEach(C.resources.themes) { t in
                        Button(t.title) { theme = t.id }.buttonStyle(PressStyle()).font(.app(14, theme == t.id ? .semibold : .regular))
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .background(theme == t.id ? Palette.accent.opacity(0.15) : Palette.line.opacity(0.5), in: Capsule())
                            .foregroundStyle(theme == t.id ? Palette.accent : Palette.ink)
                    }
                }
                if let t = C.resources.themes.first(where: { $0.id == theme }) {
                    WordList(words: t.words, say: say)
                    Button {
                        store.addWords(t.words.map { NewWord(word: $0.he, transliteration: $0.tr, meaning: $0.fr) }); added.append(t.id)
                    } label: {
                        Text(added.contains(t.id) ? "Ajouté à tes révisions ✓" : "Ajouter ces mots à mes révisions").font(.app(14, .medium)).foregroundStyle(Palette.accent)
                            .frame(maxWidth: .infinity, minHeight: 44).overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.accent))
                    }.buttonStyle(PressStyle()).disabled(added.contains(t.id)).opacity(added.contains(t.id) ? 0.5 : 1)
                }
            case "phrases": WordList(words: C.resources.phrases, say: say)
            default:
                ForEach(C.resources.grammar) { g in
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 8) { Text(g.rule).font(.app(14)); WordList(words: g.examples, say: say) }.padding(.top, 8)
                    } label: { Text(g.title).font(.app(16, .semibold)) }
                    .card(12)
                }
            }
        }
        .onAppear { if let s = startTab { tab = s } }
    }
    private func say(_ t: String) { Task { await app.voice.say(t.sub("[…/]", with: " "), rate: 0.8) } }
}

struct WordList: View {
    let words: [Word]
    let say: (String) -> Void
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                if i > 0 { Divider().overlay(Palette.line) }
                HStack(spacing: 12) {
                    Button { say(w.he) } label: { Image(systemName: "speaker.wave.2").foregroundStyle(Palette.accent).frame(width: 36, height: 36) }.buttonStyle(PressStyle())
                    VStack(alignment: .leading, spacing: 0) {
                        Text(w.he).font(.he(18))
                        Text(w.tr + (w.note.map { " · \($0)" } ?? "")).font(.app(12)).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Text(w.fr).font(.app(14)).multilineTextAlignment(.trailing)
                }.padding(.horizontal, 12).padding(.vertical, 8)
            }
        }.background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).cardShadow()
    }
}
