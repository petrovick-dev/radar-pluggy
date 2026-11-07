import { describe, expect, it } from 'vitest'
import type { LogWriter } from '../../../../src/infra/tools/log/logger.js'
import { TeeLogWriter } from '../../../../src/infra/tools/log/tee-log-writer.js'

function recordingWriter() {
  const lines: string[] = []
  let closed = false
  const writer: LogWriter = {
    write: (level, line) => { lines.push(`${level}:${line}`) },
    close: async () => { closed = true },
  }
  return { writer, lines, isClosed: () => closed }
}

describe('TeeLogWriter', () => {
  it('escreve cada linha em todos os destinos, na ordem', () => {
    const stdout = recordingWriter()
    const openSearch = recordingWriter()
    const tee = new TeeLogWriter([stdout.writer, openSearch.writer])

    tee.write('info', '{"message":"a"}')
    tee.write('error', '{"message":"b"}')

    expect(stdout.lines).toEqual(['info:{"message":"a"}', 'error:{"message":"b"}'])
    expect(openSearch.lines).toEqual(stdout.lines)
  })

  it('close fecha todos os destinos', async () => {
    const stdout = recordingWriter()
    const openSearch = recordingWriter()

    await new TeeLogWriter([stdout.writer, openSearch.writer]).close()

    expect(stdout.isClosed()).toBe(true)
    expect(openSearch.isClosed()).toBe(true)
  })
})
