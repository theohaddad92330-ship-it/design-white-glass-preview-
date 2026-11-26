import type { CompanySearchResponse } from '@bellum/contracts'
import { CompaniesService } from './companies.service'
import type { IaClient } from '../ia/ia.client'

describe('CompaniesService', () => {
  function build(overrides: Partial<jest.Mocked<IaClient>> = {}) {
    const ia = {
      searchCompanies: jest.fn<Promise<CompanySearchResponse>, [string, number?, string?]>(),
      ...overrides,
    } as unknown as jest.Mocked<IaClient>
    const service = new CompaniesService(ia)
    return { service, ia }
  }

  it('returns the IA suggestions verbatim on success', async () => {
    const { service, ia } = build()
    const suggestions = [{ name: 'Capgemini', siren: '330703844', city: 'Paris', sector: 'Conseil' }]
    ia.searchCompanies.mockResolvedValueOnce({ suggestions })

    const result = await service.search('cap', 5)

    expect(result).toEqual({ suggestions })
    // FR default: no `country` forwarded (undefined) — Pappers path untouched.
    expect(ia.searchCompanies).toHaveBeenCalledWith('cap', 5, undefined, expect.objectContaining({ timeoutMs: 12_000 }))
  })

  it('forwards the ESN lens so the onboarding dropdown is ranked, not raw registry order', async () => {
    const { service, ia } = build()
    ia.searchCompanies.mockResolvedValueOnce({ suggestions: [] })

    await service.search('carrefour', 5, 'FR', 'esn')

    expect(ia.searchCompanies).toHaveBeenCalledWith('carrefour', 5, 'FR', expect.objectContaining({ lens: 'esn' }))
  })

  it('sends no lens by default so the prospect-account autocomplete is unchanged', async () => {
    // A target account is NOT an IT services company — ranking it on that axis
    // would be exactly backwards. The default must stay registry order.
    const { service, ia } = build()
    ia.searchCompanies.mockResolvedValueOnce({ suggestions: [] })

    await service.search('carrefour', 5)

    expect(ia.searchCompanies).toHaveBeenCalledWith(
      'carrefour',
      5,
      undefined,
      expect.objectContaining({ lens: undefined }),
    )
  })

  it('forwards a non-FR market so the IA delegates to the country pack', async () => {
    const { service, ia } = build()
    const suggestions = [
      {
        name: 'Apple Inc.',
        siren: '',
        city: 'Cupertino, CA',
        sector: '',
        country: 'US' as const,
        registryId: '0000320193',
        registryIdLabel: 'CIK',
      },
    ]
    ia.searchCompanies.mockResolvedValueOnce({ suggestions })

    const result = await service.search('apple', 5, 'US')

    expect(result).toEqual({ suggestions })
    expect(ia.searchCompanies).toHaveBeenCalledWith('apple', 5, 'US', expect.objectContaining({ timeoutMs: 12_000 }))
  })

  it('soft-fails to an empty list when the IA throws', async () => {
    const { service, ia } = build()
    ia.searchCompanies.mockRejectedValueOnce(new Error('IA down'))

    const result = await service.search('cap', 5)

    // #1107/#1109 : toujours une liste vide (une autocomplétion ne rend pas de
    // 5xx), mais elle DIT qu'elle est vide faute de réponse — sans quoi l'écran
    // écrit « Aucune entreprise trouvée », c'est-à-dire l'inverse du vrai.
    expect(result).toEqual({ suggestions: [], sourceUnavailable: true })
  })

  it("recopie l'aveu d'indisponibilité rendu par le service IA", async () => {
    const { service, ia } = build()
    ia.searchCompanies.mockResolvedValueOnce({
      suggestions: [],
      sourceUnavailable: true,
    } as unknown as CompanySearchResponse)

    expect(await service.search('prevoir', 5)).toEqual({ suggestions: [], sourceUnavailable: true })
  })

  it('defends against an undefined `suggestions` field', async () => {
    const { service, ia } = build()
    ia.searchCompanies.mockResolvedValueOnce({
      suggestions: undefined as unknown as CompanySearchResponse['suggestions'],
    })

    const result = await service.search('cap', 5)

    expect(result).toEqual({ suggestions: [] })
  })
  /**
   * #1099 — le proxy RECONSTRUIT la réponse (`{ suggestions: … }`), si bien
   * qu'un champ ajouté au contrat partagé disparaît entre l'IA et le navigateur
   * sans qu'aucun test ne tombe : chaque côté reste cohérent avec lui-même, et
   * personne ne les compare. `broadenedFrom` — l'aveu que la recherche a été
   * élargie — est passé exactement par là, et ne s'est vu qu'en production.
   */
  it('recopie chaque clé rendue par le service IA', async () => {
    const { service, ia } = build()
    const reponse = {
      suggestions: [{ name: 'BEDROCK (M6 DIGITAL DISTRIBUTION)', siren: '493869002', city: 'NEUILLY', sector: '' }],
      broadenedFrom: 'Bedrock',
    } as unknown as CompanySearchResponse
    ia.searchCompanies.mockResolvedValueOnce(reponse)

    const result = (await service.search('Bedrock Streaming', 5)) as Record<string, unknown>

    for (const cle of Object.keys(reponse)) expect(result).toHaveProperty(cle)
    expect(result.broadenedFrom).toBe('Bedrock')
  })

  it("n'annonce pas un élargissement qui n'a pas eu lieu", async () => {
    // Le corps d'une recherche nominale reste byte-identique : une clé
    // `broadenedFrom: undefined` ferait croire à l'écran qu'il a quelque chose
    // à dire.
    const { service, ia } = build()
    ia.searchCompanies.mockResolvedValueOnce({ suggestions: [] })

    expect(Object.keys(await service.search('Capgemini', 5))).toEqual(['suggestions'])
  })
})
