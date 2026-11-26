import { useOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'

/**
 * LUDB.3 — le vocabulaire suit le PACK de l'espace. Un espace non-IT (pack
 * déclaré au portefeuille d'offre, autre que `esn_it`) lit « ton profil », « surface
 * industrielle », des exemples de ses métiers ; un espace IT, ou dont le pack
 * n'est pas encore connu, garde ses libellés d'origine À L'OCTET.
 *
 * Rendu comme un `context` i18next (`clé_industrial`) : une clé sans variante
 * retombe sur la clé de base, donc rien ne casse là où personne n'a écrit de variante.
 */
export function packVocabularyContext(companyType: string | null | undefined): 'industrial' | undefined {
  return companyType && companyType !== 'esn_it' ? 'industrial' : undefined
}

export function usePackVocabulary(): { context: 'industrial' | undefined } {
  const { data } = useOfferPortfolio()
  return { context: packVocabularyContext(data?.company_type) }
}
