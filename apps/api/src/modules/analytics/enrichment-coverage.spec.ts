import {
  buildContactReachability,
  buildEnrichmentCoverage,
  type ContactReachabilityRow,
  type EnrichmentAttemptRow,
} from './enrichment-coverage'

/**
 * La mesure qui décide s'il faut payer un fournisseur de repli. Ces tests
 * protègent les trois règles qui la rendent lisible sans se tromper.
 */
function attempt(over: Partial<EnrichmentAttemptRow> = {}): EnrichmentAttemptRow {
  return { result: 'matched', provider: 'apollo', missing: null, ...over }
}

describe('buildEnrichmentCoverage', () => {
  it('rend null — jamais 0 % — quand rien n’a été tenté', () => {
    // Un espace créé hier afficherait « 0 % de réussite » et ferait chercher une
    // panne là où il n'y a simplement pas de mesure.
    const coverage = buildEnrichmentCoverage([], 30)
    expect(coverage.resolutionRate).toBeNull()
    expect(coverage.attempts).toBe(0)
  })

  it('calcule le taux sur les tentatives réelles', () => {
    const coverage = buildEnrichmentCoverage(
      [attempt(), attempt(), attempt({ result: 'no_new_data', provider: null }), attempt({ result: 'no_new_data' })],
      30,
    )
    expect(coverage.attempts).toBe(4)
    expect(coverage.resolved).toBe(2)
    expect(coverage.unresolved).toBe(2)
    expect(coverage.resolutionRate).toBe(0.5)
  })

  it('n’attribue une résolution qu’à un fournisseur qui a VRAIMENT trouvé', () => {
    // Un fournisseur qui a répondu « rien » ne doit pas figurer au tableau des
    // résolveurs : il y passerait pour productif.
    const coverage = buildEnrichmentCoverage(
      [attempt({ provider: 'apollo' }), attempt({ result: 'no_new_data', provider: 'dropcontact' })],
      30,
    )
    expect(coverage.byProvider).toEqual([{ provider: 'apollo', resolved: 1, phoneFoundRate: 1 }])
  })

  // #3022 (retour bêta) — le taux qui dit LEQUEL des fournisseurs de repli vaut
  // un abonnement pour le téléphone spécifiquement, pas seulement « email OU
  // téléphone OU LinkedIn » confondus dans `resolved`.
  describe('phoneFoundRate — par fournisseur (#3022)', () => {
    it('mesure, PARMI les résolutions créditées à ce fournisseur, la part qui laisse le téléphone renseigné', () => {
      const coverage = buildEnrichmentCoverage(
        [
          attempt({ provider: 'lusha', missing: [] }),
          attempt({ provider: 'lusha', missing: [] }),
          attempt({ provider: 'lusha', missing: ['phone'] }),
          attempt({ provider: 'lusha', missing: ['phone'] }),
        ],
        30,
      )
      const lusha = coverage.byProvider.find(p => p.provider === 'lusha')
      expect(lusha).toEqual({ provider: 'lusha', resolved: 4, phoneFoundRate: 0.5 })
    })

    it('ne compte QUE les tentatives créditées à CE fournisseur — jamais le mélange de tous', () => {
      const coverage = buildEnrichmentCoverage(
        [
          attempt({ provider: 'apollo', missing: ['phone'] }), // Apollo : email trouvé, jamais le téléphone (#3022)
          attempt({ provider: 'apollo', missing: ['phone'] }),
          attempt({ provider: 'lusha', missing: [] }), // Lusha : comble le téléphone
        ],
        30,
      )
      const apollo = coverage.byProvider.find(p => p.provider === 'apollo')
      const lusha = coverage.byProvider.find(p => p.provider === 'lusha')
      expect(apollo?.phoneFoundRate).toBe(0)
      expect(lusha?.phoneFoundRate).toBe(1)
    })

    it('un vrai 0 % mesuré (pas un « non mesuré ») quand ce fournisseur ne laisse jamais le téléphone', () => {
      const coverage = buildEnrichmentCoverage([attempt({ provider: 'hunter', missing: ['phone'] })], 30)
      expect(coverage.byProvider).toEqual([{ provider: 'hunter', resolved: 1, phoneFoundRate: 0 }])
    })
  })

  it('isole ce que le REPLI a réellement apporté — la décision d’achat tient là', () => {
    const coverage = buildEnrichmentCoverage(
      [
        attempt({ provider: 'apollo' }),
        attempt({ provider: 'apollo' }),
        attempt({ provider: 'dropcontact' }),
        attempt({ provider: 'hunter' }),
      ],
      30,
    )
    expect(coverage.resolvedByFallback).toBe(2)
  })

  it('à zéro repli utile, aucun abonnement ne se justifie', () => {
    const coverage = buildEnrichmentCoverage([attempt(), attempt()], 30)
    expect(coverage.resolvedByFallback).toBe(0)
  })

  it('ventile ce qui manque encore — c’est ce qui dit QUEL fournisseur aiderait', () => {
    const coverage = buildEnrichmentCoverage(
      [
        attempt({ missing: ['email', 'phone'] }),
        attempt({ result: 'no_new_data', missing: ['email'] }),
        attempt({ missing: ['phone'] }),
      ],
      30,
    )
    expect(coverage.missingChannels).toEqual([
      { channel: 'email', count: 2 },
      { channel: 'phone', count: 2 },
    ])
  })

  it('classe les fournisseurs du plus productif au moins productif', () => {
    const coverage = buildEnrichmentCoverage(
      [attempt({ provider: 'dropcontact' }), attempt({ provider: 'apollo' }), attempt({ provider: 'apollo' })],
      30,
    )
    expect(coverage.byProvider.map(p => p.provider)).toEqual(['apollo', 'dropcontact'])
  })

  it('reporte la fenêtre telle qu’elle lui est donnée — aucune horloge lue ici', () => {
    expect(buildEnrichmentCoverage([], 7).days).toBe(7)
  })
})

