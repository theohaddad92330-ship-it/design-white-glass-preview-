import type { Repository } from 'typeorm'
import type { MarketPortfolioRead } from '@bellum/contracts'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { AccountsService, CopilotAccountFacts } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { MemoryService } from '../memory/memory.service'
import { ChatContextService } from './chat-context.service'
import type { NeedsHistoryContextReader } from './module-tokens'

/**
 * #1581.1 / #1573.1 — LES QUATRE COUCHES QUE LAURA REÇOIT.
 *
 * Les deux retours demandent la même chose depuis deux écrans : croiser les
 * données PRIVÉES de l'espace, les SIGNAUX actuels, la MÉMOIRE MARCHÉ, et dire
 * ce qu'on ne SAIT PAS. Ce qui partait était « Nom — Secteur — Score/10 ».
 *
 * ⚠️ CE QUI EST GARDÉ ICI N'EST PAS LA PRÉSENCE DES CHIFFRES, C'EST LEUR SENS.
 * Le lecteur de ce texte est un MODÈLE qui va le paraphraser : un « 38 sur 62 »
 * nu ressort en « 38 de tes comptes externalisent », qui est faux, et que le
 * commercial répétera en rendez-vous. C'est la surface la plus risquée du dépôt
 * pour la faute que GA-259 tient à l'écran (`c65_couverture_nest_pas_un_fait_de_marche`).
 *
 * Chaque test ci-dessous a été vu ROUGE en cassant la ligne qu'il protège.
 */

