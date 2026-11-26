import type { ConnectedTool, PlanFeatureKey, ToolStatus } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildConnectorsView, connectorState, CONNECTORS, isConnectorCardConnected } from './connectors'

function tool(provider: string, status: ToolStatus): ConnectedTool {
  return {
    provider,
    family: 'crm',
    display_name: provider,
    status,
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    capability_state: 'not_connected' as const,
    capabilities: [],
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    coverage_period: null,
    latency: null,
    beta: null,
  }
}

/** Un registre complet « rien n'est branché mais tout est offert », sur lequel
 *  chaque test ne change que ce qu'il teste. */
function fullRegistry(status: ToolStatus = 'available'): ConnectedTool[] {
  return CONNECTORS.flatMap(c => c.registryProviders.map(p => tool(p, status)))
}

describe('connectorState', () => {
  it('remonte une autorisation expirée avant « connecté »', () => {
    // Google : le jeton est mort mais deux capacités sur trois répondent encore
    // « connected ». Afficher « connecté » ferait chercher la panne ailleurs.
    expect(connectorState([tool('gmail', 'connected'), tool('google-calendar', 'action_required')])).toBe(
      'action_required',
    )
  })

  it('rend null quand ce serveur n’offre aucune des capacités', () => {
    expect(connectorState([tool('salesforce', 'coming_soon')])).toBeNull()
  })

  it('rend « available » plutôt que de masquer un connecteur absent du catalogue', () => {
    expect(connectorState([])).toBe('available')
  })
})

