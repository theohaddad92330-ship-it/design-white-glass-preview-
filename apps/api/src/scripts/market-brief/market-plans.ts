import type { TextRewrite } from '../commercial-brief/text-rules'

/**
 * Les PLANS du convertisseur des briefs de marché (capacité « Marchés locaux », lot L5, 05/10/2026) : pour chaque
 * onglet des trois classeurs fournis, vers quel(s) champ(s) du contrat `MarketBrief` ses lignes vont. Table
 * DÉCLARATIVE : un onglet du classeur absent du plan, un onglet du plan absent du classeur, ou une colonne que le plan
 * ne lit pas sans la déclarer dans `dropped` (avec la raison) fait échouer la conversion.
 *
 * Quatre zones, trois classeurs : `META_MARCHE_LYON_SUISSE.xlsx` porte DEUX zones (décision du plan, « Lyon-Suisse
 * scindé en 2 zones »). Chaque ligne d'un onglet partagé (COCKPIT, GARDE-FOUS) est RÉPARTIE : gardée (`mine`), laissée à
 * l'autre zone (`elsewhere`) ou les deux, jamais ignorée — une ligne qui n'est ni l'une ni l'autre fait échouer.
 */

/** Une ligne d'un onglet partagé : à moi, à l'autre zone, ou aux deux (motif de chacune testé sur le libellé). */
export type Share = { mine: (label: string) => boolean; elsewhere: (label: string) => boolean }

export type SheetPlan = {
  sheet: string
  /** Colonnes volontairement retirées, avec la raison. Jamais lues par un champ. */
  dropped?: Record<string, string>
  /** Onglet reconnu, volontairement non lu. Raison obligatoire. */
  skip?: string
  cockpit?: { kpis?: Share; knowledge?: Share; charts?: Share }
  /** Grille de prix (métier × séniorité) : `n < 3` ⇒ cellule ABSENTE. */
  priceGrid?: { currency: 'EUR' | 'CHF' }
  priceTrend?: true
  /** Une galaxie : un groupe d'enseignes. */
  group?: { name: string }
  clients?: true
  esn?: true
  people?: true
  /** L'onglet entier en section (clé = onglet, sauf `key`). */
  section?: { key?: string }
  /** FILIÈRES : calendrier ET section. */
  calendar?: true
  /** SUJET | CE QUE JE SAIS | CE QUE ÇA VEUT DIRE → `what_i_know`. */
  knowledge?: true
  rules?: true
  guardrails?: Share
  /** Besoins : les lignes localisées dans la zone → section ; les autres → `<clé>-non-retenus` avec leur motif. */
  needs?: { inZone: (location: string) => boolean }
  /** Compte nommé par une ligne de l'onglet (lien « comptes de la zone » par le nom) : phrase VÉRIFIÉE dans la source. */
  accountNamed?: { name: string; row: string }
}

export type MarketPlan = {
  slug: string
  /** Fichier du classeur dans le dossier source. */
  source: string
  titlePrefix: string
  zone: { label: string; scope: 'france' | 'suisse'; departments: string[]; cantons: string[]; cities: string[] }
  generatedAt: string
  rewrites: readonly (TextRewrite & { shared?: true })[]
  sheets: readonly SheetPlan[]
}

const GENERATED_AT = '2026-10-05T10:00:00+02:00'

const COUNT_COLUMN =
  'comptage de coordonnées renseignées : les personnes et leurs coordonnées sont dans l’onglet EXTERNES'

/**
 * Villes de chaque zone, DÉCLARÉES ici (jamais dérivées d'une colonne : « Greater Lyon », « Clermont » ou
 * « Hauts-De-France » n'y ont rien à faire). Chacune est VÉRIFIÉE présente dans le classeur par le moteur : une ville
 * que le classeur ne cite pas fait échouer la conversion. Elles servent au lien « comptes de la zone » (siège d'un
 * compte lu dans la zone), jamais à afficher une carte.
 */
const LILLE_CITIES = [
  'Lille',
  'Lezennes',
  'Ronchin',
  "Villeneuve-d'Ascq",
  'Roubaix',
  'Tourcoing',
  'Croix',
  'Marcq-en-Barœul',
  'Bondues',
  'La Madeleine',
  'Wattrelos',
  'Armentières',
  'Seclin',
  'Lesquin',
  'Saint-André-lez-Lille',
]
const NANTES_CITIES = [
  'Nantes',
  'Saint-Nazaire',
  'Couëron',
  'Carquefou',
  'Rezé',
  'Orvault',
  'Saint-Herblain',
  'Ancenis',
]
const LYON_CITIES = [
  'Lyon',
  'Villeurbanne',
  'Bron',
  'Vénissieux',
  'Écully',
  'Limonest',
  'Dardilly',
  'Saint-Priest',
  'Pierre-Bénite',
  'Meyzieu',
  'Chassieu',
  'Brignais',
  'Annecy',
  'Chambéry',
  'Grenoble',
  'Bourg-en-Bresse',
]

