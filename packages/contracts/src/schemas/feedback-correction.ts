import type { AccountFeedbackTarget, AccountFeedbackVerdict } from './account-feedback.js'

/**
 * Appliquer un retour utilisateur à l'analyse stockée, sans rejouer le dossier
 * (recette finale §58, P1-10).
 *
 * Le feedback existait déjà et servait à DEUX choses : mémoriser une correction
 * pour le prochain run, et écarter un contact du graphe d'organigramme. Il ne
 * touchait pas au reste — un contact signalé faux continuait de compter dans
 * l'accessibilité, et le score gardait une justification que l'utilisateur
 * venait de contredire. Signaler une erreur et voir la note ne pas bouger
 * apprend une chose à l'utilisateur : que son retour ne sert à rien.
 *
 * La transformation est PURE et déterministe. Elle n'appelle aucun modèle, donc
 * elle ne coûte rien : corriger une erreur du produit ne doit rien coûter à
 * celui qui la signale.
 */

/** Ce qu'un retour retire de l'analyse. */
export type FeedbackCorrection = {
  target: AccountFeedbackTarget
  targetRef: string
  verdict: AccountFeedbackVerdict
}

/**
 * Les verdicts qui RETIRENT quelque chose. « Utile » ne change rien à la
 * donnée — c'est un encouragement, pas une correction — et « inutile » dit que
 * l'élément n'aide pas, pas qu'il est faux : le retirer effacerait un fait
 * exact au motif qu'il n'intéresse pas, ce qui rendrait le dossier moins vrai.
 */
const REMOVING_VERDICTS: readonly AccountFeedbackVerdict[] = ['faux', 'obsolete']

function matches(candidate: unknown, ref: string): boolean {
  const needle = ref.trim().toLowerCase()
  if (!needle) return false
  if (typeof candidate === 'string') return candidate.trim().toLowerCase() === needle
  if (candidate && typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>
    for (const key of ['id', 'full_name', 'fullName', 'name', 'signal', 'title', 'label']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim().toLowerCase() === needle) return true
    }
  }
  return false
}

/**
 * L'analyse, corrigée des retours qui retirent quelque chose.
 *
 * Non destructif sur la source : on rend une copie. L'analyse d'origine reste
 * en base — une correction est une LECTURE différente des mêmes faits, pas leur
 * effacement, et un utilisateur qui se trompe en corrigeant doit pouvoir
 * revenir en arrière.
 */
export function applyFeedbackCorrections(
  analysis: Record<string, unknown> | null | undefined,
  corrections: readonly FeedbackCorrection[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(analysis ?? {}) }
  const removals = corrections.filter(c => REMOVING_VERDICTS.includes(c.verdict))
  if (removals.length === 0) return out

  const removeFrom = (key: string, target: AccountFeedbackTarget) => {
    const list = out[key]
    if (!Array.isArray(list)) return
    const refs = removals.filter(c => c.target === target).map(c => c.targetRef)
    if (refs.length === 0) return
    out[key] = list.filter(item => !refs.some(ref => matches(item, ref)))
  }

  removeFrom('contacts', 'contact')
  removeFrom('recentSignals', 'signal')
  removeFrom('actionPlan', 'play')

  return out
}

/** Y a-t-il de quoi recalculer ? Évite un appel réseau quand aucun retour ne
 *  retire rien — le cas le plus fréquent, un simple « utile ». */
export function correctionsChangeAnalysis(corrections: readonly FeedbackCorrection[]): boolean {
  return corrections.some(c => REMOVING_VERDICTS.includes(c.verdict))
}
