import type { CapabilityKey, ConnectorCapabilityLevel } from '@bellum/contracts'

/**
 * Ce que CHAQUE connecteur sait faire, et la portée que chaque geste exige.
 *
 * Le registre savait dire « Google : connecté ». Il ne savait pas dire « je peux
 * lire ta messagerie, je ne peux pas envoyer », parce que rien, nulle part, ne
 * reliait un GESTE à la PORTÉE qui l'autorise. `capability_state` se dérivait
 * donc de `data_types.writes.length > 0` — c'est-à-dire du CATALOGUE, pas des
 * droits réellement accordés. Un Google connecté sans `gmail.send` s'affichait
 * « opérationnel », et l'échec arrivait après le clic.
 *
 * Cette table est le chaînon manquant. Elle est déclarative, elle vit dans le
 * CODE (comme le catalogue de workflows et celui des routines), et une garde
 * dédiée vérifie que les chaînes de portée sont bien celles que les modules
 * demandent — `tool-capabilities.spec.ts`. Les recopier ici plutôt que de les
 * importer évite un import service → service (GA-07) ; la garde évite la
 * divergence, qui est le vrai risque.
 *
 * ⚠️ Ce que le PDF appelle « CE QUE JE NE PEUX PAS FAIRE » se lit dans cette
 * table aussi, et c'est délibéré : un geste ABSENT ici n'est pas un oubli, c'est
 * une capacité que le produit ne demande pas. `delete` n'apparaît nulle part —
 * aucun connecteur du dépôt ne supprime quoi que ce soit chez un tiers.
 */
type CapabilityDeclaration = {
  key: CapabilityKey
  /** Les portées exigées, telles que le fournisseur les écrit. Vide = aucun droit à demander. */
  scopes: readonly string[]
  /** Ce que la capacité fait, en français, pour la carte de connecteur. */
  label: string
  /**
   * Existe-t-il une opération NON DESTRUCTIVE qui la prouve ?
   *
   * Non pour tout ce qui écrit : un envoi ne se vérifie qu'en envoyant, et le
   * PDF interdit explicitement le test destructif. Exiger une preuve sur ces
   * capacités-là afficherait « jamais vérifié » pour toujours au-dessus d'un
   * bouton qui marche — et un badge permanent est un badge qu'on cesse de lire.
   * Pour elles, la portée accordée par le fournisseur est le seul fait
   * disponible, et l'écran ne prétend pas à davantage.
   */
  probeable: boolean
  /**
   * #2383.1 — le niveau de capacité (L0-L6, `connector-capability-level.ts`).
   * Toujours dérivé de {@link LEVEL_FOR_KEY} : le même verbe porte toujours le
   * même niveau, quel que soit le connecteur (GA-26 — un réglage vit à un seul
   * endroit). Aucune entrée ne l'écrit à la main.
   */
  level: ConnectorCapabilityLevel
}

/**
 * #2383.1 — LA DÉRIVATION niveau ← verbe, à UN SEUL ENDROIT (GA-26).
 *
 * Le verbe dit CE QUE fait le geste ; le niveau dit JUSQU'OÙ il va. Les deux
 * ne divergent jamais entre connecteurs : un `create` chez HubSpot est aussi
 * confirmé qu'un `create` chez Google Calendar, parce que c'est la même
 * question (« ce geste écrit-il chez le fournisseur, sur un clic explicite ? »)
 * qui la tranche, pas le connecteur qui la pose.
 *
 * `delete` est présent pour rendre le `Record` exhaustif — aucune entrée ne
 * l'emploie (`tool-capabilities.spec.ts` : « aucun connecteur ne déclare
 * delete »), donc sa valeur ne se lit jamais.
 */
const LEVEL_FOR_KEY: Readonly<Record<CapabilityKey, ConnectorCapabilityLevel>> = {
  read: 'l1_consult',
  search: 'l1_consult',
  summarize: 'l1_consult',
  prepare: 'l2_prepare',
  webhook: 'l3_notify',
  create: 'l4_write_confirmed',
  update: 'l4_write_confirmed',
  schedule: 'l4_write_confirmed',
  send: 'l5_send_confirmed',
  delete: 'l4_write_confirmed',
}

const G = (path: string) => `https://www.googleapis.com/auth/${path}`

/** Gmail — lire, chercher, préparer, envoyer. Jamais supprimer, jamais transférer. */
const GMAIL: CapabilityDeclaration[] = [
  {
    key: 'read',
    scopes: [G('gmail.readonly')],
    label: 'lire tes fils de discussion',
    probeable: true,
    level: LEVEL_FOR_KEY.read,
  },
  {
    key: 'search',
    scopes: [G('gmail.readonly')],
    label: 'chercher dans ta messagerie',
    probeable: true,
    level: LEVEL_FOR_KEY.search,
  },
  {
    key: 'prepare',
    scopes: [G('gmail.compose')],
    label: 'préparer un brouillon',
    probeable: false,
    level: LEVEL_FOR_KEY.prepare,
  },
  { key: 'send', scopes: [G('gmail.send')], label: 'envoyer un message', probeable: false, level: LEVEL_FOR_KEY.send },
]

