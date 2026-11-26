import { ServiceUnavailableException } from '@nestjs/common'
import type { BusinessUnitService } from './business-unit.service'

/**
 * LA RÈGLE DU FAIL-CLOSED, écrite une fois pour tous les contrôleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cloisonnement de périmètre se résout au BORD, dans chaque contrôleur qui
 * ouvre un compte. `BusinessUnitService` y est injecté en `@Optional()` et en
 * dernière position — non par tiédeur, mais parce qu'une vingtaine de specs
 * construisent ces contrôleurs POSITIONNELLEMENT et qu'un paramètre requis
 * ajouté au milieu les casserait toutes.
 *
 * ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE. Le repli « pas de
 * service, donc pas de filtre » serait un fail-open : la première erreur de
 * câblage ouvrirait l'espace entier sans qu'aucun écran ne change d'apparence,
 * et c'est exactement le genre de panne que personne ne remarque. Absent, on
 * LÈVE.
 *
 * Elle vit ici, et pas recopiée dans chaque contrôleur, parce qu'une dérivation
 * vit à un seul endroit (GA-26) : cinq copies de ce `if` divergeraient le jour
 * où l'une seule est « simplifiée » en `?? null`.
 */
export async function resolveBusinessUnitScope(
  businessUnits: BusinessUnitService | undefined,
  workspaceId: string,
  userId: string,
): Promise<{ businessUnitIds: readonly string[]; includeUnassigned: true } | null> {
  if (!businessUnits) {
    throw new ServiceUnavailableException('business_unit_scope_unavailable')
  }
  return businessUnits.scopeFor(workspaceId, userId)
}
