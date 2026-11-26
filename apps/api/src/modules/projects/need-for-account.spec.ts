import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ProjectPipelineService } from './project-pipeline.service'

/**
 * #2558.1 — CRÉER UN BESOIN AU NOM D'UN COMPTE, avec ou sans projet.
 *
 * Ce qui mérite un test ici n'est pas « la méthode existe » — c'est ce qu'une
 * erreur ferait écrire en base :
 *
 *  · un besoin sans projet s'écrit avec son COMPTE et un `project_id` nul —
 *    jamais un projet inventé pour faire passer l'écriture ;
 *  · un compte d'un AUTRE espace est un 404, jamais une écriture chez le
 *    voisin — c'est la même garde que `assertProject` ;
 *  · un projet nommé en même temps que le compte doit lui APPARTENIR : sinon
 *    on écrirait un besoin dont le projet parle d'un autre client.
 */
describe('ProjectPipelineService.addNeedForAccount (#2558.1)', () => {
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'
  const OTHER_ACCOUNT = '44444444-4444-4444-8444-444444444444'
  const PROJECT = '22222222-2222-4222-8222-222222222222'

  function build(options: { accountRows?: unknown[]; projectRows?: unknown[] } = {}) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(options.accountRows ?? [{ id: ACCOUNT }])
      .mockResolvedValueOnce(options.projectRows ?? [{ account_id: ACCOUNT }])
    const saved: Record<string, unknown>[] = []
    const needs = {
      manager: { query },
      count: jest.fn().mockResolvedValue(0),
      create: (row: Record<string, unknown>) => row,
      save: jest.fn(async (row: Record<string, unknown>) => {
        saved.push(row)
        return { ...row, id: 'need-1', created_at: new Date(), updated_at: new Date() }
      }),
    }
    const service = new ProjectPipelineService(
      { manager: { query } } as never,
      needs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    )
    return { service, saved, query }
  }

  const input = { title: 'Développeur Java confirmé' }

  it('écrit le COMPTE et laisse le projet NUL — aucun projet n’est inventé pour faire passer l’écriture', async () => {
    const { service, saved } = build()
    await service.addNeedForAccount('w-1', ACCOUNT, input)
    expect(saved[0]?.['account_id']).toBe(ACCOUNT)
    expect(saved[0]?.['project_id']).toBeNull()
  })

  it('un compte d’un AUTRE espace est un 404, jamais une écriture chez le voisin', async () => {
    const { service } = build({ accountRows: [] })
    await expect(service.addNeedForAccount('w-1', ACCOUNT, input)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('avec un projet, le besoin le porte — rattacher dès la création est le cas fréquent', async () => {
    const { service, saved } = build()
    await service.addNeedForAccount('w-1', ACCOUNT, { ...input, project_id: PROJECT })
    expect(saved[0]?.['project_id']).toBe(PROJECT)
    expect(saved[0]?.['account_id']).toBe(ACCOUNT)
  })

  it('un projet qui appartient à un AUTRE compte est REFUSÉ — le besoin parlerait du mauvais client', async () => {
    const { service } = build({ projectRows: [{ account_id: OTHER_ACCOUNT }] })
    await expect(service.addNeedForAccount('w-1', ACCOUNT, { ...input, project_id: PROJECT })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('un projet introuvable dans l’espace est un 404 — pas un besoin écrit sans projet en silence', async () => {
    const { service } = build({ projectRows: [] })
    await expect(service.addNeedForAccount('w-1', ACCOUNT, { ...input, project_id: PROJECT })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

/**
 * #2174.11 (épopée #2939) — L'INTERLOCUTEUR, cinquième « colonne lue, jamais
 * écrite » de ce fichier (voir le docblock de `saveNeed`, `project-pipeline.
 * service.ts`) : `contact_id` était sélectionné par `open-needs.service.ts`
 * et déclaré par `projectNeedSchema` depuis toujours, sans qu'aucune porte de
 * création ne l'accepte. Un contact dont le compte diffère de celui du besoin
 * serait la mauvaise personne affichée sur le dossier client — même famille
 * de garde que le projet.
 *
 * Harnais SÉPARÉ de `build()` ci-dessus : le nombre d'appels à `query()` varie
 * ici avec la présence d'un `project_id` (aucun besoin d'un besoin vérifié ici
 * pour prouver la garde sur l'interlocuteur), et réutiliser le même harnais
 * ferait consommer par position la mauvaise réponse simulée.
 */
describe('ProjectPipelineService.addNeedForAccount — interlocuteur (#2174.11)', () => {
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'
  const CONTACT = '55555555-5555-4555-8555-555555555555'

  function build(options: { accountRows?: unknown[]; contactRows?: unknown[] }) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(options.accountRows ?? [{ id: ACCOUNT }])
      .mockResolvedValueOnce(options.contactRows ?? [{ id: CONTACT }])
    const saved: Record<string, unknown>[] = []
    const needs = {
      manager: { query },
      count: jest.fn().mockResolvedValue(0),
      create: (row: Record<string, unknown>) => row,
      save: jest.fn(async (row: Record<string, unknown>) => {
        saved.push(row)
        return { ...row, id: 'need-1', created_at: new Date(), updated_at: new Date() }
      }),
    }
    const service = new ProjectPipelineService(
      { manager: { query } } as never,
      needs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    )
    return { service, saved }
  }

  it('un interlocuteur de CE compte est écrit sur le besoin', async () => {
    const { service, saved } = build({ contactRows: [{ id: CONTACT }] })
    await service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java confirmé', contact_id: CONTACT })
    expect(saved[0]?.['contact_id']).toBe(CONTACT)
  })

  it('un interlocuteur d’un AUTRE compte est REFUSÉ — jamais la mauvaise personne sur le dossier', async () => {
    const { service } = build({ contactRows: [] })
    await expect(
      service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java confirmé', contact_id: CONTACT }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('sans interlocuteur choisi, `contact_id` reste NUL — jamais deviné', async () => {
    const { service, saved } = build({})
    await service.addNeedForAccount('w-1', ACCOUNT, { title: 'Développeur Java confirmé' })
    expect(saved[0]?.['contact_id']).toBeNull()
  })
})
