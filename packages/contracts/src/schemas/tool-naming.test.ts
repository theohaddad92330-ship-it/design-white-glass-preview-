import { describe, expect, it } from 'vitest'

import {
  toolFamilyValues,
  type CapabilityDescriptor,
  type ConnectedTool,
  type ToolFamily,
  type ToolStatus,
} from './tool-registry.js'
import {
  CLIENT_TOOLS,
  OUR_SUPPLIERS,
  clientToolName,
  connectedClientTools,
  connectedMailboxName,
  mailboxToolName,
  unconnectedClientToolFamilies,
  supplierNamesIn,
} from './tool-naming.js'

/**
 * #1912.11 — décision Louis 13/09/2026, batch 11 : on nomme ce que l'espace a
 * BRANCHÉ, jamais ce qui nous sert.
 *
 * Ce fichier tient les deux listes et la seule dérivation qui transforme les
 * connexions d'un espace en noms affichables. Les trois preuves d'une garde :
 *   - elle LIT : les listes ne sont pas vides, et chaque nom s'y retrouve ;
 *   - elle dit NON : un fournisseur de Bellum « connecté » ne sort jamais ;
 *   - elle n'attrape pas les voisins : l'outil branché, lui, sort bien.
 */

function tool(provider: string, family: ToolFamily, status: ToolStatus): ConnectedTool {
  return {
    provider,
    family,
    status,
    display_name: `${provider} (libellé du registre)`,
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    capability_state: 'not_connected',
    capabilities: [],
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
  }
}

describe('tool-naming — les deux listes', () => {
  it('LIT quelque chose — les deux listes ont un contenu réel', () => {
    expect(OUR_SUPPLIERS.length).toBeGreaterThanOrEqual(15)
    expect(CLIENT_TOOLS.length).toBeGreaterThanOrEqual(20)
    expect(OUR_SUPPLIERS.map(s => s.name)).toEqual(expect.arrayContaining(['Apollo', 'Pappers', 'Anthropic']))
    expect(CLIENT_TOOLS.flatMap(t => t.names)).toEqual(expect.arrayContaining(['HubSpot', 'Gmail', 'Outlook']))
  })

  it('aucun nom n’appartient aux DEUX listes — un outil est au client ou à nous, jamais les deux', () => {
    const clientNames = new Set(CLIENT_TOOLS.flatMap(t => t.names).map(n => n.toLowerCase()))
    for (const supplier of OUR_SUPPLIERS) {
      expect(clientNames.has(supplier.name.toLowerCase()), supplier.name).toBe(false)
      expect(clientNames.has(supplier.brand.toLowerCase()), supplier.brand).toBe(false)
    }
    const supplierProviders = new Set(OUR_SUPPLIERS.map(s => s.provider).filter(Boolean))
    for (const client of CLIENT_TOOLS) expect(supplierProviders.has(client.provider), client.provider).toBe(false)
  })

  it('chaque entrée porte au moins un nom, et la marque d’un fournisseur est contenue dans son nom', () => {
    for (const client of CLIENT_TOOLS) expect(client.names.length, client.provider).toBeGreaterThan(0)
    for (const supplier of OUR_SUPPLIERS) expect(supplier.name.startsWith(supplier.brand), supplier.name).toBe(true)
  })
})

/**
 * #1912 — « pappers » en minuscules a traversé toutes les gardes, qui cherchaient
 * la marque AVEC sa majuscule. Le détecteur vit ici, à un seul endroit : l'écran,
 * l'i18n, le changelog et le digest de Laura le lisent.
 */
