/**
 * #4629.2 / #4629.3 — le verrou d'essai, ÉNUMÉRÉ (décision Louis 28/10/2026).
 *
 * Tout ce qui COÛTE passe la porte : les analyses, les enrichissements de contacts, le chat avec Laura et Découvrir.
 * Ce qui ne coûte rien reste ouvert, et l'écran le DIT — jamais un « tout est verrouillé » qui serait faux.
 * Les crédits sont implicites : AUCUN chiffre dans ce message (Louis 22/10, épopée #4468).
 *
 * Une seule liste, lue par la porte de l'API (le 403 du chat et de Découvrir) ET par le bandeau de l'écran :
 * un réglage vit à un seul endroit (GA-26), les deux ne peuvent pas se contredire.
 */

type TrialLockLocale = 'fr' | 'en'

const TRIAL_LOCK_CLOSED = {
  fr: ['les analyses', 'les enrichissements de contacts', 'le chat avec Laura', 'Découvrir'],
  en: ['analyses', 'contact enrichment', 'the chat with Laura', 'Discover'],
} as const

const TRIAL_LOCK_OPEN = {
  fr: ['la consultation de tes comptes, contacts et dossiers déjà préparés', 'la facturation'],
  en: ['browsing the accounts, contacts and dossiers already prepared', 'billing'],
} as const

function joinList(items: readonly string[], locale: TrialLockLocale): string {
  const and = locale === 'en' ? ' and ' : ' et '
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`
}

/** Ce que le verrou ferme, puis ce qui reste ouvert — la phrase que l'API et l'écran disent mot pour mot. */
export function trialLockEnumeration(locale: TrialLockLocale = 'fr'): string {
  const closed = joinList(TRIAL_LOCK_CLOSED[locale], locale)
  const open = joinList(TRIAL_LOCK_OPEN[locale], locale)
  return locale === 'en' ? `Closed: ${closed}. Still open: ${open}.` : `Fermés : ${closed}. Restent ouverts : ${open}.`
}

/** Le message du refus 403 (chat, Découvrir) : le verrou, puis l'énumération. */
export function trialLockMessage(locale: TrialLockLocale = 'fr'): string {
  const head =
    locale === 'en'
      ? 'Your access is locked until an offer is chosen.'
      : "Ton accès est verrouillé tant qu'aucune offre n'est choisie."
  return `${head} ${trialLockEnumeration(locale)}`
}

/** Le code d'erreur du refus, lu par l'écran pour reconnaître le verrou (et non une panne). */
export const TRIAL_LOCK_ERROR = 'trial_locked'
