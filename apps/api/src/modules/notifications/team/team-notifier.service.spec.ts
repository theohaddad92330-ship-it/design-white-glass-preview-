import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../../database/entities/account.entity'
import type { NotificationPreferenceEntity } from '../../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../../database/entities/profile.entity'
import type { WorkspaceRole } from '@bellum/contracts'
import { TeamNotificationsService } from './team-notifier.service'
import type { NotificationsService } from '../notifications.service'
import type { WorkspaceContextService } from '../../workspace/workspace-context.service'
import type { MailerService } from '../../mailer/mailer.service'
import type { SuppressionService } from '../../mailer/suppression.service'

const WS = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER_WS = 'aaaaaaaa-0000-0000-0000-000000000002'
const ALICE = '11111111-0000-0000-0000-000000000001' // l'auteur du geste
const BOB = '11111111-0000-0000-0000-000000000002' // le destinataire
const CAROL = '11111111-0000-0000-0000-000000000003'
const ACCOUNT = '22222222-0000-0000-0000-000000000001'

type Opts = {
  members?: Record<string, { role: WorkspaceRole }> // clé `${ws}:${user}`
  visibility?: 'open' | 'restricted'
  account?: { id: string; company_name: string; assigned_to: string | null; workspace_id: string } | null
  prefs?: Record<string, Record<string, boolean>>
  suppressed?: boolean
  demo?: boolean
  mailerThrows?: boolean
  teammates?: string[] // co-équipiers actifs du compte
}

function build(opts: Opts = {}) {
  const members = opts.members ?? {
    [`${WS}:${ALICE}`]: { role: 'sales' },
    [`${WS}:${BOB}`]: { role: 'sales' },
    [`${WS}:${CAROL}`]: { role: 'admin' },
  }
  const created: Array<{ userId: string; input: Record<string, unknown> }> = []
  const notifications = {
    createNotification: jest.fn(async (userId: string, input: Record<string, unknown>) => {
      created.push({ userId, input })
      return { id: 'n1' }
    }),
  }
  const workspaceContext = {
    getMembership: jest.fn(async (userId: string, workspaceId: string) => members[`${workspaceId}:${userId}`] ?? null),
    portfolioVisibilityOf: jest.fn(async () => opts.visibility ?? 'open'),
  }
  const account =
    opts.account === undefined
      ? { id: ACCOUNT, company_name: 'Acme', assigned_to: null, workspace_id: WS }
      : opts.account
  const accounts = {
    findOne: jest.fn(async ({ where }: { where: { id: string; workspace_id: string } }) =>
      account && account.id === where.id && account.workspace_id === where.workspace_id ? account : null,
    ),
    manager: {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM workspaces')) return [{ is_demo: opts.demo === true }]
        if (sql.includes('account_team_members')) return (opts.teammates ?? []).map(() => ({ account_id: ACCOUNT }))
        return []
      }),
    },
  }
  const profiles = {
    findOne: jest.fn(async ({ where }: { where: { user_id: string } }) => {
      const byId: Record<string, { first_name: string; last_name: string; email: string }> = {
        [ALICE]: { first_name: 'Alice', last_name: 'Martin', email: 'alice@esn.test' },
        [BOB]: { first_name: 'Bob', last_name: 'Durand', email: 'bob@esn.test' },
        [CAROL]: { first_name: 'Carol', last_name: 'Petit', email: 'carol@esn.test' },
      }
      return byId[where.user_id] ?? null
    }),
  }
  const prefs = {
    findOne: jest.fn(async ({ where }: { where: { user_id: string } }) => {
      const row = opts.prefs?.[where.user_id]
      return row ? { user_id: where.user_id, email_language: null, ...row } : null
    }),
  }
  const mailer = {
    sendNotificationEmail: jest.fn(async () => {
      if (opts.mailerThrows) throw new Error('smtp down')
    }),
  }
  const suppression = { isSuppressedForUser: jest.fn(async () => opts.suppressed === true) }
  const service = new TeamNotificationsService(
    notifications as unknown as NotificationsService,
    workspaceContext as unknown as WorkspaceContextService,
    prefs as unknown as Repository<NotificationPreferenceEntity>,
    profiles as unknown as Repository<ProfileEntity>,
    accounts as unknown as Repository<AccountEntity>,
    mailer as unknown as MailerService,
    suppression as unknown as SuppressionService,
  )
  return { service, created, mailer, suppression, workspaceContext }
}

