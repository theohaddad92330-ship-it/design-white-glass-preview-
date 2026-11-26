const AUTOMATED_LOCAL_PART =
  /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounces?|notifications?)(?:[-_.+].*)?$/i

/** Adresse nue d'un « Nom <adresse> » ; la partie locale suffit à reconnaître un expéditeur système. */
function localPart(address: string): string {
  const bracketed = /<([^>]+)>/.exec(address)
  const bare = (bracketed?.[1] ?? address).trim()
  return bare.split('@')[0] ?? ''
}

/** #4405.1 — l'interlocuteur est un expéditeur système (no-reply…) : on ne prépare pas de réponse à une machine. */
export function isAutomatedSender(address: string | null | undefined): boolean {
  if (!address) return false
  return AUTOMATED_LOCAL_PART.test(localPart(address))
}
