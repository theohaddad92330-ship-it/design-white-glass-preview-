import type { OpenNeedRow, ProjectReadRow } from '@bellum/contracts'

/**
 * #3423.10 — LA FRONTIÈRE SIGNAL / BESOIN DU DOSSIER, ÉCRITE UNE SEULE FOIS.
 *
 * Un besoin est une ligne de pipe confirmée qui n'est pas un signal. L'onglet
 * Besoins et la recherche du dossier lisent CE prédicat — garde GA-405 : un
 * signal ne devient jamais un besoin dans l'une et reste un signal dans l'autre.
 */
export function isConfirmedNeedRow(row: Pick<ProjectReadRow, 'kind' | 'stage'>): boolean {
  return row.kind !== 'signal' && row.stage === 'confirmed'
}

/** Un ancien besoin = un projet CLOS de l'espace (gagné ou perdu), jamais un signal. */
export function isHistoricalNeedRow(row: Pick<ProjectReadRow, 'kind' | 'stage'>): boolean {
  return row.kind !== 'signal' && (row.stage === 'won' || row.stage === 'lost')
}

/**
 * #3681 — une annonce de recrutement INTERNE n'est pas une mission de prestation
 * accessible à une ESN. Le seul témoin est le TYPE du besoin (`contract_kind`),
 * jamais une lecture de son titre.
 */
export function isInternalHire(need: Pick<OpenNeedRow, 'contract_kind'>): boolean {
  return need.contract_kind === 'recrutement'
}
