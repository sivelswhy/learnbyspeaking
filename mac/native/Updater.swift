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
    enum State: Equatable { case idle, checking, available, downloading, ready, installing, failed(String) }

    @Published var state: State = .idle
    @Published var progress = 0.0
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
    private var zip: URL?
    private var started = false

    private var dir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LearnBySpeaking/update", isDirectory: true)
    }

    var hasUpdate: Bool { [.available, .downloading, .ready, .installing].contains(state) }

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
            sha256 = sha.lowercased()
            state = .available
            announce = true
            await download()
        } catch {
            state = .idle  // pas de réseau : silence, on réessaiera
        }
    }

    /// Téléchargement automatique en arrière-plan, archive vérifiée avant d'être déclarée prête.
    private func download() async {
        guard let assetURL else { return }
        state = .downloading
        progress = 0
        do {
            try? FileManager.default.removeItem(at: dir)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dest = dir.appendingPathComponent(updateAsset)
            let (bytes, resp) = try await URLSession.shared.bytes(from: assetURL)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let total = Double(max(1, resp.expectedContentLength))
            FileManager.default.createFile(atPath: dest.path, contents: nil)
            let h = try FileHandle(forWritingTo: dest)
            var buf = Data(); buf.reserveCapacity(1 << 20)
            var got = 0.0
            var hasher = SHA256()
            for try await b in bytes {
                buf.append(b)
                if buf.count >= 1 << 20 {
                    try h.write(contentsOf: buf); hasher.update(data: buf); got += Double(buf.count); buf.removeAll(keepingCapacity: true)
                    progress = min(1, got / total)
                }
            }
            try h.write(contentsOf: buf); hasher.update(data: buf); try h.close()
            let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
            guard digest == sha256 else { throw NSError(domain: "Updater", code: 1, userInfo: [NSLocalizedDescriptionKey: "archive corrompue (SHA-256 différent)"]) }
            zip = dest
            progress = 1
            state = .ready
            if installWhenReady { install() }
        } catch {
            state = .failed("Téléchargement impossible : \(error.localizedDescription)")
        }
    }

    func retry() { Task { await check() } }

    /// Décompresse, puis un script détaché attend la fermeture de l'app, remplace le paquet et le relance.
    func install() {
        guard state == .ready, let zip else { return }
        state = .installing
        let app = Bundle.main.bundleURL
        let staging = dir.appendingPathComponent("staging", isDirectory: true)
        Task.detached {
            do {
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
                await MainActor.run { NSApp.terminate(nil) }
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
                Text("Téléchargement en cours…").font(.app(13)).foregroundStyle(Palette.warn)
                Button("Installer dès que c'est prêt") { up.installWhenReady = true }
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
    @EnvironmentObject var up: Updater
    let inner: Inner

    var body: some View {
        inner.alert("Mise à jour disponible", isPresented: Binding(get: { up.announce }, set: { up.announce = $0 })) {
            Button("Installer") { if up.state == .ready { up.install() } else { up.installWhenReady = true } }
            Button("Plus tard", role: .cancel) {}
        } message: {
            Text("La version \(up.version) est disponible (tu as la \(up.current)). Elle se télécharge toute seule ; ton profil et tes séances sont gardés. Touche l'icône orange en bas à gauche de l'app pour l'installer quand tu veux.")
        }
    }
}

extension View {
    func updateAnnouncer() -> some View { UpdateAnnouncer(inner: self) }
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
        case .available: return "Version \(up.version) disponible."
        case .downloading: return "Version \(up.version) : téléchargement \(Int(up.progress * 100)) %."
        case .ready: return "Version \(up.version) prête à installer."
        case .installing: return "Installation…"
        case .failed(let m): return m
        case .idle: return up.lastChecked == nil ? "Pas encore vérifié." : "Tu as la dernière version."
        }
    }
}
