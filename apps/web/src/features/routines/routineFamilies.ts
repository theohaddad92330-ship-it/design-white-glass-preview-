import type { RoutineKey, RoutineRequirement } from '@bellum/contracts'

/**
 * Théo C automations-bibliotheque.R1 — la bibliothèque se filtre par FAMILLE MÉTIER (les six de la maquette), plus par
 * cadence : on cherche « un suivi de rendez-vous », pas « une routine du lundi ».
 *
 * Un `Record<RoutineKey, …>` exhaustif : une routine ajoutée au catalogue sans famille ne compile pas — elle ne
 * disparaît donc jamais du filtre.
 */
export const ROUTINE_FAMILIES = [
  'organisation',
  'meetings',
  'prospecting',
  'missions_invoices',
  'talents_staffing',
  'watch',
] as const
export type RoutineFamily = (typeof ROUTINE_FAMILIES)[number]

export const ROUTINE_FAMILY_OF: Record<RoutineKey, RoutineFamily> = {
  daily_briefing: 'organisation',
  weekly_recap: 'organisation',
  weekly_forecast: 'organisation',
  monday_kickstart: 'organisation',
  evening_closure_prompt: 'organisation',
  end_of_week_closure_prompt: 'organisation',
  pre_manager_review_closure_prompt: 'organisation',
  quarterly_review: 'organisation',
  connector_health: 'organisation',
  crm_hygiene: 'organisation',
  crm_duplicates: 'organisation',

  meeting_prep: 'meetings',
  agenda_conflicts: 'meetings',
  meeting_checklist: 'meetings',
  meeting_followup: 'meetings',
  meeting_cancelled: 'meetings',
  meeting_reminder_t1: 'meetings',

  no_reply_follow_up: 'prospecting',
  positive_replies: 'prospecting',
  empty_pipeline_alert: 'prospecting',
  crm_followups: 'prospecting',
  stalled_projects: 'prospecting',
  stalled_proposals: 'prospecting',
  stale_account_plans: 'prospecting',
  accounts_without_next_action: 'prospecting',
  parked_account_signal: 'prospecting',
  contact_job_change: 'prospecting',
  not_now_revalidation: 'prospecting',
  sequence_completed_crm_update: 'prospecting',
  deal_close_date_soon: 'prospecting',
  deal_close_date_overdue: 'prospecting',
  deal_without_close_date: 'prospecting',
  won_deal_expansion: 'prospecting',
  lost_deal_revisit: 'prospecting',

  mission_ending: 'missions_invoices',
  timesheet_chase: 'missions_invoices',
  invoice_readiness: 'missions_invoices',
  margin_alert: 'missions_invoices',
  invoice_watch: 'missions_invoices',
  contract_watch: 'missions_invoices',
  mission_rex_reminder: 'missions_invoices',
  mission_checkin_j7_reminder: 'missions_invoices',
  mission_documents_pending: 'missions_invoices',
  mission_start_deadlines: 'missions_invoices',
  mission_renewal_to_engage: 'missions_invoices',
  team_mission_risks: 'missions_invoices',

  bench_alert: 'talents_staffing',
  needs_without_shortlist: 'talents_staffing',
  cv_folder_watch: 'talents_staffing',
  cv_intake: 'talents_staffing',
  availability_reconfirm: 'talents_staffing',
  dormant_pool_resurface: 'talents_staffing',
  incoming_need_matching: 'talents_staffing',
  interview_upcoming: 'talents_staffing',
  interview_feedback_missing: 'talents_staffing',
  blocked_needs: 'talents_staffing',
  consultant_repositioning: 'talents_staffing',

  territory_watch: 'watch',
  referencing_window: 'watch',
  tender_watch: 'watch',
}

/**
 * Théo C automations-bibliotheque.N1 — les outils qu'une routine LIT : ceux de l'espace du client (sa messagerie, son
 * agenda, son ATS, son CRM), jamais nos fournisseurs. Une routine qui ne lit que l'espace le dit.
 */
export const ROUTINE_TOOLS = ['mailbox', 'agenda', 'ats', 'crm', 'workspace'] as const
export type RoutineTool = (typeof ROUTINE_TOOLS)[number]

const TOOL_OF_REQUIREMENT: Record<RoutineRequirement, RoutineTool> = {
  mailbox_read: 'mailbox',
  agenda_read: 'agenda',
  ats: 'ats',
  crm: 'crm',
  accounts: 'workspace',
}

export function routineToolsOf(requires: readonly RoutineRequirement[]): RoutineTool[] {
  const tools = new Set<RoutineTool>(requires.map(requirement => TOOL_OF_REQUIREMENT[requirement]))
  if (tools.size === 0) tools.add('workspace')
  // L'ordre de la maquette : messagerie, agenda, ATS, CRM, puis l'espace.
  return ROUTINE_TOOLS.filter(tool => tools.has(tool))
}
