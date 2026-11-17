// Só estrutura: põe no COMMENT de cada coluna de lista (VARCHAR validado por constante no código) os
// valores aceitos e o que cada um significa, para o banco se explicar sozinho (modelagem-de-dados,
// "Coluna de lista leva comment"). Tipo e null repetem exatamente o que está no banco — nenhuma tem
// default —, então o MySQL 8 troca só o comment e os índices sobre `state` e `reference_type` ficam.
// Migration nova, nunca editando as que já rodaram.
const COLUNAS = [
  {
    table: 'pluggy_connector_items',
    column: 'status',
    type: (Sequelize) => Sequelize.STRING(20),
    allowNull: false,
    comment:
      'Valores (VALID_STATUSES, status do Item na Pluggy): UPDATING = sincronizando; LOGIN_ERROR = credencial ' +
      'recusada pela instituição; OUTDATED = última sincronização falhou; WAITING_USER_INPUT = aguarda ação do ' +
      'usuário (MFA); UPDATED = sincronizado.',
  },
  {
    table: 'pluggy_connector_investment_transactions',
    column: 'type',
    type: (Sequelize) => Sequelize.STRING(30),
    allowNull: false,
    comment:
      'Valores (ALLOWED_TYPES): BUY = compra; SELL = venda; TAX = imposto/taxa; TRANSFER = transferência; ' +
      'INTEREST = juros/rendimento; AMORTIZATION = amortização.',
  },
  {
    table: 'pluggy_connector_webhook_events',
    column: 'state',
    type: (Sequelize) => Sequelize.STRING(20),
    allowNull: false,
    comment:
      'Valores (WEBHOOK_EVENT_STATES): PENDING = recebido, aguardando o worker (falha volta para cá); ' +
      'PROCESSING = em processamento; SUCCEEDED = processado (terminal).',
  },
  {
    table: 'pluggy_connector_history_coverage',
    column: 'reference_type',
    type: (Sequelize) => Sequelize.STRING(20),
    allowNull: false,
    comment:
      'Valores (ALLOWED_REFERENCE_TYPES): ACCOUNT = reference_id é a conta (transações de conta); ' +
      'INVESTMENT = reference_id é o investimento (transações de investimento).',
  },
  {
    table: 'pluggy_connector_accounts',
    column: 'status',
    type: (Sequelize) => Sequelize.STRING(20),
    allowNull: true,
    comment:
      'Valores (CREDIT_STATUS_VALUES, creditData.status do cartão): ACTIVE = ativo; BLOCKED = bloqueado; ' +
      'CANCELLED = cancelado. NULL = conta sem creditData.',
  },
  {
    table: 'pluggy_connector_accounts',
    column: 'holder_type',
    type: (Sequelize) => Sequelize.STRING(20),
    allowNull: true,
    comment:
      'Valores (CREDIT_HOLDER_TYPES, creditData.holderType): MAIN = titular; ADDITIONAL = cartão adicional. ' +
      'NULL = conta sem creditData.',
  },
]

const change = async (queryInterface, Sequelize, colunas, withComment) => {
  for (const c of colunas) {
    await queryInterface.changeColumn(c.table, c.column, {
      type: c.type(Sequelize),
      allowNull: c.allowNull,
      comment: withComment ? c.comment : '',
    })
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await change(queryInterface, Sequelize, COLUNAS, true)
  },

  async down(queryInterface, Sequelize) {
    // Ordem inversa exata do `up`.
    await change(queryInterface, Sequelize, [...COLUNAS].reverse(), false)
  },
}
