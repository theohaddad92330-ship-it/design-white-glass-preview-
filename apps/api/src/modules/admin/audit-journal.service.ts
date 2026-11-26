import {
  BACKOFFICE_AUDIT_CATEGORIES,
  type BackofficeAuditCategory,
  type BackofficeAuditEntry,
  type BackofficeAuditOutcome,
} from '@bellum/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, LessThan, MoreThanOrEqual, Repository, type FindOptionsWhere } from 'typeorm'
import { BackofficeAuditEventEntity } from '../../database/entities/backoffice-audit-event.entity'
import {
  describePurge,
  purgeableWindows,
  retentionPlan,
  type PurgeTally,
  type RetentionWindow,
} from './audit-retention'

/**
 * LE JOURNAL D'AUDIT UNIQUE DU BACK-OFFICE — écriture, lecture, purge (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE N'A PAS, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'y a **aucune méthode qui supprime une ligne par son identifiant**, aucune
 * qui en modifie une, aucune qui en masque une. Ce n'est pas une convention à
 * respecter : c'est l'absence de code. « On retire le MOYEN, pas seulement la
 * permission » — une porte cachée dans une interface se rouvre au premier
 * refactor ; une méthode qui n'existe pas ne s'appelle pas.
 *
 * La seule écriture destructive est {@link purgeExpired}, qui n'accepte AUCUN
 * identifiant : elle ne sait effacer que « tout ce qui a dépassé la fenêtre de
 * SA catégorie », et elle ne connaît pas les catégories permanentes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ÉCRITURE EST « AU MIEUX », COMME LE JOURNAL D'ACCÈS
 * ─────────────────────────────────────────────────────────────────────────────
 * La ligne d'audit est écrite APRÈS que le geste a eu lieu. Faire échouer la
 * requête de l'opérateur parce que l'`INSERT` du journal a échoué lui rendrait
 * une erreur pour une action qui, elle, a bien été faite — c'est-à-dire le pire
 * des deux mondes : le geste passé ET l'opérateur convaincu du contraire.
 *
 * L'échec n'est pas silencieux pour autant : il part dans `logger.error`, donc
 * dans Sentry. Une trace qu'on perd doit se voir.
 *
 * ⚠️ Ce choix est l'inverse de celui du journal d'incarnation, où la ligne est
 * commise AVANT que le jeton ne soit rendu. Là-bas la trace CONDITIONNE le
 * geste ; ici elle l'accompagne. La différence est que l'incarnation se décide
 * dans l'API, alors qu'ici le geste a déjà eu lieu chez un tiers.
 */
@Injectable()
export class AuditJournalService {
  private readonly logger = new Logger(AuditJournalService.name)

  /** Le plafond DUR d'une page. `?limit=999999` ne sort pas la table entière. */
  private static readonly MAX_PAGE = 200

  constructor(
    @InjectRepository(BackofficeAuditEventEntity)
    private readonly events: Repository<BackofficeAuditEventEntity>,
  ) {}

  /** Enregistre une opération. Ne jette JAMAIS — voir le docblock de la classe. */
  async record(entry: BackofficeAuditEntry): Promise<void> {
    try {
      await this.events.insert({
        operation: entry.operation,
        category: entry.category,
        outcome: entry.outcome,
        actor_email: entry.actorEmail ?? null,
        actor_role: entry.actorRole ?? null,
        subject_type: entry.subjectType ?? null,
        subject_id: entry.subjectId ?? null,
        subject_label: entry.subjectLabel ?? null,
        status_code: entry.statusCode ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
        country: entry.country ?? null,
      })
    } catch (error) {
      this.logger.error('Journal d’audit back-office : écriture perdue', {
        error,
        tags: { 'backoffice.op': 'audit_journal_write', 'audit.operation': entry.operation },
      })
    }
  }

