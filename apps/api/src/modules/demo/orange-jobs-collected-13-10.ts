/**
 * OFFRES D'EMPLOI ORANGE — collecte RÉELLE du 14/10/2026 (décision Louis, 13/10/2026 : les 12 offres « de démonstration »
 * de la première version de la parité Orange/BPCE étaient inventées, avec des liens `example.org` ; elles sont retirées.
 * 14/10/2026 : « répare et mets les bonnes offres » — collecteurs réparés, nouvelle collecte).
 *
 * Collectées avec les COLLECTEURS EMPLOI DU PRODUIT (`apps/ia/app/services/data_sources/`, clés du service IA injectées par
 * `railway run`, jamais lues ni journalisées), mêmes filtres, mêmes règles (IT / ingénierie, < ~12 mois, dédup par URL,
 * AUCUN STAGE — prédicat unique `internship_posting.py`), jamais un scraping ad hoc. Six raisons sociales essayées (Orange,
 * Orange France, Orange Business, Orange Innovation, Orange Cyberdefense, Orange SA) :
 *  - `apec.py` : HTTP 403 (anti-bot DataDome, `x-datadome: protected`) — non contourné, source coupée (agent_docs/env-reference.md) ;
 *  - `france_travail.py` : 0 offre retenue (la seule remontée est un stage, écartée à la collecte) ;
 *  - `job_aggregators.py` : 36 offres brutes uniques → Adzuna 1, TheirStack 35 (Jooble : HTTP 403, non utilisé) ;
 *  - `job_search.py` / pages carrières : aucune offre dont l'employeur soit Orange.
 * Retenues ci-dessous : 16 des 36, choisies pour couvrir les trois entités (Orange, Orange Business, Orange Cyberdefense) et
 * les métiers (système, infra, data, DevOps, cyber, chefferie de projet, développement) ; AUCUNE n'est inventée ni retouchée
 * (seul l'URL est ramenée à son chemin, sans paramètre de suivi ; une ville tronquée par la source est ramenée à sa commune).
 *
 * Les sources ne rendent PAS le type de contrat (`contract: null` = jamais deviné, aucune mention à l'écran) ni toujours la
 * ville (`city: null`). `published_at` est la date de publication RÉELLE, et le semis en dérive `posted_days_ago` (jours entre
 * la publication et {@link ORANGE_JOBS_COLLECTED_ON}), ré-ancré sur l'ouverture de la salle pour que l'écart ne vieillisse pas.
 */

const ORANGE_JOBS_COLLECTED_ON = '2026-10-14'

type CollectedOrangeJob = {
  title: string
  /** Entité du groupe (Orange, Orange Business…), telle que rendue par la source. */
  entity: string
  /** `null` = la source ne la rend pas. */
  city: string | null
  /** Type de contrat tel que rendu par la source ; `null` = non rendu (jamais deviné). Jamais un stage. */
  contract: string | null
  /** Date de publication RÉELLE, `YYYY-MM-DD`. */
  published_at: string
  /** URL RÉELLE de l'offre (https). */
  url: string
  /** Nom INTERNE de la source (jamais affiché comme fournisseur). */
  source: string
}

