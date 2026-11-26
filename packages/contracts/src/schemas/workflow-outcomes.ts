import { z } from 'zod'

/**
 * Le catalogue d'ISSUES des huit motions commerciales — LEGACY-004.
 *
 * ## Ce que ce catalogue est, et ce qu'il n'est pas
 *
 * Il ne crée AUCUN second moteur : le paquet source le dit lui-même en tête de
 * son fichier — « à fusionner dans le catalogue Action OS existant ». Ce que le
 * dépôt avait déjà, ce sont les PAS d'un workflow (leur intention, leur capacité,
 * leur risque). Ce qui manquait est ce qu'un workflow peut PRODUIRE : ses issues
 * possibles, ses conditions d'arrêt, et ce qu'on fait quand il ne produit rien.
 *
 * ## Pourquoi une liste FERMÉE d'issues
 *
 * « 12 relances lancées » ne dit rien tant qu'on ne peut pas dire combien ont
 * abouti, combien se sont arrêtées sur un refus, et combien n'ont jamais eu de
 * réponse. Une issue libre devient dix formulations du même résultat, et plus
 * rien ne s'additionne. C'est le même raisonnement que la liste fermée des
 * motifs d'écart de l'import.
 *
 * ## Les conditions d'ARRÊT sont la moitié qui compte
 *
 * `do_not_call`, `confirmed_wrong_contact`, `relationship_invalid` : ce sont
 * elles qui empêchent une motion de continuer à écrire à quelqu'un qui a dit
 * non. Une motion sans condition d'arrêt est une motion qui insiste.
 *
 * ⚠️ **Aucun `fallback` n'est exécuté automatiquement.** Il NOMME ce qu'un
 * humain fait quand la motion n'aboutit pas — « mettre en file de recherche
 * manuelle », « élargir avec validation ». L'exécuter seul reviendrait à
 * transformer un échec en action non demandée.
 */

/** Les huit motions du corpus, dans son ordre. */
export const WORKFLOW_MOTIONS = [
  'cold_call_qualification',
  'open_account',
  'historical_relationship_reactivation',
  'reverse_prospecting',
  'push_profile',
  'sourcing',
  'mission_follow_up',
  'rank2_to_rank1',
] as const
export const workflowMotionSchema = z.enum(WORKFLOW_MOTIONS)
export type WorkflowMotion = (typeof WORKFLOW_MOTIONS)[number]

export type WorkflowOutcomeContract = {
  readonly motion: WorkflowMotion
  /** Ce qui met la motion en route. */
  readonly trigger: string
  /** Ce qu'elle a besoin de savoir avant de proposer quoi que ce soit. */
  readonly inputs: readonly string[]
  /** Ce qu'elle PRÉPARE — jamais ce qu'elle envoie seule. */
  readonly drafts: readonly string[]
  /** Le niveau d'automatisation minimal, dans le vocabulaire de l'Action OS. */
  readonly approval: string
  /** Les issues possibles, en liste fermée. */
  readonly outcomes: readonly string[]
  /**
   * Ce qui ARRÊTE la motion — vide quand rien ne l'arrête par soi-même.
   *
   * ⚠️ Une condition d'arrêt n'est PAS forcément une issue. `do_not_call` est un
   * fait porté par le CONTACT, pas le résultat d'un appel : il arrête la motion
   * avant même qu'elle compose le numéro. `relationship_invalid`, lui, est les
   * deux — c'est le résultat de la tentative ET la raison de ne pas recommencer.
   * Les confondre ferait chercher un arrêt dans la liste des résultats, où la
   * moitié n'y sera jamais.
   */
  readonly stop: readonly string[]
  /** Ce qu'un HUMAIN fait quand la motion n'aboutit pas. Jamais exécuté seul. */
  readonly fallback: string
}

