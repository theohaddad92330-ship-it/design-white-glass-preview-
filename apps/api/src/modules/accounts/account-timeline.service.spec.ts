import { NotFoundException } from '@nestjs/common'
import type { ActivityEntity } from '../../database/entities/activity.entity'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { createMockRepository } from '../../database/test-utils'
import { AccountTimelineService } from './account-timeline.service'

/**
 * La timeline unifiée d'un compte (addendum final p59-60).
 *
 * Elle ne produit aucune donnée : elle fusionne trois tables déjà écrites
 * ailleurs. Ce qui se teste, ce sont les trois promesses qu'elle fait — un ordre
 * chronologique fiable, une dégradation partielle plutôt qu'une page d'erreur, et
 * aucune date inventée.
 */

const WORKSPACE = 'ws-1'
const ACCOUNT = 'acc-1'

function build() {
  const accounts = createMockRepository<AccountEntity>()
  const userActions = createMockRepository<UserActionEntity>()
  const opportunities = createMockRepository<ProjectEntity>()
  const runs = createMockRepository<WorkflowRunEntity>()
  const activities = createMockRepository<ActivityEntity>()
  accounts.findOne.mockResolvedValue({ id: ACCOUNT })
  userActions.find.mockResolvedValue([])
  opportunities.find.mockResolvedValue([])
  runs.find.mockResolvedValue([])
  activities.find.mockResolvedValue([])
  const service = new AccountTimelineService(
    accounts as never,
    userActions as never,
    opportunities as never,
    runs as never,
    activities as never,
  )
  return { service, accounts, userActions, opportunities, runs, activities }
}

