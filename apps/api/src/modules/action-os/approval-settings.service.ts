import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  hasPermission,
  type ApprovalSettingsView,
  type UpdateApprovalSettings,
  type WorkspaceRole,
} from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { resolveSettings } from './approval-policy'

/** Qui règle l'autonomie de l'espace : quiconque gère l'équipe (même droit que la simulation d'un niveau). */
const EDIT_PERMISSION = 'team:manage' as const

/** L'espace actif et le rôle de l'appelant, résolus par le contrôleur (GA-07). */
type ApprovalScope = { workspaceId: string; role: WorkspaceRole }

type ApprovalColumns = Pick<
  WorkspaceEntity,
  'approval_default_level' | 'approval_bulk_threshold' | 'approval_spend_threshold'
>

/**
 * #4016 L6 — LE RÉGLAGE DE L'AUTONOMIE DE L'ACTION OS (Louis 11/10/2026).
 *
 * `workspaces.approval_default_level / approval_bulk_threshold /
 * approval_spend_threshold` existent depuis la migration Action OS, sont LUS
 * par le planificateur (`resolveSettings`) et n'avaient aucun écrivain : les
 * régler voulait dire écrire du SQL. Ce service est leur seul écrivain.
 *
 * Il n'interprète rien : la dérivation des réglages effectifs reste
 * `resolveSettings` (GA-26), et la politique reste `approval-policy.ts`. Un
 * réglage à `null` suit le défaut produit — on ne l'écrit jamais à 0.
 *
 * Ce qu'aucun réglage d'ici ne lève : un envoi et une écriture dans le CRM du
 * client demandent un humain à tous les niveaux (`levelForStep`).
 */
@Injectable()
export class ApprovalSettingsService {
  constructor(@InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>) {}

  async read({ workspaceId, role }: ApprovalScope): Promise<ApprovalSettingsView> {
    return this.view(workspaceId, hasPermission(role, EDIT_PERMISSION))
  }

  async update({ workspaceId, role }: ApprovalScope, input: UpdateApprovalSettings): Promise<ApprovalSettingsView> {
    if (!hasPermission(role, EDIT_PERMISSION)) {
      throw new ForbiddenException('Seul un responsable de l’espace règle l’autonomie des actions.')
    }
    const patch: Partial<ApprovalColumns> = {}
    if (input.defaultLevel !== undefined) patch.approval_default_level = input.defaultLevel
    if (input.bulkThreshold !== undefined) patch.approval_bulk_threshold = input.bulkThreshold
    if (input.spendThreshold !== undefined) patch.approval_spend_threshold = input.spendThreshold
    if (Object.keys(patch).length > 0) await this.workspaces.update({ id: workspaceId }, patch)
    return this.view(workspaceId, true)
  }

  private async view(workspaceId: string, canEdit: boolean): Promise<ApprovalSettingsView> {
    const row = await this.workspaces.findOne({
      where: { id: workspaceId },
      select: ['approval_default_level', 'approval_bulk_threshold', 'approval_spend_threshold'],
    })
    const settings = resolveSettings(row ?? {})
    const customised: ApprovalSettingsView['customised'] = []
    if (row?.approval_default_level && settings.defaultLevel === row.approval_default_level) {
      customised.push('defaultLevel')
    }
    if (row?.approval_bulk_threshold != null) customised.push('bulkThreshold')
    if (row?.approval_spend_threshold != null) customised.push('spendThreshold')
    return { ...settings, customised, canEdit }
  }
}
