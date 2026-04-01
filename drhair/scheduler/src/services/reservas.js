const fs = require('fs').promises;
const path = require('path');

class ReservasService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
  }

  // =========================================================================
  // Inicialização
  // =========================================================================

  async initialize(tenantId) {
    const dir = path.join(this.dataDir, tenantId);
    await fs.mkdir(dir, { recursive: true });

    for (const file of ['reservas.json', 'confirmados.json']) {
      const filePath = path.join(dir, file);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, '[]');
      }
    }
  }

  // =========================================================================
  // CRUD
  // =========================================================================

  async criar(tenantId, dados) {
    const reservas = await this._load(tenantId, 'reservas.json');

    // Checar duplicata (mesmo horário + data)
    const duplicata = reservas.find(r =>
      r.status === 'pendente' && r.data === dados.data && r.horario === dados.horario
    );
    if (duplicata) {
      throw new Error(`Horário ${dados.horario} em ${dados.data} já está reservado`);
    }

    const reserva = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      nome: dados.nome,
      telefone: dados.telefone,
      data: dados.data,
      horario: dados.horario,
      dataNascimento: dados.dataNascimento || null,
      salaId: dados.salaId || null,
      leadId: dados.leadId || null,
      status: 'pendente',
      criadoEm: new Date().toISOString()
    };

    reservas.push(reserva);
    await this._save(tenantId, 'reservas.json', reservas);

    console.log(`✅ [Reserva:${tenantId}] Criada: ${reserva.nome} ${reserva.data} ${reserva.horario} (${reserva.id})`);
    return reserva;
  }

  async listar(tenantId, filtros = {}) {
    const reservas = await this._load(tenantId, 'reservas.json');
    let resultado = reservas.filter(r => r.status === 'pendente');

    if (filtros.data) {
      resultado = resultado.filter(r => r.data === filtros.data);
    }

    return resultado;
  }

  async get(tenantId, id) {
    const reservas = await this._load(tenantId, 'reservas.json');
    return reservas.find(r => r.id === id) || null;
  }

  async confirmar(tenantId, id) {
    const reservas = await this._load(tenantId, 'reservas.json');
    const idx = reservas.findIndex(r => r.id === id);

    if (idx === -1) throw new Error(`Reserva ${id} não encontrada`);

    const reserva = reservas[idx];
    reserva.status = 'confirmado';
    reserva.confirmadoEm = new Date().toISOString();

    // Mover pra confirmados
    const confirmados = await this._load(tenantId, 'confirmados.json');
    confirmados.push(reserva);
    await this._save(tenantId, 'confirmados.json', confirmados);

    // Remover das pendentes
    reservas.splice(idx, 1);
    await this._save(tenantId, 'reservas.json', reservas);

    console.log(`✅ [Reserva:${tenantId}] Confirmada: ${reserva.nome} (${id})`);
    return reserva;
  }

  async cancelar(tenantId, id) {
    const reservas = await this._load(tenantId, 'reservas.json');
    const idx = reservas.findIndex(r => r.id === id);

    if (idx === -1) throw new Error(`Reserva ${id} não encontrada`);

    const reserva = reservas[idx];
    reservas.splice(idx, 1);
    await this._save(tenantId, 'reservas.json', reservas);

    console.log(`❌ [Reserva:${tenantId}] Cancelada: ${reserva.nome} (${id})`);
    return reserva;
  }

  // =========================================================================
  // Filtrar horários disponíveis (remove os já reservados)
  // =========================================================================

  async filtrarDisponiveis(tenantId, data, horarios) {
    const reservas = await this.listar(tenantId, { data });
    const bloqueados = new Set(reservas.map(r => r.horario));
    return horarios.filter(h => !bloqueados.has(h));
  }

  // =========================================================================
  // Limpeza automática — remove reservas pendentes com mais de 24h
  // =========================================================================

  async limparExpiradas(tenantId) {
    const reservas = await this._load(tenantId, 'reservas.json');
    const agora = Date.now();
    const limite = 24 * 60 * 60 * 1000; // 24h

    const validas = [];
    const expiradas = [];

    for (const r of reservas) {
      if (r.status === 'pendente' && (agora - new Date(r.criadoEm).getTime()) > limite) {
        expiradas.push(r);
      } else {
        validas.push(r);
      }
    }

    if (expiradas.length > 0) {
      await this._save(tenantId, 'reservas.json', validas);
      console.log(`🧹 [Reserva:${tenantId}] ${expiradas.length} reservas expiradas removidas`);
    }

    return expiradas;
  }

  // =========================================================================
  // Internos
  // =========================================================================

  _filePath(tenantId, filename) {
    return path.join(this.dataDir, tenantId, filename);
  }

  async _load(tenantId, filename) {
    try {
      const raw = await fs.readFile(this._filePath(tenantId, filename), 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async _save(tenantId, filename, data) {
    const dir = path.join(this.dataDir, tenantId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this._filePath(tenantId, filename), JSON.stringify(data, null, 2));
  }
}

module.exports = new ReservasService();
