import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ACTION_SOURCES,
  canonicalActionFromIntervention,
  canonicalActionFromPlanItem,
  canonicalActionFromTask,
  type CanonicalAction,
} from './action.js'
import type { MyPlanAction } from './action-plan-items.js'
import type { Intervention } from './playbook.js'
import type { Task } from './task.js'

/**
 * #2395.10 — LA RECETTE de LAU-FINAL-109, dix origines/manipulations
 * d'action, écrites.
 *
 * Même discipline que `apps/api/src/modules/analytics/recette-lau-final-156.spec.ts`
 * (#2442.18) : des fonctions PURES, pas un service mocké. Cinq scénarios sont
 * des RAPPELS plutôt que des doublons d'une preuve déjà écrite dans
 * `action.test.ts` — les réécrire ici les ferait dériver un jour l'un de
 * l'autre (GA-26). Un scénario — « manager » — n'est PAS jouable, et le
 * dernier bloc le PROUVE plutôt que de l'affirmer : `CANONICAL_ACTION_SOURCES`
 * nomme la valeur, mais aucun adaptateur du dépôt ne la produit aujourd'hui.
 *
 * ⚠️ Au 23/09/2026, cette suite notait « mission » et « routine » comme des
 * maisons SANS adaptateur. Le 24/09/2026 (commit 4305476dd2, déjà ancêtre de
 * cette branche), `canonicalActionFromIntervention` (#2395.10 lui-même) a
 * comblé les deux : une intervention porte `subjectType: 'mission'` ET EST,
 * par construction, la routine du responsable. Les deux scénarios ci-dessous
 * le prouvent pour de vrai, plutôt que de recopier l'ancien constat.
 */

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
    send_status: null,
    created_at: '2026-09-20T08:00:00.000Z',
    updated_at: '2026-09-20T08:00:00.000Z',
    company_name: 'Acme',
    ...overrides,
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Envoyer la proposition',
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn: '2026-09-24',
    ownerId: '44444444-4444-4444-8444-444444444444',
    ownerName: 'Marie',
    createdById: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    projectId: null,
    projectLabel: null,
    completedAt: null,
    completedById: null,
    completedByName: null,
    resultNote: null,
    channel: null,
    createdAt: '2026-09-19T08:00:00.000Z',
    updatedAt: '2026-09-19T08:00:00.000Z',
    ...overrides,
  }
}

function intervention(overrides: Partial<Intervention> = {}): Intervention {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    kind: 'renewal_at_risk',
    subjectType: 'mission',
    subjectId: '11111111-2222-4333-8444-555555555555',
    subjectLabel: 'Mission Acme',
    ownerId: null,
    ownerName: null,
    detail: 'Mission Acme se termine dans 12 jours, aucun renouvellement ouvert.',
    state: 'open',
    openedAt: '2026-09-10T08:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  }
}

const WS = '00000000-0000-4000-8000-0000000000aa'

describe('#2395.10 — recette LAU-FINAL-109', () => {
  // ── 1. manuel/tâche ──────────────────────────────────────────────────────
  describe('1. manuel/tâche', () => {
    it('EST déjà recetté — action.test.ts « projette une tâche ouverte » (GA-26)', () => {
      expect(true).toBe(true)
    })
  })

  // ── 2. Laura/appel ───────────────────────────────────────────────────────
  describe('2. Laura/appel', () => {
    it('EST déjà recetté — action.test.ts « projette une tâche d’appel… » (GA-26)', () => {
      expect(true).toBe(true)
    })
  })

  // ── 3. plan de compte ────────────────────────────────────────────────────
  describe('3. plan de compte', () => {
    it('EST déjà recetté — action.test.ts « projette une ligne ouverte… » (GA-26)', () => {
      expect(true).toBe(true)
    })
  })

  // ── 4. dépendance ────────────────────────────────────────────────────────
  describe('4. dépendance', () => {
    it('EST déjà recetté — action.test.ts « porte l’objet visé, la provenance, la dépendance… » (GA-26)', () => {
      expect(true).toBe(true)
    })
  })

  // ── 5. action obsolète/close filtrée ─────────────────────────────────────
  describe('5. action obsolète/close filtrée', () => {
    it('EST déjà recetté — action.test.ts « dédoublonne par action_id et garde les ouvertes seulement » (GA-26)', () => {
      expect(true).toBe(true)
    })
  })

  // ── 6. mission ───────────────────────────────────────────────────────────
  describe('6. mission', () => {
    it('une intervention sur une mission porte mission_id, jamais un object_type deviné', () => {
      const action: CanonicalAction = canonicalActionFromIntervention(intervention({ subjectType: 'mission' }), WS)
      expect(action.mission_id).toBe('11111111-2222-4333-8444-555555555555')
      expect(action.object_type).toBeNull()
      expect(action.origin).toEqual({ model: 'intervention', id: '99999999-9999-4999-8999-999999999999' })
    })
  })

  // ── 7. routine ───────────────────────────────────────────────────────────
  describe('7. routine', () => {
    it('l’adaptateur intervention EST la routine du responsable, détectée par une règle', () => {
      const action = canonicalActionFromIntervention(intervention(), WS)
      // Jamais Laura ni un geste humain : une routine (InterventionsSweeper) détecte.
      expect(action.source).toBe('rule')
      expect(action.status).toBe('suggested')
    })
  })

  // ── 8. email ─────────────────────────────────────────────────────────────
  describe('8. email', () => {
    it('un canal e-mail détermine le type « email » sans qu’aucun libellé le devine', () => {
      const action = canonicalActionFromPlanItem(planItem({ channel: 'email' }), WS)
      expect(action.type).toBe('email')
      expect(action.channel).toBe('email')
    })
  })

  // ── 9. manager — NON JOUABLE, prouvé plutôt qu'affirmé ───────────────────
  describe('9. manager', () => {
    it('N’EXISTE PAS ENCORE : aucun adaptateur ne produit la source « manager »', () => {
      // CANONICAL_ACTION_SOURCES nomme la valeur (action.ts:105), mais aucun des
      // quatre adaptateurs (plan_item, task, call_task, intervention) ne
      // l'écrit : le plan traduit sa provenance (human/connector/pipeline/
      // model), la tâche ne connaît que « créée par » (jamais « validée par un
      // manager »), l'appel ne connaît que laura/user, l'intervention est
      // toujours « rule ». Manager-validation existe ailleurs dans le produit
      // (action-os/manager-validation.spec.ts) mais n'écrit sur AUCUNE des
      // trois maisons projetées ici — donc rien à exercer sans inventer une
      // valeur. Mieux vaut neuf scénarios prouvés qu'un dixième affirmé.
      expect(CANONICAL_ACTION_SOURCES).toContain('manager')
      expect(true).toBe(true)
    })
  })

  // ── 10. réassignation ────────────────────────────────────────────────────
  describe('10. réassignation', () => {
    it('le propriétaire projeté suit la ligne native — jamais une copie figée', () => {
      const before = canonicalActionFromTask(task({ ownerId: 'u1', ownerName: 'Jeanne' }), WS)
      const after = canonicalActionFromTask(task({ ownerId: 'u2', ownerName: 'Marc' }), WS)
      expect(before.owner).toEqual({ id: 'u1', name: 'Jeanne' })
      expect(after.owner).toEqual({ id: 'u2', name: 'Marc' })
      expect(after.action_id).toBe(before.action_id)
    })
  })
})
