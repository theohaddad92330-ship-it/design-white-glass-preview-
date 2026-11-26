/**
 * Lire une liste d'invités tapée à la main.
 *
 * Un champ libre reçoit des virgules, des points-virgules, des espaces et des
 * retours à la ligne — parce qu'on colle depuis un mail, un tableur ou une
 * signature. Tout accepter est facile ; ce qui compte est de dire CE QUI NE VA
 * PAS avant l'envoi.
 *
 * Une adresse invalide laissée passer fait échouer la création une fois le
 * bouton cliqué, avec un message du fournisseur qui ne dit pas laquelle des
 * cinq adresses est en cause.
 */
export function parseGuestList(raw: string): { valid: string[]; invalid: string[] } {
  const parts = String(raw ?? '')
    .split(/[,;\s]+/)
    .map(part => part.trim())
    .filter(Boolean)

  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    // Volontairement simple : un caractère avant l'arobase, un domaine à point
    // après. Une validation plus fine rejetterait des adresses légitimes, et
    // c'est le fournisseur qui tranche en dernier ressort de toute façon.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part)) {
      if (!invalid.includes(part)) invalid.push(part)
      continue
    }
    const normalized = part.toLowerCase()
    // Deux fois la même adresse enverrait deux invitations à la même personne.
    if (seen.has(normalized)) continue
    seen.add(normalized)
    valid.push(normalized)
  }

  return { valid, invalid }
}

/**
 * #2938 — une SEULE adresse, validée par la MÊME règle que la liste
 * (`parseGuestList`) : jamais une seconde regex pour la même question
 * (GA-26). `null` sur une saisie vide, invalide, ou qui désigne PLUS d'une
 * adresse — « un destinataire hors CRM » en nomme UN, jamais un lot.
 */
export function validatedSingleEmail(raw: string): string | null {
  const { valid, invalid } = parseGuestList(raw)
  if (invalid.length > 0 || valid.length !== 1) return null
  return valid[0]!
}

/**
 * #2938 — le lien `mailto:` du brouillon. LE COPILOTE N'ENVOIE JAMAIS
 * D'E-MAIL, IL PRÉPARE (doctrine) : ce lien n'expédie rien lui-même, il ouvre
 * le client de messagerie de la personne, sujet et corps déjà écrits — c'est
 * LÀ, et seulement là, qu'un envoi part, sur un geste qui n'est pas le nôtre.
 */
export function guestWarningMailto(recipient: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
