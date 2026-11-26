import { capabilityKeyValues, CONNECTOR_CAPABILITY_LEVEL_ORDER } from '@bellum/contracts'
import { readGoogleConfig } from '../google/google-config'
import { readMicrosoftConfig } from '../microsoft/microsoft-config'
import { TOOL_CATALOG } from './tool-catalog'
import { capabilitiesOf, probeCapabilityName, TOOL_CAPABILITIES, TOOL_NEVER } from './tool-capabilities'

/**
 * La table des capacités déclare des chaînes de portée à la main. Ces gardes
 * empêchent la seule chose qui puisse mal tourner : qu'elles divergent de ce
 * que les modules demandent réellement.
 *
 * Pourquoi les recopier plutôt que les importer : GA-07 compte les imports
 * service → service, et `microsoft.service.ts` porte ses constantes. Un fichier
 * de test, lui, est hors périmètre de la garde — c'est donc ici que la
 * comparaison se fait, et nulle part ailleurs.
 */

const OLD = { ...process.env }
afterEach(() => {
  process.env = { ...OLD }
})

function scopesOf(read: () => { scopes: string } | null, env: Record<string, string>): Set<string> {
  Object.assign(process.env, env)
  const config = read()
  return new Set((config?.scopes ?? '').split(/\s+/).filter(Boolean))
}

