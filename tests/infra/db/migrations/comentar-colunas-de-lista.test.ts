import { createRequire } from 'node:module'
import { Sequelize } from 'sequelize'
import { describe, expect, it } from 'vitest'
import { CREDIT_HOLDER_TYPES, CREDIT_STATUS_VALUES } from '../../../../src/adapters/gateways/pluggy-accounts.gateway.js'
import { ALLOWED_REFERENCE_TYPES } from '../../../../src/entities/pluggy-history-coverage.js'
import { ALLOWED_TYPES } from '../../../../src/entities/pluggy-investment-transaction.js'
import { VALID_STATUSES } from '../../../../src/entities/pluggy-item.js'
import { WEBHOOK_EVENT_STATES } from '../../../../src/entities/pluggy-webhook-event.js'

type ChangeColumn = { alvo: string; options: { type: unknown; allowNull: boolean; comment: string } }
type Migration = {
  up: (queryInterface: unknown, sequelizeLib: typeof Sequelize) => Promise<void>
  down: (queryInterface: unknown, sequelizeLib: typeof Sequelize) => Promise<void>
}

const require = createRequire(import.meta.url)
const migration = require(
  '../../../../src/infra/db/migrations/20261117230000-comentar-colunas-de-lista-pluggy-connector.cjs',
) as Migration

// Coluna → definição atual no banco (lida do information_schema depois de todas as migrations) e
// valores aceitos pela constante do código. O comment tem de listar cada valor; tipo e null não mudam.
const ESPERADO: Record<string, { tipo: string; allowNull: boolean; valores: readonly string[] }> = {
  'pluggy_connector_items.status': { tipo: 'VARCHAR(20)', allowNull: false, valores: VALID_STATUSES },
  'pluggy_connector_investment_transactions.type': {
    tipo: 'VARCHAR(30)',
    allowNull: false,
    valores: [...ALLOWED_TYPES],
  },
  'pluggy_connector_webhook_events.state': { tipo: 'VARCHAR(20)', allowNull: false, valores: WEBHOOK_EVENT_STATES },
  'pluggy_connector_history_coverage.reference_type': {
    tipo: 'VARCHAR(20)',
    allowNull: false,
    valores: [...ALLOWED_REFERENCE_TYPES],
  },
  'pluggy_connector_accounts.status': { tipo: 'VARCHAR(20)', allowNull: true, valores: CREDIT_STATUS_VALUES },
  'pluggy_connector_accounts.holder_type': { tipo: 'VARCHAR(20)', allowNull: true, valores: CREDIT_HOLDER_TYPES },
}

const rodar = async (passo: 'up' | 'down') => {
  const chamadas: ChangeColumn[] = []
  const queryInterface = {
    changeColumn: async (table: string, column: string, options: ChangeColumn['options']) => {
      chamadas.push({ alvo: `${table}.${column}`, options })
    },
  }
  await migration[passo](queryInterface, Sequelize)
  return chamadas
}

describe('migration: comment com os valores aceitos nas colunas de lista', () => {
  it('up comenta cada coluna de lista com todos os valores da constante, sem mudar tipo nem null', async () => {
    const chamadas = await rodar('up')

    expect(chamadas.map((c) => c.alvo).sort()).toEqual(Object.keys(ESPERADO).sort())
    for (const { alvo, options } of chamadas) {
      const esperado = ESPERADO[alvo]!
      expect(String(options.type), alvo).toBe(esperado.tipo)
      expect(options.allowNull, alvo).toBe(esperado.allowNull)
      for (const valor of esperado.valores) {
        expect(options.comment, `${alvo} sem ${valor}`).toMatch(new RegExp(`\\b${valor}\\b`))
      }
    }
  })

  it('down limpa o comment das mesmas colunas, na ordem inversa do up', async () => {
    const subida = await rodar('up')
    const descida = await rodar('down')

    expect(descida.map((c) => c.alvo)).toEqual(subida.map((c) => c.alvo).reverse())
    for (const { alvo, options } of descida) {
      expect(String(options.type), alvo).toBe(ESPERADO[alvo]!.tipo)
      expect(options.allowNull, alvo).toBe(ESPERADO[alvo]!.allowNull)
      expect(options.comment, alvo).toBe('')
    }
  })
})
