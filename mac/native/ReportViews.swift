import SwiftUI

// components/Report.tsx, Radar.tsx, Progress.tsx.

/// Radar à N axes (0-100).
struct Radar: View {
    let values: [(label: String, v: Int)]
    var size: CGFloat = 240
    var body: some View {
        Canvas { ctx, sz in
            // viewBox -34 -6 268 212
            let k = min(sz.width / 268, sz.height / 212)
            ctx.translateBy(x: (sz.width - 268 * k) / 2 + 34 * k, y: (sz.height - 212 * k) / 2 + 6 * k)
            ctx.scaleBy(x: k, y: k)
            let c = CGPoint(x: 100, y: 100), R = 62.0, n = Double(values.count)
            func pt(_ i: Int, _ r: Double) -> CGPoint {
                let a = -Double.pi / 2 + Double(i) * 2 * .pi / n
                return CGPoint(x: c.x + cos(a) * r, y: c.y + sin(a) * r)
            }
            for f in [1.12, 0.75, 0.4] {
                let p = Path(ellipseIn: CGRect(x: c.x - R * f, y: c.y - R * f, width: 2 * R * f, height: 2 * R * f))
                ctx.fill(p, with: .color(Palette.soft.opacity(0.7)))
                ctx.stroke(p, with: .color(Palette.line.opacity(0.6)))
            }
            for i in values.indices {
                var l = Path(); l.move(to: c); l.addLine(to: pt(i, R))
                ctx.stroke(l, with: .color(Palette.line), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
            var poly = Path()
            for (i, x) in values.enumerated() {
                let p = pt(i, Double(max(4, x.v)) / 100 * R)
                if i == 0 { poly.move(to: p) } else { poly.addLine(to: p) }
            }
            poly.closeSubpath()
            ctx.fill(poly, with: .color(Palette.accent.opacity(0.28)))
            ctx.stroke(poly, with: .color(Palette.accent), style: StrokeStyle(lineWidth: 1.5, lineJoin: .round))
            for (i, x) in values.enumerated() {
                let p = pt(i, R + 26)
                ctx.draw(Text(x.label).font(.app(9)).foregroundColor(Palette.muted), at: CGPoint(x: p.x, y: p.y - 3))
                ctx.draw(Text("\(x.v)").font(.app(10, .bold)).foregroundColor(Palette.accent), at: CGPoint(x: p.x, y: p.y + 9))
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(values.map { "\($0.label) \($0.v)" }.joined(separator: ", "))
    }
}

func scenarioTitle(_ s: SessionRecord) -> String { s.title ?? C.scenarios.first { $0.id == s.scenarioId }?.title ?? s.scenarioId }

struct ReportView: View {
    let rec: SessionRecord
    var onClose: (() -> Void)?
    @EnvironmentObject var nav: Nav
    var body: some View {
        let r = rec.report
        ZStack(alignment: .bottom) {
            ScrollView {
                Column {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(spacing: 4) {
                            Avatar(mood: (r?.score ?? 0) >= 60 ? .cheer : .happy, size: 112)
                            Text("Bilan · \(scenarioTitle(rec))").font(.app(18, .bold)).padding(.top, 8)
                            Text("\(max(1, Int((Double(rec.seconds) / 60).rounded()))) min · \(rec.turns) réponses").font(.app(14)).foregroundStyle(Palette.muted)
                        }.frame(maxWidth: .infinity)
                        if let r {
                            VStack(spacing: 4) {
                                Text("Score").font(.app(16, .medium))
                                Text("\(Text("\(r.score)").font(.app(48, .bold)).foregroundColor(Palette.accent))\(Text("/100").font(.app(20)).foregroundColor(Palette.muted))")
                                Radar(values: r.relevance != nil
                                      ? [("Pertinence", r.relevance!), ("Grammaire", r.grammar ?? 0), ("Participation", r.participation), ("Vocabulaire", r.vocabulary)]
                                      : [("Participation", r.participation), ("Longueur", r.fluency), ("Vocabulaire", r.vocabulary)])
                                Text(r.scoreExplanation).font(.app(12)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                            }.frame(maxWidth: .infinity).card()
                            if !r.summary.isEmpty { Text(r.summary) }
                            if let errs = r.mainErrors, !errs.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(r.relevance != nil ? "Phrases à revoir (corrections de l'IA)" : "Erreurs principales").font(.app(16, .semibold))
                                    ForEach(errs, id: \.self) { Text("• \($0)").font(.app(14)) }
                                }.frame(maxWidth: .infinity, alignment: .leading).card()
                            }
                            if !r.tips.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(Text("Conseils d'amélioration ").font(.app(16, .semibold)))\(Text("(\(r.tips.count))").font(.app(14)))")
                                    ForEach(r.tips, id: \.self) { Text("• \($0)").font(.app(14)) }
                                }.frame(maxWidth: .infinity, alignment: .leading).card()
                            }
                        } else {
                            Text("Le rapport détaillé n'a pas pu être généré (l'IA locale a échoué). La session est quand même enregistrée.")
                                .font(.app(14)).foregroundStyle(Palette.muted).frame(maxWidth: .infinity, alignment: .leading).card()
                        }
                        if !rec.words.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Nouveaux mots (ajoutés à ton vocabulaire)").font(.app(16, .semibold)).padding(.bottom, 4)
                                ForEach(rec.words, id: \.word) { w in
                                    HStack { Text(w.word).font(.he(18)); Text(w.transliteration).font(.app(14)).foregroundStyle(Palette.muted); Spacer(); Text(w.meaning).font(.app(14)) }
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading).card()
                        }
                    }
                    .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 112)
                }
            }
            Button("Retour à l'accueil") { (onClose ?? nav.home)() }.buttonStyle(Btn(full: true, height: 56, fontSize: 16))
                .frame(maxWidth: 768).padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 16).frame(maxWidth: .infinity)
                .background(LinearGradient(colors: [Palette.bg.opacity(0), Palette.bg, Palette.bg], startPoint: .top, endPoint: .bottom))
        }
        .background(Palette.bg)
    }
}