  /**
   * Une page du journal, ET les comptes qui empêchent un filtre de faire
   * disparaître une catégorie.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * « AUCUN FILTRE QUI MASQUE UNE CATÉGORIE ENTIÈRE » — COMMENT C'EST TENU
   * ─────────────────────────────────────────────────────────────────────────
   * L'issue est catégorique, et elle a raison : « un journal d'audit dans lequel
   * on peut faire disparaître les impersonations ne vaut rien ». Un filtre reste
   * pourtant nécessaire — sans lui on ne trouve rien dans cent mille lignes.
   *
   * La réponse est que le filtre RESTREINT la page, il ne change JAMAIS les
   * comptes :
   *  · `total` est le nombre de lignes de la table ENTIÈRE, sans aucun filtre ;
   *  · `categoryCounts` porte les CINQ catégories, TOUJOURS, comptées sans le
   *    filtre de catégorie — sinon filtrer sur « ordinaire » ferait tomber le
   *    compte des impersonations à zéro, ce qui est précisément le mensonge
   *    qu'on refuse ;
   *  · `matching` est le nombre de lignes que la page décrit.
   *
   * Un opérateur qui filtre voit donc toujours, à l'écran, qu'il existe N
   * impersonations qu'il n'est pas en train de regarder.
   */
  async search(query: AuditSearchQuery): Promise<AuditSearchResult> {
    const limit = Math.min(Math.max(Math.floor(query.limit ?? 50) || 0, 1), AuditJournalService.MAX_PAGE)
    const offset = Math.max(Math.floor(query.offset ?? 0) || 0, 0)

    const [entries, matching, total, counts] = await Promise.all([
      this.events.find({
        where: this.where(query, { withCategory: true }),
        order: { created_at: 'DESC' },
        take: limit,
        skip: offset,
      }),
      this.events.count({ where: this.where(query, { withCategory: true }) }),
      // ⚠️ SANS AUCUN FILTRE. C'est le chiffre qui dit « le journal contient
      // ceci », que l'écran affiche à côté de « votre filtre en montre cela ».
      this.events.count(),
      this.countByCategory(query),
    ])

    return { entries, matching, total, categoryCounts: counts, limit, offset }
  }

  /**
   * Les cinq comptes par catégorie, TOUJOURS les cinq.
   *
   * ⚠️ Le résultat est initialisé à zéro sur la taxonomie complète AVANT d'y
   * verser ce que la base rend. Une catégorie absente du `GROUP BY` (aucune
   * ligne ce mois-ci) doit s'afficher « 0 » et pas disparaître de la liste : une
   * catégorie qui disparaît de l'écran est exactement ce que l'issue refuse.
   * C'est le seul « 0 » légitime de cet écran — ici, zéro est VRAI : on a
   * compté, et il n'y en avait aucune.
   */
  private async countByCategory(query: AuditSearchQuery): Promise<Record<BackofficeAuditCategory, number>> {
    const counts = Object.fromEntries(BACKOFFICE_AUDIT_CATEGORIES.map(category => [category, 0])) as Record<
      BackofficeAuditCategory,
      number
    >

    const builder = this.events
      .createQueryBuilder('e')
      .select('e.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.category')

    // Les autres filtres s'appliquent — mais JAMAIS celui de catégorie.
    for (const [column, value] of Object.entries(this.equalities(query, { withCategory: false }))) {
      builder.andWhere(`e.${column} = :${column}`, { [column]: value })
    }
    if (query.since) builder.andWhere('e.created_at >= :since', { since: query.since })
    if (query.until) builder.andWhere('e.created_at < :until', { until: query.until })

    for (const row of await builder.getRawMany<{ category: string; count: string }>()) {
      if ((BACKOFFICE_AUDIT_CATEGORIES as readonly string[]).includes(row.category)) {
        counts[row.category as BackofficeAuditCategory] = Number(row.count) || 0
      }
    }
    return counts
  }

  /**
   * Les seules clauses d'ÉGALITÉ du filtre — `colonne → valeur`.
   *
   * ⚠️ Séparées des bornes de date à dessein : `countByCategory` les recopie
   * dans un `QueryBuilder` sous la forme `e.<colonne> = :<colonne>`, et un
   * opérateur TypeORM (`Between`, `LessThan`) n'y aurait aucun sens. Les
   * mélanger produirait une requête qui compare une colonne à un objet.
   */
  private equalities(query: AuditSearchQuery, options: { withCategory: boolean }): Record<string, string> {
    const equalities: Record<string, string> = {}
    if (options.withCategory && query.category) equalities['category'] = query.category
    if (query.outcome) equalities['outcome'] = query.outcome
    if (query.actorEmail) equalities['actor_email'] = query.actorEmail
    if (query.operation) equalities['operation'] = query.operation
    return equalities
  }

