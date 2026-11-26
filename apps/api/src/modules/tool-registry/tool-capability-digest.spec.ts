import {
  CLIENT_TOOLS,
  deriveInternalCapabilities,
  OUR_SUPPLIERS,
  supplierNamesIn,
  type ConnectedTool,
  type ToolFamily,
  type ToolStatus,
} from '@bellum/contracts'
import { TOOL_CATALOG } from './tool-catalog'
import {
  aggregateCapabilities,
  creditCostOf,
  notConnectedCapabilityLabels,
  renderCapabilityDigest,
  renderInternalCapabilityDigest,
} from './tool-capability-digest'

/**
 * Le digest de capacités est la barrière entre le registre (nominatif par
 * nécessité) et le prompt du copilote. Ces tests vérifient ce qui doit passer
 * (la capacité, son état, son coût en crédits) et ce qui ne doit jamais passer.
 *
 * #1912.11 — décision Louis 13/09/2026, batch 11 : la règle d'avant (« aucun nom
 * d'éditeur », addendum final p12) est REFAITE sur l'axe D354 — à qui appartient
 * l'outil. L'outil que l'ESPACE a branché se nomme à côté de sa capacité, parce
 * que « brouillon déposé dans Gmail » dit où regarder ; NOTRE fournisseur ne se
 * nomme jamais, même « connecté » par une clé serveur ; un outil non connecté
 * ne se nomme pas. Les listes vivent dans `@bellum/contracts` (`tool-naming.ts`).
 */

function tool(over: Partial<ConnectedTool> & { family: ToolFamily; status: ToolStatus }): ConnectedTool {
  return {
    provider: over.provider ?? 'p',
    display_name: over.display_name ?? 'Fournisseur X',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    capability_state: 'not_connected',
    capabilities: [],
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    coverage_period: null,
    latency: null,
    beta: null,
    ...over,
  }
}

