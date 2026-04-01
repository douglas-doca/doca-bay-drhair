#!/bin/bash
# ============================================
# DOCA Bay Dr Hair MCP — Script de Migração
# Copia tudo que o MCP precisa do DOCA-OCTA
# ============================================

set -e

OCTA_SRC="/home/DOCA-OCTA/src"
OCTA_ROOT="/home/DOCA-OCTA"
BAY_MCP_SRC="/home/DOCA-BAY/drhair/mcp/src"
BAY_MCP_ROOT="/home/DOCA-BAY/drhair/mcp"

echo "=================================================="
echo "🚀 Migrando MCP Dr Hair: OCTA → Bay"
echo "=================================================="

# ─── 1. SERVICES ───────────────────────────────────────
echo ""
echo "📋 Copiando services..."

SERVICES=(
  "supabase.service.ts"
  "memory.service.ts"
  "emotion.service.ts"
  "ai.service.ts"
  "waha.service.ts"
  "analysis.service.ts"
  "client.service.ts"
  "scheduler.service.ts"
  "usage-tracker.ts"
)

mkdir -p "$BAY_MCP_SRC/services"

for svc in "${SERVICES[@]}"; do
  if [ -f "$OCTA_SRC/services/$svc" ]; then
    cp "$OCTA_SRC/services/$svc" "$BAY_MCP_SRC/services/$svc"
    echo "  ✅ services/$svc"
  else
    echo "  ⚠️  services/$svc não encontrado"
  fi
done

# ─── 2. INDEX.TS (43 tools) ───────────────────────────
echo ""
echo "📋 Copiando index.ts (43 tools)..."

if [ -f "$OCTA_SRC/index.ts" ] && grep -q "ListToolsRequestSchema" "$OCTA_SRC/index.ts"; then
  cp "$OCTA_SRC/index.ts" "$BAY_MCP_SRC/index.ts"
  echo "  ✅ index.ts"
else
  echo "  ❌ index.ts do MCP não encontrado!"
  echo "     Verifique se $OCTA_SRC/index.ts contém ListToolsRequestSchema"
fi

# ─── 3. UTILS ──────────────────────────────────────────
echo ""
echo "📋 Copiando utils..."

mkdir -p "$BAY_MCP_SRC/utils"

# Logger — copiar do OCTA (sobreescreve o placeholder)
if [ -f "$OCTA_SRC/utils/logger.ts" ]; then
  cp "$OCTA_SRC/utils/logger.ts" "$BAY_MCP_SRC/utils/logger.ts"
  echo "  ✅ utils/logger.ts (do OCTA)"
else
  echo "  ⚠️  utils/logger.ts não encontrado, usando fallback"
fi

# Outros utils
for f in "$OCTA_SRC/utils/"*.ts; do
  [ -f "$f" ] || continue
  fname=$(basename "$f")
  if [ "$fname" != "logger.ts" ]; then
    cp "$f" "$BAY_MCP_SRC/utils/$fname"
    echo "  ✅ utils/$fname"
  fi
done

# ─── 4. TYPES ──────────────────────────────────────────
echo ""
echo "📋 Copiando types..."

mkdir -p "$BAY_MCP_SRC/types"

for f in "$OCTA_SRC/types/"*.ts; do
  [ -f "$f" ] || continue
  fname=$(basename "$f")
  cp "$f" "$BAY_MCP_SRC/types/$fname"
  echo "  ✅ types/$fname"
done

# ─── 5. CLIENTES (configs lidos pelo client.service) ──
echo ""
echo "📋 Copiando pasta clientes/..."

if [ -d "$OCTA_ROOT/clientes" ]; then
  cp -r "$OCTA_ROOT/clientes" "$BAY_MCP_ROOT/clientes"
  echo "  ✅ clientes/ copiado"
  ls "$BAY_MCP_ROOT/clientes/" | while read d; do
    echo "     └─ $d"
  done
else
  echo "  ❌ $OCTA_ROOT/clientes não encontrado!"
  mkdir -p "$BAY_MCP_ROOT/clientes"
fi

# ─── 6. INSTRUMENTATION (se existir) ──────────────────
echo ""
echo "📋 Verificando instrumentation..."

if [ -f "$OCTA_SRC/instrumentation.ts" ]; then
  cp "$OCTA_SRC/instrumentation.ts" "$BAY_MCP_SRC/instrumentation.ts"
  echo "  ✅ instrumentation.ts"
fi

# ─── 7. .ENV ──────────────────────────────────────────
echo ""
echo "📋 Configurando .env..."

if [ ! -f "$BAY_MCP_ROOT/.env" ]; then
  if [ -f "$OCTA_ROOT/.env" ]; then
    cp "$OCTA_ROOT/.env" "$BAY_MCP_ROOT/.env"
    echo "  ✅ .env copiado do OCTA"
  else
    echo "  ⚠️  .env não encontrado, copie manualmente"
  fi
else
  echo "  ⏭️  .env já existe, pulando"
fi

# ─── 8. INSTALAR + BUILD ─────────────────────────────
echo ""
echo "📦 Instalando dependências..."
cd "$BAY_MCP_ROOT"
npm install --legacy-peer-deps 2>&1 | tail -5

echo ""
echo "🔨 Compilando TypeScript..."
npx tsc 2>&1 | head -20

if [ $? -eq 0 ]; then
  echo "  ✅ Build OK!"
else
  echo "  ⚠️  Build teve warnings (pode funcionar mesmo assim)"
fi

# ─── 9. RESUMO ───────────────────────────────────────
echo ""
echo "=================================================="
echo "✅ Migração concluída!"
echo ""
echo "📁 Estrutura:"
find "$BAY_MCP_SRC" -name "*.ts" | wc -l
echo " arquivos .ts copiados"
echo ""
echo "📝 AÇÕES MANUAIS:"
echo ""
echo "  1. Remover 'mcp-drhair-contagem' do docker-compose do OCTA:"
echo "     vim /home/DOCA-OCTA/docker-compose.yml"
echo ""
echo "  2. Subir o MCP do Bay:"
echo "     cd /home/DOCA-BAY/drhair/mcp && docker compose up -d --build"
echo ""
echo "  3. Rebuild OCTA (sem o MCP):"
echo "     cd /home/DOCA-OCTA && docker compose up -d --build doca-octa"
echo ""
echo "  4. Testar:"
echo "     curl http://mcp-drhair-contagem:3100/health  # dentro da rede"
echo "     docker logs mcp-drhair-contagem --tail 10"
echo "     docker logs doca-octa --tail 10 | grep McpManager"
echo "=================================================="
