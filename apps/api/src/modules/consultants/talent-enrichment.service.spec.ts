import type { Repository } from 'typeorm'
import type { EnrichContactResponse } from '@bellum/contracts'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { IaClient } from '../ia/ia.client'
import { ConsultantsService } from './consultants.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

function baseTalent(overrides: Partial<ConsultantEntity> = {}): ConsultantEntity {
  return {
    id: TALENT,
    workspace_id: WORKSPACE,
    user_id: USER,
    full_name: 'Yanis Berthier',
    title: 'Ingénieur plateforme (CV 2023)',
    public_profile_url: 'https://linkedin.com/in/yanis-berthier',
    email: null,
    phone: null,
    last_enrichment_at: null,
    last_enrichment_source: null,
    ...overrides,
  } as ConsultantEntity
}

/**
 * #2570 — même patron de mock que `cv-parse.service.spec.ts` : un
 * `createQueryBuilder` qui rend la fiche fixture, un `save` qui capture ce qui
 * a été écrit, un client IA piloté par le test.
 */
function makeService(
  opts: { talent?: ConsultantEntity | null; enrich?: jest.Mock; searchPeopleByName?: jest.Mock } = {},
) {
  const talent = 'talent' in opts ? opts.talent : baseTalent()
  const saved: Record<string, unknown>[] = []
  const repo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => talent),
    })),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push({ ...row })
      return row
    }),
  } as unknown as Repository<ConsultantEntity>
  const enrichContact = opts.enrich ?? jest.fn()
  const searchPeopleByName = opts.searchPeopleByName ?? jest.fn()
  const ia = { enrichContact, searchPeopleByName } as unknown as IaClient
  const service = new ConsultantsService(repo, {} as never, {} as never, {} as never, ia, {} as never)
  return { service, saved, enrichContact, searchPeopleByName }
}

function ok(data: Partial<EnrichContactResponse['data']>): EnrichContactResponse {
  return {
    data: {
      matched: true,
      email: null,
      email_status: null,
      phone: null,
      linkedin_url: null,
      title: null,
      organization_name: null,
      ...data,
    },
  }
}

