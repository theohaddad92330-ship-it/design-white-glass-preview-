import { describe, expect, it } from 'vitest'
import {
  computeDiscoverSourceAxes,
  decisiveSourceAxes,
  discoverRankRatio,
  discoverSourceAxesSchema,
  historySignalWeight,
  DISCOVER_HISTORY_WINDOW_DAYS,
  type DiscoverSourceFacts,
} from './discover-source-axes.js'
import { discoverCandidateSchema } from './discover.js'

const NOW = new Date('2026-10-12T00:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

const NOTHING: DiscoverSourceFacts = {
  signalHistory: null,
  crm: null,
  marketMemory: null,
  dataforge: null,
  drive: null,
  missions: null,
}

/**
 * #4067 — Découvrir classe AUSSI avec ce que l'espace sait déjà : l'historique
 * des signaux, le CRM, la mémoire marché, le référentiel de comptes cibles, le
 * Drive synchronisé et les missions / le vivier. Chaque source est un AXE nommé ;
 * une source non mesurée sort du dénominateur (GA-18/GA-19), jamais un 0.
 */
describe('computeDiscoverSourceAxes (#4067)', () => {
  it('rien de mesuré ⇒ score null, dénominateur 0, toutes les sources nommées non mesurées', () => {
    const axes = computeDiscoverSourceAxes(NOTHING, NOW)
    expect(axes.score).toBeNull()
    expect(axes.max).toBe(0)
    expect(axes.unmeasured).toEqual(['signal_history', 'crm', 'market_memory', 'dataforge', 'drive', 'missions'])
    expect(axes.axes.every(axis => !axis.measured && axis.points === 0)).toBe(true)
  })

  it('une source mesurée et vide vaut 0 sur SON plafond — jamais confondue avec « non mesuré »', () => {
    const axes = computeDiscoverSourceAxes({ ...NOTHING, drive: { documents: 0, latestAt: null } }, NOW)
    expect(axes.score).toBe(0)
    expect(axes.max).toBe(10)
    expect(axes.unmeasured).not.toContain('drive')
  })

  it("#4067.1 — un signal ancien est DÉCOTÉ par l'âge, jamais supprimé", () => {
    const recent = historySignalWeight(daysAgo(100), NOW)
    const old = historySignalWeight(daysAgo(400), NOW)
    expect(recent).toBeGreaterThan(old)
    expect(old).toBeGreaterThan(0)
  })

  it('#4067.1 — la RÉCURRENCE d’un besoin (même type, deux fois) est un signal fort', () => {
    const once = computeDiscoverSourceAxes(
      { ...NOTHING, signalHistory: { signals: [{ type: 'hiring', date: daysAgo(200), changeCount: 0 }] } },
      NOW,
    )
    const twice = computeDiscoverSourceAxes(
      {
        ...NOTHING,
        signalHistory: {
          signals: [
            { type: 'hiring', date: daysAgo(200), changeCount: 0 },
            { type: 'hiring', date: daysAgo(380), changeCount: 0 },
          ],
        },
      },
      NOW,
    )
    const history = (axes: typeof once) => axes.axes.find(axis => axis.key === 'signal_history')!
    expect(history(twice).points).toBeGreaterThan(history(once).points)
    expect(history(twice).label_params?.recurring).toBe(1)
    // Le plus récent des signaux anciens DATE l'axe : « il y a 6 mois », jamais « récent ».
    expect(history(twice).latestAt).toBe(daysAgo(200))
  })

  it('#4067.1 — un signal de la fenêtre récente (< 90 j) ne compte pas deux fois', () => {
    const axes = computeDiscoverSourceAxes(
      {
        ...NOTHING,
        signalHistory: {
          signals: [{ type: 'tender', date: daysAgo(DISCOVER_HISTORY_WINDOW_DAYS - 5), changeCount: 0 }],
        },
      },
      NOW,
    )
    const history = axes.axes.find(axis => axis.key === 'signal_history')!
    expect(history.measured).toBe(true)
    expect(history.points).toBe(0)
  })

  it('#4067.2 — une affaire gagnée pèse plus qu’une affaire perdue ; les contacts connus comptent', () => {
    const won = computeDiscoverSourceAxes(
      { ...NOTHING, crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 0, lastActivityAt: null } },
      NOW,
    )
    const lost = computeDiscoverSourceAxes(
      { ...NOTHING, crm: { won: 0, lost: 1, open: 0, dormant: 0, contacts: 2, lastActivityAt: null } },
      NOW,
    )
    expect(won.score).toBeGreaterThan(lost.score!)
    expect(lost.score).toBeGreaterThan(0)
    expect(won.max).toBe(20)
  })

  it('#4067.3 — mémoire marché : le recours externe observé et la pile commune deviennent des POINTS', () => {
    const axes = computeDiscoverSourceAxes(
      { ...NOTHING, marketMemory: { externalRecourse: true, stackOverlap: ['java'] } },
      NOW,
    )
    expect(axes.axes.find(axis => axis.key === 'market_memory')!.points).toBeGreaterThan(0)
    // « non observé » (null) n'est jamais « n'externalise pas » : l'axe reste non mesuré.
    const unknown = computeDiscoverSourceAxes(
      { ...NOTHING, marketMemory: { externalRecourse: null, stackOverlap: null } },
      NOW,
    )
    expect(unknown.unmeasured).toContain('market_memory')
  })

  it('#4067.3 — référentiel de comptes cibles : prioritaire > secondaire > verrouillé (mesuré 0)', () => {
    const points = (status: string) => computeDiscoverSourceAxes({ ...NOTHING, dataforge: { status } }, NOW).score ?? -1
    expect(points('CIBLE_PRIORITAIRE')).toBeGreaterThan(points('CIBLE_SECONDAIRE'))
    expect(points('CIBLE_SECONDAIRE')).toBeGreaterThan(0)
    expect(points('VERROUILLE_PLATEFORME')).toBe(0)
  })

  // #4294.9 — le référentiel ne pèse plus par son seul STATUT : un besoin passé observé sur ce compte
  // (base commune) prouve qu'il a déjà acheté. Daté par le plus récent ; jamais un 0 affiché sans besoin.
  it('#4294.9 — les besoins passés observés pèsent, datés, et se nomment', () => {
    const withNeeds = computeDiscoverSourceAxes(
      { ...NOTHING, dataforge: { status: 'A_QUALIFIER', needs: { total: 3, won: 1, latestAt: '2025-03-14' } } },
      NOW,
    )
    const axis = withNeeds.axes.find(a => a.key === 'dataforge')!
    expect(axis.measured).toBe(true)
    expect(axis.points).toBeGreaterThan(
      computeDiscoverSourceAxes({ ...NOTHING, dataforge: { status: 'A_QUALIFIER' } }, NOW).score!,
    )
    expect(axis.label_key).toBe('reference_needs_won')
    expect(axis.label_params).toEqual({ n: 3, won: 1 })
    expect(axis.latestAt).toBe('2025-03-14')
    expect(axis.evidence).toContain('3 besoin(s) passé(s)')
    expect(axis.points).toBeLessThanOrEqual(axis.max)
    // sans statut connu, les besoins seuls suffisent à mesurer l'axe
    const needsOnly = computeDiscoverSourceAxes(
      { ...NOTHING, dataforge: { status: null, needs: { total: 2, won: 0, latestAt: null } } },
      NOW,
    ).axes.find(a => a.key === 'dataforge')!
    expect(needsOnly.label_key).toBe('reference_needs')
    expect(needsOnly.points).toBeGreaterThan(0)
  })

  it('#4294.9 — NON : aucun besoin observé ne change rien au statut seul', () => {
    const plain = computeDiscoverSourceAxes({ ...NOTHING, dataforge: { status: 'CIBLE_PRIORITAIRE' } }, NOW)
    const zero = computeDiscoverSourceAxes(
      { ...NOTHING, dataforge: { status: 'CIBLE_PRIORITAIRE', needs: { total: 0, won: 0, latestAt: null } } },
      NOW,
    )
    expect(zero.axes).toEqual(plain.axes)
    expect(plain.axes.find(a => a.key === 'dataforge')!.label_key).toBe('reference_priority')
  })

  it('#4067.4 — Drive et missions / vivier pèsent, bornés à leur plafond', () => {
    const axes = computeDiscoverSourceAxes(
      {
        ...NOTHING,
        drive: { documents: 9, latestAt: daysAgo(10) },
        missions: { missions: 3, consultants: 5, latestAt: daysAgo(30) },
      },
      NOW,
    )
    expect(axes.axes.find(axis => axis.key === 'drive')!.points).toBe(10)
    expect(axes.axes.find(axis => axis.key === 'missions')!.points).toBe(10)
    expect(axes.max).toBe(20)
  })

  it('le résultat respecte le schéma partagé et le candidat le transporte', () => {
    const axes = computeDiscoverSourceAxes({ ...NOTHING, drive: { documents: 1, latestAt: null } }, NOW)
    expect(discoverSourceAxesSchema.parse(axes)).toEqual(axes)
    const candidate = discoverCandidateSchema.parse({
      name: 'Acme',
      siren: '123456789',
      nafCode: null,
      sector: null,
      city: null,
      department: null,
      headcountRange: null,
      creationDate: null,
      score: null,
      scoreFactors: [],
      angle: null,
      suggestedRoles: [],
      portfolioState: 'new',
      accountId: null,
      sources: [],
      signals: [],
      sourceAxes: axes,
    })
    expect(candidate.sourceAxes?.max).toBe(10)
  })
})

