/**
 * ⚠️ #4016.L9.a revient sur le seuil de trois axes (doctrine c26, GA-58),
 * délibérément — Louis 13/10/2026 : un score de compte s'affiche dès DEUX axes
 * évaluables, toujours avec son nombre d'axes.
 */
import { describe, expect, it } from 'vitest'
import { parseAccountAnalysis } from './account-analysis.js'
import {
  DOSSIER_AXIS_MAX,
  DOSSIER_SCORE_AXES,
  DOSSIER_SCORE_MIN_MEASURED_AXES,
  computeDossierScore,
  dossierReadSchema,
  dossierScoreAxisSchema,
  orderedDossierAxes,
} from './dossier-read.js'

/**
 * #2118.4 / .6 / .30-.37 / .39-.40 / .52 — le score du dossier est DÉCOMPOSÉ
 * sur sept axes FIXES, et ce qui n'a pas pu être évalué est NOMMÉ.
 */

describe('#2118.30-.36 — les sept axes sont fixes', () => {
  it('nomme les sept axes, dans cet ordre', () => {
    expect(DOSSIER_SCORE_AXES).toEqual([
      'adequation_offre',
      'potentiel_commercial',
      'fraicheur',
      'accessibilite',
      'capacite_achat_externe',
      'concurrence',
      'qualite_preuves',
    ])
  })

  it('refuse un axe inventé par le modèle', () => {
    const parsed = dossierScoreAxisSchema.safeParse({ key: 'sympathie', state: 'measured', value: 5 })
    expect(parsed.success).toBe(false)
  })
})

describe('#2118.37 — chaque axe porte son état', () => {
  it('refuse un axe sans état', () => {
    expect(dossierScoreAxisSchema.safeParse({ key: 'concurrence', value: 3 }).success).toBe(false)
  })

  it("refuse une note posée sur un axe inconnu — « non mesuré » n'est pas un chiffre", () => {
    const parsed = dossierScoreAxisSchema.safeParse({ key: 'concurrence', state: 'unknown', value: 0 })
    expect(parsed.success).toBe(false)
  })

  it('exige une note sur un axe mesuré — un état sans chiffre ne décompose rien', () => {
    expect(dossierScoreAxisSchema.safeParse({ key: 'concurrence', state: 'measured' }).success).toBe(false)
    expect(dossierScoreAxisSchema.safeParse({ key: 'concurrence', state: 'partial', value: 2 }).success).toBe(true)
  })
})

describe('#2118.52 — un axe non mesuré SORT du dénominateur', () => {
  const measured = (key: (typeof DOSSIER_SCORE_AXES)[number], value: number) =>
    ({ key, state: 'measured', value, impact: 'i', lever: 'l' }) as const

  it("n'abaisse jamais le score : trois axes à 4/5 se lisent 12/15, pas 12/35", () => {
    const score = computeDossierScore([
      measured('adequation_offre', 4),
      measured('potentiel_commercial', 4),
      measured('fraicheur', 4),
    ])
    expect(score).toMatchObject({ kind: 'score', value: 12, outOf: 3 * DOSSIER_AXIS_MAX })
  })

  it('ajouter un axe inconnu ne change RIEN au score', () => {
    const base = computeDossierScore([
      measured('adequation_offre', 4),
      measured('potentiel_commercial', 4),
      measured('fraicheur', 4),
    ])
    const withUnknown = computeDossierScore([
      measured('adequation_offre', 4),
      measured('potentiel_commercial', 4),
      measured('fraicheur', 4),
      { key: 'concurrence', state: 'unknown', impact: null, lever: null },
    ])
    expect(withUnknown).toMatchObject({ kind: 'score', value: 12, outOf: 3 * DOSSIER_AXIS_MAX })
    expect(withUnknown.kind === 'score' && base.kind === 'score' && withUnknown.ratio === base.ratio).toBe(true)
  })

  it('nomme les axes non évalués plutôt que de les taire', () => {
    const score = computeDossierScore([
      measured('adequation_offre', 4),
      measured('potentiel_commercial', 4),
      measured('fraicheur', 4),
    ])
    expect(score.unknownAxes).toEqual(['accessibilite', 'capacite_achat_externe', 'concurrence', 'qualite_preuves'])
  })
})

