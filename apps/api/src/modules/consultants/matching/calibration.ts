/**
 * La calibration du score poussable (PDF 4 §14, ticket BEL-MTC-305).
 *
 * « Le score pushable ne vaut que s'il prédit. » La seule mesure valable est le
 * taux d'entretiens obtenus par tranche de score : si les courbes se croisent —
 * si les profils notés 50 obtiennent plus d'entretiens que ceux notés 85 — le
 * score est mal pondéré, et l'espace doit l'apprendre.
 *
 * Trois règles, chacune contre une lecture fausse :
 *
 *  - **un taux sans dénominateur vaut `null`, jamais 0 %.** Une tranche sans
 *    positionnement afficherait sinon « 0 % d'entretiens » et ferait chercher
 *    une panne là où il n'y a qu'une absence de données.
 *  - **rien n'est proposé sous {@link MIN_SUBMISSIONS} positionnements.** Cinq
 *    retours ne disent rien, et une pondération ajustée sur cinq retours est un
 *    sur-apprentissage sur un seul client.
 *  - **rien n'est APPLIQUÉ.** La fonction propose ; un administrateur décide.
 *    C'est la même règle que partout ailleurs dans le produit, et ici elle
 *    protège d'un moteur qui se réglerait lui-même sur ses propres erreurs.
 */

/** Le seuil du §14.2 : en deçà, on ne propose rien. */
export const MIN_SUBMISSIONS = 30

export const CALIBRATION_BANDS = [
  { key: '80-100', min: 80, max: 100 },
  { key: '60-79', min: 60, max: 79 },
  { key: '40-59', min: 40, max: 59 },
  { key: '<40', min: 0, max: 39 },
] as const

type CalibrationBand = {
  band: string
  submissions: number
  interviews: number
  /** `null` quand la tranche est vide — jamais 0 %. */
  rate: number | null
}

type Calibration = {
  bands: CalibrationBand[]
  total: number
  /** `false` tant qu'on n'a pas assez de retours pour dire quoi que ce soit. */
  enough: boolean
  /** `true` quand une tranche BASSE obtient plus d'entretiens qu'une tranche haute. */
  crossed: boolean
  /** La phrase à montrer à l'administrateur. `null` = rien à proposer. */
  proposal: string | null
}

export function calibrate(rows: readonly { pushable: number; reachedInterview: boolean }[]): Calibration {
  const bands: CalibrationBand[] = CALIBRATION_BANDS.map(definition => {
    const inBand = rows.filter(row => row.pushable >= definition.min && row.pushable <= definition.max)
    const interviews = inBand.filter(row => row.reachedInterview).length
    return {
      band: definition.key,
      submissions: inBand.length,
      interviews,
      // Un taux sans dénominateur n'est pas zéro : c'est une absence de mesure.
      rate: inBand.length === 0 ? null : Math.round((interviews * 1000) / inBand.length) / 10,
    }
  })

  const measured = bands.filter(band => band.rate !== null)
  let crossed = false
  for (let index = 0; index < measured.length - 1; index += 1) {
    const higher = measured[index]
    const lower = measured[index + 1]
    if (higher && lower && (lower.rate ?? 0) > (higher.rate ?? 0)) crossed = true
  }

  const total = rows.length
  const enough = total >= MIN_SUBMISSIONS
  return {
    bands,
    total,
    enough,
    crossed,
    proposal:
      enough && crossed
        ? "Les tranches se croisent : des profils moins bien notés obtiennent plus d'entretiens. La pondération de cet espace mérite d'être revue."
        : null,
  }
}
