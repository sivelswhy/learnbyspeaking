import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);

// Prêt à recevoir des messages (voir lib/workerReady.ts).
self.postMessage({ type: "alive" });
