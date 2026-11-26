import { CompaniesController } from './companies.controller'

/**
 * #1586 — `marketPaths` est composé DANS LE CONTRÔLEUR, pas dans le service :
 * GA-07 (frontières de modules) est un cliquet au plafond, et la garde nomme
 * elle-même le contrôleur comme l'endroit où cette orchestration doit vivre.
 * Ces tests suivent donc le code.
 */
const SUGGESTION = { name: 'ROCHE', siren: '552012031', city: 'BOULOGNE-BILLANCOURT', sector: 'Pharma' }

/** Mémoire marché « aucun rapprochement » par défaut : chaque suggestion
 *  ressort avec `marketPaths: null`, comme un corpus qui ne connaît rien. */
function memoireSansRapprochement() {
  return { resolveDetailed: jest.fn().mockResolvedValue({ status: 'unresolved' }) }
}

function build(suggestions: unknown[] = [SUGGESTION], marketMemory = memoireSansRapprochement()) {
  const companies = { search: jest.fn().mockResolvedValue({ suggestions }) }
  const controller = new CompaniesController(companies as never, marketMemory as never)
  return { controller, companies, marketMemory }
}

const QUERY = { q: 'roche', limit: 5, country: undefined, lens: undefined } as never

describe('CompaniesController — marketPaths (#1586)', () => {
  it('rend le nombre BRUT de parcours quand la mémoire marché est couverte', async () => {
    const marketMemory = {
      resolveDetailed: jest.fn().mockResolvedValue({
        status: 'resolved',
        companyKey: 'roche',
        strength: 'domain',
        pathsTotal: 41,
        ambiguityDropped: null,
      }),
    }
    const { controller } = build([SUGGESTION], marketMemory)
    const res = await controller.search(QUERY)
    expect(res.suggestions[0]?.marketPaths).toBe(41)
  })

  /**
   * La contrainte non négociable de #1586 : ICI, et SEULEMENT ici, `0`
   * s'affiche. « ROCHE, 41 parcours » contre « ROCHE BOBOIS, aucun parcours »
   * — l'asymétrie EST ce qui départage les deux homonymes.
   */
  it('rend `0` — pas `null` — quand la mémoire est couverte mais SOUS le seuil', async () => {
    const marketMemory = {
      resolveDetailed: jest.fn().mockResolvedValue({
        status: 'resolved',
        companyKey: 'roche-sci',
        strength: 'inferred',
        pathsTotal: 1,
        ambiguityDropped: null,
      }),
    }
    const { controller } = build([{ ...SUGGESTION, siren: '811131184' }], marketMemory)
    const res = await controller.search(QUERY)
    expect(res.suggestions[0]?.marketPaths).toBe(0)
  })

  it('rend `null` — jamais `0` — quand la mémoire ne rapproche AUCUNE entreprise', async () => {
    const { controller } = build()
    const res = await controller.search(QUERY)
    expect(res.suggestions[0]?.marketPaths).toBeNull()
  })

  it('pose le champ sur TOUTES les lignes du lot, jamais sur une seule', async () => {
    // Une ligne isolée se lirait comme un branchement fait à moitié.
    const { controller } = build([SUGGESTION, { ...SUGGESTION, name: 'ROCHE BOBOIS', siren: '552150689' }])
    const res = await controller.search(QUERY)
    expect(res.suggestions.every(s => 'marketPaths' in s)).toBe(true)
  })

  it('ne fait JAMAIS échouer l’autocomplétion quand la mémoire marché tombe', async () => {
    const marketMemory = { resolveDetailed: jest.fn().mockRejectedValue(new Error('corpus down')) }
    const { controller } = build([SUGGESTION], marketMemory)
    const res = await controller.search(QUERY)
    expect(res.suggestions[0]?.name).toBe('ROCHE')
    expect(res.suggestions[0]?.marketPaths).toBeNull()
  })

  it('n’interroge pas la mémoire quand le lot est vide', async () => {
    const { controller, marketMemory } = build([])
    const res = await controller.search(QUERY)
    expect(res.suggestions).toEqual([])
    expect(marketMemory.resolveDetailed).not.toHaveBeenCalled()
  })
})

