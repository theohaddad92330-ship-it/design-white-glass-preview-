import type { AdminMigrationsReport } from '@/lib/admin'

/**
 * #2445.11 — le verdict d'une ligne : « à jour » ou « N en attente », jamais un
 * compte nu qui obligerait l'opérateur à faire la soustraction lui-même.
 */
type StatutMigrations = {
  aJour: boolean
  libelle: string
  appliedCount: number
  pendingCount: number
  total: number
}

export function statutMigrations(rapport: AdminMigrationsReport): StatutMigrations {
  const pendingCount = rapport.pending.length
  return {
    aJour: pendingCount === 0,
    libelle: pendingCount === 0 ? 'à jour' : `${pendingCount} en attente`,
    appliedCount: rapport.applied.length,
    pendingCount,
    total: rapport.total,
  }
}
