/**
 * Attend qu'un worker ait installé son écouteur de messages.
 * En production, le code d'un worker arrive en plusieurs morceaux chargés de façon asynchrone :
 * un message envoyé trop tôt est perdu, et le chargement attend alors indéfiniment.
 * Chaque worker envoie { type: "alive" } dès qu'il est prêt à écouter.
 */
export function whenAlive(w: Worker, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      if (err) reject(err);
      else resolve();
    };
    const onMsg = (e: MessageEvent) => e.data?.type === "alive" && done();
    const onErr = (e: ErrorEvent) => done(new Error(e.message || "Le worker n'a pas pu démarrer"));
    const timer = setTimeout(() => done(new Error("Le worker ne répond pas")), timeoutMs);
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
  });
}
