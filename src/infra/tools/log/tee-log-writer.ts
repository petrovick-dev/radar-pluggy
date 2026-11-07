import type { LogWriter } from './logger.js'

// Mesmo papel do `TeeWriteStream` do `oplab-radar-api`: cada linha vai para todos os destinos
// (stdout e OpenSearch), e o encerramento fecha todos.
export class TeeLogWriter implements LogWriter {
  constructor(private readonly destinations: readonly LogWriter[]) {}

  readonly write: LogWriter['write'] = (level, line) => {
    for (const destination of this.destinations) {
      destination.write(level, line)
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.destinations.map((destination) => destination.close()))
  }
}
