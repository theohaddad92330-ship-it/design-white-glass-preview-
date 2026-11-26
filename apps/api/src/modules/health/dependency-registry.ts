/**
 * #1660 — les onze dépendances de la page Santé, et COMMENT chacune est mesurée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE TOUT LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * « L'état vient d'un TEST RÉEL, jamais d'une déclaration. » C'est la même règle
 * que le produit client applique aux capacités de connecteur — « healthy n'est
 * jamais déclaré, il est dérivé d'un test réel » — et elle a ici une
 * conséquence désagréable qu'on assume : **une dépendance que rien ne teste
 * n'est pas « saine », elle est INCONNUE.**
 *
 * D'où deux façons de mesurer, et jamais une troisième :
 *
 *  - `probe` — une sonde SYNTHÉTIQUE part toutes les cinq minutes (la passe qui
 *    existait déjà, `StatusMonitorService`). C'est un aller-retour réel, avec
 *    sa latence.
 *  - `usage` — aucune sonde ne part, et c'est délibéré : sonder un fournisseur
 *    facturé à l'appel coûterait de l'argent pour apprendre ce que la
 *    production apprend déjà. Leur état vient des analyses RÉELLEMENT exécutées
 *    (`analysis_runs.source_health`), qui est un test réel au sens le plus fort
 *    du terme — c'est un vrai appel, pour un vrai client.
 *
 * ⚠️ **Une capacité ÉTEINTE À DESSEIN n'est pas une capacité en panne.** La
 * règle du dépôt est « sans clé = no-op strict » : un fournisseur dont la clé
 * n'est pas posée ne rend pas le produit malade, il rend une capacité absente.
 * Un écran qui lit ce qui MANQUE sans lire l'INTERRUPTEUR annonce une panne au
 * repos — c'est le défaut nommé dans la mémoire du dépôt, et `envKeys` est ce
 * qui l'empêche : la PRÉSENCE de la clé décide qu'on sonde, et son absence
 * produit « éteinte », pas « en panne ».
 *
 * ⚠️ **La PRÉSENCE, jamais la VALEUR.** Rien de ce fichier ne rend le contenu
 * d'une variable d'environnement, et rien ne doit le faire : le back-office
 * nomme des fournisseurs, il n'affiche aucun secret (garde
 * `aucun-secret-affiche.test.ts`).
 */

/** Les onze, dans l'ordre de lecture : l'infrastructure d'abord, les
 *  fournisseurs ensuite. Un opérateur cherche la panne, pas un inventaire. */
export const DEPENDENCY_IDS = [
  'api',
  'worker',
  'postgres',
  'redis',
  'supabase',
  'claude',
  'apollo',
  'firecrawl',
  'pappers',
  'brave',
  'stripe',
] as const

export type DependencyId = (typeof DEPENDENCY_IDS)[number]

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type DependencyDescriptor = {
  id: DependencyId
  /** Le nom affiché. Une capacité ou un service, jamais un nom de variable. */
  label: string
  /** Ce qui s'arrête quand elle tombe — la phrase qui rend la tuile actionnable. */
  cuts: string
  /**
   * `probe` : une sonde synthétique part toutes les 5 min et sa latence est
   * mesurée. `usage` : l'état vient des appels RÉELS de production.
   */
  measuredBy: 'probe' | 'usage'
  /**
   * Le nom sous lequel la source apparaît dans `analysis_runs.source_health`,
   * pour les dépendances mesurées à l'usage. `null` pour les autres.
   *
   * ⚠️ Il vit ICI et pas dans l'écran : deux tables de correspondance
   * divergeraient, et une tuile se mettrait à lire l'état d'une autre source.
   */
  usageSource: string | null
  /**
   * Les variables dont la PRÉSENCE conditionne la sonde. Vide = rien à
   * configurer, la sonde part toujours.
   *
   * ⚠️ On ne rend jamais ces noms au navigateur : ils servent à décider
   * `off` / `probed`, côté serveur, et rien d'autre.
   */
  envKeys: readonly string[]
}

