import { z } from 'zod'
import type { OfferDomain } from './onboarding.js'

/**
 * La taxonomie des 66 domaines de conseil — pack DATAFORGE V10 (24/08/2026,
 * `agent_docs/dataforge-v10-plan.md` §B1).
 *
 * C'est de la DONNÉE, pas 66 packs de prompts : chaque domaine est rattaché à
 * l'un des 7 packs d'offre existants (`OFFER_DOMAINS`) — le mapping est celui
 * livré dans le CSV (`bellum_existing_offer_pack`), recopié VERBATIM, à une
 * seule traduction près : `product_design_or_commercial` (une valeur du CSV
 * qui n'existe pas chez nous) → `product_design`. Un pack curé par domaine
 * s'écrira quand un client le réclamera, pas avant.
 *
 * Les codes sont ceux du pack (`bellum_domain_code`), verbatim : c'est la clé
 * de jointure avec `dataforge_account_domains` — les réécrire casserait le
 * rapprochement portefeuille ↔ priors.
 *
 * Le `group` est un regroupement d'AFFICHAGE (l'onboarding montre 66 cases en
 * 10 groupes, pas une liste plate) — il ne pilote aucun raisonnement.
 *
 * ⚠️ Miroir Python : `apps/ia/app/services/offer_domains/portfolio.py` porte la
 * même table (le service IA lit `esn_profiles` en direct et n'a pas accès à ce
 * paquet à l'exécution — Railway root = `apps/ia`). Sa parité est verrouillée
 * par `apps/ia/tests/test_consulting_domains_parity.py`, qui lit CE fichier.
 */

export const CONSULTING_DOMAIN_GROUPS = [
  'tech',
  'produit_experience',
  'finance_risque',
  'operations_supply',
  'ingenierie',
  'transformation_pmo',
  'rh_talent',
  'sante_sciences',
  'corporate',
  'secteurs_specialises',
] as const
export type ConsultingDomainGroup = (typeof CONSULTING_DOMAIN_GROUPS)[number]

export interface ConsultingDomain {
  /** `bellum_domain_code` du pack DATAFORGE — clé de jointure, jamais réécrite. */
  code: string
  group: ConsultingDomainGroup
  /** Le pack d'offre existant qui porte le prisme de prompts de ce domaine. */
  pack: OfferDomain
  labelFr: string
  labelEn: string
}

