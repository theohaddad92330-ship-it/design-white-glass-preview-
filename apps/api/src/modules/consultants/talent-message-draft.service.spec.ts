import { HttpException, NotFoundException } from '@nestjs/common'
import { HttpError } from '@bellum/errors'
import { TalentMessageDraftService } from './talent-message-draft.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

const CONSULTANT = {
  id: TALENT,
  full_name: 'Sophie Martin',
  title: 'Développeuse Java senior',
  availability: 'available',
  available_from: '2026-11-15',
  // un critère protégé présent sur la fiche : il ne doit JAMAIS partir au moteur
  photo_url: 'https://cdn.example/photo.jpg',
  years_experience: 12,
}
const NEED = {
  id: 'n1',
  account_id: 'a1',
  title: 'Tech lead Java',
  skills: [{ term: 'Java' }, { term: 'Kafka' }],
  start_on: '2026-11-16',
  duration_months: 6,
}

function makeService(
  opts: { demo?: boolean; need?: unknown; ia?: jest.Mock; consultant?: unknown; openNeeds?: unknown[] } = {},
) {
  const ia = {
    talentMessageDraft:
      opts.ia ??
      jest
        .fn()
        .mockResolvedValue({ success: true, data: { subject: 'Mission Java', body: 'Bonjour Sophie, une mission.' } }),
  }
  const consultants = { findOne: jest.fn().mockResolvedValue('consultant' in opts ? opts.consultant : CONSULTANT) }
  const skills = { find: jest.fn().mockResolvedValue([{ skill: 'Java' }, { skill: 'Kubernetes' }]) }
  const submissions = {
    findOne: jest.fn().mockResolvedValue(opts.need === null ? null : { need_id: 'n1' }),
  }
  const needs = {
    findOne: jest.fn().mockResolvedValue(opts.need === null ? null : (opts.need ?? NEED)),
    find: jest.fn().mockResolvedValue(opts.openNeeds ?? []),
  }
  const accounts = { findOne: jest.fn().mockResolvedValue({ company_name: 'SNCF' }) }
  const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(Boolean(opts.demo)) }
  const service = new TalentMessageDraftService(
    consultants as never,
    skills as never,
    submissions as never,
    needs as never,
    accounts as never,
    ia as never,
    workspaceContext as never,
  )
  return { service, ia: ia.talentMessageDraft }
}

