import { NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountMemoryEntity } from '../../database/entities/account-memory.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountMemoryService } from './account-memory.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const ACCOUNT = '33333333-3333-3333-3333-333333333333'

/**
 * #2777 — LA MÉMOIRE DU COMPTE S'ÉCRIT, BANDE `n4_bounded_auto`.
 *
 * Aucune file de validation ici (contrairement à `crm_stage`/`opportunity`) :
 * cette table ne touche ni CRM ni ERP, donc la porte BEL-INT-603 ne
 * s'applique pas — voir le docblock de la migration `AccountMemory1796321340147`.
 */
describe('AccountMemoryService', () => {
  let service: AccountMemoryService
  let memoryRepo: { create: jest.Mock; save: jest.Mock }
  let accountsRepo: { findOne: jest.Mock }

  beforeEach(async () => {
    memoryRepo = {
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({ ...row, id: 'mem-1' })),
    }
    accountsRepo = { findOne: jest.fn().mockResolvedValue({ id: ACCOUNT, workspace_id: WORKSPACE }) }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountMemoryService,
        { provide: getRepositoryToken(AccountMemoryEntity), useValue: memoryRepo },
        { provide: getRepositoryToken(AccountEntity), useValue: accountsRepo },
        {
          provide: WorkspaceContextService,
          useValue: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) },
        },
      ],
    }).compile()

    service = moduleRef.get(AccountMemoryService)
  })

  it('écrit chaque apprentissage, estampillé `meeting`', async () => {
    const result = await service.record(USER, ACCOUNT, [
      { kind: 'objection', content: 'Le budget est gelé jusqu’en janvier.' },
      { kind: 'commitment', content: 'Ils rappellent après le comité.' },
    ])
    expect(memoryRepo.save).toHaveBeenCalledTimes(2)
    expect(memoryRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspace_id: WORKSPACE,
        account_id: ACCOUNT,
        user_id: USER,
        kind: 'objection',
        content: 'Le budget est gelé jusqu’en janvier.',
        source: 'meeting',
      }),
    )
    expect(result).toEqual({ created: 2 })
  })

  it('SAIT DIRE NON — un contenu vide n’écrit rien pour cette entrée', async () => {
    const result = await service.record(USER, ACCOUNT, [{ kind: 'objection', content: '   ' }])
    expect(memoryRepo.save).not.toHaveBeenCalled()
    expect(result).toEqual({ created: 0 })
  })

  it('un compte hors de l’espace de l’appelant n’écrit rien', async () => {
    accountsRepo.findOne.mockResolvedValue(null)
    await expect(service.record(USER, ACCOUNT, [{ kind: 'objection', content: 'X' }])).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(memoryRepo.save).not.toHaveBeenCalled()
  })
})
