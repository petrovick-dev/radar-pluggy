import type { Model, ModelStatic } from 'sequelize'
import { PluggyCall, type CreatePluggyCallProps } from '../../entities/pluggy-call.js'
import type { AppContainer } from '../../infra/bootstrap/register.js'
import type { PluggyCallRow } from '../../infra/db/models/pluggy-call-model.js'
import { createLogger, type Logger } from '../../infra/tools/log/logger.js'

export type PluggyCallEvent = CreatePluggyCallProps

// Serviço singleton explícito (design.md D31), nunca DB escondido dentro do `AsyncLocalStorage` de
// `call-context.ts` — é quem `PluggyConnectorClient.getApiKey` (D1) e `instrumentPluggyClient` (D3)
// chamam pra gravar. Resolvido do container RAIZ (como `PluggyClientGateway` já é): nunca lê a
// transação de um escopo de requisição — a gravação é sempre autocommit (D25), fora da transação de
// quem chamou.
//
// Logger PRÓPRIO (`createLogger(params.logWriter.write)`), nunca `params.logger` injetado: aquele registro é `.scoped()`
// por unidade de trabalho — capturá-lo aqui, num singleton resolvido uma única vez (na primeira
// unidade de trabalho que passar por este serviço), prenderia o contexto (uuid, itemId) daquela
// primeira requisição em todo aviso de falha futuro, de qualquer requisição.
export class PluggyCallRecorder {
  private readonly model: ModelStatic<Model<PluggyCallRow>>
  private readonly logger: Logger

  constructor(params: AppContainer) {
    this.model = params.db.models.pluggyCall
    this.logger = createLogger(params.logWriter.write)
  }

  // Nunca `async` do ponto de vista de quem chama — dispara e não bloqueia (D25). Falha cai em
  // `logger.warn`, nunca lançada, nunca muda o resultado da chamada de negócio que originou o evento.
  record(event: PluggyCallEvent): void {
    void this.persist(event).catch((err: unknown) => {
      this.logger.warn('Falha ao gravar radar_pluggy_calls (auditoria best-effort, chamada real não afetada)', {
        err,
        operation: event.operation,
      })
    })
  }

  private async persist(event: PluggyCallEvent): Promise<void> {
    const call = PluggyCall.create(event)
    // Sem transação (nunca `getTransaction()`): autocommit sempre, mesmo dentro de uma unidade de
    // trabalho com transação de negócio em andamento (design.md D25).
    await this.model.create(toRow(call))
  }
}

function toRow(call: PluggyCall): PluggyCallRow {
  return {
    item_id: call.getItemId() ?? null,
    connector_id: call.getConnectorId() ?? null,
    operation: call.getOperation(),
    http_method: call.getHttpMethod() ?? null,
    route_template: call.getRouteTemplate() ?? null,
    call_scope: call.getCallScope(),
    trigger: call.getTrigger(),
    resource_type: call.getResourceType() ?? null,
    resource_id: call.getResourceId() ?? null,
    request_correlation_id: call.getRequestCorrelationId(),
    webhook_event_id: call.getWebhookEventId() ?? null,
    page_ordinal: call.getPageOrdinal() ?? null,
    page_size: call.getPageSize() ?? null,
    started_at: call.getStartedAt(),
    completed_at: call.getCompletedAt(),
    duration_ms: call.getDurationMs(),
    http_status: call.getHttpStatus() ?? null,
    outcome: call.getOutcome(),
    failure_kind: call.getFailureKind() ?? null,
    error_code: call.getErrorCode() ?? null,
    created_at: new Date(),
  } as PluggyCallRow
}