export const WORKFLOW_OUTCOME_CATALOG: Readonly<Record<WorkflowMotion, WorkflowOutcomeContract>> = {
  cold_call_qualification: {
    motion: 'cold_call_qualification',
    trigger: 'user_selects_contact_or_due_call',
    inputs: ['contact', 'account_or_project_context', 'relationship', 'domain_context'],
    drafts: ['call_brief', '3_to_5_questions', 'objection_hints'],
    approval: 'n1_prepare',
    // #2377.3 — même liste, même ordre que `CALL_OUTCOMES` (`activity.ts`) :
    // un test compare les deux À PLAT (`activity.test.ts`).
    outcomes: [
      'connected_qualified',
      'connected_no_fit',
      'callback_scheduled',
      'voicemail',
      'wrong_contact',
      'no_answer',
      'orientation_given',
      'not_now',
      'interest',
      'need_detected',
      'need_confirmed',
      'meeting_booked',
      'refused',
      'opt_out',
      'email_requested',
      'document_requested',
      'partner_opportunity',
      'invalid_contact',
      'left_company',
      'other',
    ],
    stop: ['do_not_call', 'confirmed_wrong_contact'],
    fallback: 'create_manual_task',
  },
  open_account: {
    motion: 'open_account',
    trigger: 'account_selected_or_access_signal',
    inputs: ['account', 'entities_sites', 'offer_portfolio', 'access_evidence'],
    drafts: ['entry_perimeter', 'contact_path', 'first_motion'],
    approval: 'n1_prepare',
    outcomes: ['perimeter_validated', 'intro_found', 'first_contact_selected', 'account_no_go'],
    stop: [],
    fallback: 'manual_research_queue',
  },
  historical_relationship_reactivation: {
    motion: 'historical_relationship_reactivation',
    trigger: 'stale_relationship_or_legacy_activity_imported',
    inputs: ['activity_history', 'contact_identity', 'account_context'],
    drafts: ['reactivation_angle', 'draft_message', 'next_task'],
    approval: 'n2_user_approval',
    outcomes: ['thread_reopened', 'replied', 'no_response', 'relationship_invalid'],
    stop: ['relationship_invalid'],
    fallback: 'archive_or_verify',
  },
  reverse_prospecting: {
    motion: 'reverse_prospecting',
    trigger: 'talent_available_or_ending_mission',
    inputs: ['talent', 'availability', 'skills', 'mission_sector', 'territory'],
    drafts: ['matching_targets', 'partner_routes', 'profile_pushes'],
    approval: 'n1_prepare',
    outcomes: ['shortlist_created', 'profile_approved', 'profile_sent', 'no_match'],
    stop: [],
    fallback: 'requalify_talent_or_expand_search',
  },
  push_profile: {
    motion: 'push_profile',
    trigger: 'project_need_and_matching_candidate',
    inputs: ['project', 'talent', 'cv_version', 'recipient', 'evidence'],
    drafts: ['client_profile', 'message', 'submission_record'],
    approval: 'n2_user_approval',
    outcomes: ['sent_verified', 'client_feedback', 'interview', 'rejected', 'no_response'],
    stop: ['rejected'],
    fallback: 'save_draft_and_task',
  },
  sourcing: {
    motion: 'sourcing',
    trigger: 'project_without_sufficient_candidates',
    inputs: ['project_requirements', 'talent_pool', 'authorized_sources'],
    drafts: ['search_plan', 'candidate_list', 'verification_tasks'],
    approval: 'n1_prepare',
    outcomes: [
      'candidate_verified',
      'candidate_contacted',
      'candidate_interested',
      'candidate_unavailable',
      'no_result',
    ],
    stop: ['candidate_unavailable'],
    fallback: 'broaden_with_user_validation',
  },
  mission_follow_up: {
    motion: 'mission_follow_up',
    trigger: 'mission_milestone_or_end_date',
    inputs: ['mission', 'consultant', 'client_contacts', 'cra_status', 'feedback_history'],
    drafts: ['check_in', 'renewal_plan', 'rex_request', 'next_opportunity'],
    approval: 'n2_user_approval',
    outcomes: ['renewal_discussed', 'renewed', 'mission_end_confirmed', 'rex_obtained', 'new_need_detected'],
    stop: ['mission_end_confirmed'],
    fallback: 'manager_intervention',
  },
  rank2_to_rank1: {
    motion: 'rank2_to_rank1',
    trigger: 'partner_delivery_success_or_access_change',
    inputs: ['partner', 'client', 'mission_outcomes', 'procurement_evidence'],
    drafts: ['proof_pack', 'sponsor_path', 'direct_access_plan'],
    approval: 'n1_prepare',
    outcomes: ['direct_meeting', 'panel_process_identified', 'rank1_path_opened', 'remain_rank2'],
    stop: [],
    fallback: 'continue_partner_motion',
  },
}

