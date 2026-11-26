import {
  actionExecutionStatusSchema,
  canonicalActionFromPlanItem,
  NEXT_ACTIONS_MAX,
  nextActions,
} from '@bellum/contracts'
import type { ActionPlanItem, MyPlanAction } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { readSignalFreshness } from '../accounts/accounts.service'
import {
  cadencePatternForState,
  resolveCadenceScenario,
  resolveRelationshipEvidence,
} from '../contacts/cadence-templates'

/**
 * #2317.14 (épopée #2923, LAU-FINAL-058) — LA RECETTE, dix scénarios, écrits.
 *
 * L'épopée en énumère dix : compte froid · compte client · relation connue ·
 * aucune relation · action existante · changement de poste · signal périmé ·
 * plan sur dix jours · action payante · équipe multi-owner.
 *
 * Même discipline que `analytics/recette-lau-final-156.spec.ts` : des
 * fonctions PURES, pas un service mocké qui prouverait surtout que le mock
 * répond. DEUX scénarios sont des RAPPELS plutôt que des doublons d'une
 * preuve déjà écrite ailleurs (les réécrire ici les ferait dériver un jour
 * l'un de l'autre, GA-26) :
 *  - « action existante » (#5) est prouvé par
 *    `actions/action-plan-items.service.spec.ts` (#2317.11, « MET À JOUR le
 *    doublon de même scope quand il lui manque une info ») ;
 *  - « plan sur dix jours » (#8) est prouvé côté IA
 *    (`apps/ia/tests/test_temporal_grounding.py`,
 *    `test_2317_13_a_ten_day_plan_is_answered_directly_not_redirected`) —
 *    hors de portée d'un test TypeScript, jamais réécrit ici en double.
 */

const account = (over: Partial<AccountEntity> = {}): AccountEntity =>
  ({
    id: 'acc-1',
    commercial_status: 'inbox',
    raw_analysis: {},
    ...over,
  }) as AccountEntity

function planItem(overrides: Partial<MyPlanAction> = {}): MyPlanAction {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    account_id: '22222222-2222-4222-8222-222222222222',
    label: 'Rappeler le DSI',
    week_index: 0,
    step_index: 0,
    done: false,
    due_date: '2026-09-25',
    completed_at: null,
    execution_status: 'todo',
    snoozed_until: null,
    assigned_to: null,
    owner_name: null,
    expected_outcome: null,
    kpi: null,
    channel: null,
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
    source_recommendation: null,
    method_rule: null,
    external_execution_id: null,
    stop_condition: null,
    send_status: null,
    created_at: '2026-09-20T08:00:00.000Z',
    updated_at: '2026-09-20T08:00:00.000Z',
    company_name: 'Acme',
    ...overrides,
  }
}

const WS = '00000000-0000-4000-8000-0000000000aa'