describe('ConsultantsService.enrichTalent — #2570', () => {
  it('refuse une fiche SANS profil LinkedIn — jamais une recherche par le seul nom', async () => {
    const { service, enrichContact } = makeService({
      talent: baseTalent({ public_profile_url: null }),
    })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: false })
    expect(outcome).toEqual({ ok: false, code: 'no_match_key' })
    expect(enrichContact).not.toHaveBeenCalled()
  })

  // #3831.1 — l'homonyme choisi (recherche libre par nom) débloque la fiche
  // SANS profil LinkedIn — jamais un rapprochement sur le seul nom.
  it("accepte l'apolloId d'un homonyme choisi quand la fiche n'a PAS de profil LinkedIn", async () => {
    const enrichContact = jest.fn(async () => ok({ title: 'Lead DevOps' }))
    const { service, enrichContact: spy } = makeService({
      talent: baseTalent({ public_profile_url: null }),
      enrich: enrichContact,
    })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: false, apolloId: 'apollo-123' })
    expect(outcome.ok).toBe(true)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ apolloId: 'apollo-123' }))
  })

  it("rend `not_found` sur une fiche hors du scope de l'appelant", async () => {
    const { service, enrichContact } = makeService({ talent: null })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: false })
    expect(outcome).toEqual({ ok: false, code: 'not_found' })
    expect(enrichContact).not.toHaveBeenCalled()
  })

  it('écrit le poste actuel avec sa provenance et sa date — cascade réelle', async () => {
    const enrichContact = jest.fn(async () =>
      ok({ title: 'Lead DevOps', linkedin_url: 'https://linkedin.com/in/yanis-berthier' }),
    )
    const { service, saved } = makeService({ enrich: enrichContact })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: false })
    expect(enrichContact).toHaveBeenCalledTimes(1)
    if (!outcome.ok) throw new Error('devait réussir')
    expect(outcome.consultant.title).toBe('Lead DevOps')
    expect(outcome.consultant.last_enrichment_source).toBe('pipeline')
    expect(outcome.written).toEqual([
      { field: 'title', previous: 'Ingénieur plateforme (CV 2023)', value: 'Lead DevOps', source: 'pipeline' },
    ])
    expect(saved[0]?.['last_enrichment_source']).toBe('pipeline')
    expect(saved[0]?.['last_enrichment_at']).toBeInstanceOf(Date)
  })

  it("NE réécrit PAS un titre qu'un humain a corrigé — une correction humaine gagne toujours", async () => {
    const enrichContact = jest.fn(async () => ok({ title: 'Titre proposé par le fournisseur' }))
    const { service, saved } = makeService({ enrich: enrichContact })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, { title: 'human' }, { demo: false })
    if (!outcome.ok) throw new Error('devait réussir (aucun champ écrit reste un succès)')
    expect(outcome.written).toEqual([])
    expect(outcome.consultant.title).toBe('Ingénieur plateforme (CV 2023)')
    expect(saved[0]?.['title']).toBe('Ingénieur plateforme (CV 2023)')
  })

  it('espace de DÉMONSTRATION : zéro appel réseau, source `demo`', async () => {
    const { service, enrichContact, saved } = makeService()
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: true })
    expect(enrichContact).not.toHaveBeenCalled()
    if (!outcome.ok) throw new Error('devait réussir')
    expect(outcome.consultant.last_enrichment_source).toBe('demo')
    expect(saved[0]?.['last_enrichment_source']).toBe('demo')
  })

  // #3831 — recette salle démo 09/10 (6072641916) : Camille Roussel (sans
  // LinkedIn) rend directement un résultat scripté, « Chercher par nom »
  // n'apparaît jamais — parce que la démo prenait la branche `demo` AVANT
  // la porte `buildEnrichmentInput`, donc ne refusait JAMAIS `no_match_key`.
  // Craft rule 9 : le geste qui a motivé ce lot (#3831.1, chercher sans
  // LinkedIn) doit AUSSI se montrer en démo — y compris son point d'entrée
  // naturel (clic « Enrichir » SANS apolloId sur une fiche sans LinkedIn).
  it('#3831 — espace de DÉMONSTRATION, fiche SANS LinkedIn, SANS apolloId : refuse `no_match_key` comme en prod (zéro appel réseau)', async () => {
    const { service, enrichContact, saved } = makeService({
      talent: baseTalent({ public_profile_url: null }),
    })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: true })
    expect(outcome).toEqual({ ok: false, code: 'no_match_key' })
    expect(enrichContact).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  // #3831 — recette prod 08/10 (6061894684) : sur une fiche RÉELLE sans
  // LinkedIn, le testeur n'a pas cliqué « Choisir » (le reveal est payant sur
  // un homonyme manifestement faux) — provenance/date restaient « non vues ».
  // Cette capacité DOIT être prouvable à coût nul, donc en démonstration :
  // fiche sans LinkedIn + homonyme CHOISI (apolloId) + espace de démo, dans
  // le MÊME appel — jamais testé combiné jusqu'ici (ni #2570 ni #3831.1 ne
  // couvraient les deux options ensemble).
  it('#3831 — espace de DÉMONSTRATION + homonyme choisi (apolloId) sur une fiche SANS LinkedIn : zéro appel réseau, provenance et date écrites', async () => {
    const { service, enrichContact, saved } = makeService({ talent: baseTalent({ public_profile_url: null }) })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: true, apolloId: 'demo-apollo-1' })
    expect(enrichContact).not.toHaveBeenCalled()
    if (!outcome.ok) throw new Error('devait réussir')
    expect(outcome.consultant.last_enrichment_source).toBe('demo')
    expect(saved[0]?.['last_enrichment_source']).toBe('demo')
    expect(saved[0]?.['last_enrichment_at']).toBeInstanceOf(Date)
  })

  it("rend `ia_failed` sur une panne fournisseur — RIEN n'est débité ni persisté sur cette panne", async () => {
    const enrichContact = jest.fn(async () => {
      throw new Error('boom')
    })
    const { service, saved } = makeService({ enrich: enrichContact })
    const outcome = await service.enrichTalent(TALENT, WORKSPACE, USER, {}, { demo: false })
    expect(outcome).toEqual({ ok: false, code: 'ia_failed' })
    expect(saved).toEqual([])
  })
})

describe('ConsultantsService.searchPeopleByName — #3831.1', () => {
  it('délègue à la cascade IA (tier GRATUIT) hors démonstration', async () => {
    const searchPeopleByName = jest.fn(async () => ({ status: 'ok' as const, hits: [] }))
    const { service, searchPeopleByName: spy } = makeService({ searchPeopleByName })
    const result = await service.searchPeopleByName('Yanis Berthier', 'Nordia', { demo: false })
    expect(spy).toHaveBeenCalledWith({ fullName: 'Yanis Berthier', organizationName: 'Nordia' })
    expect(result).toEqual({ status: 'ok', hits: [] })
  })

  it('espace de DÉMONSTRATION : zéro appel Apollo, un homonyme fictif', async () => {
    const searchPeopleByName = jest.fn()
    const { service, searchPeopleByName: spy } = makeService({ searchPeopleByName })
    const result = await service.searchPeopleByName('Yanis Berthier', undefined, { demo: true })
    expect(spy).not.toHaveBeenCalled()
    expect(result.status).toBe('ok')
  })
})
