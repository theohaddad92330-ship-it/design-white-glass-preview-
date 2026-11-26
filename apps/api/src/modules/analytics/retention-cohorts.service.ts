import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { construireCohortes, type MoisActif, type RapportRetention } from './retention-cohorts'

/**
 * #1658.1 — LA LECTURE de la rétention par cohorte. Deux requêtes, aucune écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE LIT, ET CE QU'IL REFUSE DE LIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il lit `workspaces` (le dénominateur : qui s'est inscrit quand) et
 * `user_actions` (le numérateur : qui a validé une action, quel mois).
 *
 * Il ne lit PAS `user_last_seen`. Ce n'est pas un oubli, c'est la règle de
 * l'issue — « actif = au moins une action validée dans le mois. Pas une
 * connexion » — et une garde la tient (`retention-cohorts.spec.ts`), parce que
 * le service voisin `admin-client-health.service` fait légitimement l'inverse
 * pour SA question et que la tentation de « compléter » est réelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AGRÉGATION SE FAIT EN SQL, LA DÉCISION EN TYPESCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * `user_actions` est la table la plus écrite du produit : la ramener ligne à
 * ligne pour la grouper en mémoire serait un transfert sans borne. Le SQL rend
 * donc des paires DISTINCTES (espace, mois) — quelques milliers de lignes au
 * plus, un espace ne pouvant produire que douze paires utiles. Tout ce qui se
 * DÉCIDE (les mois écoulés, les cellules vides, les dénominateurs) vit dans
 * `retention-cohorts.ts`, pur et testé sans base.
 *
 * ⚠️ LE MOIS SE TRONQUE EN **UTC**, des deux côtés. `date_trunc('month', x)` sur
 * un `timestamptz` emploie le fuseau de la SESSION Postgres — donc celui de la
 * machine, donc une grille qui changerait selon l'endroit d'où on la regarde.
 * Le `AT TIME ZONE 'UTC'` explicite le rend déterministe, et il dit la même
 * chose que `moisDe()` côté TypeScript : un mois est un span du calendrier.
 *
 * ⚠️ LES ESPACES DE DÉMO SORTENT DU CALCUL. Une salle de démo n'est le compte de
 * personne : elle est créée par le back-office, recyclée toutes les trente
 * minutes, et son activité est celle d'un semis. Les compter ferait une cohorte
 * mensuelle de huit espaces parfaitement « retenus » qui n'ont jamais eu de
 * client derrière — c'est-à-dire un taux de rétention inventé.
 *
 * ⚠️ `maintenant` EST UN PARAMÈTRE. Le contrôleur passe l'horloge : un service
 * qui la lit lui-même n'est pas testable sans la figer.
 */
/**
 * Le mois d'une action, `YYYY-MM`, tronqué en UTC.
 *
 * Écrit une seule fois et réemployé dans le `SELECT` comme dans le `GROUP BY` :
 * deux copies d'une expression de regroupement divergent au premier ajustement,
 * et Postgres n'aurait alors plus de raison de les rapprocher.
 */
const MOIS_UTC = "to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM')"

@Injectable()
export class RetentionCohortsService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
  ) {}

  async cohortes(maintenant: Date): Promise<RapportRetention> {
    const [espaces, moisActifs] = await Promise.all([this.espacesInscrits(), this.moisActifs()])
    return construireCohortes({ espaces, moisActifs, maintenant })
  }

  /** Les espaces RÉELS, avec leur date d'inscription. Les salles de démo sortent. */
  private async espacesInscrits(): Promise<{ workspaceId: string; createdAt: Date }[]> {
    const rows = await this.workspaces
      .createQueryBuilder('w')
      .select('w.id', 'workspaceId')
      .addSelect('w.created_at', 'createdAt')
      .where('w.is_demo = false')
      // Une salle du pool de démo porte `demo_slot_index`, et rien ne garantit
      // qu'elle porte AUSSI `is_demo` : les deux colonnes ont été posées par deux
      // migrations différentes. On écarte sur les deux faits, pas sur un seul.
      .andWhere('w.demo_slot_index IS NULL')
      .getRawMany<{ workspaceId: string; createdAt: Date | string }>()

    return rows.map(row => ({ workspaceId: row.workspaceId, createdAt: new Date(row.createdAt) }))
  }

  /**
   * Les paires DISTINCTES (espace, mois-d'activité).
   *
   * ⚠️ `workspace_id IS NOT NULL` : la colonne est nullable tant que le passage
   * `user_id → workspace_id` n'est pas terminé (voir l'entité). Une ligne sans
   * espace ne peut être rattachée à aucune cohorte — et lui en deviner une
   * serait exactement la donnée inventée que ce dépôt refuse. Elle est donc
   * exclue du NUMÉRATEUR ; elle ne retire rien à aucun dénominateur, qui vient
   * de `workspaces`.
   */
  private async moisActifs(): Promise<MoisActif[]> {
    const rows = await this.actions
      .createQueryBuilder('a')
      .select('a.workspace_id', 'workspaceId')
      .addSelect(MOIS_UTC, 'mois')
      .where('a.workspace_id IS NOT NULL')
      .groupBy(`a.workspace_id, ${MOIS_UTC}`)
      .getRawMany<{ workspaceId: string; mois: string }>()

    return rows.map(row => ({ workspaceId: row.workspaceId, mois: row.mois }))
  }
}
