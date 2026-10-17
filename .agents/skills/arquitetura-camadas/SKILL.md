---
name: arquitetura-camadas
description: Estrutura de pastas fechada, regra de dependência entre camadas e ordem de projeto (entidade antes de caso de uso) do radar-pluggy. Consulte antes de criar qualquer arquivo novo, decidir em que pasta ele mora, ou decidir o que um interactor pode importar.
---

# Arquitetura em Camadas — radar-pluggy

## 1. A pasta é contrato fechado — lista exaustiva

Cada pasta abaixo tem um papel único, sem sobreposição. Esta lista é **exaustiva**: pasta nova que não está
aqui não se cria por conveniência — **para e pergunta** antes, mesmo que pareça razoável no momento (mesma
disciplina que `modelagem-de-dados` já aplica a tabela).

```
src/
├── entities/              # Entidades fortes com invariante — ver regra 3 e padroes-de-engenharia
├── interactors/
│   ├── default/           # `DefaultGateway` (log) e `DefaultInteractorGateway` (ciclo de transação)
│   │                      # — as duas interfaces que todo gateway de caso de uso carrega. Ver regra 2.
│   └── <objeto>/<ação>/   # Casos de uso — uma pasta por objeto de domínio, uma subpasta por ação:
│                          # `interactors/<objeto>/<ação>/<ação>-<objeto>.interactor.ts`, classe
│                          # `<Ação><Objeto>Interactor` (ex.: `pluggy-credential/register/
│                          # register-pluggy-credential.interactor.ts`, `RegisterPluggyCredentialInteractor`).
│                          # Tipos de entrada e as interfaces de gateway do interactor (regra 2) ficam em
│                          # `<ação>-<objeto>.types.ts` ao lado, nunca dentro do `.interactor.ts`.
│                          # Estrutura copiada de `interactors/car/` do `oplab-radar-api` — nome de
│                          # arquivo/pasta E desenho (uma dependência, retorno `{data, error}`, log
│                          # pelo gateway, bag `AppContainer`): ver regra 2, que é normativa.
│                          # Nome de ação é um verbo só (`register`, `find`, `check`) — nunca
│                          # verbo composto com qualificador do input (`resolve-for-item`) nem verbo com
│                          # adjetivo (`ensure-syncable`): o "por quê"/"critério" fica no tipo de entrada,
│                          # não no nome.
├── adapters/
│   ├── gateways/
│   │   ├── default-gateway.impl.ts   # `DefaultInteractorGatewayImpl` — base de TODO gateway de caso
│   │   │                             # de uso: log + ciclo de transação (regra 2)
│   │   ├── <objeto>/                 # Gateway do caso de uso: `<ação>-<objeto>.impl.ts`, classe
│   │   │                             # `<Ação><Objeto>Impl` — compõe reps e gateways de borda
│   │   ├── pluggy-*.gateway.ts       # Gateway de borda: traduz o SDK/HTTP da Pluggy, nada de banco
│   │   ├── <objeto>.resolver.ts      # Colaborador compartilhado entre impls (regra 2.3.1), classe
│   │   │                             # `<Objeto>Resolver`: consulta com invariante que dois ou mais
│   │   │                             # impls precisam, composta de repositórios e/ou gateway de
│   │   │                             # borda. Não é caso de uso (ninguém de produto pede isso) e
│   │   │                             # não é borda (toca banco) — por isso sufixo próprio, para o
│   │   │                             # caminho continuar denunciando o que o arquivo é. Só nasce
│   │   │                             # no SEGUNDO consumidor; antes disso vive dentro do impl.
│   │   └── <objeto>.provisioner.ts   # Mesmo papel do `.resolver.ts` (colaborador compartilhado
│   │                                 # entre impls, regra 2.3.1), mas para AÇÃO COM EFEITO
│   │                                 # COLATERAL — grava, chama borda externa — nunca consulta.
│   │                                 # Sufixo próprio porque `.resolver.ts` já é definido como
│   │                                 # "consulta com invariante": batizar uma escrita compartilhada
│   │                                 # de "resolver" repetiria o erro que gerou
│   │                                 # `PluggyItemCredentialResolver` (ver 2.3.1). Mesma regra de
│   │                                 # nascimento: só no SEGUNDO consumidor.
│   ├── repositories/      # Classe de acesso a dado (write em tabela própria, read em tabela lida) —
│   │                      # depende do model de infra/db/models/, nunca declara a forma da tabela.
│   │                      # Arquivo `<nome>.rep.ts`, classe `<Nome>Rep` (ex.: `pluggy-item.rep.ts`,
│   │                      # `PluggyItemRep`) — nunca `-repository`/`Repository` por extenso
│   └── handlers/          # Handler HTTP do webhook — único ponto de entrada externo do serviço
├── infra/
│   ├── bootstrap/
│   │   ├── register.ts    # Container Awilix + tipo `AppContainer` (a bag) — composition root
│   │   └── scope.ts       # `createScope()`: escopo por unidade de trabalho + detentor de transação
│   ├── config/
│   │   ├── config.ts      # `loadConfig()` — lê `config.json`/`databases.json` (dev) ou as env vars
│   │   │                  # `CONFIG`/`DATABASES` (qualquer `NODE_ENV` fora de "development"), mesma
│   │   │                  # convenção do `oplab-radar-api`
│   │   ├── config.json           # Real, gitignored — segredo de dev local (porta, jwtSecret, webhookUrl)
│   │   ├── databases.json        # Real, gitignored — conexão de dev local
│   │   ├── config.example.json    # Molde SEM segredo, versionado
│   │   └── databases.example.json # Molde SEM segredo, versionado
│   ├── db/
│   │   ├── models/        # `sequelize.define()` de cada tabela — só forma, sem lógica de negócio
│   │   ├── models.ts      # Agregado `DB` (`{ Sequelize, connections, models }`) — o que o container
│   │   │                  # registra como `db` e de onde repositório e transação saem
│   │   ├── migrations/    # Migration versionada de cada tabela própria (ver modelagem-de-dados)
│   │   └── database.ts    # Instância Sequelize de runtime (dialect, credenciais, pool)
│   ├── http/
│   │   ├── http-server.ts        # Composition root do Express — bootstrap, rotas, middleware de erro
│   │   └── middleware/           # `authenticate.middleware.ts`, `request-scope.middleware.ts`
│   ├── tools/
│   │   └── log/
│   │       └── logger.ts         # Logger do processo — consumido só via `DefaultGateway`, nunca
│   │                              # importado por interactor
│   └── worker/
│       └── webhook-drainer.ts    # Ver seção 4 — não é poller/cron, é reativo ao webhook + boot
└── shared/                # Fronteira Decimal, ApplicationError/ERROR_TYPE
tests/                     # Espelha src/ — mesma árvore, mesmo nome de arquivo com sufixo de teste
├── support/                # Única exceção ao espelho: builder/fixture reusado por mais de uma
│                           # suíte (ex.: conexão de banco de teste, configuração de app de teste)
│                           # — nunca teste em si, nunca lógica de produção. Nasce só no SEGUNDO
│                           # consumidor, mesma disciplina de `adapters/gateways/<objeto>.resolver.ts`
│                           # (regra 2.3.1): extrair antes disso é antecipar um uso hipotético.
```

Mesmo agrupamento de `infra/db/` do `oplab-radar-api` (`models/` + `migrations/` + conexão), para quem
já conhece aquele repositório reconhecer onde procurar "tudo que é banco" neste também — decisão corrigida
depois de uma primeira versão desta skill colocar model dentro de `adapters/repositories/`, o que
misturava "forma da tabela" (pertence a `infra/db/models/`) com "classe que a usa" (`adapters/repositories/`)
na mesma pasta. `sequelize-cli` aponta `migrations-path` para `infra/db/migrations/` — mesmo caminho
sendo `.cjs` puro (fora do que `tsconfig.json` inclui como `.ts`), não a raiz do repositório. A pasta
continua `adapters/repositories/` (papel inalterado) — só o sufixo de arquivo/classe foi encurtado, de
`-repository`/`Repository` por extenso para `.rep`/`Rep`.

Nenhuma pasta `adapters/controllers` no sentido de API pública: rota fica em `adapters/handlers`, bootstrap do
Express em `infra/http/`. Além do webhook e do healthcheck, este serviço também expõe o cadastro de credencial
Pluggy (`configuracao-credenciais-pluggy`, design.md D7) — o `oplab-radar-front` fala direto com este serviço
para isso, sem passar pelo `oplab-radar-api`. Nenhuma pasta de poller/cron: não existe agendador próprio (ver
seção 4) — `infra/worker/webhook-drainer.ts` não é isso: não tem timer, só reage a webhook recebido e à
recuperação no boot.

`infra/` não tem arquivo solto: cada peça mora numa subpasta com um papel (decisão explícita do usuário,
mesma disciplina de zero-arquivo-solto que o `oplab-radar-api` já aplica em `src/infra/`). Pasta nova aqui
dentro segue a mesma regra desta seção — para e pergunta antes de inventar uma sexta.

O caminho do arquivo, sozinho, denuncia a violação antes de abrir o conteúdo — um import de
`adapters/gateways/pluggy-gateway.impl.ts` dentro de `interactors/` já é errado só pelo caminho, sem ler uma
linha de lógica.

## 2. Regra de dependência: um caso de uso, um gateway — sem exceção

Esta regra é **normativa e literal**. O fluxo de referência é `interactors/pluggy-position/sync/` +
`adapters/gateways/pluggy-position/sync-pluggy-position.impl.ts` neste repositório, que reproduz
`interactors/car/create/` + `adapters/gateways/car/create-car.impl.ts` do `oplab-radar-api`. Copie a
forma de lá; não invente variação.

### 2.1 O construtor do interactor tem UMA dependência

**Exatamente um parâmetro, `params: AppContainer`, do qual se extrai exatamente um gateway.** Contar
parâmetros é o teste: dois ou mais colaboradores no construtor é violação, não questão de gosto.

```ts
// SEMPRE
export class SyncPluggyPositionInteractor {
  private readonly gateway: SyncPluggyPositionGateway

