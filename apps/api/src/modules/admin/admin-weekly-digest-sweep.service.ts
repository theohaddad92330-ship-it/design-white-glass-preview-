import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'

/**
 * #balayage-weekly-digest — 15/09/2026, Louis (« un balayage avec simulation
 * et compte affiché AVANT d'écrire, même forme que le balayage de
 * régénération des contextes » — voir `admin-profile-contexts.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAIT, ET CE QUE CE BALAYAGE ASSUME (pour la relecture juridique du
 * consentement aux notifications, en cours cette semaine)
 * ─────────────────────────────────────────────────────────────────────────────
 * `1785890000000-WeeklyDigestPreference` a ajouté `weekly_digest` en
 * `NOT NULL DEFAULT true` : additive, elle n'a RIEN réécrit — Postgres a
 * backfillé `true` sur toutes les lignes déjà là. `1792800260000-
 * NotificationOutboundDefaultsOff` a depuis baissé le DEFAULT à `false`, mais
 * son propre en-tête le dit : « Les comptes existants gardent donc leur
 * valeur… Un éventuel balayage des lignes écrites par le défaut de base est
 * une décision séparée — elle se simule et se compte avant d'écrire, elle ne
 * se glisse pas dans une migration. » C'est CE fichier. Un `true` backfillé
 * ou par défaut n'est PAS un consentement : personne n'a coché quoi que ce
 * soit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CRITÈRE — deux signatures PROUVÉES, jamais devinées
 * ─────────────────────────────────────────────────────────────────────────────
 * Voir {@link isInheritedWeeklyDigest} pour le détail. En résumé : (A) la
 * ligne porte `newsletter_last_entry_id`, colonne que seul
 * `ChangelogNewsletterService.stampMarker` écrit, par un `.insert()` qui omet
 * `weekly_digest` (preuve : `weekly-digest-insert-default.db.spec.ts`) ; (B)
 * la ligne existait avant que la colonne `weekly_digest` existe (lu dans
 * `_migrations`), donc aucun chemin applicatif n'a pu y écrire une valeur.
 * Dans les deux cas la ligne doit être INTACTE depuis sa création
 * (`updated_at === created_at`, sur TOUT champ — pas de conclusion sur un
 * champ précis à partir d'un autre, leçon de `mission-drift.service.ts`).
 *
 * Règle du dépôt pour toute écriture de masse : « le compte s'affiche avant
 * d'écrire ». `audit()` lit et compte, sans jamais écrire — `sweep()` relit
 * le MÊME compte et refuse (409) si la base a bougé entre les deux appels.
 * Réversible et tracé : `weekly_digest_swept_at` (migration
 * `1794100650321-WeeklyDigestSweptAt`) dit QUELLES lignes ont été touchées et
 * QUAND, distinct d'un opt-out réel (qui ne pose jamais cette date).
 *
 * ⚠️ Ce service ne DÉCLENCHE rien tout seul : `sweep` répond à un appel
 * opérateur explicite, `confirmCount` en main (voir le contrôleur). Lancer le
 * balayage en production reste un geste d'opérateur.
 */

const WEEKLY_DIGEST_MIGRATION_NAME = 'WeeklyDigestPreference1785890000000'

// Non exporté : consommé uniquement ici (`isInheritedWeeklyDigest`, `scan`) —
// le test importe `isInheritedWeeklyDigest` et dérive son type de paramètre
// via `Parameters<>`, il n'a pas besoin du nom (`pnpm lint:exports:types`).
type ScannedWeeklyDigestRow = {
  readonly id: string
  readonly userId: string
  readonly weeklyDigest: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly newsletterLastEntryId: string | null
}

/**
 * Une ligne compte comme HÉRITÉE (jamais un choix) si et seulement si :
 *  - elle porte `weekly_digest = true` (rien à balayer sinon) ;
 *  - elle n'a JAMAIS été réécrite depuis sa création (`updated_at ===
 *    created_at`) — condition commune aux deux signatures, dans le sens sûr
 *    uniquement : « zéro écriture depuis la création », jamais une date pour
 *    UN champ précis (`updated_at` bouge pour n'importe quel champ) ;
 *  - ET au moins une des deux signatures :
 *      (A) `newsletterLastEntryId !== null` — semée par `stampMarker`, qui
 *          n'écrit jamais `weekly_digest` ;
 *      (B) `createdAt` antérieure à l'exécution de la migration qui a ajouté
 *          la colonne (`columnAddedAt`, `null` si illisible — fail closed :
 *          (B) ne s'applique alors jamais, seule (A) peut encore compter).
 */
export function isInheritedWeeklyDigest(row: ScannedWeeklyDigestRow, columnAddedAt: Date | null): boolean {
  if (!row.weeklyDigest) return false
  if (row.updatedAt.getTime() !== row.createdAt.getTime()) return false
  const bySeedSignature = row.newsletterLastEntryId !== null
  const byPredatesColumn = columnAddedAt !== null && row.createdAt.getTime() < columnAddedAt.getTime()
  return bySeedSignature || byPredatesColumn
}

