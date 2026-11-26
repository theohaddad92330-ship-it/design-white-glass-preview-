import type { SubStep } from './types'
import { choice } from './types'
import { hasNoCommercialHistory } from './maturite'

/**
 * Sous-étape `sante-activite` du stage `company_info` — lot L15 (#2034).
 *
 * Trois faits déclaratifs sur la clientèle actuelle : le nombre de clients
 * actifs (bandes, jamais un compte exact), la récurrence du chiffre
 * d'affaires, et la dépendance à un client. `client_concentration_risk` porte
 * une option « Je ne sais pas encore » explicite — une réponse honnête de
 * l'utilisateur, jamais une valeur qu'on invente à sa place.
 *
 * #2548.1 — les trois questions supposent une clientèle : `allowUnknown`
 * n'aurait rien réglé (l'inconnue n'est pas « je ne sais pas », c'est
 * « ça n'existe pas encore »). `hasNoCommercialHistory` (`maturite.ts`) les
 * retire donc entièrement pour une activité en création — Ludovic (call bêta
 * 17/09) n'a ni client, ni chiffre d'affaires, ni concentration à décrire.
 */
export const santeActiviteStep: SubStep = {
  slug: 'sante-activite',
  questions: [
    {
      key: 'active_clients_band',
      kind: 'single',
      label: 'questions.activeClientsBand.label',
      choices: choice(
        'Aucun client actif pour le moment',
        '1 à 5 clients actifs',
        '6 à 15 clients actifs',
        '16 à 50 clients actifs',
        'Plus de 50 clients actifs',
      ),
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'revenue_recurrence',
      kind: 'single',
      label: 'questions.revenueRecurrence.label',
      choices: choice(
        'Essentiellement du contrat récurrent (régie longue, forfait reconduit)',
        'Un mix de récurrent et de one-shot',
        'Essentiellement du one-shot (mission ponctuelle, projet unique)',
      ),
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_concentration_risk',
      kind: 'single',
      label: 'questions.clientConcentrationRisk.label',
      choices: choice(
        "Un client représente plus de la moitié du chiffre d'affaires",
        'Un client pèse fort mais reste minoritaire',
        "Le chiffre d'affaires est réparti, aucun client dominant",
        'Je ne sais pas encore',
      ),
      when: answers => !hasNoCommercialHistory(answers),
    },
  ],
}
