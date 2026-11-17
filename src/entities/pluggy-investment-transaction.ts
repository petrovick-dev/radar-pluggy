import type { Decimal } from 'decimal.js'
import { ApplicationError } from '../shared/application-error.js'

const ALLOWED_TYPES = new Set(['BUY', 'SELL', 'TAX', 'TRANSFER', 'INTEREST', 'AMORTIZATION'])

const ALLOWED_CREATE_FIELDS = new Set([
  'itemId',
  'investmentId',
  'transactionId',
  'type',
  'movementType',
  'quantity',
  'value',
  'amount',
  'netAmount',
  'priceFactor',
  'indexerPercentage',
  'agreedRate',
  'date',
  'tradeDate',
  'description',
  'brokerageNumber',
  'serviceTax',
  'brokerageFee',
  'incomeTax',
  'tradingAssetsNoticeFee',
  'maintenanceFee',
  'settlementFee',
  'clearingFee',
  'stockExchangeFee',
  'custodyFee',
  'operatingFee',
  'other',
  'iof',
  'iofProvision',
])

export interface CreatePluggyInvestmentTransactionProps {
  itemId: string
  investmentId: string
  transactionId: string
  type: string
  movementType?: string | undefined
  quantity?: Decimal | undefined
  value?: Decimal | undefined
  amount?: Decimal | undefined
  netAmount?: Decimal | undefined
  priceFactor?: Decimal | undefined
  indexerPercentage?: Decimal | undefined
  agreedRate?: Decimal | undefined
  date: Date
  tradeDate?: Date | undefined
  description?: string | undefined
  brokerageNumber?: string | undefined
  serviceTax?: Decimal | undefined
  brokerageFee?: Decimal | undefined
  incomeTax?: Decimal | undefined
  tradingAssetsNoticeFee?: Decimal | undefined
  maintenanceFee?: Decimal | undefined
  settlementFee?: Decimal | undefined
  clearingFee?: Decimal | undefined
  stockExchangeFee?: Decimal | undefined
  custodyFee?: Decimal | undefined
  operatingFee?: Decimal | undefined
  other?: Decimal | undefined
  iof?: Decimal | undefined
  iofProvision?: Decimal | undefined
}

export class PluggyInvestmentTransaction {
  private constructor(
    private readonly itemId: string,
    private readonly investmentId: string,
    private readonly transactionId: string,
    private readonly type: string,
    private readonly movementType: string | undefined,
    private readonly quantity: Decimal | undefined,
    private readonly value: Decimal | undefined,
    private readonly amount: Decimal | undefined,
    private readonly netAmount: Decimal | undefined,
    private readonly priceFactor: Decimal | undefined,
    private readonly indexerPercentage: Decimal | undefined,
    private readonly agreedRate: Decimal | undefined,
    private readonly date: Date,
    private readonly tradeDate: Date | undefined,
    private readonly description: string | undefined,
    private readonly brokerageNumber: string | undefined,
    private readonly serviceTax: Decimal | undefined,
    private readonly brokerageFee: Decimal | undefined,
    private readonly incomeTax: Decimal | undefined,
    private readonly tradingAssetsNoticeFee: Decimal | undefined,
    private readonly maintenanceFee: Decimal | undefined,
    private readonly settlementFee: Decimal | undefined,
    private readonly clearingFee: Decimal | undefined,
    private readonly stockExchangeFee: Decimal | undefined,
    private readonly custodyFee: Decimal | undefined,
    private readonly operatingFee: Decimal | undefined,
    private readonly other: Decimal | undefined,
    private readonly iof: Decimal | undefined,
    private readonly iofProvision: Decimal | undefined,
  ) {}