/**
 * Les deux motions du corpus `02` que ce catalogue ne contractualise PAS.
 *
 * Le seed en garde dix et `04 §7` en liste dix ; le fichier d'issues n'en porte
 * que huit. `plan_de_compte` et `linkedin_outreach` n'ont donc **aucun contrat
 * d'issue** — et leur en inventer un serait pire que de le dire : une motion
 * dont les issues sont devinées produirait des statistiques que personne ne peut
 * relire. `linkedin_outreach` pose en plus la question du réseau professionnel,
 * dont le dépôt refuse toute automatisation.
 */
export const MOTIONS_WITHOUT_OUTCOME_CONTRACT: readonly string[] = ['plan_de_compte', 'linkedin_outreach']

/** Le contrat d'issue d'une motion, ou `null` quand elle n'en a pas. */
export function outcomeContractFor(motion: string): WorkflowOutcomeContract | null {
  return WORKFLOW_OUTCOME_CATALOG[motion as WorkflowMotion] ?? null
}

/**
 * Cette issue ARRÊTE-t-elle la motion ?
 *
 * Rend `false` pour une motion inconnue : on n'arrête pas une motion sur une
 * table qu'on n'a pas. Un arrêt inventé serait aussi coûteux qu'une insistance —
 * il ferait cesser une relance légitime sans que personne comprenne pourquoi.
 */
export function outcomeStopsMotion(motion: string, outcome: string): boolean {
  return outcomeContractFor(motion)?.stop.includes(outcome) ?? false
}

/* -------------------------------------------------------------------------- */
/*  L'autre moitié : arrêter la MOTION, ou arrêter la PERSONNE                 */
/* -------------------------------------------------------------------------- */

/**
 * Les arrêts qui portent sur la PERSONNE, pas seulement sur la motion.
 *
 * ## Pourquoi cette liste est plus courte que les conditions d'arrêt
 *
 * `mission_end_confirmed` arrête la motion de suivi de mission ; il ne dit
 * absolument pas « ne me contactez plus ». `candidate_unavailable` non plus —
 * la personne est prise ce trimestre, pas fâchée. Verser tous les `stop` du
 * catalogue dans un arrêt de personne ferait taire des relances parfaitement
 * légitimes, et le docblock d'{@link outcomeStopsMotion} le dit déjà : **un
 * arrêt inventé est aussi coûteux qu'une insistance**.
 *
 * Trois seulement franchissent la barre, et chacune pour la même raison — après
 * elle, écrire ou appeler cette personne est un incident :
 *  - `do_not_call` — elle a demandé qu'on cesse ;
 *  - `confirmed_wrong_contact` — ce n'est pas elle, et c'est VÉRIFIÉ (le
 *    `wrong_contact` non confirmé, lui, reste une issue d'appel) ;
 *  - `relationship_invalid` — la relation qu'on invoquait pour la relancer
 *    n'existe pas.
 *
 * ⚠️ `rejected` (une candidature refusée par un client) n'y est PAS : refuser un
 * profil n'est pas refuser un interlocuteur, et confondre les deux ferait
 * disparaître un décideur du jour où il dit non à une proposition.
 */
export const MOTION_CONTACT_STOP_OUTCOMES = ['do_not_call', 'confirmed_wrong_contact', 'relationship_invalid'] as const

/**
 * Les arrêts qui ne viennent d'AUCUNE motion — ils viennent du transport.
 *
 * Un désabonnement et un rebond ne sont l'issue de rien : personne ne les
 * « déclare » au terme d'une motion, ils arrivent du serveur de messagerie.
 * Ils arrêtent pourtant la même chose, et les ranger ailleurs aurait produit
 * deux listes d'arrêts que rien n'obligeait à rester d'accord.
 */
