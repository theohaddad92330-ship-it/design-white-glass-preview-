import { z } from 'zod'
import { CONSULTING_DOMAIN_BY_CODE } from './consulting-domains.js'

/**
 * MÉTIERS PLACÉS DÉDUITS du contexte de l'espace — décision Louis 11/10/2026 :
 * « Tout le contexte, et sinon on pose la question. Tu peux savoir beaucoup
 * avec ce qui est dit à l'onboarding — ex. Antoine Meyer c'est du cyber
 * d'après son contexte. Il faut que ce système soit vraiment excellent et
 * qu'il alimente toujours beaucoup de signaux. »
 *
 * `esn_profiles.placed_roles` (le DÉCLARÉ) reste vide tant que l'espace ne le
 * remplit pas : le filtre de pertinence des offres retombait alors sur le tri
 * IT, et une ESN cyber ou industrie perdait ses vrais signaux. Ce module lit
 * TOUT le contexte déjà présent — texte libre de l'onboarding, portefeuille
 * d'offres, vivier (titres + compétences des CV), missions gagnées — et en
 * déduit des métiers, chacun avec les INDICES qui l'ont fait naître.
 *
 * Ce qu'il ne fait jamais :
 *  - deviner sans indice : contexte vide ⇒ `[]`, l'écran POSE LA QUESTION ;
 *  - écraser le déclaré : `effectiveInferredPlacedRoles` rend `[]` dès qu'un
 *    métier est déclaré, et retire ceux que l'humain a écartés ;
 *  - retirer un signal : côté IA, un métier déduit ÉLARGIT ce qui remonte et
 *    passe en tête (`domain_job_filters.py`), il ne filtre rien.
 *
 * Une seule définition : l'API calcule (`PlacedRolesInferenceService`), l'IA
 * lit `terms` tels quels, le web affiche `evidence`.
 */

export const PLACED_ROLE_EVIDENCE_SOURCES = ['onboarding', 'offer_portfolio', 'talent_pool', 'missions'] as const
type PlacedRoleEvidenceSource = (typeof PLACED_ROLE_EVIDENCE_SOURCES)[number]

type PlacedRoleEvidence = {
  source: PlacedRoleEvidenceSource
  /** Clé de la réponse d'onboarding (`positioning`, `expertise_areas`…) ; absente ailleurs. */
  field?: string
  /** Le passage qui a déclenché la déduction — le contexte de l'espace, jamais un nom de personne. */
  excerpt: string
}

export type InferredPlacedRole = {
  role: string
  /** Termes repliés (sans accents, minuscules) comparés aux intitulés d'offres. */
  terms: string[]
  score: number
  evidence: PlacedRoleEvidence[]
  evidenceCount: number
}

export type PlacedRolesInferenceInput = {
  texts: { field: string; text: string | null | undefined }[]
  offerDomain: string | null
  offerDomains: readonly string[]
  consultants: { title: string | null; skills: readonly string[] }[]
  missions: { title: string | null; label: string | null }[]
}

/** Réponse de `GET /esn-profile/placed-roles-inference`. */
export type PlacedRolesInferenceResponse = {
  /** Les déduits encore proposés (retirés et déjà déclarés exclus). */
  /** `terms` (#3901.p) : les termes d'intitulé du métier déduit, lus par Découvrir pour juger une offre. */
  roles: { role: string; terms?: string[]; evidence: PlacedRoleEvidence[]; evidenceCount: number }[]
  /** Des métiers sont déclarés : ils font foi, les déduits ne pèsent plus sur le tri. */
  declared: boolean
  /** Rien de déclaré ET rien de déductible : on pose la question. */
  needsQuestion: boolean
  computedAt: string | null
}

/** Corps de `POST /esn-profile/placed-roles-inference/dismiss` — même borne que `placed_roles`. */
export const dismissInferredPlacedRoleSchema = z.object({ role: z.string().trim().min(1).max(80) })

type RoleDefinition = {
  role: string
  /** Codes du portefeuille (`CONSULTING_DOMAINS`) qui impliquent ce métier. */
  domains: readonly string[]
  /** Domaines d'offre (pack) NON ambigus qui impliquent ce métier. */
  packs: readonly string[]
  /** Indices dans le CONTEXTE (texte libre, titres, compétences) — repliés, mot entier. */
  clues: readonly string[]
  /** Termes comparés aux intitulés d'offres — repliés, mot entier. */
  terms: readonly string[]
}

