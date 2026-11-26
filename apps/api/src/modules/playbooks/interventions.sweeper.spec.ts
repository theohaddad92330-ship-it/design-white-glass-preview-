import { Logger } from '@nestjs/common'
import { INTERVENTION_KINDS } from '@bellum/contracts'
import { InterventionsSweeper } from './interventions.sweeper'
import type { PlaybooksService } from './playbooks.service'

/**
 * Le balayeur touche onze tables : on ne le teste pas contre une base, on teste
 * ce qui reste vrai quel que soit ce qu'elle contient — l'interrupteur, le
 * cloisonnement des natures, et le fait que le compteur dise la vérité.
 */
type QueryStub = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function build(options: { query: QueryStub; open?: jest.Mock; record?: jest.Mock }) {
  const open = options.open ?? jest.fn().mockResolvedValue(true)
  const repo = { manager: { query: options.query } } as never
  const triggers = options.record ? ({ recordOnceByDedupeKey: options.record } as never) : undefined
  const sweeper = new InterventionsSweeper(repo, { open } as unknown as PlaybooksService, undefined, triggers)
  return { sweeper, open }
}

/** Une ligne de positionnement en souffrance, prête à ouvrir une intervention. */
const stalledRow = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: 'ws-1',
  submitted_at: new Date('2026-05-01T00:00:00Z'),
  first_feedback_at: null,
  closed_at: null,
  owner_id: 'user-1',
  consultant_name: 'Marie',
  account_name: 'ACME',
}

const NOW = new Date('2026-06-15T12:00:00Z')

