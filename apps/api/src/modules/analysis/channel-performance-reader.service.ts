import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CHANNEL_PERFORMANCE_CHANNELS,
  CHANNEL_REPLY_WINDOW_DAYS,
  toChannelPerformance,
  toRolePerformance,
  toAnglePerformance,
  recommendFromOutcomes,
  type ChannelPerformance,
  type OutcomeRecommendation,
  type OutcomeRecommendationDimension,
  type RolePerformance,
  type AnglePerformance,
} from '@bellum/contracts'
import { ActivityEntity } from '../../database/entities/activity.entity'

/**
 * #3278.3 (#3259.7) — ce que l'espace a MESURÉ par canal : parmi ses
 * activités sortantes, la part suivie d'une activité ENTRANTE du même contact
 * dans la fenêtre de réponse. Sert à faire céder un preset de canal de la
 * méthode devant la performance réelle (IA : `measured_channel_override`).
 *
 * Même idiome que `RelationAxisReaderService` : l'ENTITÉ partagée est
 * injectée, aucun service voisin (GA-07). Ni `subject` ni `body` ne sont lus
 * — doctrine « le corps des messages ne sort jamais ». Les envois plus
 * récents que la fenêtre ne sont pas jugeables et n'entrent pas au
 * dénominateur ; un envoi sans contact rattaché ne peut pas être apparié à
 * une réponse et en est exclu.
 */
@Injectable()
export class ChannelPerformanceReaderService {
  constructor(@InjectRepository(ActivityEntity) private readonly activities: Repository<ActivityEntity>) {}

  async forWorkspace(workspaceId: string): Promise<ChannelPerformance[]> {
    const rows = await this.activities.manager.query<Array<{ channel: string; sent: string; replied: string }>>(
      `SELECT o.kind AS channel,
              COUNT(*) AS sent,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM activities i
                WHERE i.workspace_id = o.workspace_id
                  AND i.contact_id = o.contact_id
                  AND i.direction = 'inbound'
                  AND i.occurred_at > o.occurred_at
                  AND i.occurred_at <= o.occurred_at + make_interval(days => $2)
              )) AS replied
       FROM activities o
       WHERE o.workspace_id = $1
         AND o.direction = 'outbound'
         AND o.kind IN (${CHANNEL_PERFORMANCE_CHANNELS.map(channel => `'${channel}'`).join(', ')})
         AND o.contact_id IS NOT NULL
         AND (o.verdict IS NULL OR o.verdict = 'sent')
         AND o.occurred_at <= now() - make_interval(days => $2)
         AND o.occurred_at > now() - interval '365 days'
       GROUP BY o.kind`,
      [workspaceId, CHANNEL_REPLY_WINDOW_DAYS],
    )
    return toChannelPerformance(
      rows.map(row => ({ channel: row.channel, sent: Number(row.sent), replied: Number(row.replied) })),
    )
  }

  /**
   * #3234 (#3211.11) — la MÊME mesure, coupée par rôle de décision du contact
   * (`contacts.decision_role`). Même fenêtre, même seuil, même exclusion des
   * envois non jugeables ; un contact sans rôle connu ne fait aucune ligne.
   */
  async byRoleForWorkspace(workspaceId: string): Promise<RolePerformance[]> {
    const rows = await this.activities.manager.query<Array<{ role: string; sent: string; replied: string }>>(
      `SELECT c.decision_role AS role,
              COUNT(*) AS sent,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM activities i
                WHERE i.workspace_id = o.workspace_id
                  AND i.contact_id = o.contact_id
                  AND i.direction = 'inbound'
                  AND i.occurred_at > o.occurred_at
                  AND i.occurred_at <= o.occurred_at + make_interval(days => $2)
              )) AS replied
       FROM activities o
       JOIN contacts c ON c.id = o.contact_id
       WHERE o.workspace_id = $1
         AND o.direction = 'outbound'
         AND o.kind IN (${CHANNEL_PERFORMANCE_CHANNELS.map(channel => `'${channel}'`).join(', ')})
         AND o.contact_id IS NOT NULL
         AND c.decision_role IS NOT NULL
         AND (o.verdict IS NULL OR o.verdict = 'sent')
         AND o.occurred_at <= now() - make_interval(days => $2)
         AND o.occurred_at > now() - interval '365 days'
       GROUP BY c.decision_role`,
      [workspaceId, CHANNEL_REPLY_WINDOW_DAYS],
    )
    return toRolePerformance(
      rows.map(row => ({ role: row.role, sent: Number(row.sent), replied: Number(row.replied) })),
    )
  }