  constructor(params: AppContainer) {
    this.gateway = params.syncPluggyPositionImpl
  }
}

// NUNCA — colaborador a colaborador, mesmo que cada um seja uma interface do próprio interactor
constructor(
  private readonly credentialFinder: FindsPluggyCredential,
  private readonly authenticator: AuthenticatesWithPluggy,
  private readonly positions: SavesPluggyPosition,
  private readonly transactionRunner: RunsInTransaction,
) {}
```

Por que: cada colaborador extra no construtor é uma decisão de composição que vazou do adapter para o
caso de uso. O interactor volta a saber *quantas* peças de infra existem e em que ordem elas se
combinam — e é aí que nasce o tipo de bug que o compilador não pega (ver 2.4).

### 2.2 O gateway do caso de uso: um por ação, declarado no `.types.ts`

Em `<ação>-<objeto>.types.ts`, ao lado do interactor:

- `<Ação><Objeto>Input` — entrada do `execute`.
- `<Ação><Objeto>Output` — **`{ data?: ...; error?: ApplicationError }`**.
- `<Ação><Objeto>Gateway extends DefaultGateway` — **todos** os métodos que o caso de uso precisa do
  mundo externo: Pluggy, banco, outro interactor, hora, aleatoriedade.

O arquivo `.types.ts` não importa nada de `adapters/` nem de `infra/` — só `shared/` e tipos de domínio.

#### 2.2.1 O gateway fala a língua do produto; mecanismo fica dentro dele

Cada método é uma frase que alguém de produto entende sem saber como o sistema funciona. O teste:
**leia o `execute` em voz alta para quem conhece o negócio e não conhece o código. Se ele tropeçar em
alguma linha, o nome está errado ou o método não deveria existir.**

Vocabulário: verbo de intenção (`read`, `save`, `record`) + o quê, no termo do domínio. Nunca o verbo
do transporte (`fetch`, `get`, `post`), nunca o nome da operação do fornecedor ou do ORM
(`findOrCreate`, `beginTransaction`, `upsert`). Quando existe par ler-daqui / ler-de-lá, os dois nomes
dizem *qual* dos dois é — `readCurrentItemState` (o que a Pluggy tem agora) contra
`readLastSyncedItemState` (o que guardamos da última vez); `saveSyncedItemState` grava exatamente o que
o segundo lê.

Nos **gateways de borda** (`adapters/gateways/pluggy-*.gateway.ts`) o oposto vale: lá `fetchItem` é
honesto, porque é literalmente um `GET /items/{id}`. A tradução de uma língua para a outra é o trabalho
do impl.

E o corolário mais importante: **se um parâmetro só existe porque o mecanismo precisa dele, ele não
entra na assinatura.** Api key, token, transação, conexão, cursor de retomada, id de correlação — o
caso de uso não os carrega. Ele pede o dado "de forma autenticada" sem saber o que é autenticar.

```ts
// NUNCA — o caso de uso orquestrando o mecanismo: pega credencial, troca por token, carrega o token
// em cada chamada, e ainda precisa saber que `personId` sai da credencial pra conseguir gravar.
findCredential(itemId): Promise<Credential>
authenticate(clientId, clientSecret): Promise<string>
fetchItem(itemId, apiKey): Promise<Item>
fetchInvestmentsPage(itemId, apiKey, page): Promise<Page>
saveItemState({ itemId, personId, status, ... }): Promise<void>

