---
name: padroes-de-engenharia
description: Como escrever o código DENTRO do arquivo no radar-pluggy — entidade forte, simplicidade sem overengineering, ausência de retry customizado em I/O à Pluggy, fronteira de erro do handler HTTP, e o contrato dos dois revisores obrigatórios. Consulte ao escrever ou revisar qualquer código novo, ou antes de considerar uma tarefa concluída. Não trata de onde o arquivo mora nem de dependência entre pastas — isso é `arquitetura-camadas`.
---

# Padrões de Engenharia — radar-pluggy

| Pergunta | Skill |
|---|---|
| Em que pasta esse arquivo vai? Quem pode importar quem? Qual a ordem de projeto? | `arquitetura-camadas` |
| Como escrevo o código dentro dele? Isso está bem desenhado? | **esta skill** |
| Regra de domínio da Pluggy (webhook, decimal, sincronização)? | `fronteira-pluggy` |
| Migration ou model Sequelize? | `modelagem-de-dados` |

## 1. Entidade forte é obrigatória — não um DTO fantasiado

Toda entidade do domínio (`PluggyItem`, `PluggyPosition`, `PluggyWebhookEvent`) nasce com construtor privado +
factory que valida o invariante, e com comportamento próprio — nunca como campo público mutável.

```ts
// PORCO — é um DTO fantasiado de entidade, qualquer campo é lido/escrito de fora
class PluggyPosition {
  itemId!: string
  quantity!: Decimal
  asOf!: Date
}

// ENTIDADE FORTE — constrói validando invariante, estado privado, regra de negócio embutida
class PluggyPosition {
  private constructor(
    private readonly itemId: string,
    private readonly quantity: Decimal,
    private readonly asOf: Date,
  ) {}

  static create(props: { itemId: string; quantity: Decimal; asOf: Date }): PluggyPosition {
    if (props.quantity.isNegative()) throw new ApplicationError('POSITION_QUANTITY_NEGATIVE', props)
    return new PluggyPosition(props.itemId, props.quantity, props.asOf)
  }

  reconcileAgainst(manual: ManualPosition): DivergenceFinding | null { /* regra 11 de fronteira-pluggy vive aqui, não solta numa função */ }
}
```

**Teste de aceitação**: se a classe puder virar uma `interface`/objeto plano sem perder nada, não é entidade
— é DTO com nome errado. A regra de negócio mora dentro da entidade que ela descreve, nunca numa função
solta comparando campos por fora.

## 2. Simplicidade sem overengineering

Método pequeno, um interactor por responsabilidade, sem abstração para caso hipotético "que pode ser útil
depois". Um interactor a mais "pra já deixar pronto pro futuro" é a abertura que uma IA usa pra alucinar
camada que ninguém pediu.

## 3. I/O à Pluggy falha, falha — sem retry customizado

A reentrega do mesmo evento de webhook (até 9 vezes, idempotência por `eventId` — regra 10 de
`fronteira-pluggy`) **já é** o mecanismo de retry do fornecedor. Se `GET /investments` falhar no meio do
processamento, deixe a exceção subir e o handler devolver não-2XX — a Pluggy reentrega, e reprocessar do
zero é seguro porque a operação é idempotente.

```ts
// NUNCA — reinventa, com risco de bug novo, o que a Pluggy já faz de graça via reentrega
async function fetchWithRetry(fn: () => Promise<unknown>, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (e) { if (i === attempts - 1) throw e }
  }
}

// SEMPRE — chama, deixa falhar, confia na reentrega + idempotência
const investments = await gateway.fetchInvestments(itemId, watermark)
```

Isso é uma decisão específica **deste domínio** (o fornecedor já resolve retry por você), não um princípio
genérico de "sempre deixe falhar".

Uma exceção, e só ela: o retry de 429 embutido no `pluggy-sdk`, que não é configurável. Ver 3b.1.

## 3b. Todo I/O à Pluggy passa pelo `pluggy-sdk` — nunca `fetch` à mão

