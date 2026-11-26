import { describe, expect, it } from 'vitest'
import {
  headcountTrancheLowerBound,
  publicExposureFromAwards,
  recentAwardFromAwards,
  headcountGrowingFromReadings,
  newEstablishmentFromReadings,
  OVERFLOW_AVAILABILITY,
  OVERFLOW_AXIS_MAX,
  OVERFLOW_BLIND_SPOTS,
  OVERFLOW_SIGNALS,
  overflowInputSchema,
  overflowScore,
  overflowScoreSchema,
  type OverflowAxisResult,
  type OverflowInput,
  type OverflowScore,
} from './overflow-score.js'
import { territoryOverflowBlockSchema } from './territory.js'

const NOTHING: OverflowInput = {
  offers90d: null,
  baseline: null,
  republished: null,
  averageOfferAgeDays: null,
  newEstablishment: null,
  headcountGrowing: null,
  recentAward: null,
  awardWithoutLocalPresence: null,
  offersOutsideCoreTech: null,
  subcontractingMentioned: null,
  declaredOpen: null,
}

describe('le score de débordement (tome 4 §19)', () => {
  it('reconnaît le cas du tome : 34 offres contre 6 en moyenne', () => {
    const result = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })
    expect(result.score).not.toBeNull()
    // La preuve CITE les deux chiffres : « 34 offres » seul ne prouve rien.
    expect(result.axes[0]?.evidence).toContain('34 offres sur 90 jours contre 6 en moyenne')
    expect(result.axes[0]?.points).toBe(25)
  })

  it('ne rend AUCUN score sans donnée d’offre — jamais zéro', () => {
    const result = overflowScore(NOTHING)
    expect(result.score).toBeNull()
    expect(result.reason).toContain('non mesurable')
    expect(result.excluded).toBe(false)
  })

  it('sort l’axe Volume du dénominateur quand il n’y a pas de moyenne', () => {
    // Règle 2 du tome : une ESN entrée au référentiel il y a trois mois n'a pas
    // d'historique. Le score se fait alors sur 65, pas sur 100.
    const result = overflowScore({
      ...NOTHING,
      offers90d: 34,
      baseline: null,
      republished: 4,
      recentAward: true,
      declaredOpen: false,
    })
    expect(result.unmeasured).toEqual(['volume'])
    expect(result.scoreMax).toBe(100 - OVERFLOW_AXIS_MAX.volume)
  })

  it('refuse de classer sous deux axes mesurables', () => {
    const result = overflowScore({ ...NOTHING, republished: 3 })
    expect(result.score).toBeNull()
    expect(result.reason).toContain('Un seul axe')
  })

  it('RETIRE une ESN en procédure collective, et dit pourquoi', () => {
    const result = overflowScore({ ...NOTHING, offers90d: 40, baseline: 5, riskFlag: 'alerte' })
    expect(result.excluded).toBe(true)
    expect(result.score).toBeNull()
    expect(result.exclusionReason).toContain('Procédure collective')
  })

  it('ne retire pas une ESN en vigilance', () => {
    // « Vigilance » (baisse d'effectif, changement de direction) appelle un
    // regard, pas un retrait : la retirer ferait disparaître des partenaires
    // valables sur un signal faible.
    const result = overflowScore({ ...NOTHING, offers90d: 40, baseline: 5, republished: 1, riskFlag: 'vigilance' })
    expect(result.excluded).toBe(false)
    expect(result.score).not.toBeNull()
  })

  it('dit que l’ouverture au rang 2 est INCONNUE plutôt que nulle', () => {
    const result = overflowScore({ ...NOTHING, offers90d: 10, baseline: 4, republished: 0 })
    const openness = result.axes.find(axis => axis.axis === 'ouverture')
    expect(openness?.points).toBeNull()
    expect(openness?.evidence).toContain('inconnue')
  })

  it('le signal direct pèse plus que la déclaration', () => {
    const mentioned = overflowScore({ ...NOTHING, offers90d: 5, baseline: 5, subcontractingMentioned: true })
    const declared = overflowScore({ ...NOTHING, offers90d: 5, baseline: 5, declaredOpen: true })
    const openOf = (r: ReturnType<typeof overflowScore>) => r.axes.find(a => a.axis === 'ouverture')?.points
    expect(openOf(mentioned)).toBe(10)
    expect(openOf(declared)).toBe(5)
  })

  it('le marché gagné sans implantation locale est le signal le plus fort du lot', () => {
    const result = overflowScore({
      ...NOTHING,
      offers90d: 5,
      baseline: 5,
      awardWithoutLocalPresence: true,
      recentAward: true,
    })
    const load = result.axes.find(axis => axis.axis === 'charge_nouvelle')
    expect(load?.points).toBe(18)
    expect(load?.evidence).toContain('n’a pas d’implantation')
  })
})

