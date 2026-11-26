import { describe, expect, it } from 'vitest'

import { workflowRunStatusSchema } from './action-os.js'
import {
  LAURA_JOB_CAPABILITIES,
  lauraJobBriefSchema,
  lauraJobEstimatedCredits,
  lauraJobInitialStatus,
  lauraJobProgressOf,
  lauraJobResumeOf,
  lauraJobStateOf,
  lauraJobStateSchema,
  lauraJobToolsOf,
  lauraJobValidationsRequired,
  lauraJobNextStepOf,
  lauraJobAwaitsApproval,
  lauraJobStateAfterStep,
  lauraJobGesturesOf,
  lauraJobRearmForResume,
  lauraJobRemainingCredits,
  lauraJobDropUnreachable,
  LAURA_JOB_LIMITS,
  lauraJobPreviewOf,
  lauraJobMeasuredDuration,
  type LauraJobCapability,
} from './laura-job.js'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function brief(overrides: Record<string, unknown> = {}) {
  return lauraJobBriefSchema.parse({
    originalRequest: 'Analyse les 20 filiales de Thales et trouve 50 décideurs',
    intent: 'Cartographier les décideurs des filiales Thales',
    expectedOutcome: 'Une liste de 50 décideurs rattachés à leur filiale',
    scope: { description: 'Les filiales françaises de Thales', accountIds: [ACCOUNT] },
    steps: [
      { key: 'analyse', label: 'Analyser les filiales', capability: 'account_analysis', units: 20 },
      {
        key: 'enrich',
        label: 'Enrichir les décideurs',
        capability: 'contact_enrichment',
        units: 50,
        dependsOn: ['analyse'],
      },
      { key: 'crm', label: 'Remonter dans le CRM', capability: 'crm_write', dependsOn: ['enrich'] },
    ],
    ...overrides,
  })
}

describe('#2276.3-.21 — la fiche du job', () => {
  it('porte demande, intention, résultat attendu, scope, étapes ; les listes absentes valent vide', () => {
    const parsed = brief()
    expect(parsed.originalRequest).toMatch(/20 filiales/)
    expect(parsed.intent).toBeTruthy()
    expect(parsed.expectedOutcome).toBeTruthy()
    expect(parsed.scope.accountIds).toEqual([ACCOUNT])
    expect(parsed.scope.contactIds).toEqual([])
    expect(parsed.assumptions).toEqual([])
    expect(parsed.intermediateResults).toEqual([])
    expect(parsed.errors).toEqual([])
    expect(parsed.createdObjects).toEqual([])
    // « non estimée » n'est jamais 0.
    expect(parsed.estimatedDurationSeconds).toBeNull()
    expect(parsed.steps.every(step => step.status === 'todo')).toBe(true)
  })

  it('#2276.9 — refuse une dépendance vers une étape plus bas, inconnue ou elle-même', () => {
    const base = brief()
    const forward = { ...base, steps: [{ ...base.steps[0], dependsOn: ['enrich'] }, base.steps[1]] }
    expect(lauraJobBriefSchema.safeParse(forward).success).toBe(false)
    const self = { ...base, steps: [{ ...base.steps[0], dependsOn: ['analyse'] }] }
    expect(lauraJobBriefSchema.safeParse(self).success).toBe(false)
    const unknown = { ...base, steps: [{ ...base.steps[0], dependsOn: ['ghost'] }] }
    expect(lauraJobBriefSchema.safeParse(unknown).success).toBe(false)
  })

  it('refuse deux étapes de même clé, et un job sans étape', () => {
    const base = brief()
    expect(lauraJobBriefSchema.safeParse({ ...base, steps: [base.steps[0], base.steps[0]] }).success).toBe(false)
    expect(lauraJobBriefSchema.safeParse({ ...base, steps: [] }).success).toBe(false)
  })
})

describe('#2276.11 / .12 / .14 / .15 — ce qui se dérive de la fiche', () => {
  it('le coût vient de la grille × le nombre de cibles, jamais du modèle', () => {
    // 20 analyses × 10 (Approfondie par défaut, Louis 10/10) + 50 enrichissements × 1 + écriture CRM 0.
    expect(lauraJobEstimatedCredits(brief())).toBe(20 * 10 + 50)
  })

  it('une écriture CRM exige une validation même quand le modèle dit le contraire', () => {
    expect(LAURA_JOB_CAPABILITIES.crm_write.writesOutside).toBe(true)
    const required = lauraJobValidationsRequired(brief())
    expect(required.map(step => step.key)).toEqual(['crm'])
  })

  it('les outils mobilisés, dédoublonnés dans leur ordre', () => {
    expect(lauraJobToolsOf(brief())).toEqual(['account_analysis', 'contact_enrichment', 'crm_write'])
  })

  it('l’avancement compte des étapes finies, pas un pourcentage', () => {
    const parsed = brief()
    parsed.steps[0].status = 'done'
    expect(lauraJobProgressOf(parsed)).toEqual({ done: 1, total: 3 })
  })
})

