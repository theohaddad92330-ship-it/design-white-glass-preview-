import {
  bulkEnrichmentCost,
  bulkEnrichmentExclusions,
  type BulkEnrichmentExclusionReason,
  type ContactViewInput,
} from '@bellum/contracts'

/**
 * La PORTE unique d'un enrichissement de lot : qui part, et ce que ça coûte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le coût s'annonce AVANT le clic. Tenir cette règle demande davantage
 * qu'afficher un nombre : il faut que le nombre affiché MESURE l'ensemble qui
 * part. Les deux chemins d'enrichissement de masse de la liste de contacts
 * comptaient chacun le leur, à la main, avec un prédicat écrit sur place —
 * « il manque un champ » — pendant que le contrat facture autre chose :
 * `bulkEnrichmentCost` ne compte QUE les contacts sans aucune coordonnée et
 * dont l'identité est résolue. Trois contacts annoncés, deux débités.
 *
 * Le pire des deux chemins n'affichait rien du tout : l'action « ouvrir un
 * canal » enrichissait en silence tout contact à qui ce canal manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE GARANTIT, PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────
 * L'ensemble ANNONCÉ **est** l'ensemble ENVOYÉ : `billableContacts` est le seul
 * ensemble qu'un appelant a le droit d'envoyer, et `maxCredits` est calculé par
 * le contrat SUR CET ENSEMBLE-LÀ. Les deux ne peuvent pas diverger parce qu'il
 * n'y a qu'une dérivation, et qu'elle vit ici (GA-26).
 *
 * Aucun prédicat n'est réécrit : la décision « ce contact est-il facturable »
 * reste entièrement dans `bulkEnrichmentCost`, interrogé contact par contact.
 * C'est volontairement le contrat qui répond, y compris à l'unité — le jour où
 * il changera d'avis, l'écran changera avec lui sans qu'on y touche.
 */
type BulkEnrichmentPlan<T> = {
  /** Exactement les contacts à envoyer. Vide ⇒ il n'y a RIEN à acheter. */
  billableContacts: readonly T[]
  /**
   * Le maximum de crédits, mesuré par le contrat sur `billableContacts`.
   *
   * ⚠️ Un plan vide rend `0`, et ce zéro ne s'affiche pas : « 0 crédit » se lit
   * « je vais débiter zéro », alors que la vérité est « il n'y a rien à faire ».
   * Les appelants testent `billableContacts.length`, jamais ce nombre.
   */
  maxCredits: number
  /**
   * #2297.25 — pourquoi le reste de la sélection n'est PAS dans
   * `billableContacts`, par raison, jamais en silence. Vide ⇒ toute la
   * sélection part (aucune ligne d'exclusion à annoncer).
   */
  excluded: readonly { reason: BulkEnrichmentExclusionReason; count: number }[]
}

/**
 * Ce qui partira, et ce que ça coûtera au plus.
 *
 * `candidates` est la sélection que l'utilisateur a désignée ; le retour est ce
 * qu'on a le droit de lui facturer. Tout ce que le contrat n'appelle pas
 * facturable est écarté AVANT l'annonce, donc jamais envoyé — et la raison de
 * chaque écart voyage dans `excluded` plutôt que de disparaître.
 */
export function planBulkEnrichment<T extends ContactViewInput>(candidates: readonly T[]): BulkEnrichmentPlan<T> {
  const billableContacts = candidates.filter(contact => bulkEnrichmentCost([contact]).billable === 1)
  return {
    billableContacts,
    maxCredits: bulkEnrichmentCost(billableContacts).maxCredits,
    excluded: bulkEnrichmentExclusions(candidates),
  }
}

/**
 * #2297 (recette prod 02/10) — combien de contacts de la sélection sont écartés
 * parce qu'ils ont été enrichis récemment SANS résultat. Quand rien n'est
 * facturable, c'est CE motif qu'il faut nommer : « coordonnée déjà là » serait faux.
 */
export function onCooldownCount(excluded: BulkEnrichmentPlan<unknown>['excluded']): number {
  return excluded.find(entry => entry.reason === 'on_cooldown')?.count ?? 0
}