function serviceOf(over: {
  facts?: Map<string, CopilotAccountFacts> | Error
  rows?: { id: string; company_name: string; sector: string | null; priority_score: number | null }[]
  total?: number
  needs?: NeedsHistoryContextReader
}) {
  const rows = over.rows ?? [{ id: 'a-sncf', company_name: 'SNCF', sector: 'Transport', priority_score: 8 }]
  const accounts = {
    findOne: jest.fn(),
    listAccountsDigest: jest.fn().mockResolvedValue({ rows, total: over.total ?? rows.length }),
    listCopilotAccountFacts: jest.fn().mockImplementation(async () => {
      if (over.facts instanceof Error) throw over.facts
      return over.facts ?? new Map<string, CopilotAccountFacts>()
    }),
  } as unknown as jest.Mocked<Pick<AccountsService, 'findOne' | 'listAccountsDigest' | 'listCopilotAccountFacts'>>
  const contacts = { findByAccount: jest.fn() } as unknown as jest.Mocked<Pick<ContactsService, 'findByAccount'>>
  const esnProfile = {
    resolveProfileData: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<Pick<EsnProfileReader, 'resolveProfileData'>>
  const memory = {
    listFacts: jest.fn().mockResolvedValue([]),
    getPreferences: jest.fn().mockResolvedValue({}),
    getConversationSummary: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<MemoryService>
  const crmConnections = {
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<Pick<Repository<CrmConnectionEntity>, 'findOne'>>
  return {
    accounts,
    service: new ChatContextService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      esnProfile as unknown as EsnProfileReader,
      memory,
      crmConnections as unknown as Repository<CrmConnectionEntity>,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      over.needs,
    ),
  }
}

const OK_READ: MarketPortfolioRead = {
  status: 'ok',
  coverage: {
    accounts: 62,
    covered: 38,
    insufficientObservations: 9,
    ambiguous: 6,
    unresolved: 9,
    homonyms: 2,
  },
  review: [],
  structuralFit: { matching: 22, covered: 38, expertises: ['C++', 'Cloud'] },
  computedAt: '2026-09-08T20:00:00.000Z',
}

describe('le contexte du copilote — les faits privés du portefeuille (#1581.1)', () => {
  it('dit, pour chaque compte, s’il attend une action et depuis quand il est silencieux', async () => {
    const { service } = serviceOf({
      facts: new Map([
        ['a-sncf', { withoutNextAction: true, lastInteractionAt: '2026-05-12T09:00:00.000Z', hasRecentSignal: true }],
      ]),
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(ctx.accountsSummary).toContain('SNCF — Transport — 8/10')
    expect(ctx.accountsSummary).toContain('aucune prochaine action programmée')
    expect(ctx.accountsSummary).toContain('dernier échange enregistré le 2026-05-12')
    expect(ctx.accountsSummary).toContain('un signal est apparu ces 7 derniers jours')
  })

  it('#4759 — l’historique des besoins entre en AGRÉGAT daté, et l’absence ne fait aucune ligne', async () => {
    const needs: NeedsHistoryContextReader = jest
      .fn()
      .mockResolvedValue(
        new Map([
          ['a-sncf', '12 besoins d’emploi vus (historique) — dernier besoin vu le 2026-10-20 (il y a 8 jours)'],
        ]),
      )
    const { service } = serviceOf({
      facts: new Map([['a-sncf', { withoutNextAction: false, lastInteractionAt: null, hasRecentSignal: false }]]),
      needs,
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(needs).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountIds: ['a-sncf'] })
    expect(ctx.accountsSummary).toContain('12 besoins d’emploi vus (historique) — dernier besoin vu le 2026-10-20')
    // Plus de booléen : l'absence d'un signal récent n'est pas une affirmation qu'on porte.
    expect(ctx.accountsSummary).not.toContain('aucun signal apparu')
  })

  it('#4759 — la lecture de l’historique échoue : le digest reste rendu, sans ligne inventée', async () => {
    const needs: NeedsHistoryContextReader = jest.fn().mockRejectedValue(new Error('db down'))
    const { service } = serviceOf({
      facts: new Map([['a-sncf', { withoutNextAction: false, lastInteractionAt: null, hasRecentSignal: false }]]),
      needs,
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.accountsSummary).toContain('SNCF — Transport — 8/10')
    expect(ctx.accountsSummary).not.toContain('besoin')
  })

  it('écrit « aucun échange ENREGISTRÉ », jamais « aucun échange » — non mesuré n’est pas zéro', async () => {
    // « Aucun échange » est une affirmation sur le passé du client ; « aucun
    // échange enregistré » n'en est une que sur notre journal. Un modèle
    // reprendra le mot qu'on lui donne.
    const { service } = serviceOf({
      facts: new Map([['a-sncf', { withoutNextAction: false, lastInteractionAt: null, hasRecentSignal: false }]]),
    })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(ctx.accountsSummary).toContain('aucun échange enregistré')
    expect(ctx.accountsSummary).toContain('une prochaine action est programmée')
    expect(ctx.accountsSummary).not.toContain('signal apparu')
  })

  it('rend le digest MÊME si la lecture des faits privés échoue — un chat ne tombe pas pour ça', async () => {
    const { service } = serviceOf({ facts: new Error('tasks table missing') })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(ctx.accountsSummary).toContain('SNCF — Transport — 8/10')
    expect(ctx.accountsSummary).not.toContain('prochaine action')
  })
})

describe('le contexte du copilote — la mémoire marché du portefeuille (#1581.1)', () => {
  it('porte le SENS de la couverture, et jamais le vocabulaire de la sous-traitance', async () => {
    const { service } = serviceOf({})
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', marketPortfolio: OK_READ })
    const summary = ctx.accountsSummary ?? ''

    expect(summary).toContain('sur 62 comptes du portefeuille interrogés, 38 ont assez de parcours')
    expect(summary).toContain('hors de ce que Bellum SAIT')
    // Ni l'affirmation, ni sa NÉGATION : un libellé se lit hors contexte, la
    // négation se perd et le mot reste (la leçon de GA-259).
    expect(summary.toLowerCase()).not.toContain('externalis')
    expect(summary.toLowerCase()).not.toContain('sous-trait')
  })

  it('les quatre seaux s’ADDITIONNENT jusqu’au dénominateur, dans le texte même', async () => {
    const { service } = serviceOf({})
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', marketPortfolio: OK_READ })

    // 9 + 6 + 9 = 24, et 38 + 24 = 62. Un « autres » calculé par soustraction
    // aurait avalé les cas incertains sans que rien n'échoue.
    expect(ctx.accountsSummary).toContain('Les 24 autres')
    expect(ctx.accountsSummary).toContain('9 « observations insuffisantes »')
    expect(ctx.accountsSummary).toContain('6 « ambigus »')
    expect(ctx.accountsSummary).toContain('9 « non résolus »')
  })

  it('ne gradue JAMAIS l’affinité — « forte » mesurerait la taille de l’entreprise', async () => {
    const { service } = serviceOf({})
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', marketPortfolio: OK_READ })

    expect(ctx.accountsSummary).toContain('parmi les 38 comptes couverts, 22 ont un environnement technologique')
    expect(ctx.accountsSummary).toContain('critère : C++, Cloud')
    expect(ctx.accountsSummary?.toLowerCase()).not.toContain('forte affinité')
  })

  it('sans expertise déclarée, l’affinité est « non mesurable » — jamais 0 sur N', async () => {
    const { service } = serviceOf({})
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      marketPortfolio: { ...OK_READ, structuralFit: null },
    })

    expect(ctx.accountsSummary).toContain('non mesurable')
    expect(ctx.accountsSummary).toContain('Ce n’est pas « aucune affinité »')
  })

  it('interdit, dans le texte, de conclure un fait présent ou une urgence', async () => {
    const { service } = serviceOf({})
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', marketPortfolio: OK_READ })

    expect(ctx.accountsSummary).toContain('travaille actuellement avec')
    expect(ctx.accountsSummary).toContain('seul un signal récent justifie d’agir maintenant')
    expect(ctx.accountsSummary).toContain('Bellum a observé')
  })

  it('sur une PANNE de lecture : aucun chiffre, et elle se dit', async () => {
    // « 0 couvert sur 0 » se lirait « le marché ne connaît aucun de tes
    // comptes » — rassurant et faux.
    const { service } = serviceOf({})
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      marketPortfolio: { status: 'unavailable', reason: 'read_failed' },
    })

    expect(ctx.accountsSummary).toContain('Lecture indisponible pour ce tour')
    expect(ctx.accountsSummary).not.toContain('Couverture :')
  })

  it('sans lecture du tout, AUCUN bloc mémoire marché n’apparaît', async () => {
    const { service } = serviceOf({})
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })

    expect(ctx.accountsSummary).toContain('SNCF')
    expect(ctx.accountsSummary).not.toContain('Observations du marché —')
  })
})
