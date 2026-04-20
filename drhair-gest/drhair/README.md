# DOCA Bay — Dr. Hair

MCP Server + Scheduler para a marca Dr. Hair.
Segue o padrão Bay: cada marca tem seu MCP isolado.

## Estrutura

```
drhair/
├── mcp/                          ← Container 1: MCP Server (43 tools, SSE)
│   ├── src/
│   │   ├── index.ts              ← 43 tools MCP
│   │   ├── services/             ← fork do OCTA (supabase, memory, emotion, ai, waha, analysis)
│   │   ├── types/
│   │   └── utils/
│   ├── .env                      ← secrets (gitignored)
│   ├── docker-compose.yml        ← porta interna 3100
│   └── Dockerfile                ← Node leve, sem Chromium
│
├── scheduler/                    ← Container 2: Scraper UnObject (Puppeteer)
│   ├── src/
│   │   ├── server.js             ← Express multi-franquia
│   │   ├── scheduler.js          ← Cron + auto-recovery
│   │   └── services/
│   │       ├── scraper.js        ← UnObject Puppeteer
│   │       ├── cache.js          ← Cache por franquia
│   │       └── reservas.js       ← Reservas por franquia
│   ├── config/franquias.json     ← credenciais UnObject por franquia
│   ├── docker-compose.yml        ← porta 3003, healthcheck Chromium
│   └── Dockerfile                ← Node + Chromium
│
└── data/                         ← volume compartilhado (cache + reservas)
    └── drhair-contagem/
```

## Deploy

```bash
# 1. MCP
cd mcp && docker compose up -d --build

# 2. Scheduler
cd scheduler && docker compose up -d --build

# 3. Verificar
curl http://localhost:3100/health     # MCP
curl http://localhost:3003/health     # Scheduler
curl http://localhost:3003/api/status # Status multi-franquia
```

## Relação com DOCA-OCTA

- OCTA = código mãe (engine, router, webhook, humanizer)
- Bay = MCPs filhos (tools por marca)
- OCTA conecta no MCP via SSE: `http://mcp-drhair-contagem:3100/sse`
- MCP conecta no Scheduler via HTTP: `http://doca-scheduler:3001/api/:franquia/horarios`

## Adicionar nova franquia Dr. Hair

1. Editar `scheduler/config/franquias.json` — adicionar credenciais UnObject
2. Criar `data/{nova-franquia}/` — cache e reservas
3. Restart scheduler: `cd scheduler && docker compose restart`
4. Pronto! O MCP já serve todas as franquias via tenant_id
