import AppKit
import CryptoKit
import Network
import WebKit

// LearnBySpeaking : app macOS native (AppKit + WebKit). L'interface web exportée (out/) est servie par un petit serveur
// local sur 127.0.0.1 : une origine « localhost » est un contexte sécurisé (WebGPU, Cache API, micro) et son port
// fixe garde le stockage de l'app (progression, modèles) d'un lancement à l'autre.

let appPort: UInt16 = 47831
let appHost = "127.0.0.1"

/// Whisper large-v3-turbo hébreu d'ivrit-ai (Apache-2.0), quantifié en 8 bits avec whisper-quantize : 874 Mo au lieu de 1,6 Go,
/// même transcription sur nos phrases de test, plus rapide.
let WHISPER_MODEL_NAME = "ggml-ivrit-large-v3-turbo-q8_0.bin"
let WHISPER_REMOTE = "https://huggingface.co/sivelsguy/whisper-large-v3-turbo-ivrit-q8_0-ggml/resolve/main/ggml-ivrit-large-v3-turbo-q8_0.bin"
let WHISPER_SHA256 = "123a936e686b06d45b52dc1790251a1418841352ca94079ae643d57893ffc9a6"

// MARK: - Serveur de fichiers statiques

final class StaticServer {
    let root: URL
    private var listener: NWListener?
    private static let mime: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8", "txt": "text/plain; charset=utf-8",
        "wasm": "application/wasm", "png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml", "ico": "image/x-icon",
        "woff2": "font/woff2", "woff": "font/woff", "webmanifest": "application/manifest+json", "map": "application/json",
    ]

    init(root: URL) { self.root = root }

    func start(onReady: @escaping () -> Void, onFail: @escaping (String) -> Void) {
        do {
            let params = NWParameters.tcp
            params.requiredInterfaceType = .loopback
            let l = try NWListener(using: params, on: NWEndpoint.Port(rawValue: appPort)!)
            l.stateUpdateHandler = { state in
                switch state {
                case .ready: DispatchQueue.main.async(execute: onReady)
                case .failed(let e): DispatchQueue.main.async { onFail("\(e)") }
                default: break
                }
            }
            l.newConnectionHandler = { [weak self] c in self?.handle(c) }
            l.start(queue: .global(qos: .userInitiated))
            listener = l
        } catch {
            onFail("\(error)")
        }
    }

    private func handle(_ c: NWConnection) {
        c.start(queue: .global(qos: .userInitiated))
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
            guard let self, let data, let req = String(data: data, encoding: .utf8) else { return c.cancel() }
            let first = req.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? ""
            let parts = first.split(separator: " ")
            guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else {
                return self.send(c, status: "405 Method Not Allowed", type: "text/plain", body: Data(), head: false)
            }
            var (status, url) = ("200 OK", self.resolve(String(parts[1])))
            if url == nil {
                status = "404 Not Found"
                url = self.root.appendingPathComponent("404.html")
            }
            let body = (try? Data(contentsOf: url!)) ?? Data()
            let type = Self.mime[url!.pathExtension.lowercased()] ?? "application/octet-stream"
            self.send(c, status: status, type: type, body: body, head: parts[0] == "HEAD")
        }
    }

    private func resolve(_ raw: String) -> URL? {
        var path = raw.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? "/"
        path = path.removingPercentEncoding ?? path
        if path.contains("..") { return nil }
        var url = root.appendingPathComponent(path)
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
            url = url.appendingPathComponent("index.html")
        }
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private func send(_ c: NWConnection, status: String, type: String, body: Data, head: Bool) {
        let header = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n"
        var out = Data(header.utf8)
        if !head { out.append(body) }
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }
}

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