export const DEPENDENCIES: Readonly<Record<DependencyId, DependencyDescriptor>> = {
  api: {
    id: 'api',
    label: 'API',
    cuts: 'tout le produit — plus aucune requête ne trouve de réponse',
    measuredBy: 'probe',
    usageSource: null,
    envKeys: [],
  },
  worker: {
    id: 'worker',
    label: 'Worker d’analyse',
    cuts: 'les analyses restent en file et n’avancent plus',
    measuredBy: 'probe',
    usageSource: null,
    envKeys: [],
  },
  postgres: {
    id: 'postgres',
    label: 'Postgres',
    cuts: 'toute lecture et toute écriture — le produit est à l’arrêt',
    measuredBy: 'probe',
    usageSource: null,
    envKeys: [],
  },
  redis: {
    id: 'redis',
    label: 'Redis',
    cuts: 'la file d’analyse, le temps réel et les verrous des passes planifiées',
    measuredBy: 'probe',
    usageSource: null,
    envKeys: [],
  },
  supabase: {
    id: 'supabase',
    label: 'Supabase (authentification)',
    cuts: 'la connexion : personne ne peut ouvrir de session',
    measuredBy: 'probe',
    usageSource: null,
    // #1840 — la sonde appelle `/auth/v1/health` avec la clé ANON en en-tête
    // (voir `dependency-probe.service.ts`). `SUPABASE_ANON_KEY` est déjà
    // imposée par `envSchema` (donc jamais absente tant que l'API tourne),
    // mais elle est listée ici quand même — DEUX raisons : c'est le même
    // mécanisme « pas de clé → pas de sonde » que toutes les autres
    // dépendances de ce fichier, et si elle devenait un jour optionnelle
    // ailleurs, son absence ici resterait « éteinte », jamais « en panne ».
    envKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  },
  stripe: {
    id: 'stripe',
    label: 'Stripe',
    cuts: 'les paiements et le renouvellement des abonnements',
    measuredBy: 'probe',
    usageSource: null,
    envKeys: ['STRIPE_SECRET_KEY'],
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    cuts: 'la rédaction, la classification et le plan d’action d’une analyse',
    measuredBy: 'usage',
    usageSource: 'claude',
    envKeys: ['ANTHROPIC_API_KEY'],
  },
  apollo: {
    id: 'apollo',
    label: 'Apollo',
    cuts: 'l’enrichissement des contacts d’un dossier',
    measuredBy: 'usage',
    usageSource: 'apollo',
    envKeys: ['APOLLO_API_KEY'],
  },
  firecrawl: {
    id: 'firecrawl',
    label: 'Firecrawl',
    cuts: 'la lecture des pages du site d’une entreprise analysée',
    measuredBy: 'usage',
    usageSource: 'firecrawl',
    envKeys: ['FIRECRAWL_API_KEY'],
  },
  pappers: {
    id: 'pappers',
    label: 'Pappers',
    cuts: 'les données légales et financières d’une entreprise analysée',
    measuredBy: 'usage',
    usageSource: 'pappers',
    envKeys: ['PAPPERS_API_KEY'],
  },
  brave: {
    id: 'brave',
    label: 'Brave Search',
    cuts: 'la recherche web qui alimente la collecte',
    measuredBy: 'usage',
    usageSource: 'brave',
    envKeys: ['BRAVE_API_KEY'],
  },
}

/**
 * La dépendance est-elle CONFIGURÉE ?
 *
 * ⚠️ Elle lit la présence, jamais la valeur, et une chaîne vide ou blanche
 * compte comme absente : une variable posée à `""` par un tableau de bord de
 * déploiement est le cas le plus fréquent de « configurée sur le papier,
 * inerte en vrai ».
 */
export function isConfigured(descriptor: DependencyDescriptor, env: NodeJS.ProcessEnv = process.env): boolean {
  return descriptor.envKeys.every(key => (env[key] ?? '').trim().length > 0)
}
