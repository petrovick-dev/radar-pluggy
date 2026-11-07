import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenSearchLogShipper } from '../../../../src/infra/tools/log/opensearch-log-shipper.js'

type Sent = { url: string; headers: Record<string, string>; body: string }

function fakeFetch(response: { ok?: boolean; status?: number; json?: unknown } = {}) {
  const sent: Sent[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: init.body as string })
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json ?? { errors: false },
    } as Response
  })
  return { sent, fetchImpl: fetchImpl as unknown as typeof fetch }
}

function shipper(fetchImpl: typeof fetch, maxBatchSize = 200, maxBufferedLines = 5000): OpenSearchLogShipper {
  return new OpenSearchLogShipper({
    url: 'https://avnadmin:s%40nha@opensearch.test:12345',
    index: 'radar-pluggy-logs-staging',
    maxBatchSize,
    maxBufferedLines,
    flushIntervalMs: 60_000,
    fetchImpl,
  })
}

function only(sent: Sent[]): Sent {
  expect(sent).toHaveLength(1)
  return sent[0] as Sent
}

function documents(body: string): Record<string, unknown>[] {
  return body.trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('OpenSearchLogShipper', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia ao _bulk da origem, com Basic da URL decodificada, ação create no índice e o @timestamp da escrita', async () => {
    const { sent, fetchImpl } = fakeFetch()
    const writer = shipper(fetchImpl)

    writer.write('info', JSON.stringify({ level: 'info', message: 'subiu' }))
    await writer.close()

    const request = only(sent)
    expect(request.url).toBe('https://opensearch.test:12345/_bulk')
    expect(request.headers.authorization).toBe(`Basic ${Buffer.from('avnadmin:s@nha').toString('base64')}`)
    expect(request.headers['content-type']).toBe('application/x-ndjson')
    expect(documents(request.body)).toEqual([
      { create: { _index: 'radar-pluggy-logs-staging' } },
      { '@timestamp': expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/), level: 'info', message: 'subiu' },
    ])
  })

  it('envia sozinho ao completar um lote, sem esperar o intervalo', async () => {
    const { sent, fetchImpl } = fakeFetch()
    const writer = shipper(fetchImpl, 2)

    writer.write('info', '{"message":"a"}')
    expect(sent).toHaveLength(0)
    writer.write('info', '{"message":"b"}')
    await vi.waitFor(() => expect(sent).toHaveLength(1))

    expect(documents(only(sent).body)).toHaveLength(4)
    await writer.close()
  })

  it('close envia o que ficou abaixo do tamanho de lote', async () => {
    const { sent, fetchImpl } = fakeFetch()
    const writer = shipper(fetchImpl, 10)

    writer.write('info', '{"message":"a"}')
    writer.write('info', '{"message":"b"}')
    writer.write('info', '{"message":"c"}')
    expect(sent).toHaveLength(0)
    await writer.close()

    expect(documents(only(sent).body)).toHaveLength(6)
  })

  it('buffer cheio descarta as linhas mais antigas e avisa no stderr', async () => {
    const { sent, fetchImpl } = fakeFetch()
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const writer = shipper(fetchImpl, 10, 2)

    writer.write('info', '{"message":"a"}')
    writer.write('info', '{"message":"b"}')
    writer.write('info', '{"message":"c"}')
    await writer.close()

    expect(stderr).toHaveBeenCalledWith('OpenSearch log buffer overflow, dropping 1 oldest line(s)')
    expect(documents(only(sent).body).filter((d) => 'message' in d).map((d) => d.message)).toEqual(['b', 'c'])
  })

  it.each([
    ['HTTP não-2xx', { ok: false, status: 401 }, 'Error sending logs to OpenSearch (Aiven): HTTP 401'],
    ['200 com documentos recusados', { json: { errors: true } }, 'OpenSearch (Aiven) rejected some log lines in the bulk request'],
  ])('%s vai para o stderr, sem retentar', async (_case, response, message) => {
    const { sent, fetchImpl } = fakeFetch(response)
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const writer = shipper(fetchImpl)

    writer.write('error', '{"message":"falhou"}')
    await writer.close()

    expect(stderr).toHaveBeenCalledWith(message)
    expect(sent).toHaveLength(1)
  })

  it('falha de rede vai para o stderr e não derruba quem escreveu o log', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const writer = shipper(fetchImpl)

    writer.write('info', '{"message":"a"}')
    await expect(writer.close()).resolves.toBeUndefined()

    expect(stderr).toHaveBeenCalledWith('Error sending logs to OpenSearch (Aiven)', 'ECONNREFUSED')
  })

  it('envia sozinho ao fim do intervalo, mesmo sem completar um lote', async () => {
    vi.useFakeTimers()
    try {
      const { sent, fetchImpl } = fakeFetch()
      const writer = new OpenSearchLogShipper({ url: 'https://u:p@opensearch.test:1', index: 'i', flushIntervalMs: 2000, fetchImpl })

      writer.write('info', '{"message":"a"}')
      await vi.advanceTimersByTimeAsync(1999)
      expect(sent).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1)

      expect(documents(only(sent).body)).toHaveLength(2)
      await writer.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('close espera o envio que já saiu do buffer e ainda está em voo', async () => {
    let release: () => void = () => {}
    const fetchImpl = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return { ok: true, status: 200, json: async () => ({ errors: false }) } as Response
    }) as unknown as typeof fetch
    const writer = shipper(fetchImpl, 1)

    // Espera o envio começar: aí o buffer já está vazio e só o envio em voo segura o close.
    writer.write('info', '{"message":"a"}')
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    let closed = false
    const closing = writer.close().then(() => { closed = true })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(closed).toBe(false)
    release()
    await closing
    expect(closed).toBe(true)
  })

  it('escrita depois do close vai para o stderr, nunca some', async () => {
    const { sent, fetchImpl } = fakeFetch()
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const writer = shipper(fetchImpl)
    await writer.close()

    writer.write('warn', '{"message":"tarde"}')
    await writer.close()

    expect(stderr).toHaveBeenCalledWith('{"message":"tarde"}')
    expect(sent).toHaveLength(0)
  })

  it('envio pendurado é abortado pelo timeout e o close termina', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })) as unknown as typeof fetch
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const writer = new OpenSearchLogShipper({
      url: 'https://u:p@opensearch.test:1', index: 'i', flushIntervalMs: 60_000, requestTimeoutMs: 20, fetchImpl,
    })

    writer.write('info', '{"message":"a"}')
    await writer.close()

    expect(stderr).toHaveBeenCalledWith('Error sending logs to OpenSearch (Aiven)', expect.stringMatching(/timeout|aborted/i))
  })
})
