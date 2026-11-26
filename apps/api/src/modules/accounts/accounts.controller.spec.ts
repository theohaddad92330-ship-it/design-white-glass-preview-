import { type INestApplication, NotFoundException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { failure, success } from '@bellum/utils'
import { AccountsController } from './accounts.controller'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { AccountsService } from './accounts.service'
import { AnalysisRunsService } from '../analysis/analysis-runs.service'
import { AnalysisService } from '../analysis/analysis.service'
import { AccountShareService } from './account-share.service'
import { AccountTimelineService } from './account-timeline.service'
import { ContactsService } from '../contacts/contacts.service'
import { NeedPlayService } from './need-play.service'
import { JwtStrategy } from '../auth/jwt.strategy'
import { ImpersonationStrategy } from '../auth/impersonation.strategy'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountAccessController } from '../account-access/account-access.controller'
import { AccountEntitiesService } from '../account-entities/account-entities.service'
import { AccountAccessService } from '../account-access/account-access.service'
import type { ProductAnalyticsService } from '../analytics/product-analytics.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { AccountEntity } from '../../database/entities/account.entity'

/**
 * Cost transparency endpoint (Drive backlog #12, Matteo gap-analysis). Only the
 * three collaborators `GET :id/cost` touches are mocked; the controller is
 * instantiated directly (no Nest testing module) so the assertions stay on the
 * endpoint's own composition/scoping logic.
 */
function buildController(
  overrides: {
    account?: Partial<AccountEntity> | null
    costSummary?: { analysesCount: number; totalCostUsd: number | null; lastRunCostUsd: number | null }
    lastAnalyzedAt?: string | null
    // #2306.24 — vue agrégée des comptes au profil ESN périmé.
    esnProfileVersion?: number | null
    impactedAccounts?: { accountId: string; companyName: string; esnProfileVersion: number }[]
    // #2091.31 — comptes en attente d'action, pour le signal de portefeuille.
    accountsToAct?: {
      id: string
      companyName: string
      reason: 'awaiting_decision' | 'no_recent_action'
      lastActionAt: string | null
    }[]
    // #3212.4/.6 (épopée #3235) — la révision de verdict entre les deux
    // derniers runs terminés, ou `null`.
    // #4180 — la comparaison des deux derniers runs (`unchanged` = même verdict).
    verdictComparison?: { status: string; unchangedSince?: Date } | null
    verdictRevision?: { previousVerdict: string; newVerdict: string; changedAt: Date; causes: string[] } | null
    // #3235 — historique des runs et version DataForge lue par la façade.
    runs?: { id: string; versioning: { dataforge_version: string | null } | null }[]
    dataforgeVersion?: string | null
  } = {},
) {
  const account = overrides.account
  const accountsService = {
    findOneForWorkspace: jest
      .fn()
      .mockResolvedValue(
        account === null || account === undefined
          ? failure({ code: 'not_found', message: 'Account acc-1 not found' })
          : success(account as AccountEntity),
      ),
    computeAgeDays: jest.fn().mockReturnValue(0),
    // #2128.1 — le dossier nomme désormais son porteur : le contrôleur appelle
    // cette dérivation à chaque lecture.
    resolveOwner: jest.fn().mockResolvedValue(null),
    resolveLastAnalyzedAt: jest.fn().mockResolvedValue(overrides.lastAnalyzedAt ?? null),
    // #2634.1 — « Ajouter un signal depuis LinkedIn ». Par défaut un succès à
    // une ligne ; les tests dédiés recomposent le mock quand ils veulent
    // autre chose (not_found, plusieurs signaux…).
    declareSignals: jest.fn().mockResolvedValue(success({ added: 1 })),
    // #2128.19 — chevauchement hors du périmètre de cette suite.
    resolveActiveAnalysisByColleague: jest.fn().mockResolvedValue(null),
    isFollowed: jest.fn().mockResolvedValue(false),
    // #2091.31 — signal de PORTEFEUILLE EXISTANT pour la carte « prioriser la
    // semaine » de `/welcome`. Réutilise la même requête que le pont copilote
    // (`accounts/to-act`), jamais une seconde requête (GA-26).
    accountsAwaitingAction: jest.fn().mockResolvedValue(overrides.accountsToAct ?? []),
  } as unknown as AccountsService

  const analysisRuns = {
    costSummaryForAccount: jest
      .fn()
      .mockResolvedValue(overrides.costSummary ?? { analysesCount: 0, totalCostUsd: null, lastRunCostUsd: null }),
    listAccountsWithOlderProfile: jest.fn().mockResolvedValue(overrides.impactedAccounts ?? []),
    explainVerdictChange: jest.fn().mockResolvedValue(overrides.verdictRevision ?? null),
    compareLastRuns: jest.fn().mockResolvedValue(overrides.verdictComparison ?? null),
    listForAccount: jest.fn().mockResolvedValue(overrides.runs ?? []),
  } as unknown as AnalysisRunsService

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
  } as unknown as WorkspaceContextService

  const analytics = { track: jest.fn().mockResolvedValue(undefined) } as unknown as ProductAnalyticsService

  // #2306.24 — présent seulement quand un test le demande : les suites
  // existantes (findOne/getCost) ne touchent pas au lecteur de profil et
  // continuent de recevoir `undefined`, comme avant.
  const esnProfile =
    overrides.esnProfileVersion === undefined
      ? undefined
      : ({
          getProfileVersions: jest
            .fn()
            .mockResolvedValue({ esnProfileVersion: overrides.esnProfileVersion, profileContextVersion: null }),
        } as never)

  const controller = new AccountsController(
    accountsService,
    {} as never, // analysisService
    analysisRuns,
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext,
    // Plan d'attaque d'un besoin — hors périmètre de cette suite.
    {} as never,
    analytics,
    esnProfile,
    undefined, // stockSnapshots
    undefined, // firstEuro
    undefined, // marketMemory
    undefined, // accountMissions
    overrides.dataforgeVersion === undefined
      ? undefined // intelligence
      : ({ dataforgeVersionFor: jest.fn().mockResolvedValue(overrides.dataforgeVersion) } as never),
    // Le cloisonnement de périmètre (revue sécurité 15/09/2026). `@Optional()`
    // au constructeur, jamais optionnel pour la RÈGLE : absent, le contrôleur
    // LÈVE au lieu de servir tout l'espace. Ici, « pas de cloisonnement » se
    // dit `null` — le niveau d'accès historique.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, accountsService, analysisRuns, workspaceContext, analytics }
}

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }

describe('AccountsController.listRuns — #3235 dataforge_version via la façade', () => {
  const runs = [{ id: 'r1', versioning: { dataforge_version: null } }]

  it('pose la version DataForge lue par la façade sur chaque run', async () => {
    const { controller } = buildController({
      account: { id: 'acc-1', status: 'completed', updated_at: new Date() },
      runs,
      dataforgeVersion: 'ORION_V12',
    })
    const out = (await controller.listRuns('acc-1', USER)) as typeof runs
    expect(out[0]?.versioning?.dataforge_version).toBe('ORION_V12')
  })

  it('sans façade ou sans version, le run reste inchangé (null = inconnu)', async () => {
    const { controller } = buildController({
      account: { id: 'acc-1', status: 'completed', updated_at: new Date() },
      runs,
    })
    const out = (await controller.listRuns('acc-1', USER)) as typeof runs
    expect(out[0]?.versioning?.dataforge_version).toBeNull()
  })
})

describe('AccountsController.findOne', () => {
  it('emits account_viewed when the user opens a COMPLETED dossier (activation step ③)', async () => {
    const { controller, analytics } = buildController({
      account: { id: 'acc-1', status: 'completed', updated_at: new Date() },
    })

    await controller.findOne('acc-1', USER)

    expect(analytics.track).toHaveBeenCalledWith('account_viewed', {
      userId: 'user-1',
      workspaceId: 'ws-1',
      properties: { accountId: 'acc-1' },
    })
  })

  it('#4044 — sert le dossier SANS ses offres de stage (signaux déjà stockés compris), sans toucher au reste', async () => {
    const stage = { signal: 'CS27 - Bac 5 - Stage Supply Chain H/F', type: 'recrutement', date: '2026-10-01' }
    const cdi = { signal: 'Architecte cloud', type: 'recrutement', date: '2026-10-02' }
    const { controller } = buildController({
      account: {
        id: 'acc-1',
        status: 'completed',
        updated_at: new Date(),
        recent_signals: [stage, cdi],
        raw_analysis: { recent_signals: [stage, cdi], it_job_signals: [{ title: 'Stage BAC1' }, { title: 'DSI' }] },
      } as never,
    })

    const result = (await controller.findOne('acc-1', USER)) as unknown as {
      recent_signals: unknown[]
      raw_analysis: { recent_signals: unknown[]; it_job_signals: unknown[] }
    }

    expect(result.recent_signals).toEqual([cdi])
    expect(result.raw_analysis.recent_signals).toEqual([cdi])
    expect(result.raw_analysis.it_job_signals).toEqual([{ title: 'DSI' }])
  })

  it('does NOT emit account_viewed while the analysis is still running (progress polling)', async () => {
    const { controller, analytics } = buildController({
      account: { id: 'acc-1', status: 'analyzing', updated_at: new Date() },
    })

    await controller.findOne('acc-1', USER)

    expect(analytics.track).not.toHaveBeenCalled()
  })

  it('surfaces the REAL last-analysis date on the detail payload (MAX completed_at)', async () => {
    const { controller, accountsService } = buildController({
      account: {
        id: 'acc-1',
        status: 'completed',
        created_at: new Date('2026-07-15T09:00:00Z'),
        updated_at: new Date(),
      },
      lastAnalyzedAt: '2026-07-20T14:30:00.000Z',
    })

    const result = (await controller.findOne('acc-1', USER)) as { last_analyzed_at: string | null }

    expect(accountsService.resolveLastAnalyzedAt).toHaveBeenCalledWith('acc-1')
    // La date réelle du dernier run, PAS le created_at du 15 juillet.
    expect(result.last_analyzed_at).toBe('2026-07-20T14:30:00.000Z')
  })

  it('renvoie last_analyzed_at=null quand aucun run terminé (le client décide du repli)', async () => {
    const { controller } = buildController({
      account: { id: 'acc-1', status: 'completed', updated_at: new Date() },
      lastAnalyzedAt: null,
    })

    const result = (await controller.findOne('acc-1', USER)) as { last_analyzed_at: string | null }

    expect(result.last_analyzed_at).toBeNull()
  })
})