/**
 * Le catalogue. Chaque indice est SPÉCIFIQUE : « développement », « qualité »,
 * « réseau », « maintenance » seuls sont des mots de plaquette commerciale,
 * jamais un métier (test « SAIT DIRE NON »).
 */
const CATALOGUE: readonly RoleDefinition[] = [
  // ── Cybersécurité ──
  {
    role: 'Consultant cybersécurité',
    domains: ['CYBER_IAM_GRC'],
    packs: ['cyber'],
    clues: [
      'cyber',
      'cybersecurite',
      'cyber securite',
      'securite informatique',
      'securite des systemes d information',
      'securite des si',
      'ssi',
      'iso 27001',
      'rssi',
      'grc',
      'iam',
      'nis2',
      'nis 2',
      'ebios',
      'cybersecurity',
    ],
    terms: [
      'cybersecurite',
      'cyber',
      'cybersecurity',
      'securite informatique',
      'securite des systemes',
      'securite si',
      'rssi',
      'grc',
      'iam',
      'iso 27001',
      'ssi',
    ],
  },
  {
    role: 'Analyste SOC',
    domains: [],
    packs: [],
    clues: [
      'soc',
      'siem',
      'csirt',
      'cert',
      'splunk',
      'qradar',
      'edr',
      'detection des menaces',
      'detection d incidents',
      'reponse a incident',
      'reponse aux incidents',
    ],
    terms: ['soc', 'siem', 'csirt', 'analyste securite', 'edr', 'threat'],
  },
  {
    role: 'Pentester',
    domains: [],
    packs: [],
    clues: [
      'pentest',
      'pentests',
      'pentester',
      'test d intrusion',
      'tests d intrusion',
      'red team',
      'ethical hacking',
      'hacking ethique',
      'audit de securite',
      'audits de securite',
      'oscp',
    ],
    terms: [
      'pentest',
      'pentester',
      'test d intrusion',
      'tests d intrusion',
      'red team',
      'auditeur securite',
      'ethical hacker',
    ],
  },
  // ── Informatique ──
  {
    role: 'Développeur',
    domains: ['SW_ENGINEERING'],
    packs: [],
    clues: [
      'developpeur',
      'developpeuse',
      'developpeurs',
      'developer',
      'developpement logiciel',
      'developpement web',
      'developpement mobile',
      'developpement applicatif',
      'ingenieur logiciel',
      'software engineer',
      'full stack',
      'fullstack',
      'frontend',
      'front end',
      'backend',
      'back end',
      'java',
      '.net',
      'c#',
      'python',
      'javascript',
      'typescript',
      'react',
      'angular',
      'vue.js',
      'php',
      'node.js',
      'golang',
      'kotlin',
    ],
    terms: [
      'developpeur',
      'developpeuse',
      'developer',
      'fullstack',
      'full stack',
      'frontend',
      'backend',
      'ingenieur logiciel',
      'software engineer',
      'java',
      'python',
      'javascript',
      'react',
      'angular',
      'php',
      '.net',
    ],
  },
  {
    role: 'Data / IA',
    domains: ['AI_ML_GENAI', 'BI_MDM_GOV', 'DATA_ENGINEERING'],
    packs: ['ia'],
    clues: [
      'data',
      'big data',
      'machine learning',
      'deep learning',
      'intelligence artificielle',
      'genai',
      'power bi',
      'business intelligence',
      'mlops',
      'data engineer',
      'data scientist',
      'data analyst',
    ],
    terms: [
      'data',
      'machine learning',
      'intelligence artificielle',
      'business intelligence',
      'power bi',
      'mlops',
      'bi',
    ],
  },
  {
    role: 'Cloud / DevOps',
    domains: ['CLOUD_DEVOPS_SRE'],
    packs: [],
    clues: ['cloud', 'devops', 'sre', 'kubernetes', 'docker', 'aws', 'azure', 'gcp', 'terraform', 'finops'],
    terms: ['cloud', 'devops', 'sre', 'kubernetes', 'aws', 'azure', 'gcp', 'terraform', 'finops'],
  },
  {
    role: 'Infrastructure & réseau',
    domains: ['INFRA_NETWORK_WORKPLACE', 'TELECOM_5G', 'ITSM_SERVICE_OPS'],
    packs: [],
    clues: [
      'administrateur systeme',
      'administrateur systemes',
      'administrateur reseau',
      'administrateur reseaux',
      'ingenieur reseau',
      'ingenieur reseaux',
      'ingenieur systeme',
      'ingenieur systemes',
      'systemes et reseaux',
      'reseaux et telecoms',
      'cisco',
      'vmware',
      'itil',
      'itsm',
      'technicien informatique',
      'technicien support',
      'helpdesk',
      'support n2',
      'support n1',
    ],
    terms: [
      'administrateur systeme',
      'administrateur systemes',
      'administrateur reseau',
      'ingenieur reseau',
      'ingenieur reseaux',
      'ingenieur systeme',
      'technicien informatique',
      'technicien support',
      'systemes et reseaux',
      'infrastructure',
      'telecom',
      'telecoms',
      'itil',
      'helpdesk',
      'support informatique',
    ],
  },
  {
    role: 'Chef de projet / PMO',
    domains: ['PMO_PORTFOLIO', 'CHANGE_ORG_AGILE'],
    packs: ['pmo'],
    clues: [
      'chef de projet',
      'chefs de projet',
      'pmo',
      'product owner',
      'scrum master',
      'coach agile',
      'amoa',
      'directeur de projet',
      'project manager',
    ],
    terms: [
      'chef de projet',
      'pmo',
      'product owner',
      'scrum master',
      'coach agile',
      'amoa',
      'directeur de projet',
      'project manager',
    ],
  },
  {
    role: 'Consultant ERP / CRM',
    domains: ['ERP_SAP_EPM', 'CRM_MARTECH'],
    packs: [],
    clues: ['sap', 'erp', 's 4hana', 's4hana', 'salesforce', 'dynamics 365', 'odoo', 'crm'],
    terms: ['sap', 'erp', 'salesforce', 'dynamics', 'odoo', 'crm'],
  },
  {
    role: 'Testeur / QA',
    domains: ['QA_TESTING'],
    packs: [],
    clues: [
      'testeur',
      'testeurs',
      'qa',
      'recette',
      'ivvq',
      'tests automatises',
      'tests fonctionnels',
      'test logiciel',
      'tests logiciels',
    ],
    terms: ['testeur', 'qa', 'recette', 'ivvq', 'tests', 'quality assurance'],
  },
  {
    role: 'UX / UI design',
    domains: ['PRODUCT_UX_ECOM', 'CREATIVE_CONTENT_DESIGN'],
    packs: ['product_design'],
    clues: ['ux', 'ui', 'ux ui', 'designer', 'ergonome', 'design produit', 'product designer'],
    terms: ['ux', 'ui', 'designer', 'ergonome', 'product designer'],
  },
  // ── Industrie ──
  {
    role: 'Ingénieur mécanique / CAO',
    domains: ['MECHANICAL_ENGINEERING'],
    packs: [],
    clues: [
      'mecanique',
      'cao',
      'catia',
      'solidworks',
      'creo',
      'bureau d etudes',
      'bureaux d etudes',
      'calcul de structure',
      'calcul de structures',
      'dessinateur',
      'projeteur',
    ],
    terms: [
      'mecanique',
      'cao',
      'catia',
      'solidworks',
      'bureau d etudes',
      'dessinateur',
      'projeteur',
      'ingenieur calcul',
    ],
  },
  {
    role: 'Ingénieur électronique / embarqué',
    domains: ['ELECTRICAL_ELECTRONICS', 'SYSTEMS_MBSE'],
    packs: [],
    clues: [
      'electronique',
      'electrique',
      'embarque',
      'systemes embarques',
      'logiciel embarque',
      'firmware',
      'fpga',
      'hardware',
      'mbse',
    ],
    terms: ['electronique', 'electrique', 'embarque', 'firmware', 'fpga', 'hardware'],
  },
  {
    role: 'Automaticien / robotique',
    domains: ['AUTOMATION_ROBOTICS', 'OT_IOT_EDGE'],
    packs: [],
    clues: [
      'automatisme',
      'automatismes',
      'automaticien',
      'automate programmable',
      'plc',
      'scada',
      'robotique',
      'instrumentation',
      'controle commande',
      'iot',
    ],
    terms: [
      'automaticien',
      'automatisme',
      'automatismes',
      'robotique',
      'roboticien',
      'instrumentation',
      'scada',
      'plc',
      'controle commande',
      'iot',
    ],
  },
  {
    role: 'Ingénieur méthodes / industrialisation',
    domains: ['INDUSTRIALIZATION_METHODS', 'MANUFACTURING_OPS', 'PROCESS_EXCELLENCE'],
    packs: [],
    clues: [
      'industrialisation',
      'ingenieur methodes',
      'methodes industrielles',
      'npi',
      'lean',
      'lean manufacturing',
      'production industrielle',
      'process industriel',
      'amelioration continue',
    ],
    terms: [
      'methodes',
      'industrialisation',
      'production',
      'process',
      'lean',
      'amelioration continue',
      'usine',
      'fabrication',
    ],
  },
  {
    role: 'Ingénieur qualité / HSE',
    domains: ['QUALITY_VALIDATION_HSE', 'PHARMA_GMP'],
    packs: ['hse'],
    clues: [
      'ingenieur qualite',
      'assurance qualite',
      'qualiticien',
      'iso 9001',
      'hse',
      'qhse',
      'surete de fonctionnement',
      'gmp',
      'bpf',
      'validation des procedes',
    ],
    terms: ['qualite', 'qhse', 'hse', 'qualiticien', 'validation', 'gmp', 'surete de fonctionnement'],
  },
  {
    role: 'Ingénieur maintenance',
    domains: ['MAINTENANCE_MRO'],
    packs: [],
    clues: [
      'maintenance industrielle',
      'ingenieur maintenance',
      'technicien de maintenance',
      'technicien maintenance',
      'mro',
      'gmao',
      'fiabilite',
    ],
    terms: ['maintenance', 'fiabilite', 'gmao', 'mro'],
  },
  {
    role: 'Ingénieur génie civil / BTP',
    domains: ['CIVIL_CONSTRUCTION_BIM', 'CAPEX_EPCM'],
    packs: [],
    clues: ['genie civil', 'btp', 'bim', 'conducteur de travaux', 'moe', 'batiment'],
    terms: ['genie civil', 'btp', 'bim', 'conducteur de travaux', 'chef de chantier', 'batiment'],
  },
  {
    role: 'Ingénieur énergie / procédés',
    domains: ['ENERGY_UTILITIES_NUCLEAR', 'PROCESS_CHEM_OILGAS'],
    packs: [],
    clues: [
      'nucleaire',
      'energies renouvelables',
      'transition energetique',
      'ingenieur procedes',
      'genie des procedes',
      'chimie',
      'oil gas',
      'petrole',
      'petrochimie',
    ],
    terms: ['nucleaire', 'energie', 'procedes', 'chimie', 'genie des procedes'],
  },
  {
    role: 'Supply chain / achats',
    domains: ['SUPPLY_CHAIN_SOP', 'LOGISTICS_TRANSPORT_OPS', 'PROCUREMENT_SRM'],
    packs: ['supply_chain'],
    clues: [
      'supply chain',
      'logistique',
      'acheteur',
      'acheteurs',
      'achats',
      'approvisionnement',
      'approvisionneur',
      's op',
    ],
    terms: [
      'supply chain',
      'logistique',
      'logisticien',
      'acheteur',
      'achats',
      'approvisionnement',
      'approvisionneur',
      'planificateur',
    ],
  },
  // ── Finance ──
  {
    role: 'Finance / contrôle de gestion',
    domains: ['FINANCE_FPNA', 'TREASURY_WC', 'INTERNAL_AUDIT_CONTROL'],
    packs: ['finance'],
    clues: [
      'controle de gestion',
      'controleur de gestion',
      'comptabilite',
      'comptable',
      'consolidation',
      'fp a',
      'tresorerie',
      'audit interne',
    ],
    terms: [
      'controleur de gestion',
      'controle de gestion',
      'comptable',
      'comptabilite',
      'consolidation',
      'tresorier',
      'tresorerie',
      'audit interne',
      'financier',
    ],
  },
  {
    role: 'Banque, marchés & risques',
    domains: ['MARKET_FINANCE', 'BANKING_CREDIT_PAYMENTS', 'RISK_COMPLIANCE_AML', 'ACTUARIAL', 'INSURANCE_CLAIMS'],
    packs: [],
    clues: [
      'finance de marche',
      'front office',
      'middle office',
      'back office',
      'alm',
      'actuariat',
      'actuaire',
      'kyc',
      'aml',
      'compliance',
    ],
    terms: [
      'actuaire',
      'kyc',
      'aml',
      'conformite',
      'compliance',
      'risques',
      'middle office',
      'back office',
      'front office',
      'quant',
      'bancaire',
    ],
  },
  // ── Santé, RH ──
  {
    role: 'Affaires réglementaires / clinique',
    domains: ['LIFE_SCIENCES_CLINICAL', 'HEALTHCARE_OPS'],
    packs: [],
    clues: [
      'affaires reglementaires',
      'pharmacovigilance',
      'essais cliniques',
      'recherche clinique',
      'dispositif medical',
      'dispositifs medicaux',
      'medtech',
    ],
    terms: [
      'affaires reglementaires',
      'pharmacovigilance',
      'clinique',
      'attache de recherche clinique',
      'dispositif medical',
      'biomedical',
    ],
  },
  {
    role: 'RH / paie',
    domains: ['HRIS_PAYROLL', 'HR_TALENT_LEARNING'],
    packs: ['rh'],
    clues: ['sirh', 'gestionnaire de paie', 'paie', 'ressources humaines', 'charge de recrutement'],
    terms: ['paie', 'sirh', 'ressources humaines', 'rh', 'recruteur', 'charge de recrutement'],
  },
]

