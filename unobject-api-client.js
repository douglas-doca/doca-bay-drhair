const https = require('https');

class UnObjectAPIClient {
  constructor(config) {
    this.baseUrl = 'https://app.unobject.com.br/graphql';
    this.username = config.username;
    this.password = config.password;
    this.companyId = config.companyId || 8654;
    this.sellerId = config.sellerId || 760;
    this.roomId = config.roomId || 1;
    this.token = null;
  }

  async graphql(query, variables = {}, operationName = '') {
    const body = JSON.stringify({ query, variables, operationName });
    const url = new URL(this.baseUrl);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Origin': 'https://app.unobject.com.br',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body
    });

    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0].message);
    return data.data;
  }

  async login() {
    const data = await this.graphql(
      `mutation authenticate($login: String!, $password: String!) {
        authenticate(login: $login, password: $password) { token user { companies { id name } } }
      }`,
      { login: this.username, password: this.password },
      'authenticate'
    );
    
    const tempToken = data.authenticate.token;
    this.token = tempToken;

    const data2 = await this.graphql(
      `mutation authenticateByCompany($companyId: Int, $token: String) {
        authenticateByCompany(companyId: $companyId, token: $token) { token }
      }`,
      { companyId: this.companyId, token: tempToken },
      'authenticateByCompany'
    );

    this.token = data2.authenticateByCompany.token;
    return this.token;
  }

  async findOrCreateCustomer(nome, telefone) {
    // Normaliza telefone
    let phone = telefone.replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;

    // Tenta buscar existente
    try {
      const data = await this.graphql(
        `query findPersonByCellPhone($cellPhone: String!, $type: LocatorType!) {
          findPersonByCellPhone(cellPhone: $cellPhone, type: $type) {
            customers { id name cellPhone }
          }
        }`,
        { cellPhone: phone, type: 'CUSTOMER' },
        'findPersonByCellPhone'
      );
      const existing = data.findPersonByCellPhone?.customers?.[0];
      if (existing) {
        console.log(`✅ Cliente encontrado: ${existing.name} (id=${existing.id})`);
        return existing.id;
      }
    } catch(e) {}

    // Cria novo
    const data = await this.graphql(
      `mutation createCustomer($customer: CustomerInput) {
        createCustomer(customer: $customer) { id name birthdate underAge }
      }`,
      {
        customer: {
          id: null, personId: null, photo: null, franchiseId: null,
          observation: null, healthAlert: null, active: true,
          type: 'NATURAL', name: nome,
          nationalityId: 1, maritalStatus: null, gender: 'MALE',
          appEmail: null,
          contact: { email: null, phone: null, cellPhone: phone },
          address: { street: '', number: '', complement: '', neighborhood: '', zipCode: '' },
          documents: {}
        }
      },
      'createCustomer'
    );
    const id = data.createCustomer.id;
    console.log(`✅ Cliente criado: ${nome} (id=${id})`);
    return id;
  }

  async criarAgendamento({ nome, telefone, data, horario, roomId, duration = 40 }) {
    if (!this.token) await this.login();

    const customerId = await this.findOrCreateCustomer(nome, telefone);

    // Monta startDate em UTC
    const [dia, mes, ano] = data.split('/');
    const [hora, min] = horario.split(':');
    const startDate = new Date(
      parseInt(ano), parseInt(mes) - 1, parseInt(dia),
      parseInt(hora), parseInt(min), 0
    );
    // Converte para UTC (Brasil = UTC-3)
    startDate.setHours(startDate.getHours() + 3);
    const startDateISO = startDate.toISOString();

    const result = await this.graphql(
      `mutation createOrderAppointment($order: OrderAppointmentInput) {
        createOrderAppointment(order: $order)
      }`,
      {
        order: {
          sellerId: this.sellerId,
          customerId,
          items: [{ id: 3, itemId: 3, type: 'SERVICE', quantity: 1, discount: 0 }],
          appointment: {
            startDate: startDateISO,
            roomId: roomId || this.roomId,
            serviceSession: 1,
            orderServiceId: 0,
            recurrence: false,
            duration,
            employeeId: null
          }
        }
      },
      'createOrderAppointment'
    );

    console.log(`✅ Agendamento criado!`, result);
    return result;
  }
}

module.exports = UnObjectAPIClient;

// Teste direto
if (require.main === module) {
  const client = new UnObjectAPIClient({
    username: 'malyck.ia.drhair.contagem',
    password: 'Malyck123$$'
  });

  client.criarAgendamento({
    nome: 'Teste API DOCA',
    telefone: '31988887777',
    data: '04/03/2026',
    horario: '11:00',
    roomId: 1
  }).then(r => console.log('✅ Sucesso!', r))
    .catch(e => console.error('❌ Erro:', e.message));
}
