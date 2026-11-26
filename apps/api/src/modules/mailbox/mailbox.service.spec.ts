import { BadRequestException, ConflictException, HttpException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { connectorErrorSchema, mailboxProviderSchema } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MailBatchEntity } from '../../database/entities/mail-batch.entity'
import { MailThreadMarkEntity } from '../../database/entities/mail-thread-mark.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SuppressionService } from '../mailer/suppression.service'
import { MAILBOX_SETTINGS_SCOPE, MAIL_READWRITE_SCOPE, MAIL_SEND_SCOPE } from '../microsoft/microsoft.service'
import { capabilitiesOf } from '../tool-registry/tool-capabilities'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TOOL_CATALOG } from '../tool-registry/tool-catalog'
import { MAILBOX_BACKENDS, MAILBOX_SCOPES, MAILBOX_TOOL_PROVIDERS, mailboxProvidersExcludedBy } from './mailbox-backend'
import { MailboxService } from './mailbox.service'

const CONNECTED = {
  connected: true,
  provider: 'google' as const,
  address: 'moi@bellum.fr',
  capabilities: { read: true, draft: true, send: true, labels: true, outOfOffice: true },
}

function backend(overrides: Record<string, unknown> = {}) {
  return {
    status: jest.fn().mockResolvedValue(CONNECTED),
    search: jest.fn().mockResolvedValue({ messages: [], resolvedQuery: 'q', truncated: false }),
    listAttachments: jest.fn().mockResolvedValue([]),
    getAttachment: jest
      .fn()
      .mockResolvedValue({ filename: 'cv.pdf', mimeType: 'application/pdf', dataB64: 'AA==', messageDate: null }),
    createDraft: jest.fn().mockResolvedValue({
      provider: 'google',
      draftId: 'd1',
      messageId: 'm1',
      threadId: 't1',
      webUrl: null,
    }),
    // #2277.34, épopée #2771 — le rollback de `createDraft`.
    deleteDraft: jest.fn().mockResolvedValue({ deleted: true }),
    getOutOfOffice: jest.fn().mockResolvedValue(null),
    setOutOfOffice: jest.fn(),
    signature: jest.fn().mockResolvedValue({ text: 'Théo Haddad\nBellum', address: 'moi@bellum.fr' }),
    ...overrides,
  }
}

async function build(
  backends: unknown[],
  profile: Partial<ProfileEntity> | null = null,
  suppressed = false,
  /** Le portefeuille de contacts qui sert au rattachement des fils (MAIL-01).
   *  Vide par défaut : `account` reste `null`, comme avant le champ. */
  contactAnchors: Array<{ contactId: string; email: string; accountId: string; accountName: string }> = [],
  /** #1959.3 — la réclamation d'idempotence (`action_dispatch_attempts`) passe
   *  par `this.profiles.query(...)` : absente, elle n'est jamais appelée (aucun
   *  test existant n'envoie `idempotencyKey`), donc aucun autre test n'a besoin
   *  de la fournir. */
  profilesQuery: jest.Mock | null = null,
  /** #2104.6/.7/.8 — les décisions manuelles déjà posées (`mail_thread_marks`).
   *  Vide par défaut : `state`/`priorityLevel` se calculent sans aucune marque,
   *  comme avant ce champ. */
  marksRows: Array<{
    threadId: string
    state: string | null
    accountId: string | null
    accountName: string | null
    snoozeUntil?: Date | null
  }> = [],
  /** Le compte que `linkThreadAccount` doit trouver pour valider un
   *  rattachement manuel. `undefined` = comportement par défaut (trouvé). */
  accountsFindOneResult: Record<string, unknown> | null | undefined = { id: 'acc-1', workspace_id: 'ws1' },
  /** #2381.1/.3/.6 — la réconciliation séquence/réponse (`this.contacts.query`,
   *  raw SQL, comme `ContactsService`). `null` = comportement par défaut
   *  ([] — aucune séquence vivante trouvée, rien à arrêter/mettre en pause). */
  contactsQuery: jest.Mock | null = null,
  /** #2955 (#2394.57) — les messages `assistant` d'une conversation déjà
   *  persistés, tels que `knownMailThreadParticipants` les relit (le plus
   *  récent d'abord). Vide par défaut : `known === null` partout, comme avant
   *  ce champ — aucune vérification de destinataire. */
  chatMessagesRows: Array<{ context: unknown }> = [],
) {
  const marksUpsert = jest.fn().mockResolvedValue(undefined)
  const accountsFindOne = jest.fn().mockResolvedValue(accountsFindOneResult)
  // #2875/#2402.3 (lot V11) — le registre canonique, best-effort. Un mock
  // simple : la NestJS DI le fournit, `MailboxService` reste indifférent à
  // savoir s'il vaut réellement quelque chose.
  const triggersRecord = jest.fn().mockResolvedValue(undefined)
  const moduleRef = await Test.createTestingModule({
    providers: [
      MailboxService,
      { provide: TriggerRegistryService, useValue: { recordOnceByDedupeKey: triggersRecord } },
      { provide: MAILBOX_BACKENDS, useValue: backends },
      {
        provide: getRepositoryToken(ProfileEntity),
        useValue: { findOne: jest.fn().mockResolvedValue(profile), ...(profilesQuery ? { query: profilesQuery } : {}) },
      },
      {
        provide: getRepositoryToken(MailBatchEntity),
        useValue: { findOne: jest.fn().mockResolvedValue(null), insert: jest.fn(), update: jest.fn() },
      },
      // Le rattachement d'un fil à son compte (MAIL-01). La doublure rend le
      // portefeuille de contacts ; vide par défaut ⇒ `account: null` partout,
      // c'est-à-dire le comportement d'avant le champ.
      {
        provide: getRepositoryToken(ContactEntity),
        useValue: {
          createQueryBuilder: jest.fn(() => ({
            innerJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(contactAnchors),
          })),
          query: contactsQuery ?? jest.fn().mockResolvedValue([]),
        },
      },
      // #2104.6/.7/.8 — la décision manuelle sur un fil.
      {
        provide: getRepositoryToken(MailThreadMarkEntity),
        useValue: {
          createQueryBuilder: jest.fn(() => ({
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(marksRows),
          })),
          upsert: marksUpsert,
        },
      },
      { provide: getRepositoryToken(AccountEntity), useValue: { findOne: accountsFindOne } },
      // #2955 (#2394.57) — l'état de conversation déjà persisté, LECTURE SEULE.
      {
        provide: getRepositoryToken(ChatMessageEntity),
        useValue: { find: jest.fn().mockResolvedValue(chatMessagesRows) },
      },
      { provide: SuppressionService, useValue: { isSuppressed: jest.fn().mockResolvedValue(suppressed) } },
      {
        provide: WorkspaceContextService,
        useValue: {
          resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws1' }),
          isDemoWorkspace: jest.fn().mockResolvedValue(false),
        },
      },
    ],
  }).compile()
  const service = moduleRef.get(MailboxService)
  // Exposés pour les tests d'écriture (#2104.6/.7/.8), sans changer la forme
  // que renvoient tous les appels existants de `build(...)`.
  return Object.assign(service, {
    __marksUpsert: marksUpsert,
    __accountsFindOne: accountsFindOne,
    __triggersRecord: triggersRecord,
  })
}

const DRAFT = {
  to: 'jean@acme.com',
  cc: [],
  subject: 'Suite à notre échange',
  body: 'Bonjour Jean,',
  appendSignature: true,
  documentIds: [],
}

