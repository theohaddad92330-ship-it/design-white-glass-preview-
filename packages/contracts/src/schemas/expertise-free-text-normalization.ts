/**
 * #2549.3 — retour client du 17/09 (Ludovic Marx) : la saisie libre de
 * `expertise_areas` (`allowOther: true`, `apps/web/.../questions/domaines.ts`)
 * laisse passer des variantes d'une même expertise (« automatisme » /
 * « automatismes »). Sans repli, deux valeurs quasi identiques cohabitent
 * dans `esn_profiles.expertise_areas`, invisibles l'une à l'autre pour tout
 * lecteur qui fait une égalité stricte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LISTE NOMMÉE, PAS UNE HEURISTIQUE DE PLURIEL
 * ─────────────────────────────────────────────────────────────────────────
 * Même leçon que `market-expertise-match.ts` (payée le 08/09/2026 sur un
 * filtre par longueur qui jetait `C#` et `Go`) : une règle générique
 * (« retirer le -s final ») replierait aussi bien des mots qui n'ont RIEN à
 * voir (« Méthodes » perdrait son -s et ne serait plus « Méthodes »). Seule
 * une liste NOMMÉE, relisible, sait qu'« automatismes » et « automatisme »
 * désignent la même expertise du catalogue.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA NE FAIT PAS — #2549.2, ARBITRAGE `retenu`
 * ─────────────────────────────────────────────────────────────────────────
 * « génie civil » et « BTP » ne sont PAS repliés l'un vers l'autre : ce sont
 * deux AXES différents. « Génie civil » est un MÉTIER/EXPERTISE (cette
 * liste, `expertise_areas`) ; « BTP » est le SECTEUR client, déjà porté par
 * `target_sectors` (« BTP & Construction »). Les fusionner ferait disparaître
 * la distinction secteur/métier que #2549.2 demande de nommer, pas de
 * réduire. Décision posée ici en attendant un arbitrage produit explicite.
 *
 * Une entrée absente de la liste d'alias traverse INCHANGÉE (trim seul) :
 * jamais de donnée inventée (craft rule « JAMAIS de données fictives »).
 */

/** Plie une chaîne pour la comparaison : minuscules, accents retirés, espaces resserrés. */
function fold(label: string): string {
  return label.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Alias connus → valeur EXACTE du catalogue (`ESN_ANSWER_OPTIONS.expertise_areas`).
 * Clés déjà PLIÉES (voir `fold`) pour une comparaison directe.
 */
const EXPERTISE_FREE_TEXT_ALIASES: ReadonlyMap<string, string> = new Map([
  ['automatisme', 'Automatisme, Robotique & Contrôle-commande'],
  ['automatismes', 'Automatisme, Robotique & Contrôle-commande'],
  ['automatique', 'Automatisme, Robotique & Contrôle-commande'],
  ['robotique', 'Automatisme, Robotique & Contrôle-commande'],
  ['mecanique', 'Mécanique & Conception (CAO, DAO)'],
  ['mecaniques', 'Mécanique & Conception (CAO, DAO)'],
  ['methode', 'Méthodes & Industrialisation'],
  ['methodes', 'Méthodes & Industrialisation'],
  ['industrialisation', 'Méthodes & Industrialisation'],
  ['qualite', 'Qualité, Certification & Métrologie'],
  ['assurance qualite industrielle', 'Qualité, Certification & Métrologie'],
  ['metrologie', 'Qualité, Certification & Métrologie'],
  ['genie civil', 'Génie civil & Structures (BTP, VRD)'],
  ['genie civile', 'Génie civil & Structures (BTP, VRD)'],
  ['electronique', 'Électronique & Instrumentation'],
  ['instrumentation', 'Électronique & Instrumentation'],
])

/**
 * Replie une saisie libre d'`expertise_areas` vers la valeur du catalogue
 * quand elle correspond à un alias NOMMÉ ; sinon la retourne trimée, à
 * l'identique — jamais de donnée inventée.
 */
export function normalizeExpertiseFreeText(rawInput: string): string {
  const folded = fold(rawInput)
  const canonical = EXPERTISE_FREE_TEXT_ALIASES.get(folded)
  return canonical ?? rawInput.trim()
}
