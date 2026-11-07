import AppKit
import CryptoKit
import SwiftUI

// Mise à jour automatique : lit la dernière release GitHub (publiée par .github/workflows/mac-release.yml),
// télécharge l'archive toute seule, vérifie son SHA-256, puis remplace l'app et la relance.
// La sauvegarde (profil, séances, modèles) vit dans ~/Library/Application Support/LearnBySpeaking : jamais touchée.

let updateRepo = "sivelswhy/learnbyspeaking"
let updateAsset = "LearnBySpeaking-mac.zip"

/// Compare deux versions « 0.1.12 » composante par composante.
func versionIsNewer(_ a: String, than b: String) -> Bool {
    let x = a.split(separator: ".").map { Int($0) ?? 0 }, y = b.split(separator: ".").map { Int($0) ?? 0 }
    for i in 0..<max(x.count, y.count) {
        let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0
        if p != q { return p > q }
    }
    return false
}

@MainActor
final class Updater: ObservableObject {
    enum State: Equatable { case idle, checking, available, downloading, paused(String), ready, installing, failed(String) }

    @Published var state: State = .idle
    @Published var progress = 0.0
    /// Secondes restantes estimées du téléchargement (nil tant qu'on ne peut pas estimer).
    @Published var remaining: Double?
    /// Message pendant les nouveaux essais automatiques.
    @Published var retryNote = ""
    @Published var version = ""
    @Published var notes = ""
    /// Dernière release publiée, même si on l'a déjà (pour lire ses notes dans les réglages).
    @Published var latestVersion = ""
    @Published var latestNotes = ""
    @Published var lastChecked: Date?
    /// Passe à vrai quand un message doit s'afficher à l'ouverture de l'app.
    @Published var announce = false
    /// Vrai si l'utilisateur a demandé l'installation avant la fin du téléchargement.
    var installWhenReady = false

    let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    private var assetURL: URL?
    private var sha256 = ""
    private var assetSize: Int64 = 0
    private var zip: URL?
    private var started = false
    static let declinedKey = "updateDeclinedVersion"
    private var downloadTask: Task<Void, Never>?
    /// Appelé juste avant la fermeture pour installer : écrit toute la progression sur le disque.
    var beforeInstall: () -> Void = {}