/**
 * « Pas encore mesuré » et « pas de source » se ressemblent — et c'est ce qui a
 * fait lire `republished: null` comme une valeur en retard pendant des mois,
 * alors qu'aucune source ne la produit. Les deux SORTENT du dénominateur, mais
 * elles n'appellent pas le même geste : la première demande d'attendre, la
 * seconde demande de construire une collecte. Un écran qui les confond fait
 * attendre indéfiniment.
 */
describe('un axe que rien ne peut alimenter est NOMMÉ, pas confondu avec un axe vide', () => {
  it('ne change RIEN tant que l’appelant ne déclare aucune lacune', () => {
    // La garde doit prouver qu'elle sait se taire : sans déclaration, le score
    // se comporte exactement comme avant.
    const result = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6 })
    expect(result.notCollected).toEqual([])
    expect(result.axes.every(axis => axis.availability !== 'not_collected')).toBe(true)
  })

  it('NOMME l’axe dont tous les signaux sont déclarés non collectés', () => {
    const result = overflowScore({
      ...NOTHING,
      offers90d: 34,
      baseline: 6,
      uncollected: ['republished', 'averageOfferAgeDays'],
    })
    expect(result.notCollected).toContain('tension')
    const tension = result.axes.find(axis => axis.axis === 'tension')
    expect(tension?.availability).toBe('not_collected')
    // La preuve NOMME les signaux manquants, en français — « republished: null »
    // ne dit à personne ce qu'il faudrait construire.
    expect(tension?.evidence).toContain('republications de poste')
    expect(tension?.evidence).toContain('ancienneté des offres')
  })

  it('un axe non collecté sort du dénominateur — jamais compté zéro', () => {
    const result = overflowScore({
      ...NOTHING,
      offers90d: 34,
      baseline: 6,
      subcontractingMentioned: true,
      uncollected: ['republished', 'averageOfferAgeDays'],
    })
    const tension = result.axes.find(axis => axis.axis === 'tension')
    expect(tension?.points).toBeNull()
    expect(result.scoreMax).toBe(OVERFLOW_AXIS_MAX.volume + OVERFLOW_AXIS_MAX.ouverture)
  })

  it('garde « absent » pour un axe qu’on SAIT collecter mais qui n’a rien rendu', () => {
    // L'ouverture au rang 2 se DÉCLARE : la colonne attend une déclaration, ce
    // n'est pas une lacune de collecte. La confondre avec « pas de source »
    // ferait construire un collecteur pour une donnée que personne ne publie.
    const result = overflowScore({
      ...NOTHING,
      offers90d: 34,
      baseline: 6,
      uncollected: ['republished', 'averageOfferAgeDays'],
    })
    const openness = result.axes.find(axis => axis.axis === 'ouverture')
    expect(openness?.availability).toBe('absent')
    expect(result.notCollected).not.toContain('ouverture')
  })

  it('fait tomber Volume dès qu’UN de ses deux signaux nécessaires manque', () => {
    // Volume les exige TOUS LES DEUX : un volume sans moyenne ne dit rien. Un
    // axe « any » (tension) ne tombe que si tous ses signaux manquent.
    const result = overflowScore({ ...NOTHING, uncollected: ['baseline'] })
    expect(result.notCollected).toContain('volume')
  })

  it('dit dans la RAISON que le score ne viendra pas tout seul', () => {
    const result = overflowScore({
      ...NOTHING,
      offers90d: 34,
      baseline: 6,
      uncollected: [
        'republished',
        'averageOfferAgeDays',
        'recentAward',
        'awardWithoutLocalPresence',
        'offersOutsideCoreTech',
      ],
    })
    expect(result.score).toBeNull()
    expect(result.reason).toContain('pas de source')
    expect(result.reason).toContain('tension')
    expect(result.reason).toContain('charge nouvelle')
  })

  it('la liste des signaux couvre EXACTEMENT les entrées du schéma', () => {
    // Une garde doit LIRE quelque chose : sans ce test, ajouter une entrée au
    // schéma sans l'ajouter aux signaux la rendrait indéclarable en silence.
    const inputs = Object.keys(overflowInputSchema.shape).filter(key => key !== 'riskFlag' && key !== 'uncollected')
    expect(inputs.length).toBeGreaterThan(0)
    expect([...OVERFLOW_SIGNALS].sort()).toEqual(inputs.sort())
  })
})

