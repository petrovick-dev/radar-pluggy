import { asClass, asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix'
import type { Transaction } from 'sequelize'
import { getModels, type DB } from '../db/models.js'
import type { Config } from '../config/config.js'
import { consoleLogWriter, createLogger, type Logger, type LogWriter } from '../tools/log/logger.js'
import { OpenSearchLogShipper } from '../tools/log/opensearch-log-shipper.js'
import { PluggyClientGateway } from '../../adapters/gateways/pluggy-client.gateway.js'
import { PluggyCallRecorder } from '../../adapters/gateways/pluggy-call-recorder.js'
import { PluggyItemsGateway } from '../../adapters/gateways/pluggy-items.gateway.js'
import { PluggyInvestmentsGateway } from '../../adapters/gateways/pluggy-investments.gateway.js'
import { PluggyLoansGateway } from '../../adapters/gateways/pluggy-loans.gateway.js'
import { PluggyConsentsGateway } from '../../adapters/gateways/pluggy-consents.gateway.js'
import SyncPluggyPositionImpl from '../../adapters/gateways/pluggy-position/sync-pluggy-position.impl.js'
import LoadPluggyHistoryImpl from '../../adapters/gateways/pluggy-history/load-pluggy-history.impl.js'
import { PluggyItemCredentialResolver } from '../../adapters/gateways/pluggy-item-credential.resolver.js'
import { PluggyPersonItemResolver } from '../../adapters/gateways/pluggy-person-item.resolver.js'
import { PluggyWebhookProvisioner } from '../../adapters/gateways/pluggy-webhook.provisioner.js'
import ReadPluggyPositionImpl from '../../adapters/gateways/pluggy-position/read-pluggy-position.impl.js'
import ReadPluggyAccountImpl from '../../adapters/gateways/pluggy-account/read-pluggy-account.impl.js'
import ReadPluggyAccountStatementImpl from '../../adapters/gateways/pluggy-account-transaction/read-pluggy-account-statement.impl.js'
import { PluggyAccountsGateway } from '../../adapters/gateways/pluggy-accounts.gateway.js'
import { PluggyAccountTransactionsGateway } from '../../adapters/gateways/pluggy-account-transactions.gateway.js'
import { PluggyInvestmentTransactionsGateway } from '../../adapters/gateways/pluggy-investment-transactions.gateway.js'
import { PluggyAccountRep } from '../../adapters/repositories/pluggy-account.rep.js'
import { PluggyAccountTransactionRep } from '../../adapters/repositories/pluggy-account-transaction.rep.js'
import { PluggyInvestmentTransactionRep } from '../../adapters/repositories/pluggy-investment-transaction.rep.js'
import { PluggyHistoryCoverageRep } from '../../adapters/repositories/pluggy-history-coverage.rep.js'
import { PluggySyncProgressRep } from '../../adapters/repositories/pluggy-sync-progress.rep.js'
import { PluggyWebhookEventRep } from '../../adapters/repositories/pluggy-webhook-event.rep.js'
import { PluggyItemIngestionLeaseRep } from '../../adapters/repositories/pluggy-item-ingestion-lease.rep.js'
import { PluggyItemObservationRep } from '../../adapters/repositories/pluggy-item-observation.rep.js'
import { PluggyItemStateResolver } from '../../adapters/gateways/pluggy-item-state.resolver.js'
import { PluggyWebhooksGateway } from '../../adapters/gateways/pluggy-webhooks.gateway.js'
import AcceptPluggyWebhookImpl from '../../adapters/gateways/pluggy-webhook/accept-pluggy-webhook.impl.js'
import RegisterPluggyCredentialImpl from '../../adapters/gateways/pluggy-credential/register-pluggy-credential.impl.js'
import CheckPluggyCredentialImpl from '../../adapters/gateways/pluggy-credential/check-pluggy-credential.impl.js'
import ReconcilePluggyWebhookImpl from '../../adapters/gateways/pluggy-webhook/reconcile-pluggy-webhook.impl.js'
import { PluggyItemRep } from '../../adapters/repositories/pluggy-item.rep.js'
import { PluggyCredentialRep } from '../../adapters/repositories/pluggy-credential.rep.js'
import { PluggyCredentialItemRep } from '../../adapters/repositories/pluggy-credential-item.rep.js'
import { PersonRep } from '../../adapters/repositories/person.rep.js'
import { PluggyPositionRep } from '../../adapters/repositories/pluggy-position.rep.js'
import { PluggyPositionSnapshotRep } from '../../adapters/repositories/pluggy-position-snapshot.rep.js'
import { PluggyLoanRep } from '../../adapters/repositories/pluggy-loan.rep.js'
import { PluggyLoanSnapshotRep } from '../../adapters/repositories/pluggy-loan-snapshot.rep.js'
import { PluggyConsentRep } from '../../adapters/repositories/pluggy-consent.rep.js'
import { PluggyItemRawRep } from '../../adapters/repositories/pluggy-item-raw.rep.js'
import { PluggyConsentRawRep } from '../../adapters/repositories/pluggy-consent-raw.rep.js'
import { PluggyPositionRawRep } from '../../adapters/repositories/pluggy-position-raw.rep.js'
import { PluggyAccountRawRep } from '../../adapters/repositories/pluggy-account-raw.rep.js'
import { PluggyAccountTransactionRawRep } from '../../adapters/repositories/pluggy-account-transaction-raw.rep.js'
import { PluggyInvestmentTransactionRawRep } from '../../adapters/repositories/pluggy-investment-transaction-raw.rep.js'
import { PluggyLoanRawRep } from '../../adapters/repositories/pluggy-loan-raw.rep.js'
import { SyncPluggyPositionInteractor } from '../../interactors/pluggy-position/sync/sync-pluggy-position.interactor.js'
import { ReadPluggyPositionInteractor } from '../../interactors/pluggy-position/read/read-pluggy-position.interactor.js'
import { ReadPluggyAccountInteractor } from '../../interactors/pluggy-account/read/read-pluggy-account.interactor.js'
import { ReadPluggyAccountStatementInteractor } from '../../interactors/pluggy-account-transaction/read/read-pluggy-account-statement.interactor.js'
import { LoadPluggyHistoryInteractor } from '../../interactors/pluggy-history/load/load-pluggy-history.interactor.js'
import { AcceptPluggyWebhookInteractor } from '../../interactors/pluggy-webhook/accept/accept-pluggy-webhook.interactor.js'
import { ReconcilePluggyWebhookInteractor } from '../../interactors/pluggy-webhook/reconcile/reconcile-pluggy-webhook.interactor.js'
import { RegisterPluggyCredentialInteractor } from '../../interactors/pluggy-credential/register/register-pluggy-credential.interactor.js'
import { CheckPluggyCredentialInteractor } from '../../interactors/pluggy-credential/check/check-pluggy-credential.interactor.js'
import CheckHealthImpl from '../../adapters/gateways/health/check-health.impl.js'
import { CheckHealthInteractor } from '../../interactors/health/check/check-health.interactor.js'

export type GetTransaction = (name: string) => Transaction | null
export type SetTransaction = (name: string, transaction: Transaction | null) => void

// Bag tipada que todo construtor de interactor, impl de gateway e repositório recebe — mesmo contrato
// do `AppContainer` do `oplab-radar-api` (`infra/bootstrap/register.ts`). Nome de chave aqui é o nome
// de registro no container: `params.syncPluggyPositionImpl` resolve o que estiver registrado com essa
// chave abaixo.
export type AppContainer = {
  rootContainer: AppContainerInstance
  db: DB
  // Destino único das linhas de log do processo: stdout em ambiente local, OpenSearch nos demais.
  logWriter: LogWriter
  logger: Logger
  getTransaction: GetTransaction
  setTransaction: SetTransaction
  requestId: string
  // URL pública HTTPS deste serviço para o webhook (design.md D7). Valor de configuração, não
  // segredo: o segredo é por credencial, cifrado no banco.
  webhookUrl: string
  // Chave que cifra/decifra client_secret/webhook_secret em `pluggy-credential.rep.ts` — já
  // validada por `infra/config/config.ts`, nunca lida de `process.env` no ponto de uso.
  credentialEncryptionKey: string

  /** Interactor */
  syncPluggyPositionInteractor: SyncPluggyPositionInteractor
  readPluggyPositionInteractor: ReadPluggyPositionInteractor
  readPluggyAccountInteractor: ReadPluggyAccountInteractor
  readPluggyAccountStatementInteractor: ReadPluggyAccountStatementInteractor
  loadPluggyHistoryInteractor: LoadPluggyHistoryInteractor
  acceptPluggyWebhookInteractor: AcceptPluggyWebhookInteractor
  reconcilePluggyWebhookInteractor: ReconcilePluggyWebhookInteractor
  registerPluggyCredentialInteractor: RegisterPluggyCredentialInteractor
  checkPluggyCredentialInteractor: CheckPluggyCredentialInteractor
  checkHealthInteractor: CheckHealthInteractor

  /** Gateway de caso de uso (impl) */
  syncPluggyPositionImpl: SyncPluggyPositionImpl
  readPluggyPositionImpl: ReadPluggyPositionImpl
  readPluggyAccountImpl: ReadPluggyAccountImpl
  readPluggyAccountStatementImpl: ReadPluggyAccountStatementImpl
  loadPluggyHistoryImpl: LoadPluggyHistoryImpl
  acceptPluggyWebhookImpl: AcceptPluggyWebhookImpl
  reconcilePluggyWebhookImpl: ReconcilePluggyWebhookImpl
  registerPluggyCredentialImpl: RegisterPluggyCredentialImpl
  checkPluggyCredentialImpl: CheckPluggyCredentialImpl
  checkHealthImpl: CheckHealthImpl

  /** Gateway de borda (Pluggy) */
  pluggyClientGateway: PluggyClientGateway
  pluggyCallRecorder: PluggyCallRecorder
  pluggyItemsGateway: PluggyItemsGateway
  pluggyInvestmentsGateway: PluggyInvestmentsGateway
  pluggyLoansGateway: PluggyLoansGateway
  pluggyConsentsGateway: PluggyConsentsGateway
  pluggyAccountsGateway: PluggyAccountsGateway
  pluggyAccountTransactionsGateway: PluggyAccountTransactionsGateway
  pluggyInvestmentTransactionsGateway: PluggyInvestmentTransactionsGateway
  pluggyWebhooksGateway: PluggyWebhooksGateway

  /** Colaborador compartilhado entre impls (arquitetura-camadas, 2.3.1) */
  pluggyItemCredentialResolver: PluggyItemCredentialResolver
  pluggyItemStateResolver: PluggyItemStateResolver
  pluggyPersonItemResolver: PluggyPersonItemResolver
  pluggyWebhookProvisioner: PluggyWebhookProvisioner

  /** Repositório */
  personRep: PersonRep
  pluggyItemRep: PluggyItemRep
  pluggyCredentialRep: PluggyCredentialRep
  pluggyCredentialItemRep: PluggyCredentialItemRep
  pluggyPositionRep: PluggyPositionRep
  pluggyPositionSnapshotRep: PluggyPositionSnapshotRep
  pluggyLoanRep: PluggyLoanRep
  pluggyLoanSnapshotRep: PluggyLoanSnapshotRep
  pluggyAccountRep: PluggyAccountRep
  pluggyAccountTransactionRep: PluggyAccountTransactionRep
  pluggyInvestmentTransactionRep: PluggyInvestmentTransactionRep
  pluggyHistoryCoverageRep: PluggyHistoryCoverageRep
  pluggySyncProgressRep: PluggySyncProgressRep
  pluggyWebhookEventRep: PluggyWebhookEventRep
  pluggyItemIngestionLeaseRep: PluggyItemIngestionLeaseRep
  pluggyItemObservationRep: PluggyItemObservationRep
  pluggyConsentRep: PluggyConsentRep
  pluggyItemRawRep: PluggyItemRawRep
  pluggyConsentRawRep: PluggyConsentRawRep
  pluggyPositionRawRep: PluggyPositionRawRep
  pluggyAccountRawRep: PluggyAccountRawRep
  pluggyAccountTransactionRawRep: PluggyAccountTransactionRawRep
  pluggyInvestmentTransactionRawRep: PluggyInvestmentTransactionRawRep
  pluggyLoanRawRep: PluggyLoanRawRep
}

export type AppContainerInstance = AwilixContainer<AppContainer>

export function setupContainer(config: Config): AppContainerInstance {
  const container = createContainer<AppContainer>({
    injectionMode: InjectionMode.PROXY,
  })

  container.register({
    // Config já validada por `infra/config.ts` — nenhum default aqui, ausência recusou na subida.
    db: asFunction(() => getModels(config.database)).singleton(),
    // Singleton: um buffer de envio por processo, fechado no encerramento (`src/index.ts`).
    logWriter: asFunction(() => (config.openSearchLog
      ? new OpenSearchLogShipper(config.openSearchLog)
      : consoleLogWriter)).singleton(),
    // Wrapper explícito, nunca `asFunction(createLogger)` direto: o `InjectionMode.PROXY` deste
    // container passaria o cradle inteiro (um objeto) como `writer`, e o primeiro
    // `logger.info/warn/error` quebraria com "writer is not a function" (achado em produção:
    // crashava no primeiro log do boot, `index.ts`).
    logger: asFunction(({ logWriter }: AppContainer) => createLogger(logWriter.write)).scoped(),
    webhookUrl: asValue(config.webhookUrl),
    credentialEncryptionKey: asValue(config.credentialEncryptionKey),

    // Gateways de borda da Pluggy: sem estado e sem configuração própria desde a adoção do
    // `pluggy-sdk` (o transporte é dele), então entram por `asClass`. Recebem o cliente já
    // autenticado por parâmetro, nunca api key.
    // Singleton porque o cache de cliente (e, dentro dele, a api key do SDK) precisa sobreviver
    // ao escopo da unidade de trabalho — ver `pluggy-client.gateway.ts`.
    // Singleton de verdade (D31) — nunca `.scoped()`: precisa sobreviver a toda unidade de trabalho,
    // igual ao cache de cliente de `PluggyClientGateway`. Resolvido ANTES de `pluggyClientGateway`
    // porque este o injeta em todo cliente que constrói (D1).
    pluggyCallRecorder: asClass(PluggyCallRecorder).singleton(),
    pluggyClientGateway: asFunction(
      ({ pluggyCallRecorder }: AppContainer) => new PluggyClientGateway({ pluggyCallRecorder }),
    ).singleton(),
    pluggyItemsGateway: asClass(PluggyItemsGateway).singleton(),
    pluggyInvestmentsGateway: asClass(PluggyInvestmentsGateway).singleton(),
    pluggyLoansGateway: asClass(PluggyLoansGateway).singleton(),
    pluggyConsentsGateway: asClass(PluggyConsentsGateway).singleton(),
    pluggyAccountsGateway: asClass(PluggyAccountsGateway).singleton(),
    pluggyAccountTransactionsGateway: asClass(PluggyAccountTransactionsGateway).singleton(),
    pluggyInvestmentTransactionsGateway: asClass(PluggyInvestmentTransactionsGateway).singleton(),
    pluggyItemCredentialResolver: asClass(PluggyItemCredentialResolver).scoped(),
    pluggyItemStateResolver: asClass(PluggyItemStateResolver).scoped(),
    pluggyPersonItemResolver: asClass(PluggyPersonItemResolver).scoped(),
    pluggyWebhookProvisioner: asClass(PluggyWebhookProvisioner).scoped(),
    pluggyWebhooksGateway: asClass(PluggyWebhooksGateway).singleton(),

    personRep: asClass(PersonRep).scoped(),
    pluggyItemRep: asClass(PluggyItemRep).scoped(),
    pluggyCredentialRep: asClass(PluggyCredentialRep).scoped(),
    pluggyCredentialItemRep: asClass(PluggyCredentialItemRep).scoped(),
    pluggyPositionRep: asClass(PluggyPositionRep).scoped(),
    pluggyPositionSnapshotRep: asClass(PluggyPositionSnapshotRep).scoped(),
    pluggyLoanRep: asClass(PluggyLoanRep).scoped(),
    pluggyLoanSnapshotRep: asClass(PluggyLoanSnapshotRep).scoped(),
    pluggyAccountRep: asClass(PluggyAccountRep).scoped(),
    pluggyAccountTransactionRep: asClass(PluggyAccountTransactionRep).scoped(),
    pluggyInvestmentTransactionRep: asClass(PluggyInvestmentTransactionRep).scoped(),
    pluggyHistoryCoverageRep: asClass(PluggyHistoryCoverageRep).scoped(),
    pluggySyncProgressRep: asClass(PluggySyncProgressRep).scoped(),
    pluggyWebhookEventRep: asClass(PluggyWebhookEventRep).scoped(),
    pluggyItemIngestionLeaseRep: asClass(PluggyItemIngestionLeaseRep).scoped(),
    pluggyItemObservationRep: asClass(PluggyItemObservationRep).scoped(),
    pluggyConsentRep: asClass(PluggyConsentRep).scoped(),
    pluggyItemRawRep: asClass(PluggyItemRawRep).scoped(),
    pluggyConsentRawRep: asClass(PluggyConsentRawRep).scoped(),
    pluggyPositionRawRep: asClass(PluggyPositionRawRep).scoped(),
    pluggyAccountRawRep: asClass(PluggyAccountRawRep).scoped(),
    pluggyAccountTransactionRawRep: asClass(PluggyAccountTransactionRawRep).scoped(),
    pluggyInvestmentTransactionRawRep: asClass(PluggyInvestmentTransactionRawRep).scoped(),
    pluggyLoanRawRep: asClass(PluggyLoanRawRep).scoped(),

    syncPluggyPositionImpl: asClass(SyncPluggyPositionImpl).scoped(),
    readPluggyPositionImpl: asClass(ReadPluggyPositionImpl).scoped(),
    readPluggyAccountImpl: asClass(ReadPluggyAccountImpl).scoped(),
    readPluggyAccountStatementImpl: asClass(ReadPluggyAccountStatementImpl).scoped(),
    loadPluggyHistoryImpl: asClass(LoadPluggyHistoryImpl).scoped(),
    acceptPluggyWebhookImpl: asClass(AcceptPluggyWebhookImpl).scoped(),
    reconcilePluggyWebhookImpl: asClass(ReconcilePluggyWebhookImpl).scoped(),
    registerPluggyCredentialImpl: asClass(RegisterPluggyCredentialImpl).scoped(),
    checkPluggyCredentialImpl: asClass(CheckPluggyCredentialImpl).scoped(),
    checkHealthImpl: asClass(CheckHealthImpl).scoped(),

    syncPluggyPositionInteractor: asClass(SyncPluggyPositionInteractor).scoped(),
    readPluggyPositionInteractor: asClass(ReadPluggyPositionInteractor).scoped(),
    readPluggyAccountInteractor: asClass(ReadPluggyAccountInteractor).scoped(),
    readPluggyAccountStatementInteractor: asClass(ReadPluggyAccountStatementInteractor).scoped(),
    loadPluggyHistoryInteractor: asClass(LoadPluggyHistoryInteractor).scoped(),
    acceptPluggyWebhookInteractor: asClass(AcceptPluggyWebhookInteractor).scoped(),
    reconcilePluggyWebhookInteractor: asClass(ReconcilePluggyWebhookInteractor).scoped(),
    registerPluggyCredentialInteractor: asClass(RegisterPluggyCredentialInteractor).scoped(),
    checkPluggyCredentialInteractor: asClass(CheckPluggyCredentialInteractor).scoped(),
    checkHealthInteractor: asClass(CheckHealthInteractor).scoped(),
  })

  container.register({ rootContainer: asValue(container) })

  return container
}
