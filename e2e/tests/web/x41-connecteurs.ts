/**
 * Fixtures du registre d'outils (`GET /tool-registry`) pour les parcours X41
 * 31, 32, 35 — même forme que `ConnectedTool`
 * (`packages/contracts/src/schemas/tool-registry.ts`). Fictif.
 */

export function tool(over: Record<string, unknown> & { provider: string; family: string; display_name: string }) {
  return {
    status: 'available',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    coverage_period: null,
    latency: null,
    beta: null,
    capability_state: 'not_connected',
    capabilities: [],
    ...over,
  }
}
