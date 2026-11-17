import type { Decimal } from 'decimal.js'
import { ApplicationError } from '../shared/application-error.js'

// Vocabulário fechado de `creditData` (SDK `account.d.ts`), validado pelo gateway de borda na entrada.
// Comentado nas colunas `status`/`holder_type` de `radar_pluggy_accounts` (modelagem-de-dados).
export const CREDIT_STATUS_VALUES = ['ACTIVE', 'BLOCKED', 'CANCELLED'] as const
export type CreditStatus = (typeof CREDIT_STATUS_VALUES)[number]

export const CREDIT_HOLDER_TYPES = ['MAIN', 'ADDITIONAL'] as const
export type CreditHolderType = (typeof CREDIT_HOLDER_TYPES)[number]

const ALLOWED_CREATE_FIELDS = new Set([
  'itemId',
  'accountId',
  'type',
  'subtype',
  'number',
  'name',
  'marketingName',
  'balance',
  'currencyCode',
  'owner',
  'providerCreatedAt',
  'providerUpdatedAt',
  'level',
  'brand',
  'brandAdditionalInfo',
  'balanceCloseDate',
  'balanceDueDate',
  'availableCreditLimit',
  'balanceForeignCurrency',
  'minimumPayment',
  'creditLimit',
  'isLimitFlexible',
  'status',
  'holderType',
  'taxNumber',
  'bankData',
  'disaggregatedCreditLimits',
])

export interface CreatePluggyAccountProps {
  itemId: string
  accountId: string
  type: string
  subtype?: string | undefined
  number: string
  name: string
  marketingName?: string | undefined
  balance: Decimal
  currencyCode: string
  owner?: string | undefined
  providerCreatedAt: Date
  providerUpdatedAt: Date
  // Campos de `CreditData` (SDK `pluggy-sdk`, `account.d.ts`), presentes só quando a conta é do tipo
  // `CREDIT` e a Pluggy devolve `creditData` não nulo.
  level?: string | undefined
  brand?: string | undefined
  brandAdditionalInfo?: string | undefined
  balanceCloseDate?: Date | undefined
  balanceDueDate?: Date | undefined
  availableCreditLimit?: Decimal | undefined
  balanceForeignCurrency?: Decimal | undefined
  minimumPayment?: Decimal | undefined
  creditLimit?: Decimal | undefined
  isLimitFlexible?: boolean | undefined
  status?: CreditStatus | undefined
  holderType?: CreditHolderType | undefined
  // Campos capturados na change pluggy-complete-data-capture (spec pluggy-account) — antes
  // descartados no gateway antes de chegar aqui. `taxNumber` é CPF/CNPJ do titular — decisão
  // explícita do usuário. `bankData`/`disaggregatedCreditLimits` são objetos aninhados complexos do
  // fornecedor, carregados inteiros (mesmo tratamento de `merchant`/`paymentData` em
  // pluggy-account-transaction.ts): sem tipagem campo a campo, sem lógica de negócio nossa em cima.
  taxNumber?: string | undefined
  bankData?: Record<string, unknown> | undefined
  disaggregatedCreditLimits?: Record<string, unknown>[] | undefined
}

export class PluggyAccount {
  private readonly itemId: string
  private readonly accountId: string
  private readonly type: string
  private readonly subtype: string | undefined
  private readonly number: string
  private readonly name: string
  private readonly marketingName: string | undefined
  private readonly balance: Decimal
  private readonly currencyCode: string
  private readonly owner: string | undefined
  private readonly providerCreatedAt: Date
  private readonly providerUpdatedAt: Date
  private readonly level: string | undefined
  private readonly brand: string | undefined
  private readonly brandAdditionalInfo: string | undefined
  private readonly balanceCloseDate: Date | undefined
  private readonly balanceDueDate: Date | undefined
  private readonly availableCreditLimit: Decimal | undefined
  private readonly balanceForeignCurrency: Decimal | undefined
  private readonly minimumPayment: Decimal | undefined
  private readonly creditLimit: Decimal | undefined
  private readonly isLimitFlexible: boolean | undefined
  private readonly status: CreditStatus | undefined
  private readonly holderType: CreditHolderType | undefined
  private readonly taxNumber: string | undefined
  private readonly bankData: Record<string, unknown> | undefined
  private readonly disaggregatedCreditLimits: Record<string, unknown>[] | undefined

