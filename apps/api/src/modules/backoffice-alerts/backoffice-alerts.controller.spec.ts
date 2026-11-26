import { BackofficeAlertsController } from './backoffice-alerts.controller'

describe('BackofficeAlertsController — déclenchement manuel (#1676.1)', () => {
  it('délègue à BackofficeAlertsService#runNow', async () => {
    const alerts = {
      runNow: jest.fn().mockResolvedValue(undefined),
      checkWorkspacesAtRisk: jest.fn().mockResolvedValue(undefined),
    }
    const controller = new BackofficeAlertsController(alerts as never)

    const result = await controller.runManually()

    expect(alerts.runNow).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true })
  })

  it('#1946.22 — la recette joue AUSSI le passage « espace à risque » (sa fenêtre de 7 jours l’empêche de harceler)', async () => {
    const alerts = {
      runNow: jest.fn().mockResolvedValue(undefined),
      checkWorkspacesAtRisk: jest.fn().mockResolvedValue(undefined),
    }
    const controller = new BackofficeAlertsController(alerts as never)

    await controller.runManually()

    expect(alerts.checkWorkspacesAtRisk).toHaveBeenCalledTimes(1)
  })

  it('#2528.3 — provider-credits-exhausted délègue à BackofficeAlertsService#reportProviderCreditsExhausted', async () => {
    const alerts = { reportProviderCreditsExhausted: jest.fn().mockResolvedValue(undefined) }
    const controller = new BackofficeAlertsController(alerts as never)
    const body = { source: 'BRAVE_API_KEY', sinceIso: '2026-09-17T12:16:28.000Z', degraded: 'x' }

    const result = await controller.providerCreditsExhausted(body as never)

    expect(alerts.reportProviderCreditsExhausted).toHaveBeenCalledWith(body)
    expect(result).toEqual({ ok: true })
  })
})
