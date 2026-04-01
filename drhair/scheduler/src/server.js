/**
 * DOCA Scheduler — Multi-Tenant UnObject Scraper
 *
 * Endpoints:
 *   GET  /health                        → Express alive
 *   GET  /health/scraper                → Puppeteer alive (Docker healthcheck)
 *   GET  /api/status                    → Status de todos os tenants
 *   GET  /api/:tenant/horarios?data=    → Horários disponíveis
 *   GET  /api/:tenant/horarios/status   → Status do cache
 *   POST /api/:tenant/agendar           → Criar reserva
 *   GET  /api/:tenant/reservas          → Listar reservas pendentes
 *   POST /api/:tenant/confirmar/:id     → Confirmar reserva (scraper no UnObject)
 *   DELETE /api/:tenant/cancelar/:id    → Cancelar reserva
 *   POST /api/:tenant/refresh           → Forçar refresh do cache
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const tenantMiddleware = require('./middleware/tenant');
const cacheService = require('./services/cache');
const reservasService = require('./services/reservas');
const { startScheduler, getScraperHealth, runScraper } = require('./scheduler');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Carregar config
const tenantsConfig = require(path.join(__dirname, '../config/tenants.json'));
const globalConfig = tenantsConfig.global;

// ============================================================================
// Health checks
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Healthcheck real do Puppeteer.
 * Retorna 503 se:
 * - Houve erro de fork (Chromium morto)
 * - 3+ falhas consecutivas do scraper
 * Docker healthcheck usa este endpoint → restart automático.
 */
app.get('/health/scraper', (req, res) => {
  const health = getScraperHealth();

  if (health.forkError) {
    return res.status(503).json({
      status: 'unhealthy',
      reason: 'fork_error',
      message: 'Chromium cannot fork — container needs restart',
      lastError: health.lastErrorMessage
    });
  }

  if (health.consecutiveFailures >= 3) {
    return res.status(503).json({
      status: 'unhealthy',
      reason: 'consecutive_failures',
      failures: health.consecutiveFailures,
      lastError: health.lastErrorMessage
    });
  }

  res.json({
    status: 'healthy',
    lastSuccess: health.lastSuccess,
    consecutiveFailures: health.consecutiveFailures,
    isRunning: health.isRunning
  });
});

// ============================================================================
// Status global
// ============================================================================

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    scraper: getScraperHealth(),
    tenants: cacheService.getAllStatus(),
    tenantsAtivos: Object.entries(tenantsConfig.tenants)
      .filter(([_, c]) => c.ativo)
      .map(([id, c]) => ({ id, nome: c.nome }))
  });
});

// ============================================================================
// Rotas por tenant
// ============================================================================

const tenantRouter = express.Router({ mergeParams: true });
tenantRouter.use(tenantMiddleware(tenantsConfig));

// GET /api/:tenant/horarios?data=DD/MM/YYYY
tenantRouter.get('/horarios', async (req, res) => {
  const { data } = req.query;
  const { tenantId } = req;

  if (!data) {
    return res.status(400).json({ success: false, error: 'Parâmetro "data" obrigatório (DD/MM/YYYY)' });
  }

  const result = cacheService.getHorarios(tenantId, data);

  // Filtrar reservas pendentes nos horários mesclados
  let disponiveis = await reservasService.filtrarDisponiveis(tenantId, data, result.horarios);

  // Filtrar horários que já passaram (se data = hoje)
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (data === hoje) {
    const agora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
    const [horaAtual, minAtual] = agora.split(":").map(Number);
    const minutosAtual = horaAtual * 60 + minAtual + 30;
    disponiveis = disponiveis.filter(h => { const [hh, mm] = h.split(":").map(Number); return (hh * 60 + mm) > minutosAtual; });
  }
  res.json({
    success: true,
    tenantId,
    data,
    diaSemana: result.diaSemana || null,
    horarios: disponiveis,
    salas: result.salas,
    total: disponiveis.length,
    consultadoEm: result.consultadoEm || null
  });
});

// GET /api/:tenant/horarios/status
tenantRouter.get('/horarios/status', (req, res) => {
  res.json({ success: true, ...cacheService.getStatus(req.tenantId) });
});

