import SwiftUI

// components/Parler.tsx (accueil), ScenarioList, components/TutorHub.tsx.

func topicScenario(_ t: Topic? = nil) -> Scenario {
    let tp = t ?? C.topics.randomElement()!
    return Scenario(id: "topic-\(tp.id)", title: "Discussion · \(tp.label)", goal: "Parler de : \(tp.label)",
                    role: "Shuli, un tuteur israélien chaleureux et curieux qui discute naturellement",
                    opening: "Shuli lance un sujet : \(tp.label.lowercased()).", difficulty: 1, starters: ["he": tp.starter])
}

func dayScenario(_ d: Day) -> Scenario {
    Scenario(id: d.id, title: d.title, goal: d.scenario.goal, role: d.scenario.role, opening: "Jeu de rôle : \(d.scenario.role).", difficulty: 1, starters: ["he": d.scenario.starter])
}

/// Atteindre une fonction : prête, ou mène au téléchargement (en chargement : on patiente).
private func reach(_ app: AppModel, _ nav: Nav, _ s: Screen) {
    if app.ai == .ready { nav.open(s) } else if app.ai != .loading { nav.open(.setup) }
}

struct ParlerView: View {
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav

    var body: some View {
        let p = (store.profile ?? NEW_PROFILE)
        let off = app.ai == .ready ? 1.0 : 0.55
        let nd = nextDay(store.course, p.level)
        let due = dueCards(store.vocab).count
        let all = Content.allDays
        let pct = Double(all.filter { dayDone(store.course, $0.day.id) }.count) / Double(all.count)
        let st = streakInfo(store.sessions)
        VStack(alignment: .leading, spacing: 24) {
            HStack(spacing: 8) {
                Button { reach(app, nav, .chat(topicScenario(), dayId: nil)) } label: {
                    Image(systemName: "bolt.fill").font(.system(size: 18)).frame(width: 44, height: 44).background(Palette.card, in: Circle()).cardShadow()
                }.buttonStyle(PressStyle(scale: 0.95)).opacity(off).help("Conversation rapide")
                Spacer()
                chip("calendar", "\(st.days)", st.atRisk ? "Jours d'affilée : pratique aujourd'hui pour garder ta série" : "Jours d'affilée")
                chip("clock", "\(todaySeconds(store.sessions) / 60)/\(p.dailyMinutes)", "Minutes aujourd'hui")
                chip("chart.line.uptrend.xyaxis", p.level, "Ton niveau")
            }
            Text("Salut\(p.name.map { " \($0)" } ?? "") ! Je suis Shuli !").font(.app(18))

            if due > 0 {
                Button { nav.open(.review) } label: {
                    HStack(spacing: 16) {
                        Avatar(mood: .wink, size: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Révision du jour · \(due) mot\(due > 1 ? "s" : "")").font(.app(16, .heavy))
                            Text("≈ \(max(1, Int((Double(due) * 0.4).rounded()))) min avant la leçon, pour ne rien oublier.").font(.app(14))
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 20))
                    }
                    .foregroundStyle(Color(hex: 0x5a3a05)).padding(12)
                    .background(Color(hex: 0xfff3e0), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: 0xf29b2f, opacity: 0.5), lineWidth: 2))
                    .background(Color(hex: 0xf29b2f, opacity: 0.4), in: RoundedRectangle(cornerRadius: 16).offset(y: 3))
                }.buttonStyle(PressStyle())
            }

            // Carte du parcours
            VStack(alignment: .leading, spacing: 0) {
                Text("Parle hébreu en \(all.count) jours").font(.app(20, .bold)).frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 140)
                GeometryReader { g in
                    let w = g.size.width * 0.74
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.3)).frame(width: w, height: 4)
                        Capsule().fill(.white).frame(width: w * pct, height: 4)
                        Circle().fill(.white).frame(width: 20, height: 20)
                            .overlay(Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.accent))
                            .offset(x: w * pct - 10)
                    }.frame(height: 20)
                }.frame(height: 20).padding(.top, 14)
                Text("Prochaine leçon : \(nd.day.title)").font(.app(15)).opacity(0.9).padding(.top, 10)
                Button { nav.tab = .cours; nav.coursTab = nil } label: {
                    HStack(spacing: 2) { Text("Vue du cours"); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)) }
                        .font(.app(12, .bold)).padding(.leading, 12).padding(.trailing, 8).frame(minHeight: 32)
                        .overlay(Capsule().stroke(.white.opacity(0.7)))
                }.buttonStyle(PressStyle()).padding(.top, 12)
                Button { reach(app, nav, .day(nd.day.id)) } label: {
                    Text("Démarrer").font(.app(17, .semibold)).foregroundStyle(Palette.accent).frame(maxWidth: .infinity, minHeight: 48).background(.white, in: Capsule())
                }.buttonStyle(PressStyle()).padding(.top, 16)
            }
            .foregroundStyle(.white)
            .padding(20).padding(.top, 4)
            .background(Palette.accent, in: RoundedRectangle(cornerRadius: 24))
            .overlay(alignment: .topTrailing) { Avatar(mood: .wink, size: 104).offset(x: -8, y: -28).allowsHitTesting(false) }
            .opacity(off)
            .padding(.top, due > 0 ? 8 : 0)

            VStack(alignment: .leading, spacing: 12) {
                Text("S'entraîner à parler").font(.app(20, .bold))
                practice(.hub, "Parler avec Shuli", "Discussion libre, professeur, grammaire…", icon: nil, tint: nil)
                practice(.scenarios, "Situations réelles", "Restaurant, taxi, entretien…", icon: "bubble.left.and.text.bubble.right", tint: [Color(hex: 0xf29b2f), Palette.honey])
                practice(.placement, "Test de niveau", p.placementDone == true ? "Refaire le test · 3 min" : "Découvre ton niveau en 3 min", icon: "gauge.with.dots.needle.67percent", tint: [Color(hex: 0x2f9468), Palette.accent])
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("Assistant gratuit").font(.app(20, .bold))
                HStack(spacing: 12) {
                    tool(.translate, "Traduction", "Avec prononciation", "character.bubble")
                    tool(.define, "Dictionnaire", "Sens, genre, exemples", "magnifyingglass")
                }
            }
        }
        .padding(.bottom, 90)
    }

    private func chip(_ icon: String, _ v: String, _ label: String) -> some View {
        HStack(spacing: 6) { Image(systemName: icon).font(.system(size: 15)); Text(v).font(.app(14, .bold)) }
            .padding(.horizontal, 14).frame(minHeight: 44).background(Palette.card, in: Capsule()).cardShadow().help(label)
    }

    private func practice(_ to: Screen, _ title: String, _ sub: String, icon: String?, tint: [Color]?) -> some View {
        Button { reach(app, nav, to) } label: {
            HStack(spacing: 16) {
                if let icon, let tint {
                    Image(systemName: icon).font(.system(size: 24)).foregroundStyle(.white).frame(width: 56, height: 56)
                        .background(LinearGradient(colors: tint, startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                } else { Avatar(size: 56) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.app(16, .bold))
                    Text(sub).font(.app(14)).foregroundStyle(Palette.muted)
                }
                Spacer()
            }.card()
        }.buttonStyle(PressStyle()).opacity(app.ai == .ready ? 1 : 0.55)
    }

    private func tool(_ m: ModeId, _ t: String, _ sub: String, _ icon: String) -> some View {
        Button { reach(app, nav, .tool(m)) } label: {
            VStack(alignment: .leading) {
                Text(t).font(.app(16, .bold))
                Text(sub).font(.app(12)).foregroundStyle(Palette.muted)
                Spacer(minLength: 8)
                HStack { Spacer(); Image(systemName: icon).font(.system(size: 20)).foregroundStyle(Palette.accent).frame(width: 40, height: 40).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12)) }
            }
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading).card()
        }.buttonStyle(PressStyle()).opacity(app.ai == .ready ? 1 : 0.55)
    }
}

