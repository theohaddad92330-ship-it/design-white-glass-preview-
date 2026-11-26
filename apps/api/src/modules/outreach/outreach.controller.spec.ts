/**
 * OutreachController — surface HTTP fine au-dessus d'OutreachService.
 * Vérifie : guards JWT + RBAC câblés, permission `messages:send` déclarée sur
 * la création (et sur elle seule), principal issu du token (jamais du body),
 * et qu'AUCUNE route n'appelle une capacité d'envoi (le service ne reçoit que
 * des identifiants — l'envoi email n'existe pas sur cette surface).
 */
import {
  applySequenceTemplateAudienceRequestSchema,
  type CreateOutreachSequenceRequest,
  type CreateOutreachStepInput,
} from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OutreachController } from './outreach.controller'
import type { OutreachService } from './outreach.service'
import type { ListOutreachSequencesDto } from './dto/list-outreach-sequences.dto'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build() {
  const service = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    cancel: jest.fn(),
    stepDone: jest.fn(),
    addStep: jest.fn(),
    contactOf: jest.fn().mockResolvedValue(null),
  }
  // La capacité d'envoi RÉELLE, résolue par le contrôleur. `connected: true`
  // par défaut : les tests existants décrivent un utilisateur avec messagerie.
  const mailbox = { status: jest.fn().mockResolvedValue({ connected: true }) }
  // #2366.1 — la séquence écrit ses étapes e-mail dans le message CANONIQUE.
  // #2382.1/.2/.3 (réfuté 23/09) — `linkedStepIds` rend les étapes déjà
  // liées, vide par défaut : chaque test qui n'en dit pas plus part d'une
  // séquence sans aucun message canonique existant.
  const messages = { create: jest.fn().mockResolvedValue({}), linkedStepIds: jest.fn().mockResolvedValue(new Set()) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
    // `sales` tient déjà `messages:send` par son rôle (`ROLE_PERMISSIONS`) :
    // aucun test existant ne dépend d'un droit additionnel, vide par défaut.
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  }
  const contactStops = { stoppedAmong: jest.fn().mockResolvedValue(new Set()) }
  const sequenceTemplates = { prepare: jest.fn() }
  // #4016 L5 (reprise 20/10) — le mandat de l’espace ; aucun mandat vivant par défaut.
  const delegations = { awaitIfMandated: jest.fn().mockResolvedValue(false) }
  // Lot L-B — le socle multicanal ; les balayages ne font rien par défaut.
  const cadence = {
    sweep: jest.fn().mockResolvedValue(undefined),
    eligibility: jest.fn().mockResolvedValue([]),
    startVacation: jest.fn().mockResolvedValue(0),
    resumeAllMine: jest.fn().mockResolvedValue(0),
    releaseVacation: jest.fn().mockResolvedValue(0),
    ownedVacationPaused: jest.fn().mockResolvedValue([]),
    meetingBooked: jest.fn().mockResolvedValue(undefined),
    reorder: jest.fn().mockResolvedValue(undefined),
    declareOutcome: jest.fn().mockResolvedValue(undefined),
  }
  // #4418 — la cadence J+3/J+6/J+9 de contacts : « Marquer envoyé » la planifie comme un envoi Bellum.
  const manualCadence = { scheduleForContact: jest.fn().mockResolvedValue(undefined) }
  const controller = new OutreachController(
    service as unknown as OutreachService,
    mailbox as never,
    messages as never,
    workspaceContext as never,
    contactStops as never,
    sequenceTemplates as never,
    cadence as never,
    delegations as never,
    manualCadence as never,
  )
  return {
    controller,
    manualCadence,
    service,
    mailbox,
    messages,
    workspaceContext,
    sequenceTemplates,
    cadence,
    contactStops,
    delegations,
  }
}

