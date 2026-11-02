import Foundation

// lib/speechMetrics.ts : pauses, débit, temps de réaction, note de fluidité, sur l'audio 16 kHz déjà enregistré.

struct SpeechMetrics: Hashable {
    var duration: Double, latency: Double, speechTime: Double, span: Double
    var pauses: Int, longPauses: Int, pauseRatio: Double, wpm: Int?
}

/// Segments de parole [début, fin] en secondes (VAD à seuil adaptatif, hystérésis).
func detectSpeech(_ audio: [Float], rate: Double = 16000) -> [(Double, Double)] {
    let frame = Int((rate * 20 / 1000).rounded())
    let n = audio.count / frame
    if n < 5 { return [] }
    var db = [Double](repeating: 0, count: n)
    for i in 0..<n {
        var s: Double = 0
        for j in (i * frame)..<((i + 1) * frame) { s += Double(audio[j] * audio[j]) }
        db[i] = 10 * log10(s / Double(frame) + 1e-10)
    }
    let sorted = db.sorted()
    let pct = { (p: Double) in sorted[min(sorted.count - 1, Int(p * Double(sorted.count)))] }
    let floor = pct(0.1), ceil = pct(0.95)
    if ceil - floor < 8 { return [] }
    let hi = floor + 0.3 * (ceil - floor), lo = floor + 0.18 * (ceil - floor)
    var segs: [(Int, Int)] = []
    var start = -1
    for i in 0..<n {
        if start < 0 && db[i] > hi { start = i }
        else if start >= 0 && db[i] < lo { segs.append((start, i)); start = -1 }
    }
    if start >= 0 { segs.append((start, n)) }
    var merged: [(Int, Int)] = []
    for s in segs {
        if let last = merged.last, Double(s.0 - last.1) < 7.5 { merged[merged.count - 1].1 = s.1 } else { merged.append(s) }
    }
    return merged.filter { $0.1 - $0.0 >= 4 }.map { (Double($0.0 * frame) / rate, Double($0.1 * frame) / rate) }
}

func analyzeSpeech(_ audio: [Float], words: Int?, rate: Double = 16000) -> SpeechMetrics? {
    let segs = detectSpeech(audio, rate: rate)
    guard let first = segs.first?.0, let last = segs.last?.1 else { return nil }
    var speech = 0.0, pauseTime = 0.0, pauses = 0, long = 0
    for (i, s) in segs.enumerated() {
        speech += s.1 - s.0
        if i == 0 { continue }
        let gap = s.0 - segs[i - 1].1
        if gap >= 0.25 { pauses += 1; pauseTime += gap; if gap >= 0.7 { long += 1 } }
    }
    let span = last - first
    let core = max(0.3, speech)
    return SpeechMetrics(duration: Double(audio.count) / rate, latency: first, speechTime: speech, span: span, pauses: pauses, longPauses: long,
                         pauseRatio: span > 0 ? min(1, pauseTime / span) : 0, wpm: words.flatMap { $0 > 0 ? Int((Double($0) / core * 60).rounded()) : nil })
}

struct Fluency { var score: Int; var hint: String? }
private let TARGET_WPM: [String: Double] = ["A1": 55, "A2": 75, "B1": 95, "B2": 115, "C1": 125, "C2": 135]

/// Note de fluidité (0-100) ; nil si trop court pour juger. 30 % pauses · 25 % hésitations · 30 % débit · 15 % réaction.
func fluencyScore(_ m: SpeechMetrics?, words: Int, level: String) -> Fluency? {
    guard let m, words >= 3, m.speechTime >= 1 else { return nil }
    let pause = Double(clamp100(100 * (1 - (m.pauseRatio - 0.08) / 0.42)))
    let steady = Double(clamp100(100 - 18 * Double(m.longPauses) - 6 * Double(max(0, m.pauses - m.longPauses - 2))))
    let rate = m.wpm.map { Double(clamp100(100 * min(1, Double($0) / (TARGET_WPM[level] ?? 90)))) } ?? pause
    let lat = m.latency <= 2 ? 100 : Double(clamp100(100 - (m.latency - 2) * 20))
    let score = clamp100(0.3 * pause + 0.25 * steady + 0.3 * rate + 0.15 * lat)
    let parts: [(Double, String)] = [
        (pause, "Tu fais beaucoup de pauses : prépare ta phrase en tête, puis dis-la d'un seul souffle."),
        (steady, "Tu t'arrêtes longtemps au milieu des phrases : remplace le silence par un petit mot (אממ, אז, כלומר)."),
        (rate, "Ton débit est lent : répète la phrase plusieurs fois à voix haute pour la rendre automatique."),
        (lat, "Tu mets du temps à commencer : lance-toi avec une amorce (אני, אז, בעיקר) même sans phrase prête."),
    ]
    let worst = parts.min { $0.0 < $1.0 }!
    return Fluency(score: score, hint: worst.0 < 70 ? worst.1 : nil)
}

func avgFluency(_ list: [Int?]) -> Int? {
    let v = list.compactMap { $0 }
    return v.isEmpty ? nil : Int((Double(v.reduce(0, +)) / Double(v.count)).rounded())
}

func hebrewWordCount(_ t: String) -> Int { t.split(separator: " ").filter { String($0).test("[\\u05d0-\\u05ea]") }.count }