  /** Le filtre complet — égalités ET bornes de date, pour `find` / `count`. */
  private where(
    query: AuditSearchQuery,
    options: { withCategory: boolean },
  ): FindOptionsWhere<BackofficeAuditEventEntity> {
    const where = { ...this.equalities(query, options) } as FindOptionsWhere<BackofficeAuditEventEntity>
    if (query.since && query.until) where.created_at = Between(query.since, query.until)
    else if (query.since) where.created_at = MoreThanOrEqual(query.since)
    else if (query.until) where.created_at = LessThan(query.until)
    return where
  }

  /** Le plan de rétention tel que l'écran l'affiche — une entrée par catégorie. */
  plan(now: Date): RetentionWindow[] {
    return retentionPlan(now)
  }

  /**
   * LA PURGE DE RÉTENTION — et la ligne qui la raconte.
   *
   * ⚠️ Aucun identifiant n'entre ici, et aucune catégorie non plus : la méthode
   * ne sait effacer que ce que le PLAN désigne. Les catégories permanentes
   * (`suppression`) n'ont pas de `cutoff`, donc `purgeableWindows` ne les rend
   * jamais — il n'existe aucun chemin par lequel elles pourraient partir.
   *
   * ⚠️ ELLE ÉCRIT CE QU'ELLE A FAIT, dans le journal lui-même, en catégorie
   * `suppression` — donc PERMANENTE. Une rétention qui expire ne doit pas se
   * traduire par un trou silencieux : sans cette ligne, un journal qui rétrécit
   * serait indiscernable d'un journal qu'on a nettoyé. Elle n'est écrite que
   * lorsque quelque chose est réellement parti : une purge qui n'efface rien
   * n'a rien à raconter, et une ligne quotidienne « rien à faire » noierait
   * celles qui comptent.
   *
   * ⚠️ `now` est un PARAMÈTRE. Voir `audit-retention.ts`.
   */
  async purgeExpired(now: Date): Promise<PurgeTally[]> {
    const tallies: PurgeTally[] = []

    for (const window of purgeableWindows(now)) {
      try {
        const result = await this.events.delete({
          category: window.category,
          created_at: LessThan(window.cutoff),
        })
        tallies.push({
          category: window.category,
          months: window.months as number,
          cutoff: window.cutoff,
          deleted: result.affected ?? 0,
        })
      } catch (error) {
        // Une catégorie en échec n'arrête pas les autres : la fenêtre de
        // `permission` n'a rien à voir avec celle d'`ordinaire`, et abandonner
        // les quatre restantes parce que l'une a échoué ferait vieillir la
        // table entière sur un incident local.
        this.logger.error('Purge du journal d’audit en échec pour une catégorie — les lignes sont intactes', {
          error,
          tags: { 'backoffice.op': 'audit_journal_purge', 'audit.category': window.category },
        })
      }
    }

    const deleted = tallies.reduce((sum, tally) => sum + tally.deleted, 0)
    if (deleted > 0) {
      await this.record({
        operation: 'audit.retention_purge',
        // ⚠️ `suppression` : la trace d'une purge est PERMANENTE, sinon elle
        // s'effacerait elle-même deux ans plus tard.
        category: 'suppression',
        outcome: 'succes',
        subjectType: 'audit_journal',
        subjectLabel: `${deleted} ligne(s) échue(s)`,
        detail: describePurge(tallies),
      })
    }

    return tallies
  }
}

/** Ce qu'un appelant peut restreindre. Aucun champ ne peut CACHER une catégorie. */
export type AuditSearchQuery = {
  category?: BackofficeAuditCategory
  outcome?: BackofficeAuditOutcome
  actorEmail?: string
  operation?: string
  since?: Date
  until?: Date
  limit?: number
  offset?: number
}

export type AuditSearchResult = {
  entries: BackofficeAuditEventEntity[]
  /** Combien de lignes le filtre décrit. */
  matching: number
  /** Combien le journal en contient, TOUS filtres ignorés. */
  total: number
  /** Les cinq catégories, toujours les cinq, sans le filtre de catégorie. */
  categoryCounts: Record<BackofficeAuditCategory, number>
  limit: number
  offset: number
}
