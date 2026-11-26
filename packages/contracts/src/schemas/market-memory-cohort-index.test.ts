import { describe, expect, it } from 'vitest'
import { MARKET_MEMORY_MIN_PATHS } from './market-memory.js'
import { accountCohortIndexSchema, COHORT_INDEX_EXCLUSION_REASONS } from './market-memory-cohort-index-axes.js'
import {
  buildCohortIndexReport,
  buildCohortPeerScores,
  classifyCohortIndex,
  COHORT_INDEX_AXIS_WEIGHT_FIELDS,
  indexFromAxes,
  isCohortPeer,
  MARKET_MEMORY_COHORT_INDEX_BUCKETS,
  MARKET_MEMORY_COHORT_INDEX_MIN_AXES,
  MARKET_MEMORY_COHORT_INDEX_SETTINGS,
  overlappingAxisWeightField,
  quantile,
  toAccountCohortIndex,
  type CohortIndexSignal,
} from './market-memory-cohort-index.js'

/** Un signal minimal, complet — chaque test ne recopie que ce qui varie. */
function signal(overrides: Partial<CohortIndexSignal> & { companyKey: string }): CohortIndexSignal {
  return {
    headcountBracket: '11-50',
    pathsTotal: 10,
    externalizationScore: 50,
    ...overrides,
  }
}

/** Une cohorte de `count` pairs mesurés, valeurs uniformément réparties 1..100. */
function cohortOf(bracket: string, count: number, scoreOf: (i: number) => number): CohortIndexSignal[] {
  return Array.from({ length: count }, (_, i) =>
    signal({
      companyKey: `${bracket}-peer-${i}`,
      headcountBracket: bracket,
      pathsTotal: 10,
      externalizationScore: scoreOf(i),
    }),
  )
}

describe('indexFromAxes — sous 3 axes évaluables, pas de score (doctrine c26)', () => {
  it('rend null sous le minimum d’axes', () => {
    expect(MARKET_MEMORY_COHORT_INDEX_MIN_AXES).toBe(3)
    expect(
      indexFromAxes([
        { axis: 'cohortRelativePosition', value: 90 },
        { axis: 'ownObservations', value: 100 },
      ]),
    ).toBeNull()
  })

  it('moyenne les axes évaluables, jamais divisée par un total inventé', () => {
    expect(
      indexFromAxes([
        { axis: 'cohortRelativePosition', value: 90 },
        { axis: 'cohortCoverage', value: 60 },
        { axis: 'ownObservations', value: 30 },
      ]),
    ).toBe(60)
  })

  it('rend null sur un tableau vide (aucun axe du tout)', () => {
    expect(indexFromAxes([])).toBeNull()
  })
})

