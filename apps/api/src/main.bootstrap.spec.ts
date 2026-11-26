import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression tripwires on the bootstrap file. `bootstrap()` runs at import
 * (top-level call) so it can't be executed under Jest — instead we pin the
 * source lines whose silent removal would break rolling deploys at N replicas.
 */
describe('bootstrap (main.ts) — rolling-deploy safety', () => {
  const source = readFileSync(join(__dirname, 'main.ts'), 'utf8')

  it('enables Nest shutdown hooks — SIGTERM must drain BullMQ workers and close Redis clients', () => {
    // Without this, Railway's SIGTERM hard-kills the process mid-analysis:
    // BullMQ jobs stall and re-run (re-burning Claude tokens) and Redis
    // connections (Socket.IO adapter, cron locks, cancel pub/sub) leak.
    expect(source).toContain('app.enableShutdownHooks()')
  })

  it('trusts exactly one proxy hop — rate-limit keys must reflect the real client IP', () => {
    expect(source).toContain("set('trust proxy', 1)")
  })
})
