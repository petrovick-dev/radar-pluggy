---
name: fronteira-pluggy
description: Regras de domínio inegociáveis para qualquer código que toque a API/SDK da Pluggy, dado monetário vindo dela, webhook, ou sincronização de item/investimento neste serviço. Consulte antes de escrever ou revisar qualquer chamada ao `pluggy-sdk`, qualquer conversão de valor, o handler de webhook, ou o job de sincronização. Não trata de onde o arquivo mora (`arquitetura-camadas`) nem de convenção de migration (`modelagem-de-dados`).
---

# Fronteira Pluggy — radar-pluggy

Cada regra abaixo já foi decidida — não é opinião a debater, é decisão registrada, com o número da decisão
de origem (`D`/`W`) nos ADRs `docs/ADR/0029-integracao-pluggy-open-finance.md` e
`docs/ADR/0030-webhook-pluggy-autenticado.md` do repositório `oplab-radar-api` (papel da Pluggy e
segurança do webhook, respectivamente — os números `D`/`W` servem de rastro até lá caso precise conferir o
raciocínio completo, se você tiver esse repositório ao lado). Este serviço reimplementa a mesma integração
num repositório separado; as regras não mudam por isso.

Se uma tarefa pedir algo que colide com uma regra abaixo, **pare e pergunte** — não resolva por analogia
nem "só dessa vez".

## 1. Dinheiro só vira `Decimal`, uma vez, na borda (D4)

Todo campo numérico que a Pluggy devolve (`value`, `amount`, `quantity`, qualquer `expenses.*`) chega como
`number` do JSON (`"format": "double"` no OpenAPI). Ele converte **uma única vez**, no ponto onde o dado
entra no sistema, com `new Decimal(String(n))` — nunca com `parseFloat`, nunca com aritmética direta sobre
o `number`.

```ts
// NUNCA
const total = investment.value * investment.quantity

// SEMPRE — na fronteira, uma vez
const value = new Decimal(String(investment.value))
const quantity = new Decimal(String(investment.quantity))
const total = value.times(quantity)
```

`String(n)` faz o round-trip exato do ECMAScript para os valores deste domínio; convertido a `Decimal`
ali, o valor trafega exato daí em diante. Campo obrigatório ausente (`null`/`undefined`/`NaN`) **recusa**,
nunca vira `0` — ver regra 3.

## 2. A Pluggy nunca é fonte fiscal primária (D1)

Nenhuma tabela alimentada por `Investment`/`InvestmentTransaction` chega em `fiscal_event`, DARF, ou
qualquer base de cálculo de imposto. Faltam `tipoMercado`, `obs` (marca de exercício) e a ponta lançadora
da opção — sem eles a apuração é inventada. É "a tentação óbvia" (termo do próprio ADR 0029): já que o
dado da operação está ali, parece natural usá-lo pra apurar. Não use.

O que a Pluggy alimenta neste produto: posição de custódia (evidência, nunca preenchimento automático),
provento (tabela própria, nunca `fiscal_event` — regra 2b), e achado de conferência (regra 10).

## 3. Vazio não é zero (D3)

Consentimento revogado ou expirado faz os endpoints da Pluggy devolverem **vazio**. Vazio é estado, não
"valor zero". Ao receber resposta vazia onde se esperava dado, grave um estado explícito de reconexão —
nunca `0`, nunca `null` silencioso, nunca a ausência da linha como se nada tivesse mudado.

## 4. Produtos habilitados explicitamente, nunca por omissão (D13)

Toda criação de item declara `products: ['INVESTMENTS', 'INVESTMENTS_TRANSACTIONS']` de forma explícita.
Por padrão a Pluggy coleta **todos** os produtos da assinatura — omitir o campo é coletar cartão,
empréstimo e identidade sem contrapartida de produto, ou seja, dado sensível em repouso sem motivo.

## 5. `IDENTITY` fica desligado até decisão própria (D14)

Não chame `fetchIdentity`/`fetchIdentityByItemId`, não peça o produto `IDENTITY` na criação do item.
Identidade traz CPF em repouso — habilitar é decisão de privacidade que ainda não foi tomada, não uma
conveniência de implementação.

## 6. Sincronização só por marca d'água, nunca varredura cega (D21)

