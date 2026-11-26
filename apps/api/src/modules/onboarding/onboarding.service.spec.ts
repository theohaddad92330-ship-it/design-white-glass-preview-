import { assertSuccess, isFailure } from '@bellum/utils'
import type { Repository } from 'typeorm'
import type { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { ImportSessionEntity } from '../../database/entities/import-session.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import type { OnboardingStageDefinitionEntity } from '../../database/entities/onboarding-stage-definition.entity'
import type { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'
import type { UserOnboardingTransitionEntity } from '../../database/entities/user-onboarding-transition.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { EsnProfileWorkspaceResolver } from '../esn-profile/esn-profile-workspace.resolver'
import { ONBOARDING_STATUSES, ONBOARDING_TRANSITIONS, OnboardingService } from './onboarding.service'

const noopProfileContext = {
  triggerGeneration: jest.fn(),
} as unknown as ProfileContextService

/** Minimal in-memory TypeORM repo. `keyOf` upserts on save; omit for read-only. */
function makeRepo<T extends object>(rows: T[], keyOf?: (r: T) => string) {
  const get = (r: T, k: string): unknown => (r as Record<string, unknown>)[k]
  return {
    find: jest.fn(async (opts?: { order?: { stage_order?: 'ASC' } }) => {
      const out = [...rows]
      if (opts?.order?.stage_order === 'ASC')
        out.sort((a, b) => Number(get(a, 'stage_order')) - Number(get(b, 'stage_order')))
      return out
    }),
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find(r => Object.entries(where).every(([k, v]) => get(r, k) === v)) ?? null,
    ),
    create: jest.fn((data: Partial<T>) => ({ ...data })),
    merge: jest.fn((target: T, ...sources: Partial<T>[]) => Object.assign(target, ...sources)),
    save: jest.fn(async (entity: T) => {
      if (keyOf) {
        const idx = rows.findIndex(r => keyOf(r) === keyOf(entity))
        if (idx >= 0) rows[idx] = entity
        else rows.push(entity)
      }
      return entity
    }),
  } as unknown as Repository<T> & { find: jest.Mock; findOne: jest.Mock; save: jest.Mock }
}

function makeStages() {
  return [
    { id: 's1', code: 'company_info', title: 'Votre ESN', stage_order: 2, is_required: true },
    { id: 's2', code: 'offer_expertise', title: 'Votre offre', stage_order: 3, is_required: true },
    { id: 's3', code: 'target_market', title: 'Vos cibles', stage_order: 4, is_required: true },
    { id: 's4', code: 'transition_summary', title: 'Récapitulatif', stage_order: 5, is_required: true },
  ] as OnboardingStageDefinitionEntity[]
}

const FULL_ANSWERS = {
  esn_name: 'Acme',
  consultant_size: '30-80',
  sales_team_size: '2-3 personnes',
  expertise_areas: ['Data & IA'],
  positioning: 'Expertise de niche',
  target_sectors: ['Banque'],
  target_company_types: ['ETI'],
  staffing_model: 'Mix équilibré CDI / Freelances',
  geo_zones: ['Paris & Île-de-France'],
  main_sales_pain: 'Trouver les bons comptes à cibler',
}

/**
 * Append-only in-memory `user_onboarding_transitions` repo — no upsert key.
 *
 * #2021 (08/10/2026) — `findOne` ajouté : `getState` appelle désormais
 * `firstOnboardingCompletionAt` (déjà utilisée par `getRedesignBannerState`,
 * voir `onboarding-redesign-banner.spec.ts`), qui lit ce dépôt. Sans ce mock,
 * CHAQUE `getState` de ce fichier levait (`findOne` undefined) — même panne
 * que si la table réelle manquait, détectée en lançant la suite.
 */
function makeTransitionsRepo(rows: UserOnboardingTransitionEntity[] = []) {
  return {
    // `created_at: new Date()` par défaut — le vrai `@CreateDateColumn` le
    // pose au `save()`, ce mock n'a pas d'équivalent automatique ; sans lui,
    // `findOne` (tri par `created_at`) lève sur une transition créée par le
    // service lui-même (jamais construite à la main avec cette colonne).
    create: jest.fn(
      (data: Partial<UserOnboardingTransitionEntity>) =>
        ({ created_at: new Date(), ...data }) as UserOnboardingTransitionEntity,
    ),
    save: jest.fn(async (entity: UserOnboardingTransitionEntity) => {
      rows.push(entity)
      return entity
    }),
    findOne: jest.fn(
      async ({ where, order }: { where: Record<string, unknown>; order?: { created_at?: 'ASC' | 'DESC' } }) => {
        const matches = rows.filter(r => Object.entries(where).every(([k, v]) => (r as never)[k] === v))
        const sorted = [...matches].sort((a, b) =>
          order?.created_at === 'DESC'
            ? b.created_at.getTime() - a.created_at.getTime()
            : a.created_at.getTime() - b.created_at.getTime(),
        )
        return sorted[0] ?? null
      },
    ),
  } as unknown as Repository<UserOnboardingTransitionEntity> & {
    save: jest.Mock
    rows: UserOnboardingTransitionEntity[]
  }
}

function makeService(opts: {
  states?: UserOnboardingStateEntity[]
  esn?: EsnProfileEntity[]
  /** How many `analysis_runs` rows are `completed` for the user — the Temps-2 trigger. */
  completedRuns?: number
  /** Étapes d'activation franchies — le SECOND déclencheur (§21, « 3 actions majeures »). */
  majorActions?: number
  /** #2004.19 — sessions d'import existantes, toutes personnes confondues. */
  importSessions?: Partial<ImportSessionEntity>[]
  /** #2014.3/.7 — les fiches `profiles` (adresse, prénom/nom) — LA personne
   *  ET, si connu, qui l'a invitée. */
  personalProfiles?: Partial<ProfileEntity>[]
  /** #2014.3/.7 — les invitations d'espace, toutes confondues. */
  workspaceInvitations?: Partial<WorkspaceInvitationEntity>[]
  /** #2014.3/.7 — les espaces existants (juste leur nom, ici). */
  workspaces?: Partial<WorkspaceEntity>[]
  /** #4158.12 — les appartenances à un espace (rôle compris). */
  members?: Partial<WorkspaceMemberEntity>[]
}) {
  const states = makeRepo<UserOnboardingStateEntity>(opts.states ?? [], r => r.user_id)
  const stages = makeRepo<OnboardingStageDefinitionEntity>(makeStages())
  const esn = makeRepo<EsnProfileEntity>(opts.esn ?? [], r => r.user_id)
  const runs = {
    count: jest.fn(async () => opts.completedRuns ?? 0),
  } as unknown as Repository<AnalysisRunEntity>
  const transitionRows: UserOnboardingTransitionEntity[] = []
  const transitions = makeTransitionsRepo(transitionRows)
  // No workspace in these specs → the resolver degrades to the legacy per-user path.
  const resolver = new EsnProfileWorkspaceResolver(
    esn,
    makeRepo<WorkspaceEntity>((opts.workspaces ?? []) as WorkspaceEntity[]),
    makeRepo<WorkspaceMemberEntity>((opts.members ?? []) as WorkspaceMemberEntity[]),
    // Le dépôt de l'espace CHOISI (#onboarding partagé) : vide ici, ce qui
    // ramène exactement le comportement d'avant pour ces cas.
    { findOne: async () => null } as never,
  )
  const esnProfile = new EsnProfileService(esn, noopProfileContext, resolver)
  const activation =
    opts.majorActions === undefined
      ? undefined
      : ({
          getActivation: jest.fn(async () => success({ completed_count: opts.majorActions })),
        } as unknown as ActivationService)
  // #2004.19 — sessions d'import : `find` filtre par `created_by` et trie
  // par `created_at` DESC, comme le service le demande — pas un mock générique.
  const importSessionRows = (opts.importSessions ?? []) as ImportSessionEntity[]
  const importSessions = {
    find: jest.fn(async ({ where }: { where: { created_by: string } }) =>
      importSessionRows
        .filter(r => r.created_by === where.created_by)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    ),
  } as unknown as Repository<ImportSessionEntity>
  // #2014.3/.7 — l'espace REJOINT : la personne (email), l'invitation
  // ACCEPTÉE qui la lie à un espace, et le nom de cet espace.
  const personalProfiles = makeRepo<ProfileEntity>((opts.personalProfiles ?? []) as ProfileEntity[], r => r.user_id)
  const workspaceInvitationRows = (opts.workspaceInvitations ?? []) as WorkspaceInvitationEntity[]
  const workspaceInvitations = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      workspaceInvitationRows.filter(r =>
        Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      ),
    ),
  } as unknown as Repository<WorkspaceInvitationEntity>
  const workspaces = makeRepo<WorkspaceEntity>((opts.workspaces ?? []) as WorkspaceEntity[], r => r.id)
  const service = new OnboardingService(
    states,
    stages,
    runs,
    transitions,
    esnProfile,
    activation,
    undefined,
    importSessions,
    personalProfiles,
    workspaceInvitations,
    workspaces,
  )
  return { service, states, esn, transitions, transitionRows }
}

