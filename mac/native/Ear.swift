import AVFoundation
import Foundation

// Oreille de Shuli : micro natif (AVAudioEngine, 16 kHz mono) et transcription par whisper-server.
// Mêmes règles que lib/whisper.ts : fin de phrase après 2,4 s de silence, abandon après 8 s sans rien, 30 s au plus ;
// amorce « ? » pour garder les points d'interrogation ; virgule ou tiret parasite retiré en tête.

final class Ear: ObservableObject {
    @Published var level: Double = 0
    @Published var listening = false
    @Published var transcribing = false

    private let engine = AVAudioEngine()
    private var samples: [Float] = []
    private var converter: AVAudioConverter?
    private let out = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
    private var spoke = false
    private var noise: Float = 0.004   // bruit ambiant estimé
    private var frames = 0
    /// Silence qui termine la réponse : assez long pour laisser réfléchir ou chercher un mot.
    var silenceStop: TimeInterval = 2.4
    private var t0 = Date()
    private var lastVoice = Date()
    private var cont: CheckedContinuation<[Float]?, Never>?
    private let lock = NSLock()

    let whisperPort: UInt16
    let whisperPath: String
    init(port: UInt16, path: String) { whisperPort = port; whisperPath = path }

    static func askPermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
        default: return false
        }
    }

    /// Enregistre jusqu'au silence (ou stop()) ; nil si rien n'a été dit.
    func record() async -> [Float]? {
        guard await Ear.askPermission() else { return nil }
        return await withCheckedContinuation { (c: CheckedContinuation<[Float]?, Never>) in
            lock.lock()
            cont = c
            samples = []
            spoke = false; noise = 0.004; frames = 0
            t0 = Date(); lastVoice = t0
            lock.unlock()
            let input = engine.inputNode
            let fmt = input.outputFormat(forBus: 0)
            converter = AVAudioConverter(from: fmt, to: out)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buf, _ in self?.feed(buf) }
            do {
                try engine.start()
                DispatchQueue.main.async { self.listening = true }
            } catch {
                finish(nil)
            }
        }
    }

    func stop() { finish(spoke ? samples : nil) }

    private func feed(_ buf: AVAudioPCMBuffer) {
        guard let converter, let ch = buf.floatChannelData?[0] else { return }
        var sum: Float = 0
        for i in 0..<Int(buf.frameLength) { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(max(1, buf.frameLength)))
        let cap = AVAudioFrameCount(Double(buf.frameLength) * 16000 / buf.format.sampleRate) + 32
        guard let o = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: cap) else { return }
        var given = false
        converter.convert(to: o, error: nil) { _, status in
            if given { status.pointee = .noDataNow; return nil }
            given = true
            status.pointee = .haveData
            return buf
        }
        let now = Date()
        lock.lock()
        if let d = o.floatChannelData?[0] { samples.append(contentsOf: UnsafeBufferPointer(start: d, count: Int(o.frameLength))) }
        // Seuil adaptatif : la voix doit dépasser nettement le bruit ambiant (appris sur les premiers instants, puis suivi dans les pauses).
        frames += 1
        let thr = spoke ? max(0.005, noise * 2) : max(0.006, noise * 3)   // plus bas une fois lancé : les syllabes faibles ne comptent pas comme silence
        if frames <= 6 { noise = min(0.015, noise * 0.5 + rms * 0.5) }
        else if rms > thr { spoke = true; lastVoice = now }
        else { noise = min(0.05, noise * 0.9 + rms * 0.1) }
        let end = (spoke && now.timeIntervalSince(lastVoice) > silenceStop) || (!spoke && now.timeIntervalSince(t0) > 8) || now.timeIntervalSince(t0) > 30
        let got = spoke ? samples : nil
        lock.unlock()
        DispatchQueue.main.async { self.level = Double(min(1, rms * 8)) }
        if end { finish(got) }
    }

    private func finish(_ result: [Float]?) {
        lock.lock()
        let c = cont
        cont = nil
        lock.unlock()
        guard let c else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        DispatchQueue.main.async { self.listening = false; self.level = 0 }
        c.resume(returning: result)
    }

    /// Enregistre puis transcrit ; nil si rien n'a été dit. audio : échantillons gardés pour l'analyse de la voix.
    func listen() async throws -> (text: String, audio: [Float])? {
        guard let audio = await record() else { return nil }
        await MainActor.run { transcribing = true }
        defer { DispatchQueue.main.async { self.transcribing = false } }
        let text = try await transcribe(audio)
        return text.isEmpty ? nil : (text, audio)
    }

    func transcribe(_ audio: [Float]) async throws -> String {
        let boundary = "lbs\(UUID().uuidString)"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\nContent-Type: audio/wav\r\n\r\n".utf8))
        body.append(Ear.wav(audio))
        body.append(Data("\r\n".utf8))
        field("language", "he")
        field("temperature", "0.0")
        field("response_format", "json")
        field("prompt", "מה שלומך? אני בסדר, תודה. איפה אתה גר?")
        body.append(Data("--\(boundary)--\r\n".utf8))
        var req = URLRequest(url: URL(string: "http://\(appHost):\(whisperPort)/\(whisperPath)")!)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        // Juste après l'ouverture de l'app, le serveur charge encore le modèle (≈ 4 s) : on réessaie jusqu'à 20 s.
        let until = Date().addingTimeInterval(20)
        while true {
            if let (data, r) = try? await URLSession.shared.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200 {
                let j = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                return (j?["text"] as? String ?? "").sub("\\s+", with: " ").trimmed.sub("^[,.\\-–—\\s]+", with: "")
            }
            if Date() > until { throw LLMError.unreachable }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
    }

    static func wav(_ a: [Float], rate: UInt32 = 16000) -> Data {
        var d = Data()
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        d.append(Data("RIFF".utf8)); u32(UInt32(36 + a.count * 2)); d.append(Data("WAVEfmt ".utf8))
        u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16)
        d.append(Data("data".utf8)); u32(UInt32(a.count * 2))
        for s in a { u16(UInt16(bitPattern: Int16(max(-1, min(1, s)) * 32767))) }
        return d
    }
}
