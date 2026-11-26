import { of, lastValueFrom } from 'rxjs'
import type { CallHandler, ExecutionContext } from '@nestjs/common'

const startSpan = jest.fn((_options: unknown, callback: () => unknown) => callback())
jest.mock('@sentry/nestjs', () => ({
  startSpan: (options: unknown, callback: () => unknown) => startSpan(options, callback),
}))

import { ConnectorSpanInterceptor } from './connector-span.interceptor'

/** #2442.4 — chaque lecture du pont du copilote est UN span « connecteur », nommé par son geste. */
describe('ConnectorSpanInterceptor', () => {
  it('nomme le span par la méthode du pont, en snake_case, et rend sa réponse telle quelle', async () => {
    const context = { getHandler: () => ({ name: 'searchMailbox' }) } as unknown as ExecutionContext
    const next: CallHandler = { handle: () => of({ threads: [] }) }
    await expect(lastValueFrom(new ConnectorSpanInterceptor().intercept(context, next))).resolves.toEqual({
      threads: [],
    })
    expect(startSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'connector.search_mailbox', op: 'bellum.connector' }),
      expect.any(Function),
    )
  })
})
