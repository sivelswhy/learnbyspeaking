import Foundation

// Cerveau de Shuli : Gemma 4 E2B sur llama-server (lancé par l'app, API compatible OpenAI).
// Mêmes réglages que lib/llm.ts (completeLlamaCpp, llamaCppTopLogprobs).

struct Msg: Codable { let role: String; let content: String }

enum LLMError: LocalizedError {
    case unreachable, status(Int)
    var errorDescription: String? {
        switch self {
        case .unreachable: return "Le moteur local de Shuli ne répond pas. Relance l'app."
        case .status(let s): return "Le moteur local a répondu \(s). Relance l'app."
        }
    }
}

final class LLM {
    let base: URL
    let key: String
    init(port: UInt16, key: String) {
        base = URL(string: "http://\(appHost):\(port)/v1/chat/completions")!
        self.key = key
    }

    /// Requête ; pendant le chargement du modèle (503), on patiente jusqu'à 60 s.
    private func post(_ body: [String: Any]) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        var req = URLRequest(url: base)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 120
        let until = Date().addingTimeInterval(60)
        while true {
            try Task.checkCancellation()
            if let (bytes, r) = try? await URLSession.shared.bytes(for: req), let http = r as? HTTPURLResponse {
                if http.statusCode == 200 { return (bytes, http) }
                if http.statusCode != 503 || Date() > until { throw LLMError.status(http.statusCode) }
            } else if Date() > until { throw LLMError.unreachable }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
    }

    /// Texte généré. onToken : texte partiel au fil de l'eau (flux SSE).
    func complete(_ messages: [Msg], temperature: Double = 0.6, maxTokens: Int = 400, antiRepeat: Bool = false,
                  schema: [String: Any]? = nil, onToken: ((String) -> Void)? = nil) async throws -> String {
        var body: [String: Any] = [
            "messages": messages.map { ["role": $0.role, "content": $0.content] },
            "stream": onToken != nil,
            "temperature": temperature,
            "max_tokens": maxTokens,
            // Gemma 4 : pas de réflexion préalable.
            "chat_template_kwargs": ["enable_thinking": false],
        ]
        // Pas de pénalités de fréquence/présence (llama.cpp les applique au prompt : répliques trop longues) ; DRY à la place.
        if antiRepeat { body["dry_multiplier"] = 0.8; body["top_p"] = 0.9 }
        if let schema { body["response_format"] = ["type": "json_schema", "json_schema": ["schema": schema]] }
        let (bytes, _) = try await post(body)
        var text = ""
        if onToken == nil {
            var data = Data()
            for try await b in bytes { data.append(b) }
            let j = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            text = ((j?["choices"] as? [[String: Any]])?.first?["message"] as? [String: Any])?["content"] as? String ?? ""
        } else {
            for try await line in bytes.lines {
                try Task.checkCancellation()
                guard line.hasPrefix("data:") else { continue }
                let d = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if d == "[DONE]" { break }
                guard let j = try? JSONSerialization.jsonObject(with: Data(d.utf8)) as? [String: Any],
                      let delta = (j["choices"] as? [[String: Any]])?.first?["delta"] as? [String: Any],
                      let piece = delta["content"] as? String else { continue }
                text += piece
                onToken?(text)
            }
        }
        return text.sub("<think>[\\s\\S]*?(</think>|$)", with: "").trimmed
    }

    /// Probabilité que la réponse commence par « oui » (premier jeton, logprobs), entre 0 et 1.
    func yesProbability(_ messages: [Msg], yes: String = "כן", no: String = "לא") async throws -> Double {
        let body: [String: Any] = [
            "messages": messages.map { ["role": $0.role, "content": $0.content] },
            "temperature": 0, "max_tokens": 1, "logprobs": true, "top_logprobs": 5,
            "chat_template_kwargs": ["enable_thinking": false],
        ]
        let (bytes, _) = try await post(body)
        var data = Data()
        for try await b in bytes { data.append(b) }
        let j = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let choice = (j?["choices"] as? [[String: Any]])?.first
        let content = ((choice?["logprobs"] as? [String: Any])?["content"] as? [[String: Any]])?.first
        let top = content?["top_logprobs"] as? [[String: Any]] ?? []
        var py = 0.0, pn = 0.0
        for t in top {
            guard let tok = (t["token"] as? String)?.trimmed, !tok.isEmpty, let lp = t["logprob"] as? Double else { continue }
            if yes.hasPrefix(tok) { py += exp(lp) } else if no.hasPrefix(tok) { pn += exp(lp) }
        }
        return py + pn > 0 ? py / (py + pn) : 0.5
    }
}
