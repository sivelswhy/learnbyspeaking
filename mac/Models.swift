import Foundation
import CryptoKit

// Partagé par l'app web (mac/main.swift) et l'app native (mac/native/) : serveurs llama.cpp et whisper.cpp,
// téléchargement des modèles.

let appHost = "127.0.0.1"

/// Whisper large-v3-turbo hébreu d'ivrit-ai (Apache-2.0), quantifié en 8 bits avec whisper-quantize : 874 Mo au lieu de 1,6 Go,
/// même transcription sur nos phrases de test, plus rapide.
let WHISPER_MODEL_NAME = "ggml-ivrit-large-v3-turbo-q8_0.bin"
let WHISPER_REMOTE = "https://huggingface.co/sivelsguy/whisper-large-v3-turbo-ivrit-q8_0-ggml/resolve/main/ggml-ivrit-large-v3-turbo-q8_0.bin"
let WHISPER_SHA256 = "123a936e686b06d45b52dc1790251a1418841352ca94079ae643d57893ffc9a6"

// MARK: - Modèles natifs (llama.cpp, whisper.cpp)

let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("LearnBySpeaking")

/// Un modèle servi par un binaire embarqué (Metal) sur 127.0.0.1, téléchargé au premier lancement.
struct NativeSpec {
    let id: String          // nom vu par la page (window.__lbsNative[id])
    let bin: String         // chemin dans Contents/Resources
    let port: UInt16
    let modelName: String
    let remote: String
    let sha256: String
    let envModel: String    // fichier de modèle imposé (tests)
    let envURL: String      // autre source de téléchargement (tests)
    let args: (_ model: String, _ key: String) -> [String]
    let healthPath: String
}

/// Cerveau : Gemma 4 E2B (Google, 4 bits Q4_K_M d'unsloth) sur llama-server : conversations libres, comme avec un humain
/// (DictaLM 1.7B sortait de son rôle sans répliques écrites d'avance). Jeton aléatoire par lancement (--api-key) :
/// seule la page de l'app le connaît, une page web ouverte ailleurs ne peut pas s'en servir.
let llamaSpec = NativeSpec(
    id: "llamacpp", bin: "llama/llama-server", port: 47900,
    modelName: "gemma-4-E2B-it-Q4_K_M.gguf",
    remote: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
    sha256: "740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8",
    envModel: "LEARNBYSPEAKING_GGUF", envURL: "LEARNBYSPEAKING_GGUF_URL",
    args: { m, k in ["-m", m, "--host", appHost, "--port", "47900", "--jinja", "-ngl", "99", "-c", "8192", "-np", "2", "--no-webui", "--api-key", k] },
    healthPath: "/health")

/// Oreille : Whisper large-v3-turbo d'ivrit-ai (hébreu) sur whisper-server. Pas d'option de jeton : le chemin
/// d'inférence est aléatoire à chaque lancement (même effet). Recherche en faisceau (-bs 5) : en glouton, le serveur
/// écrivait « לימ-אי » pour « לים » ; 0,53 s par phrase.
let whisperSpec = NativeSpec(
    id: "whisper", bin: "whisper/whisper-server", port: 47901,
    modelName: WHISPER_MODEL_NAME,
    remote: WHISPER_REMOTE,
    sha256: WHISPER_SHA256,
    envModel: "LEARNBYSPEAKING_WHISPER", envURL: "LEARNBYSPEAKING_WHISPER_URL",
    args: { m, k in ["-m", m, "--host", appHost, "--port", "47901", "--inference-path", "/\(k)", "-l", "he", "-t", "4", "-bs", "5", "-bo", "5"] },
    healthPath: "/")

final class ModelServer {
    let spec: NativeSpec
    let key = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    private var proc: Process?

    init(_ spec: NativeSpec) { self.spec = spec }

    /// Binaire embarqué dans le paquet (absent, ou LEARNBYSPEAKING_NONATIVE : la page reste sur WebGPU).
    var binary: URL? {
        guard ProcessInfo.processInfo.environment["LEARNBYSPEAKING_NONATIVE"] == nil,
              let bin = Bundle.main.resourceURL?.appendingPathComponent(spec.bin),
              FileManager.default.isExecutableFile(atPath: bin.path) else { return nil }
        return bin
    }

