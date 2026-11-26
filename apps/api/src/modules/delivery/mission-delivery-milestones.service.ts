import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  canConfirmRenewal,
  computeMissionDeliveryMilestones,
  computeMissionEndReverseMarketReadiness,
  type DeclareMissionDeliveryMilestoneInput,
  type DeclaredMissionDeliveryMilestone,
  type DeclaredMissionDeliveryMilestoneKind,
  type MissionDeliveryMilestoneState,
  type MissionDeliveryMilestoneStatus,
  type MissionEndReverseMarketReadiness,
  type ProjectedMissionDeliveryMilestoneSignal,
  type RenewalClientRail,
  type RenewalConsultantRail,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { MissionDriftService } from './mission-drift.service'
import { TimesheetsService } from './timesheets.service'

/**
 * #3269 (BEL-SC-240) — la projection unique des jalons de delivery d'une
 * mission (`packages/contracts/src/schemas/mission-delivery-milestones.ts`,
 * GA-26). Les six jalons déclarés vivent dans `mission_delivery_milestones`
 * (même patron que `MissionEndService`). Les jalons projetés se LISENT depuis
 * leur table canonique existante — `demarrage` (`mission_start_checks`),
 * `fin_de_mission` (`mission_end_checks`), `satisfaction` (`mission_feedback`),
 * `rex_interne`/`rex_client`/`preuve_reutilisable` (`proofs`),
 * `disponibilite_future` ({@link computeMissionEndReverseMarketReadiness}).
 *
 * `expansion` PROJETTE les entités du client déjà connues (#3413, « autre BU ») ;
 * le pont IA `account_expansion_compiler.py` reste suivi par l'épopée #3291.
 *
 * `risque`, `renouvellement` et `cra` sont câblés (#3291, suite de #3269) :
 * `risque` PROJETTE {@link MissionDriftService#forMission} (même détecteur que
 * l'écran de dérive, jamais un second calcul) ; `renouvellement` PROJETTE
 * {@link canConfirmRenewal} sur les deux rails déjà portés par `missions`
 * (`renewal_client_rail`/`renewal_consultant_rail`) ; `cra` PROJETTE
 * {@link TimesheetsService#month} (même vue « relevés facturables vs prévus »
 * que l'écran de relecture, jamais un second calcul) sur le mois précédent —
 * même patron GA-26 que les autres jalons projetés.
 */
interface AssertedMission {
  status: string
  account_id: string | null
  renewal_client_rail: RenewalClientRail | null
  renewal_consultant_rail: RenewalConsultantRail | null
}

