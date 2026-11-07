import { ApplicationError } from '../../../shared/application-error.js'

// Superfície consumida por DefaultInteractorGatewayImpl e módulos infra.
// Garante que nenhum dado sensível (senhas, segredos, tokens, SQL ou parâmetros de banco)
// seja serializado nos logs através de allowlist estrita de campos e tratamento seguro de erros.
export interface Logger {
  addContext(context: Record<string, unknown>): void
  info(message: string, extra?: unknown): void
  warn(message: string, extra?: unknown): void
  error(message: string, extra?: unknown): void
}

export type LogLevel = 'info' | 'warn' | 'error'

// Destino das linhas já sanitizadas. Um por processo (`logWriter` no container): stdout em ambiente
// local, OpenSearch nos demais (`opensearch-log-shipper.ts`). `write` é propriedade (não método)
// para poder ser passado solto a `createLogger`.
export interface LogWriter {
  readonly write: (level: LogLevel, line: string) => void
  close(): Promise<void>
}

export const consoleLogWriter: LogWriter = {
  write: (level, line) => {
    if (level === 'error') {
      console.error(line)
      return
    }
    if (level === 'warn') {
      console.warn(line)
      return
    }
    console.log(line)
  },
  close: async () => {},
}

const ALLOWED_CONTEXT_KEYS = new Set([
  'uuid',
  'requestId',
  'messageType',
  'itemId',
  'credentialId',
  'personId',
  'durationMs',
  'event',
  'produto',
])

const ALLOWED_EXTRA_KEYS = new Set([
  'sourcesScanned',
  'transactionsObserved',
  'sourcesRefused',
  'executionStatus',
  'count',
  'provisioned',
  'updated',
  'failed',
  'errorType',
  'name',
  'code',
  'status',
  'field',
  'credentialId',
  'itemId',
  'personId',
])

const ALLOWED_DETAIL_KEYS = new Set([
  'itemId',
  'credentialId',
  'personId',
  'field',
  'status',
  'errorType',
])

function sanitizeError(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') {
    return { errorType: 'UNKNOWN_ERROR' }
  }

  if (err instanceof ApplicationError || ('errorType' in err && typeof (err as { errorType: unknown }).errorType === 'string')) {
    const appErr = err as ApplicationError
    const sanitizedDetails: Record<string, unknown> = {}
    if (appErr.details && typeof appErr.details === 'object') {
      for (const [key, value] of Object.entries(appErr.details)) {
        if (ALLOWED_DETAIL_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
          sanitizedDetails[key] = value
        }
      }
    }
    return {
      errorType: appErr.errorType,
      ...(Object.keys(sanitizedDetails).length > 0 ? { details: sanitizedDetails } : {}),
    }
  }

  const genericErr = err as { name?: unknown; code?: unknown; original?: { code?: unknown } }
  const name = typeof genericErr.name === 'string' ? genericErr.name : 'Error'
  const code = genericErr.original?.code ?? genericErr.code

  return {
    name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
  }
}

function sanitizeExtra(extra: unknown): unknown {
  if (extra === undefined || extra === null) {
    return undefined
  }

  if (extra instanceof Error) {
    return sanitizeError(extra)
  }

  if (typeof extra !== 'object' || Array.isArray(extra)) {
    return undefined
  }

  const result: Record<string, unknown> = {}
  const record = extra as Record<string, unknown>

  if ('err' in record) {
    result.error = sanitizeError(record.err)
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === 'err') continue
    if (ALLOWED_EXTRA_KEYS.has(key)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value
      } else if (Array.isArray(value)) {
        result[key] = value.filter((item) => typeof item === 'string' || typeof item === 'number')
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (ALLOWED_CONTEXT_KEYS.has(key)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value
      }
    }
  }
  return result
}

export function createLogger(writer: LogWriter['write']): Logger {
  let context: Record<string, unknown> = {}

  const write = (level: LogLevel, message: string, extra?: unknown): void => {
    const safeContext = sanitizeContext(context)
    const safeExtra = sanitizeExtra(extra)
    const payload: Record<string, unknown> = {
      level,
      message,
      ...safeContext,
    }
    if (safeExtra !== undefined) {
      payload.extra = safeExtra
    }

    writer(level, JSON.stringify(payload))
  }

  return {
    addContext(next: Record<string, unknown>): void {
      context = { ...context, ...next }
    },
    info(message: string, extra?: unknown): void {
      write('info', message, extra)
    },
    warn(message: string, extra?: unknown): void {
      write('warn', message, extra)
    },
    error(message: string, extra?: unknown): void {
      write('error', message, extra)
    },
  }
}
