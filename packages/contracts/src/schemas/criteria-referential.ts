import { z } from 'zod'
import { APPLICATION_SECTORS, APPLICATION_SECTOR_BY_CODE } from './application-sectors.js'

/**
 * #4434 / #4435 / #4436 (épopée #4433, décisions Louis 21/10/2026) — LE référentiel des critères de recherche.
 *
 * Une recherche « React » qui ne trouve rien exact doit remonter JavaScript, puis le développement web ; un
 * secteur « aéronautique » trop maigre s'ouvre au spatial et à la défense ; une tranche ETI vide s'ouvre à la
 * PME et à la grande entreprise. Ces trois voisinages vivent ICI, une fois (GA-26) : Découvrir (service IA),
 * l'outil de recherche de comptes de Laura (même moteur), le matching vivier/besoins (API) et l'écran (web)
 * les lisent. Le service IA, qui ne lit pas `packages/`, en reçoit un MIROIR GÉNÉRÉ
 * (`apps/ia/app/knowledge/criteria_referential.json`, écrit par `criteriaReferentialMirror()` — voir
 * `criteria-referential.mirror.test.ts`) : jamais deux listes tenues à la main.
 *
 * Trois paliers par axe : exact (alias compris) → voisin 1 → voisin 2. Ils ne se déclenchent que SOUS
 * `CRITERIA_WIDEN_MIN_RESULTS` résultats ; au-dessus, rien n'est élargi. Un résultat élargi porte son
 * étiquette (`criteriaWidenedBySchema`) — jamais confondu avec un résultat exact.
 *
 * Ce que ce module ne fait PAS : il n'INFÈRE pas une compétence (« connaît JavaScript » ne se déduit pas
 * de « connaît React » — le matching l'appelle ADJACENTE, signalée, jamais comptée) ; il ne devine pas une
 * taille (un effectif non publié n'a aucune tranche, jamais « 0 », GA-18/19).
 */

// #4433 — sous ce nombre de résultats exacts, la recherche s'élargit d'un palier ; au-dessus, jamais.
// #4673 — 10 → 25 : Louis (28/10/2026) veut « dans les 20 30 comptes » pour une ville + techno (il en avait 4 / 8).
// Un seul endroit (GA-26) : le miroir JSON IA et `ZONE_WIDEN_MIN_RESULTS` le lisent d'ici.
export const CRITERIA_WIDEN_MIN_RESULTS = 25

// ── Compétences : alias → famille → domaine ──────────────────────────────────────────────────────

export interface SkillDomain {
  labelFr: string
  labelEn: string
  /** Ce qu'on cherche dans les offres au palier 2 (le domaine entier). */
  searchTerms: readonly string[]
}

export interface SkillFamily {
  domain: string
  labelFr: string
  labelEn: string
}

export interface SkillEntry {
  /** Le libellé affiché (« JavaScript ») — un nom propre, identique en français et en anglais. */
  label: string
  /** Ce qu'on accepte en entrée, tel qu'on le rencontre sur des CV et des offres français. */
  aliases: readonly string[]
  family: string
  /** Produits DISTINCTS rangés sous cette canonique : trouvés en recherche, jamais une preuve en matching. */
  distinct?: readonly string[]
}

export const SKILL_DOMAINS = {
  web: { labelFr: 'développement web', labelEn: 'web development', searchTerms: ['développeur web', 'full stack'] },
  mobile: { labelFr: 'développement mobile', labelEn: 'mobile development', searchTerms: ['développeur mobile'] },
  systemes: {
    labelFr: 'logiciel embarqué et systèmes',
    labelEn: 'embedded and systems software',
    searchTerms: ['logiciel embarqué', 'développeur c++'],
  },
  data: { labelFr: 'data et IA', labelEn: 'data and AI', searchTerms: ['data engineer', 'data scientist'] },
  cloud: {
    labelFr: 'cloud et DevOps',
    labelEn: 'cloud and DevOps',
    searchTerms: ['ingénieur devops', 'ingénieur cloud'],
  },
  securite: { labelFr: 'cybersécurité', labelEn: 'cybersecurity', searchTerms: ['cybersécurité'] },
  progiciels: {
    labelFr: 'progiciels ERP et CRM',
    labelEn: 'ERP and CRM software',
    searchTerms: ['consultant erp', 'consultant crm'],
  },
  pilotage: {
    labelFr: 'pilotage, méthodes et qualité',
    labelEn: 'delivery, methods and quality',
    searchTerms: ['chef de projet', 'scrum master'],
  },
} as const satisfies Readonly<Record<string, SkillDomain>>

/**
 * #4519.19 (Louis 24/10) — une EXPERTISE (le catalogue `expertise_areas` de l'onboarding, une tuile de Découvrir)
 * se cherche par les MÉTIERS qu'elle recrute, jamais par son libellé : aucune offre ne s'intitule « Data &
 * Intelligence Artificielle ». `labels` = les écritures reconnues (comparées pliées, `normaliseSkillText`) ;
 * `tradeTerms` = ce qui part aux sources d'offres. Une expertise absente d'ici n'est pas traduite (jamais devinée).
 */
