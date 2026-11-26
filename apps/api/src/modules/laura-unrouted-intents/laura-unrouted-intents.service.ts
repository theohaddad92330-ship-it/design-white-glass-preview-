import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { hashBehavioralSession, MIN_DISTINCT_SESSIONS_FOR_A_METRIC, type LauraContextKind } from '@bellum/contracts'
import { killSwitchCut } from '../../common/kill-switches'
import { LauraUnroutedIntentEntity } from '../../database/entities/laura-unrouted-intent.entity'
import {
  LAURA_UNROUTED_INTENTS_RETENTION_DAYS,
  normalizeUnroutedText,
  publishUnroutedGroups,
  readUnroutedSignal,
  type UnroutedGroupRow,
} from './unrouted-intent'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Combien de groupes une lecture ramène au plus — un écran, pas un export. */
const MAX_GROUPS_READ = 500

/** Ce que l'écriture a fait. Rendu pour les tests ; l'appelant ne l'attend pas. */
type RecordOutcome = 'cut' | 'written' | 'failed'

/** Ce que le back-office reçoit. Aucun texte sous le plancher, aucun hash, aucun identifiant. */
export type LauraUnroutedIntentsReport = {
  windowDays: number
  /** Le plancher appliqué — lu dans `@bellum/contracts`, dit à l'écran plutôt que deviné. */
  minDistinctOccurrences: number
  /** Traces écrites sur la fenêtre. `null` = compte illisible, jamais « 0 ». */
  recorded: number | null
  groups: ReturnType<typeof publishUnroutedGroups>['published']
  /** Groupes retenus sous le plancher — un COMPTE, jamais leur texte. */
  withheldGroups: number
  computedAt: string
}

function failureName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

/** Une fenêtre lisible, bornée par la rétention : on ne lit pas ce qui est purgé. */
function windowOf(days: number | undefined): number {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) return LAURA_UNROUTED_INTENTS_RETENTION_DAYS
  return Math.min(Math.floor(days), LAURA_UNROUTED_INTENTS_RETENTION_DAYS)
}

function toCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw)
  return null
}

function toStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
}

/**
 * #1949.23 — décision Louis 13/09 batch 12 : la trace anonyme des demandes que
 * Laura n'a pas su router. Voir `unrouted-intent.ts` pour la décision, ce
 * qu'elle lève et chacun de ses garde-fous.
 *
 * ⚠️ Ce service ne sait pas si l'espace est une salle de DÉMONSTRATION : le
 * contrôleur la refuse AVANT de l'appeler (`ia-proxy.controller.ts`), comme pour
 * le titre des fils — l'importer ici ferait lire à un service le service d'un
 * autre module (GA-07).
 */
@Injectable()
export class LauraUnroutedIntentsService {
  private readonly logger = new Logger(LauraUnroutedIntentsService.name)

  constructor(
    @InjectRepository(LauraUnroutedIntentEntity)
    private readonly intents: Repository<LauraUnroutedIntentEntity>,
  ) {}

  /**
   * Écrit UNE trace. Appelé APRÈS la réponse HTTP, jamais attendu par la
   * personne. Ne lève jamais ; le journal ne porte que le NOM de l'erreur — son
   * message peut recopier la demande.
   */
  async record(args: {
    signal: NonNullable<ReturnType<typeof readUnroutedSignal>>
    workspaceId: string
    surface: LauraContextKind | 'chat'
    language: 'fr' | 'en' | null
    now?: Date
  }): Promise<RecordOutcome> {
    // #1949.23 — l'interrupteur d'incident : posé, aucune écriture.
    if (killSwitchCut('copilot.unrouted_intents')) return 'cut'
    const now = args.now ?? new Date()
    try {
      await this.intents.insert({
        occurred_on: now.toISOString().slice(0, 10),
        surface: args.surface,
        language: args.language,
        category: args.signal.category,
        text_masked: args.signal.text,
        text_normalized: normalizeUnroutedText(args.signal.text),
        // Jamais l'identifiant : un hash d'(espace, jour) tourné à 24 h.
        workspace_day_hash: hashBehavioralSession(args.workspaceId, now),
      })
      return 'written'
    } catch (error) {
      this.logger.error('Trace d’une demande non comprise non écrite', {
        error: { name: failureName(error) },
        tags: { feature: 'laura_unrouted_intent' },
      })
      return 'failed'
    }
  }

  /**
   * La lecture AGRÉGÉE du back-office : un groupe par texte normalisé, avec ses
   * comptes. Le plancher s'applique ICI, à la lecture (GA-267) : sous
   * `MIN_DISTINCT_SESSIONS_FOR_A_METRIC` occurrences DISTINCTES, le texte ne sort pas.
   */
  async report(days?: number, now: Date = new Date()): Promise<LauraUnroutedIntentsReport> {
    const windowDays = windowOf(days)
    const since = new Date(now.getTime() - windowDays * MS_PER_DAY).toISOString().slice(0, 10)

    const [groupRows, countRows] = await Promise.all([
      this.intents.manager.query(
        `SELECT text_normalized AS "textNormalized",
                MIN(text_masked) AS "sample",
                COUNT(*)::int AS "occurrences",
                COUNT(DISTINCT workspace_day_hash)::int AS "distinctOccurrences",
                ARRAY_AGG(DISTINCT surface) AS "surfaces",
                ARRAY_AGG(DISTINCT category) AS "categories",
                COALESCE(ARRAY_AGG(DISTINCT language) FILTER (WHERE language IS NOT NULL), '{}') AS "languages"
           FROM laura_unrouted_intents
          WHERE occurred_on >= $1
          GROUP BY text_normalized
          ORDER BY COUNT(DISTINCT workspace_day_hash) DESC, COUNT(*) DESC
          LIMIT $2`,
        [since, MAX_GROUPS_READ],
      ),
      this.intents.manager.query(
        `SELECT COUNT(*)::int AS "recorded" FROM laura_unrouted_intents WHERE occurred_on >= $1`,
        [since],
      ),
    ])

    const rows: UnroutedGroupRow[] = (Array.isArray(groupRows) ? groupRows : []).map(
      (raw: Record<string, unknown>) => ({
        textNormalized: String(raw['textNormalized'] ?? ''),
        sample: String(raw['sample'] ?? ''),
        occurrences: toCount(raw['occurrences']) ?? 0,
        // Illisible ⇒ 0 occurrence distincte ⇒ retenu sous le plancher : dans le
        // doute, le texte ne sort pas.
        distinctOccurrences: toCount(raw['distinctOccurrences']) ?? 0,
        surfaces: toStrings(raw['surfaces']),
        categories: toStrings(raw['categories']),
        languages: toStrings(raw['languages']),
      }),
    )
    const { published, withheldGroups } = publishUnroutedGroups(rows)
    const firstCount = Array.isArray(countRows) ? (countRows[0] as Record<string, unknown> | undefined) : undefined

    return {
      windowDays,
      minDistinctOccurrences: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      recorded: toCount(firstCount?.['recorded']),
      groups: published,
      withheldGroups,
      computedAt: now.toISOString(),
    }
  }
}