import { profileQuestionnaireProgress } from '@bellum/contracts'
import { success } from '@bellum/utils'
import { ActivationService } from './activation.service'

describe('OnboardingService', () => {
  it('seeds state on first read, starting at company_info with empty answers', async () => {
    const { service } = makeService({})
    const result = await service.getState('u1')
    const value = assertSuccess(result)

    expect(value.id).toBe('u1')
    expect(value.status).toBe('not_started')
    expect(value.current_stage_code).toBe('company_info')
    expect(value.answers.esn_name).toBeNull()
    expect(value.answers.expertise_areas).toEqual([])
    expect(value.stages).toHaveLength(4)
  })

  // #2035.8 — l'effectif porte sa date, et redevient inconnu en vieillissant.
  it('rend `effectif_observed_at` vide quand rien n’a jamais été horodaté — jamais deviné', async () => {
    const { service } = makeService({})
    const value = assertSuccess(await service.getState('u1'))

    expect(value.effectif_observed_at).toEqual({})
  })

  it('rend les dates réellement posées sur la ligne de l’utilisateur', async () => {
    const { service } = makeService({
      esn: [
        {
          user_id: 'u1',
          version: 1,
          is_current: true,
          effectif_observed_at: { consultant_size: '2026-06-01T00:00:00.000Z' },
        } as unknown as EsnProfileEntity,
      ],
    })
    const value = assertSuccess(await service.getState('u1'))

    expect(value.effectif_observed_at).toEqual({ consultant_size: '2026-06-01T00:00:00.000Z' })
  })

  it('rejects advancing to an unknown stage', async () => {
    const { service } = makeService({})
    const result = await service.advanceStage('u1', 'nope')

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('unknown_stage')
  })

  it('advances the current stage and flips status to in_progress', async () => {
    const { service } = makeService({})
    const value = assertSuccess(await service.advanceStage('u1', 'target_market'))

    expect(value.current_stage_code).toBe('target_market')
    expect(value.status).toBe('in_progress')
  })

  it('upserts answers into the current esn_profiles row', async () => {
    const { service, esn } = makeService({})
    await service.saveAnswers('u1', { esn_name: 'Acme', expertise_areas: ['Data & IA'] })
    const reread = assertSuccess(await service.getState('u1'))

    expect(reread.answers.esn_name).toBe('Acme')
    expect(reread.answers.expertise_areas).toEqual(['Data & IA'])
    expect(esn.save as jest.Mock).toHaveBeenCalled()
  })

  // #2538 — Ludovic : plusieurs domaines personnalisés (hors catalogue) doivent
  // survivre à l'enregistrement ET à la relecture au retour sur l'étape, dans
  // l'ordre saisi, même après une sauvegarde d'une AUTRE question.
  it('enregistre puis relit trois domaines personnalisés, dans l’ordre (#2538)', async () => {
    const { service } = makeService({})
    const custom = ['Hydraulique', 'Chaudronnerie', 'Soudage']
    await service.saveAnswers('u1', { expertise_areas: ['Data & IA', ...custom] })
    await service.saveAnswers('u1', { positioning: 'Expertise de niche' })
    const reread = assertSuccess(await service.getState('u1'))

    expect(reread.answers.expertise_areas).toEqual(['Data & IA', ...custom])
    expect(reread.answers.positioning).toBe('Expertise de niche')
  })

  it('blocks completion when required answers are missing', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', { esn_name: 'Acme' })
    const result = await service.complete('u1')

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('incomplete')
    expect(result.problem.message).toContain('consultant_size')
    // #4817 — les clés manquantes voyagent EN DONNÉE : l'écran les nomme et les relie sans relire une phrase.
    expect(result.problem.missing).toContain('consultant_size')
    expect(result.problem.missing).not.toContain('esn_name')
  })

  it('completes when all 10 answers are filled', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    const value = assertSuccess(await service.complete('u1'))

    expect(value.status).toBe('completed')
    expect(value.current_stage_code).toBe('transition_summary')
  })
})

