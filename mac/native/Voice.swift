import AVFoundation

// Voix de Shuli : Phonikud vocalise le texte, Piper (VITS) le prononce (lib/voice.worker.ts), via onnxruntime en natif.
// Modèles dans ~/Library/Application Support/LearnBySpeaking/models/voice/ (Phonikud : MIT ; voix Piper : CC BY-NC).
// En secours (modèles absents ou erreur) : la voix hébraïque du système.

/// Fichiers de la voix, aux révisions figées du site (lib/voiceFiles.ts).
let VOICE_FILES: [(name: String, url: String, bytes: Int64)] = [
    ("phonikud-1.0.int8.onnx", "https://huggingface.co/Phonikud/phonikud-onnx/resolve/b806189fe1fc0085b1012b7560ffb5e8ecfd72a2/phonikud-1.0.int8.onnx", 307_844_158),
    ("piper.onnx", "https://huggingface.co/Phonikud/phonikud-tts-checkpoints/resolve/ff64ba389a3833c49a85c58fc51a7060a6984b87/model.onnx", 63_511_038),
    ("piper.config.json", "https://huggingface.co/Phonikud/phonikud-tts-checkpoints/resolve/ff64ba389a3833c49a85c58fc51a7060a6984b87/model.config.json", 7_073),
]
let voiceDir = supportDir.appendingPathComponent("models/voice")
var voiceFilesPresent: Bool { VOICE_FILES.allSatisfy { FileManager.default.fileExists(atPath: voiceDir.appendingPathComponent($0.name).path) } }

final class OrtModel {
    private let s: OpaquePointer
    init?(_ path: String) {
        var err = [CChar](repeating: 0, count: 512)
        guard let p = ort_shim_open(path, &err) else { NSLog("ONNX \(path) : \(String(cString: err))"); return nil }
        s = p
    }
    deinit { ort_shim_close(s) }

    /// Entrées int64 [1, n] ; sorties float copiées.
    func run(ints: [(String, [Int64])], length: (String, Int64)? = nil, scales: (String, [Float])? = nil, outputs: [String]) -> [[Float]]? {
        let n = Int64(ints[0].1.count)
        var err = [CChar](repeating: 0, count: 512)
        var outs = [OrtShimOutput](repeating: OrtShimOutput(data: nil, count: 0), count: outputs.count)
        let cNames = ints.map { strdup($0.0)! }, oNames = outputs.map { strdup($0)! }
        let lenName = length.map { strdup($0.0)! }, scaleName = scales.map { strdup($0.0)! }
        defer { (cNames + oNames).forEach { free($0) }; lenName.map { free($0) }; scaleName.map { free($0) } }
        // Copies contiguës des entrées : leur adresse reste valable pendant l'appel.
        let bufs = ints.map { v -> UnsafeMutablePointer<Int64> in
            let p = UnsafeMutablePointer<Int64>.allocate(capacity: v.1.count)
            p.initialize(from: v.1, count: v.1.count)
            return p
        }
        defer { bufs.forEach { $0.deallocate() } }
        var namePtrs: [UnsafePointer<CChar>?] = cNames.map { UnsafePointer($0) }
        var dataPtrs: [UnsafePointer<Int64>?] = bufs.map { UnsafePointer($0) }
        var outPtrs: [UnsafePointer<CChar>?] = oNames.map { UnsafePointer($0) }
        let sc = scales?.1 ?? []
        let rc = sc.withUnsafeBufferPointer { sp in
            ort_shim_run(s, &namePtrs, &dataPtrs, Int32(ints.count), n,
                         lenName.map { UnsafePointer($0) }, length?.1 ?? 0,
                         scaleName.map { UnsafePointer($0) }, sp.baseAddress, Int64(sc.count),
                         &outPtrs, Int32(outputs.count), &outs, &err)
        }
        guard rc >= 0 else { NSLog("ONNX : \(String(cString: err))"); return nil }
        return outs.map { o in defer { ort_shim_free(o.data) }; return Array(UnsafeBufferPointer(start: o.data, count: o.count)) }
    }
}

/// Phonikud + Piper, chargés une fois.
final class Piper {
    let nikud: OrtModel
    let piper: OrtModel
    let idMap: [String: [Int64]]
    let sampleRate: Double

    init?() {
        guard voiceFilesPresent,
              let n = OrtModel(voiceDir.appendingPathComponent("phonikud-1.0.int8.onnx").path),
              let p = OrtModel(voiceDir.appendingPathComponent("piper.onnx").path),
              let d = try? Data(contentsOf: voiceDir.appendingPathComponent("piper.config.json")),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let map = j["phoneme_id_map"] as? [String: [Int]] else { return nil }
        nikud = n; piper = p
        idMap = map.mapValues { $0.map(Int64.init) }
        sampleRate = ((j["audio"] as? [String: Any])?["sample_rate"] as? Double) ?? 22050
    }

    func diacritize(_ text: String) -> String? {
        let e = Diacritizer.encode(text)
        let ones = [Int64](repeating: 1, count: e.ids.count), zeros = [Int64](repeating: 0, count: e.ids.count)
        guard let o = nikud.run(ints: [("input_ids", e.ids), ("attention_mask", ones), ("token_type_ids", zeros)],
                                outputs: ["nikud_logits", "shin_logits", "additional_logits"]) else { return nil }
        return Diacritizer.decode(e, nikud: o[0], shin: o[1], extra: o[2])
    }

