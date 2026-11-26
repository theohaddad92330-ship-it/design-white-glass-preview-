import { describe, expect, it } from 'vitest'

import {
  LAURA_JOB_CAPABILITIES,
  LAURA_JOB_LIMITS,
  lauraJobAwaitingStepOf,
  lauraJobBriefSchema,
  lauraJobPreviewOf,
  lauraJobStepCriteriaMissing,
  lauraJobWithProducedIdentities,
} from './laura-job.js'

/**
 * #3860.1 / #3860.2 (lot M06) — les étapes d'un job S'ENCHAÎNENT : ce qu'une
 * étape produit (des comptes, des contacts) alimente les suivantes, et les cinq
 * capacités jusqu'ici « non exécutables dans un job » partent, chacune avec ce
 * qu'elle exige (un filtre, ou l'attente d'une analyse asynchrone).
 */

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const C1 = '33333333-3333-4333-8333-333333333333'
const C2 = '44444444-4444-4444-8444-444444444444'
const NEED = '55555555-5555-4555-8555-555555555555'

function brief(steps: unknown[], scope: Record<string, unknown> = {}) {
  return lauraJobBriefSchema.parse({
    originalRequest: 'Analyse ces filiales et prépare un message pour chaque décideur',
    intent: 'Analyser puis écrire',
    expectedOutcome: 'Un brouillon par décideur',
    scope: { description: 'Les filiales', accountIds: [A1], ...scope },
    steps,
  })
}

describe('#3860.1 — les cinq capacités raccordées', () => {
  it('toutes les capacités du catalogue sont exécutables dans un job', () => {
    for (const [capability, entry] of Object.entries(LAURA_JOB_CAPABILITIES)) {
      expect(entry.executableInJob, capability).toBe(true)
    }
  })

  it('une étape qui exige un filtre sans filtre est une LIMITE annoncée avant le clic', () => {
    const job = brief([
      { key: 'memory', label: 'Mémoire marché', capability: 'search_market_memory' },
      { key: 'match', label: 'Matching', capability: 'need_matching' },
      { key: 'snap', label: 'Territoire', capability: 'territory_snapshot' },
    ])
    const limits = lauraJobPreviewOf(job).limits
    expect(limits).toContainEqual({ kind: 'missing_criteria', stepKey: 'memory' })
    expect(limits).toContainEqual({ kind: 'missing_criteria', stepKey: 'match' })
    expect(limits).toContainEqual({ kind: 'missing_criteria', stepKey: 'snap' })
  })

  it('le filtre requis dépend de la capacité — jamais « n’importe quel champ »', () => {
    const step = (capability: string, criteria: unknown) =>
      brief([{ key: 's', label: 'x', capability, criteria }]).steps[0]!
    expect(lauraJobStepCriteriaMissing(step('search_market_memory', { technology: 'Java' }))).toBe(false)
    expect(lauraJobStepCriteriaMissing(step('search_market_memory', { needId: NEED }))).toBe(true)
    expect(lauraJobStepCriteriaMissing(step('need_matching', { needId: NEED }))).toBe(false)
    expect(lauraJobStepCriteriaMissing(step('need_matching', { technology: 'Java' }))).toBe(true)
    expect(lauraJobStepCriteriaMissing(step('territory_snapshot', { department: '31' }))).toBe(false)
    expect(lauraJobStepCriteriaMissing(step('territory_snapshot', { region: '76' }))).toBe(true)
    // Une capacité sans filtre requis n'en manque jamais.
    expect(lauraJobStepCriteriaMissing(step('read_workspace', null))).toBe(false)
  })

  it('un filtre se refuse hors forme (champ inconnu, département mal écrit)', () => {
    const parse = (criteria: unknown) =>
      lauraJobBriefSchema.safeParse({
        ...brief([{ key: 's', label: 'x', capability: 'territory_snapshot' }]),
        steps: [{ key: 's', label: 'x', capability: 'territory_snapshot', criteria }],
      }).success
    expect(parse({ department: '31' })).toBe(true)
    expect(parse({ department: 'Haute-Garonne' })).toBe(false)
    expect(parse({ whatever: 'x' })).toBe(false)
  })

  it('une analyse vise les COMPTES du périmètre : au plus `units`, ou la limite le dit', () => {
    const job = brief([{ key: 'analyse', label: 'Analyser', capability: 'account_analysis', units: 5 }], {
      accountIds: [A1, A2],
    })
    expect(lauraJobPreviewOf(job).limits).toContainEqual({ kind: 'max_targets', stepKey: 'analyse', max: 2 })
    const empty = brief([{ key: 'analyse', label: 'Analyser', capability: 'account_analysis' }], { accountIds: [] })
    expect(lauraJobPreviewOf(empty).limits).toContainEqual({ kind: 'no_targets', stepKey: 'analyse' })
  })
})

