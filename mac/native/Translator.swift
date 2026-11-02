import Foundation

// Traducteurs opus-mt (Helsinki-NLP, convertis en ONNX 8 bits) : mêmes modèles que le site (lib/mt.worker.ts), via onnxruntime.
// Hébreu → langue maternelle : pivot par l'anglais. Langue maternelle → hébreu : un modèle direct.
// Décodeur sans cache KV (le fichier fusionné accepte des « past » vides) : phrases courtes, donc rapide, et bien plus simple.

struct MTSpec {
    let id: String
    let repo: String
    /// Fichiers : (nom local, chemin dans le dépôt, taille).
    var files: [(local: String, remote: String, bytes: Int64)]
    var dir: URL { supportDir.appendingPathComponent("models/mt/\(id)") }
    var present: Bool { files.allSatisfy { FileManager.default.fileExists(atPath: dir.appendingPathComponent($0.local).path) } }
    var bytes: Int64 { files.reduce(0) { $0 + $1.bytes } }
}

private func spec(_ id: String, _ repo: String, enc: Int64, dec: Int64, tok: Int64, vocab: Int64, cfg: Int64) -> MTSpec {
    MTSpec(id: id, repo: repo, files: [
        ("encoder.onnx", "onnx/encoder_model_quantized.onnx", enc),
        ("decoder.onnx", "onnx/decoder_model_merged_quantized.onnx", dec),
        ("tokenizer.json", "tokenizer.json", tok),
        ("vocab.json", "vocab.json", vocab),
        ("config.json", "config.json", cfg),
    ])
}

let MT_SPECS: [String: MTSpec] = [
    "he-en": spec("he-en", "sivelsguy/opus-mt-tc-big-he-en-onnx", enc: 138_724_310, dec: 226_519_278, tok: 2_180_219, vocab: 2_072_892, cfg: 1_076),
    "en-fr": spec("en-fr", "Xenova/opus-mt-en-fr", enc: 50_090_398, dec: 57_381_512, tok: 5_637_839, vocab: 1_458_196, cfg: 1_411),
    "en-es": spec("en-es", "Xenova/opus-mt-en-es", enc: 52_899_742, dec: 60_212_804, tok: 6_262_682, vocab: 1_720_044, cfg: 1_468),
    "fr-he": spec("fr-he", "sivelsguy/opus-mt-fr-he-onnx", enc: 51_768_568, dec: 91_241_350, tok: 2_269_327, vocab: 2_242_338, cfg: 1_447),
    "en-he": spec("en-he", "sivelsguy/opus-mt-en-he-onnx", enc: 53_150_455, dec: 94_015_921, tok: 2_310_095, vocab: 2_153_795, cfg: 1_381),
    "es-he": spec("es-he", "sivelsguy/opus-mt-es-he-onnx", enc: 51_750_648, dec: 91_205_370, tok: 2_271_407, vocab: 2_235_914, cfg: 1_447),
]
/// Chaînes de modèles par langue maternelle.
let MT_FROM_HE: [String: [String]] = ["en": ["he-en"], "fr": ["he-en", "en-fr"], "es": ["he-en", "en-es"]]
let MT_TO_HE: [String: [String]] = ["fr": ["fr-he"], "en": ["en-he"], "es": ["es-he"]]

/// Modèles à avoir sur le disque pour une langue maternelle.
func mtNeeded(_ native: String) -> [MTSpec] {
    var ids = (MT_FROM_HE[native] ?? []) + (MT_TO_HE[native] ?? [])
    ids = ids.reduce(into: []) { if !$0.contains($1) { $0.append($1) } }
    return ids.compactMap { MT_SPECS[$0] }
}
func mtPresent(_ native: String) -> Bool { mtNeeded(native).allSatisfy(\.present) }

// MARK: Tokenizer SentencePiece (Unigram)

final class UnigramTokenizer {
    private var pieces: [String: (id: Int, score: Double)] = [:]
    private var maxLen = 1
    private var unkScore = -20.0
    private var inv: [Int: String] = [:]
    private(set) var unk = 1, eos = 0

