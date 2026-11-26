import {
  AUTOMATION_RULE_LIMITS,
  AUTOMATION_SIGNAL_SOURCES,
  signalPlaybook,
  type AutomationRuleView,
  type AutomationSignal,
  type OutreachPlaybookKey,
  type SaveAutomationRuleDraftRequest,
} from '@bellum/contracts'
import type { RoutineTool } from '@/features/routines/routineFamilies'

/** Ce que la règle prépare, en un seul choix (l'écran n'expose pas la paire `action_kind` + `prepared_action`). */
export type RuleResult = 'enroll_sequence' | 'email_to_review' | 'call_to_make'

/**
 * Théo C automations-editeur — le formulaire « Régler », en chaînes (ce que les champs tiennent). Tout vient de la
 * règle ou de son brouillon ; rien n'est inventé : un nom absent reste vide, un plafond absent reste vide.
 */
export type RuleForm = {
  name: string
  signal: AutomationSignal
  result: RuleResult
  playbook: OutreachPlaybookKey | null
  inactiveDays: string
  creditCap: string
}

/** Le délai d'un modèle « compte inactif » (`AUTOMATION_TEMPLATES`) : ce qu'on propose quand rien n'est saisi. */
const DEFAULT_INACTIVE_DAYS = 60

export function formOfRule(rule: AutomationRuleView): RuleForm {
  // Le brouillon prime : c'est lui que l'éditeur ouvre. La règle qui tourne n'est jamais modifiée avant son activation.
  const source = rule.draft ?? { ...rule, name: rule.name ?? null }
  const result: RuleResult =
    source.action_kind === 'enroll_sequence' ? 'enroll_sequence' : (source.prepared_action ?? 'email_to_review')
  return {
    name: source.name ?? '',
    signal: source.signal,
    result,
    playbook: source.playbook_key,
    inactiveDays: source.inactive_days === null ? '' : String(source.inactive_days),
    creditCap: source.credit_cap === null ? '' : String(source.credit_cap),
  }
}

export function requestOfForm(form: RuleForm): SaveAutomationRuleDraftRequest {
  const carriesDays =
    AUTOMATION_SIGNAL_SOURCES[form.signal].type === 'reader' && 'parameter' in AUTOMATION_SIGNAL_SOURCES[form.signal]
  const days = Number(form.inactiveDays)
  const enroll = form.result === 'enroll_sequence'
  const cap = form.creditCap.trim()
  return {
    name: form.name.trim() === '' ? null : form.name.trim(),
    signal: form.signal,
    action_kind: enroll ? 'enroll_sequence' : 'prepare_action',
    playbook_key: enroll ? (form.playbook ?? signalPlaybook(form.signal)) : null,
    prepared_action: enroll ? null : form.result === 'call_to_make' ? 'call_to_make' : 'email_to_review',
    inactive_days: carriesDays ? (Number.isInteger(days) && days > 0 ? days : DEFAULT_INACTIVE_DAYS) : null,
    credit_cap: cap === '' ? null : Number(cap),
  }
}

/** Les bornes du délai, pour le champ : une seule source (`AUTOMATION_RULE_LIMITS`). */
export const INACTIVE_DAYS_BOUNDS = {
  min: AUTOMATION_RULE_LIMITS.inactiveDaysMin,
  max: AUTOMATION_RULE_LIMITS.inactiveDaysMax,
}

/**
 * Théo C automations-editeur.N5 — « Outils requis » : ce que la règle lit, ceux de l'espace du client. Une fin de mission
 * se lit dans l'ATS ; un e-mail à relire demande la messagerie ; les autres signaux se lisent dans l'espace.
 */
export function ruleToolsOf(signal: AutomationSignal, result: RuleResult): RoutineTool[] {
  const tools: RoutineTool[] = []
  if (result === 'email_to_review') tools.push('mailbox')
  tools.push(signal === 'mission_end' ? 'ats' : 'workspace')
  return tools
}
