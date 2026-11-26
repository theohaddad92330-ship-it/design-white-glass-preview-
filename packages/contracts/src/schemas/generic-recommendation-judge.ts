/**
 * #3223 (décision Louis 11/10/2026) — LE JUGE « RECOMMANDATION GÉNÉRIQUE » ET SA FIABILITÉ.
 *
 * Le juge est un modèle (`apps/ia/app/eval/generic_recommendation_judge.py`) :
 * son verdict ne vaut que ce que vaut son ACCORD avec un jeu étiqueté de
 * référence (`apps/ia/app/eval/fixtures/generic_recommendation_labels.json`).
 * Ce fichier porte les trois choses que l'API et le back-office lisent :
 *
 *  - les verdicts possibles (miroir Python comparé par le test IA) ;
 *  - le SEUIL ÉCRIT d'accord sous lequel la mesure est « non fiable » ;
 *  - la CALIBRATION mesurée — réécrite par
 *    `python -m app.eval.generic_recommendation_judge --calibrate` entre les
 *    deux marqueurs ci-dessous, jamais à la main. `measurement: null` = pas
 *    encore mesurée : la mesure s'affiche « non fiable », jamais un chiffre nu.
 *
 * `judgeVersion` / `labelSetVersion` sont les empreintes du juge (modèle +
 * consigne) et du jeu : `tests/test_generic_recommendation_judge.py` échoue si
 * elles ne correspondent plus au code — un accord mesuré sur un autre juge ne
 * dit rien de celui-ci (`--reset` réaligne SANS mesure, donc « non fiable »).
 */

export const GENERIC_JUDGE_VERDICTS = ['generique', 'specifique', 'sans_recommandation'] as const
export type GenericJudgeVerdict = (typeof GENERIC_JUDGE_VERDICTS)[number]

/**
 * Le seuil écrit : sous 85 % d'accord avec les étiquettes, le juge se trompe sur
 * plus d'une réponse sur sept — assez pour qu'un taux de 20 % de réponses
 * génériques ne se distingue plus du bruit du juge lui-même.
 */
export const GENERIC_JUDGE_AGREEMENT_THRESHOLD_PERCENT = 85

/** Sous ce nombre de cas jugés, un taux d'accord ne veut rien dire. */
export const GENERIC_JUDGE_MIN_LABELLED_CASES = 20

type GenericJudgeCalibration = {
  judgeVersion: string
  labelSetVersion: string
  labelledCases: number
  measurement: null | { agreed: number; judged: number; failed: number; measuredAt: string; model: string }
}

// <generic-judge-calibration>
export const GENERIC_JUDGE_CALIBRATION: GenericJudgeCalibration = {
  judgeVersion: 'bf6435884c3e',
  labelSetVersion: '2c1358e0fdb1',
  labelledCases: 30,
  measurement: null,
}
// </generic-judge-calibration>

export type GenericJudgeReliability =
  | {
      state: 'reliable'
      judgeVersion: string
      agreementPercent: number
      agreed: number
      judged: number
      thresholdPercent: number
      measuredAt: string
    }
  | {
      state: 'unreliable'
      /**
       * `not_measured` : aucune calibration ; `incomplete` : des cas étiquetés
       * n'ont pas été jugés ; `too_few_cases` : sous le plancher ;
       * `below_threshold` : accord mesuré sous le seuil écrit.
       */
      reason: 'not_measured' | 'incomplete' | 'too_few_cases' | 'below_threshold'
      judgeVersion: string
      /** Présents dès qu'une mesure existe — un accord trop bas se montre, avec son seuil. */
      agreementPercent?: number
      agreed?: number
      judged?: number
      thresholdPercent: number
    }

/** La fiabilité du juge, lue sur sa calibration. Jamais « fiable » par défaut. */
export function genericJudgeReliability(
  calibration: GenericJudgeCalibration = GENERIC_JUDGE_CALIBRATION,
): GenericJudgeReliability {
  const base = { judgeVersion: calibration.judgeVersion, thresholdPercent: GENERIC_JUDGE_AGREEMENT_THRESHOLD_PERCENT }
  const m = calibration.measurement
  if (!m || m.judged === 0) return { ...base, state: 'unreliable', reason: 'not_measured' }
  const agreementPercent = Math.round((m.agreed / m.judged) * 10000) / 100
  const measured = { ...base, agreementPercent, agreed: m.agreed, judged: m.judged }
  if (m.failed > 0) return { ...measured, state: 'unreliable', reason: 'incomplete' }
  if (m.judged < GENERIC_JUDGE_MIN_LABELLED_CASES) return { ...measured, state: 'unreliable', reason: 'too_few_cases' }
  if (agreementPercent < GENERIC_JUDGE_AGREEMENT_THRESHOLD_PERCENT)
    return { ...measured, state: 'unreliable', reason: 'below_threshold' }
  return { ...measured, state: 'reliable', measuredAt: m.measuredAt }
}
