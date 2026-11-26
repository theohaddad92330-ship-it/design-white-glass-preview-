import { HttpClient } from '@bellum/http'
import { MissionExtractionService, type MissionExtraction } from './mission-extraction.service'

/**
 * LE CLIENT VERS LA LECTURE AUTOMATIQUE DE MISSION (#2560).
 *
 * Ce que ces tests protègent :
 *
 *  1. **Une panne de TRANSPORT rend `unavailable`, jamais une exception ni un
 *     statut métier inventé** — le dialogue de création ne doit jamais se
 *     bloquer parce que le service IA est indisponible.
 *  2. **Un succès IA voyage tel quel**, statuts et champs compris.
 *
 * `HttpClient.prototype.request` est espionné plutôt que le réseau mocké —
 * même raison que `expense-extraction.service.spec.ts` : le service construit
 * sa PROPRE instance de `HttpClient`.
 */
function fakeConfig(values: Record<string, string | undefined> = {}): { get: jest.Mock } {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) }
}

function okEnvelope(overrides: Partial<MissionExtraction> = {}): { success: true; data: MissionExtraction } {
  return {
    success: true,
    data: {
      status: 'ok',
      costUsd: 0.0013,
      fields: {
        accountName: { value: 'Acme Corp', confidence: 0.95, sourceExcerpt: 'Fiche de mission — Acme Corp' },
        roleTitle: { value: 'Développeur backend', confidence: 0.9, sourceExcerpt: 'Poste : Développeur backend' },
        startedOn: { value: '2026-10-01', confidence: 0.9, sourceExcerpt: 'Début : 2026-10-01' },
        endsOn: { value: '2027-03-31', confidence: 0.9, sourceExcerpt: 'Fin : 2027-03-31' },
        dailyRate: { value: 550, confidence: 0.88, sourceExcerpt: 'TJM : 550 euros' },
        days: { value: 120, confidence: 0.85, sourceExcerpt: 'Volume : 120 jours' },
        supervisedForfait: { value: null, confidence: 0, sourceExcerpt: '' },
      },
      ...overrides,
    },
  }
}

describe('MissionExtractionService', () => {
  afterEach(() => jest.restoreAllMocks())

  it('relaie le résultat IA tel quel sur un appel réussi', async () => {
    const spy = jest.spyOn(HttpClient.prototype, 'request').mockResolvedValue(okEnvelope())
    const service = new MissionExtractionService(fakeConfig() as never)

    const result = await service.extract({ text: 'Fiche de mission — Acme Corp' })

    expect(result.status).toBe('ok')
    expect(result.fields.accountName.value).toBe('Acme Corp')
    expect(result.fields.days.value).toBe(120)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('envoie le texte OU le fichier — jamais une seconde forme de charge', async () => {
    const spy = jest.spyOn(HttpClient.prototype, 'request').mockResolvedValue(okEnvelope())
    const service = new MissionExtractionService(fakeConfig() as never)

    await service.extract({ fileBase64: 'Zm9v', fileName: 'contrat.pdf' })

    const call = spy.mock.calls[0]?.[0] as { urlInfo: { template: string }; body: Record<string, unknown> }
    expect(call.urlInfo.template).toBe('/missions/extract')
    expect(call.body).toEqual({ text: null, file_base64: 'Zm9v', file_name: 'contrat.pdf' })
  })

  it('une panne de TRANSPORT rend `unavailable` — jamais une exception qui bloquerait le dialogue', async () => {
    jest.spyOn(HttpClient.prototype, 'request').mockRejectedValue(new Error('IA injoignable'))
    const service = new MissionExtractionService(fakeConfig() as never)

    const result = await service.extract({ text: 'Fiche de mission — Acme Corp' })

    expect(result.status).toBe('unavailable')
    expect(result.costUsd).toBeNull()
    expect(result.fields.accountName.value).toBeNull()
  })

  it('pose l’en-tête interne quand le secret est configuré, aucun sinon', async () => {
    const withSecret = new (MissionExtractionService as unknown as {
      new (config: unknown): { http: HttpClient }
    })(fakeConfig({ internalApiSecret: 'shh' }))
    const withoutSecret = new (MissionExtractionService as unknown as {
      new (config: unknown): { http: HttpClient }
    })(fakeConfig({}))

    expect((withSecret.http as unknown as { defaultHeaders: Record<string, string> }).defaultHeaders).toEqual({
      'x-internal-secret': 'shh',
    })
    expect((withoutSecret.http as unknown as { defaultHeaders: Record<string, string> }).defaultHeaders).toEqual({})
  })
})