const everything: Share = { mine: () => true, elsewhere: () => false }
const startsWith =
  (prefix: string) =>
  (label: string): boolean =>
    label.toUpperCase().startsWith(prefix)
const guardrailPoints = (points: readonly string[]) => (label: string) => points.includes(label)

/** GARDE-FOUS de META_MARCHE_LYON_SUISSE, répartis : « Mémoire française » et « Données datées » valent pour les deux. */
const LYON_POINTS = [
  'Mémoire française',
  'Classement sectoriel Lyon',
  'Données datées',
  'Historique de besoins lyonnais mince',
]
const SUISSE_POINTS = ['Mémoire française', 'Location de services', 'TJM suisses', 'Données datées', 'Marchés publics']

const DATAFORGE: TextRewrite & { shared: true } = {
  sheet: 'COCKPIT',
  find: 'Quatre comptes DataForge à siège suisse',
  replace: 'Quatre comptes de la mémoire marché à siège suisse',
  why: 'DataForge est notre fournisseur : il ne se nomme jamais à l’écran, la mémoire marché se nomme « mémoire marché » (décision 14/09/2026, D11)',
  shared: true,
}

/** Les colonnes de comptage d'un onglet de clients (E-MAILS / MOBILES), retirées avec leur raison. */
const clientsDropped = { 'E-MAILS': COUNT_COLUMN, MOBILES: COUNT_COLUMN }

const lille: MarketPlan = {
  slug: 'lille',
  source: 'MARCHE_LILLE_MEEDZ.xlsx',
  titlePrefix: 'MARCHÉ LILLOIS',
  zone: { label: 'Lille et métropole (59)', scope: 'france', departments: ['59'], cantons: [], cities: LILLE_CITIES },
  generatedAt: GENERATED_AT,
  rewrites: [],
  sheets: [
    { sheet: 'COCKPIT', cockpit: { kpis: everything, knowledge: everything, charts: everything } },
    { sheet: 'GRILLE DE PRIX LILLE', priceGrid: { currency: 'EUR' } },
    { sheet: 'TENDANCE DES PRIX', priceTrend: true },
    { sheet: 'GALAXIE MULLIEZ', group: { name: 'Galaxie Mulliez' } },
    { sheet: 'CLIENTS LILLE', clients: true, dropped: clientsDropped },
    { sheet: 'ESN LILLE', esn: true },
    { sheet: 'BESOINS LILLE', section: {} },
    { sheet: 'EXTERNES LILLE', people: true },
    { sheet: 'COMPTES STRUCTURES', section: {} },
    { sheet: 'GARDE-FOUS', guardrails: everything },
  ],
}

const nantes: MarketPlan = {
  slug: 'nantes-saint-nazaire',
  source: 'MARCHE_NANTES_SAINT_NAZAIRE.xlsx',
  titlePrefix: 'MARCHÉ NANTES',
  zone: {
    label: 'Nantes – Saint-Nazaire (44)',
    scope: 'france',
    departments: ['44'],
    cantons: [],
    cities: NANTES_CITIES,
  },
  generatedAt: GENERATED_AT,
  rewrites: [],
  sheets: [
    { sheet: 'COCKPIT', cockpit: { kpis: everything, knowledge: everything, charts: everything } },
    { sheet: 'FILIERES', calendar: true },
    { sheet: 'ENTREPRISES DU BASSIN', clients: true, dropped: clientsDropped },
    { sheet: 'ESN ET INGENIERIES DU BASSIN', esn: true },
    { sheet: 'COMPTES STRUCTURES', section: {} },
    { sheet: 'EXTERNES DU BASSIN', people: true },
    { sheet: 'GARDE-FOUS', guardrails: everything },
  ],
}

const LYON_TEXT = /lyon|annecy|chamb[ée]ry|grenoble/i