describe('#2276.18 — la reprise', () => {
  it('repart de la première étape non faite d’un job partiel', () => {
    const parsed = brief()
    parsed.steps[0].status = 'done'
    parsed.steps[1].status = 'failed'
    expect(lauraJobResumeOf('partial', parsed)).toEqual({ resumable: true, fromStepKey: 'enrich' })
  })

  it('`unknown` arrête la reprise — un timeout n’est pas un échec', () => {
    const parsed = brief()
    parsed.steps[0].status = 'unknown'
    expect(lauraJobResumeOf('failed', parsed)).toEqual({ resumable: false, fromStepKey: null })
    expect(lauraJobResumeOf('unknown', brief())).toEqual({ resumable: false, fromStepKey: null })
  })

  it('un job qui n’a pas été arrêté ne se reprend pas', () => {
    expect(lauraJobResumeOf('to_confirm', brief()).resumable).toBe(false)
    expect(lauraJobResumeOf('running', brief()).resumable).toBe(false)
  })
})

describe('#2276.22-.31 — les états', () => {
  it('les dix états de l’issue existent, plus blocked et unknown', () => {
    expect(lauraJobStateSchema.options).toEqual([
      'draft',
      'to_confirm',
      'planned',
      'running',
      'awaiting_approval',
      'partial',
      'done',
      'failed',
      'cancelled',
      'superseded',
      'blocked',
      'unknown',
    ])
  })

  it('chaque statut de ligne a un état de job', () => {
    for (const status of workflowRunStatusSchema.options) {
      expect(lauraJobStateSchema.options).toContain(lauraJobStateOf(status))
    }
  })

  it('Laura pose À confirmer quand le périmètre est résolu, Brouillon quand il manque et qu’elle suppose', () => {
    expect(lauraJobInitialStatus(brief())).toBe('to_confirm')
    const vague = brief({
      scope: { description: 'Les filiales de Thales' },
      assumptions: ['Je suppose que tu vises les filiales françaises'],
    })
    expect(lauraJobInitialStatus(vague)).toBe('draft')
    // Sans hypothèse MAIS avec cible : confirmable. (Sans cible, #2276.22 ci-dessous : Brouillon.)
    expect(
      lauraJobInitialStatus(brief({ scope: { description: 'Les filiales de Thales', accountIds: [ACCOUNT] } })),
    ).toBe('to_confirm')
  })

  // #2276.22 — « paramètres incomplets » : un job qu'on ne pourrait pas confirmer naît Brouillon, même sans hypothèse.
  it('#2276.22 — une étape qui exige un filtre ou une cible absente rend le job Brouillon', () => {
    const noTarget = brief({ scope: { description: 'Les filiales de Thales' } })
    expect(lauraJobInitialStatus(noTarget)).toBe('draft')
    const noFilter = brief({
      scope: { description: 'Besoins Java', accountIds: [ACCOUNT] },
      steps: [{ key: 'search', label: 'Chercher', capability: 'search_market_memory', units: 1 }],
    })
    expect(lauraJobInitialStatus(noFilter)).toBe('draft')
    const filtered = brief({
      scope: { description: 'Besoins Java', accountIds: [ACCOUNT] },
      steps: [
        {
          key: 'search',
          label: 'Chercher',
          capability: 'search_market_memory',
          units: 1,
          criteria: { technology: 'Java' },
        },
      ],
    })
    expect(lauraJobInitialStatus(filtered)).toBe('to_confirm')
  })
})

// ── #2276 tranche 2 — exécution par étapes, gestes, preuve ─────────────────

function withStatuses(statuses: Record<string, string>, extra: Record<string, Record<string, unknown>> = {}) {
  const base = brief()
  return lauraJobBriefSchema.parse({
    ...base,
    steps: base.steps.map(step => ({ ...step, status: statuses[step.key] ?? step.status, ...(extra[step.key] ?? {}) })),
  })
}