    var modelDest: URL { supportDir.appendingPathComponent("models").appendingPathComponent(spec.modelName) }

    var modelURL: URL? {
        let url = ProcessInfo.processInfo.environment[spec.envModel].map { URL(fileURLWithPath: $0) } ?? modelDest
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    var running: Bool { proc?.isRunning ?? false }

    /// Lance le serveur ; false si le binaire ou le modèle manque.
    func start() -> Bool {
        guard !running, let bin = binary, let model = modelURL else { return false }
        // Serveur resté orphelin après un plantage de l'app : il occuperait le port.
        let kill = Process()
        kill.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        kill.arguments = ["-f", bin.path]
        try? kill.run()
        kill.waitUntilExit()

        try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
        let logURL = supportDir.appendingPathComponent("\(spec.id)-server.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        let log = try? FileHandle(forWritingTo: logURL)

        let p = Process()
        p.executableURL = bin
        p.arguments = spec.args(model.path, key)
        p.standardOutput = log
        p.standardError = log
        do { try p.run() } catch { return false }
        proc = p
        return true
    }

    /// Attend que le modèle soit chargé (réponse 200), 60 s au plus ; rappel sur le fil principal.
    func waitHealthy(_ done: @escaping (Bool) -> Void) {
        let url = URL(string: "http://\(appHost):\(spec.port)\(spec.healthPath)")!
        let until = Date().addingTimeInterval(60)
        func poll() {
            URLSession.shared.dataTask(with: url) { _, r, _ in
                if (r as? HTTPURLResponse)?.statusCode == 200 { return DispatchQueue.main.async { done(true) } }
                if Date() > until || !self.running { return DispatchQueue.main.async { done(false) } }
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.3, execute: poll)
            }.resume()
        }
        poll()
    }

    func stop() {
        guard let p = proc, p.isRunning else { return }
        p.terminate()
        p.waitUntilExit()
    }
}

/// Téléchargement d'un modèle au premier lancement, avec reprise et vérification SHA-256.
/// La page le demande par le message « lbsBrain » ({id}) et suit la progression via window.__lbsBrain.
final class ModelDownload: NSObject, URLSessionDownloadDelegate {
    let server: ModelServer
    var onProgress: (Int64, Int64) -> Void = { _, _ in }
    var onDone: (String?) -> Void = { _ in }
    private var session: URLSession?
    private var resumeData: Data?
    private(set) var active = false

    init(_ server: ModelServer) { self.server = server }

    func start() {
        if active { return }
        active = true
        let s = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        session = s
        let remote = URL(string: ProcessInfo.processInfo.environment[server.spec.envURL] ?? server.spec.remote)!
        let task = resumeData.map { s.downloadTask(withResumeData: $0) } ?? s.downloadTask(with: remote)
        resumeData = nil
        task.resume()
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        onProgress(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // Le fichier temporaire disparaît au retour de cette méthode : on le déplace tout de suite, puis on vérifie.
        let dest = server.modelDest
        let dir = dest.deletingLastPathComponent()
        let part = dir.appendingPathComponent(server.spec.modelName + ".part")
        do {
            if let http = downloadTask.response as? HTTPURLResponse, http.statusCode != 200 { throw NSError(domain: "HTTP \(http.statusCode)", code: http.statusCode) }
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: part)
            try FileManager.default.moveItem(at: location, to: part)
            guard try Self.digest(part) == server.spec.sha256 else {
                try? FileManager.default.removeItem(at: part)
                return finish("Fichier du modèle abîmé, réessaie.")
            }
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: part, to: dest)
            finish(nil)
        } catch {
            finish("\(error.localizedDescription)")
        }
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        resumeData = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data
        finish(error.localizedDescription)
    }

    private func finish(_ err: String?) {
        guard active else { return }
        active = false
        session?.finishTasksAndInvalidate()
        DispatchQueue.main.async { self.onDone(err) }
    }

    static func digest(_ url: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: url)
        defer { try? h.close() }
        var sha = SHA256()
        while let chunk = try h.read(upToCount: 8 << 20), !chunk.isEmpty { sha.update(data: chunk) }
        return sha.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