describe('supplierNamesIn — nos fournisseurs, quelle que soit la casse', () => {
  it('LIT — chaque fournisseur est vu sous son nom', () => {
    const all = OUR_SUPPLIERS.map(supplier => supplier.name).join(', ')
    expect(supplierNamesIn(all)).toEqual(OUR_SUPPLIERS.map(supplier => supplier.name))
  })

  it('sait dire NON — en minuscules, en capitales et sous forme d’identifiant', () => {
    expect(supplierNamesIn('Non appliqué par pappers — les résultats sont plus larges que demandé')).toEqual([
      'Pappers',
    ])
    expect(supplierNamesIn('SOURCE : PAPPERS')).toEqual(['Pappers'])
    expect(supplierNamesIn('apollo_enrich — quota épuisé')).toEqual(['Apollo'])
    expect(supplierNamesIn('brave_search — injoignable')).toEqual(['Brave Search'])
    expect(supplierNamesIn('via hunter.io')).toEqual(['Hunter.io'])
  })

  it('un nom qui est aussi un mot ordinaire reste vu sous sa forme de marque', () => {
    expect(supplierNamesIn('Recherche Brave, base hébergée chez Railway')).toEqual(['Brave Search', 'Railway'])
  })

  /**
   * 16/09/2026, GA-340 — chaque fournisseur est vu sous CHACUNE des graphies
   * qui existent réellement dans le dépôt, pas seulement sous celle que
   * `OUR_SUPPLIERS` a choisi d'écrire.
   *
   * Le défaut mesuré : le catalogue d'outils écrit `display_name: 'Hunter'`,
   * `OUR_SUPPLIERS` portait « Hunter.io » sous ses DEUX champs, et
   * `supplierNamesIn('Hunter')` rendait `[]`. Un texte qui écrivait « Hunter »
   * traversait GA-44, l'i18n, le changelog et le digest de Laura — les quatre
   * lisent CE détecteur. Même famille que « pappers » en minuscules (#1912).
   */
  it('voit la marque SEULE, quand elle est plus courte que le nom complet', () => {
    expect(supplierNamesIn('Hunter')).toEqual(['Hunter.io'])
    expect(supplierNamesIn('Recherche de coordonnées via Hunter — quota épuisé')).toEqual(['Hunter.io'])
    // La forme longue garde sa graphie libre, elle : c'est le cas déjà gardé.
    expect(supplierNamesIn('via hunter.io')).toEqual(['Hunter.io'])
  })

  it('n’attrape pas les voisins légitimes — registres publics et mots ordinaires', () => {
    expect(
      supplierNamesIn(
        'France Travail, INSEE, BOAMP, la bravoure, les apollons, un brave commercial, the railway station, la paperasse',
      ),
    ).toEqual([])
    // ⚠️ Le témoin qui interdit de rendre « Hunter » insensible à la casse :
    // « Solo hunter » est un archétype d'ESN affiché à l'écran
    // (`i18n/locales/en/profile.json`). C'est pour lui que l'entrée porte
    // `ordinaryWord`, exactement comme « brave » et « railway ».
    expect(supplierNamesIn('Solo hunter, chasseur solo, un headhunter, soloHunter')).toEqual([])
  })
})

