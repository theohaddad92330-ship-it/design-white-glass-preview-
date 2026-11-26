import { isSegmentCollectionStale, resolveSignalSourceLink, SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3922.8 (craft rule n°9) — le lien de chaque signal est recettable EN DÉMO, par source.
 *
 * Un prospect qui ouvre la veille de la démo doit voir un lien « Voir l'annonce BODACC »,
 * « Voir l'article », « Voir l'offre », et le registre officiel (Sirene) — pas des signaux
 * muets. Les URL de démonstration pointent sur le domaine réservé `example.org`
 * (jamais un faux lien vers un vrai site), et chaque dossier de démonstration qui porte
 * des signaux garde SON témoin « sans lien » nommé plus bas.
 */
const signals = DEMO_DOSSIERS.flatMap(dossier => dossier.account.recent_signals ?? [])

describe('démo — les signaux portent leur lien source (#3922.8)', () => {
  it('au moins un signal par genre de source : presse, annonce BODACC, offre, registre officiel', () => {
    const kinds = new Set(signals.filter(s => s.url).map(s => s.source_kind))
    for (const kind of ['press', 'bodacc', 'job', 'official'] as const) {
      expect(kinds.has(kind)).toBe(true)
    }
  })

  it('chaque lien posé est un lien http(s) valide, d’un genre connu, sur le domaine réservé', () => {
    for (const signal of signals.filter(s => s.url)) {
      const link = resolveSignalSourceLink({ url: signal.url, source_kind: signal.source_kind })
      expect(link.kind).toBe('link')
      expect(signal.url).toMatch(/^https:\/\/example\.org\/demo\//)
      expect(signal.source_kind).not.toBeNull()
    }
  })

  it('un signal BODACC porte « bodacc », jamais un autre genre (le libellé du lien en découle)', () => {
    const bodacc = signals.filter(s => /BODACC/i.test(s.source ?? ''))
    expect(bodacc.length).toBeGreaterThan(0)
    for (const signal of bodacc) expect(signal.source_kind).toBe('bodacc')
  })

  it('sait dire NON : la salle garde un signal SANS lien (le cas « Sans lien vérifiable » reste recettable)', () => {
    expect(signals.some(s => !s.url)).toBe(true)
  })

  it('le dossier témoin « collecte fraîche » reste APRÈS la capacité « lien source » (pas de rattrapage affiché à tort)', () => {
    const epoch = SEGMENT_CAPABILITY_EPOCH.signals
    const fresh = DEMO_DOSSIERS.find(d => d.account.signals_collected_at)
    expect(epoch).toBeDefined()
    expect(isSegmentCollectionStale(fresh?.account.signals_collected_at ?? null, epoch as string)).toBe(false)
  })
})
