#!/bin/bash
# ============================================================
# DEPLOY: Scheduler HTTP v2 (substitui Puppeteer)
# Executar no VPS 31.97.255.11
# ============================================================

set -e

echo "=== DOCA Scheduler HTTP v2 — Deploy ==="
echo ""

# 1. Parar scheduler antigo (Puppeteer)
echo "1️⃣  Parando scheduler antigo..."
cd /home/DOCA-BAY/drhair/scheduler 2>/dev/null && docker compose down || echo "   ⚠️ Scheduler antigo não encontrado (ok)"

# 2. Backup config antigo
echo "2️⃣  Backup do config antigo..."
if [ -f /home/DOCA-BAY/drhair/scheduler/config/tenants.json ]; then
  cp /home/DOCA-BAY/drhair/scheduler/config/tenants.json /home/DOCA-BAY/drhair/scheduler/config/tenants.json.bak.$(date +%Y%m%d)
  echo "   ✅ Backup salvo"
fi

# 3. Criar diretório do novo scheduler
echo "3️⃣  Preparando scheduler HTTP..."
SCHED_DIR="/home/DOCA-BAY/scheduler-http"
mkdir -p $SCHED_DIR
cd $SCHED_DIR

# Se já existe um git, pull. Senão, copiar os arquivos.
# (Ajustar conforme estratégia de deploy — git, rsync, scp)
echo "   📁 Diretório: $SCHED_DIR"

# 4. Build e start
echo "4️⃣  Build & start..."
docker compose up -d --build

# 5. Aguardar healthcheck
echo "5️⃣  Aguardando healthcheck..."
sleep 5

for i in 1 2 3 4 5; do
  HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo "   ✅ Scheduler HTTP v2 rodando!"
    echo "   $HEALTH" | python3 -m json.tool 2>/dev/null || echo "   $HEALTH"
    break
  fi
  echo "   ⏳ Tentativa $i/5..."
  sleep 3
done

# 6. Teste rápido
echo ""
echo "6️⃣  Teste: horários Magrass Barbacena..."
curl -sf 'http://localhost:3001/api/magrass-barbacena/horarios?data='$(date +%d/%m/%Y) | python3 -m json.tool 2>/dev/null | head -30

echo ""
echo "=== Deploy completo ==="
echo ""
echo "📋 Próximos passos:"
echo "   1. Verificar logs: docker logs doca-scheduler --tail 30"
echo "   2. Testar via MCP: consultar_horarios no agente"
echo "   3. Capturar mutations de agendamento no DevTools"
echo "   4. Migrar Dr. Hair: capturar companyId + roomIds"
echo ""
echo "🔧 Rollback se necessário:"
echo "   cd $SCHED_DIR && docker compose down"
echo "   cd /home/DOCA-BAY/drhair/scheduler && docker compose up -d"
