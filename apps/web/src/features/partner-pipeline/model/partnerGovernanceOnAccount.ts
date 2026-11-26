import type { PartnerGovernanceDimension, PartnerGovernanceReadiness, PartnerGovernanceStatus } from '@bellum/contracts'

/**
 * #3270.6 — SURFACE OPPORTUNITÉ : le cadre de gouvernance des ESN rang 2 EN
 * PLACE chez le compte d'une opportunité.
 *
 * Dérivation PURE sur deux lectures que l'application fait déjà (la liste des
 * partenaires du compte, celle des relations gouvernées) — le statut et le
 * risque viennent du serveur (GA-26), rien n'est recalculé.
 *
 * Le rapprochement suit la fiche Partenaires du compte : le lien explicite
 * (`partner_relation_id`, posé par un geste humain, #3404.5) d'abord ; sans lui,
 * le nom normalisé, le seul identifiant que les deux objets partagent. Une
 * présence rang 2 SANS relation gouvernée ne fait aucune ligne : une ESN dont
 * le nom apparaît autour du compte n'est jamais présentée comme une route
 * (NO-GO de #3270).
 */
interface AccountPartnerLike {
  id: string
  name: string
  rank: string
  partner_relation_id?: string | null
}

interface GovernedRelationLike {
  id: string
  name: string
  governanceStatus: PartnerGovernanceStatus
  governanceReadiness: Pick<PartnerGovernanceReadiness, 'risk' | 'nextValidation'>
}

interface PartnerGovernanceOnAccountRow {
  key: string
  name: string
  status: PartnerGovernanceStatus
  risk: PartnerGovernanceReadiness['risk']
  nextValidation: PartnerGovernanceDimension | null
}

const normalize = (name: string): string => name.trim().toLowerCase()

export function partnerGovernanceOnAccount(
  partners: readonly AccountPartnerLike[] | undefined,
  relations: readonly GovernedRelationLike[] | undefined,
): PartnerGovernanceOnAccountRow[] {
  if (!Array.isArray(partners) || !Array.isArray(relations)) return []
  const rows = new Map<string, PartnerGovernanceOnAccountRow>()
  for (const partner of partners) {
    if (partner.rank !== 'rank2') continue
    const relation = partner.partner_relation_id
      ? relations.find(candidate => candidate.id === partner.partner_relation_id)
      : relations.find(candidate => normalize(candidate.name) === normalize(partner.name))
    if (!relation || rows.has(relation.id)) continue
    rows.set(relation.id, {
      key: relation.id,
      name: partner.name,
      status: relation.governanceStatus,
      risk: relation.governanceReadiness.risk,
      nextValidation: relation.governanceReadiness.nextValidation,
    })
  }
  return [...rows.values()]
}
