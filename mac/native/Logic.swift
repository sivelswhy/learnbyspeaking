import Foundation

// lib/streak.ts, lib/srs.ts, components/ui.tsx (wordMatch), lib/content/course-he.ts (courseLevelFor), Parler.tsx (nextDay).

private let cal = Calendar.current
private func dayKey(_ d: Date) -> Date { cal.startOfDay(for: d) }

func todaySeconds(_ sessions: [SessionRecord]) -> Int {
    let d = dayKey(Date())
    return sessions.filter { parseISO($0.date).map(dayKey) == d }.reduce(0) { $0 + $1.seconds }
}

struct Streak { var days: Int; var frozen: Bool; var atRisk: Bool }

/// Série de jours d'affilée avec « gel » : un jour manqué pardonné par période de 7 jours.
func streakInfo(_ sessions: [SessionRecord], now: Date = Date()) -> Streak {
    let active = Set(sessions.compactMap { parseISO($0.date).map(dayKey) })
    var d = dayKey(now)
    let today = active.contains(d)
    if !today { d = cal.date(byAdding: .day, value: -1, to: d)! }
    var days = 0, i = 0, lastFreeze = -99, frozen = false
    while i <= 3650 {
        let cur = cal.date(byAdding: .day, value: -i, to: d)!
        if active.contains(cur) { days += 1 }
        else {
            let before = cal.date(byAdding: .day, value: -1, to: cur)!
            if i - lastFreeze >= 7 && days > 0 && active.contains(before) { lastFreeze = i; frozen = true } else { break }
        }
        i += 1
    }
    return Streak(days: days, frozen: frozen, atRisk: days > 0 && !today)
}

struct WeekStats { var minutes: Int; var prevMinutes: Int; var activeDays: Int; var sessions: Int; var best: Int? }

func weekStats(_ sessions: [SessionRecord], now: Date = Date()) -> WeekStats {
    let start = cal.date(byAdding: .day, value: -6, to: dayKey(now))!
    let prevStart = cal.date(byAdding: .day, value: -7, to: start)!
    let dated = sessions.compactMap { s in parseISO(s.date).map { (s, $0) } }
    let inWeek = dated.filter { $0.1 >= start }
    let prev = dated.filter { $0.1 >= prevStart && $0.1 < start }
    let scores = inWeek.compactMap { $0.0.report?.score }
    return WeekStats(minutes: Int((Double(inWeek.reduce(0) { $0 + $1.0.seconds }) / 60).rounded()),
                     prevMinutes: Int((Double(prev.reduce(0) { $0 + $1.0.seconds }) / 60).rounded()),
                     activeDays: Set(inWeek.map { dayKey($0.1) }).count, sessions: inWeek.count, best: scores.max())
}

// MARK: Révision espacée (SM-2, 4 notes)

enum Grade: String { case again, hard, good, easy }
private let LEITNER = [0.0, 1, 3, 7, 21]
func mastery(_ ivl: Double) -> Int { ivl < 1 ? 0 : ivl < 3 ? 1 : ivl < 7 ? 2 : ivl < 21 ? 3 : 4 }

func schedule(_ c: VocabCard, _ grade: Grade, now: Date = Date()) -> VocabCard {
    let ease0 = c.ease ?? 2.5
    let ivl0 = c.ivl ?? LEITNER[max(0, min(4, c.box))]
    let reps0 = c.reps ?? c.box
    var n = c
    var ease = ease0, ivl: Double, reps = reps0 + 1
    switch grade {
    case .again:
        n.ease = max(1.3, ease0 - 0.2); n.ivl = 0; n.reps = 0; n.lapses = (c.lapses ?? 0) + 1; n.box = 0
        n.due = iso.string(from: now.addingTimeInterval(600))
        return n
    case .hard: ease = max(1.3, ease0 - 0.15); ivl = reps0 == 0 ? 1 : max(ivl0 + 1, (ivl0 * 1.2).rounded())
    case .good: ivl = reps0 == 0 ? 1 : reps0 == 1 ? 3 : max(ivl0 + 1, (ivl0 * ease0).rounded())
    case .easy: ease = min(3, ease0 + 0.15); ivl = reps0 == 0 ? 3 : max(ivl0 + 2, (max(ivl0, 1) * ease0 * 1.3).rounded())
    }
    n.ease = ease; n.ivl = ivl; n.reps = reps; n.lapses = c.lapses ?? 0; n.box = mastery(ivl)
    n.due = iso.string(from: now.addingTimeInterval(ivl * 86400))
    return n
}

func dueCards(_ vocab: [VocabCard], now: Date = Date()) -> [VocabCard] {
    vocab.filter { (parseISO($0.due) ?? .distantPast) <= now }
        .sorted { (parseISO($0.due) ?? .distantPast, $0.box) < (parseISO($1.due) ?? .distantPast, $1.box) }
}

// MARK: Cours

private let CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"]
func courseLevelFor(_ level: String) -> CourseLevel {
    let lv = max(0, CEFR.firstIndex(of: level) ?? 0)
    return C.course.filter { !$0.units.isEmpty && (CEFR.firstIndex(of: $0.cefr) ?? 0) <= lv }.last ?? C.course[0]
}
typealias DayRef = (level: CourseLevel, unit: Unit, day: Day)
func nextDay(_ progress: [String: DayProgress], _ level: String) -> DayRef {
    let lvl = courseLevelFor(level)
    let list = Content.allDays.filter { $0.level.id == lvl.id }
    return list.first { !(progress[$0.day.id]?.speaking != nil && progress[$0.day.id]?.scenario != nil) } ?? list.last!
}
func dayDone(_ p: [String: DayProgress], _ id: String) -> Bool { p[id]?.speaking != nil && p[id]?.scenario != nil }

// MARK: Comparaison de mots (répétition)

func normWords(_ s: String) -> String {
    s.lowercased().sub(NIKUD, with: "").sub("[^\\p{L}\\p{N}\\s]", with: "").sub("\\s+", with: " ").trimmed
}
/// Part des mots attendus retrouvés dans ce que la reconnaissance a compris.
func wordMatch(_ expected: String, _ heard: String) -> Int {
    let e = normWords(expected).split(separator: " ")
    let h = Set(normWords(heard).split(separator: " "))
    if e.isEmpty { return 0 }
    return Int((Double(e.filter { h.contains($0) }.count) / Double(e.count) * 100).rounded())
}