describe('AccountsController.getCost', () => {
  it('surfaces the tracked account cost + run aggregate, workspace-scoped', async () => {
    const { controller, accountsService, analysisRuns, workspaceContext } = buildController({
      account: { id: 'acc-1', api_cost_euros: '0.420000' },
      costSummary: { analysesCount: 3, totalCostUsd: 1.23, lastRunCostUsd: 0.42 },
    })

    const result = await controller.getCost('acc-1', USER)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(accountsService.findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'ws-1', null)
    expect(analysisRuns.costSummaryForAccount).toHaveBeenCalledWith('acc-1')
    expect(result).toEqual({
      account_id: 'acc-1',
      api_cost_euros: 0.42,
      analyses_count: 3,
      total_run_cost_euros: 1.23,
      last_run_cost_euros: 0.42,
    })
  })

  it('returns null api_cost_euros for an account that never stored a cost', async () => {
    const { controller } = buildController({
      account: { id: 'acc-2', api_cost_euros: null },
      costSummary: { analysesCount: 0, totalCostUsd: null, lastRunCostUsd: null },
    })

    const result = await controller.getCost('acc-2', USER)

    expect(result.api_cost_euros).toBeNull()
    expect(result.analyses_count).toBe(0)
    expect(result.total_run_cost_euros).toBeNull()
    expect(result.last_run_cost_euros).toBeNull()
  })

  it('404s for an account outside the caller workspace (never leaks spend)', async () => {
    const { controller, analysisRuns } = buildController({ account: null })

    await expect(controller.getCost('acc-x', USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(analysisRuns.costSummaryForAccount).not.toHaveBeenCalled()
  })
})

// #4180 — « même verdict depuis le … » : le pendant écran de ce que Laura lisait seule.
describe('AccountsController.verdictUnchanged', () => {
  it('verdict identique : rend la date depuis laquelle il tient, workspace-scopée', async () => {
    const { controller, accountsService } = buildController({
      account: { id: 'acc-1' },
      verdictComparison: { status: 'unchanged', unchangedSince: new Date('2026-09-01T08:00:00Z') },
    })
    await expect(controller.verdictUnchanged('acc-1', USER)).resolves.toEqual({
      unchangedSince: '2026-09-01T08:00:00.000Z',
    })
    expect(accountsService.findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'ws-1', null)
  })

  it.each([
    ['verdict changé', { status: 'changed' }],
    ['verdict illisible', { status: 'unreadable' }],
    ['moins de deux analyses', null],
  ])('%s : null, jamais une date inventée', async (_name, verdictComparison) => {
    const { controller } = buildController({ account: { id: 'acc-1' }, verdictComparison })
    await expect(controller.verdictUnchanged('acc-1', USER)).resolves.toBeNull()
  })

  it('compte hors périmètre : null', async () => {
    const { controller } = buildController({ account: null })
    await expect(controller.verdictUnchanged('acc-1', USER)).resolves.toBeNull()
  })
})

// #3212.4/.6 (épopée #3235) — « pourquoi cela a changé », jusqu'à l'écran.
describe('AccountsController.verdictRevision', () => {
  it('rend la révision, workspace-scopée comme :id/runs et :id/cost', async () => {
    const { controller, accountsService, analysisRuns } = buildController({
      account: { id: 'acc-1' },
      verdictRevision: {
        previousVerdict: 'NO-GO',
        newVerdict: 'GO',
        changedAt: new Date('2026-09-28T08:00:00Z'),
        causes: ['nouveaux facteurs dominants : sponsor'],
      },
    })

    const result = await controller.verdictRevision('acc-1', USER)

    expect(accountsService.findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'ws-1', null)
    expect(analysisRuns.explainVerdictChange).toHaveBeenCalledWith('acc-1')
    expect(result).toEqual({
      previousVerdict: 'NO-GO',
      newVerdict: 'GO',
      changedAt: '2026-09-28T08:00:00.000Z',
      causes: ['nouveaux facteurs dominants : sponsor'],
    })
  })

  it('rend `null` quand il n’y a rien à expliquer', async () => {
    const { controller } = buildController({ account: { id: 'acc-1' }, verdictRevision: null })

    await expect(controller.verdictRevision('acc-1', USER)).resolves.toBeNull()
  })

  it('404s pour un compte hors périmètre (jamais un verdict d’un autre espace)', async () => {
    const { controller, analysisRuns } = buildController({ account: null })

    await expect(controller.verdictRevision('acc-x', USER)).resolves.toBeNull()
    expect(analysisRuns.explainVerdictChange).not.toHaveBeenCalled()
  })
})

// #2306.24 — la fiche compte répond déjà « ce dossier a-t-il été produit avec
// un profil différent » un compte à la fois (`:id/profile-provenance`) ;
// cette route agrège sur le portefeuille entier.
describe('AccountsController.listImpactedByProfileChange', () => {
  it('rend la version courante et les comptes au profil périmé, bornés à l’espace', async () => {
    const { controller, analysisRuns, workspaceContext } = buildController({
      esnProfileVersion: 5,
      impactedAccounts: [{ accountId: 'acc-1', companyName: 'TF1', esnProfileVersion: 2 }],
    })

    const result = await controller.listImpactedByProfileChange(USER)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(analysisRuns.listAccountsWithOlderProfile).toHaveBeenCalledWith('ws-1', null, 5)
    expect(result).toEqual({
      currentEsnProfileVersion: 5,
      accounts: [{ accountId: 'acc-1', companyName: 'TF1', esnProfileVersion: 2 }],
    })
  })

  it('rend une liste vide sans lecteur de profil — jamais une comparaison inventée', async () => {
    const { controller, analysisRuns } = buildController()

    const result = await controller.listImpactedByProfileChange(USER)

    expect(analysisRuns.listAccountsWithOlderProfile).toHaveBeenCalledWith('ws-1', null, null)
    expect(result).toEqual({ currentEsnProfileVersion: null, accounts: [] })
  })
})

/**
 * #2091.31 — le signal de PORTEFEUILLE EXISTANT que `/welcome` ne chargeait
 * pas : sans lui, la carte « prioriser la semaine » ne peut jamais se
 * distinguer d'une carte inventée. Réutilise `AccountsService
 * .accountsAwaitingAction` (même requête que le pont copilote
 * `accounts/to-act`, jamais une seconde) avec `limit=1` : seule l'EXISTENCE
 * compte ici, pas la liste.
 */
describe('AccountsController.hasAccountsToAct', () => {
  it('vrai — au moins un compte attend une action', async () => {
    const { controller, accountsService, workspaceContext } = buildController({
      accountsToAct: [{ id: 'acc-1', companyName: 'TF1', reason: 'awaiting_decision', lastActionAt: null }],
    })

    const result = await controller.hasAccountsToAct(USER)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(accountsService.accountsAwaitingAction).toHaveBeenCalledWith('ws-1', 30, 1)
    expect(result).toEqual({ hasAccountsToAct: true })
  })

  it('faux — portefeuille vide (sortie d’onboarding, par construction)', async () => {
    const { controller } = buildController({ accountsToAct: [] })

    const result = await controller.hasAccountsToAct(USER)

    expect(result).toEqual({ hasAccountsToAct: false })
  })
})

/**
 * #2634.1 — « Ajouter un signal depuis LinkedIn », l'appelant qui manquait à
 * `AccountsService.declareSignals` (posé le 22/09/2026, jamais exposé : 0
 * résultat de grep sur `apps/api/src/modules/accounts/*.controller.ts` avant
 * ce lot). Le service est déjà testé (`accounts.service.spec.ts`,
 * `declared-signals.spec.ts`) : ce test ne vérifie que le ROUTAGE — le
 * contrôleur passe bien `id`/`workspaceId`/`userId`/`body` au service, et
 * traduit un `not_found` en 404.
 */
describe('AccountsController.declareSignals', () => {
  it('transmet le compte, l’espace et le corps au service', async () => {
    const { controller, accountsService, workspaceContext } = buildController()
    const body = {
      source: 'LinkedIn' as const,
      entryKind: 'manual' as const,
      signals: [{ label: 'A publié une annonce de poste Data' }],
    }

    const result = await controller.declareSignals('acc-1', body, USER)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(accountsService.declareSignals).toHaveBeenCalledWith('acc-1', 'ws-1', 'user-1', body)
    expect(result).toEqual({ added: 1 })
  })

  it('un compte introuvable rend 404, jamais un 500', async () => {
    const { controller, accountsService } = buildController()
    ;(accountsService.declareSignals as jest.Mock).mockResolvedValueOnce(
      failure({ code: 'not_found', message: 'Account acc-1 not found' }),
    )

    await expect(
      controller.declareSignals('acc-1', { source: 'LinkedIn', entryKind: 'manual', signals: [{ label: 'x' }] }, USER),
    ).rejects.toThrow(NotFoundException)
  })
})

/**
 * Le n°20 (30/08/2026) — `GET /accounts/access-summary` répondait 500 en
 * production alors que le test unitaire de `accessSummary()` passait au vert :
 * un test qui appelle `controller.findOne('acc-1', USER)` directement, comme
 * ci-dessus, ne passe JAMAIS par `ParseUUIDPipe` ni par l'ordre d'enregistrement
 * des routes — les deux ne vivent que dans le pipeline HTTP réel de Nest.
 *
 * Le dépôt A une convention e2e (`Test.createTestingModule` + `supertest`,
 * nommée `*.e2e.spec.ts` — voir `api-keys.controller.e2e.spec.ts`) ; elle n'a
 * simplement jamais été appliquée à `AccountsController`. Le périmètre de ce
 * correctif ne permet pas d'ajouter un nouveau fichier `*.e2e.spec.ts` : ces
 * tests vivent donc ici, dans le même fichier que les tests directs ci-dessus,
 * avec la même convention (`Test.createTestingModule` + `supertest`, guards
 * réels compris) que le reste du dépôt utilise ailleurs.
 *
 * Deux couches sont prouvées séparément :
 *  - la CEINTURE : `ParseUUIDPipe` sur `@Get(':id')` rejette un id malformé
 *    AVANT que le service ne soit appelé (400, jamais 500) ;
 *  - l'ORDRE : `AccountAccessController` monté AVANT `AccountsController`
 *    (comme dans `app.module.ts` corrigé) laisse `access-summary` atteindre
 *    SON PROPRE handler — et monté dans l'ordre INVERSE (le bug historique),
 *    `:id` capture `access-summary` en premier : la ceinture transforme alors
 *    le 500 en 400, mais `AccountAccessService.accessSummary` n'est jamais
 *    appelé. Seul l'ordre restitue la fonctionnalité ; la ceinture ne fait que
 *    rendre l'échec propre. C'est pour ça que GA-178
 *    (`apps/api/src/architecture/`) vérifie l'ORDRE RÉEL dans `app.module.ts`,
 *    et pas seulement la présence du pipe.
 */
describe('AccountsController — à travers le vrai routeur Nest (e2e)', () => {
  const SUPA_SECRET = 'test-jwt-secret-at-least-32-chars-long-bellum-n20'
  const testConfig = () => ({
    supabaseJwtSecret: SUPA_SECRET,
    sessionCookiePrefix: 'session',
    nodeEnv: 'test',
  })
  const token = (sub: string): string =>
    new JwtService({}).sign(
      { email: `${sub}@esn.fr` },
      { secret: SUPA_SECRET, algorithm: 'HS256', audience: 'authenticated', subject: sub, expiresIn: '1h' },
    )

  const VALID_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

  /**
   * Monte un serveur HTTP Nest réel avec les deux contrôleurs qui partagent le
   * préfixe `accounts`, dans l'ORDRE passé — c'est cet ordre qui reproduit (ou
   * corrige) le n°20. Tous les autres collaborateurs sont mockés : ce test ne
   * vérifie ni le SQL ni la RBAC, seulement le ROUTAGE et le pipe.
   */
  async function buildRouterApp(
    controllers:
      | [typeof AccountsController, typeof AccountAccessController]
      | [typeof AccountAccessController, typeof AccountsController],
    // #2130.44 — le rôle du caller, tel que `WorkspaceContextService.resolveActiveWorkspace`
    // le rendrait. `member` reste le défaut historique de cette suite.
    role: string = 'member',
  ) {
    const accountsServiceMock = {
      findOneForWorkspace: jest
        .fn()
        .mockResolvedValue(
          success({ id: VALID_ACCOUNT_ID, status: 'completed', updated_at: new Date() } as AccountEntity),
        ),
      computeAgeDays: jest.fn().mockReturnValue(1),
      resolveOwner: jest.fn().mockResolvedValue(null),
      resolveLastAnalyzedAt: jest.fn().mockResolvedValue(null),
      // #2128.19 — chevauchement hors du périmètre de cette suite.
      resolveActiveAnalysisByColleague: jest.fn().mockResolvedValue(null),
      isFollowed: jest.fn().mockResolvedValue(false),
      // #2130.44 — la cible du scénario « permission insuffisante ».
      archive: jest.fn().mockResolvedValue(success({ archived: true })),
    }
    const accessSummaryMock = jest.fn().mockResolvedValue([{ accountId: VALID_ACCOUNT_ID, accessClass: 'gatekeeper' }])
    const workspaceContextMock = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role }),
      // #2081.14 — lu par la règle d'espace sur les routes `@DataExit()` seulement ;
      // aucune route de cette suite n'en porte, mais le guard le lit sans condition
      // sur `permissions.length` pour un `dataExit` — fourni pour ne pas planter.
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    }

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [testConfig] }), PassportModule],
      controllers,
      providers: [
        JwtStrategy,
        // JwtGuard composes ['impersonation', 'jwt'] — both strategies must be
        // registered even though these tests only exercise the normal session.
        ImpersonationStrategy,
        WorkspacePermissionGuard,
        { provide: AccountsService, useValue: accountsServiceMock },
        { provide: AnalysisService, useValue: {} },
        { provide: AnalysisRunsService, useValue: {} },
        { provide: AccountShareService, useValue: {} },
        { provide: AccountTimelineService, useValue: {} },
        { provide: ContactsService, useValue: {} },
        { provide: NeedPlayService, useValue: {} },
        { provide: WorkspaceContextService, useValue: workspaceContextMock },
        { provide: AccountAccessService, useValue: { accessSummary: accessSummaryMock } },
        // #3473 — l'onglet Accès réconcilie les entités avant de lire : hors sujet ici.
        { provide: AccountEntitiesService, useValue: { reconcileAccount: jest.fn().mockResolvedValue(undefined) } },
        // Le cloisonnement de périmètre : fourni EXPLICITEMENT, sinon le
        // contrôleur LÈVE 503 — ce qui est le comportement voulu en
        // production, et un faux rouge ici. « Pas de cloisonnement » = `null`.
        { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile()

    const app: INestApplication = moduleRef.createNestApplication()
    await app.init()
    return { app, accountsServiceMock, accessSummaryMock }
  }

  const auth = () => `Bearer ${token('user-1')}`

  it('la CEINTURE — un id qui n’est pas un UUID est rejeté (400) AVANT d’atteindre le service', async () => {
    const { app, accountsServiceMock } = await buildRouterApp([AccountsController, AccountAccessController])
    try {
      const res = await request(app.getHttpServer()).get('/accounts/not-a-uuid').set('Authorization', auth())
      expect(res.status).toBe(400)
      expect(accountsServiceMock.findOneForWorkspace).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('un vrai UUID continue d’atteindre findOne() à travers le routeur réel', async () => {
    const { app, accountsServiceMock } = await buildRouterApp([AccountsController, AccountAccessController])
    try {
      const res = await request(app.getHttpServer()).get(`/accounts/${VALID_ACCOUNT_ID}`).set('Authorization', auth())
      expect(res.status).toBe(200)
      expect(accountsServiceMock.findOneForWorkspace).toHaveBeenCalledWith(VALID_ACCOUNT_ID, 'ws-1', null)
    } finally {
      await app.close()
    }
  })

  it('l’ORDRE corrigé (AccountAccessController avant AccountsController) : access-summary atteint SON handler', async () => {
    const { app, accessSummaryMock, accountsServiceMock } = await buildRouterApp([
      AccountAccessController,
      AccountsController,
    ])
    try {
      const res = await request(app.getHttpServer()).get('/accounts/access-summary').set('Authorization', auth())
      expect(res.status).toBe(200)
      expect(accessSummaryMock).toHaveBeenCalledWith('ws-1')
      expect(accountsServiceMock.findOneForWorkspace).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('reproduit le bug n°20 — l’ordre HISTORIQUE (AccountsController avant AccountAccessController) capture access-summary sous :id', async () => {
    const { app, accessSummaryMock } = await buildRouterApp([AccountsController, AccountAccessController])
    try {
      const res = await request(app.getHttpServer()).get('/accounts/access-summary').set('Authorization', auth())
      // La ceinture (ParseUUIDPipe) rend l'échec propre — 400, jamais 500 — mais
      // ne restitue PAS la fonctionnalité : le handler réel n'est jamais appelé.
      expect(res.status).toBe(400)
      expect(accessSummaryMock).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  /**
   * #2130.44 — PERMISSION INSUFFISANTE, à travers le VRAI `WorkspacePermissionGuard`
   * et le VRAI routage Nest. `dossier-cta-permission.test.tsx` (front) prouve que
   * le BOUTON se désactive ; rien ne prouvait, côté API, qu'un rôle `viewer` qui
   * contournerait ce bouton (appel direct, extension navigateur, replay) se heurte
   * bien au SERVEUR — `workspace-permission.guard.spec.ts` teste le guard SEUL,
   * jamais monté sur une route réelle d'`AccountsController`.
   */
  it('un rôle `viewer` reçoit 403 sur `POST :id/archive` — le service n’est JAMAIS atteint', async () => {
    const { app, accountsServiceMock } = await buildRouterApp([AccountsController, AccountAccessController], 'viewer')
    try {
      const res = await request(app.getHttpServer())
        .post(`/accounts/${VALID_ACCOUNT_ID}/archive`)
        .set('Authorization', auth())
      expect(res.status).toBe(403)
      expect(accountsServiceMock.archive).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('sait dire NON — un rôle qui PORTE `records:write` atteint le service, sur la MÊME route', async () => {
    const { app, accountsServiceMock } = await buildRouterApp([AccountsController, AccountAccessController], 'sales')
    try {
      const res = await request(app.getHttpServer())
        .post(`/accounts/${VALID_ACCOUNT_ID}/archive`)
        .set('Authorization', auth())
      expect(res.status).toBe(201)
      expect(accountsServiceMock.archive).toHaveBeenCalledWith(VALID_ACCOUNT_ID, 'user-1')
    } finally {
      await app.close()
    }
  })
})