const SOURCE_WEIGHT: Record<PlacedRoleEvidenceSource, number> = {
  // Ce que l'espace DIT de lui-même pèse le plus : une mention suffit.
  onboarding: 3,
  offer_portfolio: 3,
  // Une mission signée est un fait, pas une intention.
  missions: 2,
  // Un CV seul est un indice faible : il en faut deux (seuil ci-dessous).
  talent_pool: 1,
}
const MIN_SCORE = 2
const MAX_ROLES = 10
const MAX_EVIDENCE = 4
const EXCERPT_RADIUS = 40

/** Replie pour comparer : sans accents, minuscules, ponctuation → espace (`#`, `+`, `.` gardés). */
export function foldForRoleMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#+.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')
}

const patternCache = new Map<string, RegExp>()
function phrasePattern(phrase: string): RegExp {
  let pattern = patternCache.get(phrase)
  if (!pattern) {
    pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(phrase)}(?=$|[^a-z0-9])`)
    patternCache.set(phrase, pattern)
  }
  return pattern
}

function firstMatch(folded: string, phrases: readonly string[]): string | null {
  for (const phrase of phrases) if (phraseHit(folded, phrase)) return phrase
  return null
}

function phraseHit(folded: string, phrase: string): boolean {
  return phrasePattern(phrase).test(folded)
}

/** Un intitulé d'offre recoupe-t-il ces termes ? Même lecture que `domain_job_filters.py`. */
export function offerMatchesRoleTerms(title: string, terms: readonly string[]): boolean {
  const folded = foldForRoleMatch(title)
  return terms.some(term => term.length > 0 && phraseHit(folded, foldForRoleMatch(term)))
}

/** Le passage du texte ORIGINAL autour du premier mot-clé — l'indice montré à l'écran. */
function excerptAround(text: string, phrase: string): string {
  const clean = text.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (clean.length <= EXCERPT_RADIUS * 2) return clean
  const folded = clean.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // Le repli NFD garde les longueurs une fois les diacritiques retirés sur un
  // texte déjà composé ; on cherche le premier mot du motif, sans exiger l'exactitude.
  const head = phrase.split(' ')[0] ?? phrase
  const at = Math.max(0, folded.indexOf(head))
  const start = Math.max(0, at - EXCERPT_RADIUS)
  const end = Math.min(clean.length, at + head.length + EXCERPT_RADIUS)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`
}

