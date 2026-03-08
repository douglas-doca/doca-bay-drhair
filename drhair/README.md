# Dr. Hair Scheduler API

API REST para consulta de horários e agendamentos no CRM UnObject.

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  drhair-scheduler (container)                           │
│  - UnObject Scraper (Puppeteer)                         │
│  - Cache de horários (atualiza a cada 30 min)           │
│  - API REST na porta 3001                               │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP (localhost:3001)
                          ▼
┌─────────────────────────────────────────────────────────┐
│  MCP-DOCA-V2 / Outros sistemas                          │
│  - Chama API do scheduler                               │
│  - Usa resultado no prompt da IA                        │
└─────────────────────────────────────────────────────────┘
```

## Endpoints

### `GET /api/horarios?data=DD/MM/YYYY`
Consulta horários disponíveis para uma data.

**Parâmetros:**
- `data`: Data no formato DD/MM/YYYY, "hoje", "amanha", ou dia da semana

**Resposta:**
```json
{
  "success": true,
  "data": "15/01/2025",
  "horarios": ["10:00", "10:40", "11:20", "15:00"],
  "total": 4
}
```

### `POST /api/agendar`
Cria uma reserva pendente (não confirma no CRM ainda).

**Body:**
```json
{
  "nome": "João Silva",
  "telefone": "31999999999",
  "data": "15/01/2025",
  "horario": "10:00",
  "dataNascimento": "01/01/1990"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Horário reservado!",
  "reservaId": "1705276800000",
  "status": "pendente"
}
```

### `POST /api/confirmar/:id`
Confirma uma reserva pendente no CRM via Puppeteer.

### `DELETE /api/cancelar/:id`
Cancela uma reserva pendente.

### `GET /api/reservas`
Lista todas as reservas pendentes.

### `GET /api/status`
Status do sistema e cache.

### `POST /api/cache/atualizar`
Força atualização do cache de horários.

### `GET /health`
Health check.

## Deploy

```bash
# Na pasta scheduler-api
docker compose build
docker compose up -d

# Ver logs
docker logs drhair-scheduler -f
```

## Variáveis de Ambiente

```env
PORT=3001
UNOBJECT_USERNAME=malyck.ia.drhair.contagem
UNOBJECT_PASSWORD=Malyck123$$
SCREENSHOTS=false
TZ=America/Sao_Paulo
```

## Uso no MCP-DOCA-V2

```typescript
// Consultar horários
const response = await fetch('http://localhost:3001/api/horarios?data=15/01/2025');
const { horarios } = await response.json();

// Agendar
const response = await fetch('http://localhost:3001/api/agendar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nome: 'João',
    telefone: '31999999999',
    data: '15/01/2025',
    horario: '10:00'
  })
});
```
