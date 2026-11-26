import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { parseTierLabel, tierToPriority, type SellerHypotheses } from '@bellum/contracts'
import { TargetListEntity } from '../../database/entities/target-list.entity'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'

/** Une liste ouverte par l'import, et les comptes qu'elle contient déjà. */
export type ImportTargetListHandle = { id: string; name: string; accountIds: Set<string> }

/**
 * #3753 — l'écriture de la LISTE CIBLE qu'un fichier de comptes tiérés propose.
 *
 * Écrit par repositories, comme le reste de l'import (voir `import.module.ts`) :
 * `TargetListsService.addItem` exige un utilisateur connecté, un cloisonnement de
 * portefeuille et lit chaque fiche une à une — 291 lignes, 291 allers-retours.
 *
 * Ce que ce chemin NE fait PAS, par construction :
 *  · il ne lance aucune analyse (aucun débit de crédits) — il n'a aucun accès à
 *    l'analyse, seulement aux deux tables de liste ;
 *  · il ne calcule aucun score : le tier est LA lettre de l'ESN, projetée sur
 *    `priority` par `tierToPriority`, jamais un pourcentage (doctrine c26) ;
 *  · il ne présente pas les problématiques / projets IT comme des faits : ils
 *    restent des `seller_hypotheses` — fournies, non vérifiées.
 */
@Injectable()
export class ImportTargetListWriter {
  constructor(
    @InjectRepository(TargetListEntity) private readonly lists: Repository<TargetListEntity>,
    @InjectRepository(TargetListItemEntity) private readonly items: Repository<TargetListItemEntity>,
  ) {}

  /**
   * Ouvre la liste de ce nom, ou la crée. Une REPRISE d'import retrouve la liste
   * commencée au lieu d'en poser une seconde.
   */
  async open(workspaceId: string, userId: string, name: string): Promise<ImportTargetListHandle> {
    const found = await this.lists.findOne({ where: { workspace_id: workspaceId, name, source: 'import' } })
    const list =
      found ??
      (await this.lists.save(
        this.lists.create({
          workspace_id: workspaceId,
          created_by: userId,
          name,
          objective: null,
          owner_user_id: null,
          team: null,
          visibility: 'workspace',
          source: 'import',
          source_query: null,
          status: 'draft',
          next_action: null,
          sequence_id: null,
          prospecting_session_id: null,
        }),
      ))
    const existing = found ? await this.items.find({ where: { target_list_id: list.id, removed_at: IsNull() } }) : []
    const accountIds = new Set(existing.map(item => item.account_id).filter((id): id is string => id != null))
    return { id: list.id, name: list.name, accountIds }
  }

  /** `true` si la ligne a posé un élément ; `false` si le compte était déjà dans la liste. */
  async attach(
    list: ImportTargetListHandle,
    workspaceId: string,
    accountId: string,
    row: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    if (list.accountIds.has(accountId)) return false
    const tier = parseTierLabel(row['tier'])
    await this.items.save(
      this.items.create({
        target_list_id: list.id,
        workspace_id: workspaceId,
        account_id: accountId,
        contact_id: null,
        selection_reason: textOrNull(row['selection_reason']),
        // Pas de tier lisible = ni lettre ni priorité : jamais « C » par défaut.
        tier_label: tier,
        priority: tier ? tierToPriority(tier) : null,
        seller_hypotheses: hypothesesOf(row),
        owner_user_id: null,
        work_status: 'to_review',
        provenance: 'import',
        next_action: null,
        notes: null,
        refreshed_at: null,
        removed_at: null,
        removal_reason: null,
      }),
    )
    list.accountIds.add(accountId)
    return true
  }
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function hypothesesOf(row: Readonly<Record<string, unknown>>): SellerHypotheses | null {
  const addressable_issues = textOrNull(row['addressable_issues'])
  const upcoming_it_projects = textOrNull(row['upcoming_it_projects'])
  if (!addressable_issues && !upcoming_it_projects) return null
  return { addressable_issues, upcoming_it_projects }
}
