import { HttpClient } from '@bellum/http'
import { ExpenseExtractionService, type ExpenseReceiptExtraction } from './expense-extraction.service'

/**
 * LE CLIENT VERS LA LECTURE AUTOMATIQUE (#1827.2).
 *
 * Ce que ces tests protègent :
 *
 *  1. **Une panne de TRANSPORT rend `unavailable`, jamais une exception ni un
 *     statut métier inventé** — l'écran de dépôt ne doit jamais se bloquer
 *     parce que le service IA est indisponible.
 *  2. **Le corps envoyé est EXACTEMENT ce que `toUploadInput()` produit déjà**
 *     (`fileB64`, `fileName`) — aucune seconde forme de charge n'apparaît.
 *  3. **Un succès IA voyage tel quel**, statuts et champs compris.
 *
 * `HttpClient.prototype.request` est espionné plutôt que le réseau mocké : le
 * service construit sa PROPRE instance de `HttpClient` (délibérément, pour ne
 * pas toucher `modules/ia/ia.client.ts` — voir le commentaire de tête du
 * service), donc rien d'injectable ne remplace la dépendance autrement.
 */
function fakeConfig(values: Record<string, string | undefined> = {}): { get: jest.Mock } {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) }
}

function okEnvelope(overrides: Partial<ExpenseReceiptExtraction> = {}): {
  success: true
  data: ExpenseReceiptExtraction
} {
  return {
    success: true,
    data: {
      status: 'ok',
      ocrUsed: false,
      costUsd: 0.0017,
      fields: {
        amountCents: { value: 4590, confidence: 0.95, sourceExcerpt: 'Total TTC : 45,90 EUR' },
        spentOn: { value: '2026-03-12', confidence: 0.9, sourceExcerpt: 'Date : 12/03/2026' },
        category: { value: 'hotel', confidence: 0.9, sourceExcerpt: 'HOTEL IBIS' },
        vatRateBps: { value: 1000, confidence: 0.8, sourceExcerpt: 'TVA 10%' },
      },
      ...overrides,
    },
  }
}

describe('ExpenseExtractionService', () => {
  afterEach(() => jest.restoreAllMocks())

  it('relaie le résultat IA tel quel sur un appel réussi', async () => {
    const spy = jest.spyOn(HttpClient.prototype, 'request').mockResolvedValue(okEnvelope())
    const service = new ExpenseExtractionService(fakeConfig() as never)

    const result = await service.extract({ fileName: 'facture.pdf', contentType: 'application/pdf', fileB64: 'QUJD' })

    expect(result.status).toBe('ok')
    expect(result.fields.amountCents.value).toBe(4590)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("#2433.4 — la zone source d'un champ lu sur une image voyage telle quelle", async () => {
    const envelope = okEnvelope()
    envelope.data.fields.amountCents.sourceRegion = { x: 0.1, y: 0.5, w: 0.4, h: 0.04 }
    jest.spyOn(HttpClient.prototype, 'request').mockResolvedValue(envelope)
    const service = new ExpenseExtractionService(fakeConfig() as never)

    const result = await service.extract({ fileName: 'ticket.png', contentType: 'image/png', fileB64: 'QUJD' })

    expect(result.fields.amountCents.sourceRegion).toEqual({ x: 0.1, y: 0.5, w: 0.4, h: 0.04 })
    expect(result.fields.spentOn.sourceRegion).toBeUndefined()
  })

  it('envoie EXACTEMENT `file_b64` et `filename` — la même forme que `toUploadInput()`', async () => {
    const spy = jest.spyOn(HttpClient.prototype, 'request').mockResolvedValue(okEnvelope())
    const service = new ExpenseExtractionService(fakeConfig() as never)

    await service.extract({ fileName: 'ticket.jpg', contentType: 'image/jpeg', fileB64: 'Zm9v' })

    const call = spy.mock.calls[0]?.[0] as { urlInfo: { template: string }; body: Record<string, unknown> }
    expect(call.urlInfo.template).toBe('/expenses/extract')
    expect(call.body).toEqual({ file_b64: 'Zm9v', filename: 'ticket.jpg' })
  })

  it('une panne de TRANSPORT rend `unavailable` — jamais une exception qui bloquerait le dépôt', async () => {
    jest.spyOn(HttpClient.prototype, 'request').mockRejectedValue(new Error('IA injoignable'))
    const service = new ExpenseExtractionService(fakeConfig() as never)

    const result = await service.extract({ fileName: 'ticket.jpg', contentType: 'image/jpeg', fileB64: 'Zm9v' })

    expect(result.status).toBe('unavailable')
    expect(result.costUsd).toBeNull()
    expect(result.fields.amountCents.value).toBeNull()
  })

  it('pose l’en-tête interne quand le secret est configuré, aucun sinon', async () => {
    const withSecret = new (ExpenseExtractionService as unknown as {
      new (config: unknown): { http: HttpClient }
    })(fakeConfig({ internalApiSecret: 'shh' }))
    const withoutSecret = new (ExpenseExtractionService as unknown as {
      new (config: unknown): { http: HttpClient }
    })(fakeConfig({}))

    expect((withSecret.http as unknown as { defaultHeaders: Record<string, string> }).defaultHeaders).toEqual({
      'x-internal-secret': 'shh',
    })
    expect((withoutSecret.http as unknown as { defaultHeaders: Record<string, string> }).defaultHeaders).toEqual({})
  })
})
