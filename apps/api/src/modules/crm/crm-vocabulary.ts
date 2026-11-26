/**
 * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
 *
 * Le questionnaire d'entrée demandait à VÉRIFIER le CRM avant chaque bloc, pour
 * ne pas tout redemander. Le blocage est mesuré et écrit : `target_sectors` /
 * `target_company_types` / `geo_zones` sont un catalogue FERMÉ
 * (`ESN_ANSWER_OPTIONS`), et le vocabulaire d'un CRM est LE SIEN — HubSpot rend
 * `COMPUTER_SOFTWARE`, jamais une des valeurs du catalogue. Aucune table de
 * correspondance n'existe, et en fabriquer une ici serait DEVINER une
 * équivalence, pas la lire.
 *
 * Ce que la décision débloque : on ne traduit rien, donc on ne devine rien. On
 * MONTRE ce que le CRM branché contient RÉELLEMENT, dans ses propres mots,
 * comme aide à la saisie — la personne choisit elle-même dans le catalogue
 * fermé. Ce type ne porte donc AUCUNE valeur du catalogue `ESN_ANSWER_OPTIONS`,
 * seulement le vocabulaire BRUT du CRM.
 *
 * Honnêteté (JAMAIS de donnée inventée) :
 *   - CRM non configuré / non connecté → `provider: null`, listes vides
 *   - connecté mais rien à lire (portail muet) ou lecture en échec → listes
 *     vides (aucune distinction affichée : « non mesuré » et « mesuré, zéro »
 *     se ressemblent trop pour être fiables ici, donc rien ne s'affiche dans
 *     les deux cas — GA-18/GA-19, jamais un « 0 » déguisé)
 *   - lu avec succès → valeurs BRUTES uniquement, telles que le CRM les rend
 *
 * Seul HubSpot est câblé (le CRM « beta » du dépôt, `crm.controller.ts`) :
 * Salesforce / Pipedrive / Attio n'ont aucune méthode de LECTURE de société
 * aujourd'hui (seulement l'export de contacts/besoins) — les construire est
 * hors du périmètre de ce lot. Un espace connecté à l'un de ces trois obtient
 * donc `provider: null` : c'est vrai (rien n'a été lu), jamais un mensonge.
 *
 * GA-43 : un seul espace est jamais lu (`workspaceScopeWhere`) — aucune
 * agrégation entre espaces.
 */
export type CrmVocabulary = {
  /** Le CRM qui a répondu — null quand aucun n'a été consulté (pas connecté,
   *  pas configuré, ou pas encore câblé pour cette lecture). */
  provider: 'hubspot' | null
  /** Les valeurs BRUTES de la propriété « secteur/industrie » du CRM, telles
   *  qu'il les rend — jamais mappées vers `ESN_ANSWER_OPTIONS.target_sectors`. */
  industries: string[]
  /** Les valeurs BRUTES de la propriété « pays » du CRM — jamais mappées vers
   *  `ESN_ANSWER_OPTIONS.geo_zones`. */
  countries: string[]
}

/** La réponse honnête par défaut : rien n'a été lu. */
export function emptyVocabulary(provider: CrmVocabulary['provider'] = null): CrmVocabulary {
  return { provider, industries: [], countries: [] }
}

/** Combien de sociétés on parcourt pour construire le vocabulaire — borné pour
 *  ne pas transformer une aide à la saisie en scan complet du portail à chaque
 *  ouverture d'écran (2 pages HubSpot au tarif MAX_PAGE_SIZE). */
export const CRM_VOCABULARY_MAX_COMPANIES_SCANNED = 200

/** Combien de valeurs DISTINCTES on affiche par question — un « aide à la
 *  saisie » qui listerait 150 secteurs ne serait plus une aide. */
export const CRM_VOCABULARY_MAX_VALUES = 12
