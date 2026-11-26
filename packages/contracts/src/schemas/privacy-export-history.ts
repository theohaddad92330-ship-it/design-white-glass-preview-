import type { PortableFormat } from './data-portability.js'

/**
 * #2439.15 / #2439.7 — « Mes exports » — LA QUATRIÈME DES CINQ CATÉGORIES
 * MANQUANTES DU NO-GO (mémoire, fichiers, EXPORTS, marché).
 *
 * `PrivacyExportAuditLogEntity` (migration `1796321386200-PrivacyExportAuditLog`,
 * lot nuit-16) journalise déjà chaque export personnel depuis #2439.15 — « écriture
 * seule … aucun écran dédié » disait son propre commentaire de tête. Cette forme
 * rend exactement ce que la table écrit, rien de plus : aucune date, aucun format
 * inventé pour un compte qui n'a jamais exporté.
 */
export type ExportHistoryKind = 'full' | 'object'

export type ExportHistoryEntry = {
  kind: ExportHistoryKind
  /** La `payloadKey` de l'objet exporté — `null` pour un export `full`. */
  objectKey: string | null
  format: PortableFormat | null
  createdAt: string
}
