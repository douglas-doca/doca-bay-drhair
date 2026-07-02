/**
 * UnObject GraphQL HTTP Client
 * Substitui o Puppeteer scraper por chamadas HTTP diretas
 * 
 * Auth flow:
 *   1. authenticate(login, password) → userToken
 *   2. authenticateByCompany(companyId, userToken) → companyToken
 *   3. All queries use Authorization: Bearer companyToken
 * 
 * Token é cacheado em memória com TTL configurável (default 55min)
 */

const GRAPHQL_URL = 'https://app.unobject.com.br/graphql';

// ─── Queries & Mutations ────────────────────────────────────

const QUERIES = {
  authenticate: `
    mutation authenticate($login: String!, $password: String!) {
      authenticate(login: $login, password: $password) {
        token
      }
    }
  `,

  authenticateByCompany: `
    mutation authenticateByCompany($companyId: Int, $token: String) {
      authenticateByCompany(companyId: $companyId, token: $token) {
        token
      }
    }
  `,

  rooms: `
    query rooms($roomFilter: RoomFilter, $dayOfWeek: String) {
      rooms(filter: $roomFilter) {
        id
        name
        status
        roomTimeSlots(dayOfWeek: $dayOfWeek) {
          startTime
          endTime
        }
      }
    }
  `,

  appointments: `
    query appointments($appointmentFilter: AppointmentFilter) {
      appointments(filter: $appointmentFilter) {
        id
        startDate
        endDate
        rescheduled
        serviceSession
        allRooms
        observation
        employee {
          id
          name
        }
        orderService {
          id
          orderId
          service {
            id
            name
            duration
            recurrence
          }
          quantity
        }
        status {
          id
          name
        }
        customer {
          id
          name
          cellPhone
          birthdate
        }
        room {
          id
          name
          roomEmployees {
            id
            name
          }
        }
      }
    }
  `,

  holidays: `
    query holidays($filter: HolidayFilter) {
      holidays(filter: $filter) {
        id
        date
        description
      }
    }
  `,

  orderServicesAppointment: `
    query orderServicesAppointment($roomId: Int!, $customerId: Int, $orderId: Int) {
      orderServicesAppointment(
        roomId: $roomId
        customerId: $customerId
        orderId: $orderId
      ) {
        id
        nextSession
        quantity
        serviceId
        service {
          id
          name
          duration
          recurrence
        }
        orderId
      }
    }
  `,

  // ─── Mutations de agendamento (placeholders — preencher após captura) ───

  searchCustomers: `
    query searchCustomers($search: String) {
      customers(filter: { search: $search }) {
        id
        name
        cellPhone
        email
      }
    }
  `,

  createCustomer: `
    mutation createCustomer($input: CustomerInput!) {
      createCustomer(input: $input) {
        id
        name
        cellPhone
      }
    }
  `,

  createAppointment: `
    mutation createAppointment($input: AppointmentInput!) {
      createAppointment(input: $input) {
        id
        startDate
        endDate
        customer {
          name
        }
        room {
          id
          name
        }
        status {
          name
        }
      }
    }
  `,
};

// ─── Day of week mapping ────────────────────────────────────

const DAY_MAP = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
};

// ─── Client Class ───────────────────────────────────────────

class UnObjectClient {
  constructor(config) {
    this.login = config.login;
    this.password = config.password;
    this.companyId = config.companyId;
    this.roomIds = config.roomIds || [];
    this.tenantName = config.tenantName || 'unknown';

    // Token cache
    this._companyToken = null;
    this._tokenExpiresAt = 0;
    this._tokenTTL = config.tokenTTL || 55 * 60 * 1000; // 55 min default

    // Request stats
    this.stats = {
      requests: 0,
      errors: 0,
      lastSuccess: null,
      lastError: null,
    };
  }

  // ─── GraphQL request helper ─────────────────────────────

