import type { LogLevel, LogWriter } from './logger.js'

export type OpenSearchLogShipperOptions = {
  /** `https://usuario:senha@host:porta` — a credencial Basic vem da própria URL, como no `oplab-radar-api`. */
  url: string
  index: string
  maxBatchSize?: number
  flushIntervalMs?: number
  maxBufferedLines?: number
  requestTimeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_MAX_BATCH_SIZE = 200
const DEFAULT_FLUSH_INTERVAL_MS = 2000
const DEFAULT_MAX_BUFFERED_LINES = 5000
// O encerramento do processo espera o último envio (`close()`); sem teto, um OpenSearch pendurado
// seguraria o processo vivo pelo timeout padrão do fetch, que é de minutos.
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

// Cópia dos logs no OpenSearch do Aiven (API `_bulk`), mesmo desenho do `opensearch-log-shipper.ts`
// do `oplab-radar-api`; o stdout continua recebendo tudo (`tee-log-writer.ts`).
//
// Falha de envio não é retentada: o lote é perdido e o motivo vai para o stderr, único canal que
// sobra quando o próprio destino de log falhou.
export class OpenSearchLogShipper implements LogWriter {
  private readonly bulkUrl: string
  private readonly authorizationHeader: string
  private readonly index: string
  private readonly maxBatchSize: number
  private readonly maxBufferedLines: number
  private readonly requestTimeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly timer: NodeJS.Timeout
  private buffer: string[] = []
  // Envios encadeados: um de cada vez, e `close()` sabe esperar o que já saiu do buffer e ainda
  // está em voo (o `splice` acontece antes do `await fetch`).
  private sending: Promise<void> = Promise.resolve()

  constructor(options: OpenSearchLogShipperOptions) {
    const parsedUrl = new URL(options.url)
    this.authorizationHeader = `Basic ${Buffer.from(
      `${decodeURIComponent(parsedUrl.username)}:${decodeURIComponent(parsedUrl.password)}`,
    ).toString('base64')}`
    this.bulkUrl = `${parsedUrl.origin}/_bulk`
    this.index = options.index
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
    this.maxBufferedLines = options.maxBufferedLines ?? DEFAULT_MAX_BUFFERED_LINES
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timer = setInterval(() => void this.flush(), options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS)
    // O timer de envio não segura o processo vivo; quem garante o último lote é `close()`.
    this.timer.unref()
  }

  // Arrow function: `createLogger(logWriter.write)` passa o método solto, sem `this` de quem chama.
  // A linha já é JSON gerado pelo `createLogger`; aqui só ganha o instante em que foi escrita, que o
  // OpenSearch precisa para ordenar e o stdout nunca precisou (a plataforma carimba a hora).
  readonly write = (_level: LogLevel, line: string): void => {
    this.buffer.push(JSON.stringify({ '@timestamp': new Date().toISOString(), ...JSON.parse(line) }))

    if (this.buffer.length > this.maxBufferedLines) {
      const overflow = this.buffer.length - this.maxBufferedLines
      this.buffer.splice(0, overflow)
      console.error(`OpenSearch log buffer overflow, dropping ${overflow} oldest line(s)`)
    }

    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush()
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer)
    while (this.buffer.length > 0) {
      await this.flush()
    }
    await this.sending
  }

  private flush(): Promise<void> {
    this.sending = this.sending.then(() => this.sendNextBatch())
    return this.sending
  }

  private async sendNextBatch(): Promise<void> {
    if (this.buffer.length === 0) return

    const lines = this.buffer.splice(0, this.maxBatchSize)
    const action = JSON.stringify({ create: { _index: this.index } })
    const body = lines.map((line) => `${action}\n${line}\n`).join('')

    try {
      const response = await this.fetchImpl(this.bulkUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-ndjson', authorization: this.authorizationHeader },
        body,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })
      if (!response.ok) {
        console.error(`Error sending logs to OpenSearch (Aiven): HTTP ${response.status}`)
        return
      }
      // `_bulk` responde 200 mesmo quando documentos individuais são recusados (ex.: mapeamento
      // incompatível) — a recusa vem em `errors: true` no corpo.
      const result = (await response.json()) as { errors?: boolean }
      if (result.errors) {
        console.error('OpenSearch (Aiven) rejected some log lines in the bulk request')
      }
    } catch (err) {
      console.error('Error sending logs to OpenSearch (Aiven)', err instanceof Error ? err.message : err)
    }
  }
}
