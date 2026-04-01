const fs = require('fs').promises;
const path = require('path');

class CacheService {
  constructor() {
    // tenant -> { lastUpdate, D0, D1, D2, D3 }
    this.caches = {};
    this.dataDir = path.join(__dirname, '../../data');
  }

  // =========================================================================
  // Inicialização
  // =========================================================================

  async initialize(tenantId) {
    const tenantDir = path.join(this.dataDir, tenantId);
    await fs.mkdir(tenantDir, { recursive: true });

    try {
      const raw = await fs.readFile(this._cachePath(tenantId), 'utf8');
      const cached = JSON.parse(raw);
      const age = (Date.now() - new Date(cached.lastUpdate).getTime()) / 60000;

      if (age < 60) {
        this.caches[tenantId] = cached;
        console.log(`📝 [Cache:${tenantId}] Carregado (${Math.round(age)} min atrás)`);
        return;
      }
    } catch {
      // sem cache ou expirado
    }

    this.caches[tenantId] = { lastUpdate: null, D0: {}, D1: {}, D2: {}, D3: {} };
    console.log(`📝 [Cache:${tenantId}] Inicializado vazio`);
  }

  // =========================================================================
  // Salvar cache do scraper
  // =========================================================================

  async saveScraperResult(tenantId, tenantConfig, resultados) {
    if (!this.caches[tenantId]) {
      this.caches[tenantId] = { lastUpdate: null, D0: {}, D1: {}, D2: {}, D3: {} };
    }

    for (const { key, data, diaSemana, salas } of resultados) {
      this.caches[tenantId][key] = {
        data,
        diaSemana,
        salas,
        consultadoEm: new Date().toISOString()
      };
    }

    this.caches[tenantId].lastUpdate = new Date().toISOString();
    await this._persist(tenantId);
  }

  // =========================================================================
  // Consultar horários (API pública)
  // =========================================================================

  getHorarios(tenantId, data) {
    const cache = this.caches[tenantId];
    if (!cache) return { horarios: [], salas: {} };

    for (const key of ['D0', 'D1', 'D2', 'D3']) {
      const entry = cache[key];
      if (entry && entry.data === data && entry.salas) {
        const horariosMesclados = this._mesclarHorarios(entry.salas);
        return {
          horarios: horariosMesclados,
          salas: entry.salas,
          diaSemana: entry.diaSemana,
          consultadoEm: entry.consultadoEm
        };
      }
    }

    return { horarios: [], salas: {} };
  }

  // =========================================================================
  // Encontrar qual sala tem um horário específico
  // =========================================================================

  encontrarSala(tenantId, data, horario) {
    const cache = this.caches[tenantId];
    if (!cache) return null;

    for (const key of ['D0', 'D1', 'D2', 'D3']) {
      const entry = cache[key];
      if (entry && entry.data === data && entry.salas) {
        for (const [salaId, salaInfo] of Object.entries(entry.salas)) {
          if (salaInfo.horarios && salaInfo.horarios.includes(horario)) {
            return { salaId, nome: salaInfo.nome, profissional: salaInfo.profissional };
          }
        }
      }
    }

    return null;
  }

  // =========================================================================
  // Remover horário do cache (quando reservado)
  // =========================================================================

  removerHorario(tenantId, data, horario) {
    const cache = this.caches[tenantId];
    if (!cache) return;

    for (const key of ['D0', 'D1', 'D2', 'D3']) {
      const entry = cache[key];
      if (entry && entry.data === data && entry.salas) {
        for (const [salaId, salaInfo] of Object.entries(entry.salas)) {
          if (salaInfo.horarios) {
            const idx = salaInfo.horarios.indexOf(horario);
            if (idx !== -1) {
              salaInfo.horarios.splice(idx, 1);
              console.log(`🔒 [Cache:${tenantId}] Removido ${horario} de ${salaInfo.nome} em ${data}`);
              this._persist(tenantId).catch(() => {});
              return;
            }
          }
        }
      }
    }
  }

  // =========================================================================
  // Status
  // =========================================================================

  getStatus(tenantId) {
    const cache = this.caches[tenantId];
    if (!cache || !cache.lastUpdate) {
      return { status: 'sem-cache', tenantId };
    }

    const age = (Date.now() - new Date(cache.lastUpdate).getTime()) / 60000;
    const resumo = {};

    for (const key of ['D0', 'D1', 'D2', 'D3']) {
      const entry = cache[key];
      if (entry && entry.data) {
        const total = this._mesclarHorarios(entry.salas || {}).length;
        resumo[key] = `${entry.data} (${entry.diaSemana}): ${total} horários`;
      }
    }

    return {
      status: age < 60 ? 'atualizado' : 'expirado',
      tenantId,
      ultimaAtualizacao: cache.lastUpdate,
      idadeMinutos: Math.round(age),
      horarios: resumo
    };
  }

  getAllStatus() {
    const result = {};
    for (const tenantId of Object.keys(this.caches)) {
      result[tenantId] = this.getStatus(tenantId);
    }
    return result;
  }

  // =========================================================================
  // Internos
  // =========================================================================

  _cachePath(tenantId) {
    return path.join(this.dataDir, tenantId, 'cache.json');
  }

  async _persist(tenantId) {
    try {
      const dir = path.join(this.dataDir, tenantId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this._cachePath(tenantId), JSON.stringify(this.caches[tenantId], null, 2));
    } catch (err) {
      console.error(`❌ [Cache:${tenantId}] Erro ao salvar: ${err.message}`);
    }
  }

  _mesclarHorarios(salas) {
    const todos = [];
    for (const salaInfo of Object.values(salas)) {
      if (salaInfo.horarios && Array.isArray(salaInfo.horarios)) {
        todos.push(...salaInfo.horarios);
      }
    }

    const unicos = [...new Set(todos)];
    unicos.sort((a, b) => {
      const [hrA, minA] = a.split(':').map(Number);
      const [hrB, minB] = b.split(':').map(Number);
      return (hrA * 60 + minA) - (hrB * 60 + minB);
    });

    return unicos;
  }
}

module.exports = new CacheService();