/// Cerveau : DictaLM 3.0 1.7B en 8 bits (GGUF) sur llama-server. Jeton aléatoire par lancement (--api-key) :
/// seule la page de l'app le connaît, une page web ouverte ailleurs ne peut pas s'en servir.
let llamaSpec = NativeSpec(
    id: "llamacpp", bin: "llama/llama-server", port: 47900,
    modelName: "dictalm-1.7b-instruct-q8_0.gguf",
    remote: "https://huggingface.co/sivelsguy/DictaLM-3.0-1.7B-Instruct-Q8_0-GGUF/resolve/main/dictalm-1.7b-instruct-q8_0.gguf",
    sha256: "871d3ba72c76a5fa25a1915be001d412e817191d6f32f817bf67fb6c7266c8a7",
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

// MARK: - Application

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var server: StaticServer!
    let servers = [ModelServer(llamaSpec), ModelServer(whisperSpec)]
    lazy var downloads = Dictionary(uniqueKeysWithValues: servers.map { ($0.spec.id, ModelDownload($0)) })
    /// SIGTERM (pkill, fermeture de session) : quitter proprement, sinon llama-server resterait orphelin.
    private var sigterm: DispatchSourceSignal?
    var status: NSStatusItem!
    let home = URL(string: "http://\(appHost):\(appPort)/")!

    /// Garde en vie l'app (fenêtre masquée, autre app au premier plan) : sans cela, App Nap peut ralentir les téléchargements.
    private var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ n: Notification) {
        if ProcessInfo.processInfo.environment["LEARNBYSPEAKING_NOACTIVITY"] == nil { activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .idleSystemSleepDisabled], reason: "Téléchargement et exécution des modèles d'IA") }
        // LEARNBYSPEAKING_OUT : sert un autre dossier (test depuis le dépôt) au lieu de celui du paquet.
        let out = ProcessInfo.processInfo.environment["LEARNBYSPEAKING_OUT"].map { URL(fileURLWithPath: $0) }
            ?? Bundle.main.resourceURL!.appendingPathComponent("out")
        server = StaticServer(root: out)

        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.userContentController.add(self, name: "lbsSave") // export de sauvegarde : panneau « Enregistrer »
        signal(SIGTERM, SIG_IGN)
        sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        sigterm?.setEventHandler { NSApp.terminate(nil) }
        sigterm?.resume()
        // Modèles natifs : la page passe sur llama.cpp et whisper.cpp (lib/native.ts) au lieu des modèles WebGPU.
        // Modèle absent : ready=false, la page le fait télécharger (message « lbsBrain ») au premier lancement.
        let entries = servers.filter { $0.binary != nil }.map { srv in
            "\(srv.spec.id):{url:'http://\(appHost):\(srv.spec.port)',key:'\(srv.key)',ready:\(srv.start())}"
        }
        if !entries.isEmpty {
            let js = "window.__lbsNative={\(entries.joined(separator: ","))};"
            cfg.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            cfg.userContentController.add(self, name: "lbsBrain")
        }
        web = WKWebView(frame: .zero, configuration: cfg)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 780),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "LearnBySpeaking"
        // Barre de titre sans texte ni fond : même crème que l'app (le titre reste pour Mission Control et le menu Fenêtre).
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(srgbRed: 0xf6 / 255, green: 0xf7 / 255, blue: 0xee / 255, alpha: 1)
        window.appearance = NSAppearance(named: .aqua)
        window.contentView = web
        window.minSize = NSSize(width: 360, height: 560)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("LearnBySpeakingMain")
        window.center()

        setupMenus()
        setupStatusItem()

        server.start(onReady: { [self] in
            web.load(URLRequest(url: home))
            show()
        }, onFail: { msg in
            let a = NSAlert()
            a.messageText = "Impossible de démarrer LearnBySpeaking"
            a.informativeText = "Le port \(appPort) est déjà utilisé (LearnBySpeaking est peut-être déjà ouverte).\n\(msg)"
            a.runModal()
            NSApp.terminate(nil)
        })
    }

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    func applicationWillTerminate(_ n: Notification) { servers.forEach { $0.stop() } }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool { show(); return true }

    // MARK: Menus

    @objc func reload() { web.reload() }
    @objc func openApp() { show() }

    func setupMenus() {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem(); item.title = title
            let m = NSMenu(title: title); items.forEach(m.addItem); item.submenu = m; main.addItem(item)
        }
        func mi(_ t: String, _ sel: Selector?, _ key: String = "", target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: sel, keyEquivalent: key); i.target = target; return i
        }
        add("LearnBySpeaking", [mi("À propos de LearnBySpeaking", #selector(NSApplication.orderFrontStandardAboutPanel(_:))), .separator(),
                      mi("Masquer LearnBySpeaking", #selector(NSApplication.hide(_:)), "h"), .separator(),
                      mi("Quitter LearnBySpeaking", #selector(NSApplication.terminate(_:)), "q")])
        add("Édition", [mi("Annuler", Selector(("undo:")), "z"), mi("Rétablir", Selector(("redo:")), "Z"), .separator(),
                        mi("Couper", #selector(NSText.cut(_:)), "x"), mi("Copier", #selector(NSText.copy(_:)), "c"),
                        mi("Coller", #selector(NSText.paste(_:)), "v"), mi("Tout sélectionner", #selector(NSText.selectAll(_:)), "a")])
        add("Affichage", [mi("Recharger", #selector(reload), "r", target: self)])
        add("Fenêtre", [mi("Réduire", #selector(NSWindow.performMiniaturize(_:)), "m"), mi("Fermer", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }

    func setupStatusItem() {
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = NSImage(systemSymbolName: "waveform.circle", accessibilityDescription: "LearnBySpeaking")
        let menu = NSMenu()
        let open = NSMenuItem(title: "Ouvrir LearnBySpeaking", action: #selector(openApp), keyEquivalent: ""); open.target = self
        menu.addItem(open)
        let ctx = DebugContext(
            runJS: { [self] js, reload in
                web.evaluateJavaScript(js) { _, _ in if reload { self.web.reload() } }
            },
            evalString: { [self] js, done in
                web.evaluateJavaScript(js) { r, _ in done(r as? String ?? "") }
            },
            reload: { [self] in web.reload() },
            confirm: { text in
                let a = NSAlert()
                a.messageText = text
                a.addButton(withTitle: "Continuer"); a.addButton(withTitle: "Annuler")
                return a.runModal() == .alertFirstButtonReturn
            },
            show: { [self] in show() })
        let debug = debugMenuItems(ctx)
        if !debug.isEmpty {
            menu.addItem(.separator())
            let sub = NSMenuItem(title: "Debug", action: nil, keyEquivalent: "")
            let m = NSMenu(title: "Debug"); debug.forEach(m.addItem); sub.submenu = m
            menu.addItem(sub)
            if #available(macOS 13.3, *) { web.isInspectable = true }
        }
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quitter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: ""))
        status.menu = menu
    }

    // MARK: WebKit

    /// La page envoie {name, text} : on ouvre le panneau « Enregistrer » et on écrit le fichier.
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "lbsBrain" { return downloadModel((message.body as? [String: Any])?["id"] as? String ?? "llamacpp") }
        guard message.name == "lbsSave", let body = message.body as? [String: Any],
              let name = body["name"] as? String, let text = body["text"] as? String else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.allowedContentTypes = [.json]
        panel.beginSheetModal(for: window) { r in
            if r == .OK, let url = panel.url { try? text.write(to: url, atomically: true, encoding: .utf8) }
        }
    }

    /// Télécharge le modèle si besoin, puis démarre son serveur ; la page suit via window.__lbsBrain({id, phase, done, total, error}).
    func downloadModel(_ id: String) {
        guard let srv = servers.first(where: { $0.spec.id == id }), let dl = downloads[id] else { return }
        func tell(_ fields: String) { web.evaluateJavaScript("window.__lbsBrain&&window.__lbsBrain({id:'\(id)',\(fields)})", completionHandler: nil) }
        func ready() {
            if !srv.running && !srv.start() { return tell("phase:'error',error:'Le moteur de Shuli n\\'a pas démarré.'") }
            tell("phase:'init'")
            srv.waitHealthy { [self] ok in
                if !ok { return tell("phase:'error',error:'Le moteur de Shuli ne répond pas.'") }
                web.evaluateJavaScript("window.__lbsNative.\(id).ready=true", completionHandler: nil)
                tell("phase:'ready'")
            }
        }
        if srv.modelURL != nil { return ready() }
        var last = Date.distantPast
        dl.onProgress = { done, total in
            guard Date().timeIntervalSince(last) > 0.25 else { return }
            last = Date()
            DispatchQueue.main.async { tell("phase:'download',done:\(done),total:\(total)") }
        }
        dl.onDone = { err in
            if let err { return tell("phase:'error',error:\(Self.jsString(err))") }
            ready()
        }
        dl.start()
    }

    static func jsString(_ s: String) -> String {
        (try? String(data: JSONSerialization.data(withJSONObject: [s]), encoding: .utf8)).flatMap { $0 }.map { String($0.dropFirst().dropLast()) } ?? "''"
    }

    /// Sélecteur de fichier des <input type="file"> (import de sauvegarde).
    func webView(_ w: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    // LEARNBYSPEAKING_SELFTEST=<fichier> : après le chargement, écrit l'état de la page (WebGPU, contexte sécurisé…) puis quitte.
    func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) {
        if let path = ProcessInfo.processInfo.environment["LEARNBYSPEAKING_BGTEST"] { runBackgroundTest(w, path); return }
        if let out = ProcessInfo.processInfo.environment["LEARNBYSPEAKING_EVAL"], let js = ProcessInfo.processInfo.environment["LEARNBYSPEAKING_EVAL_JS"] {
            runEval(w, js: js, out: out)
            return
        }
        guard let path = ProcessInfo.processInfo.environment["LEARNBYSPEAKING_SELFTEST"] else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            let js = """
            return (async()=>{const a=navigator.gpu?await navigator.gpu.requestAdapter().catch(e=>String(e)):null;
            return JSON.stringify({secure:isSecureContext,gpu:!!navigator.gpu,adapter:a?(typeof a==='string'?a:'ok'):null,caches:'caches' in self,
            wakeLock:'wakeLock' in navigator,mic:!!navigator.mediaDevices,worker:typeof Worker,speech:'speechSynthesis' in self,
            h1:document.querySelector('h1')?.textContent,title:document.title,w:innerWidth,h:innerHeight})})()
            """
            w.callAsyncJavaScript(js, in: nil, in: .page) { r in
                let out: String
                switch r { case .success(let v): out = "\(v)"; case .failure(let e): out = "ERREUR \(e)" }
                try? out.write(toFile: path, atomically: true, encoding: .utf8)
                NSApp.terminate(nil)
            }
        }
    }

    // LEARNBYSPEAKING_EVAL=<sortie> LEARNBYSPEAKING_EVAL_JS=<script.js> : exécute un script de test dans la page (window.__lbs) et écrit son résultat.
    func runEval(_ w: WKWebView, js path: String, out: String) {
        guard let body = try? String(contentsOfFile: path, encoding: .utf8) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            w.callAsyncJavaScript(body, in: nil, in: .page) { r in
                let text: String
                switch r { case .success(let v): text = "\(v ?? "nil")"; case .failure(let e): text = "ERREUR \(e)" }
                try? text.write(toFile: out, atomically: true, encoding: .utf8)
                NSApp.terminate(nil)
            }
        }
    }

    // LEARNBYSPEAKING_BGTEST=<fichier> : télécharge ~300 Mo en flux, masque l'app 15 s, journalise les octets reçus chaque seconde.
    func runBackgroundTest(_ w: WKWebView, _ path: String) {
        let js = """
        window.__b=0;(async()=>{const r=await fetch('https://speed.cloudflare.com/__down?bytes=300000000',{cache:'no-store'});
        const rd=r.body.getReader();for(;;){const {done,value}=await rd.read();if(done)break;window.__b+=value.length}})().catch(e=>{window.__e=String(e)});
        """
        w.evaluateJavaScript(js, completionHandler: nil)
        var log = "t_s;etat;octets\n"
        let t0 = Date()
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [self] timer in
            let t = Int(Date().timeIntervalSince(t0))
            if t == 8 { NSApp.hide(nil) }
            if t == 23 { show() }
            w.evaluateJavaScript("window.__b+'|'+(window.__e||'')") { v, _ in
                log += "\(t);\(t >= 8 && t < 23 ? "masque" : "visible");\(v ?? "nil")\n"
                if t >= 31 { try? log.write(toFile: path, atomically: true, encoding: .utf8); NSApp.terminate(nil) }
            }
        }
    }

    func webView(_ w: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == appHost ? .grant : .deny)
    }

    func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, let host = url.host, host != appHost, action.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