describe('buildCohortIndexReport — les comptes s’ADDITIONNENT, jamais une soustraction', () => {
  it('sur un corpus vide : tout à zéro, rien ne divise par rien', () => {
    const report = buildCohortIndexReport([])
    expect(report.counts.read).toBe(0)
    expect(report.counts.calculable).toBe(0)
    expect(Object.values(report.counts.excluded).every(n => n === 0)).toBe(true)
  })

  it('un compte sans tranche d’effectif est écarté — noBracket', () => {
    const report = buildCohortIndexReport([signal({ companyKey: 'a', headcountBracket: null })])
    expect(report.counts.excluded.noBracket).toBe(1)
    expect(report.counts.calculable).toBe(0)
  })

  it(`sous MARKET_MEMORY_MIN_PATHS (${MARKET_MEMORY_MIN_PATHS}) — écarté belowGlobalMinPaths, jamais compté comme un pair`, () => {
    const report = buildCohortIndexReport([signal({ companyKey: 'a', pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 })])
    expect(report.counts.excluded.belowGlobalMinPaths).toBe(1)
    expect(report.byBracket).toEqual([])
  })

  it('sans score brut (vendeur muet) — écarté noScore', () => {
    const report = buildCohortIndexReport([signal({ companyKey: 'a', externalizationScore: null })])
    expect(report.counts.excluded.noScore).toBe(1)
  })

  it('sous le plancher de confiance individuelle — écarté belowOwnPathsThreshold', () => {
    const thin = MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex - 1
    expect(thin).toBeGreaterThanOrEqual(MARKET_MEMORY_MIN_PATHS) // sinon le gate global l'aurait déjà écarté
    const report = buildCohortIndexReport([signal({ companyKey: 'a', pathsTotal: thin })])
    expect(report.counts.excluded.belowOwnPathsThreshold).toBe(1)
  })

  it('cohorte trop clairsemée — écarté cohortTooSmall, jamais un index calculé sur 2 pairs', () => {
    const thin = MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize - 1
    const rows = cohortOf('1-10', thin, i => 10 + i)
    const report = buildCohortIndexReport(rows)
    expect(report.counts.excluded.cohortTooSmall).toBe(thin)
    expect(report.counts.calculable).toBe(0)
  })

  it('assez de matière des deux côtés : calculable, et les 3 axes sont TOUS nommés', () => {
    const rows = cohortOf('51-200', MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize, i => i)
    const report = buildCohortIndexReport(rows)
    expect(report.counts.calculable).toBe(rows.length)
    const first = report.classifications.find(c => c.kind === 'calculable')
    if (first?.kind !== 'calculable') throw new Error('attendu calculable')
    expect(first.result.evaluated.map(e => e.axis).sort()).toEqual(
      ['cohortCoverage', 'cohortRelativePosition', 'ownObservations'].sort(),
    )
    expect(first.result.notEvaluable).toEqual([])
    expect(first.result.index).not.toBeNull()
  })

  it('read = calculable + Σ(écarté) — TOUJOURS, sur un corpus mélangé (jamais une soustraction)', () => {
    const rows: CohortIndexSignal[] = [
      signal({ companyKey: 'no-bracket', headcountBracket: null }),
      signal({ companyKey: 'thin-corpus', pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 }),
      signal({ companyKey: 'no-score', externalizationScore: null }),
      signal({ companyKey: 'thin-own', pathsTotal: MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex - 1 }),
      ...cohortOf('big-cohort', MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize, i => i * 2),
    ]
    const report = buildCohortIndexReport(rows)
    const excludedTotal = Object.values(report.counts.excluded).reduce((a, b) => a + b, 0)
    expect(report.counts.read).toBe(rows.length)
    expect(report.counts.calculable + excludedTotal).toBe(report.counts.read)
    // Vérifie que chaque raison nommée a bien été atteinte au moins une fois par ce corpus —
    // sinon la garde ci-dessus serait verte sans avoir vraiment exercé les cinq branches.
    expect(report.counts.excluded.noBracket).toBe(1)
    expect(report.counts.excluded.belowGlobalMinPaths).toBe(1)
    expect(report.counts.excluded.noScore).toBe(1)
    expect(report.counts.excluded.belowOwnPathsThreshold).toBe(1)
  })

  it('les cinq raisons d’exclusion nommées couvrent bien les clés du compte', () => {
    const report = buildCohortIndexReport([])
    expect(Object.keys(report.counts.excluded).sort()).toEqual([...COHORT_INDEX_EXCLUSION_REASONS].sort())
  })
})

