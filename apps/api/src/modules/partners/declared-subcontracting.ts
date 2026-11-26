import type { PartnerEvidenceOrigin } from '@bellum/contracts'

/**
 * #1624.7 — LE RANG « DÉCLARÉ » DU RÉFÉRENTIEL ESN, RÉUTILISÉ ICI.
 *
 * `openToSubcontracting` existe déjà sur le référentiel ESN (lu par
 * `/consultants`, `reverse-market.ts`) et n'était branché sur AUCUN écran de
 * compte. Une ESN qui a DÉCLARÉ être ouverte à la sous-traitance est une
 * preuve DISTINCTE de l'observation du corpus de parcours (`market_observation`)
 * et de ce que l'espace a lui-même déclaré (`workspace_declared`) : c'est
 * l'ESN elle-même qui parle, dans un autre produit. `TabPartners.tsx` la
 * range dans la MÊME structure de preuves (`EvidenceOrigins`), pas dans une
 * seconde.
 *
 * Pure et testée à part, comme `mergePartnerEvidence` juste à côté : le
 * rapprochement par nom passe par la normalisation appelée en paramètre —
 * jamais recopiée ici — pour ne jamais diverger de celle du référentiel ESN.
 */
interface DeclaredSubcontractingFact {
  /** `'oui' | 'non' | 'inconnu'` côté référentiel — seul `'oui'` compte ici. */
  openToSubcontracting: string
}

export function applyDeclaredSubcontracting<T extends { name: string; evidence_origins?: PartnerEvidenceOrigin[] }>(
  partners: readonly T[],
  facts: ReadonlyMap<string, DeclaredSubcontractingFact>,
  normalize: (name: string) => string,
): T[] {
  if (facts.size === 0) return [...partners]

  return partners.map(partner => {
    const fact = facts.get(normalize(partner.name))
    // `'oui'` seul compte : `'non'` et `'inconnu'` ne sont pas une preuve, et
    // une absence n'en est pas une non plus — silence, jamais un « non ».
    if (fact?.openToSubcontracting !== 'oui') return partner

    const origins = partner.evidence_origins ?? []
    if (origins.includes('declared_subcontracting')) return partner
    return { ...partner, evidence_origins: [...origins, 'declared_subcontracting'] }
  })
}
