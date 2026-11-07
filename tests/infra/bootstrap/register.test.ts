import { afterAll, describe, expect, it, vi } from 'vitest'
import { setupContainer } from '../../../src/infra/bootstrap/register.js'
import { createScope } from '../../../src/infra/bootstrap/scope.js'
import { SyncPluggyPositionInteractor } from '../../../src/interactors/pluggy-position/sync/sync-pluggy-position.interactor.js'
import { ReadPluggyPositionInteractor } from '../../../src/interactors/pluggy-position/read/read-pluggy-position.interactor.js'
import { ReadPluggyAccountInteractor } from '../../../src/interactors/pluggy-account/read/read-pluggy-account.interactor.js'
import { ReadPluggyAccountStatementInteractor } from '../../../src/interactors/pluggy-account-transaction/read/read-pluggy-account-statement.interactor.js'
import { RegisterPluggyCredentialInteractor } from '../../../src/interactors/pluggy-credential/register/register-pluggy-credential.interactor.js'
import { CheckPluggyCredentialInteractor } from '../../../src/interactors/pluggy-credential/check/check-pluggy-credential.interactor.js'
import { CheckHealthInteractor } from '../../../src/interactors/health/check/check-health.interactor.js'
import { PersonRep } from '../../../src/adapters/repositories/person.rep.js'
import { testAppConfig } from '../../support/test-app-config.js'
import { consoleLogWriter } from '../../../src/infra/tools/log/logger.js'

// Registro errado no container só aparece na hora de resolver — chave com typo, dependência que
// ninguém registrou, ciclo. Este teste resolve a raiz do fluxo e força a construção da árvore
// inteira (interactor → impl → gateways/reps → db/logger), sem tocar a rede nem o banco.
describe('container do processo', () => {
  const container = setupContainer(testAppConfig())

  afterAll(async () => {
    await container.resolve('db').connections.main?.close()
  })

  it('sem OPENSEARCH_URL os logs vão só para o stdout', () => {
    expect(container.resolve('logWriter')).toBe(consoleLogWriter)
  })

  it('com OPENSEARCH_URL os logs vão para o stdout e para o OpenSearch', async () => {
    const remote = setupContainer({
      ...testAppConfig(),
      openSearchLog: { url: 'https://user:pass@opensearch.test:1', index: 'radar-pluggy-logs-test' },
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ errors: false }), { status: 200 }),
    )
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const logWriter = remote.resolve('logWriter')

      createScope(remote, 'test-request-id').resolve('logger').info('subiu')
      await logWriter.close()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain('"message":"subiu"')
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"message":"subiu"'))
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('resolve o interactor de sincronização de posição com a árvore inteira de dependências', () => {
    const scope = createScope(container, 'test-request-id')

    const interactor = scope.resolve('syncPluggyPositionInteractor')

    expect(interactor).toBeInstanceOf(SyncPluggyPositionInteractor)
  })

  it('resolve o interactor de leitura de posição com a árvore inteira de dependências', () => {
    const scope = createScope(container, 'test-request-id')

    const interactor = scope.resolve('readPluggyPositionInteractor')

    expect(interactor).toBeInstanceOf(ReadPluggyPositionInteractor)
  })

  it('resolve o interactor de leitura de contas com a árvore inteira de dependências', () => {
    const scope = createScope(container, 'test-request-id')

    const interactor = scope.resolve('readPluggyAccountInteractor')

    expect(interactor).toBeInstanceOf(ReadPluggyAccountInteractor)
  })

  it('resolve o interactor de leitura de extrato de cartão com a árvore inteira de dependências', () => {
    const scope = createScope(container, 'test-request-id')

    const interactor = scope.resolve('readPluggyAccountStatementInteractor')

    expect(interactor).toBeInstanceOf(ReadPluggyAccountStatementInteractor)
  })

  it('resolve os casos de uso de credencial com a árvore inteira de dependências', () => {
    const scope = createScope(container, 'test-request-id')

    expect(scope.resolve('registerPluggyCredentialInteractor')).toBeInstanceOf(RegisterPluggyCredentialInteractor)
    expect(scope.resolve('checkPluggyCredentialInteractor')).toBeInstanceOf(CheckPluggyCredentialInteractor)
  })

  it('resolve o caso de uso de checagem de saúde com a árvore inteira de dependências', () => {
    const scope = createScope(container, 'test-request-id')

    expect(scope.resolve('checkHealthInteractor')).toBeInstanceOf(CheckHealthInteractor)
  })

  it('resolve o repositório de pessoa, que o middleware de autenticação tira do escopo', () => {
    const scope = createScope(container, 'test-request-id')

    expect(scope.resolve('personRep')).toBeInstanceOf(PersonRep)
  })

  // Resolver o logger não basta: `asFunction(createLogger)` sob `InjectionMode.PROXY` passa o
  // cradle inteiro como `writer` só porque o parâmetro se chama `writer` — o container resolve
  // sem erro, e só quebra ("writer is not a function") na primeira chamada de log de verdade
  // (achado em produção: o primeiro `logger.info` do boot derrubava o processo).
  it('o logger resolvido do container loga de verdade, sem estourar "writer is not a function"', () => {
    const scope = createScope(container, 'test-request-id')
    const logger = scope.resolve('logger')

    expect(() => logger.info('log de teste')).not.toThrow()
    expect(() => logger.warn('log de teste')).not.toThrow()
    expect(() => logger.error('log de teste')).not.toThrow()
  })

  it('cada escopo tem seu próprio detentor de transação', () => {
    const scopeA = createScope(container, 'request-a')
    const scopeB = createScope(container, 'request-b')

    expect(scopeA.resolve('getTransaction')('main')).toBeNull()
    scopeA.resolve('setTransaction')('main', { commit: async () => {} } as never)

    expect(scopeA.resolve('getTransaction')('main')).not.toBeNull()
    // Escopo irmão não enxerga a transação do outro — dois eventos simultâneos não se misturam.
    expect(scopeB.resolve('getTransaction')('main')).toBeNull()
  })
})
