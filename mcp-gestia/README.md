# MCP GestIA — Dr. Hair

MCP Server para integração com a API GestIA (ERP Dr. Hair).

## Deploy no VPS

```bash
# 1. Copiar pro VPS
scp -r mcp-gestia/ root@31.97.255.11:/home/

# 2. Copiar chave privada
cp gestia-auth-final/gestia-auth/private.jwk.json /home/mcp-gestia/keys/

# 3. Subir
cd /home/mcp-gestia
docker compose up -d --build

# 4. Verificar
curl http://localhost:3202/health
```

## Caddy (reverse proxy)

```
gestia.docaperformance.com.br {
    reverse_proxy localhost:3202
}
```

## Variáveis de Ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| GESTIA_BASE_URL | https://api-drhair.gestiaerp.com.br | URL base da API |
| GESTIA_JWK_PATH | ./keys/private.jwk.json | Caminho da chave privada |
| GESTIA_USER_ID | 53 | UserId do header |
| GESTIA_USE_CURL | false | Usar curl em vez de fetch (fallback DNS) |
| PORT | 3202 | Porta do server |

## Auth

- JWT PS256 com `sub: "DOCA"`
- `kid` = SHA-256 do DER da public key
- Headers obrigatórios: `UnitId` + `UserId: 53`
- Token cache com renovação automática (24h, renova 5min antes)

## Unit IDs

| Unidade | ID |
|---------|-----|
| Savassi | 3 |
| Contagem | 15 |
| Coronel Fabriciano | 22 |

## 23 Tools

### Agenda (8)
- `gestia_combos_cadastro` — **KEY**: retorna profissionais com grade, salas, procedimentos, tudo numa call
- `gestia_consultar_agenda` — Horários agendados por período
- `gestia_agendar` — Cria agendamento (cliente ou prospect)
- `gestia_alterar_situacao_agenda` — Muda status (1=Marcado, 2=Confirmado, 3=Aguardando, 4=Em atendimento, 5=Atendido)
- `gestia_excluir_agendamento` — Deleta agendamento
- `gestia_agenda_por_cliente` — Agenda de um cliente
- `gestia_agenda_por_prospect` — Agenda de um prospect
- `gestia_horarios_funcionamento` — Horários da unidade

### Prospect / Cliente (4)
- `gestia_criar_prospect` — Cria lead novo (retorna ID)
- `gestia_listar_prospects` — Lista prospects
- `gestia_buscar_clientes` — Lista clientes
- `gestia_buscar_cliente_fast` — Busca rápida

### Profissionais (3)
- `gestia_listar_profissionais` — Profissionais da unidade
- `gestia_listar_salas` — Salas
- `gestia_listar_procedimentos` — Procedimentos disponíveis

### Atendimento (4)
- `gestia_atendimentos_em_andamento` — Em andamento (com valor, comanda)
- `gestia_listar_atendimentos` — Lista com paginação
- `gestia_historico_atendimento` — Log de ações
- `gestia_imagens_atendimento` — Metadados das imagens de tricoscopia

### Comanda (3)
- `gestia_procedimentos_comanda` — Procedimentos do tratamento
- `gestia_historico_comanda` — Log
- `gestia_parcelas_comanda` — Parcelas de pagamento

### Unidades (1)
- `gestia_listar_unidades` — Todas as 26 unidades da rede

## Fluxo do Agente

```
Lead → WhatsApp → DOCA-OCTA
  ↓
1. gestia_combos_cadastro (sabe o que oferecer)
  ↓
2. Qualifica nome + telefone na conversa
  ↓
3. gestia_criar_prospect (cria lead no Gest)
  ↓
4. gestia_agendar (agenda com idDoProspect + observação)
  ↓
  Se erro de horário → agente oferece outro
  Se sucesso → confirma pro lead no WhatsApp
  ↓
5. Recepção vê no Gest com contexto completo na observação
```

## Pendente (futuro)
- Download de imagens de tricoscopia (endpoint não exposto na API)
- Upload de imagens (formato do payload não descoberto)
- Sistema Evolução (Claude Vision + PDF + WAHA)
