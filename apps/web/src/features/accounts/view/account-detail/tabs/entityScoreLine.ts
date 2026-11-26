import { ACCESS_ENTITY_AXES, accountScoreIsShowable } from '@bellum/contracts'
import type { AccessEntityAxis, AccessEntityReasonFact } from '@bellum/contracts'
import type { TFunction } from 'i18next'

/**
 * Un fait du barème d'entrée, dit dans la langue de l'écran (#3473). UN seul
 * endroit : la raison du rang (`entityReasonText`) et la ligne de score
 * ci-dessous le lisent tous les deux (GA-26).
 */
export function entityFactText(fact: AccessEntityReasonFact, t: TFunction): string {
  switch (fact.code) {
    case 'kind':
      return t(`entities.reasons.kind.${fact.kind}`, { defaultValue: t('entities.reasons.kind.unknown') })
    case 'contacts':
      return t('entities.reasons.contacts', { count: fact.count })
    case 'sites':
      return t('entities.reasons.sites', { count: fact.count })
    case 'rank1':
      return fact.value ? t('entities.reasons.rank1Named', { value: fact.value }) : t('entities.reasons.rank1')
  }
}

/**
 * #4016 L9 — LE SCORE D'UNE FILIALE / BU, AVEC SES AXES.
 *
 * ⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L9 : « score des
 * filiales et BU affiché avec ses axes ») de `c48_score_entite`, qui ne
 * montrait que la raison. Le nombre ne sort PLUS que dans cette ligne, qui
 * pose avec lui (1) les points de chaque axe qui a un fait, et (2) le nom des
 * axes qu'on n'a pas pu évaluer — jamais un « 0 » à leur place. Un score n'est
 * jamais nu.
 *
 * ⚠️ Elle reçoit l'ENTITÉ ENTIÈRE (forme de l'API), pas le nombre : l'écran
 * (`TabAccess.tsx`) ne lit jamais `.score` lui-même — GA-58 le vérifie, et c'est
 * ce qui garantit que le nombre ne sort que décomposé.
 *
 * #4016.L9.a — ⚠️ RENVERSEMENT DATÉ du 13/10/2026 (Louis : « un score s'affiche
 * dès 2 axes évaluables, toujours avec son nombre d'axes ») : la ligne dit
 * « 2 axes sur 4 évalués » et se tait sous DEUX axes (le 11/10, un seul fait
 * suffisait). Le plancher vient du contrat (`accountScoreIsShowable`), jamais
 * d'ici. Sous le plancher, la RAISON du rang reste affichée par l'écran : les
 * axes connus restent visibles, seul le nombre se tait.
 *
 * Rend `null` — donc aucune ligne — quand :
 *  - moins de deux axes ont un fait (un « 0 point » serait une valeur absente
 *    affichée comme une mesure, et un axe seul ne fait pas un score) ;
 *  - un ancien serveur n'envoie ni les points ni les axes manquants ;
 *  - la somme des points n'est pas le total (un nombre qu'on ne peut pas
 *    décomposer reste un nombre nu : on ne le montre pas).
 */
export function entityScoreLine(
  entity: {
    readonly score: number
    readonly reason_facts?: readonly AccessEntityReasonFact[]
    readonly missing_axes?: readonly AccessEntityAxis[]
  },
  t: TFunction,
): string | null {
  const facts = entity.reason_facts ?? []
  const missingAxes = entity.missing_axes
  if (facts.length === 0 || missingAxes === undefined) return null
  // #4016.L9.a — sous deux axes évaluables, pas de score (GA-58 réécrite).
  if (!accountScoreIsShowable(facts.length)) return null
  if (facts.some(fact => typeof fact.points !== 'number')) return null
  if (facts.reduce((sum, fact) => sum + fact.points, 0) !== entity.score) return null

  const axes = facts
    .map(fact => t('entities.scoreFact', { label: entityFactText(fact, t), points: fact.points }))
    .join(' · ')
  // #4016.L9.a — le score dit TOUJOURS sur combien d'axes il repose.
  const axesCount = t('entities.scoreAxesCount', { count: facts.length, total: ACCESS_ENTITY_AXES.length })
  const line = t('entities.scoreLine', { value: entity.score, axesCount, axes })
  if (missingAxes.length === 0) return line
  const missing = missingAxes.map(axis => t(`entities.axes.${axis}`)).join(', ')
  return `${line} ${t('entities.scoreMissing', { axes: missing })}`
}
