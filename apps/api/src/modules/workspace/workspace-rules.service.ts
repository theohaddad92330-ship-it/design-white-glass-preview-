import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  isWorkspaceRuleAdmin,
  resolveWorkspaceRuleValues,
  workspaceRuleForbids,
  type UpdateWorkspaceRules,
  type WorkspaceRole,
  type WorkspaceRulesView,
} from '@bellum/contracts'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { buildFullName, WorkspaceContextService } from './workspace-context.service'

/**
 * #2081.14 — LES RÈGLES D'ESPACE : les lire (tout membre), les changer
 * (l'administrateur seul), et garder la trace de qui et quand.
 *
 * Ce service ne DÉCIDE rien de ce qu'une règle retire : la décision vit au
 * guard et à `assertPermission` (export) et dans `BusinessUnitService.scopeFor`
 * (visibilité des unités), qui lisent tous `WorkspaceContextService
 * .workspaceRulesOf`. Ici, on ne fait que poser la valeur.
 *
 * ⚠️ L'espace vient TOUJOURS du jeton (`resolveActiveWorkspace`), jamais du
 * corps : aucune route ne reçoit un `workspaceId`, et le schéma du PATCH est
 * `strict()` — un champ de plus est refusé, pas ignoré.
 */
@Injectable()
export class WorkspaceRulesService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceRulesEntity)
    private readonly rules: Repository<WorkspaceRulesEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
  ) {}

  /** Les règles de l'espace actif, avec leur trace. Tout membre les lit : un refus doit pouvoir s'expliquer. */
  async view(userId: string): Promise<WorkspaceRulesView> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.rules.findOne({ where: { workspace_id: workspaceId } })
    return this.toView(row, role)
  }

  /**
   * Change une règle, ou les deux. Propriétaire ou administrateur SEUL : une
   * règle prime sur les réglages de toute l'équipe, elle ne se pose pas depuis
   * un siège de membre — ni depuis celui d'un responsable d'agence qui porte
   * `team:manage` (c'est lui que « privée » doit tenir dans son unité).
   *
   * Seule une valeur qui CHANGE est écrite et tracée : reposer la valeur en
   * vigueur ne vole pas la trace à qui l'a réellement posée. L'écriture est un
   * `upsert` sur la clé d'espace — deux administrateurs simultanés ne créent
   * pas deux lignes.
   */
  async update(userId: string, patch: UpdateWorkspaceRules): Promise<WorkspaceRulesView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const membership = await this.workspaceContext.assertRole(userId, workspaceId, ['owner', 'admin'])

    const current = await this.rules.findOne({ where: { workspace_id: workspaceId } })
    const values = resolveWorkspaceRuleValues(current)
    const now = new Date()
    const changes: Partial<WorkspaceRulesEntity> = {}

    if (
      patch.businessUnitAccountsVisibility !== undefined &&
      patch.businessUnitAccountsVisibility !== values.businessUnitAccountsVisibility
    ) {
      changes.business_unit_accounts_visibility = patch.businessUnitAccountsVisibility
      changes.business_unit_accounts_visibility_changed_by = userId
      changes.business_unit_accounts_visibility_changed_at = now
    }
    if (patch.exportPolicy !== undefined && patch.exportPolicy !== values.exportPolicy) {
      changes.export_policy = patch.exportPolicy
      changes.export_policy_changed_by = userId
      changes.export_policy_changed_at = now
    }

    if (Object.keys(changes).length > 0) {
      await this.rules.upsert({ workspace_id: workspaceId, ...changes }, { conflictPaths: ['workspace_id'] })
    }

    const row = await this.rules.findOne({ where: { workspace_id: workspaceId } })
    return this.toView(row ?? current, membership.role)
  }

  private async toView(row: WorkspaceRulesEntity | null, role: WorkspaceRole): Promise<WorkspaceRulesView> {
    const values = resolveWorkspaceRuleValues(row)
    const visibilityBy = row?.business_unit_accounts_visibility_changed_by ?? null
    const exportBy = row?.export_policy_changed_by ?? null
    const names = await this.namesOf([visibilityBy, exportBy])

    return {
      businessUnitAccountsVisibility: {
        value: values.businessUnitAccountsVisibility,
        changedByUserId: visibilityBy,
        changedByName: visibilityBy ? (names.get(visibilityBy) ?? null) : null,
        changedAt: row?.business_unit_accounts_visibility_changed_at?.toISOString() ?? null,
      },
      exportPolicy: {
        value: values.exportPolicy,
        changedByUserId: exportBy,
        changedByName: exportBy ? (names.get(exportBy) ?? null) : null,
        changedAt: row?.export_policy_changed_at?.toISOString() ?? null,
      },
      canEdit: isWorkspaceRuleAdmin(role),
      // #2081.14 — la MÊME dérivation que le guard d'une route `@DataExit()`
      // (GA-26) : l'écran masque un export construit dans le navigateur sur
      // cette réponse, il ne recalcule rien.
      dataExitAllowed: workspaceRuleForbids(values, role, 'data_exit') === null,
    }
  }

  /** Le nom affiché des auteurs — prénom nom, sinon l'e-mail, sinon rien. */
  private async namesOf(userIds: ReadonlyArray<string | null>): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    const profiles = await this.profiles.find({ where: { user_id: In(ids) } })
    const names = new Map<string, string>()
    for (const profile of profiles) {
      const name = buildFullName(profile.first_name, profile.last_name) ?? profile.email ?? null
      if (name) names.set(profile.user_id, name)
    }
    return names
  }
}
