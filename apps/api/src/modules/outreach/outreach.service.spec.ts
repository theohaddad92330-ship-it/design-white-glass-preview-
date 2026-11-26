/**
 * OutreachService — séquences d'outreach multi-touch (roadmap §8).
 *
 * Invariants vérifiés ici :
 *  - la création (template ou custom) produit des étapes DATÉES correctes
 *    (J0/J+4/J+10 ancrés Europe/Paris) et programme les rappels via l'Action
 *    Router (`schedule_reminder`) — JAMAIS un intent `send_email`, jamais
 *    d'envoi automatique : l'étape email snapshotte le brouillon + rappel ;
 *  - step done → la séquence avance ; dernière étape → `completed` ;
 *  - pause/resume/cancel (cancel skippe les étapes restantes) ;
 *  - scoping : création = contact possédé strict ; lectures = workspace ;
 *    mutations = propriétaire strict.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ActionRouterService, ActionPrincipal } from '../action-router/action-router.service'
import type { ContactStopService } from '../contact-stop/contact-stop.service'
import { IsNull } from 'typeorm'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { OutreachService } from './outreach.service'

const principal: ActionPrincipal = { userId: 'user-1', email: 'rep@esn.fr' }

const ownedContact = {
  id: 'c1',
  user_id: 'user-1',
  workspace_id: 'ws-1',
  account_id: 'acc-1',
  full_name: 'Jean Dupont',
  email: 'jean@corp.fr',
  email_message: { subject: 'Bonjour', body: 'Brouillon préparé.' },
} as unknown as ContactEntity

function build() {
  const sequences = createMockRepository<OutreachSequenceEntity>()
  const steps = createMockRepository<OutreachSequenceStepEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const userActions = createMockRepository<UserActionEntity>()
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    listMembers: jest.fn().mockResolvedValue([]),
  }
  const actionRouter = {
    dispatch: jest.fn().mockResolvedValue({ type: 'schedule_reminder', status: 'done', externalRef: 'ua-1' }),
  }

  // save() renvoie l'entité avec un id — la séquence et les steps en ont besoin.
  let seq = 0
  sequences.save.mockImplementation(async (e: Partial<OutreachSequenceEntity>) => ({
    id: e.id ?? 'seq-1',
    created_at: new Date('2026-07-16T10:00:00.000Z'),
    ...e,
  }))
  steps.save.mockImplementation(
    async (e: Partial<OutreachSequenceStepEntity> | Partial<OutreachSequenceStepEntity>[]) =>
      Array.isArray(e)
        ? e.map(row => ({ id: `step-${++seq}`, ...row }))
        : { id: (e.id as string) ?? `step-${++seq}`, ...e },
  )

  // Le compte du contact : sert à comparer l'employeur détecté au nom de
  // l'entreprise (garde `RISQUE`). Sans nom, la garde ne bloque rien.
  const accounts = {
    findOne: jest.fn().mockResolvedValue({ id: 'acc-1', company_name: 'EDF' }),
    find: jest.fn().mockResolvedValue([]),
  }
  // Les seuils d'approbation de l'espace. `{}` = les défauts du contrat, donc
  // le niveau `n2_user_approval` que le clic de l'utilisateur satisfait : le
  // chemin reste celui d'avant pour tout espace qui n'a rien relevé.
  const workspaces = { findOne: jest.fn().mockResolvedValue({}) }
  // La porte « ne me contactez plus ». `null` = personne n'a rien demandé,
  // l'état de départ de tous les tests existants.
  const contactStops = { verdict: jest.fn().mockResolvedValue(null) }
  const service = new OutreachService(
    sequences as never,
    steps as never,
    contacts as never,
    userActions as never,
    accounts as never,
    workspaces as never,
    workspaceContext as unknown as WorkspaceContextService,
    actionRouter as unknown as ActionRouterService,
    contactStops as unknown as ContactStopService,
  )
  return {
    service,
    sequences,
    steps,
    contacts,
    userActions,
    accounts,
    workspaces,
    workspaceContext,
    actionRouter,
    contactStops,
  }
}

describe('OutreachService.create', () => {
  beforeEach(() => {
    // 16 juillet 2026, 06:00 UTC (08:00 à Paris) — les échéances J+n sont
    // déterministes : la date calendaire Europe/Paris du jour + offset, 07:00 UTC.
    jest.useFakeTimers({ now: new Date('2026-07-16T06:00:00.000Z') })
  })
  afterEach(() => jest.useRealTimers())

  it('REFUSE d’armer une séquence sur quelqu’un qui a demandé qu’on cesse', async () => {
    // T-169 : ce chemin ne consultait AUCUN verdict d'arrêt. On pouvait
    // inscrire un désabonné dans une cadence de quatre touches ; le refus
    // n'arrivait qu'au clic d'envoi de la première, après que l'écran eut
    // affiché une séquence active et ses échéances.
    const { service, contacts, sequences, steps, contactStops } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    contactStops.verdict.mockResolvedValueOnce({
      reason: 'do_not_call',
      since: '2026-07-10T09:00:00.000Z',
      motion: 'cold_call_qualification',
    })

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true),
    ).rejects.toThrow(ForbiddenException)

    // Rien n'est persisté : ni la séquence, ni ses étapes.
    expect(sequences.save).not.toHaveBeenCalled()
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('#2380.66 — REFUSE d’armer une séquence sur un contact dont le compte est écarté (`parked`, hors cible)', async () => {
    // La porte G1 arrêtait déjà les séquences ACTIVES d'un compte devenu
    // `parked` en cours de route (`applyAccountExcluded`, appelé par `list()`)
    // — mais rien n'empêchait d'en ARMER une NOUVELLE sur un contact dont le
    // compte était déjà écarté au moment de la création.
    const { service, contacts, sequences, steps, accounts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    accounts.findOne.mockResolvedValueOnce({
      id: 'acc-1',
      company_name: 'EDF',
      priority_gate: 'parked',
      gate_reason: 'Pas notre secteur',
    })

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true),
    ).rejects.toThrow(/hors cible.*Pas notre secteur/)

    expect(sequences.save).not.toHaveBeenCalled()
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('#2380.66 — un compte `pending`/`prioritised` (ou sans compte) n’est pas bloqué', async () => {
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', company_name: 'EDF', priority_gate: 'prioritised' })

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true),
    ).resolves.toBeTruthy()
  })

  it('l’arrêt est le PREMIER contrôle — aucun aveu de risque ne le lève', async () => {
    // `acknowledge_risk` lève la garde « employeur détecté ». Il ne doit
    // évidemment pas lever un refus prononcé par une personne.
    const { service, contacts, sequences, contactStops } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    contactStops.verdict.mockResolvedValueOnce({
      reason: 'unsubscribed',
      since: '2026-07-01T00:00:00.000Z',
      motion: null,
    })

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches', acknowledge_risk: true }, principal, true),
    ).rejects.toThrow(/ne plus être contacté/)
    expect(sequences.save).not.toHaveBeenCalled()
  })

  it('REFUSE une 2ᵉ séquence ACTIVE sur le même contact — message clair, pas une 500', async () => {
    // #1935.17 — aucune garde n'existait : deux séquences actives pouvaient
    // s'armer sur la même personne, chacune écrivant ses propres échéances.
    const { service, contacts, sequences, steps } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    sequences.findOne.mockResolvedValueOnce({
      id: 'seq-existing',
      contact_id: 'c1',
      workspace_id: 'ws-1',
      status: 'active',
      name: 'Prospection — 3 touches',
    })

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true),
    ).rejects.toThrow(BadRequestException)

    expect(sequences.save).not.toHaveBeenCalled()
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('#2380.50 — collision avec la séquence d’un COLLÈGUE : le refus PROPOSE une collaboration', async () => {
    const { service, contacts, sequences, workspaceContext } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    sequences.findOne.mockResolvedValueOnce({
      id: 'seq-existing',
      contact_id: 'c1',
      workspace_id: 'ws-1',
      status: 'active',
      name: 'Prospection — 3 touches',
      user_id: 'user-2',
    })
    workspaceContext.listMembers.mockResolvedValueOnce([
      { userId: 'user-2', email: 'alice@esn.fr', fullName: 'Alice Martin', role: 'member', isSelf: false },
    ])

    let caught: unknown
    try {
      await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BadRequestException)
    const body = (caught as BadRequestException).getResponse() as Record<string, unknown>
    expect(body).toMatchObject({
      code: 'outreach_sequence_collision',
      sequenceName: 'Prospection — 3 touches',
      contactName: 'Jean Dupont',
      ownerName: 'Alice Martin',
      ownerEmail: 'alice@esn.fr',
    })
    expect(workspaceContext.listMembers).toHaveBeenCalledWith('user-1')
  })

  it('#2380.50 — collision avec SA PROPRE séquence : aucune proposition de collaboration', async () => {
    const { service, contacts, sequences, workspaceContext } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    sequences.findOne.mockResolvedValueOnce({
      id: 'seq-existing',
      contact_id: 'c1',
      workspace_id: 'ws-1',
      status: 'active',
      name: 'Prospection — 3 touches',
      user_id: 'user-1',
    })

    let caught: unknown
    try {
      await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BadRequestException)
    const body = (caught as BadRequestException).getResponse() as Record<string, unknown>
    expect(body).not.toHaveProperty('code')
    expect(workspaceContext.listMembers).not.toHaveBeenCalled()
  })

  // #2380.67 — LE FORÇAGE : un motif écrit lève le refus de collision, mais
  // met l'ANCIENNE séquence en pause plutôt que de la contourner — jamais
  // deux cadences actives sur la même personne (#1935.17), la raison même
  // du refus qu'il lève.
  describe('#2380.67 — forcer une collision avec un motif écrit', () => {
    it('sans motif, le refus reste ENTIER — comportement inchangé', async () => {
      const { service, contacts, sequences } = build()
      contacts.findOne.mockResolvedValueOnce(ownedContact)
      sequences.findOne.mockResolvedValueOnce({
        id: 'seq-existing',
        contact_id: 'c1',
        workspace_id: 'ws-1',
        status: 'active',
        name: 'Prospection — 3 touches',
        user_id: 'user-2',
      })

      await expect(
        service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true),
      ).rejects.toThrow(BadRequestException)
      expect(sequences.save).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
    })

    it('un motif VIDE (espaces seuls) ne lève rien — même refus qu’un motif absent', async () => {
      const { service, contacts, sequences } = build()
      contacts.findOne.mockResolvedValueOnce(ownedContact)
      sequences.findOne.mockResolvedValueOnce({
        id: 'seq-existing',
        contact_id: 'c1',
        workspace_id: 'ws-1',
        status: 'active',
        name: 'Prospection — 3 touches',
        user_id: 'user-2',
      })

      await expect(
        service.create(
          { contact_id: 'c1', template: 'prospection_3_touches', force_justification: '   ' },
          principal,
          true,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('un motif écrit met l’ANCIENNE séquence en PAUSE et crée la nouvelle', async () => {
      const { service, contacts, sequences } = build()
      contacts.findOne.mockResolvedValueOnce(ownedContact)
      const active = {
        id: 'seq-existing',
        contact_id: 'c1',
        workspace_id: 'ws-1',
        status: 'active',
        name: 'Prospection — 3 touches',
        user_id: 'user-2',
      }
      sequences.findOne.mockResolvedValueOnce(active)

      const result = await service.create(
        {
          contact_id: 'c1',
          template: 'prospection_3_touches',
          force_justification: 'Le client a explicitement demandé à reprendre contact avec ce commercial.',
        },
        principal,
        true,
      )

      expect(sequences.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'seq-existing', status: 'paused' }))
      expect(result.status).toBe('active')
      expect(result.forced_over_sequence_id).toBe('seq-existing')
      expect(result.force_justification).toBe(
        'Le client a explicitement demandé à reprendre contact avec ce commercial.',
      )
    })

    it('sans collision, un motif fourni « au cas où » ne s’écrit nulle part', async () => {
      const { service, contacts, sequences } = build()
      contacts.findOne.mockResolvedValueOnce(ownedContact)
      sequences.findOne.mockResolvedValueOnce(null)

      const result = await service.create(
        { contact_id: 'c1', template: 'prospection_3_touches', force_justification: 'motif inutile' },
        principal,
        true,
      )
      expect(result.forced_over_sequence_id).toBeNull()
      expect(result.force_justification).toBeNull()
    })
  })

  it('une séquence non ACTIVE (en pause, terminée) sur le même contact ne bloque rien', async () => {
    const { service, contacts, sequences } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    sequences.findOne.mockResolvedValueOnce(null)

    const result = await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)
    expect(result.status).toBe('active')
  })

  it('crée la séquence template avec 3 étapes datées J0 / J+4 / J+10 (ancre Europe/Paris)', async () => {
    const { service, contacts, steps } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    // Les jours CALENDAIRES (l'existant) : l'ancre et le glissement de week-end
    // d'avant le lot L-B. Le défaut d'une séquence NEUVE est testé plus bas.
    const result = await service.create(
      { contact_id: 'c1', template: 'prospection_3_touches', delay_unit: 'calendar_days' },
      principal,
      true,
    )

    expect(result.name).toBe('Prospection — 3 touches')
    expect(result.status).toBe('active')
    expect(result.steps.map(s => s.kind)).toEqual(['email', 'reminder', 'email'])
    expect(result.steps.map(s => s.due_at)).toEqual([
      '2026-07-16T07:00:00.000Z', // J0
      '2026-07-20T07:00:00.000Z', // J+4
      '2026-07-27T07:00:00.000Z', // J+10 tombe un dimanche (26/07) : #2378.4 glisse au lundi
    ])
    expect(result.steps.map(s => s.position)).toEqual([0, 1, 2])
    expect(result.next_step?.position).toBe(0)
    // Les steps sont persistés `pending`.
    const persisted = steps.save.mock.calls[0][0] as Partial<OutreachSequenceStepEntity>[]
    expect(persisted.every(row => row.status === 'pending')).toBe(true)
  })

  it("une étape email PRÉPARE (snapshot du brouillon + rappel « envoi manuel ») et n'envoie JAMAIS", async () => {
    const { service, actionRouter, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const result = await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)

    // Le payload de l'étape email snapshotte le brouillon PRÉPARÉ — pas d'envoi.
    const emailStep = result.steps[0]
    expect(emailStep.payload['email_draft']).toEqual({ subject: 'Bonjour', body: 'Brouillon préparé.' })
    expect(emailStep.payload['draft_available']).toBe(true)

    // Un rappel daté par étape, TOUS en `schedule_reminder` — jamais `send_email`.
    expect(actionRouter.dispatch).toHaveBeenCalledTimes(3)
    for (const call of actionRouter.dispatch.mock.calls) {
      expect(call[0].type).toBe('schedule_reminder')
      expect(call[0].type).not.toBe('send_email')
      expect(call[0].contactId).toBe('c1')
    }
    // Le rappel de l'étape email dit explicitement « envoi manuel ».
    expect(actionRouter.dispatch.mock.calls[0][0].note).toContain('envoi manuel')
    // La référence du rappel journalisé est conservée sur l'étape.
    expect(emailStep.payload['reminder_action_id']).toBe('ua-1')
  })

  it('sans brouillon préparé, le snapshot est honnête (draft_available: false) — rien inventé', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce({ ...ownedContact, email_message: null } as unknown as ContactEntity)

    const result = await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)

    expect(result.steps[0].payload['email_draft']).toBeNull()
    expect(result.steps[0].payload['draft_available']).toBe(false)
  })

  it('accepte des étapes custom datées (offset_days et due_at explicite), triées par échéance', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const result = await service.create(
      {
        contact_id: 'c1',
        name: 'Custom',
        steps: [
          { kind: 'task', due_at: '2026-08-01T09:00:00.000Z', label: 'Appel de suivi' },
          { kind: 'reminder', offset_days: 2 },
        ],
      },
      principal,
      true,
    )

    // Le reminder J+2 tombe un samedi (18/07) : #2378.4 le glisse au lundi
    // 20/07, qui passe toujours AVANT la tâche du 01/08 (tri par échéance).
    expect(result.steps.map(s => s.kind)).toEqual(['reminder', 'task'])
    expect(result.steps[0].due_at).toBe('2026-07-20T07:00:00.000Z')
    expect(result.steps[1].due_at).toBe('2026-08-01T09:00:00.000Z')
    expect(result.steps[1].payload['label']).toBe('Appel de suivi')
    expect(result.name).toBe('Custom')
  })

  it('#2378.4 — une échéance qui tombe un dimanche glisse au jour ouvré suivant (lundi)', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const result = await service.create(
      { contact_id: 'c1', steps: [{ kind: 'task', offset_days: 3 }], delay_unit: 'calendar_days' },
      principal,
      true,
    )

    // J+3 depuis jeudi 16/07 tombe un dimanche (19/07) : reporté au lundi 20/07.
    expect(result.steps[0].due_at).toBe('2026-07-20T07:00:00.000Z')
  })

  it('#2378.4 — une échéance qui tombe un samedi glisse aussi au lundi (pas au dimanche)', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const result = await service.create(
      { contact_id: 'c1', steps: [{ kind: 'task', offset_days: 2 }] },
      principal,
      true,
    )

    // J+2 depuis jeudi 16/07 tombe un samedi (18/07) : reporté au lundi 20/07.
    expect(result.steps[0].due_at).toBe('2026-07-20T07:00:00.000Z')
  })

  it('J0 créé après l’heure d’échéance → « maintenant », jamais une étape née en retard', async () => {
    jest.setSystemTime(new Date('2026-07-16T15:00:00.000Z')) // après 07:00 UTC
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const result = await service.create(
      { contact_id: 'c1', steps: [{ kind: 'reminder', offset_days: 0 }] },
      principal,
      true,
    )

    expect(result.steps[0].due_at).toBe('2026-07-16T15:00:00.000Z')
  })

  it("#4158.47 — refuse un contact d'un AUTRE espace (404), la portée est l'espace actif, pas le propriétaire", async () => {
    const { service, contacts, sequences, actionRouter } = build()
    contacts.findOne.mockResolvedValueOnce(null)

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true),
    ).rejects.toThrow(NotFoundException)
    expect(contacts.findOne).toHaveBeenCalledWith({ where: { id: 'c1', workspace_id: 'ws-1' } })
    expect(sequences.save).not.toHaveBeenCalled()
    expect(actionRouter.dispatch).not.toHaveBeenCalled()
  })

  it('un rappel en échec ne fait pas échouer la création (best-effort, la séquence porte ses échéances)', async () => {
    const { service, contacts, actionRouter } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    actionRouter.dispatch.mockRejectedValue(new Error('journal indisponible'))

    const result = await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)

    expect(result.status).toBe('active')
    expect(result.steps).toHaveLength(3)
  })
})

describe('OutreachService — lectures (scope workspace)', () => {
  it('list scope les séquences par workspace actif et résout le nom du contact dans le même scope', async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        workspace_id: 'ws-1',
        user_id: 'user-1',
        contact_id: 'c1',
        name: 'Prospection — 3 touches',
        status: 'active',
        created_at: new Date('2026-07-16T10:00:00.000Z'),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([
      {
        id: 'step-1',
        sequence_id: 'seq-1',
        position: 0,
        due_at: new Date('2026-07-16T07:00:00.000Z'),
        kind: 'email',
        payload: { label: 'Email préparé (J0)' },
        status: 'pending',
        done_at: null,
        engagement_signal: null,
        engagement_signal_at: null,
      } as OutreachSequenceStepEntity,
    ])
    contacts.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' } as ContactEntity])

    const result = await service.list('user-1', true, 'c1')

    expect(sequences.find).toHaveBeenCalledWith({
      where: { workspace_id: 'ws-1', contact_id: 'c1' },
      order: { created_at: 'DESC' },
    })
    // Résolution des noms scoppée au workspace (pas de fuite cross-tenant).
    expect(contacts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
    )
    expect(result).toHaveLength(1)
    expect(result[0].contact_name).toBe('Jean Dupont')
    expect(result[0].next_step?.id).toBe('step-1')
  })

  it('#1515 — la ligne porte le POSTE et le COMPTE, lus dans la même requête que le nom', async () => {
    const { service, sequences, steps, contacts, accounts } = build()
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        contact_id: 'c1',
        name: 'Compte froid — email',
        status: 'active',
        created_at: new Date(),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([
      { id: 'c1', full_name: 'Jean Dupont', title: 'DSI', account_id: 'a1' } as ContactEntity,
    ])
    accounts.find.mockResolvedValueOnce([{ id: 'a1', company_name: 'NOVA LOGISTIQUE' }])

    const result = await service.list('user-1', true)

    expect(result[0].contact_role).toBe('DSI')
    expect(result[0].account_id).toBe('a1')
    expect(result[0].account_name).toBe('NOVA LOGISTIQUE')
    // ⚠️ La PHOTO ne voyage pas : c'est un critère protégé, et cette charge
    // utile sert aussi à choisir qui contacter.
    const select = contacts.find.mock.calls[0]?.[0]?.select as string[] | undefined
    expect(select).not.toContain('photo_url')
    // ⚠️ Le compte est résolu en UNE requête pour toutes les lignes : une
    // résolution par ligne ferait N+1 sur un écran qui en affiche cinquante.
    expect(accounts.find).toHaveBeenCalledTimes(1)
  })

  it('#1515 — un compte hors du périmètre de lecture reste SANS nom, jamais « inconnu »', async () => {
    const { service, sequences, steps, contacts, accounts } = build()
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        contact_id: 'c1',
        name: 'Prospection',
        status: 'active',
        created_at: new Date(),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([
      { id: 'c1', full_name: 'Jean Dupont', title: null, account_id: 'a-hors-scope' } as ContactEntity,
    ])
    // Le compte existe côté contact, mais la lecture scoppée ne le rend pas.
    accounts.find.mockResolvedValueOnce([])

    const result = await service.list('user-1', true)

    expect(result[0].account_id).toBe('a-hors-scope')
    expect(result[0].account_name).toBeNull()
    // Et le poste absent reste NULL : c'est l'écran qui dit « non renseigné ».
    expect(result[0].contact_role).toBeNull()
  })

  it("get refuse une séquence hors du workspace de l'appelant", async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValueOnce(null)

    await expect(service.get('user-1', 'seq-other', true)).rejects.toThrow(NotFoundException)
    expect(sequences.findOne).toHaveBeenCalledWith({ where: { id: 'seq-other', workspace_id: 'ws-1' } })
  })

  it('#2202.48/#2202.51 — cancelReasons ordonne sur `occurred_at`, la seule colonne de date que porte `outreach_transitions`', async () => {
    // Régression : la requête ordonnait sur `created_at`, une colonne qui
    // n'existe pas sur cette table (seule `occurred_at` y est définie,
    // migration 1795999204817) — chaque lecture d'une séquence annulée
    // aurait fait échouer `list`/`get` sur une vraie base Postgres.
    const { service, sequences, steps, contacts } = build()
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        contact_id: 'c1',
        name: 'Prospection',
        status: 'cancelled',
        created_at: new Date(),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' } as ContactEntity])
    sequences.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM outreach_transitions') ? [{ subject_id: 'seq-1', cause: 'opt_out' }] : [],
    )

    const result = await service.list('user-1', true)

    const cancelReasonSql = sequences.query.mock.calls.map(c => c[0] as string).find(sql => sql.includes('DISTINCT ON'))
    expect(cancelReasonSql).toContain('occurred_at DESC')
    expect(cancelReasonSql).not.toContain('created_at')
    expect(result[0].cancel_reason).toBe('opt_out')
  })
})

describe('OutreachService — #2374.23 arrêt sur délai maximal atteint (max_delay_reached)', () => {
  it("une séquence ACTIVE dont la dernière étape est en retard de plus de 14 jours s'arrête automatiquement, cause `max_delay_reached`", async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM horizons')) {
        return [{ id: 'seq-1', workspace_id: 'ws-1', user_id: 'user-1', previous_status: 'active' }]
      }
      return []
    })
    // Reflète l'état APRÈS le balayage : le SELECT qui suit relit une base où
    // `applyMaxDelayReached` a déjà écrit `cancelled`.
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        workspace_id: 'ws-1',
        user_id: 'user-1',
        contact_id: 'c1',
        name: 'Nurturing',
        status: 'cancelled',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' } as ContactEntity])

    const result = await service.list('user-1', true)

    const calls = sequences.query.mock.calls.map(c => c as [string, unknown[]])
    expect(calls.some(([sql]) => sql.includes('FROM horizons'))).toBe(true)
    const skipCall = calls.find(([sql]) => sql.includes('UPDATE outreach_sequence_steps'))
    expect(skipCall?.[1]).toEqual([['seq-1']])
    const insertCall = calls.find(([sql]) => sql.includes('INSERT INTO outreach_transitions'))
    expect(insertCall?.[1]).toEqual(['ws-1', 'user-1', 'seq-1', 'active'])
    expect(insertCall?.[0]).toContain("'max_delay_reached'")
    expect(result[0].status).toBe('cancelled')
  })

  it("une séquence dont la dernière étape n'a pas encore atteint son horizon reste inchangée (pas de balayage inutile)", async () => {
    const { service, sequences, steps, contacts } = build()
    // Comportement par défaut de `createMockRepository` : `query` résout `[]`
    // — aucune ligne « stale » à traiter.
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        contact_id: 'c1',
        name: 'Prospection',
        status: 'active',
        created_at: new Date(),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' } as ContactEntity])

    const result = await service.list('user-1', true)

    // Deux appels `query` (le SELECT des horizons, le SELECT `priority_gate`
    // du balayage `account_excluded`) : ni UPDATE ni INSERT dans les deux cas.
    expect(sequences.query).toHaveBeenCalledTimes(2)
    expect(result[0].status).toBe('active')
  })

  it('une panne du balayage best-effort ne fait jamais échouer `list`', async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.query.mockRejectedValueOnce(new Error('db down'))
    sequences.find.mockResolvedValueOnce([
      {
        id: 'seq-1',
        contact_id: 'c1',
        name: 'Prospection',
        status: 'active',
        created_at: new Date(),
      } as OutreachSequenceEntity,
    ])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' } as ContactEntity])

    const result = await service.list('user-1', true)

    expect(result).toHaveLength(1)
  })
})

describe('OutreachService — #2374.23 arrêt sur compte hors cible (account_excluded)', () => {
  /**
   * #2374.23 — l'une des 6 conditions d'arrêt nommées pour le nurturing :
   * « compte hors cible ». Réutilise `AccountEntity.priority_gate = 'parked'`
   * (porte G1, déjà là) plutôt qu'un second champ ICP/target.
   */
  it('list arrête, sous ses pieds, une séquence dont le compte est devenu `parked` (hors cible)', async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.query.mockImplementation(async (sql: string) => {
      if (sql.includes('priority_gate')) {
        return [{ id: 'seq-1', workspace_id: 'ws-1', user_id: 'user-1', previous_status: 'active' }]
      }
      return []
    })
    sequences.find.mockResolvedValueOnce([])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([])

    await service.list('user-1', true)

    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining('priority_gate'), ['ws-1'])
    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE outreach_sequence_steps'), [['seq-1']])
    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
      'ws-1',
      'user-1',
      'seq-1',
      'active',
    ])
    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining("'account_excluded'"), expect.anything())
  })

  it('list ne touche rien sans compte hors cible — le cas ordinaire', async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.find.mockResolvedValueOnce([])
    steps.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([])

    await service.list('user-1', true)

    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining('priority_gate'), ['ws-1'])
    expect(sequences.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
      'ws-1',
      'user-1',
      'seq-1',
      'active',
    ])
  })
})