describe('TeamNotificationsService — #4158.15 un compte m’est assigné', () => {
  it('prévient le destinataire, avec l’auteur EN CLAIR, l’espace et le lien vers le compte', async () => {
    const { service, created } = build()
    await service.notifyAccountAssigned({
      workspaceId: WS,
      actorUserId: ALICE,
      recipientUserId: BOB,
      accountId: ACCOUNT,
    })
    expect(created).toHaveLength(1)
    expect(created[0]?.userId).toBe(BOB)
    expect(created[0]?.input).toMatchObject({
      type: 'account_assigned',
      workspaceId: WS,
      actorUserId: ALICE,
      link: `/accounts/${ACCOUNT}`,
    })
    expect(String(created[0]?.input['title'])).toContain('Alice Martin')
    expect(String(created[0]?.input['title'])).toContain('Acme')
  })

  it('personne n’est notifié de sa propre action', async () => {
    const { service, created } = build()
    await service.notifyAccountAssigned({
      workspaceId: WS,
      actorUserId: ALICE,
      recipientUserId: ALICE,
      accountId: ACCOUNT,
    })
    expect(created).toHaveLength(0)
  })

  it('un destinataire d’un AUTRE espace n’est jamais notifié', async () => {
    const { service, created } = build()
    await service.notifyAccountAssigned({
      workspaceId: OTHER_WS,
      actorUserId: ALICE,
      recipientUserId: BOB,
      accountId: ACCOUNT,
    })
    expect(created).toHaveLength(0)
  })

  it('un compte d’un autre espace est introuvable : aucune notification', async () => {
    const { service, created } = build({
      account: { id: ACCOUNT, company_name: 'Acme', assigned_to: null, workspace_id: OTHER_WS },
    })
    await service.notifyAccountAssigned({
      workspaceId: WS,
      actorUserId: ALICE,
      recipientUserId: BOB,
      accountId: ACCOUNT,
    })
    expect(created).toHaveLength(0)
  })
})

describe('TeamNotificationsService — #4158.16 une action m’est déléguée', () => {
  it('prévient le délégataire, lien vers le compte quand il y en a un', async () => {
    const { service, created } = build()
    await service.notifyActionDelegated({
      workspaceId: WS,
      actorUserId: ALICE,
      recipientUserId: BOB,
      accountId: ACCOUNT,
    })
    expect(created[0]?.input).toMatchObject({ type: 'action_delegated', link: `/accounts/${ACCOUNT}`, workspaceId: WS })
  })

  it('sans compte, le lien mène au centre d’actions', async () => {
    const { service, created } = build()
    await service.notifyActionDelegated({
      workspaceId: WS,
      actorUserId: ALICE,
      recipientUserId: BOB,
      accountId: null,
    })
    expect(created[0]?.input['link']).toBe('/actions')
  })

  it('se déléguer une action à soi-même ne notifie personne', async () => {
    const { service, created } = build()
    await service.notifyActionDelegated({
      workspaceId: WS,
      actorUserId: BOB,
      recipientUserId: BOB,
      accountId: null,
    })
    expect(created).toHaveLength(0)
  })

  it('un non-membre de l’espace n’est jamais notifié', async () => {
    const { service, created } = build()
    await service.notifyActionDelegated({
      workspaceId: WS,
      actorUserId: ALICE,
      recipientUserId: '99999999-0000-0000-0000-000000000009',
      accountId: null,
    })
    expect(created).toHaveLength(0)
  })
})