// SEMPRE — o caso de uso pede o que quer; autenticação, cache de token e dono do item são do impl.
readCurrentItemState(itemId): Promise<CurrentItemState>
readInvestmentsPage(itemId, page): Promise<PluggyInvestmentsPage>
saveSyncedItemState({ itemId, status, executionStatus, lastUpdatedAt }): Promise<void>
```

Onde o mecanismo passa a viver, no exemplo acima: `SyncPluggyPositionImpl.apiKeyFor(itemId)` resolve a
credencial do item (recusa nomeada se não houver vínculo — D7, nunca dono por inferência), troca por
api key e memoiza a credencial pela unidade de trabalho; o `PluggyAuthGateway`, singleton, guarda a
chave pela validade documentada de 2 horas com margem de segurança, por `clientId`. Token expirado
nunca sai do cache, e reautenticar não é retry: falhou, falha, e a inbox recupera depois.

O que **continua** visível para o caso de uso, e por quê: página de investimento (`page`), porque D6
decidiu que é o interactor que percorre e valida a paginação, e a regra de negócio "dia sem mudança ⇒
zero chamadas" vive nele. Visibilidade de mecanismo se justifica por decisão de design escrita, nunca
por conveniência de implementação.

#### 2.2.2 Código escrito antes do consumidor: corrija, não apague

Quando um método ou classe ainda não tem quem o chame, a pergunta não é "está morto?" — é **"existe
consumidor documentado?"**. As duas respostas levam a caminhos diferentes, e confundi-las custa
trabalho:

| Situação | O que fazer |
|---|---|
| Nenhum consumidor, nem previsto em `tasks.md`/`design.md`, e o corpo é insumo de outra camada | Apagar. Ver 2.3.1: era caso de uso falso |
| Consumidor **documentado** numa task ainda não implementada | **Corrigir para que sirva a essa task** — apagar joga fora trabalho e a próxima rodada reescreve pior |

O erro a caçar não é a existência do código, é a **forma que o consumidor futuro não vai poder usar**.
Exemplo real deste repositório: os gateways de conta/extrato/movimentação nasceram com um
`fetchAllTransactions` que buscava todas as páginas e devolvia a lista inteira **acumulada em memória**.
O consumidor documentado (`tasks.md` 6.1) exige "persiste cada página imediatamente" — uma lista pronta
no fim não permite isso. Apagar o método resolveria o sintoma e perderia o laço de paginação e a
detecção de cursor repetido; a correção certa é entregar página a página:

```ts
// NUNCA — só volta no fim, e o consumidor não consegue persistir por página
async fetchAllTransactions(id, apiKey): Promise<Dto[]> {
  const all = [...]
  for (let p = 2; p <= firstPage.totalPages; p++) all.push(...(await this.fetchPage(id, apiKey, p)).results)
  return all
}

