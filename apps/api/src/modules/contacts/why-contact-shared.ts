/**
 * #3692.7 — un `why_contact` identique sur plusieurs contacts de l'espace ne dit
 * rien de CETTE personne : la synthèse « Pourquoi ce contact compte » le retire.
 * Une seule normalisation, miroir EXACT du SQL de `isWhyContactShared`
 * (`lower(btrim(x))` puis ponctuation/espaces finaux retirés).
 */
export const WHY_CONTACT_SHARED_MIN_OTHERS = 2

export function normalizeWhyContact(whyContact: string | null | undefined): string {
  return (whyContact ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s.!?;:]+$/, '')
}
