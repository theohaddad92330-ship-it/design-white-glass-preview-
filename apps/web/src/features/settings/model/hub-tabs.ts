import { z } from 'zod'

/**
 * Les onglets des deux pages de Réglages refondues d'après les maquettes Théo V22 (`settings-espace`,
 * `settings-laura`) — Louis, 22/10/2026. Un seul endroit pour les clés : la route les valide dans l'adresse
 * (`?onglet=`), la vue les rend, le menu et les renvois (`/expenses/bareme`, `/settings/pipeline`…) les citent.
 * `.catch(undefined)` : une adresse ancienne ou abîmée retombe sur le premier onglet, elle ne casse pas la page.
 */
export const SPACE_PERIMETER_TABS = ['agences', 'societes'] as const
export const SPACE_RULES_TABS = ['acces', 'pipeline', 'charge', 'marche-inverse', 'frais', 'marge', 'qualite'] as const
export const SPACE_CATALOGUE_TABS = ['motifs-perte', 'comptes-ecartes', 'non-staffabilite', 'vocabulaire'] as const
export const LAURA_DOCUMENT_TABS = ['documents', 'style'] as const

export type SpacePerimeterTab = (typeof SPACE_PERIMETER_TABS)[number]
export type SpaceRulesTab = (typeof SPACE_RULES_TABS)[number]
export type SpaceCatalogueTab = (typeof SPACE_CATALOGUE_TABS)[number]
export type LauraDocumentTab = (typeof LAURA_DOCUMENT_TABS)[number]

export const spacePerimetersSearchSchema = z.object({
  onglet: z.enum(SPACE_PERIMETER_TABS).optional().catch(undefined),
})
export const spaceRulesSearchSchema = z.object({ onglet: z.enum(SPACE_RULES_TABS).optional().catch(undefined) })
export const spaceCataloguesSearchSchema = z.object({
  onglet: z.enum(SPACE_CATALOGUE_TABS).optional().catch(undefined),
})
export const lauraDocumentsSearchSchema = z.object({ onglet: z.enum(LAURA_DOCUMENT_TABS).optional().catch(undefined) })
