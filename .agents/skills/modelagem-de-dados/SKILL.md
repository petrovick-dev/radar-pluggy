---
name: modelagem-de-dados
description: Como escrever migration e model Sequelize no radar-pluggy — a fronteira de quais tabelas este serviço pode alterar, tipos de coluna, DECIMAL para dinheiro, índices, FK, snake_case no banco vs camelCase na entity. Consulte ANTES de criar ou alterar qualquer tabela, ou antes de escrever qualquer query contra `people`/`custody_accounts`.
---

# Modelagem de dados — radar-pluggy

## Regra 1, antes de qualquer outra: a fronteira de propriedade de tabela

Este serviço escreve direto no banco físico `oplab_radar` — o mesmo banco do `oplab-radar-api`,
repositório Git **separado**, com seu próprio histórico de migration nesse banco.

| Tabela | Quem é dono | O que este serviço pode fazer |
|---|---|---|
| Toda tabela com o prefixo `radar_pluggy_` (hoje: `items`, `credentials`, `credential_items`, `positions`, `position_snapshots`, `accounts`, `account_transactions`, `investment_transactions`, `history_coverage`, `history_sync_states`, `webhook_events`) | **Este serviço** | Migration, `ALTER TABLE`, índice, FK de saída — tudo |
| `pluggy_webhooks` | `oplab-radar-api`, até o corte do webhook ser migrado pra cá | Nada, por enquanto |
| `people`, `custody_accounts`, e qualquer outra tabela que já existia antes deste serviço | `oplab-radar-api` | **Somente leitura.** Nunca migration, nunca `ALTER TABLE`, nunca `FOREIGN KEY` de saída impondo constraint sobre elas |

Uma migration deste repositório que cria ou altera uma tabela fora da primeira linha é, por definição,
bug — mesmo que pareça razoável no momento (ex.: "só vou adicionar uma coluna `pluggy_customer_id` em
`people`"). Isso colide com o histórico de migration do outro repositório no mesmo banco físico. Se uma
tarefa parecer exigir isso, pare e pergunte — a resposta certa quase sempre é uma tabela nova, própria,
com FK apontando **para** `people`/`custody_accounts` (leitura), nunca uma coluna **dentro** delas.

Para ler `people`/`custody_accounts`, use um model Sequelize marcado como leitura (sem migration
correspondente neste repositório, sem `sync()`, sem `references`/`onDelete` de saída — só `belongsTo`
lido, nunca uma FK que este lado precise garantir).

## Convenções de coluna — mesmas do banco físico compartilhado

Como as tabelas próprias vivem no mesmo banco que `people`/`custody_accounts`, seguem a mesma convenção
física, para o schema inteiro continuar legível como uma coisa só:

| Dado | Tipo | Observação |
|---|---|---|
| PK / FK | `BIGINT.UNSIGNED` | `autoIncrement` na PK, igual `people.id` |
| **Dinheiro** | `DECIMAL(14, 2)` | nunca `FLOAT`/`DOUBLE` — ver `fronteira-pluggy`, regra 1, sobre a conversão na aplicação |
| Quantidade | `DECIMAL(14, 8)` ou `INTEGER.UNSIGNED` conforme a granularidade real do ativo | quantidade fracionária de investimento não é sempre inteira |
| Texto curto | `STRING(n)` | dimensione pelo pior caso real de qualquer conector Pluggy, não pelo típico |
| Data + hora | `DATE(3)` | milissegundos |
| JSON cru (ex.: `expenses` da Pluggy, quando guardado para auditoria) | `JSON` | nunca extraia valor monetário de dentro do JSON sem passar pela fronteira decimal |

| Camada | Convenção |
|---|---|
| Tabela | `snake_case`, plural, com o prefixo físico `radar_pluggy_` — `radar_pluggy_position_snapshots` |
| Coluna | `snake_case` — `item_id`, `created_at` |
| Entity / TypeScript | `camelCase`, **sem** o prefixo — `itemId`, `createdAt`, classe `PluggyPositionSnapshot` |
| Arquivo de migration | `YYYYMMDDHHMMSS-verbo-objeto` |

O prefixo `radar_pluggy_` só existe no nome físico da tabela — marca no schema compartilhado
qual tabela pertence a este serviço, sem precisar abrir a migration pra saber. Entity, model
Sequelize (nome da classe/factory) e repositório continuam com o nome de domínio de sempre
(`PluggyPosition`, `definePluggyPositionModel`); só a `tableName:` do model e o `createTable`/
`addIndex` da migration levam o prefixo. Índice segue o mesmo prefixo no nome
(`uq_radar_pluggy_positions_item_investment`, não `uq_pluggy_positions_...`).

A tradução `snake_case` → `camelCase` acontece só na fronteira model→entity, nunca em outra camada.

## Idempotência de escrita

Reentrega de webhook e resposta de sincronização repetida são o caso normal, não a exceção (ver
`fronteira-pluggy`, regras 6 e 10). Toda tabela que recebe dado da Pluggy tem uma constraint de
unicidade real no banco (`eventId`, `id` do investimento/transação da Pluggy, etc.) e a escrita usa
`findOrCreate` sobre essa constraint — nunca "buscar, e se não achar, criar" em dois passos separados, que
tem race condition.

## `allowNull`

`allowNull: false` é o default. Campo obrigatório de cálculo (valor, quantidade, data, identificador da
Pluggy) nunca tem default nem `?? 0`/`?? ''` — dado ausente é erro, recusa nomeando o que falta.

## Nunca edite migration já aplicada

Já rodou em algum ambiente (mesmo que só o seu). Corrija com uma nova migration.

## Checklist antes de rodar a migration

- [ ] A tabela que a migration cria/altera está na lista de tabelas próprias (regra 1)?
- [ ] Nome físico da tabela leva o prefixo `radar_pluggy_`; nome de índice também
      (`uq_radar_pluggy_<tabela>_<colunas>`); entity/model/repositório ficam sem o prefixo
- [ ] Dinheiro em `DECIMAL`, nunca `FLOAT`/`DOUBLE`
- [ ] FK com `references` e `onDelete` explícito, apontando **para** tabela existente, nunca alterando-a
- [ ] Constraint de unicidade real para o identificador que garante idempotência
- [ ] `allowNull: false` em todo campo obrigatório de cálculo
- [ ] `down` desfaz na ordem inversa exata do `up`
- [ ] Model espelha a migration, com um método de tradução `snake_case` → `camelCase` na fronteira
