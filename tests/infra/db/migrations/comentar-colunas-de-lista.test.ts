import { createRequire } from 'node:module'
import { Sequelize } from 'sequelize'
import { describe, expect, it } from 'vitest'
import { PLUGGY_SOURCES } from '../../../../src/adapters/gateways/pluggy-source-catalog.js'
import { CREDIT_HOLDER_TYPES, CREDIT_STATUS_VALUES } from '../../../../src/entities/pluggy-account.js'
import {
  PLUGGY_CALL_FAILURE_KINDS,
  PLUGGY_CALL_OPERATIONS,
  PLUGGY_CALL_OUTCOMES,
  PLUGGY_CALL_SCOPES,
  PLUGGY_CALL_TRIGGERS,
} from '../../../../src/entities/pluggy-call.js'
import { ALLOWED_REFERENCE_TYPES } from '../../../../src/entities/pluggy-history-coverage.js'
import { ALLOWED_TYPES } from '../../../../src/entities/pluggy-investment-transaction.js'
import { VALID_STATUSES } from '../../../../src/entities/pluggy-item.js'
import { PLUGGY_SYNC_CONSUMERS } from '../../../../src/entities/pluggy-sync-progress.js'
import { WEBHOOK_EVENT_STATES } from '../../../../src/entities/pluggy-webhook-event.js'

const require = createRequire(import.meta.url)

type ChangeColumnOptions = { type: unknown; allowNull: boolean; comment: string }
type Migration = {
  up: (queryInterface: unknown, sequelizeLib: typeof Sequelize) => Promise<void>
  down: (queryInterface: unknown, sequelizeLib: typeof Sequelize) => Promise<void>
}

const migration = require('../../../../src/infra/db/migrations/20261117230000-comentar-colunas-de-lista-radar-pluggy.cjs') as Migration

// Coluna → constante do código e a definição atual da coluna (das migrations que a criaram).
const ESPERADO: Record<string, { valores: Iterable<string>; tipo: string; allowNull: boolean }> = {
  'radar_pluggy_items.status': { valores: VALID_STATUSES, tipo: 'VARCHAR(20)', allowNull: false },
  'radar_pluggy_investment_transactions.type': { valores: ALLOWED_TYPES, tipo: 'VARCHAR(30)', allowNull: false },
  'radar_pluggy_webhook_events.state': { valores: WEBHOOK_EVENT_STATES, tipo: 'VARCHAR(20)', allowNull: false },
  'radar_pluggy_history_coverage.reference_type': {
    valores: ALLOWED_REFERENCE_TYPES,
    tipo: 'VARCHAR(20)',
    allowNull: false,
  },
  'radar_pluggy_accounts.status': { valores: CREDIT_STATUS_VALUES, tipo: 'VARCHAR(20)', allowNull: true },
  'radar_pluggy_accounts.holder_type': { valores: CREDIT_HOLDER_TYPES, tipo: 'VARCHAR(20)', allowNull: true },
  'radar_pluggy_calls.operation': { valores: PLUGGY_CALL_OPERATIONS, tipo: 'VARCHAR(50)', allowNull: false },
  'radar_pluggy_calls.call_scope': { valores: PLUGGY_CALL_SCOPES, tipo: 'VARCHAR(30)', allowNull: false },
  'radar_pluggy_calls.trigger': { valores: PLUGGY_CALL_TRIGGERS, tipo: 'VARCHAR(50)', allowNull: false },
  'radar_pluggy_calls.outcome': { valores: PLUGGY_CALL_OUTCOMES, tipo: 'VARCHAR(20)', allowNull: false },
  'radar_pluggy_calls.failure_kind': { valores: PLUGGY_CALL_FAILURE_KINDS, tipo: 'VARCHAR(30)', allowNull: true },
  'radar_pluggy_sync_progress.consumer': { valores: PLUGGY_SYNC_CONSUMERS, tipo: 'VARCHAR(30)', allowNull: false },
  'radar_pluggy_sync_progress.source': { valores: PLUGGY_SOURCES, tipo: 'VARCHAR(30)', allowNull: false },
  'radar_pluggy_item_ingestion_leases.trigger': {
    valores: PLUGGY_CALL_TRIGGERS,
    tipo: 'VARCHAR(50)',
    allowNull: false,
  },
}

async function chamadas(direcao: 'up' | 'down') {
  const feitas: Array<{ alvo: string; options: ChangeColumnOptions }> = []
  const fakeQueryInterface = {
    changeColumn: async (table: string, column: string, options: ChangeColumnOptions) => {
      feitas.push({ alvo: `${table}.${column}`, options })
    },
  }
  await migration[direcao](fakeQueryInterface, Sequelize)
  return feitas
}

describe('migration: comment com os valores aceitos nas colunas de lista', () => {
  it('comenta exatamente as colunas de lista, sem mudar tipo nem null', async () => {
    const up = await chamadas('up')

    expect(up.map((c) => c.alvo).sort()).toEqual(Object.keys(ESPERADO).sort())
    for (const { alvo, options } of up) {
      expect(String(options.type), alvo).toBe(ESPERADO[alvo]!.tipo)
      expect(options.allowNull, alvo).toBe(ESPERADO[alvo]!.allowNull)
    }
  })

  it('todo valor da constante aparece no comment da coluna', async () => {
    for (const { alvo, options } of await chamadas('up')) {
      for (const valor of ESPERADO[alvo]!.valores) {
        expect(options.comment, `${alvo} sem ${valor}`).toMatch(new RegExp(`\\b${valor}\\b`))
      }
    }
  })

  it('o down limpa o comment das mesmas colunas, com o mesmo tipo', async () => {
    const down = await chamadas('down')

    expect(down.map((c) => c.alvo).sort()).toEqual(Object.keys(ESPERADO).sort())
    for (const { alvo, options } of down) {
      expect(options.comment, alvo).toBe('')
      expect(String(options.type), alvo).toBe(ESPERADO[alvo]!.tipo)
    }
  })
})
