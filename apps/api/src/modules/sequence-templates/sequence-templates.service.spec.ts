import { ForbiddenException, NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { SequenceTemplatesService } from './sequence-templates.service'

function build(contact: Record<string, unknown> | null, profile: Record<string, unknown> | null = null) {
  const created = new Date('2026-10-06T10:00:00Z')
  const templates = {
    find: jest
      .fn()
      .mockResolvedValue([{ id: 't1', name: 'Campagne 1', sector: '3PL', tier_label: 'A', created_at: created }]),
  }
  const steps = {
    find: jest.fn().mockResolvedValue([
      {
        template_id: 't1',
        position: 0,
        delay_days: 0,
        subject: 'Hello {{firstName}}',
        body: 'Chez {{companyName}}\n{{signature}}',
      },
    ]),
  }
  const contacts = { findOne: jest.fn().mockResolvedValue(contact) }
  const accounts = { findOne: jest.fn().mockResolvedValue({ company_name: 'Acme 3PL' }) }
  const profiles = { findOne: jest.fn().mockResolvedValue(profile) }
  const service = new SequenceTemplatesService(
    templates as never,
    steps as never,
    contacts as never,
    accounts as never,
    profiles as never,
  )
  return { service, contacts, templates, steps }
}

// #3756 — appliquer « Campagne 1 » à un contact d'un compte 3PL.
describe('SequenceTemplatesService.prepare', () => {
  it('résout prénom et société : 1ʳᵉ étape préparée', async () => {
    const { service } = build(
      { full_name: 'Camille Durand', title: null, account_id: 'a1' },
      { email_signature: 'Louis' },
    )
    const out = await service.prepare('u1', 'ws1', 't1', 'c1')
    expect(out.blockedSteps).toEqual([])
    expect(out.steps[0]?.draft).toEqual({ subject: 'Hello Camille', body: 'Chez Acme 3PL\nLouis' })
  })

  it('contact sans prénom : étape bloquée, variable nommée, aucun brouillon', async () => {
    const { service } = build({ full_name: 'Durand', title: null, account_id: 'a1' }, { email_signature: 'Louis' })
    const out = await service.prepare('u1', 'ws1', 't1', 'c1')
    expect(out.blockedSteps[0]?.blocked.map(b => b.message)).toEqual(['Prénom manquant : {{firstName}}'])
    expect(out.steps[0]?.draft).toBeUndefined()
  })

  it('signature absente du profil : bloquée, jamais devinée', async () => {
    const { service } = build({ full_name: 'Camille Durand', title: null, account_id: 'a1' }, null)
    const out = await service.prepare('u1', 'ws1', 't1', 'c1')
    expect(out.blockedSteps[0]?.blocked.map(b => b.variable)).toEqual(['signature'])
  })

  // #4158.6 — la lecture suit l'espace actif, jamais `user_id` seul.
  it('#4158.6 — le contact est cherché par ESPACE (un collègue du même espace le voit)', async () => {
    const { service, contacts } = build({ full_name: 'Camille Durand', title: null, account_id: 'a1' })
    await service.prepare('collegue', 'ws1', 't1', 'c1')
    expect(contacts.findOne).toHaveBeenCalledWith({ where: { id: 'c1', workspace_id: 'ws1' } })
  })

  it('#4158.6 — un contact d’un AUTRE espace : 404', async () => {
    const { service } = build(null)
    await expect(service.prepare('u1', 'autre-espace', 't1', 'c1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('contact non possédé : introuvable', async () => {
    const { service } = build(null)
    await expect(service.prepare('u1', 'ws1', 't1', 'c1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

// #4158.30 — modèles partagés avec l'équipe / personnels : un personnel n'est visible que de son auteur.
describe('SequenceTemplatesService — partagé / personnel (#4158.30)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    workspace_id: 'ws1',
    name: 'Campagne 1',
    sector: null,
    tier_label: null,
    created_at: new Date('2026-10-06T10:00:00Z'),
    created_by: 'author',
    updated_at: null,
    visibility: 'team',
    ...over,
  })

  it('list : lit les modèles partagés de l’espace ET les siens, jamais le personnel d’un autre', async () => {
    const { service, templates } = build(null)
    await service.list('ws1', 'u1')
    expect(templates.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { workspace_id: 'ws1', visibility: 'team' },
          { workspace_id: 'ws1', created_by: 'u1' },
        ],
      }),
    )
  })

  it('list : rend la visibilité, l’auteur et la date de mise à jour', async () => {
    const { service, templates } = build(null)
    templates.find.mockResolvedValue([row({ visibility: 'personal', updated_at: new Date('2026-10-10T08:00:00Z') })])
    const [out] = await service.list('ws1', 'author')
    expect(out).toMatchObject({ visibility: 'personal', created_by: 'author', updated_at: '2026-10-10T08:00:00.000Z' })
  })

  it('un modèle d’avant la notion est partagé, sans auteur inventé', async () => {
    const { service, templates } = build(null)
    templates.find.mockResolvedValue([row({ created_by: null, visibility: undefined })])
    const [out] = await service.list('ws1', 'u1')
    expect(out).toMatchObject({ visibility: 'team', created_by: null, updated_at: null })
  })

  it('setVisibility : l’auteur reprend son modèle en personnel et la date de mise à jour bouge', async () => {
    const { service, templates } = build(null)
    const entity = row({ created_by: 'author' })
    Object.assign(templates, {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn(async (r: unknown) => r),
    })
    const out = await service.setVisibility('ws1', 'author', 't1', 'personal')
    expect(out.visibility).toBe('personal')
    expect(out.updated_at).not.toBeNull()
  })

  it('setVisibility : un collègue ne reprend pas le modèle partagé d’un autre — 403', async () => {
    const { service, templates } = build(null)
    Object.assign(templates, { findOne: jest.fn().mockResolvedValue(row({ created_by: 'author' })), save: jest.fn() })
    await expect(service.setVisibility('ws1', 'colleague', 't1', 'personal')).rejects.toBeInstanceOf(ForbiddenException)
    expect((templates as unknown as { save: jest.Mock }).save).not.toHaveBeenCalled()
  })

  it('setVisibility : un modèle sans auteur ne se reprend pas — il reste partagé', async () => {
    const { service, templates } = build(null)
    Object.assign(templates, { findOne: jest.fn().mockResolvedValue(row({ created_by: null })), save: jest.fn() })
    await expect(service.setVisibility('ws1', 'u1', 't1', 'personal')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('setVisibility / remove : le personnel d’un autre, ou un autre espace, est un 404', async () => {
    const { service, templates } = build(null)
    Object.assign(templates, { findOne: jest.fn().mockResolvedValue(null), delete: jest.fn(), save: jest.fn() })
    await expect(service.setVisibility('ws1', 'u1', 't1', 'team')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.remove('ws1', 'u1', 't1')).rejects.toBeInstanceOf(NotFoundException)
    expect((templates as unknown as { delete: jest.Mock }).delete).not.toHaveBeenCalled()
    const findOne = (templates as unknown as { findOne: jest.Mock }).findOne
    expect(findOne.mock.calls[0]?.[0].where).toEqual([
      { workspace_id: 'ws1', id: 't1', visibility: 'team' },
      { workspace_id: 'ws1', id: 't1', created_by: 'u1' },
    ])
  })

  it('prepare : appliquer le modèle personnel d’un collègue est un 404', async () => {
    const { service, templates } = build({ full_name: 'Camille Durand', title: null, account_id: 'a1' })
    templates.find.mockResolvedValue([])
    await expect(service.prepare('u1', 'ws1', 't1', 'c1')).rejects.toBeInstanceOf(NotFoundException)
    expect(templates.find).toHaveBeenCalledWith({
      where: [
        { workspace_id: 'ws1', id: 't1', visibility: 'team' },
        { workspace_id: 'ws1', id: 't1', created_by: 'u1' },
      ],
    })
  })
})

// #4426.7 — le classeur de campagnes : les scripts d'appel sont gardés, comptés, et LUS par la bibliothèque.
describe('SequenceTemplatesService.importLibrary — #4426.7 scripts d’appel et lecture', () => {
  async function workbookB64(): Promise<string> {
    const wb = new ExcelJS.Workbook()
    const content = wb.addWorksheet('contenu')
    content.addRow(['Campagne', 'Type / Étape', 'Titre / Intitulé', 'Contenu'])
    content.addRow([1, 'Mail 1 (J+0)', 'Premier', 'Bonjour'])
    content.addRow([1, 'Script : Accroche', '', 'Allô {{firstName}}'])
    content.addRow([1, 'Script : Le Liant', '', 'Suite'])
    return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
  }

  function harness() {
    const savedTemplates: Record<string, unknown>[] = []
    const savedSteps: Record<string, unknown>[] = []
    const qb = { where: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) }
    const templates = {
      createQueryBuilder: jest.fn(() => qb),
      delete: jest.fn(),
      create: jest.fn((v: Record<string, unknown>) => v),
      save: jest.fn(async (v: Record<string, unknown>) => {
        const row = { id: 't1', created_at: new Date('2026-10-22T08:00:00Z'), ...v }
        savedTemplates.push(row)
        return row
      }),
      find: jest.fn(async () => savedTemplates),
    }
    const steps = {
      create: jest.fn((v: Record<string, unknown>) => v),
      save: jest.fn(async (v: Record<string, unknown>[]) => {
        savedSteps.push(...v)
        return v
      }),
      find: jest.fn(async () => savedSteps),
    }
    const service = new SequenceTemplatesService(
      templates as never,
      steps as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { service, savedSteps }
  }

  it('les lignes « Script » sont enregistrées (kind call_script), comptées au bilan, et rendues en lecture à part', async () => {
    const { service, savedSteps } = harness()
    const result = await service.importLibrary('ws1', 'u1', {
      filename: 'Campagnes.xlsx',
      content_base64: await workbookB64(),
    })
    expect(result).toMatchObject({ templates: 1, steps: 1, scripts: 2, skipped: [] })
    expect(savedSteps.map(step => [step['kind'], step['subject']])).toEqual([
      ['email', 'Premier'],
      ['call_script', 'Accroche'],
      ['call_script', 'Le Liant'],
    ])
    // Lecture : ce que /outreach/sequence-templates rend pour la page Séquences.
    const [listed] = await service.list('ws1', 'u1')
    expect(listed?.name).toBe('1')
    expect(listed?.steps).toHaveLength(1)
    expect(listed?.call_scripts.map(script => script.title)).toEqual(['Accroche', 'Le Liant'])
  })
})
