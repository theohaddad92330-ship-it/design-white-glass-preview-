import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { gateCrossingProblems, gateCrossingSchema, timelineSystemSubject, type GateCrossing } from '@bellum/contracts'
import { DecisionGateCrossingEntity } from '../../database/entities/decision-gate-crossing.entity'
import { ActivitiesService } from '../activities/activities.service'

/**
 * Le journal des huit portes de décision (BEL-ARCH-005).
 *
 * Deux écritures, dans un ordre qui n'est pas indifférent : le JOURNAL d'abord,
 * la trace de timeline ensuite. Le journal est la donnée d'audit — il doit être
 * écrit ou l'appel doit échouer ; la trace est du confort de lecture, et perdre
 * une ligne de timeline ne doit jamais faire échouer une décision métier déjà
 * prise par un humain.
 *
 * Le service ne DÉCIDE rien et n'autorise rien : il enregistre. Refuser un
 * franchissement resterait le travail du service métier concerné, qui seul sait
 * ce que la décision engage. Ce qu'il refuse en revanche, c'est un
 * franchissement mal formé — un refus sans motif, un « forcé » qui ne nomme
 * aucun manque — parce qu'une trace incomplète est pire qu'une trace absente :
 * elle donne l'impression qu'on saura.
 */
@Injectable()
export class DecisionGatesService {
  private readonly logger = new Logger(DecisionGatesService.name)

  constructor(
    @InjectRepository(DecisionGateCrossingEntity)
    private readonly crossings: Repository<DecisionGateCrossingEntity>,
    @Optional() private readonly activities?: ActivitiesService,
  ) {}

  /**
   * Enregistre un franchissement. Lève un 400 nommé si la trace serait
   * incomplète — le message est destiné à la personne qui vient de cliquer.
   */
  async record(workspaceId: string, userId: string, input: GateCrossing): Promise<DecisionGateCrossingEntity> {
    const crossing = gateCrossingSchema.parse(input)
    const problems = gateCrossingProblems(crossing)
    if (problems.length > 0) throw new BadRequestException(problems.join(' '))

    const saved = await this.crossings.save(
      this.crossings.create({
        workspace_id: workspaceId,
        user_id: userId,
        gate: crossing.gate,
        decision: crossing.decision,
        subject: crossing.subject,
        subject_id: crossing.subjectId,
        reason: crossing.reason?.trim() || null,
        missing: crossing.missing,
      }),
    )

    await this.trace(workspaceId, userId, crossing)
    return saved
  }

  /** Ce qui a été décidé sur un objet, le plus récent d'abord. */
  async forSubject(
    workspaceId: string,
    subject: GateCrossing['subject'],
    subjectId: string,
  ): Promise<DecisionGateCrossingEntity[]> {
    return this.crossings.find({
      where: { workspace_id: workspaceId, subject, subject_id: subjectId },
      order: { created_at: 'DESC' },
      take: 50,
    })
  }

  /**
   * Ce qui a MANQUÉ, sur la fenêtre, et combien de fois.
   *
   * C'est la lecture qui justifie la table. Le champ `missing` porte ce qu'on
   * ne savait pas au moment de décider ; sans agrégat, il reste une ligne qu'on
   * ne relit jamais. « Onze affaires closes sans budget ce trimestre » est
   * exactement le genre de phrase qui explique un résultat six mois plus tard.
   *
   * Une liste vide dit « rien ne manquait ». « On n'a pas regardé » n'a
   * délibérément aucune représentation : le journal est écrit, ou l'appel qui
   * franchit la porte échoue.
   */
  async summary(
    workspaceId: string,
    days: number,
  ): Promise<{
    days: number
    gates: Array<{ gate: string; decision: string; count: number }>
    missing: Array<{ label: string; count: number }>
  }> {
    try {
      const gates = await this.crossings.manager.query<{ gate: string; decision: string; count: string }[]>(
        `SELECT gate, decision, COUNT(*)::int AS count
           FROM decision_gate_crossings
          WHERE workspace_id = $1 AND created_at >= now() - ($2 || ' days')::interval
          GROUP BY gate, decision
          ORDER BY COUNT(*) DESC`,
        [workspaceId, String(days)],
      )
      // `jsonb_array_elements_text` : un manque est une CHAÎNE dans un tableau,
      // et c'est son libellé qu'on compte — pas le nombre de franchissements
      // qui en portaient au moins un.
      const missing = await this.crossings.manager.query<{ label: string; count: string }[]>(
        `SELECT value AS label, COUNT(*)::int AS count
           FROM decision_gate_crossings,
                LATERAL jsonb_array_elements_text(COALESCE(missing, '[]'::jsonb))
          WHERE workspace_id = $1 AND created_at >= now() - ($2 || ' days')::interval
          GROUP BY value
          ORDER BY COUNT(*) DESC
          LIMIT 20`,
        [workspaceId, String(days)],
      )
      return {
        days,
        gates: gates.map(row => ({ gate: row.gate, decision: row.decision, count: Number(row.count) })),
        missing: missing.map(row => ({ label: row.label, count: Number(row.count) })),
      }
    } catch (error) {
      // Un journal d'audit illisible est un incident, pas un état dégradé :
      // seul un `error` atteint Sentry.
      this.logger.error('Récapitulatif des portes de décision illisible', { error })
      return { days, gates: [], missing: [] }
    }
  }

  /**
   * La trace de timeline. Best-effort — et le corps porte les manques en clair
   * plutôt qu'un compte : « décidé sans budget, sans décideur » se lit, « 2
   * manques » envoie chercher.
   */
  private async trace(workspaceId: string, userId: string, crossing: GateCrossing): Promise<void> {
    if (!this.activities) return
    const accountId = crossing.subject === 'account' ? crossing.subjectId : null
    const projectId = crossing.subject === 'project' ? crossing.subjectId : null
    // Sans rattachement, la ligne n'apparaîtrait sur aucun écran — et un log
    // qu'aucun écran ne montre est un log inutile.
    if (!accountId && !projectId) return

    try {
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'gate_decision',
          source: 'system',
          direction: 'internal',
          // #2124.68 — la clé de la porte et celle de la décision, JAMAIS
          // leur libellé : le mot lisible est posé par l'écran (i18n FR+EN),
          // pas figé en français dans une ligne de base.
          subject: timelineSystemSubject(crossing.gate, crossing.decision),
          body:
            [
              crossing.reason?.trim() || null,
              crossing.missing.length ? `Manquait : ${crossing.missing.join(', ')}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || null,
          occurredAt: new Date().toISOString(),
          durationSeconds: null,
          accountId,
          contactId: null,
          projectId,
          linkReason: projectId ? 'project_explicit' : 'manual',
          // Deux décisions successives sur le même objet sont deux vrais
          // franchissements : la clé porte l'instant, sinon la seconde serait
          // avalée en doublon par l'index d'idempotence.
          externalId: `gate:${crossing.gate}:${crossing.subjectId}:${Date.now()}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Trace de porte non écrite : ${(error as Error).message}`)
    }
  }
}
