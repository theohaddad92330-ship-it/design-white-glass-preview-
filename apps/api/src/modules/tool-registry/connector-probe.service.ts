import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'

/**
 * Le journal des preuves — et rien d'autre.
 *
 * Ce service n'appelle AUCUN fournisseur : il écrit ce que le contrôleur a
 * observé. C'est délibéré. L'orchestration d'un test traverse cinq modules
 * (messagerie, agenda, documents, CRM, pages), et la faire ici coûterait cinq
 * imports service → service — exactement ce que GA-07 empêche. Un geste
 * d'utilisateur s'orchestre dans le contrôleur ; ce qu'il en reste se range ici.
 */
@Injectable()
export class ConnectorProbeService {
  private readonly logger = new Logger(ConnectorProbeService.name)

  constructor(
    @InjectRepository(ConnectorCapabilityProbeEntity)
    private readonly probes: Repository<ConnectorCapabilityProbeEntity>,
    // #2445.12 (LOT écrivain 28/09, passe 2) — le journal des TRANSITIONS,
    // que la ligne ci-dessus n'a jamais tenu (elle écrase sa dernière
    // observation). Repository injecté DIRECTEMENT (GA-07 ne compte pas les
    // repositories), déclaré dans `tool-registry.module.ts` (GA-20).
    @InjectRepository(ConnectorCapabilityIncidentEntity)
    private readonly incidents: Repository<ConnectorCapabilityIncidentEntity>,
  ) {}

  /**
   * Enregistre le résultat d'une vérification.
   *
   * Le succès EFFACE la dernière erreur, et l'échec EFFACE la dernière preuve.
   * Garder les deux ferait cohabiter « vérifié il y a 4 min » et « en erreur
   * depuis 10 min » sur la même ligne, et l'écran devrait choisir laquelle
   * croire. La dernière observation fait foi, point.
   */
  async record(input: {
    workspaceId: string
    userId: string
    provider: string
    capability: string
    ok: boolean
    /** Le NOM d'un objet réel. Jamais son contenu. */
    sample?: string | null
    errorCode?: string | null
  }): Promise<void> {
    const now = new Date()
    await this.recordTransitionIfAny(input, now)
    const row = {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider: input.provider,
      capability: input.capability,
      last_proof_at: input.ok ? now : null,
      last_proof_sample: input.ok ? (input.sample ?? null) : null,
      last_error_code: input.ok ? null : (input.errorCode ?? 'provider_unavailable'),
      last_error_at: input.ok ? null : now,
      updated_at: now,
    }
    try {
      await this.probes
        .createQueryBuilder()
        .insert()
        .values(row)
        .orUpdate(
          ['last_proof_at', 'last_proof_sample', 'last_error_code', 'last_error_at', 'updated_at', 'user_id'],
          ['workspace_id', 'provider', 'capability'],
        )
        .execute()
    } catch (error) {
      // Best-effort : une preuve qu'on n'arrive pas à ranger ne doit pas faire
      // échouer le test que l'utilisateur vient de lancer. Il verra le résultat,
      // simplement l'écran redira « jamais vérifié » au rechargement.
      this.logger.warn(`Probe not stored (${input.provider}:${input.capability})`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * #2445.12 (LOT écrivain 28/09, passe 2) — journalise une TRANSITION quand,
   * et seulement quand, cette observation change l'état de la précédente. Lue
   * AVANT l'upsert ci-dessus (qui écrase la précédente juste après) : c'est la
   * seule fenêtre où « avant » est encore observable.
   *
   * Aucune ligne précédente (première observation jamais faite) → rien à
   * comparer, aucune transition. Une lecture qui échoue → aucune transition
   * journalisée, mais le probe s'écrit quand même (best-effort, comme lui).
   */
  private async recordTransitionIfAny(
    input: { workspaceId: string; provider: string; capability: string; ok: boolean; errorCode?: string | null },
    now: Date,
  ): Promise<void> {
    let previous: { last_error_code: string | null } | null
    try {
      previous = await this.probes.findOne({
        where: { workspace_id: input.workspaceId, provider: input.provider, capability: input.capability },
        select: ['last_error_code'],
      })
    } catch (error) {
      this.logger.warn(`Transition lookup failed (${input.provider}:${input.capability})`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    if (!previous) return

    const wasOk = previous.last_error_code === null
    if (wasOk === input.ok) return

    await this.incidents.save({
      workspace_id: input.workspaceId,
      provider: input.provider,
      capability: input.capability,
      transition: input.ok ? 'recovered' : 'degraded',
      error_code: input.ok ? null : (input.errorCode ?? 'provider_unavailable'),
      occurred_at: now,
    })
  }
}
