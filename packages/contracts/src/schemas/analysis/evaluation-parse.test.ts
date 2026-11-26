import { describe, expect, it } from 'vitest'
import { parseAccountAnalysis } from './account-analysis.js'

/**
 * `parseAccountAnalysis` filtre par LISTE BLANCHE : toute clé non déclarée au
 * schéma est supprimée en silence. C'est un filtre qui n'échoue jamais — il
 * appauvrit, et c'est bien pire, parce que rien ne le signale.
 *
 * Vu en production le 04/08 sur un dossier réel : `evaluationSchema` ne
 * déclarait ni `score` ni `verdict`. L'onglet Score, qui lit `raw_analysis`
 * sans filtrer, affichait « 17/25 » ; la Vue d'ensemble, qui lit l'objet filtré,
 * ne trouvait plus la note et retombait sur la projection « 6/10 ». Le même
 * dossier annonçait deux notes différentes à un onglet d'écart, et la
 * canonique — la grille /25 de l'annexe méthodo — était celle qui disparaissait.
 *
 * `verdict` compte pour une raison distincte : seul le verdict ÉCRIT par l'IA
 * peut porter EXPLORER. Celui qu'on dérive de la note ne connaît pas cette
 * valeur, donc l'effacer ne fait pas retomber sur un équivalent : il fait
 * afficher un badge que l'IA n'a jamais émis.
 */
describe('parseAccountAnalysis garde ce que les écrans lisent', () => {
  it('conserve la note /25 et le verdict écrit', () => {
    const parsed = parseAccountAnalysis({ evaluation: { score: 17, verdict: 'PRUDENT' } })
    expect(parsed.evaluation).toMatchObject({ score: 17, verdict: 'PRUDENT' })
  })

  it('conserve EXPLORER, que la note ne sait pas produire', () => {
    const parsed = parseAccountAnalysis({ evaluation: { score: 9, verdict: 'EXPLORER' } })
    expect(parsed.evaluation?.verdict).toBe('EXPLORER')
  })

  it('conserve le plafonnement du juge qualité, que l’écran badge', () => {
    const parsed = parseAccountAnalysis({
      evaluation: { score: 12, quality_capped: true, quality_cap_reason: 'trop_faible' },
    })
    expect(parsed.evaluation).toMatchObject({ quality_capped: true, quality_cap_reason: 'trop_faible' })
  })

  it('accepte la forme camelCase telle que l’IA l’émet', () => {
    // Le pipeline écrit `qualityCapped` ; `parseAccountAnalysis` normalise en
    // snake_case AVANT de filtrer. Si le schéma ne déclarait que l'une des deux
    // formes, la normalisation ne suffirait pas.
    const parsed = parseAccountAnalysis({ evaluation: { score: 20, qualityCapped: true } })
    expect(parsed.evaluation).toMatchObject({ score: 20, quality_capped: true })
  })

  it('laisse un dossier ancien sans note /25 tel quel', () => {
    const parsed = parseAccountAnalysis({ evaluation: { global_score: 6, justification: 'Ancien' } })
    expect(parsed.evaluation?.score).toBeUndefined()
    expect(parsed.evaluation?.global_score).toBe(6)
  })

  /**
   * #1607.1 — LES QUATRE BLOCS BELLUM READ.
   *
   * Même défaut que `score`/`verdict` ci-dessus, prévenu avant de se reproduire :
   * un champ que le pipeline écrit mais que `evaluationSchema` ne déclare pas
   * disparaît en silence à la lecture. `bellum_read` est additif à
   * `justification` (qui reste la phrase libre historique, pour les
   * consommateurs qui la lisent encore) — jamais un remplacement.
   */
  it('conserve les quatre blocs BELLUM READ (#1607.1)', () => {
    const parsed = parseAccountAnalysis({
      evaluation: {
        justification: 'Phrase libre historique.',
        bellum_read: {
          verdict_line: 'SNCF se travaille par entité, pas au niveau groupe.',
          why: ['Signal 1', 'Signal 2'],
          missing: 'Pas de contact confirmé côté DSI Retail.',
          next_action: 'Vérifier si l’équipe Data travaille avec des externes.',
        },
      },
    })
    expect(parsed.evaluation?.bellum_read).toEqual({
      verdict_line: 'SNCF se travaille par entité, pas au niveau groupe.',
      why: ['Signal 1', 'Signal 2'],
      missing: 'Pas de contact confirmé côté DSI Retail.',
      next_action: 'Vérifier si l’équipe Data travaille avec des externes.',
    })
    expect(parsed.evaluation?.justification).toBe('Phrase libre historique.')
  })

  it('accepte la forme camelCase de BELLUM READ telle que l’IA l’émet', () => {
    const parsed = parseAccountAnalysis({
      evaluation: {
        bellumRead: { verdictLine: 'Verdict.', why: ['Preuve'], missing: 'Manque.', nextAction: 'Vérifier X.' },
      },
    })
    expect(parsed.evaluation?.bellum_read).toEqual({
      verdict_line: 'Verdict.',
      why: ['Preuve'],
      missing: 'Manque.',
      next_action: 'Vérifier X.',
    })
  })

  it('laisse une analyse antérieure à #1607.1 sans BELLUM READ — dégradation propre', () => {
    const parsed = parseAccountAnalysis({ evaluation: { score: 17, justification: 'Ancien, une seule phrase.' } })
    expect(parsed.evaluation?.bellum_read).toBeUndefined()
    expect(parsed.evaluation?.justification).toBe('Ancien, une seule phrase.')
  })
})
