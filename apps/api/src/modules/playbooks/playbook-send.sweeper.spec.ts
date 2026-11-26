import { PlaybookSendSweeper } from './playbook-send.sweeper'
import type { PlaybookTarget, PlaybookTargetsService } from './playbook-targets.service'
import type { PlaybooksService } from './playbooks.service'

/**
 * Le balayeur qui PRÉPARE — et qui, depuis le 26/08/2026, n'envoie plus rien.
 *
 * On ne le teste pas contre une base : on teste l'ordre des opérations, qui est
 * ce qui reste vrai quelles que soient les données. Quatre propriétés portent
 * tout le reste : rien n'est demandé si le verdict refuse, la trace est réservée
 * AVANT la demande, une réservation refusée ne demande rien, et le propriétaire
 * est prévenu UNE fois par vague.
 *
 * La cinquième propriété ne se teste pas, elle se lit dans le constructeur : ce
 * balayeur n'a plus aucun accès à la messagerie. Il ne PEUT plus envoyer.
 */

const TARGET: PlaybookTarget = {
  targetId: 'target-1',
  workspaceId: 'ws-1',
  ownerId: 'owner-1',
  recipient: 'marie@acme.example',
  label: 'Karim Benali — ACME',
  silenceDays: 12,
  hasReply: false,
  subject: 'Profil de Karim Benali — as-tu pu le regarder ?',
  body: 'Bonjour Marie,',
}

function build(options: {
  targets?: PlaybookTarget[]
  allowed?: boolean
  reserved?: boolean
  armed?: { workspace_id: string; playbook: string }[]
  /** Ce qui attendait DÉJÀ le propriétaire avant cette vague. */
  pending?: number
  createNotification?: jest.Mock
}) {
  const armed = options.armed ?? [{ workspace_id: 'ws-1', playbook: 'submission_no_reply' }]
  const subscriptions = { find: jest.fn().mockResolvedValue(armed) } as never

  const evaluate = jest
    .fn()
    .mockResolvedValue(
      options.allowed === false ? { allowed: false, reason: 'replied' } : { allowed: true, reason: null },
    )
  const requestApproval = jest.fn().mockResolvedValue(options.reserved ?? true)
  const countPendingFor = jest.fn().mockResolvedValue(options.pending ?? 0)
  const expireStale = jest.fn().mockResolvedValue(0)
  const playbooks = { evaluate, requestApproval, countPendingFor, expireStale } as unknown as PlaybooksService

  const collect = jest.fn().mockResolvedValue(options.targets ?? [TARGET])
  const targets = { collect } as unknown as PlaybookTargetsService

  const createNotification = options.createNotification ?? jest.fn().mockResolvedValue(undefined)
  const notifications = { createNotification } as never

  const isSuppressed = jest.fn().mockResolvedValue(false)
  const suppression = { isSuppressed } as never

  const sweeper = new PlaybookSendSweeper(subscriptions, playbooks, targets, notifications, suppression)
  return { sweeper, evaluate, requestApproval, countPendingFor, expireStale, createNotification, isSuppressed, collect }
}