/* ══════════════════════════════════════════════════════════════════════════════
 * LE CONTRAT DE SORTIE (D141)
 *
 * Le score était CALCULÉ ici, juste, testé sur dix-huit cas — et il traversait
 * l'API en `z.unknown()` (`territory.ts:52`). L'écran ne pouvait donc pas le
 * typer : il a dû, au lot B3, en recopier la forme dans un parseur de frontière,
 * avec sa propre liste d'axes et sa propre liste de disponibilités. Deux
 * descriptions du même objet, dont une seule est vraie le jour où le calcul
 * change.
 *
 * Ces tests s'écrivent AVANT le schéma, et le premier est celui qui compte :
 * le contrat doit accepter ce que le calcul produit RÉELLEMENT, alimenté par le
 * calcul lui-même. Un schéma écrit de mémoire décrirait le score qu'on croit
 * produire — ce qui est exactement le défaut que ce lot corrige.
 * ══════════════════════════════════════════════════════════════════════════════ */

describe('overflowScoreSchema — le contrat de ce que le calcul produit', () => {
  /** Les sorties RÉELLES du calcul, une par branche de `overflowScore`. */
  const REAL_OUTPUTS: readonly (readonly [string, OverflowScore])[] = [
    ['un score mesuré', overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })],
    ['aucun axe mesurable', overflowScore(NOTHING)],
    ['un seul axe mesurable', overflowScore({ ...NOTHING, offers90d: 34, baseline: 6 })],
    ['des axes non collectés', overflowScore({ ...NOTHING, uncollected: ['baseline'] })],
    ['une ESN exclue', overflowScore({ ...NOTHING, offers90d: 40, baseline: 5, riskFlag: 'alerte' })],
  ]

  it('accepte EXACTEMENT ce que le calcul produit, sur chacune de ses branches', () => {
    // Ce test LIT le calcul : il ne rejoue pas une forme recopiée à la main.
    expect(REAL_OUTPUTS.length).toBeGreaterThan(0)
    for (const [label, output] of REAL_OUTPUTS) {
      const parsed = overflowScoreSchema.safeParse(output)
      expect(parsed.success ? null : `${label} : ${parsed.error.message}`).toBeNull()
    }
  })

  it('accepte l’ESN EXCLUE, dont les axes sont VIDES', () => {
    // Le parseur de frontière de B3 posait `axes: z.array(…).min(1)` en citant
    // « un score n'est jamais nu ». La règle est juste, la lecture était fausse :
    // une exclusion n'est PAS un score, et le calcul rend bien `axes: []`
    // quand le drapeau vaut `alerte`. Un contrat qui refuse une sortie du
    // calcul qu'il décrit n'est pas un contrat, c'est une opinion.
    const excluded = overflowScore({ ...NOTHING, offers90d: 40, baseline: 5, riskFlag: 'alerte' })
    expect(excluded.axes).toEqual([])
    expect(overflowScoreSchema.safeParse(excluded).success).toBe(true)
  })

  it('refuse un score NU — pas d’axes sans exclusion', () => {
    const measured = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })
    expect(overflowScoreSchema.safeParse({ ...measured, axes: [] }).success).toBe(false)
  })

  it('refuse un axe inconnu et une disponibilité inconnue', () => {
    const measured = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })
    const first = measured.axes[0] as OverflowAxisResult
    expect(overflowScoreSchema.safeParse({ ...measured, axes: [{ ...first, axis: 'dissonance' }] }).success).toBe(false)
    expect(overflowScoreSchema.safeParse({ ...measured, axes: [{ ...first, availability: 'pending' }] }).success).toBe(
      false,
    )
  })

  it('garde `absent` et `not_collected` DANS le type — c’est la distinction qui a laissé ce score muet', () => {
    // Les deux sortent du dénominateur et n'appellent PAS le même geste : la
    // première s'attend, la seconde se construit. Les fondre en un seul « non
    // mesuré » ferait attendre une valeur qui n'arrivera jamais.
    expect([...OVERFLOW_AVAILABILITY]).toEqual(['measured', 'absent', 'not_collected'])
    // Tension exige que ses DEUX signaux soient déclarés non collectés (mode
    // « any ») ; charge nouvelle et ouverture restent, elles, simplement
    // absentes — cherchées, rien trouvé.
    const mixed = overflowScore({
      ...NOTHING,
      offers90d: 34,
      baseline: 6,
      uncollected: ['republished', 'averageOfferAgeDays'],
    })
    const availabilities = new Set(mixed.axes.map(axis => axis.availability))
    expect(availabilities.has('absent')).toBe(true)
    expect(availabilities.has('not_collected')).toBe(true)
    expect(overflowScoreSchema.safeParse(mixed).success).toBe(true)
  })

  it('refuse une exclusion muette, et une raison d’exclusion sans exclusion', () => {
    // « Ce qui est retiré est DIT, jamais escamoté » — la règle du §9.3, tenue
    // par le contrat et plus seulement par l'appelant.
    const excluded = overflowScore({ ...NOTHING, offers90d: 40, baseline: 5, riskFlag: 'alerte' })
    expect(overflowScoreSchema.safeParse({ ...excluded, exclusionReason: null }).success).toBe(false)
    const measured = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })
    expect(overflowScoreSchema.safeParse({ ...measured, exclusionReason: 'procédure' }).success).toBe(false)
  })

  it('refuse un axe non collecté qui ne serait pas aussi non mesuré', () => {
    const measured = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })
    expect(measured.unmeasured).not.toContain('volume')
    expect(overflowScoreSchema.safeParse({ ...measured, notCollected: ['volume'] }).success).toBe(false)
  })

  it('refuse des points au-dessus du maximum de leur axe', () => {
    // C'est ce qui rend « 62 sur 60 » impossible à afficher : un axe ne peut
    // pas rapporter plus que ce qu'il pèse.
    const measured = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })
    const first = measured.axes[0] as OverflowAxisResult
    expect(overflowScoreSchema.safeParse({ ...measured, axes: [{ ...first, points: first.max + 1 }] }).success).toBe(
      false,
    )
  })

  it('refuse ce qui n’a pas la forme d’un score', () => {
    // Ce que faisait `readOverflowScore` côté web, et qui appartient au contrat.
    for (const value of [undefined, null, 42, {}, { score: 62 }]) {
      expect(overflowScoreSchema.safeParse(value).success).toBe(false)
    }
  })
})

