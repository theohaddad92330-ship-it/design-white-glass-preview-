/**
 * #1931 L2 (invariant I3) — la SEULE forme sous laquelle un autre module peut
 * solder une réservation de crédits.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PORT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Arbitrage de Louis (12/09) : un enrichissement lancé depuis une carte RÉSERVE
 * son crédit au clic (solde −1 pendant la recherche), DÉBITE s'il trouve,
 * LIBÈRE sinon. La recherche tourne dans le worker BullMQ du module `contacts`
 * (30-85 s) — c'est là, et nulle part ailleurs, que le débit est observé.
 *
 * Si la réservation n'était soldée qu'à la prochaine LECTURE de la carte, un
 * onglet fermé laisserait le crédit compté DEUX fois (réservé + débité) jusqu'à
 * l'expiration de la réservation (30 min) : exactement ce qu'interdit I3
 * (« jamais réservation + débit pour la même action »). Le worker solde donc
 * lui-même, dans la même exécution que le débit, par ce port.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seul ÉCRIVAIN de `credit_reservations` reste `CreditReservationService`
 * (ce port est lié à lui par `useExisting`, voir `credit-reservation.module.ts`).
 * Aucun appelant ne débite par ici (I2) : `settle` ne touche jamais le ledger.
 *
 * GA-07 : ce fichier n'importe RIEN et son nom ne contient pas « service » —
 * le worker de `contacts` en dépend sans ajouter d'import service → service.
 */
export const CREDIT_RESERVATION_SETTLER = Symbol('CREDIT_RESERVATION_SETTLER')

export type CreditReservationSettler = {
  /** `consumed` quand un débit a été OBSERVÉ, `released` sinon. Idempotent (no-op sur une réservation déjà soldée). */
  /** R4 — l'espace d'abord : la même référence peut vivre dans deux espaces (index `(workspace_id, reference)`). */
  settle(workspaceId: string, reference: string, outcome: 'consumed' | 'released'): Promise<void>
}
