import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import { shapeReplyContestations, type ReplyContestationReport } from './reply-contestations'

const DEFAULT_WINDOW_DAYS = 90

/**
 * #2442.10 (épopée #2879, lot W9) — LA lecture de l'agrégat des contestations
 * de Laura, PAR FONCTION. Troisième exception nommée à `c64_analytique_produit`
 * (décision Louis 11/10/2026) ; la règle est gardée par GA-412
 * (`reply-contestations-never-by-person.spec.ts`), qui lit CETTE requête.
 *
 * Ce que la requête NE fait pas, et que la garde vérifie : sélectionner ou
 * regrouper sur un auteur, un espace, un compte ou un contenu. `workspaces`
 * n'apparaît que pour EXCLURE les salles de démonstration. Les retours retirés
 * (`withdrawn_at`) ne comptent pas. Une fonction inconnue (`action_kind` nul)
 * ne fait AUCUNE ligne : une absence n'est pas une fonction.
 *
 * Le plancher vient de `@bellum/contracts` (un seul endroit, GA-26) : posé dans
 * le HAVING, puis re-vérifié par {@link shapeReplyContestations} (GA-267).
 */
const CONTESTATIONS_SQL = `
  SELECT f.action_kind AS tool,
         COUNT(DISTINCT f.reply_digest)::text AS replies,
         COUNT(*)::text AS feedbacks,
         COUNT(*) FILTER (WHERE f.verdict <> 'utile')::text AS contested,
         COUNT(*) FILTER (WHERE f.verdict = 'donnee_fausse' OR f.correction_field IS NOT NULL)::text AS corrected
  FROM chat_reply_feedback f
  WHERE f.withdrawn_at IS NULL
    AND f.action_kind IS NOT NULL
    AND f.created_at >= $1
    AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = f.workspace_id AND w.is_demo)
  GROUP BY f.action_kind
  HAVING COUNT(DISTINCT f.reply_digest) >= $2
`

type ContestationDbRow = { tool: string; replies: string; feedbacks: string; contested: string; corrected: string }

@Injectable()
export class ReplyContestationsService {
  constructor(
    @InjectRepository(ChatReplyFeedbackEntity)
    private readonly feedback: Repository<ChatReplyFeedbackEntity>,
  ) {}

  async report(
    windowDays: number = DEFAULT_WINDOW_DAYS,
    now: Date = new Date(),
  ): Promise<ReplyContestationReport & { windowDays: number }> {
    const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.min(windowDays, 365) : DEFAULT_WINDOW_DAYS
    const since = new Date(now.getTime() - days * 86_400_000)
    const rows = (await this.feedback.manager.query(CONTESTATIONS_SQL, [
      since,
      MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    ])) as ContestationDbRow[]
    const shaped = shapeReplyContestations(
      rows.map(row => ({
        tool: row.tool,
        replies: Number(row.replies),
        feedbacks: Number(row.feedbacks),
        contested: Number(row.contested),
        corrected: Number(row.corrected),
      })),
      MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    )
    return { ...shaped, windowDays: days }
  }
}