O transporte é do fornecedor. Gateway de borda **não monta URL, não escreve header, não chama `fetch`**:
recebe um `PluggyClient` já autenticado e chama o método do SDK. O que continua sendo nosso, e não muda:
validar a resposta (campo obrigatório ausente recusa, `fronteira-pluggy` regra 1 e `arquitetura-camadas`
2.2.3) e traduzir para o DTO do domínio. **Tipo do SDK é promessa de compilação, não garantia de runtime** —
o payload continua vindo da rede, então a validação campo a campo fica onde está.

```ts
// NUNCA — transporte à mão, com api key atravessando a assinatura
const url = new URL(`${this.baseUrl}/investments`)
url.searchParams.set('itemId', itemId)
const response = await this.fetchImpl(url.toString(), { headers: { 'X-API-KEY': apiKey } })

// SEMPRE — o SDK transporta; nós validamos e traduzimos
const page = await client.fetchInvestments(itemId, undefined, { page, pageSize: 500 })
return { results: page.results.map((raw, i) => this.toDto(itemId, i, raw)), ... }
```

O cliente é **um por credencial**, cacheado por `clientId` num singleton (`PluggyClientGateway`): o SDK
guarda a api key dentro da instância e a renova quando o JWT expira, então instância nova a cada chamada
re-autenticaria e queimaria a cota mensal do plano gratuito (`fronteira-pluggy` regra 6). Cache por
`clientId` é também o que mantém as três contas do agregado isoladas.

### 3b.1 O que a adoção do SDK custou — cinco consequências, todas conhecidas

Nenhuma delas é evitável mantendo o SDK: `getServiceInstance` é privado no `BaseApi`, então a instância
`got` não é injetável nem configurável de fora.

| Consequência | Onde | O que fazer |
|---|---|---|
| **Retry interno de 429**, `limit: 2`, em todos os métodos | `baseApi.js`, `retry: { limit: 2, statusCodes: [429] }` | **Exceção nomeada à regra 3.** A regra proíbe retry **customizado** — este é o default do fornecedor, e o preço de não reimplementar transporte. Não some com ele, e não acrescente retry nosso em cima |
| **Status HTTP é perdido** no erro | `createGetRequest` rejeita com `error.response.body`, não com o `HTTPError` | Recusa nomeada não carrega mais `{ status }`. Use o `code`/`message` do corpo de erro da Pluggy quando existir |
| **A rejeição não é um `Error`** em falha HTTP | idem — é um objeto puro | `catch` de gateway de borda nunca assume `instanceof Error`; `error.name === 'TimeoutError'` só vale para timeout, que o SDK **não** embrulha |
| **`console.error` do SDK** em falha HTTP | `createGetRequest` | Corpo de erro da Pluggy sai por stdout, fora do nosso logger. Não é motivo pra embrulhar o SDK; é motivo pra não repetir o log |
| **Timeout fixo em 30s** | `_30_SECONDS` no `BaseApi` | Era 15s no transporte à mão. Não é configurável |
| **`baseUrl` do `ClientParams` é declarado e ignorado** | o construtor do `BaseApi` resolve `process.env.PLUGGY_API_URL \|\| 'https://api.pluggy.ai'` e nunca lê `params.baseUrl` | Não aceite `baseUrl` em assinatura nossa: mentiria. Apontar o SDK para outro host é variável de ambiente, processo inteiro. Teste **fake o cliente**, não a URL |

E a que mais morde na prática, porque não dá erro — dá dado errado:

**Campo de data chega `Date` OU `string`, e o SDK não normaliza.** `deserializeJSONWithDates` converte
apenas string que casa **exatamente** `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` — 24
caracteres, milissegundo obrigatório. `2026-08-01T00:00:00Z` (sem `.000`) e `2026-08-01` continuam string.
O mesmo campo lógico, portanto, muda de tipo conforme o que a Pluggy mandou naquela resposta.

```ts
// NUNCA — passa a valer só quando a Pluggy manda milissegundo, e recusa dado bom quando não manda
if (typeof value !== 'string') throw new ApplicationError('..._RESPONSE_INVALID', { field })

// SEMPRE — aceita as duas formas e normaliza; ausente é ausente, presente e ilegível recusa
function requireDate(value: unknown, ...): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') { const d = new Date(value); if (!Number.isNaN(d.getTime())) return d }
  throw new ApplicationError('..._RESPONSE_INVALID', { field })
}
```

