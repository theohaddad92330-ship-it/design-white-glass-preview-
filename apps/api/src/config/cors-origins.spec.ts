import { getAllowedCorsOrigins } from './cors-origins'

describe('getAllowedCorsOrigins', () => {
  const originalNodeEnv = process.env['NODE_ENV']
  const originalFrontendUrl = process.env['FRONTEND_URL']

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV']
    } else {
      process.env['NODE_ENV'] = originalNodeEnv
    }

    if (originalFrontendUrl === undefined) {
      delete process.env['FRONTEND_URL']
    } else {
      process.env['FRONTEND_URL'] = originalFrontendUrl
    }
  })

  it('allows the configured frontend URL in production', () => {
    process.env['NODE_ENV'] = 'production'
    process.env['FRONTEND_URL'] = 'https://belllum-monorepo.vercel.app'

    expect(getAllowedCorsOrigins()).toEqual(['https://belllum-monorepo.vercel.app'])
  })

  it('trims the configured frontend URL in production', () => {
    process.env['NODE_ENV'] = 'production'
    process.env['FRONTEND_URL'] = '  https://bellum-ai.com  '

    expect(getAllowedCorsOrigins()).toEqual(['https://bellum-ai.com'])
  })

  it('allows several comma-separated frontend URLs in production', () => {
    process.env['NODE_ENV'] = 'production'
    process.env['FRONTEND_URL'] = 'https://bellum-ai.com, https://app.bellum-ai.com'

    expect(getAllowedCorsOrigins()).toEqual(['https://bellum-ai.com', 'https://app.bellum-ai.com'])
  })

  it('drops empty entries and de-duplicates comma-separated origins', () => {
    process.env['NODE_ENV'] = 'production'
    process.env['FRONTEND_URL'] = 'https://bellum-ai.com,,https://bellum-ai.com,'

    expect(getAllowedCorsOrigins()).toEqual(['https://bellum-ai.com'])
  })

  it('returns no origins when FRONTEND_URL is unset in production', () => {
    process.env['NODE_ENV'] = 'production'
    delete process.env['FRONTEND_URL']

    expect(getAllowedCorsOrigins()).toEqual([])
  })

  it('ignores a remote FRONTEND_URL outside production', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['FRONTEND_URL'] = 'https://belllum-monorepo.vercel.app'

    // A dev API must never be reachable from a deployed site the developer
    // happens to have open in another tab.
    expect(getAllowedCorsOrigins()).toEqual(['http://localhost:5173'])
  })

  it('adds extra loopback origins from FRONTEND_URL outside production', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['FRONTEND_URL'] = 'http://localhost:5175'

    // Vite falls back to 5174/5175 when 5173 is taken (two stacks side by side).
    expect(getAllowedCorsOrigins()).toEqual(['http://localhost:5173', 'http://localhost:5175'])
  })

  it('accepts 127.0.0.1 as a loopback origin outside production', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['FRONTEND_URL'] = 'http://127.0.0.1:4173'

    expect(getAllowedCorsOrigins()).toEqual(['http://localhost:5173', 'http://127.0.0.1:4173'])
  })

  it('never duplicates the default development origin', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['FRONTEND_URL'] = 'http://localhost:5173'

    expect(getAllowedCorsOrigins()).toEqual(['http://localhost:5173'])
  })

  it('rejects an https loopback origin outside production', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['FRONTEND_URL'] = 'https://localhost:5175'

    expect(getAllowedCorsOrigins()).toEqual(['http://localhost:5173'])
  })

  it('rejects a malformed FRONTEND_URL entry outside production', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['FRONTEND_URL'] = 'not-a-url, http://localhost:5175'

    expect(getAllowedCorsOrigins()).toEqual(['http://localhost:5173', 'http://localhost:5175'])
  })
})
