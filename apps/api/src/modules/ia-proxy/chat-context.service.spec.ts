import { success } from '@bellum/utils'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { CrmReadService } from '../crm/crm-read.service'
import type { CrmPresence } from '../crm/crm-presence'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { MemoryService } from '../memory/memory.service'
import { ChatContextService } from './chat-context.service'

describe('ChatContextService (long memory, Théo P2)', () => {
  function build(overrides?: {
    memory?: Partial<jest.Mocked<MemoryService>>
    crmConnection?: Partial<CrmConnectionEntity> | null
    crmThrows?: boolean
    presence?: CrmPresence | Error
    /** Directives de correction (feedback loop A2) résolues pour le compte actif. */
    feedbackDirectives?: string
    /** Digest d'outils connectés (Tool Registry v2) — string, null, ou Error. */
    toolsSummary?: string | null | Error
    /** #3272.6 — REX de perte du compte actif, déjà condensés. */
    lostDealRexContext?: string | null | Error
    /** #3295 — les règles APPRISES de l'espace, déjà condensées. */
    learnedRulesContext?: string | null
    /** #3390.10/.11 — la méthode commerciale retenue, déjà rendue. */
    commercialMethodContext?: string | null | Error
    /** #4071.1 — les faits du compte (socle #4069), déjà rendus. */
    accountFactsContext?: string | null | Error
    /** #4071.3 — ce que l'espace a gardé (recherches, listes, conversations passées), déjà rendu. */
    workspaceRecallContext?: string | null | Error
    /** #2259.10 — la lecture brute de `profiles` derrière `resolveFirstName`
     *  (et `resolveTimezone`, qui partage le même `manager.query`). Par défaut
     *  vide : aucune ligne, `firstName` reste `null`, comme avant ce mock. */
    profileQuery?: jest.Mock
  }) {
    const accounts = {
      findOne: jest.fn().mockResolvedValue(success({ id: 'a-1', company_name: 'SNCF', raw_analysis: null })),
      listAccountsDigest: jest.fn().mockResolvedValue({
        rows: [
          { id: 'a-bnp', company_name: 'BNP Paribas', sector: 'Banque', priority_score: 5 },
          { id: 'a-doc', company_name: 'Doctolib', sector: 'Programmation informatique', priority_score: 4 },
        ],
        total: 2,
      }),
      // #1581.1 — les faits privés des comptes listés. Par défaut, la lecture ne
      // rend RIEN : c'est l'état d'une base sans tâche, sans échange et sans
      // signal, et le digest doit alors se lire comme avant.
      listCopilotAccountFacts: jest.fn().mockResolvedValue(new Map()),
      // #2259.32 — le nombre de comptes rattachés à une BU. Par défaut `0` :
      // un test qui ne fournit aucune BU ne calcule jamais ce compte.
      countByBusinessUnit: jest.fn().mockResolvedValue(0),
      // #3892.1 — les noms des comptes visés par des faits épinglés bornés à
      // un compte. Par défaut vide : aucun test qui ne le fournit pas ne
      // calcule jamais ce compte (et un fait sans `accountId` ne l'appelle
      // jamais, voir `loadMemory`).
      namesForAccounts: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<
      Pick<
        AccountsService,
        'findOne' | 'listAccountsDigest' | 'listCopilotAccountFacts' | 'countByBusinessUnit' | 'namesForAccounts'
      >
    >
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<ContactsService, 'findByAccount'>>
    const esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue({ companyName: 'MonESN' }),
    } as unknown as jest.Mocked<Pick<EsnProfileReader, 'resolveProfileData'>>
    const memory = {
      listFacts: jest.fn().mockResolvedValue([
        {
          id: 'f-1',
          fact: 'Budget IT voté',
          accountId: null,
          kind: 'fact',
          origin: 'manual',
          expiresAt: null,
          createdAt: 'now',
        },
      ]),
      getPreferences: jest.fn().mockResolvedValue({ tone: 'direct' }),
      getConversationSummary: jest.fn().mockResolvedValue('• Utilisateur : bonjour'),
      appendConversationTurn: jest.fn().mockResolvedValue(undefined),
      ...overrides?.memory,
    } as unknown as jest.Mocked<MemoryService>
    const crmConnections = {
      findOne: jest.fn().mockImplementation(async () => {
        if (overrides?.crmThrows) throw new Error('crm table missing')
        return overrides?.crmConnection ?? null
      }),
      manager: { query: overrides?.profileQuery ?? jest.fn().mockResolvedValue([]) },
    } as unknown as jest.Mocked<Pick<Repository<CrmConnectionEntity>, 'findOne' | 'manager'>>
    const crmRead = {
      findAccountPresence: jest.fn().mockImplementation(async () => {
        const p = overrides?.presence
        if (p instanceof Error) throw p
        return (
          p ?? { provider: null, matched: false, contactsCount: 0, contacts: [], openDeals: [], lastActivityAt: null }
        )
      }),
    } as unknown as jest.Mocked<Pick<CrmReadService, 'findAccountPresence'>>
    const accountFeedback =
      overrides?.feedbackDirectives !== undefined
        ? { directivesFor: jest.fn().mockResolvedValue(overrides.feedbackDirectives) }
        : undefined
    const toolRegistry =
      overrides?.toolsSummary !== undefined
        ? {
            chatToolsSummary:
              overrides.toolsSummary instanceof Error
                ? jest.fn().mockRejectedValue(overrides.toolsSummary)
                : jest.fn().mockResolvedValue(overrides.toolsSummary),
          }
        : undefined
    const lostDealRexReader =
      overrides?.lostDealRexContext !== undefined
        ? overrides.lostDealRexContext instanceof Error
          ? jest.fn().mockRejectedValue(overrides.lostDealRexContext)
          : jest.fn().mockResolvedValue(overrides.lostDealRexContext)
        : undefined
    const learnedRulesReader =
      overrides?.learnedRulesContext !== undefined
        ? jest.fn().mockResolvedValue(overrides.learnedRulesContext)
        : undefined
    const commercialMethodReader =
      overrides?.commercialMethodContext !== undefined
        ? overrides.commercialMethodContext instanceof Error
          ? jest.fn().mockRejectedValue(overrides.commercialMethodContext)
          : jest.fn().mockResolvedValue(overrides.commercialMethodContext)
        : undefined
    const accountFactsReader =
      overrides?.accountFactsContext !== undefined
        ? overrides.accountFactsContext instanceof Error
          ? jest.fn().mockRejectedValue(overrides.accountFactsContext)
          : jest.fn().mockResolvedValue(overrides.accountFactsContext)
        : undefined
    const recallReader =
      overrides?.workspaceRecallContext !== undefined
        ? overrides.workspaceRecallContext instanceof Error
          ? jest.fn().mockRejectedValue(overrides.workspaceRecallContext)
          : jest.fn().mockResolvedValue(overrides.workspaceRecallContext)
        : undefined
    const service = new ChatContextService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      esnProfile as unknown as EsnProfileReader,
      memory as unknown as MemoryService,
      crmConnections as unknown as Repository<CrmConnectionEntity>,
      crmRead as unknown as CrmReadService,
      accountFeedback as never,
      toolRegistry as never,
      lostDealRexReader as never,
      learnedRulesReader as never,
      commercialMethodReader as never,
      accountFactsReader as never,
      recallReader as never,
    )
    return {
      accounts,
      contacts,
      esnProfile,
      memory,
      crmConnections,
      crmRead,
      accountFeedback,
      toolRegistry,
      lostDealRexReader,
      learnedRulesReader,
      commercialMethodReader,
      accountFactsReader,
      recallReader,
      service,
    }
  }

  it('folds pinned facts, preferences and the conversation summary into the context', async () => {
    const { memory, service } = build()
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      conversationId: 'general',
    })
    // #1918.1 — l'APPELANT borne ce qui part au prompt : sans lui, l'élément
    // « moi uniquement » d'un collègue entrerait dans ce contexte.
    expect(memory.listFacts).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-1',
      accountId: 'a-1',
      // #1918.2 — aucun périmètre porté ici : aucune mémoire d'équipe.
      businessUnitIds: [],
      // #1918.5 — le FIL du tour, pour que sa mémoire « temporaire » entre dans
      // ce prompt-ci et dans aucun autre.
      thread: { accountId: 'a-1', conversationId: 'general' },
    })
    expect(memory.getPreferences).toHaveBeenCalledWith('u-1')
    // `userId` borne le résumé à SA personne : sans lui, le fil « general » est
    // le même pour tous les sièges de l'espace (D65).
    expect(memory.getConversationSummary).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      conversationId: 'general',
    })
    expect(ctx.pinnedFacts).toEqual([{ fact: 'Budget IT voté', kind: 'fact', origin: 'manual' }])
    expect(ctx.userPreferences).toEqual({ tone: 'direct' })
    expect(ctx.conversationSummary).toBe('• Utilisateur : bonjour')
  })

  it('#1962.8 — carries kind AND origin, not just the fact text (a Laura note stays distinguishable)', async () => {
    // Le défaut vérifié le 12/09/2026 : `facts.map(f => f.fact)` réduisait
    // chaque élément à son texte, et une conclusion de Laura jamais confirmée
    // (`origin: 'copilot'`) devenait indiscernable d'une correction humaine
    // une fois dans le contexte du copilote.
    const { service } = build({
      memory: {
        listFacts: jest.fn().mockResolvedValue([
          {
            id: 'f-2',
            fact: 'ALTEN ne serait plus chez eux',
            accountId: null,
            kind: 'fact',
            origin: 'copilot',
            expiresAt: null,
            createdAt: 'now',
          },
        ]),
      },
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.pinnedFacts).toEqual([{ fact: 'ALTEN ne serait plus chez eux', kind: 'fact', origin: 'copilot' }])
  })

  it('includes memory even without an active account', async () => {
    const { service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.accountData).toBeNull()
    expect(ctx.pinnedFacts).toEqual([{ fact: 'Budget IT voté', kind: 'fact', origin: 'manual' }])
    expect(ctx.conversationSummary).toBe('• Utilisateur : bonjour')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // #3892.1 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — LA PORTÉE D'UN
  // FAIT ÉPINGLÉ VOYAGE AVEC SON TEXTE
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Constat : `listFacts` rend un élément borné à UN compte (#1918.1) même
  // hors de ce compte — sans compte actif, ou sur un AUTRE compte — et rien
  // ne disait plus qu'il venait d'ailleurs : une centrale d'achat ou un délai
  // déclarés pour BPCE se réutilisaient comme une règle générale de l'ESN sur
  // Sanofi.

  it("labels a fact scoped to an account with that account's NAME, resolved in one batched call", async () => {
    const { service, accounts } = build({
      memory: {
        listFacts: jest.fn().mockResolvedValue([
          {
            id: 'f-3',
            fact: "Délai d'accès déclaré : six semaines",
            accountId: 'a-bpce',
            kind: 'fact',
            origin: 'manual',
            expiresAt: null,
            createdAt: 'now',
          },
        ]),
      },
    })
    accounts.namesForAccounts = jest.fn().mockResolvedValue(new Map([['a-bpce', 'BPCE']]))
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(accounts.namesForAccounts).toHaveBeenCalledWith('ws-1', ['a-bpce'])
    expect(ctx.pinnedFacts).toEqual([
      { fact: "Délai d'accès déclaré : six semaines", kind: 'fact', origin: 'manual', accountName: 'BPCE' },
    ])
  })

  it('a fact whose account cannot be named travels UNLABELED — never a guessed name', async () => {
    const { service, accounts } = build({
      memory: {
        listFacts: jest.fn().mockResolvedValue([
          {
            id: 'f-4',
            fact: 'Une note sur un compte supprimé',
            accountId: 'a-gone',
            kind: 'fact',
            origin: 'manual',
            expiresAt: null,
            createdAt: 'now',
          },
        ]),
      },
    })
    accounts.namesForAccounts = jest.fn().mockResolvedValue(new Map())
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.pinnedFacts).toEqual([{ fact: 'Une note sur un compte supprimé', kind: 'fact', origin: 'manual' }])
  })

  it('a fact with no account at all never triggers the name lookup — a general rule, unchanged', async () => {
    const { service, accounts } = build()
    await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(accounts.namesForAccounts).not.toHaveBeenCalled()
  })

  it('injects the workspace PORTFOLIO digest when no account is active (Théo §13)', async () => {
    const { accounts, service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(accounts.listAccountsDigest).toHaveBeenCalledWith('ws-1')
    expect(ctx.accountsSummary).toContain('BNP Paribas — Banque — 5/10')
    expect(ctx.accountsSummary).toContain('Doctolib — Programmation informatique — 4/10')
  })

  it('DIT que la liste est partielle quand le portefeuille dépasse la borne', async () => {
    // Le défaut vécu : 19 comptes, borne à 15, et le copilote a répondu
    // « Dassault Aviation n'apparaît pas dans les comptes analysés » en donnant
    // sa liste pour le portefeuille entier. Le compte était pourtant à l'écran.
    // Un modèle ne devine pas ce qu'on ne lui donne pas — il tient compte d'un
    // « la liste est partielle ».
    const { accounts, service } = build()
    accounts.listAccountsDigest.mockResolvedValue({
      rows: [{ id: 'a-bnp', company_name: 'BNP Paribas', sector: 'Banque', priority_score: 5 }],
      total: 19,
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.accountsSummary).toContain('liste PARTIELLE : 1 comptes listés sur 19')
    expect(ctx.accountsSummary).toContain('ne conclus jamais')
    expect(ctx.accountsSummary).toContain('absent de cette liste')
  })

  it('ne dit rien de tel quand la liste est complète', async () => {
    const { service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.accountsSummary).not.toContain('liste partielle')
  })

  it("#3772.5 — exclusion STRICTE : le portefeuille n'est pas lu, même sans dossier ni compte nommé", async () => {
    const { accounts, service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', excludeWorkspaceData: true })
    expect(accounts.listAccountsDigest).not.toHaveBeenCalled()
    expect(ctx.accountsSummary).toBeNull()
    expect(ctx.readablePortfolio).toBeNull()
    expect(ctx.accountData).toBeNull()
  })

  it('#3772.5 — exclusion STRICTE : un accountId reçu ne rouvre pas le dossier', async () => {
    const { accounts, service } = build()
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      excludeWorkspaceData: true,
    })
    expect(accounts.findOne).not.toHaveBeenCalled()
    expect(ctx.accountData).toBeNull()
    expect(ctx.accountsSummary).toBeNull()
  })

  it('omits the portfolio digest when a single account IS active (avoid noise)', async () => {
    const { accounts, service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.accountsSummary).toBeNull()
    expect(accounts.listAccountsDigest).not.toHaveBeenCalled()
  })

  // #2164.52 — LA QUESTION INITIALE traverse déjà la frontière NestJS → IA :
  // `accountData` porte la ligne `accounts` ENTIÈRE (`chat-context.service.ts:748`),
  // `user_context` compris. Ce test EXISTE pour garder la promesse au niveau
  // NestJS elle-même : `build_system_prompt` (apps/ia, prouvé côté Python par
  // `test_chat_carries_initial_search_question.py`) ne peut lire une clé que
  // ce service a déjà laissée passer.
  it('#2164.52 — porte `user_context` (la question tapée au lancement) dans `accountData`', async () => {
    const { accounts, service } = build()
    accounts.findOne.mockResolvedValueOnce(
      success({
        id: 'a-1',
        company_name: 'SNCF',
        raw_analysis: null,
        user_context: "On cherche un contact DSI, ils ont un appel d'offres en cours.",
      } as unknown as AccountEntity),
    )
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.accountData).not.toBeNull()
    expect((ctx.accountData as Record<string, unknown>).user_context).toBe(
      "On cherche un contact DSI, ils ont un appel d'offres en cours.",
    )
  })

  // BEL-SC-226 (#3255) — le pipeline « Laura raisonne selon la méthode » a
  // besoin de savoir OÙ en est le compte sur les 5P (`AccountStrategy5P`,
  // maison canonique BEL-SC-225) pour décider s'il y a une objection
  // méthodologique à faire — jamais un second objet, une PROJECTION compacte
  // (`readiness` + `next_action_dimension`, jamais les cinq P en entier :
  // « pas de document complet exposé », spec TRANSPARENCE) posée sur
  // `accountData.strategy5p`, dérivée de `raw_analysis` + des contacts déjà
  // chargés pour ce tour — jamais un second appel réseau.
  it('#3255 — porte `strategy5p` (readiness + next_action_dimension) dans `accountData`, dérivé sans appel de plus', async () => {
    const { accounts, service } = build()
    accounts.findOne.mockResolvedValueOnce(
      success({ id: 'a-1', company_name: 'SNCF', raw_analysis: null } as unknown as AccountEntity),
    )
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect((ctx.accountData as Record<string, unknown>).strategy5p).toEqual({
      readiness: 'NO_GO',
      next_action_dimension: 'perimeter',
    })
  })

  it('#3255 — `strategy5p` reflète les 5P réellement connues (un pain + un champion suffisent à sortir du NO_GO)', async () => {
    const { accounts, contacts, service } = build()
    accounts.findOne.mockResolvedValueOnce(
      success({
        id: 'a-1',
        company_name: 'SNCF',
        raw_analysis: { pains: [{ pain: 'Migration bloquée', business_impact: null, esn_offer: null, urgency: null }] },
      } as unknown as AccountEntity),
    )
    contacts.findByAccount.mockResolvedValueOnce([
      { id: 'c1', full_name: 'Alice Champion', account_id: 'a-1', decision_role: 'champion' },
    ] as never)
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect((ctx.accountData as Record<string, unknown>).strategy5p).toEqual({
      readiness: 'INCOMPLETE',
      next_action_dimension: 'perimeter',
    })
  })

  // #3285 — la moitié « ouverture de compte fermé » du signal TRANSPARENCE : l'état
  // de relation du compte (même lecture que la fiche) voyage vers /chat.
  it('#3285 — porte `relationship_state` dans `accountData` quand le dossier le connaît', async () => {
    const { accounts, service } = build()
    accounts.findOne.mockResolvedValueOnce(
      success({
        id: 'a-1',
        company_name: 'SNCF',
        raw_analysis: { salesContext: { relationship: { state: 'dormant' } } },
      } as unknown as AccountEntity),
    )
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect((ctx.accountData as Record<string, unknown>).relationship_state).toBe('dormant')
  })

  it('#3285 — sans état de relation connu, la clé est absente (jamais « null » deviné)', async () => {
    const { accounts, service } = build()
    accounts.findOne.mockResolvedValueOnce(
      success({ id: 'a-1', company_name: 'SNCF', raw_analysis: null } as unknown as AccountEntity),
    )
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.accountData as Record<string, unknown>).not.toHaveProperty('relationship_state')
  })

  it('resolves an account NAMED in the shared-thread message and loads its full analysis', async () => {
    const { accounts, service } = build()
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      message: "regarde l'analyse que tu as faite pour BNP Paribas et liste 6 clients",
    })
    // The name matched a portfolio account → its full context is loaded via findOne,
    // and the portfolio digest is dropped (focused view).
    expect(accounts.findOne).toHaveBeenCalledWith('a-bnp', 'u-1')
    expect(ctx.accountData).not.toBeNull()
    expect(ctx.accountsSummary).toBeNull()
  })

  it('falls back to the portfolio when the message names no known account', async () => {
    const { accounts, service } = build()
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      message: 'quels comptes prioriser cette semaine ?',
    })
    expect(accounts.findOne).not.toHaveBeenCalled()
    expect(ctx.accountData).toBeNull()
    expect(ctx.accountsSummary).toContain('BNP Paribas')
  })

  it('degrades to empty memory when the store errors (never breaks chat)', async () => {
    const { service } = build({ memory: { listFacts: jest.fn().mockRejectedValue(new Error('db down')) } })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.pinnedFacts).toEqual([])
    expect(ctx.userPreferences).toEqual({})
    expect(ctx.conversationSummary).toBeNull()
  })

  it('reports CRM as NOT connected when the workspace has no crm_connection (transparency)', async () => {
    const { crmConnections, service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(crmConnections.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1' } })
    expect(ctx.crmConnected).toBe(false)
    expect(ctx.crmProvider).toBeNull()
  })

  it('reports the connected CRM provider when a crm_connection exists', async () => {
    const { service } = build({ crmConnection: { provider: 'hubspot' } })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmConnected).toBe(true)
    expect(ctx.crmProvider).toBe('hubspot')
  })

  it('degrades CRM state to NOT connected when the read errors (never claims a phantom link)', async () => {
    const { service } = build({ crmThrows: true })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.crmConnected).toBe(false)
    expect(ctx.crmProvider).toBeNull()
  })

  it('recordConversationTurn swallows store errors (best-effort)', async () => {
    const { service } = build({
      memory: { appendConversationTurn: jest.fn().mockRejectedValue(new Error('db down')) },
    })
    await expect(
      service.recordConversationTurn({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'general',
        userMessage: 'hi',
        assistantReply: 'yo',
      }),
    ).resolves.toBeUndefined()
  })

  // ---- #1927.10 — l'état du fil, rechargé à la réouverture ------------------

  const savedThreadState = {
    version: 1 as const,
    objects: [{ kind: 'account' as const, id: 'a-1', label: 'SNCF' }],
    focus: [{ kind: 'account' as const, id: 'a-1', label: 'SNCF' }],
    last_list: null,
    searches: [],
    proposals: [],
    questions: [],
  }

  it('reloads the thread state of THIS person on THIS thread into the context (#1927.10)', async () => {
    const { memory, service } = build({
      memory: { getConversationThreadState: jest.fn().mockResolvedValue(savedThreadState) },
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1', conversationId: 'general' })
    expect(memory.getConversationThreadState).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      conversationId: 'general',
    })
    expect(ctx.threadState).toEqual(savedThreadState)
  })

  it('carries the thread state on the portfolio branch too (no active account)', async () => {
    const { service } = build({
      memory: { getConversationThreadState: jest.fn().mockResolvedValue(savedThreadState) },
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', conversationId: 'general' })
    expect(ctx.accountData).toBeNull()
    expect(ctx.threadState).toEqual(savedThreadState)
  })

  it('a failed thread-state read yields null WITHOUT wiping the rest of the memory', async () => {
    const { service } = build({
      memory: { getConversationThreadState: jest.fn().mockRejectedValue(new Error('db down')) },
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.threadState).toBeNull()
    expect(ctx.conversationSummary).toBe('• Utilisateur : bonjour')
    expect(ctx.pinnedFacts).toHaveLength(1)
  })

  it('forgetConversation delegates to the memory with the thread target (#1927.10)', async () => {
    const { memory, service } = build({ memory: { forgetConversation: jest.fn().mockResolvedValue(2) } })
    await expect(
      service.forgetConversation({ workspaceId: 'ws-1', accountId: null, conversationId: 'general' }),
    ).resolves.toBe(2)
    expect(memory.forgetConversation).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'general',
    })
  })

  // ---- CRM presence read-back (roadmap §8/§9) ------------------------------

  it('injects « X contacts déjà dans votre CRM » when a CRM is connected and an account is active', async () => {
    const { crmRead, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 3,
        contacts: [
          { id: '1', name: 'Alice Martin', email: 'alice@sncf.fr', jobTitle: 'DSI' },
          { id: '2', name: 'Bob Durand', email: null, jobTitle: null },
        ],
        openDeals: [{ id: 'd1', name: 'Refonte SI', stage: 'negotiation', amount: 50000 }],
        lastActivityAt: '2026-06-12T09:00:00.000Z',
      },
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    // The read is keyed on the ACTIVE account's identity, never a guess.
    expect(crmRead.findAccountPresence).toHaveBeenCalledWith('u-1', {
      account: 'SNCF',
      domain: undefined,
      siren: undefined,
    })
    expect(ctx.crmPresence).toContain('3 contact(s) déjà dans votre CRM chez ce groupe')
    expect(ctx.crmPresence).toContain('Alice Martin (DSI)')
    expect(ctx.crmPresence).toContain('1 deal(s) ouvert(s) : Refonte SI (negotiation, 50000 €)')
    expect(ctx.crmPresence).toContain('Dernière activité CRM : 2026-06-12')
  })

  it('says « consulté, aucun contact » when the CRM answered but nothing matched (transparency)', async () => {
    const { service } = build({
      crmConnection: { provider: 'salesforce' },
      presence: {
        provider: 'salesforce',
        matched: false,
        contactsCount: 0,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmPresence).toBe('Votre CRM consulté : aucun contact ni deal ouvert trouvé pour « SNCF ».')
  })

  it('never queries the CRM when no connection exists (no-op, crmPresence null)', async () => {
    const { crmRead, service } = build() // no crmConnection
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    expect(ctx.crmPresence).toBeNull()
  })

  it('never queries the CRM without an active account (portfolio thread)', async () => {
    const { crmRead, service } = build({ crmConnection: { provider: 'hubspot' } })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    expect(ctx.crmPresence).toBeNull()
  })

  it('degrades crmPresence to null when the read errors (never breaks chat, never invents)', async () => {
    const { service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: new Error('hubspot 500'),
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmPresence).toBeNull()
    expect(ctx.accountData).not.toBeNull() // the rest of the context survives
  })

  it('reports null crmPresence when the provider answered null (CRM not actually consulted)', async () => {
    const { service } = build({ crmConnection: { provider: 'hubspot' } }) // presence defaults to provider: null
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmPresence).toBeNull()
  })

  it('#1915.11 — flags crmUnavailable when the read errors, distinct from "nothing found"', async () => {
    const { service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: new Error('hubspot 500'),
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmUnavailable).toBe(true)
  })

  it('#1915.11 — never flags crmUnavailable when the provider simply answered "nothing found"', async () => {
    const { service } = build({ crmConnection: { provider: 'hubspot' } }) // presence defaults to provider: null
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmUnavailable).toBe(false)
  })

  it('#1915.11 — never flags crmUnavailable without a CRM connection (nothing was attempted)', async () => {
    const { crmRead, service } = build() // no crmConnection
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    expect(ctx.crmUnavailable).toBe(false)
  })

  // ---- Mémoire de corrections du compte (feedback loop A2) ------------------

  it('injecte les directives de correction du compte actif dans le contexte chat', async () => {
    const directives = "- [play] « Play cyber » jugé INUTILE / hors sujet par l'utilisateur (2026-07-10)"
    const { accountFeedback, service } = build({ feedbackDirectives: directives })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(accountFeedback?.directivesFor).toHaveBeenCalledWith({
      accountId: 'a-1',
      workspaceId: null, // le fixture account n'a pas de workspace_id
      companyName: 'SNCF',
    })
    expect(ctx.accountFeedback).toBe(directives)
  })

  it('accountFeedback null sans compte actif (thread portefeuille)', async () => {
    const { accountFeedback, service } = build({ feedbackDirectives: 'x' })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(accountFeedback?.directivesFor).not.toHaveBeenCalled()
    expect(ctx.accountFeedback).toBeNull()
  })

  it("accountFeedback null quand le compte n'a aucun retour (directives vides)", async () => {
    const { service } = build({ feedbackDirectives: '' })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.accountFeedback).toBeNull()
  })

  it("accountFeedback null quand le service mémoire n'est pas branché (constructeur nu)", async () => {
    const { service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.accountFeedback).toBeNull()
  })

  // ---- REX de perte du compte (#3272.6, Laura cite le REX) ------------------

  it('injecte le REX de perte condensé du compte actif dans le contexte chat', async () => {
    const context = 'Perte du 2026-05-12 — route utilisée : « approche directe » ; sponsor : non identifié.'
    const { lostDealRexReader, service } = build({ lostDealRexContext: context })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(lostDealRexReader).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
    expect(ctx.lostDealRexContext).toBe(context)
  })

  // ---- Ce que l'espace a gardé (#4071.3) ----

  it('#4071.3 — recherches, listes et conversations passées entrent dans le contexte, même sans dossier ouvert', async () => {
    const text = '- [2026-10-12 · il y a 1 jour] Recherche enregistrée : ESN cyber IDF'
    const { recallReader, service } = build({ workspaceRecallContext: text })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', conversationId: 'general' })
    expect(recallReader).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u-1', excludeConversationId: 'general' })
    expect(ctx.workspaceRecallContext).toBe(text)
  })

  it('#4071.3 — sans lecteur, ou lecture en échec : null, et le tour répond quand même', async () => {
    const without = await build().service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(without.workspaceRecallContext ?? null).toBeNull()
    const failed = await build({ workspaceRecallContext: new Error('boom') }).service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
    })
    expect(failed.workspaceRecallContext).toBeNull()
  })

  it('#4071.3 — « sans les données de l’espace » ne lit RIEN de l’espace (#3853)', async () => {
    const { recallReader, service } = build({ workspaceRecallContext: 'x' })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', excludeWorkspaceData: true })
    expect(recallReader).not.toHaveBeenCalled()
    expect(ctx.workspaceRecallContext ?? null).toBeNull()
  })

  // ---- Faits du compte (#4071.1, socle #4069) ----

  it('#4071.1 — les faits du compte actif entrent dans le contexte, lus pour CE lecteur (#4071.4)', async () => {
    const text = '- [2025-08-12 · il y a 14 mois] Besoin : Migration paie cloud'
    const { accountFactsReader, service } = build({ accountFactsContext: text })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(accountFactsReader).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountId: 'a-1', userId: 'u-1' })
    expect(ctx.accountFactsContext).toBe(text)
  })

  it('#4071.1 — sans lecteur, sans fait, ou lecture en échec : null, et le tour répond quand même', async () => {
    const without = await build().service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(without.accountFactsContext ?? null).toBeNull()
    const failed = await build({ accountFactsContext: new Error('boom') }).service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
    })
    expect(failed.accountFactsContext).toBeNull()
    expect(failed.accountData).toMatchObject({ id: 'a-1' })
  })

  it('#4071.1 — sans dossier ouvert, aucun fait de compte n’est lu', async () => {
    const { accountFactsReader, service } = build({ accountFactsContext: 'x' })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(accountFactsReader).not.toHaveBeenCalled()
    expect(ctx.accountFactsContext ?? null).toBeNull()
  })

  // ---- Méthode commerciale retenue (#3390.10/.11, Laura recommande la même que l'écran) ----

  it('#3390.10 — la méthode retenue du compte actif entre dans le contexte, lue pour CE lecteur', async () => {
    const text = "MÉTHODE COMMERCIALE RETENUE POUR SON BESOIN OUVERT :\n- Niveau d'effort : Focus"
    const { commercialMethodReader, service } = build({ commercialMethodContext: text })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(commercialMethodReader).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountId: 'a-1', userId: 'u-1' })
    expect(ctx.commercialMethodContext).toBe(text)
  })

  it('#3390.10 — sans lecteur câblé ou sans besoin ouvert : rien (null), jamais une méthode devinée', async () => {
    const without = await build().service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(without.commercialMethodContext ?? null).toBeNull()
    const noNeed = await build({ commercialMethodContext: null }).service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
    })
    expect(noNeed.commercialMethodContext).toBeNull()
  })

  it('#3390.10 — une lecture qui échoue ne casse pas le tour', async () => {
    const { service } = build({ commercialMethodContext: new Error('boom') })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.commercialMethodContext).toBeNull()
    expect(ctx.accountData).toMatchObject({ id: 'a-1' })
  })

  // #3546.1 — recette prod Y3 : /chat?accountId=… répondait « Erreur de connexion
  // au service IA » alors que /chat?fresh=1 répondait. Le REX de perte est le
  // seul enrichissement lu PAR COMPTE sans filet : une table pas encore migrée
  // ou une ligne illisible faisait un 500 avant l'ouverture du flux.
  it('un REX de perte illisible ne casse pas le tour : le dossier reste ouvert, sans REX (#3546.1)', async () => {
    const { service } = build({ lostDealRexContext: new Error('relation "lost_deal_rex" does not exist') })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.lostDealRexContext).toBeNull()
    expect(ctx.accountData).toMatchObject({ id: 'a-1' })
  })

  // ---- Règles apprises de l'espace (#3295, l'apprentissage modifie Laura) ----

  it('injecte les règles apprises de l’espace, avec un compte actif', async () => {
    const rules = '- [Compte] Sans sponsor avant la démonstration, la perte suit.'
    const { learnedRulesReader, service } = build({ learnedRulesContext: rules })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(learnedRulesReader).toHaveBeenCalledWith('ws-1')
    expect(ctx.workspaceLearnedRulesContext).toBe(rules)
  })

  it('les règles apprises sont de niveau ESPACE : présentes aussi sans dossier ouvert', async () => {
    const rules = '- [Compte] Sans sponsor avant la démonstration, la perte suit.'
    const { service } = build({ learnedRulesContext: rules })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.workspaceLearnedRulesContext).toBe(rules)
  })

  it('sans lecteur câblé, aucune règle apprise — le contexte d’avant, byte pour byte', async () => {
    const { service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.workspaceLearnedRulesContext).toBeNull()
  })

  it('lostDealRexContext null sans compte actif (thread portefeuille)', async () => {
    const { lostDealRexReader, service } = build({ lostDealRexContext: 'x' })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(lostDealRexReader).not.toHaveBeenCalled()
    expect(ctx.lostDealRexContext).toBeNull()
  })

  it("lostDealRexContext null quand le compte n'a aucun REX de perte connu", async () => {
    const { service } = build({ lostDealRexContext: null })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.lostDealRexContext).toBeNull()
  })

  it("lostDealRexContext null quand le lecteur n'est pas branché (constructeur nu)", async () => {
    const { service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.lostDealRexContext).toBeNull()
  })

  // ---- Registre d'outils connectés (Tool Registry v2) ------------------------

  it('injecte le digest des outils connectés + coûts dans le contexte chat', async () => {
    const digest = '- Dropcontact (connecté) : enrich_contact — coût : 1 crédit par enrichissement réussi'
    const { toolRegistry, service } = build({ toolsSummary: digest })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(toolRegistry?.chatToolsSummary).toHaveBeenCalledWith('u-1')
    expect(ctx.toolsSummary).toBe(digest)
  })

  it('injecte le digest outils AUSSI sans compte actif (le registre est workspace/user-level)', async () => {
    const digest = '- Slack (connecté) : send_notification — coût : gratuit (notification webhook)'
    const { service } = build({ toolsSummary: digest })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.toolsSummary).toBe(digest)
  })

  it('toolsSummary null quand le registre ne renvoie rien (aucun outil connecté)', async () => {
    const { service } = build({ toolsSummary: null })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.toolsSummary).toBeNull()
  })

  it('toolsSummary dégrade en null sur erreur du registre (jamais un chat cassé)', async () => {
    const { service } = build({ toolsSummary: new Error('registry down') })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.toolsSummary).toBeNull()
    expect(ctx.accountData).not.toBeNull() // le reste du contexte survit
  })

  it("toolsSummary null quand le registre n'est pas branché (constructeur nu)", async () => {
    const { service } = build()
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.toolsSummary).toBeNull()
  })

  // ---- #1995 — l'identifiant du contact voyage avec son nom ------------------
  //
  // Laura annonçait « je peux te poser un rappel sur Sarah Martin », puis l'outil
  // échouait : `prepare_message_for_contact`, `schedule_reminder_for_contact`,
  // `enrich_contact` et `export_contact_to_crm` exigent tous un `contact_id`
  // (UUID), et le résumé envoyé au modèle ne portait QUE des noms. Aucun des 54
  // outils ne résout un nom vers un identifiant (`grep -n
  // "search_contact\|find_contact\|resolve\|lookup\|by_name"` → 0, rc=1).
  // Le dépôt avait déjà tranché la question pour l'objet voisin : `accountData`
  // porte l'`id` complet de la ligne. On fait pareil ici plutôt que d'ajouter un
  // second mécanisme pour la même question.
  //
  // Doctrine `c58_criteres_proteges` : un `id` est de l'IDENTITÉ (le livrable
  // DÉSIGNE la personne), donc autorisé — et RIEN d'autre n'entre au passage.

  function contactRow(over: Record<string, unknown> = {}) {
    return {
      id: 'c-uuid-1',
      full_name: 'Sarah Martin',
      title: 'DSI',
      decision_role: 'economic',
      email: 'sarah.martin@example.com',
      phone: null,
      entity: null,
      linkedin_url: null,
      raw_data: null,
      ...over,
    } as never
  }

  it('#1995 — chaque contact porte son `contact_id` sur la MÊME ligne que son nom', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow()])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    // Le nom ET l'identifiant sur une seule ligne : c'est ce qui permet au
    // modèle de relier « Sarah Martin » à l'argument que l'outil exige.
    expect(ctx.contactsSummary).toBe('Sarah Martin - DSI - economic - contact_id: c-uuid-1')
  })

  // #3243 (#186.9, « contacter une personne partie ») — la personne NOMMÉE
  // dans le message ET marquée `historique` (partie du compte) est signalée sur
  // sa ligne, pour que Laura challenge AVANT de préparer le message.
  it('#3243 — une personne nommée et PARTIE du compte porte « parti de l’entreprise » avant son contact_id', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ lifecycle_state: 'historique' })])
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      message: 'écris à Sarah Martin',
    })
    expect(ctx.contactsSummary).toBe(
      'Sarah Martin - DSI - economic - nommé dans le message - parti de l’entreprise - contact_id: c-uuid-1',
    )
  })

  // #3243 (#186.10, « interlocuteur beaucoup trop haut ») — seule la personne
  // NOMMÉE dans le message porte le marqueur lu par `detect_too_senior_contact`.
  it('#3243 — une personne nommée porte « nommé dans le message » avant son contact_id', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ title: 'CEO' })])
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      message: 'écris à Sarah Martin',
    })
    expect(ctx.contactsSummary).toBe('Sarah Martin - CEO - economic - nommé dans le message - contact_id: c-uuid-1')
  })

  it('#3243 — sans nom prononcé, aucun marqueur « nommé »', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ title: 'CEO' })])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1', message: 'bonjour' })
    expect(ctx.contactsSummary).not.toContain('nommé')
  })

  it('#3243 — une personne partie NON nommée n’est jamais marquée (pas de faux positif)', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ lifecycle_state: 'historique' })])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1', message: 'bonjour' })
    expect(ctx.contactsSummary).not.toContain('parti')
  })

  // #3231 (#219.8, recette prod 05/10) — la relation déclarée doit atteindre
  // Laura MÊME quand aucun outil n'est appelé ce tour : jusqu'ici
  // `introduction_capability`/`collision_risk` n'existaient que dans les
  // retours de `search_workspace_contacts`/`get_account_contacts`
  // (`with_relation_proof`, apps/ia). `contacts_summary` est, lui, dans le
  // contexte de BASE de chaque tour — le marqueur voyage AVANT `contact_id`,
  // comme les deux marqueurs #3243 ci-dessus.
  it('#3231 — une relation déclarée porte son marqueur avant son contact_id', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ declared_person_company_relation: 'employee_former' })])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.contactsSummary).toBe(
      'Sarah Martin - DSI - economic - relation déclarée: employee_former - contact_id: c-uuid-1',
    )
  })

  it('#3231 — sans relation déclarée, aucun marqueur (prompt inchangé)', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ declared_person_company_relation: null })])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.contactsSummary).toBe('Sarah Martin - DSI - economic - contact_id: c-uuid-1')
  })

  it('#1995 — une identité incomplète porte AUSSI son identifiant', async () => {
    const { contacts, service } = build()
    // Demi-identité : les écrans badgent « Nom à révéler ». C'est précisément le
    // cas où le modèle ne PEUT pas désigner la personne par son nom — et le
    // geste doit rester possible.
    contacts.findByAccount.mockResolvedValue([
      contactRow({ id: 'c-uuid-2', full_name: 'Maximilian', email: null, last_name_obfuscated: 'D***' }),
    ])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.contactsSummary).toContain('contact_id: c-uuid-2')
    expect(ctx.contactsSummary).toContain('nom de famille non révélé')
  })

  it("#1995 — pas d'identifiant lisible → pas de `contact_id` inventé, la ligne reste", async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([contactRow({ id: undefined })])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.contactsSummary).toBe('Sarah Martin - DSI - economic')
  })

  it('#1995 — une ligne par contact : le panneau de transparence les COMPTE', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([
      contactRow(),
      contactRow({ id: 'c-uuid-3', full_name: 'Paul Durand', title: 'CTO' }),
    ])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    // `context_transparency._count_lines` annonce « N contacts » en comptant les
    // lignes non vides : un identifiant sur sa PROPRE ligne doublerait le compte.
    expect((ctx.contactsSummary ?? '').split('\n')).toHaveLength(2)
  })

  it("#1995 — aucun critère protégé n'entre dans le résumé au passage", async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([
      contactRow({ photo_url: 'https://example.test/p.jpg', gender: 'F', age: 42, address: '12 rue Vaugirard, Paris' }),
    ])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    for (const forbidden of ['photo', 'p.jpg', 'gender', 'age', '42', 'Vaugirard']) {
      expect(ctx.contactsSummary ?? '').not.toContain(forbidden)
    }
  })

  // ── #1995 (RÉOUVERTE) — le contact nommé HORS de la fenêtre classée ─────────
  //
  // Le correctif précédent a mis l'identifiant sur la ligne des dix premiers
  // contacts. Le geste rejoué en production le 14/09/2026 échoue quand même,
  // parce qu'il nomme quelqu'un qui n'est PAS dans ces dix : THALES porte
  // 2 027 contacts qualifiés (mesuré, `contacts.service.ts:924`), la fenêtre en
  // montre dix, et « Sandrine Pata » n'y est pas. Laura ne peut pas donner un
  // identifiant qu'elle n'a jamais reçu.
  /** 600 contacts classés ; la personne cherchée au rang 500. */
  function bigAccount(): unknown[] {
    const rows: unknown[] = Array.from({ length: 600 }, (_, i) =>
      contactRow({ id: `c-rank-${i}`, full_name: `Autre Personne${i}`, email: `a${i}@example.com` }),
    )
    rows[499] = contactRow({ id: 'c-sandrine', full_name: 'Sandrine Pata', title: 'Directrice des achats' })
    return rows
  }

  it('#1995 — le chemin COMPLET : un nom prononcé en portée portefeuille rend un `contact_id`', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue(bigAccount() as never)
    // Le geste de production, mot pour mot : aucun `accountId` actif (portée
    // « tout le portefeuille »), le compte est nommé DANS le message, et la
    // personne aussi. C'est le seul chemin par lequel les quatre outils à
    // `contact_id` sont atteignables depuis une conversation de portefeuille.
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      message: 'Rappelle-moi de relancer Sandrine Pata chez BNP Paribas demain à 9 h 30',
    })
    const summary = ctx.contactsSummary ?? ''
    expect(summary).toContain('Sandrine Pata')
    expect(summary).toContain('contact_id: c-sandrine')
    // La personne NOMMÉE passe en TÊTE : `fit_to_budget` (apps/ia) rogne la
    // QUEUE (`t[:remaining]`). Placée onzième, sa ligne est la première sacrifiée
    // quand le plan et la base de connaissance sont pleins — donc l'identifiant
    // reviendrait manquant précisément sur les gros comptes.
    expect(summary.split('\n')[0]).toContain('contact_id: c-sandrine')
  })

  it('#1995 — la fenêtre classée reste BORNÉE : jamais de contexte non borné', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue(bigAccount() as never)
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      message: 'Rappelle-moi de relancer Sandrine Pata demain',
    })
    // Vingt-cinq classés (D15) + au plus cinq nommés. Mesure : une ligne fait
    // ~100 caractères (`nom - poste - rôle - contact_id: <uuid>`), donc 30
    // lignes ≈ 3 000 — sous le cap `_CONTACTS_SUMMARY_MAX = 4000` de
    // `bellum_advisor.py`.
    const summary = ctx.contactsSummary ?? ''
    const lines = summary.split('\n')
    expect(lines.length).toBeLessThanOrEqual(30)
    expect(lines.length).toBeGreaterThan(25)
    // #1995/D15 — mesure RÉELLE (pas l'estimation ~100 c/ligne ci-dessus) :
    // ce bloc de 26 lignes (25 classés + Sandrine nommée) fait 1503
    // caractères — loin sous le cap `_CONTACTS_SUMMARY_MAX = 4000` de
    // `apps/ia/app/prompts/bellum_advisor.py`, laissé INCHANGÉ par D15.
    expect(summary.length).toBeLessThan(4000)
  })

  it('D15 — le 25e contact classé entre dans le résumé, le 26e en sort', async () => {
    // La preuve directe de la borne : ni dix (l'ancienne fenêtre), ni vingt-six
    // — exactement vingt-cinq, le bord posé par `CONTACTS_RANKED_WINDOW`.
    const { contacts, service } = build()
    const rows = Array.from({ length: 26 }, (_, i) => contactRow({ id: `c-rank-${i}`, full_name: `Rang ${i}` }))
    contacts.findByAccount.mockResolvedValue(rows as never)
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const summary = ctx.contactsSummary ?? ''
    expect(summary).toContain('contact_id: c-rank-24') // 25e (index 24) — DANS la fenêtre
    expect(summary).not.toContain('contact_id: c-rank-25') // 26e (index 25) — HORS fenêtre, non nommé
  })

  it('#1995 — un nom qui désigne DEUX personnes ne désigne personne', async () => {
    const { contacts, service } = build()
    // Doctrine : deux homonymes ne se rapprochent jamais. Une option ambiguë
    // n'entre pas — Laura demandera laquelle, ce qui est la bonne réponse.
    contacts.findByAccount.mockResolvedValue([
      // D15 — 25 (pas 10) : pousse les homonymes ambigus HORS de la fenêtre
      // classée, pour que leur exclusion tienne au rapprochement par nom, pas
      // à une absence de rang.
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({ id: 'c-dup-a', full_name: 'Sandrine Pata', title: 'Achats' }),
      contactRow({ id: 'c-dup-b', full_name: 'SANDRINE PATA', title: 'RH' }),
    ] as never)
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      message: 'un rappel sur Sandrine Pata demain',
    })
    expect(ctx.contactsSummary ?? '').not.toContain('c-dup-a')
    expect(ctx.contactsSummary ?? '').not.toContain('c-dup-b')
  })

  it('#1995 — « Benard » retrouve « Bénard » : la casse ET les accents sont pliés', async () => {
    const { contacts, service } = build()
    contacts.findByAccount.mockResolvedValue([
      // D15 — 25 (pas 10) : Bénard reste HORS fenêtre classée, donc son
      // identifiant ne peut venir que du rapprochement par nom plié.
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({ id: 'c-benard', full_name: 'Chloé Bénard', title: 'DSI' }),
    ] as never)
    // `ILIKE` plie la casse, pas les diacritiques — et un modèle réécrit
    // « Bénard » en « Benard ». Les deux sont pliées ici.
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      message: 'relancer chloe benard lundi',
    })
    expect(ctx.contactsSummary ?? '').toContain('contact_id: c-benard')
  })

  it("#1995 — un nom court ne s'attrape pas au MILIEU d'un autre mot", async () => {
    const { contacts, service } = build()
    // Le témoin du cas légitime voisin : la garde ne doit pas attraper ce
    // qu'elle ne vise pas. « Li » ne se lit pas dans « Lille ».
    contacts.findByAccount.mockResolvedValue([
      // D15 — 25 (pas 10) : « Li » reste HORS fenêtre classée, donc son
      // absence du résumé tient au bord de mot, pas à un rang manquant.
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({ id: 'c-li', full_name: 'Li', title: 'CTO' }),
    ] as never)
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      message: "l'agence de Lille",
    })
    expect(ctx.contactsSummary ?? '').not.toContain('contact_id: c-li')
  })

  // ── #1995 (RÉOUVERTE, 3e fois) — le contact nommé par la présence CRM ──────
  //
  // Reproduit en prod le 14/09/2026 15h52 malgré les deux correctifs
  // ci-dessus : « Sandrine Pata » n'était nommée dans AUCUN message (Laura
  // l'a proposée d'elle-même, depuis la présence CRM), donc `contactsNamedIn`
  // ne pouvait rien trouver — il lit le MESSAGE, jamais ce que Laura vient de
  // dire. `formatCrmPresence` (`../crm/crm-presence.ts`) ne porte lui-même
  // jamais d'identifiant Bellum. Ces tests couvrent le rapprochement du
  // contact CRM vers sa fiche Bellum, indépendamment de tout message.

  it("#1995 — un contact nommé par la présence CRM porte l'id de sa fiche Bellum (résolution par e-mail)", async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-1', name: 'Sandrine Pata', email: 'sandrine.pata@thales.fr', jobTitle: 'Achats' }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue([
      // D15 — 25 (pas 10) : Sandrine reste HORS fenêtre classée.
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({
        id: 'c-sandrine',
        full_name: 'Sandrine Pata',
        title: 'Directrice des achats',
        email: 'sandrine.pata@thales.fr',
      }),
    ] as never)
    // Aucun `message` : Sandrine n'est nommée ni par la fenêtre classée (elle
    // est 26e) ni par `contactsNamedIn` (rien à lire) — SEULE la présence
    // CRM la désigne, exactement le geste reproduit en production.
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const summary = ctx.contactsSummary ?? ''
    expect(summary).toContain('contact_id: c-sandrine')
    expect(summary).toContain('déjà dans votre CRM')
  })

  it("#1995 — résolution par nom quand l'e-mail CRM est absent", async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-2', name: 'Till Rausch', email: null, jobTitle: 'CIO' }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue([
      // D15 — 25 (pas 10) : Till reste HORS fenêtre classée.
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({ id: 'c-till', full_name: 'Till Rausch', title: 'CIO', email: 'till.rausch@thales.fr' }),
    ] as never)
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.contactsSummary ?? '').toContain('contact_id: c-till')
  })

  it('#1995 — un contact CRM SANS fiche Bellum reste nommé sans identifiant, honnêtement', async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-3', name: 'Un Autre Contact', email: 'inconnu@thales.fr', jobTitle: null }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })) as never,
    )
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const summary = ctx.contactsSummary ?? ''
    expect(summary).toContain('Un Autre Contact')
    expect(summary).toContain('fiche Bellum absente')
    // Honnête : jamais un `contact_id` inventé pour une personne sans fiche.
    expect(summary).not.toMatch(/Un Autre Contact[^\n]*contact_id/)
  })

  it("#1995 — un contact CRM déjà dans les 25 classés (D15) n'est pas dupliqué", async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-4', name: 'Sarah Martin', email: 'sarah.martin@example.com', jobTitle: 'DSI' }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue([contactRow()] as never) // c-uuid-1, même e-mail
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const summary = ctx.contactsSummary ?? ''
    expect(summary.split('\n')).toHaveLength(1)
    expect(summary).toContain('contact_id: c-uuid-1')
  })

  it('#1995 — deux fiches Bellum partageant le même e-mail : aucune ne se résout', async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-5', name: 'Homonyme', email: 'partage@thales.fr', jobTitle: null }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue([
      // D15 — 25 (pas 10) : les deux homonymes restent HORS fenêtre classée,
      // sinon ils entreraient par le rang, indépendamment de l'ambiguïté testée.
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({ id: 'c-hom-a', full_name: 'Homonyme A', email: 'partage@thales.fr' }),
      contactRow({ id: 'c-hom-b', full_name: 'Homonyme B', email: 'partage@thales.fr' }),
    ] as never)
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const summary = ctx.contactsSummary ?? ''
    expect(summary).not.toContain('c-hom-a')
    expect(summary).not.toContain('c-hom-b')
    expect(summary).toContain('fiche Bellum absente')
  })

  /**
   * #1995 (décision Louis 14/09/2026 20:35) — LES CHAMPS BRUTS, À CÔTÉ DE LA
   * LIGNE TEXTE.
   *
   * La ligne « … fiche Bellum absente » dit QUI, pas COMMENT créer la fiche :
   * elle ne porte ni l'e-mail ni la référence de la ligne d'origine, et
   * `create_contact_from_crm_presence` en a besoin champ par champ. Les faits
   * voyagent donc dans le bloc de présence CRM — la ligne, elle, ne bouge pas
   * (le panneau de transparence compte ses lignes pour annoncer « N contacts »).
   */
  it('#1995 — les champs BRUTS d’une personne sans fiche partent avec la présence CRM', async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-9', name: 'Sandrine Pata', email: 'sandrine.pata@thales.fr', jobTitle: 'Achats' }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })) as never,
    )
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const presence = ctx.crmPresence ?? ''
    expect(presence).toContain('create_contact_from_crm_presence')
    expect(presence).toContain('nom: Sandrine Pata')
    expect(presence).toContain('poste: Achats')
    expect(presence).toContain('email: sandrine.pata@thales.fr')
    expect(presence).toContain('crm_reference: hs-9')
    expect(presence).toContain('account_id: a-1')
    // La ligne texte, elle, n'a pas bougé d'un octet.
    expect(ctx.contactsSummary ?? '').toContain('Sandrine Pata - Achats - déjà dans votre CRM, fiche Bellum absente')
  })

  // #4055 (lot W-C 13/10) — « complète ce compte » : un contact VRAIMENT nouveau est séparé d'un
  // DOUBLON PROBABLE d'une fiche Bellum (nom inversé, initiale, homonymes) — proposé, jamais fusionné.
  it('#4055 — un contact CRM proche d’une fiche Bellum est un doublon probable, pas une personne nouvelle', async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 3,
        contacts: [
          { id: 'hs-20', name: 'DUPONT Jean', email: 'j.dupont@perso.fr', jobTitle: 'DSI' },
          { id: 'hs-21', name: 'M. Leroy', email: null, jobTitle: 'Achats' },
          { id: 'hs-22', name: 'Claire Neuve', email: 'claire.neuve@thales.fr', jobTitle: 'CTO' },
        ],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue([
      ...Array.from({ length: 25 }, (_, i) => contactRow({ id: `c-top-${i}`, full_name: `Tete Liste${i}` })),
      contactRow({ id: 'c-jean', full_name: 'Jean Dupont', email: 'jean.dupont@thales.fr' }),
      contactRow({ id: 'c-marc', full_name: 'Marc Leroy', email: 'marc.leroy@thales.fr' }),
    ] as never)
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    const summary = ctx.contactsSummary ?? ''
    expect(summary).toContain(
      'DUPONT Jean - DSI - déjà dans votre CRM, fiche Bellum absente - doublon probable de « Jean Dupont », à vérifier, jamais fusionné',
    )
    expect(summary).toContain(
      'M. Leroy - Achats - déjà dans votre CRM, fiche Bellum absente - doublon probable de « Marc Leroy »',
    )
    // ⚠️ SAIT DIRE NON — une personne vraiment nouvelle ne porte aucune mention de doublon.
    expect(summary).toMatch(/Claire Neuve - CTO - déjà dans votre CRM, fiche Bellum absente$/m)
    const presence = ctx.crmPresence ?? ''
    expect(presence).toContain(
      'nom: DUPONT Jean | poste: DSI | email: j.dupont@perso.fr | crm_reference: hs-20 | account_id: a-1 | doublon_probable_de: Jean Dupont',
    )
    expect(presence).toMatch(/nom: Claire Neuve[^\n]*account_id: a-1$/m)
  })

  it('#1995 — SAIT DIRE NON : aucune personne sans fiche ⇒ digest inchangé, prompt inchangé', async () => {
    const { contacts, service } = build({
      crmConnection: { provider: 'hubspot' },
      presence: {
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'hs-10', name: 'Sarah Martin', email: 'sarah.martin@example.com', jobTitle: 'DSI' }],
        openDeals: [],
        lastActivityAt: null,
      },
    })
    contacts.findByAccount.mockResolvedValue([contactRow()] as never) // c-uuid-1, même e-mail → résolue
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1' })
    expect(ctx.crmPresence ?? '').not.toContain('create_contact_from_crm_presence')
  })

  // #2259.10 — `resolveFirstName` lisait `WHERE id = $1` : `profiles.id` est un
  // SUBSTITUT généré, distinct de `user_id` (voir le docblock au-dessus de la
  // méthode) — la ligne ne pouvait donc jamais être trouvée, et le prénom
  // injecté à Laura restait toujours vide. `resolveTimezone`, juste en dessous
  // dans le fichier, a le prédicat correct (`WHERE user_id = $1`) : c'est le
  // témoin qui prouve que ce n'était pas voulu.
  it('#2259.10 — le prénom se lit par user_id, pas par id (colonne substitut)', async () => {
    const profileQuery = jest.fn().mockResolvedValue([{ first_name: 'Louis' }])
    const { service } = build({ profileQuery })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    const firstNameCall = profileQuery.mock.calls.find(call => String(call[0]).includes('first_name'))
    expect(firstNameCall?.[0]).toMatch(/WHERE user_id = \$1/)
    expect(firstNameCall?.[1]).toEqual(['u-1'])
    expect(ctx.firstName).toBe('Louis')
  })

  // #2259.11 — le nom de famille, même discipline que le prénom (#2259.10) :
  // lu par `user_id`, jamais deviné.
  it('#2259.11 — résout le nom de famille depuis profiles.last_name', async () => {
    const profileQuery = jest.fn().mockResolvedValue([{ last_name: 'Bénard' }])
    const { service } = build({ profileQuery })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    const lastNameCall = profileQuery.mock.calls.find(call => String(call[0]).includes('last_name'))
    expect(lastNameCall?.[0]).toMatch(/WHERE user_id = \$1/)
    expect(ctx.lastName).toBe('Bénard')
  })

  it('#2259.11 — un profil sans nom de famille rend null, jamais une chaîne inventée', async () => {
    const profileQuery = jest.fn().mockResolvedValue([])
    const { service } = build({ profileQuery })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.lastName).toBeNull()
  })

  // #2259.4 / #2259.13 — le rôle d'espace est PORTÉ par le contrôleur, jamais
  // recalculé ici ; la propriété du compte n'est vraie QUE pour `owner`.
  it("#2259.4 / #2259.13 — porte le rôle d'espace et en dérive isAccountOwner", async () => {
    const { service } = build({})
    const owner = await service.build({ userId: 'u-1', workspaceId: 'ws-1', role: 'owner' })
    expect(owner.workspaceRole).toBe('owner')
    expect(owner.isAccountOwner).toBe(true)
    const admin = await service.build({ userId: 'u-1', workspaceId: 'ws-1', role: 'admin' })
    expect(admin.workspaceRole).toBe('admin')
    expect(admin.isAccountOwner).toBe(false)
  })

  it('#2259.4 — sans rôle fourni, ni fonction ni propriété ne sont affirmées', async () => {
    const { service } = build({})
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.workspaceRole).toBeNull()
    expect(ctx.isAccountOwner).toBe(false)
  })

  // #2259.6 — un collègue cité par son prénom dans le message est reconnu
  // depuis `workspace_members` × `profiles`, jamais confondu avec un contact
  // externe (référentiel distinct de `contactsNamedIn` pour les contacts).
  it('#2259.6 — reconnaît un collègue cité dans le message', async () => {
    const profileQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (String(sql).includes('workspace_members')) {
        return [{ id: 'u-2', full_name: 'Théo' }]
      }
      return []
    })
    const { service } = build({ profileQuery })
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      message: "Peux-tu résumer l'échange avec Théo ?",
    })
    expect(ctx.mentionedColleague).toBe('Théo')
    const colleagueCall = profileQuery.mock.calls.find(call => String(call[0]).includes('workspace_members'))
    expect(colleagueCall?.[1]).toEqual(['ws-1', 'u-1'])
  })

  it('#2259.6 — sans nom de collègue dans le message, rend null', async () => {
    const profileQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (String(sql).includes('workspace_members')) return [{ id: 'u-2', full_name: 'Théo' }]
      return []
    })
    const { service } = build({ profileQuery })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', message: 'Bonjour' })
    expect(ctx.mentionedColleague).toBeNull()
  })

  // #2428.12 — l'id CANONIQUE choisi au clic (menu « Mentionner un membre »)
  // résout le collègue SANS dépendre du texte : contrairement à #2259.6
  // ci-dessus, le message ne nomme personne, et la résolution passe quand même.
  it('#2428.12 — un `mentionedUserId` fourni résout le collègue par ID, sans lire le texte', async () => {
    const profileQuery = jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      if (String(sql).includes('workspace_members') && String(sql).includes('wm.user_id = $2')) {
        // La lecture par ID filtre en base : seul le bon id rend une ligne.
        return params[1] === 'u-2' ? [{ full_name: 'Théo' }] : []
      }
      return []
    })
    const { service } = build({ profileQuery })
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      message: 'Peux-tu résumer les échanges de cette semaine ?',
      mentionedUserId: 'u-2',
    })
    expect(ctx.mentionedColleague).toBe('Théo')
  })

  // #2428.12 — un id qui ne correspond à personne dans CET espace (collègue
  // retiré entre le clic et l'envoi, id d'un autre espace) ne casse rien :
  // l'heuristique texte reste le repli, jamais un `null` sur un message qui,
  // lui, nomme peut-être quelqu'un en toutes lettres.
  it('#2428.12 — un `mentionedUserId` introuvable retombe sur l’heuristique texte', async () => {
    const profileQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (String(sql).includes('workspace_members') && String(sql).includes('wm.user_id = $2')) {
        return [] // aucune ligne pour l'id fourni
      }
      if (String(sql).includes('workspace_members')) {
        return [{ id: 'u-2', full_name: 'Théo' }]
      }
      return []
    })
    const { service } = build({ profileQuery })
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      message: "Peux-tu résumer l'échange avec Théo ?",
      mentionedUserId: 'stranger-id',
    })
    expect(ctx.mentionedColleague).toBe('Théo')
  })

  // #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — DÉCISION Louis
  // 17/09 après-midi : la BU sert de CONTEXTE à Laura, elle ne filtre RIEN.
  describe('#2259.30-.35 — le contexte de BU', () => {
    it('propriétaire sans BU (businessUnitDetails vide) : rien n’est dit', async () => {
      const { service } = build({})
      const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', businessUnitDetails: [] })
      expect(ctx.businessUnits).toEqual([])
    })

    it('porte ce que l’espace sait de la BU, et le compte RÉEL de comptes rattachés', async () => {
      const { service, accounts } = build({})
      accounts.countByBusinessUnit.mockResolvedValue(12)
      const ctx = await service.build({
        userId: 'u-1',
        workspaceId: 'ws-1',
        businessUnitDetails: [{ id: 'bu-lyon', name: 'Agence Lyon', territory: 'AURA', specialties: ['Java'] }],
      })
      expect(accounts.countByBusinessUnit).toHaveBeenCalledWith('ws-1', 'bu-lyon')
      expect(ctx.businessUnits).toEqual([
        {
          name: 'Agence Lyon',
          territory: 'AURA',
          specialties: ['Java'],
          // #2259.35 — capacité / objectif du trimestre : colonnes du lot CP2,
          // absentes de cette base ⇒ `null`, jamais deviné, jamais 0.
          capacity: null,
          quarterObjective: null,
          accountCount: 12,
          // #2259.33 / #2259.34 — aucun rattachement BU n'existe dans le
          // schéma pour les consultants ni les références ⇒ `null`, jamais 0.
          consultantCount: null,
          referenceCount: null,
          // #3384.1 — effectif non déclaré ⇒ `null`, jamais 0.
          teamSize: null,
        },
      ])
    })

    // #3384.1 — la couche BU (équipe commerciale + vivier) : les valeurs que le
    // responsable de BU a DÉCLARÉES voyagent jusqu'au prompt de Laura ; non
    // déclarées, elles restent `null` (jamais 0).
    it('#3384.1 — porte effectif, consultants et consultants disponibles déclarés', async () => {
      const { service } = build({})
      const ctx = await service.build({
        userId: 'u-1',
        workspaceId: 'ws-1',
        businessUnitDetails: [
          {
            id: 'bu-lyon',
            name: 'Agence Lyon',
            territory: null,
            specialties: [],
            teamSize: 6,
            consultantCount: 40,
            capacityAvailableConsultants: 8,
            quarterObjective: 'Doubler le portefeuille banque',
          },
        ],
      })
      expect(ctx.businessUnits?.[0]).toMatchObject({
        teamSize: 6,
        consultantCount: 40,
        capacity: '8 consultants disponibles',
        quarterObjective: 'Doubler le portefeuille banque',
      })
    })

    it('#3384.1 — un consultant s’accorde, un 0 DÉCLARÉ est un fait, une valeur absente ne dit rien', async () => {
      const { service } = build({})
      const ctx = await service.build({
        userId: 'u-1',
        workspaceId: 'ws-1',
        businessUnitDetails: [
          { id: 'a', name: 'A', territory: null, specialties: [], capacityAvailableConsultants: 1 },
          { id: 'b', name: 'B', territory: null, specialties: [], capacityAvailableConsultants: 0, teamSize: 0 },
          { id: 'c', name: 'C', territory: null, specialties: [] },
        ],
      })
      expect(ctx.businessUnits?.map(bu => bu.capacity)).toEqual([
        '1 consultant disponible',
        '0 consultant disponible',
        null,
      ])
      expect(ctx.businessUnits?.map(bu => bu.teamSize)).toEqual([null, 0, null])
    })

    it('une BU sans aucun compte rattaché rend 0 (une mesure réelle), jamais null', async () => {
      const { service, accounts } = build({})
      accounts.countByBusinessUnit.mockResolvedValue(0)
      const ctx = await service.build({
        userId: 'u-1',
        workspaceId: 'ws-1',
        businessUnitDetails: [{ id: 'bu-vide', name: 'Nouvelle agence', territory: null, specialties: [] }],
      })
      expect(ctx.businessUnits?.[0]?.accountCount).toBe(0)
    })

    it('plusieurs BU portées : une entrée par BU', async () => {
      const { service } = build({})
      const ctx = await service.build({
        userId: 'u-1',
        workspaceId: 'ws-1',
        businessUnitDetails: [
          { id: 'bu-lyon', name: 'Agence Lyon', territory: null, specialties: [] },
          { id: 'bu-nantes', name: 'Agence Nantes', territory: null, specialties: [] },
        ],
      })
      expect(ctx.businessUnits?.map(bu => bu.name)).toEqual(['Agence Lyon', 'Agence Nantes'])
    })

    // #2259.30/.32 — LA BU EST UN CONTEXTE, JAMAIS UN FILTRE : même avec une BU
    // portée, le portefeuille envoyé à Laura (`listAccountsDigest`) reste lu
    // par ESPACE SEUL — un compte hors de cette BU reste dans la liste. Ce
    // test sait dire NON : un filtre BU ajouté à cet appel le ferait rougir
    // (l'appel porterait un second argument ou un `where` élargi).
    it('un compte HORS de la BU portée reste dans le portefeuille envoyé à Laura', async () => {
      const { accounts, service } = build({})
      accounts.listAccountsDigest.mockResolvedValue({
        rows: [
          // `sector` porte une entreprise d'un secteur qui n'a RIEN à voir
          // avec la BU « Agence Lyon » ci-dessous — la preuve n'est pas que
          // le nom coïncide, c'est que l'appel lui-même n'a reçu aucune borne
          // de BU.
          { id: 'a-hors-bu', company_name: 'Doctolib', sector: 'Santé', priority_score: 7 },
        ],
        total: 1,
      })
      const ctx = await service.build({
        userId: 'u-1',
        workspaceId: 'ws-1',
        businessUnitDetails: [{ id: 'bu-lyon', name: 'Agence Lyon', territory: 'AURA', specialties: [] }],
      })
      // Un seul argument : `workspaceId`. Un second argument (scope BU) ferait
      // échouer cette assertion — c'est la garantie « la BU ne filtre rien ».
      expect(accounts.listAccountsDigest).toHaveBeenCalledWith('ws-1')
      expect(ctx.accountsSummary).toContain('Doctolib')
    })
  })

  // #2266.10 (épopée #2920) — LA DERNIÈRE COLLECTE CONNUE DE L'ESPACE : aucun
  // signal de fraîcheur à l'échelle du workspace n'existait, seul
  // `collected_at` par SEGMENT par COMPTE. `resolveWorkspaceLastSyncAt` prend
  // le plus récent des six, tous comptes confondus — jamais une date
  // inventée pour un espace sans collecte connue.
  describe('resolveWorkspaceLastSyncAt (#2266.10)', () => {
    it('lit la date la plus récente rendue par la requête SQL (objet Date)', async () => {
      const query = jest.fn().mockResolvedValue([{ last_sync: new Date('2025-12-20T00:00:00.000Z') }])
      const { service } = build({ profileQuery: query })
      const result = await service.resolveWorkspaceLastSyncAt('ws-1')
      expect(result).toBe('2025-12-20T00:00:00.000Z')
      expect(query).toHaveBeenCalledWith(expect.stringContaining('GREATEST'), ['ws-1'])
      expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM accounts'), ['ws-1'])
    })

    it('passe une date déjà sous forme de chaîne sans la transformer', async () => {
      const query = jest.fn().mockResolvedValue([{ last_sync: '2025-12-20T00:00:00.000Z' }])
      const { service } = build({ profileQuery: query })
      expect(await service.resolveWorkspaceLastSyncAt('ws-1')).toBe('2025-12-20T00:00:00.000Z')
    })

    it('TÉMOIN — aucun compte de l’espace n’a de collecte connue ⇒ null, jamais une date inventée', async () => {
      const query = jest.fn().mockResolvedValue([{ last_sync: null }])
      const { service } = build({ profileQuery: query })
      expect(await service.resolveWorkspaceLastSyncAt('ws-1')).toBeNull()
    })

    it('une lecture ratée rend null, jamais un tour de chat cassé', async () => {
      const query = jest.fn().mockRejectedValue(new Error('accounts table missing'))
      const { service } = build({ profileQuery: query })
      expect(await service.resolveWorkspaceLastSyncAt('ws-1')).toBeNull()
    })
  })
})