describe('OutreachService — avancement + cycle de vie', () => {
  const activeSequence = (over: Partial<OutreachSequenceEntity> = {}): OutreachSequenceEntity =>
    ({
      id: 'seq-1',
      workspace_id: 'ws-1',
      user_id: 'user-1',
      contact_id: 'c1',
      name: 'Prospection — 3 touches',
      status: 'active',
      created_at: new Date('2026-07-16T10:00:00.000Z'),
      ...over,
    }) as OutreachSequenceEntity

  const pendingStep = (over: Partial<OutreachSequenceStepEntity> = {}): OutreachSequenceStepEntity =>
    ({
      id: 'step-1',
      sequence_id: 'seq-1',
      position: 0,
      due_at: new Date('2026-07-16T07:00:00.000Z'),
      kind: 'email',
      payload: { label: 'Email préparé (J0)' },
      status: 'pending',
      done_at: null,
      ...over,
    }) as OutreachSequenceStepEntity

  it('step done → l’étape passe done (datée) et la séquence avance sur la suivante', async () => {
    const { service, sequences, steps, contacts, userActions } = build()
    sequences.findOne.mockResolvedValueOnce(activeSequence())
    steps.findOne.mockResolvedValueOnce(pendingStep())
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    steps.count.mockResolvedValueOnce(2) // il reste des étapes pending
    steps.find.mockResolvedValueOnce([
      pendingStep({ id: 'step-1', status: 'done', done_at: new Date('2026-07-16T12:00:00.000Z') }),
      pendingStep({ id: 'step-2', position: 1, kind: 'reminder', status: 'pending' }),
    ])

    const result = await service.stepDone('user-1', 'seq-1', 'step-1', true)

    const savedStep = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(savedStep.status).toBe('done')
    expect(savedStep.done_at).toBeInstanceOf(Date)
    expect(result.status).toBe('active')
    expect(result.next_step?.id).toBe('step-2')
    // L'avancement est journalisé dans le feed (best-effort).
    expect(userActions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: 'plan_action_completed',
        contact_id: 'c1',
        metadata: expect.objectContaining({ source: 'outreach_sequence', sequence_id: 'seq-1' }),
      }),
    )
  })

  it('#2718.1 — l’étape faite porte le COMPTE du contact, sinon le fil du compte ne la voit jamais', async () => {
    // Retour SKAIZen Group (22/09/2026) : « si on exécute une séquence, on voit
    // aussi le changement depuis le compte ». `AccountTimelineService` filtre
    // ses user_actions sur `account_id` (`account-timeline.service.ts:89`) —
    // journalStepDone écrivait `account_id: null` en dur, donc l'étape
    // n'apparaissait JAMAIS dans le fil du compte, quel qu'il soit.
    const { service, sequences, steps, contacts, userActions } = build()
    sequences.findOne.mockResolvedValueOnce(activeSequence())
    steps.findOne.mockResolvedValueOnce(pendingStep())
    contacts.findOne.mockResolvedValueOnce(ownedContact) // account_id: 'acc-1'
    steps.count.mockResolvedValueOnce(2)
    steps.find.mockResolvedValueOnce([pendingStep({ status: 'done', done_at: new Date() })])

    await service.stepDone('user-1', 'seq-1', 'step-1', true)

    expect(userActions.create).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc-1' }))
  })

  it('dernière étape done → la séquence passe completed', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValueOnce(activeSequence())
    steps.findOne.mockResolvedValueOnce(pendingStep())
    steps.count.mockResolvedValueOnce(0) // plus rien de pending
    steps.find.mockResolvedValueOnce([pendingStep({ status: 'done', done_at: new Date() })])

    const result = await service.stepDone('user-1', 'seq-1', 'step-1', true)

    expect(result.status).toBe('completed')
    expect(sequences.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
    expect(result.next_step).toBeNull()
  })

  it('refuse de marquer une étape déjà done / d’une séquence annulée', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValueOnce(activeSequence())
    steps.findOne.mockResolvedValueOnce(pendingStep({ status: 'done' }))
    await expect(service.stepDone('user-1', 'seq-1', 'step-1', true)).rejects.toThrow(BadRequestException)

    sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'cancelled' }))
    await expect(service.stepDone('user-1', 'seq-1', 'step-1', true)).rejects.toThrow(BadRequestException)
  })

  it('pause : active → paused ; resume : paused → active ; transitions invalides refusées', async () => {
    const { service, sequences, steps } = build()
    steps.find.mockResolvedValue([])

    sequences.findOne.mockResolvedValueOnce(activeSequence())
    const paused = await service.pause('user-1', 'seq-1', true)
    expect(paused.status).toBe('paused')

    sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
    const resumed = await service.resume('user-1', 'seq-1', true)
    expect(resumed.status).toBe('active')

    sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'completed' }))
    await expect(service.pause('user-1', 'seq-1', true)).rejects.toThrow(BadRequestException)
  })

  /**
   * #3061 — le point d'ancrage manquant : rien ne disait QUAND une pause « pas
   * maintenant » méritait d'être reconsidérée. `get`/`list` le disent
   * désormais, sans jamais prétendre avoir évalué contexte/signal/pertinence.
   */
  describe('#3061 — la revérification à échéance d’un « pas maintenant »', () => {
    const notNowPausedAt = new Date('2026-01-01T00:00:00.000Z') // largement dépassé au 26/09/2026

    function withNotNowQuery(sequences: ReturnType<typeof build>['sequences'], occurredAt: Date) {
      sequences.query.mockResolvedValueOnce([
        { subject_id: 'seq-1', cause: 'not_now_deferred', occurred_at: occurredAt },
      ])
    }

    it('due=true et poste_still_valid=true quand le délai est dépassé et le contact toujours en poste', async () => {
      const { service, sequences, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      withNotNowQuery(sequences, notNowPausedAt)
      contacts.find.mockImplementation(async (opts: { select?: string[] }) =>
        opts?.select?.includes('lifecycle_state') ? [{ id: 'c1', lifecycle_state: 'actif' }] : [],
      )

      const result = await service.get('user-1', 'seq-1', true)

      expect(result.not_now_revalidation).toEqual({
        due: true,
        poste_still_valid: true,
        not_evaluated: ['contexte', 'signal', 'pertinence'],
      })
    })

    it('lit la colonne RÉELLE `occurred_at` — `outreach_transitions` ne porte pas `created_at` (migration 1795999204817)', async () => {
      // Régression : la première version de cette lecture triait sur `created_at`,
      // une colonne qui n'existe pas sur `outreach_transitions` — invisible ici
      // tant que la requête reste mockée, mais une vraie casse SQL en production.
      const { service, sequences, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      withNotNowQuery(sequences, notNowPausedAt)
      contacts.find.mockResolvedValueOnce([{ id: 'c1', lifecycle_state: 'actif' }])

      await service.get('user-1', 'seq-1', true)

      const sql = sequences.query.mock.calls[0]?.[0] as string
      expect(sql).toContain('occurred_at')
      expect(sql).not.toContain('created_at')
    })

    it('poste_still_valid=false quand le contact est devenu historique — jamais deviné', async () => {
      const { service, sequences, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      withNotNowQuery(sequences, notNowPausedAt)
      contacts.find.mockImplementation(async (opts: { select?: string[] }) =>
        opts?.select?.includes('lifecycle_state') ? [{ id: 'c1', lifecycle_state: 'historique' }] : [],
      )

      const result = await service.get('user-1', 'seq-1', true)

      expect(result.not_now_revalidation?.poste_still_valid).toBe(false)
    })

    it('due=false avant le délai — pas encore le moment', async () => {
      const { service, sequences, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      withNotNowQuery(sequences, new Date()) // posée maintenant, aucun délai écoulé
      contacts.find.mockImplementation(async (opts: { select?: string[] }) =>
        opts?.select?.includes('lifecycle_state') ? [{ id: 'c1', lifecycle_state: 'actif' }] : [],
      )

      const result = await service.get('user-1', 'seq-1', true)

      expect(result.not_now_revalidation?.due).toBe(false)
    })

    it('`null` pour une pause d’une AUTRE cause — jamais confondue avec « pas maintenant »', async () => {
      const { service, sequences } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      sequences.query.mockResolvedValueOnce([
        { subject_id: 'seq-1', cause: 'connector_expired', occurred_at: notNowPausedAt },
      ])

      const result = await service.get('user-1', 'seq-1', true)

      expect(result.not_now_revalidation).toBeNull()
    })

    it('`null` pour une séquence ACTIVE — le champ n’a de sens que sur une pause', async () => {
      const { service, sequences } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence())

      const result = await service.get('user-1', 'seq-1', true)

      expect(result.not_now_revalidation).toBeNull()
      expect(sequences.query).not.toHaveBeenCalled()
    })
  })

  it('cancel : la séquence passe cancelled et les étapes restantes sont skippées (historique conservé)', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValueOnce(activeSequence())
    steps.find.mockResolvedValueOnce([pendingStep({ status: 'skipped' })])

    const result = await service.cancel('user-1', 'seq-1', true)

    expect(result.status).toBe('cancelled')
    expect(steps.update).toHaveBeenCalledWith({ sequence_id: 'seq-1', status: 'pending' }, { status: 'skipped' })
    expect(result.next_step).toBeNull()
  })

  /**
   * #2374.23 — l'une des 6 conditions d'arrêt nommées pour le nurturing :
   * « owner manuel ». `manual_stop` existait dans le vocabulaire fermé des
   * dix-sept événements d'arrêt (#2381) mais n'était jamais écrit par ce
   * SEUL arrêt déclenché directement par un humain.
   */
  it('cancel : journalise la cause `manual_stop`, actor_kind `user` — le seul arrêt qu’un humain déclenche', async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))

    await service.cancel('user-1', 'seq-1', true)

    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
      'ws-1',
      'user-1',
      'seq-1',
      'paused',
    ])
    expect(sequences.query).toHaveBeenCalledWith(expect.stringContaining("'manual_stop'"), expect.anything())
  })

  it("mutations strictes propriétaire : la séquence d'un autre user est introuvable", async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValue(null)

    await expect(service.pause('user-2', 'seq-1', true)).rejects.toThrow(NotFoundException)
    await expect(service.cancel('user-2', 'seq-1', true)).rejects.toThrow(NotFoundException)
    await expect(service.stepDone('user-2', 'seq-1', 'step-1', true)).rejects.toThrow(NotFoundException)
    // #4804 — portée d'ESPACE (+ ligne ancienne du propriétaire), plus « propriétaire strict ».
    expect(sequences.findOne).toHaveBeenCalledWith({
      where: [
        { id: 'seq-1', workspace_id: 'ws-1' },
        { id: 'seq-1', workspace_id: IsNull(), user_id: 'user-2' },
      ],
    })
  })

  it('#4804 — coéquipier du même espace : le geste passe ; autre espace : 404', async () => {
    const { service, sequences } = build()
    const row = activeSequence()
    sequences.findOne.mockImplementation(async ({ where }: { where: Array<Record<string, unknown>> }) =>
      where.some(w => w.workspace_id === 'ws-1') ? row : null,
    )
    const err = await service.pause('user-2', row.id, true).then(
      () => null,
      (e: unknown) => e,
    )
    expect((err as Error | null)?.message).not.toBe('Séquence introuvable.')
    // Contrôle négatif : le même geste depuis un AUTRE espace.
    const other = build()
    other.sequences.findOne.mockImplementation(async ({ where }: { where: Array<Record<string, unknown>> }) =>
      where.some(w => w.workspace_id === 'ws-1') ? row : null,
    )
    ;(other.workspaceContext.resolveActiveWorkspace as jest.Mock).mockResolvedValue({
      workspaceId: 'ws-OTHER',
      role: 'owner',
    })
    await expect(other.service.pause('user-9', row.id, true)).rejects.toThrow(NotFoundException)
  })

  describe('OutreachService.addStep — pas une liste figée (#2153.39)', () => {
    it('ajoute une étape à la FIN, datée après la dernière — le brouillon vient du contact', async () => {
      const { service, sequences, steps, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence())
      steps.find.mockResolvedValueOnce([pendingStep({ due_at: new Date('2026-07-16T07:00:00.000Z') })])
      contacts.findOne.mockResolvedValueOnce(ownedContact)
      steps.find.mockResolvedValueOnce([
        pendingStep(),
        pendingStep({ id: 'step-2', position: 1, kind: 'email', due_at: new Date('2026-07-24T07:00:00.000Z') }),
      ])

      const result = await service.addStep(
        'user-1',
        'seq-1',
        { kind: 'email', due_at: '2026-07-24T07:00:00.000Z' },
        true,
      )

      const created = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
      expect(created.position).toBe(1)
      expect(created.kind).toBe('email')
      expect(created.status).toBe('pending')
      expect(created.payload).toMatchObject({
        email_draft: { subject: 'Bonjour', body: 'Brouillon préparé.' },
        draft_available: true,
      })
      expect(result.steps).toHaveLength(2)
    })

    it('refuse une étape qui ne prolonge pas la cadence (datée avant ou à la dernière échéance)', async () => {
      const { service, sequences, steps } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence())
      steps.find.mockResolvedValueOnce([pendingStep({ due_at: new Date('2026-07-16T07:00:00.000Z') })])

      await expect(
        service.addStep('user-1', 'seq-1', { kind: 'task', due_at: '2026-07-16T07:00:00.000Z' }, true),
      ).rejects.toThrow(BadRequestException)
    })

    it('refuse au-delà du plafond de douze étapes', async () => {
      const { service, sequences, steps } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence())
      steps.find.mockResolvedValueOnce(Array.from({ length: 12 }, (_, i) => pendingStep({ id: `s${i}`, position: i })))

      await expect(service.addStep('user-1', 'seq-1', { kind: 'task', offset_days: 30 }, true)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('refuse deux messages trop rapprochés — la règle de #2153.31/§lot D s’applique aussi ici', async () => {
      const { service, sequences, steps } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence())
      steps.find.mockResolvedValueOnce([pendingStep({ kind: 'email', due_at: new Date('2026-07-16T07:00:00.000Z') })])

      await expect(
        service.addStep('user-1', 'seq-1', { kind: 'email', due_at: '2026-07-17T07:00:00.000Z' }, true),
      ).rejects.toThrow(BadRequestException)
    })

    it('refuse sur une séquence terminée ou annulée', async () => {
      const { service, sequences } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'completed' }))
      await expect(service.addStep('user-1', 'seq-1', { kind: 'task', offset_days: 1 }, true)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('#2296.45 — refuse d’ajouter une touche à un contact devenu `historique` (parti depuis l’armement)', async () => {
      const { service, sequences, steps, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence())
      steps.find.mockResolvedValueOnce([pendingStep({ due_at: new Date('2026-07-16T07:00:00.000Z') })])
      contacts.findOne.mockResolvedValueOnce({ ...ownedContact, lifecycle_state: 'historique' })

      await expect(
        service.addStep('user-1', 'seq-1', { kind: 'email', due_at: '2026-07-24T07:00:00.000Z' }, true),
      ).rejects.toThrow(/quitté/)
    })
  })

  describe('#2296.45 — jamais garder un parti dans une séquence active', () => {
    // Le changement d'employeur a été détecté APRÈS l'armement (`create` avait
    // vu un contact sain) : `lifecycle_state` bascule `historique` au fil de
    // l'eau (`computeContactLifecycleState`, #2160.53), la séquence reste
    // `active`/`paused` tant que personne n'a agi. Ces deux portes empêchent de
    // la PROLONGER — `stepDone`/`pause`/`cancel` restent ouverts : constater ou
    // arrêter une cadence déjà écrite n'écrit rien de nouveau vers ce contact.
    it('refuse de REPRENDRE une séquence en pause sur un contact devenu historique', async () => {
      const { service, sequences, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      contacts.findOne.mockResolvedValueOnce({ ...ownedContact, lifecycle_state: 'historique' })

      await expect(service.resume('user-1', 'seq-1', true)).rejects.toThrow(/quitté/)
    })

    it('ne bloque rien quand le contact est introuvable — refuser sur une donnée absente serait pire', async () => {
      const { service, sequences, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(activeSequence({ status: 'paused' }))
      contacts.findOne.mockResolvedValueOnce(null)

      await expect(service.resume('user-1', 'seq-1', true)).resolves.toBeTruthy()
    })
  })

  describe('un contact RISQUE ne part pas en séquence sans confirmation (PDF 2 §5.2)', () => {
    const staleContact = {
      id: 'c-1',
      user_id: 'u-1',
      account_id: 'acc-1',
      full_name: 'Claire Meunier',
      entity: null,
      source: 'apollo',
      // L'employeur détecté ne correspond ni au compte, ni à l'entité : elle
      // est probablement partie.
      raw_data: { apolloDetails: { organization: 'Capgemini' } },
    }

    it('refuse l’armement, en disant pourquoi', async () => {
      const { service, contacts } = build()
      contacts.findOne.mockResolvedValue(staleContact)
      await expect(
        service.create(
          { contact_id: 'c-1', template: 'prospection_3_touches' } as never,
          {
            userId: 'u-1',
          } as never,
          true,
        ),
      ).rejects.toThrow(/probablement quitté/)
    })

    it('accepte quand le commercial a vu le badge et confirme', async () => {
      const { service, contacts } = build()
      contacts.findOne.mockResolvedValue(staleContact)
      await expect(
        service.create(
          { contact_id: 'c-1', template: 'prospection_3_touches', acknowledge_risk: true } as never,
          {
            userId: 'u-1',
          } as never,
          true,
        ),
      ).resolves.toBeTruthy()
    })

    it('ne bloque rien quand le compte n’a pas de nom — refuser sur une donnée absente serait pire', async () => {
      const { service, contacts, accounts } = build()
      contacts.findOne.mockResolvedValue(staleContact)
      accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: '' })
      await expect(
        service.create(
          { contact_id: 'c-1', template: 'prospection_3_touches' } as never,
          {
            userId: 'u-1',
          } as never,
          true,
        ),
      ).resolves.toBeTruthy()
    })
  })
})

