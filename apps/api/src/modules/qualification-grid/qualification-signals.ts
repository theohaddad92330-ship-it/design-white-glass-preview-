import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { matchTargetLevel, prepareTargetPersonas } from '../contacts/target-persona-match'

/**
 * #3755.8 — LES SIGNAUX QUE LA GRILLE LIT AILLEURS : le TIER du compte (S1) et
 * le NIVEAU DU DÉCIDEUR (S2).
 *
 * Ils viennent de deux imports livrés en parallèle — la liste cible avec son
 * tier (`target_list_items.tier_label`, #3753) et les personas cibles de l'ESN
 * (`esn_target_personas`, #3754). La grille dépend d'un PORT ; sans signal importé
 * il rend `null` et le critère correspondant est « non évaluable » (hors
 * dénominateur), jamais une note devinée par le modèle.
 */
export const QUALIFICATION_SIGNALS = Symbol('QUALIFICATION_SIGNALS')

export interface QualificationSignals {
  /** Le tier du compte tel que l'espace l'a importé (« Tier 1 »…), ou `null`. */
  getTier(accountId: string, workspaceId: string): Promise<string | null>
  /** Le niveau de décideur atteint sur le compte, d'après les personas cibles, ou `null`. */
  getDecisionLevel(accountId: string, workspaceId: string): Promise<string | null>
}

/**
 * #3755.8 — LE BRANCHEMENT (intégration du pack de contexte). Lecture seule, une requête
 * par signal, par le `DataSource` (comme `readAccount`) : aucun service d'un autre module
 * n'est injecté (GA-07). Seul un helper PUR (`target-persona-match`) est partagé.
 *
 * Mapping vers les points du critère (la grille ne l'écrit pas) : tier A / niveau 1 = poids
 * MAX, B / niveau 2 = 2/3, C / niveau 3 = 1/3, niveau 4 = 0. Le port rend le RANG nommé ; le
 * barème (max/2-3/1-3/0) est celui que l'évaluateur applique au poids du critère. Rien
 * d'importé → `null` → critère « non évaluable » (hors dénominateur), jamais une note devinée.
 */
@Injectable()
export class ImportedQualificationSignals implements QualificationSignals {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
  ) {}

  /** `target_list_items.tier_label` (#3753) : l'élément le plus récent, listes partagées de l'espace. */
  async getTier(accountId: string, workspaceId: string): Promise<string | null> {
    const rows: { tier_label: string | null }[] = await this.dataSource.query(
      `SELECT i.tier_label FROM target_list_items i
         JOIN target_lists l ON l.id = i.target_list_id AND l.workspace_id = i.workspace_id
        WHERE i.account_id = $1 AND i.workspace_id = $2
          AND i.removed_at IS NULL AND i.tier_label IS NOT NULL AND l.visibility = 'workspace'
        ORDER BY i.updated_at DESC LIMIT 1`,
      [accountId, workspaceId],
    )
    const tier = rows[0]?.tier_label
    return tier === 'A' || tier === 'B' || tier === 'C' ? `Tier ${tier}` : null
  }

  /** Meilleur niveau (min 1-4) des contacts du compte rapprochés à `esn_target_personas` (#3754). */
  async getDecisionLevel(accountId: string, workspaceId: string): Promise<string | null> {
    const personas: { title: string; decision_level: number }[] = await this.dataSource.query(
      `SELECT title, decision_level FROM esn_target_personas WHERE workspace_id = $1`,
      [workspaceId],
    )
    if (personas.length === 0) return null
    // Repository (GA-405 : pas de lecture brute de `contacts` de plus) ; `deleted_at` : on archive, on n'efface pas.
    const contacts = await this.contacts.find({
      select: { title: true },
      where: { account_id: accountId, workspace_id: workspaceId, deleted_at: IsNull() },
    })
    const prepared = prepareTargetPersonas(personas)
    let best: number | null = null
    for (const contact of contacts) {
      const level = matchTargetLevel(contact.title, prepared)
      if (level !== null && (best === null || level < best)) best = level
    }
    return best === null ? null : `Niveau ${best}`
  }
}

/** Le critère « tier du compte » (S1 de la matrice), reconnu à son libellé. */
export const TIER_CRITERION_RE = /\btiers?\b|\bsegment(ation)?\s+(du\s+)?compte/i
/** Le critère « niveau du décideur » (S2 de la matrice), reconnu à son libellé. */
export const DECISION_LEVEL_CRITERION_RE =
  /(niveau|level|rang).{0,25}(d[ée]cid|decision)|d[ée]cideur|decision[- ]maker/i