export const ORANGE_COLLECTED_JOBS: {
  collected_on: string
  offers: readonly CollectedOrangeJob[]
  /** Offres rendues par les collecteurs puis écartées, avec la raison. Jamais affichées. */
  rejected: readonly { title: string; entity: string; source: string; reason: string }[]
} = {
  collected_on: ORANGE_JOBS_COLLECTED_ON,
  offers: [
    {
      title: 'Ingénieur Système H/F',
      entity: 'Orange',
      city: 'Issy-les-Moulineaux',
      contract: null,
      published_at: '2026-10-10',
      url: 'https://www.adzuna.fr/details/5921531697',
      source: 'adzuna',
    },
    {
      title: 'Data Analyst domaine Etudes F/H',
      entity: 'Orange',
      city: 'Aix-en-Provence',
      contract: null,
      published_at: '2026-10-13',
      url: 'https://orange.phenompeople.net/fr/fr/job/CTS-2026-55036',
      source: 'theirstack',
    },
    {
      title: 'Ingénieur développeur Back PHP devOps',
      entity: 'Orange',
      city: null,
      contract: null,
      published_at: '2026-10-13',
      url: 'https://careers-jobin.icims.com/jobs/2445/ing%C3%A9nieur-d%C3%A9veloppeur-back-php-devops/job',
      source: 'theirstack',
    },
    {
      title: 'Chef de Projet Digital Senior F/H',
      entity: 'Orange',
      city: null,
      contract: null,
      published_at: '2026-10-09',
      url: 'https://careers-jobin.icims.com/jobs/2431/chef-de-projet-digital-senior-f-h/job',
      source: 'theirstack',
    },
    {
      title: 'Ingénieur Data confirmé F/H',
      entity: 'Orange',
      city: null,
      contract: null,
      published_at: '2026-10-09',
      url: 'https://careers-jobin.icims.com/jobs/2619/ing%C3%A9nieur-data-confirm%C3%A9-f-h/job',
      source: 'theirstack',
    },
    {
      title: 'Ingénieur Data sénior F/H',
      entity: 'Orange',
      city: null,
      contract: null,
      published_at: '2026-10-09',
      url: 'https://careers-jobin.icims.com/jobs/2620/ing%C3%A9nieur-data-s%C3%A9nior-f-h/job',
      source: 'theirstack',
    },
    {
      title: 'Développeur Full Stack Senior F/H',
      entity: 'Orange',
      city: null,
      contract: null,
      published_at: '2026-10-09',
      url: 'https://careers-jobin.icims.com/jobs/2332/d%C3%A9veloppeur-full-stack-senior-f-h/job',
      source: 'theirstack',
    },
    {
      title: 'Chef de Projet Data/Digital Senior F/H',
      entity: 'Orange',
      city: null,
      contract: null,
      published_at: '2026-10-09',
      url: 'https://careers-jobin.icims.com/jobs/2413/chef-de-projet-data-digital-senior-f-h/job',
      source: 'theirstack',
    },
    {
      title: 'Administrateur Infrastructure en Virtualisation F/H',
      entity: 'Orange Business',
      city: 'Cesson-Sévigné',
      contract: null,
      published_at: '2026-10-06',
      url: 'https://orange.phenompeople.net/fr/fr/job/IOS-2026-2730',
      source: 'theirstack',
    },
    {
      title: 'Data Engineer Microsoft Senior H/F',
      entity: 'Orange Business',
      city: 'Courbevoie',
      contract: null,
      published_at: '2026-10-07',
      url: 'https://www.linkedin.com/jobs/view/4375222538/',
      source: 'theirstack',
    },
    {
      title: 'Tech Lead Data – Python F/H',
      entity: 'Orange Business',
      city: 'Niort',
      contract: null,
      published_at: '2026-10-01',
      url: 'https://www.linkedin.com/jobs/view/4453423608/',
      source: 'theirstack',
    },
    {
      title: 'Consultant DevOps / Platform Engineer',
      entity: 'Orange Business',
      city: 'Marseille',
      contract: null,
      published_at: '2026-09-24',
      url: 'https://www.linkedin.com/jobs/view/4469761356/',
      source: 'theirstack',
    },
    {
      title: 'Architecte Applicatif Azure F/H',
      entity: 'Orange Business',
      city: 'Nanterre',
      contract: null,
      published_at: '2026-09-23',
      url: 'https://www.linkedin.com/jobs/view/4375534533/',
      source: 'theirstack',
    },
    {
      title: 'Expert DevOps F/H',
      entity: 'Orange Business',
      city: 'Balma',
      contract: null,
      published_at: '2026-09-21',
      url: 'https://www.linkedin.com/jobs/view/4373470652/',
      source: 'theirstack',
    },
    {
      title: 'Analyste SOC',
      entity: 'Orange Cyberdefense',
      city: "Villeneuve-d'Ascq",
      contract: null,
      published_at: '2026-10-07',
      url: 'https://api.mytalentplug.com/job/v1/joboffer/redirect?id=23440b76-3833-49bc-8271-73cef5698c83',
      source: 'theirstack',
    },
    {
      title: 'Consultant Senior en Cybersécurité F/H',
      entity: 'Orange Cyberdefense',
      city: 'Paris',
      contract: null,
      published_at: '2026-09-29',
      url: 'https://www.linkedin.com/jobs/view/4422895718/',
      source: 'theirstack',
    },
  ],
  rejected: [
    {
      title: "Stage - Conception et développement d'un orchestrateur à Orange F/H",
      entity: 'Orange SA',
      source: 'france_travail',
      reason: 'stage (règle Louis : aucun stage) et aucun lien rendu par le collecteur',
    },
  ],
}