/// Onglet Bilan (components/Progress.tsx).
struct ProgressView_: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var nav: Nav
    var body: some View {
        let sessions = store.sessions
        let p = (store.profile ?? NEW_PROFILE)
        let wk = weekStats(sessions)
        let st = streakInfo(sessions)
        let scored = Array(sessions.filter { $0.report != nil }.suffix(12))
        let total = sessions.reduce(0) { $0 + $1.seconds }
        let week: [(label: String, min: Double)] = (0..<7).map { i in
            let d = Calendar.current.date(byAdding: .day, value: -(6 - i), to: Date())!
            let sec = sessions.filter { parseISO($0.date).map { Calendar.current.isDate($0, inSameDayAs: d) } ?? false }.reduce(0) { $0 + $1.seconds }
            let f = DateFormatter(); f.locale = Locale(identifier: "fr_FR"); f.dateFormat = "EEE"
            return (f.string(from: d), Double(sec) / 60)
        }
        let maxMin = max(Double(p.dailyMinutes), week.map(\.min).max() ?? 0)
        VStack(alignment: .leading, spacing: 16) {
            Text("Progression").font(.app(18, .bold))
            HStack(spacing: 8) {
                stat("\(st.days)", "jours d'affilée"); stat("\(Int((Double(total) / 60).rounded()))", "min de pratique"); stat("\(sessions.count)", "sessions")
            }
            HStack(spacing: 16) {
                Avatar(mood: wk.minutes >= p.dailyMinutes * 3 ? .cheer : wk.minutes > 0 ? .happy : .sad, size: 64)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Bilan de la semaine").font(.app(14, .bold))
                    Text("\(wk.minutes) min · \(wk.activeDays) jour\(wk.activeDays > 1 ? "s" : "") sur 7 · \(wk.sessions) séance\(wk.sessions > 1 ? "s" : "")\(wk.best.map { " · meilleur score \($0)" } ?? "")").font(.app(14))
                    Text(wk.prevMinutes == 0 ? (wk.minutes > 0 ? "Beau début !" : "Une petite séance aujourd'hui ?") : wk.minutes >= wk.prevMinutes ? "+\(wk.minutes - wk.prevMinutes) min par rapport à la semaine dernière." : "\(wk.minutes - wk.prevMinutes) min par rapport à la semaine dernière : tu peux rattraper.")
                        .font(.app(14)).foregroundStyle(Palette.muted)
                    if st.frozen { Text("Un jour manqué a été pardonné : ta série continue.").font(.app(12)).foregroundStyle(Palette.muted) }
                }
                Spacer()
            }.card()
            VStack(alignment: .leading, spacing: 8) {
                Text("Cette semaine (min)").font(.app(16, .semibold))
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(week.indices, id: \.self) { i in
                        VStack(spacing: 4) {
                            VStack { Spacer(minLength: 0); RoundedRectangle(cornerRadius: 4).fill(Palette.accent).frame(height: max(week[i].min > 0 ? 3 : 0, 80 * week[i].min / maxMin)) }.frame(height: 80)
                            Text(week[i].label).font(.app(11)).foregroundStyle(Palette.muted)
                        }.frame(maxWidth: .infinity)
                    }
                }.frame(height: 112)
            }.frame(maxWidth: .infinity, alignment: .leading).card()
            if !scored.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Score des sessions").font(.app(16, .semibold))
                    Canvas { ctx, sz in
                        let W = sz.width, H = sz.height
                        let pts = scored.enumerated().map { i, s in
                            CGPoint(x: scored.count == 1 ? W / 2 : Double(i) / Double(scored.count - 1) * (W - 20) + 10, y: H - 10 - Double(s.report!.score) / 100 * (H - 20))
                        }
                        var line = Path(); line.addLines(pts)
                        ctx.stroke(line, with: .color(Palette.accent), lineWidth: 2.5)
                        for p in pts { ctx.fill(Path(ellipseIn: CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8)), with: .color(Palette.accent)) }
                    }.frame(height: 110)
                }.frame(maxWidth: .infinity, alignment: .leading).card()
            }
            Text("Historique").font(.app(16, .semibold))
            if sessions.isEmpty {
                HStack(spacing: 12) { Avatar(mood: .sad, size: 56); Text("Aucune session pour l'instant. Viens parler avec moi !").font(.app(14)).foregroundStyle(Palette.muted) }
            }
            ForEach(sessions.reversed()) { s in
                Button { if s.report != nil { nav.open(.report(s)) } } label: {
                    HStack {
                        Image(systemName: Icon.scenario(s.scenarioId)).foregroundStyle(Palette.accent).frame(width: 22)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(scenarioTitle(s))
                            Text("\(parseISO(s.date).map { $0.formatted(.dateTime.day().month(.twoDigits).year(.twoDigits).hour().minute().locale(Locale(identifier: "fr_FR"))) } ?? "") · \(max(1, Int((Double(s.seconds) / 60).rounded()))) min")
                                .font(.app(12)).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        Text(s.report.map { "\($0.score)" } ?? "–").font(.app(20, .bold)).foregroundStyle(Palette.accent)
                    }.card(12)
                }.buttonStyle(PressStyle())
            }
        }
    }
    private func stat(_ v: String, _ l: String) -> some View {
        VStack(spacing: 2) { Text(v).font(.app(24, .bold)); Text(l).font(.app(12)).foregroundStyle(Palette.muted) }.frame(maxWidth: .infinity).card()
    }
}
