const fs = require('fs').promises;
const path = require('path');

class ReservaManager {
  constructor() {
    this.reservasPath = path.join(__dirname, '../../app/data/reservas-pendentes.json');
    this.confirmadosPath = path.join(__dirname, '../../app/data/agendamentos-confirmados.json');
  }

  async initialize() {
    try {
      await fs.access(this.reservasPath);
    } catch {
      await fs.writeFile(this.reservasPath, JSON.stringify([], null, 2));
    }

    try {
      await fs.access(this.confirmadosPath);
    } catch {
      await fs.writeFile(this.confirmadosPath, JSON.stringify([], null, 2));
    }
  }

  async criarReserva(dados) {
    const reservas = await this.listarReservas();
    
    const novaReserva = {
      id: Date.now().toString(),
      franquiaId: dados.franquiaId,
      telefone: dados.telefone,
      nome: dados.nome,
      data: dados.data,
      horario: dados.horario,
      genero: dados.genero || null,
      criadoEm: new Date().toISOString(),
      status: 'pendente'
    };

    reservas.push(novaReserva);
    await fs.writeFile(this.reservasPath, JSON.stringify(reservas, null, 2));
    
    console.log(`✅ Reserva criada: ${dados.nome} - ${dados.data} ${dados.horario}`);
    return novaReserva;
  }

  async listarReservas(franquiaId = null) {
    const content = await fs.readFile(this.reservasPath, 'utf-8');
    const reservas = JSON.parse(content);
    
    if (franquiaId) {
      return reservas.filter(r => r.franquiaId === franquiaId && r.status === 'pendente');
    }
    
    return reservas.filter(r => r.status === 'pendente');
  }

  async getReserva(id) {
    const reservas = await this.listarReservas();
    return reservas.find(r => r.id === id);
  }

  async confirmarReserva(id) {
    const reservas = await this.listarReservas();
    const index = reservas.findIndex(r => r.id === id);
    
    if (index === -1) {
      throw new Error('Reserva não encontrada');
    }

    const reserva = reservas[index];
    reserva.status = 'confirmado';
    reserva.confirmadoEm = new Date().toISOString();

    // Salvar nos confirmados
    const confirmados = JSON.parse(await fs.readFile(this.confirmadosPath, 'utf-8'));
    confirmados.push(reserva);
    await fs.writeFile(this.confirmadosPath, JSON.stringify(confirmados, null, 2));

    // Remover das pendentes
    reservas.splice(index, 1);
    await fs.writeFile(this.reservasPath, JSON.stringify(reservas, null, 2));

    console.log(`✅ Reserva confirmada: ${reserva.nome} - ${reserva.data} ${reserva.horario}`);
    return reserva;
  }

  async cancelarReserva(id) {
    const reservas = await this.listarReservas();
    const index = reservas.findIndex(r => r.id === id);
    
    if (index === -1) {
      throw new Error('Reserva não encontrada');
    }

    const reserva = reservas[index];
    reservas.splice(index, 1);
    await fs.writeFile(this.reservasPath, JSON.stringify(reservas, null, 2));

    console.log(`❌ Reserva cancelada: ${reserva.nome} - ${reserva.data} ${reserva.horario}`);
    return reserva;
  }

  async horarioEstaBloqueado(franquiaId, data, horario) {
    const reservas = await this.listarReservas(franquiaId);
    return reservas.some(r => r.data === data && r.horario === horario);
  }

  async filtrarHorariosDisponiveis(franquiaId, data, horarios) {
    const reservas = await this.listarReservas(franquiaId);
    const bloqueados = reservas
      .filter(r => r.data === data)
      .map(r => r.horario);

    return horarios.filter(h => !bloqueados.includes(h));
  }
}

module.exports = new ReservaManager();
