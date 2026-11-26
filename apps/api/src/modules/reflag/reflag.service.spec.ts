import { ConfigService } from '@nestjs/config'
import { ReflagService } from './reflag.service'

// `onModuleInit` constructs the SDK itself, and a real `initialize()` opens a
// network connection — so the vendor module is mocked for the boot-path tests.
const initializeMock = jest.fn().mockResolvedValue(undefined)
jest.mock('@reflag/node-sdk', () => ({
  ReflagClient: jest.fn().mockImplementation(() => ({
    initialize: initializeMock,
    flush: jest.fn().mockResolvedValue(undefined),
    bindClient: jest.fn(() => ({ getFlag: () => ({ isEnabled: false }), getFlags: () => ({}) })),
  })),
}))

beforeEach(() => {
  initializeMock.mockClear()
  initializeMock.mockResolvedValue(undefined)
})

/** A ConfigService stub returning the given REFLAG_SECRET_KEY. */
const config = (secretKey: string) => ({ get: () => secretKey }) as unknown as ConfigService

/** Reaches into the private client slot — the SDK itself is never constructed
 *  in tests (it would open a network connection at `initialize`). */
function withClient(service: ReflagService, client: unknown): ReflagService {
  ;(service as unknown as { client: unknown }).client = client
  return service
}

const boundClient = (flags: Record<string, { isEnabled: boolean }>) => ({
  bindClient: jest.fn(() => ({
    getFlag: (key: string) => flags[key] ?? { isEnabled: false },
    getFlags: () => flags,
  })),
})

describe('ReflagService', () => {
  describe('unconfigured (no REFLAG_SECRET_KEY)', () => {
    let service: ReflagService

    beforeEach(async () => {
      service = new ReflagService(config(''))
      await service.onModuleInit()
    })

    /** The whole point of fail-open: product code never branches on "is Reflag
     *  configured?", so an unconfigured SDK must answer, not throw. */
    it('reports every flag as disabled instead of throwing', () => {
      expect(service.isEnabled('anything')).toBe(false)
      expect(service.isEnabled('anything', { userId: 'u1', companyId: 'w1' })).toBe(false)
    })

    it('lists no flags and reports itself as not configured', () => {
      expect(service.listFlags()).toEqual([])
      expect(service.isConfigured()).toBe(false)
    })

    it('shuts down cleanly with no client to flush', async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined()
    })
  })

  describe('configured', () => {
    let service: ReflagService

    beforeEach(() => {
      service = withClient(
        new ReflagService(config('sk_test')),
        boundClient({ 'export-pdf': { isEnabled: true }, 'beta-chat': { isEnabled: false } }),
      )
    })

    it('evaluates a known flag and defaults an unknown one to disabled', () => {
      expect(service.isEnabled('export-pdf')).toBe(true)
      expect(service.isEnabled('beta-chat')).toBe(false)
      expect(service.isEnabled('never-defined')).toBe(false)
    })

    it('scopes the evaluation to the user and the WORKSPACE as company', () => {
      const client = (service as unknown as { client: ReturnType<typeof boundClient> }).client
      service.isEnabled('export-pdf', { userId: 'user-1', companyId: 'ws-1' })

      expect(client.bindClient).toHaveBeenCalledWith({
        user: { id: 'user-1' },
        company: { id: 'ws-1' },
      })
    })

    it('omits an absent user/company rather than binding empty ids', () => {
      const client = (service as unknown as { client: ReturnType<typeof boundClient> }).client
      service.isEnabled('export-pdf', { userId: 'user-1' })

      expect(client.bindClient).toHaveBeenCalledWith({ user: { id: 'user-1' }, company: undefined })
    })

    it('lists every flag with its value for the backoffice', () => {
      expect(service.listFlags({ userId: 'user-1' })).toEqual([
        { key: 'export-pdf', enabled: true },
        { key: 'beta-chat', enabled: false },
      ])
      expect(service.isConfigured()).toBe(true)
    })
  })

  /** A failed `initialize` must land in exactly the same state as "no key" —
   *  otherwise a Reflag outage would take the app down with it. `onModuleInit`
   *  constructs the SDK itself, so the module is mocked rather than injected. */
  it('falls back to disabled when the SDK fails to initialise', async () => {
    initializeMock.mockRejectedValueOnce(new Error('reflag down'))

    const service = new ReflagService(config('sk_test'))
    await service.onModuleInit()

    expect(service.isConfigured()).toBe(false)
    expect(service.isEnabled('export-pdf')).toBe(false)
  })

  it('is configured once the SDK initialises', async () => {
    const service = new ReflagService(config('sk_test'))
    await service.onModuleInit()

    expect(service.isConfigured()).toBe(true)
  })
})
