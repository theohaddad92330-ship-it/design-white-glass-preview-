/**
 * Port de la PROVENANCE, vu par `ConsultantEngagementService` (#4196).
 *
 * Même inversion que `cv-auto-parse-provenance.port.ts` : le service doit LIRE
 * la provenance courante des colonnes avant d'écrire (c'est ce qui laisse la
 * saisie manuelle gagner) puis JOURNALISER, mais ne peut pas injecter
 * `ProvenanceService` (module `crm-core`) sans ajouter l'import service →
 * service que GA-07 refuse. La forme est recopiée ici, le câblage vit dans
 * `consultants.module.ts`.
 */

import type { FieldSource } from '@bellum/contracts'

interface EngagementFieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

export interface ConsultantEngagementProvenancePort {
  currentSources(entityType: 'consultant', entityId: string): Promise<Partial<Record<string, FieldSource>>>
  currentSourcesDetailed(
    entityType: 'consultant',
    entityId: string,
  ): Promise<Partial<Record<string, { source: FieldSource; observedAt: string }>>>
  commit(params: {
    workspaceId: string | null
    entityType: 'consultant'
    entityId: string
    source: FieldSource
    actorId: string | null
    rule?: string | null
    changes: EngagementFieldChange[]
  }): Promise<void>
}

export const CONSULTANT_ENGAGEMENT_PROVENANCE_PORT = Symbol('CONSULTANT_ENGAGEMENT_PROVENANCE_PORT')