describe('#3860.2 — les identités produites par une étape alimentent les suivantes', () => {
  it('une étape de contacts derrière une analyse annonce ses cibles VENUES de cette étape', () => {
    const job = brief(
      [
        { key: 'analyse', label: 'Analyser', capability: 'account_analysis' },
        { key: 'write', label: 'Écrire', capability: 'message_generation', units: 10, dependsOn: ['analyse'] },
      ],
      { contactIds: [] },
    )
    const limits = lauraJobPreviewOf(job).limits
    expect(limits).toContainEqual({ kind: 'targets_from_step', stepKey: 'write', fromStepKey: 'analyse' })
    expect(limits.some(limit => limit.kind === 'no_targets' && limit.stepKey === 'write')).toBe(false)
  })

  it('sans étape productrice en amont, un périmètre vide reste « aucune cible »', () => {
    const job = brief([{ key: 'write', label: 'Écrire', capability: 'message_generation' }], { contactIds: [] })
    expect(lauraJobPreviewOf(job).limits).toContainEqual({ kind: 'no_targets', stepKey: 'write' })
  })

  it('le périmètre gagne les identités produites, sans doublon, dans l’ordre, borné', () => {
    const job = brief([{ key: 'analyse', label: 'Analyser', capability: 'account_analysis' }], {
      contactIds: [C1],
    })
    const next = lauraJobWithProducedIdentities(job, { accountIds: [A1, A2], contactIds: [C1, C2] })
    expect(next.scope.accountIds).toEqual([A1, A2])
    expect(next.scope.contactIds).toEqual([C1, C2])
    const many = Array.from(
      { length: LAURA_JOB_LIMITS.maxContacts + 5 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    expect(lauraJobWithProducedIdentities(job, { accountIds: [], contactIds: many }).scope.contactIds).toHaveLength(
      LAURA_JOB_LIMITS.maxContacts,
    )
  })

  it('rien de produit : la fiche est rendue telle quelle', () => {
    const job = brief([{ key: 'read', label: 'Lire', capability: 'read_workspace' }])
    expect(lauraJobWithProducedIdentities(job, { accountIds: [], contactIds: [] })).toBe(job)
  })
})

describe('#3860.1 — l’attente d’un job asynchrone', () => {
  it('une étape en cours qui attend des analyses est retrouvée ; sans attente, rien', () => {
    const job = brief([
      { key: 'analyse', label: 'Analyser', capability: 'account_analysis' },
      { key: 'read', label: 'Lire', capability: 'read_workspace' },
    ])
    expect(lauraJobAwaitingStepOf(job)).toBeNull()
    const waiting = {
      ...job,
      steps: job.steps.map(step =>
        step.key === 'analyse'
          ? {
              ...step,
              status: 'running' as const,
              awaiting: [{ accountId: A1, runRef: 'analysis-job-1', launchedAt: '2026-10-09T10:00:00.000Z' }],
            }
          : step,
      ),
    }
    expect(lauraJobAwaitingStepOf(lauraJobBriefSchema.parse(waiting))?.key).toBe('analyse')
  })

  it('une fiche d’avant ce lot (sans criteria / awaiting / produced) se relit sans erreur', () => {
    const job = brief([{ key: 'read', label: 'Lire', capability: 'read_workspace' }])
    expect(job.steps[0]?.criteria).toBeNull()
    expect(job.steps[0]?.awaiting).toEqual([])
    expect(job.steps[0]?.produced).toEqual({ accountIds: [], contactIds: [] })
  })
})
