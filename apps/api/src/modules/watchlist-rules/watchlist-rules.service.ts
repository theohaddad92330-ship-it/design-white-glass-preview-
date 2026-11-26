import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateWatchlistRuleInput, WatchlistRule } from '@bellum/contracts'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { WatchlistRuleEntity } from './watchlist-rule.entity'

/**
 * CRUD des règles personnelles de veille (§11), scopé au WORKSPACE actif.
 *
 * Le scoping workspace est la barrière de sécurité : l'API tourne en service-role
 * (BYPASSRLS), donc jamais de lookup par `id` seul — chaque lecture/suppression
 * passe par `where workspace_id = :wsId` (résolu par {@link WorkspaceContextService}).
 * `user_id` est conservé comme attribution « créée par », mais ne sert pas de
 * clé de lecture (la règle est partagée dans l'équipe).
 */
@Injectable()
export class WatchlistRulesService {
  constructor(
    @InjectRepository(WatchlistRuleEntity)
    private readonly rules: Repository<WatchlistRuleEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Toutes les règles du workspace actif, plus récentes d'abord. */
  async list(userId: string): Promise<WatchlistRule[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.rules.find({
      where: workspaceScopeWhere(workspaceId),
      order: { created_at: 'DESC' },
    })
    return rows.map(toDto)
  }

  /**
   * Ajoute une règle au workspace actif. Idempotent : une règle identique
   * (workspace, type, valeur) renvoie l'existante au lieu de dupliquer — l'index
   * unique en base est le filet, mais on court-circuite avant pour renvoyer la
   * ligne réelle sans lever d'erreur de conflit.
   */
  async create(userId: string, input: CreateWatchlistRuleInput): Promise<WatchlistRule> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.rules.findOne({
      where: { ...workspaceScopeWhere(workspaceId), kind: input.kind, value: input.value },
    })
    if (existing) return toDto(existing)

    const saved = await this.rules.save(
      this.rules.create({
        user_id: userId,
        workspace_id: workspaceId,
        kind: input.kind,
        value: input.value,
      }),
    )
    return toDto(saved)
  }

  /**
   * Supprime une règle du workspace actif. Scopé (id ET workspace) — jamais par
   * id seul : une règle d'un autre workspace n'est pas atteignable. Inconnue /
   * hors-workspace → 404, sans révéler qu'elle existe ailleurs.
   */
  async remove(userId: string, id: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.rules.delete({ id, ...workspaceScopeWhere(workspaceId) })
    if ((result.affected ?? 0) === 0) {
      throw new NotFoundException('Règle de veille introuvable')
    }
  }
}

/** Ligne DB → forme API (jamais les colonnes internes user_id/workspace_id). */
function toDto(row: WatchlistRuleEntity): WatchlistRule {
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    created_at: row.created_at?.toISOString() ?? new Date(0).toISOString(),
  }
}