const GOOGLE_CALENDAR: CapabilityDeclaration[] = [
  {
    key: 'read',
    scopes: [G('calendar.readonly')],
    label: 'lire tes agendas et tes disponibilités',
    probeable: true,
    level: LEVEL_FOR_KEY.read,
  },
  {
    key: 'create',
    scopes: [G('calendar.events')],
    label: 'créer un événement',
    probeable: false,
    level: LEVEL_FOR_KEY.create,
  },
  {
    key: 'schedule',
    scopes: [G('calendar.events')],
    label: 'poser un rappel daté',
    probeable: false,
    level: LEVEL_FOR_KEY.schedule,
  },
]

const GOOGLE_DRIVE: CapabilityDeclaration[] = [
  {
    key: 'read',
    scopes: [G('drive.readonly')],
    label: 'lire tes documents',
    probeable: true,
    level: LEVEL_FOR_KEY.read,
  },
  {
    key: 'search',
    scopes: [G('drive.readonly')],
    label: 'chercher dans le CONTENU de tes documents',
    probeable: true,
    level: LEVEL_FOR_KEY.search,
  },
]

/**
 * Microsoft 365 — une seule connexion, trois capacités.
 *
 * `Files.Read.All` n'est PAS dans les portées par défaut, contrairement à ce que
 * la documentation du dépôt affirmait : la recherche documentaire reste donc
 * `scope_missing` tant que l'opérateur ne l'a pas ajoutée et que l'utilisateur
 * ne s'est pas reconnecté. C'est exactement ce que l'écran doit dire.
 */
const MICROSOFT: CapabilityDeclaration[] = [
  { key: 'read', scopes: ['Mail.ReadWrite'], label: 'lire tes messages', probeable: true, level: LEVEL_FOR_KEY.read },
  {
    key: 'prepare',
    scopes: ['Mail.ReadWrite'],
    label: 'préparer un brouillon',
    probeable: false,
    level: LEVEL_FOR_KEY.prepare,
  },
  { key: 'send', scopes: ['Mail.Send'], label: 'envoyer un message', probeable: false, level: LEVEL_FOR_KEY.send },
  {
    key: 'create',
    scopes: ['Calendars.ReadWrite'],
    label: 'créer un événement',
    probeable: false,
    level: LEVEL_FOR_KEY.create,
  },
  {
    key: 'search',
    scopes: ['Files.Read.All'],
    label: 'chercher dans ton espace documentaire',
    probeable: true,
    level: LEVEL_FOR_KEY.search,
  },
]

const HUBSPOT: CapabilityDeclaration[] = [
  {
    key: 'read',
    scopes: ['crm.objects.contacts.read'],
    label: 'lire tes contacts',
    probeable: true,
    level: LEVEL_FOR_KEY.read,
  },
  {
    key: 'search',
    scopes: ['crm.objects.companies.read'],
    label: 'retrouver une société',
    probeable: true,
    level: LEVEL_FOR_KEY.search,
  },
  {
    key: 'update',
    scopes: ['crm.objects.contacts.write'],
    label: 'créer ou mettre à jour une fiche',
    probeable: false,
    level: LEVEL_FOR_KEY.update,
  },
  {
    // #3774 — recette prod 08/10 : cette capacité LIT les affaires (la
    // portée est `.read`, le libellé commence par « lire ») ; la classer
    // sous `create` la comptait comme une ÉCRITURE accordée dès que la
    // lecture seule des affaires est permise — avant même qu'aucune portée
    // d'écriture ne soit accordée.
    key: 'read',
    scopes: ['crm.objects.deals.read'],
    label: 'lire tes affaires pour le rapport de pipeline',
    probeable: true,
    level: LEVEL_FOR_KEY.read,
  },
]

/** Notion, Attio : un jeton d'espace, pas de portée à comparer côté API. */
const NOTION: CapabilityDeclaration[] = [
  { key: 'read', scopes: [], label: 'lire les pages partagées', probeable: true, level: LEVEL_FOR_KEY.read },
  { key: 'search', scopes: [], label: 'chercher parmi tes pages', probeable: true, level: LEVEL_FOR_KEY.search },
]

const CRM_GENERIC: CapabilityDeclaration[] = [
  { key: 'read', scopes: [], label: 'lire tes contacts', probeable: true, level: LEVEL_FOR_KEY.read },
  {
    key: 'update',
    scopes: [],
    label: 'créer ou mettre à jour une fiche',
    probeable: false,
    level: LEVEL_FOR_KEY.update,
  },
]

