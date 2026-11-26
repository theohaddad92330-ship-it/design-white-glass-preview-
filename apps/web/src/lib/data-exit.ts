import { useQuery } from '@tanstack/react-query'
import type { ApiError } from '@/lib/api'
import { i18n } from '@/i18n'
import { WORKSPACE_RULES_KEY, workspaceRulesApi } from '@/features/settings/lib/workspace-rules-api'

/**
 * #2081.14 — LA SORTIE DE DONNÉES, CÔTÉ ÉCRAN (DÉCISION Louis 19/09/2026).
 *
 * La règle d'espace « qui peut exporter » ne ferme que la SORTIE de données.
 * Une route de l'API qui en fait sortir est tenue au guard (`@DataExit()`).
 * Un CSV construit DANS LE NAVIGATEUR (Découvrir, le chat, la sélection de
 * contacts, la finance) n'a pas de route : la décision vient donc de l'API,
 * `dataExitAllowed` de `GET /workspaces/rules`, dérivé par la MÊME fonction
 * que le guard (`workspaceRuleForbids`, GA-26). L'écran ne recalcule rien.
 *
 * `useDataExit()` rend deux choses :
 *  - `allowed` — pour MASQUER le bouton quand la règle le refuse ;
 *  - `grant` — la PREUVE qu'exige `downloadCSV` (`@/lib/export-csv`) : sans
 *    elle, un nouveau générateur de CSV ne compile pas. Seul ce fichier en
 *    fabrique une (garde `a-csv-leaves-only-through-the-workspace-rule`).
 *
 * Sans réponse — chargement, panne — rien ne s'ouvre : une règle qui RETIRE
 * ne se lit pas « ouverte » sur un doute.
 */

declare const dataExitBrand: unique symbol
/** La preuve que la règle d'espace laisse l'appelant faire sortir des données. */
export type DataExitGrant = { readonly [dataExitBrand]: true }

const GRANT = Object.freeze({}) as DataExitGrant

interface DataExit {
  allowed: boolean
  grant: DataExitGrant | null
}

export function useDataExit(): DataExit {
  const query = useQuery({
    queryKey: WORKSPACE_RULES_KEY,
    queryFn: () => workspaceRulesApi.get(),
    retry: false,
    staleTime: 60_000,
  })
  const allowed = query.data?.dataExitAllowed === true
  return { allowed, grant: allowed ? GRANT : null }
}

const REFUSAL_KEYS = {
  exportPolicy: 'workspaceRules:refusal.exportPolicy',
  businessUnitAccountsVisibility: 'workspaceRules:refusal.businessUnitAccountsVisibility',
} as const

/**
 * La phrase d'un refus de RÈGLE D'ESPACE (« Réservé par la règle d'espace :
 * … »), ou `null` pour tout autre échec — qui garde son propre message. Le
 * refus se reconnaît à son code machine (`workspace_rule_refused`), jamais à
 * sa phrase.
 */
export function workspaceRuleRefusalText(error: unknown): string | null {
  // Lu sur la FORME (`code`, `details`) et non par `instanceof ApiError` : un
  // appelant qui reçoit l'erreur d'un autre client HTTP (ou d'une copie de la
  // classe) doit reconnaître le refus tout autant.
  if (typeof error !== 'object' || error === null) return null
  const { code, details } = error as Partial<Pick<ApiError, 'code' | 'details'>>
  if (code !== 'workspace_rule_refused') return null
  const rule = (details as { rule?: unknown } | undefined)?.rule
  return i18n.t(rule === 'businessUnitAccountsVisibility' ? REFUSAL_KEYS[rule] : REFUSAL_KEYS.exportPolicy)
}