describe('connectedClientTools — la seule dérivation des noms affichables', () => {
  it('nomme l’outil que l’espace a BRANCHÉ, connecté ou à reconnecter', () => {
    expect(
      connectedClientTools([tool('hubspot', 'crm', 'connected'), tool('gmail', 'email', 'action_required')]),
    ).toEqual([
      // #1912.11/GA-44 — un outil sain ne porte PAS `needsReconnect: false` :
      // la clé n'existe que pour dire « à reconnecter », jamais pour dire
      // « rien à signaler » (même règle que `no-vendor-names-in-app.test.ts`,
      // qui ne rend l'objet gmail SANS cette clé). `capabilities` (#3774.3.1),
      // elle, est une LISTE : vide se dit en clair, elle n'est jamais omise.
      { provider: 'hubspot', family: 'crm', name: 'HubSpot', capabilities: [] },
      { provider: 'gmail', family: 'email', name: 'Gmail', needsReconnect: true, capabilities: [] },
    ])
  })

  /**
   * #2406.33 — « connecteur en erreur présenté comme actif ». Retenu ET
   * reconnecté portaient le MÊME objet (`{ provider, family, name }`) sans
   * `status` : `ConnectedToolsStrip.tsx` ne pouvait pas distinguer les deux,
   * et un consentement révoqué se posait dans la saisie exactement comme un
   * outil sain — l'utilisateur croyait Laura capable de lire un Gmail dont le
   * jeton était mort. `needsReconnect` est ce que la dérivation SAIT déjà
   * (`tool.status === 'action_required'`, ligne juste au-dessus) — jamais un
   * second calcul dans l'écran (GA-26).
   */
  it('#2406.33 — porte needsReconnect, jamais une valeur devinée côté écran', () => {
    const tools = connectedClientTools([tool('hubspot', 'crm', 'connected'), tool('gmail', 'email', 'action_required')])
    // Sain : la clé est ABSENTE, jamais posée à `false` (une absence ne fait
    // aucune ligne, même règle sur un champ que sur une liste).
    expect(tools.find(t => t.provider === 'hubspot')?.needsReconnect).toBeUndefined()
    expect(tools.find(t => t.provider === 'gmail')?.needsReconnect).toBe(true)
  })

  it('sait dire NON — un fournisseur de Bellum « connecté » par une clé serveur ne sort JAMAIS', () => {
    // Le cas réel : `DROPCONTACT_API_KEY` posée côté serveur fait remonter
    // Dropcontact en `connected` dans le registre. Ce n'est pas l'espace qui
    // l'a branché, et son nom ne doit atteindre aucun écran.
    const suppliers = OUR_SUPPLIERS.filter(s => s.provider !== null).map(s =>
      tool(s.provider as string, 'prospection', 'connected'),
    )
    expect(suppliers.length).toBeGreaterThan(8)
    expect(connectedClientTools(suppliers)).toEqual([])
  })

  it('un outil client NON connecté ne se nomme pas', () => {
    expect(
      connectedClientTools([tool('hubspot', 'crm', 'available'), tool('salesforce', 'crm', 'coming_soon')]),
    ).toEqual([])
  })

  it('un fournisseur inconnu de la liste ne se nomme pas — le défaut est de TAIRE', () => {
    expect(connectedClientTools([tool('un-outil-de-demain', 'crm', 'connected')])).toEqual([])
  })

  it('dédoublonne un même outil et suit l’ordre stable des familles', () => {
    const tools = connectedClientTools([
      tool('slack', 'communication', 'connected'),
      tool('gmail', 'email', 'connected'),
      tool('hubspot', 'crm', 'connected'),
      tool('hubspot', 'crm', 'connected'),
    ])
    expect(tools.map(t => t.name)).toEqual(['HubSpot', 'Gmail', 'Slack'])
    const families = tools.map(t => toolFamilyValues.indexOf(t.family))
    expect([...families].sort((a, b) => a - b)).toEqual(families)
  })

  it('tolère un registre qui n’est pas celui du contrat — jamais une exception', () => {
    expect(connectedClientTools(null)).toEqual([])
    expect(connectedClientTools([null, { provider: 'hubspot' }] as unknown as ConnectedTool[])).toEqual([])
  })
})

describe('le nom de la messagerie — « brouillon dans <outil> »', () => {
  it('rend le nom de la messagerie du résultat réel', () => {
    expect(mailboxToolName('google')).toBe('Gmail')
    expect(mailboxToolName('microsoft')).toBe('Outlook')
  })

  it('ne devine rien sur un fournisseur absent ou inconnu', () => {
    expect(mailboxToolName(null)).toBeNull()
    expect(mailboxToolName(undefined)).toBeNull()
    expect(mailboxToolName('yahoo')).toBeNull()
  })

  it('nomme la messagerie branchée quand il n’y en a qu’UNE, et se tait quand il y en a deux', () => {
    const gmail = { provider: 'gmail', family: 'email' as const, name: 'Gmail' }
    const outlook = { provider: 'microsoft', family: 'email' as const, name: 'Outlook' }
    const crm = { provider: 'hubspot', family: 'crm' as const, name: 'HubSpot' }
    expect(connectedMailboxName([crm, gmail])).toBe('Gmail')
    // Deux boîtes : le brouillon part dans UNE seule, que l'écran ne connaît
    // pas. Nommer l'une des deux serait deviner.
    expect(connectedMailboxName([gmail, outlook])).toBeNull()
    expect(connectedMailboxName([crm])).toBeNull()
    expect(connectedMailboxName([])).toBeNull()
  })
})