describe('OnboardingService — #2084 : la forme commune d’un échec de sauvegarde', () => {
  it('retombe sur `persist_failed` avec la forme commune — jamais une valeur de remplissage', async () => {
    const { service, states } = makeService({})
    states.save.mockRejectedValueOnce(new Error('boom'))
    const result = await service.advanceStage('u1', 'target_market')

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('persist_failed')
    expect(result.problem.journey?.code).toBe('save_failed')
    expect(result.problem.journey?.whatHappened.length).toBeGreaterThan(0)
    expect(result.problem.journey?.notDone.length).toBeGreaterThan(0)
    expect(result.problem.journey?.nextAction.length).toBeGreaterThan(0)
    // #2084.17 — jamais `undefined` : un tableau vide quand il n'y a rien à nommer.
    expect(Array.isArray(result.problem.journey?.preserved)).toBe(true)
  })

  it('une connexion jamais établie (UND_ERR_CONNECT_TIMEOUT) est classée REJOUABLE', async () => {
    const { service, states } = makeService({})
    states.save.mockRejectedValueOnce(Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }))
    const result = await service.advanceStage('u1', 'target_market')

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.journey?.retryable).toBe(true)
  })

  it('TÉMOIN DE NON-RÉGRESSION — une requête partie sans réponse (`unknown`) n’est PAS rejouable', async () => {
    const { service, states } = makeService({})
    // Pas de `.code` reconnu : on ne SAIT PAS si l'écriture a pu partir, donc
    // pas de reprise automatique (doctrine CLAUDE.md « un timeout n'est pas
    // un échec »).
    states.save.mockRejectedValueOnce(new Error('connection terminated unexpectedly'))
    const result = await service.advanceStage('u1', 'target_market')

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.journey?.retryable).toBe(false)
  })

  it('une erreur brute ne fuit jamais telle quelle dans le message — un secret glissé est masqué', async () => {
    const { service, esn } = makeService({})
    ;(esn.save as jest.Mock).mockRejectedValueOnce(new Error('Bearer sk_live_abcdef1234567890ABCDEF'))
    const result = await service.saveAnswers('u1', { esn_name: 'Acme' })

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.journey?.whatHappened).not.toContain('sk_live_abcdef1234567890ABCDEF')
  })
})

/**
 * #2022.7 — LA GÉNÉRATION NE PART QU'À LA COMPLÉTION.
 *
 * Avant : `EsnProfileService.upsertAnswers` déclenchait une génération à chaque
 * sous-étape, si bien que l'ancien profil n'était JAMAIS actif pendant qu'on
 * réédite — et que neuf appels modèle sur dix étaient payés pour un état
 * intermédiaire que personne ne lit.
 *
 * Ce bloc sait dire NON : remettre
 * `void this.profileContext.triggerGeneration(userId, next, { reedited: true })`
 * dans `upsertAnswers` fait rougir le premier cas (3 générations au lieu de 0)
 * ET le second (2 au lieu de 1, la dernière sous-étape comptant pour une).
 */
describe("OnboardingService — #2022.7 : la génération ne part qu'à la complétion", () => {
  const generations = () => (noopProfileContext.triggerGeneration as jest.Mock).mock.calls

  beforeEach(() => {
    ;(noopProfileContext.triggerGeneration as jest.Mock).mockClear()
  })

  it("parcourir trois sous-étapes ne déclenche AUCUNE génération, et l'ancien profil reste actif", async () => {
    const { service, esn } = makeService({})

    await service.saveAnswers('u1', { esn_name: FULL_ANSWERS.esn_name })
    await service.saveAnswers('u1', { consultant_size: FULL_ANSWERS.consultant_size })
    await service.saveAnswers('u1', { expertise_areas: FULL_ANSWERS.expertise_areas })

    // Le corpus n'est PAS vide : les trois sous-étapes ont réellement écrit.
    // Sans cette lecture, un `saveAnswers` devenu no-op rendrait le test vert
    // pour la mauvaise raison.
    expect((esn.save as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3)
    const written = assertSuccess(await service.getState('u1'))
    expect(written.answers.esn_name).toBe(FULL_ANSWERS.esn_name)

    expect(generations()).toHaveLength(0)
  })

  it('la complétion en déclenche EXACTEMENT une, et elle porte `reedited`', async () => {
    const { service } = makeService({})
    for (const [key, value] of Object.entries(FULL_ANSWERS)) {
      await service.saveAnswers('u1', { [key]: value })
    }
    expect(generations()).toHaveLength(0)

    assertSuccess(await service.complete('u1'))

    expect(generations()).toHaveLength(1)
    expect(generations()[0][2]).toEqual({ reedited: true })
    expect(generations()[0][1]).toEqual(expect.objectContaining({ esn_name: FULL_ANSWERS.esn_name }))
  })

  it("une complétion REFUSÉE ne régénère rien — le témoin qui prouve qu'on ne vise pas `complete` en bloc", async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', { esn_name: FULL_ANSWERS.esn_name })

    // Réponses manquantes → `complete` échoue AVANT toute transition.
    expect(isFailure(await service.complete('u1'))).toBe(true)
    expect(generations()).toHaveLength(0)
  })

  it('une génération qui échoue ne fait PAS échouer la complétion — elle est déjà écrite', async () => {
    const { service } = makeService({})
    for (const [key, value] of Object.entries(FULL_ANSWERS)) {
      await service.saveAnswers('u1', { [key]: value })
    }
    ;(noopProfileContext.triggerGeneration as jest.Mock).mockRejectedValueOnce(new Error('IA down'))

    const value = assertSuccess(await service.complete('u1'))
    expect(value.status).toBe('completed')
  })
})

