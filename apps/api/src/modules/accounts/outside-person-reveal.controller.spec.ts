import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { failure, success } from '@bellum/utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountsService } from './accounts.service'
import { OutsidePersonRevealController } from './outside-person-reveal.controller'

/**
 * #4421.16 (décision Louis 25/10) — « Obtenir l'e-mail » sous une personne proposée par Laura hors de l'espace.
 * UN appel : le compte retrouvé dans l'espace actif (ou ajouté au portefeuille par le chemin de Découvrir, sans
 * analyse), la personne devenue contact, l'enrichissement EXISTANT mis en file (même débit que
 * `POST contacts/:id/enrich`, e-mail seul). Droits : `contacts:enrich` ET `records:write` ; espace re-prouvé.
 */
const WS = 'ws-1'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const CONTACT = '22222222-2222-4222-8222-222222222222'
const body = { company_name: 'SII', siren: '308491101', person_ref: 'p-ines', name: 'Inès D.', title: 'Recrutement' }

function build(over: { role?: string; demo?: boolean; found?: unknown; visible?: boolean } = {}) {
  const account = { id: ACCOUNT, company_name: 'SII SAS', siren: '308491101', status: 'prospect' }
  const accounts = {
    findInWorkspaceForOutsidePerson: jest.fn().mockResolvedValue('found' in over ? over.found : account),
    findOneForWorkspace: jest
      .fn()
      .mockResolvedValue(over.visible === false ? failure({ code: 'not_found', message: 'absent' }) : success(account)),
    addToPortfolio: jest.fn().mockResolvedValue(success({ account: { ...account, id: ACCOUNT }, created: true })),
  }
  const contacts = { ensureOutsidePerson: jest.fn().mockResolvedValue(success({ id: CONTACT, full_name: 'Inès D.' })) }
  const enrichment = { enqueue: jest.fn().mockResolvedValue(success({ job_id: `enrich-${CONTACT}`, state: 'queued' })) }
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: over.role ?? 'sales' }),
    assertPermission: jest.fn().mockImplementation(async () => {
      if (over.role === 'no_records') throw new ForbiddenException('Rôle insuffisant pour cette action')
      return {}
    }),
    isDemoWorkspace: jest.fn().mockResolvedValue(over.demo === true),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  }
  const controller = new OutsidePersonRevealController(
    accounts as never,
    contacts as never,
    enrichment as never,
    workspace as never,
    { scopeFor: jest.fn() } as never,
  )
  return { controller, accounts, contacts, enrichment, workspace }
}

const user = { userId: 'user-1' } as never