  /**
   * #3211.11 (#3234, lot RAISON-B 12/10) — la MÊME mesure, coupée par ANGLE du
   * message. L'angle est la `reason` du message sortant ; il est relié à
   * l'e-mail réellement envoyé par l'identifiant que le fournisseur a rendu à
   * l'envoi (`outreach_messages.provider_message_id`, lot W3) = l'`external_id`
   * de l'activité captée par la synchronisation de la boîte. Aucune écriture
   * d'activité à l'envoi (pas de double comptage) ; un envoi sans identifiant
   * (boîte qui n'en rend pas) ou sans angle ne fait aucune ligne — jamais
   * deviné. Ni `body` ni `subject` ne sont lus.
   */
  async byAngleForWorkspace(workspaceId: string): Promise<AnglePerformance[]> {
    const rows = await this.activities.manager.query<Array<{ angle: string; sent: string; replied: string }>>(
      `SELECT m.reason AS angle,
              COUNT(*) AS sent,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM activities i
                WHERE i.workspace_id = o.workspace_id
                  AND i.contact_id = o.contact_id
                  AND i.direction = 'inbound'
                  AND i.occurred_at > o.occurred_at
                  AND i.occurred_at <= o.occurred_at + make_interval(days => $2)
              )) AS replied
       FROM activities o
       JOIN outreach_messages m
         ON m.workspace_id = o.workspace_id
        AND m.provider_message_id = o.external_id
       WHERE o.workspace_id = $1
         AND o.source = 'mailbox'
         AND o.direction = 'outbound'
         AND o.kind IN (${CHANNEL_PERFORMANCE_CHANNELS.map(channel => `'${channel}'`).join(', ')})
         AND o.contact_id IS NOT NULL
         AND m.reason IS NOT NULL
         AND btrim(m.reason) <> ''
         AND (o.verdict IS NULL OR o.verdict = 'sent')
         AND o.occurred_at <= now() - make_interval(days => $2)
         AND o.occurred_at > now() - interval '365 days'
       GROUP BY m.reason`,
      [workspaceId, CHANNEL_REPLY_WINDOW_DAYS],
    )
    return toAnglePerformance(
      rows.map(row => ({ angle: row.angle, sent: Number(row.sent), replied: Number(row.replied) })),
    )
  }

  /**
   * #3211.11 (#3234, lot M11 09/10) — la recommandation PAR DIMENSION tirée
   * des issues DÉCLARÉES de CET espace ({@link recommendFromOutcomes}) :
   *
   * - `cadence` — l'étape de relance (`action_plan_items.cadence_step`) des
   *   actions FAITES avec une issue ;
   * - `route` — la route du plan du compte (`raw_analysis.recommendedRoute.
   *   route`), sur ces actions ET sur le grand livre `commercial_outcomes` ;
   * - `priority` — le niveau d'effort ACTUEL du compte (`accounts.sprint`),
   *   mêmes deux sources.
   *
   * Des comptages groupés, jamais une ligne nominative ; bornés à l'espace
   * par le compte (jamais agrégés entre espaces).
   */
  async outcomeRecommendationFor(
    workspaceId: string,
    dimension: OutcomeRecommendationDimension,
  ): Promise<OutcomeRecommendation> {
    const valueSql =
      dimension === 'cadence'
        ? 'i.cadence_step'
        : dimension === 'route'
          ? "a.raw_analysis->'recommendedRoute'->>'route'"
          : 'a.sprint'
    const items = await this.activities.manager.query<Array<{ value: string | null; outcome: string; count: string }>>(
      `SELECT ${valueSql} AS value, i.outcome AS outcome, COUNT(*) AS count
       FROM action_plan_items i
       JOIN accounts a ON a.id = i.account_id
       WHERE a.workspace_id = $1
         AND i.execution_status = 'done'
         AND i.outcome IS NOT NULL
         AND ${valueSql} IS NOT NULL
       GROUP BY 1, 2`,
      [workspaceId],
    )
    const ledger =
      dimension === 'cadence'
        ? []
        : await this.activities.manager.query<Array<{ value: string | null; outcome: string; count: string }>>(
            `SELECT ${valueSql} AS value, o.outcome_type AS outcome, COUNT(*) AS count
             FROM commercial_outcomes o
             JOIN accounts a ON a.id = o.account_id
             WHERE o.workspace_id = $1
               AND a.workspace_id = $1
               AND ${valueSql} IS NOT NULL
             GROUP BY 1, 2`,
            [workspaceId],
          )
    return recommendFromOutcomes(dimension, [
      ...items.map(row => ({ value: row.value, outcome: row.outcome, count: Number(row.count) })),
      ...ledger.map(row => ({
        value: row.value,
        outcome: row.outcome,
        count: Number(row.count),
        source: 'commercial' as const,
      })),
    ])
  }
}
