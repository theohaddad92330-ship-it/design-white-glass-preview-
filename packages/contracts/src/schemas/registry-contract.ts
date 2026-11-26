/**
 * #4016 L13a — L'ÉTAT DU CONTRAT d'un registre étranger (DÉCISION LOUIS 11/10/2026).
 *
 * ⚠️ RENVERSEMENT PARTIEL ET DATÉ de « un contrat d'API non vérifiable ne se
 * devine pas » (c35) : un registre s'active sur son contrat DOCUMENTÉ — ce n'est
 * pas un contrat deviné —, mais tant qu'il n'est pas VÉRIFIÉ sur une instance de
 * production réelle, rien de facturé ne repose dessus (aucun débit de crédit) et
 * l'écran le dit (badge « contrat documenté, pas encore vérifié »).
 *
 * Miroir statique de `CountryPack.contract` (apps/ia/app/services/country_packs/
 * base.py) : le pays suffit, `registry_country` est déjà sur le compte. La
 * divergence entre les deux est gardée par `test_country_packs.py` (côté IA, il
 * compare le `contract` de chaque pack à ce tableau recopié).
 */
export type RegistryContractStatus = 'verified' | 'documented'

export const REGISTRY_CONTRACT_BY_COUNTRY: Readonly<Record<string, RegistryContractStatus>> = {
  CH: 'verified',
  BE: 'verified',
  US: 'verified',
  CA: 'verified',
  LU: 'documented',
  // #4736 lot G — packs bêta (vocabulaire + ontologie, registre dégradé, zéro réseau).
  DE: 'documented',
  GB: 'documented',
  ES: 'documented',
}

/** L'état du contrat du registre d'un pays, ou `null` : pas de pack, ou pas de pays — jamais « vérifié » par défaut. */
export function registryContractFor(country: string | null | undefined): RegistryContractStatus | null {
  const code = country?.trim().toUpperCase()
  if (!code) return null
  return REGISTRY_CONTRACT_BY_COUNTRY[code] ?? null
}

/** Vrai seulement si le contrat est VÉRIFIÉ : un contrat documenté, ou inconnu, ne débite rien. */
export function contractDebitsCredits(status: RegistryContractStatus | null): boolean {
  return status === 'verified'
}