describe('#2306.30 — un score élevé ne pousse jamais vers accès/achat inconnu', () => {
  const measured = (key: (typeof DOSSIER_SCORE_AXES)[number], value: number) =>
    ({ key, state: 'measured', value, impact: 'i', lever: 'l' }) as const

  it('plafonne quand `accessibilite` ou `capacite_achat_externe` sont inconnus, même score élevé par ailleurs', () => {
    const score = computeDossierScore([
      measured('adequation_offre', 5),
      measured('potentiel_commercial', 5),
      measured('fraicheur', 5),
      measured('accessibilite', 5),
      measured('concurrence', 5),
      measured('qualite_preuves', 5),
      { key: 'capacite_achat_externe', state: 'unknown', impact: null, lever: null },
    ])
    expect(score.kind).toBe('score')
    expect(score.cappedBy).toEqual(['capacite_achat_externe'])
  })

  it('les deux axes de cap ensemble inconnus se nomment tous les deux, dans l’ordre du contrat', () => {
    const score = computeDossierScore([
      measured('adequation_offre', 4),
      measured('potentiel_commercial', 4),
      measured('fraicheur', 4),
    ])
    expect(score.cappedBy).toEqual(['accessibilite', 'capacite_achat_externe'])
  })

  it('aucun axe de cap inconnu → `cappedBy` vide, rien ne plafonne la lecture', () => {
    const score = computeDossierScore([
      measured('adequation_offre', 4),
      measured('accessibilite', 4),
      measured('capacite_achat_externe', 4),
    ])
    expect(score.cappedBy).toEqual([])
  })

  it('un dossier `insufficient` nomme aussi ses axes de cap inconnus', () => {
    const score = computeDossierScore([measured('adequation_offre', 4)])
    expect(score.kind).toBe('insufficient')
    expect(score.cappedBy).toEqual(['accessibilite', 'capacite_achat_externe'])
  })
})

describe('doctrine c26, plancher #4016.L9.a (Louis 13/10) — sous DEUX axes mesurés, pas de score', () => {
  it('rend `insufficient` avec un seul axe', () => {
    const score = computeDossierScore([
      { key: 'adequation_offre', state: 'measured', value: 5, impact: null, lever: null },
    ])
    expect(score.kind).toBe('insufficient')
    expect(score).not.toHaveProperty('value')
    expect(DOSSIER_SCORE_MIN_MEASURED_AXES).toBe(2)
  })

  it('rend un score avec deux axes — l’ancien seuil de trois est renversé', () => {
    const score = computeDossierScore([
      { key: 'adequation_offre', state: 'measured', value: 5, impact: null, lever: null },
      { key: 'fraicheur', state: 'partial', value: 3, impact: null, lever: null },
    ])
    expect(score).toMatchObject({ kind: 'score', value: 8, outOf: 10, scoredAxes: 2, partialAxes: 1 })
  })

  it('rend `insufficient` sur un dossier sans aucun axe', () => {
    expect(computeDossierScore([]).kind).toBe('insufficient')
    expect(computeDossierScore([]).unknownAxes).toEqual([...DOSSIER_SCORE_AXES])
  })
})

describe('#2118.4 / .37 — les sept axes sont toujours NOMMÉS', () => {
  it('complète les axes absents en « inconnu » plutôt que de les laisser tomber', () => {
    const rows = orderedDossierAxes([{ key: 'concurrence', state: 'measured', value: 3, impact: 'i', lever: 'l' }])
    expect(rows).toHaveLength(DOSSIER_SCORE_AXES.length)
    expect(rows.map(r => r.key)).toEqual([...DOSSIER_SCORE_AXES])
    expect(rows.find(r => r.key === 'adequation_offre')).toMatchObject({ state: 'unknown', value: null })
    expect(rows.find(r => r.key === 'concurrence')).toMatchObject({ state: 'measured', value: 3 })
  })

  it('ignore un doublon plutôt que de compter un axe deux fois', () => {
    const rows = orderedDossierAxes([
      { key: 'concurrence', state: 'measured', value: 3, impact: null, lever: null },
      { key: 'concurrence', state: 'measured', value: 1, impact: null, lever: null },
    ])
    expect(rows.filter(r => r.key === 'concurrence')).toHaveLength(1)
  })
})

describe('#2118.45 / .47 — un no-go est temporaire et nomme son déclencheur', () => {
  it('refuse un no-go définitif', () => {
    const parsed = dossierReadSchema.safeParse({
      no_go: { temporary: false, context: 'Panel fermé', trigger: 'Réouverture du panel' },
    })
    expect(parsed.success).toBe(false)
  })

  it('accepte un no-go temporaire, contextualisé, avec son déclencheur', () => {
    const parsed = dossierReadSchema.parse({
      no_go: { temporary: true, context: 'Panel fermé jusqu’en 2027', trigger: 'Appel d’offres de renouvellement' },
    })
    expect(parsed.no_go).toEqual({
      temporary: true,
      context: 'Panel fermé jusqu’en 2027',
      trigger: 'Appel d’offres de renouvellement',
    })
  })
})

