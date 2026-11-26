export const disabledProductRoutes = {
  // Discover is wired end-to-end (contract fixed, no-retry/timeout on the proxy).
  // Un-gated: the results view has a progress state for the ~15-20s IA run.
  discover: false,
  // Connaissances: RAG documents (upload/search, prod via Supabase REST + FTS),
  // real copy-ready templates & playbooks, and HubSpot CRM (OAuth, env-gated).
  knowledge: false,
  chat: false,
} as const

export type DisabledProductRoute = keyof typeof disabledProductRoutes

export function isProductRouteDisabled(route: DisabledProductRoute): boolean {
  return disabledProductRoutes[route]
}
