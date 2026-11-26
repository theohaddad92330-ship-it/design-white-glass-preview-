import type { NeedMatcherAdvisoryCriterion, NeedMatcherGate } from './need-matcher-gate.js'
import type { NeedPresenterAdvisoryCriterion, NeedPresenterGate } from './need-presenter-gate.js'

/**
 * #2323.46 — LE RÉSUMÉ QUALITÉ (« matchable mais pas présentable, il manque
 * X »), LAU-FINAL-064.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne LIT jamais un `ProjectNeed` : il COMPOSE ce que {@link needMatcherGate},
 * {@link needPresenterGate} et `needHasEngagedConsultant` (`need-submission-gate.ts`)
 * ont déjà calculé. Un réglage vit à un seul endroit (GA-26) — recalculer ici
 * ce que les trois gates savent déjà ferait diverger les deux au premier
 * changement de critère.
 *
 * Trois axes, chacun booléen, chacun sa propre liste de « ce qui manque » —
 * jamais un score nu (doctrine : « un score n'est jamais nu, ses axes sont
 * nommés »). Aucune PROBABILITÉ, aucun pourcentage : juste ce qui est fait,
 * ce qui ne l'est pas, et son nom.
 *
 * ⚠️ Les trois axes sont INDÉPENDANTS — un consultant déjà engagé
 * (`readyToEngage`) reste vrai même si le besoin a depuis perdu ses
 * compétences (`matchable = false`) : ce fichier ne suppose jamais qu'un axe
 * antérieur redevient faux parce qu'un autre l'est, ce serait inventer une
 * règle de régression qu'aucune spec ne donne.
 */

export interface NeedQualitySummary {
  /** La porte MATCHER (#2323.13-.17/.47) est-elle franchie ? */
  matchable: boolean
  /** Ce qu'elle a nommé comme manquant — jamais recalculé, transporté tel quel. */
  missingMatcher: readonly NeedMatcherAdvisoryCriterion[]
  /** La porte PRÉSENTER (#2323.18-.23) : aucun critère manquant ET aucun
   *  désaccord de type de profil reçu. */
  presentable: boolean
  missingPresenter: readonly NeedPresenterAdvisoryCriterion[]
  /** #2323.18 — un refus explicite du client, nommé à part : la raison pour
   *  laquelle `presentable` peut être `false` même à `missingPresenter: []`. */
  profileTypeDisagreement: boolean
  /** La porte DÉMARRER (#2323.25) : au moins un consultant ENGAGÉ. */
  readyToEngage: boolean
}

export function needQualitySummary(input: {
  matcher: Pick<NeedMatcherGate, 'canLaunch' | 'missingAdvisory'>
  presenter: Pick<NeedPresenterGate, 'missingAdvisory' | 'profileTypeDisagreement'>
  hasEngagedConsultant: boolean
}): NeedQualitySummary {
  return {
    matchable: input.matcher.canLaunch,
    missingMatcher: input.matcher.missingAdvisory,
    presentable: input.presenter.missingAdvisory.length === 0 && !input.presenter.profileTypeDisagreement,
    missingPresenter: input.presenter.missingAdvisory,
    profileTypeDisagreement: input.presenter.profileTypeDisagreement,
    readyToEngage: input.hasEngagedConsultant,
  }
}