describe('#4421.16 — POST outside-people/reveal', () => {
  it('compte de l’espace retrouvé, contact créé, enrichissement e-mail mis en file — rien d’autre', async () => {
    const { controller, accounts, contacts, enrichment } = build()

    const res = await controller.reveal(body, user)

    expect(res).toEqual({ account_id: ACCOUNT, contact_id: CONTACT, job_id: `enrich-${CONTACT}`, state: 'queued' })
    expect(accounts.findInWorkspaceForOutsidePerson).toHaveBeenCalledWith(WS, {
      siren: '308491101',
      company_name: 'SII',
    })
    expect(accounts.addToPortfolio).not.toHaveBeenCalled()
    expect(contacts.ensureOutsidePerson).toHaveBeenCalledWith(ACCOUNT, 'user-1', {
      fullName: 'Inès D.',
      title: 'Recrutement',
      apolloId: 'p-ines',
    })
    // Le nom masqué ne part pas comme nom de famille : la référence suffit à retrouver la personne.
    expect(enrichment.enqueue).toHaveBeenCalledWith(CONTACT, 'user-1', {
      first_name: 'Inès',
      organization_name: 'SII SAS',
      only: 'email',
    })
  })

  it('compte absent de l’espace : ajouté au portefeuille par le chemin de Découvrir (aucune analyse)', async () => {
    const { controller, accounts } = build({ found: null })
    const res = await controller.reveal(body, user)
    expect(accounts.addToPortfolio).toHaveBeenCalledWith('user-1', { company_name: 'SII', siren: '308491101' })
    expect(res.account_id).toBe(ACCOUNT)
  })

  it('REFUS 403 — rôle sans contacts:enrich : la garde refuse avant le contrôleur', async () => {
    const declared = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, OutsidePersonRevealController.prototype.reveal)
    expect(declared).toEqual(['contacts:enrich'])
    const { workspace } = build({ role: 'finance' })
    const guard = new WorkspacePermissionGuard(new Reflector(), workspace as never)
    const ctx = {
      getHandler: () => OutsidePersonRevealController.prototype.reveal,
      getClass: () => OutsidePersonRevealController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'user-1' } }) }),
    }
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('REFUS 403 — contacts:enrich sans records:write : rien n’est écrit, rien n’est enrichi', async () => {
    const { controller, accounts, contacts, enrichment, workspace } = build({ role: 'no_records' })
    await expect(controller.reveal(body, user)).rejects.toBeInstanceOf(ForbiddenException)
    expect(workspace.assertPermission).toHaveBeenCalledWith('user-1', WS, 'records:write')
    expect(accounts.addToPortfolio).not.toHaveBeenCalled()
    expect(contacts.ensureOutsidePerson).not.toHaveBeenCalled()
    expect(enrichment.enqueue).not.toHaveBeenCalled()
  })

  it('REFUS 404 — un compte d’un autre espace (account_id hors de l’espace actif)', async () => {
    const { controller, contacts, enrichment } = build({ visible: false })
    await expect(controller.reveal({ ...body, account_id: ACCOUNT }, user)).rejects.toBeInstanceOf(NotFoundException)
    expect(contacts.ensureOutsidePerson).not.toHaveBeenCalled()
    expect(enrichment.enqueue).not.toHaveBeenCalled()
  })

  it('REFUS 404 — un compte retrouvé hors du périmètre de l’appelant n’est pas écrit', async () => {
    const { controller, contacts } = build({ visible: false })
    await expect(controller.reveal(body, user)).rejects.toBeInstanceOf(NotFoundException)
    expect(contacts.ensureOutsidePerson).not.toHaveBeenCalled()
  })

  it('crédits épuisés : le refus de l’enrichissement existant ressort tel quel (402), sans chiffre', async () => {
    const { controller, enrichment } = build()
    enrichment.enqueue.mockResolvedValue(failure({ code: 'insufficient_credits', message: 'Crédits insuffisants' }))
    const err = await controller.reveal(body, user).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpException)
    expect((err as HttpException).getStatus()).toBe(402)
  })

  it('démonstration : aucun compte, aucun contact, aucun appel — le geste est refusé côté serveur', async () => {
    const { controller, accounts, contacts, enrichment } = build({ demo: true })
    const err = await controller.reveal(body, user).catch((e: unknown) => e)
    expect((err as HttpException).getStatus()).toBe(409)
    expect(accounts.findInWorkspaceForOutsidePerson).not.toHaveBeenCalled()
    expect(contacts.ensureOutsidePerson).not.toHaveBeenCalled()
    expect(enrichment.enqueue).not.toHaveBeenCalled()
  })
})

describe('#4421.16 — AccountsService.findInWorkspaceForOutsidePerson', () => {
  const build2 = (bySiren: unknown, byName: unknown[]) => {
    const repo = { findOne: jest.fn().mockResolvedValue(bySiren), find: jest.fn().mockResolvedValue(byName) }
    const service = new AccountsService(repo as never, {} as never, {} as never, {} as never)
    return { service, repo }
  }

  it('le SIREN passe avant le nom', async () => {
    const { service, repo } = build2({ id: 'a-siren' }, [])
    expect(await service.findInWorkspaceForOutsidePerson(WS, { siren: '308491101', company_name: 'SII' })).toEqual({
      id: 'a-siren',
    })
    expect(repo.findOne).toHaveBeenCalledWith({ where: { workspace_id: WS, siren: '308491101' } })
  })

  it('le nom NORMALISÉ joint « SII SAS » et « S.I.I. » ? non : seulement la même clé (forme juridique neutralisée)', async () => {
    const { service } = build2(null, [
      { id: 'a-other', company_name: 'SII Consulting', status: 'prospect' },
      { id: 'a-sii', company_name: 'SII SAS', status: 'prospect' },
    ])
    expect(await service.findInWorkspaceForOutsidePerson(WS, { company_name: 'sii' })).toMatchObject({ id: 'a-sii' })
  })

  it('dit NON : aucun compte de même clé → null (jamais un rapprochement approximatif)', async () => {
    const { service } = build2(null, [{ id: 'a-other', company_name: 'SII Consulting', status: 'prospect' }])
    expect(await service.findInWorkspaceForOutsidePerson(WS, { company_name: 'SII' })).toBeNull()
  })
})