E o ganho que compensa: `fetchTransactionsCursor` recebe o cursor como parâmetro `after` (base64), não como
URL a seguir. A validação anti-SSRF do cursor deixa de existir porque **o caminho nunca vem do payload** —
o endpoint é sempre `v2/transactions`. Defesa por construção vale mais que defesa por validação.

### 3b.2 Paginação: `fetchTransactionsCursor`, nunca `fetchAll*`

`fetchAllTransactions` e `fetchAllInvestmentTransactions` existem no SDK e **acumulam a lista inteira em
memória** antes de devolver — exatamente o antipadrão que `arquitetura-camadas` 2.2.2 descreve, e que
impede "persiste cada página imediatamente" (D6). Use a versão de uma página (`fetchTransactionsCursor`,
`fetchInvestmentTransactions`) dentro do gerador do gateway de borda.

## 4. Fronteira de erro do handler HTTP é rígida — isso não contradiz a regra 3

A ausência de retry vale pra chamada *interna* à Pluggy. O handler da rota em si (o ponto de entrada
Express) é outra fronteira: **nunca pode deixar exceção não tratada escapar**. Toda rota exportada termina
em try/catch que converte o erro em resposta HTTP controlada — porque este processo atende as três contas ao
mesmo tempo (ver `arquitetura-camadas`, seção 4); uma exceção não tratada aqui derruba o processamento das
outras duas pessoas, não só da que gerou o erro.

## 5. Lint, type-check e teste são gate de pipeline — não conteúdo desta skill

Essas verificações mecânicas (tsconfig estrito, lint de fronteira de import entre pastas, husky pre-commit,
CI) existem como configuração do repositório, não como instrução que a LLM precisa decidir seguir. Esta
skill ensina o princípio de desenho; a imposição roda no pipeline, fora do escopo deste arquivo.

## 6. Zero tolerância a achado pequeno

Nenhum ajuste, por menor que pareça, vira dívida documentada e aceita "por agora". Diferente do padrão
observado em outros repositórios do workspace — código pequeno demais pra revisar com cuidado é exatamente
onde a alucinação de IA se esconde sem ser notada.

## 7. Revisão obrigatória — dois subagents, sempre, veredito de três estados

Ao fim de **toda** tarefa, sem exceção de "risco pequeno não justifica chamar", dispare os dois — na mesma
mensagem, pra rodarem em paralelo:

```
Agent({ subagent_type: "arquiteto-radar-pluggy",   prompt: "<arquivos tocados + o que mudou>" })
Agent({ subagent_type: "engenheiro-radar-pluggy",  prompt: "<arquivos tocados + o que mudou>" })
```

Cada um devolve um veredito de três estados:

| Veredito | Quando |
|---|---|
| **Aprovado** | Segue pasta, dependência, entidade forte, teste que morde a regra |
| **Ajustar** | Desvio pontual, localizado — **bloqueante**: corrige antes de seguir, nunca vira dívida documentada |
| **Excluir e refazer** | O problema é de concepção — corrigir equivaleria a reescrever a peça, não emendar linha. Nesse caso o revisor não lista patch, declara o motivo estrutural |

O `engenheiro-radar-pluggy` verifica de forma **exaustiva**: todo campo, todo método, todo branch da
mudança precisa de justificativa afirmativa e específica pra "por que isso está aqui" — não uma impressão
geral de "parece ok". Campo/parâmetro/branch sem justificativa é candidato direto a "excluir e refazer".

## Checklist de saída

- [ ] Toda entidade nova é forte (seção 1), não anêmica
- [ ] Nenhum retry customizado em volta de chamada à Pluggy (seção 3)
- [ ] Toda rota HTTP tem try/catch na borda (seção 4)
- [ ] Teste cobre a regra de negócio, não só a execução — falharia se a regra fosse quebrada de propósito
- [ ] `arquiteto-radar-pluggy` e `engenheiro-radar-pluggy` chamados, sem exceção