describe('MailboxService', () => {
  it('sans messagerie connectée, le statut le DIT au lieu de lever', async () => {
    const service = await build([backend({ status: jest.fn().mockResolvedValue(null) })])
    const status = await service.status('u1')
    expect(status.connected).toBe(false)
    expect(status.provider).toBeNull()
    // #2756 — aucune messagerie connectée ⇒ aucune à compter.
    expect(status.connectedCount).toBe(0)
  })

  it('une messagerie en panne ne masque pas l’autre', async () => {
    const broken = backend({ status: jest.fn().mockRejectedValue(new Error('503')) })
    const healthy = backend()
    const service = await build([broken, healthy])
    const status = await service.status('u1')
    expect(status.connected).toBe(true)
  })

  // #2756 — Louis (beta, 23/09) : « on devrait pouvoir gérer / connecter
  // plusieurs messageries, afficher celle qu'on veut ». Le service choisit
  // déjà « la première connectée » (Google + Microsoft 365 peuvent coexister,
  // voir le docblock de la classe), mais ne le disait NULLE PART à l'écran :
  // `/mailbox` ne savait pas qu'une SECONDE boîte était branchée. `connectedCount`
  // rend ce fait lisible, sans toucher au choix ni au flux OAuth lui-même.
  it('#2756 — compte TOUTES les messageries connectées, pas seulement celle qui gagne', async () => {
    const google = backend({ status: jest.fn().mockResolvedValue({ ...CONNECTED, provider: 'google' }) })
    const microsoft = backend({ status: jest.fn().mockResolvedValue({ ...CONNECTED, provider: 'microsoft' }) })
    const service = await build([google, microsoft])
    const status = await service.status('u1')
    expect(status.connected).toBe(true)
    expect(status.provider).toBe('google') // la première gagne, inchangé
    expect(status.connectedCount).toBe(2)
  })

  it('#2756 — une seule messagerie connectée : connectedCount vaut 1', async () => {
    const service = await build([backend()])
    const status = await service.status('u1')
    expect(status.connectedCount).toBe(1)
  })

  it('#2756 — une messagerie en panne ne compte pas parmi les connectées', async () => {
    const broken = backend({ status: jest.fn().mockRejectedValue(new Error('503')) })
    const healthy = backend()
    const service = await build([broken, healthy])
    const status = await service.status('u1')
    expect(status.connectedCount).toBe(1)
  })

  it('refuse de déposer un brouillon pour un destinataire désabonné', async () => {
    // Un opt-out ne se contourne pas parce que le message part d'une autre boîte.
    const target = backend()
    const service = await build([target], null, true)
    await expect(service.createDraft('u1', DRAFT)).rejects.toBeInstanceOf(ConflictException)
    expect(target.createDraft).not.toHaveBeenCalled()
  })

  it('la signature saisie dans Bellum l’emporte sur celle du fournisseur', async () => {
    const target = backend()
    const service = await build([target], { email_signature: 'Théo — Bellum' })
    await service.createDraft('u1', DRAFT)
    expect(target.createDraft).toHaveBeenCalledWith('u1', DRAFT, 'Théo — Bellum')
    expect(target.signature).not.toHaveBeenCalled()
  })

  it('à défaut, lit la signature réelle du fournisseur', async () => {
    const target = backend()
    const service = await build([target], { email_signature: null })
    await service.createDraft('u1', DRAFT)
    expect(target.createDraft).toHaveBeenCalledWith('u1', DRAFT, 'Théo Haddad\nBellum')
  })

  // #4412 — le brouillon d'un e-mail préparé pour un contact rejoint le fil déjà ouvert avec lui.
  it('#4412 — createContactDraft : rejoint le fil déjà ouvert avec ce contact', async () => {
    const target = backend()
    const query = jest.fn().mockResolvedValue([{ provider_thread_id: 'th-42' }])
    const service = await build([target], null, false, [], null, [], undefined, query)
    const result = await service.createContactDraft('u1', {
      contactId: 'c1',
      to: 'jean@acme.com',
      subject: 'Suite',
      body: 'Bonjour Jean,',
    })
    expect(target.createDraft).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ to: 'jean@acme.com', threadId: 'th-42' }),
      expect.anything(),
    )
    expect(result.provider).toBe('google')
  })

  it('#4412 — createContactDraft : aucun fil connu → nouveau message, jamais un fil deviné', async () => {
    const target = backend()
    const service = await build([target])
    await service.createContactDraft('u1', { contactId: 'c1', to: 'jean@acme.com', subject: 'Suite', body: 'Bonjour' })
    const request = target.createDraft.mock.calls[0][1] as { threadId?: string }
    expect(request.threadId).toBeUndefined()
  })

  it('quand aucune signature n’est lisible, n’en invente pas', async () => {
    // Garde-fou n°2 : jamais de marque-place. `null` = brouillon non signé.
    const target = backend({ signature: jest.fn().mockResolvedValue({ text: null, address: null }) })
    const service = await build([target], null)
    await service.createDraft('u1', DRAFT)
    expect(target.createDraft).toHaveBeenCalledWith('u1', DRAFT, null)
  })

  /**
   * #2955 (#2394.57, décision Louis 28/09) — LE NO-GO : répondre à un fil sans
   * écrire à quelqu'un qui en fait RÉELLEMENT partie. La vérification lit
   * l'état DÉJÀ PERSISTÉ de la conversation `/chat` (`context.mail_threads`),
   * jamais une nouvelle méthode de lecture de la messagerie.
   */
  describe('#2955 (#2394.57) — le destinataire connu du fil', () => {
    const ACCOUNT_DEFAULT = { id: 'acc-1', workspace_id: 'ws1' }
    const contextRow = (participants: string[]) => ({
      context: { mail_threads: [{ thread_id: 'th-1', participants }] },
    })

    it('refuse un destinataire qui ne fait PAS partie des participants connus du fil', async () => {
      const target = backend()
      const service = await build([target], null, false, [], null, [], ACCOUNT_DEFAULT, null, [
        contextRow(['jean@acme.com']),
      ])
      await expect(
        service.createDraft('u1', { ...DRAFT, to: 'inconnu@ailleurs.fr', threadId: 'th-1', conversationId: 'conv-1' }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(target.createDraft).not.toHaveBeenCalled()
    })

    it('accepte un destinataire QUI fait partie des participants connus, insensible à la casse', async () => {
      const target = backend()
      const service = await build([target], null, false, [], null, [], ACCOUNT_DEFAULT, null, [
        contextRow(['Jean@ACME.com']),
      ])
      await service.createDraft('u1', { ...DRAFT, to: 'jean@acme.com', threadId: 'th-1', conversationId: 'conv-1' })
      expect(target.createDraft).toHaveBeenCalled()
    })

    it('un fil jamais vu dans cette conversation (non mesuré) n’empêche PAS le dépôt', async () => {
      const target = backend()
      const service = await build([target], null, false, [], null, [], ACCOUNT_DEFAULT, null, [])
      await service.createDraft('u1', {
        ...DRAFT,
        to: 'inconnu@ailleurs.fr',
        threadId: 'th-1',
        conversationId: 'conv-1',
      })
      expect(target.createDraft).toHaveBeenCalled()
    })

    it('sans `conversationId` (composition manuelle hors chat), AUCUNE vérification — comportement inchangé', async () => {
      const target = backend()
      const service = await build([target], null, false, [], null, [], ACCOUNT_DEFAULT, null, [
        contextRow(['jean@acme.com']),
      ])
      await service.createDraft('u1', { ...DRAFT, to: 'inconnu@ailleurs.fr', threadId: 'th-1' })
      expect(target.createDraft).toHaveBeenCalled()
    })
  })

  // #2277.34, épopée #2771 — le rollback de `createDraft`.
  describe('deleteDraft (#2771)', () => {
    it('relaie l’identifiant au backend connecté', async () => {
      const target = backend()
      const service = await build([target])
      const result = await service.deleteDraft('u1', 'd1')
      expect(target.deleteDraft).toHaveBeenCalledWith('u1', 'd1')
      expect(result).toEqual({ deleted: true })
    })

    it('en salle de démonstration, rien n’est appelé — rien n’y a jamais été déposé', async () => {
      const target = backend()
      const workspaceContext = {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws1' }),
        isDemoWorkspace: jest.fn().mockResolvedValue(true),
      }
      const moduleRef = await Test.createTestingModule({
        providers: [
          MailboxService,
          { provide: MAILBOX_BACKENDS, useValue: [target] },
          { provide: getRepositoryToken(ProfileEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
          { provide: getRepositoryToken(MailBatchEntity), useValue: {} },
          { provide: getRepositoryToken(ContactEntity), useValue: {} },
          { provide: getRepositoryToken(MailThreadMarkEntity), useValue: {} },
          { provide: getRepositoryToken(AccountEntity), useValue: {} },
          { provide: getRepositoryToken(ChatMessageEntity), useValue: {} },
          { provide: SuppressionService, useValue: { isSuppressed: jest.fn() } },
          { provide: WorkspaceContextService, useValue: workspaceContext },
        ],
      }).compile()
      const service = moduleRef.get(MailboxService)

      const result = await service.deleteDraft('u1', 'd1')

      expect(result).toEqual({ deleted: false })
      expect(target.deleteDraft).not.toHaveBeenCalled()
      expect(target.status).not.toHaveBeenCalled()
    })
  })

  // Théo D settings-integrations.DÉC.absence — la salle montre la réponse d'absence (craft rule n°9), sans rien écrire chez un fournisseur.
  describe('réponse d’absence en salle de démonstration', () => {
    async function demoService(target: ReturnType<typeof backend>) {
      const moduleRef = await Test.createTestingModule({
        providers: [
          MailboxService,
          { provide: MAILBOX_BACKENDS, useValue: [target] },
          { provide: getRepositoryToken(ProfileEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
          { provide: getRepositoryToken(MailBatchEntity), useValue: {} },
          { provide: getRepositoryToken(ContactEntity), useValue: {} },
          { provide: getRepositoryToken(MailThreadMarkEntity), useValue: {} },
          { provide: getRepositoryToken(AccountEntity), useValue: {} },
          { provide: getRepositoryToken(ChatMessageEntity), useValue: {} },
          { provide: SuppressionService, useValue: { isSuppressed: jest.fn() } },
          {
            provide: WorkspaceContextService,
            useValue: {
              resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws1' }),
              isDemoWorkspace: jest.fn().mockResolvedValue(true),
            },
          },
        ],
      }).compile()
      return moduleRef.get(MailboxService)
    }

    it('la salle annonce la capacité et rend une réponse d’exemple, éteinte, sans appeler de fournisseur', async () => {
      const target = backend()
      const service = await demoService(target)
      expect((await service.status('demo-user')).capabilities.outOfOffice).toBe(true)
      const current = await service.getOutOfOffice('demo-user')
      expect(current).toMatchObject({ enabled: false, contactsOnly: false })
      expect(current?.message).toEqual(expect.any(String))
      expect(target.getOutOfOffice).not.toHaveBeenCalled()
    })

    it('⚠️ SAIT DIRE NON — enregistrer en salle de démonstration renvoie la saisie, sans rien écrire chez un fournisseur', async () => {
      const target = backend()
      const service = await demoService(target)
      const saved = await service.setOutOfOffice('demo-user', { enabled: true, contactsOnly: true, message: 'Absent.' })
      expect(saved).toMatchObject({ enabled: true, contactsOnly: true, message: 'Absent.' })
      expect(target.setOutOfOffice).not.toHaveBeenCalled()
    })
  })

  // #1959.3 — LE CHAT APPELLE CET ENDPOINT EN DIRECT, SANS LE ROUTEUR D'ACTIONS.
  //
  // `dispatchIdempotent` protège tout ce qui passe par `actionsApi.dispatch`
  // (schedule_reminder…) ; ce chemin-ci ne passait par rien. Un double clic ou
  // un rejeu réseau déposait deux brouillons dans la VRAIE messagerie —
  // exactement le défaut que #1959.20 nomme.
  describe('#1959.3 — idempotence du brouillon (déposé en direct)', () => {
    it('sans clé, aucune réclamation n’est tentée (comportement byte-identique)', async () => {
      const target = backend()
      const query = jest.fn()
      const service = await build([target], null, false, [], query)
      await service.createDraft('u1', DRAFT)
      expect(query).not.toHaveBeenCalled()
      expect(target.createDraft).toHaveBeenCalledTimes(1)
    })

    it('avec une clé neuve, la réclamation part AVANT le dépôt puis se complète', async () => {
      const target = backend()
      const query = jest.fn().mockResolvedValue([])
      const service = await build([target], null, false, [], query)
      const result = await service.createDraft('u1', { ...DRAFT, idempotencyKey: 'gesture-1' })
      expect(target.createDraft).toHaveBeenCalledTimes(1)
      expect(query.mock.calls[0]?.[0]).toMatch(/INSERT INTO action_dispatch_attempts/)
      expect(query.mock.calls[0]?.[1]).toEqual(['ws1', 'gesture-1', 'create_mail_draft_direct', 'u1'])
      expect(query.mock.calls[1]?.[0]).toMatch(/UPDATE action_dispatch_attempts/)
      expect(result).toEqual({ provider: 'google', draftId: 'd1', messageId: 'm1', threadId: 't1', webUrl: null })
    })

    it('une deuxième tentative avec la MÊME clé, déjà TERMINÉE, ne dépose pas un second brouillon', async () => {
      const target = backend()
      const existing = { provider: 'google', draftId: 'd1', messageId: 'm1', threadId: 't1', webUrl: 'https://mail/d1' }
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' })
      const query = jest
        .fn()
        .mockRejectedValueOnce(uniqueViolation)
        .mockResolvedValueOnce([{ status: 'done', external_ref: JSON.stringify(existing) }])
      const service = await build([target], null, false, [], query)
      const result = await service.createDraft('u1', { ...DRAFT, idempotencyKey: 'gesture-1' })
      expect(target.createDraft).not.toHaveBeenCalled()
      expect(result).toEqual(existing)
    })

    it('une deuxième tentative EN VOL (résultat pas encore connu) refuse plutôt que de déposer un second brouillon', async () => {
      const target = backend()
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' })
      const query = jest
        .fn()
        .mockRejectedValueOnce(uniqueViolation)
        .mockResolvedValueOnce([{ status: null, external_ref: null }])
      const service = await build([target], null, false, [], query)
      await expect(service.createDraft('u1', { ...DRAFT, idempotencyKey: 'gesture-1' })).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(target.createDraft).not.toHaveBeenCalled()
    })
  })

  it('refuse la recherche quand la portée de lecture manque', async () => {
    const target = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, capabilities: { ...CONNECTED.capabilities, read: false } }),
    })
    const service = await build([target])
    await expect(service.search('u1', { intent: 'unread' } as never)).rejects.toThrow(/lecture/)
  })

  it('« sans réponse » ne retient que les silences plus longs que le seuil', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'in:sent',
        truncated: false,
        messages: [
          {
            id: 'a',
            threadId: 'stale',
            subject: 'Proposition',
            from: 'moi@bellum.fr',
            to: ['jean@acme.com'],
            cc: [],
            date: new Date(Date.now() - 20 * 86400000).toISOString(),
            snippet: null,
            unread: false,
            hasAttachments: false,
            direction: 'outbound',
          },
          {
            id: 'b',
            threadId: 'recent',
            subject: 'Autre',
            from: 'moi@bellum.fr',
            to: ['paul@acme.com'],
            cc: [],
            date: new Date(Date.now() - 2 * 86400000).toISOString(),
            snippet: null,
            unread: false,
            hasAttachments: false,
            direction: 'outbound',
          },
        ],
      }),
    })
    const service = await build([target])
    const result = await service.search('u1', {
      intent: 'no_reply',
      windowDays: 60,
      silenceDays: 7,
      limit: 25,
    } as never)
    expect(result.threads.map(thread => thread.threadId)).toEqual(['stale'])
  })

  // #2104.3 — la fiche contact voyage jusqu'au fil, mais seulement sur une
  // adresse EXACTE : un domaine ne désigne jamais une personne en particulier
  // (`thread-account-link.spec.ts` couvre déjà la règle en isolation).
  it('porte le contactId quand l’adresse exacte de l’interlocuteur est connue', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'in:inbox',
        truncated: false,
        messages: [
          {
            id: 'a',
            threadId: 't1',
            subject: 'Point projet',
            from: 'marie@acme.fr',
            to: ['moi@bellum.fr'],
            cc: [],
            date: new Date().toISOString(),
            snippet: null,
            unread: false,
            hasAttachments: false,
            direction: 'inbound',
          },
        ],
      }),
    })
    const service = await build([target], null, false, [
      { contactId: 'contact-1', email: 'marie@acme.fr', accountId: 'acc-1', accountName: 'ACME' },
    ])
    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    expect(result.threads[0]?.contactId).toBe('contact-1')
    expect(result.threads[0]?.account).toEqual({ id: 'acc-1', name: 'ACME', via: 'contact' })
  })
})

