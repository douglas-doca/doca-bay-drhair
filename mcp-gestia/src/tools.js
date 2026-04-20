/**
 * MCP GestIA — Tool Definitions
 * Cada tool recebe unitId do config do tenant
 */

const tools = [
  // ══════════════════════════════════════
  //  AGENDA
  // ══════════════════════════════════════
  {
    name: "gestia_combos_cadastro",
    description:
      "Retorna TUDO que precisa pra agendar: profissionais com grade ativa, salas, procedimentos, situações e cores. Chamar no início da conversa pra saber o que oferecer ao lead. Requer idDaUnidade.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade no Gest" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch(`/agenda/combosparacadastro?idDaUnidade=${unitId}`, { unitId });
    },
  },
  {
    name: "gestia_consultar_agenda",
    description:
      "Consulta horários já agendados num período. Útil pra ver disponibilidade. Retorna lista de agendamentos com profissional, sala, cliente, situação.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        dataInicio: { type: "string", description: "Data início YYYY-MM-DD" },
        dataFim: { type: "string", description: "Data fim YYYY-MM-DD" },
      },
      required: ["unitId", "dataInicio", "dataFim"],
    },
    handler: async (client, { unitId, dataInicio, dataFim }) => {
      return client.fetch(
        `/agenda/consultarhorariosagendados?dataInicio=${dataInicio}&dataFim=${dataFim}`,
        { unitId }
      );
    },
  },
  {
    name: "gestia_agendar",
    description:
      "Cria um agendamento no Gest. Usa idDoCliente (existente) OU idDoProspect (lead novo). A API valida grade do profissional e conflitos — se der erro, retorna mensagem clara pra oferecer outro horário.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        data: { type: "string", description: "Data YYYY-MM-DD" },
        horaInicial: { type: "string", description: "Hora início HH:MM" },
        horaFinal: { type: "string", description: "Hora fim HH:MM" },
        idDoProfissional: { type: "number", description: "ID do profissional" },
        idDoCliente: { type: "number", description: "ID do cliente (se já existir)" },
        idDoProspect: { type: "number", description: "ID do prospect (lead novo)" },
        idDoProcedimento: { type: "number", description: "ID do procedimento" },
        idDaSala: { type: "number", description: "ID da sala (opcional)" },
        observacao: { type: "string", description: "Observação (origem do lead, contexto da conversa)" },
      },
      required: ["unitId", "data", "horaInicial", "horaFinal", "idDoProfissional", "idDoProcedimento"],
    },
    handler: async (client, { unitId, data, horaInicial, horaFinal, idDoProfissional, idDoCliente, idDoProspect, idDoProcedimento, idDaSala, observacao }) => {
      if (!idDoCliente && !idDoProspect) {
        return { ok: false, error: "Informe idDoCliente ou idDoProspect" };
      }
      const body = {
        idDaUnidade: unitId,
        data: `${data}T00:00:00`,
        horaInicial,
        horaFinal,
        idDoProfissional,
        idDoProcedimento,
      };
      if (idDoCliente) body.idDoCliente = idDoCliente;
      if (idDoProspect) body.idDoProspect = idDoProspect;
      if (idDaSala) body.idDaSala = idDaSala;
      if (observacao) body.observacao = observacao;
      return client.fetch("/agenda/inserir", { method: "POST", body, unitId });
    },
  },
  {
    name: "gestia_alterar_situacao_agenda",
    description:
      "Altera situação de um agendamento (ex: Marcado→Confirmado, Marcado→Desmarcado). Situações: 1=Marcado, 2=Confirmado, 3=Aguardando, 4=Em atendimento, 5=Atendido.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idAgendamento: { type: "number", description: "ID do agendamento" },
        idSituacao: { type: "number", description: "ID da nova situação" },
      },
      required: ["unitId", "idAgendamento", "idSituacao"],
    },
    handler: async (client, { unitId, idAgendamento, idSituacao }) => {
      return client.fetch("/agenda/alterarsituacao", {
        method: "PUT",
        body: { id: idAgendamento, situacao: { id: idSituacao } },
        unitId,
      });
    },
  },
  {
    name: "gestia_excluir_agendamento",
    description: "Exclui um agendamento pelo ID.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idAgendamento: { type: "number", description: "ID do agendamento" },
      },
      required: ["unitId", "idAgendamento"],
    },
    handler: async (client, { unitId, idAgendamento }) => {
      return client.fetch(`/agenda/${idAgendamento}`, { method: "DELETE", unitId });
    },
  },
  {
    name: "gestia_agenda_por_cliente",
    description: "Consulta agendamentos de um cliente específico.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idDoCliente: { type: "number", description: "ID do cliente" },
      },
      required: ["unitId", "idDoCliente"],
    },
    handler: async (client, { unitId, idDoCliente }) => {
      return client.fetch(`/agenda/horariosagendadosporcliente?idDoCliente=${idDoCliente}`, { unitId });
    },
  },
  {
    name: "gestia_agenda_por_prospect",
    description: "Consulta agendamentos de um prospect (lead).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idDoProspect: { type: "number", description: "ID do prospect" },
      },
      required: ["unitId", "idDoProspect"],
    },
    handler: async (client, { unitId, idDoProspect }) => {
      return client.fetch(`/agenda/horariosagendadosporprospect?idDoProspect=${idDoProspect}`, { unitId });
    },
  },
  {
    name: "gestia_horarios_funcionamento",
    description: "Retorna horários de funcionamento da unidade (dias da semana, hora abertura/fechamento).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch("/agenda/unidade", { unitId });
    },
  },

  // ══════════════════════════════════════
  //  PROSPECT (LEAD NOVO)
  // ══════════════════════════════════════
  {
    name: "gestia_criar_prospect",
    description:
      "Cria um lead novo (prospect) no Gest. Retorna o ID do prospect criado. Telefone deve ser objeto com ddd (number) e numero (string sem DDD).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        nomeCompleto: { type: "string", description: "Nome completo do lead" },
        ddd: { type: "number", description: "DDD do celular (ex: 31)" },
        numero: { type: "string", description: "Número sem DDD (ex: 999990000)" },
        email: { type: "string", description: "Email (opcional)" },
      },
      required: ["unitId", "nomeCompleto", "ddd", "numero"],
    },
    handler: async (client, { unitId, nomeCompleto, ddd, numero, email }) => {
      const body = {
        nomeCompleto,
        celular: { ddd, numero, pais: "+55" },
      };
      if (email) body.email = email;
      return client.fetch("/prospect", { method: "POST", body, unitId });
    },
  },
  {
    name: "gestia_listar_prospects",
    description: "Lista prospects (leads) da unidade.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        pageSize: { type: "number", description: "Quantidade (default 10)" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId, pageSize = 10 }) => {
      return client.fetch(`/prospect?pageSize=${pageSize}`, { unitId });
    },
  },

  // ══════════════════════════════════════
  //  CLIENTE
  // ══════════════════════════════════════
  {
    name: "gestia_buscar_clientes",
    description: "Busca clientes da unidade. Útil pra verificar se lead já é paciente antes de criar prospect.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        pageSize: { type: "number", description: "Quantidade (default 10)" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId, pageSize = 10 }) => {
      return client.fetch(`/cliente?pageSize=${pageSize}`, { unitId });
    },
  },
  {
    name: "gestia_buscar_cliente_fast",
    description: "Busca rápida de clientes (endpoint otimizado).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch("/cliente/fast", { unitId });
    },
  },

  // ══════════════════════════════════════
  //  PROFISSIONAIS / SALAS / PROCEDIMENTOS
  // ══════════════════════════════════════
  {
    name: "gestia_listar_profissionais",
    description: "Lista profissionais da unidade.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch("/profissional", { unitId });
    },
  },
  {
    name: "gestia_listar_salas",
    description: "Lista salas da unidade.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch("/sala", { unitId });
    },
  },
  {
    name: "gestia_listar_procedimentos",
    description: "Lista procedimentos disponíveis.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        pageSize: { type: "number", description: "Quantidade (default 20)" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId, pageSize = 20 }) => {
      return client.fetch(`/procedimento?pageSize=${pageSize}`, { unitId });
    },
  },

  // ══════════════════════════════════════
  //  ATENDIMENTO
  // ══════════════════════════════════════
  {
    name: "gestia_atendimentos_em_andamento",
    description: "Lista atendimentos em andamento na unidade. Retorna cliente, profissional, valor, comanda.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch("/atendimento/emandamento", { unitId });
    },
  },
  {
    name: "gestia_listar_atendimentos",
    description: "Lista atendimentos da unidade com paginação.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        pageSize: { type: "number", description: "Quantidade (default 10)" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId, pageSize = 10 }) => {
      return client.fetch(`/atendimento?pageSize=${pageSize}`, { unitId });
    },
  },
  {
    name: "gestia_historico_atendimento",
    description: "Histórico de um atendimento específico (log de ações).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idAtendimento: { type: "number", description: "ID do atendimento" },
      },
      required: ["unitId", "idAtendimento"],
    },
    handler: async (client, { unitId, idAtendimento }) => {
      return client.fetch(`/atendimento/${idAtendimento}/historico`, { unitId });
    },
  },
  {
    name: "gestia_imagens_atendimento",
    description: "Retorna metadados das imagens de tricoscopia de um atendimento (ID, nome, tipo, descrição, data).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idAtendimento: { type: "number", description: "ID do atendimento" },
      },
      required: ["unitId", "idAtendimento"],
    },
    handler: async (client, { unitId, idAtendimento }) => {
      return client.fetch(`/atendimento/${idAtendimento}/imagens`, { unitId });
    },
  },

  // ══════════════════════════════════════
  //  COMANDA
  // ══════════════════════════════════════
  {
    name: "gestia_procedimentos_comanda",
    description: "Lista procedimentos de uma comanda (tratamento do paciente).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idComanda: { type: "number", description: "ID da comanda" },
      },
      required: ["unitId", "idComanda"],
    },
    handler: async (client, { unitId, idComanda }) => {
      return client.fetch(`/comanda/${idComanda}/procedimentos`, { unitId });
    },
  },
  {
    name: "gestia_historico_comanda",
    description: "Histórico de uma comanda (log de ações).",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idComanda: { type: "number", description: "ID da comanda" },
      },
      required: ["unitId", "idComanda"],
    },
    handler: async (client, { unitId, idComanda }) => {
      return client.fetch(`/comanda/${idComanda}/historico`, { unitId });
    },
  },
  {
    name: "gestia_parcelas_comanda",
    description: "Lista parcelas de pagamento de uma comanda.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID da unidade" },
        idComanda: { type: "number", description: "ID da comanda" },
      },
      required: ["unitId", "idComanda"],
    },
    handler: async (client, { unitId, idComanda }) => {
      return client.fetch(`/comanda/${idComanda}/parcelas`, { unitId });
    },
  },

  // ══════════════════════════════════════
  //  UNIDADES
  // ══════════════════════════════════════
  {
    name: "gestia_listar_unidades",
    description: "Lista todas as unidades da rede Dr. Hair com endereço, CNPJ, horários de funcionamento.",
    inputSchema: {
      type: "object",
      properties: {
        unitId: { type: "number", description: "ID de qualquer unidade (pra auth)" },
      },
      required: ["unitId"],
    },
    handler: async (client, { unitId }) => {
      return client.fetch("/unidade", { unitId });
    },
  },
];

module.exports = { tools };
