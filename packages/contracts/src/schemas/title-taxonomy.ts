import type { OfferDomain } from './onboarding.js'
import type { ContactFamily } from './contact.js'

/**
 * Le référentiel d'intitulés de poste — 298 titres, 307 couples titre×famille.
 *
 * Il vient du corpus « Les 250 intitulés de poste à cibler » de juin 2026, dont
 * l'extraction rend 298 chaînes uniques : le document porte des variantes et des
 * doublons entre familles. Le seed le dit lui-même, et c'est la première chose à
 * retenir : **aucun de ces chiffres n'est une promesse de couverture.**
 *
 * ⚠️ **Ce référentiel NORMALISE, il ne CIBLE pas.** L'interdit du paquet de
 * récupération — « listes de titres comme cibles automatiques » — est reconduit :
 * la priorité d'un contact dépend du domaine vendu, du projet, de l'entité, de la
 * relation, du signal et de la preuve. Un titre présent dans cette table ne vaut
 * pas « à contacter », et un titre absent ne vaut pas « sans intérêt ». La table
 * répond à UNE question : « ce libellé est-il un intitulé de poste connu, et de
 * quelle famille métier ? »
 *
 * ## Les neuf titres ambigus sont le cœur du sujet
 *
 * Neuf libellés apparaissent sous DEUX familles — « Directeur technique » est
 * `industrial_operations` **et** `tech_engineering_it`, « Scrum Master » est
 * `project_delivery` **et** `tech_engineering_it`. Ce n'est pas un défaut
 * d'extraction : c'est le fait que le même mot désigne deux métiers selon ce que
 * vend celui qui regarde. D'où la règle de résolution, qui est la raison d'être
 * du « domain-aware » : **le domaine du VENDEUR départage**. Sans domaine, ou
 * avec un domaine étranger aux deux candidates, le titre reste ambigu et la
 * fonction ne rend AUCUNE famille — jamais la première de la liste, qui n'est
 * qu'un ordre d'extraction.
 */

/** Les dix familles du corpus d'origine. Ce ne sont PAS les onze familles du
 *  produit : le corpus classe par métier, le produit par cible commerciale. */
export const LEGACY_TITLE_FAMILIES = [
  'direction_strategy',
  'tech_engineering_it',
  'project_delivery',
  'business_functions',
  'data_ai',
  'industrial_operations',
  'sales_marketing',
  'security_compliance',
  'change_learning',
  'finance_legal_admin',
] as const
export type LegacyTitleFamily = (typeof LEGACY_TITLE_FAMILIES)[number]

/**
 * Le domaine d'offre auquel chaque famille du corpus se rattache — c'est lui qui
 * départage un titre ambigu.
 *
 * Cinq familles n'ont AUCUN domaine d'offre en face, et c'est écrit plutôt que
 * comblé : `data_ai` et `security_compliance` n'ont pas de domaine à eux dans
 * `OFFER_DOMAINS` (une ESN data ou cyber se déclare `esn_it`), et
 * `direction_strategy` / `business_functions` / `sales_marketing` sont des
 * fonctions transverses que personne ne vend en tant que telles. Leur rattacher
 * un domaine par ressemblance ferait départager un titre ambigu par une affinité
 * inventée.
 */
export const LEGACY_FAMILY_OFFER_DOMAIN: Readonly<Record<LegacyTitleFamily, OfferDomain | null>> = {
  direction_strategy: null,
  tech_engineering_it: 'esn_it',
  project_delivery: 'pmo',
  business_functions: null,
  data_ai: null,
  industrial_operations: 'industrial_engineering',
  sales_marketing: null,
  security_compliance: null,
  change_learning: 'rh',
  finance_legal_admin: 'finance',
}

/**
 * La famille PRODUIT qu'une famille de corpus permet de conclure, quand les
 * règles du classifieur n'ont rien trouvé.
 *
 * Cinq familles rendent `null`, et cette liste MESURE l'informatique-centrisme
 * des onze familles du produit : 107 titres du corpus sur 307 — tout
 * l'industriel, tout le commercial, la conduite du changement et les fonctions
 * transverses — n'ont pas de famille produit où atterrir. C'est un fait sur le
 * produit, pas sur le corpus, et il est écrit ici pour être relu le jour où les
 * onze familles s'élargiront.
 *
 * `data_ai` rend `null` pour une raison différente et plus stricte : le produit
 * distingue `Data` de `IA`, le corpus non. Choisir l'une des deux serait
 * affirmer une chose que la donnée ne dit pas.
 */
export const LEGACY_FAMILY_CONTACT_FAMILY: Readonly<Record<LegacyTitleFamily, ContactFamily | null>> = {
  direction_strategy: 'C-Level',
  tech_engineering_it: 'IT',
  project_delivery: 'PMO',
  business_functions: null,
  data_ai: null,
  industrial_operations: null,
  sales_marketing: null,
  security_compliance: 'Cyber',
  change_learning: null,
  finance_legal_admin: 'Finance',
}