describe('OnboardingService — Temps 2 (complément de profil)', () => {
  it('proposes nothing before a first analysis has COMPLETED', async () => {
    // A launched-but-unfinished analysis is not a dossier the rep has seen.
    const { service } = makeService({ completedRuns: 0 })
    const state = await service.getComplementState('u1')

    expect(state.status).toBe('locked')
    expect(state.eligible).toBe(false)
    expect(state.visible).toBe(false)
    // Le total suit le CATALOGUE partagé (§21-30), branchement compris : il ne
    // peut donc plus être une constante figée dans le test.
    expect(state.total_count).toBe(profileQuestionnaireProgress({}).total)
  })

  it('becomes proposable once a dossier is completed, and counts real answers', async () => {
    const { service } = makeService({ completedRuns: 1 })
    await service.saveAnswers('u1', { decision_maker_personas: ['DSI'], avg_tjm: '550-700' })
    const state = await service.getComplementState('u1')

    expect(state.status).toBe('pending')
    expect(state.visible).toBe(true)
    expect(state.answered_count).toBe(2)
  })

  it('#3923 — les métiers placés comptent dans la complétude du Temps 2 (décision Louis 09/10)', async () => {
    const { service } = makeService({ completedRuns: 1 })
    const before = await service.getComplementState('u1')
    await service.saveAnswers('u1', { placed_roles: ['Développeur', 'Data'] })
    const after = await service.getComplementState('u1')

    expect(after.total_count).toBe(before.total_count)
    expect(after.answered_count).toBe(before.answered_count + 1)
  })

  it('s’ouvre aussi après 3 actions majeures, sans attendre une analyse terminée (§21)', async () => {
    // Le rapport déclenche « après 24 h OU après 3 actions majeures ». Un
    // commercial qui a rempli son profil, lancé une analyse et consulté un
    // dossier a fait le tour du produit : la question a du sens pour lui.
    const { service } = makeService({ completedRuns: 0, majorActions: 3 })
    const state = await service.getComplementState('u1')
    expect(state.eligible).toBe(true)
    expect(state.status).toBe('pending')
  })

  it('reste fermé à qui n’a presque rien fait — le temps seul ne prouve aucun usage', async () => {
    const { service } = makeService({ completedRuns: 0, majorActions: 2 })
    const state = await service.getComplementState('u1')
    expect(state.eligible).toBe(false)
    expect(state.status).toBe('locked')
  })

  it('« plus tard » hides it for a few days, then brings it back', async () => {
    const { service } = makeService({ completedRuns: 1 })
    const now = new Date('2026-07-22T10:00:00.000Z')
    assertSuccess(await service.snoozeComplement('u1', now))

    // Read AT the snooze instant: silenced.
    expect((await service.getComplementState('u1', now)).status).toBe('snoozed')
    expect((await service.getComplementState('u1', now)).visible).toBe(false)
    // A week later it is proposable again — « plus tard » is not « jamais ».
    const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    expect((await service.getComplementState('u1', later)).status).toBe('pending')
  })

  it('« ne plus me le proposer » is definitive and keeps the answers given', async () => {
    const { service } = makeService({ completedRuns: 1 })
    await service.saveAnswers('u1', { avg_sales_cycle: '3 à 6 mois' })
    const state = assertSuccess(await service.dismissComplement('u1'))

    expect(state.status).toBe('dismissed')
    expect(state.visible).toBe(false)
    expect(state.answered_count).toBe(1)
    const reread = assertSuccess(await service.getState('u1'))
    expect(reread.answers.avg_sales_cycle).toBe('3 à 6 mois')
  })

  it('marks the complement done even when questions were skipped (never blocking)', async () => {
    const { service } = makeService({ completedRuns: 1 })
    const state = assertSuccess(await service.completeComplement('u1'))

    expect(state.status).toBe('completed')
    expect(state.answered_count).toBe(0)
    expect(state.visible).toBe(false)
  })

  it('never resurfaces once completed, whatever the snooze', async () => {
    const { service } = makeService({ completedRuns: 1 })
    await service.snoozeComplement('u1')
    await service.completeComplement('u1')

    expect((await service.getComplementState('u1')).status).toBe('completed')
  })

  it('leaves Temps 1 untouched: a complement answer never counts toward completion', async () => {
    const { service } = makeService({ completedRuns: 1 })
    await service.saveAnswers('u1', { decision_maker_personas: ['DSI'], avg_tjm: '550-700' })
    const result = await service.complete('u1')

    expect(isFailure(result)).toBe(true)
  })
})

