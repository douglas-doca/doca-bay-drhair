# DOCA Scheduler — UnObject Multi-Tenant

## Visão Geral

Scheduler unificado para clientes que usam UnObject CRM.
Scraper Puppeteer consulta horários, cache local por tenant, reservas em JSON (migrar pra Supabase depois).

## Tenants

Configurados via `config/tenants.json`. Cada tenant tem:
- Credenciais UnObject
- Salas configuradas
- Horários de funcionamento
- Intervalo de cache

## Fluxo

```
Cron (30min por tenant)
  → Puppeteer abre UnObject
  → Scrape horários de todas as salas
  → Salva em data/{tenant}/cache.json
  → Fecha browser

Agente DOCA-OCTA chama HTTP API:
  GET  /api/{tenant}/horarios?data=DD/MM/YYYY
  POST /api/{tenant}/agendar
  GET  /api/{tenant}/reservas
  POST /api/{tenant}/confirmar/:id
  DELETE /api/{tenant}/cancelar/:id
```

## Auto-Recovery

- `/health` → checa Express
- `/health/scraper` → tenta puppeteer.launch() + close()
- Docker healthcheck usa `/health/scraper`
- Se Chromium morrer (fork error), healthcheck falha → Docker restart

## Estrutura

```
doca-scheduler/
├── config/
│   └── tenants.json
├── src/
│   ├── server.js           ← Express + rotas multi-tenant
│   ├── scheduler.js        ← Cron que roda scraper por tenant
│   ├── services/
│   │   ├── scraper.js      ← UnObjectScraper (existente, limpo)
│   │   ├── cache.js        ← Cache por tenant
│   │   └── reservas.js     ← Reservas por tenant
│   └── middleware/
│       └── tenant.js       ← Resolve tenant do path param
├── data/                   ← Criado em runtime, volume Docker
├── screenshots/            ← Debug, volume Docker
├── Dockerfile
├── docker-compose.yml
└── package.json
```