  // Recebe `props` por nome, não por posição: com 12 campos de crédito opcionais — quatro `Decimal`
  // e três `string` consecutivos —, um construtor posicional deixaria uma transposição entre dois
  // parâmetros compilar sem erro e gravar dado financeiro trocado em silêncio.
  private constructor(props: CreatePluggyAccountProps) {
    this.itemId = props.itemId
    this.accountId = props.accountId
    this.type = props.type
    this.subtype = props.subtype
    this.number = props.number
    this.name = props.name
    this.marketingName = props.marketingName
    this.balance = props.balance
    this.currencyCode = props.currencyCode
    this.owner = props.owner
    this.providerCreatedAt = props.providerCreatedAt
    this.providerUpdatedAt = props.providerUpdatedAt
    this.level = props.level
    this.brand = props.brand
    this.brandAdditionalInfo = props.brandAdditionalInfo
    this.balanceCloseDate = props.balanceCloseDate
    this.balanceDueDate = props.balanceDueDate
    this.availableCreditLimit = props.availableCreditLimit
    this.balanceForeignCurrency = props.balanceForeignCurrency
    this.minimumPayment = props.minimumPayment
    this.creditLimit = props.creditLimit
    this.isLimitFlexible = props.isLimitFlexible
    this.status = props.status
    this.holderType = props.holderType
    this.taxNumber = props.taxNumber
    this.bankData = props.bankData
    this.disaggregatedCreditLimits = props.disaggregatedCreditLimits
  }

  static create(props: CreatePluggyAccountProps): PluggyAccount {
    assertNoUnexpectedFields(props)
    assertPresent(props.itemId, 'PLUGGY_ACCOUNT_ITEM_ID_MISSING')
    assertPresent(props.accountId, 'PLUGGY_ACCOUNT_ACCOUNT_ID_MISSING')
    assertPresent(props.type, 'PLUGGY_ACCOUNT_TYPE_MISSING')
    assertPresent(props.number, 'PLUGGY_ACCOUNT_NUMBER_MISSING')
    assertPresent(props.name, 'PLUGGY_ACCOUNT_NAME_MISSING')
    assertPresent(props.currencyCode, 'PLUGGY_ACCOUNT_CURRENCY_CODE_MISSING')

    if (props.balance === undefined || props.balance === null) {
      throw new ApplicationError('PLUGGY_ACCOUNT_BALANCE_MISSING', { accountId: props.accountId })
    }
    if (props.providerCreatedAt === undefined || props.providerCreatedAt === null || Number.isNaN(props.providerCreatedAt.getTime())) {
      throw new ApplicationError('PLUGGY_ACCOUNT_PROVIDER_CREATED_AT_MISSING', { accountId: props.accountId })
    }
    if (props.providerUpdatedAt === undefined || props.providerUpdatedAt === null || Number.isNaN(props.providerUpdatedAt.getTime())) {
      throw new ApplicationError('PLUGGY_ACCOUNT_PROVIDER_UPDATED_AT_MISSING', { accountId: props.accountId })
    }

    return new PluggyAccount(props)
  }

  static reconstitute(props: CreatePluggyAccountProps): PluggyAccount {
    return new PluggyAccount(props)
  }

  getItemId(): string {
    return this.itemId
  }

  getAccountId(): string {
    return this.accountId
  }

  getType(): string {
    return this.type
  }

  getSubtype(): string | undefined {
    return this.subtype
  }

  getNumber(): string {
    return this.number
  }

  getName(): string {
    return this.name
  }

  getMarketingName(): string | undefined {
    return this.marketingName
  }

  getBalance(): Decimal {
    return this.balance
  }

  getCurrencyCode(): string {
    return this.currencyCode
  }

  getOwner(): string | undefined {
    return this.owner
  }

  getProviderCreatedAt(): Date {
    return this.providerCreatedAt
  }

  getProviderUpdatedAt(): Date {
    return this.providerUpdatedAt
  }

  getLevel(): string | undefined {
    return this.level
  }

  getBrand(): string | undefined {
    return this.brand
  }

  getBrandAdditionalInfo(): string | undefined {
    return this.brandAdditionalInfo
  }

  getBalanceCloseDate(): Date | undefined {
    return this.balanceCloseDate
  }

  getBalanceDueDate(): Date | undefined {
    return this.balanceDueDate
  }

  getAvailableCreditLimit(): Decimal | undefined {
    return this.availableCreditLimit
  }

  getBalanceForeignCurrency(): Decimal | undefined {
    return this.balanceForeignCurrency
  }

  getMinimumPayment(): Decimal | undefined {
    return this.minimumPayment
  }

  getCreditLimit(): Decimal | undefined {
    return this.creditLimit
  }

  getIsLimitFlexible(): boolean | undefined {
    return this.isLimitFlexible
  }

  getStatus(): CreditStatus | undefined {
    return this.status
  }

  getHolderType(): CreditHolderType | undefined {
    return this.holderType
  }

  getTaxNumber(): string | undefined {
    return this.taxNumber
  }

  getBankData(): Record<string, unknown> | undefined {
    return this.bankData
  }

  getDisaggregatedCreditLimits(): Record<string, unknown>[] | undefined {
    return this.disaggregatedCreditLimits
  }
}

function assertPresent(value: string | undefined, errorType: string): void {
  if (!value || value.trim().length === 0) {
    throw new ApplicationError(errorType)
  }
}

function assertNoUnexpectedFields(props: object): void {
  const forbidden = Object.keys(props).filter((key) => !ALLOWED_CREATE_FIELDS.has(key))
  if (forbidden.length > 0) {
    throw new ApplicationError('PLUGGY_ACCOUNT_UNEXPECTED_FIELD', { fields: forbidden })
  }
}
