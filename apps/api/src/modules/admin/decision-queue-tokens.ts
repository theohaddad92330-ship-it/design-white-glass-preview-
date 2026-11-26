import type { FeedbackFacts } from './decision-queue'

/**
 * Ce que `AdminModule` FOURNIT à la file de décision, sous forme de jetons
 * (#1647 — même gabarit que `client-health-tokens.ts` (#1652) et
 * `business-metrics/module-tokens.ts` (#1645)).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES JETONS PLUTÔT QUE DES SERVICES INJECTÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-07 (`module-boundaries.spec.ts`) est un CLIQUET, et il est AU PLAFOND :
 * 253 imports service → service pour un plafond de 254, et **124 fichiers pour
 * un plafond de 124**. Un fichier NEUF qui importerait `CreditsService` ou
 * `FeedbackService` ferait tomber la garde sur son SECOND compteur quoi qu'il
 * arrive au premier — le relever demanderait un arbitrage écrit, et il n'y a
 * rien à arbitrer ici.
 *
 * La composition se fait donc dans `admin.module.ts`, la couche que GA-07
 * exempte précisément parce que c'est celle prévue pour ça, et le service ne
 * connaît que la FORME de ce qu'il reçoit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUI N'EST PAS RECOPIÉ ICI, ET NE DOIT JAMAIS L'ÊTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ni le calcul de la capacité de crédits, ni l'état d'un retour. Les deux
 * ARRIVENT par ces jetons, calculés par leur propriétaire. Une capacité
 * recopiée oublierait le report (`rollover_credits`), exactement la faute que
 * `maybeNotifyCreditLow` a déjà payée ; un état de retour deviné ferait
 * s'allumer la file entière un jour où le suivi ne répond pas.
 */

/** Le jeton de la capacité de crédits. Une chaîne, pour rester lisible dans une
 *  erreur Nest. */
export const DECISION_QUEUE_CREDIT_CAPACITY = 'DECISION_QUEUE_CREDIT_CAPACITY'

/** Le sous-ensemble d'une ligne d'abonnement dont dépend le PLAFOND du cycle. */
interface CreditPoolFacts {
  accounts_limit?: number | null
  topup_analyses?: number | null
  rollover_credits?: number | null
  rollover_expires_at?: Date | string | null
}

/**
 * `creditCapacity` telle que le module `credits` la définit — quota du palier
 * + recharge ponctuelle + report ENCORE VALIDE.
 *
 * C'est LE plafond qui refuse une analyse. La file dit « à plus de 90 % de son
 * enveloppe » ; si son enveloppe n'était pas celle qui refuse, elle alerterait
 * sur un plafond que le client ne rencontre jamais.
 */
export type CreditCapacityReader = (row: CreditPoolFacts | null) => number

/** Le jeton de l'état des retours bêta. */
export const DECISION_QUEUE_FEEDBACK_TRACKING = 'DECISION_QUEUE_FEEDBACK_TRACKING'

/**
 * Les retours récents et l'état de leur suivi.
 *
 * ⚠️ `null` — pour le tout, ou pour le champ `treated` d'une ligne — signifie
 * « je n'ai pas pu regarder », jamais « rien n'a été traité ». C'est la même
 * distinction que `issuesAvailable` porte déjà côté back-office, et c'est elle
 * qui empêche `feedback_unanswered` de s'allumer entière un jour de panne.
 */
export type FeedbackTrackingReader = () => Promise<FeedbackFacts[] | null>
