import type { ConnectedTool } from '@bellum/contracts'

/**
 * #2207.21 — retrouver l'outil du REGISTRE qui correspond au provider rendu
 * par le callback OAuth (`oauth-callback.ts`), pour que l'écran de
 * prévisualisation (`SyncLaunchPreview`) puisse lire sa période, ses objets,
 * sa durée et son coût déclarés.
 *
 * Pour six des sept providers connus (`hubspot`, `salesforce`, `pipedrive`,
 * `attio`, `notion`, `microsoft`), c'est le MÊME identifiant des deux côtés.
 * `google` est le seul à diverger : le callback ne connaît qu'un seul
 * fournisseur (« Google Workspace »), mais le registre en porte QUATRE
 * surfaces (`gmail`, `google-calendar`, `google-drive`, `googlechat`), chacune
 * avec ses propres `data_types`/`coverage_period`/`cost_model`. Faute d'un
 * geste qui dirait LAQUELLE synchroniser, on prend Gmail — la première
 * capacité que l'onboarding met en avant (agenda et documents suivent).
 */
const GOOGLE_SURFACE_PREFERENCE = ['gmail', 'google-calendar', 'google-drive', 'googlechat'] as const

export function findToolForProvider(tools: readonly ConnectedTool[], provider: string): ConnectedTool | undefined {
  const exact = tools.find(tool => tool.provider === provider)
  if (exact) return exact
  if (provider !== 'google') return undefined
  for (const surface of GOOGLE_SURFACE_PREFERENCE) {
    const tool = tools.find(t => t.provider === surface)
    if (tool) return tool
  }
  return undefined
}
