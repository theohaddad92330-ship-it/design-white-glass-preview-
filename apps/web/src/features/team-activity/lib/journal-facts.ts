/**
 * Théo D team-activite.R1 — « Journal d'activité » : un fil de FAITS commerciaux et de décisions
 * partagées. Pas de surveillance de présence (Louis 22/10, doctrine « l'analytique mesure le PRODUIT,
 * jamais la personne »). Ce fichier est le seul à dire quels types d'action entrent dans le journal.
 */

export type JournalFamily = 'research' | 'actions' | 'commercial'

export const JOURNAL_FAMILY_KEYS: readonly JournalFamily[] = ['research', 'actions', 'commercial']

/** Les types d'action qui sont des faits métier, rangés par famille de filtre. */
export const JOURNAL_FAMILIES: Readonly<Record<JournalFamily, readonly string[]>> = {
  research: ['analysis_started', 'analysis_completed', 'need_play_generated', 'plan_action_enrichment_requested'],
  actions: [
    'plan_action_added',
    'plan_action_completed',
    'plan_action_uncompleted',
    'plan_action_skipped',
    'plan_action_rescheduled',
    'plan_action_assigned',
    'plan_action_call_prepared',
    'crm_task_created',
  ],
  commercial: [
    'message_sent',
    'message_copied',
    'response_received',
    'rdv_obtained',
    'deal_signed',
    'plan_action_message_generated',
    'plan_action_message_copied',
    'plan_action_message_sent',
    'plan_action_call_logged',
    'commercial_status_changed',
  ],
}

/** Les types qui ne sont PAS un fait du journal, avec la raison — jamais écartés en silence. */
export const NOT_A_JOURNAL_FACT: Readonly<Record<string, string>> = {
  plan_action_opened: 'consultation : ouvrir une action n’est pas un fait métier',
  plan_action_contact_opened: 'consultation : ouvrir un contact n’est pas un fait métier',
  plan_action_linkedin_opened: 'consultation : ouvrir un profil n’est pas un fait métier',
  export: 'sortie de données : elle se lit dans le journal d’administration',
  account_score_changed: 'événement système, pas un geste de l’équipe',
  profile_updated: 'réglage de l’espace : il se lit dans le journal d’administration',
}

/** Un type « vu / ouvert / consulté » est une consultation : le journal n'en porte aucune. */
export function isConsultationType(type: string): boolean {
  return /(^|_)(opened|viewed|view|consulted|seen|read|visited)(_|$)/.test(type)
}

export function journalFamilyOf(type: string): JournalFamily | null {
  if (isConsultationType(type)) return null
  for (const family of JOURNAL_FAMILY_KEYS) {
    if (JOURNAL_FAMILIES[family].includes(type)) return family
  }
  return null
}
