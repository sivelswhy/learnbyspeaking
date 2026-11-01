import AppKit
import Network
import WebKit

// LearnBySpeaking : app macOS native (AppKit + WebKit). L'interface web exportée (out/) est servie par un petit serveur
// local sur 127.0.0.1 : une origine « localhost » est un contexte sécurisé (WebGPU, Cache API, micro) et son port
// fixe garde le stockage de l'app (progression, modèles) d'un lancement à l'autre.

let appPort: UInt16 = 47831
let appHost = "127.0.0.1"

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

// MARK: - Application

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: StaticServer!
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

    // LEARNBYSPEAKING_SELFTEST=<fichier> : après le chargement, écrit l'état de la page (WebGPU, contexte sécurisé…) puis quitte.
    func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) {
        if let path = ProcessInfo.processInfo.environment["LEARNBYSPEAKING_BGTEST"] { runBackgroundTest(w, path); return }
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