export type WeeklyDigestSweepAuditReport = {
  /** Toutes les lignes `weekly_digest = true` actuellement, éligibles ou non. */
  readonly trueCount: number
  /** Celles que `sweep()` toucherait — le critère hérité. */
  readonly eligibleCount: number
  readonly bySeedSignatureCount: number
  readonly byPredatesColumnCount: number
  /** ISO, ou `null` si la migration est introuvable dans `_migrations`. */
  readonly columnAddedAt: string | null
}

type SweepOutcome = 'balaye' | 'echec'

// Non exporté : consommé uniquement ici (`WeeklyDigestSweepReport.results`).
type SweepResultItem = {
  readonly userId: string
  readonly outcome: SweepOutcome
  readonly reason: string
}

export type WeeklyDigestSweepReport = {
  readonly confirmCount: number
  readonly results: readonly SweepResultItem[]
}

type PreferenceQueryRow = {
  id: string
  user_id: string
  weekly_digest: boolean
  created_at: Date
  updated_at: Date
  newsletter_last_entry_id: string | null
}

@Injectable()
export class AdminWeeklyDigestSweepService {
  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
  ) {}

  /** L'exécution réelle de `WeeklyDigestPreference` dans CETTE base, ou
   *  `null` si elle est introuvable — jamais devinée depuis le nom du
   *  fichier (qui ne date que l'écriture du code, pas son passage en prod). */
  private async columnAddedAt(): Promise<Date | null> {
    const rows = await this.prefs.manager.query<{ timestamp: string | number }[]>(
      `SELECT timestamp FROM _migrations WHERE name = $1`,
      [WEEKLY_DIGEST_MIGRATION_NAME],
    )
    const raw = rows[0]?.timestamp
    if (raw === undefined || raw === null) return null
    const ms = typeof raw === 'string' ? Number(raw) : raw
    return Number.isFinite(ms) ? new Date(ms) : null
  }

  /** Lit TOUT le stock `weekly_digest = true` une fois — `audit()` et
   *  `sweep()` comptent exactement la même chose. */
  private async scan(): Promise<{
    trueCount: number
    eligible: ScannedWeeklyDigestRow[]
    bySeedSignatureCount: number
    byPredatesColumnCount: number
    columnAddedAt: Date | null
  }> {
    const columnAddedAt = await this.columnAddedAt()
    const rows = (await this.prefs.find({
      where: { weekly_digest: true },
      select: ['id', 'user_id', 'weekly_digest', 'created_at', 'updated_at', 'newsletter_last_entry_id'],
    })) as PreferenceQueryRow[]

    const eligible: ScannedWeeklyDigestRow[] = []
    let bySeedSignatureCount = 0
    let byPredatesColumnCount = 0
    for (const row of rows) {
      const scanned: ScannedWeeklyDigestRow = {
        id: row.id,
        userId: row.user_id,
        weeklyDigest: row.weekly_digest,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        newsletterLastEntryId: row.newsletter_last_entry_id,
      }
      if (!isInheritedWeeklyDigest(scanned, columnAddedAt)) continue
      eligible.push(scanned)
      if (scanned.newsletterLastEntryId !== null) bySeedSignatureCount++
      else byPredatesColumnCount++
    }
    return { trueCount: rows.length, eligible, bySeedSignatureCount, byPredatesColumnCount, columnAddedAt }
  }

  /** Compte, sans jamais écrire. */
  async audit(): Promise<WeeklyDigestSweepAuditReport> {
    const { trueCount, eligible, bySeedSignatureCount, byPredatesColumnCount, columnAddedAt } = await this.scan()
    return {
      trueCount,
      eligibleCount: eligible.length,
      bySeedSignatureCount,
      byPredatesColumnCount,
      columnAddedAt: columnAddedAt ? columnAddedAt.toISOString() : null,
    }
  }

  /**
   * Refuse d'écrire si `confirmCount` ne correspond plus au compte ACTUEL —
   * la base a bougé entre l'audit et cet appel. Ne touche QUE les lignes
   * héritées ; `weekly_digest_swept_at` trace la date pour chacune.
   */
  async sweep(confirmCount: number): Promise<WeeklyDigestSweepReport> {
    const { eligible } = await this.scan()
    if (eligible.length !== confirmCount) {
      throw new ConflictException(
        `Le compte a bougé : ${eligible.length} ligne(s) sont désormais héritées ` +
          `(confirmCount=${confirmCount} attendu). Relance l'audit avant de rejouer.`,
      )
    }

    const results: SweepResultItem[] = []
    for (const row of eligible) {
      const sweptAt = new Date()
      try {
        await this.prefs.update({ id: row.id }, { weekly_digest: false, weekly_digest_swept_at: sweptAt })
        results.push({
          userId: row.userId,
          outcome: 'balaye',
          reason: `weekly_digest_swept_at = ${sweptAt.toISOString()}`,
        })
      } catch (err) {
        results.push({
          userId: row.userId,
          outcome: 'echec',
          reason: err instanceof Error ? err.message : 'Erreur inconnue.',
        })
      }
    }
    return { confirmCount, results }
  }
}