describe('#2276.59 — la preuve d’une étape', () => {
  it('une étape neuve ne porte aucune preuve : ni date, ni crédit, ni validation (non mesuré ≠ 0)', () => {
    const step = brief().steps[0]
    expect(step).toMatchObject({
      startedAt: null,
      finishedAt: null,
      creditsSpent: null,
      creditsReserved: null,
      creditsRefunded: null,
      approvedBy: null,
      approvedAt: null,
      note: null,
    })
  })
})

// ── #2852.21-23 — cost_reserved/cost_charged/cost_refunded, au niveau de
// l'étape qui débite RÉELLEMENT (l'exécution asynchrone du job, jamais un
// outil de lecture synchrone — voir tool_result_envelope.py côté IA).
describe('#2852.21-23 — crédits réservés/débités/remboursés par étape', () => {
  it('une réservation posée par l’exécuteur se lit telle quelle', () => {
    const withReservation = brief({
      steps: [{ key: 'analyse', label: 'Analyser les filiales', capability: 'account_analysis', units: 20 }],
    })
    const step = lauraJobBriefSchema.parse({
      ...withReservation,
      steps: [{ ...withReservation.steps[0], creditsReserved: 20 }],
    }).steps[0]
    expect(step.creditsReserved).toBe(20)
    expect(step.creditsRefunded).toBeNull()
  })

  it('une étape soldée intégralement consommée rembourse 0, un fait mesuré, jamais null', () => {
    const withReservation = brief({
      steps: [{ key: 'analyse', label: 'Analyser les filiales', capability: 'account_analysis', units: 20 }],
    })
    const step = lauraJobBriefSchema.parse({
      ...withReservation,
      steps: [{ ...withReservation.steps[0], creditsReserved: 20, creditsSpent: 20, creditsRefunded: 0 }],
    }).steps[0]
    expect(step.creditsRefunded).toBe(0)
  })

  it('une reprise remet creditsReserved/creditsRefunded à zéro comme creditsSpent — une étape rejouée n’a encore rien réservé', () => {
    const withCredits = lauraJobBriefSchema.parse({
      ...brief(),
      steps: brief().steps.map(step => ({
        ...step,
        status: 'failed',
        creditsSpent: 5,
        creditsReserved: 5,
        creditsRefunded: 0,
      })),
    })
    const resumed = lauraJobRearmForResume(withCredits)
    for (const step of resumed.steps) {
      expect(step.creditsReserved).toBeNull()
      expect(step.creditsRefunded).toBeNull()
    }
  })
})

describe('#2276.1 — la prochaine étape', () => {
  it('rend la première étape à faire dont les dépendances sont faites', () => {
    expect(lauraJobNextStepOf(brief())?.key).toBe('analyse')
    expect(lauraJobNextStepOf(withStatuses({ analyse: 'done' }))?.key).toBe('enrich')
  })

  it('NON : une étape dont une dépendance n’est pas faite ne part pas', () => {
    expect(lauraJobNextStepOf(withStatuses({ analyse: 'failed' }))).toBeNull()
  })
})

describe('#2276.14 / doctrine — la porte d’approbation', () => {
  it('une écriture CRM attend une validation, même si le modèle dit le contraire', () => {
    const job = withStatuses({ analyse: 'done', enrich: 'done' }, { crm: { requiresApproval: false } })
    expect(lauraJobAwaitsApproval(job)?.key).toBe('crm')
    expect(lauraJobStateAfterStep(job)).toBe('awaiting_approval')
  })

  it('NON : une validation humaine enregistrée ouvre la porte', () => {
    const job = withStatuses(
      { analyse: 'done', enrich: 'done' },
      { crm: { approvedBy: ACCOUNT, approvedAt: '2026-09-24T10:00:00.000Z' } },
    )
    expect(lauraJobAwaitsApproval(job)).toBeNull()
    expect(lauraJobStateAfterStep(job)).toBe('running')
  })
})

