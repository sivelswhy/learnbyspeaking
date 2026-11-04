import Foundation

// lib/plan.ts : plan de cours sur mesure. Même algorithme que le site.
//  1. Chemin de base : jours du niveau de l'apprenant jusqu'au niveau visé (pathFor).
//  2. Maîtrise de chaque unité : compétence `theta` du test de niveau (réponses notées par l'IA), difficulté de l'unité = celle de son
//     niveau décalée selon sa place dans le niveau ; probabilité = sigmoïde(1,6 × (theta − b)).
//  3. ≥ 0,90 : unité acquise (sautée) ; ≥ 0,65 : accélérée (révision + 40 % des jours les plus productifs) ; sinon complète.
//  4. Durée : 0,8 min par étape ; séances = minutes / objectif quotidien.
//  5. Mise à jour : les jours faits sortent du reste à faire, la fluidité des cinq derniers jours corrige theta de ± 0,4.

enum UnitStatus: String { case acquis, accelere, complet }
struct UnitPlan { let unit: Unit; let level: CourseLevel; let mastery: Double; let status: UnitStatus; let days: [Day] }
struct CoursePlan {
    let units: [UnitPlan]
    let days: [DayRef]
    let minutes: Int
    let sessions: Int
    let skipped: Int
    let remaining: [DayRef]
    let remainingMinutes: Int
    let remainingSessions: Int
    let doneCount: Int
}

private let ACQUIS = 0.9, ACCELERE = 0.65, SLOPE = 1.6, KEEP = 0.4, MIN_PER_STEP = 0.8

func unitMastery(theta: Double, cefr: String, pos: Double) -> Double {
    let b = (LEVEL_B[cefr] ?? 0) + (pos - 0.5) * 1.0
    return 1 / (1 + exp(-SLOPE * (theta - b)))
}

private func production(_ d: Day) -> Int {
    d.steps.filter { switch $0 { case .free, .answer, .fill, .swap: return true; default: return false } }.count
}

func acceleratedDays(_ unit: Unit) -> [Day] {
    let want = max(2, Int((Double(unit.days.count) * KEEP).rounded(.up)))
    var keep = Set(unit.days.filter { $0.id.hasSuffix("r") }.map(\.id))
    for d in unit.days.filter({ !keep.contains($0.id) }).sorted(by: { production($0) > production($1) }) where keep.count < want { keep.insert(d.id) }
    return unit.days.filter { keep.contains($0.id) }
}

func performanceShift(_ progress: [String: DayProgress]) -> Double {
    let f = progress.values.filter { $0.speaking != nil && $0.scenario != nil }.compactMap(\.fluency).suffix(5)
    if f.count < 3 { return 0 }
    let avg = f.reduce(0, +) / Double(f.count)
    return max(-0.4, min(0.4, (avg - 60) / 100))
}

func planCourse(_ profile: Profile, placement: PlacementResult?, progress: [String: DayProgress]) -> CoursePlan {
    let path = pathFor(profile.level, profile.target_)
    let levelIds = Set(path.map { $0.level.id })
    var theta: Double?
    if let t = placement?.theta {
        let conf = Double(max(0, min(100, placement?.confidence ?? 60))) / 100
        let prior = LEVEL_B[courseLevelFor(profile.level).cefr] ?? 0
        theta = conf * t + (1 - conf) * prior + performanceShift(progress)
    }
    var units: [UnitPlan] = []
    for level in C.course where levelIds.contains(level.id) {
        for (k, unit) in level.units.enumerated() {
            let mastery = theta.map { unitMastery(theta: $0, cefr: level.cefr, pos: (Double(k) + 0.5) / Double(level.units.count)) } ?? 0
            let status: UnitStatus = mastery >= ACQUIS ? .acquis : mastery >= ACCELERE ? .accelere : .complet
            let base: [Day] = status == .acquis ? [] : status == .accelere ? acceleratedDays(unit) : unit.days
            let baseIds = Set(base.map(\.id))
            // Un jour déjà fait reste dans le plan, même si l'unité devient acquise ou accélérée entre-temps.
            let kept = unit.days.filter { baseIds.contains($0.id) || dayDone(progress, $0.id) }
            units.append(UnitPlan(unit: unit, level: level, mastery: mastery, status: status, days: kept))
        }
    }
    let days: [DayRef] = units.flatMap { u in u.days.map { (level: u.level, unit: u.unit, day: $0) } }
    func minutes(_ l: [DayRef]) -> Int { Int((Double(l.reduce(0) { $0 + $1.day.steps.count }) * MIN_PER_STEP).rounded()) }
    let remaining = days.filter { !dayDone(progress, $0.day.id) }
    let per = max(5, profile.dailyMinutes)
    return CoursePlan(units: units, days: days, minutes: minutes(days), sessions: max(1, Int((Double(minutes(days)) / Double(per)).rounded(.up))),
                      skipped: path.count - days.count, remaining: remaining, remainingMinutes: minutes(remaining),
                      remainingSessions: remaining.isEmpty ? 0 : max(1, Int((Double(minutes(remaining)) / Double(per)).rounded(.up))), doneCount: days.count - remaining.count)
}

/// Prochain jour du plan non terminé (le dernier si tout est fait).
func nextDay(_ progress: [String: DayProgress], _ profile: Profile, placement: PlacementResult?) -> DayRef {
    let plan = planCourse(profile, placement: placement, progress: progress)
    return plan.remaining.first ?? plan.days.last ?? Content.allDays[0]
}