interface ExpertiseTrade {
  domain: keyof typeof SKILL_DOMAINS
  labels: readonly string[]
  tradeTerms: readonly string[]
}

const EXPERTISE_TRADES: readonly ExpertiseTrade[] = [
  {
    domain: 'data',
    labels: [
      'Data & Intelligence Artificielle',
      'Data & IA',
      'Data et IA',
      'Data / IA',
      'data et intelligence artificielle',
    ],
    tradeTerms: ['data engineer', 'data scientist', 'data analyst', 'machine learning', 'business intelligence'],
  },
  {
    domain: 'cloud',
    labels: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)', 'Cloud & Infrastructure', 'Cloud et infrastructure'],
    tradeTerms: ['ingénieur cloud', 'architecte cloud', 'ingénieur systèmes', 'administrateur systèmes'],
  },
  {
    domain: 'cloud',
    labels: ['DevOps, SRE & Automatisation', 'DevOps & SRE', 'DevOps et SRE'],
    tradeTerms: ['ingénieur devops', 'devops', 'sre', 'ingénieur cloud'],
  },
  {
    domain: 'securite',
    labels: ['Cybersécurité & Conformité', 'Cybersécurité et conformité'],
    tradeTerms: ['cybersécurité', 'ingénieur sécurité', 'analyste soc', 'pentester'],
  },
  {
    domain: 'web',
    labels: ['Développement applicatif (Web, Mobile, API)', 'Développement applicatif'],
    tradeTerms: ['développeur web', 'développeur full stack', 'développeur mobile', 'développeur back-end'],
  },
  {
    domain: 'progiciels',
    labels: ['SAP & ERP (S/4HANA, Oracle, Sage)', 'SAP & ERP', 'SAP et ERP'],
    tradeTerms: ['consultant sap', 'consultant erp', 'sap'],
  },
  {
    domain: 'systemes',
    labels: ['IoT & Systèmes embarqués', 'IoT et systèmes embarqués'],
    tradeTerms: ['logiciel embarqué', 'ingénieur embarqué', 'iot'],
  },
  {
    domain: 'pilotage',
    labels: ['Gestion de projet & PMO', 'Gestion de projet et PMO'],
    tradeTerms: ['chef de projet informatique', 'pmo', 'chef de projet si'],
  },
]

export const SKILL_FAMILIES = {
  'js-front': {
    domain: 'web',
    labelFr: 'JavaScript, TypeScript et front',
    labelEn: 'JavaScript, TypeScript and front-end',
  },
  jvm: { domain: 'web', labelFr: 'Java et JVM', labelEn: 'Java and JVM' },
  dotnet: { domain: 'web', labelFr: '.NET', labelEn: '.NET' },
  php: { domain: 'web', labelFr: 'PHP', labelEn: 'PHP' },
  python: { domain: 'web', labelFr: 'Python', labelEn: 'Python' },
  ruby: { domain: 'web', labelFr: 'Ruby', labelEn: 'Ruby' },
  // #4433.2 — les langages fonctionnels : famille propre, rattachée au domaine web (jamais « aucun palier »).
  fonctionnel: { domain: 'web', labelFr: 'langages fonctionnels', labelEn: 'functional languages' },
  mobile: { domain: 'mobile', labelFr: 'mobile natif et hybride', labelEn: 'native and hybrid mobile' },
  'langages-systeme': { domain: 'systemes', labelFr: 'langages système', labelEn: 'systems languages' },
  embarque: { domain: 'systemes', labelFr: 'embarqué', labelEn: 'embedded' },
  mainframe: { domain: 'systemes', labelFr: 'mainframe', labelEn: 'mainframe' },
  'data-engineering': { domain: 'data', labelFr: 'data engineering', labelEn: 'data engineering' },
  bases: { domain: 'data', labelFr: 'bases de données', labelEn: 'databases' },
  bi: { domain: 'data', labelFr: 'BI et restitution', labelEn: 'BI and reporting' },
  ia: { domain: 'data', labelFr: 'IA et machine learning', labelEn: 'AI and machine learning' },
  'gouvernance-data': { domain: 'data', labelFr: 'gouvernance des données', labelEn: 'data governance' },
  'cloud-public': { domain: 'cloud', labelFr: 'cloud public', labelEn: 'public cloud' },
  conteneurs: { domain: 'cloud', labelFr: 'conteneurs et orchestration', labelEn: 'containers and orchestration' },
  automatisation: { domain: 'cloud', labelFr: 'automatisation et exploitation', labelEn: 'automation and operations' },
  cyber: { domain: 'securite', labelFr: 'sécurité opérationnelle', labelEn: 'security operations' },
  conformite: { domain: 'securite', labelFr: 'conformité', labelEn: 'compliance' },
  erp: { domain: 'progiciels', labelFr: 'ERP', labelEn: 'ERP' },
  crm: { domain: 'progiciels', labelFr: 'CRM', labelEn: 'CRM' },
  itsm: { domain: 'progiciels', labelFr: 'ITSM', labelEn: 'ITSM' },
  methodes: { domain: 'pilotage', labelFr: 'méthodes et pilotage', labelEn: 'methods and delivery' },
  architecture: { domain: 'pilotage', labelFr: 'architecture', labelEn: 'architecture' },
  qualite: { domain: 'pilotage', labelFr: 'qualité logicielle', labelEn: 'software quality' },
  qhse: { domain: 'pilotage', labelFr: 'QHSE', labelEn: 'HSE' },
} as const satisfies Readonly<Record<string, SkillFamily>>

