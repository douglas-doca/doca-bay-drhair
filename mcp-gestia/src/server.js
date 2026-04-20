/**
 * MCP GestIA Server
 * Porta: 3202
 * Transport: SSE (compatível com Bay MCP do DOCA-OCTA)
 *
 * Variáveis de ambiente:
 *   GESTIA_BASE_URL    (default: https://api-drhair.gestiaerp.com.br)
 *   GESTIA_JWK_PATH    (default: ./keys/private.jwk.json)
 *   GESTIA_USER_ID     (default: 53)
 *   PORT               (default: 3202)
 */
const express = require("express");
const { GestiaClient } = require("./client");
const { tools } = require("./tools");

const PORT = process.env.PORT || 3202;
const BASE_URL = process.env.GESTIA_BASE_URL || "https://api-drhair.gestiaerp.com.br";
const JWK_PATH = process.env.GESTIA_JWK_PATH || __dirname + "/../keys/private.jwk.json";
const USER_ID = Number(process.env.GESTIA_USER_ID) || 53;

const client = new GestiaClient({ baseUrl: BASE_URL, privateJwkPath: JWK_PATH, userId: USER_ID });
const app = express();
app.use(express.json());

// ══════════════════════════════════════
//  Health check
// ══════════════════════════════════════
app.get("/health", (req, res) => {
  res.json({ status: "ok", tools: tools.length, baseUrl: BASE_URL });
});

// ══════════════════════════════════════
//  SSE endpoint (MCP transport)
// ══════════════════════════════════════
app.get("/sse", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Enviar endpoint de mensagens
  const messageEndpoint = `http://localhost:${PORT}/message`;
  res.write(`event: endpoint\ndata: ${messageEndpoint}\n\n`);

  // Keepalive
  const keepalive = setInterval(() => res.write(": keepalive\n\n"), 30000);

  // Guardar referência pra mandar respostas
  const sessionId = Date.now().toString(36);
  sseClients.set(sessionId, res);

  req.on("close", () => {
    clearInterval(keepalive);
    sseClients.delete(sessionId);
  });
});

const sseClients = new Map();

// ══════════════════════════════════════
//  Streamable HTTP endpoint (MCP transport)
// ══════════════════════════════════════
app.post("/mcp/gestia/mcp", handleMcpRequest);
app.post("/message", handleMcpRequest);

async function handleMcpRequest(req, res) {
  const { method, id, params } = req.body;

  try {
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "mcp-gestia", version: "1.0.0" },
        },
      });
    }

    if (method === "notifications/initialized") {
      return res.json({ jsonrpc: "2.0", id, result: {} });
    }

    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool não encontrada: ${name}` },
        });
      }

      console.log(`[tool] ${name}`, JSON.stringify(args).substring(0, 200));
      const result = await tool.handler(client, args);

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      });
    }

    // Método não reconhecido
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Método não suportado: ${method}` },
    });
  } catch (err) {
    console.error(`[error] ${method}:`, err.message);
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err.message },
    });
  }
}

// ══════════════════════════════════════
//  Start
// ══════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n══════════════════════════════════════`);
  console.log(`  MCP GestIA Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Tools: ${tools.length}`);
  console.log(`  SSE: http://localhost:${PORT}/sse`);
  console.log(`  HTTP: http://localhost:${PORT}/mcp/gestia/mcp`);
  console.log(`══════════════════════════════════════\n`);
});