describe('#2276.58 / .60 — l’état après une étape', () => {
  it('tout fait = done', () => {
    expect(lauraJobStateAfterStep(withStatuses({ analyse: 'done', enrich: 'done', crm: 'done' }))).toBe('done')
  })
  it('une étape inconnue = unknown : un timeout n’est pas un échec', () => {
    expect(lauraJobStateAfterStep(withStatuses({ analyse: 'done', enrich: 'unknown' }))).toBe('unknown')
  })
  it('des étapes faites puis un échec = partial (les résultats restent)', () => {
    expect(lauraJobStateAfterStep(withStatuses({ analyse: 'done', enrich: 'failed', crm: 'dropped' }))).toBe('partial')
  })
  it('rien de fait, un échec = failed', () => {
    expect(lauraJobStateAfterStep(withStatuses({ analyse: 'failed', enrich: 'dropped', crm: 'dropped' }))).toBe(
      'failed',
    )
  })
  it('rien de fait, rien d’exécutable = blocked (rien n’est parti)', () => {
    expect(lauraJobStateAfterStep(withStatuses({ analyse: 'blocked', enrich: 'dropped', crm: 'dropped' }))).toBe(
      'blocked',
    )
  })
})

describe('#2276.57 / .18 — les gestes permis', () => {
  it('à confirmer : confirmer ou annuler', () => {
    expect(lauraJobGesturesOf('to_confirm', brief())).toEqual(['confirm', 'cancel'])
  })
  it('un brouillon ne se confirme pas', () => {
    expect(lauraJobGesturesOf('draft', brief())).toEqual(['cancel'])
  })
  it('en attente de validation : valider ou annuler', () => {
    expect(lauraJobGesturesOf('awaiting_approval', brief())).toEqual(['approve', 'cancel'])
  })
  it('partiel reprenable : reprendre', () => {
    expect(lauraJobGesturesOf('partial', withStatuses({ analyse: 'done', enrich: 'failed' }))).toEqual(['resume'])
  })
  it('NON : inconnu ne se reprend pas, terminé ne se touche plus', () => {
    expect(lauraJobGesturesOf('unknown', withStatuses({ analyse: 'done', enrich: 'unknown' }))).toEqual([])
    expect(lauraJobGesturesOf('done', withStatuses({ analyse: 'done', enrich: 'done', crm: 'done' }))).toEqual([])
    expect(lauraJobGesturesOf('cancelled', brief())).toEqual([])
  })
})

describe('I3 — ce qui reste à couvrir, ce qui ne peut plus partir', () => {
  it('le reste à réserver ne compte que les étapes à faire', () => {
    expect(lauraJobRemainingCredits(brief())).toBe(lauraJobEstimatedCredits(brief()))
    expect(lauraJobRemainingCredits(withStatuses({ analyse: 'done' }))).toBe(50)
    expect(lauraJobRemainingCredits(withStatuses({ analyse: 'done', enrich: 'done' }))).toBe(0)
  })
  it('une étape qui ne peut plus partir est sautée, pas ratée — les faites ne bougent pas', () => {
    const dropped = lauraJobDropUnreachable(withStatuses({ analyse: 'failed' }))
    expect(dropped.steps.map(step => [step.status, step.note])).toEqual([
      ['failed', null],
      ['dropped', 'dependency_not_done'],
      ['dropped', 'dependency_not_done'],
    ])
  })
})

describe('#2276.53 — reprendre ne rejoue pas ce qui est fait', () => {
  it('remet à faire ce qui a échoué ou sauté, garde les étapes faites et leur preuve', () => {
    const job = withStatuses(
      { analyse: 'done', enrich: 'failed', crm: 'dropped' },
      { analyse: { creditsSpent: 20, finishedAt: '2026-09-24T10:00:00.000Z' }, enrich: { note: 'refused' } },
    )
    const resumed = lauraJobRearmForResume(job)
    expect(resumed.steps.map(step => step.status)).toEqual(['done', 'todo', 'todo'])
    expect(resumed.steps[0]?.creditsSpent).toBe(20)
    expect(resumed.steps[1]?.note).toBeNull()
  })
})