describe('clientToolName — le nom d’un outil client depuis son seul identifiant (#2561)', () => {
  it('rend le nom d’affichage d’un identifiant connu de CLIENT_TOOLS', () => {
    expect(clientToolName('hubspot')).toBe('HubSpot')
    expect(clientToolName('salesforce')).toBe('Salesforce')
    expect(clientToolName('pipedrive')).toBe('Pipedrive')
    expect(clientToolName('attio')).toBe('Attio')
  })

  it('ne devine rien sur un identifiant absent ou inconnu', () => {
    expect(clientToolName(null)).toBeNull()
    expect(clientToolName(undefined)).toBeNull()
    expect(clientToolName('odoo-instance-x')).toBeNull()
  })
})

describe('#3708 — accès limité et non connecté, dits sans inventer de ligne', () => {
  const withState = (t: ConnectedTool, capability_state: ConnectedTool['capability_state']): ConnectedTool => ({
    ...t,
    capability_state,
  })

  it('une connexion en lecture seule, écriture partielle ou portée manquante porte `limited` — jamais une connexion saine', () => {
    for (const state of ['read_only', 'limited_write', 'scope_missing'] as const) {
      const [gmail] = connectedClientTools([withState(tool('gmail', 'email', 'connected'), state)])
      expect(gmail?.limited, state).toBe(true)
    }
  })

  it('un outil opérationnel, non vérifié ou à reconnecter ne porte pas `limited` (états déjà distincts)', () => {
    for (const state of ['operational', 'untested', 'authorization_expired', 'not_connected'] as const) {
      const [gmail] = connectedClientTools([withState(tool('gmail', 'email', 'connected'), state)])
      expect(gmail?.limited, state).toBeUndefined()
    }
  })

  it('« non connecté » se dit par FAMILLE (jamais par éditeur), seulement quand une connexion est possible', () => {
    const registry = [
      tool('hubspot', 'crm', 'available'),
      tool('salesforce', 'crm', 'available'),
      tool('gmail', 'email', 'connected'),
      tool('outlook-future', 'calendar', 'coming_soon'),
      tool('google-calendar', 'calendar', 'available'),
    ]
    expect(unconnectedClientToolFamilies(registry)).toEqual(['crm', 'calendar'])
  })

  it('une famille déjà branchée, un fournisseur de Bellum ou un registre illisible ne font aucune ligne', () => {
    expect(
      unconnectedClientToolFamilies([tool('hubspot', 'crm', 'connected'), tool('salesforce', 'crm', 'available')]),
    ).toEqual([])
    expect(unconnectedClientToolFamilies([tool('apollo', 'prospection', 'available')])).toEqual([])
    expect(unconnectedClientToolFamilies(undefined)).toEqual([])
    expect(unconnectedClientToolFamilies({ error: 'x' } as never)).toEqual([])
  })
})

describe('#3973 — un outil qui sert plusieurs familles (Microsoft 365 : messagerie ET agenda)', () => {
  const microsoft = (status: ToolStatus): ConnectedTool => ({
    ...tool('microsoft', 'email', status),
    additional_families: ['calendar'],
  })

  it('l’outil client garde ses familles secondaires — absentes pour un outil mono-famille', () => {
    const [ms] = connectedClientTools([microsoft('connected')])
    expect(ms?.additional_families).toEqual(['calendar'])
    const [gmail] = connectedClientTools([tool('gmail', 'email', 'connected')])
    expect(gmail && 'additional_families' in gmail).toBe(false)
  })

  it('l’agenda n’est pas « non connecté » quand seul Microsoft 365 est branché', () => {
    expect(
      unconnectedClientToolFamilies([microsoft('connected'), tool('google-calendar', 'calendar', 'available')]),
    ).toEqual([])
    // Témoin : sans Microsoft, l’agenda reste à brancher.
    expect(unconnectedClientToolFamilies([tool('google-calendar', 'calendar', 'available')])).toEqual(['calendar'])
  })
})

