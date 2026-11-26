/**
 * #2178.7 — un besoin sans compétence, sans TJM et sans date est « vague ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉFINITION, TRANCHÉE LE 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Un besoin est **vague** quand les TROIS manquent à la fois : aucune
 * compétence nommée, aucune fourchette de TJM, aucune date de démarrage. Le mot
 * était employé par une issue sans qu'aucun critère n'existe dans le produit —
 * et un mot sans critère ne se recette pas.
 *
 * ⚠️ **Les TROIS, jamais l'un des trois.** Un besoin sans TJM mais avec trois
 * compétences et une date de démarrage est un besoin NORMAL : les ESN chiffrent
 * souvent après la qualification. Déclarer vague tout ce qui a un trou ferait
 * de « vague » un synonyme d'« incomplet », c'est-à-dire un compteur de la
 * complétude de nos champs plutôt qu'une lecture du besoin.
 *
 * ⚠️ **Ce qui manque est NOMMÉ.** On ne rend pas un score nu : un besoin vague
 * renvoie les trois axes absents, pour que l'écran dise QUOI demander au client
 * plutôt que « besoin vague, débrouille-toi ». C'est la même règle que partout
 * ailleurs — ce qui n'a pas pu être évalué porte un nom.
 *
 * ⚠️ **« Contradictoire » (#2178.8) n'est PAS ici, et ce n'est pas un oubli.**
 * Un besoin contradictoire — « junior, 900 € », « full remote, présence
 * obligatoire » — demande de comparer des champs entre eux, pas de constater
 * trois absences. Il reste `retenu` : plus dur, et il peut attendre. L'ajouter
 * à la va-vite ici ferait passer pour une contradiction ce qui n'est qu'un
 * champ vide.
 */

/** Les trois axes qui font qu'un besoin dit quelque chose. */
export const NEED_VAGUENESS_AXES = ['skills', 'rate', 'start_date'] as const
export type NeedVaguenessAxis = (typeof NEED_VAGUENESS_AXES)[number]

/** Ce que la lecture a besoin de savoir d'un besoin — et rien de plus. Écrit en
 *  structure minimale plutôt qu'en `ProjectNeed` complet : la définition doit
 *  pouvoir se poser sur un besoin en cours de saisie comme sur un besoin lu. */
export type NeedVaguenessInput = {
  skills?: readonly unknown[] | null
  target_tjm_cents?: number | null
  start_on?: string | null
}

/** Les axes ABSENTS d'un besoin, nommés. Vide = le besoin dit quelque chose. */
export function missingNeedAxes(need: NeedVaguenessInput): NeedVaguenessAxis[] {
  const missing: NeedVaguenessAxis[] = []
  // `[]` est une absence : une liste vide de compétences ne nomme rien. Mais
  // `0` centimes n'en est PAS une — c'est un tarif annoncé, aussi surprenant
  // soit-il, et le lire comme un trou ferait dire « vague » à un besoin chiffré.
  if (!need.skills || need.skills.length === 0) missing.push('skills')
  if (need.target_tjm_cents === null || need.target_tjm_cents === undefined) missing.push('rate')
  if (!need.start_on) missing.push('start_date')
  return missing
}

/** Vrai quand les TROIS axes manquent — jamais quand un seul manque. */
export function isNeedVague(need: NeedVaguenessInput): boolean {
  return missingNeedAxes(need).length === NEED_VAGUENESS_AXES.length
}