const lyon: MarketPlan = {
  slug: 'lyon-axe-geneve',
  source: 'META_MARCHE_LYON_SUISSE.xlsx',
  titlePrefix: 'MARCHÉ LYON ET SUISSE',
  zone: {
    label: 'Lyon et axe Genève (69, 01, 38, 73, 74)',
    scope: 'france',
    departments: ['69', '01', '38', '73', '74'],
    cantons: [],
    cities: LYON_CITIES,
  },
  generatedAt: GENERATED_AT,
  rewrites: [
    DATAFORGE,
    {
      sheet: 'COMPTES STRUCTURES LYON',
      find: 'Verrouillé mais 100 % public',
      replace: 'Verrouillé mais entièrement public',
      why: '« 100 % public » décrit la publicité des accords-cadres de la SNCF, pas un taux de couverture : à côté de « sous-traiter en rang 2 » le contrôle COVERAGE_AS_MARKET (GA-259) le lirait comme tel ; même sens, sans pourcentage',
    },
  ],
  sheets: [
    {
      sheet: 'COCKPIT',
      cockpit: {
        // 4 des 6 indicateurs sont lyonnais (clients, externes, ESN, axe) ; TJM et règles sont suisses.
        kpis: {
          mine: l => startsWith('LYON')(l) || startsWith('AXE LYON')(l),
          elsewhere: startsWith('SUISSE'),
        },
        knowledge: { mine: startsWith('LYON'), elsewhere: startsWith('SUISSE') },
        // Tous les graphiques du cockpit sont lyonnais.
        charts: everything,
      },
    },
    { sheet: 'CLIENTS LYON', clients: true, dropped: clientsDropped },
    { sheet: 'SECTEURS LYON', section: {} },
    {
      sheet: 'COMPETENCES LYON',
      section: {},
      dropped: {
        'TAUX EXTERNE':
          'ratio DONT EXTERNES / PROFILS (colonnes voisines, qui restent) : un pourcentage lu avec « externalisation » se lit comme un fait de marché, jamais comme ce qu’on a observé (GA-259, contrôle COVERAGE_AS_MARKET)',
      },
    },
    { sheet: 'ESN LYON', esn: true },
    { sheet: 'EXTERNES LYON', people: true },
    { sheet: 'COMPTES STRUCTURES LYON', section: {} },
    { sheet: 'BESOINS CLIENTS LYON', needs: { inZone: l => LYON_TEXT.test(l) } },
    {
      sheet: 'ANCIENS SANOFI LYON',
      skip: 'porté par le brief du compte Sanofi (anciens de Sanofi : union Lyon + Digital France), pas répété dans la fiche marché',
    },
    { sheet: 'AXE LYON-GENEVE', section: {} },
    { sheet: 'MARCHE SUISSE', skip: 'zone Suisse romande (même classeur, autre zone)' },
    { sheet: 'REGLES SUISSE', skip: 'zone Suisse romande (même classeur, autre zone)' },
    { sheet: 'CIBLES ABB SUISSE', skip: 'zone Suisse romande (même classeur, autre zone)' },
    {
      sheet: 'GARDE-FOUS',
      guardrails: { mine: guardrailPoints(LYON_POINTS), elsewhere: guardrailPoints(SUISSE_POINTS) },
    },
  ],
}

const suisse: MarketPlan = {
  slug: 'suisse-romande',
  source: 'META_MARCHE_LYON_SUISSE.xlsx',
  titlePrefix: 'MARCHÉ LYON ET SUISSE',
  zone: {
    label: 'Suisse romande (GE, VD)',
    scope: 'suisse',
    departments: [],
    cantons: ['GE', 'VD'],
    cities: ['Genève', 'Lausanne'],
  },
  generatedAt: GENERATED_AT,
  rewrites: [
    DATAFORGE,
    {
      sheet: 'COCKPIT',
      find: 'SUISSE — RÈGLES',
      replace: 'SUISSE — RÈGLES LOCALES',
      why: 'la tuile « 25 » n’avait aucune unité : lue avec son libellé elle dit « 25 règles locales » (recette 06/10/2026)',
    },
  ],
  sheets: [
    {
      sheet: 'COCKPIT',
      cockpit: {
        kpis: { mine: startsWith('SUISSE'), elsewhere: l => startsWith('LYON')(l) || startsWith('AXE LYON')(l) },
        knowledge: { mine: startsWith('SUISSE'), elsewhere: startsWith('LYON') },
        charts: { mine: () => false, elsewhere: () => true },
      },
    },
    ...[
      'CLIENTS LYON',
      'SECTEURS LYON',
      'COMPETENCES LYON',
      'ESN LYON',
      'EXTERNES LYON',
      'COMPTES STRUCTURES LYON',
      'BESOINS CLIENTS LYON',
      'ANCIENS SANOFI LYON',
      'AXE LYON-GENEVE',
    ].map((sheet): SheetPlan => ({ sheet, skip: 'zone Lyon et axe Genève (même classeur, autre zone)' })),
    // ABB Suisse : le compte structuré de la zone, nommé par la ligne « Compte structuré » (lien par le nom).
    { sheet: 'MARCHE SUISSE', knowledge: true, accountNamed: { name: 'ABB Suisse', row: 'Compte structuré' } },
    { sheet: 'REGLES SUISSE', rules: true },
    {
      sheet: 'CIBLES ABB SUISSE',
      skip: 'les 33 cibles du compte sont déjà dans le brief du compte ABB Suisse (personnes en clair, rattachées à leur employeur)',
    },
    {
      sheet: 'GARDE-FOUS',
      guardrails: { mine: guardrailPoints(SUISSE_POINTS), elsewhere: guardrailPoints(LYON_POINTS) },
    },
  ],
}

export const MARKET_PLANS: readonly MarketPlan[] = [lille, nantes, lyon, suisse]