  static create(props: CreatePluggyInvestmentTransactionProps): PluggyInvestmentTransaction {
    assertNoUnexpectedFields(props)
    assertPresent(props.itemId, 'PLUGGY_INVESTMENT_TRANSACTION_ITEM_ID_MISSING')
    assertPresent(props.investmentId, 'PLUGGY_INVESTMENT_TRANSACTION_INVESTMENT_ID_MISSING')
    assertPresent(props.transactionId, 'PLUGGY_INVESTMENT_TRANSACTION_TRANSACTION_ID_MISSING')
    assertPresent(props.type, 'PLUGGY_INVESTMENT_TRANSACTION_TYPE_MISSING')

    if (!ALLOWED_TYPES.has(props.type)) {
      throw new ApplicationError('PLUGGY_INVESTMENT_TRANSACTION_TYPE_INVALID', { type: props.type })
    }
    if (props.date === undefined || props.date === null || Number.isNaN(props.date.getTime())) {
      throw new ApplicationError('PLUGGY_INVESTMENT_TRANSACTION_DATE_MISSING', { transactionId: props.transactionId })
    }

    return new PluggyInvestmentTransaction(
      props.itemId,
      props.investmentId,
      props.transactionId,
      props.type,
      props.movementType,
      props.quantity,
      props.value,
      props.amount,
      props.netAmount,
      props.priceFactor,
      props.indexerPercentage,
      props.agreedRate,
      props.date,
      props.tradeDate,
      props.description,
      props.brokerageNumber,
      props.serviceTax,
      props.brokerageFee,
      props.incomeTax,
      props.tradingAssetsNoticeFee,
      props.maintenanceFee,
      props.settlementFee,
      props.clearingFee,
      props.stockExchangeFee,
      props.custodyFee,
      props.operatingFee,
      props.other,
      props.iof,
      props.iofProvision,
    )
  }

  static reconstitute(props: CreatePluggyInvestmentTransactionProps): PluggyInvestmentTransaction {
    return new PluggyInvestmentTransaction(
      props.itemId,
      props.investmentId,
      props.transactionId,
      props.type,
      props.movementType,
      props.quantity,
      props.value,
      props.amount,
      props.netAmount,
      props.priceFactor,
      props.indexerPercentage,
      props.agreedRate,
      props.date,
      props.tradeDate,
      props.description,
      props.brokerageNumber,
      props.serviceTax,
      props.brokerageFee,
      props.incomeTax,
      props.tradingAssetsNoticeFee,
      props.maintenanceFee,
      props.settlementFee,
      props.clearingFee,
      props.stockExchangeFee,
      props.custodyFee,
      props.operatingFee,
      props.other,
      props.iof,
      props.iofProvision,
    )
  }

  getItemId(): string { return this.itemId }
  getInvestmentId(): string { return this.investmentId }
  getTransactionId(): string { return this.transactionId }
  getType(): string { return this.type }
  getMovementType(): string | undefined { return this.movementType }
  getQuantity(): Decimal | undefined { return this.quantity }
  getValue(): Decimal | undefined { return this.value }
  getAmount(): Decimal | undefined { return this.amount }
  getNetAmount(): Decimal | undefined { return this.netAmount }
  getPriceFactor(): Decimal | undefined { return this.priceFactor }
  getIndexerPercentage(): Decimal | undefined { return this.indexerPercentage }
  getAgreedRate(): Decimal | undefined { return this.agreedRate }
  getDate(): Date { return this.date }
  getTradeDate(): Date | undefined { return this.tradeDate }
  getDescription(): string | undefined { return this.description }
  getBrokerageNumber(): string | undefined { return this.brokerageNumber }
  getServiceTax(): Decimal | undefined { return this.serviceTax }
  getBrokerageFee(): Decimal | undefined { return this.brokerageFee }
  getIncomeTax(): Decimal | undefined { return this.incomeTax }
  getTradingAssetsNoticeFee(): Decimal | undefined { return this.tradingAssetsNoticeFee }
  getMaintenanceFee(): Decimal | undefined { return this.maintenanceFee }
  getSettlementFee(): Decimal | undefined { return this.settlementFee }
  getClearingFee(): Decimal | undefined { return this.clearingFee }
  getStockExchangeFee(): Decimal | undefined { return this.stockExchangeFee }
  getCustodyFee(): Decimal | undefined { return this.custodyFee }
  getOperatingFee(): Decimal | undefined { return this.operatingFee }
  getOther(): Decimal | undefined { return this.other }
  getIof(): Decimal | undefined { return this.iof }
  getIofProvision(): Decimal | undefined { return this.iofProvision }
}

function assertPresent(value: string | undefined, errorType: string): void {
  if (!value || value.trim().length === 0) {
    throw new ApplicationError(errorType)
  }
}

function assertNoUnexpectedFields(props: object): void {
  const forbidden = Object.keys(props).filter((key) => !ALLOWED_CREATE_FIELDS.has(key))
  if (forbidden.length > 0) {
    throw new ApplicationError('PLUGGY_INVESTMENT_TRANSACTION_UNEXPECTED_FIELD', { fields: forbidden })
  }
}