describe('TeamNotificationsService — #4158.17 @mention', () => {
  it('une notification par personne mentionnée, jamais l’auteur, jamais deux fois', async () => {
    const { service, created } = build()
    await service.notifyMentions({
      workspaceId: WS,
      actorUserId: ALICE,
      mentionedUserIds: [BOB, BOB, ALICE, CAROL],
      accountId: ACCOUNT,
      conversationId: null,
    })
    expect(created.map(c => c.userId).sort()).toEqual([BOB, CAROL].sort())
    expect(created.every(c => c.input['type'] === 'team_mention')).toBe(true)
  })

  it('portefeuille restreint : pas de notification à qui n’a pas accès au compte', async () => {
    const { service, created } = build({
      visibility: 'restricted',
      account: { id: ACCOUNT, company_name: 'Acme', assigned_to: CAROL, workspace_id: WS },
    })
    await service.notifyMentions({
      workspaceId: WS,
      actorUserId: ALICE,
      mentionedUserIds: [BOB, CAROL],
      accountId: ACCOUNT,
      conversationId: null,
    })
    // Bob (sales, compte porté par Carol) n’y a pas accès ; Carol le porte.
    expect(created.map(c => c.userId)).toEqual([CAROL])
  })

  it('#4996 L3 — portefeuille restreint : un co-équipier actif du compte porté par un autre est notifié', async () => {
    const { service, created } = build({
      visibility: 'restricted',
      account: { id: ACCOUNT, company_name: 'Acme', assigned_to: CAROL, workspace_id: WS },
      teammates: [BOB],
    })
    await service.notifyMentions({
      workspaceId: WS,
      actorUserId: ALICE,
      mentionedUserIds: [BOB],
      accountId: ACCOUNT,
      conversationId: null,
    })
    expect(created.map(c => c.userId)).toEqual([BOB])
  })

  it('portefeuille restreint : un gestionnaire d’équipe y a accès', async () => {
    const { service, created } = build({
      visibility: 'restricted',
      account: { id: ACCOUNT, company_name: 'Acme', assigned_to: BOB, workspace_id: WS },
    })
    await service.notifyMentions({
      workspaceId: WS,
      actorUserId: ALICE,
      mentionedUserIds: [CAROL],
      accountId: ACCOUNT,
      conversationId: null,
    })
    expect(created.map(c => c.userId)).toEqual([CAROL])
  })

  it('un membre d’un AUTRE espace mentionné n’est pas notifié', async () => {
    const { service, created } = build()
    await service.notifyMentions({
      workspaceId: OTHER_WS,
      actorUserId: ALICE,
      mentionedUserIds: [BOB],
      accountId: null,
      conversationId: null,
    })
    expect(created).toHaveLength(0)
  })

  it('un commentaire général mène à /team', async () => {
    const { service, created } = build()
    await service.notifyMentions({
      workspaceId: WS,
      actorUserId: ALICE,
      mentionedUserIds: [BOB],
      accountId: null,
      conversationId: null,
    })
    expect(created[0]?.input['link']).toBe('/team')
  })
})