describe('#2317.14 — recette LAU-FINAL-058 (épopée #2923)', () => {
  // ── 1. compte froid ────────────────────────────────────────────────────────
  describe('1. compte froid', () => {
    it('garde la séquence historique J+1/J+3/J+6/J+9, avec sa preuve (salesContext de l’analyse)', () => {
      // ⚠️ Trouvaille en écrivant ce scénario : `commercial_status: 'inbox'`
      // seul ne produit PAS de preuve (`resolveRelationshipEvidence` ne cite le
      // kanban QUE quand il mappe vers un état AUTRE que `froid` — la ligne
      // `mapped !== 'froid'`) : un compte froid par défaut kanban et un compte
      // sans relation connue (#4) rendent la MÊME chose, `evidence: []`. La
      // preuve d'un compte froid vient donc de l'analyse elle-même
      // (`salesContext.relationship`), pas du kanban.
      const scenario = resolveCadenceScenario(
        account({
          commercial_status: 'inbox',
          raw_analysis: {
            salesContext: { relationship: { state: 'froid', evidence: ['aucun contact déjà établi'] } },
          } as never,
        }),
      )
      expect(scenario.state).toBe('froid')
      expect(scenario.template).toBe('standard')
      expect(scenario.citation.evidence).toEqual(['aucun contact déjà établi'])
    })
  })

  // ── 2. compte client ───────────────────────────────────────────────────────
  describe('2. compte client', () => {
    it('bascule sur le patron d’expansion, pas la séquence de prospection froide', () => {
      const scenario = resolveCadenceScenario(account({ commercial_status: 'customer' }))
      expect(scenario.state).toBe('client_actif')
      expect(scenario.template).toBe('client_expansion')
      expect(scenario.template).not.toBe(resolveCadenceScenario(account({ commercial_status: 'inbox' })).template)
    })
  })

  // ── 3. relation connue ─────────────────────────────────────────────────────
  describe('3. relation connue', () => {
    it('nomme l’état `connu`, distinct de `froid`, même quand le patron résultant est le même', () => {
      const scenario = resolveCadenceScenario(account({ commercial_status: 'watching' }))
      expect(scenario.state).toBe('connu')
      expect(scenario.citation.evidence).toEqual(['kanban: watching'])
    })
  })

  // ── 4. aucune relation ─────────────────────────────────────────────────────
  describe('4. aucune relation', () => {
    it('retombe sur `froid` SANS preuve inventée — distinct du compte froid évidencé (#1)', () => {
      const evidence = resolveRelationshipEvidence(account({ commercial_status: '', raw_analysis: {} }))
      expect(evidence.state).toBe('froid')
      expect(evidence.evidence).toEqual([])
    })
  })

  // ── 5. action existante — RAPPEL, pas un doublon ──────────────────────────
  describe('5. action existante', () => {
    it('RAPPEL : la dédup avant création est prouvée par action-plan-items.service.spec.ts (#2317.11)', () => {
      // Voir "#2317.11 (épopée #2923) — MET À JOUR le doublon de même scope
      // quand il lui manque une info, jamais un second silence" et le témoin
      // "ne touche PAS un champ déjà renseigné du doublon" dans ce fichier —
      // la même preuve réécrite ICI dériverait un jour de l'originale (GA-26).
      expect(true).toBe(true)
    })
  })

  // ── 6. changement de poste ─────────────────────────────────────────────────
  describe('6. changement de poste', () => {
    it('marque l’action OBSOLÈTE — statut canonique terminal, jamais supprimée (#2317.12)', () => {
      expect(actionExecutionStatusSchema.parse('obsolete')).toBe('obsolete')
      const action = canonicalActionFromPlanItem(planItem({ execution_status: 'obsolete' }), WS)
      expect(action.status).toBe('obsolete')
      expect(action.native_status).toBe('obsolete')
    })
  })

  // ── 7. signal périmé ───────────────────────────────────────────────────────
  describe('7. signal périmé', () => {
    it('lit la fraîcheur ESTAMPÉE par l’IA sur le signal, jamais devinée', () => {
      expect(readSignalFreshness({ freshness: 'archive' })).toBe('archive')
      expect(readSignalFreshness({ freshness: 'current' })).toBe('current')
      // Un signal sans estampille n'est pas « frais » par défaut — absence NOMMÉE.
      expect(readSignalFreshness({})).toBeNull()
      expect(readSignalFreshness(null)).toBeNull()
    })
  })

  // ── 8. plan sur dix jours — RAPPEL, pas un doublon ────────────────────────
  describe('8. plan sur dix jours', () => {
    it('RAPPEL : prouvé côté IA (test_temporal_grounding.py, #2317.13), hors de portée d’un test TS', () => {
      expect(true).toBe(true)
    })
  })

  // ── 9. action payante ──────────────────────────────────────────────────────
  describe('9. action payante', () => {
    it('un coût MESURÉ voyage tel quel — `0` (gratuite) distinct de `null` (non mesuré)', () => {
      const paid = canonicalActionFromPlanItem(planItem({ cost_credits: 3 }), WS)
      expect(paid.cost_credits).toBe(3)
      const free = canonicalActionFromPlanItem(planItem({ cost_credits: 0 }), WS)
      expect(free.cost_credits).toBe(0)
      const unmeasured = canonicalActionFromPlanItem(planItem({ cost_credits: null }), WS)
      expect(unmeasured.cost_credits).toBeNull()
    })
  })

  // ── 10. équipe multi-owner ─────────────────────────────────────────────────
  describe('10. équipe multi-owner', () => {
    it('une petite équipe ne reçoit pas quinze actions — plafonnée à NEXT_ACTIONS_MAX (#2317.6/.7)', () => {
      const items: ActionPlanItem[] = Array.from({ length: 15 }, (_, i) =>
        planItem({ id: `${i}`, label: `Action ${i}` }),
      )
      expect(NEXT_ACTIONS_MAX).toBe(3)
      expect(nextActions(items)).toHaveLength(3)
    })
  })

  it('sait dire NON — la preuve `cadencePatternForState` distingue au moins deux patrons réels', () => {
    expect(cadencePatternForState('froid').template).not.toBe(cadencePatternForState('client_actif').template)
  })
})
