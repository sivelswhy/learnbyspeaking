import AVFoundation
import CryptoKit

// Voix de Shuli : Phonikud vocalise le texte, Piper (VITS) le prononce (lib/voice.worker.ts), via onnxruntime en natif.
// Modèles dans ~/Library/Application Support/LearnBySpeaking/models/voice/ (Phonikud : MIT ; voix « shaul » de Phonikud TTS : CC BY-NC (la voix « michael » a été retirée de l'app le 04/11/2026) ; réglages noise 0,3 / noise_w 0,6).
// Pas de voix système en hébreu : les modèles de la voix sont requis (téléchargement au premier lancement).

/// Fichiers de la voix, aux révisions figées du site (lib/voiceFiles.ts).
let VOICE_FILES: [(name: String, url: String, bytes: Int64)] = [
    ("phonikud-1.0.int8.onnx", "https://huggingface.co/Phonikud/phonikud-onnx/resolve/b806189fe1fc0085b1012b7560ffb5e8ecfd72a2/phonikud-1.0.int8.onnx", 307_844_158),
    ("shaul.onnx", "https://huggingface.co/Phonikud/phonikud-tts-checkpoints/resolve/ff64ba389a3833c49a85c58fc51a7060a6984b87/shaul.onnx", 63_516_050),
    ("piper.config.json", "https://huggingface.co/Phonikud/phonikud-tts-checkpoints/resolve/ff64ba389a3833c49a85c58fc51a7060a6984b87/model.config.json", 7_073),
]
let voiceDir = supportDir.appendingPathComponent("models/voice")
var voiceFilesPresent: Bool { VOICE_FILES.allSatisfy { FileManager.default.fileExists(atPath: voiceDir.appendingPathComponent($0.name).path) } }

final class OrtModel {
    private let s: OpaquePointer
    var shimSession: OpaquePointer { s }
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
    /// Réglages de la synthèse VITS (noise_scale, noise_w).
    var noise: Float = 0.3
    var noiseW: Float = 0.6
    /// Fin de phrase : phonèmes ajoutés avant la fin, pour que le dernier « a » ne soit pas avalé.
    var tail = "..."

