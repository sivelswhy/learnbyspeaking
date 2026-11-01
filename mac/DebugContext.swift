import AppKit

/// Ce que le menu Debug de la barre d'état peut utiliser pour agir sur l'app.
struct DebugContext {
    /// Exécute du JavaScript dans la page, puis recharge la page si demandé.
    let runJS: (String, Bool) -> Void
    /// Exécute du JavaScript qui renvoie une chaîne.
    let evalString: (String, @escaping (String) -> Void) -> Void
    let reload: () -> Void
    let confirm: (String) -> Bool
    let show: () -> Void
}