/**
 * #2104.14/.15/.16/.17 — LE CLASSEMENT arrive jusqu'au fil, et TRIE la liste.
 * `mail-priority.spec.ts` couvre déjà le calcul en isolation ; ces tests
 * vérifient que `search()` le CÂBLE réellement (état, niveau, raison, tri) —
 * le motif qui revient dans ce dépôt : du code juste que personne n'appelle.
 */
describe('MailboxService — le classement (#2104.14/.16/.17)', () => {
  function messagesFor(threadId: string, opts: Partial<Record<string, unknown>> = {}) {
    return {
      id: `${threadId}-m1`,
      threadId,
      subject: 'Sujet',
      from: 'contact@acme.fr',
      to: ['moi@bellum.fr'],
      cc: [],
      date: new Date().toISOString(),
      snippet: null,
      unread: false,
      hasAttachments: false,
      direction: 'inbound',
      ...opts,
    }
  }

  it('un fil NON LU sort avec son état, son niveau et sa raison', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [messagesFor('t-unread', { unread: true })],
      }),
    })
    const service = await build([target])
    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    expect(result.threads[0]).toMatchObject({ state: 'unread', priorityLevel: 3, priorityReason: 'unread' })
  })

  it('TRIE la liste par niveau croissant, même quand la recherche les rend dans un autre ordre', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [
          // Rendu D'ABORD par le fournisseur, mais ne devrait PAS rester en tête.
          messagesFor('t-calm', { unread: false, direction: 'outbound' }),
          messagesFor('t-unread', { unread: true }),
        ],
      }),
    })
    const service = await build([target])
    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    expect(result.threads.map(t => t.threadId)).toEqual(['t-unread', 't-calm'])
  })

  it('un fil MARQUÉ TRAITÉ retombe au niveau 6, quel que soit son état observé', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [messagesFor('t-treated', { unread: true })],
      }),
    })
    const service = await build([target], null, false, [], null, [
      { threadId: 't-treated', state: 'treated', accountId: null, accountName: null },
    ])
    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    expect(result.threads[0]).toMatchObject({ state: 'treated', priorityLevel: 6, priorityReason: 'treated' })
  })

  it('Théo B M2.N3 — un fil REPORTÉ sort avec sa date de retour ; un report échu ou absent ne dit rien', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [
          messagesFor('t-snoozed', { subject: 'Un', from: 'un@acme.fr' }),
          messagesFor('t-plain', { subject: 'Deux', from: 'deux@acme.fr' }),
        ],
      }),
    })
    const later = new Date(Date.now() + 5 * 86_400_000)
    const service = await build([target], null, false, [], null, [
      { threadId: 't-snoozed', state: null, accountId: null, accountName: null, snoozeUntil: later },
    ])
    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    const byId = new Map(result.threads.map(t => [t.threadId, t]))
    expect(byId.get('t-snoozed')?.snoozeUntil).toBe(later.toISOString())
    expect(byId.get('t-plain')?.snoozeUntil ?? null).toBeNull()
  })

  it('un rattachement MANUEL (#2104.6) l’emporte sur l’auto-détection', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [messagesFor('t-linked')],
      }),
    })
    const service = await build(
      [target],
      null,
      false,
      // Auto-détection : aucune (adresse inconnue du portefeuille).
      [],
      null,
      [{ threadId: 't-linked', state: null, accountId: 'acc-manual', accountName: 'Compte choisi à la main' }],
    )
    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    expect(result.threads[0]?.account).toEqual({ id: 'acc-manual', name: 'Compte choisi à la main', via: 'manual' })
  })

  it('la salle de DÉMONSTRATION reçoit aussi le classement — parité démo', async () => {
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(true),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailboxService,
        { provide: MAILBOX_BACKENDS, useValue: [] },
        { provide: getRepositoryToken(ProfileEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(MailBatchEntity), useValue: {} },
        { provide: getRepositoryToken(ContactEntity), useValue: {} },
        {
          provide: getRepositoryToken(MailThreadMarkEntity),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              leftJoin: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        { provide: getRepositoryToken(AccountEntity), useValue: {} },
        { provide: getRepositoryToken(ChatMessageEntity), useValue: {} },
        { provide: SuppressionService, useValue: { isSuppressed: jest.fn() } },
        { provide: WorkspaceContextService, useValue: workspaceContext },
      ],
    }).compile()
    const service = moduleRef.get(MailboxService)
    const result = await service.search('demo-user', { intent: 'unread', windowDays: 30, limit: 25 } as never)
    for (const thread of result.threads) {
      expect(thread.state).toBeDefined()
      expect(thread.priorityLevel).toBeGreaterThanOrEqual(1)
      expect(thread.priorityReason).toBeTruthy()
    }
  })
})

