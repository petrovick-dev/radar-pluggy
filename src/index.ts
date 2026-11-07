import { createHttpServer } from './infra/http/http-server.js'
import { setupContainer } from './infra/bootstrap/register.js'
import { drainPluggyWebhookEvents } from './infra/worker/webhook-drainer.js'
import { loadConfig } from './infra/config/config.js'

// Composition root do processo — primeiro entrypoint real deste serviço. Migration roda como
// `preDeploy` do Railway (`.railway/railway.ts`), container separado, antes deste processo subir;
// este arquivo nunca chama sync(). `loadConfig()` recusa alto, nomeando toda variável obrigatória
// ausente ou malformada, antes de qualquer container ou conexão existir.
const config = loadConfig()

// Container do processo: é dele que sai todo fluxo, inclusive a conexão com o banco (`db`, singleton
// via `getModels()`). Nenhum model, repositório ou caso de uso é construído à mão aqui.
const container = setupContainer(config)
const logger = container.resolve('logger')

const app = createHttpServer({
  jwtSecret: config.jwtSecret,
  corsAllowedOrigins: config.corsAllowedOrigins,
  sessionIntrospection: config.sessionIntrospection,
  container,
})

const server = app.listen(config.port, () => {
  logger.info(`pluggy-connector ouvindo na porta ${config.port}`)

  // Recuperação no boot (tasks.md 7.3): evento que já recebeu 2xx mas não terminou de processar
  // — porque o processo caiu no meio — volta a ser processado aqui. Não é cron: roda uma vez, na
  // subida, e o gatilho normal continua sendo a notificação da Pluggy.
  void drainPluggyWebhookEvents(container, 'BOOT_RECOVERY')
    .then((processed) => {
      if (processed > 0) {
        logger.info(`pluggy-connector drenou ${processed} evento(s) pendente(s) no boot`, { count: processed })
      }
    })
    .catch((error: unknown) => {
      logger.error('falha ao drenar eventos pendentes no boot', { err: error })
    })
})

// Encerramento gracioso: para de aceitar conexão nova e espera a requisição em voo responder
// antes de sair — sem timeout de força, a exemplo do `oplab-radar-api`. A drenagem de webhook
// disparada em background (`drainInBackground`, depois de cada 2xx) não é esperada aqui de
// propósito: é desenhada para ser interrompida e retomada (lease com expiração, tasks.md 7.2) —
// morrer no meio devolve o evento à fila no boot seguinte, não perde nem duplica trabalho.
let shuttingDown = false
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  logger.info(`pluggy-connector recebeu ${signal}, encerrando`)
  server.close((err) => {
    if (err) {
      logger.error('falha ao encerrar o servidor HTTP', { err })
    }
    // Envia o que ainda está no buffer do OpenSearch (quando ligado) antes de sair.
    void container.resolve('logWriter').close().finally(() => process.exit(err ? 1 : 0))
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