  async _gql(operationName, variables, token = null) {
    const query = QUERIES[operationName];
    if (!query) throw new Error(`Unknown operation: ${operationName}`);

    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.stats.requests++;

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ operationName, variables, query }),
    });

    if (!res.ok) {
      this.stats.errors++;
      this.stats.lastError = new Date().toISOString();
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.errors?.length) {
      this.stats.errors++;
      this.stats.lastError = new Date().toISOString();
      const msg = json.errors.map(e => e.message).join('; ');
      throw new Error(`GraphQL error [${operationName}]: ${msg}`);
    }

    this.stats.lastSuccess = new Date().toISOString();
    return json.data;
  }

  // ─── Auth ───────────────────────────────────────────────

  async _authenticate() {
    // Step 1: user token
    const step1 = await this._gql('authenticate', {
      login: this.login,
      password: this.password,
    });
    const userToken = step1.authenticate.token;

    // Step 2: company token
    const step2 = await this._gql('authenticateByCompany', {
      companyId: this.companyId,
      token: userToken,
    });

    this._companyToken = step2.authenticateByCompany.token;
    this._tokenExpiresAt = Date.now() + this._tokenTTL;

    console.log(`🔑 [${this.tenantName}] Auth OK — token válido por ${this._tokenTTL / 60000}min`);
    return this._companyToken;
  }

  async getToken() {
    if (this._companyToken && Date.now() < this._tokenExpiresAt) {
      return this._companyToken;
    }
    return this._authenticate();
  }

  // ─── Queries ────────────────────────────────────────────

  /**
   * Busca salas e seus timeslots para um dia da semana
   * @param {Date} date - Data para buscar
   * @returns {Array} salas com timeSlots
   */
  async getRooms(date) {
    const token = await this.getToken();
    const dayOfWeek = DAY_MAP[date.getDay()];

    const data = await this._gql('rooms', {
      roomFilter: { isRoomEmployee: false, serviceIds: [] },
      dayOfWeek,
    }, token);

    // Filtra só as salas configuradas pro tenant
    const rooms = data.rooms.filter(r =>
      this.roomIds.length === 0 || this.roomIds.includes(r.id)
    );

    return rooms;
  }

  /**
   * Busca agendamentos existentes para uma data
   * @param {string} dateISO - Data em ISO (YYYY-MM-DDTHH:mm:ss.sssZ)
   * @param {number[]} roomIds - IDs das salas (opcional, usa config)
   * @returns {Array} agendamentos
   */
  async getAppointments(dateISO, roomIds) {
    const token = await this.getToken();
    const ids = roomIds || this.roomIds;

    const data = await this._gql('appointments', {
      appointmentFilter: {
        date: dateISO,
        groupAppointments: false,
        viewMode: 'day',
        roomIds: ids,
      },
    }, token);

    return data.appointments || [];
  }

  /**
   * Busca feriados para um ano
   * @param {string} dateISO - Data ISO (usa pra filtrar pelo ano)
   */
  async getHolidays(dateISO) {
    const token = await this.getToken();
    const data = await this._gql('holidays', {
      filter: { date: dateISO },
    }, token);
    return data.holidays || [];
  }

  /**
   * Busca serviços disponíveis para uma sala
   * @param {number} roomId
   * @param {number} customerId (opcional)
   */
  async getOrderServices(roomId, customerId) {
    const token = await this.getToken();
    const variables = { roomId };
    if (customerId) variables.customerId = customerId;
    const data = await this._gql('orderServicesAppointment', variables, token);
    return data.orderServicesAppointment || [];
  }

  /**
   * Calcula horários disponíveis para uma data
   * Combina rooms (slots de funcionamento) com appointments (slots ocupados)
   * 
   * @param {string} dateStr - Data no formato DD/MM/YYYY
   * @param {number} duracao - Duração do agendamento em minutos
   * @returns {Object} { date, rooms: [{ id, name, available: [...], booked: [...] }] }
   */
  async getAvailableSlots(dateStr, duracao = 60) {
    // Parse DD/MM/YYYY
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    const dateISO = date.toISOString();

    // Busca paralela: rooms + appointments
    const [rooms, appointments] = await Promise.all([
      this.getRooms(date),
      this.getAppointments(dateISO),
    ]);

    // Monta mapa de horários por sala
    const result = rooms.map(room => {
      // Gera slots baseado nos timeSlots da sala
      const allSlots = [];
      for (const ts of room.roomTimeSlots || []) {
        // UnObject retorna timeSlots como números decimais (10.01 = 10:01)
        // ou strings ("10:00"). Normalizar pra horas e minutos.
        let startH, startM, endH, endM;
        if (typeof ts.startTime === 'number') {
          startH = Math.floor(ts.startTime);
          startM = Math.round((ts.startTime % 1) * 100);
          endH = Math.floor(ts.endTime);
          endM = Math.round((ts.endTime % 1) * 100);
          // .01 no UnObject = :00 (artefato decimal)
          if (startM === 1) startM = 0;
          if (endM === 1) endM = 0;
        } else {
          [startH, startM] = String(ts.startTime).split(':').map(Number);
          [endH, endM] = String(ts.endTime).split(':').map(Number);
        }
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;

        for (let m = startMin; m + duracao <= endMin; m += duracao) {
          const h = Math.floor(m / 60);
          const mi = m % 60;
          allSlots.push(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
        }
      }

      // Deduplicar slots (timeSlots do UnObject podem se sobrepor)
      const uniqueSlots = [...new Set(allSlots)].sort();

      // Filtra slots ocupados
      const roomAppointments = appointments.filter(a => a.room?.id === room.id);
      const bookedSlots = new Set();

      for (const apt of roomAppointments) {
        const start = new Date(apt.startDate);
        const end = new Date(apt.endDate);
        // Marca todos os slots de 30min dentro do range como ocupados
        let cursor = new Date(start);
        while (cursor < end) {
          const slotStr = `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`;
          bookedSlots.add(slotStr);
          cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
        }
      }

      const available = uniqueSlots.filter(s => !bookedSlots.has(s));
      const booked = roomAppointments.map(a => ({
        id: a.id,
        start: a.startDate,
        end: a.endDate,
        customer: a.customer?.name || 'N/A',
        status: a.status?.name || 'N/A',
      }));

      return {
        id: room.id,
        name: room.name,
        status: room.status,
        available,
        booked,
        totalSlots: uniqueSlots.length,
        availableCount: available.length,
      };
    });

    return {
      date: dateStr,
      dateISO,
      duracao,
      rooms: result,
    };
  }

  // ─── Mutations (placeholders — descomentar após captura) ──

  /**
   * Busca cliente por telefone
   * @param {string} phone - Telefone do cliente
   */
  async searchCustomer(phone) {
    const token = await this.getToken();
    const data = await this._gql('searchCustomers', { search: phone }, token);
    return data.customers || [];
  }

  /**
   * Cria agendamento
   * ATENÇÃO: a mutation createAppointment é placeholder!
   * Capturar a mutation real no DevTools antes de usar.
   * 
   * @param {Object} params
   * @param {string} params.dateISO - Data/hora ISO do agendamento
   * @param {number} params.roomId - ID da sala
   * @param {number} params.customerId - ID do cliente
   * @param {number} params.serviceId - ID do serviço (Avaliação etc)
   */
  async createAppointment(params) {
    throw new Error(
      '❌ createAppointment ainda é placeholder! ' +
      'Capture a mutation real no DevTools (Network → filtrar graphql → criar agendamento manual) ' +
      'e atualize QUERIES.createAppointment com os campos corretos.'
    );

    // Desbloquear após capturar a mutation real:
    // const token = await this.getToken();
    // const data = await this._gql('createAppointment', { input: params }, token);
    // return data.createAppointment;
  }

  // ─── Health & Stats ─────────────────────────────────────

  async healthCheck() {
    try {
      await this.getToken();
      return { ok: true, stats: this.stats };
    } catch (err) {
      return { ok: false, error: err.message, stats: this.stats };
    }
  }
}

module.exports = { UnObjectClient, QUERIES, DAY_MAP };
