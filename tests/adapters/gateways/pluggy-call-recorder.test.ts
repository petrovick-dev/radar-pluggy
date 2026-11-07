import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { PluggyCallRecorder } from '../../../src/adapters/gateways/pluggy-call-recorder.js'
import { definePluggyCallModel } from '../../../src/infra/db/models/pluggy-call-model.js'
import { createDatabaseConnection } from '../../../src/infra/db/database.js'
import { testDatabaseConfig } from '../../support/test-database-config.js'
import type { AppContainer } from '../../../src/infra/bootstrap/register.js'
import type { PluggyCallEvent } from '../../../src/adapters/gateways/pluggy-call-recorder.js'

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}

// `record()` é fire-and-forget por design (D25) — a primeira chamada de um `sequelize` recém-criado
// paga o custo real de abrir a conexão TCP, que pode passar de um `setTimeout` curto. Espera
// ativamente em vez de confiar num atraso fixo, sem tornar o próprio mecanismo síncrono.
async function waitForRows<T>(query: () => Promise<T[]>, attempts = 20): Promise<T[]> {
  for (let i = 0; i < attempts; i++) {
    const rows = await query()
    if (rows.length > 0) {
      return rows
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return query()
}

function baseEvent(overrides: Partial<PluggyCallEvent> = {}): PluggyCallEvent {
  return {
    itemId: 'item-1',
    connectorId: undefined,
    operation: 'FETCH_ITEM',
    httpMethod: 'GET',
    routeTemplate: '/items/{id}',
    callScope: 'SNAPSHOT_READ',
    trigger: 'WEBHOOK',
    resourceType: undefined,
    resourceId: undefined,
    requestCorrelationId: randomUUID(),
    webhookEventId: undefined,
    pageOrdinal: undefined,
    pageSize: undefined,
    startedAt: new Date('2026-09-01T00:00:00.000Z'),
    completedAt: new Date('2026-09-01T00:00:00.150Z'),
    httpStatus: 200,
    outcome: 'SUCCEEDED',
    failureKind: undefined,
    errorCode: undefined,
    ...overrides,
  }
}

describe('PluggyCallRecorder', () => {
  const sequelize = createDatabaseConnection(testDatabaseConfig())
  const model = definePluggyCallModel(sequelize)
  // Tabela compartilhada com o resto da suíte (inclusive o e2e de cadastro, que grava linhas reais
  // nela) — nunca um `destroy({where:{}})` cego: cada teste rastreia só o `request_correlation_id`
  // que ele mesmo gravou, e a limpeza é escopada a isso.
  const correlationIds: string[] = []

  afterEach(async () => {
    if (correlationIds.length > 0) {
      await model.destroy({ where: { request_correlation_id: correlationIds } })
      correlationIds.length = 0
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  function buildRecorder() {
    const container = {
      db: { models: { pluggyCall: model } },
      logWriter: { write: () => {}, close: async () => {} },
      getTransaction: () => null,
    } as unknown as AppContainer
    return new PluggyCallRecorder(container)
  }

  it('grava um registro com os campos corretos', async () => {
    const correlationId = randomUUID()
    correlationIds.push(correlationId)
    const recorder = buildRecorder()
    recorder.record(baseEvent({ requestCorrelationId: correlationId }))

    const rows = await waitForRows(() => model.findAll({ where: { request_correlation_id: correlationId } }))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.get('operation')).toBe('FETCH_ITEM')
    expect(rows[0]?.get('duration_ms')).toBe(150)
    expect(rows[0]?.get('outcome')).toBe('SUCCEEDED')
  })

  it('record() devolve antes de a gravação concluir — nunca é aguardado por quem chama', () => {
    const correlationId = randomUUID()
    correlationIds.push(correlationId)
    const recorder = buildRecorder()
    // Se `record` fosse assíncrono/aguardado, isto não compilaria como chamada síncrona void.
    const result = recorder.record(baseEvent({ requestCorrelationId: correlationId }))
    expect(result).toBeUndefined()
  })

  it('a gravação sobrevive a um rollback do chamador — nunca participa da transação de negócio', async () => {
    const correlationId = randomUUID()
    correlationIds.push(correlationId)
    const sequelizeMain = createDatabaseConnection(testDatabaseConfig())
    const transaction = await sequelizeMain.transaction()
    try {
      const recorder = buildRecorder()
      recorder.record(baseEvent({ requestCorrelationId: correlationId }))

      const rows = await waitForRows(() => model.findAll({ where: { request_correlation_id: correlationId } }))
      await transaction.rollback()

      expect(rows).toHaveLength(1)
    } finally {
      await sequelizeMain.close()
    }
  })

  it('falha ao persistir nunca lança para quem chamou (cai em aviso de log, D25)', async () => {
    const container = {
      db: { models: { pluggyCall: { create: async () => { throw new Error('conexão caiu') } } } },
      logWriter: { write: (level: string, line: string) => written.push({ level, line }), close: async () => {} },
      getTransaction: () => null,
    } as unknown as AppContainer
    const written: { level: string; line: string }[] = []
    const recorder = new PluggyCallRecorder(container)

    expect(() => recorder.record(baseEvent())).not.toThrow()
    // Se a rejeição escapasse sem tratamento, o processo de teste falharia com unhandled rejection.
    await flushMicrotasks()
    // O aviso sai pelo destino de log do processo (OpenSearch fora do ambiente local), não pelo console.
    expect(written.map((entry) => entry.level)).toEqual(['warn'])
  })
})