describe('OnboardingService — la machine d’état canonique (#2004)', () => {
  it('la table des transitions n’est jamais vide et couvre les douze états canoniques', () => {
    expect(ONBOARDING_STATUSES.length).toBe(12)
    expect(Object.keys(ONBOARDING_TRANSITIONS).length).toBeGreaterThan(0)
    // Chaque état canonique a une entrée dans la table (même vide pour un état
    // terminal) : un état absent de la table est un état que le code ne sait
    // même pas JUGER, encore moins atteindre ou quitter.
    for (const status of ONBOARDING_STATUSES) {
      expect(Object.prototype.hasOwnProperty.call(ONBOARDING_TRANSITIONS, status)).toBe(true)
    }
  })

  it('chacun des douze états est ATTEIGNABLE depuis not_started — un état qu’on ne peut pas atteindre n’existe pas', () => {
    const reached = new Set<string>(['not_started'])
    let frontier = ['not_started']
    while (frontier.length > 0) {
      const next: string[] = []
      for (const from of frontier) {
        for (const to of ONBOARDING_TRANSITIONS[from as keyof typeof ONBOARDING_TRANSITIONS] ?? []) {
          if (!reached.has(to)) {
            reached.add(to)
            next.push(to)
          }
        }
      }
      frontier = next
    }
    expect([...reached].sort()).toEqual([...ONBOARDING_STATUSES].sort())
  })

  it('un parcours normal traverse tous ses états réels sans être arrêté (témoin de non-régression)', async () => {
    const { service } = makeService({})
    assertSuccess(await service.advanceStage('u1', 'target_market')) // not_started → in_progress
    await service.saveAnswers('u1', FULL_ANSWERS)
    const completed = assertSuccess(await service.complete('u1')) // in_progress → completed
    expect(completed.status).toBe('completed')

    const refreshed = assertSuccess(await service.requestRefresh('u1')) // completed → refresh_required
    expect(refreshed.status).toBe('refresh_required')

    const resumed = assertSuccess(await service.advanceStage('u1', 'company_info')) // refresh_required → in_progress
    expect(resumed.status).toBe('in_progress')
  })

  /**
   * 16/09/2026 — la reprise se terminait dans un MUR.
   *
   * `advanceStage` n'est appelé qu'au CHANGEMENT d'étape
   * (`useOnboardingNavigation`, web) : une reprise qui redémarre à une
   * sous-étape du DERNIER stage n'en croise aucun, le statut reste donc
   * `refresh_required` jusqu'à l'écran de relecture — et « Générer mon audit »
   * échouait en `invalid_transition`, parce que `refresh_required → completed`
   * n'était pas déclaré. Un parcours qu'on peut commencer sans pouvoir le finir
   * n'est pas une voie de reprise.
   */
  it('une reprise peut SE TERMINER sans repasser par un changement d’étape (16/09/2026)', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    await service.complete('u1')
    assertSuccess(await service.requestRefresh('u1')) // completed → refresh_required

    const value = assertSuccess(await service.complete('u1')) // refresh_required → completed
    expect(value.status).toBe('completed')
  })

  it('une reprise n’écrase AUCUNE réponse déjà donnée — on archive, on ne remet pas à zéro', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    await service.complete('u1')
    assertSuccess(await service.requestRefresh('u1'))

    const state = assertSuccess(await service.getState('u1'))
    expect(state.answers.esn_name).toBe('Acme')
    expect(state.answers.main_sales_pain).toBe('Trouver les bons comptes à cibler')
  })

  it('complète directement depuis not_started (aucune étape avancée d’abord) — le chemin existant, préservé', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    const value = assertSuccess(await service.complete('u1'))
    expect(value.status).toBe('completed')
  })

  it('ne déduit jamais le statut des réponses : remplir le questionnaire sans le terminer laisse le statut à not_started (#2004.20)', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    const state = assertSuccess(await service.getState('u1'))
    expect(state.status).toBe('not_started')
  })

  it('refuse une transition illégale : demander une actualisation avant même d’avoir démarré (not_started)', async () => {
    const { service } = makeService({})
    const fromNotStarted = await service.requestRefresh('u1')
    expect(isFailure(fromNotStarted)).toBe(true)
    if (isFailure(fromNotStarted)) expect(fromNotStarted.problem.code).toBe('invalid_transition')
  })

  /**
   * #2021 (recette écran 27/09/2026, DÉCISION Louis) — réfuté en production :
   * Louis, au milieu du parcours fin (n'importe quel état entre `in_progress`
   * et `first_value_ready`), n'avait AUCUN moyen de demander le mode guidé —
   * seuls `completed`/`activated` l'autorisaient. La doctrine retenue est
   * « tout statut postérieur à `not_started` » : chacun de ces états doit
   * désormais accepter la demande.
   */
  it('accepte une actualisation depuis n’importe quel statut postérieur à not_started, pas seulement un état terminal', async () => {
    const { service } = makeService({})
    await service.advanceStage('u1', 'target_market') // not_started → in_progress
    const fromInProgress = assertSuccess(await service.requestRefresh('u1'))
    expect(fromInProgress.status).toBe('refresh_required')
  })

  it('refresh_required n’est posé que par un geste explicite de l’utilisateur, depuis un état terminal', async () => {
    const { service, transitionRows } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    await service.complete('u1')

    const value = assertSuccess(await service.requestRefresh('u1'))
    expect(value.status).toBe('refresh_required')

    const journaled = transitionRows.find(row => row.to_status === 'refresh_required')
    expect(journaled?.from_status).toBe('completed')
    expect(journaled?.reason).toBe('user_requested_refresh')
  })

  /**
   * #2572 — mesuré en production sur le compte de Louis (`11372508b`) :
   * `status: refresh_required, skipped_at: <date>`. Le compte avait posé
   * « Plus tard » (`skipQuestionnaire`) puis demandé une reconfiguration
   * explicite (`requestRefresh`) — mais `requestRefresh` ne touchait jamais
   * `skipped_at`, qui restait posé. Le garde web (`needsOnboarding`) lisait ce
   * report PÉRIMÉ et renvoyait le compte ailleurs qu'au questionnaire : un
   * bouton « Reprendre la reconfiguration » qui n'ouvrait jamais rien.
   *
   * Même raison que `complete()` juste au-dessus (« un questionnaire terminé
   * efface son report ») : une demande de reconfiguration efface aussi le
   * report qu'elle remplace — le geste EXPLICITE le plus récent gagne.
   */
  it('#2572 — une demande de reconfiguration efface un « plus tard » PÉRIMÉ, elle ne le laisse pas traîner', async () => {
    const { service } = makeService({
      states: [
        {
          user_id: 'u1',
          status: 'completed',
          current_stage_id: null,
          skipped_at: new Date('2026-08-02T10:00:00Z'),
        } as UserOnboardingStateEntity,
      ],
    })

    const value = assertSuccess(await service.requestRefresh('u1'))

    expect(value.status).toBe('refresh_required')
    expect(value.skipped_at).toBeNull()
  })

  /**
   * #2572.2 — même bug, symptôme différent : mesuré en production le 18/09
   * (« Reprendre la reconfiguration » n'ouvre rien, `GET /onboarding/state`
   * rend `status: refresh_required, skipped_at: <la veille>`). Le test #2572
   * ci-dessus ne couvre que la transition FRAÎCHE (`completed →
   * refresh_required`) ; ce compte-ci est DÉJÀ `refresh_required` — la
   * demande relit `transitionTo`, qui court-circuite en idempotence
   * (#2004.11, `state.status === to`) SANS jamais appeler `states.save` : la
   * ligne `state.skipped_at = null`, posée sur l'objet en mémoire juste
   * avant, ne part donc jamais en base. Un report posé APRÈS la première
   * demande (« Plus tard » depuis le questionnaire, #2579.2) restait donc
   * pour toujours, quel que soit le nombre de fois où « Reprendre la
   * reconfiguration » était recliqué.
   */
  it('#2572.2 — redemander une reconfiguration DÉJÀ posée efface aussi un report plus récent', async () => {
    const { service, states } = makeService({
      states: [
        {
          user_id: 'u1',
          status: 'refresh_required',
          current_stage_id: null,
          skipped_at: new Date('2026-09-17T11:02:54.377Z'),
        } as UserOnboardingStateEntity,
      ],
    })

    const value = assertSuccess(await service.requestRefresh('u1'))

    expect(value.status).toBe('refresh_required')
    expect(value.skipped_at).toBeNull()
    // Le repo simulé partage la RÉFÉRENCE de l'entité (`findOne` rend la ligne
    // elle-même, pas une copie) : muter `state.skipped_at` en mémoire suffit
    // à faire mentir une assertion sur la seule VALEUR relue, même quand rien
    // n'est jamais écrit en base. Un vrai dépôt TypeORM n'a pas cette
    // gentillesse — c'est `states.save` qui prouve qu'une écriture a
    // vraiment été demandée, pas la valeur relue sur l'objet muté à la main.
    expect(states.save).toHaveBeenCalled()
  })

  it('est idempotent : deux demandes de refresh identiques n’ont qu’un seul effet (#2004.11)', async () => {
    const { service, transitions } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    await service.complete('u1')

    await service.requestRefresh('u1')
    const before = (transitions.save as jest.Mock).mock.calls.length
    const second = assertSuccess(await service.requestRefresh('u1'))

    expect(second.status).toBe('refresh_required')
    expect((transitions.save as jest.Mock).mock.calls.length).toBe(before) // aucune ligne de journal de plus
  })

  it('chaque transition réelle est auditée : la première avance écrit une ligne de journal', async () => {
    const { service, transitionRows } = makeService({})
    assertSuccess(await service.advanceStage('u1', 'target_market'))

    expect(transitionRows).toHaveLength(1)
    expect(transitionRows[0]).toMatchObject({
      user_id: 'u1',
      from_status: 'not_started',
      to_status: 'in_progress',
      reason: 'advance_stage',
    })
  })
})

