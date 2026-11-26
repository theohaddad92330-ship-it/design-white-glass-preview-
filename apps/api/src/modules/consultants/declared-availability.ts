import { availabilityIsStale } from './matching/pushable'

/**
 * #2186.14 — L'EXPIRATION BASCULE SEULE EN « À CONFIRMER », JAMAIS EN
 * SILENCE SUR « DISPONIBLE ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `consultants.availability_checked_at` existait en base
 * (`1789601472836-TalentLanguagesAndClearances`) et était déjà REVALIDÉ à
 * chaque écriture de `availability`/`available_from`
 * (`consultants.service.ts`, patch builder), mais un seul appelant le lisait :
 * le score poussable (`matching/pushable.ts`, `availabilityIsStale`), pour une
 * pénalité de −10. Le VIVIER, lui, continuait d'afficher tel quel un
 * « disponible » déclaré il y a six mois — exactement le mensonge commercial
 * que `consultantAvailabilitySchema` documente en tête.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUIL, PAS DEUX (GA-26)
 * ─────────────────────────────────────────────────────────────────────────
 * Réutilise EXACTEMENT `availabilityIsStale`/`AVAILABILITY_REVALIDATION_DAYS`
 * (60 jours) plutôt que d'inventer un second seuil pour le vivier : deux
 * définitions de « périmé » divergeraient forcément à l'usage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PURE, ET JAMAIS ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────
 * `a_confirmer` n'existe nulle part en base — ni dans
 * `consultantAvailabilitySchema`, ni dans une migration. La doctrine dit que
 * le passage a lieu SEUL : un état stocké supposerait un job qui le pose (ou
 * un humain), et une correction humaine ultérieure de `availability` devrait
 * alors défaire cet état stocké. En le calculant à chaque lecture, il n'y a
 * jamais rien à défaire.
 */
const POSITIVE_DECLARED_STATES = new Set(['immediate', 'sous_1_mois', 'sous_3_mois'])

export function effectiveDeclaredAvailability(
  availability: string,
  checkedAt: Date | string | null,
  now: Date,
): string {
  if (!POSITIVE_DECLARED_STATES.has(availability)) return availability
  const iso = checkedAt instanceof Date ? checkedAt.toISOString() : checkedAt
  return availabilityIsStale(iso, now) ? 'a_confirmer' : availability
}