/// Barre du bas de l'accueil : « Je suis Shuli, ton tuteur » → hub.
struct HubBar: View {
    @EnvironmentObject var app: AppModel
    @EnvironmentObject var nav: Nav
    var body: some View {
        Button { reach(app, nav, .hub) } label: {
            HStack(spacing: 12) {
                Avatar(size: 40)
                Text("Je suis Shuli, ton tuteur").foregroundStyle(Palette.muted)
                Spacer()
                Image(systemName: "mic.fill").foregroundStyle(.white).frame(width: 40, height: 40).background(Palette.accent, in: Circle())
            }
            .padding(.horizontal, 8).frame(minHeight: 56)
            .background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.accent, lineWidth: 1.5)).cardShadow()
        }
        .buttonStyle(PressStyle())
        .frame(maxWidth: 768)
        .padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        .background(LinearGradient(colors: [Palette.bg.opacity(0), Palette.bg, Palette.bg], startPoint: .top, endPoint: .bottom))
        .opacity(app.ai == .ready ? 1 : 0.55)
    }
}

struct ScenarioListView: View {
    @EnvironmentObject var nav: Nav
    var body: some View {
        VStack(spacing: 0) {
            Column { Header(title: "Situations réelles", onBack: nav.home) }
            ScrollView {
                Column {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(C.scenarios.filter { $0.id != "free" }) { s in
                            Button { nav.open(.chat(s, dayId: nil)) } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Image(systemName: Icon.scenario(s.id)).font(.system(size: 18)).foregroundStyle(Palette.accent)
                                        .frame(width: 40, height: 40).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12))
                                    Text(s.title).font(.app(14, .semibold)).padding(.top, 4)
                                    Text(s.goal).font(.app(12)).foregroundStyle(Palette.muted).multilineTextAlignment(.leading)
                                    (Text(String(repeating: "●", count: s.difficulty)) + Text(String(repeating: "●", count: 3 - s.difficulty)).foregroundColor(Palette.muted.opacity(0.3)))
                                        .font(.system(size: 11)).foregroundStyle(Palette.muted).padding(.top, 4)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).card(12)
                            }.buttonStyle(PressStyle(scale: 0.98))
                        }
                    }.padding(16)
                }
            }
        }.background(Palette.bg)
    }
}