export type TitleTaxonomyEntry = {
  /** Le libellé tel qu'il est écrit dans le corpus — c'est la forme canonique. */
  readonly canonical: string
  /** Une ou deux familles de corpus. Deux ⇒ le titre est ambigu. */
  readonly families: readonly LegacyTitleFamily[]
}

/** Déaccentue, minuscule, compacte les espaces — la même normalisation que le
 *  classifieur de contacts, pour que deux modules ne divergent pas sur la forme
 *  d'une clé. */
export function normalizeTitleKey(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** 298 clés normalisées → forme canonique + familles de corpus. */
export const TITLE_TAXONOMY: ReadonlyMap<string, TitleTaxonomyEntry> = new Map<string, TitleTaxonomyEntry>([
  ['chief executive officer', { canonical: 'Chief Executive Officer', families: ['direction_strategy'] }],
  ['ceo', { canonical: 'CEO', families: ['direction_strategy'] }],
  ['cto', { canonical: 'CTO', families: ['tech_engineering_it'] }],
  ['president', { canonical: 'Président', families: ['direction_strategy'] }],
  ['vp engineering', { canonical: 'VP Engineering', families: ['tech_engineering_it'] }],
  ['managing director', { canonical: 'Managing Director', families: ['direction_strategy'] }],
  ['head of engineering', { canonical: 'Head of Engineering', families: ['tech_engineering_it'] }],
  ['directeur general', { canonical: 'Directeur Général', families: ['direction_strategy'] }],
  [
    'directeur technique',
    { canonical: 'Directeur technique', families: ['tech_engineering_it', 'industrial_operations'] },
  ],
  [
    'directeur des operations',
    { canonical: 'Directeur des Opérations', families: ['direction_strategy', 'industrial_operations'] },
  ],
  ['directeur des etudes', { canonical: 'Directeur des études', families: ['tech_engineering_it'] }],
  ['coo', { canonical: 'COO', families: ['direction_strategy'] }],
  ['head of architecture', { canonical: 'Head of Architecture', families: ['tech_engineering_it'] }],
  ['chief strategy officer', { canonical: 'Chief Strategy Officer', families: ['direction_strategy'] }],
  ['responsable technique', { canonical: 'Responsable technique', families: ['tech_engineering_it'] }],
  ["directeur d'organisation", { canonical: "Directeur d'Organisation", families: ['direction_strategy'] }],
  ['architecte logiciel', { canonical: 'Architecte logiciel', families: ['tech_engineering_it'] }],
  ['head of program', { canonical: 'Head of Program', families: ['direction_strategy'] }],
  ['architecte cloud', { canonical: 'Architecte cloud', families: ['tech_engineering_it'] }],
  ['directeur de programme', { canonical: 'Directeur de programme', families: ['direction_strategy'] }],
  ['architecte applicatif', { canonical: 'Architecte applicatif', families: ['tech_engineering_it'] }],
  ['directeur de departement', { canonical: 'Directeur de département', families: ['direction_strategy'] }],
  ['architecte data', { canonical: 'Architecte data', families: ['tech_engineering_it'] }],
  ['directeur de division', { canonical: 'Directeur de division', families: ['direction_strategy'] }],
  ['architecte cybersecurite', { canonical: 'Architecte cybersécurité', families: ['tech_engineering_it'] }],
  ["directeur d'entite", { canonical: "Directeur d'entité", families: ['direction_strategy'] }],
  ['engineering manager', { canonical: 'Engineering Manager', families: ['tech_engineering_it'] }],
  ['program manager', { canonical: 'Program Manager', families: ['direction_strategy'] }],
  ['tech lead', { canonical: 'Tech Lead', families: ['tech_engineering_it'] }],
  ['program delivery manager', { canonical: 'Program Delivery Manager', families: ['direction_strategy'] }],
  ['lead developer', { canonical: 'Lead Developer', families: ['tech_engineering_it'] }],
  ['responsable de programme', { canonical: 'Responsable de programme', families: ['direction_strategy'] }],
  ['developpeur fullstack', { canonical: 'Développeur fullstack', families: ['tech_engineering_it'] }],
  [
    'responsable organisation',
    { canonical: 'Responsable organisation', families: ['direction_strategy', 'business_functions'] },
  ],
  ['developpeur backend', { canonical: 'Développeur backend', families: ['tech_engineering_it'] }],
  ['pm transverse', { canonical: 'PM transverse', families: ['direction_strategy'] }],
  ['developpeur frontend', { canonical: 'Développeur frontend', families: ['tech_engineering_it'] }],
  ['coordinateur de programme', { canonical: 'Coordinateur de programme', families: ['direction_strategy'] }],
  ['devops engineer', { canonical: 'DevOps Engineer', families: ['tech_engineering_it'] }],
  [
    'consultant en strategie operationnelle',
    { canonical: 'Consultant en stratégie opérationnelle', families: ['direction_strategy'] },
  ],
  ['sre', { canonical: 'SRE', families: ['tech_engineering_it'] }],
  ['vice president', { canonical: 'Vice President', families: ['direction_strategy'] }],
  ['ingenieur systeme', { canonical: 'Ingénieur système', families: ['tech_engineering_it'] }],
  ['cfo / directeur financier', { canonical: 'CFO / Directeur Financier', families: ['direction_strategy'] }],
  ['ingenieur reseau', { canonical: 'Ingénieur réseau', families: ['tech_engineering_it'] }],
  ['directeur de cabinet', { canonical: 'Directeur de Cabinet', families: ['direction_strategy'] }],
  [
    'ingenieur cybersecurite',
    { canonical: 'Ingénieur cybersécurité', families: ['tech_engineering_it', 'security_compliance'] },
  ],
  ['directeur pays', { canonical: 'Directeur Pays', families: ['direction_strategy'] }],
  ['responsable infrastructure', { canonical: 'Responsable infrastructure', families: ['tech_engineering_it'] }],
  ['directeur regional', { canonical: 'Directeur Régional', families: ['direction_strategy'] }],
  ['responsable hebergement', { canonical: 'Responsable hébergement', families: ['tech_engineering_it'] }],
  ['chief digital officer', { canonical: 'Chief Digital Officer', families: ['direction_strategy'] }],
  ['consultant technique', { canonical: 'Consultant technique', families: ['tech_engineering_it'] }],
  ["directeur de l'innovation", { canonical: "Directeur de l'Innovation", families: ['direction_strategy'] }],
  ['consultant architecture', { canonical: 'Consultant architecture', families: ['tech_engineering_it'] }],
  ['responsable strategie digitale', { canonical: 'Responsable Stratégie Digitale', families: ['direction_strategy'] }],
  ['administrateur systeme', { canonical: 'Administrateur système', families: ['tech_engineering_it'] }],
  ['directeur de business unit', { canonical: 'Directeur de Business Unit', families: ['direction_strategy'] }],
  [
    'administrateur base de donnees',
    { canonical: 'Administrateur base de données', families: ['tech_engineering_it'] },
  ],
  ['directeur du developpement', { canonical: 'Directeur du Développement', families: ['direction_strategy'] }],
  ['expert technique', { canonical: 'Expert technique', families: ['tech_engineering_it'] }],
  ['directeur de la performance', { canonical: 'Directeur de la Performance', families: ['direction_strategy'] }],
  ['consultant devops', { canonical: 'Consultant DevOps', families: ['tech_engineering_it'] }],
  ['scrum master', { canonical: 'Scrum Master', families: ['tech_engineering_it', 'project_delivery'] }],
  ['cloud architect', { canonical: 'Cloud Architect', families: ['tech_engineering_it'] }],
  ['head of projects', { canonical: 'Head of Projects', families: ['project_delivery'] }],
  ['ingenieur devsecops', { canonical: 'Ingénieur DevSecOps', families: ['tech_engineering_it'] }],
  ['directeur des projets', { canonical: 'Directeur des projets', families: ['project_delivery'] }],
  ['responsable qa', { canonical: 'Responsable QA', families: ['tech_engineering_it'] }],
  ['directeur pmo', { canonical: 'Directeur PMO', families: ['project_delivery'] }],
  ['testeur / qa engineer', { canonical: 'Testeur / QA Engineer', families: ['tech_engineering_it'] }],
  [
    'responsable portefeuille projets',
    { canonical: 'Responsable portefeuille projets', families: ['project_delivery'] },
  ],
  [
    'directeur innovation technique',
    { canonical: 'Directeur Innovation Technique', families: ['tech_engineering_it'] },
  ],
  ['project portfolio manager', { canonical: 'Project Portfolio Manager', families: ['project_delivery'] }],
  ['ingenieur blockchain', { canonical: 'Ingénieur Blockchain', families: ['tech_engineering_it'] }],
  ['responsable pilotage projets', { canonical: 'Responsable pilotage projets', families: ['project_delivery'] }],
  ['mobile developer', { canonical: 'Mobile Developer', families: ['tech_engineering_it'] }],
  ['delivery director', { canonical: 'Delivery Director', families: ['project_delivery'] }],
  ['responsable api', { canonical: 'Responsable API', families: ['tech_engineering_it'] }],
  ['delivery manager', { canonical: 'Delivery Manager', families: ['project_delivery'] }],
  ['api product manager', { canonical: 'API Product Manager', families: ['tech_engineering_it'] }],
  ['chef de projet transverse', { canonical: 'Chef de projet transverse', families: ['project_delivery'] }],
  ['solutions architect', { canonical: 'Solutions Architect', families: ['tech_engineering_it'] }],
  ['chef de projet moa', { canonical: 'Chef de projet MOA', families: ['project_delivery'] }],
  ['systems architect', { canonical: 'Systems Architect', families: ['tech_engineering_it'] }],
  ['chef de projet amoa', { canonical: 'Chef de projet AMOA', families: ['project_delivery'] }],
  ['ingenieur iot', { canonical: 'Ingénieur IoT', families: ['tech_engineering_it'] }],
  ['chef de projet fonctionnel', { canonical: 'Chef de projet fonctionnel', families: ['project_delivery'] }],
  ['responsable it operations', { canonical: 'Responsable IT Operations', families: ['tech_engineering_it'] }],
  ['consultant amoa', { canonical: 'Consultant AMOA', families: ['project_delivery'] }],
  ['platform engineer', { canonical: 'Platform Engineer', families: ['tech_engineering_it'] }],
  ['consultant moa', { canonical: 'Consultant MOA', families: ['project_delivery'] }],
  ['consultant fonctionnel senior', { canonical: 'Consultant fonctionnel senior', families: ['project_delivery'] }],
  ['business analyst', { canonical: 'Business Analyst', families: ['project_delivery'] }],
  ['analyste metier', { canonical: 'Analyste métier', families: ['project_delivery'] }],
  ['directeur metier', { canonical: 'Directeur métier', families: ['business_functions'] }],
  ['product owner', { canonical: 'Product Owner', families: ['project_delivery'] }],
  ['responsable unite metier', { canonical: 'Responsable unité métier', families: ['business_functions'] }],
  ['proxy product owner', { canonical: 'Proxy Product Owner', families: ['project_delivery'] }],
  ["responsable d'activite", { canonical: "Responsable d'activité", families: ['business_functions'] }],
  ['pmo', { canonical: 'PMO', families: ['project_delivery'] }],
  ['head of operations', { canonical: 'Head of Operations', families: ['business_functions'] }],
  ['project manager', { canonical: 'Project Manager', families: ['project_delivery'] }],
  ['process owner', { canonical: 'Process Owner', families: ['business_functions'] }],
  ['coordinateur projet', { canonical: 'Coordinateur projet', families: ['project_delivery'] }],
  ['business unit manager', { canonical: 'Business Unit Manager', families: ['business_functions'] }],
  ['consultant en pilotage', { canonical: 'Consultant en pilotage', families: ['project_delivery'] }],
  ['responsable processus', { canonical: 'Responsable processus', families: ['business_functions'] }],
  ['planificateur projet', { canonical: 'Planificateur projet', families: ['project_delivery'] }],
  ['change manager', { canonical: 'Change Manager', families: ['project_delivery', 'change_learning'] }],
  ['coordinateur metier', { canonical: 'Coordinateur métier', families: ['business_functions'] }],
  ['consultant organisation', { canonical: 'Consultant organisation', families: ['project_delivery'] }],
  ['referent metier', { canonical: 'Référent métier', families: ['business_functions'] }],
  ['chef de projet digital', { canonical: 'Chef de projet Digital', families: ['project_delivery'] }],
  ['key user', { canonical: 'Key User', families: ['business_functions'] }],
  ['chef de projet erp', { canonical: 'Chef de projet ERP', families: ['project_delivery'] }],
  ['responsable fonctionnel', { canonical: 'Responsable fonctionnel', families: ['business_functions'] }],
  ['chef de projet crm', { canonical: 'Chef de projet CRM', families: ['project_delivery'] }],
  ['consultant metier', { canonical: 'Consultant métier', families: ['business_functions'] }],
  ['chef de projet si', { canonical: 'Chef de projet SI', families: ['project_delivery'] }],
  ['consultant processus metier', { canonical: 'Consultant processus métier', families: ['business_functions'] }],
  ['responsable des methodes', { canonical: 'Responsable des Méthodes', families: ['project_delivery'] }],
  ['consultant qualite', { canonical: 'Consultant qualité', families: ['business_functions'] }],
  ['responsable agile', { canonical: 'Responsable Agile', families: ['project_delivery'] }],
  ['directeur des achats', { canonical: 'Directeur des Achats', families: ['business_functions'] }],
  ['agile coach', { canonical: 'Agile Coach', families: ['project_delivery'] }],
  ['chief procurement officer', { canonical: 'Chief Procurement Officer', families: ['business_functions'] }],
  ['directeur supply chain', { canonical: 'Directeur Supply Chain', families: ['business_functions'] }],
  ['project lead', { canonical: 'Project Lead', families: ['project_delivery'] }],
  ['directeur logistique', { canonical: 'Directeur Logistique', families: ['business_functions'] }],
  ['responsable release', { canonical: 'Responsable Release', families: ['project_delivery'] }],
  [
    'directeur des ressources humaines',
    { canonical: 'Directeur des Ressources Humaines', families: ['business_functions'] },
  ],
  ['release manager', { canonical: 'Release Manager', families: ['project_delivery'] }],
  ['drh', { canonical: 'DRH', families: ['business_functions'] }],
  ['solution architect', { canonical: 'Solution Architect', families: ['project_delivery'] }],
  ['chief people officer', { canonical: 'Chief People Officer', families: ['business_functions'] }],
  [
    'controleur de gestion',
    { canonical: 'Contrôleur de Gestion', families: ['business_functions', 'finance_legal_admin'] },
  ],
  [
    'responsable controle interne',
    { canonical: 'Responsable Contrôle Interne', families: ['business_functions', 'finance_legal_admin'] },
  ],
  ['chief data officer', { canonical: 'Chief Data Officer', families: ['data_ai'] }],
  [
    'responsable conformite',
    { canonical: 'Responsable Conformité', families: ['business_functions', 'security_compliance'] },
  ],
  ['cdo', { canonical: 'CDO', families: ['data_ai'] }],
  ['responsable juridique', { canonical: 'Responsable Juridique', families: ['business_functions'] }],
  ['directeur data', { canonical: 'Directeur Data', families: ['data_ai'] }],
  ['directeur r&d', { canonical: 'Directeur R&D', families: ['business_functions'] }],
  ['head of data', { canonical: 'Head of Data', families: ['data_ai'] }],
  [
    'responsable amelioration continue',
    { canonical: 'Responsable Amélioration Continue', families: ['business_functions'] },
  ],
  ['responsable gouvernance data', { canonical: 'Responsable gouvernance data', families: ['data_ai'] }],
  ['lean manager', { canonical: 'Lean Manager', families: ['business_functions'] }],
  ['responsable master data', { canonical: 'Responsable Master Data', families: ['data_ai'] }],
  [
    'responsable excellence operationnelle',
    { canonical: 'Responsable Excellence Opérationnelle', families: ['business_functions'] },
  ],
  ['data manager', { canonical: 'Data Manager', families: ['data_ai'] }],
  ['dataops manager', { canonical: 'DataOps Manager', families: ['data_ai'] }],
  ['data product manager', { canonical: 'Data Product Manager', families: ['data_ai'] }],
  ['data owner', { canonical: 'Data Owner', families: ['data_ai'] }],
  ['directeur industriel', { canonical: 'Directeur industriel', families: ['industrial_operations'] }],
  ['data architect', { canonical: 'Data Architect', families: ['data_ai'] }],
  ['directeur de site', { canonical: 'Directeur de site', families: ['industrial_operations'] }],
  ['lead data engineer', { canonical: 'Lead Data Engineer', families: ['data_ai'] }],
  ["directeur d'usine", { canonical: "Directeur d'usine", families: ['industrial_operations'] }],
  ['data engineer', { canonical: 'Data Engineer', families: ['data_ai'] }],
  ['data analyst', { canonical: 'Data Analyst', families: ['data_ai'] }],
  ['responsable production', { canonical: 'Responsable production', families: ['industrial_operations'] }],
  ['iam', { canonical: 'IAM', families: ['data_ai'] }],
  ['responsable maintenance', { canonical: 'Responsable maintenance', families: ['industrial_operations'] }],
  ['senior data analyst', { canonical: 'Senior Data Analyst', families: ['data_ai'] }],
  ["responsable d'exploitation", { canonical: "Responsable d'exploitation", families: ['industrial_operations'] }],
  ['bi manager', { canonical: 'BI Manager', families: ['data_ai'] }],
  ['responsable methodes', { canonical: 'Responsable méthodes', families: ['industrial_operations'] }],
  ['bi analyst', { canonical: 'BI Analyst', families: ['data_ai'] }],
  [
    'responsable qualite industrielle',
    { canonical: 'Responsable qualité industrielle', families: ['industrial_operations'] },
  ],
  ['consultant bi', { canonical: 'Consultant BI', families: ['data_ai'] }],
  ['ingenieur travaux', { canonical: 'Ingénieur travaux', families: ['industrial_operations'] }],
  ['expert dataviz', { canonical: 'Expert Dataviz', families: ['data_ai'] }],
  ['ingenieur methodes', { canonical: 'Ingénieur méthodes', families: ['industrial_operations'] }],
  ['data scientist', { canonical: 'Data Scientist', families: ['data_ai'] }],
  ['ingenieur process', { canonical: 'Ingénieur process', families: ['industrial_operations'] }],
  ['ml engineer', { canonical: 'ML Engineer', families: ['data_ai'] }],
  ['ingenieur qualite', { canonical: 'Ingénieur qualité', families: ['industrial_operations'] }],
  ['ai engineer', { canonical: 'AI Engineer', families: ['data_ai'] }],
  ['ingenieur production', { canonical: 'Ingénieur production', families: ['industrial_operations'] }],
  ['data steward', { canonical: 'Data Steward', families: ['data_ai'] }],
  ['ingenieur maintenance', { canonical: 'Ingénieur maintenance', families: ['industrial_operations'] }],
  ['data quality manager', { canonical: 'Data Quality Manager', families: ['data_ai'] }],
  ['responsable chantier', { canonical: 'Responsable chantier', families: ['industrial_operations'] }],
  ['ingenieur big data', { canonical: 'Ingénieur Big Data', families: ['data_ai'] }],
  ['chef de chantier', { canonical: 'Chef de chantier', families: ['industrial_operations'] }],
  ['ingenieur ia', { canonical: 'Ingénieur IA', families: ['data_ai'] }],
  ['conducteur de travaux', { canonical: 'Conducteur de travaux', families: ['industrial_operations'] }],
  ['head of ai', { canonical: 'Head of AI', families: ['data_ai'] }],
  ["charge d'affaires technique", { canonical: "Chargé d'affaires technique", families: ['industrial_operations'] }],
  ['directeur intelligence artificielle', { canonical: 'Directeur Intelligence Artificielle', families: ['data_ai'] }],
  ['coordinateur technique', { canonical: 'Coordinateur technique', families: ['industrial_operations'] }],
  ['responsable analytics', { canonical: 'Responsable Analytics', families: ['data_ai'] }],
  ['superviseur', { canonical: 'Superviseur', families: ['industrial_operations'] }],
  ['analytics manager', { canonical: 'Analytics Manager', families: ['data_ai'] }],
  ['technicien industrialisation', { canonical: 'Technicien industrialisation', families: ['industrial_operations'] }],
  ['data governance lead', { canonical: 'Data Governance Lead', families: ['data_ai'] }],
  ['responsable hse', { canonical: 'Responsable HSE', families: ['industrial_operations'] }],
  ['responsable bi & reporting', { canonical: 'Responsable BI & Reporting', families: ['data_ai'] }],
  ['architecte solutions bi', { canonical: 'Architecte Solutions BI', families: ['data_ai'] }],
  ['plant manager', { canonical: 'Plant Manager', families: ['industrial_operations'] }],
  ['etl developer', { canonical: 'ETL Developer', families: ['data_ai'] }],
  [
    'responsable lean manufacturing',
    { canonical: 'Responsable Lean Manufacturing', families: ['industrial_operations'] },
  ],
  ['nlp engineer', { canonical: 'NLP Engineer', families: ['data_ai'] }],
  ['responsable automation', { canonical: 'Responsable Automation', families: ['industrial_operations'] }],
  ['computer vision engineer', { canonical: 'Computer Vision Engineer', families: ['data_ai'] }],
  ['ingenieur automatisme', { canonical: 'Ingénieur Automatisme', families: ['industrial_operations'] }],
  ['head of analytics', { canonical: 'Head of Analytics', families: ['data_ai'] }],
  ['ingenieur robotique', { canonical: 'Ingénieur Robotique', families: ['industrial_operations'] }],
  ['consultant data science', { canonical: 'Consultant Data Science', families: ['data_ai'] }],
  ["responsable bureau d'etudes", { canonical: "Responsable Bureau d'Études", families: ['industrial_operations'] }],
  ['machine learning ops', { canonical: 'Machine Learning Ops', families: ['data_ai'] }],
  ['ingenieur r&d', { canonical: 'Ingénieur R&D', families: ['industrial_operations'] }],
  ['mlops engineer', { canonical: 'MLOps Engineer', families: ['data_ai'] }],
  ['responsable supply chain', { canonical: 'Responsable Supply Chain', families: ['industrial_operations'] }],
  ['responsable data lab', { canonical: 'Responsable Data Lab', families: ['data_ai'] }],
  ['responsable logistique', { canonical: 'Responsable Logistique', families: ['industrial_operations'] }],
  ['responsable planification', { canonical: 'Responsable Planification', families: ['industrial_operations'] }],
  ['directeur commercial', { canonical: 'Directeur Commercial', families: ['sales_marketing'] }],
  ['directeur des ventes', { canonical: 'Directeur des Ventes', families: ['sales_marketing'] }],
  ['directeur marketing', { canonical: 'Directeur Marketing', families: ['sales_marketing'] }],
  ['chief marketing officer', { canonical: 'Chief Marketing Officer', families: ['sales_marketing'] }],
  ['rssi', { canonical: 'RSSI', families: ['security_compliance'] }],
  ['cmo', { canonical: 'CMO', families: ['sales_marketing'] }],
  [
    'responsable securite informatique',
    { canonical: 'Responsable sécurité informatique', families: ['security_compliance'] },
  ],
  ['chief revenue officer', { canonical: 'Chief Revenue Officer', families: ['sales_marketing'] }],
  ['cro', { canonical: 'CRO', families: ['sales_marketing'] }],
  [
    'responsable grc (governance, risk & compliance)',
    { canonical: 'Responsable GRC (Governance, Risk & Compliance)', families: ['security_compliance'] },
  ],
  ['vp sales', { canonical: 'VP Sales', families: ['sales_marketing'] }],
  ['data protection officer (dpo)', { canonical: 'Data Protection Officer (DPO)', families: ['security_compliance'] }],
  ['business developer', { canonical: 'Business Developer', families: ['sales_marketing'] }],
  ['responsable rgpd', { canonical: 'Responsable RGPD', families: ['security_compliance'] }],
  ['account executive', { canonical: 'Account Executive', families: ['sales_marketing'] }],
  ['consultant cybersecurite', { canonical: 'Consultant cybersécurité', families: ['security_compliance'] }],
  ['account manager', { canonical: 'Account Manager', families: ['sales_marketing'] }],
  ['analyste soc', { canonical: 'Analyste SOC', families: ['security_compliance'] }],
  ['customer success manager', { canonical: 'Customer Success Manager', families: ['sales_marketing'] }],
  ['analyste securite', { canonical: 'Analyste sécurité', families: ['security_compliance'] }],
  ['responsable grands comptes', { canonical: 'Responsable Grands Comptes', families: ['sales_marketing'] }],
  [
    'responsable developpement commercial',
    { canonical: 'Responsable Développement Commercial', families: ['sales_marketing'] },
  ],
  ['auditeur securite', { canonical: 'Auditeur sécurité', families: ['security_compliance'] }],
  ['brand manager', { canonical: 'Brand Manager', families: ['sales_marketing'] }],
  ['ciso', { canonical: 'CISO', families: ['security_compliance'] }],
  ['product marketing manager', { canonical: 'Product Marketing Manager', families: ['sales_marketing'] }],
  ['security architect', { canonical: 'Security Architect', families: ['security_compliance'] }],
  ['growth manager', { canonical: 'Growth Manager', families: ['sales_marketing'] }],
  ['pentest engineer', { canonical: 'Pentest Engineer', families: ['security_compliance'] }],
  ['responsable marketing digital', { canonical: 'Responsable Marketing Digital', families: ['sales_marketing'] }],
  ['ethical hacker', { canonical: 'Ethical Hacker', families: ['security_compliance'] }],
  ['directeur e-commerce', { canonical: 'Directeur e-Commerce', families: ['sales_marketing'] }],
  ['security operations manager', { canonical: 'Security Operations Manager', families: ['security_compliance'] }],
  ['chef de produit', { canonical: 'Chef de Produit', families: ['sales_marketing'] }],
  ['forensic analyst', { canonical: 'Forensic Analyst', families: ['security_compliance'] }],
  ['chef de marche', { canonical: 'Chef de Marché', families: ['sales_marketing'] }],
  ['threat intelligence analyst', { canonical: 'Threat Intelligence Analyst', families: ['security_compliance'] }],
  ['responsable acquisition', { canonical: 'Responsable Acquisition', families: ['sales_marketing'] }],
  [
    'responsable de la resilience informatique',
    { canonical: 'Responsable de la Résilience Informatique', families: ['security_compliance'] },
  ],
  ['responsable crm', { canonical: 'Responsable CRM', families: ['sales_marketing'] }],
  ['responsable des risques it', { canonical: 'Responsable des Risques IT', families: ['security_compliance'] }],
  ['responsable experience client', { canonical: 'Responsable Expérience Client', families: ['sales_marketing'] }],
  ['consultant securite des si', { canonical: 'Consultant Sécurité des SI', families: ['security_compliance'] }],
  ['ingenieur iam', { canonical: 'Ingénieur IAM', families: ['security_compliance'] }],
  ['ingenieur pki', { canonical: 'Ingénieur PKI', families: ['security_compliance'] }],
  [
    "responsable continuite d'activite",
    { canonical: "Responsable Continuité d'Activité", families: ['security_compliance'] },
  ],
  ['responsable accompagnement', { canonical: 'Responsable accompagnement', families: ['change_learning'] }],
  [
    'consultant conduite du changement',
    { canonical: 'Consultant conduite du changement', families: ['change_learning'] },
  ],
  ['formateur interne', { canonical: 'Formateur interne', families: ['change_learning'] }],
  [
    'responsable knowledge management',
    { canonical: 'Responsable knowledge management', families: ['change_learning'] },
  ],
  ['coach agile', { canonical: 'Coach agile', families: ['change_learning'] }],
  ['chief learning officer', { canonical: 'Chief Learning Officer', families: ['change_learning'] }],
  ['learning & development manager', { canonical: 'Learning & Development Manager', families: ['change_learning'] }],
  ['digital adoption manager', { canonical: 'Digital Adoption Manager', families: ['change_learning'] }],
  [
    'responsable engagement collaborateur',
    { canonical: 'Responsable Engagement Collaborateur', families: ['change_learning'] },
  ],
  ['ingenierie pedagogique', { canonical: 'Ingénierie Pédagogique', families: ['change_learning'] }],
  ['digital learning expert', { canonical: 'Digital Learning Expert', families: ['change_learning'] }],
  [
    'responsable experience collaborateur',
    { canonical: 'Responsable Experience Collaborateur', families: ['change_learning'] },
  ],
  ["directeur de l'innovation rh", { canonical: "Directeur de l'Innovation RH", families: ['change_learning'] }],
  [
    'responsable gestion des competences',
    { canonical: 'Responsable Gestion des Compétences', families: ['change_learning'] },
  ],
  ['culture manager', { canonical: 'Culture Manager', families: ['change_learning'] }],
  ['responsable developpement rh', { canonical: 'Responsable Développement RH', families: ['change_learning'] }],
  ['knowledge manager', { canonical: 'Knowledge Manager', families: ['change_learning'] }],
  ['community manager interne', { canonical: 'Community Manager Interne', families: ['change_learning'] }],
  ['directeur financier', { canonical: 'Directeur Financier', families: ['finance_legal_admin'] }],
  ['cfo', { canonical: 'CFO', families: ['finance_legal_admin'] }],
  ['financial controller', { canonical: 'Financial Controller', families: ['finance_legal_admin'] }],
  ['directeur comptable', { canonical: 'Directeur Comptable', families: ['finance_legal_admin'] }],
  ['responsable tresorerie', { canonical: 'Responsable Trésorerie', families: ['finance_legal_admin'] }],
  ['credit manager', { canonical: 'Credit Manager', families: ['finance_legal_admin'] }],
  ['directeur juridique', { canonical: 'Directeur Juridique', families: ['finance_legal_admin'] }],
  ["juriste d'entreprise", { canonical: "Juriste d'Entreprise", families: ['finance_legal_admin'] }],
  ['compliance officer', { canonical: 'Compliance Officer', families: ['finance_legal_admin'] }],
  ['contract manager', { canonical: 'Contract Manager', families: ['finance_legal_admin'] }],
  ['responsable fiscal', { canonical: 'Responsable Fiscal', families: ['finance_legal_admin'] }],
  ['tax manager', { canonical: 'Tax Manager', families: ['finance_legal_admin'] }],
  ['auditeur interne', { canonical: 'Auditeur Interne', families: ['finance_legal_admin'] }],
  ['risk manager', { canonical: 'Risk Manager', families: ['finance_legal_admin'] }],
  ['office manager', { canonical: 'Office Manager', families: ['finance_legal_admin'] }],
  ['responsable services generaux', { canonical: 'Responsable Services Généraux', families: ['finance_legal_admin'] }],
])

export type TitleLookup = {
  /** La forme canonique du corpus — ce que « titre normalisé » veut dire ici. */
  readonly canonical: string
  /** La famille de corpus retenue, ou `null` si le titre reste ambigu. */
  readonly legacyFamily: LegacyTitleFamily | null
  /** Le titre porte deux familles et rien ne les a départagées. */
  readonly ambiguous: boolean
}

/**
 * Cherche un libellé dans le référentiel.
 *
 * Rend `null` quand le titre est INCONNU du corpus — ce qui ne veut pas dire
 * « mauvais titre » : le corpus fait 298 entrées et ne prétend pas couvrir les
 * intitulés de poste français.
 *
 * `sellerDomain` départage les neuf titres ambigus. Sans lui, un titre ambigu
 * rend `legacyFamily: null` et `ambiguous: true` : on préfère ne rien conclure
 * plutôt que de prendre la première famille de la liste.
 */
export function lookupTitle(raw: string | null | undefined, sellerDomain?: OfferDomain | null): TitleLookup | null {
  const entry = TITLE_TAXONOMY.get(normalizeTitleKey(raw))
  if (!entry) return null
  if (entry.families.length === 1) {
    return { canonical: entry.canonical, legacyFamily: entry.families[0] ?? null, ambiguous: false }
  }
  const matched = sellerDomain
    ? entry.families.filter(family => LEGACY_FAMILY_OFFER_DOMAIN[family] === sellerDomain)
    : []
  if (matched.length === 1) {
    return { canonical: entry.canonical, legacyFamily: matched[0] ?? null, ambiguous: false }
  }
  return { canonical: entry.canonical, legacyFamily: null, ambiguous: true }
}
