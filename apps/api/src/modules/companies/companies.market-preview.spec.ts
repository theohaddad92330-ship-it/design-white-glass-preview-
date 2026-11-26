import { CompaniesController } from './companies.controller'

/**
 * #1589.2 — LA PREVIEW MÉMOIRE MARCHÉ, AVANT TOUT DÉBIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ISSUE DEMANDE, ET CE QUE LE CORPUS PERMET
 * ─────────────────────────────────────────────────────────────────────────────
 * #1589.2 écrit : « basé sur l'identité canonique de l'entreprise : SIREN /
 * registry ID / mapping robuste. Jamais uniquement le nom libre si une identité
 * plus forte existe. »
 *
 * ⚠️ **`market_company_signal` ne porte PAS de SIREN**, et `CompanySuggestion`
 * ne porte pas de site web : les deux identités fortes que l'issue nomme
 * n'existent d'aucun des deux côtés de la jointure, à cet instant du parcours.
 * Le rapprochement fort du corpus est le DOMAINE RACINE (`website_domain`), et
 * on ne l'a qu'une fois le compte créé.
 *
 * L'intention de la phrase est tenue autrement, et c'est ce que ces tests
 * gardent : quand deux entreprises du corpus se disputent le nom,
 * `resolveMarketCompany` rend `ambiguous` et **la preview ne dit rien**. Elle ne
 * choisit jamais un candidat au hasard, ce qui est exactement le risque que
 * l'issue cherche à écarter. Le jour où une identité plus forte traverse, elle
 * entre ici — pas avant : un paramètre déclaré que personne ne lit est un
 * mensonge de contrat.
 */

const NAME = 'DECATHLON'

function build(marketMemory: unknown) {
  const companies = { search: jest.fn() }
  return new CompaniesController(companies as never, marketMemory as never)
}

/** Une couverture pleine, telle que `MarketMemoryService.coverageFor` la rend. */
function couvert(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    coverage: {
      covered: true,
      marketPaths: 41,
      esnObserved: [
        { esnName: 'Capgemini', persons: 9, certainty: 'observed' },
        { esnName: 'Sopra', persons: 4, certainty: 'observed' },
      ],
      observedStack: [
        { techno: 'Data', persons: 12 },
        { techno: 'Java', persons: 7 },
        { techno: 'Cloud', persons: 5 },
        { techno: 'SAP', persons: 3 },
      ],
      roleFamilies: [
        { family: 'Data', persons: 12 },
        { family: 'Développement', persons: 9 },
        { family: 'PMO', persons: 4 },
        { family: 'Support', persons: 2 },
      ],
      exEsnPresent: 3,
      observedZone: { city: 'LILLE', region: 'Hauts-de-France', country: 'FR' },
      ...overrides,
    },
  }
}

describe('CompaniesController.marketPreview (#1589.2)', () => {
  it('rend les quatre observations que l’écran de lancement affiche', async () => {
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(couvert()) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(res).toEqual({
      status: 'ok',
      preview: {
        paths_observed: 41,
        esn_observed: 2,
        observed_stack: ['Data', 'Java', 'Cloud'],
        role_families: ['Data', 'Développement', 'PMO'],
      },
    })
  })

  it('⚠️ ne fait traverser AUCUN nom d’ESN — l’issue refuse d’exposer les personnes', async () => {
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(couvert()) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(JSON.stringify(res)).not.toContain('Capgemini')
    expect(JSON.stringify(res)).not.toContain('Sopra')
  })

  it('⚠️ ne fait traverser AUCUN comptage par techno — « Data », jamais « Data (12) »', async () => {
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(couvert()) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(JSON.stringify(res)).not.toContain('persons')
    expect(JSON.stringify(res)).not.toContain('12')
  })

  it('⚠️ ne fait traverser NI zone NI date — l’aperçu n’est pas le dossier', async () => {
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(couvert()) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(JSON.stringify(res)).not.toContain('LILLE')
    expect(res.status === 'ok' && res.preview).not.toHaveProperty('observed_zone')
  })

  it('tronque les listes à la borne du contrat — un aperçu n’est pas un recensement', async () => {
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(couvert()) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(res.status === 'ok' && res.preview?.observed_stack).toHaveLength(3)
    expect(res.status === 'ok' && res.preview?.role_families).toHaveLength(3)
  })

  it('`esn_observed: 0` sur un compte COUVERT est une vraie mesure, pas une absence', async () => {
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(couvert({ esnObserved: [] })) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(res.status === 'ok' && res.preview?.esn_observed).toBe(0)
  })

  it('sous le seuil : `preview: null` — jamais un objet à zéro', async () => {
    const vide = {
      status: 'ok',
      coverage: {
        covered: false,
        marketPaths: null,
        esnObserved: [],
        observedStack: [],
        roleFamilies: [],
        exEsnPresent: null,
        observedZone: null,
      },
    }
    const controller = build({ coverageFor: jest.fn().mockResolvedValue(vide) })
    expect(await controller.marketPreview({ name: NAME, country: 'FR' } as never)).toEqual({
      status: 'ok',
      preview: null,
    })
  })

  it('⚠️ une PANNE de lecture n’est pas une absence d’observation', async () => {
    const controller = build({
      coverageFor: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' }),
    })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(res).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })

  it('⚠️ une exception inattendue ne casse pas l’écran de lancement non plus', async () => {
    const controller = build({ coverageFor: jest.fn().mockRejectedValue(new Error('corpus down')) })
    const res = await controller.marketPreview({ name: NAME, country: 'FR' } as never)
    expect(res.status).toBe('unavailable')
  })

  it('passe le PAYS au rapprochement — c’est le seul départage d’homonymes dont on dispose ici', async () => {
    const coverageFor = jest.fn().mockResolvedValue(couvert())
    await build({ coverageFor }).marketPreview({ name: NAME, country: 'BE' } as never)
    expect(coverageFor).toHaveBeenCalledWith(expect.objectContaining({ name: NAME, country: 'BE' }))
  })

  it('⚠️ n’invente pas de site web : le corpus se rapproche par domaine, on n’en a pas ici', async () => {
    const coverageFor = jest.fn().mockResolvedValue(couvert())
    await build({ coverageFor }).marketPreview({ name: NAME, country: 'FR' } as never)
    expect(coverageFor.mock.calls[0]?.[0]?.website ?? null).toBeNull()
  })
})

