/**
 * Le nom d'un porteur de mission, depuis `profiles` — #2195.13.
 *
 * Prénom + nom d'abord ; à défaut, l'email (une vraie donnée, jamais inventée).
 * `null` si les trois manquent — jamais une chaîne vide, qui se lirait comme un
 * nom renseigné.
 *
 * #2411.6 (intégration vague E, 27/09/2026) — extraite de `delivery.service.ts`
 * dans ce fichier NEUTRE (zéro import) pour casser un cycle réel :
 * `invoice-readiness.service.ts` l'utilisait déjà (`from './delivery.service'`,
 * lecture PARESSEUSE dans un corps de méthode, jamais un problème seule) mais
 * `delivery.service.ts` a gagné une injection de `InvoiceReadinessService`
 * (#2411.6) qui, elle, se résout à la déclaration de la CLASSE — donc AU
 * CHARGEMENT du module. Les deux fichiers s'important l'un l'autre au niveau
 * fichier, un point d'entrée qui charge `invoice-readiness.service.ts` avant
 * `delivery.service.ts` (`routine-executors.ts` → `delivery-routines.service.ts`
 * → `invoice-readiness.service.ts`, cas réel : `not-now-revalidation.spec.ts`)
 * lève `ReferenceError: Cannot access 'InvoiceReadinessService' before
 * initialization` — le cycle, pas un bug de ce lot-ci. Cette extraction est le
 * correctif minimal : une fonction pure n'a aucune raison de vivre dans un
 * fichier qui accumule des dépendances de service (GA-26, un seul endroit).
 * `delivery.service.ts` continue de l'exporter (`export { ownerDisplayName }
 * from './owner-display-name'`) : `accounts.service.ts`/`partners.service.ts`
 * n'ont rien à changer.
 */
export function ownerDisplayName(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
): string | null {
  const full = [firstName, lastName].filter((part): part is string => Boolean(part?.trim())).join(' ')
  if (full.length > 0) return full
  return email?.trim() || null
}
