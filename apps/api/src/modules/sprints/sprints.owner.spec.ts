import { SprintsController } from './sprints.controller'
import type { SprintBoard, SprintBoardAccount } from './sprints.service'

/**
 * #3257.7a — LE PORTEUR sur la carte du board d'effort.
 *
 * `SprintsService.board()` ne connaît que `owner_id` (GA-07 lui interdit
 * d'importer `AccountsService`) ; c'est le CONTRÔLEUR qui pose `owner`, via la
 * dérivation partagée `account-owner.util.ts` sur son propre
 * `Repository<AccountEntity>` — jamais via le service des comptes (cycle de
 * modules : `AccountsModule` → `ContactsModule` → `SprintsModule`).
 */
function account(overrides: Partial<SprintBoardAccount> = {}): SprintBoardAccount {
  return {
    id: 'a1',
    company_name: 'Acme',
    sprint: 'focus',
    sprint_entered_at: null,
    sprint_exit_reason: null,
    sprint_decided_by: null,
    last_activity_at: null,
    priority_score: null,
    commercial_status: null,
    logo_url: null,
    website: null,
    sprint_reason: null,
    sprint_effort_estimate: null,
    sprint_review_at: null,
    sprint_promotion_condition: null,
    sprint_demotion_condition: null,
    owner_id: null,
    owner: null,
    next_task_title: null,
    next_task_due_on: null,
    partner_name: null,
    suggested_switch: null,
    ...overrides,
  }
}

function makeController(board: SprintBoard, profileRows: Record<string, unknown>[]) {
  const sprints = {
    board: jest.fn().mockResolvedValue(board),
    focusCapacity: jest.fn().mockResolvedValue(16),
    move: jest.fn(),
    applyEvent: jest.fn(),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const query = jest.fn().mockResolvedValue(profileRows)
  const controller = new SprintsController(sprints as never, workspaceContext as never, { query } as never)
  return { controller, sprints, query }
}

describe('SprintsController.board — plafond (#3407)', () => {
  it('rend le plafond du Focus de l’espace avec le board', async () => {
    const empty: SprintBoard = {
      focus: [],
      extension: [],
      volume: [],
      no_go: [],
      watch: [],
      partner_route: [],
      unplaced: [],
    }
    const result = await makeController(empty, []).controller.board({ userId: 'u1' } as never)
    expect(result.focus_capacity).toBe(16)
  })
})

describe('SprintsController.board — pose le porteur (#3257.7a)', () => {
  it('#3296 : les comptes non placés traversent le contrôleur', async () => {
    const unplaced = [{ id: 'u1', company_name: 'SNCF', logo_url: null, website: null, priority_score: null }]
    const { controller } = makeController(
      {
        focus: [],
        extension: [],
        volume: [],
        no_go: [],
        watch: [],
        partner_route: [],
        unplaced,
      },
      [],
    )
    const out = await controller.board({ userId: 'u' } as never)
    expect(out.unplaced).toEqual(unplaced)
  })

  it('résout le porteur de chaque carte en UNE seule requête pour tout le board', async () => {
    const board: SprintBoard = {
      focus: [account({ id: 'a1', owner_id: 'u1' })],
      extension: [account({ id: 'a2', owner_id: 'u2' })],
      volume: [account({ id: 'a3', owner_id: null })],
      no_go: [],
      watch: [],
      partner_route: [],
      unplaced: [],
    }
    const { controller, query } = makeController(board, [
      { userId: 'u1', firstName: 'Alice', lastName: 'Martin', email: 'alice@ex.com' },
      { userId: 'u2', firstName: null, lastName: null, email: 'bob@ex.com' },
    ])

    const result = await controller.board({ userId: 'u-caller' } as never)

    expect(result.focus[0].owner).toEqual({ user_id: 'u1', name: 'Alice Martin' })
    expect(result.extension[0].owner).toEqual({ user_id: 'u2', name: 'bob@ex.com' })
    // Compte libre : `owner` reste `null`, jamais deviné.
    expect(result.volume[0].owner).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('un id sans profil lisible (membre parti) : owner reste null, pas d’exception', async () => {
    const board: SprintBoard = {
      focus: [account({ id: 'a1', owner_id: 'gone' })],
      extension: [],
      volume: [],
      no_go: [],
      watch: [],
      partner_route: [],
      unplaced: [],
    }
    const { controller } = makeController(board, [])
    const result = await controller.board({ userId: 'u-caller' } as never)
    expect(result.focus[0].owner).toBeNull()
  })
})

describe('SprintsController.move — le compte déplacé porte aussi son porteur', () => {
  it('attache le porteur sur la carte rendue par le déplacement', async () => {
    const moved = account({ id: 'a1', sprint: 'extension', owner_id: 'u1' })
    const sprints = { board: jest.fn(), move: jest.fn().mockResolvedValue(moved), applyEvent: jest.fn() }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const query = jest.fn().mockResolvedValue([{ userId: 'u1', firstName: 'Alice', lastName: 'Martin', email: null }])
    const controller = new SprintsController(sprints as never, workspaceContext as never, { query } as never)

    const result = await controller.move({ userId: 'u-caller' } as never, 'a1', { sprint: 'extension' })

    expect(result.owner).toEqual({ user_id: 'u1', name: 'Alice Martin' })
    expect(sprints.move).toHaveBeenCalledWith('ws-1', 'a1', 'extension', null, expect.any(Object), 'u-caller')
  })
})