/**
 * Les compétences canoniques. L'ORDRE compte : dans une famille, le premier voisin est le plus proche (React →
 * JavaScript avant Angular). Les alias et les produits distincts des 47 premières entrées sont ceux du
 * dictionnaire du vivier (`skill-referential.ts`, addendum p62), repris tels quels — ce module en est désormais
 * la source. Aucun terme trop court ni trop générique (« dev », « data », « cloud », « go ») : ils matchent tout.
 */
export const SKILLS = {
  // — web : JavaScript, TypeScript et front
  javascript: { label: 'JavaScript', aliases: ['js', 'ecmascript', 'es6'], family: 'js-front' },
  typescript: { label: 'TypeScript', aliases: ['ts'], family: 'js-front' },
  react: { label: 'React', aliases: ['reactjs', 'react.js'], family: 'js-front' },
  angular: { label: 'Angular', aliases: ['angularjs', 'angular2'], family: 'js-front' },
  'vue.js': { label: 'Vue.js', aliases: ['vue', 'vuejs'], family: 'js-front' },
  'next.js': { label: 'Next.js', aliases: ['nextjs'], family: 'js-front' },
  'node.js': { label: 'Node.js', aliases: ['node', 'nodejs'], family: 'js-front' },
  html: { label: 'HTML', aliases: ['html5'], family: 'js-front' },
  css: { label: 'CSS', aliases: ['css3', 'sass', 'scss', 'tailwind'], family: 'js-front' },
  graphql: { label: 'GraphQL', aliases: [], family: 'js-front' },
  // — web : back
  java: { label: 'Java', aliases: ['jee', 'j2ee', 'jakarta'], family: 'jvm' },
  // KEVIN-FIX K.2 — « Spring Boot » reste UNE compétence quand on découpe une saisie (« java spring vue »).
  spring: {
    label: 'Spring',
    aliases: ['spring boot', 'spring framework', 'spring mvc', 'spring cloud'],
    family: 'jvm',
  },
  kotlin: { label: 'Kotlin', aliases: [], family: 'jvm' },
  scala: { label: 'Scala', aliases: [], family: 'jvm' },
  // #2328.19 — « C# » est un langage, « .NET » la plate-forme entière : regroupés pour CHERCHER, jamais une preuve.
  '.net': {
    label: '.NET',
    aliases: ['dotnet', 'csharp', 'c#', 'asp.net'],
    family: 'dotnet',
    distinct: ['csharp', 'c#'],
  },
  php: { label: 'PHP', aliases: ['symfony', 'laravel'], family: 'php', distinct: ['symfony', 'laravel'] },
  python: { label: 'Python', aliases: ['py'], family: 'python' },
  django: { label: 'Django', aliases: [], family: 'python' },
  ruby: { label: 'Ruby', aliases: ['ruby on rails', 'rails'], family: 'ruby' },
  // #4433.2 — « Clojure » ou « Elixir » à zéro doit tenter un palier : leurs voisins sont les autres langages fonctionnels.
  clojure: { label: 'Clojure', aliases: ['clojurescript'], family: 'fonctionnel' },
  elixir: { label: 'Elixir', aliases: ['phoenix framework'], family: 'fonctionnel' },
  erlang: { label: 'Erlang', aliases: [], family: 'fonctionnel' },
  haskell: { label: 'Haskell', aliases: [], family: 'fonctionnel' },
  ocaml: { label: 'OCaml', aliases: [], family: 'fonctionnel' },
  'f#': { label: 'F#', aliases: ['fsharp'], family: 'fonctionnel' },
  // — mobile
  android: { label: 'Android', aliases: [], family: 'mobile' },
  ios: { label: 'iOS', aliases: [], family: 'mobile' },
  swift: { label: 'Swift', aliases: ['swiftui'], family: 'mobile' },
  flutter: { label: 'Flutter', aliases: ['dart'], family: 'mobile' },
  // — systèmes
  'c++': { label: 'C++', aliases: ['cpp'], family: 'langages-systeme' },
  rust: { label: 'Rust', aliases: [], family: 'langages-systeme' },
  golang: { label: 'Go', aliases: [], family: 'langages-systeme' },
  embarque: { label: 'Embarqué', aliases: ['embedded', 'temps reel', 'rtos'], family: 'embarque' },
  // #2328.20/.21 — chacune sa propre canonique, jamais fondue dans une famille plus large côté PREUVE.
  autosar: { label: 'AUTOSAR', aliases: [], family: 'embarque' },
  mainframe: {
    label: 'Mainframe',
    aliases: ['cobol', 'zos', 'as400'],
    family: 'mainframe',
    distinct: ['cobol', 'zos', 'as400'],
  },
  // — data
  spark: { label: 'Spark', aliases: ['pyspark', 'databricks'], family: 'data-engineering', distinct: ['databricks'] },
  airflow: { label: 'Airflow', aliases: ['dag', 'orchestration de flux'], family: 'data-engineering' },
  kafka: {
    label: 'Kafka',
    aliases: ['streaming', 'event streaming', 'pulsar'],
    family: 'data-engineering',
    distinct: ['pulsar'],
  },
  dbt: { label: 'dbt', aliases: ['transformation de donnees'], family: 'data-engineering' },
  snowflake: {
    label: 'Snowflake',
    aliases: ['entrepot de donnees', 'datawarehouse', 'data warehouse'],
    family: 'data-engineering',
    distinct: ['entrepot de donnees', 'datawarehouse', 'data warehouse'],
  },
  hadoop: { label: 'Hadoop', aliases: ['hdfs', 'hive'], family: 'data-engineering' },
  talend: { label: 'Talend', aliases: [], family: 'data-engineering' },
  sql: {
    label: 'SQL',
    aliases: ['postgresql', 'postgres', 'mysql', 'oracle', 'sqlserver', 'mariadb'],
    family: 'bases',
    distinct: ['postgresql', 'postgres', 'mysql', 'oracle', 'sqlserver', 'mariadb'],
  },
  nosql: {
    label: 'NoSQL',
    aliases: ['mongodb', 'cassandra', 'dynamodb', 'couchbase'],
    family: 'bases',
    distinct: ['mongodb', 'cassandra', 'dynamodb', 'couchbase'],
  },
  redis: { label: 'Redis', aliases: [], family: 'bases' },
  elasticsearch: { label: 'Elasticsearch', aliases: ['elastic', 'opensearch'], family: 'bases' },
  powerbi: {
    label: 'Power BI',
    aliases: ['power bi', 'bi', 'business intelligence', 'tableau', 'qlik', 'looker'],
    family: 'bi',
    distinct: ['power bi', 'tableau', 'qlik', 'looker'],
  },
  'machine learning': {
    label: 'Machine learning',
    aliases: ['ml', 'apprentissage automatique', 'modeles predictifs'],
    family: 'ia',
  },
  llm: { label: 'LLM', aliases: ['ia generative', 'genai', 'gpt', 'rag'], family: 'ia', distinct: ['gpt', 'rag'] },
  mlops: { label: 'MLOps', aliases: ['ml ops', 'industrialisation ml', 'mise en production de modeles'], family: 'ia' },
  'gouvernance des donnees': {
    label: 'Gouvernance des données',
    aliases: ['data governance', 'data management', 'qualite des donnees'],
    family: 'gouvernance-data',
  },
  // — cloud et DevOps
  aws: { label: 'AWS', aliases: ['amazon web services'], family: 'cloud-public' },
  azure: { label: 'Azure', aliases: ['microsoft azure'], family: 'cloud-public' },
  gcp: { label: 'GCP', aliases: ['google cloud', 'google cloud platform'], family: 'cloud-public' },
  kubernetes: {
    label: 'Kubernetes',
    aliases: ['k8s', 'kube', 'openshift', 'eks', 'aks', 'gke'],
    family: 'conteneurs',
    distinct: ['openshift', 'eks', 'aks', 'gke'],
  },
  docker: {
    label: 'Docker',
    aliases: ['conteneur', 'conteneurs', 'containers', 'containerisation', 'podman'],
    family: 'conteneurs',
    distinct: ['podman'],
  },
  terraform: {
    label: 'Terraform',
    aliases: ['iac', 'infrastructure as code', 'opentofu'],
    family: 'automatisation',
    distinct: ['opentofu'],
  },
  devops: {
    label: 'DevOps',
    aliases: ['sre', 'ci cd', 'cicd', 'integration continue', 'deploiement continu'],
    family: 'automatisation',
  },
  ansible: { label: 'Ansible', aliases: [], family: 'automatisation' },
  linux: { label: 'Linux', aliases: ['unix'], family: 'automatisation' },
  // — sécurité
  cybersecurite: {
    label: 'Cybersécurité',
    aliases: ['cybersecurity', 'securite si', 'ssi', 'infosec'],
    family: 'cyber',
  },
  soc: {
    label: 'SOC',
    aliases: ['centre operationnel de securite', 'siem', 'splunk', 'qradar'],
    family: 'cyber',
    distinct: ['splunk', 'qradar'],
  },
  iam: {
    label: 'IAM',
    aliases: ['gestion des identites', 'identity access management', 'sso', 'keycloak'],
    family: 'cyber',
    distinct: ['keycloak'],
  },
  rgpd: { label: 'RGPD', aliases: ['gdpr', 'protection des donnees'], family: 'conformite' },
  // — progiciels
  sap: { label: 'SAP', aliases: ['s4hana', 's/4hana', 'abap'], family: 'erp' },
  salesforce: { label: 'Salesforce', aliases: ['sfdc', 'apex'], family: 'crm' },
  servicenow: { label: 'ServiceNow', aliases: ['itsm'], family: 'itsm' },
  // — pilotage, méthodes, qualité
  agile: { label: 'Agile', aliases: ['scrum', 'safe', 'kanban', 'agilite'], family: 'methodes' },
  'gestion de projet': {
    label: 'Gestion de projet',
    aliases: ['chef de projet', 'pmo', 'pilotage de projet'],
    family: 'methodes',
  },
  'architecture logicielle': {
    label: 'Architecture logicielle',
    aliases: ['architecte logiciel', 'architecture applicative'],
    family: 'architecture',
  },
  'tests automatises': {
    label: 'Tests automatisés',
    aliases: ['qa', 'test automation', 'selenium', 'cypress', 'playwright'],
    family: 'qualite',
    distinct: ['selenium', 'cypress', 'playwright'],
  },
  hse: { label: 'HSE', aliases: ['sante securite environnement'], family: 'qhse' },
} as const satisfies Readonly<Record<string, SkillEntry>>