    private var dir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LearnBySpeaking/update", isDirectory: true)
    }

    var hasUpdate: Bool {
        switch state { case .available, .downloading, .paused, .ready, .installing: return true; default: return false }
    }

    /// Au lancement, puis toutes les 6 heures.
    func startChecking() {
        guard !started else { return }
        started = true
        Task {
            while true {
                await check()
                try? await Task.sleep(nanoseconds: 6 * 3600 * 1_000_000_000)
            }
        }
    }

    func check() async {
        guard state == .idle || { if case .failed = state { return true } else { return false } }() else { return }
        state = .checking
        do {
            var req = URLRequest(url: URL(string: "https://api.github.com/repos/\(updateRepo)/releases/latest")!)
            req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            req.timeoutInterval = 15
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200,
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = json["tag_name"] as? String else { state = .idle; return }
            let v = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
            latestVersion = v
            latestNotes = (json["body"] as? String) ?? ""
            lastChecked = Date()
            guard versionIsNewer(v, than: current) else { state = .idle; return }
            let assets = json["assets"] as? [[String: Any]] ?? []
            func url(_ name: String) -> URL? {
                assets.first { ($0["name"] as? String) == name }.flatMap { $0["browser_download_url"] as? String }.flatMap(URL.init)
            }
            guard let zipURL = url(updateAsset), let shaURL = url(updateAsset + ".sha256"),
                  let shaText = try? String(contentsOf: shaURL, encoding: .utf8),
                  let sha = shaText.split(whereSeparator: \.isWhitespace).first, sha.count == 64 else { state = .idle; return }
            version = v
            notes = (json["body"] as? String) ?? ""
            assetURL = zipURL
            assetSize = (assets.first { ($0["name"] as? String) == updateAsset }?["size"] as? Int64) ?? 0
            sha256 = sha.lowercased()
            state = .available
            // Message d'ouverture une seule fois par version : si l'utilisateur a déjà dit « Plus tard », seule l'icône reste.
            announce = UserDefaults.standard.string(forKey: Updater.declinedKey) != v
            startDownload()
        } catch {
            state = .idle  // pas de réseau : silence, on réessaiera
        }
    }

    /// Téléchargement automatique en arrière-plan, archive vérifiée avant d'être déclarée prête.
    func startDownload() {
        guard downloadTask == nil else { return }
        downloadTask = Task { await download(); downloadTask = nil }
    }

    /// Annule le téléchargement en cours et efface le fichier partiel ; « Télécharger » repart de zéro.
    func cancelDownload() {
        installWhenReady = false
        cancelled = true
        downloadTask?.cancel()
    }
    private var cancelled = false

    private var partURL: URL { dir.appendingPathComponent("\(sha256.prefix(12)).part") }

    /// Délais (secondes) avant chaque nouvel essai automatique ; ensuite : pause, reprise manuelle au même octet.
    private let retryDelays: [Double] = [5, 15, 30, 60]

    /// Téléchargement en arrière-plan, repris là où il en était (en-tête Range) après une coupure.
    private func download() async {
        guard let assetURL else { return }
        cancelled = false
        state = .downloading
        retryNote = ""
        remaining = nil
        let part = partURL
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        // Efface les restes d'une autre version ou d'une installation ratée, garde le fichier partiel de celle-ci.
        for f in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] where f != part {
            try? FileManager.default.removeItem(at: f)
        }
        var failures = 0
        while true {
            do {
                try await fetchRemaining(from: assetURL, into: part)
                break
            } catch {
                if cancelled || Task.isCancelled || (error as? URLError)?.code == .cancelled || error is CancellationError {
                    try? FileManager.default.removeItem(at: part)
                    progress = 0; remaining = nil; retryNote = ""
                    state = .available
                    return
                }
                if failures >= retryDelays.count {
                    retryNote = ""; remaining = nil
                    state = .paused("Connexion impossible : \(error.localizedDescription). Le téléchargement est gardé à \(Int(progress * 100)) %.")
                    return
                }
                let wait = retryDelays[failures]
                failures += 1
                remaining = nil
                for left in stride(from: Int(wait), to: 0, by: -1) {
                    retryNote = "Connexion perdue : nouvel essai dans \(left) s (\(failures)/\(retryDelays.count))"
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if cancelled || Task.isCancelled { break }
                }
                retryNote = ""
            }
        }
        // Archive complète : empreinte lue sur le disque.
        do {
            let digest = try Self.sha256Of(part)
            guard digest == sha256 else {
                try? FileManager.default.removeItem(at: part)
                state = .failed("Archive corrompue (SHA-256 différent). Elle a été effacée : réessaie.")
                return
            }
            let dest = dir.appendingPathComponent(updateAsset)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: part, to: dest)
            zip = dest
            progress = 1; remaining = nil
            state = .ready
            if installWhenReady { install() }
        } catch {
            state = .failed("Vérification impossible : \(error.localizedDescription)")
        }
    }

    /// Télécharge ce qui manque (à partir de la taille du fichier partiel).
    private func fetchRemaining(from url: URL, into part: URL) async throws {
        let fm = FileManager.default
        var have: Int64 = (try? fm.attributesOfItem(atPath: part.path)[.size] as? Int64) ?? 0
        if assetSize > 0, have > assetSize { try? fm.removeItem(at: part); have = 0 }
        if assetSize > 0, have == assetSize { progress = 1; return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 30  // silence réseau de 30 s = coupure
        if have > 0 { req.setValue("bytes=\(have)-", forHTTPHeaderField: "Range") }
        let (bytes, resp) = try await URLSession.shared.bytes(for: req)
        guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if http.statusCode == 200 { have = 0 }  // le serveur ignore Range : on repart de zéro
        else if http.statusCode != 206 { throw URLError(.badServerResponse) }
        let total = Double(assetSize > 0 ? assetSize : have + resp.expectedContentLength)
        if have == 0 { fm.createFile(atPath: part.path, contents: nil) }
        let h = try FileHandle(forWritingTo: part)
        defer { try? h.close() }
        try h.seekToEnd()
        var buf = Data(); buf.reserveCapacity(1 << 20)
        var got = Double(have)
        let t0 = Date(), base = got
        var speed = 0.0  // octets/s, moyenne lissée
        var lastT = t0, lastGot = got
        for try await b in bytes {
            buf.append(b)
            if buf.count >= 1 << 18 {
                try h.write(contentsOf: buf); got += Double(buf.count); buf.removeAll(keepingCapacity: true)
                progress = min(1, got / total)
                let now = Date(), dt = now.timeIntervalSince(lastT)
                if dt >= 1 {
                    let inst = (got - lastGot) / dt
                    speed = speed == 0 ? inst : speed * 0.7 + inst * 0.3
                    lastT = now; lastGot = got
                    if speed > 1000, now.timeIntervalSince(t0) > 2 { remaining = max(0, (total - got) / speed) }
                }
            }
        }
        _ = base
        try h.write(contentsOf: buf)
        progress = min(1, (got + Double(buf.count)) / total)
        if assetSize > 0, got + Double(buf.count) < Double(assetSize) { throw URLError(.networkConnectionLost) }
    }

    nonisolated static func sha256Of(_ url: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: url)
        defer { try? h.close() }
        var hasher = SHA256()
        while let chunk = try h.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// « environ 2 min 10 s », « moins d'une minute »…
    var remainingText: String {
        guard let r = remaining else { return "" }
        if r < 60 { return "environ \(max(1, Int(r.rounded()))) s restantes" }
        let m = Int(r) / 60, sec = Int(r) % 60
        return "environ \(m) min \(sec) s restantes"
    }

    /// Annulation depuis la pause (aucune tâche active) : efface le fichier partiel.
    func discardPaused() {
        guard case .paused = state else { return }
        try? FileManager.default.removeItem(at: partURL)
        progress = 0
        state = .available
    }

    func retry() { Task { await check() } }

    /// Décompresse, puis un script détaché attend la fermeture de l'app, remplace le paquet et le relance.
    func install() {
        guard state == .ready, let zip else { return }
        state = .installing
        let app = Bundle.main.bundleURL
        let staging = dir.appendingPathComponent("staging", isDirectory: true)
        let expected = sha256
        Task.detached {
            do {
                // Revérifie l'archive juste avant de l'installer (elle a pu changer sur le disque depuis le téléchargement).
                let digest = try Updater.sha256Of(zip)
                guard digest == expected else {
                    throw NSError(domain: "Updater", code: 1, userInfo: [NSLocalizedDescriptionKey: "archive corrompue (SHA-256 différent)"])
                }
                try? FileManager.default.removeItem(at: staging)
                try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
                let unzip = Process()
                unzip.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
                unzip.arguments = ["-x", "-k", zip.path, staging.path]
                try unzip.run(); unzip.waitUntilExit()
                let new = staging.appendingPathComponent("LearnBySpeaking.app")
                guard unzip.terminationStatus == 0, FileManager.default.fileExists(atPath: new.appendingPathComponent("Contents/MacOS/LearnBySpeaking").path) else {
                    throw NSError(domain: "Updater", code: 2, userInfo: [NSLocalizedDescriptionKey: "archive illisible"])
                }
                guard FileManager.default.isWritableFile(atPath: app.deletingLastPathComponent().path) else {
                    throw NSError(domain: "Updater", code: 3, userInfo: [NSLocalizedDescriptionKey: "dossier de l'app non modifiable (déplace l'app dans Applications)"])
                }
                let script = """
                #!/bin/bash
                PID=\(ProcessInfo.processInfo.processIdentifier)
                APP="\(app.path)"
                NEW="\(new.path)"
                OLD="$APP.old"
                while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done
                rm -rf "$OLD"
                if mv "$APP" "$OLD"; then
                  if mv "$NEW" "$APP"; then
                    xattr -cr "$APP" 2>/dev/null
                    rm -rf "$OLD"
                  else
                    mv "$OLD" "$APP"
                  fi
                fi
                rm -rf "\(staging.path)" "\(zip.path)"
                open "$APP"
                """
                let sh = staging.deletingLastPathComponent().appendingPathComponent("install.sh")
                try script.write(to: sh, atomically: true, encoding: .utf8)
                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/bin/bash")
                p.arguments = [sh.path]
                p.standardOutput = FileHandle.nullDevice
                p.standardError = FileHandle.nullDevice
                p.standardInput = FileHandle.nullDevice
                try p.run()
                await MainActor.run { self.beforeInstall(); NSApp.terminate(nil) }
            } catch {
                await MainActor.run { self.state = .failed("Installation impossible : \(error.localizedDescription)") }
            }
        }
    }
}