/** Un webhook n'a pas de droits : il a une URL, et soit elle répond, soit non. */
const WEBHOOK: CapabilityDeclaration[] = [
  // Le seul « test » possible d'un webhook est une LIVRAISON — donc un vrai
  // message dans le canal de quelqu'un. C'est un envoi, pas une preuve, et le
  // PDF interdit le test destructif : ce bouton-là dit désormais qu'il envoie.
  {
    key: 'webhook',
    scopes: [],
    label: 'déposer une notification',
    probeable: false,
    level: LEVEL_FOR_KEY.webhook,
  },
]

/**
 * La table, par `provider` du catalogue.
 *
 * Un connecteur absent d'ici n'expose pas de capacités détaillées — sa carte
 * garde son état global. C'est le cas des sources de données côté service IA,
 * qui n'ont ni jeton ni portée : rien à décomposer.
 *
 * #3774.3.1 — recette prod 08/10 (U 22edd95fe1) : Odoo était de ceux-là, mais
 * à TORT — c'est un CRM du catalogue (`tool-catalog.ts`, provider `odoo`,
 * `data_types.reads: ['people_records']`), authentifié par une clé d'API
 * d'espace plutôt qu'un jeton OAuth, exactement comme Salesforce/Pipedrive/
 * Attio (`CRM_GENERIC`, mêmes scopes vides). « Absent d'ici » doit vouloir
 * dire « ce connecteur n'a pas de capacités à décomposer », jamais « on a
 * oublié de les décrire » — ce qui était le cas ici.
 */
export const TOOL_CAPABILITIES: Readonly<Record<string, readonly CapabilityDeclaration[]>> = {
  gmail: GMAIL,
  'google-calendar': GOOGLE_CALENDAR,
  'google-drive': GOOGLE_DRIVE,
  microsoft: MICROSOFT,
  hubspot: HUBSPOT,
  notion: NOTION,
  salesforce: CRM_GENERIC,
  pipedrive: CRM_GENERIC,
  attio: CRM_GENERIC,
  odoo: CRM_GENERIC,
  zoho: CRM_GENERIC,
  slack: WEBHOOK,
  discord: WEBHOOK,
  teams: WEBHOOK,
  googlechat: WEBHOOK,
  mattermost: WEBHOOK,
  webhook: WEBHOOK,
}

/**
 * Ce que le produit ne fera JAMAIS avec ce connecteur, et pourquoi.
 *
 * Le PDF consacre la moitié de sa carte de connecteur à ce bloc, et il a raison :
 * un utilisateur qui ignore ce qu'on ne fait pas suppose le pire. « Je n'ai pas
 * demandé le droit de supprimer tes messages » se dit en une ligne et vaut mieux
 * que n'importe quelle page de confidentialité.
 */
export const TOOL_NEVER: Readonly<Record<string, readonly string[]>> = {
  gmail: [
    'supprimer un message — la portée n’est pas demandée',
    'transférer automatiquement — aucun envoi ne part sans ton clic',
  ],
  microsoft: ['supprimer un message — la portée n’est pas demandée', 'transférer automatiquement'],
  'google-calendar': ['supprimer un événement que tu n’as pas créé depuis Bellum'],
  'google-drive': ['modifier ou supprimer un document — l’accès demandé est en LECTURE seule'],
  notion: ['écrire dans tes pages — l’accès demandé est en lecture seule'],
  hubspot: ['fusionner deux fiches — on propose les doublons, on ne fusionne jamais'],
  salesforce: ['fusionner deux fiches'],
  pipedrive: ['fusionner deux fiches'],
  attio: ['fusionner deux fiches'],
  odoo: ['fusionner deux fiches'],
  zoho: ['fusionner deux fiches', 'lire tes tâches — le droit de lecture n’est pas demandé'],
  slack: ['lire tes canaux — un webhook n’écrit que dans un seul sens'],
  teams: ['lire tes canaux', 'préparer un brouillon — une messagerie d’équipe n’en a pas'],
  discord: ['lire tes canaux'],
}

/** Les capacités déclarées d'un outil, ou `[]` s'il n'en décompose aucune. */
export function capabilitiesOf(provider: string): readonly CapabilityDeclaration[] {
  return TOOL_CAPABILITIES[provider] ?? []
}

/**
 * Le nom sous lequel la preuve d'une capacité se range (`connector_capability_probes.capability`).
 *
 * La clé suffit tant qu'un outil ne déclare qu'une capacité par clé. HubSpot en déclare DEUX `read`
 * (contacts, affaires) : la seconde se range sous `read:<portée>` — sinon la sonde des contacts
 * prouvait « lire tes affaires » (HUBSPOT-J.3) et leurs échecs s'écrasaient l'un l'autre.
 */
export function probeCapabilityName(provider: string, capability: CapabilityDeclaration): string {
  const siblings = capabilitiesOf(provider).filter(entry => entry.key === capability.key)
  const first = siblings[0]
  if (siblings.length < 2 || first === capability) return capability.key
  return `${capability.key}:${capability.scopes[0] ?? siblings.indexOf(capability)}`
}