export const CONSULTING_DOMAINS: readonly ConsultingDomain[] = [
  // ── Technologie & digital ─────────────────────────────────────────────────
  // #2633.1 — pointait sur `esn_it` (générique) : un vendeur qui choisit CE
  // domaine ne voyait jamais Data Science/ML/GenAI cités spécifiquement.
  {
    code: 'AI_ML_GENAI',
    group: 'tech',
    pack: 'ia',
    labelFr: 'IA, machine learning, GenAI & agents',
    labelEn: 'AI, machine learning, GenAI & agents',
  },
  {
    code: 'ARCH_INTEGRATION',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'Architecture SI, intégration, API & middleware',
    labelEn: 'IT architecture, integration, APIs & middleware',
  },
  {
    code: 'BI_MDM_GOV',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'BI, analytics, MDM & gouvernance des données',
    labelEn: 'BI, analytics, MDM & data governance',
  },
  {
    code: 'CLOUD_DEVOPS_SRE',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'Cloud, DevOps, SRE, plateformes & FinOps',
    labelEn: 'Cloud, DevOps, SRE, platforms & FinOps',
  },
  // #3186.3 — pointait sur `esn_it` (générique) : un vendeur cyber pur ne
  // voyait jamais CISO/IAM/GRC/SOC cités spécifiquement.
  {
    code: 'CYBER_IAM_GRC',
    group: 'tech',
    pack: 'cyber',
    labelFr: 'Cybersécurité, IAM, GRC, SOC & résilience numérique',
    labelEn: 'Cybersecurity, IAM, GRC, SOC & digital resilience',
  },
  {
    code: 'DATA_ENGINEERING',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'Data engineering, plateformes & pipelines',
    labelEn: 'Data engineering, platforms & pipelines',
  },
  {
    code: 'ERP_SAP_EPM',
    group: 'tech',
    pack: 'esn_it',
    labelFr: "ERP, SAP, Oracle, EPM & applications d'entreprise",
    labelEn: 'ERP, SAP, Oracle, EPM & enterprise applications',
  },
  {
    code: 'INFRA_NETWORK_WORKPLACE',
    group: 'tech',
    pack: 'esn_it',
    labelFr: "Infrastructure, réseau, workplace & télécom d'entreprise",
    labelEn: 'Infrastructure, network, workplace & enterprise telecom',
  },
  {
    code: 'ITSM_SERVICE_OPS',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'ITSM, service management, support & opérations',
    labelEn: 'ITSM, service management, support & operations',
  },
  {
    code: 'OT_IOT_EDGE',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'OT, IoT, edge, systèmes industriels & digitalisation terrain',
    labelEn: 'OT, IoT, edge, industrial systems & field digitalisation',
  },
  {
    code: 'QA_TESTING',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'QA logiciel, tests, recette & IVVQ',
    labelEn: 'Software QA, testing, acceptance & IVVQ',
  },
  {
    code: 'RPA_LOWCODE',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'RPA, low-code, BPM & automatisation des processus',
    labelEn: 'RPA, low-code, BPM & process automation',
  },
  {
    code: 'SW_ENGINEERING',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'Développement logiciel & applications',
    labelEn: 'Software development & applications',
  },
  {
    code: 'TELECOM_5G',
    group: 'tech',
    pack: 'esn_it',
    labelFr: 'Télécoms, réseaux opérateurs, fibre, radio & 5G',
    labelEn: 'Telecoms, carrier networks, fibre, radio & 5G',
  },
  // ── Produit, design & expérience client ───────────────────────────────────
  {
    code: 'CRM_MARTECH',
    group: 'produit_experience',
    pack: 'product_design',
    labelFr: 'CRM, MarTech, customer platforms & marketing automation',
    labelEn: 'CRM, MarTech, customer platforms & marketing automation',
  },
  {
    code: 'CREATIVE_CONTENT_DESIGN',
    group: 'produit_experience',
    pack: 'product_design',
    labelFr: 'Création, direction artistique, contenu & design graphique',
    labelEn: 'Creative, art direction, content & graphic design',
  },
  {
    code: 'CUSTOMER_SERVICE_CX',
    group: 'produit_experience',
    pack: 'product_design',
    labelFr: 'Service client, contact center, CX & opérations clients',
    labelEn: 'Customer service, contact center, CX & client operations',
  },
  {
    code: 'MARKETING_BRAND_MEDIA',
    group: 'produit_experience',
    pack: 'product_design',
    labelFr: 'Marketing, marque, média, contenu & communication commerciale',
    labelEn: 'Marketing, brand, media, content & commercial communication',
  },
  {
    code: 'MEDIA_ENTERTAINMENT_PROD',
    group: 'produit_experience',
    pack: 'product_design',
    labelFr: 'Audiovisuel, média, production, broadcast & entertainment',
    labelEn: 'Audiovisual, media, production, broadcast & entertainment',
  },
  {
    code: 'PRODUCT_UX_ECOM',
    group: 'produit_experience',
    pack: 'product_design',
    labelFr: 'Produit digital, UX/UI, e-commerce & expérience digitale',
    labelEn: 'Digital product, UX/UI, e-commerce & digital experience',
  },
  {
    code: 'SALES_REVOPS_PRICING',
    group: 'produit_experience',
    pack: 'generic',
    labelFr: 'Sales, RevOps, pricing & business development',
    labelEn: 'Sales, RevOps, pricing & business development',
  },
  // ── Finance & risque ──────────────────────────────────────────────────────
  {
    code: 'ACTUARIAL',
    group: 'finance_risque',
    pack: 'generic',
    labelFr: 'Actuariat, pricing, reserving & underwriting',
    labelEn: 'Actuarial, pricing, reserving & underwriting',
  },
  {
    code: 'BANKING_CREDIT_PAYMENTS',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Banque, crédit, paiements & opérations bancaires',
    labelEn: 'Banking, credit, payments & banking operations',
  },
  {
    code: 'FINANCE_FPNA',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Finance, comptabilité, FP&A, contrôle de gestion & consolidation',
    labelEn: 'Finance, accounting, FP&A, management control & consolidation',
  },
  {
    code: 'INSURANCE_CLAIMS',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Assurance métier, sinistres, distribution & opérations',
    labelEn: 'Insurance business, claims, distribution & operations',
  },
  {
    code: 'INTERNAL_AUDIT_CONTROL',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Audit interne, contrôle interne, SOX & assurance',
    labelEn: 'Internal audit, internal control, SOX & assurance',
  },
  {
    code: 'MARKET_FINANCE',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Finance de marché, quant, FO/MO/BO, ALM & trésorerie bancaire',
    labelEn: 'Market finance, quant, FO/MO/BO, ALM & bank treasury',
  },
  {
    code: 'RISK_COMPLIANCE_AML',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Risques, conformité, AML/KYC, réglementaire & modèles',
    labelEn: 'Risk, compliance, AML/KYC, regulatory & models',
  },
  {
    code: 'TREASURY_WC',
    group: 'finance_risque',
    pack: 'finance',
    labelFr: 'Trésorerie, cash, financement & working capital',
    labelEn: 'Treasury, cash, financing & working capital',
  },
  // ── Opérations & supply chain ─────────────────────────────────────────────
  {
    code: 'LOGISTICS_TRANSPORT_OPS',
    group: 'operations_supply',
    pack: 'supply_chain',
    labelFr: 'Logistique, transport, entrepôts & opérations de flux',
    labelEn: 'Logistics, transport, warehousing & flow operations',
  },
  {
    code: 'MANUFACTURING_OPS',
    group: 'operations_supply',
    pack: 'industrial_engineering',
    labelFr: 'Opérations industrielles, performance usine & production',
    labelEn: 'Industrial operations, plant performance & production',
  },
  {
    code: 'PROCESS_EXCELLENCE',
    group: 'operations_supply',
    pack: 'supply_chain',
    labelFr: 'Excellence opérationnelle, processus & Lean',
    labelEn: 'Operational excellence, processes & Lean',
  },
  {
    code: 'PROCUREMENT_SRM',
    group: 'operations_supply',
    pack: 'supply_chain',
    labelFr: 'Achats, sourcing, category management & SRM',
    labelEn: 'Procurement, sourcing, category management & SRM',
  },
  {
    code: 'SUPPLY_CHAIN_SOP',
    group: 'operations_supply',
    pack: 'supply_chain',
    labelFr: 'Supply chain, planning, S&OP & logistique stratégique',
    labelEn: 'Supply chain, planning, S&OP & strategic logistics',
  },
  // ── Ingénierie & industrie ────────────────────────────────────────────────
  {
    code: 'AUTOMATION_ROBOTICS',
    group: 'ingenierie',
    pack: 'industrial_engineering',
    labelFr: 'Automatisme, contrôle-commande, robotique & instrumentation',
    labelEn: 'Automation, control systems, robotics & instrumentation',
  },
  {
    code: 'CAPEX_EPCM',
    group: 'ingenierie',
    pack: 'pmo',
    labelFr: 'CAPEX, EPCM, project controls & grands projets',
    labelEn: 'CAPEX, EPCM, project controls & major projects',
  },
  {
    code: 'CIVIL_CONSTRUCTION_BIM',
    group: 'ingenierie',
    pack: 'generic',
    labelFr: 'Construction, génie civil, MOE/AMO, BIM & infrastructures',
    labelEn: 'Construction, civil engineering, BIM & infrastructure',
  },
  {
    code: 'ELECTRICAL_ELECTRONICS',
    group: 'ingenierie',
    pack: 'industrial_engineering',
    labelFr: 'Ingénierie électrique, électronique, hardware & FPGA',
    labelEn: 'Electrical engineering, electronics, hardware & FPGA',
  },
  {
    code: 'ENERGY_UTILITIES_NUCLEAR',
    group: 'ingenierie',
    pack: 'generic',
    labelFr: 'Énergie, utilities, nucléaire & transition énergétique',
    labelEn: 'Energy, utilities, nuclear & energy transition',
  },
  {
    code: 'INDUSTRIALIZATION_METHODS',
    group: 'ingenierie',
    pack: 'industrial_engineering',
    labelFr: 'Industrialisation, méthodes, process & NPI',
    labelEn: 'Industrialisation, methods, process & NPI',
  },
  {
    code: 'MAINTENANCE_MRO',
    group: 'ingenierie',
    pack: 'industrial_engineering',
    labelFr: 'Maintenance, MRO, fiabilité & asset management',
    labelEn: 'Maintenance, MRO, reliability & asset management',
  },
  {
    code: 'MECHANICAL_ENGINEERING',
    group: 'ingenierie',
    pack: 'industrial_engineering',
    labelFr: 'Ingénierie mécanique, calcul, CAO & essais',
    labelEn: 'Mechanical engineering, simulation, CAD & testing',
  },
  {
    code: 'PROCESS_CHEM_OILGAS',
    group: 'ingenierie',
    pack: 'generic',
    labelFr: 'Procédés, chimie, oil & gas & ingénierie de process',
    labelEn: 'Process, chemicals, oil & gas & process engineering',
  },
  // #3186.5 — pointait sur `industrial_engineering` (bureau d'études) : un
  // cabinet QHSE/environnement pur ne voyait jamais ICPE/CSRD/HSE cités.
  {
    code: 'QUALITY_VALIDATION_HSE',
    group: 'ingenierie',
    pack: 'hse',
    labelFr: 'Qualité, validation, HSE, sûreté & conformité technique',
    labelEn: 'Quality, validation, HSE, safety & technical compliance',
  },
  {
    code: 'SYSTEMS_MBSE',
    group: 'ingenierie',
    pack: 'industrial_engineering',
    labelFr: 'Ingénierie systèmes, MBSE, sûreté & embarqué',
    labelEn: 'Systems engineering, MBSE, safety & embedded',
  },
  // ── Transformation & PMO ──────────────────────────────────────────────────
  {
    code: 'CHANGE_ORG_AGILE',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'Change, organisation, agilité & coaching',
    labelEn: 'Change, organisation, agility & coaching',
  },
  {
    code: 'INNOVATION_RD',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'Innovation, R&D management & open innovation',
    labelEn: 'Innovation, R&D management & open innovation',
  },
  {
    code: 'INTERIM_MANAGEMENT',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'Management de transition & direction opérationnelle temporaire',
    labelEn: 'Interim management & temporary operational leadership',
  },
  {
    code: 'MNA_PMI',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'M&A, due diligence, carve-out & post-merger integration',
    labelEn: 'M&A, due diligence, carve-out & post-merger integration',
  },
  {
    code: 'PMO_PORTFOLIO',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'PMO, portefeuille, programme & gestion de projet',
    labelEn: 'PMO, portfolio, programme & project management',
  },
  {
    code: 'PUBLIC_POLICY_GOV',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'Politiques publiques, économie, réglementation & transformation publique',
    labelEn: 'Public policy, economics, regulation & public transformation',
  },
  {
    code: 'STRATEGY',
    group: 'transformation_pmo',
    pack: 'pmo',
    labelFr: 'Stratégie, operating model & transformation',
    labelEn: 'Strategy, operating model & transformation',
  },
  // ── RH, talent & formation ────────────────────────────────────────────────
  {
    code: 'HRIS_PAYROLL',
    group: 'rh_talent',
    pack: 'rh',
    labelFr: 'SIRH, paie, workforce tech & HR operations',
    labelEn: 'HRIS, payroll, workforce tech & HR operations',
  },
  {
    code: 'HR_TALENT_LEARNING',
    group: 'rh_talent',
    pack: 'rh',
    labelFr: 'RH, talent, recrutement, learning & organisation',
    labelEn: 'HR, talent, recruitment, learning & organisation',
  },
  {
    code: 'LEARNING_EDTECH',
    group: 'rh_talent',
    pack: 'rh',
    labelFr: 'Formation, ingénierie pédagogique, academy & EdTech',
    labelEn: 'Training, instructional design, academy & EdTech',
  },
  // ── Santé & sciences de la vie ────────────────────────────────────────────
  {
    code: 'AGRI_FOOD_RND',
    group: 'sante_sciences',
    pack: 'generic',
    labelFr: 'Agroalimentaire, agronomie, formulation & qualité produit',
    labelEn: 'Agri-food, agronomy, formulation & product quality',
  },
  {
    code: 'HEALTHCARE_OPS',
    group: 'sante_sciences',
    pack: 'generic',
    labelFr: 'Santé, hôpitaux, medtech & opérations de soins',
    labelEn: 'Healthcare, hospitals, medtech & care operations',
  },
  {
    code: 'LIFE_SCIENCES_CLINICAL',
    group: 'sante_sciences',
    pack: 'generic',
    labelFr: 'Clinique, médical, réglementaire, CMC & pharmacovigilance',
    labelEn: 'Clinical, medical, regulatory, CMC & pharmacovigilance',
  },
  {
    code: 'PHARMA_GMP',
    group: 'sante_sciences',
    pack: 'generic',
    labelFr: 'Pharma manufacturing, GMP, CSV, validation & qualité industrielle',
    labelEn: 'Pharma manufacturing, GMP, CSV, validation & industrial quality',
  },
  // ── Corporate & fonctions support ─────────────────────────────────────────
  {
    code: 'COMMUNICATIONS_PA',
    group: 'corporate',
    pack: 'generic',
    labelFr: 'Communication corporate, affaires publiques & relations institutionnelles',
    labelEn: 'Corporate communications, public affairs & institutional relations',
  },
  {
    code: 'ESG_CLIMATE',
    group: 'corporate',
    pack: 'generic',
    labelFr: 'ESG, RSE, climat, CSRD & décarbonation',
    labelEn: 'ESG, CSR, climate, CSRD & decarbonisation',
  },
  {
    code: 'LEGAL_TAX_GOV',
    group: 'corporate',
    pack: 'generic',
    labelFr: 'Juridique, fiscalité, contrats & gouvernance',
    labelEn: 'Legal, tax, contracts & governance',
  },
  {
    code: 'REAL_ESTATE_FM',
    group: 'corporate',
    pack: 'generic',
    labelFr: 'Immobilier, facilities, workplace & asset services',
    labelEn: 'Real estate, facilities, workplace & asset services',
  },
  {
    code: 'SECURITY_SAFETY_BCM',
    group: 'corporate',
    pack: 'generic',
    labelFr: 'Sûreté, sécurité physique, BCM & gestion de crise',
    labelEn: 'Security, physical safety, BCM & crisis management',
  },
  // ── Secteurs spécialisés ──────────────────────────────────────────────────
  {
    code: 'HOSPITALITY_TRAVEL_OPS',
    group: 'secteurs_specialises',
    pack: 'generic',
    labelFr: 'Hospitality, tourisme, travel, revenue management & opérations',
    labelEn: 'Hospitality, tourism, travel, revenue management & operations',
  },
  {
    code: 'LUXURY_RETAIL_MERCH',
    group: 'secteurs_specialises',
    pack: 'generic',
    labelFr: 'Luxe, retail, merchandising, store planning & omnicanal',
    labelEn: 'Luxury, retail, merchandising, store planning & omnichannel',
  },
]

