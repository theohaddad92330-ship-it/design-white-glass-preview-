import type { ActionPlanItem } from '@bellum/contracts'

/**
 * #2123 — une action du plan telle que `GET /plan-items` la rend, TOUS champs
 * « non mesurés » par défaut. Partagée par les tests de la lecture, du
 * composant et du tableau : un seul endroit dit à quoi ressemble une ligne vide.
 */
export const planItem = (over: Partial<ActionPlanItem> = {}): ActionPlanItem => ({
  id: 'i0',
  account_id: 'a1',
  label: 'Appeler le DSI',
  week_index: 0,
  step_index: 0,
  done: false,
  due_date: null,
  completed_at: null,
  execution_status: 'todo',
  snoozed_until: null,
  assigned_to: null,
  // #2123.46 — le responsable SAISI à la main, distinct d'`assigned_to` (un
  // membre de l'espace). `null` comme tout le reste de la ligne vide.
  owner_name: null,
  // #2123.46 — le résultat attendu et l'indicateur, `null` sur une ligne vide.
  expected_outcome: null,
  kpi: null,
  // #2153.57 — le résultat, DÉCLARATIF, distinct de l'attendu. `null` sur une ligne vide.
  result: null,
  target: null,
  reason: null,
  contact_id: null,
  depends_on_item_id: null,
  provenance: null,
  confidence: null,
  cost_credits: null,
  outcome: null,
  completion_mode: null,
  // #3287 (#3265.2) — les quatre champs de l'action canonique, `null` sur une ligne vide.
  source_recommendation: null,
  method_rule: null,
  external_execution_id: null,
  stop_condition: null,
  // #2715.1 — le statut d'envoi, `null` sur une ligne vide comme le reste.
  send_status: null,
  created_at: '2026-09-12T08:00:00.000Z',
  updated_at: '2026-09-12T08:00:00.000Z',
  ...over,
  // #2395.4 — explicite plutôt que laissé au spread : `over.channel` optionnel
  // se relirait `| undefined`, incompatible avec le champ requis de `ActionPlanItem`.
  channel: over.channel ?? null,
})