/**
 * #4579 / #4563 — les ÉCRITURES d'une compétence dans une annonce. « Vue » n'y est presque jamais écrit « Vue » :
 * « Vue.js », « VueJS », « Vue 3 ». Une source d'offres cherche des MOTS entiers : tant que seule la saisie part, on
 * passe à côté de la majorité du marché. Clé = la canonique de `SKILLS` ; valeur = TOUTES ses écritures (la saisie
 * en fait partie, la recherche la retire).
 *
 * Écritures d'annonce SEULEMENT. #4579 (lot L5) : les annonces d'un poste Vue s'écrivent aussi « Nuxt », celles d'un
 * poste Java « Spring Boot » / « Jakarta EE » — ces formes partent dès le premier passage, sans attendre l'élargissement.
 * Hors de la MÊME famille (`jvm`, `js-front`), ni écosystème (« vue » ⇒ Pinia) ni proximité (« vue » ⇒ React) : la
 * proximité a ses paliers (`skillWideningTiers`). Une compétence absente d'ici est
 * cherchée telle quelle, jamais devinée. Miroir IA : `skillWrittenForms` (`criteria_referential.py`).
 */
export const SKILL_WRITTEN_FORMS = {
  'vue.js': ['vue', 'vue.js', 'vuejs', 'vue 3', 'nuxt', 'nuxt.js'],
  java: ['java', 'java 17', 'j2ee', 'jee', 'spring', 'spring boot', 'jakarta ee'],
  react: ['react', 'react.js', 'reactjs'],
  angular: ['angular', 'angularjs'],
  'next.js': ['next.js', 'nextjs'],
  'node.js': ['node.js', 'nodejs'],
  '.net': ['.net', 'dotnet', '.net core'],
  typescript: ['typescript', 'type script'],
  python: ['python', 'python 3'],
  php: ['php', 'php 8'],
  html: ['html', 'html5'],
  css: ['css', 'css3'],
  kubernetes: ['kubernetes', 'k8s'],
  devops: ['devops', 'dev ops'],
  powerbi: ['powerbi', 'power bi'],
  servicenow: ['servicenow', 'service now'],
  elasticsearch: ['elasticsearch', 'elastic search'],
  'f#': ['f#', 'fsharp'],
  'c++': ['c++', 'cpp'],
} as const satisfies Readonly<Record<string, readonly string[]>>

