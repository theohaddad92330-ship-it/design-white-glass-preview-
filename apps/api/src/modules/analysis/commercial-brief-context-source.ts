import type { AccountIntelligenceContextView, AccountIntelligenceField } from '@bellum/contracts'

/**
 * Chantier « briefs comptes » (01/10/2026) — LES FAITS INTERNES QUE LE BRIEF
 * COMMERCIAL VA CHERCHER HORS DE SON MODULE.
 *
 * Même idiome que `market-path-axis-source.ts` (GA-07, cliquet au plafond) :
 * `CommercialBriefStep` dépend d'un PORT qu'il possède ; c'est
 * `analysis.module.ts` qui le branche sur la façade
 * `AccountIntelligenceContextService` (#1618) — mémoire marché + référentiel
 * DataForge + siège résolu par hiérarchie de confiance (une correction humaine
 * gagne toujours). Le step ne connaît pas le nom de la façade.
 *
 * ⚠️ Ce que le port NE transmet PAS, à dessein :
 * - `recommendations` et le statut DataForge (`nextAction`, `recommendedStrategy`,
 *   pénétrabilité…) : ils décrivent NOTRE prospection, pas le compte — « zéro
 *   donnée de notre propre performance » (demande du CEO, contrôle
 *   OWN_PERFORMANCE de `checkCommercialBrief`) ;
 * - une couverture mémoire marché vide ou illisible : « on n'affiche pas ce
 *   qu'on n'a pas » — le modèle n'a pas à interpréter un silence.
 */

/** Le jeton d'injection des faits internes du brief. */
export const COMMERCIAL_BRIEF_CONTEXT_SOURCE = Symbol('COMMERCIAL_BRIEF_CONTEXT_SOURCE')

interface CommercialBriefInternalContext {
  /** Le siège RÉSOLU (valeur + échelon qui l'a dite), `null` s'il est inconnu. */
  readonly headquarters: { readonly value: string; readonly source: string } | null
  /** Ce que l'espace sait en interne, sans rien de sa propre prospection. */
  readonly internalFacts: Record<string, unknown>
}

export interface CommercialBriefContextSource {
  contextFor(accountId: string, workspaceId: string): Promise<CommercialBriefInternalContext | null>
}

const known = <T>(field: AccountIntelligenceField<T>): T | undefined =>
  field.state === 'known' ? field.value : undefined

/** Projection PURE de la façade vers ce que le brief a le droit de lire. */
export function toCommercialBriefContext(view: AccountIntelligenceContextView): CommercialBriefInternalContext {
  const facts: Record<string, unknown> = {}
  const sector = known(view.sector)
  if (sector) facts['sector'] = sector
  const incumbents = known(view.incumbentEsn)
  if (incumbents?.length) facts['incumbent_esn'] = incumbents
  const technologies = known(view.technologies)
  if (technologies?.length) facts['technologies'] = technologies
  const entryPaths = known(view.entryPaths)
  if (entryPaths?.length) facts['entry_paths'] = entryPaths
  const read = view.marketMemory.read
  if (read.status === 'ok' && read.coverage.covered) facts['market_observations'] = read.coverage
  // Une contradiction ouverte entre deux sources est exactement ce qu'un brief
  // doit NOMMER (« ce qu'on ne sait pas »), jamais trancher en silence.
  if (view.conflicts.length > 0) facts['open_field_conflicts'] = view.conflicts

  const hq = view.headquarters
  return {
    headquarters: hq.state === 'known' ? { value: hq.value, source: hq.provenance.source } : null,
    internalFacts: facts,
  }
}
