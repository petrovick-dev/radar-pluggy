import { Decimal } from 'decimal.js'
import { ApplicationError } from '../../shared/application-error.js'
import { pluggySdkError, toDateOrUndefined, type PluggyConnectorClient } from './pluggy-client.gateway.js'

const CREDIT_STATUS_VALUES = ['ACTIVE', 'BLOCKED', 'CANCELLED'] as const
type CreditStatus = (typeof CREDIT_STATUS_VALUES)[number]

const CREDIT_HOLDER_TYPES = ['MAIN', 'ADDITIONAL'] as const
type CreditHolderType = (typeof CREDIT_HOLDER_TYPES)[number]

export interface PluggyAccountDto {
  accountId: string
  itemId: string
  type: string
  subtype: string | undefined
  number: string
  name: string
  marketingName: string | undefined
  balance: Decimal
  currencyCode: string
  owner: string | undefined
  providerCreatedAt: Date
  providerUpdatedAt: Date
  // `CreditData` (SDK `account.d.ts`), presente só quando `account.type === 'CREDIT'` e a Pluggy
  // devolve `creditData` não nulo (conta `BANK` sempre traz `creditData: null`). Cada campo é
  // individualmente nulo/ausente conforme o que a instituição reporta; ausência aqui não é erro.
  // `disaggregatedCreditLimits` fica de fora de propósito: lista aninhada complexa, só devolvida por
  // conector Open Finance — fora do escopo desta tarefa.
  level: string | undefined
  brand: string | undefined
  brandAdditionalInfo: string | undefined
  balanceCloseDate: Date | undefined
  balanceDueDate: Date | undefined
  availableCreditLimit: Decimal | undefined
  balanceForeignCurrency: Decimal | undefined
  minimumPayment: Decimal | undefined
  creditLimit: Decimal | undefined
  isLimitFlexible: boolean | undefined
  status: CreditStatus | undefined
  holderType: CreditHolderType | undefined
}

export interface PluggyAccountsPageDto {
  results: PluggyAccountDto[]
  page: number
  total: number
  totalPages: number
}

interface PluggyAccountsResponse {
  results?: unknown
  page?: unknown
  total?: unknown
  totalPages?: unknown
}

export class PluggyAccountsGateway {
  async fetchAccountsPage(
    itemId: string,
    client: PluggyConnectorClient,
    page = 1,
    pageSize = 500,
  ): Promise<PluggyAccountsPageDto> {
    if (!Number.isInteger(page) || page < 1) {
      throw new ApplicationError('PLUGGY_ACCOUNTS_INVALID_PAGE', { itemId, page })
    }

    let data: PluggyAccountsResponse
    try {
      // `fetchAccountsPage` e não `client.fetchAccounts`: o método do SDK não aceita `page`/`pageSize`
      // e prenderia a descoberta na primeira página (ver `pluggy-client.gateway.ts`).
      data = (await client.fetchAccountsPage(itemId, page, pageSize)) as PluggyAccountsResponse
    } catch (error) {
      throw pluggySdkError(
        error,
        {
          timeout: 'PLUGGY_ACCOUNTS_TIMEOUT',
          unavailable: 'PLUGGY_ACCOUNTS_UNAVAILABLE',
          upstream: 'PLUGGY_ACCOUNTS_UPSTREAM_ERROR',
        },
        { itemId },
      )
    }

    return this.parseAccountsPage(itemId, data, page)
  }

  // Percorre a paginação inteira **sem acumular nada**: cada página é entregue ao chamador na hora, e
  // só a próxima é buscada quando ele pede a seguinte. Satisfaz D6 ("o gateway devolve uma página por
  // vez; o interactor itera e persiste página a página") e a 6.1 ("persiste cada página imediatamente"),
  // que um método devolvendo a lista completa no fim não conseguiria cumprir. O laço e a checagem de
  // `totalPages` estável ficam aqui, num lugar só, em vez de reescritos em cada interactor.
  async *fetchAccountPages(itemId: string, client: PluggyConnectorClient): AsyncGenerator<PluggyAccountsPageDto> {
    const firstPage = await this.fetchAccountsPage(itemId, client, 1)
    yield firstPage

    for (let page = 2; page <= firstPage.totalPages; page++) {
      const nextPage = await this.fetchAccountsPage(itemId, client, page)
      if (nextPage.totalPages !== firstPage.totalPages) {
        throw new ApplicationError('PLUGGY_ACCOUNTS_TOTAL_PAGES_CHANGED', {
          itemId,
          expectedTotalPages: firstPage.totalPages,
          receivedTotalPages: nextPage.totalPages,
        })
      }
      yield nextPage
    }
  }