/**
 * #2381.3/.4/.5/.6 — une réponse ENTRANTE, une fois le contact résolu AVEC
 * CERTITUDE (adresse exacte, #2381.3), classe et arrête/met en pause la
 * séquence de ce contact. Best-effort : ne doit jamais faire tomber `search`.
 */
describe('MailboxService — réconciliation réponse/séquence (#2381)', () => {
  const ANCHOR = { contactId: 'c1', email: 'contact@acme.fr', accountId: 'acc-1', accountName: 'Acme' }

  function inboundReply(snippet: string) {
    return {
      id: 't-reply-m1',
      threadId: 't-reply',
      subject: null,
      from: 'contact@acme.fr',
      to: ['moi@bellum.fr'],
      cc: [],
      date: new Date().toISOString(),
      snippet,
      unread: true,
      hasAttachments: false,
      direction: 'inbound' as const,
    }
  }

  it('réponse POSITIVE : arrête la séquence vivante ET crée une action de qualification (#2381.6)', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Oui, très intéressé, on peut en parler.')],
      }),
    })
    const contactsQuery = jest
      .fn()
      .mockImplementation(async (sql: string) =>
        typeof sql === 'string' && sql.includes('FROM previous')
          ? [{ id: 'seq-1', workspace_id: 'ws1', previous_status: 'active' }]
          : [],
      )
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'u1'])
    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'skipped'"), [['seq-1']])
    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
      'ws1',
      'u1',
      'seq-1',
      'active',
      'reply_positive',
    ])
    // La qualification : une ligne `user_actions`, best-effort elle aussi.
    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_actions'), expect.anything())
    // #2875/#2402.3 (lot V11) — le MÊME classement construit AUSSI un
    // `TriggerEvent` canonique, sur la séquence RÉELLEMENT arrêtée.
    const triggered = (service as unknown as { __triggersRecord: jest.Mock }).__triggersRecord
    expect(triggered).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reponse_positive',
        source: 'mailbox',
        scope: { workspaceId: 'ws1', ownerId: 'u1' },
      }),
      'mailbox/mailbox.service',
    )
  })

  it('#3234 — le fil d’un envoi connu apparie son contact PAR IDENTIFIANT, avant l’heuristique d’adresse', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Oui, très intéressé, on peut en parler.')],
      }),
    })
    const contactsQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM outreach_messages')) return [{ contact_id: 'c-envoi' }]
      return typeof sql === 'string' && sql.includes('FROM previous')
        ? [{ id: 'seq-1', workspace_id: 'ws1', previous_status: 'active' }]
        : []
    })
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    // L'identifiant gagne sur l'adresse (c1) : la séquence arrêtée est celle du contact réellement écrit.
    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining('FROM outreach_messages'), ['u1', 't-reply'])
    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c-envoi', 'u1'])
    expect(contactsQuery).not.toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'u1'])
  })

  it('#3234 — un fil sans adresse reconnue mais avec un envoi connu est résolu par identifiant', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Oui, très intéressé, on peut en parler.')],
      }),
    })
    const contactsQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM outreach_messages')) return [{ contact_id: 'c-envoi' }]
      return typeof sql === 'string' && sql.includes('FROM previous')
        ? [{ id: 'seq-1', workspace_id: 'ws1', previous_status: 'active' }]
        : []
    })
    const service = await build([target], null, false, [], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c-envoi', 'u1'])
  })

  it('#3234 — aucun envoi connu pour ce fil : repli sur l’heuristique actuelle (contact par adresse exacte)', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Oui, très intéressé, on peut en parler.')],
      }),
    })
    const contactsQuery = jest
      .fn()
      .mockImplementation(async (sql: string) =>
        typeof sql === 'string' && sql.includes('FROM previous')
          ? [{ id: 'seq-1', workspace_id: 'ws1', previous_status: 'active' }]
          : [],
      )
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'u1'])
  })

  it('absence du bureau : MET EN PAUSE, jamais un arrêt, aucune qualification (#2381.5)', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Je suis actuellement absent du bureau, de retour le 12.')],
      }),
    })
    const contactsQuery = jest
      .fn()
      .mockImplementation(async (sql: string) =>
        typeof sql === 'string' && sql.includes('FROM previous')
          ? [{ id: 'seq-1', workspace_id: 'ws1', previous_status: 'active' }]
          : [],
      )
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'paused'"), ['c1', 'u1'])
    expect(contactsQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'cancelled'"),
      expect.anything(),
    )
    expect(contactsQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_actions'),
      expect.anything(),
    )
    // #2875/#2402.3 (lot V11) — une PAUSE n'est pas une réponse positive :
    // aucun événement canonique.
    expect((service as unknown as { __triggersRecord: jest.Mock }).__triggersRecord).not.toHaveBeenCalled()
  })

  it('contact NON résolu avec certitude (« à rapprocher ») : n’écrit rien (#2381.3)', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Oui, très intéressé.')],
      }),
    })
    // Aucune ancre : l'adresse ne correspond à aucun contact du portefeuille.
    const contactsQuery = jest.fn().mockResolvedValue([])
    const service = await build([target], null, false, [], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    // #3234 — la seule requête permise est la LECTURE de l'appariement par identifiant ;
    // aucun envoi connu pour ce fil ⇒ aucune écriture, contact toujours non résolu.
    const writes = contactsQuery.mock.calls.filter(([sql]) => /UPDATE|INSERT|DELETE/i.test(String(sql)))
    expect(writes).toEqual([])
  })

  it('un fil SORTANT (pas une réponse) ne touche AUCUNE séquence', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [{ ...inboundReply('Oui, intéressé.'), direction: 'outbound' as const }],
      }),
    })
    const contactsQuery = jest.fn().mockResolvedValue([])
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    expect(contactsQuery).not.toHaveBeenCalledWith(expect.stringContaining('outreach_sequences'), expect.anything())
  })

  // #4016 L13c — « Envoyé » détecté dans la boîte = preuve d'envoi.
  it('#4016 L13c — un message SORTANT vers un contact résolu complète ses actions OUVERTES par preuve', async () => {
    const sentAt = '2026-10-10T09:00:00.000Z'
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [
          {
            ...inboundReply('Bonjour, voici ma proposition.'),
            direction: 'outbound' as const,
            from: 'moi@bellum.fr',
            to: ['contact@acme.fr'],
            date: sentAt,
          },
        ],
      }),
    })
    const contactsQuery = jest.fn().mockResolvedValue([])
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    const call = contactsQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE action_plan_items'))
    expect(call).toBeDefined()
    const [sql, params] = call as [string, unknown[]]
    expect(sql).toContain("completion_mode = 'proof'")
    // Jamais une action déjà faite, jamais une autre nature que la prise de contact.
    expect(sql).toContain("execution_status IN ('todo', 'prepared')")
    expect(sql).toContain("target_kind = 'contact'")
    // Une action créée APRÈS l'envoi n'est pas la sienne.
    expect(sql).toContain('created_at <=')
    expect(params).toEqual(['c1', 'u1', new Date(sentAt)])
  })

  it('#4179.2 — un message SORTANT observé pose « vu dans les éléments envoyés » sur l’envoi par la boîte, rien d’autre', async () => {
    const sentAt = '2026-10-10T09:00:00.000Z'
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [
          {
            ...inboundReply('Bonjour, voici ma proposition.'),
            direction: 'outbound' as const,
            from: 'moi@bellum.fr',
            to: ['contact@acme.fr'],
            date: sentAt,
          },
        ],
      }),
    })
    const contactsQuery = jest.fn().mockResolvedValue([])
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    const call = contactsQuery.mock.calls.find(([sql]) => String(sql).includes('email_sent_observed_at'))
    expect(call).toBeDefined()
    const [sql, params] = call as [string, unknown[]]
    // Seul un envoi PAR LA BOÎTE est concerné (jamais l'envoi de l'espace), une seule fois,
    // et le message observé doit suivre la tentative (jamais un mail plus ancien).
    expect(sql).toContain("email_send_channel = 'mailbox'")
    expect(sql).toContain('email_sent_observed_at IS NULL')
    expect(sql).toContain('email_send_attempted_at')
    expect(params).toEqual(['c1', new Date(sentAt)])
  })

  // #4181 — une réponse REÇUE arrête aussi les tâches de relance et retire les brouillons « sans réponse ».
  describe('#4181 — une réponse reçue clôt les relances et retire les brouillons préparés', () => {
    const positive = () =>
      backend({
        search: jest.fn().mockResolvedValue({
          resolvedQuery: 'q',
          truncated: false,
          messages: [inboundReply('Oui, très intéressé, on peut en parler.')],
        }),
      })

    it('#4181.2 — une réponse par mail rend caduques les tâches de relance ouvertes du contact, raison à l’appui, même sans séquence', async () => {
      const contactsQuery = jest.fn().mockResolvedValue([])
      const service = await build([positive()], null, false, [ANCHOR], null, [], undefined, contactsQuery)

      await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

      const call = contactsQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE action_plan_items'))
      expect(call).toBeDefined()
      const [sql, params] = call as [string, unknown[]]
      expect(sql).toContain("execution_status = 'obsolete'")
      // Les seules relances de cadence, encore ouvertes ; jamais une tâche faite ni le premier contact.
      expect(sql).toContain("cadence_step IN ('relance', 'preuve_sociale', 'close_loop')")
      expect(sql).toContain("execution_status IN ('todo', 'prepared', 'snoozed')")
      expect(params.slice(0, 2)).toEqual(['c1', 'u1'])
      expect(String(params[2])).toMatch(/répon/i)
      expect(String(params[2])).toMatch(/mail/i)
    })

    it('#4181.2 — SAIT DIRE NON : une réponse automatique d’absence ne clôt aucune tâche', async () => {
      const away = backend({
        search: jest.fn().mockResolvedValue({
          resolvedQuery: 'q',
          truncated: false,
          messages: [inboundReply('Je suis actuellement absent du bureau, de retour le 12.')],
        }),
      })
      const contactsQuery = jest.fn().mockResolvedValue([])
      const service = await build([away], null, false, [ANCHOR], null, [], undefined, contactsQuery)

      await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

      expect(contactsQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE action_plan_items'),
        expect.anything(),
      )
    })

    it('#4181.3 — le brouillon « sans réponse » préparé pour ce contact est retiré, puis marqué annulé', async () => {
      const target = positive()
      const contactsQuery = jest
        .fn()
        .mockImplementation(async (sql: string) =>
          typeof sql === 'string' && sql.includes('SELECT') && sql.includes('no_reply_followup_draft')
            ? [{ id: 'att-1', external_ref: 'draft-9' }]
            : [],
        )
      const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

      await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

      expect(target.deleteDraft).toHaveBeenCalledWith('u1', 'draft-9')
      const marked = contactsQuery.mock.calls.find(([sql]) => /UPDATE action_dispatch_attempts/.test(String(sql)))
      expect(marked).toBeDefined()
      expect(String((marked as [string])[0])).toContain("status = 'cancelled'")
      expect((marked as [string, unknown[]])[1]).toContain('att-1')
    })

    it('#4181.3 — SAIT DIRE NON : un brouillon qui ne part pas à la suppression reste « fait » (reprise possible)', async () => {
      const target = positive()
      target.deleteDraft.mockRejectedValue(new Error('graph indisponible'))
      const contactsQuery = jest
        .fn()
        .mockImplementation(async (sql: string) =>
          typeof sql === 'string' && sql.includes('SELECT') && sql.includes('no_reply_followup_draft')
            ? [{ id: 'att-1', external_ref: 'draft-9' }]
            : [],
        )
      const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

      await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

      expect(contactsQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE action_dispatch_attempts'),
        expect.anything(),
      )
    })

    it('#4181.3 — `recordFollowUpDraft` consigne le brouillon préparé, relu plus tard par contact', async () => {
      const contactsQuery = jest.fn().mockResolvedValue([])
      const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)

      await service.recordFollowUpDraft('u1', 'c1', 'draft-9')

      const call = contactsQuery.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO action_dispatch_attempts'),
      )
      expect(call).toBeDefined()
      expect((call as [string, unknown[]])[1]).toEqual(['ws1', 'no_reply_draft:c1:draft-9', 'u1', 'draft-9'])
    })

    it('#4181.1 — `onReplyReceived` (point d’entrée LinkedIn) arrête la séquence, clôt les tâches et dit « LinkedIn »', async () => {
      const contactsQuery = jest
        .fn()
        .mockImplementation(async (sql: string) =>
          typeof sql === 'string' && sql.includes('FROM previous')
            ? [{ id: 'seq-1', workspace_id: 'ws1', previous_status: 'active' }]
            : [],
        )
      const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)

      await service.onReplyReceived('u1', 'c1', { channel: 'linkedin', event: 'reply_received', accountId: null })

      expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'u1'])
      const call = contactsQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE action_plan_items'))
      expect(String((call as [string, unknown[]])[1][2])).toMatch(/LinkedIn/)
    })
  })

  it('#4016 L13c — un message ENTRANT seul ne prouve aucun envoi', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Merci pour votre message.')],
      }),
    })
    const contactsQuery = jest.fn().mockResolvedValue([])
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    // #4181 : une réponse reçue rend caduques les relances (`obsolete`) — mais ne
    // prouve JAMAIS un envoi : aucune action n'est complétée par preuve.
    expect(contactsQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("completion_mode = 'proof'"),
      expect.anything(),
    )
  })

  it('#4016 L13c — contact NON résolu avec certitude : aucune action complétée', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [
          {
            ...inboundReply('Bonjour.'),
            direction: 'outbound' as const,
            from: 'moi@bellum.fr',
            to: ['contact@acme.fr'],
          },
        ],
      }),
    })
    const contactsQuery = jest.fn().mockResolvedValue([])
    const service = await build([target], null, false, [], null, [], undefined, contactsQuery)

    await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)

    expect(contactsQuery).not.toHaveBeenCalled()
  })

  it('la réconciliation est best-effort : un échec ne fait jamais tomber la recherche', async () => {
    const target = backend({
      search: jest.fn().mockResolvedValue({
        resolvedQuery: 'q',
        truncated: false,
        messages: [inboundReply('Oui, intéressé.')],
      }),
    })
    const contactsQuery = jest.fn().mockRejectedValue(new Error('db down'))
    const service = await build([target], null, false, [ANCHOR], null, [], undefined, contactsQuery)

    const result = await service.search('u1', { intent: 'free', windowDays: 30, limit: 25 } as never)
    expect(result.threads).toHaveLength(1)
  })
})