describe('timeline unifiée', () => {
  it('refuse un compte hors du périmètre de l’appelant', async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValueOnce(null)
    await expect(service.forAccount(ACCOUNT, WORKSPACE)).rejects.toThrow(NotFoundException)
  })

  it('fusionne les trois sources dans UN ordre chronologique', async () => {
    // C'est la seule chose que la vue promet, et c'est ce qui la rend utilisable
    // avant un rendez-vous : reconstituer l'ordre de tête, entre trois écrans,
    // est précisément ce qu'on faisait avant.
    const { service, userActions, opportunities, runs } = build()
    userActions.find.mockResolvedValue([
      {
        id: 'a1',
        created_at: new Date('2026-07-10T10:00:00Z'),
        action_type: 'message_sent',
        metadata: { label: 'Email envoyé' },
        contact_id: 'c1',
      },
    ])
    opportunities.find.mockResolvedValue([
      {
        id: 'o1',
        first_detected_at: new Date('2026-07-20T10:00:00Z'),
        label: 'Besoin MLOps',
        detail: null,
        stage: 'confirmed',
      },
    ])
    runs.find.mockResolvedValue([
      {
        id: 'r1',
        created_at: new Date('2026-07-01T10:00:00Z'),
        finished_at: new Date('2026-07-15T10:00:00Z'),
        definition_key: 'crm_hygiene',
        status: 'done',
        steps: [{ outcome: 'done' }],
        contact_id: null,
      },
    ])

    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events.map(event => event.id)).toEqual(['opportunity:o1', 'workflow:r1', 'action:a1'])
  })

  it('#3532 — une exécution sans étape ne porte AUCUN compteur ; avec des étapes, le compte est structuré', async () => {
    // Recette 01/10 : « 0/0 étape(s) réussie(s) » — une absence ne s'affiche jamais « 0 ».
    const { service, runs } = build()
    const base = {
      created_at: new Date('2026-07-01T10:00:00Z'),
      finished_at: new Date('2026-07-15T10:00:00Z'),
      status: 'done',
      contact_id: null,
    }
    runs.find.mockResolvedValue([
      { ...base, id: 'r0', definition_key: 'card_prepare_message', steps: [] },
      { ...base, id: 'r1', definition_key: 'crm_hygiene', steps: [{ outcome: 'done' }, { outcome: 'failed' }] },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    const empty = events.find(event => event.id === 'workflow:r0')
    const full = events.find(event => event.id === 'workflow:r1')
    expect(empty?.detail).toBeNull()
    expect(empty?.steps ?? null).toBeNull()
    expect(full?.steps).toEqual({ done: 1, total: 2 })
    expect(full?.detail).toBeNull()
    expect(full?.label).toBe('crm_hygiene')
  })

  it('date une opportunité à sa PREMIÈRE détection, pas à sa dernière touche', async () => {
    // Sinon une opportunité re-touchée hier remonterait en tête et ferait croire
    // à un fait nouveau. La timeline raconte quand les choses sont ARRIVÉES.
    const { service, opportunities } = build()
    opportunities.find.mockResolvedValue([
      {
        id: 'o1',
        first_detected_at: new Date('2026-05-01T10:00:00Z'),
        updated_at: new Date('2026-07-30T10:00:00Z'),
        label: 'Besoin',
        detail: null,
        stage: 'detected',
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events[0].at).toBe('2026-05-01T10:00:00.000Z')
  })

  it('porte l’ÉTAPE du projet, lisible telle quelle dans le fil', async () => {
    const { service, opportunities } = build()
    opportunities.find.mockResolvedValue([
      {
        id: 'o1',
        first_detected_at: new Date('2026-05-01T10:00:00Z'),
        label: 'x',
        detail: null,
        stage: 'confirmed',
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events[0].type).toBe('confirmed')
  })

  // #3416.4b — le libellé anglais stocké par le journal voyage jusqu'à l'écran.
  it('#3416.4b — porte label_en du journal en `labelEn`, et rien quand il est absent', async () => {
    const { service, userActions } = build()
    userActions.find.mockResolvedValue([
      {
        id: 'a1',
        created_at: new Date('2026-07-10T10:00:00Z'),
        action_type: 'plan_action_completed',
        metadata: { label: 'Action faite — Bloqué par les achats', label_en: 'Action done — Blocked by procurement' },
      },
      {
        id: 'a2',
        created_at: new Date('2026-07-09T10:00:00Z'),
        action_type: 'message_sent',
        metadata: { label: 'Email envoyé' },
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events[0].labelEn).toBe('Action done — Blocked by procurement')
    expect(events[1]).not.toHaveProperty('labelEn')
  })

  // #3938.1 — SKAIZen (22/09) : « marqué comme envoyé ne suffit pas, il faut
  // voir ce qu'on a envoyé ». `recordEmailSent` stocke déjà `metadata.subject`
  // (#3699.5) — jamais le CORPS, qui reste hors de ce journal — mais la
  // timeline ne lisait que `metadata.detail`, toujours absent pour ce type :
  // le sujet existait au journal et n'atteignait jamais l'écran.
  it('#3938.1 — porte le SUJET d’un e-mail envoyé comme détail, quand le journal n’a pas de `detail` explicite', async () => {
    const { service, userActions } = build()
    userActions.find.mockResolvedValue([
      {
        id: 'a1',
        created_at: new Date('2026-07-10T10:00:00Z'),
        action_type: 'message_sent',
        metadata: { label: 'Email envoyé', subject: 'Relance budget Q4', via: 'bellum' },
        contact_id: 'c1',
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events[0].detail).toBe('Relance budget Q4')
  })

  it('#3938.1 — un `detail` explicite du journal reste prioritaire sur `subject`', async () => {
    const { service, userActions } = build()
    userActions.find.mockResolvedValue([
      {
        id: 'a1',
        created_at: new Date('2026-07-10T10:00:00Z'),
        action_type: 'message_sent',
        metadata: { label: 'Email envoyé', detail: 'Déjà un détail', subject: 'Relance budget Q4' },
        contact_id: 'c1',
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events[0].detail).toBe('Déjà un détail')
  })

  it('écarte un événement sans date plutôt que de le dater « maintenant »', async () => {
    // Le dater faussement casserait l'ordre, seule promesse de la vue.
    const { service, userActions } = build()
    userActions.find.mockResolvedValue([
      { id: 'a1', created_at: null, action_type: 'message_sent', metadata: {}, contact_id: null },
      {
        id: 'a2',
        created_at: new Date('2026-07-10T10:00:00Z'),
        action_type: 'message_sent',
        metadata: {},
        contact_id: null,
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events.map(event => event.id)).toEqual(['action:a2'])
  })

  it('rend une timeline PARTIELLE quand une source échoue', async () => {
    // Elle s'ouvre avant un rendez-vous : une source indisponible ne doit pas la
    // remplacer par une page d'erreur.
    const { service, userActions, opportunities } = build()
    userActions.find.mockRejectedValue(new Error('journal indisponible'))
    opportunities.find.mockResolvedValue([
      {
        id: 'o1',
        first_detected_at: new Date('2026-07-20T10:00:00Z'),
        label: 'Besoin',
        detail: null,
        stage: 'detected',
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('opportunity:o1')
  })

  it('n’interpole jamais « undefined » dans un libellé', async () => {
    const { service, userActions } = build()
    userActions.find.mockResolvedValue([
      {
        id: 'a1',
        created_at: new Date('2026-07-10T10:00:00Z'),
        action_type: 'analysis_completed',
        metadata: {},
        contact_id: null,
      },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events[0].label).toBe('analysis_completed')
    expect(events[0].detail).toBeNull()
  })

  it('borne la liste — une timeline n’est pas un export', async () => {
    const { service, userActions } = build()
    userActions.find.mockResolvedValue(
      Array.from({ length: 300 }, (_, index) => ({
        id: `a${index}`,
        created_at: new Date(2026, 0, 1, 0, index),
        action_type: 'message_sent',
        metadata: {},
        contact_id: null,
      })),
    )
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events.length).toBeLessThanOrEqual(200)
  })
})

describe('timeline unifiée — #3505 les consultations du CRM par Laura', () => {
  it('porte chaque consultation (`crm_lookup`) comme un geste, par son CODE — jamais une phrase figée', async () => {
    const { service, activities } = build()
    activities.find.mockResolvedValue([
      { id: 'l1', kind: 'crm_lookup', occurred_at: new Date('2026-10-01T10:00:00Z'), contact_id: null },
      { id: 'l2', kind: 'crm_lookup', occurred_at: new Date('2026-10-01T09:00:00Z'), contact_id: null },
    ])
    const { events } = await service.forAccount(ACCOUNT, WORKSPACE)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ kind: 'action', type: 'crm_lookup', label: 'crm_lookup', detail: null })
    // Le périmètre : le compte ET l'espace de l'appelant, et seulement ce geste.
    expect(activities.find.mock.calls[0]?.[0]?.where).toMatchObject({
      account_id: ACCOUNT,
      workspace_id: WORKSPACE,
      kind: 'crm_lookup',
    })
  })

  it('écarte une consultation sans date et survit à l’échec de sa source', async () => {
    const { service, activities, userActions } = build()
    activities.find.mockResolvedValueOnce([{ id: 'l1', kind: 'crm_lookup', occurred_at: null, contact_id: null }])
    expect((await service.forAccount(ACCOUNT, WORKSPACE)).events).toHaveLength(0)
    activities.find.mockRejectedValueOnce(new Error('boom'))
    userActions.find.mockResolvedValue([
      { id: 'u1', action_type: 'note', created_at: new Date('2026-10-01T10:00:00Z'), metadata: {}, contact_id: null },
    ])
    expect((await service.forAccount(ACCOUNT, WORKSPACE)).events).toHaveLength(1)
  })
})
