/**
 * DOCA Scheduler HTTP — Express Server
 * Substitui o scheduler Puppeteer por chamadas GraphQL diretas ao UnObject
 * Mode: on-demand (sem cache/cron — sempre fresh)
 * 
 * Endpoints:
 *   GET  /health                                → healthcheck
 *   GET  /api/status                            → status de todos os tenants
 *   GET  /api/:tenant/horarios?data=DD/MM/YYYY  → horários disponíveis
 *   GET  /api/:tenant/appointments?data=DD/MM/YYYY → agendamentos existentes
 *   GET  /api/:tenant/rooms                     → salas do tenant
 *   GET  /api/:tenant/holidays                  → feriados
 *   GET  /api/:tenant/services?roomId=X         → serviços por sala
 *   POST /api/:tenant/agendar                   → criar agendamento (v2 futuro)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { UnObjectClient } = require('./services/unobject-client');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config', 'tenants.json');

// ─── Load tenants ───────────────────────────────────────────

let tenantsConfig = {};
let clients = {}; // { tenantId: UnObjectClient }

function loadTenants() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  tenantsConfig = JSON.parse(raw).tenants;

  for (const [id, cfg] of Object.entries(tenantsConfig)) {
    if (!cfg.ativo) {
      console.log(`⏸️  [${id}] inativo — pulando`);
      continue;
    }
    if (!cfg.unobject?.companyId) {
      console.log(`⚠️  [${id}] sem companyId — pulando`);
      continue;
    }

    clients[id] = new UnObjectClient({
      login: cfg.unobject.login,
      password: cfg.unobject.password,
      companyId: cfg.unobject.companyId,
      roomIds: cfg.unobject.roomIds || [],
      tenantName: cfg.nome || id,
      tokenTTL: 55 * 60 * 1000,
    });

    console.log(`✅ [${id}] client criado — companyId=${cfg.unobject.companyId}, rooms=${(cfg.unobject.roomIds || []).join(',')}`);
  }
}

// ─── Middleware: resolve tenant ─────────────────────────────

function resolveTenant(req, res, next) {
  const tenantId = req.params.tenant;
  const client = clients[tenantId];

  if (!client) {
    return res.status(404).json({
      success: false,
      error: `Tenant '${tenantId}' não encontrado ou inativo`,
      availableTenants: Object.keys(clients),
    });
  }

  req.tenantId = tenantId;
  req.client = client;
  req.tenantConfig = tenantsConfig[tenantId];
  next();
}

// ─── Routes ─────────────────────────────────────────────────

// Health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'doca-scheduler-http',
    version: '2.0.0',
    engine: 'graphql',
    tenants: Object.keys(clients),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Status de todos os tenants
app.get('/api/status', async (req, res) => {
  const status = {};
  for (const [id, client] of Object.entries(clients)) {
    const health = await client.healthCheck();
    status[id] = {
      nome: tenantsConfig[id]?.nome,
      ...health,
    };
  }
  res.json({ success: true, tenants: status });
});

// ─── Per-tenant routes ──────────────────────────────────────

// Horários disponíveis (always fresh — on-demand)
app.get('/api/:tenant/horarios', resolveTenant, async (req, res) => {
  try {
    const dateStr = req.query.data || formatToday();
    const duracao = parseInt(req.query.duracao) || req.tenantConfig.duracaoAvaliacao || 60;

    const data = await req.client.getAvailableSlots(dateStr, duracao);

    res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error(`❌ [${req.tenantId}] /horarios error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Agendamentos existentes
app.get('/api/:tenant/appointments', resolveTenant, async (req, res) => {
  try {
    const dateStr = req.query.data || formatToday();
    const [day, month, year] = dateStr.split('/').map(Number);
    const dateISO = new Date(year, month - 1, day, 12, 0, 0).toISOString();

    const appointments = await req.client.getAppointments(dateISO);

    res.json({
      success: true,
      date: dateStr,
      count: appointments.length,
      appointments,
    });
  } catch (err) {
    console.error(`❌ [${req.tenantId}] /appointments error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feriados
app.get('/api/:tenant/holidays', resolveTenant, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const dateISO = `${year}-01-01T03:00:00.000Z`;
    const holidays = await req.client.getHolidays(dateISO);
    res.json({ success: true, holidays });
  } catch (err) {
    console.error(`❌ [${req.tenantId}] /holidays error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serviços disponíveis por sala
app.get('/api/:tenant/services', resolveTenant, async (req, res) => {
  try {
    const roomId = parseInt(req.query.roomId);
    if (!roomId) return res.status(400).json({ success: false, error: 'roomId é obrigatório' });
    const customerId = req.query.customerId ? parseInt(req.query.customerId) : null;
    const services = await req.client.getOrderServices(roomId, customerId);
    res.json({ success: true, services });
  } catch (err) {
    console.error(`❌ [${req.tenantId}] /services error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Salas
app.get('/api/:tenant/rooms', resolveTenant, async (req, res) => {
  try {
    const dateStr = req.query.data || formatToday();
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);

    const rooms = await req.client.getRooms(date);

    res.json({
      success: true,
      date: dateStr,
      rooms,
    });
  } catch (err) {
    console.error(`❌ [${req.tenantId}] /rooms error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Criar agendamento (v2 futuro)
app.post('/api/:tenant/agendar', resolveTenant, async (req, res) => {
  try {
    const result = await req.client.createAppointment(req.body);
    res.json({ success: true, appointment: result });
  } catch (err) {
    if (err.message.includes('placeholder')) {
      return res.status(501).json({
        success: false,
        error: 'Mutation createAppointment ainda não implementada (v2)',
        hint: 'Capture a mutation no DevTools e atualize unobject-client.js',
      });
    }
    console.error(`❌ [${req.tenantId}] /agendar error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Buscar cliente
app.get('/api/:tenant/customer', resolveTenant, async (req, res) => {
  try {
    const phone = req.query.phone || req.query.telefone;
    if (!phone) return res.status(400).json({ success: false, error: 'phone é obrigatório' });

    const customers = await req.client.searchCustomer(phone);
    res.json({ success: true, customers });
  } catch (err) {
    console.error(`❌ [${req.tenantId}] /customer error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Helpers ────────────────────────────────────────────────

function formatToday() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Start ──────────────────────────────────────────────────

loadTenants();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 DOCA Scheduler HTTP v2.0.0 — porta ${PORT}`);
  console.log(`   Engine: GraphQL HTTP (on-demand, sem cache/cron)`);
  console.log(`   Tenants ativos: ${Object.keys(clients).join(', ')}`);
  console.log(`   Config: ${CONFIG_PATH}\n`);
});

module.exports = app;