/**
 * #2104.6/.7/.8 — LES ÉCRITURES : marquer, signaler non pertinent, rattacher.
 */
describe('MailboxService — marquer et rattacher un fil (#2104.6/.7/.8)', () => {
  it('marque un fil TRAITÉ — une ligne par (utilisateur, fil), jamais deux', async () => {
    const service = await build([backend()])
    const result = await service.setThreadMark('u1', 't1', 'treated')
    expect(result).toEqual({ mark: 'treated' })
    const upsert = (service as unknown as { __marksUpsert: jest.Mock }).__marksUpsert
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', thread_id: 't1', state: 'treated' },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
  })

  it('mark: null EFFACE la décision — revenir en arrière ne demande pas une route à part', async () => {
    const service = await build([backend()])
    await service.setThreadMark('u1', 't1', null)
    const upsert = (service as unknown as { __marksUpsert: jest.Mock }).__marksUpsert
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', thread_id: 't1', state: null },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
  })

  it('rattache un fil à un compte DE L’ESPACE ACTIF', async () => {
    const service = await build([backend()])
    const result = await service.linkThreadAccount('u1', 't1', 'acc-1')
    expect(result).toEqual({ accountId: 'acc-1' })
    const upsert = (service as unknown as { __marksUpsert: jest.Mock }).__marksUpsert
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', thread_id: 't1', account_id: 'acc-1' },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
  })

  it('refuse de rattacher un compte introuvable dans l’espace — jamais une fuite entre organisations', async () => {
    const service = await build([backend()], null, false, [], null, [], null)
    await expect(service.linkThreadAccount('u1', 't1', 'acc-autre-espace')).rejects.toBeInstanceOf(BadRequestException)
    const upsert = (service as unknown as { __marksUpsert: jest.Mock }).__marksUpsert
    expect(upsert).not.toHaveBeenCalled()
  })
})

