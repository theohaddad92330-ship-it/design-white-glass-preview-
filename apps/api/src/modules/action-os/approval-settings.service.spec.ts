import { ForbiddenException } from '@nestjs/common'
import { APPROVAL_THRESHOLD_UNBOUNDED, DEFAULT_APPROVAL_SETTINGS, type WorkspaceRole } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { ApprovalSettingsService } from './approval-settings.service'

/**
 * #4016 L6 — les seuils de l'Action OS, réglés par l'ADMIN jusqu'à « sans plafond ».
 *
 * Avant le 11/10/2026, `workspaces.approval_*` existaient en base, étaient LUS
 * par le planificateur — et rien ne les écrivait : le seul moyen de les régler
 * était une requête SQL. Le réglage existe désormais, et il est réservé à qui
 * gère l'équipe (`team:manage`).
 */
type Row = Pick<WorkspaceEntity, 'approval_default_level' | 'approval_bulk_threshold' | 'approval_spend_threshold'>

function build(role: WorkspaceRole, row: Partial<Row> = {}) {
  const stored: Row = {
    approval_default_level: null,
    approval_bulk_threshold: null,
    approval_spend_threshold: null,
    ...row,
  }
  const workspaces = {
    findOne: jest.fn(async () => ({ ...stored })),
    update: jest.fn(async (_where: unknown, patch: Partial<Row>) => {
      Object.assign(stored, patch)
      return { affected: 1 }
    }),
  }
  // L'espace actif et le rôle sont résolus par le CONTRÔLEUR (GA-07 : le service
  // n'importe aucun service d'un autre module) ; le service revérifie le droit.
  const scope = { workspaceId: 'ws-1', role }
  const service = new ApprovalSettingsService(workspaces as unknown as Repository<WorkspaceEntity>)
  return { service, workspaces, stored, scope }
}

describe('ApprovalSettingsService (#4016 L6)', () => {
  it('rend le défaut produit quand l’espace n’a rien réglé — et le dit', async () => {
    const { service, scope } = build('sales')
    const view = await service.read(scope)
    expect(view).toEqual({ ...DEFAULT_APPROVAL_SETTINGS, customised: [], canEdit: false })
  })

  it('rend les réglages posés et nomme ceux que l’espace a choisis', async () => {
    const { service, scope } = build('owner', {
      approval_default_level: 'n5_extended_auto',
      approval_bulk_threshold: 500,
    })
    const view = await service.read(scope)
    expect(view.defaultLevel).toBe('n5_extended_auto')
    expect(view.bulkThreshold).toBe(500)
    expect(view.spendThreshold).toBe(DEFAULT_APPROVAL_SETTINGS.spendThreshold)
    expect(view.customised).toEqual(['defaultLevel', 'bulkThreshold'])
    expect(view.canEdit).toBe(true)
  })

  it('un admin règle N5 et des seuils « sans plafond »', async () => {
    const { service, workspaces, scope } = build('admin')
    const view = await service.update(scope, {
      defaultLevel: 'n5_extended_auto',
      bulkThreshold: APPROVAL_THRESHOLD_UNBOUNDED,
      spendThreshold: APPROVAL_THRESHOLD_UNBOUNDED,
    })
    expect(workspaces.update).toHaveBeenCalledWith(
      { id: 'ws-1' },
      {
        approval_default_level: 'n5_extended_auto',
        approval_bulk_threshold: APPROVAL_THRESHOLD_UNBOUNDED,
        approval_spend_threshold: APPROVAL_THRESHOLD_UNBOUNDED,
      },
    )
    expect(view.bulkThreshold).toBe(APPROVAL_THRESHOLD_UNBOUNDED)
  })

  it('`null` RETIRE un réglage — l’espace revient au défaut, jamais à 0', async () => {
    const { service, workspaces, scope } = build('owner', { approval_bulk_threshold: 500 })
    const view = await service.update(scope, { bulkThreshold: null })
    expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { approval_bulk_threshold: null })
    expect(view.bulkThreshold).toBe(DEFAULT_APPROVAL_SETTINGS.bulkThreshold)
  })

  it('un champ absent du corps n’est pas touché', async () => {
    const { service, workspaces, scope } = build('owner', { approval_spend_threshold: 80 })
    await service.update(scope, { bulkThreshold: 40 })
    expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { approval_bulk_threshold: 40 })
  })

  it('SAIT DIRE NON — un commercial ne règle pas l’autonomie de l’espace', async () => {
    const { service, workspaces, scope } = build('sales')
    await expect(service.update(scope, { defaultLevel: 'n5_extended_auto' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(workspaces.update).not.toHaveBeenCalled()
  })
})