    init?(dir: URL) {
        guard let d = try? Data(contentsOf: dir.appendingPathComponent("tokenizer.json")),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let m = j["model"] as? [String: Any], let vocab = m["vocab"] as? [[Any]],
              let vd = try? Data(contentsOf: dir.appendingPathComponent("vocab.json")),
              let v = try? JSONSerialization.jsonObject(with: vd) as? [String: Int] else { return nil }
        var special = Set<Int>()
        for a in (j["added_tokens"] as? [[String: Any]]) ?? [] {
            guard let id = a["id"] as? Int, let c = a["content"] as? String else { continue }
            if c == "</s>" { eos = id } else if c == "<unk>" { unk = id }
            special.insert(id)
        }
        var minScore = 0.0
        for (id, e) in vocab.enumerated() where !special.contains(id) {
            guard let p = e[0] as? String, let s = (e[1] as? NSNumber)?.doubleValue else { continue }
            pieces[p] = (id, s); minScore = min(minScore, s); maxLen = max(maxLen, p.unicodeScalars.count)
        }
        unkScore = minScore - 10
        for (p, id) in v { inv[id] = p }
    }

    /// NFKC (approche la table de normalisation de SentencePiece), espaces fusionnés, mots précédés de ▁.
    func encode(_ text: String) -> [Int] {
        let norm = text.precomposedStringWithCompatibilityMapping
        let words = norm.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        var out: [Int] = []
        for w in words { out += segment(Array(("▁" + w).unicodeScalars)) }
        out.append(eos)
        return out
    }

    /// Viterbi sur un mot : la découpe qui maximise la somme des scores.
    private func segment(_ s: [Unicode.Scalar]) -> [Int] {
        let n = s.count
        var best = [Double](repeating: -.infinity, count: n + 1), back = [Int](repeating: 0, count: n + 1), id = [Int](repeating: unk, count: n + 1)
        best[0] = 0
        for i in 0..<n where best[i] > -.infinity {
            var str = ""
            for j in i..<min(n, i + maxLen) {
                str.unicodeScalars.append(s[j])
                if let p = pieces[str], best[i] + p.score > best[j + 1] { best[j + 1] = best[i] + p.score; back[j + 1] = i; id[j + 1] = p.id }
            }
            // Caractère inconnu : un seul pas, très pénalisé.
            if best[i] + unkScore > best[i + 1] { best[i + 1] = best[i] + unkScore; back[i + 1] = i; id[i + 1] = unk }
        }
        var out: [Int] = [], k = n
        while k > 0 { out.append(id[k]); k = back[k] }
        // Inconnus consécutifs fusionnés en un seul.
        var res: [Int] = []
        for t in out.reversed() { if t == unk, res.last == unk { continue }; res.append(t) }
        return res
    }

    func decode(_ ids: [Int]) -> String {
        ids.compactMap { inv[$0] }.joined().replacingOccurrences(of: "▁", with: " ").trimmed
    }
}

// MARK: Modèle Marian (encodeur + décodeur ONNX, recherche en faisceau)

private struct Tensor {
    var name: String; var dtype: Int32; var shape: [Int64]; var raw: Data
    static func ints(_ n: String, _ v: [Int64], _ shape: [Int64]) -> Tensor { Tensor(name: n, dtype: 0, shape: shape, raw: v.withUnsafeBytes { Data($0) }) }
    static func floats(_ n: String, _ v: [Float], _ shape: [Int64]) -> Tensor { Tensor(name: n, dtype: 1, shape: shape, raw: v.withUnsafeBytes { Data($0) }) }
    static func empty(_ n: String, _ shape: [Int64]) -> Tensor { Tensor(name: n, dtype: 1, shape: shape, raw: Data()) }
    static func flag(_ n: String, _ b: Bool) -> Tensor { Tensor(name: n, dtype: 2, shape: [1], raw: Data([b ? 1 : 0])) }
}