/**
 * #2537.3 — « aucune étape ne bloque une fois la réponse enregistrée ; une
 * reprise est IDEMPOTENTE. » Mesuré avant ce lot : zéro test sur le REJEU —
 * pourtant `saveAnswers` (upsert) et `transitionTo` (`if (state.status ===
 * to) return success(state)`, #2004.11) sont déjà construits pour l'être.
 * Seule `requestRefresh` avait son témoin (ci-dessus) ; celui-ci couvre les
 * deux chemins qu'un rejeu emprunte RÉELLEMENT depuis le questionnaire
 * (`useOnboardingNavigation.onContinue` : `saveAnswers` puis, à la frontière
 * d'étape, `advanceStage`) — le rejeu manuel que la doctrine autorise après un
 * échec `unknown` (CLAUDE.md : « on ne rejoue pas tout seul »).
 */
describe('OnboardingService — #2537.3 : rejouer un enregistrement ne double rien, ne bloque rien', () => {
  it('saveAnswers rejoué avec les MÊMES réponses ne bloque pas et ne les altère pas', async () => {
    const { service, esn } = makeService({})
    await service.saveAnswers('u1', { esn_name: 'Acme', expertise_areas: ['Data & IA'] })
    const writesBefore = (esn.save as jest.Mock).mock.calls.length

    // Le rejeu — un « Continuer » recliqué après un échec ambigu.
    const second = assertSuccess(await service.saveAnswers('u1', { esn_name: 'Acme', expertise_areas: ['Data & IA'] }))

    expect(second.answers.esn_name).toBe('Acme')
    expect(second.answers.expertise_areas).toEqual(['Data & IA'])
    // Le rejeu écrit — `esn_profiles` reste un UPSERT, pas une garde anti-rejeu
    // dédiée — mais n'AJOUTE aucune ligne : `keyOf` (`r => r.user_id`) fait du
    // second appel une MISE À JOUR de la même ligne, jamais une seconde.
    expect((esn.save as jest.Mock).mock.calls.length).toBeGreaterThan(writesBefore)
    const rows = await esn.find({})
    expect(rows.filter((r: { user_id: string }) => r.user_id === 'u1')).toHaveLength(1)
  })

  it('advanceStage rejoué avec le MÊME code d’étape n’écrit PAS une seconde ligne de transition', async () => {
    const { service, transitionRows } = makeService({})
    assertSuccess(await service.advanceStage('u1', 'target_market'))
    expect(transitionRows).toHaveLength(1)

    // Rejeu — même charge, même code d'étape : `isFirstMove` n'est plus vrai
    // une fois `in_progress` posé, donc la transition ne se rejoue pas.
    const second = assertSuccess(await service.advanceStage('u1', 'target_market'))

    expect(second.status).toBe('in_progress')
    expect(second.current_stage_code).toBe('target_market')
    expect(transitionRows).toHaveLength(1) // toujours UNE seule ligne de journal
  })

  it('un rejeu ne bloque jamais : la seconde tentative réussit comme la première (aucun état « coincé »)', async () => {
    const { service } = makeService({})
    const first = await service.saveAnswers('u1', { esn_name: 'Acme' })
    const second = await service.saveAnswers('u1', { esn_name: 'Acme' })

    expect(isFailure(first)).toBe(false)
    expect(isFailure(second)).toBe(false)
  })
})