// MARK: - Interface

/// Petite icône orange en bas à gauche de la barre latérale : visible seulement quand une mise à jour existe.
struct UpdateBadge: View {
    @EnvironmentObject var up: Updater
    @State private var open = false

    var body: some View {
        if up.hasUpdate || { if case .failed = up.state { return true } else { return false } }() {
            Button { open = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: up.state == .downloading ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                        .font(.system(size: 20)).foregroundStyle(Color.orange)
                    Text(label).font(.app(13, .bold)).foregroundStyle(Palette.ink)
                }
                .padding(.vertical, 6).padding(.horizontal, 4)
            }
            .buttonStyle(.plain)
            .help("Mise à jour de LearnBySpeaking")
            .popover(isPresented: $open, arrowEdge: .trailing) { UpdatePanel().environmentObject(up) }
        }
    }

    private var label: String {
        switch up.state {
        case .downloading: return "Téléchargement \(Int(up.progress * 100)) %"
        case .paused: return "Téléchargement en pause"
        case .failed: return "Mise à jour échouée"
        default: return "Mise à jour \(up.version)"
        }
    }
}

struct UpdatePanel: View {
    @EnvironmentObject var up: Updater

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Version \(up.version) disponible").font(.app(17, .black))
            Text("Tu as la version \(up.current). Tes progrès, tes séances et tes modèles sont gardés.").font(.app(14))
            if !up.notes.isEmpty {
                ScrollView { Text(up.notes).font(.app(13)).frame(maxWidth: .infinity, alignment: .leading) }.frame(maxHeight: 120)
            }
            switch up.state {
            case .downloading:
                ProgressView(value: up.progress).tint(.orange)
                Text(up.retryNote.isEmpty ? "Téléchargement \(Int(up.progress * 100)) %" + (up.remainingText.isEmpty ? "" : " · \(up.remainingText)") : up.retryNote)
                    .font(.app(13)).foregroundStyle(up.retryNote.isEmpty ? Palette.muted : Palette.warn)
                HStack {
                    Button("Installer dès que c'est prêt") { up.installWhenReady = true }
                    Button("Annuler", role: .cancel) { up.cancelDownload() }
                }
            case .paused(let msg):
                ProgressView(value: up.progress).tint(.orange)
                Text(msg).font(.app(13)).foregroundStyle(Palette.warn)
                HStack {
                    Button("Reprendre") { up.startDownload() }.buttonStyle(.borderedProminent).tint(.orange)
                    Button("Annuler", role: .cancel) { up.cancelDownload(); up.discardPaused() }
                }
            case .available:
                Button("Télécharger") { up.startDownload() }.buttonStyle(.borderedProminent).tint(.orange)
            case .ready:
                Button("Redémarrer et installer") { up.install() }.buttonStyle(.borderedProminent).tint(.orange)
            case .installing:
                Text("Installation… l'app va se relancer.").font(.app(13, .semibold))
            case .failed(let msg):
                Text(msg).font(.app(13)).foregroundStyle(.red)
                Button("Réessayer") { up.retry() }
            default:
                EmptyView()
            }
        }
        .padding(16).frame(width: 300)
    }
}