const SKILL_ENTRIES = SKILLS as Readonly<Record<string, SkillEntry>>
const FAMILY_ENTRIES = SKILL_FAMILIES as Readonly<Record<string, SkillFamily>>
const DOMAIN_ENTRIES = SKILL_DOMAINS as Readonly<Record<string, SkillDomain>>

/** Normalisation typographique : accents retirés, casse basse, ponctuation ramenée à des espaces. `+`, `#`,
 *  `.` et `/` survivent — « C# », « .NET » et « S/4HANA » en dépendent. */
export function normaliseSkillText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Table inverse alias → canonique, construite UNE fois. Le PREMIER gagne : un alias déclaré sous deux
 *  canoniques serait une erreur de saisie, et écraser rendrait le résultat dépendant de l'ordre des clés. */
export const SKILL_CANONICAL_BY_ALIAS: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>()
  for (const [canonical, entry] of Object.entries(SKILL_ENTRIES)) {
    map.set(normaliseSkillText(canonical), canonical)
    for (const alias of entry.aliases) {
      const key = normaliseSkillText(alias)
      if (!map.has(key)) map.set(key, canonical)
    }
  }
  return map
})()

/**
 * La compétence canonique d'une écriture libre, ou `null` (la plupart des lignes d'un CV ne sont pas des
 * compétences — mieux vaut ne rien reconnaître que reconnaître de travers). Trois passes, de la plus sûre à la
 * moins sûre : la clé entière, puis les morceaux d'une entrée composée (« dev front React/Next »), puis les mots.
 */
export function canonicalSkill(value: string): string | null {
  const key = normaliseSkillText(value)
  if (!key) return null
  const direct = SKILL_CANONICAL_BY_ALIAS.get(key)
  if (direct) return direct
  for (const part of key.split(/[/,;|&+]/)) {
    const found = SKILL_CANONICAL_BY_ALIAS.get(part.trim())
    if (found) return found
  }
  // #4434 — « dev front React/Next » : le mot se lit aussi de part et d'autre d'un slash.
  for (const word of key.split(/[\s/|&,;]+/)) {
    const found = SKILL_CANONICAL_BY_ALIAS.get(word)
    if (found) return found
  }
  return null
}

