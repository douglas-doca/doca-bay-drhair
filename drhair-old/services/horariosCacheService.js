const fs = require('fs').promises;
const path = require('path');

class HorariosCacheService {
    constructor() {
        this.cacheFile = path.join(__dirname, '../../data/cache/horarios_disponiveis.json');
        this.updateInterval = 30 * 60 * 1000; // 30 minutos
        this.intervalId = null;
        this.cache = {
            lastUpdate: null,
            D0: {},
            D1: {},
            D2: {},
            D3: {}
        };
        this.isUpdating = false;
        this.configCRM = null;
        this.salas = [];
    }

    async start(franquiaConfig) {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 [Cache] Iniciando serviço MULTI-SALA...');
        console.log('='.repeat(60) + '\n');
        
        if (!franquiaConfig || !franquiaConfig.crm) {
            throw new Error('Config da franquia inválido');
        }
        
        this.configCRM = franquiaConfig.crm;
        this.salas = this.configCRM.salas || [];
        
        if (this.salas.length === 0) {
            throw new Error('Nenhuma sala configurada');
        }
        
        console.log(`📋 [Cache] Salas configuradas: ${this.salas.length}`);
        this.salas.forEach(sala => {
            console.log(`   ${sala.id}: ${sala.nome} (${sala.profissional}) ${sala.ativo ? '✅' : '⏸️'}`);
        });
        console.log('');
        
        await this.loadCache();
        await this.updateCache();
        
        this.intervalId = setInterval(() => {
            this.updateCache();
        }, this.updateInterval);
        
        console.log('✅ [Cache] Serviço multi-sala iniciado!\n');
        return true;
    }

    async loadCache() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const cached = JSON.parse(data);
            
            const lastUpdate = new Date(cached.lastUpdate);
            const now = new Date();
            const diffMinutes = (now - lastUpdate) / 1000 / 60;
            