/**
 * #1756.3 (lot 14) — DEUX IDENTITÉS DISTINCTES NE PARTAGENT JAMAIS UN COMPTE.
 *
 * Mesuré en production le 10/09/2026, `GET /companies/search?q=THALES&country=FR` :
 * trois raisons sociales, trois SIREN distincts (le groupe aérospatial 1000-1999
 * salariés, une SAS conseil 100-199, une société de fret fluvial à 1-2 salariés)
 * rendaient TOUTES `marketPaths: 272` — le compte du groupe, recopié sur un
 * homonyme sans aucun rapport. `resolveDetailed` répond à CHAQUE suggestion
 * séparément et ne peut pas savoir que le LOT en pose la même question
 * plusieurs fois pour des identités différentes ; `withMarketPaths` est la
 * seule surface qui voit le lot entier, donc la seule qui peut le voir.
 *
 * La doctrine interdit une jointure automatique sur nom seul, et dit qu'un
 * rapprochement `inferred` ne fusionne jamais. Deux identités (SIREN /
 * registryId) DIFFÉRENTES qui rapprochent sur le MÊME `companyKey` via un nom
 * seul ne peuvent pas être toutes les deux ce compte — la réponse honnête
 * n'est pas de choisir laquelle, c'est de ne présenter le compte comme un fait
 * établi pour AUCUNE des deux.
 */
describe('CompaniesController — homonymes distincts (#1756.3, lot 14)', () => {
  const THALES_AEROSPATIALE = { name: 'THALES', siren: '552059024', city: 'MEUDON', sector: 'Sièges sociaux' }
  const THALES_INTERNATIONAL = {
    name: 'THALES INTERNATIONAL SAS',
    siren: '303889307',
    city: 'MEUDON',
    sector: 'Conseil',
  }
  const THALES_FRET_FLUVIAL = {
    name: 'THALES',
    siren: '822041042',
    city: 'SAINT-ETIENNE-DU-VAUVRAY',
    sector: 'Transports fluviaux de fret',
  }

  function memoireQuiRapprocheToujoursSurLeMemeCompte() {
    // Le corpus n'a qu'UNE ligne « thales » (le groupe) — il répond donc la
    // MÊME chose, en toute bonne foi, à chacune des trois questions.
    return {
      resolveDetailed: jest.fn().mockResolvedValue({
        status: 'resolved',
        companyKey: 'thales',
        strength: 'inferred',
        matchedOn: 'name',
        pathsTotal: 272,
        ambiguityDropped: null,
      }),
    }
  }

  it('SAIT DIRE NON — trois SIREN distincts sur le même companyKey inferred : AUCUN ne garde le compte', async () => {
    const { controller } = build(
      [THALES_AEROSPATIALE, THALES_INTERNATIONAL, THALES_FRET_FLUVIAL],
      memoireQuiRapprocheToujoursSurLeMemeCompte(),
    )

    const res = await controller.search(QUERY)

    expect(res.suggestions.map(s => s.marketPaths)).toEqual([null, null, null])
  })

  it("n'attrape pas ce qu'elle ne vise pas — une SEULE identité sur ce companyKey garde son compte", async () => {
    const { controller } = build([THALES_AEROSPATIALE], memoireQuiRapprocheToujoursSurLeMemeCompte())

    const res = await controller.search(QUERY)

    expect(res.suggestions[0]?.marketPaths).toBe(272)
  })

  it("n'attrape pas ce qu'elle ne vise pas — deux homonymes qui résolvent sur des companyKey DIFFÉRENTS gardent chacun le leur", async () => {
    const roche = { name: 'ROCHE', siren: '552012031', city: 'BOULOGNE-BILLANCOURT', sector: 'Pharma' }
    const rocheBobois = { name: 'ROCHE BOBOIS', siren: '552150689', city: 'PARIS', sector: 'Mobilier' }
    const marketMemory = {
      resolveDetailed: jest.fn().mockImplementation(({ name }: { name: string }) =>
        Promise.resolve(
          name === 'ROCHE'
            ? {
                status: 'resolved',
                companyKey: 'roche',
                strength: 'inferred',
                pathsTotal: 41,
                ambiguityDropped: null,
              }
            : { status: 'unresolved' },
        ),
      ),
    }
    const { controller } = build([roche, rocheBobois], marketMemory)

    const res = await controller.search(QUERY)

    expect(res.suggestions[0]?.marketPaths).toBe(41)
    expect(res.suggestions[1]?.marketPaths).toBeNull()
  })

  it('lit un corpus non vide — la collision se détecte sur un lot réel de plus de deux suggestions', async () => {
    const { controller, marketMemory } = build(
      [THALES_AEROSPATIALE, THALES_INTERNATIONAL, THALES_FRET_FLUVIAL],
      memoireQuiRapprocheToujoursSurLeMemeCompte(),
    )

    await controller.search(QUERY)

    expect(marketMemory.resolveDetailed).toHaveBeenCalledTimes(3)
  })
})
