import {
  DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE,
  DEMO_DISCOVER_THIRD_PARTY_PROVIDER_MENTION_COVERAGE,
} from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3204.2/.6/.7/#3205.1 (épopées #3238/#3239) — « et en démonstration, les
 * champs d'extraction, l'agrégation et le prestataire tiers d'un signal
 * `hiring` de Découvrir montrent quoi ? »
 *
 * Craft rule n°9 : l'écran n'a ni table ni clé `raw_analysis` à lui — la
 * garde par table ne poserait jamais cette question. Ce fichier est
 * l'appelant qui lit la VRAIE réponse scriptée (`demoDiscoverResponse`),
 * pas un commentaire qui l'affirme.
 *
 * ⚠️ Volontairement SANS `discoverResponseSchema.parse` (comme
 * `demo-discover-qualification-masking-coverage.spec.ts`) : ces champs ne
 * sont pas déclarés dans `discoverSignalSchema` (`@bellum/contracts`), donc
 * `.parse` les retirerait en silence.
 */
type RawSignal = Record<string, unknown>
type RawCandidate = { name: string; signals: RawSignal[]; aggregatedSignals?: unknown[] }

describe('#3204.2/.6/.7 — extraction et agrégation d’un signal hiring, en démonstration', () => {
  it('sont classés seedés, avec leur raison', () => {
    expect(DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE.reason).toContain('#3204.2')
  })

  // #3238 (recette démo 05/10) — la preuve visait Verdal (fictif) : « Sites : … » se voit sur un
  // compte RÉEL des briefs (Naval Group — Indret, Lorient), dans la vue PAR DÉFAUT (secteur ciblé).
  it('#3238 Naval Group (compte réel) porte des offres sur deux sites distincts du siège, vue par défaut', () => {
    const byDefault = demoDiscoverResponse({}) as { candidates: (RawCandidate & { city?: string })[] }
    const naval = byDefault.candidates.find(c => c.name === 'Naval Group')
    expect(naval).toBeDefined()
    const cities = (naval?.signals ?? []).filter(s => s['type'] === 'hiring').map(s => s['siteCity'])
    expect(cities).toEqual(['La Montagne', 'Lorient'])
    expect(naval?.city).toBe('Paris')
  })

  it('Verdal Distribution porte des offres data_ia avec technologies, équipe et statut ouvert', () => {
    const byDefault = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: RawCandidate[] }
    const verdal = byDefault.candidates.find(c => c.name === 'Verdal Distribution (démo)')
    expect(verdal).toBeDefined()
    const hiring = (verdal?.signals ?? []).filter(s => s['type'] === 'hiring')
    expect(hiring.length).toBeGreaterThanOrEqual(2)
    for (const signal of hiring) {
      expect(signal['jobFamily']).toBe('data_ia')
      expect(Array.isArray(signal['technologies']) ? (signal['technologies'] as string[]).length : 0).toBeGreaterThan(0)
      expect(signal['stillOpen']).toBe(true)
    }
  })

  it('les deux offres data_ia de Verdal Distribution portent une siteCity DIFFÉRENTE (#3204.2, reste 30/09)', () => {
    const byDefault = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: RawCandidate[] }
    const verdal = byDefault.candidates.find(c => c.name === 'Verdal Distribution (démo)')
    const hiring = (verdal?.signals ?? []).filter(s => s['type'] === 'hiring')
    const cities = hiring.map(s => s['siteCity'])
    expect(cities).toContain('Lyon')
    expect(cities).toContain('Marseille')
    // Le nom résolu du groupe (une seule entrée) ne distingue pas ces deux
    // villes — c'est exactement ce que `siteCity` ajoute.
    expect(new Set(cities).size).toBe(2)
  })

  it('la VUE PAR DÉFAUT (sans « hors cible ») montre une siteCity ET un REPLACEMENT_SIGNAL (#3238, recette 30/09)', () => {
    const view = demoDiscoverResponse({}) as { candidates: RawCandidate[] }
    const signals = view.candidates.flatMap(c => c.signals ?? [])
    expect(signals.some(s => typeof s['siteCity'] === 'string' && s['siteCity'])).toBe(true)
    const aggregates = view.candidates.flatMap(c => (c.aggregatedSignals ?? []) as { aggregateClass: string }[])
    expect(aggregates.some(a => a.aggregateClass === 'replacement_signal')).toBe(true)
  })

  it('l’agrégation TEAM_GROWTH_SIGNAL cite les offres qui la soutiennent', () => {
    const byDefault = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: RawCandidate[] }
    const verdal = byDefault.candidates.find(c => c.name === 'Verdal Distribution (démo)')
    const aggregated = (verdal?.aggregatedSignals ?? []) as { aggregateClass: string; supportingOffers: unknown[] }[]
    expect(aggregated.length).toBeGreaterThan(0)
    expect(aggregated[0]?.aggregateClass).toBe('team_growth_signal')
    expect(aggregated[0]?.supportingOffers.length).toBeGreaterThanOrEqual(2)
  })

  it('Aubrac Aerostructures porte un rattachement hiérarchique ET une offre retirée (stillOpen: false)', () => {
    const byDefault = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: RawCandidate[] }
    const aubrac = byDefault.candidates.find(c => c.name === 'Aubrac Aerostructures (démo)')
    expect(aubrac).toBeDefined()
    const withReportsTo = (aubrac?.signals ?? []).find(s => s['reportsTo'])
    expect(withReportsTo?.['reportsTo']).toBe('directeur technique')
    const withdrawn = (aubrac?.signals ?? []).find(s => s['stillOpen'] === false)
    expect(withdrawn).toBeDefined()
  })

  it('l’offre retirée d’Aubrac Aerostructures nomme explicitement un remplacement (#3204.7, reste 30/09)', () => {
    const byDefault = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: RawCandidate[] }
    const aubrac = byDefault.candidates.find(c => c.name === 'Aubrac Aerostructures (démo)')
    const withReplacement = (aubrac?.signals ?? []).find(s => s['replacementSignal'] === true)
    expect(withReplacement).toBeDefined()
    const aggregated = (aubrac?.aggregatedSignals ?? []) as { aggregateClass: string; supportingOffers: unknown[] }[]
    expect(aggregated.some(a => a.aggregateClass === 'replacement_signal')).toBe(true)
  })
})