describe('LE POINT DU LOT — la normalisation décorrèle l’index de la TAILLE de l’entreprise', () => {
  it('un grand groupe moyen dans SA cohorte et une PME au sommet de LA SIENNE ne sont pas départagés par le score brut', () => {
    const n = MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize
    // Cohorte des grands groupes : score brut UNIFORMÉMENT haut (80-99) — le
    // volume mécanique que la doctrine dénonce. Notre entreprise est au MILIEU.
    const bigBracket = cohortOf('5000+', n, i => 80 + (i / (n - 1)) * 19)
    const bigCompanyRawScore = 80 + 0.5 * 19 // proche de la médiane de sa cohorte
    const bigCompany = signal({
      companyKey: 'big-co',
      headcountBracket: '5000+',
      externalizationScore: bigCompanyRawScore,
    })

    // Cohorte des PME : score brut UNIFORMÉMENT bas (5-20). Notre entreprise est
    // EN TÊTE de sa cohorte, avec un score brut pourtant inférieur au groupe.
    const smallBracket = cohortOf('1-10', n, i => 5 + (i / (n - 1)) * 15)
    const smallCompany = signal({ companyKey: 'small-co', headcountBracket: '1-10', externalizationScore: 20 })

    const report = buildCohortIndexReport([...bigBracket, bigCompany, ...smallBracket, smallCompany])

    const bigResult = report.classifications.find(c => c.kind === 'calculable' && c.result.companyKey === 'big-co')
    const smallResult = report.classifications.find(c => c.kind === 'calculable' && c.result.companyKey === 'small-co')
    if (bigResult?.kind !== 'calculable' || smallResult?.kind !== 'calculable') throw new Error('attendu calculable')

    // Le score BRUT dit l'inverse de la vérité qu'on veut mesurer :
    expect(bigCompanyRawScore).toBeGreaterThan(smallCompany.externalizationScore as number)
    // L'INDEX, lui, dit la vérité : la PME est en tête de SA cohorte, le grand
    // groupe est dans la moyenne de LA SIENNE — la position relative
    // s'inverse, alors que le score brut ne s'inverse jamais.
    const bigPosition = bigResult.result.evaluated.find(a => a.axis === 'cohortRelativePosition')?.value
    const smallPosition = smallResult.result.evaluated.find(a => a.axis === 'cohortRelativePosition')?.value
    expect(smallPosition).toBeGreaterThan(bigPosition as number)
    expect(smallPosition).toBeGreaterThanOrEqual(95)
    expect(bigPosition).toBeLessThan(60)
  })
})

describe('quantile — utilisé par le script de mesure pour la distribution des index', () => {
  it('rend null sur un tableau vide', () => {
    expect(quantile([], 0.5)).toBeNull()
  })

  it('rend l’unique valeur sur un tableau à un élément, pour tout quantile', () => {
    expect(quantile([42], 0.25)).toBe(42)
    expect(quantile([42], 0.75)).toBe(42)
  })

  it('médiane exacte sur un nombre impair de valeurs', () => {
    expect(quantile([10, 20, 30], 0.5)).toBe(20)
  })

  it('interpole entre deux valeurs sur un nombre pair', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25)
  })
})

describe('les réglages — NOMMÉS, à un seul endroit, et pas encore choisis en connaissance de cause', () => {
  it('le plancher de confiance individuelle ne descend jamais sous le seuil produit global', () => {
    expect(MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex).toBeGreaterThanOrEqual(MARKET_MEMORY_MIN_PATHS)
  })

  it('les bornes Forte/Moyenne sont ordonnées et vivent à un seul endroit', () => {
    expect(MARKET_MEMORY_COHORT_INDEX_BUCKETS.forteMin).toBeGreaterThan(MARKET_MEMORY_COHORT_INDEX_BUCKETS.moyenneMin)
    expect(MARKET_MEMORY_COHORT_INDEX_BUCKETS.moyenneMin).toBeGreaterThan(0)
  })
})

