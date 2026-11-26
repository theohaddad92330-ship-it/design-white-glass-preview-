import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  isMaskableWorkspaceSection,
  type MaskableWorkspaceSection,
  type WorkspaceHiddenSectionsResolution,
} from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceContextService } from './workspace-context.service'

/**
 * #2957 (#2179.2/.35) — resolves and mutates the sections an admin masked for
 * the caller's active workspace. Mirrors {@link WorkspaceTimezoneService} on
 * purpose: same shape of problem (a workspace-level setting, read by any
 * member, written by owner/admin only).
 *
 * Read by BOTH the nav (hide the tab for everyone) and the `/rfp` empty state
 * (which is the only place a member can toggle it — #2179.34's exact text:
 * « tu peux importer un premier AO ou masquer cette section pour ton
 * workspace »). Masking never removes the ROUTE — a member who still opens
 * `/rfp` directly sees the page, with an admin-only « réafficher » action
 * instead of the import flow. A hidden section is invisible, not deleted.
 */
@Injectable()
export class WorkspaceHiddenSectionsService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /** `GET /workspaces/hidden-sections` — any member may read it. */
  async getHiddenSections(userId: string): Promise<WorkspaceHiddenSectionsResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    // Une valeur illisible (colonne absente sur une ligne ancienne, contenu
    // corrompu) se lit « rien masqué » — jamais une exception qui ferait
    // disparaître toute la barre latérale.
    const raw = Array.isArray(workspace?.hidden_sections) ? workspace.hidden_sections : []
    return { hiddenSections: raw.filter(isMaskableWorkspaceSection) }
  }

  /**
   * `PATCH /workspaces/hidden-sections` — replace the full set for the active
   * workspace. Owner/admin only, same gate as
   * {@link WorkspaceTimezoneService.setTimezone}.
   */
  async setHiddenSections(
    userId: string,
    hiddenSections: MaskableWorkspaceSection[],
  ): Promise<WorkspaceHiddenSectionsResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner', 'admin'])

    // Dédupliquée, jamais deux fois la même section dans le tableau persisté.
    const deduped = [...new Set(hiddenSections)]
    const result = await this.workspaces.update({ id: workspaceId }, { hidden_sections: deduped })
    if (result.affected === 0) throw new NotFoundException('Espace de travail introuvable')

    return { hiddenSections: deduped }
  }
}