describe('OutreachController', () => {
  it('est gardé par JwtGuard + WorkspacePermissionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', OutreachController) as unknown[]
    expect(guards).toContain(JwtGuard)
    expect(guards).toContain(WorkspacePermissionGuard)
  })

  it('déclare la permission RBAC messages:send sur la création (un viewer ne programme rien)', () => {
    const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, OutreachController.prototype.create) as unknown
    expect(permission).toEqual(['messages:send'])
  })

  it("déclare la MÊME permission sur l'ajout d'une étape — #2153.39, c'est le même geste que créer", () => {
    const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, OutreachController.prototype.addStep) as unknown
    expect(permission).toEqual(['messages:send'])
  })

  it('ne gate pas les lectures/mutations par la permission d’envoi (guard no-op sans métadonnée)', () => {
    for (const handler of [
      OutreachController.prototype.list,
      OutreachController.prototype.get,
      OutreachController.prototype.pause,
      OutreachController.prototype.resume,
      OutreachController.prototype.cancel,
      OutreachController.prototype.stepDone,
    ]) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBeUndefined()
    }
  })

  // #3756.2 — appliquer un modèle = une séquence MONO-contact étiquetée du nom
  // de la campagne, par le MÊME chemin que `create` (toutes ses gardes).
  describe('applyTemplate (#3756)', () => {
    it('déclare messages:send, comme la création', () => {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, OutreachController.prototype.applyTemplate)).toEqual([
        'messages:send',
      ])
    })

    it('crée une séquence mono-contact dont campaign_label = le nom de la campagne, et remonte les étapes bloquées', async () => {
      const { controller, service, sequenceTemplates } = build()
      const steps = [
        {
          kind: 'email',
          offset_days: 0,
          label: 'Campagne 1 — étape 1 (J+0)',
          blocked_variables: ['Prénom manquant : {{firstName}}'],
        },
      ]
      const blocked = [
        {
          position: 0,
          blocked: [{ variable: 'firstName', reason: 'missing', message: 'Prénom manquant : {{firstName}}' }],
        },
      ]
      sequenceTemplates.prepare.mockResolvedValueOnce({ name: 'Campagne 1', steps, blockedSteps: blocked })
      service.create.mockResolvedValueOnce({ id: 'seq-1', contact_id: 'c1', steps: [] })

      const out = await controller.applyTemplate('tpl-1', { contact_id: 'c1' }, user)

      expect(sequenceTemplates.prepare).toHaveBeenCalledWith('user-1', 'ws-1', 'tpl-1', 'c1')
      expect(service.create).toHaveBeenCalledWith(
        { contact_id: 'c1', name: 'Campagne 1', campaign_label: 'Campagne 1', steps },
        { userId: 'user-1', email: 'rep@esn.fr' },
        true,
      )
      expect(out.blocked_steps).toEqual(blocked)
      expect(out.sequence).toMatchObject({ id: 'seq-1' })
    })
  })

  // #3894.3 — c74 assoupli le 10/10/2026 par Louis : multi-contacts SUR DEMANDE
  // EXPLICITE. Une séquence par contact (jamais un second moteur), même
  // campaign_label, rien n'est envoyé.
  describe('applyTemplateToAudience (#3894.3)', () => {
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]

    it('déclare messages:send', () => {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, OutreachController.prototype.applyTemplateToAudience)).toEqual(
        ['messages:send'],
      )
    })

    it('trois contacts demandés → trois séquences sous le MÊME campaign_label, aucun envoi', async () => {
      const { controller, service, sequenceTemplates, mailbox } = build()
      sequenceTemplates.prepare.mockResolvedValue({ name: 'DSI grands comptes', steps: [], blockedSteps: [] })
      service.create.mockImplementation((dto: { contact_id: string }) =>
        Promise.resolve({ id: `seq-${dto.contact_id}`, contact_id: dto.contact_id, steps: [] }),
      )

      const out = await controller.applyTemplateToAudience(
        'tpl-1',
        { contact_ids: ids, explicit_multi_contact: true },
        user,
      )

      expect(service.create).toHaveBeenCalledTimes(3)
      for (const call of service.create.mock.calls) {
        expect(call[0]).toMatchObject({ campaign_label: 'DSI grands comptes' })
      }
      expect(out.campaign_label).toBe('DSI grands comptes')
      expect(out.items.map(item => item.sequence?.contact_id)).toEqual(ids)
      expect(mailbox.status).toHaveBeenCalled() // capacité lue, jamais d'appel d'envoi
    })

    it("l'étiquette demandée gagne sur le nom du modèle", async () => {
      const { controller, service, sequenceTemplates } = build()
      sequenceTemplates.prepare.mockResolvedValue({ name: 'Modèle', steps: [], blockedSteps: [] })
      service.create.mockResolvedValue({ id: 's', contact_id: 'x', steps: [] })
      const out = await controller.applyTemplateToAudience(
        'tpl-1',
        { contact_ids: ids, explicit_multi_contact: true, campaign_label: '  Ma campagne ' },
        user,
      )
      expect(out.campaign_label).toBe('Ma campagne')
      expect(service.create.mock.calls[0]?.[0]).toMatchObject({ campaign_label: 'Ma campagne' })
    })

    it('un refus sur un contact ne coupe pas les autres et se NOMME', async () => {
      const { controller, service, sequenceTemplates } = build()
      sequenceTemplates.prepare.mockResolvedValue({ name: 'C', steps: [], blockedSteps: [] })
      service.create
        .mockResolvedValueOnce({ id: 's1', contact_id: ids[0], steps: [] })
        .mockRejectedValueOnce(new Error('Contact désabonné'))
        .mockResolvedValueOnce({ id: 's3', contact_id: ids[2], steps: [] })
      const out = await controller.applyTemplateToAudience(
        'tpl-1',
        { contact_ids: ids, explicit_multi_contact: true },
        user,
      )
      expect(out.items.map(item => item.error)).toEqual([null, 'Contact désabonné', null])
      expect(out.items[1]?.sequence).toBeNull()
    })

    it('le schéma dit NON : un seul contact, ou sans demande explicite, ne crée aucune audience', () => {
      expect(
        applySequenceTemplateAudienceRequestSchema.safeParse({ contact_ids: [ids[0]], explicit_multi_contact: true })
          .success,
      ).toBe(false)
      expect(applySequenceTemplateAudienceRequestSchema.safeParse({ contact_ids: ids }).success).toBe(false)
      expect(
        applySequenceTemplateAudienceRequestSchema.safeParse({ contact_ids: ids, explicit_multi_contact: false })
          .success,
      ).toBe(false)
      expect(
        applySequenceTemplateAudienceRequestSchema.safeParse({
          contact_ids: [ids[0], ids[0]],
          explicit_multi_contact: true,
        }).success,
      ).toBe(false)
      expect(
        applySequenceTemplateAudienceRequestSchema.safeParse({ contact_ids: ids, explicit_multi_contact: true })
          .success,
      ).toBe(true)
    })
  })

  it('POST / forwarde le dto + le principal issu du token', async () => {
    const { controller, service } = build()
    const dto: CreateOutreachSequenceRequest = { contact_id: 'c1', template: 'prospection_3_touches' }
    service.create.mockResolvedValueOnce({ id: 'seq-1', steps: [] })

    await controller.create(dto, user)

    expect(service.create).toHaveBeenCalledWith(dto, { userId: 'user-1', email: 'rep@esn.fr' }, true)
  })

  it("la capacité d'envoi vient du serveur, et une lecture en échec vaut `false`", async () => {
    const { controller, service, mailbox } = build()
    service.create.mockResolvedValue({ id: 'seq-1', steps: [] })
    const dto: CreateOutreachSequenceRequest = { contact_id: 'c1', template: 'prospection_3_touches' }

    mailbox.status.mockResolvedValueOnce({ connected: false })
    await controller.create(dto, user)
    expect(service.create).toHaveBeenLastCalledWith(dto, expect.anything(), false)

    // Une lecture en ÉCHEC ne se lit pas « prêt à envoyer » : annoncer une
    // capacité sur une panne ferait préparer une séquence qui n'enverra rien,
    // et la panne ne se verrait qu'au premier envoi.
    mailbox.status.mockRejectedValueOnce(new Error('graph 503'))
    await controller.create(dto, user)
    expect(service.create).toHaveBeenLastCalledWith(dto, expect.anything(), false)
  })

  it('#2366.1 — chaque étape e-mail préparée devient UN message canonique, lié à son étape', async () => {
    const { controller, service, messages } = build()
    service.create.mockResolvedValueOnce({
      id: 'seq-1',
      contact_id: 'c1',
      steps: [
        { id: 'st-0', position: 0, kind: 'email', payload: { email_draft: { subject: 'Bonjour', body: 'Texte' } } },
        { id: 'st-1', position: 1, kind: 'reminder', payload: {} },
        { id: 'st-2', position: 2, kind: 'email', payload: { email_draft: null } },
        { id: 'st-3', position: 3, kind: 'email', payload: { email_draft: { subject: 'Relance', body: 'Suite' } } },
      ],
    })
    await controller.create({ contact_id: 'c1', template: 'prospection_3_touches' }, user)
    expect(messages.create).toHaveBeenCalledTimes(2)
    expect(messages.create).toHaveBeenNthCalledWith(
      1,
      { userId: 'user-1', workspaceId: 'ws-1', role: 'sales' },
      expect.objectContaining({
        contact_id: 'c1',
        intent: 'open_relationship',
        source: 'sequences',
        subject: 'Bonjour',
        body: 'Texte',
      }),
      expect.any(Function),
      'user',
      { sequence_id: 'seq-1', sequence_step_id: 'st-0' },
    )
    expect(messages.create).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ intent: 'follow_up', subject: 'Relance' }),
      expect.any(Function),
      'user',
      { sequence_id: 'seq-1', sequence_step_id: 'st-3' },
    )
  })

  it('GET / forwarde le filtre contact_id optionnel', async () => {
    const { controller, service } = build()
    service.list.mockResolvedValue([])

    await controller.list(user, { contact_id: 'c1' } as ListOutreachSequencesDto)
    expect(service.list).toHaveBeenCalledWith('user-1', true, 'c1', undefined)

    await controller.list(user, {} as ListOutreachSequencesDto)
    expect(service.list).toHaveBeenCalledWith('user-1', true, undefined, undefined)

    // #5029.1 — le Reverse Market lit « déjà proposé » par consultant.
    await controller.list(user, { consultant_id: 'cons-1' } as ListOutreachSequencesDto)
    expect(service.list).toHaveBeenCalledWith('user-1', true, undefined, 'cons-1')
  })

  /**
   * RÉFUTÉ en prod le 23/09 (2e recette, sur d61bf2983 — qui contient DÉJÀ le
   * correctif `addStep` ci-dessus) — #2382.1/.2/.3 : deux séquences THALES,
   * créées le 12/09, dix jours avant même l'existence de #2366.1 (22/09, le
   * message canonique à la CRÉATION). Ni `create` ni `addStep` ne tourneront
   * plus jamais dessus — aucun geste humain futur ne les rattrape. Le seul
   * geste qui reste est de les LIRE : rattrapé ICI, jamais par un script qui
   * rejouerait les données en bloc (« le rejeu ne part pas seul », et de toute
   * façon un rejeu en bloc toucherait tout le parc, pas le segment du lecteur).
   */
  it("GET / rattrape le message canonique d'une étape e-mail jamais liée, AU MOMENT DE LA LECTURE (#2382 réfuté 23/09, 2e recette)", async () => {
    const { controller, service, messages } = build()
    service.list.mockResolvedValueOnce([
      {
        id: 'seq-thales',
        contact_id: 'c1',
        steps: [
          { id: 'st-0', position: 0, kind: 'email', payload: { email_draft: { subject: 'Ancien', body: 'Texte' } } },
        ],
      },
    ])
    messages.linkedStepIds.mockResolvedValueOnce(new Set())

    await controller.list(user, {} as ListOutreachSequencesDto)

    expect(messages.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Ancien', body: 'Texte' }),
      expect.any(Function),
      'user',
      { sequence_id: 'seq-thales', sequence_step_id: 'st-0' },
    )
  })

  it("GET / n'écrit RIEN pour un rôle qui ne tient pas messages:send — une LECTURE n'écrit jamais à la place de qui n'a pas le droit", async () => {
    const { controller, service, messages, workspaceContext } = build()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'viewer' })
    service.list.mockResolvedValueOnce([
      {
        id: 'seq-thales',
        contact_id: 'c1',
        steps: [{ id: 'st-0', position: 0, kind: 'email', payload: { email_draft: { subject: 'X', body: 'Y' } } }],
      },
    ])
    messages.linkedStepIds.mockResolvedValueOnce(new Set())

    await controller.list(user, {} as ListOutreachSequencesDto)

    expect(messages.create).not.toHaveBeenCalled()
  })

  it('les mutations passent toujours le userId du token (scoping strict)', async () => {
    const { controller, service } = build()

    await controller.pause('seq-1', user)
    expect(service.pause).toHaveBeenCalledWith('user-1', 'seq-1', true)

    await controller.resume('seq-1', user)
    expect(service.resume).toHaveBeenCalledWith('user-1', 'seq-1', true)

    await controller.cancel('seq-1', user)
    expect(service.cancel).toHaveBeenCalledWith('user-1', 'seq-1', true)

    service.stepDone.mockResolvedValueOnce({ id: 'seq-1', contact_id: 'c1', steps: [] })
    await controller.stepDone('seq-1', 'step-1', user)
    expect(service.stepDone).toHaveBeenCalledWith('user-1', 'seq-1', 'step-1', true)
  })

  it("POST :id/steps forwarde l'étape + le principal issu du token (#2153.39)", async () => {
    const { controller, service } = build()
    const input: CreateOutreachStepInput = { kind: 'task', offset_days: 14 }
    service.addStep.mockResolvedValueOnce({ id: 'seq-1', contact_id: 'c1', steps: [] })

    await controller.addStep('seq-1', input, user)

    expect(service.addStep).toHaveBeenCalledWith('user-1', 'seq-1', input, true)
  })

  /**
   * RÉFUTÉ en prod le 23/09 — #2366.4/#2382.1/#2382.2/#2382.3. Le centre
   * d'approbation lisait bien les messages canoniques, mais `linkEmailSteps`
   * n'était appelé qu'à la CRÉATION (create/duplicate) : une étape e-mail
   * ajoutée à une séquence DÉJÀ créée (le cas courant — une séquence se
   * construit souvent au fil de l'eau) n'écrivait jamais son message
   * canonique, donc le centre restait vide pour toute séquence modifiée
   * après sa création.
   */
  it("POST :id/steps écrit aussi le message canonique d'une étape e-mail ajoutée après coup (#2382.1 réfuté 23/09)", async () => {
    const { controller, service, messages } = build()
    const input: CreateOutreachStepInput = { kind: 'email', offset_days: 7 }
    service.addStep.mockResolvedValueOnce({
      id: 'seq-1',
      contact_id: 'c1',
      steps: [
        { id: 'st-0', position: 0, kind: 'email', payload: { email_draft: { subject: 'Déjà lié', body: 'Ancien' } } },
        { id: 'st-1', position: 1, kind: 'email', payload: { email_draft: { subject: 'Nouveau', body: 'Texte' } } },
      ],
    })
    messages.linkedStepIds.mockResolvedValueOnce(new Set(['st-0']))

    await controller.addStep('seq-1', input, user)

    expect(messages.create).toHaveBeenCalledTimes(1)
    expect(messages.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Nouveau', body: 'Texte' }),
      expect.any(Function),
      'user',
      { sequence_id: 'seq-1', sequence_step_id: 'st-1' },
    )
  })

  /*
   * #4016 L5 (reprise 20/10) — délégation par défaut des étapes de séquence :
   * chaque message d'étape e-mail est PROPOSÉ au mandat `workspace_sequences`,
   * daté de l'échéance de son étape (le service ne le rattache que sous un
   * mandat signé et vivant ; le dispatcher relit l'étape à chaque envoi).
   */
  it('chaque message d’étape e-mail est proposé au mandat `workspace_sequences`, daté de son échéance', async () => {
    const { controller, service, messages, delegations } = build()
    service.addStep.mockResolvedValueOnce({
      id: 'seq-1',
      contact_id: 'c1',
      steps: [
        {
          id: 'st-1',
          position: 1,
          kind: 'email',
          due_at: '2026-10-10T08:00:00.000Z',
          payload: { email_draft: { subject: 'Nouveau', body: 'Texte' } },
        },
      ],
    })
    messages.create.mockResolvedValueOnce({ id: 'msg-st-1' })

    await controller.addStep('seq-1', { kind: 'email', offset_days: 7 }, user)

    expect(delegations.awaitIfMandated).toHaveBeenCalledWith(
      'ws-1',
      'msg-st-1',
      'workspace_sequences',
      new Date('2026-10-10T08:00:00.000Z'),
    )
  })

  it('POST :id/steps ne recrée jamais un message pour une étape déjà liée (idempotence)', async () => {
    const { controller, service, messages } = build()
    const input: CreateOutreachStepInput = { kind: 'task', offset_days: 14 }
    service.addStep.mockResolvedValueOnce({
      id: 'seq-1',
      contact_id: 'c1',
      steps: [
        { id: 'st-0', position: 0, kind: 'email', payload: { email_draft: { subject: 'Déjà lié', body: 'Ancien' } } },
      ],
    })
    messages.linkedStepIds.mockResolvedValueOnce(new Set(['st-0']))

    await controller.addStep('seq-1', input, user)

    expect(messages.create).not.toHaveBeenCalled()
  })
})

