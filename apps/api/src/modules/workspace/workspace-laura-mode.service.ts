import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_LAURA_CONTEXT_MODE,
  type LauraContextMode,
  type WorkspaceDefaultContextModeResolution,
} from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceContextService } from './workspace-context.service'

/**
 * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE.
 *
 * Mirrors {@link WorkspaceTimezoneService} / {@link WorkspaceMarketService} on
 * purpose : même nature de problème (un réglage d'espace, lu par tout membre,
 * changé par le propriétaire ou l'administrateur seul) — pas la nature d'une
 * règle d'espace (#2081.14), qui RETIRE un droit ; celui-ci ne fait que poser
 * une valeur de repli. D'où un `UPDATE` direct sur `workspaces`, jamais un
 * `upsert` : la ligne existe toujours.
 */
@Injectable()
export class WorkspaceLauraModeService {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /** `GET /workspaces/laura-mode` — tout membre peut lire le réglage de l'espace actif. */
  async getDefaultContextMode(userId: string): Promise<WorkspaceDefaultContextModeResolution> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mode = await this.resolveForWorkspace(workspaceId)
    return { defaultContextMode: mode, canEdit: role === 'owner' || role === 'admin' }
  }

  /**
   * Le mode EFFECTIF d'un espace — l'unique méthode qu'un lecteur côté serveur
   * appellerait (GA-26). Une ligne introuvable ou une valeur vide retombe sur
   * `DEFAULT_LAURA_CONTEXT_MODE`, jamais une exception sur un chemin de lecture.
   */
  async resolveForWorkspace(workspaceId: string | null | undefined): Promise<LauraContextMode> {
    if (!workspaceId) return DEFAULT_LAURA_CONTEXT_MODE
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return (workspace?.default_context_mode as LauraContextMode | undefined) || DEFAULT_LAURA_CONTEXT_MODE
  }

  /**
   * #2451.1 — le défaut de l'espace ACTIF d'un utilisateur, pour les surfaces
   * qui lisent le mode côté serveur (Découvrir, Analyser, contrat de contexte)
   * quand l'appel n'en porte aucun. Un espace illisible retombe sur
   * `DEFAULT_LAURA_CONTEXT_MODE` : le chemin d'avant ce réglage, jamais une
   * exception sur une lecture.
   */
  async resolveForUser(userId: string): Promise<LauraContextMode> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return await this.resolveForWorkspace(workspaceId)
    } catch {
      return DEFAULT_LAURA_CONTEXT_MODE
    }
  }

  /**
   * `PATCH /workspaces/laura-mode` — propriétaire ou administrateur seul, même
   * porte que le marché et le fuseau : un responsable d'agence (`team:manage`)
   * ne pose pas un réglage qui change le comportement de TOUT l'espace.
   */
  async setDefaultContextMode(userId: string, mode: LauraContextMode): Promise<WorkspaceDefaultContextModeResolution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertRole(userId, workspaceId, ['owner', 'admin'])

    const result = await this.workspaces.update({ id: workspaceId }, { default_context_mode: mode })
    if (result.affected === 0) throw new NotFoundException('Espace de travail introuvable')

    return { defaultContextMode: mode, canEdit: true }
  }
}
