import { securedMonthlyRevenueOf, type HorizonForecast, type Money } from '@bellum/contracts'

/**
 * #2408.64 / #2408.65 — REVENU MENSUEL SÉCURISÉ / REVENU À RISQUE, sur le
 * cockpit missions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER NE CALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `columns.ts:64-74` refuse déjà une colonne « prêt à facturer » / « relevé
 * du mois » sur CETTE table : la donnée est mensuelle, elle vit sur une
 * autre route qui porte SON mois, et la fondre ici forcerait un choix de
 * mois en silence. Un second moteur de revenu ferait précisément ce que ce
 * refus interdit.
 *
 * Le prévisionnel par horizon (`ForecastHorizonsService`, #2425, servi à
 * `/pilotage`) porte déjà les deux nombres, sur SON horizon nommé (`month`) :
 * - `scenarios.downside` = le carnet signé MOINS ce qui est déclaré bloqué —
 *   c'est très exactement le revenu sécurisé même dans le pire cas déclaré.
 * - `decisions.unblockMission` = le carnet dont le renouvellement est
 *   justement déclaré bloqué — le revenu qui, précisément, est à risque.
 *
 * Ces deux dérivations LISENT ce prévisionnel, elles ne le recalculent pas
 * (GA-26). Le cockpit les nomme et les affiche là où le retour #2408 les
 * demande ; `/pilotage` continue de les porter dans leur forme détaillée
 * (scénarios, décisions) — deux FORMES différentes, jamais le même
 * chiffre recomposé une seconde fois.
 *
 * `undefined` = non mesuré (aucun prévisionnel chargé : `finance:read`
 * absent, requête en cours ou en échec). `null` = mesuré, sans ligne
 * chiffrable cette fenêtre — jamais un « 0 € » deviné (même convention que
 * `Amounts`, `FinanceForecastHorizons.tsx`).
 */
export function securedMonthlyRevenue(forecast: HorizonForecast | undefined): Money[] | null | undefined {
  // #4193 — la dérivation vit désormais côté contrat (`GET /crm-counters` la sert) ;
  // ce wrapper n'est plus lu que par ses tests.
  return securedMonthlyRevenueOf(forecast)
}

export function atRiskMonthlyRevenue(forecast: HorizonForecast | undefined): Money[] | null | undefined {
  if (!forecast) return undefined
  return forecast.decisions.find(entry => entry.decision === 'unblockMission')?.amounts ?? null
}
