/**
 * #3698.7 — « liste = fiche = préparation de message ».
 *
 * Trois écrans tranchaient « ce contact a-t-il un e-mail ? » chacun de son
 * côté (`bulkEmail.hasEmail`, `sendBlockedReason`, `getSendability`,
 * `classifyEnrichmentOutcome`), avec le même test écrit quatre fois : le jour
 * où l'un diverge, la liste dit « joignable » et la préparation dit « sans
 * e-mail ». Ce fichier est l'UNIQUE endroit où la question se répond ; les
 * quatre appelants le lisent.
 *
 * Doctrine : un e-mail seul est un état PARTIEL légitime (`email_only`), pas un
 * échec ; une absence n'est jamais comblée (aucun numéro supposé) ; une chaîne
 * blanche est une absence.
 */

type ContactCoordinatesState = 'complete' | 'email_only' | 'phone_only' | 'none'

type ContactCoordinates = {
  has_email: boolean
  has_phone: boolean
  state: ContactCoordinatesState
  /** Un message e-mail peut être préparé et envoyé — l'adresse existe. */
  can_prepare_email: boolean
}

const present = (value: string | null | undefined): boolean => (value ?? '').trim() !== ''

export function contactCoordinates(contact: { email?: string | null; phone?: string | null }): ContactCoordinates {
  const has_email = present(contact.email)
  const has_phone = present(contact.phone)
  const state: ContactCoordinatesState =
    has_email && has_phone ? 'complete' : has_email ? 'email_only' : has_phone ? 'phone_only' : 'none'
  return { has_email, has_phone, state, can_prepare_email: has_email }
}
