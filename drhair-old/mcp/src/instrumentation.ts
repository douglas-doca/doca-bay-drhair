// ============================================
// instrumentation.ts
// ============================================
// OBRIGATÓRIO para o SDK v4 funcionar.
// Deve ser importado NO TOPO do entry point da aplicação:
//
//   import "./instrumentation.js";  ← primeira linha do index.ts/server.ts
//
// ============================================

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const langfuseSpanProcessor = new LangfuseSpanProcessor({
  // Lê automaticamente de:
  //   LANGFUSE_PUBLIC_KEY
  //   LANGFUSE_SECRET_KEY
  //   LANGFUSE_BASE_URL
  // Não precisa passar explicitamente se as env vars estiverem setadas.
});

export const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

sdk.start();

// Graceful shutdown — chame isso no seu SIGTERM/SIGINT handler
// Exemplo de uso no server.ts:
//
//   process.on("SIGTERM", async () => {
//     await sdk.shutdown();
//     process.exit(0);
//   });