describe('TeamNotificationsService — #4158.19 e-mail opt-in', () => {
  const args = { workspaceId: WS, actorUserId: ALICE, recipientUserId: BOB, accountId: ACCOUNT }

  it('désactivé (défaut, aucune ligne de préférences) ⇒ ZÉRO appel au mailer', async () => {
    const { service, mailer, created } = build()
    await service.notifyAccountAssigned(args)
    expect(created).toHaveLength(1)
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('désactivé explicitement ⇒ ZÉRO appel au mailer', async () => {
    const { service, mailer } = build({ prefs: { [BOB]: { email_on_assignment: false } } })
    await service.notifyAccountAssigned(args)
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('l’interrupteur d’UN type ne déclenche pas les autres types', async () => {
    const { service, mailer } = build({ prefs: { [BOB]: { email_on_mention: true } } })
    await service.notifyAccountAssigned(args)
    await service.notifyActionDelegated({ ...args })
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('activé ⇒ UN e-mail, au destinataire seul, avec le lien et sans corps de message', async () => {
    const { service, mailer } = build({ prefs: { [BOB]: { email_on_assignment: true } } })
    await service.notifyAccountAssigned(args)
    expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
    const sent = (mailer.sendNotificationEmail.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(sent['to']).toBe('bob@esn.test')
    expect(String(sent['ctaUrl'])).toContain(`/accounts/${ACCOUNT}`)
    expect(String(sent['subject'])).toContain('Alice Martin')
  })

  it('une mention par e-mail ne porte pas le corps du commentaire', async () => {
    const { service, mailer } = build({ prefs: { [BOB]: { email_on_mention: true } } })
    await service.notifyMentions({
      workspaceId: WS,
      actorUserId: ALICE,
      mentionedUserIds: [BOB],
      accountId: ACCOUNT,
      conversationId: null,
    })
    const sent = (mailer.sendNotificationEmail.mock.calls[0] as unknown as [{ bodyLines: string[] }])[0]
    expect(sent.bodyLines.join(' ')).not.toMatch(/commentaire\s*:/i)
    expect(sent.bodyLines).toHaveLength(1)
  })

  it('adresse supprimée (opt-out) ⇒ aucun e-mail, la notification reste', async () => {
    const { service, mailer, created } = build({
      prefs: { [BOB]: { email_on_assignment: true } },
      suppressed: true,
    })
    await service.notifyAccountAssigned(args)
    expect(created).toHaveLength(1)
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('espace de démonstration ⇒ jamais d’e-mail', async () => {
    const { service, mailer, created } = build({ prefs: { [BOB]: { email_on_assignment: true } }, demo: true })
    await service.notifyAccountAssigned(args)
    expect(created).toHaveLength(1)
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('un mailer en panne ne fait jamais échouer le geste', async () => {
    const { service, created } = build({ prefs: { [BOB]: { email_on_assignment: true } }, mailerThrows: true })
    await expect(service.notifyAccountAssigned(args)).resolves.toBeUndefined()
    expect(created).toHaveLength(1)
  })
})

// #4158.28 — le digest du manager passe par LE MÊME service (pas un second chemin) et par la
// MÊME préférence (`notification_preferences.email_on_manager_digest`, faux par défaut).
describe('TeamNotificationsService — #4158.28 digest du manager', () => {
  const digest = { workspaceId: WS, recipientUserId: BOB, title: 'La semaine de ton équipe', lines: ['A.', 'B.'] }

  it('dépose le digest dans la boîte de l’ESPACE du destinataire, sans auteur', async () => {
    const { service, created } = build()
    expect(await service.notifyManagerDigest(digest)).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0]?.userId).toBe(BOB)
    expect(created[0]?.input).toMatchObject({
      type: 'manager_digest',
      title: 'La semaine de ton équipe',
      body: 'A.\nB.',
      link: '/team',
      workspaceId: WS,
    })
    expect(created[0]?.input['actorUserId']).toBeUndefined()
  })

  it('un destinataire qui n’est pas membre de l’espace ne reçoit rien', async () => {
    const { service, created } = build()
    expect(await service.notifyManagerDigest({ ...digest, workspaceId: OTHER_WS })).toBe(false)
    expect(created).toHaveLength(0)
  })

  it('désactivé (défaut) ⇒ ZÉRO appel au mailer ; l’interrupteur d’un autre type ne compte pas', async () => {
    const { service, mailer } = build({ prefs: { [BOB]: { email_on_assignment: true, email_on_mention: true } } })
    await service.notifyManagerDigest(digest)
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
  })

  it('activé ⇒ UN e-mail au destinataire seul, mêmes lignes que l’app', async () => {
    const { service, mailer } = build({ prefs: { [BOB]: { email_on_manager_digest: true } } })
    await service.notifyManagerDigest(digest)
    expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
    const mail = (mailer.sendNotificationEmail.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(mail).toMatchObject({ to: 'bob@esn.test', bodyLines: ['A.', 'B.'] })
    expect(String(mail['ctaUrl'])).toMatch(/\/team$/)
  })

  it('adresse supprimée, espace de démonstration ou mailer en panne ⇒ la ligne dans l’app reste', async () => {
    for (const opts of [{ suppressed: true }, { demo: true }, { mailerThrows: true }]) {
      const { service, created, mailer } = build({ ...opts, prefs: { [BOB]: { email_on_manager_digest: true } } })
      expect(await service.notifyManagerDigest(digest)).toBe(true)
      expect(created).toHaveLength(1)
      if (!('mailerThrows' in opts)) expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
    }
  })
})