describe('#2118.20 / .22 / .23 / .26 / .27 / .44 — les blocs de la lecture', () => {
  it('porte les blocs rédigés et la fiabilité en trois dimensions', () => {
    const parsed = dossierReadSchema.parse({
      why_for_your_esn: 'Ton offre data colle au programme Socle.',
      recommended_scope: 'BU Retail, pas le groupe.',
      best_entry_point: { label: 'DSI Retail', target_profile: 'N-1', why: 'Sponsor du programme' },
      access_path: 'Entrer par le programme Cloud Souverain déjà lancé',
      obstacles: [{ label: 'Panel fermé', why: 'Renouvellement en 2027' }],
      anti_advice: { what: 'Ne commence pas par le CTO groupe', why: 'Il ne décide pas du budget Retail' },
      next_action: { label: 'Vérifier le panel', route: '/accounts/$accountId', tab: 'contacts' },
      reliability: {
        quality: { state: 'measured', value: 80 },
        coverage: { state: 'partial', value: 40 },
        freshness: { state: 'unknown' },
      },
      profile_incomplete: true,
      profile_incomplete_fields: ['offers', 'references'],
      missing: [{ label: 'Contact DSI Retail', why: 'Aucun profil public confirmé' }],
    })
    expect(parsed.reliability?.freshness).toEqual({ state: 'unknown', value: null })
    expect(parsed.missing?.[0]?.label).toBe('Contact DSI Retail')
    expect(parsed.profile_incomplete).toBe(true)
    // #2304.7 (épopée #2932) — Q6, distincte de best_entry_point (QUI) : PAR
    // OÙ entrer commercialement.
    expect(parsed.access_path).toBe('Entrer par le programme Cloud Souverain déjà lancé')
  })

  it("refuse une fiabilité « inconnue » chiffrée — c'est le même zéro qui ment", () => {
    const parsed = dossierReadSchema.safeParse({ reliability: { quality: { state: 'unknown', value: 0 } } })
    expect(parsed.success).toBe(false)
  })
})

describe('compatibilité — un raw_analysis d’avant ce lot reste lisible', () => {
  it('garde `dossier_read` à travers la liste blanche de parseAccountAnalysis', () => {
    const parsed = parseAccountAnalysis({
      evaluation: {
        score: 17,
        verdict: 'PRUDENT',
        dossierRead: { why_for_your_esn: 'Pour ton offre data.', axes: [] },
      },
    })
    expect(parsed.evaluation?.dossier_read?.why_for_your_esn).toBe('Pour ton offre data.')
  })

  it('une analyse ancienne sans le bloc se lit sans erreur', () => {
    const parsed = parseAccountAnalysis({ evaluation: { score: 12, justification: 'Ancien, un seul paragraphe.' } })
    expect(parsed.evaluation?.score).toBe(12)
    expect(parsed.evaluation?.dossier_read).toBeUndefined()
  })

  it('un bloc malformé ne fait pas tomber le reste de l’évaluation', () => {
    const parsed = parseAccountAnalysis({
      evaluation: { score: 17, verdict: 'PRUDENT', dossier_read: { axes: 'pas un tableau' } },
    })
    expect(parsed.evaluation?.score).toBe(17)
    expect(parsed.evaluation?.dossier_read).toBeNull()
  })
})

describe('#2306.15/.16/.22/.23 — le profil qui a produit le score reste conservé', () => {
  it('porte la version du profil ESN qui a conditionné CE score (#2306.15)', () => {
    const parsed = dossierReadSchema.parse({ esn_profile_version: 4 })
    expect(parsed.esn_profile_version).toBe(4)
  })

  it('accepte une version absente — un dossier plus ancien ne la porte pas', () => {
    const parsed = dossierReadSchema.parse({ why_for_your_esn: 'x' })
    expect(parsed.esn_profile_version).toBeUndefined()
  })

  it("nomme les objectifs commerciaux de l'ESN actifs au moment du scoring (#2306.16)", () => {
    const parsed = dossierReadSchema.parse({ scoring_objectives: ['new_accounts', 'structuring'] })
    expect(parsed.scoring_objectives).toEqual(['new_accounts', 'structuring'])
  })

  it('rend `insufficient` un objectif hors liste plutôt que de faire tomber le bloc', () => {
    const parsed = dossierReadSchema.safeParse({ scoring_objectives: [42] })
    expect(parsed.success).toBe(false)
  })

  it('conserve le poids ÉGAL de chaque axe, rendu explicite plutôt qu’assumé (#2306.22)', () => {
    const parsed = dossierReadSchema.parse({
      axis_weights: { adequation_offre: 1, potentiel_commercial: 1, fraicheur: 1 },
    })
    expect(parsed.axis_weights?.adequation_offre).toBe(1)
  })

  it('refuse un poids sur un axe qui ne fait pas partie des sept', () => {
    const parsed = dossierReadSchema.safeParse({ axis_weights: { sympathie: 1 } })
    expect(parsed.success).toBe(false)
  })

  it("conserve la version de l'algorithme qui a produit le score (#2306.23)", () => {
    const parsed = dossierReadSchema.parse({ algorithm_version: '1.0' })
    expect(parsed.algorithm_version).toBe('1.0')
  })

  it('les quatre champs traversent `parseAccountAnalysis` sans être filtrés', () => {
    const parsed = parseAccountAnalysis({
      evaluation: {
        score: 17,
        verdict: 'PRUDENT',
        dossier_read: {
          axes: [],
          esn_profile_version: 4,
          scoring_objectives: ['new_accounts'],
          axis_weights: { adequation_offre: 1 },
          algorithm_version: '1.0',
        },
      },
    })
    expect(parsed.evaluation?.dossier_read?.esn_profile_version).toBe(4)
    expect(parsed.evaluation?.dossier_read?.scoring_objectives).toEqual(['new_accounts'])
    expect(parsed.evaluation?.dossier_read?.axis_weights).toEqual({ adequation_offre: 1 })
    expect(parsed.evaluation?.dossier_read?.algorithm_version).toBe('1.0')
  })
})