// POST /api/:tenant/agendar
tenantRouter.post('/agendar', async (req, res) => {
  const { nome, telefone, data, horario, dataNascimento, leadId } = req.body;
  const { tenantId } = req;

  if (!nome || !telefone || !data || !horario) {
    return res.status(400).json({
      success: false,
      error: 'Campos obrigatórios: nome, telefone, data, horario'
    });
  }

  try {
    // Encontrar qual sala tem esse horário
    const sala = cacheService.encontrarSala(tenantId, data, horario);

    const reserva = await reservasService.criar(tenantId, {
      nome,
      telefone,
      data,
      horario,
      dataNascimento: dataNascimento || null,
      salaId: sala ? sala.salaId : null,
      leadId: leadId || null
    });

    // Remover do cache imediatamente
    cacheService.removerHorario(tenantId, data, horario);

    res.json({
      success: true,
      reservaId: reserva.id,
      sala: sala ? sala.nome : null,
      message: `Reservado: ${data} às ${horario}${sala ? ` (${sala.nome})` : ''}`
    });

  } catch (err) {
    console.error(`❌ [Agendar:${tenantId}] ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/:tenant/reservas
tenantRouter.get('/reservas', async (req, res) => {
  const { data } = req.query;
  const reservas = await reservasService.listar(req.tenantId, data ? { data } : {});
  res.json({ success: true, reservas, total: reservas.length });
});

// POST /api/:tenant/confirmar/:id
tenantRouter.post('/confirmar/:id', async (req, res) => {
  const { tenantId, tenantConfig } = req;
  const { id } = req.params;

  const reserva = await reservasService.get(tenantId, id);
  if (!reserva) {
    return res.status(404).json({ success: false, error: 'Reserva não encontrada' });
  }

  const UnObjectScraper = require('./services/scraper');
  let scraper = null;

  try {
    const scraperConfig = {
      url: tenantConfig.unobject.url,
      username: tenantConfig.unobject.username,
      password: tenantConfig.unobject.password,
      salas: tenantConfig.salas,
      headless: globalConfig.puppeteer.headless,
      screenshots: globalConfig.screenshots,
      screenshotDir: path.join(globalConfig.screenshotDir, tenantId),
      timeout: globalConfig.puppeteer.timeout,
      duracaoAvaliacao: tenantConfig.duracaoAvaliacao
    };

    scraper = new UnObjectScraper(scraperConfig);
    await scraper.init();

    let resultado;

    // Tentar na sala específica se tiver
    if (reserva.salaId) {
      const sala = tenantConfig.salas.find(s => s.id === reserva.salaId);
      if (sala) {
        resultado = await scraper.criarAgendamentoEmSala({
          cliente: {
            nome: reserva.nome,
            telefone: reserva.telefone,
            dataNascimento: reserva.dataNascimento || '01/01/1990',
            genero: 'Masculino'
          },
          data: reserva.data,
          horario: reserva.horario
        }, sala.nome);
      }
    }

    // Fallback
    if (!resultado) {
      resultado = await scraper.criarAgendamento({
        cliente: {
          nome: reserva.nome,
          telefone: reserva.telefone,
          dataNascimento: reserva.dataNascimento || '01/01/1990',
          genero: 'Masculino'
        },
        data: reserva.data,
        horario: reserva.horario
      });
    }

    if (resultado.success) {
      await reservasService.confirmar(tenantId, id);
      res.json({ success: true, message: 'Agendamento confirmado no CRM!' });
    } else {
      throw new Error(resultado.error || 'Falha ao confirmar no CRM');
    }

  } catch (err) {
    console.error(`❌ [Confirmar:${tenantId}] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (scraper) {
      try { await scraper.close(); } catch {}
    }
  }
});

// DELETE /api/:tenant/cancelar/:id
tenantRouter.delete('/cancelar/:id', async (req, res) => {
  try {
    const reserva = await reservasService.cancelar(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Cancelado', reserva });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/:tenant/refresh — forçar refresh do cache
tenantRouter.post('/refresh', async (req, res) => {
  const { tenantId, tenantConfig } = req;
  res.json({ success: true, message: `Refresh iniciado para ${tenantId}` });

  // Roda async (não bloqueia resposta)
  runScraper(tenantId, tenantConfig, globalConfig).catch(err =>
    console.error(`❌ [Refresh:${tenantId}] ${err.message}`)
  );
});

// ============================================================================
// Compatibilidade — rotas sem tenant (mapeia pra drhair-contagem)
// ============================================================================

app.get('/api/horarios', async (req, res) => {
  req.params.tenant = 'drhair-contagem';
  req.tenantId = 'drhair-contagem';
  req.tenantConfig = tenantsConfig.tenants['drhair-contagem'];
  const handler = tenantRouter.stack.find(s => s.route && s.route.path === '/horarios' && s.route.methods.get);
  if (handler) {
    return handler.route.stack[0].handle(req, res);
  }
  res.status(500).json({ error: 'Fallback failed' });
});

app.post('/api/agendar', async (req, res) => {
  req.params.tenant = 'drhair-contagem';
  req.tenantId = 'drhair-contagem';
  req.tenantConfig = tenantsConfig.tenants['drhair-contagem'];
  const handler = tenantRouter.stack.find(s => s.route && s.route.path === '/agendar' && s.route.methods.post);
  if (handler) {
    return handler.route.stack[0].handle(req, res);
  }
  res.status(500).json({ error: 'Fallback failed' });
});

// ============================================================================
// Montar rotas
// ============================================================================

app.use('/api/:tenant', tenantRouter);

// ============================================================================
// Iniciar
// ============================================================================

app.listen(PORT, () => {
  const ativos = Object.entries(tenantsConfig.tenants).filter(([_, c]) => c.ativo);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 DOCA Scheduler v2.0 — Multi-Tenant`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n🏢 Tenants ativos: ${ativos.length}`);
  ativos.forEach(([id, c]) => {
    console.log(`   ✅ ${id} — ${c.nome} (${c.salas.filter(s => s.ativo).length} salas)`);
  });
  console.log(`\n📋 Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /health/scraper              ← Docker healthcheck`);
  console.log(`   GET  /api/status`);
  console.log(`   GET  /api/:tenant/horarios?data=`);
  console.log(`   POST /api/:tenant/agendar`);
  console.log(`   GET  /api/:tenant/reservas`);
  console.log(`   POST /api/:tenant/confirmar/:id`);
  console.log(`   DEL  /api/:tenant/cancelar/:id`);
  console.log(`   POST /api/:tenant/refresh`);
  console.log(`\n   ⚡ Compat: /api/horarios → drhair-contagem`);
  console.log(`${'='.repeat(60)}\n`);

  // Iniciar scheduler
  startScheduler(tenantsConfig, globalConfig);
});