describe('les portées déclarées sont celles que les modules demandent vraiment', () => {
  it('Google — chaque portée déclarée est bien dans le jeu par défaut', () => {
    const granted = scopesOf(readGoogleConfig, {
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'y',
      GOOGLE_REDIRECT_URI: 'https://api.example/google/callback',
    })
    const declared = [
      ...capabilitiesOf('gmail'),
      ...capabilitiesOf('google-calendar'),
      ...capabilitiesOf('google-drive'),
    ]
    const unknown = declared.flatMap(capability => capability.scopes).filter(scope => !granted.has(scope))
    // Si ce test tombe : soit la table déclare une portée qu'on ne demande pas
    // (l'écran annoncerait `scope_missing` pour toujours), soit le jeu par
    // défaut a été réduit et la capacité correspondante doit le dire.
    expect(unknown).toEqual([])
  })

  it('Microsoft — `Files.Read.All` est déclarée ET absente des défauts, et c’est le fait à retenir', () => {
    const granted = scopesOf(readMicrosoftConfig, {
      MICROSOFT_CLIENT_ID: 'x',
      MICROSOFT_CLIENT_SECRET: 'y',
      MICROSOFT_REDIRECT_URI: 'https://api.example/microsoft/callback',
    })
    const declared = capabilitiesOf('microsoft')
    const search = declared.find(capability => capability.key === 'search')
    expect(search?.scopes).toEqual(['Files.Read.All'])
    // La documentation du dépôt affirmait que la portée était « ajoutée aux
    // défauts ». Elle ne l'est pas — d'où une recherche documentaire qui rend
    // `[]` chez tout le monde. Le jour où l'opérateur l'ajoute, ce test le dira.
    expect(granted.has('Files.Read.All')).toBe(false)

    // Les autres, elles, doivent être dans les défauts, sinon la messagerie
    // Microsoft s'annoncerait cassée alors qu'elle marche.
    const others = declared.filter(capability => capability.key !== 'search').flatMap(capability => capability.scopes)
    expect(others.filter(scope => !granted.has(scope))).toEqual([])
  })

  it('chaque `provider` de la table existe bien au catalogue', () => {
    const known = new Set(TOOL_CATALOG.map(entry => entry.provider))
    const orphans = Object.keys(TOOL_CAPABILITIES).filter(provider => !known.has(provider))
    // Une capacité déclarée pour un outil inexistant ne s'afficherait jamais —
    // le genre de ligne morte que ce chantier existe pour supprimer.
    expect(orphans).toEqual([])
  })

  it('« ce que je NE peux PAS faire » ne parle que d’outils qui existent', () => {
    const known = new Set(TOOL_CATALOG.map(entry => entry.provider))
    expect(Object.keys(TOOL_NEVER).filter(provider => !known.has(provider))).toEqual([])
  })

  it('aucune capacité n’emploie un verbe hors des dix', () => {
    const verbs = new Set<string>(capabilityKeyValues)
    const strays = Object.values(TOOL_CAPABILITIES)
      .flat()
      .map(capability => capability.key)
      .filter(key => !verbs.has(key))
    expect(strays).toEqual([])
  })

  it('aucun connecteur ne déclare `delete` — le produit ne supprime rien chez un tiers', () => {
    // Ce n'est pas un oubli, c'est une position. Le PDF la formule comme une
    // ligne de la carte de connecteur, et elle doit rester vraie en code.
    const deleters = Object.entries(TOOL_CAPABILITIES)
      .filter(([, capabilities]) => capabilities.some(capability => capability.key === 'delete'))
      .map(([provider]) => provider)
    expect(deleters).toEqual([])
  })

  // #2383.1 — LAU-FINAL-097 : sept niveaux de capacité (L0-L6), déclarés PAR
  // ACTION. Sans cette garde, une capacité pourrait être ajoutée sans niveau —
  // exactement le trou que ce point ferme, du code déclaratif qu'aucun garde
  // ne force à rester complet.
  it('chaque action de connecteur déclare un niveau de capacité valide (L0-L6)', () => {
    const known = new Set(CONNECTOR_CAPABILITY_LEVEL_ORDER)
    const missingOrInvalid = Object.entries(TOOL_CAPABILITIES).flatMap(([provider, capabilities]) =>
      capabilities
        .filter(capability => !known.has(capability.level))
        .map(capability => `${provider}:${capability.key}`),
    )
    expect(missingOrInvalid).toEqual([])
  })

  // #3774 — recette prod 08/10 : HubSpot déclarait une capacité lisant les
  // affaires (« lire tes affaires pour le rapport de pipeline ») sous la clé
  // `create` — qui n'écrit rien, et dont la portée (`crm.objects.deals.read`)
  // est une portée de LECTURE. Classée comme ÉCRITURE (`WRITE_KEYS` du
  // service de registre), elle comptait dans le calcul d'« accès limité »
  // comme une écriture accordée dès que la lecture seule des affaires est
  // permise — ce qui peut annoncer un outil « opérationnel » en écriture
  // alors qu'aucune portée d'écriture n'est réellement accordée.
  it('une capacité dont le LIBELLÉ lit (« lire… ») ne porte jamais une clé d’ÉCRITURE', () => {
    const WRITE_KEYS = new Set(['create', 'update', 'send', 'schedule', 'delete', 'prepare'])
    const mislabelled = Object.entries(TOOL_CAPABILITIES).flatMap(([provider, capabilities]) =>
      capabilities
        .filter(capability => WRITE_KEYS.has(capability.key) && /^lire\b/i.test(capability.label))
        .map(capability => `${provider}:${capability.key} — « ${capability.label} »`),
    )
    expect(mislabelled).toEqual([])
  })

  // #2383.11 — NO-GO (à trancher) : la doctrine « le copilote n'envoie jamais
  // seul » interdit qu'un envoi porte le niveau le plus autonome. Ce test est
  // la garde-fou que le docblock de `connector-capability-level.ts` annonce.
  it('aucune capacité `send` ne porte le niveau `l6_automate`', () => {
    const sendAtL6 = Object.entries(TOOL_CAPABILITIES).flatMap(([provider, capabilities]) =>
      capabilities
        .filter(capability => capability.key === 'send' && capability.level === 'l6_automate')
        .map(() => provider),
    )
    expect(sendAtL6).toEqual([])
  })

  // #3774.3.1 — recette prod 08/10 (U 22edd95fe1) : Odoo, un CRM au catalogue
  // (`tool-catalog.ts`, `data_types.reads: ['people_records']`) au même titre
  // que Salesforce/Pipedrive/Attio, était ABSENT de cette table — sa carte
  // affichait « Connecté » sans aucune capacité, contrairement aux autres CRM
  // génériques (lecture + mise à jour de fiche). Odoo s'authentifie par clé
  // d'API (pas d'OAuth), exactement comme les autres `CRM_GENERIC` : même
  // forme, mêmes capacités.
  it('#3774.3.1 — Odoo déclare ses capacités, comme les autres CRM génériques', () => {
    const odoo = capabilitiesOf('odoo')
    expect(odoo.length).toBeGreaterThan(0)
    expect(odoo.map(capability => capability.key).sort()).toEqual(['read', 'update'])
    expect(odoo.some(capability => /^lire\b/i.test(capability.label))).toBe(true)
  })
})

describe('probeCapabilityName (HUBSPOT-J.3)', () => {
  it('la 2e capacité `read` de HubSpot (affaires) a sa propre preuve, distincte des contacts', () => {
    const reads = capabilitiesOf('hubspot').filter(entry => entry.key === 'read')
    expect(reads).toHaveLength(2)
    expect(probeCapabilityName('hubspot', reads[0]!)).toBe('read')
    expect(probeCapabilityName('hubspot', reads[1]!)).toBe('read:crm.objects.deals.read')
  })
  it('un outil à une capacité par clé garde la clé', () => {
    for (const capability of capabilitiesOf('gmail'))
      expect(probeCapabilityName('gmail', capability)).toBe(capability.key)
  })
})