struct TutorHubView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    private let modes: [(ModeId, String, String)] = [
        (.talk, "Discussion libre", "Shuli lance un sujet"),
        (.daily, "Sujets du quotidien", "Choisis un thème · 5 min"),
        (.teacher, "Comment dire… ?", "Une phrase en français, en hébreu"),
        (.grammar, "Grammaire", "Les règles expliquées simplement"),
        (.translate, "Traduction intelligente", "Avec prononciation et variantes"),
        (.define, "Définir un mot", "Dictionnaire intelligent"),
    ]
    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                Column {
                    VStack(spacing: 0) {
                        HStack { BackButton(action: nav.home); Spacer() }.padding(.top, 12)
                        Avatar(mood: .wink, size: 128)
                        Text("Shuli").font(.app(30, .bold)).padding(.top, 16)
                        Text("Salut\(store.profile?.name.map { " \($0)" } ?? "") !").padding(.top, 8)
                        Text("Qu'est-ce que je peux faire pour toi ?").font(.app(20, .bold)).padding(.top, 16)
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(modes, id: \.0) { m in
                                Button { open(m.0) } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(m.1).font(.app(16, .bold))
                                        Text(m.2).font(.app(14)).foregroundStyle(Palette.muted)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 80, alignment: .leading).padding(16)
                                    .background(Palette.soft, in: RoundedRectangle(cornerRadius: 16))
                                }.buttonStyle(PressStyle(scale: 0.98))
                            }
                        }.padding(.top, 24)
                    }.padding(.horizontal, 16).padding(.bottom, 112)
                }
            }
            Button { open(.talk) } label: {
                Label("Parler directement", systemImage: "mic.fill").font(.app(16, .semibold)).foregroundStyle(.white)
                    .frame(maxWidth: 768, minHeight: 56)
                    .background(LinearGradient(colors: [Color(hex: 0x2f9468), Color(hex: 0x1f6f50)], startPoint: .leading, endPoint: .trailing), in: Capsule())
            }
            .buttonStyle(PressStyle())
            .padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 16)
            .frame(maxWidth: .infinity)
            .background(LinearGradient(colors: [Palette.bg.opacity(0), Palette.bg, Palette.bg], startPoint: .top, endPoint: .bottom))
        }.background(Palette.bg)
    }
    private func open(_ m: ModeId) {
        switch m {
        case .grammar: nav.coursTab = "grammar"; nav.tab = .cours; nav.home()
        case .talk, .daily: nav.open(.chat(topicScenario(), dayId: nil))
        default: nav.open(.tool(m))
        }
    }
}
