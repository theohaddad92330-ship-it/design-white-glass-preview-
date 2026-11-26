import type { ContactEntity } from '../../database/entities/contact.entity'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ActionRouterService, ActionPrincipal } from '../action-router/action-router.service'
import type { ContactStopService } from '../contact-stop/contact-stop.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { OutreachService } from './outreach.service'

/**
 * #2203.32 → .38 / #2153.29 — L'ÉTIQUETTE DE CAMPAGNE (arbitrage de Louis,
 * 16/09/2026).
 *
 * Les séquences lancées ensemble partagent une étiquette ; le tableau
 * d'audience filtre dessus. **Aucun objet « campagne », aucune table** — une
 * séquence reste mono-contact, et c'est ce qui lui permet de s'arrêter quand
 * CETTE personne répond.
 *
 * Ce que cette suite tient : l'étiquette est ÉCRITE telle qu'elle est
 * demandée, et elle n'est jamais INVENTÉE — une séquence lancée seule reste
 * sans campagne, sinon chaque envoi solitaire deviendrait une « campagne d'une
 * personne » dans le filtre.
 */
const principal: ActionPrincipal = { userId: 'user-1', email: 'rep@esn.fr' }

const ownedContact = {
  id: 'c1',
  user_id: 'user-1',
  workspace_id: 'ws-1',
  account_id: 'acc-1',
  full_name: 'Jean Dupont',
  email: 'jean@corp.fr',
} as unknown as ContactEntity

function build() {
  const sequences = createMockRepository<OutreachSequenceEntity>()
  const steps = createMockRepository<OutreachSequenceStepEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const userActions = createMockRepository<UserActionEntity>()
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  }
  const actionRouter = {
    dispatch: jest.fn().mockResolvedValue({ type: 'schedule_reminder', status: 'done', externalRef: 'ua-1' }),
  }
  let seq = 0
  sequences.save.mockImplementation(async (e: Partial<OutreachSequenceEntity>) => ({
    id: 'seq-1',
    created_at: new Date('2026-07-16T10:00:00.000Z'),
    ...e,
  }))
  steps.save.mockImplementation(
    async (e: Partial<OutreachSequenceStepEntity> | Partial<OutreachSequenceStepEntity>[]) =>
      Array.isArray(e)
        ? e.map(row => ({ id: `step-${++seq}`, ...row }))
        : { id: (e.id as string) ?? `step-${++seq}`, ...e },
  )
  const accounts = {
    findOne: jest.fn().mockResolvedValue({ id: 'acc-1', company_name: 'EDF' }),
    find: jest.fn().mockResolvedValue([]),
  }
  const workspaces = { findOne: jest.fn().mockResolvedValue({}) }
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
  return { service, sequences, contacts }
}

describe('L’étiquette de campagne (#2203.32 → .38)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-07-16T06:00:00.000Z') })
  })
  afterEach(() => jest.useRealTimers())

  it('ÉCRIT l’étiquette demandée, et la rend sur la séquence', async () => {
    const { service, sequences, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const created = await service.create(
      { contact_id: 'c1', template: 'prospection_3_touches', campaign_label: '  DSI grands comptes  ' },
      principal,
      true,
    )

    expect(sequences.save.mock.calls[0]?.[0]).toMatchObject({ campaign_label: 'DSI grands comptes' })
    expect(created.campaign_label).toBe('DSI grands comptes')
  })

  it('n’INVENTE aucune étiquette — une séquence lancée seule n’est pas une campagne d’une personne', async () => {
    const { service, sequences, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    const created = await service.create({ contact_id: 'c1', template: 'prospection_3_touches' }, principal, true)

    expect(sequences.save.mock.calls[0]?.[0]).toMatchObject({ campaign_label: null })
    expect(created.campaign_label).toBeNull()
  })

  it('une étiquette BLANCHE vaut « pas de campagne », jamais une étiquette vide', async () => {
    const { service, sequences, contacts } = build()
    contacts.findOne.mockResolvedValueOnce(ownedContact)

    await service.create(
      { contact_id: 'c1', template: 'prospection_3_touches', campaign_label: '   ' },
      principal,
      true,
    )

    expect(sequences.save.mock.calls[0]?.[0]).toMatchObject({ campaign_label: null })
  })
})
