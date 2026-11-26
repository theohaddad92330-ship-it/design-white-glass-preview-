/**
 * Port de la PROVENANCE, vu par la lecture automatique des CV (04/10/2026,
 * `c88_lecture_auto_cv_import`).
 *
 * Le worker `cv-auto-parse` doit faire ce que fait le contrôleur de la revue
 * (`POST /:id/parse/commit`) : LIRE la provenance actuelle des colonnes avant
 * d'écrire (c'est ce qui empêche le modèle d'écraser une correction humaine),
 * puis JOURNALISER ce qu'il a écrit en provenance `model`. Le contrôleur le
 * fait en injectant `ProvenanceService` (module `crm-core`) — un worker ne le
 * peut pas sans ajouter un import service → service que la garde GA-07
 * (`module-boundaries.spec.ts`, cliquet) refuse. Même inversion que
 * `plan-catalog.port.ts` : la forme est RECOPIÉE ici, le câblage vit dans
 * `consultants.module.ts` (`useFactory` typée par ce port).
 */

import type { FieldSource } from '@bellum/contracts'

/** Une écriture de colonne, telle que le journal la reçoit. */
interface CvAutoParseFieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

/** Les deux gestes dont la lecture automatique a besoin — rien de plus. */
export interface CvAutoParseProvenancePort {
  currentSources(entityType: 'consultant', entityId: string): Promise<Partial<Record<string, FieldSource>>>
  commit(params: {
    workspaceId: string | null
    entityType: 'consultant'
    entityId: string
    source: FieldSource
    actorId: string | null
    rule?: string | null
    changes: CvAutoParseFieldChange[]
  }): Promise<void>
}

/** Jeton d'injection — fourni par `useFactory` typée, jamais `useExisting`. */
export const CV_AUTO_PARSE_PROVENANCE_PORT = Symbol('CV_AUTO_PARSE_PROVENANCE_PORT')