/**
 * Lot D du Recovery Pack — les trois choses qu'un chemin d'écriture d'outreach
 * ne regardait pas : l'espacement entre deux messages, la capacité d'envoi
 * réelle, et la politique d'approbation de l'espace.
 */
describe('OutreachService.create — les garde-fous du lot D', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-07-16T06:00:00.000Z') }))
  afterEach(() => jest.useRealTimers())

  it('refuse deux MESSAGES à moins de quatre jours', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)

    await expect(
      service.create(
        {
          contact_id: 'c1',
          steps: [
            { kind: 'email', offset_days: 0 },
            { kind: 'email', offset_days: 1 },
          ],
        } as never,
        principal,
        true,
      ),
    ).rejects.toThrow(/au moins 4/)
  })

  it('applique la cadence DU SCÉNARIO quand la relation est établie — 4 jours ne suffisent plus à un froid', async () => {
    // Le registre des scénarios d'approche portait cette cadence (0 / 5 / 7 pour
    // une approche froide) sans que rien ne la lise : le chemin d'écriture s'en
    // tenait au plancher plat de 4 jours, c'est-à-dire au plus permissif des
    // quatre scénarios appliqué à tout le monde.
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'froid', evidence: ['aucune interaction connue'] } } },
    })

    await expect(
      service.create(
        {
          contact_id: 'c1',
          delay_unit: 'calendar_days',
          steps: [
            { kind: 'email', offset_days: 0 },
            { kind: 'email', offset_days: 4 },
          ],
        } as never,
        principal,
        true,
      ),
    ).rejects.toThrow(/au moins 5/)
  })

  it('accepte la même séquence dès qu’elle respecte le rythme du scénario', async () => {
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'froid', evidence: ['aucune interaction connue'] } } },
    })

    const result = await service.create(
      {
        contact_id: 'c1',
        steps: [
          { kind: 'email', offset_days: 0 },
          { kind: 'email', offset_days: 5 },
        ],
      } as never,
      principal,
      true,
    )
    expect(result.steps).toHaveLength(2)
  })

  it('un contact RECOMMANDÉ garde son rythme plus court — 4 jours lui suffisent', async () => {
    // Les quatre scénarios ne disent pas la même chose, et c'est tout l'intérêt
    // de les lire : appliquer 5 jours à un référé serait aussi faux que
    // d'appliquer 4 jours à un inconnu.
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'refere', evidence: ['introduit par Paul'] } } },
    })

    const result = await service.create(
      {
        contact_id: 'c1',
        steps: [
          { kind: 'email', offset_days: 0 },
          { kind: 'email', offset_days: 4 },
        ],
      } as never,
      principal,
      true,
    )
    expect(result.steps).toHaveLength(2)
  })

  it('sans PREUVE de l’état de relation, garde le plancher plat — on ne conclut pas d’un silence', async () => {
    // `resolveRelationshipEvidence` retombe sur « froid » quand elle ne sait
    // rien, et le dit en ne citant AUCUNE preuve. Prendre ce défaut pour une
    // approche froide établie appliquerait la cadence la plus stricte à tous les
    // comptes qui n'ont jamais été analysés.
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'EDF' })

    const result = await service.create(
      {
        contact_id: 'c1',
        steps: [
          { kind: 'email', offset_days: 0 },
          { kind: 'email', offset_days: 4 },
        ],
      } as never,
      principal,
      true,
    )
    expect(result.steps).toHaveLength(2)
  })

  it('un GABARIT livré n’est jamais refusé par un scénario — sa cadence est déjà tranchée', async () => {
    // `cold_email` écrit à J0 / J+4 / J+10 / J+18, donc deux de ses écarts sont
    // sous la cadence 0 / 5 / 7 du scénario froid. Le registre et le gabarit se
    // contredisent, et c'est un arbitrage produit, pas un accident de saisie :
    // on ne casse pas un gabarit que des utilisateurs choisissent par son nom.
    // Le scénario gouverne ce que l'APPELANT compose, que l'API accepte librement.
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'froid', evidence: ['aucune interaction connue'] } } },
    })

    const result = await service.create({ contact_id: 'c1', template: 'cold_email' } as never, principal, true)
    expect(result.steps).toHaveLength(4)
  })

  it('#2374.24 (épopée #2800) — refuse au-delà du plafond de messages du scénario', async () => {
    // Le scénario froid autorise 3 messages au plus. Ce test compose une
    // séquence CUSTOM qui respecte l'espacement (0/5/7/7) mais en programme
    // un quatrième — le plafond déclaré (`OUTREACH_SCENARIOS.cold_approach.maxSteps`)
    // n'était lu par aucun chemin d'écriture avant ce correctif.
    const { service, contacts, accounts, sequences, steps } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'froid', evidence: ['aucune interaction connue'] } } },
    })

    await expect(
      service.create(
        {
          contact_id: 'c1',
          steps: [
            { kind: 'email', offset_days: 0 },
            { kind: 'email', offset_days: 5 },
            { kind: 'email', offset_days: 12 },
            { kind: 'email', offset_days: 19 },
          ],
        } as never,
        principal,
        true,
      ),
    ).rejects.toThrow(/au plus 3 messages/)

    expect(sequences.save).not.toHaveBeenCalled()
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('#2374.24 (épopée #2800) — refuse un canal que le scénario n’autorise pas pour cette relation', async () => {
    // Une connexion LinkedIn tout juste acceptée (état `linkedin`) n'autorise
    // que le canal `linkedin_draft` (`OUTREACH_SCENARIOS.accepted_connection`) :
    // jamais l'e-mail automatisé que `kind: 'email'` programme ici.
    const { service, contacts, accounts, sequences, steps } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'linkedin', evidence: ['connexion acceptée'] } } },
    })

    await expect(
      service.create({ contact_id: 'c1', steps: [{ kind: 'email', offset_days: 0 }] } as never, principal, true),
    ).rejects.toThrow(/n'autorise que linkedin_draft/)

    expect(sequences.save).not.toHaveBeenCalled()
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('accepte une TÂCHE et un message le même jour — c’est l’ordre voulu', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)

    // Le gabarit `fresh_signal` fait exactement cela : vérifier le signal, puis
    // écrire. Interdire deux étapes le même jour aurait cassé le seul scénario
    // qui demande d'agir vite — la règle porte sur ce qui ÉCRIT.
    const result = await service.create({ contact_id: 'c1', template: 'fresh_signal' } as never, principal, true)
    expect(result.steps.map(step => step.kind)).toEqual(['task', 'email', 'reminder', 'reminder'])
  })

  it('refuse quand l’espace exige une validation responsable', async () => {
    const { service, contacts, workspaces } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    workspaces.findOne.mockResolvedValue({ approval_default_level: 'n3_manager_approval' })

    await expect(
      service.create({ contact_id: 'c1', template: 'prospection_3_touches' } as never, principal, true),
    ).rejects.toThrow(/validation responsable/)
  })

  it('un espace au réglage par défaut n’est PAS affecté — le clic vaut la validation', async () => {
    const { service, contacts, workspaces } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    workspaces.findOne.mockResolvedValue({})

    const result = await service.create(
      { contact_id: 'c1', template: 'prospection_3_touches' } as never,
      principal,
      true,
    )
    expect(result.status).toBe('active')
  })

  it('une séquence SANS envoi passe même dans un espace à validation responsable', async () => {
    const { service, contacts, workspaces } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    workspaces.findOne.mockResolvedValue({ approval_default_level: 'n3_manager_approval' })

    // `cold_linkedin` ne contient que des tâches et des rappels : rien ne part,
    // donc rien n'est irréversible, donc rien à faire valider.
    const result = await service.create({ contact_id: 'c1', template: 'cold_linkedin' } as never, principal, true)
    expect(result.status).toBe('active')
  })

  it('la capacité d’envoi vient du SERVEUR et voyage avec la séquence', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)

    const connected = await service.create({ contact_id: 'c1', template: 'cold_linkedin' } as never, principal, true)
    expect(connected.can_send).toBe(true)

    contacts.findOne.mockResolvedValue(ownedContact)
    const disconnected = await service.create(
      { contact_id: 'c1', template: 'cold_linkedin' } as never,
      principal,
      false,
    )
    expect(disconnected.can_send).toBe(false)
  })
})