describe('#2276.46 / .47 / .49 / .51 — la prévisualisation du job, avant « Confirmer »', () => {
  const CONTACTS = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']

  function withRead(overrides: Record<string, unknown> = {}) {
    return brief({
      scope: { description: 'Thales', accountIds: [ACCOUNT], contactIds: CONTACTS },
      steps: [
        { key: 'read', label: 'Relire le dossier', capability: 'read_workspace' },
        { key: 'memory', label: 'Relire la mémoire marché', capability: 'search_market_memory' },
        { key: 'enrich', label: 'Enrichir', capability: 'contact_enrichment', units: 50, dependsOn: ['read'] },
        { key: 'analyse', label: 'Analyser', capability: 'account_analysis', units: 3 },
      ],
      ...overrides,
    })
  }

  it('.46 / .47 — sépare ce qui RELIT des données déjà là de ce qui fait du neuf', () => {
    const preview = lauraJobPreviewOf(withRead())
    expect(preview.reused.map(step => step.key)).toEqual(['read', 'memory'])
    expect(preview.newActions.map(step => step.key)).toEqual(['enrich', 'analyse'])
  })

  it('.51 — les limites viennent du contrat : cibles réellement traitées, étapes non exécutables', () => {
    const preview = lauraJobPreviewOf(withRead())
    // 50 annoncés, 2 contacts dans le périmètre : l'exécuteur en traitera 2.
    expect(preview.limits).toContainEqual({ kind: 'max_targets', stepKey: 'enrich', max: 2 })
    // #3860.1 — raccordées : la mémoire marché sans filtre le DIT, l'analyse vise les comptes du périmètre.
    expect(preview.limits).toContainEqual({ kind: 'missing_criteria', stepKey: 'memory' })
    expect(preview.limits).toContainEqual({ kind: 'max_targets', stepKey: 'analyse', max: 1 })
    // Une lecture exécutable n'a aucune limite à dire.
    expect(preview.limits.some(limit => limit.stepKey === 'read')).toBe(false)
  })

  it('.51 — un périmètre sans contact le DIT au lieu d’annoncer des cibles', () => {
    const preview = lauraJobPreviewOf(withRead({ scope: { description: 'Thales', accountIds: [ACCOUNT] } }))
    expect(preview.limits).toContainEqual({ kind: 'no_targets', stepKey: 'enrich' })
  })

  it('.51 — les plafonds d’une fiche sont ceux que le schéma applique (une seule source)', () => {
    const tooMany = Array.from({ length: LAURA_JOB_LIMITS.maxSteps + 1 }, (_, i) => ({
      key: `s${i}`,
      label: 'x',
      capability: 'read_workspace',
    }))
    expect(lauraJobBriefSchema.safeParse({ ...withRead(), steps: tooMany }).success).toBe(false)
    const units = { ...withRead().steps[2], units: LAURA_JOB_LIMITS.maxUnitsPerStep + 1 }
    expect(lauraJobBriefSchema.safeParse({ ...withRead(), steps: [units] }).success).toBe(false)
  })

  it('le drapeau « exécutable dans un job » ne se contredit pas avec les cibles', () => {
    for (const [capability, entry] of Object.entries(LAURA_JOB_CAPABILITIES)) {
      if (entry.targetsContacts) expect(entry.executableInJob, capability).toBe(true)
      if (entry.reusesData) expect(entry.credited, capability).toBeNull()
    }
  })
})

describe('#2276.49 — la durée ne s’affiche que MESURÉE', () => {
  const at = (seconds: number) => new Date(Date.UTC(2026, 8, 24, 9, 0, seconds)).toISOString()
  const done = (capability: LauraJobCapability, units: number, seconds: number) => ({
    capability,
    units,
    status: 'done' as const,
    startedAt: at(0),
    finishedAt: at(seconds),
  })

  it('rend null sans aucune mesure — jamais une durée inventée', () => {
    expect(lauraJobMeasuredDuration(brief().steps, [])).toBeNull()
  })

  it('rend null si UNE capacité du job n’a jamais été mesurée', () => {
    const history = [done('account_analysis', 1, 30), done('contact_enrichment', 10, 20)]
    // crm_write n'a aucune mesure : une estimation partielle serait inventée pour le reste.
    expect(lauraJobMeasuredDuration(brief().steps, history)).toBeNull()
  })

  it('somme la médiane mesurée par unité, sur les seules étapes faites', () => {
    const history = [
      done('account_analysis', 1, 30),
      done('account_analysis', 2, 40), // 20 s / unité
      done('account_analysis', 1, 50),
      done('contact_enrichment', 10, 20), // 2 s / unité
      done('crm_write', 1, 3),
      { ...done('crm_write', 1, 999), status: 'failed' as const }, // non fait : ignoré
    ]
    // médiane account_analysis = 30 s/u × 20 + 2 s/u × 50 + 3 s/u × 1
    expect(lauraJobMeasuredDuration(brief().steps, history)).toEqual({ seconds: 30 * 20 + 2 * 50 + 3, basis: 5 })
  })

  it('la fiche porte sa base de mesure ; absente, elle vaut null', () => {
    const parsed = lauraJobBriefSchema.parse({ ...brief(), estimatedDurationSeconds: 60, estimatedDurationBasis: 4 })
    expect(parsed.estimatedDurationBasis).toBe(4)
    expect(brief().estimatedDurationBasis).toBeNull()
  })
})