/** Les produits distincts rangés sous une canonique (voir `SkillEntry.distinct`). */
export function distinctSkillMembers(canonical: string): readonly string[] {
  return SKILL_ENTRIES[canonical]?.distinct ?? []
}

/** Le libellé affiché d'une canonique (« javascript » → « JavaScript »), ou `null` hors référentiel. */
export function skillLabel(canonical: string): string | null {
  return SKILL_ENTRIES[canonical]?.label ?? null
}

/**
 * La distance de deux écritures dans le référentiel : `0` même canonique, `1` même famille, `2` même domaine,
 * `null` sinon (ou si l'une est inconnue — on ne prétend pas trancher ce qu'on ne connaît pas).
 */
export function skillDistance(a: string, b: string): 0 | 1 | 2 | null {
  const left = canonicalSkill(a)
  const right = canonicalSkill(b)
  if (!left || !right) return null
  if (left === right) return 0
  const familyLeft = SKILL_ENTRIES[left]?.family
  const familyRight = SKILL_ENTRIES[right]?.family
  if (!familyLeft || !familyRight) return null
  if (familyLeft === familyRight) return 1
  const domainLeft = FAMILY_ENTRIES[familyLeft]?.domain
  return domainLeft && domainLeft === FAMILY_ENTRIES[familyRight]?.domain ? 2 : null
}

/** Un terme d'élargissement : ce qu'on cherche (`search`) et ce que l'étiquette nomme (`code`). */
export interface WideningTerm {
  code: string
  search: string
}

export interface WideningTier<T> {
  tier: 1 | 2
  items: readonly T[]
}

/**
 * #4434 — les paliers d'une compétence : 1 = les autres compétences de sa FAMILLE (étiquette : la compétence,
 * « proche : JavaScript ») ; 2 = son DOMAINE (étiquette : le domaine, « proche : développement web »). Une
 * compétence inconnue tombe au palier 2 du domaine web (#4433.2).
 */
export function skillWideningTiers(value: string): WideningTier<WideningTerm>[] {
  const canonical = canonicalSkill(value)
  const entry = canonical ? SKILL_ENTRIES[canonical] : undefined
  if (!canonical || !entry) {
    // #4433.2 — une compétence hors référentiel tombe au domaine « développement web » (« proche : développement web »).
    if (!normaliseSkillText(value)) return []
    return [{ tier: 2, items: SKILL_DOMAINS.web.searchTerms.map(search => ({ code: 'web', search })) }]
  }
  const siblings = Object.entries(SKILL_ENTRIES)
    .filter(([key, other]) => key !== canonical && other.family === entry.family)
    .map(([key, other]) => ({ code: key, search: other.label }))
  const domainKey = FAMILY_ENTRIES[entry.family]?.domain
  const domain = domainKey ? DOMAIN_ENTRIES[domainKey] : undefined
  const tiers: WideningTier<WideningTerm>[] = []
  if (siblings.length > 0) tiers.push({ tier: 1, items: siblings })
  if (domainKey && domain)
    tiers.push({ tier: 2, items: domain.searchTerms.map(search => ({ code: domainKey, search })) })
  return tiers
}

// ── Secteurs voisins (#4435) ─────────────────────────────────────────────────────────────────────

/**
 * Palier 1 de chaque secteur partagé (`APPLICATION_SECTORS`) : ses voisins DIRECTS, du plus proche au moins
 * proche — mêmes acheteurs, mêmes chaînes de sous-traitance, mêmes cycles. Le palier 2 est le reste de son
 * GROUPE (`industrie`, `finance`…), dérivé, jamais écrit à la main.
 */
export const SECTOR_NEIGHBOURS: Readonly<Record<string, readonly string[]>> = {
  aerospace: ['defense', 'air_transport', 'naval', 'electronics_semiconductor'],
  defense: ['aerospace', 'naval', 'electronics_semiconductor'],
  naval: ['defense', 'road_maritime', 'aerospace'],
  automotive: ['industrial_equipment', 'rail', 'electronics_semiconductor'],
  industrial_equipment: ['special_machinery', 'automotive', 'steel_materials'],
  special_machinery: ['industrial_equipment', 'automotive'],
  electronics_semiconductor: ['defense', 'aerospace', 'telecom'],
  steel_materials: ['industrial_equipment', 'chemicals'],
  nuclear: ['power_grid_distribution', 'renewables', 'defense'],
  power_grid_distribution: ['renewables', 'nuclear', 'water_waste'],
  renewables: ['power_grid_distribution', 'nuclear'],
  oil_gas: ['chemicals', 'power_grid_distribution'],
  water_waste: ['power_grid_distribution', 'public_sector'],
  chemicals: ['pharma_manufacturing', 'oil_gas', 'cosmetics'],
  pharma_manufacturing: ['life_sciences', 'chemicals', 'medtech'],
  food_beverage: ['retail', 'paper_packaging'],
  cosmetics: ['luxury', 'chemicals'],
  paper_packaging: ['food_beverage', 'chemicals'],
  construction: ['real_estate', 'transport_infrastructure'],
  real_estate: ['construction', 'insurance'],
  transport_infrastructure: ['construction', 'rail'],
  rail: ['transport_infrastructure', 'logistics'],
  air_transport: ['aerospace', 'logistics', 'hospitality_tourism'],
  road_maritime: ['logistics', 'naval'],
  logistics: ['road_maritime', 'ecommerce', 'retail'],
  retail_banking: ['insurance', 'fintech', 'investment_banking'],
  investment_banking: ['retail_banking', 'fintech', 'insurance'],
  insurance: ['retail_banking', 'fintech'],
  fintech: ['retail_banking', 'insurance', 'software_tech'],
  healthcare: ['medtech', 'life_sciences'],
  life_sciences: ['pharma_manufacturing', 'medtech', 'healthcare'],
  medtech: ['healthcare', 'life_sciences', 'electronics_semiconductor'],
  retail: ['ecommerce', 'luxury', 'food_beverage'],
  ecommerce: ['retail', 'logistics', 'software_tech'],
  luxury: ['cosmetics', 'retail'],
  hospitality_tourism: ['air_transport', 'retail'],
  software_tech: ['telecom', 'fintech', 'media_entertainment'],
  telecom: ['software_tech', 'media_entertainment', 'electronics_semiconductor'],
  media_entertainment: ['telecom', 'software_tech'],
  public_sector: ['education_research', 'healthcare'],
  education_research: ['public_sector', 'life_sciences'],
}