// SEMPRE — gerador assíncrono: cada página chega ao chamador antes de a próxima ser buscada
async *fetchTransactionPages(id, apiKey): AsyncGenerator<PageDto> {
  const firstPage = await this.fetchTransactionsPage(id, apiKey, 1)
  yield firstPage
  for (let page = 2; page <= firstPage.totalPages; page++) { /* valida e */ yield nextPage }
}
```

O gerador satisfaz D6 ao pé da letra ("o gateway devolve uma página por vez; o interactor itera e
persiste página a página") e mantém num lugar só o que é mecanismo de transporte: o laço, a checagem de
`totalPages` estável e, na paginação por cursor, o conjunto de cursores já visitados. O teste que prova
a diferença assere **dentro** do `for await` que a página chegou antes da requisição seguinte — se o
gateway acumulasse, o corpo do laço só rodaria no fim.

#### 2.2.3 Resposta de fornecedor: forma inesperada recusa, nunca vira default

Parser de resposta externa não tem ramo "se não vier no formato esperado, assume". Envelope de
paginação ausente com `totalPages = 1` de default significa **ler só a primeira página em silêncio** e
gravar histórico incompleto como se estivesse completo. O default é sempre a recusa nomeada, com o
campo que faltou.

```ts
// NUNCA
if (Array.isArray(data)) { rawResults = data; totalPages = 1 }        // e segue a vida
if (data.totalPages !== undefined) { totalPages = data.totalPages }   // ausente = 1, calado