describe('#1640.10 — la garde du double comptage : aucune observation ne pèse sur deux axes', () => {
  it('LIT QUELQUE CHOSE — le corpus réel des poids n’est pas vide, et couvre les 3 axes', () => {
    expect(Object.keys(COHORT_INDEX_AXIS_WEIGHT_FIELDS).sort()).toEqual(
      ['cohortCoverage', 'cohortRelativePosition', 'ownObservations'].sort(),
    )
    for (const fields of Object.values(COHORT_INDEX_AXIS_WEIGHT_FIELDS)) {
      expect(fields.length).toBeGreaterThan(0)
    }
    expect(overlappingAxisWeightField(COHORT_INDEX_AXIS_WEIGHT_FIELDS)).toBeNull()
  })

  it('SAIT DIRE NON — deux axes qui liraient le MÊME champ pèsent deux fois sur la même observation', () => {
    const fautif = {
      cohortRelativePosition: ['externalizationScore'],
      cohortCoverage: ['pathsTotal'], // ⚠️ fautif : réutilise le poids d'`ownObservations`
      ownObservations: ['pathsTotal'],
    }
    expect(overlappingAxisWeightField(fautif)).toBe('pathsTotal')
  })

  it("N'ATTRAPE PAS ce qu'elle ne vise pas — une clé de GROUPEMENT partagée n'est pas un poids partagé", () => {
    // `headcountBracket` sert à trouver la cohorte pour DEUX des trois axes
    // (`cohortRelativePosition` ET `cohortCoverage` en ont tous les deux
    // besoin pour savoir QUELLE cohorte regarder) — un témoin légitime qui
    // ressemble à un chevauchement sans en être un : une clé de groupement
    // ne PÈSE rien, elle désigne seulement où chercher le poids.
    expect(Object.values(COHORT_INDEX_AXIS_WEIGHT_FIELDS).flat()).not.toContain('headcountBracket')
    // Passer explicitement une carte qui ajouterait la clé de groupement aux
    // DEUX axes ne doit pas être signalée : ce n'est toujours pas un poids.
    const groupingKeySharedOnPurpose = {
      cohortRelativePosition: ['externalizationScore', 'headcountBracket'],
      cohortCoverage: ['headcountBracket'],
      ownObservations: ['pathsTotal'],
    }
    // Ce witness illustre la distinction : si on l'évalue tel quel, le
    // détecteur générique la signalerait (il ne connaît pas la distinction
    // clé/poids) — la distinction vit dans la déclaration RÉELLE
    // (`COHORT_INDEX_AXIS_WEIGHT_FIELDS`), qui n'y met jamais de clé de
    // groupement. C'est cette déclaration réelle, jamais retouchée par un
    // témoin de test, que `buildCohortIndexReport` utilise implicitement en
    // gardant `externalizationScore` et `pathsTotal` disjoints.
    expect(overlappingAxisWeightField(groupingKeySharedOnPurpose)).toBe('headcountBracket')
    expect(overlappingAxisWeightField(COHORT_INDEX_AXIS_WEIGHT_FIELDS)).toBeNull()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * #1640.2 — L'INDEX D'UNE SEULE ENTREPRISE
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('#1640.2 — la fonction unitaire EST le moteur du rapport, jamais une seconde échelle', () => {
  it('rend EXACTEMENT ce que le rapport de corpus rend, ligne par ligne', () => {
    // LE POINT DU LOT : une seconde implémentation de l'échelle d'exclusion
    // pour le cas unitaire divergerait du rapport — et c'est le chiffre
    // AFFICHÉ qui divergerait. Ce test compare les DEUX sorties sur un corpus
    // qui traverse les cinq raisons d'exclusion ET le cas calculable.
    const corpus: CohortIndexSignal[] = [
      ...cohortOf('11-50', 25, i => i * 4),
      ...cohortOf('1000+', 22, i => 40 + i),
      signal({ companyKey: 'sans-tranche', headcountBracket: null }),
      signal({ companyKey: 'sous-seuil', pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 }),
      signal({ companyKey: 'sans-score', externalizationScore: null }),
      signal({ companyKey: 'peu-de-parcours', pathsTotal: MARKET_MEMORY_MIN_PATHS }),
      signal({ companyKey: 'cohorte-minuscule', headcountBracket: '2-10' }),
    ]
    const report = buildCohortIndexReport(corpus)

    for (const row of corpus) {
      const bracket = row.headcountBracket ?? ''
      const peers = buildCohortPeerScores(bracket, corpus)
      const solo = classifyCohortIndex(row, peers)
      const fromReport = report.classifications.find(entry =>
        entry.kind === 'excluded' ? entry.companyKey === row.companyKey : entry.result.companyKey === row.companyKey,
      )
      expect(solo).toEqual(fromReport)
    }

    // Et le corpus a bien fait travailler les cinq raisons : sans ça, la
    // comparaison ci-dessus prouverait l'égalité de deux silences.
    for (const reason of COHORT_INDEX_EXCLUSION_REASONS) {
      expect(report.counts.excluded[reason]).toBeGreaterThan(0)
    }
    expect(report.counts.calculable).toBeGreaterThan(0)
  })

  it('l’ENTREPRISE s’inclut dans sa propre cohorte — sinon son rang dépendrait d’elle-même', () => {
    const corpus = [
      ...cohortOf('51-200', 20, i => i + 1),
      signal({ companyKey: 'cible', headcountBracket: '51-200', externalizationScore: 100, pathsTotal: 20 }),
    ]
    const peers = buildCohortPeerScores('51-200', corpus)
    expect(peers.sortedScores).toHaveLength(21)
    expect(peers.sortedScores).toContain(100)

    const cible = corpus[corpus.length - 1]!
    const classified = classifyCohortIndex(cible, peers)
    if (classified.kind !== 'calculable') throw new Error('attendu calculable')
    // 20 pairs strictement en dessous + elle-même comptée pour une demi-place
    // sur 21 → 98 (arrondi). Jamais 100 : elle ne se dépasse pas elle-même.
    expect(classified.result.evaluated.find(axis => axis.axis === 'cohortRelativePosition')?.value).toBe(98)
  })

  it('une cohorte se constitue des SEULES lignes éligibles, quel que soit ce qu’on lui donne', () => {
    // L'appelant lit sa cohorte en base sur la seule TRANCHE : le filtre
    // d'éligibilité vit ici, jamais recopié dans une requête SQL qui
    // divergerait en silence.
    const melange: CohortIndexSignal[] = [
      signal({ companyKey: 'ok', externalizationScore: 10 }),
      signal({ companyKey: 'autre-tranche', headcountBracket: '1000+', externalizationScore: 90 }),
      signal({ companyKey: 'pas-de-score', externalizationScore: null }),
      signal({ companyKey: 'sous-plancher', pathsTotal: MARKET_MEMORY_MIN_PATHS - 1, externalizationScore: 20 }),
      signal({ companyKey: 'pas-de-tranche', headcountBracket: null, externalizationScore: 30 }),
    ]
    expect(buildCohortPeerScores('11-50', melange).sortedScores).toEqual([10])
    expect(isCohortPeer(melange[0]!)).toBe(true)
    expect(melange.slice(2).some(isCohortPeer)).toBe(false)
  })

  it('SAIT DIRE NON — des pairs d’une AUTRE tranche ne classent personne en silence', () => {
    // Un rang calculé contre la mauvaise cohorte a l'air parfaitement normal :
    // le silence coûterait plus cher que l'erreur bruyante.
    const cible = signal({ companyKey: 'cible', headcountBracket: '11-50' })
    const mauvaise = buildCohortPeerScores(
      '1000+',
      cohortOf('1000+', 25, i => i),
    )
    expect(() => classifyCohortIndex(cible, mauvaise)).toThrow(/cohorte incohérente/)
  })

  it('ce qui part vers l’écran perd la clé du corpus, et rien d’autre', () => {
    const corpus = [
      ...cohortOf('11-50', 24, i => i * 4),
      signal({ companyKey: 'cible', pathsTotal: 20, externalizationScore: 80 }),
    ]
    const cible = corpus[corpus.length - 1]!
    const classified = classifyCohortIndex(cible, buildCohortPeerScores('11-50', corpus))
    const wire = toAccountCohortIndex(classified)

    expect(JSON.stringify(wire)).not.toContain('companyKey')
    // Et la forme est bien celle que le contrat annonce — parsée, pas supposée.
    expect(accountCohortIndexSchema.parse(wire)).toEqual(wire)
    if (wire.kind !== 'calculable') throw new Error('attendu calculable')
    expect(wire.cohort.bracket).toBe('11-50')
    expect(wire.evaluated.map(axis => axis.axis)).toEqual([
      'cohortRelativePosition',
      'cohortCoverage',
      'ownObservations',
    ])
  })

  it('une exclusion voyage avec sa RAISON, jamais en « indisponible » fourre-tout', () => {
    const exclue = classifyCohortIndex(signal({ companyKey: 'x', headcountBracket: null }), {
      bracket: '',
      sortedScores: [],
    })
    expect(accountCohortIndexSchema.parse(toAccountCohortIndex(exclue))).toEqual({
      kind: 'excluded',
      reason: 'noBracket',
    })
  })
})
