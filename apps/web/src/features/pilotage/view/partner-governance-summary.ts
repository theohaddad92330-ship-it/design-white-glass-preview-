import {
  PARTNER_GOVERNANCE_STATUSES,
  type PartnerGovernanceDimension,
  type PartnerGovernanceReadiness,
  type PartnerGovernanceStatus,
} from '@bellum/contracts'

/**
 * #3270.6 — SURFACE PILOTAGE : ce que la gouvernance rang 2 dit du portefeuille
 * de partenaires. Dérivation PURE sur la liste que lit déjà l'écran Partenaires
 * (`GET /partners`) — jamais un second calcul de statut ni de risque (GA-26) :
 * `governanceStatus` et `governanceReadiness` viennent du serveur.
 *
 * Doctrine : un statut absent ne fait AUCUNE ligne ; une relation « historique »
 * ou « en pause » n'est jamais à cadrer (plus de route à ouvrir) ; aucune
 * probabilité, aucun score — des comptes et la prochaine validation nommée.
 */
interface PartnerGovernanceRow {
  id: string
  name: string
  governanceStatus: PartnerGovernanceStatus
  governanceReadiness: PartnerGovernanceReadiness
}

interface PartnerGovernanceSummary {
  total: number
  byStatus: { status: PartnerGovernanceStatus; count: number }[]
  toFrame: { id: string; name: string; blocking: boolean; nextValidation: PartnerGovernanceDimension | null }[]
  /** Le nombre TOTAL de relations à cadrer, avant le plafond d'affichage. */
  toFrameTotal: number
}

const MAX_TO_FRAME = 3
const INACTIVE: readonly PartnerGovernanceStatus[] = ['historical', 'paused']

export function summarizePartnerGovernance(rows: readonly PartnerGovernanceRow[]): PartnerGovernanceSummary {
  const byStatus = PARTNER_GOVERNANCE_STATUSES.map(status => ({
    status,
    count: rows.filter(row => row.governanceStatus === status).length,
  })).filter(row => row.count > 0)

  const toFrameAll = rows
    .filter(row => !INACTIVE.includes(row.governanceStatus) && row.governanceReadiness.risk !== 'none')
    .map(row => ({
      id: row.id,
      name: row.name,
      blocking: row.governanceReadiness.risk === 'blocking',
      nextValidation: row.governanceReadiness.nextValidation,
    }))
    .sort((a, b) => Number(b.blocking) - Number(a.blocking))

  return { total: rows.length, byStatus, toFrame: toFrameAll.slice(0, MAX_TO_FRAME), toFrameTotal: toFrameAll.length }
}