/**
 * #3549.1 — la mesure de STOCK que la couverture par tentative ne donne pas :
 * parmi les contacts déjà enrichis, quelle part a un e-mail, un téléphone, un
 * LinkedIn — et surtout quelle part n'a QUE le LinkedIn (le symptôme du retour).
 */
describe('buildContactReachability', () => {
  const row = (over: Partial<ContactReachabilityRow> = {}): ContactReachabilityRow => ({
    email: null,
    phone: null,
    linkedin_url: null,
    ...over,
  })

  it('rend des parts null — jamais 0 % — quand aucun contact n’a été enrichi', () => {
    const r = buildContactReachability([])
    expect(r).toEqual({
      enriched: 0,
      withEmail: null,
      withPhone: null,
      withLinkedin: null,
      onlyLinkedin: null,
      onlyLinkedinCount: 0,
    })
  })

  it('compte e-mail, téléphone, LinkedIn et la part « LinkedIn seul »', () => {
    const r = buildContactReachability([
      row({ email: 'a@x.fr', phone: '+33600000001', linkedin_url: 'https://li/a' }),
      row({ email: 'b@x.fr', linkedin_url: 'https://li/b' }),
      row({ linkedin_url: 'https://li/c' }),
      row({ linkedin_url: 'https://li/d' }),
    ])
    expect(r.enriched).toBe(4)
    expect(r.withEmail).toBe(0.5)
    expect(r.withPhone).toBe(0.25)
    expect(r.withLinkedin).toBe(1)
    expect(r.onlyLinkedinCount).toBe(2)
    expect(r.onlyLinkedin).toBe(0.5)
  })

  it('traite une chaîne vide ou blanche comme une absence, jamais comme une valeur', () => {
    const r = buildContactReachability([row({ email: '  ', phone: '', linkedin_url: 'https://li/a' })])
    expect(r.withEmail).toBe(0)
    expect(r.withPhone).toBe(0)
    expect(r.onlyLinkedinCount).toBe(1)
  })
})
