import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../../src/infra/config/config.js'
import { ApplicationError } from '../../../src/shared/application-error.js'
import { validConfigEnv as validEnv } from '../../support/test-config-env.js'

// `ApplicationError.message` é sempre o `errorType` — o motivo específico da recusa mora em
// `details.reason` (`shared/application-error.ts`).
function reasonOf(fn: () => unknown): string {
  try {
    fn()
    expect.unreachable('deveria recusar')
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError)
    expect((error as ApplicationError).errorType).toBe('PLUGGY_CONNECTOR_CONFIG_INVALID')
    return (error as ApplicationError).details?.reason as string
  }
}

describe('loadConfig', () => {
  it('devolve a configuração completa quando tudo está presente e válido (fonte: env vars)', () => {
    const env = validEnv()

    expect(loadConfig(env)).toEqual({
      port: 3003,
      jwtSecret: 'segredo-de-teste',
      corsAllowedOrigins: [],
      webhookUrl: 'https://pluggy-connector.test/webhooks/pluggy',
      credentialEncryptionKey: env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY,
      database: {
        host: '127.0.0.1',
        port: 3306,
        database: 'oplab_radar',
        username: 'root',
        password: '12345678',
        dialectOptions: {},
      },
    })
  })

  it.each(['*', 'null', 'https://app.example/'])('recusa CORS com origem não exata %s', (origin) => {
    const env = validEnv()
    const config = JSON.parse(env.CONFIG as string) as { http: Record<string, unknown> }
    config.http.cors = { allowedOrigins: [origin] }
    env.CONFIG = JSON.stringify(config)

    expect(reasonOf(() => loadConfig(env))).toMatch(/http\.cors\.allowedOrigins/)
  })

  it('aceita somente origens exatas configuradas no JSON', () => {
    const env = validEnv()
    const config = JSON.parse(env.CONFIG as string) as { http: Record<string, unknown> }
    config.http.cors = { allowedOrigins: ['https://app.example'] }
    env.CONFIG = JSON.stringify(config)

    expect(loadConfig(env).corsAllowedOrigins).toEqual(['https://app.example'])
  })

  it('lê introspecção privada do JSON de configuração', () => {
    const env = validEnv()
    const config = JSON.parse(env.CONFIG as string) as { http: Record<string, unknown> }
    config.http.sessionIntrospection = {
      url: 'http://oplab-radar-api:3001/internal/sessions/introspect',
      serviceToken: 'service-secret-at-least-thirty-two-characters',
      timeoutMs: 1200,
    }
    env.CONFIG = JSON.stringify(config)

    expect(loadConfig(env).sessionIntrospection).toEqual(config.http.sessionIntrospection)
  })

  it.each([
    'https://public.example/internal/sessions/introspect',
    'http://oplab-radar-api:3001/other',
  ])('recusa introspecção fora da rota/rede privada: %s', (url) => {
    const env = validEnv()
    const config = JSON.parse(env.CONFIG as string) as { http: Record<string, unknown> }
    config.http.sessionIntrospection = { url, serviceToken: 'service-secret-at-least-thirty-two-characters' }
    env.CONFIG = JSON.stringify(config)

    expect(reasonOf(() => loadConfig(env))).toMatch(/sessionIntrospection/)
  })

  it('NODE_ENV=production-railway sem CONFIG/DATABASES recusa', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production-railway' }

    expect(() => loadConfig(env)).toThrow(ApplicationError)
  })

  it('CONFIG.http.jwtSecret ausente recusa', () => {
    const env = validEnv()
    env.CONFIG = JSON.stringify({
      http: { port: 3003 },
      pluggy: { webhookUrl: 'https://pluggy-connector.test/webhooks/pluggy' },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/jwtSecret/)
  })

  it('CONFIG.pluggy.webhookUrl em http:// recusa — carregaria o segredo do webhook em claro', () => {
    const env = validEnv()
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'segredo' },
      pluggy: { webhookUrl: 'http://pluggy-connector.test/webhooks/pluggy' },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/webhookUrl/)
  })

  it('sem OPENSEARCH_URL não há envio ao OpenSearch — log fica só no stdout', () => {
    expect(loadConfig(validEnv()).openSearchLog).toBeUndefined()
  })

  it('OPENSEARCH_URL liga o envio, com índice padrão radar-pluggy-logs-<NODE_ENV>', () => {
    const env = { ...validEnv(), NODE_ENV: 'staging', OPENSEARCH_URL: 'https://user:pass@opensearch.test:12345' }

    expect(loadConfig(env).openSearchLog).toEqual({
      url: 'https://user:pass@opensearch.test:12345',
      index: 'radar-pluggy-logs-staging',
    })
  })

  it('OPENSEARCH_URL vazia (referência do Railway sem valor) não liga o envio', () => {
    expect(loadConfig({ ...validEnv(), OPENSEARCH_URL: '' }).openSearchLog).toBeUndefined()
  })

  it('NODE_ENV ausente (local) com OPENSEARCH_URL usa o índice radar-pluggy-logs-development', async () => {
    const remote = validEnv()
    const dir = mkdtempSync(resolve(tmpdir(), 'radar-pluggy-config-'))
    writeFileSync(resolve(dir, 'config.json'), remote.CONFIG as string)
    writeFileSync(resolve(dir, 'databases.json'), remote.DATABASES as string)
    // `CONFIG_DIR` é lido no import do módulo: recarrega o módulo com o diretório temporário.
    vi.stubEnv('CONFIG_DIR', dir)
    vi.resetModules()
    try {
      const { loadConfig: loadLocalConfig } = await import('../../../src/infra/config/config.js')
      const env: NodeJS.ProcessEnv = {
        PLUGGY_CREDENTIAL_ENCRYPTION_KEY: remote.PLUGGY_CREDENTIAL_ENCRYPTION_KEY,
        OPENSEARCH_URL: 'https://user:pass@opensearch.test:12345',
      }

      expect(loadLocalConfig(env).openSearchLog?.index).toBe('radar-pluggy-logs-development')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('OPENSEARCH_INDEX substitui o índice padrão', () => {
    const env = { ...validEnv(), OPENSEARCH_URL: 'https://user:pass@opensearch.test:12345', OPENSEARCH_INDEX: 'outro-indice' }

    expect(loadConfig(env).openSearchLog?.index).toBe('outro-indice')
  })

  it('PORT (env var) vence CONFIG.http.port — é a plataforma quem injeta a porta', () => {
    const env = validEnv()
    env.PORT = '4000'

    expect(loadConfig(env).port).toBe(4000)
  })

  it.each(['abc', '0', '65536'])('PORT=%s recusa por não ser porta válida', (value) => {
    const env = validEnv()
    env.PORT = value

    expect(reasonOf(() => loadConfig(env))).toMatch(/PORT/)
  })

  it('PLUGGY_CREDENTIAL_ENCRYPTION_KEY ausente recusa, nunca um default', () => {
    const env = validEnv()
    delete env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY

    expect(reasonOf(() => loadConfig(env))).toMatch(/PLUGGY_CREDENTIAL_ENCRYPTION_KEY/)
  })

  it('PLUGGY_CREDENTIAL_ENCRYPTION_KEY com 31 bytes recusa por tamanho', () => {
    const env = validEnv()
    env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY = randomBytes(31).toString('base64')

    expect(reasonOf(() => loadConfig(env))).toMatch(/PLUGGY_CREDENTIAL_ENCRYPTION_KEY/)
  })

  it('PLUGGY_CREDENTIAL_ENCRYPTION_KEY corrompida (caractere extra) recusa mesmo decodificando 32 bytes', () => {
    // `Buffer.from(x, 'base64')` decodifica em modo permissivo: ignora caractere fora do
    // alfabeto, então a chave original + "!" ainda decodifica pros mesmos 32 bytes. Só o formato
    // estrito pega isso (achado do validador externo desta entrega).
    const env = validEnv()
    env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY = `${randomBytes(32).toString('base64')}!`

    expect(reasonOf(() => loadConfig(env))).toMatch(/PLUGGY_CREDENTIAL_ENCRYPTION_KEY/)
  })

  it('CONFIG.pluggy.credentialEncryptionKey é usado quando a env var está ausente', () => {
    const env = validEnv()
    delete env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY
    const configuredKey = randomBytes(32).toString('base64')
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'segredo-de-teste' },
      pluggy: { webhookUrl: 'https://pluggy-connector.test/webhooks/pluggy', credentialEncryptionKey: configuredKey },
    })

    expect(loadConfig(env).credentialEncryptionKey).toBe(configuredKey)
  })

  it('env var vence quando as duas fontes têm valor — mesma precedência de PORT sobre CONFIG.http.port', () => {
    const env = validEnv()
    const envKey = randomBytes(32).toString('base64')
    env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY = envKey
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'segredo-de-teste' },
      pluggy: {
        webhookUrl: 'https://pluggy-connector.test/webhooks/pluggy',
        credentialEncryptionKey: randomBytes(32).toString('base64'),
      },
    })

    expect(loadConfig(env).credentialEncryptionKey).toBe(envKey)
  })

  it('CONFIG.pluggy.credentialEncryptionKey com tamanho inválido recusa, mesma guarda da env var', () => {
    const env = validEnv()
    delete env.PLUGGY_CREDENTIAL_ENCRYPTION_KEY
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'segredo-de-teste' },
      pluggy: {
        webhookUrl: 'https://pluggy-connector.test/webhooks/pluggy',
        credentialEncryptionKey: randomBytes(31).toString('base64'),
      },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/PLUGGY_CREDENTIAL_ENCRYPTION_KEY/)
  })

  it('DATABASES.main sem host/port/database/username/password recusa', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({ main: {} })

    expect(reasonOf(() => loadConfig(env))).toMatch(/databases main connection/)
  })

  it('host efetivo é o da réplica de escrita quando declarada', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: {
        host: 'host-direto.example',
        port: 3306,
        database: 'db',
        username: 'u',
        password: 'p',
        replication: { write: { host: 'host-replica-escrita.example' } },
      },
    })

    expect(loadConfig(env).database.host).toBe('host-replica-escrita.example')
  })

  it('DATABASES sem dialectOptions.ssl entra com TLS da CA do Aiven por padrão', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: { host: 'aiven-host.example', port: 3306, database: 'db', username: 'u', password: 'p' },
    })

    const dialectOptions = loadConfig(env).database.dialectOptions as {
      ssl: { ca: string; rejectUnauthorized: boolean }
    }

    expect(dialectOptions.ssl.rejectUnauthorized).toBe(true)
    expect(dialectOptions.ssl.ca).toBe(readFileSync(resolve(process.cwd(), 'aiven-ca.pem'), 'utf8'))
  })

  it('replication.write.host vazio recai pro host direto — decisão de hoje: não é mais erro distinto de ausente', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: {
        host: 'host-direto.example',
        port: 3306,
        database: 'db',
        username: 'u',
        password: 'p',
        replication: { write: { host: '' } },
      },
    })

    expect(loadConfig(env).database.host).toBe('host-direto.example')
  })

  it('dialectOptions.ssl: null entra com TLS da CA do Aiven por padrão — decisão de hoje: não é mais distinto de ausente', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: {
        host: 'aiven-host.example',
        port: 3306,
        database: 'db',
        username: 'u',
        password: 'p',
        dialectOptions: { ssl: null },
      },
    })

    const dialectOptions = loadConfig(env).database.dialectOptions as { ssl: { rejectUnauthorized: boolean } }
    expect(dialectOptions.ssl.rejectUnauthorized).toBe(true)
  })

  it('DATABASES.main.port como string é coagido a número, nunca vaza string pro Sequelize', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: { host: 'h', port: '3306', database: 'db', username: 'u', password: 'p', dialectOptions: { ssl: false } },
    })

    expect(loadConfig(env).database.port).toBe(3306)
  })

  it('DATABASES com dialectOptions.ssl: false recua a TLS', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: {
        host: 'aiven-host.example',
        port: 3306,
        database: 'db',
        username: 'u',
        password: 'p',
        dialectOptions: { ssl: false },
      },
    })

    expect(loadConfig(env).database.dialectOptions).toEqual({})
  })

  it('recusa inicialização se jwtSecret contiver placeholder INFORME_AQUI_', () => {
    const env = validEnv()
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'INFORME_AQUI_JWT_SECRET' },
      pluggy: { webhookUrl: 'https://pluggy.test/webhooks/pluggy' },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/contains placeholder/)
  })

  it('recusa inicialização se senha do banco contiver placeholder INFORME_AQUI_', () => {
    const env = validEnv()
    env.DATABASES = JSON.stringify({
      main: {
        host: '127.0.0.1',
        port: 3306,
        database: 'db',
        username: 'root',
        password: 'INFORME_AQUI_SENHA_BANCO',
        dialectOptions: { ssl: false },
      },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/contains placeholder/)
  })

  it('recusa em produção se jwtSecret for o default local de desenvolvimento', () => {
    const env = validEnv()
    env.NODE_ENV = 'production'
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'dev-jwt-secret-somente-para-ambiente-local' },
      pluggy: { webhookUrl: 'https://pluggy.prod/webhooks/pluggy' },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/default local\/example value not allowed outside development/)
  })

  it('recusa em staging se jwtSecret for o default local de desenvolvimento', () => {
    const env = validEnv()
    env.NODE_ENV = 'staging'
    env.CONFIG = JSON.stringify({
      http: { port: 3003, jwtSecret: 'dev-jwt-secret-somente-para-ambiente-local' },
      pluggy: { webhookUrl: 'https://pluggy.prod/webhooks/pluggy' },
    })

    expect(reasonOf(() => loadConfig(env))).toMatch(/default local\/example value not allowed outside development/)
  })
})
