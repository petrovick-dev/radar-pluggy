import { ApplicationError } from '../shared/application-error.js'

// Conjunto documentado em docs.pluggy.ai/docs/item-lifecycle — é o campo `status` do Item que
// decide o que o resto do sistema faz com ele (ver design.md, decisão D4, sobre por que
// `executionStatus` NÃO entra nesse mesmo rigor).
const VALID_STATUSES = ['UPDATING', 'LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT', 'UPDATED'] as const

export type PluggyItemStatus = (typeof VALID_STATUSES)[number]

// Único ponto de entrada de dado externo (webhook futuro, gateway futuro): a checagem de tipo
// já barra um objeto-literal com campo extra, mas isso não pega uma variável/objeto espalhado
// (`{...payload, personId}`) — por isso o guard roda também em runtime, nomeando o campo que
// não pertence a este registro (spec: "Credencial da Pluggy nunca é persistida por este registro").
const ALLOWED_CREATE_FIELDS = new Set(['itemId', 'personId', 'status', 'executionStatus'])

interface CreatePluggyItemProps {
  itemId: string
  personId: number | undefined
  status: string
  executionStatus?: string
}

export class PluggyItem {
  private constructor(
    private readonly itemId: string,
    private readonly personId: number,
    private status: PluggyItemStatus,
    private executionStatus: string | undefined,
    private lastUpdatedAt: Date | undefined,
  ) {}

  static create(props: CreatePluggyItemProps): PluggyItem {
    assertNoUnexpectedFields(props)
    if (props.personId === undefined) {
      throw new ApplicationError('PLUGGY_ITEM_PERSON_ID_MISSING', { itemId: props.itemId })
    }
    assertValidStatus(props.status)
    return new PluggyItem(props.itemId, props.personId, props.status, props.executionStatus, undefined)
  }

  // Reconstrói a partir de uma linha já persistida (fronteira model → entity do repositório) —
  // nunca aciona a invariante de avanço de `advanceWatermark`, porque não é uma atualização de
  // negócio, é carregar de volta um estado que já passou pela validação quando foi salvo.
  static reconstitute(props: {
    itemId: string
    personId: number
    status: string
    executionStatus: string | undefined
    lastUpdatedAt: Date | undefined
  }): PluggyItem {
    assertValidStatus(props.status)
    return new PluggyItem(props.itemId, props.personId, props.status, props.executionStatus, props.lastUpdatedAt)
  }

  updateStatus(newStatus: string, executionStatus: string | undefined): void {
    assertValidStatus(newStatus)
    this.status = newStatus
    this.executionStatus = executionStatus
  }

  advanceWatermark(lastUpdatedAt: Date): void {
    if (this.lastUpdatedAt !== undefined && lastUpdatedAt.getTime() < this.lastUpdatedAt.getTime()) {
      throw new ApplicationError('PLUGGY_ITEM_WATERMARK_REGRESSION', {
        itemId: this.itemId,
        current: this.lastUpdatedAt,
        attempted: lastUpdatedAt,
      })
    }
    this.lastUpdatedAt = lastUpdatedAt
  }

  getItemId(): string {
    return this.itemId
  }

  getPersonId(): number {
    return this.personId
  }

  getStatus(): PluggyItemStatus {
    return this.status
  }

  getExecutionStatus(): string | undefined {
    return this.executionStatus
  }

  getLastUpdatedAt(): Date | undefined {
    return this.lastUpdatedAt
  }
}

function assertValidStatus(status: string): asserts status is PluggyItemStatus {
  if (!VALID_STATUSES.includes(status as PluggyItemStatus)) {
    throw new ApplicationError('PLUGGY_ITEM_STATUS_UNKNOWN', { status })
  }
}

function assertNoUnexpectedFields(props: object): void {
  const forbidden = Object.keys(props).filter((key) => !ALLOWED_CREATE_FIELDS.has(key))
  if (forbidden.length > 0) {
    throw new ApplicationError('PLUGGY_ITEM_UNEXPECTED_FIELD', { fields: forbidden })
  }
}