describe('TalentMessageDraftService — #4347 Laura rédige le message au consultant', () => {
  it('rédige à partir du consultant, du besoin ET du client — sans critère protégé', async () => {
    const { service, ia } = makeService()
    const draft = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })

    expect(draft).toEqual({
      subject: 'Mission Java',
      body: 'Bonjour Sophie, une mission.',
      basis: { consultant: 'Sophie', need: 'Tech lead Java', client: 'SNCF' },
      objective: 'propose_mission',
    })
    const sent = ia.mock.calls[0]?.[0] as { consultant: Record<string, unknown>; need: Record<string, unknown> }
    expect(sent.consultant).toMatchObject({ first_name: 'Sophie', title: 'Développeuse Java senior' })
    expect(sent.need).toMatchObject({ title: 'Tech lead Java', client_name: 'SNCF', skills: ['Java', 'Kafka'] })
    expect(JSON.stringify(sent)).not.toMatch(/photo|years_experience|cdn\.example/)
  })

  // #4347.2 (recette prod 23/10) — Bellum et Laura tutoient : le registre n'est plus un réglage, le moteur
  // tutoie seul ; le brouillon ne peut donc plus être commandé en « vous » (aucun `formality` envoyé).
  it.each(['email', 'linkedin', 'phone'] as const)("n'envoie aucun registre sur le canal %s", async channel => {
    const { service, ia } = makeService()
    await service.draft(TALENT, WORKSPACE, USER, { channel })
    expect(ia.mock.calls[0]?.[0] as Record<string, unknown>).not.toHaveProperty('formality')
  })

  it('sans besoin rattaché, le message prend des nouvelles — le besoin est absent, jamais inventé', async () => {
    const { service, ia } = makeService({ need: null })
    const draft = await service.draft(TALENT, WORKSPACE, USER, { channel: 'linkedin' })

    expect(draft.basis).toEqual({ consultant: 'Sophie', need: null, client: null })
    expect((ia.mock.calls[0]?.[0] as { need?: unknown }).need).toBeUndefined()
  })

  it('une variante transmet le texte à réécrire', async () => {
    const { service, ia } = makeService()
    await service.draft(TALENT, WORKSPACE, USER, { channel: 'email', variant: 'shorter', previousBody: 'Avant' })

    expect(ia.mock.calls[0]?.[0]).toMatchObject({ variant: 'shorter', previousBody: 'Avant' })
  })

  it('un consultant d’un autre espace est introuvable', async () => {
    const { service } = makeService({ consultant: null })
    await expect(service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('moteur sans clé de modèle : erreur NOMMÉE 503, aucun texte inventé', async () => {
    const ia = jest
      .fn()
      .mockRejectedValue(new HttpError(503, '{"detail":{"code":"generation_unavailable"}}', false, 'POST /x'))
    const { service } = makeService({ ia })
    const error = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(503)
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'talent_message_unavailable' })
  })

  it('moteur en échec : 502 nommé, sans recopier le contenu', async () => {
    const ia = jest.fn().mockRejectedValue(new Error('Sophie SNCF boom'))
    const { service } = makeService({ ia })
    const error = (await service
      .draft(TALENT, WORKSPACE, USER, { channel: 'email' })
      .catch((e: unknown) => e)) as HttpException

    expect(error.getStatus()).toBe(502)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/Sophie|SNCF/)
    expect(error.getResponse()).toMatchObject({ code: 'talent_message_failed' })
  })

  it('en démo : le texte est SEMÉ (scripté), aucun appel au moteur', async () => {
    const { service, ia } = makeService({ demo: true })
    const draft = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })

    expect(ia).not.toHaveBeenCalled()
    expect(draft.body).toContain('Sophie')
    expect(draft.body).toContain('Tech lead Java')
    expect(draft.subject).toBeTruthy()
  })

  it('en démo, « Plus court » rend un texte plus court que l’original', async () => {
    const { service } = makeService({ demo: true })
    const full = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })
    const short = await service.draft(TALENT, WORKSPACE, USER, {
      channel: 'email',
      variant: 'shorter',
      previousBody: full.body,
    })

    expect(short.body.length).toBeLessThan(full.body.length)
  })

  describe('#4347.3 — l’objectif est DÉDUIT, modifiable', () => {
    const OPEN_NEED = { ...NEED, id: 'n2', title: 'Architecte Kafka', skills: [{ term: 'JAVA' }] }
    const UNRELATED = { ...NEED, id: 'n3', title: 'Chef de projet SAP', skills: [{ term: 'SAP' }] }

    it('un besoin positionné → « proposer une mission »', async () => {
      const { service } = makeService()
      expect((await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })).objective).toBe('propose_mission')
    })

    it('aucun positionnement mais un besoin ouvert qui partage une compétence → mission', async () => {
      const { service, ia } = makeService({ need: null, openNeeds: [UNRELATED, OPEN_NEED] })
      const draft = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })
      expect(draft.objective).toBe('propose_mission')
      expect(draft.basis.need).toBe('Architecte Kafka')
      expect((ia.mock.calls[0]?.[0] as { need?: { title: string } }).need?.title).toBe('Architecte Kafka')
    })

    it('aucun besoin qui matche → « revalider sa disponibilité », besoin absent du message', async () => {
      const { service, ia } = makeService({ need: null, openNeeds: [UNRELATED] })
      const draft = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email' })
      expect(draft.objective).toBe('revalidate_availability')
      expect(draft.basis.need).toBeNull()
      expect((ia.mock.calls[0]?.[0] as { need?: unknown }).need).toBeUndefined()
    })

    it('changer d’objectif → un nouveau brouillon rédigé pour CET objectif', async () => {
      const { service, ia } = makeService()
      const draft = await service.draft(TALENT, WORKSPACE, USER, {
        channel: 'email',
        objective: 'revalidate_availability',
      })
      expect(draft.objective).toBe('revalidate_availability')
      expect((ia.mock.calls[0]?.[0] as { need?: unknown }).need).toBeUndefined()
    })

    it('« proposer une mission » demandée sans aucun besoin : on le dit, on ne l’invente pas', async () => {
      const { service } = makeService({ need: null, openNeeds: [] })
      const draft = await service.draft(TALENT, WORKSPACE, USER, { channel: 'email', objective: 'propose_mission' })
      expect(draft.objective).toBe('revalidate_availability')
    })
  })
})
