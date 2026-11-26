import { assertSuccess, isFailure } from '@bellum/utils'
import { FindOperator, type Repository } from 'typeorm'
import type { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import type { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import type { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import type { ProductEventEntity } from '../../database/entities/product-event.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import type { WorkspaceTeamService } from '../workspace/workspace-team.service'
import { ActivationService } from './activation.service'

/** Matches a TypeORM `where` clause against a plain row, including `In(...)`. */
function rowMatches<T extends object>(row: T, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const cell = (row as Record<string, unknown>)[key]
    if (expected instanceof FindOperator) {
      if (expected.type === 'in') return (expected.value as unknown[]).includes(cell)
      return cell === expected.value
    }
    return cell === expected
  })
}

/** Minimal in-memory TypeORM repo: `findOne` + `count` over seeded rows. */
function makeRepo<T extends object>(rows: T[]) {
  return {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.find(r => rowMatches(r, where)) ?? null,
    ),
    count: jest.fn(async (opts?: { where?: Record<string, unknown> }) =>
      opts?.where ? rows.filter(r => rowMatches(r, opts.where as Record<string, unknown>)).length : rows.length,
    ),
  } as unknown as Repository<T> & { count: jest.Mock }
}

/** #2077.3 — a `profiles` row whose commercial context has been VALIDATED (D9). */
function validatedProfileRow(userId: string): Partial<ProfileEntity> {
  return { user_id: userId, profile_context_status: 'validated' }
}

type Seed = {
  profile?: Partial<ProfileEntity>[]
  runs?: Partial<AnalysisRunEntity>[]
  events?: Partial<ProductEventEntity>[]
  actions?: Partial<UserActionEntity>[]
  google?: Partial<GoogleConnectionEntity>[]
  microsoft?: Partial<MicrosoftConnectionEntity>[]
  crm?: Partial<CrmConnectionEntity>[]
  feedback?: Partial<AccountFeedbackEntity>[]
  invitations?: Partial<WorkspaceInvitationEntity>[]
  /** #2077.9 — stands in for `WorkspaceTeamService.canInviteColleague`, kept
   *  OUT of this spec's scope (it has its own spec). Defaults to `false` —
   *  fail-closed, like the real method's `catch`. */
  canInvite?: boolean
}

function makeService(seed: Seed) {
  const profile = makeRepo<ProfileEntity>((seed.profile ?? []) as ProfileEntity[])
  const runs = makeRepo<AnalysisRunEntity>((seed.runs ?? []) as AnalysisRunEntity[])
  const events = makeRepo<ProductEventEntity>((seed.events ?? []) as ProductEventEntity[])
  const actions = makeRepo<UserActionEntity>((seed.actions ?? []) as UserActionEntity[])
  const google = makeRepo<GoogleConnectionEntity>((seed.google ?? []) as GoogleConnectionEntity[])
  const microsoft = makeRepo<MicrosoftConnectionEntity>((seed.microsoft ?? []) as MicrosoftConnectionEntity[])
  const crm = makeRepo<CrmConnectionEntity>((seed.crm ?? []) as CrmConnectionEntity[])
  const feedback = makeRepo<AccountFeedbackEntity>((seed.feedback ?? []) as AccountFeedbackEntity[])
  const invitations = makeRepo<WorkspaceInvitationEntity>((seed.invitations ?? []) as WorkspaceInvitationEntity[])
  const workspaceTeam = {
    canInviteColleague: jest.fn(async () => seed.canInvite ?? false),
  } as unknown as WorkspaceTeamService

  return new ActivationService(
    profile,
    runs,
    events,
    actions,
    google,
    microsoft,
    crm,
    feedback,
    invitations,
    workspaceTeam,
  )
}

