#!/usr/bin/env node
/**
 * 🎯 GUIA: Capturar mutations faltantes do UnObject
 * 
 * Abre o UnObject no Chrome, F12 → Network → filtrar "graphql"
 * Faz cada ação manual e copia o Request Payload.
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MUTATION 1: createAppointment
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 1. Loga no UnObject → Agenda → clica num horário vazio
 * 2. Preenche: cliente, serviço, data, hora, sala
 * 3. Clica "Salvar"
 * 4. No DevTools Network, pega a request graphql que apareceu
 * 5. Copia o "Request Payload" inteiro (JSON)
 * 
 * O que preciso do payload:
 *   - operationName (provavelmente "createAppointment" ou "saveAppointment")
 *   - variables (o objeto inteiro com todos os campos)
 *   - query (a mutation GraphQL com campos de retorno)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MUTATION 2: createCustomer (se separado)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 1. No fluxo de agendamento, se o cliente não existe
 * 2. Clica "Novo cliente" ou "Cadastrar"
 * 3. Preenche: nome, telefone, email
 * 4. Salva
 * 5. Captura o payload igual ao acima
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * QUERY 3: searchCustomers (busca por nome/telefone)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 1. Na tela de agendamento, digita um nome no campo de busca
 * 2. Enquanto digita, vai aparecer requests de busca
 * 3. Captura o payload (pode ser autocomplete/search)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MUTATION 4: updateAppointment / cancelAppointment
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 1. Clica num agendamento existente
 * 2. Altera algo (horário, status para "Cancelado") e salva
 * 3. Captura o payload
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * DICA: Filtra por "graphql" no Network e liga "Preserve log"
 * pra não perder requests quando a página navega.
 * 
 * Cola os payloads aqui embaixo ou manda no chat que eu atualizo
 * o unobject-client.js com as mutations reais.
 */

console.log('📋 Leia as instruções acima e capture os payloads no DevTools.');
console.log('   Depois cole no chat que eu atualizo o client.');