export const CONSULTING_DOMAIN_CODES = CONSULTING_DOMAINS.map(domain => domain.code) as readonly string[]

export const consultingDomainCodeSchema = z.enum(CONSULTING_DOMAIN_CODES as unknown as [string, ...string[]])
export type ConsultingDomainCode = z.infer<typeof consultingDomainCodeSchema>

export const CONSULTING_DOMAIN_BY_CODE: ReadonlyMap<string, ConsultingDomain> = new Map(
  CONSULTING_DOMAINS.map(domain => [domain.code, domain]),
)

/**
 * L'ordre de départage du pack dominant. VOLONTAIREMENT une copie locale de
 * `OFFER_DOMAINS` (onboarding.ts) — l'importer créerait un cycle de modules à
 * l'exécution (onboarding importe déjà ce fichier). Un test d'égalité profonde
 * (`consulting-domains.test.ts`) empêche les deux listes de diverger.
 */
const PACK_PRIORITY = [
  'esn_it',
  'finance',
  'supply_chain',
  'product_design',
  'pmo',
  'rh',
  'generic',
  'industrial_engineering',
  // #2633.1 a ajouté `ia` EN FIN de `OFFER_DOMAINS` — cette copie locale ne
  // l'avait jamais reçu. Trouvé en vérifiant #2274.36 : un portefeuille ne
  // citant QUE des domaines IA (ex. `AI_ML_GENAI`) résolvait `null` au lieu de
  // `ia`, alors que le miroir Python (`portfolio.py::PACK_PRIORITY`) l'avait
  // déjà. `ia` étant le DERNIER de `OFFER_DOMAINS`, aucune paire de tie-break
  // ne l'exerçait en position gagnante — le trou passait inaperçu des tests.
  'ia',
  // #3186.3 / #3186.5 — ajoutés EN FIN, même raison que `ia`.
  'cyber',
  'hse',
] as const

