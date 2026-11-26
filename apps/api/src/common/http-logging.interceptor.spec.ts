import { Logger } from '@nestjs/common'
import { of } from 'rxjs'
import { HttpLoggingInterceptor } from './http-logging.interceptor'

/**
 * Runs the interceptor over a fake request/response pair and returns every
 * message passed to `Logger.prototype.log`.
 */
function runInterceptor(originalUrl: string, method = 'GET', statusCode = 200): string[] {
  const req = { method, originalUrl }
  const res = { statusCode }
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  }
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  const interceptor = new HttpLoggingInterceptor()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interceptor.intercept(ctx as any, { handle: () => of(undefined) }).subscribe()
  const logged = logSpy.mock.calls.map(call => String(call[0]))
  logSpy.mockRestore()
  return logged
}

describe('HttpLoggingInterceptor — hygiène des secrets OAuth', () => {
  /*
   * ─────────────────────────────────────────────────────────────────────
   * Finding pentest : le `code` OAuth (secret à usage unique) et le `state`
   * d'un callback (/auth/oauth/callback, /google/callback, /crm/hubspot/
   * callback, etc.) se retrouvaient en clair dans les logs Railway à CHAQUE
   * requête, via `req.originalUrl` loggé intégralement.
   * ─────────────────────────────────────────────────────────────────────
   */
  it('ne journalise PAS le `code` OAuth d’un callback', () => {
    const logged = runInterceptor('/auth/oauth/callback?code=SECRET123&state=xyz')
    const text = logged.join('\n')
    expect(text).not.toContain('SECRET123')
  })

  it('ne journalise PAS le `state` d’un callback', () => {
    const logged = runInterceptor('/crm/hubspot/callback?code=ABCDEF&state=super-secret-state')
    const text = logged.join('\n')
    expect(text).not.toContain('super-secret-state')
  })

  it('rédige aussi token/access_token/id_token/secret/key/password/signature', () => {
    const logged = runInterceptor('/x?token=t1&access_token=t2&id_token=t3&secret=t4&key=t5&password=t6&signature=t7')
    const text = logged.join('\n')
    for (const leaked of ['t1', 't2', 't3', 't4', 't5', 't6', 't7']) {
      expect(text).not.toContain(`=${leaked}`)
    }
  })

  it('garde méthode, statut et durée intacts', () => {
    const logged = runInterceptor('/health', 'GET', 200)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/^GET \/health → 200 \(\d+ms\)$/)
  })

  it('préserve les paramètres NON sensibles — ils ont une valeur de debug', () => {
    const logged = runInterceptor('/accounts?page=2&limit=10')
    expect(logged[0]).toContain('page=2')
    expect(logged[0]).toContain('limit=10')
  })

  it('laisse une URL sans query string inchangée', () => {
    const logged = runInterceptor('/health')
    expect(logged[0]).toMatch(/^GET \/health → 200 \(\d+ms\)$/)
  })
})
