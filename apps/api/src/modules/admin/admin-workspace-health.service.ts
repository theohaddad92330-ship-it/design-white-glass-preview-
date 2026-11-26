import { Injectable } from '@nestjs/common'
import {
  computeWorkspaceHealth,
  dimensionInterventions,
  healthCoverageLabel,
  healthDimensions,
  type DimensionIntervention,
  type HealthDimensionView,
  type WorkspaceHealth,
} from '@bellum/contracts'
import { LauraProbeService } from '../laura/laura-probe.service'

/** Ce que la vue admin/pilotage reçoit pour UN espace (#2977). */
export interface AdminWorkspaceHealthReport {
  workspaceId: string
  health: WorkspaceHealth
  /** « X/9 axes évalués » — jamais un score affiché nu. */
  coverageLabel: string
  dimensions: HealthDimensionView[]
  interventions: DimensionIntervention[]
}

/**
 * LA SANTÉ DE PRODUIT D'UN ESPACE (#2406/#2977), pour la vue admin/pilotage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS `client-health` (#1652)
 * ─────────────────────────────────────────────────────────────────────────
 * Deux scores distincts cohabitent dans ce dossier, chacun avec son barème et
 * sa raison : `client-health.ts` (5 axes, revenu/relation) sert `/revenus/
 * clients`. Celui-ci (9 axes, produit) est le score interne du §5.6 qui pilote
 * le budget d'interventions de Laura et son alerte commerciale (D50) — jamais
 * montré à l'utilisateur. Les fusionner ferait mentir l'un des deux dénominateurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN ESPACE À LA FOIS, SUR DEMANDE
 * ─────────────────────────────────────────────────────────────────────────
 * `LauraProbeService.measure` porte déjà neuf requêtes SQL par espace — en
 * boucler la liste complète des espaces coûterait cher pour un usage qui
 * n'existe pas encore (repasser sur un espace précis pendant une
 * investigation, jamais un tableau de bord temps réel). `LauraModule`
 * exportait déjà ce service « pour un futur consommateur (panneau
 * back-office) » sans qu'aucun n'existe : cette route EST ce consommateur.
 */
@Injectable()
export class AdminWorkspaceHealthService {
  constructor(private readonly probe: LauraProbeService) {}

  async get(workspaceId: string): Promise<AdminWorkspaceHealthReport> {
    const input = await this.probe.measure(workspaceId)
    const health = computeWorkspaceHealth(input)
    return {
      workspaceId,
      health,
      coverageLabel: healthCoverageLabel(health),
      dimensions: healthDimensions(input),
      interventions: dimensionInterventions(input),
    }
  }
}