export const TRANSPORT_CONTACT_STOP_REASONS = ['unsubscribed', 'bounced'] as const

/**
 * Le vocabulaire COMPLET d'un arrêt de contact — ce que la contrainte SQL de
 * `contact_stops` porte, mot pour mot.
 *
 * ⚠️ L'ordre est celui de la contrainte : un enum ne perd jamais de valeur et
 * n'en insère jamais au milieu (GA-08). Les arrêts issus d'une motion d'abord,
 * ceux du transport ensuite.
 *
 * ⚠️ Écrit À PLAT, et non par étalement des deux listes ci-dessus. La garde
 * GA-12 compare les contraintes SQL aux énumérations du dépôt en LISANT le
 * texte : elle ne voit qu'un tableau de littéraux, et un `[...A, ...B]` lui est
 * invisible — la contrainte serait alors gardée par personne. Un test de ce
 * fichier vérifie que cette liste est exactement la somme des deux, dans cet
 * ordre : c'est ce qui empêche les deux écritures de diverger.
 */
export const CONTACT_STOP_REASONS = [
  'do_not_call',
  'confirmed_wrong_contact',
  'relationship_invalid',
  'unsubscribed',
  'bounced',
] as const
export type ContactStopReason = (typeof CONTACT_STOP_REASONS)[number]

/**
 * Cette issue, déclarée au terme de CETTE motion, arrête-t-elle la PERSONNE ?
 *
 * Rend la raison à inscrire, ou `null`. Les deux conditions sont exigées
 * ensemble, et c'est tout l'intérêt :
 *
 *  1. l'issue doit arrêter la motion — c'est {@link outcomeStopsMotion} qui le
 *    dit, et le catalogue est sa seule source ;
 *  2. l'issue doit être de celles qui portent sur la personne.
 *
 * Sans la première, `do_not_call` déclaré au terme d'une motion qui ne l'a
 * jamais prévu (`reverse_prospecting`, par exemple, dont la cible est un
 * consultant) poserait un arrêt sur un contact que personne n'a appelé. Sans la
 * seconde, `mission_end_confirmed` ferait taire un client dont la mission vient
 * simplement de se terminer.
 */
export function contactStopReasonFor(motion: string, outcome: string): ContactStopReason | null {
  if (!outcomeStopsMotion(motion, outcome)) return null
  const reason = MOTION_CONTACT_STOP_OUTCOMES.find(candidate => candidate === outcome)
  return reason ?? null
}

/**
 * `POST /contacts/:id/stop` — déclarer qu'une personne a demandé qu'on cesse.
 *
 * Deux formes acceptées, et une seule à la fois :
 *  - l'ISSUE d'une motion (`motion` + `outcome`), qui traverse
 *    {@link contactStopReasonFor} et n'a donc pas à être crue sur parole ;
 *  - la RAISON directe, pour ce qui ne vient d'aucune motion.
 *
 * `refine` plutôt que deux schémas : un corps qui porte les deux ferait choisir
 * au serveur laquelle des deux compte, et ce choix-là ne doit exister nulle part.
 */
export const recordContactStopSchema = z
  .object({
    motion: z.string().min(1).optional(),
    outcome: z.string().min(1).optional(),
    reason: z.enum(CONTACT_STOP_REASONS).optional(),
    note: z.string().max(500).optional(),
  })
  .strict()
  .refine(body => (body.motion != null) === (body.outcome != null), {
    message: 'Une issue de motion se déclare avec sa motion.',
  })
  .refine(body => body.outcome != null || body.reason != null, {
    message: "Un arrêt demande une issue de motion, ou une raison d'arrêt connue.",
  })
export type RecordContactStopRequest = z.infer<typeof recordContactStopSchema>

/** L'arrêt tel qu'un écran ou un client d'API le relit. */
export const contactStopSchema = z.object({
  reason: z.enum(CONTACT_STOP_REASONS),
  /** Le moment où le refus a été enregistré — un fait daté, jamais un booléen. */
  since: z.string(),
  /** La motion au terme de laquelle l'issue a été déclarée, quand il y en a une. */
  motion: z.string().nullable(),
})
export type ContactStop = z.infer<typeof contactStopSchema>