    init?(model: String = "shaul.onnx") {
        guard voiceFilesPresent,
              let n = OrtModel(voiceDir.appendingPathComponent("phonikud-1.0.int8.onnx").path),
              let p = OrtModel(voiceDir.appendingPathComponent(model).path),
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
    func synthesize(_ phonemes: String, lengthScale: Float, noise: Float? = nil, noiseW: Float? = nil) -> [Float]? {
        var ids: [Int64] = []
        for p in ["^"] + (phonemes + tail).unicodeScalars.map(String.init) {
            guard let v = idMap[p] else { continue }
            ids += v + (idMap["_"] ?? [])
        }
        ids += idMap["$"] ?? []
        guard let o = piper.run(ints: [("input", ids)], length: ("input_lengths", Int64(ids.count)), scales: ("scales", [noise ?? self.noise, lengthScale, noiseW ?? self.noiseW]), outputs: ["output"]) else { return nil }
        return o[0].map { max(-1, min(1, $0 * 2)) }
    }

    /// Phrase par phrase (comme le worker du site).
    func sentences(_ text: String) -> [String] {
        expandNumbers(text).sub("(?<=[.!?])\\s+", with: "\n").components(separatedBy: "\n").map(\.trimmed).filter { !$0.isEmpty }
    }
    func audio(_ sentence: String, lengthScale: Float) -> [Float]? {
        guard let diac = diacritize(sentence) else { return nil }
        let ph = Phonemizer.phonemize(diac)
        if ph.trimmed.isEmpty { return nil }
        // Phrase courte (3 mots ou moins) : débit lent (1,5) et réglages stables, sinon les syllabes sont mâchées (« אני רעב »).
        let short = sentence.split(whereSeparator: { $0.isWhitespace }).filter { $0.unicodeScalars.contains { (0x5D0...0x5EA).contains($0.value) } }.count <= 3
        return short ? synthesize(ph, lengthScale: max(lengthScale, 1.5), noise: 0.1, noiseW: 0.3) : synthesize(ph, lengthScale: lengthScale)
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

    /// Voix disponibles (menu Dev) et leurs réglages de synthèse.
    static let models: [(file: String, label: String)] = [("shaul.onnx", "shaul (par défaut)")]
    static let settings: [String: (noise: Float, noiseW: Float)] = ["shaul.onnx": (0.3, 0.6)]
    // Un ancien choix enregistré (voix retirée) retombe sur la voix par défaut.
    @Published var model: String = { let m = UserDefaults.standard.string(forKey: "voiceModel"); return Voice.models.contains { $0.file == m } ? m! : "shaul.onnx" }()

    /// Change de voix : recharge le modèle choisi (s'il est sur le disque).
    func useModel(_ file: String) {
        guard FileManager.default.fileExists(atPath: voiceDir.appendingPathComponent(file).path) else { return }
        stop()
        UserDefaults.standard.set(file, forKey: "voiceModel")
        model = file
        queue.async { self.piper = nil; DispatchQueue.main.async { self.natural = false; self.loadPiper() } }
    }

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
        let name = model
        queue.async {
            guard self.piper == nil, let p = Piper(model: name) else { return }
            let set = Voice.settings[name] ?? (0.3, 0.6)
            p.noise = set.noise; p.noiseW = set.noiseW
            _ = p.audio("שלום", lengthScale: 1)
            self.piper = p
            DispatchQueue.main.async { self.natural = true }
        }
    }

    /// Dit le texte et rend la main à la fin (ou à l'interruption).
    func say(_ text: String, rate: Double = 0.9) async {
        stop()
        generation += 1
        let gen = generation
        await MainActor.run { speaking = true }
        // Toujours la voix du modèle : si Piper charge encore, on l'attend (jamais la voix du système).
        var waited = 0
        while piper == nil && waited < 600 && gen == generation { try? await Task.sleep(nanoseconds: 100_000_000); waited += 1 }
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
                await play(samples + [Float](repeating: 0, count: Int(piper.sampleRate * 0.1)), rate: piper.sampleRate, gen: gen)
                if gen != generation { break }
            }
        }
        if gen == generation { await MainActor.run { speaking = false } }
    }

    private func play(_ samples: [Float], rate: Double, gen: Int) async {
        guard let fmt = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
              let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(samples.count)) else { return }
        buf.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { buf.floatChannelData![0].update(from: $0.baseAddress!, count: samples.count) }
        engine.disconnectNodeOutput(player)
        engine.connect(player, to: engine.mainMixerNode, format: fmt)
        if !engine.isRunning { try? engine.start() }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            done = c
            player.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in
                // Un rappel tardif d'une phrase interrompue ne doit pas couper la suivante.
                guard let self, self.generation == gen else { return }
                self.finish()
            }
            player.play()
        }
    }

    /// Consigne en français (étapes « intro » de l'entraînement) : voix du système.
    /// Voix française des consignes : fichier pré-généré (Phonon, voix Lucien : scripts/render-french.ts, nommé d'après le SHA-1
    /// du texte) ; la voix du système sert de secours pour un texte sans fichier.
    static func clipKey(_ text: String) -> String {
        Insecure.SHA1.hash(data: Data(text.trimmingCharacters(in: .whitespacesAndNewlines).utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    }
    private func frenchClip(_ text: String) -> (samples: [Float], rate: Double)? {
        guard let url = Bundle.main.url(forResource: Voice.clipKey(text), withExtension: "m4a", subdirectory: "fr"),
              let f = try? AVAudioFile(forReading: url),
              let buf = AVAudioPCMBuffer(pcmFormat: f.processingFormat, frameCapacity: AVAudioFrameCount(f.length)),
              (try? f.read(into: buf)) != nil, let ch = buf.floatChannelData?[0] else { return nil }
        return (Array(UnsafeBufferPointer(start: ch, count: Int(buf.frameLength))), f.processingFormat.sampleRate)
    }

    func sayFrench(_ text: String) async {
        stop()
        generation += 1
        let gen = generation
        await MainActor.run { speaking = true }
        if let clip = frenchClip(text) {
            await play(clip.samples + [Float](repeating: 0, count: Int(clip.rate * 0.15)), rate: clip.rate, gen: gen)
        } else {
            let u = AVSpeechUtterance(string: text)
            u.voice = AVSpeechSynthesisVoice(language: "fr-FR")
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in done = c; synth.speak(u) }
        }
        if gen == generation { await MainActor.run { speaking = false } }
    }

    /// Consigne d'un cours : le français est lu par la voix du système, les mots hébreux par la voix hébraïque.
    func sayIntro(_ parts: [IntroPart]?, fr: String, g: Gender, rate: Double) async {
        guard let parts, parts.contains(where: { $0.he != nil }) else { await sayFrench(fr); return }
        var expected = generation
        for part in parts where !part.t.trimmed.isEmpty {
            if generation != expected { return }   // un arrêt (étape suivante) est passé entre deux morceaux
            if let he = part.he { await say(he(g), rate: rate) } else { await sayFrench(part.t) }
            expected = generation
        }
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
