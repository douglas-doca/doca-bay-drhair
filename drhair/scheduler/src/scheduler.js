const cron = require('node-cron');
const path = require('path');
const cacheService = require('./services/cache');
const reservasService = require('./services/reservas');

// Estado global do scraper
const scraperHealth = {
  lastSuccess: null,
  lastError: null,
  lastErrorMessage: null,
  consecutiveFailures: 0,
  isRunning: false
};

// Fila sequencial — tenants esperam ao invés de pular
const scraperQueue = [];
let isProcessingQueue = false;

function getScraperHealth() {
  return { ...scraperHealth };
}

function enqueueScraper(tenantId, tenantConfig, globalConfig) {
  // Evitar duplicatas na fila
  if (scraperQueue.some(job => job.tenantId === tenantId)) {
    console.log(`⏳ [Queue:${tenantId}] Já está na fila, ignorando duplicata`);
    return;
  }
  console.log(`📥 [Queue:${tenantId}] Adicionado à fila (${scraperQueue.length + 1} na fila)`);
  scraperQueue.push({ tenantId, tenantConfig, globalConfig });
  processQueue();
}

async function processQueue() {
  if (isProcessingQueue || scraperQueue.length === 0) return;
  isProcessingQueue = true;
  while (scraperQueue.length > 0) {
    const job = scraperQueue.shift();
    await runScraper(job.tenantId, job.tenantConfig, job.globalConfig);
    // Delay entre tenants pra não sobrecarregar
    if (scraperQueue.length > 0) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  isProcessingQueue = false;
}

async function runScraper(tenantId, tenantConfig, globalConfig) {
  scraperHealth.isRunning = true;

  const UnObjectScraper = require('./services/scraper');
  let scraper = null;

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 [Scheduler:${tenantId}] Atualizando cache...`);
    console.log(`${'='.repeat(60)}\n`);

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

    // Calcular datas a consultar (D0..D3)
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hora = agora.getHours();
    const minutos = agora.getMinutes();

    const incluirHoje = hora < 17 || (hora === 17 && minutos < 30);
    const datasParaConsultar = [];

    if (incluirHoje) {
      datasParaConsultar.push({ key: 'D0', offset: 0, label: 'HOJE' });
    }
    datasParaConsultar.push(
      { key: 'D1', offset: 1, label: 'D+1' },
      { key: 'D2', offset: 2, label: 'D+2' },
      { key: 'D3', offset: 3, label: 'D+3' }
    );

    const resultados = [];
    const salasAtivas = tenantConfig.salas.filter(s => s.ativo);

    for (const consulta of datasParaConsultar) {
      const data = new Date(agora);
      data.setDate(data.getDate() + consulta.offset);

      const diaSemana = getDiaSemana(data);
      const dataFormatada = formatarData(data);

      // Checar se funciona neste dia
      const horariosFuncionamento = getHorariosFuncionamento(tenantConfig.horarios, data.getDay());
      if (!horariosFuncionamento.abre) {
        console.log(`⏸️  [Scheduler:${tenantId}] ${consulta.label} (${dataFormatada}) — fechado`);
        resultados.push({ key: consulta.key, data: dataFormatada, diaSemana, salas: {} });
        continue;
      }

      console.log(`📅 [Scheduler:${tenantId}] ${consulta.label} (${dataFormatada} - ${diaSemana})...`);

      try {
        const horariosPorSala = await scraper.consultarHorariosMultiSala(dataFormatada, salasAtivas);

        // Filtrar por horários de funcionamento
        for (const [salaId, salaInfo] of Object.entries(horariosPorSala)) {
          if (salaInfo.horarios) {
            salaInfo.horarios = filtrarPorFuncionamento(
              salaInfo.horarios,
              horariosFuncionamento
            );

            // Se for hoje, filtrar apenas futuros (+30min)
            if (consulta.offset === 0) {
              const agoraMins = hora * 60 + minutos + 30;
              salaInfo.horarios = salaInfo.horarios.filter(h => {
                const [hr, min] = h.split(':').map(Number);
                return (hr * 60 + min) > agoraMins;
              });
            }
          }
        }

        // Filtrar reservas pendentes
        for (const [salaId, salaInfo] of Object.entries(horariosPorSala)) {
          if (salaInfo.horarios) {
            salaInfo.horarios = await reservasService.filtrarDisponiveis(
              tenantId, dataFormatada, salaInfo.horarios
            );
          }
        }

        let total = 0;
        for (const salaInfo of Object.values(horariosPorSala)) {
          total += (salaInfo.horarios || []).length;
        }
        console.log(`✅ [Scheduler:${tenantId}] ${consulta.label}: ${total} horários`);

        resultados.push({
          key: consulta.key,
          data: dataFormatada,
          diaSemana,
          salas: horariosPorSala
        });

      } catch (err) {
        console.error(`⚠️  [Scheduler:${tenantId}] Erro ${consulta.label}: ${err.message}`);
        resultados.push({
          key: consulta.key,
          data: dataFormatada,
          diaSemana,
          salas: gerarSalasTeoricos(salasAtivas, data, tenantConfig)
        });
      }

      // Delay entre consultas
      await new Promise(r => setTimeout(r, 3000));
    }

    // Salvar tudo no cache
    await cacheService.saveScraperResult(tenantId, tenantConfig, resultados);

    // Limpar reservas expiradas
    await reservasService.limparExpiradas(tenantId);

    scraperHealth.lastSuccess = new Date().toISOString();
    scraperHealth.consecutiveFailures = 0;
    scraperHealth.lastErrorMessage = null;

    console.log(`\n✅ [Scheduler:${tenantId}] Cache atualizado!\n`);

  } catch (err) {
    scraperHealth.lastError = new Date().toISOString();
    scraperHealth.lastErrorMessage = err.message;
    scraperHealth.consecutiveFailures++;

    console.error(`\n❌ [Scheduler:${tenantId}] FALHA: ${err.message}`);

    // Se for erro de fork, sinalizar pro healthcheck
    if (err.message.includes('Cannot fork') || err.message.includes('Resource temporarily unavailable')) {
      console.error(`🚨 [Scheduler:${tenantId}] ERRO DE FORK DETECTADO — healthcheck vai falhar → Docker restart`);
      scraperHealth.forkError = true;
    }

  } finally {
    if (scraper) {
      try { await scraper.close(); } catch {}
    }
    scraperHealth.isRunning = false;
  }
}

// =========================================================================
// Iniciar crons para todos os tenants ativos
// =========================================================================

function startScheduler(tenantsConfig, globalConfig) {
  const tenants = tenantsConfig.tenants;

  for (const [tenantId, config] of Object.entries(tenants)) {
    if (!config.ativo) {
      console.log(`⏸️  [Scheduler] ${tenantId} — inativo, pulando`);
      continue;
    }

    const intervalMin = config.cacheIntervalMin || 30;

    // Inicializar serviços
    cacheService.initialize(tenantId).catch(err =>
      console.error(`❌ [Cache:${tenantId}] Init falhou: ${err.message}`)
    );
    reservasService.initialize(tenantId).catch(err =>
      console.error(`❌ [Reservas:${tenantId}] Init falhou: ${err.message}`)
    );

    // Primeira execução imediata (com delay entre tenants)
    const delayMs = Object.keys(tenants).indexOf(tenantId) * 10000;
    setTimeout(() => {
      enqueueScraper(tenantId, config, globalConfig);
    }, 5000 + delayMs);

    // Cron periódico
    cron.schedule(`*/${intervalMin} * * * *`, () => {
      enqueueScraper(tenantId, config, globalConfig);
    }, { timezone: 'America/Sao_Paulo' });

    console.log(`✅ [Scheduler] ${tenantId} — cron a cada ${intervalMin}min`);
  }
}

// =========================================================================
// Helpers
// =========================================================================

function formatarData(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function getDiaSemana(date) {
  return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][date.getDay()];
}

function getHorariosFuncionamento(horarios, diaSemana) {
  if (diaSemana === 0) return horarios.domingo ? { abre: true, ...horarios.domingo } : { abre: false };
  if (diaSemana === 6) return horarios.sabado ? { abre: true, ...horarios.sabado } : { abre: false };
  return horarios.segunda_sexta ? { abre: true, ...horarios.segunda_sexta } : { abre: false };
}

function filtrarPorFuncionamento(horarios, funcionamento) {
  if (!funcionamento.abre) return [];
  const inicioMin = toMinutes(funcionamento.inicio);
  const fimMin = toMinutes(funcionamento.fim);
  return horarios.filter(h => {
    const min = toMinutes(h);
    return min >= inicioMin && min <= fimMin;
  });
}

function toMinutes(h) {
  const [hr, min] = h.split(':').map(Number);
  return hr * 60 + min;
}

function gerarSalasTeoricos(salas, data, tenantConfig) {
  const funcionamento = getHorariosFuncionamento(tenantConfig.horarios, data.getDay());
  if (!funcionamento.abre) return {};

  const resultado = {};
  const horarios = gerarHorariosTeoricos(funcionamento, tenantConfig.duracaoAvaliacao);

  for (const sala of salas) {
    resultado[sala.id] = {
      nome: sala.nome,
      profissional: sala.profissional,
      horarios,
      teorico: true
    };
  }

  return resultado;
}

function gerarHorariosTeoricos(funcionamento, duracao) {
  const result = [];
  let min = toMinutes(funcionamento.inicio);
  const fim = toMinutes(funcionamento.fim);

  while (min + duracao <= fim) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    result.push(`${h}:${String(m).padStart(2, '0')}`);
    min += duracao;
  }

  return result;
}

module.exports = { startScheduler, getScraperHealth, runScraper, enqueueScraper };