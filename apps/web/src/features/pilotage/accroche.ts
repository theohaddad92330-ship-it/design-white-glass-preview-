import type { PilotageReport } from '@bellum/contracts'

/**
 * #2108.1 / #2108.21 → .25 / #2108.107 / #2208.29 / #2208.64 — L'ACCROCHE DU
 * PILOTAGE SUR LA PAGE D'ARRIVÉE (arbitrage de Louis, 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE GÉNÉRALE QUI A ÉTÉ POSÉE CE JOUR-LÀ
 * ─────────────────────────────────────────────────────────────────────────
 * **Une lecture agrégée vit sur UNE route ; la page d'arrivée n'en porte que
 * l'accroche.** #2108 demandait un persona Dirigeant sur `/dashboard`
 * (Revenu, Risque, Adoption, Cash, Décisions structurantes) pendant que #2208
 * demandait de lire le pilotage sur `/pilotage`. Les deux livrés, le même
 * contenu aurait existé deux fois, sous deux formes, et personne n'aurait su
 * lequel fait foi — exactement ce que GA-254 a déjà réglé pour l'ÉQUIPE, et
 * qui « se refait toujours, additivement ». La règle et sa garde vivent dans
 * `architecture/one-team-cockpit.test.ts`.
 *
 * #2108.1 (« conserver la même architecture quel que soit le rôle ») devient
 * une réponse : oui — ce qui change par rôle, ce sont les PORTES ouvertes, pas
 * la page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CES TROIS CHIFFRES-LÀ, ET PAS REVENU / RISQUE / ADOPTION
 * ─────────────────────────────────────────────────────────────────────────
 * `c18_manager` donne le critère : *chaque chiffre montré à un responsable doit
 * déboucher sur une INTERVENTION ; aucun retour sur investissement inventé ; un
 * indicateur sans dénominateur vaut `null`.* Et un sixième du dictionnaire
 * (13 des 64 indicateurs) est `measurable: false` — un cockpit qui les affiche
 * quand même écrit des zéros qui ne sont pas vrais.
 *
 * Les trois chiffres retenus sont donc l'état de la CHAÎNE, telle qu'elle est
 * déjà calculée et déjà gardée : combien de maillons décrochent (aller voir),
 * combien ne sont pas mesurés (brancher la donnée), combien tiennent. Ils
 * s'ADDITIONNENT jusqu'au total — c'est la discipline des seaux : « non
 * mesuré » est un seau NOMMÉ, jamais un zéro fondu dans les autres.
 *
 * Aucune probabilité, aucun montant projeté, aucun taux sans dénominateur.
 */

/** Les trois seaux de l'accroche, et leur total. Ils s'additionnent. */
type PilotageHeadline = {
  /** Maillons qui décrochent — l'intervention est « aller voir ». */
  alerting: number
  /** Maillons non mesurés — l'intervention est « brancher la donnée ». */
  unmeasured: number
  /** Maillons qui tiennent. */
  healthy: number
  /** `alerting + unmeasured + healthy`, par construction. */
  total: number
}

/**
 * L'accroche, ou `null` quand la chaîne n'a pas été lue.
 *
 * ⚠️ `null` et JAMAIS des zéros : « je n'ai pas lu » n'est pas « tout va
 * bien ». Trois zéros affichés pendant une lecture en vol diraient « aucune
 * alerte », ce qui est la pire phrase à rendre fausse sur une page d'arrivée.
 */
export function pilotageHeadline(report: PilotageReport | undefined | null): PilotageHeadline | null {
  if (!report || !Array.isArray(report.levels) || report.levels.length === 0) return null
  let alerting = 0
  let unmeasured = 0
  let healthy = 0
  for (const level of report.levels) {
    if (level.status === 'alerte') alerting += 1
    else if (level.status === 'non_mesure') unmeasured += 1
    else healthy += 1
  }
  return { alerting, unmeasured, healthy, total: report.levels.length }
}