/**
 * #4435 — les paliers de secteurs demandés : 1 = leurs voisins directs, 2 = le reste de leurs groupes. Jamais un
 * secteur déjà demandé ni déjà proposé au palier précédent. Un code inconnu n'ajoute rien.
 */
export function sectorWideningTiers(codes: readonly string[]): WideningTier<string>[] {
  const asked = new Set(codes.filter(code => APPLICATION_SECTOR_BY_CODE.has(code)))
  if (asked.size === 0) return []
  const first: string[] = []
  for (const code of asked) {
    for (const neighbour of SECTOR_NEIGHBOURS[code] ?? []) {
      if (!asked.has(neighbour) && !first.includes(neighbour)) first.push(neighbour)
    }
  }
  const groups = new Set([...asked].map(code => APPLICATION_SECTOR_BY_CODE.get(code)?.group))
  const second = APPLICATION_SECTORS.filter(
    sector => groups.has(sector.group) && !asked.has(sector.code) && !first.includes(sector.code),
  ).map(sector => sector.code)
  const tiers: WideningTier<string>[] = []
  if (first.length > 0) tiers.push({ tier: 1, items: first })
  if (second.length > 0) tiers.push({ tier: 2, items: second })
  return tiers
}

// ── Tailles voisines (#4436) ─────────────────────────────────────────────────────────────────────

/** Les tailles maison (décision #4362.4) : bornes d'effectif INCLUSIVES, `max: null` = sans plafond. */
export const SIZE_BANDS = [
  { code: 'TPE', min: 0, max: 9, labelFr: 'TPE', labelEn: 'micro' },
  { code: 'PME', min: 10, max: 249, labelFr: 'PME', labelEn: 'SME' },
  { code: 'ETI', min: 250, max: 999, labelFr: 'ETI', labelEn: 'mid-cap' },
  { code: 'GC', min: 1000, max: null, labelFr: 'GC', labelEn: 'large company' },
] as const

export type SizeBandCode = (typeof SIZE_BANDS)[number]['code']

export interface HeadcountRange {
  min: number
  max: number | null
}

/** La tranche maison d'un effectif connu ; `null` pour un effectif non publié — jamais « 0 » (GA-18/19). */
export function sizeBandOf(headcount: number | null | undefined): SizeBandCode | null {
  if (headcount === null || headcount === undefined || !Number.isFinite(headcount) || headcount < 0) return null
  return SIZE_BANDS.find(band => headcount >= band.min && (band.max === null || headcount <= band.max))?.code ?? null
}

/** La tranche maison d'un intervalle d'effectif (« 250-499 » → ETI), si l'intervalle tient dans une seule. */
export function sizeBandOfRange(range: HeadcountRange): SizeBandCode | null {
  const low = sizeBandOf(range.min)
  const high = range.max === null ? 'GC' : sizeBandOf(range.max)
  return low && low === high ? low : null
}

/**
 * #4436 — les paliers de tranches demandées : 1 = tranches à ± 1, 2 = tranches à ± 2. Les tranches demandées
 * sont celles que recoupent les intervalles cochés ; jamais une tranche déjà demandée.
 */
export function sizeWideningTiers(ranges: readonly HeadcountRange[]): WideningTier<SizeBandCode>[] {
  const asked = new Set<number>()
  SIZE_BANDS.forEach((band, index) => {
    const overlaps = ranges.some(
      range => (band.max === null || range.min <= band.max) && (range.max === null || range.max >= band.min),
    )
    if (overlaps) asked.add(index)
  })
  if (asked.size === 0) return []
  const tiers: WideningTier<SizeBandCode>[] = []
  const taken = new Set(asked)
  for (const distance of [1, 2] as const) {
    const items: SizeBandCode[] = []
    SIZE_BANDS.forEach((band, index) => {
      if (taken.has(index)) return
      if ([...asked].some(a => Math.abs(a - index) === distance)) items.push(band.code)
    })
    items.forEach(code => taken.add(SIZE_BANDS.findIndex(band => band.code === code)))
    if (items.length > 0) tiers.push({ tier: distance, items })
  }
  return tiers
}