describe('digest de capacités du copilote', () => {
  // #1912.11 — décision 13/09 batch 11 : l'outil BRANCHÉ par l'espace se nomme
  // à côté de sa capacité ; le digest ne l'invente pas, il le lit.
  it("nomme la capacité ET l'outil que l'espace a branché", () => {
    const digest = renderCapabilityDigest(
      [
        tool({
          family: 'crm',
          provider: 'hubspot',
          status: 'connected',
          display_name: 'HubSpot',
          allowed_actions: ['export_contact'],
        }),
      ],
      10,
    )
    expect(digest).toBe(
      '- ton CRM — HubSpot (connecté) : créer ou mettre à jour une fiche — coût : inclus dans ton offre',
    )
  })

  it('sait dire NON — NOTRE fournisseur ne se nomme jamais, même « connecté » par une clé serveur', () => {
    const digest = renderCapabilityDigest(
      [
        tool({
          family: 'prospection',
          provider: 'dropcontact',
          status: 'connected',
          display_name: 'Dropcontact',
          allowed_actions: ['enrich_contact'],
        }),
      ],
      10,
    )
    expect(digest).toContain('la recherche de coordonnées (connecté)')
    expect(supplierNamesIn(digest ?? '')).toEqual([])
    // …et le détecteur, lui, voit bien un nom glissé dans une ligne fabriquée.
    expect(supplierNamesIn('- la recherche de coordonnées — Dropcontact (connecté)')).toEqual(['Dropcontact'])
  })

  it('un outil client NON connecté ne se nomme pas, même à côté d’un outil branché', () => {
    const digest = renderCapabilityDigest(
      [
        tool({ family: 'crm', provider: 'hubspot', status: 'available', display_name: 'HubSpot' }),
        tool({ family: 'crm', provider: 'attio', status: 'connected', display_name: 'Attio' }),
      ],
      10,
    )
    expect(digest).toContain('ton CRM — Attio (connecté)')
    expect(digest).not.toContain('HubSpot')
  })

  it('nomme les DEUX outils branchés d’une même capacité, sur UNE ligne', () => {
    const digest = renderCapabilityDigest(
      [
        tool({ family: 'crm', provider: 'hubspot', status: 'connected' }),
        tool({ family: 'crm', provider: 'attio', status: 'action_required' }),
      ],
      10,
    )
    expect(digest).toBe(
      '- ton CRM — HubSpot, Attio (connecté, une connexion à renouveler) : lecture seule — coût : inclus dans ton offre',
    )
  })

  it('agrège deux outils de la même famille en UNE capacité', () => {
    // Deux CRM connectés, ce n'est pas deux capacités : du point de vue du
    // commercial il n'y a qu'un « CRM ». Deux lignes lui feraient croire qu'il
    // doit choisir, et exposeraient au passage qu'il y a deux produits derrière.
    const digest = renderCapabilityDigest(
      [
        tool({ family: 'crm', status: 'connected', display_name: 'HubSpot', allowed_actions: ['export_contact'] }),
        tool({ family: 'crm', status: 'connected', display_name: 'Attio', allowed_actions: ['log_activity'] }),
      ],
      10,
    )
    expect(digest?.split('\n')).toHaveLength(1)
    expect(digest).toContain('créer ou mettre à jour une fiche')
    expect(digest).toContain('écrire une note')
  })

  it('rend « connecté » quand une capacité vit malgré une connexion cassée', () => {
    const capabilities = aggregateCapabilities([
      tool({ family: 'crm', status: 'connected' }),
      tool({ family: 'crm', status: 'action_required' }),
    ])
    expect(capabilities).toHaveLength(1)
    expect(capabilities[0].connected).toBe(true)
    expect(capabilities[0].needsAttention).toBe(true)
    expect(
      renderCapabilityDigest(
        [tool({ family: 'crm', status: 'connected' }), tool({ family: 'crm', status: 'action_required' })],
        10,
      ),
    ).toContain('connecté, une connexion à renouveler')
  })

  it('dit « reconnexion requise » quand la seule connexion de la famille est cassée', () => {
    expect(renderCapabilityDigest([tool({ family: 'email', status: 'action_required' })], 10)).toContain(
      'ta messagerie (reconnexion requise)',
    )
  })

  it('ignore les outils non connectés', () => {
    expect(renderCapabilityDigest([tool({ family: 'crm', status: 'available' })], 10)).toBeNull()
    expect(renderCapabilityDigest([tool({ family: 'crm', status: 'coming_soon' })], 10)).toBeNull()
    expect(renderCapabilityDigest([], 10)).toBeNull()
  })

  it("garde le coût en crédits et jette la mention de fournisseur qui l'accompagne", () => {
    // Le catalogue écrit « 1 crédit par enrichissement réussi (provider par
    // défaut) » : le débit intéresse l'utilisateur, la parenthèse non.
    const cost = creditCostOf(
      tool({
        family: 'prospection',
        status: 'connected',
        cost_model: { fr: '1 crédit par enrichissement réussi (provider par défaut)', en: 'x' },
      }),
    )
    expect(cost).toBe('1 crédit par enrichissement réussi')
  })

  it('remplace un coût non chiffré par « inclus dans ton offre »', () => {
    const cost = creditCostOf(
      tool({
        family: 'communication',
        status: 'connected',
        cost_model: { fr: 'gratuit (notification webhook)', en: 'x' },
      }),
    )
    expect(cost).toBe('inclus dans ton offre')
  })

  it('fait remonter le coût en crédits quand la capacité mélange gratuit et payant', () => {
    const capabilities = aggregateCapabilities([
      tool({ family: 'prospection', status: 'connected', cost_model: { fr: 'gratuit', en: 'free' } }),
      tool({
        family: 'prospection',
        status: 'connected',
        cost_model: { fr: '1 crédit par enrichissement réussi', en: 'x' },
      }),
    ])
    expect(capabilities[0].cost).toBe('1 crédit par enrichissement réussi')
  })

  it("n'affiche pas un jeton machine inconnu tel quel", () => {
    const digest = renderCapabilityDigest(
      [tool({ family: 'crm', status: 'connected', allowed_actions: ['some_future_action'] })],
      10,
    )
    expect(digest).not.toContain('some_future_action')
    expect(digest).toContain('lecture seule')
  })

  it('borne le nombre de lignes', () => {
    const digest = renderCapabilityDigest(
      [
        tool({ family: 'crm', status: 'connected' }),
        tool({ family: 'email', status: 'connected' }),
        tool({ family: 'calendar', status: 'connected' }),
      ],
      2,
    )
    expect(digest?.split('\n')).toHaveLength(2)
  })

  it('produit un ordre stable indépendant de celui du registre', () => {
    const forward = renderCapabilityDigest(
      [tool({ family: 'crm', status: 'connected' }), tool({ family: 'email', status: 'connected' })],
      10,
    )
    const backward = renderCapabilityDigest(
      [tool({ family: 'email', status: 'connected' }), tool({ family: 'crm', status: 'connected' })],
      10,
    )
    expect(forward).toBe(backward)
  })

  it('couvre toutes les familles du catalogue réel — aucun libellé manquant', () => {
    // Une famille sans libellé rendrait « - undefined (connecté) » dans le prompt.
    const families = [...new Set(TOOL_CATALOG.map(entry => entry.family))]
    for (const family of families) {
      const digest = renderCapabilityDigest([tool({ family, status: 'connected' })], 10)
      expect(digest).not.toContain('undefined')
      expect(digest?.startsWith('- ')).toBe(true)
    }
  })

  /**
   * La garde de fond, sur le catalogue RÉEL branché en entier.
   *
   * Avant le 13/09/2026, elle exigeait qu'AUCUN nom du catalogue ne sorte. Depuis
   * #1912.11 (décision batch 11), elle pose deux questions différentes selon à
   * qui appartient l'outil : celui du client ressort sous son nom, tout le reste
   * — nos fournisseurs, les registres publics, Stripe — reste tu.
   */
  const catalogConnected = () =>
    TOOL_CATALOG.map(entry =>
      tool({
        family: entry.family,
        status: 'connected',
        provider: entry.provider,
        display_name: entry.display_name,
        allowed_actions: [...entry.allowed_actions],
        cost_model: entry.cost_model,
      }),
    )
  const clientProviders = new Set(CLIENT_TOOLS.map(t => t.provider))

  it('LIT quelque chose — le catalogue porte des outils du client ET des fournisseurs de Bellum', () => {
    expect(TOOL_CATALOG.filter(e => clientProviders.has(e.provider)).length).toBeGreaterThanOrEqual(15)
    expect(TOOL_CATALOG.filter(e => OUR_SUPPLIERS.some(s => s.provider === e.provider)).length).toBeGreaterThan(10)
  })

  it('chaque outil client déclaré existe dans le catalogue — la liste ne prend pas la poussière', () => {
    const catalogProviders = new Set(TOOL_CATALOG.map(e => e.provider))
    const declared = [
      ...CLIENT_TOOLS.map(c => c.provider),
      ...OUR_SUPPLIERS.flatMap(s => (s.provider ? [s.provider] : [])),
    ]
    expect(declared.filter(provider => !catalogProviders.has(provider))).toEqual([])
  })

  it('ne laisse fuir AUCUN fournisseur de Bellum, quelle que soit la connexion', () => {
    expect(supplierNamesIn(renderCapabilityDigest(catalogConnected(), 50) ?? '')).toEqual([])
  })

  it('ne nomme que les outils du CLIENT — ni registre public, ni moyen de paiement, ni collecte', () => {
    const digest = (renderCapabilityDigest(catalogConnected(), 50) ?? '').toLowerCase()
    // Certaines entrées ne portent pas une marque mais une DESCRIPTION
    // (« Webhook sortant », « Transcription audio ») : elles le déclarent dans
    // le catalogue et ne sont pas cherchées ici.
    const leaked = TOOL_CATALOG.filter(entry => !entry.genericName && !clientProviders.has(entry.provider))
      .map(entry => entry.display_name)
      .filter(displayName => digest.includes((displayName.split(/[\s(]/)[0] ?? '').toLowerCase()))
    expect(leaked).toEqual([])
  })

  it('nomme bien, sous leur nom, les outils du client branchés — le voisin légitime passe', () => {
    const digest = renderCapabilityDigest(catalogConnected(), 50) ?? ''
    const expected = CLIENT_TOOLS.map(c => c.names[0] ?? '')
    expect(expected.length).toBeGreaterThanOrEqual(15)
    expect(expected.filter(name => !digest.includes(name))).toEqual([])
  })
})

/**
 * #1955.23 — « ce que Laura n'a pas pu consulter », pour l'export d'un fil.
 *
 * Le complément d'`aggregateCapabilities` : les familles ABSENTES du digest
 * (aucun outil `connected`/`action_required`) sont celles où Laura n'a
 * structurellement aucun accès — une donnée mesurée (le registre de l'espace),
 * jamais une liste inventée. `CAPABILITY_LABELS` reste le seul endroit qui
 * nomme les 15 familles (GA-26) : cette fonction en lit le COMPLÉMENT, elle ne
 * les recopie pas.
 *
 * 14 → 15 le 18/09/2026 (#2261.30) : `tenders` (appels d'offres / marchés
 * publics) s'ajoute, distincte de `jobs` (offres d'emploi).
 */
describe('#1955.23 — les capacités NON connectées, pour la section « limites » d’un export', () => {
  it('rend les 15 familles quand rien n’est connecté', () => {
    expect(notConnectedCapabilityLabels([])).toHaveLength(15)
  })

  it('retire une famille dès qu’un de ses outils est connecté', () => {
    const labels = notConnectedCapabilityLabels([tool({ family: 'email', status: 'connected' })])
    expect(labels).not.toContain('ta messagerie')
    expect(labels).toHaveLength(14)
  })

  it('un outil « action_required » compte comme connecté — il l’a été, il demande juste une reconnexion', () => {
    const labels = notConnectedCapabilityLabels([tool({ family: 'crm', status: 'action_required' })])
    expect(labels).not.toContain('ton CRM')
  })

  it('sait dire NON : un outil `available` (jamais branché) ne retire rien', () => {
    const labels = notConnectedCapabilityLabels([tool({ family: 'crm', status: 'available' })])
    expect(labels).toContain('ton CRM')
    expect(labels).toHaveLength(15)
  })
})

describe('#3973 — un outil qui sert plusieurs familles compte dans chacune', () => {
  const microsoft = tool({
    family: 'email',
    additional_families: ['calendar'],
    provider: 'microsoft',
    display_name: 'Microsoft 365 / Outlook',
    status: 'connected',
  })

  it("Microsoft 365 seul : l'agenda ET la messagerie sont des capacités branchées, sous son nom", () => {
    const capabilities = aggregateCapabilities([microsoft])
    expect(capabilities.map(capability => capability.family)).toEqual(['email', 'calendar'])
    for (const capability of capabilities) expect(capability.tools).toEqual(['Outlook'])
    expect(notConnectedCapabilityLabels([microsoft])).toHaveLength(13)
  })

  it("sait dire NON : sans `additional_families`, l'agenda reste non connecté", () => {
    const { additional_families: _ignored, ...mono } = microsoft
    expect(aggregateCapabilities([mono]).map(capability => capability.family)).toEqual(['email'])
  })
})

// #2261.21-32 — le digest ne couvrait que les outils TIERS ; les huit familles
// internes (comptes, contacts, besoins, vivier, missions, Market Memory,
// DataForge, routines) restaient invisibles à Laura, qui ne pouvait donc pas
// dire d'elle-même si elles sont utilisables MAINTENANT.
describe('digest des capacités internes (#2261)', () => {
  it('rend une ligne par capacité interne disponible, sans fournisseur ni booléen nu', () => {
    const digest = renderInternalCapabilityDigest(deriveInternalCapabilities({ routinesCut: false }), 10)
    expect(digest).toContain('tes comptes suivis (disponible)')
    expect(digest).toContain('le vivier de consultants (disponible)')
    expect(digest).toContain('les routines (disponible)')
    expect(digest?.split('\n')).toHaveLength(9)
  })

  it('sait dire NON : une routine coupée par le kill-switch sort « indisponible » avec sa raison, jamais 0/false nu', () => {
    const digest = renderInternalCapabilityDigest(deriveInternalCapabilities({ routinesCut: true }), 10)
    expect(digest).toContain("les routines (indisponible) : coupées par l'opérateur")
    expect(digest).not.toMatch(/routines.*: 0/)
  })

  it('borne le nombre de lignes comme le digest des outils tiers', () => {
    const digest = renderInternalCapabilityDigest(deriveInternalCapabilities({ routinesCut: false }), 2)
    expect(digest?.split('\n')).toHaveLength(2)
  })
})
