import { BadRequestException } from '@nestjs/common'
import { DecisionGatesService } from './decision-gates.service'

/**
 * Le journal des portes de décision (BEL-ARCH-005).
 *
 * Ce que ces tests protègent, dans l'ordre : le journal doit être écrit ou
 * l'appel doit échouer (c'est la donnée d'audit) ; la trace de timeline, elle,
 * est du confort de lecture et ne doit jamais faire échouer une décision déjà
 * prise par un humain. Confondre les deux transformerait une panne d'audit en
 * panne de produit.
 *
 * Et surtout : une trace INCOMPLÈTE est refusée. Un refus sans motif ou un
 * « forcé » qui ne nomme aucun manque donnent l'illusion qu'on saura relire —
 * ce qui est pire que l'absence de trace, parce qu'on cesse de chercher.
 */
describe('DecisionGatesService', () => {
  const build = (over: { save?: jest.Mock; ingest?: jest.Mock } = {}) => {
    const save = over.save ?? jest.fn(async (row: unknown) => row)
    const crossings = { create: jest.fn((row: unknown) => row), save, find: jest.fn().mockResolvedValue([]) }
    const ingest = over.ingest ?? jest.fn().mockResolvedValue(undefined)
    return {
      service: new DecisionGatesService(crossings as never, { ingest } as never),
      crossings,
      save,
      ingest,
    }
  }

  const projectId = '11111111-1111-4111-8111-111111111111'

  it('écrit le franchissement, son motif et ses manques', async () => {
    const { service, save } = build()

    await service.record('w-1', 'u-1', {
      gate: 'project_close',
      decision: 'force',
      subject: 'project',
      subjectId: projectId,
      reason: 'Le client a signé ailleurs',
      missing: ['budget inconnu', 'aucun décideur identifié', 'pas de date'],
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({
      workspace_id: 'w-1',
      user_id: 'u-1',
      gate: 'project_close',
      decision: 'force',
      subject_id: projectId,
      missing: ['budget inconnu', 'aucun décideur identifié', 'pas de date'],
    })
  })

  it('refuse un refus sans motif — une trace incomplète fait croire qu’on saura', async () => {
    const { service, save } = build()

    await expect(
      service.record('w-1', 'u-1', {
        gate: 'account_priority',
        decision: 'refuse',
        subject: 'account',
        subjectId: projectId,
        missing: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuse un franchissement forcé qui ne nomme aucun manque', async () => {
    const { service, save } = build()

    await expect(
      service.record('w-1', 'u-1', {
        gate: 'project_close',
        decision: 'force',
        subject: 'project',
        subjectId: projectId,
        reason: 'On y va',
        missing: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(save).not.toHaveBeenCalled()
  })

  it('écrit une trace de timeline `gate_decision` rattachée au projet', async () => {
    const { service, ingest } = build()

    await service.record('w-1', 'u-1', {
      gate: 'project_close',
      decision: 'accept',
      subject: 'project',
      subjectId: projectId,
      reason: 'Projet signé',
      missing: [],
    })

    const [, , entries] = ingest.mock.calls[0] as [string, string, Array<Record<string, unknown>>]
    expect(entries[0]).toMatchObject({ kind: 'gate_decision', projectId, direction: 'internal' })
  })

  it('met les manques EN CLAIR dans la trace — « 2 manques » envoie chercher', async () => {
    const { service, ingest } = build()

    await service.record('w-1', 'u-1', {
      gate: 'project_close',
      decision: 'force',
      subject: 'project',
      subjectId: projectId,
      reason: 'Décision du client',
      missing: ['budget inconnu', 'pas de décideur'],
    })

    const [, , entries] = ingest.mock.calls[0] as [string, string, Array<Record<string, unknown>>]
    expect(entries[0].body).toContain('budget inconnu')
    expect(entries[0].body).toContain('pas de décideur')
  })

  it('n’écrit AUCUNE trace pour un sujet qu’aucun écran ne montre — un log invisible est un log inutile', async () => {
    const { service, ingest, save } = build()

    await service.record('w-1', 'u-1', {
      gate: 'playbook_arming',
      decision: 'accept',
      subject: 'playbook',
      subjectId: 'client_followup',
      reason: null,
      missing: [],
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('enregistre quand même si la trace de timeline échoue', async () => {
    const { service, save } = build({ ingest: jest.fn().mockRejectedValue(new Error('activities down')) })

    await service.record('w-1', 'u-1', {
      gate: 'project_close',
      decision: 'accept',
      subject: 'project',
      subjectId: projectId,
      reason: 'Projet signé',
      missing: [],
    })

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('LAISSE remonter l’échec du journal — l’audit n’est pas best-effort', async () => {
    const { service } = build({ save: jest.fn().mockRejectedValue(new Error('pg down')) })

    await expect(
      service.record('w-1', 'u-1', {
        gate: 'project_close',
        decision: 'accept',
        subject: 'project',
        subjectId: projectId,
        reason: 'Projet signé',
        missing: [],
      }),
    ).rejects.toThrow('pg down')
  })
})

/* ------------------------------------------------------------------------- */
/*  Le journal se RELIT                                                       */
/* ------------------------------------------------------------------------- */

describe('le journal des portes se relit', () => {
  /**
   * `decision_gate_crossings` s'écrivait depuis le PDF 1 et ne se relisait
   * nulle part : le module n'avait aucun contrôleur, et `forSubject` était
   * écrit, testé, sans appelant. Un journal d'audit qu'on ne peut pas relire
   * n'est pas un journal — c'est de la place occupée.
   *
   * Ce qui existait déjà et n'est pas la même chose : une trace de timeline par
   * franchissement. Ce qui manquait est l'AGRÉGAT — « combien d'affaires closes
   * sans budget ce trimestre », la question qui a fait créer la table.
   */
  function harness(rows: { gates?: unknown[]; missing?: unknown[]; fail?: boolean } = {}) {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (rows.fail) throw new Error('base injoignable')
        return sql.includes('jsonb_array_elements_text') ? (rows.missing ?? []) : (rows.gates ?? [])
      }),
    }
    const crossings = { manager, save: jest.fn(), create: jest.fn() }
    return new DecisionGatesService(crossings as never, undefined as never)
  }

  it('compte les manques par LIBELLÉ, pas les franchissements', async () => {
    const service = harness({
      gates: [{ gate: 'project_close', decision: 'force', count: '4' }],
      missing: [
        { label: 'budget', count: '11' },
        { label: 'décideur', count: '3' },
      ],
    })
    const summary = await service.summary('w-1', 90)
    expect(summary.missing).toEqual([
      { label: 'budget', count: 11 },
      { label: 'décideur', count: 3 },
    ])
    expect(summary.gates[0]).toEqual({ gate: 'project_close', decision: 'force', count: 4 })
  })

  it('une fenêtre sans franchissement dit « rien ne manquait »', async () => {
    // Une liste vide est une RÉPONSE ici : le journal est écrit ou l'appel qui
    // franchit la porte échoue, donc l'absence de ligne veut dire quelque chose.
    const summary = await harness().summary('w-1', 30)
    expect(summary).toEqual({ days: 30, gates: [], missing: [] })
  })

  it('une lecture en échec ne fait pas tomber l’appel', async () => {
    const summary = await harness({ fail: true }).summary('w-1', 90)
    expect(summary.gates).toEqual([])
  })

  it('borne la fenêtre à ce qu’on lui donne', async () => {
    expect((await harness().summary('w-1', 7)).days).toBe(7)
  })
})
