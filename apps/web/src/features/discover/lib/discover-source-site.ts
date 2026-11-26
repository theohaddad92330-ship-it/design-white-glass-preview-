/**
 * Théo A decouvrir.R5 — un fait ne porte un lien que si son URL est lisible. Ce helper ne nomme aucun site (refonte 23/10) ; le site d'une OFFRE s'affiche ailleurs, sur liste blanche
 * (`offerOriginLabel`, Louis 02/11 #5010.3). Jamais un fournisseur intermédiaire. Pas d'URL http(s) lisible → `null` : pas de lien, rien d'inventé.
 */
export function sourceSiteName(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    const host = parsed.hostname.replace(/^www\./, '')
    return host === '' ? null : host
  } catch {
    return null
  }
}