describe('le score entre DANS le contrat du territoire', () => {
  const measured = overflowScore({ ...NOTHING, offers90d: 34, baseline: 6, republished: 2 })

  it('une ESN peut porter son score, typé', () => {
    const block = territoryOverflowBlockSchema.parse({
      state: 'ready',
      esn: [{ name: 'SII', offers: 34, score: measured }],
    })
    expect(block.esn?.[0]?.score?.axes.length).toBe(4)
  })

  it('le score reste OPTIONNEL — le service IA n’en produit aucun', () => {
    // `territoryOverviewSchema` type les DEUX réponses : celle du service IA,
    // qui ne connaît ni le référentiel ni le drapeau de risque, et celle de
    // l'API, qui pose le score par-dessus (`territory.controller.ts:121`). Le
    // rendre obligatoire ferait mentir le contrat sur la première.
    const block = territoryOverflowBlockSchema.parse({ state: 'ready', esn: [{ name: 'SII', offers: 34 }] })
    expect(block.esn?.[0]?.score).toBeUndefined()
  })

  it('refuse un score MAL FORMÉ plutôt que de le laisser passer', () => {
    // C'était l'état d'avant : `z.unknown()` acceptait n'importe quoi, et
    // l'écran devait deviner. Un objet qui n'est pas un score est maintenant
    // refusé au contrat, pas reconnu à l'arrivée.
    const parsed = territoryOverflowBlockSchema.safeParse({
      state: 'ready',
      esn: [{ name: 'SII', offers: 34, score: { score: 62 } }],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('OVERFLOW_BLIND_SPOTS — les signaux que le calcul ne modélise PAS', () => {
  it('nomme ce que le calcul ne regarde même pas', () => {
    expect(OVERFLOW_BLIND_SPOTS.length).toBeGreaterThan(0)
  })

  it('ne recouvre AUCUN signal déjà modélisé — cette liste rétrécit, elle ne s’allonge pas', () => {
    // L'invariant que B3 avait écrit en prose, et que rien ne tenait : un
    // signal qui entre dans `OVERFLOW_SIGNALS` doit SORTIR de cette liste,
    // sinon l'écran annonce un angle mort qui n'en est plus un.
    const modelled = new Set<string>(OVERFLOW_SIGNALS)
    expect(OVERFLOW_BLIND_SPOTS.filter(spot => modelled.has(spot))).toEqual([])
  })
})

describe('#3921.b — headcountGrowing repose sur DEUX points mesurés, jamais déduit', () => {
  const NOW = new Date('2026-10-09T08:00:00Z')

  it('un seul relevé : non mesuré (null), jamais « stable »', () => {
    expect(headcountGrowingFromReadings([{ observedOn: '2026-10-01', headcountRange: '21' }], NOW)).toBeNull()
  })

  it('deux relevés mesurés, tranche en hausse : vrai', () => {
    expect(
      headcountGrowingFromReadings(
        [
          { observedOn: '2026-01-10', headcountRange: '12' },
          { observedOn: '2026-10-01', headcountRange: '21' },
        ],
        NOW,
      ),
    ).toBe(true)
  })

  it('deux relevés, même tranche ou en baisse : faux (mesuré, pas en hausse)', () => {
    const same = [
      { observedOn: '2026-01-10', headcountRange: '21' },
      { observedOn: '2026-10-01', headcountRange: '21' },
    ]
    expect(headcountGrowingFromReadings(same, NOW)).toBe(false)
    expect(
      headcountGrowingFromReadings(
        [
          { observedOn: '2026-01-10', headcountRange: '22' },
          { observedOn: '2026-10-01', headcountRange: '21' },
        ],
        NOW,
      ),
    ).toBe(false)
  })

  it('un relevé sans tranche (ou « NN ») ne compte pas comme un point mesuré', () => {
    expect(
      headcountGrowingFromReadings(
        [
          { observedOn: '2026-01-10', headcountRange: null },
          { observedOn: '2026-03-10', headcountRange: 'NN' },
          { observedOn: '2026-10-01', headcountRange: '21' },
        ],
        NOW,
      ),
    ).toBeNull()
  })

  it('deux relevés le MÊME jour ne font qu’un point', () => {
    expect(
      headcountGrowingFromReadings(
        [
          { observedOn: '2026-10-01', headcountRange: '12' },
          { observedOn: '2026-10-01', headcountRange: '21' },
        ],
        NOW,
      ),
    ).toBeNull()
  })

  it('un point de plus de 24 mois ne sert plus de référence', () => {
    expect(
      headcountGrowingFromReadings(
        [
          { observedOn: '2023-01-10', headcountRange: '12' },
          { observedOn: '2026-10-01', headcountRange: '21' },
        ],
        NOW,
      ),
    ).toBeNull()
  })
})

// #3921.8 (Louis 15/10/2026) — `newEstablishment` est nourri par la relecture nocturne des ESN du référentiel.
describe('newEstablishmentFromReadings — S06', () => {
  const NOW = new Date('2026-10-15T08:00:00Z')
  const twoReadings = ['2026-09-01', '2026-10-01']

  it('moins de DEUX relevés d’établissements : non mesuré (null), jamais « aucune ouverture »', () => {
    expect(newEstablishmentFromReadings([], [], NOW)).toBeNull()
    expect(newEstablishmentFromReadings(['2026-10-01'], ['2026-10-01'], NOW)).toBeNull()
  })

  it('deux relevés et une ouverture datée récente : vrai', () => {
    expect(newEstablishmentFromReadings(twoReadings, ['2026-09-20'], NOW)).toBe(true)
  })

  it('deux relevés et aucune ouverture récente : faux (mesuré, rien d’ouvert)', () => {
    expect(newEstablishmentFromReadings(twoReadings, [], NOW)).toBe(false)
    expect(newEstablishmentFromReadings(twoReadings, ['2025-01-05'], NOW)).toBe(false)
  })

  it('SAIT DIRE NON — un même jour relu deux fois n’est qu’UN relevé', () => {
    expect(newEstablishmentFromReadings(['2026-10-01', '2026-10-01'], ['2026-10-01'], NOW)).toBeNull()
  })
})

describe('headcountTrancheLowerBound (#3920.9)', () => {
  it('rend la borne basse de la tranche, jamais un milieu deviné', () => {
    expect(headcountTrancheLowerBound('12')).toBe(20)
    expect(headcountTrancheLowerBound(' 53 ')).toBe(10000)
  })
  it('code inconnu, NN ou vide : null (non mesuré)', () => {
    expect(headcountTrancheLowerBound('NN')).toBeNull()
    expect(headcountTrancheLowerBound('')).toBeNull()
    expect(headcountTrancheLowerBound(null)).toBeNull()
  })
})

describe('marchés gagnés → recentAward / publicExposure (#3921.12, décision Louis 16/10)', () => {
  const NOW = new Date('2026-10-16T00:00:00Z')
  const READ = new Date('2026-10-15T01:00:00Z')
  const award = (date: string) => ({ ref: `r-${date}`, date })

  it('jamais lue (pas de date de lecture) : null — « on ne sait pas », ni faux ni nul', () => {
    expect(recentAwardFromAwards([award('2026-09-01')], null, NOW)).toBeNull()
    expect(publicExposureFromAwards([award('2026-09-01')], null, NOW)).toBeNull()
  })

  it('recentAward : un marché attribué il y a moins de six mois = vrai ; lue sans marché récent = faux mesuré', () => {
    expect(recentAwardFromAwards([award('2026-06-01')], READ, NOW)).toBe(true)
    expect(recentAwardFromAwards([award('2026-03-01')], READ, NOW)).toBe(false)
    expect(recentAwardFromAwards([], READ, NOW)).toBe(false)
  })

  it('une attribution à date illisible ou future ne compte pas', () => {
    expect(recentAwardFromAwards([award('demain'), award('2027-01-01')], READ, NOW)).toBe(false)
  })

  it('publicExposure : nulle (0), moyenne (1-2), forte (3+) sur 24 mois', () => {
    expect(publicExposureFromAwards([], READ, NOW)).toBe('nulle')
    expect(publicExposureFromAwards([award('2024-01-01')], READ, NOW)).toBe('nulle') // hors fenêtre
    expect(publicExposureFromAwards([award('2025-01-01'), award('2026-01-01')], READ, NOW)).toBe('moyenne')
    expect(publicExposureFromAwards([award('2025-01-01'), award('2026-01-01'), award('2026-05-01')], READ, NOW)).toBe(
      'forte',
    )
  })
})