describe('InterventionsSweeper', () => {
  const previous = process.env.INTERVENTIONS_SWEEP_DISABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.INTERVENTIONS_SWEEP_DISABLED
    else process.env.INTERVENTIONS_SWEEP_DISABLED = previous
    jest.restoreAllMocks()
  })

  it('ne touche à RIEN quand l’interrupteur est posé', () => {
    process.env.INTERVENTIONS_SWEEP_DISABLED = 'true'
    const query: QueryStub = jest.fn()
    const { sweeper, open } = build({ query })
    return sweeper.sweep(NOW).then(opened => {
      expect(opened).toBe(0)
      expect(query).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
    })
  })

  it('ouvre ce que les règles trouvent, avec l’espace de la ligne', async () => {
    const query: QueryStub = jest
      .fn()
      .mockImplementation((sql: string) => Promise.resolve(sql.includes('FROM submissions s') ? [stalledRow] : []))
    const { sweeper, open } = build({ query })

    expect(await sweeper.sweep(NOW)).toBe(1)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        kind: 'submission_stalled',
        subjectType: 'submission',
        subjectId: stalledRow.id,
        ownerId: 'user-1',
      }),
    )
  })

  it('persiste l’événement canonique au registre — #2402.1, l’appel manquant', async () => {
    // La construction (`toTriggerEvent`) existait déjà pour la corrélation
    // #2402.14 ; seul l'appel à `TriggerRegistryService.record` manquait, et
    // c'est lui que cette tranche ajoute.
    const query: QueryStub = jest
      .fn()
      .mockImplementation((sql: string) => Promise.resolve(sql.includes('FROM submissions s') ? [stalledRow] : []))
    const record = jest.fn().mockResolvedValue(undefined)
    const { sweeper } = build({ query, record })

    expect(await sweeper.sweep(NOW)).toBe(1)
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'submission_stalled', scope: { workspaceId: 'ws-1', ownerId: 'user-1' } }),
      'playbooks/interventions.sweeper',
    )
  })

  it('ne compte QUE ce qui a réellement été ouvert', async () => {
    // `open` rend false quand l'intervention existe déjà. Un balayage qui
    // détecte 40 anomalies et n'en ouvre aucune veut dire « rien de neuf », pas
    // « en panne » — et le compteur doit permettre de faire la différence.
    const query: QueryStub = jest
      .fn()
      .mockImplementation((sql: string) => Promise.resolve(sql.includes('FROM submissions s') ? [stalledRow] : []))
    const { sweeper } = build({ query, open: jest.fn().mockResolvedValue(false) })
    expect(await sweeper.sweep(NOW)).toBe(0)
  })

  it('isole les natures — une requête en échec n’emporte pas les dix autres', async () => {
    // Sans ce cloisonnement, un seul index manquant viderait toute la file du
    // responsable, silencieusement.
    const query: QueryStub = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM missions m')) return Promise.reject(new Error('relation manquante'))
      if (sql.includes('FROM submissions s')) return Promise.resolve([stalledRow])
      return Promise.resolve([])
    })
    const { sweeper, open } = build({ query })

    expect(await sweeper.sweep(NOW)).toBe(1)
    expect(open).toHaveBeenCalledTimes(1)
    // Les onze requêtes ont bien été tentées, l'échec compris.
    expect(query).toHaveBeenCalledTimes(INTERVENTION_KINDS.length)
  })

  it('interroge les onze natures — une nature muette est une case vide dans un écran', async () => {
    const query: QueryStub = jest.fn().mockResolvedValue([])
    const { sweeper } = build({ query })
    await sweeper.sweep(NOW)

    const executed = query.mock.calls.map(([sql]) => sql).join('\n')
    for (const table of [
      'FROM submissions s',
      'FROM missions m',
      'FROM invoice_readiness r',
      'FROM accounts a',
      'FROM workspace_members',
      'FROM workspaces w',
      // Les cinq natures du cockpit du commercial. Sans cette moitié, la garde
      // resterait verte pendant que cinq cases du bloc « Ce qui m'attend »
      // resteraient vides en production — le défaut même que ce chantier
      // corrige.
      'FROM tasks t',
      'FROM opportunities o',
      'FROM project_needs n',
      'FROM mission_timesheets ts',
    ]) {
      expect(executed).toContain(table)
    }
  })

  it('ouvre bien UNE LIGNE par nature neuve — la clé au contrat ne suffit pas', async () => {
    // La preuve que ce chantier existe pour donner : chaque nature doit produire
    // une intervention sur un jeu qui la déclenche, pas seulement figurer dans
    // l'énumération. C'est le défaut n°1 du dépôt — du code juste que personne
    // n'appelle.
    const rows: Record<string, unknown[]> = {
      // `FROM tasks t` n'apparaît QUE dans la requête « sans prochaine action » :
      // s'en servir comme clé évite de nourrir aussi « compte non touché », qui
      // lit la même table de comptes.
      'FROM tasks t': [
        {
          id: '22222222-2222-4222-8222-222222222222',
          workspace_id: 'ws-1',
          name: 'ACME',
          created_at: new Date('2026-01-01T00:00:00Z'),
          owner_id: 'user-1',
        },
      ],
      'FROM opportunities o': [
        {
          id: '33333333-3333-4333-8333-333333333333',
          workspace_id: 'ws-1',
          label: 'Refonte du socle',
          stage: 'negotiation',
          stage_entered_at: new Date('2026-05-01T00:00:00Z'),
          owner_id: 'user-1',
        },
      ],
      'FROM project_needs n': [
        {
          id: '44444444-4444-4444-8444-444444444444',
          workspace_id: 'ws-1',
          title: 'Architecte de plateforme',
          status_changed_at: new Date('2026-05-01T00:00:00Z'),
          owner_id: 'user-1',
        },
      ],
      'FROM mission_timesheets ts': [
        {
          id: '55555555-5555-4555-8555-555555555555',
          workspace_id: 'ws-1',
          period_month: '2026-05-01',
          reminders_sent: 3,
          mission_label: 'Supervision',
          owner_id: 'user-1',
        },
      ],
      'FROM invoice_readiness r': [
        {
          id: '66666666-6666-4666-8666-666666666666',
          workspace_id: 'ws-1',
          period_month: '2026-03-01',
          due_on: '2026-03-31',
          paid_at: null,
          disputed_at: null,
          dispute_resolved_at: null,
          mission_label: 'Supervision',
          owner_id: 'user-1',
        },
      ],
    }
    const query: QueryStub = jest.fn().mockImplementation((sql: string) => {
      // `invoice_readiness` sert DEUX natures ; seule celle qui lit l'échéance
      // reçoit la ligne en retard de paiement.
      if (sql.includes('FROM invoice_readiness r') && !sql.includes('r.due_on')) return Promise.resolve([])
      const match = Object.keys(rows).find(key => sql.includes(key))
      return Promise.resolve(match ? (rows[match] as unknown[]) : [])
    })
    const { sweeper, open } = build({ query })

    expect(await sweeper.sweep(NOW)).toBe(5)
    const opened = open.mock.calls.map(([input]) => (input as { kind: string }).kind)
    expect(opened.sort()).toEqual([
      'account_no_next_action',
      'need_without_shortlist',
      'payment_overdue',
      'project_no_decision',
      'timesheet_missing',
    ])
  })

  it('exclut les espaces de démonstration des ONZE natures', async () => {
    // Une salle traversée par des inconnus doit montrer une file vide parce
    // qu'il n'y a rien à signaler — pas une alerte fabriquée par le passage du
    // balayeur de la nuit. C'est aussi ce que la garde de couverture démo
    // affirme par écrit ; sans ce filtre, elle deviendrait fausse en silence.
    const query: QueryStub = jest.fn().mockResolvedValue([])
    const { sweeper } = build({ query })
    await sweeper.sweep(NOW)

    const executed = query.mock.calls.map(([sql]) => sql)
    expect(executed).toHaveLength(INTERVENTION_KINDS.length)
    for (const sql of executed) expect(sql).toContain('is_demo')
  })

  it('#2402.1/.2/.9 — chaque intervention ouverte construit un TriggerEvent canonique du catalogue', async () => {
    // Le registre du 23/09 nommait ce point « code que personne n'appelle » :
    // la preuve ici est que le balayage — l'appelant RÉEL — ne casse pas
    // quand la construction canonique est exercée sur les douze natures.
    const query: QueryStub = jest
      .fn()
      .mockImplementation((sql: string) => Promise.resolve(sql.includes('FROM submissions s') ? [stalledRow] : []))
    const { sweeper, open } = build({ query })
    expect(await sweeper.sweep(NOW)).toBe(1)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('#2402.14 — deux signaux sur le MÊME compte, dans le MÊME balayage, se combinent et se journalisent', async () => {
    const accountId = '77777777-7777-4777-8777-777777777777'
    const query: QueryStub = jest.fn().mockImplementation((sql: string) => {
      // `untouchedAccounts()` est la SEULE requête à lire `user_actions` par
      // compte — `accountsWithoutNextAction()` lit `user_actions` par PERSONNE
      // (`rep_inactive`) ou pas du tout.
      if (sql.includes('ua.account_id = a.id')) {
        return Promise.resolve([
          { id: accountId, workspace_id: 'ws-1', name: 'ACME', owner_id: 'user-1', last_action_at: null },
        ])
      }
      // `FROM tasks t` n'apparaît QUE dans la sous-requête de
      // `accountsWithoutNextAction()`.
      if (sql.includes('FROM tasks t')) {
        return Promise.resolve([
          {
            id: accountId,
            workspace_id: 'ws-1',
            name: 'ACME',
            owner_id: 'user-1',
            created_at: new Date('2026-01-01T00:00:00Z'),
          },
        ])
      }
      return Promise.resolve([])
    })
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const { sweeper } = build({ query })

    expect(await sweeper.sweep(NOW)).toBe(2)
    const combined = logSpy.mock.calls
      .map(call => String(call[0]))
      .find(message => message.includes('Signaux combinés'))
    expect(combined).toBeDefined()
    expect(combined).toContain('account_untouched')
    expect(combined).toContain('account_no_next_action')
    logSpy.mockRestore()
  })

  it('#2402.14 — un signal SEUL ne produit aucune ligne « Signaux combinés »', async () => {
    const query: QueryStub = jest
      .fn()
      .mockImplementation((sql: string) => Promise.resolve(sql.includes('FROM submissions s') ? [stalledRow] : []))
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const { sweeper } = build({ query })

    await sweeper.sweep(NOW)
    const combined = logSpy.mock.calls
      .map(call => String(call[0]))
      .find(message => message.includes('Signaux combinés'))
    expect(combined).toBeUndefined()
    logSpy.mockRestore()
  })
})
