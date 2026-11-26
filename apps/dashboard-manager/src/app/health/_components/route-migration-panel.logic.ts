import type { AdminRouteMigrationReport } from '@/lib/admin'

/**
 * #2958 — le verdict d'une ligne : « GO » ou « NO-GO », jamais un compte nu
 * qui obligerait l'opérateur à recompter les gaps lui-même. Scopé aux
 * QUATORZE routes nommées par #2154.4/.5 — pas « toutes les routes
 * actuelles » (#2154.3 le nomme déjà).
 */
type StatutRouteMigration = {
  pret: boolean
  libelle: string
  redirectedCount: number
  gapCount: number
  total: number
}

export function statutRouteMigration(rapport: AdminRouteMigrationReport): StatutRouteMigration {
  const gapCount = rapport.registry.total - rapport.registry.redirectedCount
  return {
    pret: rapport.goNoGo.canGo,
    libelle: rapport.goNoGo.canGo ? 'GO' : 'NO-GO',
    redirectedCount: rapport.registry.redirectedCount,
    gapCount,
    total: rapport.registry.total,
  }
}

/**
 * #2154.7 — combien des quatorze routes peuvent être défaites, et combien ne
 * le peuvent pas (jamais fondu avec le compte de rollback lui-même).
 */
type StatutRollback = {
  rollbackableCount: number
  total: number
  notRollbackableCount: number
}

export function statutRollback(rapport: AdminRouteMigrationReport): StatutRollback {
  return {
    rollbackableCount: rapport.rollback.rollbackableCount,
    total: rapport.rollback.entries.length,
    notRollbackableCount: rapport.rollback.entries.length - rapport.rollback.rollbackableCount,
  }
}

/**
 * #2154.8 — combien de routes partagent VRAIMENT une page (vue), combien
 * n'ont plus qu'une projection (rien à faire coexister).
 */
type StatutCoexistence = {
  sharedViewCount: number
  pureRedirectCount: number
  total: number
}

export function statutCoexistence(rapport: AdminRouteMigrationReport): StatutCoexistence {
  return {
    sharedViewCount: rapport.coexistence.sharedViewCount,
    pureRedirectCount: rapport.coexistence.entries.filter(entry => entry.mode === 'redirection_pure').length,
    total: rapport.coexistence.entries.length,
  }
}

/**
 * #2154.9/#2958.72-.93 — sur les treize dimensions de la capacité de référence, combien
 * sont `verified` : jamais présenté comme « fait », un score nu (doctrine).
 */
type StatutNonRegression = {
  capacityLabel: string | null
  verifiedCount: number
  total: number
  /** #2958.72-.84 — toutes les capacités du rapport, pas la seule première. */
  capacitiesCount: number
  allVerifiedCount: number
  allTotal: number
}

export function statutNonRegression(rapport: AdminRouteMigrationReport): StatutNonRegression {
  const capacities = rapport.nonRegression.capacities
  const allChecks = capacities.flatMap(entry => entry.checks)
  const aggregate = {
    capacitiesCount: capacities.length,
    allVerifiedCount: allChecks.filter(check => check.status === 'verified').length,
    allTotal: allChecks.length,
  }
  const capacity = capacities[0]
  if (!capacity) return { capacityLabel: null, verifiedCount: 0, total: 0, ...aggregate }
  return {
    ...aggregate,
    capacityLabel: capacity.label,
    verifiedCount: capacity.checks.filter(check => check.status === 'verified').length,
    total: capacity.checks.length,
  }
}

/**
 * #2958.94-.112 — le verdict des conditions NO-GO/GO propres à #2208, jamais
 * confondu avec `statutRouteMigration` (#2154.31/.32) : deux listes, deux
 * verdicts.
 */
type StatutRouteMigration2208 = {
  pret: boolean
  libelle: string
  noGoBloqueCount: number
  goMetCount: number
  goTotal: number
}

export function statutRouteMigration2208(rapport: AdminRouteMigrationReport): StatutRouteMigration2208 {
  return {
    pret: rapport.goNoGo2208.canGo,
    libelle: rapport.goNoGo2208.canGo ? 'GO' : 'NO-GO',
    noGoBloqueCount: rapport.goNoGo2208.noGo.filter(condition => condition.status === 'blocked').length,
    goMetCount: rapport.goNoGo2208.go.filter(condition => condition.status === 'met').length,
    goTotal: rapport.goNoGo2208.go.length,
  }
}

/**
 * #2958.72-.93 — sur les neuf émetteurs du traceur produit, combien sont
 * `instrumented` sur AU MOINS une des six destinations de la migration :
 * jamais un pourcentage produit-wide, jamais plus que ce que les fichiers
 * cités prouvent.
 */
type StatutMetriques = {
  instrumentedCount: number
  total: number
}

export function statutMetriques(rapport: AdminRouteMigrationReport): StatutMetriques {
  return {
    instrumentedCount: rapport.metrics.instrumentedCount,
    total: rapport.metrics.entries.length,
  }
}
