/**
 * Dr. Hair Scheduler API - MULTI-SALA
 * ✅ Suporte a múltiplas salas (Deborah + Vanessa)
 * ✅ Endpoint /api/horarios?data=DD/MM/YYYY&modo=multi
 * ✅ Retorna horários por sala para o cache funcionar
 */

const express = require('express');
const cors = require('cors');
const UnObjectScraper = require('./services/unobject-scraper.js');
const reservaManager = require('./services/reservaManager.js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ============================================================================
// 🔥 CONFIGURAÇÃO MULTI-SALA
// ============================================================================
const CONFIG = {
  url: 'https://app.unobject.com.br/login',
  username: 'malyck.ia.drhair.contagem',
  password: 'Malyck123$$',
  sala: '01 - Deborah',  // Default para compatibilidade
  salas: [
    { id: 'sala01', nome: '01 - Deborah', profissional: 'Deborah', ativo: true },
    { id: 'sala02', nome: '02 - Vanessa', profissional: 'Vanessa', ativo: true }
  ],
  headless: true,
  screenshots: true,
  screenshotDir: '/app/screenshots',
  timeout: 90000,
  duracaoAvaliacao: 40
};

// ============================================================================
// 🔥 GET /api/horarios?data=DD/MM/YYYY&modo=multi
// ============================================================================
app.get('/api/horarios', async (req, res) => {
  const { data, modo = 'single' } = req.query;
  
  if (!data) {
    return res.status(400).json({ success: false, error: 'Parâmetro "data" obrigatório' });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📍 Consultando horários: ${data} | Modo: ${modo.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const scraper = new UnObjectScraper(CONFIG);
  
  try {
    console.log('🚀 Iniciando navegador...');
    await scraper.init();
    
    console.log('🔐 Fazendo login...');
    await scraper.login();
    
    console.log('📅 Indo pra agenda...');
    await scraper.irParaAgenda();
    
    // ========================================================================
    // 🔥 MODO MULTI-SALA (NOVO!)
    // ========================================================================
    if (modo === 'multi') {
      const salasAtivas = CONFIG.salas.filter(s => s.ativo);
      console.log(`\n🏥 MODO MULTI-SALA: ${salasAtivas.length} salas`);
      salasAtivas.forEach(s => console.log(`   - ${s.nome} (${s.profissional})`));
      console.log('');
      
      // Usar método multi-sala
      const horariosPorSala = await scraper.consultarHorariosMultiSala(data, salasAtivas);
      
      // Mesclar horários de todas as salas (sem duplicatas)
      const todosHorarios = [];
      const salasComHorarios = {};
      
      for (const [salaId, salaInfo] of Object.entries(horariosPorSala)) {
        salasComHorarios[salaId] = {
          nome: salaInfo.nome,
          profissional: salaInfo.profissional,
          horarios: salaInfo.horarios || []
        };
        
        if (salaInfo.horarios) {
          todosHorarios.push(...salaInfo.horarios);
        }
        
        console.log(`✅ ${salaInfo.nome}: ${(salaInfo.horarios || []).length} horários`);
      }
      
      // Remover duplicatas e ordenar
      const horariosUnicos = [...new Set(todosHorarios)].sort((a, b) => {
        const [hrA, minA] = a.split(':').map(Number);
        const [hrB, minB] = b.split(':').map(Number);
        return (hrA * 60 + minA) - (hrB * 60 + minB);
      });
      
      // Filtrar reservas pendentes
      const disponiveis = await reservaManager.filtrarHorariosDisponiveis('drhair-contagem', data, horariosUnicos);
      
      console.log(`\n✅ TOTAL: ${disponiveis.length} horários disponíveis (de ${Object.keys(salasComHorarios).length} salas)\n`);
      
      res.json({
        success: true,
        data,
        modo: 'multi',
        horarios: disponiveis,
        salas: salasComHorarios,
        total: disponiveis.length
      });
      
    } else {
      // ========================================================================
      // MODO SINGLE (compatibilidade com código antigo)
      // ========================================================================
      console.log('🔍 Consultando horários (modo single)...');
      const horarios = await scraper.consultarHorarios(data);
      
      console.log(`✅ ${horarios.length} horários encontrados:`, horarios);
      
      // Filtrar reservas pendentes
      const disponiveis = await reservaManager.filtrarHorariosDisponiveis('drhair-contagem', data, horarios);
      
      res.json({
        success: true,
        data,
        modo: 'single',
        horarios: disponiveis,
        total: disponiveis.length
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await scraper.close();
    console.log('🔒 Navegador fechado\n');
  }
});

// ============================================================================
// POST /api/agendar
// ============================================================================
app.post('/api/agendar', async (req, res) => {
  const { nome, telefone, data, horario, dataNascimento, salaId } = req.body;
  
  if (!nome || !telefone || !data || !horario) {
    return res.status(400).json({ success: false, error: 'Campos obrigatórios: nome, telefone, data, horario' });
  }

  console.log(`\n📍 Criando reserva: ${nome} - ${data} ${horario}${salaId ? ` (Sala: ${salaId})` : ''}`);
  
  try {
    const reserva = await reservaManager.criarReserva({
      franquiaId: 'drhair-contagem',
      nome,
      telefone,
      data,
      horario,
      dataNascimento: dataNascimento || '01/01/1990',
      salaId: salaId || null
    });
    
    console.log(`✅ Reserva criada: ${reserva.id}`);
    
    res.json({
      success: true,
      reservaId: reserva.id,
      message: `Reservado: ${data} às ${horario}`
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /api/confirmar/:id
// ============================================================================
app.post('/api/confirmar/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`\n📍 Confirmando reserva: ${id}`);
  
  const reserva = await reservaManager.getReserva(id);
  if (!reserva) {
    return res.status(404).json({ success: false, error: 'Reserva não encontrada' });
  }

  const scraper = new UnObjectScraper(CONFIG);
  
  try {
    console.log('🚀 Iniciando navegador...');
    await scraper.init();
    
    console.log('🔐 Fazendo login...');
    await scraper.login();
    
    // Se tiver salaId, usar sala específica
    let resultado;
    if (reserva.salaId) {
      const sala = CONFIG.salas.find(s => s.id === reserva.salaId);
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
    
    // Fallback: método padrão
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
      await reservaManager.confirmarReserva(id);
      console.log(`✅ Confirmado no CRM`);
      res.json({ success: true, message: 'Agendamento confirmado!' });
    } else {
      throw new Error(resultado.error || 'Falha no CRM');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await scraper.close();
    console.log('🔒 Navegador fechado');
  }
});

// ============================================================================
// GET /api/salas - Lista salas configuradas
// ============================================================================
app.get('/api/salas', (req, res) => {
  res.json({
    success: true,
    salas: CONFIG.salas,
    total: CONFIG.salas.length
  });
});

// ============================================================================
// Outros endpoints
// ============================================================================
app.get('/api/reservas', async (req, res) => {
  const reservas = await reservaManager.listarReservas('drhair-contagem');
  res.json({ success: true, reservas });
});

app.delete('/api/cancelar/:id', async (req, res) => {
  try {
    await reservaManager.cancelarReserva(req.params.id);
    res.json({ success: true, message: 'Cancelado' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    salas: CONFIG.salas.filter(s => s.ativo).map(s => s.nome),
    multiSalaAtivo: true
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    salas: CONFIG.salas.filter(s => s.ativo).length
  });
});

// ============================================================================
// Iniciar
// ============================================================================
app.listen(PORT, async () => {
  await reservaManager.initialize();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Dr. Hair Scheduler API - MULTI-SALA`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n🏥 Salas configuradas:`);
  CONFIG.salas.forEach(s => {
    console.log(`   ${s.ativo ? '✅' : '⏸️'} ${s.nome} (${s.profissional})`);
  });
  console.log(`\n📋 Endpoints:`);
  console.log(`  GET  /api/horarios?data=DD/MM/YYYY&modo=multi  🔥 MULTI-SALA!`);
  console.log(`  GET  /api/horarios?data=DD/MM/YYYY             (single, compatível)`);
  console.log(`  GET  /api/salas`);
  console.log(`  POST /api/agendar`);
  console.log(`  POST /api/confirmar/:id`);
  console.log(`  GET  /api/reservas`);
  console.log(`  GET  /api/status`);
  console.log(`${'='.repeat(60)}\n`);
});