@Injectable()
export class MissionDeliveryMilestonesService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
    private readonly drift: MissionDriftService,
    private readonly timesheets: TimesheetsService,
  ) {}

  async list(
    workspaceId: string,
    missionId: string,
    now: Date = new Date(),
  ): Promise<MissionDeliveryMilestoneStatus[]> {
    const mission = await this.assertMission(workspaceId, missionId)
    const declared = await this.declaredMilestones(workspaceId, missionId)
    const projected = await this.projectedSignals(workspaceId, missionId, mission, now)
    return computeMissionDeliveryMilestones({ declared, projected })
  }

  /** Un geste déclaré : une re-confirmation ARCHIVE le geste précédent (on archive, on ne supprime pas). */
  async declare(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: DeclareMissionDeliveryMilestoneInput,
  ): Promise<MissionDeliveryMilestoneStatus[]> {
    await this.assertMission(workspaceId, missionId)
    await this.repo.manager.query(
      `UPDATE mission_delivery_milestones SET archived_at = now(), archived_by = $4
        WHERE mission_id = $1 AND workspace_id = $2 AND item_key = $3 AND archived_at IS NULL`,
      [missionId, workspaceId, input.key, userId],
    )
    await this.repo.manager.query(
      `INSERT INTO mission_delivery_milestones (workspace_id, mission_id, item_key, note, confirmed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, missionId, input.key, input.note.trim(), userId],
    )
    return this.list(workspaceId, missionId)
  }

  /** FIN DE MISSION → REVERSE MARKET (#3269, NO-GO) — jamais de disponibilité déclarée automatiquement. */
  async reverseMarketReadiness(workspaceId: string, missionId: string): Promise<MissionEndReverseMarketReadiness> {
    const mission = await this.assertMission(workspaceId, missionId)
    const [openReplacement] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `SELECT id FROM missions WHERE account_id = $1 AND id <> $2 AND workspace_id = $3
           AND status IN ('active', 'onboarding') LIMIT 1`,
        [mission.account_id, missionId, workspaceId],
      ),
    )
    return computeMissionEndReverseMarketReadiness({
      missionStatus: mission.status,
      hasOpenReplacementOnAccount: Boolean(openReplacement),
    })
  }

  private async declaredMilestones(
    workspaceId: string,
    missionId: string,
  ): Promise<DeclaredMissionDeliveryMilestone[]> {
    const rows = returnedRows<{ item_key: string; note: string; confirmed_by: string; confirmed_at: string | Date }>(
      await this.repo.manager.query(
        `SELECT item_key, note, confirmed_by, confirmed_at FROM mission_delivery_milestones
          WHERE mission_id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
        [missionId, workspaceId],
      ),
    )
    return rows.map(r => ({
      key: r.item_key as DeclaredMissionDeliveryMilestoneKind,
      confirmedAt: new Date(r.confirmed_at).toISOString(),
      confirmedBy: r.confirmed_by,
      note: r.note,
    }))
  }

  private async projectedSignals(
    workspaceId: string,
    missionId: string,
    mission: AssertedMission,
    now: Date,
  ): Promise<ProjectedMissionDeliveryMilestoneSignal[]> {
    const signals: ProjectedMissionDeliveryMilestoneSignal[] = []

    const startChecks = returnedRows<{ item_key: string }>(
      await this.repo.manager.query(
        `SELECT item_key FROM mission_start_checks WHERE mission_id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
        [missionId, workspaceId],
      ),
    )
    signals.push({
      key: 'demarrage',
      state: startChecks.length === 0 ? 'not_started' : startChecks.length < 4 ? 'in_progress' : 'done',
      note: startChecks.length === 0 ? null : `${startChecks.length}/4 prérequis confirmés`,
    })

    const endChecks = returnedRows<{ item_key: string }>(
      await this.repo.manager.query(
        `SELECT item_key FROM mission_end_checks WHERE mission_id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
        [missionId, workspaceId],
      ),
    )
    signals.push({
      key: 'fin_de_mission',
      state: endChecks.length === 0 ? 'not_started' : endChecks.length < 13 ? 'in_progress' : 'done',
      note: endChecks.length === 0 ? null : `${endChecks.length}/13 items de sortie confirmés`,
    })

    const rexProofs = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `SELECT id FROM proofs WHERE mission_id = $1 AND workspace_id = $2 AND source = 'rex' LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    const rexState: MissionDeliveryMilestoneState = rexProofs.length > 0 ? 'done' : 'not_started'
    signals.push({ key: 'rex_interne', state: rexState, note: null })
    signals.push({ key: 'rex_client', state: rexState, note: null })

    const anyProofs = returnedRows<{ id: string }>(
      await this.repo.manager.query(`SELECT id FROM proofs WHERE mission_id = $1 AND workspace_id = $2 LIMIT 1`, [
        missionId,
        workspaceId,
      ]),
    )
    signals.push({ key: 'preuve_reutilisable', state: anyProofs.length > 0 ? 'done' : 'not_started', note: null })

    const feedbackRails = returnedRows<{ rail: string }>(
      await this.repo.manager.query(
        `SELECT DISTINCT rail FROM mission_feedback WHERE mission_id = $1 AND workspace_id = $2`,
        [missionId, workspaceId],
      ),
    )
    signals.push({
      key: 'satisfaction',
      state: feedbackRails.length === 0 ? 'not_started' : feedbackRails.length < 2 ? 'in_progress' : 'done',
      note: feedbackRails.length === 0 ? null : `${feedbackRails.length}/2 pouls posés (client/consultant)`,
    })

    const reverseMarket = await this.reverseMarketReadiness(workspaceId, missionId)
    signals.push({
      key: 'disponibilite_future',
      state:
        reverseMarket.state === 'not_applicable'
          ? 'not_started'
          : reverseMarket.state === 'verifie'
            ? 'done'
            : 'in_progress',
      note: reverseMarket.note,
    })

    // #3291 (#3269.1 reste) — risque : PROJETTE MissionDriftService, jamais un
    // second détecteur. `drifting` alerte, `steady` clôt le jalon, `unmeasurable`
    // (mission hors du filtre de statut de `forMission`, ou pas assez de mois
    // lisibles) rend `not_evaluable` — jamais deviné.
    const driftReport = await this.drift.forMission(workspaceId, missionId)
    if (!driftReport || driftReport.verdict.kind === 'unmeasurable') {
      signals.push({ key: 'risque', state: 'not_evaluable', note: null })
    } else if (driftReport.verdict.kind === 'drifting') {
      signals.push({
        key: 'risque',
        state: 'in_progress',
        note: `Dérive détectée sur ${driftReport.verdict.months} mois (${driftReport.verdict.signals.join(', ')})`,
      })
    } else {
      signals.push({ key: 'risque', state: 'done', note: 'Aucune dérive détectée' })
    }

    // #3291 (#3269.1 reste) — renouvellement : PROJETTE canConfirmRenewal sur
    // les deux rails déjà portés par `missions`, jamais un troisième calcul
    // (`delivery.service.ts` s'en sert déjà pour le garde-fou de confirmation).
    const { renewal_client_rail: clientRail, renewal_consultant_rail: consultantRail } = mission
    if (canConfirmRenewal(clientRail, consultantRail)) {
      signals.push({ key: 'renouvellement', state: 'done', note: 'Les deux rails ont confirmé la poursuite' })
    } else if (clientRail === null && consultantRail === null) {
      signals.push({ key: 'renouvellement', state: 'not_started', note: null })
    } else {
      signals.push({
        key: 'renouvellement',
        state: 'in_progress',
        note: 'Rail ouvert — poursuite pas encore confirmée des deux côtés',
      })
    }

    // #3291 (#3269.1 reste) — cra : PROJETTE TimesheetsService.month() sur le
    // mois précédent (même vue que l'écran de relecture des relevés, jamais un
    // second calcul). Les lignes `not_required` (contrat qui n'attend pas de
    // relevé) sortent du dénominateur — une mission sans aucune ligne
    // PERTINENTE ce mois-là (rien à mesurer, ou mission hors fenêtre) rend
    // `not_evaluable`, jamais deviné.
    const cra = await this.timesheets.month(workspaceId, { missionId }, now)
    const craRelevant = cra.summary.total - cra.summary.notRequired
    if (craRelevant <= 0) {
      signals.push({ key: 'cra', state: 'not_evaluable', note: null })
    } else if (
      cra.summary.late > 0 ||
      cra.summary.escalated > 0 ||
      cra.summary.rejected > 0 ||
      cra.summary.blocking > 0
    ) {
      const parts: string[] = []
      if (cra.summary.late > 0) parts.push(`${cra.summary.late} relevé(s) manquant(s)`)
      if (cra.summary.escalated > 0) parts.push(`${cra.summary.escalated} relance(s) escaladée(s)`)
      if (cra.summary.rejected > 0) parts.push(`${cra.summary.rejected} relevé(s) rejeté(s)`)
      if (cra.summary.blocking > 0) parts.push(`${cra.summary.blocking} écart(s) non expliqué(s)`)
      signals.push({ key: 'cra', state: 'in_progress', note: `Mois ${cra.month} : ${parts.join(', ')}` })
    } else {
      signals.push({ key: 'cra', state: 'done', note: `Mois ${cra.month} : relevés conformes aux jours prévus` })
    }

    // #3413 (« autre BU ») — expansion : PROJETTE les entités du client déjà
    // connues (`account_entities`), jamais une piste devinée. Voir
    // {@link expansionSignal}.
    signals.push(await this.expansionSignal(workspaceId, missionId, mission.account_id))

    return signals
  }

  /**
   * #3413 — « Client → autre BU » : les divisions du client AUTRES que celle qui
   * héberge cette mission (celle de son manager client, `contacts.entity_id`).
   *
   * Lecture seule de `account_entities` (GA-26, déjà tenue par la fiche du
   * compte) : aucune écriture, aucun routage — ce n'est pas une partition du
   * portefeuille de l'ESN mais un fait du CLIENT. Le périmètre « non déterminé »
   * (`is_default`) n'est pas une division, il est exclu. Tant que la division
   * d'accueil n'est pas connue on dit « connues », jamais « autres » : on ne
   * devine pas laquelle héberge la mission. Rien de connu ⇒ `not_evaluable`.
   */
  private async expansionSignal(
    workspaceId: string,
    missionId: string,
    accountId: string | null,
  ): Promise<ProjectedMissionDeliveryMilestoneSignal> {
    if (!accountId) return { key: 'expansion', state: 'not_evaluable', note: null }
    const rows = returnedRows<{ name: string; hosts_mission: boolean; host_known: boolean }>(
      await this.repo.manager.query(
        `WITH host AS (
           SELECT c.entity_id
             FROM missions mi JOIN contacts c ON c.id = mi.client_manager_contact_id
            WHERE mi.id = $3 AND mi.workspace_id = $1 AND c.entity_id IS NOT NULL
         )
         SELECT e.name,
                e.id IN (SELECT entity_id FROM host) AS hosts_mission,
                EXISTS (SELECT 1 FROM host) AS host_known
           FROM account_entities e
          WHERE e.workspace_id = $1 AND e.account_id = $2 AND e.is_default = false
          ORDER BY e.name`,
        [workspaceId, accountId, missionId],
      ),
    )
    const candidates = rows.filter(row => !row.hosts_mission).map(row => row.name)
    if (candidates.length === 0) return { key: 'expansion', state: 'not_evaluable', note: null }
    const hostKnown = rows.some(row => row.host_known)
    const shown = candidates.slice(0, 3).join(', ')
    const rest = candidates.length > 3 ? ` (+${candidates.length - 3})` : ''
    const label = hostKnown ? 'Autres entités du client' : 'Entités connues du client'
    return { key: 'expansion', state: 'lead_known', note: `${label} : ${shown}${rest}` }
  }

  private async assertMission(workspaceId: string, missionId: string): Promise<AssertedMission> {
    const [row] = returnedRows<AssertedMission>(
      await this.repo.manager.query(
        `SELECT status, account_id, renewal_client_rail, renewal_consultant_rail
           FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Mission introuvable')
    return row
  }
}