describe('CompaniesController.marketPaths (#1593.2)', () => {
  it('départage le lot d’un coup — une seule lecture, pas une par chip', async () => {
    const pathsFor = jest.fn().mockResolvedValue({
      status: 'ok',
      paths: new Map([
        ['DECATHLON', 41],
        ['SAINT-GOBAIN', null],
      ]),
    })
    const res = await build({ pathsFor }).marketPaths({ name: ['DECATHLON', 'SAINT-GOBAIN'] } as never)
    expect(res).toEqual({ status: 'ok', paths: { DECATHLON: 41, 'SAINT-GOBAIN': null } })
    expect(pathsFor).toHaveBeenCalledTimes(1)
  })

  it('⚠️ sous le seuil c’est `null`, jamais `0` — l’exception de #1586 ne vaut pas ici', async () => {
    const pathsFor = jest.fn().mockResolvedValue({ status: 'ok', paths: new Map([['ROCHE BOBOIS', null]]) })
    const res = await build({ pathsFor }).marketPaths({ name: ['ROCHE BOBOIS'] } as never)
    expect(res.status === 'ok' && res.paths['ROCHE BOBOIS']).toBeNull()
  })

  it('⚠️ une PANNE ne rend pas un lot de `null` — l’écran ne doit pas la lire comme une absence', async () => {
    const pathsFor = jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })
    const res = await build({ pathsFor }).marketPaths({ name: ['DECATHLON'] } as never)
    expect(res).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })

  it('ne casse pas l’écran quand la mémoire jette', async () => {
    const pathsFor = jest.fn().mockRejectedValue(new Error('corpus down'))
    expect((await build({ pathsFor }).marketPaths({ name: ['DECATHLON'] } as never)).status).toBe('unavailable')
  })

  it('passe le pays au rapprochement, comme la preview', async () => {
    const pathsFor = jest.fn().mockResolvedValue({ status: 'ok', paths: new Map([['DELHAIZE', 7]]) })
    await build({ pathsFor }).marketPaths({ name: ['DELHAIZE'], country: 'BE' } as never)
    expect(pathsFor).toHaveBeenCalledWith([expect.objectContaining({ name: 'DELHAIZE', country: 'BE' })])
  })
})

/**
 * Trouvé À LA RECETTE du 08/09/2026, pas en CI — et c'est le motif qui compte.
 *
 * Chaque ligne de code était juste ; le défaut vivait dans la POPULATION.
 * « Autre » est le seau où le corpus range ce qu'il n'a pas su classer, donc
 * le plus gros, donc PREMIER sur les cinq premières entreprises couvertes de
 * la salle de démonstration. Aucun test ne pouvait le voir : personne
 * n'écrirait « Autre » dans une donnée d'exemple.
 */
describe('CompaniesController.marketPreview — « Autre » n’est pas une famille de rôles', () => {
  function avecFamilles(roleFamilies: Array<{ family: string; persons: number }>) {
    return {
      status: 'ok',
      coverage: {
        covered: true,
        marketPaths: 259,
        esnObserved: [],
        observedStack: [],
        roleFamilies,
        exEsnPresent: null,
        observedZone: null,
      },
    }
  }

  it('le seau de résidu ne prend pas la place d’une famille NOMMÉE', async () => {
    // La forme exacte mesurée sur ORANGE en production.
    const controller = build({
      coverageFor: jest.fn().mockResolvedValue(
        avecFamilles([
          { family: 'Autre', persons: 120 },
          { family: 'Chef de projet', persons: 40 },
          { family: 'Data / IA', persons: 31 },
          { family: 'Infra / Cloud', persons: 22 },
        ]),
      ),
    })
    const res = await controller.marketPreview({ name: 'ORANGE', country: 'FR' } as never)
    expect(res.status === 'ok' && res.preview?.role_families).toEqual(['Chef de projet', 'Data / IA', 'Infra / Cloud'])
  })

  it('⚠️ filtre AVANT de tronquer — sinon la 3ᵉ place reste perdue', async () => {
    const controller = build({
      coverageFor: jest.fn().mockResolvedValue(
        avecFamilles([
          { family: 'Autre', persons: 99 },
          { family: 'Développement', persons: 12 },
          { family: 'Marketing / Com', persons: 8 },
          { family: 'Formation / RH', persons: 4 },
        ]),
      ),
    })
    const res = await controller.marketPreview({ name: 'X', country: 'FR' } as never)
    expect(res.status === 'ok' && res.preview?.role_families).toHaveLength(3)
  })

  it('un compte dont le corpus ne connaît QUE le résidu rend une liste vide, pas « Autre »', async () => {
    const controller = build({
      coverageFor: jest.fn().mockResolvedValue(avecFamilles([{ family: 'Autre', persons: 7 }])),
    })
    const res = await controller.marketPreview({ name: 'X', country: 'FR' } as never)
    // L'écran écrit alors « Inconnu » — jamais « aucune famille de rôles ».
    expect(res.status === 'ok' && res.preview?.role_families).toEqual([])
  })
})
