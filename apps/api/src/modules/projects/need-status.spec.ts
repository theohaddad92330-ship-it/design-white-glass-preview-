import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ProjectPipelineService } from './project-pipeline.service'

/**
 * La porte d'état d'un besoin (PDF 2 §7.4, décision D13).
 *
 * Séparée du patch générique, et c'est le point : le statut est le seul champ
 * dont un mauvais réglage DÉPLACE du travail sans que personne ne l'ait décidé.
 */
describe('ProjectPipelineService — la porte d’état d’un besoin', () => {
  // #2323.23 / #2323.25 — les positionnements du besoin que `changeNeedStatus`
  // lit avant de franchir PRÉSENTER (`client_review`) ou DÉMARRER (`won`).
  // Défaut : aucun positionnement, comme un besoin qui n'en a encore aucun.
  const build = (need: Record<string, unknown> | null, submissions: Record<string, unknown>[] = []) => {
    const needs = {
      findOne: jest.fn().mockResolvedValue(need),
      save: jest.fn(async (row: Record<string, unknown>) => row),
      manager: { query: jest.fn().mockResolvedValue(submissions) },
    }
    const commercialTransitions = {
      record: jest.fn().mockResolvedValue(undefined),
      history: jest.fn().mockResolvedValue([]),
    }
    const service = new ProjectPipelineService(
      { findOne: jest.fn() } as never,
      needs as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      {
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn(() => ({
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn(),
        })),
      } as never,
      commercialTransitions as never,
    )
    return { service, needs, commercialTransitions }
  }

  const need = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    workspace_id: 'w-1',
    project_id: 'p-1',
    title: 'Tech lead Java',
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'inconnu',
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    deadline_at: null,
    created_at: new Date('2026-08-19T10:00:00.000Z'),
    updated_at: new Date('2026-08-19T10:00:00.000Z'),
    ...over,
  })

  it('refuse de sauter la qualification — un matching à vide rend une liste que personne ne comprend', async () => {
    const { service } = build(need())
    await expect(service.changeNeedStatus('w-1', 'n-1', 'matching', null)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('avance d’un cran et date le changement', async () => {
    const { service, needs } = build(need())
    const result = await service.changeNeedStatus('w-1', 'n-1', 'qualified', null)
    expect(result.status).toBe('qualified')
    const saved = needs.save.mock.calls[0]?.[0] as { status_changed_at: Date | null }
    expect(saved.status_changed_at).toBeInstanceOf(Date)
  })

  it('exige un motif pour perdre — sans lui, le taux de refus par cause ne veut rien dire', async () => {
    const { service } = build(need({ status: 'client_review' }))
    await expect(service.changeNeedStatus('w-1', 'n-1', 'lost', '   ')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('garde le motif d’une perte, et seulement là', async () => {
    const { service, needs } = build(need({ status: 'client_review' }))
    await service.changeNeedStatus('w-1', 'n-1', 'lost', ' TJM incompatible ')
    expect((needs.save.mock.calls[0]?.[0] as { status_reason: string }).status_reason).toBe('TJM incompatible')

    // #2942 — « négociation » est désormais l'étape immédiatement avant « gagné » :
    // on ne saute plus directement de « en validation client » à « gagné ».
    const second = build(need({ status: 'negotiation', status_reason: 'ancienne raison' }), [
      { stage: 'accepted', substatus: 'selected' },
    ])
    await second.service.changeNeedStatus('w-1', 'n-1', 'won', null)
    // Traîner le motif d'une perte à côté d'un besoin gagné le rendrait illisible.
    expect((second.needs.save.mock.calls[0]?.[0] as { status_reason: string | null }).status_reason).toBeNull()
  })

  it('exige un motif pour mettre en veille — « avec motif » était accepté par la route et JETÉ par le service', async () => {
    // `changeNeedStatusSchema` acceptait `{ status: 'on_hold', reason }` depuis
    // toujours ; le service ne gardait le motif que sur `lost`/`cancelled`. On
    // pouvait donc mettre en veille avec une raison, et la raison disparaissait.
    const { service } = build(need({ status: 'qualified' }))
    await expect(service.changeNeedStatus('w-1', 'n-1', 'on_hold', '  ')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('GARDE le motif de la veille, et le retire quand la veille finit', async () => {
    const { service, needs } = build(need({ status: 'qualified' }))
    const held = await service.changeNeedStatus('w-1', 'n-1', 'on_hold', ' Budget gelé jusqu’en janvier ')
    expect(held.status).toBe('on_hold')
    expect((needs.save.mock.calls[0]?.[0] as { status_reason: string }).status_reason).toBe(
      'Budget gelé jusqu’en janvier',
    )

    // Réactiver n'exige rien et EFFACE le motif : la raison d'un arrêt à côté
    // d'un besoin en marche se lirait comme un blocage encore actif.
    const revived = build(need({ status: 'on_hold', status_reason: 'Budget gelé' }))
    const result = await revived.service.changeNeedStatus('w-1', 'n-1', 'to_reactivate', null)
    expect(result.status).toBe('to_reactivate')
    expect((revived.needs.save.mock.calls[0]?.[0] as { status_reason: string | null }).status_reason).toBeNull()
  })

  it('#3389.13 — GARDE la date de reprise d’une veille, et l’efface quand la veille finit', async () => {
    const { service, needs } = build(need({ status: 'qualified' }))
    const held = await service.changeNeedStatus('w-1', 'n-1', 'on_hold', 'Budget gelé', null, 'human', '2099-01-15')
    expect(held.resume_on).toBe('2099-01-15')
    expect((needs.save.mock.calls[0]?.[0] as { resume_on: string | null }).resume_on).toBe('2099-01-15')

    const revived = build(need({ status: 'on_hold', status_reason: 'Budget gelé', resume_on: '2099-01-15' }))
    await revived.service.changeNeedStatus('w-1', 'n-1', 'to_reactivate', null)
    expect((revived.needs.save.mock.calls[0]?.[0] as { resume_on: string | null }).resume_on).toBeNull()
  })

  it('#3389.13 — une veille SANS date reste valable : la date ne s’invente pas', async () => {
    const { service, needs } = build(need({ status: 'qualified' }))
    await service.changeNeedStatus('w-1', 'n-1', 'on_hold', 'Budget gelé')
    expect((needs.save.mock.calls[0]?.[0] as { resume_on: string | null }).resume_on).toBeNull()
  })

  it('#3389.13 — refuse une date dans le passé, et une date sur un autre état que la veille', async () => {
    const past = build(need({ status: 'qualified' }))
    await expect(
      past.service.changeNeedStatus('w-1', 'n-1', 'on_hold', 'Budget gelé', null, 'human', '2000-01-01'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(past.needs.save).not.toHaveBeenCalled()

    const lost = build(need({ status: 'qualified' }))
    await expect(
      lost.service.changeNeedStatus('w-1', 'n-1', 'lost', 'TJM incompatible', null, 'human', '2099-01-15'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rend 404 sur un besoin d’un autre espace', async () => {
    const { service } = build(null)
    await expect(service.changeNeedStatus('w-1', 'n-9', 'qualified', null)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lit une valeur héritée comme son équivalent d’aujourd’hui', async () => {
    const { service } = build(need({ status: 'open' }))
    await expect(service.changeNeedStatus('w-1', 'n-1', 'qualified', null)).resolves.toBeTruthy()
  })

  /**
   * #2323.23 — Gate PRÉSENTER : `needHasConsultantAgreement` (need-submission-gate.ts)
   * était codée et testée (17 tests) mais n'avait AUCUN appelant web ni api —
   * ce besoin pouvait passer « présenté au client » sans qu'aucun de ses
   * positionnements n'ait dépassé l'accord consultant. Ce lot branche la porte
   * ICI, sur `changeNeedStatus`, plutôt que sur un bouton web : aucun geste web
   * ne pose `client_review` aujourd'hui (seuls hold/reactivate/close_* le font,
   * `need-actions.ts`), et la porte d'état accepte n'importe quelle cible
   * atteignable depuis `on_hold`/`to_reactivate` sans respecter l'ordre — la
   * gate doit donc tenir au SEUL endroit qui voit toutes les routes,
   * conformément à la même règle que `canTransitionNeedStatus` juste au-dessus.
   */
  describe('#2323.23 — gate PRÉSENTER (accord consultant)', () => {
    it('refuse de présenter un besoin sans aucun positionnement passé l’accord consultant', async () => {
      const { service } = build(need({ status: 'submitted' }), [])
      await expect(service.changeNeedStatus('w-1', 'n-1', 'client_review', null)).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('refuse tant que les positionnements existants restent avant l’accord', async () => {
      const { service } = build(need({ status: 'submitted' }), [{ stage: 'shortlisted', substatus: null }])
      await expect(service.changeNeedStatus('w-1', 'n-1', 'client_review', null)).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('autorise dès qu’un positionnement a dépassé l’accord consultant', async () => {
      const { service } = build(need({ status: 'submitted' }), [{ stage: 'submitted', substatus: 'ready_to_present' }])
      const result = await service.changeNeedStatus('w-1', 'n-1', 'client_review', null)
      expect(result.status).toBe('client_review')
    })
  })

  /**
   * #2323.25 — Gate DÉMARRER : `needHasEngagedConsultant` — même diagnostic,
   * même branchement, sur la cible `won`.
   */
  describe('#2323.25 — gate DÉMARRER (consultant engagé)', () => {
    // #2942 — « négociation » est l'étape immédiatement avant « gagné » depuis
    // l'ajout d'« entretien »/« négociation » : la gate se vérifie depuis là,
    // pas depuis « en validation client » qui sauterait désormais deux crans.
    it('refuse de démarrer la mission d’un besoin sans consultant engagé', async () => {
      const { service } = build(need({ status: 'negotiation' }), [{ stage: 'interview', substatus: null }])
      await expect(service.changeNeedStatus('w-1', 'n-1', 'won', null)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('autorise dès qu’un positionnement est ACCEPTED (client a pris le profil)', async () => {
      const { service } = build(need({ status: 'negotiation' }), [
        { stage: 'accepted', substatus: 'converted_to_mission' },
      ])
      const result = await service.changeNeedStatus('w-1', 'n-1', 'won', null)
      expect(result.status).toBe('won')
    })
  })

  // #4270.4 (18/10) — un besoin en FORFAIT ENCADRÉ (#3547) se réalise avec les
  // salariés du client : gagné, il devient une mission suivie, sans staffing.
  describe('#4270.4 — le forfait encadré franchit ses portes sans consultant', () => {
    const supervised = (status: string) => need({ status, contract_kind: 'forfait', delivery_mode: 'supervised' })

    it('passe « gagné » sans aucun positionnement', async () => {
      const { service } = build(supervised('negotiation'), [])
      const result = await service.changeNeedStatus('w-1', 'n-1', 'won', null)
      expect(result.status).toBe('won')
    })

    it('passe « présenté au client » sans accord consultant', async () => {
      const { service } = build(supervised('submitted'), [])
      const result = await service.changeNeedStatus('w-1', 'n-1', 'client_review', null)
      expect(result.status).toBe('client_review')
    })

    it('sait dire NON : un forfait STAFFÉ garde la porte « gagné »', async () => {
      const { service } = build(need({ status: 'negotiation', contract_kind: 'forfait', delivery_mode: 'staffed' }), [])
      await expect(service.changeNeedStatus('w-1', 'n-1', 'won', null)).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  // #2320.23 (épopée #2967) — la transition s'écrit AUSSI dans le journal
  // commercial : état précédent, état suivant, auteur, preuve.
  it('journalise la transition — état, auteur et preuve (#2320.23)', async () => {
    const { service, commercialTransitions } = build(need({ status: 'client_review' }))
    await service.changeNeedStatus('w-1', 'n-1', 'lost', ' TJM incompatible ', 'user-42')
    expect(commercialTransitions.record).toHaveBeenCalledWith({
      workspaceId: 'w-1',
      subjectType: 'need',
      subjectId: 'n-1',
      fromState: 'client_review',
      toState: 'lost',
      actorId: 'user-42',
      proof: 'TJM incompatible',
      source: 'human',
    })
  })

  it('journalise un acteur `null` quand aucun n’est fourni — jamais deviné', async () => {
    const { service, commercialTransitions } = build(need())
    await service.changeNeedStatus('w-1', 'n-1', 'qualified', null)
    expect(commercialTransitions.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null, proof: null }))
  })

  // #2967 (lot V39) — la SOURCE de la transition : Laura propose, l'humain
  // valide ; une correction humaine exige son motif.
  it('journalise `laura` quand l’utilisateur valide une proposition de Laura — l’auteur reste l’humain', async () => {
    const { service, commercialTransitions } = build(need())
    await service.changeNeedStatus('w-1', 'n-1', 'qualified', null, 'user-42', 'laura')
    expect(commercialTransitions.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-42', source: 'laura' }),
    )
  })

  it('refuse une correction humaine sans motif, et n’écrit rien', async () => {
    const { service, needs, commercialTransitions } = build(need({ status: 'matching' }))
    await expect(
      service.changeNeedStatus('w-1', 'n-1', 'qualified', '  ', 'user-42', 'human_correction'),
    ).rejects.toThrow('Une correction doit porter son motif.')
    expect(needs.save).not.toHaveBeenCalled()
    expect(commercialTransitions.record).not.toHaveBeenCalled()
  })

  it('une correction humaine motivée s’écrit avec sa source et sa preuve', async () => {
    const { service, commercialTransitions } = build(need({ status: 'matching' }))
    await service.changeNeedStatus(
      'w-1',
      'n-1',
      'qualified',
      'Le client a rouvert la fiche de poste',
      'user-42',
      'human_correction',
    )
    expect(commercialTransitions.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'human_correction', proof: 'Le client a rouvert la fiche de poste' }),
    )
  })

  /**
   * #2320.1 (épopée #2795) — le journal s'écrivait déjà (tests ci-dessus)
   * mais AUCUNE route ne le relisait. `needStatusHistory` est la plus petite
   * tranche qui le rend observable.
   */
  describe('needStatusHistory — #2320.1', () => {
    it('relit la chronologie du besoin depuis le journal de la chaîne commerciale', async () => {
      const { service, needs, commercialTransitions } = build(need())
      const entries = [{ id: 't-1', subjectType: 'need', subjectId: 'n-1', fromState: null, toState: 'qualified' }]
      commercialTransitions.history.mockResolvedValueOnce(entries)

      const result = await service.needStatusHistory('w-1', 'n-1')

      expect(needs.findOne).toHaveBeenCalledWith({ where: { id: 'n-1', workspace_id: 'w-1' } })
      expect(commercialTransitions.history).toHaveBeenCalledWith('need', 'n-1', 'w-1')
      expect(result).toBe(entries)
    })

    it("refuse un besoin hors du workspace de l'appelant (jamais deviné, jamais une fuite cross-tenant)", async () => {
      const { service } = build(null)
      await expect(service.needStatusHistory('w-1', 'n-absent')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})

/**
 * La porte G3 — « Ce besoin est-il staffable ? » (PDF 2 §7.6).
 *
 * La porte était déclarée au catalogue des huit depuis le 19/08 et n'avait
 * AUCUN appelant. Ce que ces tests tiennent : un refus sans motif est refusé —
 * sans motif, le taux de besoins refusés par cause n'existe pas, et c'est le
 * seul chiffre que cette porte produit.
 */
describe('ProjectPipelineService — la porte G3', () => {
  const build = (need: Record<string, unknown> | null) => {
    const insert = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    }
    const needs = {
      findOne: jest.fn().mockResolvedValue(need),
      save: jest.fn(async (row: Record<string, unknown>) => row),
    }
    const unstaffable = { find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn(() => insert) }
    const service = new ProjectPipelineService(
      { findOne: jest.fn() } as never,
      needs as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      unstaffable as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    )
    return { service, needs, insert }
  }

  const need = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    workspace_id: 'w-1',
    project_id: 'p-1',
    title: 'Tech lead Java',
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'inconnu',
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    staffable: 'unknown',
    staffable_reason: null,
    staffable_decided_at: null,
    deadline_at: null,
    created_at: new Date('2026-08-19T10:00:00.000Z'),
    updated_at: new Date('2026-08-19T10:00:00.000Z'),
    ...over,
  })

  it('« oui » qualifie le besoin', async () => {
    const { service } = build(need())
    const result = await service.crossStaffableGate('w-1', 'n-1', 'yes', null)
    expect(result.staffable).toBe('yes')
    expect(result.status).toBe('qualified')
  })

  it('refuse un « non » sans motif', async () => {
    const { service } = build(need())
    await expect(service.crossStaffableGate('w-1', 'n-1', 'no', ' ')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('« non » clôt le besoin, et le motif voyage jusqu’au statut', async () => {
    const { service, insert } = build(need())
    const result = await service.crossStaffableGate('w-1', 'n-1', 'no', 'Zone non couverte')
    expect(result.status).toBe('lost')
    expect(result.status_reason).toBe('Zone non couverte')
    // Et il entre au catalogue de l'espace : c'est ainsi qu'une ESN se
    // constitue la liste de ce qu'elle ne sait pas faire.
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ label: 'Zone non couverte' }))
  })

  it('« pas encore » ne déplace rien', async () => {
    const { service } = build(need())
    const result = await service.crossStaffableGate('w-1', 'n-1', 'unknown', null)
    expect(result.status).toBe('to_qualify')
    expect(result.staffable).toBe('unknown')
  })

  it('ne fait pas reculer un besoin déjà plus avancé', async () => {
    const { service } = build(need({ status: 'shortlist_ready' }))
    const result = await service.crossStaffableGate('w-1', 'n-1', 'yes', null)
    expect(result.status).toBe('shortlist_ready')
  })
})
