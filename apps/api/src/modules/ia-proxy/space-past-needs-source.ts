import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'

/**
 * #5203 (lot 782) — LE PORT PAR LEQUEL DÉCOUVRIR LIT LES LIGNES PASSÉES DE L'ESPACE.
 *
 * `DiscoverSourcesService` ne connaît pas le nom de `AccountSignalLinesService` : il possède cette interface, et
 * `ia-proxy.module.ts` branche l'implémentation avec le port en TYPE DE RETOUR du `useFactory` (jamais `useExisting`).
 * Même idiome que `base-matches-source.ts` — le cliquet des imports service → service (GA-07) ne monte pas.
 * Le lecteur est cloisonné par espace et business unit ; rien d'une personne n'en sort (SIREN, nom de compte, lieu,
 * type, intitulé et date de chaque ligne).
 */
export const SPACE_PAST_NEEDS_SOURCE = Symbol('SPACE_PAST_NEEDS_SOURCE')

export interface SpacePastNeedsSource {
  pastNeedsForWorkspace(args: {
    workspaceId: string
    businessUnitScope?: BusinessUnitScopeClause
    now?: Date
  }): Promise<
    Array<{
      siren: string | null
      company_name: string
      headquarters: string | null
      sector: string | null
      lines: Array<{ type: string; title: string; date: string }>
    }>
  >
}