type Accumulator = { score: number; evidence: PlacedRoleEvidence[]; count: number }

/**
 * Déduit les métiers placés du contexte. Rend `[]` quand aucun indice n'atteint
 * le seuil — jamais un métier par défaut.
 */
export function inferPlacedRoles(input: PlacedRolesInferenceInput): InferredPlacedRole[] {
  const acc = new Map<string, Accumulator>()
  const add = (role: string, evidence: PlacedRoleEvidence) => {
    const entry = acc.get(role) ?? { score: 0, evidence: [], count: 0 }
    entry.score += SOURCE_WEIGHT[evidence.source]
    entry.count += 1
    if (entry.evidence.length < MAX_EVIDENCE) entry.evidence.push(evidence)
    acc.set(role, entry)
  }

  for (const { field, text } of input.texts) {
    if (!text || !text.trim()) continue
    const folded = foldForRoleMatch(text)
    for (const def of CATALOGUE) {
      const hit = firstMatch(folded, def.clues)
      if (hit) add(def.role, { source: 'onboarding', field, excerpt: excerptAround(text, hit) })
    }
  }

  const codes = [...new Set(input.offerDomains)]
  for (const code of codes) {
    const label = CONSULTING_DOMAIN_BY_CODE.get(code)?.labelFr
    if (!label) continue
    const folded = foldForRoleMatch(label)
    for (const def of CATALOGUE) {
      if (def.domains.includes(code) || firstMatch(folded, def.clues)) {
        add(def.role, { source: 'offer_portfolio', excerpt: label })
      }
    }
  }
  if (input.offerDomain) {
    for (const def of CATALOGUE) {
      if (
        def.packs.includes(input.offerDomain) &&
        !acc.get(def.role)?.evidence.some(e => e.source === 'offer_portfolio')
      ) {
        add(def.role, { source: 'offer_portfolio', excerpt: input.offerDomain })
      }
    }
  }

  for (const consultant of input.consultants) {
    const blob = [consultant.title ?? '', ...consultant.skills].join(' · ')
    if (!blob.trim()) continue
    const folded = foldForRoleMatch(blob)
    for (const def of CATALOGUE) {
      if (firstMatch(folded, def.clues)) {
        add(def.role, {
          source: 'talent_pool',
          excerpt: (consultant.title ?? consultant.skills.slice(0, 3).join(', ')).trim(),
        })
      }
    }
  }

  for (const mission of input.missions) {
    const blob = [mission.title ?? '', mission.label ?? ''].join(' · ')
    if (!blob.trim()) continue
    const folded = foldForRoleMatch(blob)
    for (const def of CATALOGUE) {
      if (firstMatch(folded, def.clues)) {
        add(def.role, { source: 'missions', excerpt: (mission.title || mission.label || '').trim() })
      }
    }
  }

  const order = new Map(CATALOGUE.map((def, index) => [def.role, index]))
  return [...acc.entries()]
    .filter(([, entry]) => entry.score >= MIN_SCORE)
    .sort(([a, x], [b, y]) => y.score - x.score || (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .slice(0, MAX_ROLES)
    .map(([role, entry]) => ({
      role,
      terms: [...(CATALOGUE.find(def => def.role === role)?.terms ?? [])],
      score: entry.score,
      evidence: entry.evidence,
      evidenceCount: entry.count,
    }))
}

/**
 * Les déduits qui PÈSENT : aucun dès qu'un métier est déclaré (le déclaré
 * gagne toujours), et jamais ceux que l'humain a retirés.
 */
export function effectiveInferredPlacedRoles(
  inferred: readonly InferredPlacedRole[],
  declared: readonly string[],
  dismissed: readonly string[],
): InferredPlacedRole[] {
  if (declared.some(role => role.trim().length > 0)) return []
  const gone = new Set(dismissed.map(foldForRoleMatch))
  return inferred.filter(role => !gone.has(foldForRoleMatch(role.role)))
}

/** Lecture tolérante de la colonne jsonb : une ligne illisible est écartée, jamais complétée. */
export function parseStoredInferredPlacedRoles(value: unknown): InferredPlacedRole[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.role !== 'string' || !row.role.trim()) return []
    const terms = Array.isArray(row.terms) ? row.terms.filter((t): t is string => typeof t === 'string') : []
    const evidence = Array.isArray(row.evidence)
      ? row.evidence.flatMap(e => {
          const ev = e as Record<string, unknown> | null
          if (!ev || !PLACED_ROLE_EVIDENCE_SOURCES.includes(ev.source as PlacedRoleEvidenceSource)) return []
          if (typeof ev.excerpt !== 'string') return []
          return [
            {
              source: ev.source as PlacedRoleEvidenceSource,
              ...(typeof ev.field === 'string' ? { field: ev.field } : {}),
              excerpt: ev.excerpt,
            },
          ]
        })
      : []
    return [
      {
        role: row.role,
        terms,
        score: typeof row.score === 'number' ? row.score : 0,
        evidence,
        evidenceCount: typeof row.evidenceCount === 'number' ? row.evidenceCount : evidence.length,
      },
    ]
  })
}