// SEMPRE
if (typeof data.totalPages !== 'number' || !Number.isInteger(data.totalPages) || data.totalPages < 0) {
  throw new ApplicationError('PLUGGY_ACCOUNTS_RESPONSE_INVALID', { itemId, field: 'totalPages' })
}
```

Cuidado com o efeito colateral de apertar o parser: fixture de teste que passava por causa da
leniência para de passar, e isso é informação, não regressão — significa que o teste vinha exercitando
uma resposta que a Pluggy nunca devolve. Complete a fixture com o envelope real (o dump em `design.md`
diz qual é), não relaxe o parser de volta.

### 2.3 A implementação: `adapters/gateways/<objeto>/<ação>-<objeto>.impl.ts`

Classe `<Ação><Objeto>Impl extends DefaultInteractorGatewayImpl implements <Ação><Objeto>Gateway`.
Recebe `params: AppContainer` e **compõe** os colaboradores concretos — repositórios, gateways de borda
da Pluggy, outros interactors:

```ts
export default class SyncPluggyPositionImpl
  extends DefaultInteractorGatewayImpl
  implements SyncPluggyPositionGateway
{
  constructor(params: AppContainer) {
    super(params)
    this.positionRep = params.pluggyPositionRep
    this.investmentsGateway = params.pluggyInvestmentsGateway
  }
}
```

É a única camada onde "quantas peças existem" é conhecimento legítimo.

#### 2.3.1 O impl compõe repositório e gateway de borda — nunca um interactor

Adapter que depende de caso de uso inverte a direção: interactor declara o que precisa, adapter
implementa. No `oplab-radar-api` nenhum `*.impl.ts` importa um interactor — as únicas ocorrências de
"Interactor" dentro de `adapters/gateways/` são a classe base `DefaultInteractorGatewayImpl` e a
interface dela. Se o seu impl precisa chamar um `*Interactor`, pare: o que você tem em mãos
provavelmente não é caso de uso.

**Consulta com invariante não é caso de uso.** O teste é o do 2.2.1, aplicado ao candidato: existe um
ator de produto que pede *isso*? Ninguém pede ao sistema "encontre a credencial deste item" — isso é
insumo de quem sincroniza, não pedido de ninguém. Dois sintomas de que o caso de uso é falso: o único
ponto de uso dele é outro adapter, e o corpo é "duas consultas e duas recusas". Nesse caso o lugar da
regra é o impl que precisa dela:

```ts
// NUNCA — caso de uso inventado, chamado de dentro do adapter
private readonly findPluggyCredentialInteractor: FindPluggyCredentialInteractor
this.pluggyCredential ??= await this.findPluggyCredentialInteractor.execute(itemId)