describe('OutreachController — lot L-B (#4165)', () => {
  const sequence = (over: Record<string, unknown> = {}) => ({ id: 'seq-1', steps: [], vacation_until: null, ...over })

  it('list balaie (reprise des vacances, saut LinkedIn) AVANT de lire', async () => {
    const { controller, service, cadence } = build()
    const order: string[] = []
    cadence.sweep.mockImplementation(async () => void order.push('sweep'))
    service.list.mockImplementation(async () => {
      order.push('list')
      return []
    })
    await controller.list(user, {} as ListOutreachSequencesDto)
    expect(order).toEqual(['sweep', 'list'])
    expect(cadence.sweep).toHaveBeenCalledWith('ws-1')
  })

  it('eligibility passe l’espace actif et le verdict RGPD, sans jamais faire confiance au corps', async () => {
    const { controller, cadence, contactStops } = build()
    contactStops.stoppedAmong.mockResolvedValue(new Set(['c2']))
    cadence.eligibility.mockResolvedValue([
      { contact_id: 'c1', contact_name: null, exclusions: [], client_status_known: false },
    ])
    const out = await controller.eligibility({ contact_ids: ['c1', 'c2'] }, user)
    expect(cadence.eligibility).toHaveBeenCalledWith('user-1', 'ws-1', ['c1', 'c2'], new Set(['c2']))
    expect(out.contacts).toHaveLength(1)
  })

  it('les gestes de mutation passent l’utilisateur du TOKEN (appartenance vérifiée par le service)', async () => {
    const { controller, service, cadence } = build()
    service.get.mockResolvedValue(sequence())
    await controller.meetingBooked('11111111-1111-4111-8111-111111111111', { step_id: 'st-9' }, user)
    expect(cadence.meetingBooked).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111', 'st-9')
    await controller.reorderSteps('11111111-1111-4111-8111-111111111111', { step_ids: ['a', 'b'] }, user)
    expect(cadence.reorder).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111', ['a', 'b'])
    await controller.declareOutcome(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      { outcome: 'accepted' },
      user,
    )
    expect(cadence.declareOutcome).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'accepted',
    )
  })

  it('vacation : met en pause avec la date demandée, reprend à la demande', async () => {
    const { controller, cadence } = build()
    cadence.startVacation.mockResolvedValue(3)
    cadence.resumeAllMine.mockResolvedValue(3)
    expect(await controller.startVacation({ until: '2026-10-28T07:00:00.000Z' }, user)).toEqual({ paused: 3 })
    expect(cadence.startVacation).toHaveBeenCalledWith('user-1', 'ws-1', new Date('2026-10-28T07:00:00.000Z'))
    expect(await controller.resumeVacation(user)).toEqual({ resumed: 3 })
    expect(cadence.resumeAllMine).toHaveBeenCalledWith('user-1', 'ws-1')
  })

  it('resume d’une séquence en pause vacances décale les échéances au lieu de la réactiver telle quelle', async () => {
    const { controller, service, cadence } = build()
    service.get.mockResolvedValue(sequence({ vacation_until: '2026-10-28T07:00:00.000Z' }))
    const owned = [{ id: 'seq-1' }]
    cadence.ownedVacationPaused.mockResolvedValue(owned)
    await controller.resume('11111111-1111-4111-8111-111111111111', user)
    expect(cadence.releaseVacation).toHaveBeenCalledWith(owned)
    expect(service.resume).not.toHaveBeenCalled()
  })

  it('resume d’une pause ordinaire reste celui d’avant', async () => {
    const { controller, service, cadence } = build()
    await controller.resume('11111111-1111-4111-8111-111111111111', user)
    expect(service.resume).toHaveBeenCalled()
    expect(cadence.releaseVacation).not.toHaveBeenCalled()
  })

  it('toutes les routes neuves du socle multicanal exigent la permission d’envoi (un viewer ne programme rien)', () => {
    for (const handler of [
      OutreachController.prototype.reorderSteps,
      OutreachController.prototype.eligibility,
      OutreachController.prototype.startVacation,
      OutreachController.prototype.resumeVacation,
      OutreachController.prototype.meetingBooked,
      OutreachController.prototype.declareOutcome,
    ]) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['messages:send'])
    }
  })
})

