#!/usr/bin/env node
/**
 * Teste rápido: auth + consulta de horários
 * Roda localmente ou no VPS pra validar antes de deployar
 * 
 * Usage: node scripts/test-slots.js
 */

const { UnObjectClient } = require('../src/services/unobject-client');

async function main() {
  console.log('🧪 Teste: UnObject GraphQL Client');
  console.log('='.repeat(60));

  const client = new UnObjectClient({
    login: 'daniel.barbacena',
    password: 'mudar123',
    companyId: 5170,
    roomIds: [7994, 7993],
    tenantName: 'magrass-barbacena',
  });

  // 1. Auth
  console.log('\n1️⃣  Autenticando...');
  const token = await client.getToken();
  console.log(`   ✅ Token obtido: ${token.substring(0, 20)}...`);

  // 2. Rooms
  console.log('\n2️⃣  Buscando salas...');
  const rooms = await client.getRooms(new Date());
  for (const r of rooms) {
    console.log(`   🏠 ${r.name} (id=${r.id}, status=${r.status})`);
    console.log(`      TimeSlots: ${(r.roomTimeSlots || []).map(ts => `${ts.startTime}-${ts.endTime}`).join(', ')}`);
  }

  // 3. Slots hoje
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  console.log(`\n3️⃣  Horários disponíveis para ${dateStr} (duração=60min)...`);
  const slots = await client.getAvailableSlots(dateStr, 60);

  for (const room of slots.rooms) {
    console.log(`\n   🏠 ${room.name}:`);
    console.log(`      Disponíveis (${room.availableCount}/${room.totalSlots}): ${room.available.join(', ') || 'nenhum'}`);
    if (room.booked.length > 0) {
      console.log(`      Ocupados:`);
      for (const b of room.booked) {
        console.log(`        - ${b.customer} | ${b.status}`);
      }
    }
  }

  // 4. Stats
  console.log('\n4️⃣  Stats:', client.stats);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Teste completo!');
}

main().catch(err => {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
});