// SEMPRE — o impl compõe os repositórios e faz valer a invariante onde o dado entra
const credentialId = await this.pluggyCredentialItemRep.findCredentialIdByItemId(itemId)
if (credentialId === undefined) throw new ApplicationError('PLUGGY_CREDENTIAL_ITEM_NOT_LINKED', { itemId })
```

Quando um segundo impl precisar da mesma resolução (o do webhook, na seção 7), extraia então — um
colaborador em `adapters/gateways/<objeto>.resolver.ts` (ver seção 1), ainda não um interactor.
Extrair antes do segundo consumidor é o antipadrão do "método que pode ser útil depois".

Caso real, e a lição de por que o sufixo existe: `PluggyItemCredentialResolver` nasceu como
`pluggy-item-credential.gateway.ts`, único padrão de nome disponível na época — e aquele padrão é o
do gateway de **borda**, que a seção 1 define como "nada de banco". Um arquivo com dois repositórios
dentro passou a se chamar exatamente aquilo que a regra proibia, e nenhum `grep` acusava. Quando a
regra 2.3.1 mandar extrair e a seção 1 não tiver onde pôr, **pare e pergunte** em vez de escolher o
nome menos errado: escrever a entrada nova aqui é parte de aplicar a regra.

Segundo caso real, já resolvido — o precedente a copiar quando o colaborador a extrair for uma
**escrita**, não uma consulta: `RegisterPluggyCredentialImpl` precisou do mesmo provisionamento de
webhook que só existia dentro de `ReconcilePluggyWebhookImpl` (`PENDENCIAS.md` 3.1). `.resolver.ts`
não servia — é definido acima como "consulta com invariante", e provisionar gera segredo, chama a
Pluggy e grava no banco. Em vez de forçar o nome errado (o mesmo erro que criou
`PluggyItemCredentialResolver`), a árvore da seção 1 ganhou `<objeto>.provisioner.ts`: mesmo papel de
colaborador compartilhado, sufixo próprio para ação com efeito colateral. `PluggyWebhookProvisioner`
é o primeiro exemplo — próxima escrita compartilhada entre impls usa esse sufixo, sem precisar
perguntar de novo.

#### 2.3.1.1 Caso de uso que precisaria orquestrar outros casos de uso: a orquestração é do worker

Quando um fluxo precisa rodar dois ou mais casos de uso em sequência, a tentação é criar um caso de
uso "coordenador" que recebe os outros dois. **Não faça**: isso põe três colaboradores no construtor
e quebra 2.1. Também não resolve pelo gateway — adapter dependendo de interactor é 2.3.1.

O dono da sequência é o **laço em `infra/`** (o worker), que já resolve do container tudo que precisa:

```ts
// NUNCA — coordenador com três colaboradores, e uma exceção inventada no comentário para justificar
constructor(params: AppContainer) {
  this.gateway = params.processPluggyWebhookEventImpl
  this.syncPluggyPositionInteractor = params.syncPluggyPositionInteractor   // ← quebra 2.1
  this.loadPluggyHistoryInteractor = params.loadPluggyHistoryInteractor     // ← quebra 2.1
}

// SEMPRE — o worker em infra/ resolve o repositório e os casos de uso do escopo e sequencia
for (;;) {
  const scope = createScope(container)
  const claim = await scope.resolve('pluggyWebhookEventRep').claimNextPending()
  if (!claim) break
  await scope.resolve('syncPluggyPositionInteractor').execute({ itemId })
  await scope.resolve('loadPluggyHistoryInteractor').execute({ itemId })
}
```

O que fica no laço é sequência e tratamento de falha; o que **não** pode ficar lá é regra de domínio —
"este evento dispara carga?" continua na entidade (`PluggyWebhookEvent.isApplicable()`), não num `if`
no worker. Caso real: `infra/webhook-drainer.ts` com `PluggyWebhookEvent`.

E a lição de processo, que custou uma rodada de revisão: **exceção a esta regra não se autoconcede no
ponto de uso.** A primeira versão deste fluxo tinha um comentário citando uma exceção "2.3.3" que não
existia nesta skill. Se a regra parecer errada para o seu caso, vale a mesma disciplina da seção 1
para pasta nova: **para e pergunta** — escrever a exceção aqui é parte de aplicá-la.

#### 2.3.2 Colaborador injetado leva o nome da própria classe, em camelCase

Chave no container, nome do campo e nome do tipo são **a mesma palavra**. Interactor em especial:
`findPluggyCredentialInteractor: FindPluggyCredentialInteractor`, nunca um apelido inventado no ponto
de uso.

```ts
// NUNCA — apelido que obriga a abrir o arquivo pra saber o que é
private readonly credentialFinder: FindPluggyCredentialInteractor
private readonly authGateway: PluggyAuthGateway
private readonly snapshotRep: PluggyPositionSnapshotRep