describe('OutreachService.create — lot L-B (#4165)', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-07-16T06:00:00.000Z') })) // jeudi
  afterEach(() => jest.useRealTimers())

  it('une séquence NEUVE compte en jours OUVRÉS par défaut : J+4 depuis jeudi = mardi, J+10 = jeudi suivant', async () => {
    const { service, contacts, sequences } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    const result = await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)
    expect(result.delay_unit).toBe('business_days')
    expect(sequences.create).toHaveBeenCalledWith(expect.objectContaining({ delay_unit: 'business_days' }))
    expect(result.steps.map(s => s.due_at)).toEqual([
      '2026-07-16T07:00:00.000Z',
      '2026-07-22T07:00:00.000Z',
      '2026-07-30T07:00:00.000Z',
    ])
  })

  it('le délai demandé est gardé dans l’étape, pour que l’éditeur affiche « J+3 ouvrés »', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)
    const result = await service.create(
      { contact_id: 'c1', steps: [{ kind: 'task', offset_days: 3 }] },
      principal,
      true,
    )
    expect(result.steps[0]?.payload['offset_days']).toBe(3)
    expect(result.steps[0]?.due_at).toBe('2026-07-21T07:00:00.000Z') // jeu → ven, lun, mar
  })

  it('crée des étapes LinkedIn et appel, avec la matière du geste manuel (jamais un texte inventé)', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValueOnce({
      ...ownedContact,
      linkedin_url: 'https://linkedin.com/in/jean',
      linkedin_message: 'Bonjour Jean, ravi de me connecter.',
      phone_script: null,
    } as unknown as ContactEntity)
    const result = await service.create(
      {
        contact_id: 'c1',
        steps: [
          { kind: 'linkedin_invite', offset_days: 0 },
          { kind: 'linkedin_message', offset_days: 2 },
          { kind: 'call', offset_days: 5 },
        ],
      },
      principal,
      true,
    )
    expect(result.steps.map(s => s.kind)).toEqual(['linkedin_invite', 'linkedin_message', 'call'])
    expect(result.steps[0]?.payload).toMatchObject({
      linkedin_draft: { body: 'Bonjour Jean, ravi de me connecter.', profile_url: 'https://linkedin.com/in/jean' },
      draft_available: true,
    })
    expect(result.steps[2]?.payload).toMatchObject({ call_script: null, draft_available: false })
  })

  it('REFUSE un contact joint il y a moins de 30 jours, en nommant la raison — et se laisse forcer', async () => {
    const { service, contacts, sequences, steps } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    sequences.query.mockResolvedValue([{ last_sent_at: '2026-07-01T08:00:00.000Z' }])
    const dto = { contact_id: 'c1', template: 'single_message' as const }
    await expect(service.create(dto, principal, true)).rejects.toThrow(/moins de 30 jours/)
    expect(steps.save).not.toHaveBeenCalled()
    const forced = await service.create({ ...dto, override_exclusions: true }, principal, true)
    expect(forced.status).toBe('active')
  })

  it('REFUSE un compte déjà client quand la preuve existe, sinon ne devine pas', async () => {
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'EDF',
      raw_analysis: { salesContext: { relationship: { state: 'client_actif', evidence: ['contrat en cours'] } } },
    })
    await expect(service.create({ contact_id: 'c1', template: 'single_message' }, principal, true)).rejects.toThrow(
      /déjà client/,
    )
    // Sans preuve : aucun refus.
    accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'EDF', commercial_status: 'inbox' })
    await expect(
      service.create({ contact_id: 'c1', template: 'single_message' }, principal, true),
    ).resolves.toBeDefined()
  })

  it('l’opposition RGPD n’est JAMAIS forçable', async () => {
    const { service, contacts, contactStops } = build()
    contacts.findOne.mockResolvedValue(ownedContact)
    contactStops.verdict.mockResolvedValue({ reason: 'opt_out', since: '2026-07-10T09:00:00.000Z', motion: 'x' })
    await expect(
      service.create(
        { contact_id: 'c1', template: 'single_message', override_exclusions: true, force_justification: 'urgent' },
        principal,
        true,
      ),
    ).rejects.toThrow(ForbiddenException)
  })
})