// ── L'étiquette d'un résultat élargi, et ce que la réponse dit au-dessus de la liste ────────────

export const CRITERIA_AXES = ['skill', 'sector', 'size'] as const
export type CriteriaAxis = (typeof CRITERIA_AXES)[number]

/**
 * Un résultat ÉLARGI : l'axe, le palier, et le code de ce qui l'a fait remonter (une compétence canonique ou un
 * domaine pour `skill`, un code de secteur partagé pour `sector`, une tranche maison pour `size` — `null` :
 * « taille non publiée »). Absent = résultat exact.
 */
export const criteriaWidenedBySchema = z.object({
  axis: z.enum(CRITERIA_AXES),
  tier: z.union([z.literal(1), z.literal(2)]),
  code: z.string().min(1).nullable(),
})
export type CriteriaWidenedBy = z.infer<typeof criteriaWidenedBySchema>

/** `query.widening` — l'élargissement se DIT au-dessus de la liste (combien, sur quel axe, jusqu'à quel palier). */
export const criteriaWideningSchema = z.object({
  minResults: z.number().int().positive(),
  exactCount: z.number().int().nonnegative(),
  steps: z.array(
    z.object({
      axis: z.enum(CRITERIA_AXES),
      tier: z.union([z.literal(1), z.literal(2)]),
      codes: z.array(z.string()),
      added: z.number().int().positive(),
    }),
  ),
})
export type CriteriaWidening = z.infer<typeof criteriaWideningSchema>

/** Le libellé de ce qui a fait remonter un résultat élargi (« JavaScript », « défense », « GC »), ou `null`
 *  quand la taille n'est pas publiée — l'écran l'écrit alors en toutes lettres, jamais « 0 ». */
export function widenedByLabel(widened: CriteriaWidenedBy, language: 'fr' | 'en'): string | null {
  const code = widened.code
  if (code === null) return null
  if (widened.axis === 'skill') {
    const skill = SKILL_ENTRIES[code]
    if (skill) return skill.label
    const domain = DOMAIN_ENTRIES[code]
    return domain ? (language === 'en' ? domain.labelEn : domain.labelFr) : code
  }
  if (widened.axis === 'sector') {
    const sector = APPLICATION_SECTOR_BY_CODE.get(code)
    return sector ? (language === 'en' ? sector.labelEn : sector.labelFr).toLowerCase() : code
  }
  const band = SIZE_BANDS.find(entry => entry.code === code)
  return band ? (language === 'en' ? band.labelEn : band.labelFr) : code
}

/**
 * Un candidat remonté par élargissement de COMPÉTENCE est prouvé sur son voisin (son offre EST la preuve) :
 * le filtre « technologies observées » de l'API ne doit pas l'écarter faute de citer la compétence exacte.
 */
export function candidateWidenedBySkill(candidate: {
  readonly widenedBy?: CriteriaWidenedBy | null
  readonly skillEvidence?: { readonly offerCount: number } | null
}): boolean {
  return candidate.widenedBy?.axis === 'skill' && (candidate.skillEvidence?.offerCount ?? 0) > 0
}

/**
 * Lot R (#4519) — les MÉTIERS qu'une expertise du catalogue recrute (« Data & IA » → data engineer, data scientist…),
 * ou `null` : une compétence (« Vue ») ou une expertise sans métier déclaré n'est pas traduite (jamais devinée).
 * Le même tableau que le miroir IA (`expertise_trade_terms`) — un seul endroit (GA-26) pour l'API comme pour l'IA.
 */
export function expertiseTradeTerms(value: string): readonly string[] | null {
  const key = normaliseSkillText(String(value ?? ''))
  if (!key) return null
  const found = EXPERTISE_TRADES.find(entry => entry.labels.some(label => normaliseSkillText(label) === key))
  return found && found.tradeTerms.length > 0 ? found.tradeTerms : null
}

/**
 * Le MIROIR du service IA (`apps/ia/app/knowledge/criteria_referential.json`), généré d'ici et seulement d'ici :
 * `UPDATE_CRITERIA_MIRROR=1 npx vitest run src/schemas/criteria-referential.mirror.test.ts` le réécrit, la même
 * garde sans la variable échoue s'il diverge.
 */
export function criteriaReferentialMirror(): Record<string, unknown> {
  return {
    _generated: 'packages/contracts/src/schemas/criteria-referential.ts — ne pas éditer à la main',
    minResults: CRITERIA_WIDEN_MIN_RESULTS,
    skillDomains: SKILL_DOMAINS,
    expertiseTrades: EXPERTISE_TRADES,
    skillFamilies: SKILL_FAMILIES,
    skills: SKILLS,
    skillWrittenForms: SKILL_WRITTEN_FORMS,
    sectorGroups: Object.fromEntries(APPLICATION_SECTORS.map(sector => [sector.code, sector.group])),
    sectorNeighbours: SECTOR_NEIGHBOURS,
    sizeBands: SIZE_BANDS,
  }
}