/**
 * #2004.19 — un import long rend la reprise AU BON ENDROIT.
 *
 * Le lien n'existait dans AUCUN sens (mesuré 17/09 : `acceptInvitation` était
 * le seul appelant absent qu'on avait, ici c'est `ImportController.create` qui
 * n'écrivait rien que l'onboarding lise). Posé côté API, jamais deviné côté
 * écran : `getState` LIT `import_sessions` (entité partagée, LECTURE seule —
 * `ImportSessionEntity` au registre du module, pas un import de service, donc
 * hors du cliquet GA-07) et rend l'id de la session la plus RÉCENTE dont
 * l'assistant n'a pas fini son travail. `applied`/`rolled_back` sont
 * terminaux : une session refermée ne doit jamais faire dévier une reprise.
 */
describe('OnboardingService — #2004.19 : la session d’import lie la reprise', () => {
  function importSession(over: Partial<ImportSessionEntity> = {}): ImportSessionEntity {
    return {
      id: 'sess-1',
      workspace_id: 'w1',
      created_by: 'u1',
      source: 'hubspot_export',
      object_type: 'contact',
      state: 'draft',
      created_at: new Date('2026-09-17T10:00:00Z'),
      ...over,
    } as ImportSessionEntity
  }

  it("rend `null` quand cet utilisateur n'a aucune session d'import", async () => {
    const { service } = makeService({ importSessions: [] })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.active_import_session_id).toBeNull()
  })

  it('rend la session `draft` — l’assistant n’a même pas encore simulé', async () => {
    const { service } = makeService({ importSessions: [importSession({ id: 'sess-1', state: 'draft' })] })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.active_import_session_id).toBe('sess-1')
  })

  it('rend `null` pour une session déjà `applied` — terminale, rien à reprendre', async () => {
    const { service } = makeService({ importSessions: [importSession({ id: 'sess-1', state: 'applied' })] })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.active_import_session_id).toBeNull()
  })

  it('rend `null` pour une session déjà `rolled_back` — terminale elle aussi', async () => {
    const { service } = makeService({ importSessions: [importSession({ id: 'sess-1', state: 'rolled_back' })] })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.active_import_session_id).toBeNull()
  })

  it('ignore la session d’un AUTRE utilisateur — personnel, comme les huit jalons d’activation', async () => {
    const { service } = makeService({ importSessions: [importSession({ id: 'sess-1', created_by: 'someone-else' })] })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.active_import_session_id).toBeNull()
  })

  it('rend la PLUS RÉCENTE session non terminale — jamais la première trouvée', async () => {
    const { service } = makeService({
      importSessions: [
        importSession({ id: 'sess-old', state: 'draft', created_at: new Date('2026-09-15T10:00:00Z') }),
        importSession({ id: 'sess-new', state: 'simulated', created_at: new Date('2026-09-17T10:00:00Z') }),
      ],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.active_import_session_id).toBe('sess-new')
  })
})

/**
 * #2014.3 / #2014.7 — l'accueil de l'invité (ou du transféré — même
 * événement, décision Louis 17/09) nomme l'espace REJOINT et qui a invité,
 * SI CONNU. `acceptInvitation` n'écrivait rien que l'onboarding lise : la
 * seule trace durable est l'invitation elle-même, `accepted`, dont l'email
 * correspond à CETTE personne (`profiles.email`, normalisé comme au moment
 * de l'acceptation — `workspace-team.service.ts:230/318`).
 */