// SEMPRE — nome do campo = nome da classe = chave do container
private readonly findPluggyCredentialInteractor: FindPluggyCredentialInteractor
private readonly pluggyAuthGateway: PluggyAuthGateway
private readonly pluggyPositionSnapshotRep: PluggyPositionSnapshotRep
```

Ganho concreto: a linha de atribuição fica auditável de bater o olho
(`this.pluggyPositionRep = params.pluggyPositionRep`), `grep` de uma classe acha todos os pontos de uso
dela, e ninguém precisa manter na cabeça um dicionário de apelidos por arquivo — `snapshotRep` some,
`pluggyPositionSnapshotRep` diz qual snapshot de quê.

Uma exceção, e só ela: o campo do **próprio gateway do caso de uso** dentro do interactor continua
`gateway` (`this.gateway = params.syncPluggyPositionImpl`), como em `create-car.interactor.ts` — ali
não há ambiguidade possível, porque é o único colaborador que existe.

### 2.4 Transação: o caso de uso NUNCA a vê

`DefaultInteractorGatewayImpl` dá ao impl `startProcess()` (abre e publica no escopo),
`terminateProcess()` (commit) e `cancelProcess()` (rollback). O impl envolve a unidade atômica:

```ts
async savePositionsWithSnapshots(investments, syncedAt) {
  await this.startProcess()
  try {
    for (const investment of investments) {
      await this.positionRep.save(investment)
      await this.snapshotRep.save(/* ... */)
    }
    await this.terminateProcess()
  } catch (err) {
    await this.cancelProcess()
    throw err
  }
}
```

**Proibido passar transação por parâmetro** — nada de `save(input, tx)`, `RunsInTransaction`,
`run(fn => ...)` ou `tx: unknown` atravessando fronteira. O repositório lê a transação vigente do
escopo:

```ts
const transaction = this.getTransaction(DB_NAMES.MAIN)
await this.model.findOrCreate({ where, defaults, ...(transaction ? { transaction } : {}) })
```

Por que a proibição é absoluta: `tx` opcional em interface (`save(input, tx?: unknown)`) é **aceito
pelo TypeScript mesmo quando a implementação ignora o parâmetro** — função com menos parâmetros é
atribuível. Foi exatamente assim que a atomicidade de D11 ficou decorativa por uma versão inteira: o
interactor passava `tx`, um repositório repassava, o outro engolia em silêncio, `tsc` e os testes com
mock passavam verdes, e a fotografia comitava fora da transação. Com a transação no escopo não existe
o que esquecer de repassar.

### 2.5 Repositório: bag no construtor, model da bag, transação do escopo

```ts
export class PluggyPositionRep {
  constructor(params: AppContainer) {
    this.model = params.db.models.pluggyPosition
    this.getTransaction = params.getTransaction
  }
}
```

### 2.6 A única importação de `infra/` permitida no interactor

`import type { AppContainer } from '.../infra/bootstrap/register.js'` — e só ela, e só como
`import type`. Banco, logger, HTTP, `pluggy-sdk`: tudo entra pelo gateway. O ESLint mecaniza isso
(`no-restricted-imports` em `src/interactors/**`); se você precisou mexer nessa regra pra seu código
passar, o código está errado, não a regra.

### 2.7 Erro atravessa como valor, não como exceção

O `execute` devolve `{ data }` ou `{ error }`. Recusa de negócio é `{ error: new ApplicationError(...) }`;
erro inesperado é capturado no `catch`, logado com `logError` e devolvido como `{ error }` nomeado.
Nada de `throw` escapando do `execute`. (Entidade e repositório continuam lançando `ApplicationError`
para dentro — quem traduz para valor é o interactor.)

### 2.8 Log é do gateway

`this.gateway.addContext({...})`, `logInfo`, `logWarn`, `logError` — herdados de `DefaultGateway`. O
interactor nunca importa `infra/logger.ts`, nunca chama `console`.

### 2.9 Registro no container

Toda peça nova entra em `infra/bootstrap/register.ts`: chave em `AppContainer` e registro em
`setupContainer()`. Classe que já recebe `params: AppContainer` entra por `asClass(...).scoped()`;
classe em formato antigo (parâmetro posicional) entra por `asFunction((params) => new X(...)).scoped()`
até ser convertida. Escopo por unidade de trabalho vem de `createScope()` (`infra/bootstrap/scope.ts`).

### 2.10 Como verificar antes de considerar pronto

- [ ] O construtor do interactor tem exatamente um parâmetro, `params: AppContainer`?
- [ ] Existe exatamente um `<Ação><Objeto>Gateway`, no `.types.ts`, estendendo `DefaultGateway`?
- [ ] O `execute` devolve `{data}`/`{error}` e nada escapa por `throw`?
- [ ] `grep -rn "tx" src/interactors/` não acha transação atravessando fronteira?
- [ ] O impl existe em `adapters/gateways/<objeto>/` e é o único lugar que compõe reps/gateways?
- [ ] O teste do interactor é um fake do gateway — sem Sequelize, sem HTTP, sem container real?
- [ ] Existe teste de integração do impl provando rollback quando um passo da unidade atômica falha?
- [ ] Tudo registrado em `register.ts` e resolvendo (`tests/infra/bootstrap/register.test.ts`)?

### 2.11 Sem dívida aberta

Todos os casos de uso e todos os repositórios seguem esta regra — não há mais formato antigo neste
repositório, e portanto não há precedente para copiar. `asFunction` em `register.ts` sobra só para o
que não recebe a bag (`db`, `logger`, gateways de borda autoconfigurados).

`pluggy-credential/find` **existia** e foi removido: era caso de uso falso pelo teste do 2.3.1 (dois
lookups e duas recusas, consumido só por um adapter). A resolução item → credencial vive hoje em
`PluggyItemCredentialResolver`, com duas variantes: `credentialFor` lança recusa nomeada distinta por
ausência, e `findCredentialFor` devolve `undefined` para quem precisa recusar sem revelar o motivo
(o webhook não pode distinguir "item desconhecido" de "assinatura inválida"). Falha de banco continua
estourando nas duas — ausência nunca é o mesmo que erro.

## 3. Ordem de projeto: entidade e invariante primeiro, caso de uso depois

Mesmo quando o gatilho chega em forma de caso de uso (processar um evento de webhook), o desenho começa por:
**qual entidade e qual invariante isso toca**, não pelo passo a passo do interactor. Só depois de a entidade
existir com o comportamento certo é que o interactor é escrito como orquestração sobre ela.

A fronteira dessa regra: entidade se desenha só para invariante **já documentada em `fronteira-pluggy`**
(regras 1 a 13) — nunca para um caso hipotético ainda não decidido. "Entidade primeiro" não é licença para
inventar conceito de domínio que ninguém pediu; é modelar com comportamento o que já se sabe que existe
(`PluggyItem`, `PluggyPosition`, `PluggyWebhookEvent`) antes de escrever quem os orquestra. Ver
`padroes-de-engenharia` para o que torna uma entidade "forte" o suficiente.

## 4. Topologia de execução — contexto obrigatório antes de mexer no webhook

Este serviço roda como **um único processo standalone**, atendendo as três contas Pluggy pessoais (plano
gratuito, uma por CPF) do mesmo agregado familiar — não é uma instância por pessoa, e não roda embutido no
processo do `oplab-radar-api`.

Consequência direta pra quem escreve o handler do webhook: não existe "pessoa fixa" do processo. Ao receber
um evento, a primeira coisa que o handler faz é **resolver o tenant**:

1. Extrai `itemId` do payload (ainda não confiável — ver `fronteira-pluggy`, regra 8).
2. Busca no próprio banco quem é o dono daquele `itemId` (`person_id` + credencial — tabela própria deste
   serviço, `radar_pluggy_credentials`; ver `configuracao-credenciais-pluggy`).
3. Só então valida a assinatura do webhook (W1), comparando contra o segredo **daquela pessoa específica** —
   não um segredo único de processo.
4. Segue o fluxo normal (`GET /items/{id}`, `GET /investments`, marca d'água) usando a credencial daquela
   pessoa.

Não existe agendador/cron neste serviço (nem pasta `infra/poller`) — a sincronização é inteiramente
reativa ao webhook.

## Skill irmã

Esta skill responde **onde** o arquivo mora, **quem importa quem** e **em que ordem** projetar. Para saber
**como** escrever o código dentro dele — entidade forte, simplicidade, teste que morde a regra, contrato dos
revisores — use `padroes-de-engenharia`. As duas não se sobrepõem; em toda tarefa, você precisa das duas.
