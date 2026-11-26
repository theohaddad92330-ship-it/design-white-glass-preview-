import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import {
  construireEntonnoir,
  type EspaceInscrit,
  type EtapeEntonnoirCle,
  type FranchissementEtape,
  type MoisActif,
  type RapportEntonnoir,
} from './onboarding-funnel'

/**
 * #1686 — LA LECTURE de l'entonnoir d'onboarding par cohorte. Six requêtes en
 * lecture, aucune écriture (trois de plus depuis #1686.5 — voir plus bas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FAÇONS DE RATTACHER UN ÉVÉNEMENT À UN ESPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * `integration_connected`, `analysis_completed` et `analysis_started` portent
 * déjà `workspace_id` sur l'événement lui-même (`AttioService` /
 * `PipedriveService` / … pour le premier, `AnalysisService.launchAnalysis` pour
 * les deux autres — `analysis.service.ts:1182`) — lecture directe, sans
 * jointure.
 *
 * `onboarding_started` et `onboarding_completed` n'émettent que `userId`
 * (`OnboardingService.advanceStage` / `.complete`) : ils sont rattachés à
 * l'espace COURANT du membre via `workspace_members`. C'est la MÊME
 * approximation, documentée, que `TeamKpisService.activationByWorkspace` : un
 * membre qui a changé d'équipe depuis franchira son onboarding dans SA cohorte
 * ACTUELLE, pas celle où il l'a réellement franchi. Deux chemins qui
 * refont-écriraient cette dérivation divergeraient un jour — celui-ci reprend
 * le seul déjà établi dans ce module plutôt que d'en inventer un second.
 * `deuxieme_session` (#1686.5, `user_last_seen`) suit la MÊME approximation,
 * pour la MÊME raison : elle aussi ne porte qu'un `user_id`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1686.5 — TROIS SOURCES DE PLUS, DEUX TABLES DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `premiere_action_validee` lit `user_actions` (MIN(created_at) par
 *    espace) — la même table que `RetentionCohortsService`, pas
 *    `product_events` : une action VALIDÉE (message envoyé, action de plan
 *    terminée, export) n'est pas un événement produit, c'est une ligne de la
 *    table la plus écrite du dépôt (voir le docblock de tête d'
 *    `onboarding-funnel.ts`, « PREMIÈRE ACTION VALIDÉE »).
 *  · `deuxieme_session` lit `user_last_seen.previous_seen_at` — non NULL veut
 *    dire « une deuxième session a eu lieu » (voir « DEUXIÈME SESSION » côté
 *    pur). Lue en SQL brut, comme `workspace_members` déjà utilisée par
 *    `franchissementsParMembre` : ni l'une ni l'autre n'a besoin d'un
 *    repository TypeORM dédié.
 *  · `actif_j30` a besoin des paires (espace, mois-actif) de `user_actions` —
 *    PAS d'un « premier instant » comme les six autres colonnes. La requête
 *    (`moisActifsUserActions`) est la MÊME forme que
 *    `RetentionCohortsService.moisActifs` (#1658.1) — dupliquée plutôt
 *    qu'importée : ce service duplique déjà `espacesInscrits()` de la même
 *    façon, pour la même raison (chaque service de ce module possède sa
 *    propre petite projection SQL ; seule la DÉCISION, dans
 *    `onboarding-funnel.ts`, est partagée — GA-26).
 *
 * `UserActionEntity` est déjà déclarée dans `analytics.module.ts`
 * (`TypeOrmModule.forFeature`, consommée par `RetentionCohortsService`) :
 * zéro changement à ce fichier partagé pour ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AGRÉGATION SE FAIT EN SQL, LA DÉCISION EN TYPESCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Même partage que `RetentionCohortsService` : le SQL rend des paires
 * DISTINCTES (espace, étape) avec leur PREMIER instant — quelques centaines de
 * lignes au plus (sept étapes, un espace ne peut en produire qu'une par étape
 * après le `MIN`). Tout ce qui se DÉCIDE (mesurée / non mesurée, la médiane du
 * délai) vit dans `onboarding-funnel.ts`, pur et testé sans base.
 *
 * ⚠️ LES ESPACES DE DÉMO SORTENT DU CALCUL, sur les DEUX faits qui les
 * marquent — même raison que la rétention (#1658.1) : une salle recyclée
 * toutes les trente minutes n'a jamais eu de client derrière. Les trois
 * requêtes neuves n'ont PAS besoin de leur propre filtre démo : elles ne
 * produisent que des lignes candidates, et `construireEntonnoir` ne retient
 * que celles dont le `workspaceId` apparaît dans `espacesInscrits()` — qui,
 * lui, filtre déjà les salles de démo. Une salle de démo peut donc apparaître
 * dans `moisActifsUserActions()` sans jamais compter dans aucun dénominateur.
 *
 * ⚠️ `maintenant` EST UN PARAMÈTRE. Le contrôleur passe l'horloge.
 */