O plano gratuito tem teto mensal de requisições por CPF, compartilhado entre todas as conexões. `GET
/investments` devolve `updatedAt` por investimento — só o investimento cujo `updatedAt` mudou desde a
marca d'água salva dispara `GET /investments/{id}/transactions`. E só dispara quando `GET /items/{id}`
vier com `executionStatus: SUCCESS` e `lastUpdatedAt` mais novo que o guardado.

```ts
// NUNCA — varre tudo, todo dia, custa ~1230 leituras/mês numa carteira de ~40 ativos
for (const investment of await client.fetchInvestments(itemId)) {
  await client.fetchAllInvestmentTransactions(investment.id)
}

// SEMPRE — só quem mudou desde a marca d'água
for (const investment of await client.fetchInvestments(itemId)) {
  if (investment.updatedAt > watermark) {
    await client.fetchAllInvestmentTransactions(investment.id)
  }
}
```

O teste que define a fatia: **dia sem movimento ⇒ zero chamadas de transação.**

## 7. Proibido cron ou job periódico chamando `PATCH /items` (D9)

A sincronização automática é da Pluggy (auto-sync diário do plano gratuito), não sua. Fazer à mão o que o
fornecedor proíbe ("batch update process ... should never be created", doc oficial) é dívida com risco de
banimento. Atualização manual só por ação explícita do titular.

## 8. O payload do webhook é gatilho, nunca dado (W3)

Ao receber um evento (`item/created`, `item/updated`, etc.), a primeira ação é `GET /items/{id}` — nunca
usar o conteúdo do payload como verdade. A própria Pluggy recomenda isso: "the first thing you do ... is to
do a `GET /items/{id}`", porque o payload pode estar desatualizado ou ser forjado (a Pluggy não assina o
corpo do webhook).

## 9. Segredo do webhook em comparação de tempo constante (W1)

```ts
// NUNCA — vaza o segredo por timing
if (header === expectedSecret) { ... }

// SEMPRE
import { timingSafeEqual } from 'node:crypto'
const ok = header.length === expectedSecret.length &&
  timingSafeEqual(Buffer.from(header), Buffer.from(expectedSecret))
```

## 10. Idempotência por `eventId`, nunca "já vi isso" por heurística (W2)

Reentrega do mesmo evento (até 9 vezes) é comportamento normal e esperado da Pluggy, não anomalia.
Idempotência garantida por restrição de unicidade no banco sobre `eventId` — não por comparação de
timestamp, não por deduplicação em memória.

## 11. Divergência vira achado nomeado, nunca correção automática (D12)

Ao comparar posição/operação da Pluggy contra a fonte manual (nota, extrato), uma diferença gera um
registro nomeado para o humano decidir. Nunca sobrescreve o dado manual com o da Pluggy, nunca "corrige"
sozinho. A doutrina é a mesma do ADR 0019 do `oplab-radar-api`: o sistema pergunta, o cliente não
adivinha.

## 12. MCP e CLI da Pluggy são ferramenta de investigação, nunca caminho de dado (D22)

Servem pra responder pergunta de desenho sem escrever código (ex.: obter amostra real de payload). Nenhum
valor obtido por eles entra em tabela ou em cálculo de produção — não deixam rastro auditável e não passam
pela fronteira numérica da regra 1.

## 13. Migration deste repositório só toca tabela que ele é dono

Este serviço migra e é dono de `radar_pluggy_items`, `radar_pluggy_credentials`,
`radar_pluggy_credential_items` e `radar_pluggy_positions` (mais as tabelas de posição, conta,
histórico, log bruto de auditoria e inbox de webhook criadas depois, todas com o mesmo prefixo)
— nome físico sempre com o prefixo `radar_pluggy_`;
entity e model TypeScript continuam sem ele (`modelagem-de-dados`). `people` e
`custody_accounts` — e qualquer outra tabela do banco
`oplab_radar` que já existia antes deste serviço — são **somente leitura**: sem migration, sem `ALTER
TABLE`, sem `FOREIGN KEY` de saída impondo constraint sobre elas. Essas tabelas têm dono: o
`oplab-radar-api`, num repositório Git separado, com seu próprio histórico de migration no mesmo banco
físico. Uma migration daqui que altera `people` ou `custody_accounts` colide com esse histórico. Ver
`modelagem-de-dados` para a convenção completa.
