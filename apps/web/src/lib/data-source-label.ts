/**
 * L'identifiant d'une SOURCE de données → le texte qu'un client lit. Le seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI — #1912, trouvé en production le 13/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Découvrir écrivait « Non appliqué par pappers » : l'écran interpolait tel quel
 * l'identifiant technique que l'IA renvoie dans `degraded[].source`. Deux fautes
 * d'un coup — un nom de NOTRE fournisseur montré à un client, et un jeton machine
 * en guise de phrase. Aucune garde ne le voyait : le nom était en minuscules, et
 * il n'était écrit dans aucun texte, seulement dans une donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE (doctrine « on nomme ce que l'espace a BRANCHÉ », D354)
 * ─────────────────────────────────────────────────────────────────────────────
 *   • NOTRE fournisseur, commercial, ne se nomme jamais — même quand il revend
 *     une donnée publique : on nomme sa CAPACITÉ (« la source de données
 *     d'entreprises », « la recherche web », « le modèle d'analyse »).
 *   • Un registre PUBLIC ou une autorité se nomme : le nom EST la garantie
 *     (France Travail, BOAMP, DECP, BODACC, INSEE, INPI).
 *   • Tout le reste — une source inconnue, vide, ou ajoutée demain — rend un
 *     libellé GÉNÉRIQUE. Jamais l'identifiant brut : c'est le défaut par défaut
 *     qu'on corrige, et il ne doit pas revenir par la porte du repli.
 *
 * Les libellés vivent dans `common.json → dataSources` (FR et EN). Ils portent
 * leur article et commencent en minuscule, parce qu'ils s'insèrent dans une
 * phrase (« Non appliqué par la recherche web ») ; un écran qui les pose en tête
 * de ligne met la majuscule en CSS (`first-letter:uppercase`).
 */

import { supplierNamesIn } from '@bellum/contracts'

/** Identifiant normalisé (minuscules, tirets) → clé de libellé dans `common:dataSources`. */
export const DATA_SOURCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  // Registres d'entreprises — le rééditeur commercial n'est PAS le registre public.
  pappers: 'companyData',
  'recherche-entreprises': 'publicCompanyRegistry',
  registre: 'companyRegistry',
  registry: 'companyRegistry',
  // Annuaire et enrichissement de contacts — tous des fournisseurs commerciaux.
  apollo: 'professionalDirectory',
  'apollo-enrich': 'professionalDirectory',
  dropcontact: 'enrichment',
  hunter: 'enrichment',
  'hunter.io': 'enrichment',
  lusha: 'enrichment',
  kaspr: 'enrichment',
  fullenrich: 'enrichment',
  salesql: 'enrichment',
  // Web.
  brave: 'webSearch',
  'brave-search': 'webSearch',
  serper: 'webSearch',
  tavily: 'webSearch',
  firecrawl: 'websiteReading',
  // Le modèle — `claude` est ce que Découvrir émet quand la rédaction des angles échoue.
  claude: 'analysisModel',
  anthropic: 'analysisModel',
  openai: 'analysisModel',
  // Registres PUBLICS et autorités : ils se nomment (D354).
  boamp: 'boamp',
  decp: 'decp',
  'france-travail': 'franceTravail',
  bodacc: 'bodacc',
  // #3941 — les fils publics de levées de la presse spécialisée : on nomme la CAPACITÉ.
  'funding-feed': 'fundingFeed',
  // #4067 — les actualités rattachées d'une carte Découvrir : la CAPACITÉ, jamais le média.
  press: 'pressNews',
  insee: 'insee',
  'insee-sirene': 'insee',
  sirene: 'insee',
  inpi: 'inpi',
  'inpi-rne': 'inpi',
  // #2616.1 — mesuré en production le 22/09/2026 : `candidate.sources` porte
  // `sourceLabel: "APEC"` (branché le 21/09) et `"Welcome to the Jungle"` (ce
  // lot) depuis `discover_signals.py`, mais ni l'un ni l'autre n'étaient
  // dans cette table — la ligne « Sources : » de `CandidateCard.tsx` les
  // rendait « une source de données » (`unknown`), effaçant le registre
  // public qui a réellement produit le signal. Ce sont des registres
  // d'offres d'emploi PUBLICS (l'un institutionnel, l'autre un site
  // d'annonces public) : ils se nomment, comme France Travail.
  apec: 'apec',
  'welcome-to-the-jungle': 'wttj',
  // Étapes internes que l'IA rend sous forme de « source ».
  discover: 'search',
  'siren-resolution': 'companyIdentification',
  'data-gateway': 'dataCollection',
  // #2165.28 / #2165.30 — notre propre corpus (`market-memory.service.ts`),
  // jamais un fournisseur : il se nomme comme une capacité, pas une marque.
  'market-memory': 'marketMemory',
}

type Translate = (key: string) => string

/** Le libellé d'UNE source. Inconnue, vide ou absente → « une source de données ». */
export function dataSourceLabel(t: Translate, source: string | null | undefined): string {
  const id = (source ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  const key = Object.prototype.hasOwnProperty.call(DATA_SOURCE_LABEL_KEYS, id) ? DATA_SOURCE_LABEL_KEYS[id] : 'unknown'
  return t(`common:dataSources.${key}`)
}

/** Les libellés de PLUSIEURS sources, dédoublonnés : deux enrichisseurs sont une seule capacité. */
export function dataSourceLabels(t: Translate, sources: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(sources.map(source => dataSourceLabel(t, source)))]
}

/**
 * #1912.11 — la source d'un SIGNAL, qui n'est pas un identifiant.
 *
 * Le champ `source` d'un signal est du texte LIBRE écrit par le modèle : « Les
 * Échos », « L'Agefi », « Site officiel », « BODACC », mais aussi « pappers » ou
 * « legal_pappers » (le nom de la section du prompt). Les deux ne se traitent
 * pas pareil, et c'est pour ça que `dataSourceLabel` seul ne suffit pas ici :
 * il rendrait « une source de données » pour un titre de presse, ce qui
 * EFFACERAIT une preuve vérifiable au lieu de protéger quoi que ce soit.
 *
 * Trois passes, dans l'ordre :
 *   1. un IDENTIFIANT connu de la table ci-dessus (« pappers », « brave ») → sa
 *      capacité, et le nom pour un registre public ;
 *   2. du texte libre qui CITE un de nos fournisseurs (« Pappers.fr »,
 *      « legal_pappers », « Recherche via Brave Search ») → sa capacité. Le
 *      détecteur est celui du contrat (`supplierNamesIn`), un seul endroit ;
 *   3. tout le reste est une preuve, et sort tel quel.
 *
 * `null` quand il n'y a rien à lire : l'écran sait dire « source inconnue », ce
 * qui est la vérité — il n'invente pas de fournisseur plausible.
 */
export function signalSourceLabel(t: Translate, source: string | null | undefined): string | null {
  const raw = (source ?? '').trim()
  if (raw === '') return null
  const id = raw.toLowerCase().replace(/[\s_]+/g, '-')
  if (Object.prototype.hasOwnProperty.call(DATA_SOURCE_LABEL_KEYS, id)) return dataSourceLabel(t, raw)
  const [supplier] = supplierNamesIn(raw)
  return supplier === undefined ? raw : dataSourceLabel(t, supplier)
}
