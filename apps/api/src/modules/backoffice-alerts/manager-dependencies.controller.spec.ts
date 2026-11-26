import type { ConfigService } from '@nestjs/config'
import { ManagerDependenciesController } from './manager-dependencies.controller'

const balanceRetrieveMock = jest.fn()
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({ balance: { retrieve: balanceRetrieveMock } }))
})

const domainsListMock = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ domains: { list: domainsListMock } })),
}))

const originalFetch = global.fetch

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService
}

describe('ManagerDependenciesController — #1676.2', () => {
  beforeEach(() => {
    balanceRetrieveMock.mockReset()
    domainsListMock.mockReset()
    global.fetch = jest.fn() as unknown as typeof fetch
    delete process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL']
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('GET status — présence seulement', () => {
    it('rend "non configuré" pour chaque dépendance sans clé', async () => {
      const controller = new ManagerDependenciesController(makeConfig({}))
      const result = await controller.status()
      expect(result.dependencies).toEqual([
        { id: 'stripe', configured: false },
        { id: 'resend', configured: false },
        { id: 'slack', configured: false },
      ])
    })
  })

  describe('POST :id/test', () => {
    it('un identifiant inconnu est refusé proprement', async () => {
      const controller = new ManagerDependenciesController(makeConfig({}))
      const result = await controller.test('vercel')
      expect(result.ok).toBe(false)
    })

    it('« non configuré » n’est jamais confondu avec « en erreur » — Stripe sans clé', async () => {
      const controller = new ManagerDependenciesController(makeConfig({}))
      const result = await controller.test('stripe')
      expect(result.ok).toBe(false)
      expect(result.detail).toContain('non configuré')
      expect(balanceRetrieveMock).not.toHaveBeenCalled()
    })

    it('sain n’est jamais déclaré sans test réel — Stripe configuré ET l’appel réussit', async () => {
      balanceRetrieveMock.mockResolvedValue({ available: [{ amount: 100, currency: 'eur' }] })
      const controller = new ManagerDependenciesController(makeConfig({ stripeSecretKey: 'sk_test_123' }))
      const result = await controller.test('stripe')
      expect(result.ok).toBe(true)
      expect(balanceRetrieveMock).toHaveBeenCalledTimes(1)
    })

    it('Stripe configuré mais l’appel échoue → ok:false, jamais un succès inventé', async () => {
      balanceRetrieveMock.mockRejectedValue(new Error('Invalid API Key'))
      const controller = new ManagerDependenciesController(makeConfig({ stripeSecretKey: 'sk_bad' }))
      const result = await controller.test('stripe')
      expect(result.ok).toBe(false)
      expect(result.detail).toContain('Invalid API Key')
    })

    it('Resend non configuré → non configuré, aucun appel réseau', async () => {
      const controller = new ManagerDependenciesController(makeConfig({}))
      const result = await controller.test('resend')
      expect(result.ok).toBe(false)
      expect(domainsListMock).not.toHaveBeenCalled()
    })

    it('Resend configuré et l’appel réussit', async () => {
      domainsListMock.mockResolvedValue({ data: { data: [{ id: '1' }] }, error: null })
      const controller = new ManagerDependenciesController(makeConfig({ resendApiKey: 're_123' }))
      const result = await controller.test('resend')
      expect(result.ok).toBe(true)
    })

    it('Slack sans webhook configuré → non configuré, aucun appel réseau', async () => {
      const controller = new ManagerDependenciesController(makeConfig({}))
      const result = await controller.test('slack')
      expect(result.ok).toBe(false)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('Slack configuré : un appel réel et non destructif (POST d’un message de test)', async () => {
      process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL'] = 'https://hooks.slack.test/abc'
      global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
      const controller = new ManagerDependenciesController(makeConfig({}))
      const result = await controller.test('slack')
      expect(result.ok).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.test/abc',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
