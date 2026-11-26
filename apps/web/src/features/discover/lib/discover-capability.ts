import type { DiscoverDegradedSource } from './discover-types'

/**
 * Où poser l'information « ce filtre n'a pas été appliqué ».
 *
 * Réponse : à côté du filtre. Ce qui est vrai et utile pour le commercial, ce
 * n'est pas « une source a un problème » (elle n'en a pas) — c'est « le critère
 * que TU as coché n'a pas pu être appliqué par le registre, donc la liste est
 * plus large que ce que tu as demandé ». Cette phrase-là ne se lit correctement
 * qu'au point où le critère a été posé, et elle y devient actionnable : le
 * champ NAF juste en dessous dit déjà « un code NAF précis remplace le secteur
 * choisi », qui est exactement le contournement.
 *
 * En haut de page, la même information devient une alarme sans objet : c'est le
 * bandeau ambre d'origine, celui qui a fait dire « ça dérange plus qu'autre
 * chose ».
 */

/** Critères de `degraded[].fields` que l'écran Découvrir sait montrer. Une clé
 *  absente de cette liste n'est PAS rattachée : le registre gouv.fr sait par
 *  exemple refuser un `revenue_min`, mais Découvrir n'expose aucun champ de
 *  chiffre d'affaires — lui fabriquer un libellé inventerait un filtre que
 *  l'utilisateur n'a jamais posé. */
const SCREEN_FILTER_KEYS = new Set(['sector', 'nafCode', 'department', 'city', 'headcount', 'age', 'freetext'])

/**
 * Critère d'écran → sources qui n'ont pas su l'appliquer.
 *
 * Une `Map` plutôt qu'un `Set` : nommer la source rend la note vérifiable
 * (« non appliqué par pappers ») au lieu d'un « ça n'a pas marché » anonyme.
 */
export function unappliedFilters(capabilities: readonly DiscoverDegradedSource[]): Map<string, string[]> {
  const byField = new Map<string, string[]>()

  for (const entry of capabilities) {
    for (const field of entry.fields ?? []) {
      if (!SCREEN_FILTER_KEYS.has(field)) continue
      const sources = byField.get(field) ?? []
      if (!sources.includes(entry.source)) sources.push(entry.source)
      byField.set(field, sources)
    }
  }

  return byField
}

/**
 * Les limites de capacité qu'AUCUN champ d'écran ne peut porter — soit la
 * source n'a pas nommé le critère, soit ce critère n'existe pas à l'écran.
 *
 * Elles gardent une note neutre à part : ne rien afficher perdrait
 * l'information (« pourquoi ces lignes ne collent-elles pas à ma demande ? »),
 * et l'afficher en ambre reproduirait le bug. Une entrée dont tous les critères
 * ont trouvé leur champ n'apparaît pas ici : le message serait dit deux fois.
 */
export function unnamedCapabilities(capabilities: readonly DiscoverDegradedSource[]): DiscoverDegradedSource[] {
  return capabilities.filter(entry => !(entry.fields ?? []).some(field => SCREEN_FILTER_KEYS.has(field)))
}