describe('balayeur de préparation des playbooks', () => {
  afterEach(() => {
    delete process.env.PLAYBOOKS_SEND_DISABLED
  })

  it('ne prépare RIEN quand l’interrupteur d’urgence est posé', async () => {
    process.env.PLAYBOOKS_SEND_DISABLED = 'true'
    const { sweeper, requestApproval, createNotification } = build({})
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(requestApproval).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('ne regarde aucune cible quand aucun espace n’a armé', async () => {
    const { sweeper, collect } = build({ armed: [] })
    await expect(sweeper.sweep()).resolves.toBe(0)
    // Trois requêtes lourdes toutes les trente minutes pour découvrir que
    // personne n'a armé : c'est le genre de coût qui ne se voit jamais.
    expect(collect).not.toHaveBeenCalled()
  })

  it('PÉRIME les demandes en souffrance avant de préparer la vague suivante', async () => {
    // Une demande de plus de trois jours ne part pas. La laisser en attente
    // ferait croire qu'un clic suffirait encore.
    const { sweeper, expireStale, collect } = build({})
    await sweeper.sweep()
    expect(expireStale).toHaveBeenCalled()
    expect(expireStale.mock.invocationCallOrder[0]).toBeLessThan(collect.mock.invocationCallOrder[0])
  })

  it('ne demande rien quand le verdict refuse', async () => {
    const { sweeper, requestApproval, createNotification } = build({ allowed: false })
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(requestApproval).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('ne compte rien quand la réservation est refusée', async () => {
    // Deux balayages concurrents passent tous deux le verdict ; l'index unique
    // tranche, et le perdant doit se taire.
    const { sweeper, createNotification } = build({ reserved: false })
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('écarte une cible sans propriétaire plutôt que de choisir un expéditeur', async () => {
    // Un client qui reçoit une relance d'un collègue qu'il ne connaît pas est un
    // incident, pas une relance.
    const { sweeper, requestApproval } = build({ targets: [{ ...TARGET, ownerId: null }] })
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(requestApproval).not.toHaveBeenCalled()
  })

  it('FIGE le texte au moment de la demande — objet et corps voyagent avec elle', async () => {
    // Recomposer à l'approbation ferait valider un message et en envoyer un
    // autre : le dossier a pu changer entre-temps.
    const { sweeper, requestApproval } = build({})
    await sweeper.sweep()
    expect(requestApproval).toHaveBeenCalledWith(
      'ws-1',
      'submission_no_reply',
      expect.objectContaining({
        targetId: 'target-1',
        recipient: 'marie@acme.example',
        ownerId: 'owner-1',
        subject: TARGET.subject,
        body: TARGET.body,
      }),
      expect.any(Date),
    )
  })

  it('prévient le PROPRIÉTAIRE, avec un lien vers le centre d’actions', async () => {
    const { sweeper, createNotification } = build({})
    await sweeper.sweep()
    expect(createNotification).toHaveBeenCalledWith('owner-1', expect.objectContaining({ link: '/actions' }))
  })

  it('ne notifie PAS quand une file est déjà ouverte chez ce propriétaire', async () => {
    // Renotifier à chaque passage de cron produirait vingt messages par jour, et
    // la première chose que ferait l'utilisateur serait de désarmer le playbook.
    const { sweeper, createNotification } = build({ pending: 3 })
    await sweeper.sweep()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('n’échappe PAS au plafond de proactivité par accident : la notification est « déclenchée par l’utilisateur »', async () => {
    // C'est un choix, écrit : une notification avalée signifie qu'un envoi
    // préparé périmera sans que personne ne l'ait vu. Et le geste EST celui de
    // l'utilisateur — c'est lui qui a armé le playbook.
    const { sweeper, createNotification } = build({})
    await sweeper.sweep()
    expect(createNotification).toHaveBeenCalledWith('owner-1', expect.objectContaining({ origin: 'user_triggered' }))
  })

  it('une notification par PROPRIÉTAIRE, pas une par relance', async () => {
    const second: PlaybookTarget = { ...TARGET, targetId: 'target-2', ownerId: 'owner-2' }
    const third: PlaybookTarget = { ...TARGET, targetId: 'target-3', ownerId: 'owner-1' }
    const { sweeper, createNotification } = build({ targets: [TARGET, second, third] })
    await expect(sweeper.sweep()).resolves.toBe(3)
    expect(createNotification).toHaveBeenCalledTimes(2)
    const owners = createNotification.mock.calls.map(call => call[0]).sort()
    expect(owners).toEqual(['owner-1', 'owner-2'])
  })

  it('consulte l’opt-out à CHAQUE cible, jamais en cache', async () => {
    const { sweeper, isSuppressed } = build({
      targets: [TARGET, { ...TARGET, targetId: 'target-2', recipient: 'jean@acme.example' }],
    })
    await sweeper.sweep()
    expect(isSuppressed).toHaveBeenCalledTimes(2)
  })

  it('un espace en échec n’emporte pas les autres', async () => {
    const { sweeper, collect } = build({
      armed: [
        { workspace_id: 'ws-1', playbook: 'submission_no_reply' },
        { workspace_id: 'ws-2', playbook: 'submission_no_reply' },
      ],
    })
    collect.mockRejectedValueOnce(new Error('jeton expiré'))
    // Le premier espace tombe ; le second prépare quand même.
    await expect(sweeper.sweep()).resolves.toBe(1)
  })

  it('une notification en échec ne perd PAS les demandes déjà posées', async () => {
    // Elles sont en base et visibles dans le centre d'actions : faire tomber le
    // balayage ici les laisserait sans suite jusqu'au passage suivant.
    const createNotification = jest.fn().mockRejectedValue(new Error('notification indisponible'))
    const { sweeper } = build({ createNotification })
    await expect(sweeper.sweep()).resolves.toBe(1)
  })
})