describe('decisiveSourceAxes (#4067 — la ligne « Pourquoi »)', () => {
  it('nomme 1 à 3 sources, les plus fortes d’abord, jamais une source à 0', () => {
    const axes = computeDiscoverSourceAxes(
      {
        ...NOTHING,
        crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 0, lastActivityAt: null },
        drive: { documents: 1, latestAt: null },
        dataforge: { status: 'CIBLE_PRIORITAIRE' },
        missions: { missions: 0, consultants: 1, latestAt: null },
        marketMemory: { externalRecourse: false, stackOverlap: [] },
      },
      NOW,
    )
    const decisive = decisiveSourceAxes(axes)
    expect(decisive.map(axis => axis.key)).toEqual(['crm', 'dataforge', 'drive'])
    expect(decisiveSourceAxes(undefined)).toEqual([])
  })
})

describe('discoverRankRatio (#4067 — le classement)', () => {
  it('ajoute les points des sources au numérateur ET leur plafond au dénominateur', () => {
    const sourceAxes = computeDiscoverSourceAxes(
      { ...NOTHING, crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 0, lastActivityAt: null } },
      NOW,
    )
    expect(discoverRankRatio({ score: 50, scoreMax: 100, sourceAxes })).toBeCloseTo((50 + 10) / 120)
    // Sans source mesurée, le rang est exactement le ratio d'avant ce lot.
    expect(discoverRankRatio({ score: 50, scoreMax: 80 })).toBeCloseTo(50 / 80)
    // Score registre absent mais sources mesurées : les sources seules.
    expect(discoverRankRatio({ score: null, sourceAxes })).toBeCloseTo(10 / 20)
    expect(discoverRankRatio({ score: null })).toBeNull()
  })

  it('un compte avec une affaire gagnée passe devant un compte identique sans historique', () => {
    const withCrm = computeDiscoverSourceAxes(
      { ...NOTHING, crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 3, lastActivityAt: null } },
      NOW,
    )
    expect(discoverRankRatio({ score: 60, scoreMax: 100, sourceAxes: withCrm })!).toBeGreaterThan(
      discoverRankRatio({ score: 60, scoreMax: 100 })!,
    )
  })
})