extension OrtModel {
    fileprivate func runAny(_ ins: [Tensor], output: String) -> [Float]? {
        var err = [CChar](repeating: 0, count: 512)
        var out = OrtShimOutput(data: nil, count: 0)
        let names = ins.map { strdup($0.name)! }, outName = strdup(output)!
        let shapes = ins.map { t -> UnsafeMutablePointer<Int64> in let p = UnsafeMutablePointer<Int64>.allocate(capacity: max(1, t.shape.count)); p.initialize(from: t.shape, count: t.shape.count); return p }
        let datas = ins.map { t -> UnsafeMutableRawPointer? in
            guard !t.raw.isEmpty else { return nil }
            let p = UnsafeMutableRawPointer.allocate(byteCount: t.raw.count, alignment: 16)
            t.raw.copyBytes(to: p.assumingMemoryBound(to: UInt8.self), count: t.raw.count)
            return p
        }
        defer { names.forEach { free($0) }; free(outName); shapes.forEach { $0.deallocate() }; datas.forEach { $0?.deallocate() } }
        var cins: [OrtShimInput] = []
        for (k, t) in ins.enumerated() { cins.append(OrtShimInput(name: UnsafePointer(names[k]), dtype: t.dtype, shape: UnsafePointer(shapes[k]), ndim: Int32(t.shape.count), data: UnsafeRawPointer(datas[k]))) }
        var outNames: [UnsafePointer<CChar>?] = [UnsafePointer(outName)]
        let rc = ort_shim_run_generic(shimSession, cins, Int32(cins.count), &outNames, 1, &out, &err)
        guard rc >= 0 else { NSLog("ONNX : \(String(cString: err))"); return nil }
        defer { ort_shim_free(out.data) }
        return Array(UnsafeBufferPointer(start: out.data, count: out.count))
    }
}

final class Marian {
    let enc: OrtModel, dec: OrtModel, tok: UnigramTokenizer
    let layers: Int, heads: Int, headDim: Int, dModel: Int, vocab: Int
    let start: Int64, eos: Int, pad: Int

    init?(_ spec: MTSpec) {
        let d = spec.dir
        guard let cd = try? Data(contentsOf: d.appendingPathComponent("config.json")),
              let c = try? JSONSerialization.jsonObject(with: cd) as? [String: Any],
              let tok = UnigramTokenizer(dir: d),
              let enc = OrtModel(d.appendingPathComponent("encoder.onnx").path),
              let dec = OrtModel(d.appendingPathComponent("decoder.onnx").path) else { return nil }
        self.tok = tok; self.enc = enc; self.dec = dec
        layers = (c["decoder_layers"] as? Int) ?? 6
        heads = (c["decoder_attention_heads"] as? Int) ?? 8
        dModel = (c["d_model"] as? Int) ?? 512
        headDim = dModel / heads
        pad = (c["pad_token_id"] as? Int) ?? 0
        eos = (c["eos_token_id"] as? Int) ?? 0
        start = Int64((c["decoder_start_token_id"] as? Int) ?? pad)
        vocab = (c["decoder_vocab_size"] as? Int) ?? (c["vocab_size"] as? Int) ?? 0
    }