describe('OnboardingService — #2014.3 / #2014.7 : l’espace rejoint, et qui a invité', () => {
  function profile(over: Partial<ProfileEntity> = {}): ProfileEntity {
    return { user_id: 'u1', email: 'theo@acme.fr', first_name: null, last_name: null, ...over } as ProfileEntity
  }
  function invitation(over: Partial<WorkspaceInvitationEntity> = {}): WorkspaceInvitationEntity {
    return {
      id: 'inv-1',
      workspace_id: 'w1',
      email: 'theo@acme.fr',
      invited_by: 'inviter-1',
      status: 'accepted',
      accepted_at: new Date('2026-09-17T09:00:00Z'),
      ...over,
    } as WorkspaceInvitationEntity
  }
  function workspace(over: Partial<WorkspaceEntity> = {}): WorkspaceEntity {
    return { id: 'w1', name: 'Acme Consulting', ...over } as WorkspaceEntity
  }

  it("rend `null` sans aucune invitation acceptée pour l'email de cet utilisateur", async () => {
    const { service } = makeService({ personalProfiles: [profile()] })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.joined_workspace).toBeNull()
  })

  it('nomme l’espace ET l’inviteur quand les deux se retrouvent', async () => {
    const { service } = makeService({
      personalProfiles: [profile(), profile({ user_id: 'inviter-1', first_name: 'Léa', last_name: 'Dupont' })],
      workspaceInvitations: [invitation()],
      workspaces: [workspace()],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.joined_workspace).toEqual({ workspace_name: 'Acme Consulting', invited_by_name: 'Léa Dupont' })
  })

  it("nomme l’espace SEUL quand l'inviteur n'a pas de fiche — « si connu » n'invente rien", async () => {
    const { service } = makeService({
      personalProfiles: [profile()],
      workspaceInvitations: [invitation()],
      workspaces: [workspace()],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.joined_workspace).toEqual({ workspace_name: 'Acme Consulting', invited_by_name: null })
  })

  it('ignore une invitation encore `pending` — rien n’est rejoint tant que rien n’est accepté', async () => {
    const { service } = makeService({
      personalProfiles: [profile()],
      workspaceInvitations: [invitation({ status: 'pending', accepted_at: null })],
      workspaces: [workspace()],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.joined_workspace).toBeNull()
  })

  it('rend la PLUS RÉCENTE invitation acceptée — un compte a pu rejoindre plusieurs espaces', async () => {
    const { service } = makeService({
      personalProfiles: [profile()],
      workspaceInvitations: [
        invitation({ id: 'inv-old', workspace_id: 'w-old', accepted_at: new Date('2026-08-01T09:00:00Z') }),
        invitation({ id: 'inv-new', workspace_id: 'w-new', accepted_at: new Date('2026-09-17T09:00:00Z') }),
      ],
      workspaces: [
        workspace({ id: 'w-old', name: 'Ancien Espace' }),
        workspace({ id: 'w-new', name: 'Nouvel Espace' }),
      ],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.joined_workspace?.workspace_name).toBe('Nouvel Espace')
  })
})

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 : `getState` expose `first_completed_at`,
 * second lecteur de `firstOnboardingCompletionAt` (déjà calculée pour la
 * bannière de refonte #2897, `onboarding-redesign-banner.spec.ts`) — la
 * transition `to_status: 'completed'` la plus ANCIENNE du journal. C'est le
 * signal qui distingue, côté web (`needsOnboarding`), un utilisateur déjà
 * onboardé qui redemande une reconfiguration (bandeau) d'un utilisateur qui
 * n'a jamais terminé le questionnaire (toujours redirigé).
 */
describe('OnboardingService — #2021 : `first_completed_at` (second lecteur de firstOnboardingCompletionAt)', () => {
  it('`null` pour un compte qui n’a jamais terminé l’onboarding', async () => {
    const { service } = makeService({})
    const value = assertSuccess(await service.getState('u1'))
    expect(value.first_completed_at).toBeNull()
  })

  it('porte la date de la PREMIÈRE complétion, même après une reconfiguration et une seconde complétion', async () => {
    const { service } = makeService({})
    await service.saveAnswers('u1', FULL_ANSWERS)
    const first = assertSuccess(await service.complete('u1')) // in_progress → completed
    assertSuccess(await service.requestRefresh('u1')) // completed → refresh_required
    const second = assertSuccess(await service.complete('u1')) // refresh_required → completed

    expect(first.first_completed_at).not.toBeNull()
    // La seconde complétion ne déplace PAS la date : c'est la première qui dit
    // si ce compte a connu le parcours d'alors, même règle que la bannière
    // de refonte (#2897) qui lit la même dérivation.
    expect(second.first_completed_at).toBe(first.first_completed_at)
  })
})

/**
 * #4158.12 — un membre arrivé AVANT que l'administrateur décrive l'ESN
 * n'écrit que ses réponses personnelles, voit un bandeau qui nomme cet
 * administrateur, et termine son onboarding sur ses seules questions perso.
 */
describe('OnboardingService — #4158.12 : le membre attend la description de l’ESN', () => {
  const owner = { user_id: 'owner-1', first_name: 'Marie', last_name: 'Curie', email: 'marie@acme.fr' }
  const member = { user_id: 'u1', first_name: null, last_name: null, email: 'theo@acme.fr' }
  const ws = { id: 'w1', name: 'Acme', owner_user_id: 'owner-1' }
  const asMember = { workspace_id: 'w1', user_id: 'u1', role: 'member' as const }
  const canonical = {
    id: 'row-owner',
    user_id: 'owner-1',
    version: 1,
    is_current: true,
    workspace_id: 'w1',
    is_workspace_canonical: true,
    ...FULL_ANSWERS,
  } as unknown as EsnProfileEntity

  it('nomme l’administrateur (prénom + nom) tant que l’espace n’a pas de fiche canonique', async () => {
    const { service } = makeService({
      personalProfiles: [owner, member],
      workspaces: [ws],
      members: [asMember],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.awaiting_company_admin).toEqual({ admin_name: 'Marie Curie' })
  })

  it('ne nomme personne quand l’administrateur n’a pas de nom — « si connu » n’invente rien', async () => {
    const { service } = makeService({
      personalProfiles: [{ ...owner, first_name: null, last_name: null }, member],
      workspaces: [ws],
      members: [asMember],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.awaiting_company_admin).toEqual({ admin_name: null })
  })

  it('rend `null` dès que la fiche canonique existe — le membre en hérite', async () => {
    const { service } = makeService({
      personalProfiles: [owner, member],
      workspaces: [ws],
      members: [asMember],
      esn: [canonical],
    })
    const value = assertSuccess(await service.getState('u1'))
    expect(value.awaiting_company_admin).toBeNull()
    expect(value.inherited_answer_keys).toContain('esn_name')
  })

  it('rend `null` pour l’administrateur lui-même et pour qui est seul dans son espace', async () => {
    const admin = makeService({
      personalProfiles: [owner, member],
      workspaces: [ws],
      members: [{ workspace_id: 'w1', user_id: 'u1', role: 'admin' }],
    })
    expect(assertSuccess(await admin.service.getState('u1')).awaiting_company_admin).toBeNull()
    const solo = makeService({ personalProfiles: [member] })
    expect(assertSuccess(await solo.service.getState('u1')).awaiting_company_admin).toBeNull()
  })

  it('un membre termine son onboarding sur ses seules réponses personnelles, sans lancer de génération', async () => {
    const { service, esn } = makeService({
      personalProfiles: [owner, member],
      workspaces: [ws],
      members: [asMember],
    })
    ;(noopProfileContext.triggerGeneration as jest.Mock).mockClear()
    await service.saveAnswers('u1', { main_sales_pain: 'Trouver les bons comptes à cibler' })
    const done = await service.complete('u1')
    expect(isFailure(done)).toBe(false)
    expect(assertSuccess(done).status).toBe('completed')
    // Rien d'entreprise n'a été écrit, et rien n'est généré à partir d'un vide.
    expect(esn.save).toHaveBeenCalledTimes(1)
    expect(noopProfileContext.triggerGeneration).not.toHaveBeenCalled()
  })

  it('hors attente, la complétion exige toujours TOUTES les clés requises', async () => {
    const { service } = makeService({ personalProfiles: [member] })
    await service.saveAnswers('u1', { main_sales_pain: 'Trouver les bons comptes à cibler' })
    const done = await service.complete('u1')
    expect(isFailure(done)).toBe(true)
  })
})
