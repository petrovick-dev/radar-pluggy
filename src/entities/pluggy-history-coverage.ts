import { ApplicationError } from '../shared/application-error.js'

const ALLOWED_REFERENCE_TYPES = new Set(['ACCOUNT', 'INVESTMENT'])
const ALLOWED_CREATE_FIELDS = new Set([
  'itemId',
  'referenceId',
  'referenceType',
  'oldestObservedTransactionAt',
  'newestObservedTransactionAt',
  'observedTransactionCount',
  'sourceUpdatedAt',
  'lastCompletedScanAt',
])

export interface CreatePluggyHistoryCoverageProps {
  itemId: string
  referenceId: string
  referenceType: 'ACCOUNT' | 'INVESTMENT'
  oldestObservedTransactionAt?: Date | undefined
  newestObservedTransactionAt?: Date | undefined
  observedTransactionCount: number
  sourceUpdatedAt?: Date | undefined
  lastCompletedScanAt: Date
}

// Uma página já persistida de uma fonte, do jeito que o caso de uso a recebe do gateway.
export interface ObservedPage {
  count: number
  oldestAt: Date | undefined
  newestAt: Date | undefined
}

// A varredura em andamento: acumula o que foi observado página a página, com o mesmo invariante que
// `PluggyHistoryCoverage.create` cobra no fim — contagem zero não tem datas, e a mais antiga nunca
// passa da mais nova. Antes isto era `observedCount +=` mais duas funções soltas dentro do interactor,
// e o invariante só era conferido depois da última página (arquitetura-camadas, regra 3).
//
// Imutável: `observe` devolve uma varredura nova, então não existe acumulador meio preenchido que
// alguém possa gravar por engano.
export class ObservedHistoryScan {
  private constructor(
    private readonly count: number,
    private readonly oldestAt: Date | undefined,
    private readonly newestAt: Date | undefined,
  ) {}

  static empty(): ObservedHistoryScan {
    return new ObservedHistoryScan(0, undefined, undefined)
  }

  observe(page: ObservedPage): ObservedHistoryScan {
    if (!Number.isInteger(page.count) || page.count < 0) {
      throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_INVALID_COUNT', { count: page.count })
    }
    if (page.count === 0) {
      if (page.oldestAt !== undefined || page.newestAt !== undefined) {
        throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_EMPTY_SCAN_CANNOT_HAVE_DATES', {})
      }
      return this
    }
    if (page.oldestAt === undefined || page.newestAt === undefined) {
      throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_DATES_MISSING_FOR_NON_EMPTY_SCAN', {})
    }

    return new ObservedHistoryScan(
      this.count + page.count,
      earliest(this.oldestAt, page.oldestAt),
      latest(this.newestAt, page.newestAt),
    )
  }

  getCount(): number { return this.count }
  getOldestAt(): Date | undefined { return this.oldestAt }
  getNewestAt(): Date | undefined { return this.newestAt }
}

function earliest(current: Date | undefined, candidate: Date): Date {
  if (current === undefined) return candidate
  return candidate.getTime() < current.getTime() ? candidate : current
}

function latest(current: Date | undefined, candidate: Date): Date {
  if (current === undefined) return candidate
  return candidate.getTime() > current.getTime() ? candidate : current
}

export class PluggyHistoryCoverage {
  private constructor(
    private readonly itemId: string,
    private readonly referenceId: string,
    private readonly referenceType: 'ACCOUNT' | 'INVESTMENT',
    private readonly oldestObservedTransactionAt: Date | undefined,
    private readonly newestObservedTransactionAt: Date | undefined,
    private readonly observedTransactionCount: number,
    private readonly sourceUpdatedAt: Date | undefined,
    private readonly lastCompletedScanAt: Date,
  ) {}

  static create(props: CreatePluggyHistoryCoverageProps): PluggyHistoryCoverage {
    assertNoUnexpectedFields(props)
    assertPresent(props.itemId, 'PLUGGY_HISTORY_COVERAGE_ITEM_ID_MISSING')
    assertPresent(props.referenceId, 'PLUGGY_HISTORY_COVERAGE_REFERENCE_ID_MISSING')

    if (!ALLOWED_REFERENCE_TYPES.has(props.referenceType)) {
      throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_REFERENCE_TYPE_INVALID', { referenceType: props.referenceType })
    }

    if (!Number.isInteger(props.observedTransactionCount) || props.observedTransactionCount < 0) {
      throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_INVALID_COUNT', { count: props.observedTransactionCount })
    }

    if (props.lastCompletedScanAt === undefined || props.lastCompletedScanAt === null || Number.isNaN(props.lastCompletedScanAt.getTime())) {
      throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_LAST_COMPLETED_SCAN_AT_MISSING', { referenceId: props.referenceId })
    }

    // Varredura vazia guarda contagem zero e datas nulas; não é período coberto (design.md D5)
    if (props.observedTransactionCount === 0) {
      if (props.oldestObservedTransactionAt !== undefined || props.newestObservedTransactionAt !== undefined) {
        throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_EMPTY_SCAN_CANNOT_HAVE_DATES', { referenceId: props.referenceId })
      }
    } else {
      if (props.oldestObservedTransactionAt === undefined || props.newestObservedTransactionAt === undefined) {
        throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_DATES_MISSING_FOR_NON_EMPTY_SCAN', { referenceId: props.referenceId })
      }
      if (props.oldestObservedTransactionAt.getTime() > props.newestObservedTransactionAt.getTime()) {
        throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_INVALID_INTERVAL', {
          referenceId: props.referenceId,
          oldest: props.oldestObservedTransactionAt.toISOString(),
          newest: props.newestObservedTransactionAt.toISOString(),
        })
      }
    }

    return new PluggyHistoryCoverage(
      props.itemId,
      props.referenceId,
      props.referenceType,
      props.oldestObservedTransactionAt,
      props.newestObservedTransactionAt,
      props.observedTransactionCount,
      props.sourceUpdatedAt,
      props.lastCompletedScanAt,
    )
  }

  static reconstitute(props: CreatePluggyHistoryCoverageProps): PluggyHistoryCoverage {
    return new PluggyHistoryCoverage(
      props.itemId,
      props.referenceId,
      props.referenceType,
      props.oldestObservedTransactionAt,
      props.newestObservedTransactionAt,
      props.observedTransactionCount,
      props.sourceUpdatedAt,
      props.lastCompletedScanAt,
    )
  }

  getItemId(): string { return this.itemId }
  getReferenceId(): string { return this.referenceId }
  getReferenceType(): 'ACCOUNT' | 'INVESTMENT' { return this.referenceType }
  getOldestObservedTransactionAt(): Date | undefined { return this.oldestObservedTransactionAt }
  getNewestObservedTransactionAt(): Date | undefined { return this.newestObservedTransactionAt }
  getObservedTransactionCount(): number { return this.observedTransactionCount }
  getSourceUpdatedAt(): Date | undefined { return this.sourceUpdatedAt }
  getLastCompletedScanAt(): Date { return this.lastCompletedScanAt }
}

function assertPresent(value: string | undefined, errorType: string): void {
  if (!value || value.trim().length === 0) {
    throw new ApplicationError(errorType)
  }
}

function assertNoUnexpectedFields(props: object): void {
  const forbidden = Object.keys(props).filter((key) => !ALLOWED_CREATE_FIELDS.has(key))
  if (forbidden.length > 0) {
    throw new ApplicationError('PLUGGY_HISTORY_COVERAGE_UNEXPECTED_FIELD', { fields: forbidden })
  }
}
