import { useTranslation } from 'react-i18next'
import { normalizeContractType, type OfferContractType } from '@bellum/contracts'

// #5000.1 / #5000.2 — UN seul endroit (GA-26) pour dire le type de contrat d'une offre : la fiche compte et
// Découvrir lisent le même libellé. Clé i18n du type normalisé (les valeurs du contrat portent accents et espace).
const CONTRACT_KEYS: Record<OfferContractType, string> = {
  CDI: 'cdi',
  CDD: 'cdd',
  intérim: 'interim',
  freelance: 'freelance',
  autre: 'other',
  'non précisé': 'unspecified',
}

/** Absent ou illisible ⇒ `unspecified` : jamais deviné, jamais « 0 ». */
export function offerContractLabelKey(raw: unknown): string {
  return CONTRACT_KEYS[normalizeContractType(raw)]
}

/** Libellé traduit (espace de noms `discover`, `facts.contract.*`) du type de contrat d'une offre. */
export function useOfferContractLabel(): (raw: unknown) => string {
  const { t } = useTranslation('discover')
  return raw => t(`facts.contract.${offerContractLabelKey(raw)}`)
}

/**
 * Même libellé, mais `null` quand l'annonce ne déclare rien (ou « non précisé ») : pour une phrase où « Contrat non
 * précisé » alourdirait (Découvrir, « …(Saint-Denis, CDI, 29/10/2026) »). Le texte est celui de `useOfferContractLabel`.
 */
export function useDeclaredOfferContractLabel(): (raw: unknown) => string | null {
  const label = useOfferContractLabel()
  return raw => (normalizeContractType(raw) === 'non précisé' ? null : label(raw))
}