/// Message à l'ouverture de l'app quand une mise à jour est trouvée.
struct UpdateAnnouncer<Inner: View>: View {
    @ObservedObject var up: Updater
    let inner: Inner

    var body: some View {
        inner.alert("Mise à jour disponible", isPresented: Binding(get: { up.announce }, set: { up.announce = $0 })) {
            Button("Installer") { if up.state == .ready { up.install() } else { up.installWhenReady = true } }
            Button("Plus tard", role: .cancel) { UserDefaults.standard.set(up.version, forKey: Updater.declinedKey) }
        } message: {
            Text("La version \(up.version) est disponible (tu as la \(up.current)). Elle se télécharge toute seule ; ton profil et tes séances sont gardés. Touche l'icône orange en bas à gauche de l'app pour l'installer quand tu veux.")
        }
    }
}

extension View {
    func updateAnnouncer(_ up: Updater) -> some View { UpdateAnnouncer(up: up, inner: self) }
}

/// Réglages › Mises à jour : version, vérification à la demande, notes de la dernière version.
struct UpdateCard: View {
    @EnvironmentObject var up: Updater
    @State private var showNotes = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Mises à jour").font(.app(16, .semibold))
            Text("Version installée : \(up.current)").font(.app(14))
            Text(status).font(.app(13)).foregroundStyle(up.hasUpdate ? Color.orange : Palette.muted)
            HStack(spacing: 8) {
                if up.state == .ready { Button("Redémarrer et installer") { up.install() }.buttonStyle(Btn(full: false)) }
                else if up.state == .downloading { Button("Annuler le téléchargement") { up.cancelDownload() }.buttonStyle(ChipStyle(active: false)) }
                else if up.state == .available { Button("Télécharger") { up.startDownload() }.buttonStyle(ChipStyle(active: false)) }
                else if case .paused = up.state { Button("Reprendre le téléchargement") { up.startDownload() }.buttonStyle(ChipStyle(active: false)) }
                else if up.state == .idle { Button("Vérifier maintenant") { Task { await up.check() } }.buttonStyle(ChipStyle(active: false)) }
                if !up.latestNotes.isEmpty {
                    Button(showNotes ? "Masquer les notes" : "Notes de la version \(up.latestVersion)") { showNotes.toggle() }.buttonStyle(ChipStyle(active: showNotes))
                }
            }
            if showNotes {
                Text(up.latestNotes).font(.app(13)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).card()
    }

    private var status: String {
        switch up.state {
        case .checking: return "Vérification…"
        case .available: return "Version \(up.version) disponible (téléchargement annulé ou pas commencé)."
        case .downloading: return "Version \(up.version) : téléchargement \(Int(up.progress * 100)) %" + (up.remainingText.isEmpty ? "." : " · \(up.remainingText).")
        case .paused(let m): return m
        case .ready: return "Version \(up.version) prête à installer."
        case .installing: return "Installation…"
        case .failed(let m): return m
        case .idle: return up.lastChecked == nil ? "Pas encore vérifié." : "Tu as la dernière version."
        }
    }
}