/**
 * Le pack d'offre DOMINANT d'un portefeuille de domaines — déterministe :
 * le pack le plus représenté ; à égalité, le premier dans l'ordre de
 * `OFFER_DOMAINS`. Un code inconnu (skew de déploiement) est IGNORÉ, jamais
 * deviné. Portefeuille vide ou entièrement inconnu → `null` (l'appelant garde
 * le comportement historique).
 *
 * ⚠️ Miroir Python : `offer_domains/portfolio.py::dominant_pack` — même règle,
 * mêmes égalités, verrouillé par le test de parité.
 */
export function dominantOfferDomain(codes: readonly string[]): OfferDomain | null {
  const counts = new Map<string, number>()
  for (const code of codes) {
    const domain = CONSULTING_DOMAIN_BY_CODE.get(code)
    if (!domain) continue
    counts.set(domain.pack, (counts.get(domain.pack) ?? 0) + 1)
  }
  let best: OfferDomain | null = null
  let bestCount = 0
  for (const pack of PACK_PRIORITY) {
    const count = counts.get(pack) ?? 0
    if (count > bestCount) {
      best = pack
      bestCount = count
    }
  }
  return best
}

/** Les libellés FRANÇAIS d'un portefeuille — ce que le prisme de prompts énumère. */
export function consultingDomainNamesFr(codes: readonly string[]): string[] {
  const names: string[] = []
  for (const code of codes) {
    const domain = CONSULTING_DOMAIN_BY_CODE.get(code)
    if (domain) names.push(domain.labelFr)
  }
  return names
}