describe('#3205.1 — prestataire tiers mentionné dans une offre, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_THIRD_PARTY_PROVIDER_MENTION_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_THIRD_PARTY_PROVIDER_MENTION_COVERAGE.reason).toContain('#3205.1')
  })

  it('une offre de Verdal Distribution mentionne un prestataire tiers explicitement', () => {
    const byDefault = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: RawCandidate[] }
    const verdal = byDefault.candidates.find(c => c.name === 'Verdal Distribution (démo)')
    const withMention = (verdal?.signals ?? []).find(s => s['thirdPartyProviderMention'])
    expect(withMention?.['thirdPartyProviderMention']).toBe('sopra steria')
  })
})

/**
 * #3238 (recette démo 01/10) — « siteCity : 4 recherches (« Verdal
 * Distribution », libre Lyon/Marseille…) ne remontent toujours que Pharmatek,
 * Aubrac, Cévennes ». Verdal est HORS CIBLE : la vue par défaut le masque, et
 * la liste scriptée ignorait le texte libre. Une recherche qui NOMME une
 * entreprise (ou la ville d'une de ses offres) est un choix explicite : elle
 * passe avant le filtre de cible par défaut.
 */
describe('#3238 — une recherche qui nomme Verdal (ou la ville de ses offres) le fait remonter', () => {
  const names = (query: Record<string, unknown>): string[] =>
    (demoDiscoverResponse(query) as { candidates: RawCandidate[] }).candidates.map(c => c.name)

  it.each([
    ['le nom, en texte libre du registre', { filters: {}, freetext: 'Verdal Distribution' }],
    ['le nom, en minuscules et sans suffixe', { freetext: 'verdal' }],
    ['la ville d’une offre (Lyon)', { freetext: 'recrutement data à Lyon' }],
    ['la ville d’une offre (Marseille), mode signaux', { keywords: 'Marseille' }],
  ])('%s', (_label, query) => {
    expect(names(query)).toContain('Verdal Distribution (démo)')
  })

  it('Verdal est montré SANS geste (#3238, recette Z1 04/10) ; la cible écarte toujours les autres comptes hors secteur', () => {
    expect(names({})).toContain('Verdal Distribution (démo)')
    expect(names({})).not.toContain('Marenval Financement (démo)')
  })
})