describe('OutreachController.stepDone — « Marquer envoyé / fait » planifie la cadence (#4418)', () => {
  const sequence = (kind: string) => ({ id: 'seq-1', contact_id: 'c1', steps: [{ id: 'step-1', kind }] })
  const contact = { id: 'c1', full_name: 'Sébastien Martin', account_id: 'acc-1' }

  it.each(['linkedin_message', 'linkedin_invite', 'call', 'email'])(
    'étape %s faite → les relances de cadence sont planifiées, ancrées sur le jour du geste',
    async kind => {
      const { controller, service, manualCadence } = build()
      service.stepDone.mockResolvedValueOnce(sequence(kind))
      service.contactOf.mockResolvedValueOnce(contact)
      await controller.stepDone('seq-1', 'step-1', user)
      expect(manualCadence.scheduleForContact).toHaveBeenCalledTimes(1)
      const [passed, userId, anchor] = manualCadence.scheduleForContact.mock.calls[0]
      expect(passed).toBe(contact)
      expect(userId).toBe('user-1')
      expect(anchor).toBeInstanceOf(Date)
    },
  )

  it('sait dire NON : une étape interne (rappel, tâche) ne planifie aucune relance', async () => {
    for (const kind of ['reminder', 'task']) {
      const { controller, service, manualCadence } = build()
      service.stepDone.mockResolvedValueOnce(sequence(kind))
      service.contactOf.mockResolvedValueOnce(contact)
      await controller.stepDone('seq-1', 'step-1', user)
      expect(manualCadence.scheduleForContact).not.toHaveBeenCalled()
    }
  })

  it('sans contact lisible → aucune cadence, le geste réussit quand même', async () => {
    const { controller, service, manualCadence } = build()
    service.stepDone.mockResolvedValueOnce(sequence('linkedin_message'))
    service.contactOf.mockResolvedValueOnce(null)
    await expect(controller.stepDone('seq-1', 'step-1', user)).resolves.toMatchObject({ id: 'seq-1' })
    expect(manualCadence.scheduleForContact).not.toHaveBeenCalled()
  })

  it('un échec de planification ne défait jamais le « fait » déjà enregistré', async () => {
    const { controller, service, manualCadence } = build()
    service.stepDone.mockResolvedValueOnce(sequence('call'))
    service.contactOf.mockResolvedValueOnce(contact)
    manualCadence.scheduleForContact.mockRejectedValueOnce(new Error('db'))
    await expect(controller.stepDone('seq-1', 'step-1', user)).resolves.toMatchObject({ id: 'seq-1' })
  })
})
