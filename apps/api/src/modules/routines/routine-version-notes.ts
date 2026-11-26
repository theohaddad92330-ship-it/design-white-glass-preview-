import type { RoutineDefinition, RoutineKey, RoutineVersionNote } from '@bellum/contracts'

/**
 * #2916 (#2399.6/.7) — ce qui a changé à chaque montée de version du
 * catalogue. Dans le CODE, relu en revue avec le catalogue : un `version`
 * qui avance sans note ici fait échouer `routine-version-notes.spec.ts`.
 *
 * Une note décrit un changement RÉEL, livré — jamais un contenu de version
 * imaginé pour remplir l'écran.
 */
/**
 * #2916 (#2399.7) — 38 routines sont passées en v2 pour UN changement réel et
 * visible : leur fiche NOMME désormais sa condition d'arrêt (#2843, `20886eb43`),
 * qui n'était pas renseignée en v1. Le comportement de la routine, lui, ne
 * change pas : la note le dit.
 */
const STOP_CONDITION_NOTE: RoutineVersionNote = {
  version: 2,
  changes: {
    fr: 'La fiche nomme maintenant sa condition d’arrêt : ce qui fait qu’elle cesse de se déclencher ou de signaler un élément (avant : non renseignée).',
    en: 'The card now names its stop condition: what makes it stop firing or flagging an item (before: not stated).',
  },
  migration: {
    fr: 'Rien à refaire : ta configuration est conservée et la routine se comporte exactement comme avant.',
    en: 'Nothing to redo: your configuration is kept and the routine behaves exactly as before.',
  },
}

const STOP_CONDITION_KEYS: readonly RoutineKey[] = [
  'daily_briefing',
  'meeting_prep',
  'positive_replies',
  'agenda_conflicts',
  'empty_pipeline_alert',
  'weekly_recap',
  'weekly_forecast',
  'mission_ending',
  'crm_followups',
  'stalled_projects',
  'stale_account_plans',
  'needs_without_shortlist',
  'parked_account_signal',
  'contact_job_change',
  'cv_folder_watch',
  'territory_watch',
  'referencing_window',
  'meeting_checklist',
  'meeting_followup',
  'meeting_cancelled',
  'tender_watch',
  'contract_watch',
  'invoice_watch',
  'stalled_proposals',
  'crm_duplicates',
  'cv_intake',
  'monday_kickstart',
  'crm_hygiene',
  'quarterly_review',
  'timesheet_chase',
  'invoice_readiness',
  'margin_alert',
  'connector_health',
  'evening_closure_prompt',
  'end_of_week_closure_prompt',
  'pre_manager_review_closure_prompt',
  'sequence_completed_crm_update',
  'dormant_pool_resurface',
]

export const ROUTINE_VERSION_NOTES: Partial<Record<RoutineKey, readonly RoutineVersionNote[]>> = {
  ...Object.fromEntries(STOP_CONDITION_KEYS.map(key => [key, [STOP_CONDITION_NOTE]])),
  mission_ending: [
    STOP_CONDITION_NOTE,
    {
      version: 3,
      changes: {
        fr: 'Les fins de mission se lisent en cascade T-45, T-30, T-15 : la notification nomme les paliers (avant : un seuil unique de trente jours, la même alerte à J-29 et à J-3).',
        en: 'Mission endings are read as a T-45, T-30, T-15 cascade: the notification names the stages (before: a single thirty-day threshold, the same alert at D-29 and D-3).',
      },
      migration: {
        fr: 'Rien à refaire : ta configuration est conservée ; tu verras en plus les missions entre trente et quarante-cinq jours de leur fin.',
        en: 'Nothing to redo: your configuration is kept; you will also see missions between thirty and forty-five days from their end.',
      },
    },
  ],
  no_reply_follow_up: [
    {
      version: 2,
      changes: {
        fr: 'Le nombre de destinataires relancés par passage est réglable, de 1 à 5 (avant : toujours un seul brouillon).',
        en: 'The number of recipients followed up per run is adjustable, from 1 to 5 (before: always a single draft).',
      },
      // #2916.7 — le diff du champ modifié, tel que le réglage le montrait avant et le montre maintenant.
      fieldChanges: [
        {
          field: 'maxItemsPerRun',
          before: { fr: 'Un seul brouillon par passage', en: 'A single draft per run' },
          after: { fr: 'De 1 à 5 relances par passage', en: 'From 1 to 5 follow-ups per run' },
        },
      ],
      migration: {
        fr: 'Rien à refaire : ta configuration est conservée et la routine continue de préparer un seul brouillon tant que tu ne changes pas ce réglage.',
        en: 'Nothing to redo: your configuration is kept and the routine keeps preparing a single draft until you change this setting.',
      },
    },
  ],
}

/**
 * Les notes des versions POSTÉRIEURES à `seenVersion`, de la plus ancienne à la plus récente.
 *
 * #2916.7 — `definition` (la fiche courante) permet d'écrire la NOUVELLE valeur de la condition d'arrêt dans
 * le diff : elle n'était pas renseignée en v1 (`before: null`). Une fiche qui ne la nomme toujours pas n'émet
 * aucune ligne — un champ sans valeur ni avant ni après n'est pas un changement.
 */
export function routineVersionNotesSince(
  key: RoutineKey,
  seenVersion: number,
  definition?: Pick<RoutineDefinition, 'stopCondition'>,
): RoutineVersionNote[] {
  return (ROUTINE_VERSION_NOTES[key] ?? [])
    .filter(note => note.version > seenVersion)
    .sort((a, b) => a.version - b.version)
    .map(note =>
      note === STOP_CONDITION_NOTE
        ? {
            ...note,
            fieldChanges: definition?.stopCondition
              ? [{ field: 'stopCondition' as const, before: null, after: definition.stopCondition }]
              : [],
          }
        : note,
    )
}
