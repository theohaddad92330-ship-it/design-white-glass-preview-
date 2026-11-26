import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { IaClient } from '../ia/ia.client'

/** L'UNIQUE réglage de coût du juge : réponses jugées par jour. Absent = no-op strict. */
export const REASONING_JUDGE_DAILY_SAMPLE_ENV = 'REASONING_JUDGE_DAILY_SAMPLE'
/** Plafond dur, quel que soit le réglage : une valeur aberrante ne fait pas exploser la facture. */
const DAILY_SAMPLE_CAP = 200
/** Le plafond d'un appel côté IA (`generic_recommendation_judge.MAX_BATCH`). */
const BATCH_SIZE = 50

/** Le nombre de réponses à juger aujourd'hui ; `0` (absent, illisible, négatif) = ne rien faire. */
export function readDailySample(raw: string | undefined): number {
  const value = Number.parseInt((raw ?? '').trim(), 10)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(value, DAILY_SAMPLE_CAP)
}

/**
 * #3223 (décision Louis 11/10/2026) — L'ÉCHANTILLON QUOTIDIEN DU JUGE « RECOMMANDATION GÉNÉRIQUE ».
 *
 * Chaque nuit, tire AU HASARD au plus `REASONING_JUDGE_DAILY_SAMPLE` réponses
 * de Laura des dernières 24 h (espaces réels seulement, jamais une salle de
 * démo, jamais une réponse déjà jugée), les envoie au service IA et écrit le
 * verdict de chacune dans `chat_generic_judgements` — un jeton et l'empreinte
 * du juge, jamais le texte.
 *
 * Deux verrous, tous deux NO-OP STRICT :
 *  - `REASONING_JUDGE_DAILY_SAMPLE` absent ou `0` : aucune lecture, aucun appel
 *    (c'est la BORNE de coût : au plus N appels au modèle par jour) ;
 *  - `CHAT_PROD_SAMPLING_ENABLED` éteint côté IA : la route rend `disabled`
 *    sans appeler le modèle, et rien n'est écrit.
 *
 * Ce qu'il envoie : la RÉPONSE de Laura seule — jamais la question du
 * commercial, jamais un autre message du fil.
 */
@Injectable()
export class ReasoningJudgeSamplingService {
  private readonly logger = new Logger(ReasoningJudgeSamplingService.name)

  constructor(
    @InjectRepository(AnalysisRunEntity) private readonly runs: Repository<AnalysisRunEntity>,
    private readonly ia: IaClient,
  ) {}

  /**
   * Appelé par le passage du matin de `CostAlertService` (07:05 Europe/Paris),
   * SOUS SON VERROU singleton et AVANT les alertes qui lisent ces verdicts :
   * sans verrou, chaque réplique tirerait son échantillon et la borne de coût
   * serait multipliée. Un échec est journalisé, jamais propagé — il n'empêche
   * pas les alertes de partir.
   */
  async runNightly(now: Date = new Date()): Promise<void> {
    try {
      await this.sample(now)
    } catch (error) {
      this.logger.error('Juge « recommandation générique » — échantillon de la nuit en échec', {
        error: error instanceof Error ? error.name : 'unknown',
        tags: { 'reasoning_judge.op': 'sample' },
      })
    }
  }

  /** Le passage lui-même — rend le nombre de verdicts écrits. */
  async sample(now: Date = new Date()): Promise<number> {
    const size = readDailySample(process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV])
    if (size === 0) return 0
    const since = new Date(now.getTime() - 86_400_000)
    const rows = (await this.runs.query(
      `SELECT m.id AS id, m.content AS content
         FROM chat_messages m
         JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN chat_generic_judgements j ON j.message_id = m.id
        WHERE m.role = 'assistant'
          AND w.is_demo = false
          AND m.created_at >= $1
          AND j.message_id IS NULL
          AND length(m.content) > 0
        ORDER BY random()
        LIMIT $2`,
      [since, size],
    )) as Array<{ id: string; content: string }>
    let written = 0
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE)
      const result = await this.ia.judgeGenericRecommendations(batch.map(row => ({ id: row.id, text: row.content })))
      // Éteint ou sans clé : la nuit s'arrête là, sans rien écrire — pas un « aucune réponse générique ».
      if (result.status !== 'judged') {
        this.logger.log(`Juge « recommandation générique » non lancé (${result.status})`)
        return written
      }
      for (const { id, verdict } of result.verdicts) {
        if (verdict === null) continue
        await this.runs.query(
          `INSERT INTO chat_generic_judgements (message_id, verdict, judge_version)
           VALUES ($1, $2, $3)
           ON CONFLICT (message_id) DO NOTHING`,
          [id, verdict, result.judgeVersion],
        )
        written += 1
      }
    }
    this.logger.log(`Juge « recommandation générique » — ${written} verdict(s) sur ${rows.length} réponse(s) tirée(s)`)
    return written
  }
}