            if (diffMinutes < 30) {
                this.cache = cached;
                console.log(`📝 [Cache] Carregado (${Math.round(diffMinutes)} min atrás)`);
            }
        } catch (error) {
            console.log('📝 [Cache] Sem cache existente');
        }
    }

    async updateCache() {
        if (this.isUpdating) {
            console.log('⏳ [Cache] Atualização em andamento...');
            return;
        }
        
        this.isUpdating = true;
        console.log('\n' + '='.repeat(60));
        console.log('🔄 [Cache] Atualizando horários MULTI-SALA...');
        console.log('='.repeat(60) + '\n');
        
        const UnObjectScraper = require('./unobject-scraper');
        let scraper = null;
        
        try {
            // Criar scraper
            scraper = new UnObjectScraper(this.configCRM);
            
            console.log('🌐 [Cache] Inicializando navegador...');
            await scraper.init();
            console.log('✅ [Cache] Navegador pronto!\n');
            
            const agora = new Date();
            const hoje = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            const horaAtual = hoje.getHours();
            const minutosAtuais = hoje.getMinutes();
            
            console.log(`🕐 [Cache] Hora atual Brasil: ${String(horaAtual).padStart(2, '0')}:${String(minutosAtuais).padStart(2, '0')}\n`);
            
            const incluirHoje = horaAtual < 17 || (horaAtual === 17 && minutosAtuais < 30);
            
            const datasParaConsultar = [];
            
            if (incluirHoje) {
                datasParaConsultar.push({ key: 'D0', offset: 0, label: 'HOJE' });
            }
            
            datasParaConsultar.push(
                { key: 'D1', offset: 1, label: 'D+1' },
                { key: 'D2', offset: 2, label: 'D+2' },
                { key: 'D3', offset: 3, label: 'D+3' }
            );
            
            // Consultar cada data para TODAS as salas
            for (const consulta of datasParaConsultar) {
                const data = new Date(hoje);
                data.setDate(data.getDate() + consulta.offset);
                
                const diaSemana = this.getDiaSemana(data);
                const dataFormatada = this.formatarData(data);
                
                console.log(`\n📅 [Cache] Consultando ${consulta.label} (${dataFormatada} - ${diaSemana})...\n`);
                
                try {
                    // 🔥 CONSULTA MULTI-SALA!
                    const resultadoSalas = await scraper.consultarHorariosMultiSala(dataFormatada, this.salas);
                    
                    // Estrutura: { sala01: { nome, horarios }, sala02: { nome, horarios } }
                    
                    // Aplicar filtros de regras
                    for (const [salaId, salaInfo] of Object.entries(resultadoSalas)) {
                        if (salaInfo.horarios) {
                            let horariosFiltrados = this.filtrarHorariosPorRegras(salaInfo.horarios, data);
                            
                            // Se for hoje, filtrar futuros
                            if (consulta.offset === 0) {
                                const agoraMins = horaAtual * 60 + minutosAtuais + 30;
                                horariosFiltrados = horariosFiltrados.filter(h => {
                                    const [hr, min] = h.split(':').map(Number);
                                    return (hr * 60 + min) > agoraMins;
                                });
                            }
                            
                            salaInfo.horarios = horariosFiltrados;
                        }
                    }
                    
                    // Salvar estrutura completa
                    this.cache[consulta.key] = {
                        data: dataFormatada,
                        diaSemana: diaSemana,
                        salas: resultadoSalas,
                        consultadoEm: new Date().toISOString()
                    };
                    
                    // Log de resumo
                    let totalHorarios = 0;
                    for (const [salaId, salaInfo] of Object.entries(resultadoSalas)) {
                        const count = salaInfo.horarios ? salaInfo.horarios.length : 0;
                        totalHorarios += count;
                        console.log(`   ${salaInfo.nome}: ${count} horários`);
                    }
                    
                    console.log(`\n✅ [Cache] ${consulta.label}: ${totalHorarios} horários no total\n`);
                    
                } catch (error) {
                    console.log(`⚠️ [Cache] Erro ${consulta.label}: ${error.message}`);
                    
                    // Fallback teórico
                    this.cache[consulta.key] = {
                        data: dataFormatada,
                        diaSemana: diaSemana,
                        salas: this.gerarSalasTeoricos(data),
                        teorico: true
                    };
                }
                
                // Delay entre consultas
                if (consulta !== datasParaConsultar[datasParaConsultar.length - 1]) {
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
            
            this.cache.lastUpdate = new Date().toISOString();
            await this.saveCache();
            
            console.log('='.repeat(60));
            console.log('✅ [Cache] Atualização multi-sala concluída!');
            console.log('='.repeat(60) + '\n');
            
        } catch (error) {
            console.error('\n❌ [Cache] Erro:', error.message);
            this.gerarTodosTeoricos();
            
        } finally {
            if (scraper) {
                try {
                    await scraper.close();
                    console.log('🔒 [Cache] Navegador fechado\n');
                } catch (e) {}
            }
            
            this.isUpdating = false;
        }
    }

    async saveCache() {
        try {
            const dir = path.dirname(this.cacheFile);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
            console.log('💾 [Cache] Salvo em arquivo');
        } catch (error) {
            console.error('❌ [Cache] Erro ao salvar:', error.message);
        }
    }

    /**
     * 🔥 API MESCLADA - Retorna todos os horários juntos
     * Mas mantém rastreio interno de qual sala tem cada horário
     */
    async consultarHorarios(data) {
        for (const key of ['D0', 'D1', 'D2', 'D3']) {
            if (this.cache[key] && this.cache[key].data === data) {
                const horariosMesclados = this.mesclarHorarios(this.cache[key].salas);
                
                console.log(`📋 [Cache] ${horariosMesclados.length} horários para ${data} (${Object.keys(this.cache[key].salas).length} salas)`);
                
                return horariosMesclados;
            }
        }
        
        console.log('⚠️ [Cache] Data não encontrada');
        return [];
    }

    /**
     * 🔥 MESCLAR HORÁRIOS - Junta todas as salas em array único ORDENADO
     */
    mesclarHorarios(salas) {
        const todosHorarios = [];
        
        for (const [salaId, salaInfo] of Object.entries(salas)) {
            if (salaInfo.horarios && Array.isArray(salaInfo.horarios)) {
                todosHorarios.push(...salaInfo.horarios);
            }
        }
        
        // Remover duplicados e ordenar
        const unicos = [...new Set(todosHorarios)];
        
        unicos.sort((a, b) => {
            const [hrA, minA] = a.split(':').map(Number);
            const [hrB, minB] = b.split(':').map(Number);
            return (hrA * 60 + minA) - (hrB * 60 + minB);
        });
        
        return unicos;
    }

    /**
     * 🔥 ENCONTRAR SALA - Identifica qual sala tem aquele horário
     * @param {string} data - Data no formato DD/MM/YYYY
     * @param {string} horario - Horário no formato HH:MM
     * @returns {Object} - { salaId, nome, profissional } ou null
     */
    encontrarSalaPorHorario(data, horario) {
        for (const key of ['D0', 'D1', 'D2', 'D3']) {
            if (this.cache[key] && this.cache[key].data === data) {
                const salas = this.cache[key].salas;
                
                for (const [salaId, salaInfo] of Object.entries(salas)) {
                    if (salaInfo.horarios && salaInfo.horarios.includes(horario)) {
                        return {
                            salaId: salaId,
                            nome: salaInfo.nome,
                            profissional: salaInfo.profissional
                        };
                    }
                }
            }
        }
        
        return null;
    }

    filtrarHorariosPorRegras(horarios, data) {
        const diaSemana = data.getDay();
        const regras = this.getHorariosFuncionamento(diaSemana);
        
        if (!regras.abre) {
            return [];
        }
        
        const inicioMins = this.horarioParaMinutos(regras.inicio);
        const fimMins = this.horarioParaMinutos(regras.fim);
        
        return horarios.filter(horario => {
            const horarioMins = this.horarioParaMinutos(horario);
            return horarioMins >= inicioMins && horarioMins <= fimMins;
        });
    }

    getHorariosFuncionamento(diaSemana) {
        if (diaSemana === 0) {
            return { abre: false };
        }
        
        if (diaSemana === 6) {
            return { 
                abre: true,
                inicio: '09:00',
                fim: '12:00'
            };
        }
        
        return {
            abre: true,
            inicio: '10:00',
            fim: '19:30'
        };
    }

    horarioParaMinutos(horario) {
        const [hr, min] = horario.split(':').map(Number);
        return hr * 60 + min;
    }

    gerarSalasTeoricos(data) {
        const resultado = {};
        
        this.salas.forEach(sala => {
            resultado[sala.id] = {
                nome: sala.nome,
                profissional: sala.profissional,
                horarios: this.gerarHorariosTeoricos(data)
            };
        });
        
        return resultado;
    }

    gerarHorariosTeoricos(data) {
        const diaSemana = data.getDay();
        
        if (diaSemana === 0) return [];
        
        if (diaSemana === 6) {
            return ['09:00', '09:40', '10:20', '11:00'];
        }
        
        return [
            '10:00', '10:40', '11:20',
            '15:00', '15:40', '16:20',
            '17:00', '17:40', '18:20',
            '19:00'
        ];
    }

    gerarTodosTeoricos() {
        console.log('⚠️ [Cache] Gerando horários teóricos multi-sala...');
        
        const hoje = new Date();
        const horaAtual = hoje.getHours();
        
        const datas = [];
        if (horaAtual < 17) {
            datas.push({ key: 'D0', offset: 0 });
        }
        datas.push(
            { key: 'D1', offset: 1 },
            { key: 'D2', offset: 2 },
            { key: 'D3', offset: 3 }
        );
        
        datas.forEach(({ key, offset }) => {
            const data = new Date();
            data.setDate(data.getDate() + offset);
            
            this.cache[key] = {
                data: this.formatarData(data),
                diaSemana: this.getDiaSemana(data),
                salas: this.gerarSalasTeoricos(data),
                teorico: true
            };
        });
        
        this.cache.lastUpdate = new Date().toISOString();
        this.saveCache();
    }

    formatarData(date) {
        const dia = String(date.getDate()).padStart(2, '0');
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const ano = date.getFullYear();
        return `${dia}/${mes}/${ano}`;
    }

    getDiaSemana(date) {
        const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
        return dias[date.getDay()];
    }

    getStatus() {
        if (!this.cache.lastUpdate) {
            return { status: 'inativo' };
        }
        
        const status = {
            status: 'ativo',
            ultimaAtualizacao: this.cache.lastUpdate,
            salas: this.salas.map(s => `${s.id}: ${s.nome}`),
            horariosDisponiveis: {}
        };
        
        ['D0', 'D1', 'D2', 'D3'].forEach(key => {
            if (this.cache[key] && this.cache[key].data) {
                const horariosMesclados = this.mesclarHorarios(this.cache[key].salas || {});
                
                status.horariosDisponiveis[key] = `${this.cache[key].data} (${this.cache[key].diaSemana}): ${horariosMesclados.length} horários`;
                
                // Detalhe por sala
                if (this.cache[key].salas) {
                    for (const [salaId, salaInfo] of Object.entries(this.cache[key].salas)) {
                        const count = salaInfo.horarios ? salaInfo.horarios.length : 0;
                        status.horariosDisponiveis[`${key}_${salaId}`] = `   ${salaInfo.nome}: ${count}`;
                    }
                }
            }
        });
        
        return status;
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('🛑 [Cache] Serviço parado');
        }
    }
}

module.exports = new HorariosCacheService();