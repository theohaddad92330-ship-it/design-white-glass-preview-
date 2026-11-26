import { reachesOutsideProduct, type ActionIntentType } from '@bellum/contracts'

/**
 * #2378.9 — une étape qui SORT attend, une étape INTERNE part.
 *
 * DÉCISION LOUIS 21/09/2026. La frontière est écrite dans le contrat
 * (`effect-reach.ts`, `OUTREACH_STEP_REACH`) ; ce fichier est l'endroit où elle
 * s'EXERCE, c'est-à-dire le seul endroit du dépôt où la programmation d'une
 * séquence déclenche quelque chose sans qu'un humain ait cliqué.
 *
 * Aujourd'hui ce quelque chose est un rappel daté : `OutreachService.create`
 * dispatche `schedule_reminder` pour CHAQUE étape, y compris une étape `email`
 * — pour laquelle le rappel dit « à envoyer », et le geste d'envoi reste humain.
 * C'est exactement le côté INTERNE de la frontière, et c'est correct.
 *
 * Ce qui manquait, c'est que rien ne le DISAIT. Le jour où quelqu'un remplace
 * cet intent par celui qui part — parce qu'un client demandera « et si ça
 * partait tout seul à J+4 ? » — aucune ligne ne l'arrêtait. Maintenant si.
 */

/** Le message du refus. Cité par la garde GA-374 (`une-etape-qui-sort-attend.spec.ts`). */
export const SEQUENCE_FRONTIER_REFUSAL =
  '#2378.9 — une étape de séquence ne dispatche jamais toute seule un intent qui SORT du produit. ' +
  "Ce qui atteint quelqu'un d'extérieur attend une validation explicite, même programmée, même lancée."

/**
 * La PORTE : rend l'intent tel quel s'il est interne, refuse s'il sort.
 *
 * S'écrit sur le site d'appel (`dispatch({ type: automaticSequenceIntent('schedule_reminder'), … })`)
 * plutôt qu'en garde muette ailleurs : c'est la ligne qu'un développeur pressé
 * devrait SUPPRIMER pour faire partir un e-mail tout seul, et une suppression
 * se voit en relecture là où un oubli ne se voit pas.
 */
export function automaticSequenceIntent<T extends ActionIntentType>(type: T): T {
  if (reachesOutsideProduct(type)) throw new Error(`${SEQUENCE_FRONTIER_REFUSAL} Intent refusé : ${type}.`)
  return type
}

/** Le code SANS ses commentaires : une garde qui lit la prose accuse le bien. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les `dispatch(` d'un source qui posent un `type:` LITTÉRAL au lieu de passer
 * par {@link automaticSequenceIntent}. Rend la liste des fautes, vide si tout
 * va bien — lue par GA-374 sur les sources réelles du module `outreach`.
 *
 * Un littéral suffit à accuser, même `'schedule_reminder'` : la porte n'est pas
 * une vérification de valeur (le compilateur la ferait), c'est le point de
 * passage. Un site d'appel qui la contourne aujourd'hui pour un intent interne
 * est le site d'appel qu'on modifiera demain pour un intent qui sort.
 */
export function dispatchesThatSkipTheFrontier(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []
  for (const call of code.matchAll(/\.dispatch\(/g)) {
    // La charge utile du dispatch : jusqu'à la fermeture de l'objet littéral.
    const window = code.slice(call.index, call.index + 400)
    const literal = window.match(/type:\s*'([a-z_]+)'/)
    if (literal) found.push(`type: '${literal[1]}'`)
  }
  return found
}