@Injectable()
export class OnboardingFunnelService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
  ) {}

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.events.manager.query(sql, params) as Promise<T[]>
  }

  async entonnoir(maintenant: Date): Promise<RapportEntonnoir> {
    const [espaces, directs, parMembre, deuxiemeSession, premiereAction, moisActifs] = await Promise.all([
      this.espacesInscrits(),
      this.franchissementsDirects(),
      this.franchissementsParMembre(),
      this.deuxiemeSessionParMembre(),
      this.premiereActionValidee(),
      this.moisActifsUserActions(),
    ])
    return construireEntonnoir({
      espaces,
      franchissements: [...directs, ...parMembre, ...deuxiemeSession, ...premiereAction],
      moisActifs,
      maintenant,
    })
  }

  /** Les espaces RÉELS, avec leur date d'inscription — même requête que
   *  `RetentionCohortsService.espacesInscrits` (#1658.1). */
  private async espacesInscrits(): Promise<EspaceInscrit[]> {
    const rows = await this.workspaces
      .createQueryBuilder('w')
      .select('w.id', 'workspaceId')
      .addSelect('w.created_at', 'createdAt')
      .where('w.is_demo = false')
      // Une salle du pool de démo porte `demo_slot_index`, et rien ne garantit
      // qu'elle porte AUSSI `is_demo` — les deux colonnes viennent de deux
      // migrations différentes. On écarte sur les deux faits, pas un seul.
      .andWhere('w.demo_slot_index IS NULL')
      .getRawMany<{ workspaceId: string; createdAt: Date | string }>()

    return rows.map(row => ({ workspaceId: row.workspaceId, createdAt: new Date(row.createdAt) }))
  }

  /**
   * `-- q:direct` — les étapes qui portent déjà `workspace_id` sur
   * l'événement. Une ligne sans espace ne peut être rattachée à aucune
   * cohorte : exclue du numérateur, comme dans la rétention.
   *
   * `analysis_started` (#1686.5) rejoint `analysis_completed` : la première
   * reste nécessaire pour {@link ETAPE_PREMIERE_VALEUR} (délai de 1686.4), la
   * seconde est la colonne affichée « Première analyse lancée ». Voir « ANALYSE
   * LANCÉE, PAS TERMINÉE » dans `onboarding-funnel.ts`.
   */
  private async franchissementsDirects(): Promise<FranchissementEtape[]> {
    const rows = await this.query<{ workspaceId: string; etape: EtapeEntonnoirCle; atteintLe: Date | string }>(
      `-- q:direct
       SELECT workspace_id AS "workspaceId", event_name AS "etape", MIN(occurred_at) AS "atteintLe"
       FROM product_events
       WHERE event_name = ANY($1::text[])
         AND workspace_id IS NOT NULL
       GROUP BY workspace_id, event_name`,
      [['integration_connected', 'analysis_completed', 'analysis_started']],
    )
    return rows.map(r => ({ workspaceId: r.workspaceId, etape: r.etape, atteintLe: new Date(r.atteintLe) }))
  }

  /**
   * `-- q:membre` — les étapes qui ne portent que `userId`, rattachées à
   * l'espace COURANT du membre. Voir le commentaire de tête du fichier pour
   * l'approximation que ça représente et pourquoi elle est acceptée.
   */
  private async franchissementsParMembre(): Promise<FranchissementEtape[]> {
    const rows = await this.query<{ workspaceId: string; etape: EtapeEntonnoirCle; atteintLe: Date | string }>(
      `-- q:membre
       SELECT m.workspace_id AS "workspaceId", e.event_name AS "etape", MIN(e.occurred_at) AS "atteintLe"
       FROM product_events e
       JOIN workspace_members m ON m.user_id = e.user_id
       WHERE e.event_name = ANY($1::text[])
       GROUP BY m.workspace_id, e.event_name`,
      [['onboarding_started', 'onboarding_completed']],
    )
    return rows.map(r => ({ workspaceId: r.workspaceId, etape: r.etape, atteintLe: new Date(r.atteintLe) }))
  }

  /**
   * `-- q:deuxieme_session` (#1686.5) — `user_last_seen.previous_seen_at`
   * non NULL veut dire « une session PRÉCÉDENTE existe », donc que la session
   * courante en est au moins une deuxième. `last_seen_at` (le début de la
   * session courante) sert de date de franchissement — voir « DEUXIÈME
   * SESSION » dans `onboarding-funnel.ts` pour la nuance sur sa précision.
   */
  private async deuxiemeSessionParMembre(): Promise<FranchissementEtape[]> {
    const rows = await this.query<{ workspaceId: string; atteintLe: Date | string }>(
      `-- q:deuxieme_session
       SELECT m.workspace_id AS "workspaceId", u.last_seen_at AS "atteintLe"
       FROM user_last_seen u
       JOIN workspace_members m ON m.user_id = u.user_id
       WHERE u.previous_seen_at IS NOT NULL`,
      [],
    )
    return rows.map(r => ({
      workspaceId: r.workspaceId,
      etape: 'deuxieme_session' as const,
      atteintLe: new Date(r.atteintLe),
    }))
  }

  /**
   * `-- q:premiere_action` (#1686.5) — la première ligne de `user_actions` par
   * espace, jamais `product_events`. Voir « PREMIÈRE ACTION VALIDÉE » dans
   * `onboarding-funnel.ts` : lancer une analyse est un CLIC, valider une
   * action suppose d'avoir déjà vu un dossier et d'avoir agi dessus.
   */
  private async premiereActionValidee(): Promise<FranchissementEtape[]> {
    const rows = await this.actions
      .createQueryBuilder('a')
      .select('a.workspace_id', 'workspaceId')
      .addSelect('MIN(a.created_at)', 'atteintLe')
      .where('a.workspace_id IS NOT NULL')
      .groupBy('a.workspace_id')
      .getRawMany<{ workspaceId: string; atteintLe: Date | string }>()

    return rows.map(r => ({
      workspaceId: r.workspaceId,
      etape: 'premiere_action_validee' as const,
      atteintLe: new Date(r.atteintLe),
    }))
  }

  /**
   * Les paires DISTINCTES (espace, mois-d'activité) — MÊME requête que
   * `RetentionCohortsService.moisActifs` (#1658.1), dupliquée plutôt
   * qu'importée (voir le docblock de tête). Consommée par `actif_j30`, qui
   * décide, CÔTÉ PUR, si le mois M1 de chaque cohorte y figure.
   */
  private async moisActifsUserActions(): Promise<MoisActif[]> {
    const rows = await this.actions
      .createQueryBuilder('a')
      .select('a.workspace_id', 'workspaceId')
      .addSelect("to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM')", 'mois')
      .where('a.workspace_id IS NOT NULL')
      .groupBy("a.workspace_id, to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM')")
      .getRawMany<{ workspaceId: string; mois: string }>()

    return rows.map(row => ({ workspaceId: row.workspaceId, mois: row.mois }))
  }
}
