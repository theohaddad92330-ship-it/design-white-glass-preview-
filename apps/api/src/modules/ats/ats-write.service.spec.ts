import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AtsWriteRequestEntity } from '../../database/entities/ats-write-request.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BoondManagerClient } from '../zero-layer/boondmanager.client'
import { AtsWriteService } from './ats-write.service'
import { AtsService } from './ats.service'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const REQUESTER = '11111111-1111-1111-1111-111111111111'
const MANAGER = '33333333-3333-3333-3333-333333333333'

describe('AtsWriteService', () => {
  let service: AtsWriteService
  let requests: { save: jest.Mock; create: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock }
  let context: { resolveActiveWorkspace: jest.Mock; getMembership: jest.Mock }
  let ats: { status: jest.Mock; resolveConfigFor: jest.Mock }
  let create: jest.Mock
  let update: jest.Mock
  let createAction: jest.Mock
  let refusalFor: jest.Mock

  const pending = (over: Partial<AtsWriteRequestEntity> = {}): AtsWriteRequestEntity =>
    ({
      id: 'r1',
      workspace_id: WORKSPACE,
      requested_by: REQUESTER,
      kind: 'update_tjm',
      payload: { resourceId: 'D-42', dailyRate: 700 },
      preview: 'Modifier un TJM dans l’ERP',
      state: 'pending',
      decided_by: null,
      decided_at: null,
      expires_at: new Date(Date.now() + 86_400_000),
      result: null,
      created_at: new Date(),
      ...over,
    }) as AtsWriteRequestEntity

  beforeEach(async () => {
    jest.restoreAllMocks()
    create = jest.fn().mockResolvedValue({ ok: true, detail: 'Écriture acceptée par l’ERP.' })
    update = jest.fn().mockResolvedValue({ ok: true, detail: 'Écriture acceptée par l’ERP.' })
    jest.spyOn(BoondManagerClient.prototype, 'create').mockImplementation(create as never)
    jest.spyOn(BoondManagerClient.prototype, 'update').mockImplementation(update as never)
    createAction = jest.fn().mockResolvedValue({ ok: true, detail: 'Écriture acceptée par l’ERP.' })
    refusalFor = jest.fn().mockReturnValue(null)
    jest.spyOn(BoondManagerClient.prototype, 'createAction').mockImplementation(createAction as never)
    jest.spyOn(BoondManagerClient.prototype, 'refusalFor').mockImplementation(refusalFor as never)
    jest.spyOn(BoondManagerClient.prototype, 'fetchDictionary').mockResolvedValue({ timezone: 'Europe/Paris' } as never)
    jest.spyOn(BoondManagerClient.prototype, 'fetchCurrentUserId').mockResolvedValue('7')

    requests = {
      save: jest.fn(async row => row),
      create: jest.fn(row => row),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(pending()),
      update: jest.fn().mockResolvedValue(undefined),
    }
    context = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' }),
      getMembership: jest.fn().mockResolvedValue({ role: 'owner' }),
    }
    ats = {
      status: jest.fn().mockResolvedValue({ connected: true }),
      resolveConfigFor: jest.fn().mockResolvedValue({ baseUrl: 'https://erp.test/api', searchParam: 'keywords' }),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AtsWriteService,
        { provide: getRepositoryToken(AtsWriteRequestEntity), useValue: requests },
        { provide: WorkspaceContextService, useValue: context },
        { provide: AtsService, useValue: ats },
      ],
    }).compile()

    service = moduleRef.get(AtsWriteService)
  })

  describe('demande', () => {
    it('n’écrit RIEN — elle crée une demande avec sa prévisualisation figée', async () => {
      const saved = await service.request(REQUESTER, 'update_tjm', {
        resourceId: 'D-42',
        consultantName: 'Marc',
        missionReference: 'M-42',
        dailyRate: 700,
      })
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(saved.state).toBe('pending')
      expect(saved.preview).toContain('Nouveau TJM : 700 €')
      expect(saved.preview).toContain('Ce montant alimente la facturation.')
    })

    it('refuse quand aucun ERP n’est branché', async () => {
      // Faire valider une écriture vers un système absent laisserait croire que
      // c'est parti.
      ats.status.mockResolvedValue({ connected: false })
      await expect(
        service.request(REQUESTER, 'update_need_status', { resourceId: 'O-1', needReference: 'B-1', status: 'Gagné' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('décision', () => {
    it('refuse l’auto-approbation, même par un propriétaire', async () => {
      // Un garde-fou que la personne pressée peut lever seule n'en est pas un.
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })
      await expect(service.decide(REQUESTER, 'r1', 'approve')).rejects.toBeInstanceOf(ForbiddenException)
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })

    it('refuse un décideur sans rôle de responsable', async () => {
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'member' })
      await expect(service.decide(MANAGER, 'r1', 'approve')).rejects.toBeInstanceOf(ForbiddenException)
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })

    it('une CORRECTION (update_tjm) émet un PATCH — l’id séparé du corps, jamais recopié dedans', async () => {
      const result = await service.decide(MANAGER, 'r1', 'approve')
      // La ressource (`D-42`) porte l'URL, pas le JSON écrit — le même motif
      // que les connecteurs CRM (`updateContact(token, id, input)`).
      expect(update).toHaveBeenCalledWith('/deliveries', 'D-42', { dailyRate: 700 })
      expect(create).not.toHaveBeenCalled()
      expect(result.state).toBe('approved')
    })

    it('une CRÉATION (create_mission) émet un POST vers la collection', async () => {
      requests.findOne.mockResolvedValue(
        pending({
          kind: 'create_mission',
          payload: { clientName: 'ACME', consultantName: 'Marc', startDate: '2026-09-01', dailyRate: 620 },
        }),
      )
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(create).toHaveBeenCalledWith('/deliveries', {
        clientName: 'ACME',
        consultantName: 'Marc',
        startDate: '2026-09-01',
        dailyRate: 620,
      })
      expect(update).not.toHaveBeenCalled()
      expect(result.state).toBe('approved')
    })

    it('une correction SANS identifiant est refusée — jamais transformée en création', async () => {
      // Une demande dont la charge utile ne porte pas de `resourceId` (donnée
      // corrompue, ou antérieure à cette règle) ne doit JAMAIS retomber sur
      // `create()` : elle doit atteindre `update()` avec un id vide, que
      // `BoondManagerClient.update()` refuse lui-même avant tout appel réseau.
      requests.findOne.mockResolvedValue(pending({ payload: { dailyRate: 700 } }))
      update.mockResolvedValue({
        ok: false,
        detail: 'Identifiant de ressource manquant — la correction est refusée, jamais transformée en création.',
        outcome: 'failed',
      })
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(update).toHaveBeenCalledWith('/deliveries', '', { dailyRate: 700 })
      expect(create).not.toHaveBeenCalled()
      expect(result.state).toBe('failed')
      expect(result.result).toMatch(/identifiant/i)
    })

    it('un refus n’écrit rien', async () => {
      const result = await service.decide(MANAGER, 'r1', 'reject')
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(result.state).toBe('rejected')
    })

    it('un échec de l’ERP laisse la demande visible comme ÉCHOUÉE, avec son message', async () => {
      // « On a essayé et ça n'est pas passé » est une information ; « rien ne
      // s'est passé » n'en est pas une.
      update.mockResolvedValue({ ok: false, detail: 'HTTP 422 champ inconnu', outcome: 'failed' })
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(result.state).toBe('failed')
      expect(result.result).toBe('HTTP 422 champ inconnu')
    })

    it('un `unknown` (requête partie sans réponse) n’est PAS dit comme un échec net, et n’est pas rejoué', async () => {
      // La différence compte : un `failed` ordinaire dit « refusé », un
      // `unknown` dit « on ne sait pas ». Confondre les deux laisserait croire
      // qu'on peut sans risque redemander la même correction.
      update.mockResolvedValue({ ok: false, detail: 'The operation was aborted', outcome: 'unknown' })
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(result.state).toBe('failed')
      expect(result.result).toMatch(/sans réponse/i)

      // Et cette demande a QUITTÉ `pending` : un deuxième `decide()` sur la
      // MÊME demande est refusé — elle n'est pas rejouée automatiquement.
      requests.findOne.mockResolvedValue({ ...pending(), state: 'failed' })
      await expect(service.decide(MANAGER, 'r1', 'approve')).rejects.toBeInstanceOf(BadRequestException)
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('refuse une demande expirée et la marque comme telle', async () => {
      requests.findOne.mockResolvedValue(pending({ expires_at: new Date(Date.now() - 1000) }))
      await expect(service.decide(MANAGER, 'r1', 'approve')).rejects.toThrow(/expiré/)
      expect(requests.update).toHaveBeenCalledWith({ id: 'r1' }, { state: 'expired' })
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })

    it('refuse une demande déjà tranchée', async () => {
      requests.findOne.mockResolvedValue(pending({ state: 'approved' }))
      await expect(service.decide(MANAGER, 'r1', 'approve')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('ne trouve pas une demande d’un autre espace', async () => {
      requests.findOne.mockResolvedValue(null)
      await expect(service.decide(MANAGER, 'r1', 'approve')).rejects.toThrow(/introuvable/)
    })
  })

  describe('log_call — compte rendu d’appel dans la fiche contact (#4692)', () => {
    const CALL = {
      contactId: '12',
      contactName: 'Julie Martin',
      typeOf: '61',
      title: 'Appel de qualification',
      summary: 'Budget validé, revoir fin novembre.',
      startDate: '2026-11-02T11:00:00.000Z',
    }
    const callRequest = (over: Partial<AtsWriteRequestEntity> = {}) =>
      pending({ kind: 'log_call', payload: { ...CALL }, ...over })

    it('la demande n’écrit RIEN et montre le résumé AVANT envoi', async () => {
      const saved = await service.request(REQUESTER, 'log_call', CALL)
      expect(createAction).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(saved.state).toBe('pending')
      expect(saved.preview).toContain('Contact : Julie Martin')
      expect(saved.preview).toContain('Résumé : Budget validé, revoir fin novembre.')
    })

    it('approuvée : POST /actions typé, sous la porte (l’id du contact, le responsable de la connexion)', async () => {
      requests.findOne.mockResolvedValue(callRequest())
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(createAction).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'Europe/Paris' }),
        expect.objectContaining({
          typeOf: '61',
          contactId: '12',
          mainManagerId: '7',
          companyId: null,
          text: CALL.summary,
        }),
      )
      expect(create).not.toHaveBeenCalled()
      expect(result.state).toBe('approved')
    })

    it('le demandeur ne valide pas lui-même : aucun envoi', async () => {
      requests.findOne.mockResolvedValue(callRequest())
      await expect(service.decide(REQUESTER, 'r1', 'approve')).rejects.toBeInstanceOf(ForbiddenException)
      expect(createAction).not.toHaveBeenCalled()
    })

    it('scope actions:write manquant : refus nommé, aucune lecture ni écriture', async () => {
      refusalFor.mockReturnValue('Le scope actions:write n’est pas accordé.')
      requests.findOne.mockResolvedValue(callRequest())
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(result.state).toBe('failed')
      expect(result.result).toContain('actions:write')
      expect(createAction).not.toHaveBeenCalled()
    })

    it('typeOf absent du dictionnaire : le refus du client remonte tel quel', async () => {
      createAction.mockResolvedValue({ ok: false, detail: 'Le type d’action « 61 » n’existe pas', outcome: 'failed' })
      requests.findOne.mockResolvedValue(callRequest())
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(result.state).toBe('failed')
      expect(result.result).toMatch(/n’existe pas/)
    })

    it('`unknown` : la demande quitte pending, un rejeu est refusé — l’action n’est jamais doublée', async () => {
      createAction.mockResolvedValue({ ok: false, detail: 'aborted', outcome: 'unknown' })
      requests.findOne.mockResolvedValue(callRequest())
      const result = await service.decide(MANAGER, 'r1', 'approve')
      expect(result.result).toMatch(/sans réponse/i)
      requests.findOne.mockResolvedValue(callRequest({ state: 'failed' }))
      await expect(service.decide(MANAGER, 'r1', 'approve')).rejects.toBeInstanceOf(BadRequestException)
      expect(createAction).toHaveBeenCalledTimes(1)
    })
  })

  describe('listPendingView — ce que l’écran a le droit de proposer', () => {
    it('un responsable qui n’est pas le demandeur peut trancher', async () => {
      requests.find.mockResolvedValue([pending()])
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })

      const [view] = await service.listPendingView(MANAGER)
      expect(view).toMatchObject({ id: 'r1', canDecide: true, requestedByYou: false, blockedReason: null })
      // La prévisualisation est celle qui a été FIGÉE, pas un recalcul.
      expect(view.preview).toBe('Modifier un TJM dans l’ERP')
    })

    it('le demandeur ne peut pas valider sa propre demande, et l’écran sait pourquoi AVANT le clic', async () => {
      requests.find.mockResolvedValue([pending()])
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })

      const [view] = await service.listPendingView(REQUESTER)
      expect(view.requestedByYou).toBe(true)
      expect(view.canDecide).toBe(false)
      expect(view.blockedReason).toMatch(/demandeur/)
    })

    it('un membre sans rôle de responsable ne se voit pas proposer de trancher', async () => {
      requests.find.mockResolvedValue([pending()])
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'member' })

      const [view] = await service.listPendingView(MANAGER)
      expect(view.canDecide).toBe(false)
      expect(view.blockedReason).toMatch(/responsable/)
    })

    it('ne rend rien de la charge utile — l’écran n’a besoin que du texte figé', async () => {
      requests.find.mockResolvedValue([pending({ payload: { dailyRate: 700, internalNote: 'ne pas diffuser' } })])
      const [view] = await service.listPendingView(MANAGER)
      expect(JSON.stringify(view)).not.toContain('ne pas diffuser')
    })

    // #2864 / #2856 — reste du lot précédent : la colonne existait sans
    // qu'aucune vue ne la porte.
    it('porte le circuit — confié et reporté, jamais `undefined` sans un `null` explicite', async () => {
      requests.find.mockResolvedValue([pending()])
      const [view] = await service.listPendingView(MANAGER)
      expect(view.assignedTo).toBeNull()
      expect(view.snoozedUntil).toBeNull()
    })

    it('porte le collègue confié et la date de report, en ISO', async () => {
      const until = new Date('2026-09-30T08:00:00.000Z')
      requests.find.mockResolvedValue([pending({ assigned_to: MANAGER, snoozed_until: until })])
      const [view] = await service.listPendingView(MANAGER)
      expect(view.assignedTo).toBe(MANAGER)
      expect(view.snoozedUntil).toBe('2026-09-30T08:00:00.000Z')
    })

    // #2855 (#2201.14) — une écriture ERP n'a aujourd'hui qu'un seul
    // appelant : le formulaire direct de l'utilisateur (`POST
    // /ats/write-requests`). `source` reste `null` par NATURE (un geste
    // direct, pas une absence de mesure) — mais le champ existe désormais,
    // comme pour la vue CRM.
    it('porte un target avec source `null` — geste direct, pas une absence de mesure', async () => {
      requests.find.mockResolvedValue([pending()])
      const [view] = await service.listPendingView(MANAGER)
      expect(view.target).toMatchObject({
        accountId: null,
        contactId: null,
        source: null,
      })
    })
  })

  // #2864 — reste du lot précédent : la délégation (`assigned_to`) ne
  // couvrait que `approval_requests`, puis `outbound_write_requests`. Même
  // colonne, même moteur — mais la « capacité à trancher » réutilisée est
  // `canDecide`, EXACTEMENT celle de `decide()` ci-dessus (n3, jamais
  // l'auteur), jamais `canAssign` (barème n0-n5 qui n'existe pas ici).
  describe('confier une écriture ERP à un collègue (#2864 reste)', () => {
    beforeEach(() => {
      requests.update.mockResolvedValue({ affected: 1 })
    })

    it('confie la demande à un responsable qui peut réellement la trancher', async () => {
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })
      context.getMembership.mockResolvedValue({ role: 'admin' })

      const assigned = await service.assign({ userId: REQUESTER, requestId: 'r1', assigneeId: MANAGER })

      expect(assigned.assigned_to).toBe(MANAGER)
    })

    it('refuse un destinataire sans rôle de responsable — il ne pourrait pas trancher', async () => {
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })
      context.getMembership.mockResolvedValue({ role: 'member' })

      await expect(service.assign({ userId: REQUESTER, requestId: 'r1', assigneeId: MANAGER })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('refuse un destinataire qui n’est PAS membre de cet espace', async () => {
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })
      context.getMembership.mockResolvedValue(null)

      await expect(
        service.assign({ userId: REQUESTER, requestId: 'r1', assigneeId: 'u-dehors' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('un tiers sans responsabilité sur ce circuit ne peut pas s’attribuer la demande d’un autre', async () => {
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'member' })

      await expect(service.assign({ userId: 'u-tiers', requestId: 'r1', assigneeId: MANAGER })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('`null` retire la délégation — le circuit d’origine reprend la main', async () => {
      requests.findOne.mockResolvedValue(pending({ assigned_to: MANAGER }))
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })

      const assigned = await service.assign({ userId: MANAGER, requestId: 'r1', assigneeId: null })

      expect(assigned.assigned_to).toBeNull()
    })
  })

  // #2856 — reste du lot précédent : le report (`snoozed_until`) ne couvrait
  // que `approval_requests`, puis `outbound_write_requests`. Même moteur
  // (`canSnooze`, réutilisé tel quel).
  describe('reporter une écriture ERP en attente (#2856 reste)', () => {
    beforeEach(() => {
      requests.update.mockResolvedValue({ affected: 1 })
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })
    })

    it('reporte la demande — elle reste `pending`, rien n’est décidé', async () => {
      requests.findOne.mockResolvedValue(pending())
      const until = new Date(Date.now() + 3600_000)

      const snoozed = await service.snooze({ userId: REQUESTER, requestId: 'r1', until })

      expect(snoozed.snoozed_until).toEqual(until)
      expect(snoozed.state).toBe('pending')
    })

    it('`null` réveille la demande', async () => {
      requests.findOne.mockResolvedValue(pending({ snoozed_until: new Date(Date.now() + 3600_000) }))

      const snoozed = await service.snooze({ userId: REQUESTER, requestId: 'r1', until: null })

      expect(snoozed.snoozed_until).toBeNull()
    })

    it('refuse un report qui dépasse l’expiration de la demande', async () => {
      requests.findOne.mockResolvedValue(pending({ expires_at: new Date(Date.now() + 3600_000) }))

      await expect(
        service.snooze({ userId: REQUESTER, requestId: 'r1', until: new Date(Date.now() + 7200_000) }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('un tiers sans responsabilité sur ce circuit ne peut pas reporter la demande d’un autre', async () => {
      requests.findOne.mockResolvedValue(pending())
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'member' })

      await expect(
        service.snooze({ userId: 'u-tiers', requestId: 'r1', until: new Date(Date.now() + 3600_000) }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  /**
   * #2864 / #2856 — `assignView`/`snoozeView` sont ce que le CONTRÔLEUR
   * appelle désormais : `assign`/`snooze` ci-dessus restaient inchangées à
   * dessein (elles rendent l'entité, et leurs tests avec), mais la ROUTE
   * rendait cette même entité brute au client — `payload` compris. Même
   * correctif que `CrmController.assignWrite`/`.snoozeWrite`.
   */
  describe('la vue rendue au contrôleur (#2864 / #2856)', () => {
    beforeEach(() => {
      requests.update.mockResolvedValue({ affected: 1 })
      context.resolveActiveWorkspace.mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' })
      context.getMembership.mockResolvedValue({ role: 'admin' })
    })

    it('assignView rend la vue, jamais la charge utile', async () => {
      requests.findOne.mockResolvedValue(pending())

      const view = await service.assignView({ userId: REQUESTER, requestId: 'r1', assigneeId: MANAGER })

      expect(view.assignedTo).toBe(MANAGER)
      expect(Object.prototype.hasOwnProperty.call(view, 'payload')).toBe(false)
    })

    it('snoozeView rend la vue, jamais la charge utile', async () => {
      requests.findOne.mockResolvedValue(pending())
      const until = new Date(Date.now() + 3600_000)

      const view = await service.snoozeView({ userId: REQUESTER, requestId: 'r1', until })

      expect(view.snoozedUntil).toBe(until.toISOString())
      expect(Object.prototype.hasOwnProperty.call(view, 'payload')).toBe(false)
    })
  })
})
