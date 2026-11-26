import type { ContactChannelTally } from '@bellum/contracts'

type NetworkCounts = {
  withEmail: number | undefined
  withPhone: number | undefined
  unattached: number | undefined
}

/**
 * #4527.1/.3 — les chiffres des tuiles « Avec e-mail · Avec téléphone · À rattacher », lus du SERVEUR
 * (`channelTally`, même population que la liste), jamais comptés sur les pages chargées : un compte partiel
 * présenté comme un total est faux (garde 549f2b2753).
 *
 * `tally` absent (chargement, échec, ancien snapshot) ⇒ aucun chiffre, jamais « 0 » (GA-18/19). Une vue qui
 * rogne les lignes côté client (À enrichir, Ne pas solliciter…) ne se compte pas côté serveur : rien plutôt
 * qu'un chiffre qui ne serait pas celui de la puce.
 */
export function networkCountsOf({
  tally,
  narrowedClientSide,
}: {
  tally: ContactChannelTally | undefined
  narrowedClientSide: boolean
}): NetworkCounts {
  if (!tally || narrowedClientSide) return { withEmail: undefined, withPhone: undefined, unattached: undefined }
  return { withEmail: tally.withEmail, withPhone: tally.withPhone, unattached: tally.unattached }
}