    /// Une phrase ; recherche en faisceau (2 hypothèses), au plus maxNew mots.
    func translate(_ text: String, beams B: Int = 2, maxNew: Int = 80) -> String? {
        let ids = tok.encode(text).map(Int64.init)
        guard ids.count > 1 else { return "" }
        let n = Int64(ids.count)
        guard let h = enc.runAny([.ints("input_ids", ids, [1, n]), .ints("attention_mask", [Int64](repeating: 1, count: ids.count), [1, n])], output: "last_hidden_state") else { return nil }
        let hidden = (0..<B).flatMap { _ in h }
        let mask = [Int64](repeating: 1, count: ids.count * B)
        var seqs: [[Int]] = Array(repeating: [Int(start)], count: B)
        var scores = [Double](repeating: -1e9, count: B); scores[0] = 0
        var done: [(Double, [Int])] = []
        for _ in 0..<maxNew {
            let L = seqs[0].count
            var ins: [Tensor] = [
                .ints("encoder_attention_mask", mask, [Int64(B), n]),
                .ints("input_ids", seqs.flatMap { $0.map(Int64.init) }, [Int64(B), Int64(L)]),
                .floats("encoder_hidden_states", hidden, [Int64(B), n, Int64(dModel)]),
            ]
            for l in 0..<layers {
                for part in ["decoder.key", "decoder.value", "encoder.key", "encoder.value"] {
                    ins.append(.empty("past_key_values.\(l).\(part)", [Int64(B), Int64(heads), 0, Int64(headDim)]))
                }
            }
            ins.append(.flag("use_cache_branch", false))
            guard let lg = dec.runAny(ins, output: "logits") else { return nil }
            let V = lg.count / (B * L)
            var cand: [(Double, Int, Int)] = []   // (score, faisceau, mot)
            for b in 0..<B where scores[b] > -1e8 {
                let off = (b * L + L - 1) * V
                var mx = -Float.infinity
                for v in 0..<V where v != pad { mx = max(mx, lg[off + v]) }
                var sum = 0.0
                for v in 0..<V where v != pad { sum += exp(Double(lg[off + v] - mx)) }
                let lse = Double(mx) + log(sum)
                // Les meilleurs mots de ce faisceau suffisent (2B).
                var top: [(Float, Int)] = []
                for v in 0..<V where v != pad {
                    let x = lg[off + v]
                    if top.count < 2 * B || x > top[top.count - 1].0 {
                        top.append((x, v)); top.sort { $0.0 > $1.0 }
                        if top.count > 2 * B { top.removeLast() }
                    }
                }
                for (x, v) in top { cand.append((scores[b] + Double(x) - lse, b, v)) }
            }
            cand.sort { $0.0 > $1.0 }
            var next: [[Int]] = [], ns: [Double] = []
            for (s, b, v) in cand {
                if v == eos { done.append((s / Double(seqs[b].count), Array(seqs[b].dropFirst()))) }
                else { next.append(seqs[b] + [v]); ns.append(s) }
                if next.count == B { break }
            }
            if next.isEmpty { break }
            while next.count < B { next.append(next[0]); ns.append(-1e9) }
            seqs = next; scores = ns
            if done.count >= B, let bd = done.map(\.0).max(), bd >= (ns.max() ?? 0) / Double(seqs[0].count) { break }
        }
        let best = done.max { $0.0 < $1.0 }?.1 ?? Array(seqs[0].dropFirst())
        return tok.decode(best)
    }
}

// MARK: Service

/// Garde en mémoire le temps de s'en servir (≈ 600 Mo pour une chaîne complète), comme le site.
final class Translator {
    static let shared = Translator()
    private let queue = DispatchQueue(label: "mt", qos: .userInitiated)
    private var loaded: [String: Marian] = [:]
    private var unload: DispatchWorkItem?

    private func model(_ id: String) -> Marian? {
        if let m = loaded[id] { return m }
        guard let s = MT_SPECS[id], s.present, let m = Marian(s) else { return nil }
        loaded[id] = m
        return m
    }

    private func run(_ chain: [String], _ text: String) -> String? {
        unload?.cancel()
        defer {
            let w = DispatchWorkItem { [weak self] in self?.loaded.removeAll() }
            unload = w
            queue.asyncAfter(deadline: .now() + 45, execute: w)
        }
        // Phrase par phrase : traduites en lot, les phrases courtes finissent mal.
        var cur = text.sub("(?<=[.!?])\\s+", with: "\n").components(separatedBy: "\n").map(\.trimmed).filter { !$0.isEmpty }
        for id in chain {
            guard let m = model(id) else { return nil }
            var next: [String] = []
            for s in cur {
                guard var t = m.translate(s) else { return nil }
                t = t.sub("([.?!])[.?!]+$", with: "$1").trimmed
                let quotes = t.unicodeScalars.filter { $0 == "\"" || $0 == "״" }.count
                if quotes == 1 { t = t.sub("^[\"״]|[\"״]$", with: "").trimmed }
                next.append(t)
            }
            cur = next
        }
        return cur.joined(separator: " ")
    }

    func available(_ native: String, toHebrew: Bool) -> Bool {
        guard let chain = (toHebrew ? MT_TO_HE : MT_FROM_HE)[native] else { return false }
        return chain.allSatisfy { MT_SPECS[$0]?.present == true }
    }

    func translate(_ text: String, native: String, toHebrew: Bool) async -> String? {
        guard let chain = (toHebrew ? MT_TO_HE : MT_FROM_HE)[native] else { return nil }
        return await withCheckedContinuation { c in queue.async { c.resume(returning: self.run(chain, text)) } }
    }
}