describe('#3774.3.1 — les capacités RÉELLES d’un outil connecté, pas seulement sain/limité', () => {
  const withCapabilities = (t: ConnectedTool, capabilities: ConnectedTool['capabilities']): ConnectedTool => ({
    ...t,
    capabilities,
  })

  const descriptor = (
    key: CapabilityDescriptor['key'],
    state: CapabilityDescriptor['state'],
  ): CapabilityDescriptor => ({
    key,
    state,
    scope_required: [],
    last_proof_at: null,
    last_proof_sample: null,
    last_error_code: null,
    last_error_at: null,
  })

  // #3774 — recette prod 08/10 : « aucun outil n'affiche Lire parmi ses
  // capacités » alors que la lecture est la capacité première. `read` est
  // TOUJOURS déclaré `probeable: true` (`tool-capabilities.ts`) : sans sonde
  // réellement exécutée, `deriveCapabilityEntryState` le rend `untested` —
  // JAMAIS `operational`, qui exige une preuve (PDF 7 §2). Ne garder QUE
  // `operational` cachait donc la lecture PARTOUT, alors que les capacités
  // d'ÉCRITURE (`prepare`/`send`/`update`…) sont déclarées `probeable: false`
  // et deviennent `operational` dès la portée accordée — jamais `untested`.
  // Ce qui compte pour CE chip n'est pas « vérifié », c'est « accordé » :
  // `scope_missing` / `authorization_expired` / `not_connected` restent les
  // seuls à écarter une capacité.
  it('une capacité ACCORDÉE sort même « untested » — seule une capacité NON accordée reste cachée', () => {
    const [gmail] = connectedClientTools([
      withCapabilities(tool('gmail', 'email', 'connected'), [
        descriptor('read', 'untested'),
        descriptor('search', 'operational'),
        descriptor('send', 'scope_missing'),
        descriptor('delete', 'degraded'),
      ]),
    ])
    expect(gmail?.capabilities).toEqual(['read', 'search', 'delete'])
  })

  // #3774 — HubSpot déclare deux capacités `read` distinctes (contacts,
  // affaires) : la LISTE ne doit jamais répéter le même verbe deux fois.
  it('dédoublonne une même clé déclarée deux fois (ex. deux portées `read` différentes)', () => {
    const [gmail] = connectedClientTools([
      withCapabilities(tool('gmail', 'email', 'connected'), [
        descriptor('read', 'operational'),
        descriptor('read', 'untested'),
        descriptor('search', 'operational'),
      ]),
    ])
    expect(gmail?.capabilities).toEqual(['read', 'search'])
  })

  it('aucune capacité accordée : une liste VIDE, jamais une capacité devinée depuis `allowed_actions`', () => {
    const [gmail] = connectedClientTools([
      {
        ...withCapabilities(tool('gmail', 'email', 'connected'), [descriptor('send', 'scope_missing')]),
        allowed_actions: ['send_email', 'export_contact'],
      },
    ])
    expect(gmail?.capabilities).toEqual([])
  })

  it('un outil sans capacités déclarées (webhook) sort avec une liste vide, jamais `undefined`', () => {
    const [gmail] = connectedClientTools([tool('gmail', 'email', 'connected')])
    expect(gmail?.capabilities).toEqual([])
  })

  it('sait dire NON : un outil à reconnecter qui n’a jamais prouvé « send » ne le porte pas', () => {
    const [gmail] = connectedClientTools([
      withCapabilities(tool('gmail', 'email', 'action_required'), [descriptor('send', 'authorization_expired')]),
    ])
    expect(gmail?.capabilities).toEqual([])
  })
})
