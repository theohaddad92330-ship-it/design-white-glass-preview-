/**
 * #3245 (reste de #3209.3) — « BUDGET D'EFFORT » : la spec nomme six mesures
 * (heures commerciales disponibles, nombre d'appels, comptes travaillables,
 * volume de contacts, analyses payantes, capacité de suivi). Cinq sont
 * assemblées ici, TOUTES depuis une source réelle déjà écrite par le
 * produit — aucune n'est recalculée ni devinée :
 *
 *  - `weeklyAvailableHours` — le réglage d'espace posé sur
 *    `workspace_commercial_load_settings` (#3245, migration
 *    `1796376490526`). `null` = non renseigné, jamais 0 heure (GA-18/GA-19).
 *  - `callsLast7Days` — `user_actions` où `action_type = 'plan_action_call_logged'`,
 *    7 jours glissants. Un compteur RÉEL d'événements déjà journalisés,
 *    jamais un décompte inventé.
 *  - `paidAnalysesLast7Days` — `credit_ledger` où `kind = 'consume_analysis'`,
 *    7 jours glissants : le ledger de facturation (Théo §14) EST la source
 *    des analyses qui ont réellement débité un crédit, plus fiable qu'un
 *    comptage d'événements applicatifs.
 *  - `workableAccounts` — la somme des trois catégories « travaillables » de
 *    `derivePortfolioPriorities` (maintenant + à vérifier + à surveiller),
 *    jamais un second calcul : « à ne pas travailler » n'y entre pas, par
 *    définition.
 *  - `contactsVolume` — `COUNT(*)` sur `contacts` pour l'espace.
 *
 * La SIXIÈME mesure, « capacité de suivi », N'EST PAS ICI : aucune donnée du
 * dépôt ne porte un temps de suivi par compte ou par contact — l'inventer
 * romprait « jamais de donnée fictive » (CLAUDE.md § Code rules). Voir le
 * commentaire de bilan sur #3245.
 */
export type EffortBudget = {
  weeklyAvailableHours: number | null
  callsLast7Days: number
  paidAnalysesLast7Days: number
  workableAccounts: number
  contactsVolume: number
}