describe('buildConnectorsView', () => {
  it('masque les outils que le serveur n’offre pas', () => {
    const registry = fullRegistry().map(t => (t.provider === 'salesforce' ? tool('salesforce', 'coming_soon') : t))
    const ids = buildConnectorsView(registry).groups.flatMap(g => g.connectors.map(c => c.id))
    expect(ids).not.toContain('salesforce')
    expect(ids).toContain('hubspot')
  })

  it('ne compte Google Workspace qu’une fois malgré ses trois capacités', () => {
    const registry = fullRegistry().map(t =>
      ['gmail', 'google-calendar', 'google-drive'].includes(t.provider) ? tool(t.provider, 'connected') : t,
    )
    const view = buildConnectorsView(registry)
    expect(view.counts.connected).toBe(1)
    expect(view.groups.flatMap(g => g.connectors).filter(c => c.id === 'google')).toHaveLength(1)
  })

  it('n’expose aucune source de données ni la facturation — ce n’est pas branchable par l’utilisateur', () => {
    const registry = [...fullRegistry(), tool('serper', 'connected'), tool('stripe', 'connected')]
    const ids = buildConnectorsView(registry).groups.flatMap(g => g.connectors.map(c => c.id))
    expect(ids).not.toContain('serper')
    expect(ids).not.toContain('stripe')
  })

  it('garde les compteurs vrais pendant une recherche', () => {
    const registry = fullRegistry().map(t => (t.provider === 'hubspot' ? tool('hubspot', 'connected') : t))
    const view = buildConnectorsView(registry, 'all', 'notion')
    expect(view.groups.flatMap(g => g.connectors)).toHaveLength(1)
    expect(view.counts.connected).toBe(1)
  })

  it('le filtre « branchés » garde ce qui demande un geste', () => {
    const registry = fullRegistry().map(t =>
      t.provider === 'hubspot'
        ? tool('hubspot', 'action_required')
        : t.provider === 'notion'
          ? tool(t.provider, 'connected')
          : t,
    )
    const ids = buildConnectorsView(registry, 'connected').groups.flatMap(g => g.connectors.map(c => c.id))
    expect(ids).toEqual(expect.arrayContaining(['hubspot', 'notion']))
    expect(ids).not.toContain('slack')
  })

  it('ne rend pas de section vide', () => {
    const registry = fullRegistry().map(t => (t.provider === 'hubspot' ? tool('hubspot', 'connected') : t))
    const view = buildConnectorsView(registry, 'connected')
    expect(view.groups.every(g => g.connectors.length > 0)).toBe(true)
    expect(view.groups.map(g => g.family)).toEqual(['crm'])
  })

  /**
   * Recette live du 27/08/2026 : l'en-tête annonçait « 6 branchés » au-dessus de
   * CINQ badges « Connecté ». Le compteur lit le registre serveur, chaque carte
   * lit son propre `/status` — deux sources pour la même affirmation.
   *
   * Ces trois tests fixent la règle de comptage, et disent au passage ce que
   * l'écart n'était PAS : les outils administratifs, dont `/admin-docs/status`
   * rend `{ connected: [] }`, une forme différente des autres.
   */
  it('un connecteur sans aucune ligne connectée n’est JAMAIS compté « branché »', () => {
    // La forme « tableau vide » de `/admin-docs/status` : quatre fournisseurs
    // offerts, aucun branché. Le connecteur reste visible ET « à brancher ».
    const registry = fullRegistry()
    const view = buildConnectorsView(registry)
    const adminDocs = view.groups.flatMap(g => g.connectors).find(c => c.id === 'admin_docs')

    expect(adminDocs?.state).toBe('available')
    expect(view.counts.connected).toBe(0)
    expect(view.counts.available).toBe(CONNECTORS.length)
  })

  it('ne compte pas non plus un connecteur ABSENT du registre', () => {
    // Aucune ligne du tout — le connecteur dégrade en « à brancher », il ne
    // disparaît pas et il ne se compte pas.
    const registry = fullRegistry().filter(t => !['yousign', 'docusign', 'qonto', 'tiime'].includes(t.provider))
    const view = buildConnectorsView(registry)

    expect(view.groups.flatMap(g => g.connectors).find(c => c.id === 'admin_docs')?.state).toBe('available')
    expect(view.counts.connected).toBe(0)
  })

  it('l’assistant IA compte comme les autres — donc sa carte doit le montrer', () => {
    // C'était le sixième « branché » invisible : `McpCard` jetait son `state`.
    const registry = fullRegistry().map(t => (t.provider === 'mcp' ? tool('mcp', 'connected') : t))
    const view = buildConnectorsView(registry)

    expect(view.counts.connected).toBe(1)
    expect(view.groups.flatMap(g => g.connectors).find(c => c.id === 'mcp')?.state).toBe('connected')
  })

  it('remonte en tête ce qui demande un geste', () => {
    const registry = fullRegistry().map(t =>
      t.provider === 'attio'
        ? tool('attio', 'action_required')
        : t.provider === 'hubspot'
          ? tool('hubspot', 'connected')
          : t,
    )
    const crm = buildConnectorsView(registry).groups.find(g => g.family === 'crm')
    expect(crm?.connectors.map(c => c.id).slice(0, 2)).toEqual(['attio', 'hubspot'])
  })

  /**
   * #2207.17 — L'ÉTAT « NON INCLUS », HUIT ÉTATS DEMANDÉS, SEPT DÉJÀ RENDUS.
   *
   * Le registre le disait : aucun `ConnectorState`/`CapabilityState` ne portait
   * de valeur « hors plan », alors que `usePlanFeature`/`PLAN_FEATURE_KEYS`
   * existent déjà (verrou de `ContactCrmExport`, `AiAssistantView`). Câblé ici
   * sur `mcp` (`mcp_assistant`) — le seul connecteur dont la connexion ENTIÈRE
   * est la feature payante, pas une action isolée dessus.
   */
  describe('l’état « non inclus » (#2207.17)', () => {
    it('marque un connecteur non branché hors plan, jamais un connecteur qui n’a pas de palier associé', () => {
      const registry = fullRegistry()
      const view = buildConnectorsView(registry, 'all', '', feature => feature !== 'mcp_assistant')
      const byId = new Map(view.groups.flatMap(g => g.connectors).map(c => [c.id, c.state]))
      expect(byId.get('mcp')).toBe('not_included_in_plan')
      // HubSpot ne porte aucun `planFeature` déclaré : il reste « available »
      // quelle que soit la réponse du prédicat.
      expect(byId.get('hubspot')).toBe('available')
    })

    it('ne déclasse jamais une connexion déjà ACTIVE — pas de palier retiré sous les pieds d’un client existant', () => {
      const registry = fullRegistry().map(t => (t.provider === 'mcp' ? tool('mcp', 'connected') : t))
      const view = buildConnectorsView(registry, 'all', '', () => false)
      expect(view.groups.flatMap(g => g.connectors).find(c => c.id === 'mcp')?.state).toBe('connected')
    })

    it('ne compte un connecteur hors plan ni branché ni disponible — les deux seraient faux', () => {
      const registry = fullRegistry()
      const view = buildConnectorsView(registry, 'all', '', feature => feature !== 'mcp_assistant')
      expect(view.counts.available).toBe(CONNECTORS.length - 1)
      expect(view.counts.connected).toBe(0)
    })

    it('n’apparaît ni dans « Branchés » ni dans « À brancher » — seulement dans « Tous »', () => {
      const registry = fullRegistry()
      const notIncluded = (feature: PlanFeatureKey) => feature !== 'mcp_assistant'
      expect(
        buildConnectorsView(registry, 'connected', '', notIncluded)
          .groups.flatMap(g => g.connectors)
          .some(c => c.id === 'mcp'),
      ).toBe(false)
      expect(
        buildConnectorsView(registry, 'available', '', notIncluded)
          .groups.flatMap(g => g.connectors)
          .some(c => c.id === 'mcp'),
      ).toBe(false)
      expect(
        buildConnectorsView(registry, 'all', '', notIncluded)
          .groups.flatMap(g => g.connectors)
          .some(c => c.id === 'mcp'),
      ).toBe(true)
    })

    it('par défaut (aucun prédicat passé), personne n’est déclassé — repli sûr pour les appelants existants', () => {
      const registry = fullRegistry()
      const view = buildConnectorsView(registry)
      expect(view.groups.flatMap(g => g.connectors).find(c => c.id === 'mcp')?.state).toBe('available')
    })
  })
})

describe('isConnectorCardConnected — la carte et le filtre « Branchés » (R30a)', () => {
  it.each([
    ['connected', false, true],
    ['action_required', false, true],
    ['available', true, false],
    ['not_included_in_plan', true, true],
    ['not_included_in_plan', false, false],
    [undefined, true, true],
    [undefined, undefined, false],
  ] as const)('registre %s, /status %s → %s', (state, status, expected) => {
    expect(isConnectorCardConnected(state, status)).toBe(expected)
  })
})

describe('#4406.1 — Beeper est rangé avec les messageries', () => {
  it('famille « workspace » (Messagerie, agenda et documents), pas « communication » (canaux d’équipe)', () => {
    expect(CONNECTORS.find(connector => connector.id === 'beeper')?.family).toBe('workspace')
  })
})