/**
 * #4067.11 (#4286.15.d, décision Louis 19/10/2026) — Découvrir classe AUSSI avec ce que la BASE COMMUNE
 * sait de la société : des personnes nommées, en poste et revues, que Bellum a déjà trouvées dans un
 * espace. Un compte, jamais un nom ; aucune personne connue = aucun point, aucune ligne.
 */
describe('#4067.11 — la base commune pèse dans « observé sur le marché »', () => {
  const NOW_D = new Date('2026-10-22T00:00:00Z')
  const BLANK: DiscoverSourceFacts = {
    signalHistory: null,
    crm: null,
    marketMemory: null,
    dataforge: null,
    drive: null,
    missions: null,
  }

  it('des personnes connues de la base commune mesurent l’axe, le nombre se nomme', () => {
    const axis = computeDiscoverSourceAxes(
      { ...BLANK, marketMemory: { externalRecourse: null, stackOverlap: null, sharedPeople: 4 } },
      NOW_D,
    ).axes.find(a => a.key === 'market_memory')!
    expect(axis.measured).toBe(true)
    expect(axis.points).toBeGreaterThan(0)
    expect(axis.points).toBeLessThanOrEqual(axis.max)
    expect(axis.label_key).toBe('market_shared_people')
    expect(axis.label_params).toEqual(expect.objectContaining({ n: 4 }))
    expect(axis.evidence).toContain('4 personne(s)')
  })

  it('s’ajoute au recours externe sans dépasser le plafond, et garde son libellé le plus fort', () => {
    const withShared = computeDiscoverSourceAxes(
      { ...BLANK, marketMemory: { externalRecourse: true, stackOverlap: ['sap'], sharedPeople: 3 } },
      NOW_D,
    ).axes.find(a => a.key === 'market_memory')!
    const without = computeDiscoverSourceAxes(
      { ...BLANK, marketMemory: { externalRecourse: true, stackOverlap: ['sap'] } },
      NOW_D,
    ).axes.find(a => a.key === 'market_memory')!
    expect(withShared.points).toBeGreaterThan(without.points)
    expect(withShared.points).toBeLessThanOrEqual(withShared.max)
    expect(withShared.label_key).toBe('market_recourse')
  })

  it('sait dire NON — zéro personne connue : aucun point, le libellé d’avant', () => {
    const axis = computeDiscoverSourceAxes(
      { ...BLANK, marketMemory: { externalRecourse: null, stackOverlap: [], sharedPeople: 0 } },
      NOW_D,
    ).axes.find(a => a.key === 'market_memory')!
    expect(axis.points).toBe(0)
    expect(axis.label_key).toBe('market_none')
  })
})
