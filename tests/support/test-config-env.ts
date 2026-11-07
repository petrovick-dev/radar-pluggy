import { randomBytes } from 'node:crypto'

// Ambiente completo e válido para `loadConfig`, sempre pelo branch "não-development" (env vars
// `CONFIG`/`DATABASES`, como a plataforma de fato injeta) — é o jeito de testar toda a validação
// sem tocar arquivo real. O branch `development` só troca DE ONDE o JSON vem (arquivo em vez de
// env var); quem valida o conteúdo é a mesma função para os dois, então testar só um lado cobre
// os dois. `dialectOptions.ssl: false` aqui é deliberado: representa o MySQL de dev local, que não
// fala TLS — os testes de TLS-por-padrão constroem a própria `DATABASES` sem essa chave.
export function validConfigEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production-railway',
    CONFIG: JSON.stringify({
      http: { port: 3003, jwtSecret: 'segredo-de-teste' },
      pluggy: { webhookUrl: 'https://pluggy-connector.test/webhooks/pluggy' },
    }),
    DATABASES: JSON.stringify({
      main: {
        host: '127.0.0.1',
        port: 3306,
        database: 'oplab_radar',
        username: 'root',
        password: '12345678',
        dialectOptions: { ssl: false },
      },
    }),
    PLUGGY_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  }
}