/**
 * L'échec de la messagerie passe par le CONTRAT de connecteur.
 *
 * Dix `throw new BadRequestException(...)` nus vivaient dans ce service — six
 * « aucune messagerie connectée », quatre « reconnecte-la ». Un 400 sans `code`,
 * indiscernable côté navigateur
 * d'une saisie invalide. L'écran, lui, branche depuis toujours sur
 * `not_connected` et `scope_missing` (`MailboxPage.tsx:41-42`) — il attendait
 * des codes qui n'arrivaient jamais. C'est exactement le trou que le contrat
 * `connector-error.ts` a été écrit pour fermer, module par module, et que le
 * module mailbox n'avait pas encore refermé.
 *
 * Les corps sont VALIDÉS contre le schéma partagé, jamais contre un
 * `expect.objectContaining` : un corps « qui ressemble » n'est pas un corps
 * conforme, et c'est le client qui paierait la différence.
 */
describe('MailboxService — l’échec dit son code', () => {
  const MICROSOFT = {
    ...CONNECTED,
    provider: 'microsoft' as const,
    capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
  }

  /** Le corps réel de l'exception, parsé — donc prouvé conforme. */
  async function failureOf(run: () => Promise<unknown>) {
    const error = await run().then(
      () => null,
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(HttpException)
    const raised = error as HttpException
    return { status: raised.getStatus(), body: connectorErrorSchema.parse(raised.getResponse()) }
  }

  it('sans messagerie branchée, rend `not_connected` et non un 400 muet', async () => {
    const service = await build([backend({ status: jest.fn().mockResolvedValue(null) })])
    const { status, body } = await failureOf(() => service.search('u1', { intent: 'unread' } as never))

    expect(status).toBe(503)
    expect(body.code).toBe('not_connected')
    // `reason` double `code` pour les journaux ; les faire diverger rouvrirait le trou.
    expect(body.reason).toBe('not_connected')
    expect(body.capability).toBe('mail')
    // Aucun fournisseur n'est branché : en nommer un serait faux.
    expect(body.scopes).toEqual([])
  })

  it.each([
    ['fetchBody', (s: MailboxService) => s.fetchBody('u1', 'm1')],
    ['listAttachments', (s: MailboxService) => s.listAttachments('u1', 'm1')],
    ['getAttachment', (s: MailboxService) => s.getAttachment('u1', 'm1', 'a1')],
    ['createDraft', (s: MailboxService) => s.createDraft('u1', DRAFT)],
    ['deleteDraft', (s: MailboxService) => s.deleteDraft('u1', 'd1')],
    ['setOutOfOffice', (s: MailboxService) => s.setOutOfOffice('u1', { enabled: false } as never)],
  ])('%s aussi — les six portes disent la même chose', async (_name, call) => {
    const service = await build([backend({ status: jest.fn().mockResolvedValue(null) })])
    const { body } = await failureOf(() => call(service))
    expect(body.code).toBe('not_connected')
  })

  // #2568.1 — l'import CV depuis la messagerie ne devine jamais l'identifiant :
  // il vient de `listAttachments`, `getAttachment` ne fait que le relayer.
  it('getAttachment relaie l’identifiant exact au backend connecté, sans le modifier', async () => {
    const target = backend()
    const service = await build([target])
    const result = await service.getAttachment('u1', 'm1', 'a1')
    expect(target.getAttachment).toHaveBeenCalledWith('u1', 'm1', 'a1')
    expect(result).toEqual({ filename: 'cv.pdf', mimeType: 'application/pdf', dataB64: 'AA==', messageDate: null })
  })

  it('la portée de lecture manquante NOMME la portée à accorder', async () => {
    const target = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, capabilities: { ...CONNECTED.capabilities, read: false } }),
    })
    const service = await build([target])
    const { status, body } = await failureOf(() => service.search('u1', { intent: 'unread' } as never))

    expect(status).toBe(503)
    // Une portée ne repassera JAMAIS toute seule : « réessaie » serait un mensonge.
    expect(body.code).toBe('scope_missing')
    expect(body.provider).toBe('google')
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/gmail.readonly'])
    // Le message ne nomme pas l'éditeur (doctrine du 02/08).
    expect(body.message).not.toMatch(/gmail|google|outlook|microsoft/i)
  })

  it('le brouillon interdit nomme la portée de rédaction', async () => {
    const target = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, capabilities: { ...CONNECTED.capabilities, draft: false } }),
    })
    const service = await build([target])
    const { body } = await failureOf(() => service.createDraft('u1', DRAFT))

    expect(body.code).toBe('scope_missing')
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/gmail.compose'])
  })

  // #2277.34, épopée #2771 — même garde de portée que le dépôt : la suppression
  // d'un brouillon reste une écriture de messagerie.
  it('la suppression d’un brouillon interdit nomme aussi la portée de rédaction', async () => {
    const target = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, capabilities: { ...CONNECTED.capabilities, draft: false } }),
    })
    const service = await build([target])
    const { body } = await failureOf(() => service.deleteDraft('u1', 'd1'))

    expect(body.code).toBe('scope_missing')
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/gmail.compose'])
  })

  it('l’envoi de lot interdit nomme la portée d’envoi', async () => {
    const target = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, capabilities: { ...CONNECTED.capabilities, send: false } }),
    })
    const service = await build([target])
    const { body } = await failureOf(() =>
      service.sendBatch('u1', {
        batchId: '3f2a6c1e-8b4d-4c2a-9f11-0b7d5e6a1c33',
        mode: 'send',
        items: [{ to: 'jean@acme.com', subject: 'Suite', body: 'Bonjour' }],
      } as never),
    )

    expect(body.code).toBe('scope_missing')
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/gmail.send'])
  })

  // L'autre fournisseur écrit ses portées autrement : le code est le même, la
  // portée nommée ne l'est pas — c'est tout l'intérêt de la nommer.
  it('nomme les portées de l’autre fournisseur avec SES mots', async () => {
    const target = backend({ status: jest.fn().mockResolvedValue(MICROSOFT) })
    const service = await build([target])
    const { body } = await failureOf(() => service.setOutOfOffice('u1', { enabled: false } as never))

    expect(body.code).toBe('scope_missing')
    expect(body.provider).toBe('microsoft')
    expect(body.scopes).toEqual(['MailboxSettings.ReadWrite'])
  })

  // Une date incohérente n'est PAS un échec de connecteur : c'est une saisie
  // invalide, et elle doit rester un 400. Tout traduire en `scope_missing`
  // enverrait reconnecter un outil qui va très bien.
  it('ne transforme pas une saisie invalide en panne de connecteur', async () => {
    const service = await build([backend()])
    await expect(
      service.setOutOfOffice('u1', {
        enabled: true,
        startsAt: '2026-09-10T00:00:00.000Z',
        endsAt: '2026-09-01T00:00:00.000Z',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

/**
 * La garde de DIVERGENCE.
 *
 * `MAILBOX_SCOPES` recopie des chaînes de portée, pour la raison exacte que
 * `tool-registry/tool-capabilities.ts` a déjà tranchée : GA-07 compte les
 * imports service → service. Ce qui est recopié doit être gardé — sinon on
 * enverrait quelqu'un accorder une portée que le code ne vérifie pas.
 *
 * Un fichier de test est hors périmètre de GA-07 : c'est donc ici, et nulle
 * part ailleurs, que la comparaison se fait.
 */
/**
 * #3973 — « Outils et sources » : décocher UN outil de messagerie pour ce fil.
 * Avec deux messageries branchées, « la première connectée » lisait encore la
 * boîte décochée. L'exclusion par outil descend désormais jusqu'au choix du
 * backend : celui qui est décoché n'est jamais lu, l'autre l'est.
 */
describe('MailboxService — un outil décoché n’est jamais lu (#3973)', () => {
  const twoMailboxes = () => {
    const google = backend({ status: jest.fn().mockResolvedValue({ ...CONNECTED, provider: 'google' }) })
    const microsoft = backend({ status: jest.fn().mockResolvedValue({ ...CONNECTED, provider: 'microsoft' }) })
    return { google, microsoft }
  }

  it('la première boîte décochée : c’est l’autre, branchée et non décochée, qui est lue', async () => {
    const { google, microsoft } = twoMailboxes()
    const service = await build([google, microsoft])
    const result = await service.search('u1', { intent: 'unread' } as never, { excludedProviders: ['google'] })
    expect(google.search).not.toHaveBeenCalled()
    expect(microsoft.search).toHaveBeenCalledTimes(1)
    expect(result.provider).toBe('microsoft')
  })

  it('la seconde boîte décochée : la première reste lue, comme avant', async () => {
    const { google, microsoft } = twoMailboxes()
    const service = await build([google, microsoft])
    await service.search('u1', { intent: 'unread' } as never, { excludedProviders: ['microsoft'] })
    expect(google.search).toHaveBeenCalledTimes(1)
    expect(microsoft.search).not.toHaveBeenCalled()
  })

  it('#4289.10 — lire un FIL avec Gmail décoché lit le fil dans Outlook, jamais dans Gmail', async () => {
    const message = {
      id: 'm1',
      threadId: 't1',
      subject: 'Point projet',
      from: 'a@client.fr',
      date: '2026-10-18T10:00:00Z',
      direction: 'inbound',
    }
    const google = backend({ status: jest.fn().mockResolvedValue({ ...CONNECTED, provider: 'google' }) })
    const microsoft = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, provider: 'microsoft' }),
      search: jest.fn().mockResolvedValue({ messages: [message], resolvedQuery: 'q', truncated: false }),
      fetchBody: jest.fn().mockResolvedValue({ plain: 'Bonjour', html: null }),
    })
    const service = await build([google, microsoft])
    const thread = await service.readOwnThread('u1', { threadId: 't1' }, { excludedProviders: ['google'] })
    expect(google.search).not.toHaveBeenCalled()
    expect(microsoft.search).toHaveBeenCalledTimes(1)
    expect(thread?.subject).toBe('Point projet')
  })

  it('toutes décochées : aucune boîte n’est lue, « aucune messagerie », jamais un repli', async () => {
    const { google, microsoft } = twoMailboxes()
    const service = await build([google, microsoft])
    await expect(
      service.search('u1', { intent: 'unread' } as never, { excludedProviders: ['google', 'microsoft'] }),
    ).rejects.toBeInstanceOf(HttpException)
    expect(google.search).not.toHaveBeenCalled()
    expect(microsoft.search).not.toHaveBeenCalled()
  })

  it('sans exclusion : la première connectée gagne, inchangé', async () => {
    const { google, microsoft } = twoMailboxes()
    const service = await build([google, microsoft])
    await service.search('u1', { intent: 'unread' } as never)
    expect(google.search).toHaveBeenCalledTimes(1)
    expect(microsoft.search).not.toHaveBeenCalled()
  })

  it('traduit les identifiants d’outils du registre en messageries, et ignore le reste', () => {
    expect(mailboxProvidersExcludedBy(['gmail', 'hubspot'])).toEqual(['google'])
    expect(mailboxProvidersExcludedBy(['microsoft'])).toEqual(['microsoft'])
    expect(mailboxProvidersExcludedBy(['google-calendar'])).toEqual([])
    expect(mailboxProvidersExcludedBy(undefined)).toEqual([])
  })

  it('chaque identifiant d’outil traduit existe au registre, dans la famille « email »', () => {
    for (const provider of mailboxProviderSchema.options) {
      const entry = TOOL_CATALOG.find(tool => tool.provider === MAILBOX_TOOL_PROVIDERS[provider])
      expect(entry?.family).toBe('email')
    }
  })
})

describe('les portées annoncées par la messagerie sont celles que les backends vérifient', () => {
  it('Google — chaque portée annoncée est déclarée au registre des capacités', () => {
    const declared = new Set(capabilitiesOf('gmail').flatMap(capability => capability.scopes))
    expect(declared.size).toBeGreaterThan(0)
    // `outOfOffice` n'a pas d'équivalent au registre (aucun `CapabilityKey` ne le
    // porte) : il n'est donc pas comparé, et c'est dit plutôt que sous-entendu.
    const compared = [MAILBOX_SCOPES.google.read, MAILBOX_SCOPES.google.draft, MAILBOX_SCOPES.google.send].flat()
    expect(compared.length).toBeGreaterThan(0)
    expect(compared.filter(scope => !declared.has(scope))).toEqual([])
  })

  it('Microsoft — les portées annoncées sont les constantes que le backend teste', () => {
    expect(MAILBOX_SCOPES.microsoft.read).toEqual([MAIL_READWRITE_SCOPE])
    expect(MAILBOX_SCOPES.microsoft.draft).toEqual([MAIL_READWRITE_SCOPE])
    expect(MAILBOX_SCOPES.microsoft.send).toEqual([MAIL_SEND_SCOPE])
    expect(MAILBOX_SCOPES.microsoft.outOfOffice).toEqual([MAILBOX_SETTINGS_SCOPE])
  })

  it('la table couvre les deux fournisseurs du contrat, sans trou', () => {
    expect(mailboxProviderSchema.options.length).toBeGreaterThan(0)
    for (const provider of mailboxProviderSchema.options) {
      for (const capability of ['read', 'draft', 'send', 'outOfOffice'] as const) {
        expect(MAILBOX_SCOPES[provider][capability].length).toBeGreaterThan(0)
      }
    }
  })
})

describe('MailboxService — envoi individuel depuis la boîte connectée (#3699.4)', () => {
  const NO_SEND = { ...CONNECTED, capabilities: { ...CONNECTED.capabilities, send: false } }

  it('dit ce que la boîte sait faire ici et maintenant : connectée, adresse, droit d’envoi', async () => {
    const service = await build([backend()])
    expect(await service.individualSendStatus('u1')).toEqual({
      connected: true,
      provider: 'google',
      address: 'moi@bellum.fr',
      can_send: true,
    })
  })

  it('une boîte connectée SANS droit d’envoi n’est pas « absente » : elle le dit', async () => {
    const service = await build([backend({ status: jest.fn().mockResolvedValue(NO_SEND) })])
    expect(await service.individualSendStatus('u1')).toMatchObject({ connected: true, can_send: false })
  })

  it('sans messagerie, rien n’est connecté et rien ne peut partir', async () => {
    const service = await build([backend({ status: jest.fn().mockResolvedValue(null) })])
    expect(await service.individualSendStatus('u1')).toMatchObject({ connected: false, can_send: false })
  })

  it('envoie par LE backend connecté — le chemin du lot, pas un second moteur', async () => {
    const send = jest.fn().mockResolvedValue(undefined)
    const service = await build([backend({ send })])
    await service.sendIndividual('u1', { to: 'a@b.fr', subject: 'S', body: 'B' })
    expect(send).toHaveBeenCalledWith('u1', { to: 'a@b.fr', subject: 'S', body: 'B' })
  })

  it('refuse net quand le droit d’envoi manque : aucun envoi, aucune bascule ailleurs', async () => {
    const send = jest.fn()
    const service = await build([backend({ status: jest.fn().mockResolvedValue(NO_SEND), send })])
    await expect(service.sendIndividual('u1', { to: 'a@b.fr', subject: 'S', body: 'B' })).rejects.toBeInstanceOf(
      HttpException,
    )
    expect(send).not.toHaveBeenCalled()
  })
})

describe('MailboxService — relecture des réponses des séquences vivantes (#3718.6)', () => {
  type Internals = { contacts: { find: jest.Mock } }

  it('relit, par adresse EXACTE, chaque contact à séquence vivante — la recherche réconcilie au passage', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ contact_id: 'c1' }, { contact_id: 'c2' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    ;(service as unknown as Internals).contacts.find = jest.fn().mockResolvedValue([
      { id: 'c1', email: 'a@acme.fr' },
      { id: 'c2', email: 'b@acme.fr' },
    ])
    const search = jest.spyOn(service, 'search').mockResolvedValue({} as never)

    await expect(service.reconcileLiveSequenceReplies('u1')).resolves.toBe(2)

    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining("status IN ('active', 'paused')"), ['u1', 25])
    expect(search).toHaveBeenCalledWith('u1', expect.objectContaining({ counterpart: 'a@acme.fr', windowDays: 14 }))
    expect(search).toHaveBeenCalledWith('u1', expect.objectContaining({ counterpart: 'b@acme.fr' }))
  })

  it('un contact sans adresse n’est pas relu (jamais un rapprochement par nom)', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ contact_id: 'c1' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    ;(service as unknown as Internals).contacts.find = jest.fn().mockResolvedValue([{ id: 'c1', email: null }])
    const search = jest.spyOn(service, 'search').mockResolvedValue({} as never)
    await expect(service.reconcileLiveSequenceReplies('u1')).resolves.toBe(0)
    expect(search).not.toHaveBeenCalled()
  })

  it('messagerie absente : on s’arrête là, sans arrêter ni relancer quoi que ce soit', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ contact_id: 'c1' }, { contact_id: 'c2' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    ;(service as unknown as Internals).contacts.find = jest.fn().mockResolvedValue([
      { id: 'c1', email: 'a@acme.fr' },
      { id: 'c2', email: 'b@acme.fr' },
    ])
    const search = jest.spyOn(service, 'search').mockRejectedValue(new Error('not connected'))
    await expect(service.reconcileLiveSequenceReplies('u1')).resolves.toBe(0)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('aucun utilisateur n’est listé sans séquence vivante', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ user_id: 'u1' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    await expect(service.usersWithLiveSequences()).resolves.toEqual(['u1'])
    expect(contactsQuery).toHaveBeenCalledWith(expect.stringContaining('outreach_sequences'), [200])
  })
})

