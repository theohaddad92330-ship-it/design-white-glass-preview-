/**
 * R24-FIX-B (15/10) — LA SALLE DE DÉCOUVRIR MONTRE DE VRAIES ENTREPRISES.
 *
 * Décision Louis 04/10 : plus AUCUN compte fictif « exemple » en démonstration — ce que voit un prospect, ce
 * sont les entreprises des briefs (banque, assurance, aéronautique, télécoms, énergie, automobile…).
 * Recette prod 15/10 : « Banque-finance-assurance + Paris » ne rendait qu'une holding factice à « 0 salarié ».
 *
 * Trois règles tiennent cette liste honnête :
 *
 * 1. EFFECTIF : une tranche INSEE n'est écrite que pour les très grands groupes (≥ 10 000 salariés, où l'ordre
 *    de grandeur ne se discute pas) ; sinon `null` — une absence n'est JAMAIS « 0 salarié » (GA-18 / GA-19).
 * 2. SIGNAUX : des offres d'emploi datées, de nature générique (jamais un chiffre, un projet ou un fait
 *    d'actualité attribué à une vraie société), 2 à 3 par carte — bien en deçà des plafonds de la grille
 *    (5 forts, 10 de contexte). Jamais de stage ; jamais le nom d'un fournisseur de données.
 * 3. IDENTITÉ : le SIREN reste celui que `demoDiscoverResponse` fabrique (sept zéros de tête, clé de Luhn
 *    fausse) — aucun numéro officiel n'est recopié.
 */
type DemoRealCompany = {
  name: string
  sector: string
  city: string
  department: string
  /** `null` = effectif non publié ici — la carte n'écrit alors aucune ligne « salariés ». */
  headcountRange: string | null
  nafCode: string
}

const BANK = 'Banque de détail & Banque privée'
const INSURANCE = 'Assurance — banque & finance'

export const DEMO_REAL_DISCOVER_COMPANIES: readonly DemoRealCompany[] = [
  {
    name: 'BNP Paribas',
    sector: BANK,
    city: 'Paris',
    department: '75',
    headcountRange: '10 000 salariés et plus',
    nafCode: '64.19Z',
  },
  {
    name: 'Société Générale',
    sector: BANK,
    city: 'Paris',
    department: '75',
    headcountRange: '10 000 salariés et plus',
    nafCode: '64.19Z',
  },
  { name: 'Groupe BPCE', sector: BANK, city: 'Paris', department: '75', headcountRange: null, nafCode: '64.20Z' },
  { name: 'Natixis', sector: BANK, city: 'Paris', department: '75', headcountRange: null, nafCode: '64.19Z' },
  { name: 'La Banque Postale', sector: BANK, city: 'Paris', department: '75', headcountRange: null, nafCode: '64.19Z' },
  {
    name: 'Crédit Agricole S.A.',
    sector: BANK,
    city: 'Montrouge',
    department: '92',
    headcountRange: null,
    nafCode: '64.19Z',
  },
  {
    name: 'Crédit Mutuel Arkéa',
    sector: BANK,
    city: 'Le Relecq-Kerhuon',
    department: '29',
    headcountRange: null,
    nafCode: '64.19Z',
  },
  {
    name: 'AXA',
    sector: INSURANCE,
    city: 'Paris',
    department: '75',
    headcountRange: '10 000 salariés et plus',
    nafCode: '64.20Z',
  },
  {
    name: 'CNP Assurances',
    sector: INSURANCE,
    city: 'Paris',
    department: '75',
    headcountRange: null,
    nafCode: '65.11Z',
  },
  { name: 'Groupama', sector: INSURANCE, city: 'Paris', department: '75', headcountRange: null, nafCode: '65.12Z' },
  { name: 'Covéa', sector: INSURANCE, city: 'Paris', department: '75', headcountRange: null, nafCode: '65.12Z' },
  {
    name: 'Airbus',
    sector: 'Aéronautique & Défense — avionneur',
    city: 'Blagnac',
    department: '31',
    headcountRange: '10 000 salariés et plus',
    nafCode: '30.30Z',
  },
  {
    name: 'Thales',
    sector: 'Aéronautique & Défense — électronique de défense',
    city: 'Courbevoie',
    department: '92',
    headcountRange: null,
    nafCode: '26.51B',
  },
  {
    name: 'Orange',
    sector: 'Tech & Startups — télécommunications',
    city: 'Paris',
    department: '75',
    headcountRange: null,
    nafCode: '61.10Z',
  },
  {
    name: 'EDF',
    sector: 'Énergie — production et fourniture d’électricité',
    city: 'Paris',
    department: '75',
    headcountRange: null,
    nafCode: '35.11Z',
  },
  {
    name: 'Renault',
    sector: 'Industrie — construction automobile',
    city: 'Boulogne-Billancourt',
    department: '92',
    headcountRange: null,
    nafCode: '29.10Z',
  },
]

/**
 * Deux à trois offres génériques, datées, variées d'une carte à l'autre (rang) pour que la page ne répète pas
 * trois fois la même ligne. Dates au format de référence des scripts (re-datées à aujourd'hui par l'appelant).
 */
const HIRING_POOL: readonly { label: string; jobFamily: string; daysBefore: number; tier: 'strong' | 'context' }[] = [
  { label: 'Ingénieurs data et cloud — offres ouvertes', jobFamily: 'ingenierie', daysBefore: 6, tier: 'strong' },
  {
    label: 'Chefs de projet data et cloud — offres ouvertes',
    jobFamily: 'gestion_projet',
    daysBefore: 11,
    tier: 'strong',
  },
  { label: 'Architectes cloud — offres ouvertes', jobFamily: 'ingenierie', daysBefore: 19, tier: 'context' },
  {
    label: 'Ingénieurs DevOps et sécurité cloud — offres ouvertes',
    jobFamily: 'ingenierie',
    daysBefore: 27,
    tier: 'context',
  },
  { label: 'Développeurs Java — offres ouvertes', jobFamily: 'ingenierie', daysBefore: 8, tier: 'strong' },
]

const CONTRACT_CYCLE: readonly ({ contractType: 'CDI' | 'FREELANCE' } | Record<string, never>)[] = [
  { contractType: 'CDI' },
  { contractType: 'FREELANCE' },
  {},
]

export function demoRealCompanySignals(rank: number): {
  type: 'hiring'
  label: string
  date: string
  contractType?: 'CDI' | 'FREELANCE'
  jobFamily: string
  hiringSignalClass: 'internal_hiring'
  stillOpen: true
  tier: 'strong' | 'context'
}[] {
  const count = 2 + (rank % 2)
  return Array.from({ length: count }, (_, offset) => {
    const pick = HIRING_POOL[(rank + offset) % HIRING_POOL.length]
    const day = new Date(Date.parse('2026-10-13T00:00:00Z') - pick.daysBefore * 86_400_000)
    return {
      type: 'hiring' as const,
      label: pick.label,
      date: day.toISOString().slice(0, 10),
      // #5000.2 — trois cas se voient sur la carte : CDI, freelance, et NON DÉCLARÉ (« Contrat non précisé »).
      ...CONTRACT_CYCLE[(rank + offset) % CONTRACT_CYCLE.length],
      jobFamily: pick.jobFamily,
      hiringSignalClass: 'internal_hiring' as const,
      stillOpen: true as const,
      tier: pick.tier,
    }
  })
}
