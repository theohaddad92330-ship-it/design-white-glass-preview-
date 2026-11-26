import { BUYER_ROLE_FAMILIES, resolveBuyerRoleFamily } from '@bellum/contracts'

/**
 * #AM.32 — « Voir dans l'organigramme » : l'URL de l'onglet Organigramme (vue Focale, l'écran d'arrivée) d'un compte,
 * déjà filtrée sur le périmètre que Laura vient de rendre. Le filtre « famille » de l'onglet (`of=family=…`) parle
 * le libellé persisté (`Cyber`, `IT`…) : le périmètre libre (« cyber GRC ») s'y résout par le registre des familles
 * de rôles acheteurs (GA-26) — un périmètre qu'aucune famille ne désigne n'écrit AUCUN filtre (jamais un filtre
 * deviné qui viderait la carte).
 */
export function orgViewHref(orgView: { account_id: string; perimeter?: string | undefined }): string {
  const key = resolveBuyerRoleFamily(orgView.perimeter)
  const family = key ? BUYER_ROLE_FAMILIES.find(entry => entry.key === key)?.contactFamily : undefined
  const params = new URLSearchParams({ tab: 'organigramme' })
  if (family) params.set('of', new URLSearchParams({ family }).toString())
  return `/accounts/${encodeURIComponent(orgView.account_id)}?${params.toString()}`
}