  private parseAccountsPage(
    itemId: string,
    data: PluggyAccountsResponse,
    requestedPage: number,
  ): PluggyAccountsPageDto {

    // Envelope paginado é obrigatório: o dump real de `/accounts` (design.md, tabela de rotas) sempre
    // traz `results`/`page`/`totalPages`. Aceitar array puro, ou tratar `page`/`totalPages` como
    // opcionais com default 1, seria ler só a primeira página em silêncio quando a resposta viesse
    // numa forma inesperada — o oposto da recusa nomeada que o spec exige. Mesma rigidez de
    // `pluggy-investments.gateway.ts`.
    if (!Array.isArray(data.results)) {
      throw new ApplicationError('PLUGGY_ACCOUNTS_RESPONSE_INVALID', { itemId, field: 'results' })
    }
    const rawResults: unknown[] = data.results

    if (typeof data.page !== 'number' || !Number.isInteger(data.page)) {
      throw new ApplicationError('PLUGGY_ACCOUNTS_RESPONSE_INVALID', { itemId, field: 'page' })
    }
    if (data.page !== requestedPage) {
      throw new ApplicationError('PLUGGY_ACCOUNTS_PAGE_MISMATCH', {
        itemId,
        expectedPage: requestedPage,
        receivedPage: data.page,
      })
    }
    const page = data.page

    if (typeof data.totalPages !== 'number' || !Number.isInteger(data.totalPages) || data.totalPages < 0) {
      throw new ApplicationError('PLUGGY_ACCOUNTS_RESPONSE_INVALID', { itemId, field: 'totalPages' })
    }
    const totalPages = data.totalPages

    if (typeof data.total !== 'number' || !Number.isInteger(data.total) || data.total < 0) {
      throw new ApplicationError('PLUGGY_ACCOUNTS_RESPONSE_INVALID', { itemId, field: 'total' })
    }
    const total = data.total

    const results = rawResults.map((raw, index) => this.toDto(itemId, index, raw))

    return {
      results,
      page,
      total,
      totalPages,
    }
  }

  private toDto(itemId: string, index: number, raw: unknown): PluggyAccountDto {
    if (typeof raw !== 'object' || raw === null) {
      throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field: 'root' })
    }
    const account = raw as Record<string, unknown>

    const accountId = requireString(account.id, itemId, index, 'id')
    const type = requireString(account.type, itemId, index, 'type')
    const name = requireString(account.name, itemId, index, 'name')
    const number = requireString(account.number, itemId, index, 'number')
    const currencyCode = requireString(account.currencyCode, itemId, index, 'currencyCode')
    const balance = requireDecimal(account.balance, itemId, index, 'balance')
    const providerCreatedAt = requireDate(account.createdAt, itemId, index, 'createdAt')
    const providerUpdatedAt = requireDate(account.updatedAt, itemId, index, 'updatedAt')
    const creditData = readCreditData(itemId, index, account.creditData)

    return {
      accountId,
      itemId,
      type,
      name,
      number,
      currencyCode,
      balance,
      providerCreatedAt,
      providerUpdatedAt,
      subtype: optionalString(account.subtype, itemId, index, 'subtype'),
      marketingName: optionalString(account.marketingName, itemId, index, 'marketingName'),
      owner: optionalString(account.owner, itemId, index, 'owner'),
      level: optionalString(creditData?.level, itemId, index, 'creditData.level'),
      brand: optionalString(creditData?.brand, itemId, index, 'creditData.brand'),
      brandAdditionalInfo: optionalString(
        creditData?.brandAdditionalInfo,
        itemId,
        index,
        'creditData.brandAdditionalInfo',
      ),
      balanceCloseDate: optionalDate(creditData?.balanceCloseDate, itemId, index, 'creditData.balanceCloseDate'),
      balanceDueDate: optionalDate(creditData?.balanceDueDate, itemId, index, 'creditData.balanceDueDate'),
      availableCreditLimit: optionalDecimal(
        creditData?.availableCreditLimit,
        itemId,
        index,
        'creditData.availableCreditLimit',
      ),
      balanceForeignCurrency: optionalDecimal(
        creditData?.balanceForeignCurrency,
        itemId,
        index,
        'creditData.balanceForeignCurrency',
      ),
      minimumPayment: optionalDecimal(creditData?.minimumPayment, itemId, index, 'creditData.minimumPayment'),
      creditLimit: optionalDecimal(creditData?.creditLimit, itemId, index, 'creditData.creditLimit'),
      isLimitFlexible: optionalBoolean(creditData?.isLimitFlexible, itemId, index, 'creditData.isLimitFlexible'),
      status: optionalEnum(creditData?.status, CREDIT_STATUS_VALUES, itemId, index, 'creditData.status'),
      holderType: optionalEnum(creditData?.holderType, CREDIT_HOLDER_TYPES, itemId, index, 'creditData.holderType'),
    }
  }
}

function requireString(value: unknown, itemId: string, index: number, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return value
}

function requireDecimal(value: unknown, itemId: string, index: number, field: string): Decimal {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return new Decimal(String(value))
}

function requireDate(value: unknown, itemId: string, index: number, field: string): Date {
  // Aceita as duas formas: o SDK converte para `Date` só quando a string tinha
  // milissegundo (padroes-de-engenharia, 3b.1). Ilegível recusa, nunca vira `undefined`.
  const date = toDateOrUndefined(value)
  if (date === undefined) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return date
}

function optionalString(value: unknown, itemId: string, index: number, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return value
}

function optionalDecimal(value: unknown, itemId: string, index: number, field: string): Decimal | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return new Decimal(String(value))
}

function optionalDate(value: unknown, itemId: string, index: number, field: string): Date | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  const date = toDateOrUndefined(value)
  if (date === undefined) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return date
}

function optionalBoolean(value: unknown, itemId: string, index: number, field: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'boolean') {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return value
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  itemId: string,
  index: number,
  field: string,
): T | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field })
  }
  return value as T
}

// `creditData` só existe (não nulo) em conta `CREDIT`; conta `BANK` sempre traz `null`. Presente e
// não sendo objeto é resposta mal formada — recusa nomeada, nunca lida como ausência.
function readCreditData(itemId: string, index: number, raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) {
    return undefined
  }
  if (typeof raw !== 'object') {
    throw new ApplicationError('PLUGGY_ACCOUNT_RESPONSE_INVALID', { itemId, index, field: 'creditData' })
  }
  return raw as Record<string, unknown>
}
