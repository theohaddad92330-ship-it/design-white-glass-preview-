import { describe, expect, it } from 'vitest'
import type { BriefingAction, Task } from '@bellum/contracts'
import { briefingActionHasOpenTask, briefingActionHeadline, briefingActionTaskTarget } from './action-task-transform'

/**
 * #2105.53 — LA GARDE DE DÉDUP.
 *
 * `BriefingAction` (les priorités du jour) et `Task` (la liste de tâches)
 * sont deux entités séparées : rien n'empêchait la même chose d'apparaître
 * deux fois, une carte de priorité ET une tâche portant le même sujet. Le
 * rapprochement se fait sur ce qu'une tâche transformée depuis une carte
 * PORTE réellement (le même intitulé, le même objet), jamais sur l'id de la
 * carte — recalculée chaque matin, elle n'a pas d'identité stable en base.
 */

function action(partial: Partial<BriefingAction> & Pick<BriefingAction, 'id'>): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: '/mailbox?intent=no_reply&thread=t1',
    kind: 'follow_up',
    priority: 4,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...partial,
  }
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn: '2026-08-20',
    source: 'manual',
    type: 'personal',
    relatedActionRunId: null,
    sourceLabelKey: null,
    ownerId: null,
    ownerName: null,
    createdById: null,
    createdByName: null,
    expectedResult: null,
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
    objective: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...partial,
  }
}

const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key)

describe('briefingActionHeadline — un seul calcul du libellé (GA-26)', () => {
  it('lit le libellé du FAIT quand il existe', () => {
    const a = action({
      id: 'a1',
      fact: {
        labelKey: 'briefing.fact.x',
        labelVars: { n: 1 },
        provenance: { source: 'connector', capability: 'mailbox', observedAt: null },
      },
    })
    expect(briefingActionHeadline(a, t)).toBe('fact.x:{"n":1}')
  })

  it('retombe sur le libellé de la carte quand il n’y a pas de fait', () => {
    const a = action({ id: 'a1', labelKey: 'briefing.actions.followUp', labelVars: { x: 1 } })
    expect(briefingActionHeadline(a, t)).toBe('actions.followUp:{"x":1}')
  })
})

describe('briefingActionTaskTarget — l’objet que la tâche transformée doit porter', () => {
  it('un objet compte devient accountId', () => {
    expect(
      briefingActionTaskTarget(
        action({
          id: 'a1',
          businessObject: { kind: 'account', id: 'acc-1', name: 'ACME', logoUrl: null, website: null },
        }),
      ),
    ).toEqual({
      accountId: 'acc-1',
    })
  })

  it('un objet contact devient contactId', () => {
    expect(
      briefingActionTaskTarget(
        action({
          id: 'a1',
          businessObject: { kind: 'contact', id: 'c-1', name: 'Jean', logoUrl: null, website: null },
        }),
      ),
    ).toEqual({
      contactId: 'c-1',
    })
  })

  it('une mission ou un talent ne se rattachent PAS — ni le compte ni le projet des tâches ne les référencent', () => {
    expect(
      briefingActionTaskTarget(
        action({ id: 'a1', businessObject: { kind: 'mission', id: 'm-1', name: null, logoUrl: null, website: null } }),
      ),
    ).toEqual({})
    expect(
      briefingActionTaskTarget(
        action({ id: 'a1', businessObject: { kind: 'talent', id: 't-1', name: null, logoUrl: null, website: null } }),
      ),
    ).toEqual({})
  })

  it('sans objet métier, rien à rattacher', () => {
    expect(briefingActionTaskTarget(action({ id: 'a1', businessObject: null }))).toEqual({})
  })
})

describe('briefingActionHasOpenTask (#2105.53)', () => {
  it('faux quand aucune tâche ne correspond', () => {
    expect(briefingActionHasOpenTask('Relancer Jean', null, [])).toBe(false)
  })

  it('vrai quand une tâche OUVERTE porte le même intitulé et le même objet', () => {
    const tasks = [task({ id: 't1', title: 'Relancer Jean', accountId: 'acc-1' })]
    expect(briefingActionHasOpenTask('Relancer Jean', 'acc-1', tasks)).toBe(true)
  })

  it('faux si l’intitulé diffère, même objet identique', () => {
    const tasks = [task({ id: 't1', title: 'Autre chose', accountId: 'acc-1' })]
    expect(briefingActionHasOpenTask('Relancer Jean', 'acc-1', tasks)).toBe(false)
  })

  it('faux si l’objet diffère, même intitulé identique — deux comptes homonymes ne se confondent pas', () => {
    const tasks = [task({ id: 't1', title: 'Relancer Jean', accountId: 'acc-2' })]
    expect(briefingActionHasOpenTask('Relancer Jean', 'acc-1', tasks)).toBe(false)
  })

  it('une tâche FAITE ou ANNULÉE ne compte pas — retransformer un sujet déjà clos reste possible', () => {
    const tasks = [
      task({ id: 't1', title: 'Relancer Jean', accountId: 'acc-1', status: 'done' }),
      task({ id: 't2', title: 'Relancer Jean', accountId: 'acc-1', status: 'cancelled' }),
    ]
    expect(briefingActionHasOpenTask('Relancer Jean', 'acc-1', tasks)).toBe(false)
  })

  it('sans objet (tâche personnelle), le rapprochement se fait sur des tâches elles aussi SANS objet', () => {
    const linked = task({ id: 't1', title: 'Préparer la revue', accountId: 'acc-1' })
    const personal = task({ id: 't2', title: 'Préparer la revue' })
    expect(briefingActionHasOpenTask('Préparer la revue', null, [linked])).toBe(false)
    expect(briefingActionHasOpenTask('Préparer la revue', null, [personal])).toBe(true)
  })

  it('le rattachement contact fonctionne comme le rattachement compte', () => {
    const tasks = [task({ id: 't1', title: 'Relancer Jean', contactId: 'c-1' })]
    expect(briefingActionHasOpenTask('Relancer Jean', 'c-1', tasks)).toBe(true)
  })
})
