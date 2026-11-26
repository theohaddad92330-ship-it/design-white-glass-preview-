import { z } from 'zod'
import { apolloSourceStatusSchema } from './contacts-data.js'

/**
 * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur une
 * sélection de comptes déjà connus (`/accounts`, ≥ 2 lignes cochées, le même
 * geste que « Actualiser les signaux »/« Actualiser les contacts »).
 *
 * Distincte de `targetedRefreshInputSchema` (rejeu d'un axe sur un dossier
 * déjà analysé, `RefreshContactsDialog`) : ici, aucune analyse préalable
 * n'est requise — la recherche porte sur des personnes JAMAIS collectées,
 * scopée par le nom/domaine du compte, jamais un critère cross-comptes non
 * ancré (chaque ligne du devis, puis chaque exécution, cible UN compte).
 */
export const contactDiscoveryQuoteRequestSchema = z.object({
  accountIds: z.array(z.string().min(1)).min(1),
})
export type ContactDiscoveryQuoteRequest = z.infer<typeof contactDiscoveryQuoteRequestSchema>

export const contactDiscoveryQuoteLineSchema = z.object({
  accountId: z.string(),
  companyName: z.string(),
  /** Coût de CETTE ligne, en crédits — `CREDIT_WEIGHTS.contact_discovery`,
   *  UNE fois par compte (jamais par contact trouvé : le fournisseur facture
   *  la recherche, pas son résultat). */
  cost: z.number().int().nonnegative(),
})
export type ContactDiscoveryQuoteLine = z.infer<typeof contactDiscoveryQuoteLineSchema>

/**
 * Le devis ANNONCÉ avant tout lancement (doctrine : le coût se voit avant le
 * clic). `sufficient` est calculé sur `delta` (la somme des lignes) contre
 * `remaining` — jamais recalculé côté écran, pour qu'un seul endroit décide.
 */
export const contactDiscoveryQuoteSchema = z.object({
  lines: z.array(contactDiscoveryQuoteLineSchema),
  delta: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  sufficient: z.boolean(),
})
export type ContactDiscoveryQuote = z.infer<typeof contactDiscoveryQuoteSchema>

export const contactDiscoveryRunRequestSchema = z.object({
  /** Rôles ciblés (facultatif) — vide, la primitive IA retombe sur la liste
   *  des décideurs IT par défaut. */
  titles: z.array(z.string()).optional(),
  /** #4058 — l'expertise cherchée (« cyber », « GRC »), distincte du secteur. */
  expertise: z.string().trim().min(1).max(120).optional(),
  /** #4058 — le secteur du CLIENT : jamais une expertise, jamais un intitulé. */
  sector: z.string().trim().min(1).max(120).optional(),
  /** #4058 — le périmètre visé (entité, BU, site) : se montre, ne filtre pas. */
  scope: z.string().trim().min(1).max(120).optional(),
})
export type ContactDiscoveryRunRequest = z.infer<typeof contactDiscoveryRunRequestSchema>

/**
 * Le résultat de l'exécution sur UN compte. `status` typé (GA-18/19) : sans
 * clé fournisseur, `status: 'unconfigured'` et `cost: 0` — jamais un débit
 * sur un geste qui n'a rien pu chercher.
 */
export const contactDiscoveryOutcomeSchema = z.object({
  accountId: z.string(),
  status: apolloSourceStatusSchema,
  /** Contacts rendus par la recherche (avant dédoublonnage). */
  found: z.number().int().nonnegative(),
  /** Contacts RÉELLEMENT créés — après dédoublonnage contre le compte
   *  (identité existante = jamais recréé, jamais fusionné). */
  created: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative(),
})
export type ContactDiscoveryOutcome = z.infer<typeof contactDiscoveryOutcomeSchema>

/**
 * #4058 (BEL-AM-1210-007) — l'EXPERTISE cherchée, le SECTEUR du client, le
 * PÉRIMÈTRE et le TYPE de personne (`titles`) sont QUATRE choses : une
 * recherche « cyber / GRC » dans le secteur de l'énergie ne devient jamais une
 * recherche « énergie ». Ils voyagent séparés de la carte de Laura jusqu'à
 * l'exécution ; seul `expertise` ET `titles` pèsent sur les intitulés
 * cherchés, jamais `sector` ni `scope` (qui ne font que se montrer).
 *
 * Une expertise que le catalogue ne connaît pas ne dérive AUCUN intitulé (rien
 * d'inventé) : elle reste dite, telle que l'utilisateur l'a écrite.
 */
const DISCOVERY_TITLES_MAX = 12

type ExpertiseEntry = { id: string; aliases: readonly string[]; titles: readonly string[] }

/** Alias déjà normalisés (voir {@link normalizeExpertise}) : « GRC » et sa forme
 *  développée sont le MÊME besoin. */
const EXPERTISE_CATALOG: readonly ExpertiseEntry[] = [
  {
    id: 'cyber',
    aliases: ['cyber', 'cybersecurite', 'securite informatique', 'securite si', 'ssi', 'infosec', 'cyber security'],
    titles: [
      'RSSI',
      'CISO',
      'Responsable cybersécurité',
      'Directeur cybersécurité',
      'Responsable sécurité informatique',
    ],
  },
  {
    id: 'grc',
    aliases: ['grc', 'gouvernance risque conformite', 'gouvernance risques conformite', 'governance risk compliance'],
    titles: [
      'Responsable GRC',
      'Directeur des risques',
      'Responsable conformité',
      'Risk manager',
      'Compliance officer',
      'Responsable gouvernance des risques',
    ],
  },
  {
    id: 'data',
    aliases: ['data', 'donnees', 'data science', 'big data'],
    titles: ['Chief Data Officer', 'Directeur data', 'Responsable data', 'Head of Data'],
  },
  {
    id: 'cloud',
    aliases: ['cloud', 'devops', 'infrastructure cloud'],
    titles: ['Responsable cloud', 'Directeur infrastructure', 'Responsable DevOps', 'Head of Cloud'],
  },
]

const EXPERTISE_STOP_WORDS = new Set(['et', 'de', 'des', 'du', 'la', 'le', 'les', 'and', 'of', 'the', 'd', 'l'])

function normalizeExpertise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(word => word && !EXPERTISE_STOP_WORDS.has(word))
    .join(' ')
}

/** Les expertises du catalogue que ce texte nomme — [] si aucune (jamais devinée). */
export function matchedExpertiseIds(expertise: string | undefined): string[] {
  const text = ` ${normalizeExpertise(expertise ?? '')} `
  return EXPERTISE_CATALOG.filter(entry => entry.aliases.some(alias => text.includes(` ${alias} `))).map(
    entry => entry.id,
  )
}

/**
 * Les intitulés à chercher pour une demande : ceux que l'utilisateur a nommés
 * (`titles`, le type de personne) PUIS ceux de l'expertise reconnue. `undefined`
 * quand rien n'est nommé — la primitive IA retombe alors sur son défaut, comme
 * avant ce lot.
 */
export function discoveryTitlesFor(input: {
  titles?: readonly string[] | undefined
  expertise?: string | undefined
}): string[] | undefined {
  const named = (input.titles ?? []).map(title => title.trim()).filter(Boolean)
  const derived = matchedExpertiseIds(input.expertise).flatMap(
    id => EXPERTISE_CATALOG.find(entry => entry.id === id)?.titles ?? [],
  )
  const merged = [...new Set([...named, ...derived])].slice(0, DISCOVERY_TITLES_MAX)
  return merged.length > 0 ? merged : undefined
}
