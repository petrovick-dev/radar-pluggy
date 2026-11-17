// Só estrutura: põe no COMMENT de cada coluna de lista própria (vocabulário fechado numa constante do
// código) os valores aceitos e o que cada um significa (modelagem-de-dados, "Coluna de lista leva
// comment"). Tipo e null repetem exatamente a coluna atual — nenhuma destas tem default; MySQL 8 troca só
// o comment, sem reescrever dado nem mexer em índice. Colunas preenchidas pela Pluggy sem constante
// neste código (ex.: `accounts.type`, `positions.subtype`, `webhook_events.event`,
// `item_observations.status`) ficam de fora: o vocabulário é da Pluggy, não deste serviço.
const COLUNAS = [
  {
    table: 'radar_pluggy_items',
    column: 'status',
    type: (S) => S.STRING(20),
    allowNull: false,
    comment:
      'Valores (VALID_STATUSES, entities/pluggy-item): status do Item na Pluggy - UPDATING = sincronizando; ' +
      'LOGIN_ERROR = credencial recusada; OUTDATED = última sincronização falhou; WAITING_USER_INPUT = ' +
      'aguarda MFA/dado do usuário; WAITING_USER_ACTION = aguarda ação do usuário na instituição; ' +
      'MERGING = consolidando dados; UPDATED = sincronizado.',
  },
  {
    table: 'radar_pluggy_investment_transactions',
    column: 'type',
    type: (S) => S.STRING(30),
    allowNull: false,
    comment:
      'Valores (ALLOWED_TYPES, entities/pluggy-investment-transaction): BUY = compra; SELL = venda; ' +
      'TAX = imposto; TRANSFER = transferência; INTEREST = juros/rendimento; AMORTIZATION = amortização.',
  },
  {
    table: 'radar_pluggy_webhook_events',
    column: 'state',
    type: (S) => S.STRING(20),
    allowNull: false,
    comment:
      'Valores (WEBHOOK_EVENT_STATES, entities/pluggy-webhook-event): PENDING = na fila (também após ' +
      'falha, sem FAILED terminal); PROCESSING = em processamento; SUCCEEDED = processado (terminal).',
  },
  {
    table: 'radar_pluggy_history_coverage',
    column: 'reference_type',
    type: (S) => S.STRING(20),
    allowNull: false,
    comment:
      'Valores (ALLOWED_REFERENCE_TYPES, entities/pluggy-history-coverage): ACCOUNT = reference_id é ' +
      'uma conta; INVESTMENT = reference_id é um investimento.',
  },
  {
    table: 'radar_pluggy_accounts',
    column: 'status',
    type: (S) => S.STRING(20),
    allowNull: true,
    comment:
      'Valores (CREDIT_STATUS_VALUES, entities/pluggy-account): status do cartão de crédito - ACTIVE = ' +
      'ativo; BLOCKED = bloqueado; CANCELLED = cancelado. NULL = conta sem creditData.',
  },
  {
    table: 'radar_pluggy_accounts',
    column: 'holder_type',
    type: (S) => S.STRING(20),
    allowNull: true,
    comment:
      'Valores (CREDIT_HOLDER_TYPES, entities/pluggy-account): MAIN = titular; ADDITIONAL = adicional. ' +
      'NULL = conta sem creditData.',
  },
  {
    table: 'radar_pluggy_calls',
    column: 'operation',
    type: (S) => S.STRING(50),
    allowNull: false,
    comment:
      'Valores (PLUGGY_CALL_OPERATIONS, entities/pluggy-call): operação do SDK - AUTH, FETCH_ITEM, ' +
      'FETCH_INVESTMENTS, FETCH_INVESTMENT_TRANSACTIONS, FETCH_LOANS, FETCH_ACCOUNTS, ' +
      'FETCH_ACCOUNT_TRANSACTIONS, FETCH_CONSENTS, FETCH_WEBHOOKS, CREATE_WEBHOOK, UPDATE_WEBHOOK, ' +
      'UPDATE_ITEM, REAL_TIME_BALANCE (os dois últimos reservados para uso futuro).',
  },
  {
    table: 'radar_pluggy_calls',
    column: 'call_scope',
    type: (S) => S.STRING(30),
    allowNull: false,
    comment:
      'Valores (PLUGGY_CALL_SCOPES, entities/pluggy-call): AUTH = autenticação; SNAPSHOT_READ = leitura ' +
      'do que a Pluggy já tem; PLATFORM_CONFIG = configuração (webhooks); ITEM_SYNC_TRIGGER = pede ' +
      'sincronização do Item; DIRECT_INSTITUTION = consulta direta à instituição; UNKNOWN = não classificado.',
  },
  {
    table: 'radar_pluggy_calls',
    column: 'trigger',
    type: (S) => S.STRING(50),
    allowNull: false,
    comment:
      'Valores (PLUGGY_CALL_TRIGGERS, entities/pluggy-call): origem da chamada - ' +
      'CREDENTIAL_REGISTRATION_VALIDATION, CREDENTIAL_REGISTRATION_PROVISIONING, ' +
      'CREDENTIAL_REGISTRATION_PRELOAD (cadastro de credencial); WEBHOOK, WEBHOOK_RECONCILIATION; ' +
      'BOOT_RECOVERY (retomada no boot); MANUAL_HISTORY_LOAD; USER_REFRESH; REAL_TIME_BALANCE; SYSTEM_INTERNAL.',
  },
  {
    table: 'radar_pluggy_calls',
    column: 'outcome',
    type: (S) => S.STRING(20),
    allowNull: false,
    comment: 'Valores (PLUGGY_CALL_OUTCOMES, entities/pluggy-call): SUCCEEDED = sucesso; FAILED = falha.',
  },
  {
    table: 'radar_pluggy_calls',
    column: 'failure_kind',
    type: (S) => S.STRING(30),
    allowNull: true,
    comment:
      'Valores (PLUGGY_CALL_FAILURE_KINDS, entities/pluggy-call): CLIENT_ERROR = 4xx; UPSTREAM_ERROR = ' +
      '5xx da Pluggy; TIMEOUT = sem resposta no prazo; UNAVAILABLE = indisponível; UNKNOWN = não ' +
      'classificado. NULL quando outcome = SUCCEEDED.',
  },
  {
    table: 'radar_pluggy_sync_progress',
    column: 'consumer',
    type: (S) => S.STRING(30),
    allowNull: false,
    comment:
      'Valores (PLUGGY_SYNC_CONSUMERS, entities/pluggy-sync-progress): POSITION_SYNC = sincronização ' +
      'de posições; HISTORY_LOAD = carga de histórico.',
  },
  {
    table: 'radar_pluggy_sync_progress',
    column: 'source',
    type: (S) => S.STRING(30),
    allowNull: false,
    comment:
      'Valores (PLUGGY_SOURCES, adapters/gateways/pluggy-source-catalog): ACCOUNTS = contas; ' +
      'ACCOUNT_TRANSACTIONS = transações de conta; INVESTMENTS = investimentos; INVESTMENT_TRANSACTIONS ' +
      '= transações de investimento; LOANS = empréstimos.',
  },
  {
    table: 'radar_pluggy_item_ingestion_leases',
    column: 'trigger',
    type: (S) => S.STRING(50),
    allowNull: false,
    comment:
      'Valores (PLUGGY_CALL_TRIGGERS, entities/pluggy-call, vocabulário compartilhado): quem detém o ' +
      'lease - CREDENTIAL_REGISTRATION_VALIDATION, CREDENTIAL_REGISTRATION_PROVISIONING, ' +
      'CREDENTIAL_REGISTRATION_PRELOAD, WEBHOOK, WEBHOOK_RECONCILIATION, BOOT_RECOVERY, ' +
      'MANUAL_HISTORY_LOAD, USER_REFRESH, REAL_TIME_BALANCE, SYSTEM_INTERNAL.',
  },
]

async function change(queryInterface, Sequelize, withComment) {
  for (const c of COLUNAS) {
    await queryInterface.changeColumn(c.table, c.column, {
      type: c.type(Sequelize),
      allowNull: c.allowNull,
      comment: withComment ? c.comment : '',
    })
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await change(queryInterface, Sequelize, true)
  },
  async down(queryInterface, Sequelize) {
    await change(queryInterface, Sequelize, false)
  },
}
