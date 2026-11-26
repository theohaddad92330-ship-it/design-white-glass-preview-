import {
  formatSpokenLanguages,
  parseClearanceList,
  parseSpokenLanguages,
  type OpenNeedRow,
  type SpokenLanguage,
  type UpdateProjectNeed,
} from '@bellum/contracts'

/**
 * CE QUE LE POSTE EXIGE — la saisie, et ce qu'elle produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `languages` et `clearances` traversaient le contrat, le schéma d'écriture et
 * DEUX axes du rapprochement — dont l'axe 12, déclaré BLOQUANT — et aucun écran
 * ne les touchait. Les deux axes tournaient donc toujours sur un tableau vide
 * côté besoin : un profil sans l'habilitation exigée n'était jamais écarté,
 * alors que le moteur savait le faire. Un garde-fou qui ne s'applique jamais est
 * pire qu'un garde-fou absent, parce qu'il se lit comme une protection.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA GRAMMAIRE DE SAISIE N'EST PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * « fr:natif, en:b2 » est analysé par le CONTRAT (`parseSpokenLanguages`), pas
 * par cet écran. La fiche d'un consultant saisit la même chose ; deux analyseurs
 * recopiés diraient un jour deux choses du même « en:b2 », et l'écart ne se
 * verrait nulle part — le moteur classerait « niveau non précisé » un niveau que
 * le formulaire vient d'accepter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2323.38-.42 — QUATRE CHAMPS DE PLUS, MÊME CARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le nombre d'entretiens et les jours de présence sont des ENTIERS bornés,
 * saisis en texte pour la même raison que `languages`/`clearances` — un champ
 * vide n'est pas « 0 », c'est « non renseigné » (doctrine UNKNOWN ≠ ZERO).
 * `freelanceExcluded`/`budgetValidated` sont des booléens à TROIS états
 * (`unknown`/`yes`/`no`) — jamais une case à cocher, dont l'état non coché se
 * confondrait avec un « non » explicite.
 */

export type TriState = 'unknown' | 'yes' | 'no'

function triFromBool(value: boolean | null | undefined): TriState {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return 'unknown'
}

function boolFromTri(value: TriState): boolean | null {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

/** `''` = non renseigné, jamais 0. Une valeur hors bornes ou non numérique
 *  retombe sur `null` — le formulaire ne devine pas ce qu'il n'a pas compris. */
function intFromField(value: string, min: number, max: number): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null
  return parsed
}

export type NeedRequirementsForm = {
  /** « fr:natif, en:b2 » — la même grammaire que la fiche d'un consultant. */
  languages: string
  /** « Confidentiel Défense, agrément SNCF ». */
  clearances: string
  /** #2323.38 — 0 à 10, texte pour que le vide reste « non renseigné ». */
  interviewRounds: string
  /** #2323.40 — 0 à 5. */
  onsiteDaysPerWeek: string
  /** #2323.41 */
  freelanceExcluded: TriState
  /** #2323.42 */
  budgetValidated: TriState
}

type RequirementsNeed = Pick<
  OpenNeedRow,
  'languages' | 'clearances' | 'interview_rounds' | 'onsite_days_per_week' | 'freelance_excluded' | 'budget_validated'
>

/** Ce que le champ montre à l'ouverture : l'état actuel, jamais un exemple. */
export function needRequirementsToForm(need: RequirementsNeed): NeedRequirementsForm {
  return {
    languages: formatSpokenLanguages(need.languages ?? []),
    clearances: (need.clearances ?? []).join(', '),
    interviewRounds: need.interview_rounds == null ? '' : String(need.interview_rounds),
    onsiteDaysPerWeek: need.onsite_days_per_week == null ? '' : String(need.onsite_days_per_week),
    freelanceExcluded: triFromBool(need.freelance_excluded),
    budgetValidated: triFromBool(need.budget_validated),
  }
}

/** Ce que le formulaire produit, prêt pour `PATCH /projects/needs/:id`. */
export function needRequirementsToPatch(form: NeedRequirementsForm): {
  languages: SpokenLanguage[]
  clearances: string[]
  interview_rounds: number | null
  onsite_days_per_week: number | null
  freelance_excluded: boolean | null
  budget_validated: boolean | null
} {
  return {
    languages: parseSpokenLanguages(form.languages),
    clearances: parseClearanceList(form.clearances),
    interview_rounds: intFromField(form.interviewRounds, 0, 10),
    onsite_days_per_week: intFromField(form.onsiteDaysPerWeek, 0, 5),
    freelance_excluded: boolFromTri(form.freelanceExcluded),
    budget_validated: boolFromTri(form.budgetValidated),
  }
}

/**
 * Le patch à envoyer — ou `null` quand rien n'a bougé.
 *
 * ⚠️ Un `PATCH` inutile n'est pas gratuit ici : `updateNeed` touche
 * `updated_at`, et une fiche qui se dit « modifiée il y a une minute » parce
 * qu'on a ouvert puis fermé le formulaire fait chercher un changement qui
 * n'existe pas.
 *
 * ⚠️ Et la comparaison porte sur le RÉSULTAT ANALYSÉ, pas sur le texte : taper
 * « fr:natif,en:b2 » puis « fr:natif, en:b2 » ne change rien du tout, et
 * comparer les chaînes enverrait quand même l'écriture.
 */
export function needRequirementsPatch(need: RequirementsNeed, form: NeedRequirementsForm): UpdateProjectNeed | null {
  const next = needRequirementsToPatch(form)
  const current = needRequirementsToPatch(needRequirementsToForm(need))
  const sameLanguages =
    next.languages.length === current.languages.length &&
    next.languages.every((item, index) => {
      const before = current.languages[index]
      return before !== undefined && before.code === item.code && before.level === item.level
    })
  const sameClearances =
    next.clearances.length === current.clearances.length &&
    next.clearances.every((item, index) => current.clearances[index] === item)
  const sameScalars =
    next.interview_rounds === current.interview_rounds &&
    next.onsite_days_per_week === current.onsite_days_per_week &&
    next.freelance_excluded === current.freelance_excluded &&
    next.budget_validated === current.budget_validated

  if (sameLanguages && sameClearances && sameScalars) return null
  // Tous les champs voyagent ensemble : le formulaire les édite d'un seul
  // geste, et n'envoyer que celui qui a changé ferait dépendre le résultat de
  // l'ordre de saisie. `[]`/`null` sont envoyés tels quels — retirer une
  // exigence est un geste qui doit pouvoir se faire.
  return {
    languages: next.languages,
    clearances: next.clearances,
    interview_rounds: next.interview_rounds,
    onsite_days_per_week: next.onsite_days_per_week,
    freelance_excluded: next.freelance_excluded,
    budget_validated: next.budget_validated,
  }
}
