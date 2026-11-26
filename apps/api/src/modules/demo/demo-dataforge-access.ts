import type { DataforgeAccountAccess } from '@bellum/contracts'

/**
 * Lot 776 (craft rule n°9) — « Accès au compte · Base commune » SEMÉ sur un compte démo : Renault. Le bloc rejoint
 * `raw_analysis.dataforge_access`, que le lecteur d'accès relaie quand aucune fiche réelle ne répond. Énumérations métier
 * seulement : aucun code brut, aucun identifiant de personne, aucune date inventée (`observedAt: null`).
 */
const RENAULT_ACCESS: DataforgeAccountAccess = {
  accessibility: 'medium',
  barriers: ['platform', 'referencing'],
  route: 'platform',
  priority: 'high',
  observedAt: null,
}

export function demoDataforgeAccessOf(companyName: string): DataforgeAccountAccess | null {
  return companyName === 'Renault' ? RENAULT_ACCESS : null
}
