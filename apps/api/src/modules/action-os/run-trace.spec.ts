import type { AccountEntity } from '../../database/entities/account.entity'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { buildRunTraces, emptyTrace } from './run-trace'

/**
 * #1498 — « qui l'a déclenchée, qui l'a validée, depuis quel objet ».
 *
 * Ce qui se teste ici n'est pas l'affichage : c'est la règle sur ce qui reste
 * INCONNU. Une page de traçabilité qui invente un nom est pire qu'une page qui
 * n'en montre aucun — c'est celle qu'on rouvrira le jour où quelqu'un demandera
 * qui a autorisé quoi.
 */
const run = (over: Partial<WorkflowRunEntity> = {}): WorkflowRunEntity =>
  ({
    id: 'run-1',
    user_id: 'u-1',
    trigger: 'manual',
    account_id: null,
    ...over,
  }) as WorkflowRunEntity

const profile = (over: Partial<ProfileEntity> = {}): ProfileEntity =>
  ({
    user_id: 'u-1',
    first_name: 'Louis',
    last_name: 'Schlegel',
    email: 'louis@example.com',
    ...over,
  }) as ProfileEntity

const approval = (over: Partial<ApprovalRequestEntity> = {}): ApprovalRequestEntity =>
  ({
    run_id: 'run-1',
    state: 'approved',
    decided_by: 'u-2',
    decided_at: new Date('2026-09-04T08:08:00.000Z'),
    ...over,
  }) as ApprovalRequestEntity

const account = (over: Partial<AccountEntity> = {}): AccountEntity =>
  ({ id: 'a-1', company_name: 'Nordia', ...over }) as AccountEntity

describe('buildRunTraces — les cinq réponses, ou le silence', () => {
  it('nomme qui a déclenché, qui a validé, et depuis quel objet', () => {
    const traces = buildRunTraces({
      runs: [run({ account_id: 'a-1' })],
      approvals: [approval()],
      profiles: [profile(), profile({ user_id: 'u-2', first_name: 'Maëlle', last_name: 'Rey', email: 'm@x.com' })],
      accounts: [account()],
    })

    expect(traces.get('run-1')).toEqual({
      trigger: 'manual',
      triggeredByName: 'Louis Schlegel',
      approvedByName: 'Maëlle Rey',
      approvedAt: '2026-09-04T08:08:00.000Z',
      accountName: 'Nordia',
    })
  })

  /**
   * ⚠️ LA RÈGLE QUI COMPTE. Un profil effacé au titre du droit à l'oubli ne doit
   * pas produire « Utilisateur supprimé » ni, pire, le nom de quelqu'un d'autre.
   */
  it('laisse `null` ce qui n’est pas lisible — jamais un nom de remplissage', () => {
    const traces = buildRunTraces({ runs: [run({ account_id: 'a-1' })], approvals: [], profiles: [], accounts: [] })

    expect(traces.get('run-1')).toEqual({
      trigger: 'manual',
      triggeredByName: null,
      approvedByName: null,
      approvedAt: null,
      accountName: null,
    })
  })

  /**
   * « Pas d'approbation » ≠ « personne n'a validé ». Un pas auto-approuvé n'a
   * jamais demandé de décision : il n'y a rien à afficher, et surtout pas un
   * validateur inventé.
   */
  it('n’invente pas de validateur pour un run auto-approuvé', () => {
    const traces = buildRunTraces({ runs: [run()], approvals: [], profiles: [profile()], accounts: [] })

    expect(traces.get('run-1')?.triggeredByName).toBe('Louis Schlegel')
    expect(traces.get('run-1')?.approvedByName).toBeNull()
    expect(traces.get('run-1')?.approvedAt).toBeNull()
  })

  it('retient la décision la plus RÉCENTE quand un run a été rejeté puis approuvé', () => {
    const traces = buildRunTraces({
      runs: [run()],
      // L'appelant trie `decided_at DESC` : la première est la plus récente.
      approvals: [
        approval({ state: 'approved', decided_by: 'u-2', decided_at: new Date('2026-09-04T10:00:00.000Z') }),
        approval({ state: 'rejected', decided_by: 'u-3', decided_at: new Date('2026-09-04T08:00:00.000Z') }),
      ],
      profiles: [profile({ user_id: 'u-2', first_name: 'Maëlle', last_name: null, email: null })],
      accounts: [],
    })

    expect(traces.get('run-1')?.approvedByName).toBe('Maëlle')
    expect(traces.get('run-1')?.approvedAt).toBe('2026-09-04T10:00:00.000Z')
  })

  it('replie sur la partie locale de l’e-mail quand le profil n’a pas de nom', () => {
    const traces = buildRunTraces({
      runs: [run()],
      approvals: [],
      profiles: [profile({ first_name: null, last_name: null, email: 'jean.dupont@acme.fr' })],
      accounts: [],
    })

    expect(traces.get('run-1')?.triggeredByName).toBe('jean.dupont')
  })

  it('ne mélange pas deux runs — chacun porte SA décision', () => {
    const traces = buildRunTraces({
      runs: [run({ id: 'run-1' }), run({ id: 'run-2', user_id: 'u-9' })],
      approvals: [approval({ run_id: 'run-1' })],
      profiles: [profile(), profile({ user_id: 'u-2', first_name: 'Maëlle', last_name: 'Rey', email: null })],
      accounts: [],
    })

    expect(traces.get('run-1')?.approvedByName).toBe('Maëlle Rey')
    expect(traces.get('run-2')?.approvedByName).toBeNull()
    expect(traces.get('run-2')?.triggeredByName).toBeNull()
  })
})

describe('emptyTrace — le déclencheur reste VRAI', () => {
  it('garde le déclencheur du run, et n’affirme rien d’autre', () => {
    expect(emptyTrace('schedule')).toEqual({
      trigger: 'schedule',
      triggeredByName: null,
      approvedByName: null,
      approvedAt: null,
      accountName: null,
    })
  })
})
