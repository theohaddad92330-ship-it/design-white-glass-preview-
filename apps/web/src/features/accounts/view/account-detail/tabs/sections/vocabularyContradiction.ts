import type { AnalysisVocabularyTerm } from '@bellum/contracts'

/**
 * #3709 (recette prod 07/10, Arquus) — la grille « Vocabulaire du groupe »
 * affichait « Aucun contact direct vérifié… pas de contact vérifié chez
 * ARQUUS » à côté de « 32 vérifiés » : une PHRASE DU MODÈLE, écrite pendant
 * l'analyse et stockée telle quelle dans `account_vocabulary`, jamais un fait
 * calculé. Règle déterministe : une phrase qui dit « aucun contact vérifié »
 * ne s'affiche pas tant que le décompte réel (`email_verified`) en compte au
 * moins un. Le texte contredit devient une absence (« — »), jamais un autre
 * texte inventé ; le terme lui-même reste.
 */
const NO_VERIFIED_CONTACT = [
  /\b(aucun|pas de|sans)\s+contacts?\s+(direct\s+)?v[eé]rifi[eé]s?/i,
  /\b(aucun|pas de)\s+contacts?\s+(direct\s+)?(n['’]est\s+)?v[eé]rifi[eé]/i,
  /\bno\s+(direct\s+)?verified\s+contacts?\b/i,
  /\bno\s+verified\s+direct\s+contacts?\b/i,
]

export function contradictsVerifiedContacts(text: string | null | undefined, verifiedCount: number): boolean {
  if (!text || verifiedCount <= 0) return false
  return NO_VERIFIED_CONTACT.some(re => re.test(text))
}

export function dropContradictedVocabularyText(
  term: AnalysisVocabularyTerm,
  verifiedCount: number,
): AnalysisVocabularyTerm {
  const meaning = contradictsVerifiedContacts(term.meaning, verifiedCount) ? '' : term.meaning
  const commercialWhy = contradictsVerifiedContacts(term.commercialWhy, verifiedCount) ? '' : term.commercialWhy
  if (meaning === term.meaning && commercialWhy === term.commercialWhy) return term
  return { ...term, meaning, commercialWhy }
}