    /// Comme piper_onnx : ^ au début, _ après chaque phonème connu, $ à la fin.
    func synthesize(_ phonemes: String, lengthScale: Float) -> [Float]? {
        var ids: [Int64] = []
        for p in ["^"] + phonemes.unicodeScalars.map(String.init) {
            guard let v = idMap[p] else { continue }
            ids += v + (idMap["_"] ?? [])
        }
        ids += idMap["$"] ?? []
        guard let o = piper.run(ints: [("input", ids)], length: ("input_lengths", Int64(ids.count)), scales: ("scales", [0.64, lengthScale, 1.0]), outputs: ["output"]) else { return nil }
        return o[0].map { max(-1, min(1, $0 * 2)) }
    }

    /// Phrase par phrase (comme le worker du site).
    func sentences(_ text: String) -> [String] {
        expandNumbers(text).sub("(?<=[.!?])\\s+", with: "\n").components(separatedBy: "\n").map(\.trimmed).filter { !$0.isEmpty }
    }
    func audio(_ sentence: String, lengthScale: Float) -> [Float]? {
        guard let diac = diacritize(sentence) else { return nil }
        let ph = Phonemizer.phonemize(diac)
        return ph.trimmed.isEmpty ? nil : synthesize(ph, lengthScale: lengthScale)
    }
}

final class Voice: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published var speaking = false
    @Published var natural = false
    private let synth = AVSpeechSynthesizer()
    private var done: CheckedContinuation<Void, Never>?
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var piper: Piper?
    private let queue = DispatchQueue(label: "piper", qos: .userInitiated)
    private var generation = 0

    static func rate(_ level: String) -> Double {
        ["A1": 0.78, "A2": 0.85, "B1": 0.92, "B2": 1.0, "C1": 1.0, "C2": 1.0][level] ?? 0.9
    }

    override init() {
        super.init()
        synth.delegate = self
        engine.attach(player)
        loadPiper()
    }

    /// Charge Phonikud et Piper, puis une phrase à vide pour préparer les modèles.
    func loadPiper() {
        queue.async {
            guard self.piper == nil, let p = Piper() else { return }
            _ = p.audio("שלום", lengthScale: 1)
            self.piper = p
            DispatchQueue.main.async { self.natural = true }
        }
    }

    static var hebrew: AVSpeechSynthesisVoice? {
        AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("he") }.max { $0.quality.rawValue < $1.quality.rawValue }
    }

    /// Dit le texte et rend la main à la fin (ou à l'interruption).
    func say(_ text: String, rate: Double = 0.9) async {
        stop()
        generation += 1
        let gen = generation
        await MainActor.run { speaking = true }
        if let piper {
            let ls = Float(min(1.6, max(0.95, 1.02 / rate)))
            // La phrase suivante se calcule pendant que la précédente est jouée.
            var next: Task<[Float]?, Never>?
            let list = piper.sentences(text)
            func compute(_ s: String) -> Task<[Float]?, Never> {
                Task.detached(priority: .userInitiated) { [queue] in
                    await withCheckedContinuation { c in queue.async { c.resume(returning: piper.audio(s, lengthScale: ls)) } }
                }
            }
            for (k, s) in list.enumerated() {
                let cur = next ?? compute(s)
                next = k + 1 < list.count ? compute(list[k + 1]) : nil
                guard let samples = await cur.value, gen == generation else { continue }
                await play(samples + [Float](repeating: 0, count: Int(piper.sampleRate * 0.1)), rate: piper.sampleRate)
                if gen != generation { break }
            }
        } else {
            let u = AVSpeechUtterance(string: text)
            u.voice = Voice.hebrew
            u.rate = Float(Double(AVSpeechUtteranceDefaultSpeechRate) * rate)
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in done = c; synth.speak(u) }
        }
        if gen == generation { await MainActor.run { speaking = false } }
    }

    private func play(_ samples: [Float], rate: Double) async {
        guard let fmt = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
              let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(samples.count)) else { return }
        buf.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { buf.floatChannelData![0].update(from: $0.baseAddress!, count: samples.count) }
        engine.disconnectNodeOutput(player)
        engine.connect(player, to: engine.mainMixerNode, format: fmt)
        if !engine.isRunning { try? engine.start() }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            done = c
            player.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in self?.finish() }
            player.play()
        }
    }

    /// Consigne en français (étapes « intro » de l'entraînement) : voix du système.
    func sayFrench(_ text: String) async {
        stop()
        generation += 1
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "fr-FR")
        await MainActor.run { speaking = true }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in done = c; synth.speak(u) }
        await MainActor.run { speaking = false }
    }

    func stop() {
        generation += 1
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        if player.isPlaying { player.stop() }
        finish()
        DispatchQueue.main.async { self.speaking = false }
    }

    private func finish() {
        let c = done
        done = nil
        c?.resume()
    }

    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { finish() }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { finish() }
}