describe('MailboxService — balayage « Envoyé » des contacts à action ouverte (#4016.13e)', () => {
  type Internals = { contacts: { find: jest.Mock } }

  it('relit, par adresse EXACTE, chaque contact à action de prise de contact ouverte — la recherche réconcilie la preuve', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ contact_id: 'c1' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    ;(service as unknown as Internals).contacts.find = jest.fn().mockResolvedValue([{ id: 'c1', email: 'a@acme.fr' }])
    const search = jest.spyOn(service, 'search').mockResolvedValue({} as never)

    await expect(service.reconcileOpenActionSentProofs('u1')).resolves.toBe(1)

    const [sql, params] = contactsQuery.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("target_kind = 'contact'")
    expect(sql).toContain("execution_status IN ('todo', 'prepared')")
    expect(params).toEqual(['u1', 25])
    expect(search).toHaveBeenCalledWith('u1', expect.objectContaining({ counterpart: 'a@acme.fr', windowDays: 14 }))
  })

  it('contact sans adresse : jamais relu ; messagerie absente : on s’arrête', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ contact_id: 'c1' }, { contact_id: 'c2' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    ;(service as unknown as Internals).contacts.find = jest.fn().mockResolvedValue([
      { id: 'c1', email: null },
      { id: 'c2', email: 'b@acme.fr' },
    ])
    const search = jest.spyOn(service, 'search').mockRejectedValue(new Error('not connected'))
    await expect(service.reconcileOpenActionSentProofs('u1')).resolves.toBe(0)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('liste les seuls utilisateurs qui ont une action de prise de contact ouverte', async () => {
    const contactsQuery = jest.fn().mockResolvedValue([{ user_id: 'u1' }])
    const service = await build([backend()], null, false, [], null, [], undefined, contactsQuery)
    await expect(service.usersWithOpenContactActions()).resolves.toEqual(['u1'])
    expect(contactsQuery.mock.calls[0]?.[0]).toContain('action_plan_items')
  })
})