describe('ActivationService', () => {
  it('returns all-false for a brand-new user (0/8, nothing fabricated)', async () => {
    const service = makeService({})
    const value = assertSuccess(await service.getActivation('u1'))

    expect(value).toEqual({
      profile_completed: false,
      analysis_launched: false,
      dossier_viewed: false,
      contact_enriched: false,
      message_prepared: false,
      tool_connected: false,
      correction_made: false,
      colleague_invited: 'not_applicable',
      completed_count: 0,
      is_complete: false,
    })
  })

  // #2077.6 — « première correction ». Le fait EXISTE déjà en base
  // (`account_feedback`, append-only) ; personne ne le lisait pour l'activation.
  it('#2077.6 — dérive correction_made d’un retour structuré sur un dossier', async () => {
    const service = makeService({ feedback: [{ user_id: 'u1', verdict: 'faux' }] })
    const value = assertSuccess(await service.getActivation('u1'))
    expect(value.correction_made).toBe(true)
    expect(value.completed_count).toBe(1)
  })

  it('#2077.6 — SAIT DIRE NON : sans aucun retour, le jalon reste faux', async () => {
    const service = makeService({})
    expect(assertSuccess(await service.getActivation('u1')).correction_made).toBe(false)
  })

  it('#2077.6 — personnel : la correction d’un coéquipier ne m’active pas', async () => {
    const service = makeService({ feedback: [{ user_id: 'u2', verdict: 'faux' }] })
    expect(assertSuccess(await service.getActivation('u1')).correction_made).toBe(false)
  })

  // #1810 — le 6e jalon : personne n'était explicitement invité à connecter un
  // outil. Chacune des trois sources compte, seule, et AUCUNE des trois n'est
  // exigée en plus des autres — « au moins un », pas « tous ».
  it('derives tool_connected from a google_connections row alone', async () => {
    const service = makeService({ google: [{ user_id: 'u1', provider: 'google' }] })
    const value = assertSuccess(await service.getActivation('u1'))
    expect(value.tool_connected).toBe(true)
    expect(value.completed_count).toBe(1)
  })

  it('derives tool_connected from a microsoft_connections row alone', async () => {
    const service = makeService({ microsoft: [{ user_id: 'u1' }] })
    expect(assertSuccess(await service.getActivation('u1')).tool_connected).toBe(true)
  })

  it('derives tool_connected from a crm_connections row alone', async () => {
    const service = makeService({ crm: [{ user_id: 'u1' }] })
    expect(assertSuccess(await service.getActivation('u1')).tool_connected).toBe(true)
  })

  it('does not require every provider — one is enough, and none stays false', async () => {
    const none = makeService({})
    expect(assertSuccess(await none.getActivation('u1')).tool_connected).toBe(false)
  })

  it('scopes tool_connected to the requesting user — a teammate’s connection never counts', async () => {
    const service = makeService({ google: [{ user_id: 'u2', provider: 'google' }] })
    expect(assertSuccess(await service.getActivation('u1')).tool_connected).toBe(false)
  })

  // #2077.3 — décision Louis 15/09 : le jalon coche la VALIDATION (D9,
  // `profile_context_status === 'validated'`), pas la complétion du
  // questionnaire Temps-1. Un profil rempli n'est pas un profil validé.
  it('#2077.3 — flags profile_completed only when the commercial profile is VALIDATED', async () => {
    const notValidated = makeService({ profile: [{ user_id: 'u1', profile_context_status: 'succeeded' }] })
    expect(assertSuccess(await notValidated.getActivation('u1')).profile_completed).toBe(false)

    const validated = makeService({ profile: [validatedProfileRow('u1')] })
    const value = assertSuccess(await validated.getActivation('u1'))
    expect(value.profile_completed).toBe(true)
    expect(value.completed_count).toBe(1)
  })

  // LUDB.1 — un profil REMPLI (contexte généré, statut `succeeded`) coche l'étape
  // sans geste : l'état se recalcule à la lecture pour les espaces bloqués à 3/8.
  it('LUDB.1 — flags profile_completed for a filled profile context never explicitly validated', async () => {
    const filled = makeService({
      profile: [{ user_id: 'u1', profile_context_status: 'succeeded', profile_context: { sections: {} } as never }],
    })
    expect(assertSuccess(await filled.getActivation('u1')).profile_completed).toBe(true)

    const generating = makeService({
      profile: [{ user_id: 'u1', profile_context_status: 'generating', profile_context: null }],
    })
    expect(assertSuccess(await generating.getActivation('u1')).profile_completed).toBe(false)
  })

  it('#2077.3 — scopes profile_completed to the requesting user', async () => {
    const service = makeService({ profile: [validatedProfileRow('u2')] })
    expect(assertSuccess(await service.getActivation('u1')).profile_completed).toBe(false)
  })

  it('derives analysis_launched from analysis_runs (any status)', async () => {
    const service = makeService({ runs: [{ user_id: 'u1', status: 'analyzing' }] })
    const value = assertSuccess(await service.getActivation('u1'))

    expect(value.analysis_launched).toBe(true)
    expect(value.completed_count).toBe(1)
  })

  it('derives dossier_viewed from the account_viewed product event', async () => {
    const service = makeService({ events: [{ user_id: 'u1', event_name: 'account_viewed' }] })
    expect(assertSuccess(await service.getActivation('u1')).dossier_viewed).toBe(true)
  })

  it('derives contact_enriched from contact_enriched events OR plan enrichment requests', async () => {
    const viaEvent = makeService({ events: [{ user_id: 'u1', event_name: 'contact_enriched' }] })
    expect(assertSuccess(await viaEvent.getActivation('u1')).contact_enriched).toBe(true)

    const viaAction = makeService({ actions: [{ user_id: 'u1', action_type: 'plan_action_enrichment_requested' }] })
    expect(assertSuccess(await viaAction.getActivation('u1')).contact_enriched).toBe(true)
  })

  it('derives message_prepared from copied OR sent message actions', async () => {
    for (const action_type of [
      'message_copied',
      'message_sent',
      'plan_action_message_copied',
      'plan_action_message_sent',
    ]) {
      const service = makeService({ actions: [{ user_id: 'u1', action_type }] })
      expect(assertSuccess(await service.getActivation('u1')).message_prepared).toBe(true)
    }
    const other = makeService({ actions: [{ user_id: 'u1', action_type: 'rdv_obtained' }] })
    expect(assertSuccess(await other.getActivation('u1')).message_prepared).toBe(false)
  })

  // #2077.9 — un jalon tri-état : `done` (a déjà invité), `pending` (peut
  // inviter mais ne l'a pas fait), `not_applicable` (ne PEUT pas inviter —
  // pas de `team:manage`, ou plus de siège). Jamais un booléen figé à faux.
  it('#2077.9 — colleague_invited est `done` dès que CET utilisateur a créé une invitation', async () => {
    const service = makeService({ invitations: [{ invited_by: 'u1', email: 'x@acme.test' }] })
    const value = assertSuccess(await service.getActivation('u1'))
    expect(value.colleague_invited).toBe('done')
    expect(value.completed_count).toBe(1)
  })

  it('#2077.9 — une invitation d’un coéquipier ne compte pas pour moi', async () => {
    const service = makeService({ invitations: [{ invited_by: 'u2', email: 'x@acme.test' }] })
    expect(assertSuccess(await service.getActivation('u1')).colleague_invited).not.toBe('done')
  })

  it('#2077.9 — sans invitation, `pending` quand l’utilisateur PEUT encore inviter', async () => {
    const service = makeService({ canInvite: true })
    expect(assertSuccess(await service.getActivation('u1')).colleague_invited).toBe('pending')
  })

  it('#2077.9 — SAIT DIRE NON : `not_applicable` quand l’utilisateur ne peut pas inviter (rôle ou sièges)', async () => {
    const service = makeService({ canInvite: false })
    expect(assertSuccess(await service.getActivation('u1')).colleague_invited).toBe('not_applicable')
  })

  // #2077.9 — le cœur de la décision : `not_applicable` sort du DÉNOMINATEUR,
  // exactement comme un axe non évaluable sort d'un score (doctrine).
  it('#2077.9 — not_applicable ne bloque JAMAIS is_complete', async () => {
    const service = makeService({
      profile: [validatedProfileRow('u1')],
      runs: [{ user_id: 'u1', status: 'completed' }],
      events: [
        { user_id: 'u1', event_name: 'account_viewed' },
        { user_id: 'u1', event_name: 'contact_enriched' },
      ],
      actions: [{ user_id: 'u1', action_type: 'message_copied' }],
      crm: [{ user_id: 'u1' }],
      feedback: [{ user_id: 'u1', verdict: 'faux' }],
      canInvite: false,
    })
    const value = assertSuccess(await service.getActivation('u1'))
    expect(value.colleague_invited).toBe('not_applicable')
    expect(value.completed_count).toBe(7)
    expect(value.is_complete).toBe(true)
  })

  it('is strictly scoped to the requesting user (a teammate’s data never counts)', async () => {
    const service = makeService({
      profile: [validatedProfileRow('u2')],
      runs: [{ user_id: 'u2', status: 'completed' }],
      events: [
        { user_id: 'u2', event_name: 'account_viewed' },
        { user_id: 'u2', event_name: 'contact_enriched' },
      ],
      actions: [{ user_id: 'u2', action_type: 'message_sent' }],
      google: [{ user_id: 'u2', provider: 'google' }],
    })
    const value = assertSuccess(await service.getActivation('u1'))

    expect(value.completed_count).toBe(0)
    expect(value.is_complete).toBe(false)
  })

  it('reports is_complete once all 8 milestones are reached (or not_applicable)', async () => {
    const service = makeService({
      profile: [validatedProfileRow('u1')],
      runs: [{ user_id: 'u1', status: 'completed' }],
      events: [
        { user_id: 'u1', event_name: 'account_viewed' },
        { user_id: 'u1', event_name: 'contact_enriched' },
      ],
      actions: [{ user_id: 'u1', action_type: 'message_copied' }],
      crm: [{ user_id: 'u1' }],
      feedback: [{ user_id: 'u1', verdict: 'faux' }],
      invitations: [{ invited_by: 'u1', email: 'x@acme.test' }],
    })
    const value = assertSuccess(await service.getActivation('u1'))

    expect(value).toEqual({
      profile_completed: true,
      analysis_launched: true,
      dossier_viewed: true,
      contact_enriched: true,
      message_prepared: true,
      tool_connected: true,
      correction_made: true,
      colleague_invited: 'done',
      completed_count: 8,
      is_complete: true,
    })
  })

  // #2077.6 — conséquence assumée du 7e jalon : quelqu'un qui était « fini »
  // à 6/6 ne l'est plus. Ce n'est pas une régression, c'est la checklist qui
  // dit la vérité : il n'a jamais corrigé un dossier. Le geste de masquage
  // (#1794.2) reste, lui, sa porte de sortie.
  it('#2077.6 — un parcours complet AVANT le 7e jalon n’est plus is_complete', async () => {
    const service = makeService({
      profile: [validatedProfileRow('u1')],
      runs: [{ user_id: 'u1', status: 'completed' }],
      events: [
        { user_id: 'u1', event_name: 'account_viewed' },
        { user_id: 'u1', event_name: 'contact_enriched' },
      ],
      actions: [{ user_id: 'u1', action_type: 'message_copied' }],
      crm: [{ user_id: 'u1' }],
    })
    const value = assertSuccess(await service.getActivation('u1'))

    expect(value.completed_count).toBe(6)
    expect(value.is_complete).toBe(false)
  })

  it('maps a storage error to a persist_failed failure (no fake progress)', async () => {
    const service = makeService({})
    const failing = makeService({})
    const runs = (failing as unknown as { runs: { count: jest.Mock } }).runs
    runs.count.mockRejectedValueOnce(new Error('boom'))

    // Sanity: the healthy service still succeeds.
    expect(isFailure(await service.getActivation('u1'))).toBe(false)

    const result = await failing.getActivation('u1')
    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('persist_failed')
  })
})
