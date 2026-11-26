import { z } from 'zod'

/**
 * #2875 (#2402.9, dédoublonnage 27/09) — la table `canonical_trigger_events`
 * n'a qu'UN entrée : `buildTriggerEvent` (`./trigger-event.ts`) reste le seul
 * point de construction d'un déclencheur canonique (docblock de cette
 * fonction, #2402.2). Ce fichier ne pose PLUS son propre schéma d'événement —
 * il en posait un second, concurrent de {@link import('./trigger-event.js').triggerEventSchema},
 * ce que #2875 vient corriger. Il ne garde que la LISTE FERMÉE des `type` de
 * {@link import('./trigger-event.js').TriggerEvent} que CETTE table accepte
 * en persistance — élargie à chaque émetteur migré (GA-26 — le contrat,
 * jamais deux). Un membre neuf commence par la migration qui élargit le
 * CHECK SQL, jamais par le code qui l'écrit (GA-11/12).
 *
 * #2402.1 (vague F/G 27/09) — les quatre émetteurs restants migrent dans ce
 * lot (migration `1796322060000-CanonicalTriggerEventsWidenKinds.ts`) :
 *  - les treize natures d'`intervention-rules.ts`, déjà construites en
 *    `TriggerEvent` par `interventions.sweeper.ts` (`toTriggerEvent`) mais
 *    jamais PERSISTÉES faute d'appel à `TriggerRegistryService.record` —
 *    l'appel manquait, pas la construction ;
 *  - `credit_low` (`credits.service.ts`, `maybeNotifyCreditLow`) ;
 *  - `ao_publie` (le signal BOAMP de `discover_signals.py`, persisté depuis
 *    son appelant réel côté API — `IaProxyController.discoverSignals` — qui
 *    est seul à connaître l'espace ET le compte suivi que le signal concerne ;
 *    voir le docblock de `recordAoPublieTriggers`) ;
 *  - les trois routines Delivery (`timesheet_chase`, `invoice_readiness_routine`,
 *    `margin_alert`, `DeliveryRoutinesService`).
 */
export const canonicalTriggerKindValues = [
  'duplicate_pair_detected',
  'submission_stalled',
  'renewal_at_risk',
  'invoicing_blocked',
  'account_untouched',
  'rep_inactive',
  'credits_exhausted',
  'account_no_next_action',
  'project_no_decision',
  'need_without_shortlist',
  'timesheet_missing',
  'payment_overdue',
  'mission_without_end_date',
  'staffing_collision',
  'credit_low',
  'ao_publie',
  'timesheet_chase',
  'invoice_readiness_routine',
  'margin_alert',
  // #2875/#2402.3 (lot V11, 28/09) — le sixième émetteur migré :
  // `MailboxService.reconcileReplySequences` (une réponse classée `positive`).
  // Migration `1796342400000-CanonicalTriggerEventsWidenKindsReponsePositive.ts`.
  'reponse_positive',
  // #2875/#2402.1/#2402.3 (lot R03, 29/09) — le septième émetteur migré :
  // `WatchlistRefreshWorker` (un signal RÉELLEMENT neuf après un rafraîchissement
  // de veille, la même comparaison avant/après qui déclenche déjà `new_signal`
  // dans `discover_alert_events` — jamais un second calcul).
  // Migration `1796363217481-CanonicalTriggerEventsWidenKindsSignalNouveau.ts`.
  'signal_nouveau',
  // #2875/#2402.1/#2402.3 (lot R03, 29/09) — le huitième émetteur migré :
  // `DiscoverAlertEventSweeper` construit AUSSI un `TriggerEvent` canonique sur
  // un `new_confirmed_need` RÉELLEMENT consigné (jamais un doublon) — la MÊME
  // ligne `project_needs` passée au statut `qualified` que l'événement Découvrir,
  // jamais un second calcul.
  // Migration `1796363218693-CanonicalTriggerEventsWidenKindsBesoinEntrant.ts`.
  'besoin_entrant',
  // #2875/#2402.3 (lot « reste », 29/09) — le neuvième émetteur migré :
  // `DiscoverAlertEventSweeper.sweepDeadlineAo` (besoin d'appel d'offres ouvert
  // dont `deadline_at` tombe sous 7 jours). Migration
  // `20260929134523-CanonicalTriggerEventsWidenKindsDeadlineAo.ts`.
  'deadline_ao',
  // #2875/#2402.3 (lot P06, 30/09) — le dixième émetteur migré : la MÉMOIRE de
  // transition `contact_decision_role_history` (trigger SQL sur
  // `contacts.decision_role`), balayée par `DiscoverAlertEventSweeper`.
  // Migration `1796413203817-CanonicalTriggerEventsWidenKindsChangementDecideur.ts`.
  'changement_decideur',
  // #2875/#2402.3 (lot X54, 02/10) — le onzième émetteur migré : un fait d'accès
  // PAR ESPACE (`access_facts`, kind `mode`, valeur `direct_reference`) — le
  // compte est référencé en direct. Remplace la piste écartée (table partagée du
  // marché sans `workspace_id`). Migration
  // `1796424812345-CanonicalTriggerEventsWidenKindsReferencementDetecte.ts`.
  'referencement_detecte',
  // #3918 (lot Y12, 08/10/2026) — le douzième émetteur migré :
  // `CrmDealSignalsSweeper` (apps/api/src/modules/crm/crm-deal-signals.sweeper.ts),
  // sur les règles pures de `crm-deal-signal-rules.ts` appliquées au cache
  // `crm_deal_facts` — une affaire perdue, dormante, ou gagnée depuis le cycle
  // de renouvellement connu.
  'affaire_perdue',
  'affaire_dormante',
  'affaire_renouvellement',
  // #3918.2 (lot M01, 09/10/2026) — le treizième émetteur migré :
  // `RoutineExecutors.contactJobChange` (routine `contact_job_change`), sur le
  // détecteur réel `CrmRoutinesService.contactsWhoMayHaveMoved` — un contact
  // connu dont l'employeur déclaré ne correspond plus au compte suivi.
  // Migration `1796437900102-CanonicalTriggerEventsWidenKindsContactJobChange.ts`.
  'contact_changement_poste',
] as const
export type CanonicalTriggerKind = (typeof canonicalTriggerKindValues)[number]
export const canonicalTriggerKindSchema = z.enum(canonicalTriggerKindValues)

/** `TriggerRegistryService.record` délègue à ceci pour savoir si le
 *  `TriggerEvent` qu'on lui passe (construit par `buildTriggerEvent`, jamais
 *  par lui) entre dans le CHECK SQL de `canonical_trigger_events` — sinon il
 *  ne persiste rien (best-effort, l'émetteur n'est pas encore migré ici). */
export function isCanonicalTriggerKind(type: string): type is CanonicalTriggerKind {
  return (canonicalTriggerKindValues as readonly string[]).includes(type)
}
