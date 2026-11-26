import { ANALYSIS_TRACKING_DEFINITION_KEY } from './copilot-card-catalog'

/**
 * #1952 — LES SEPT TRAVAUX LONGS, NOMMÉS À UN SEUL ENDROIT.
 *
 * « Certaines actions prennent plusieurs minutes : analyse complète ;
 * enrichissement de nombreux contacts ; matching massif ; import de documents ;
 * génération de plusieurs CV ; export ; recherche multi-sources. La conversation
 * ne doit pas rester bloquée ni prétendre que tout est terminé. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE DU 14/09/2026 A TROUVÉ — ET POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un seul de ces sept travaux est, aujourd'hui, à la fois ASYNCHRONE et
 * LANÇABLE DEPUIS LA CONVERSATION : l'analyse de compte. Elle est déjà suivie
 * (#1943.5 — `trackAnalysisLaunch`, `ANALYSIS_TRACKING_DEFINITION_KEY`). Les six
 * autres ne sont pas « oubliés » : chacun est soit synchrone dans sa requête,
 * soit sans outil de conversation pour le déclencher, et la raison est ÉCRITE
 * ci-dessous — sur le motif de `demo-coverage.ts`, où une entrée est soit
 * couverte, soit vide à dessein AVEC sa raison.
 *
 * Sans ce registre, la prochaine lecture de #1952 refait le même relevé : elle
 * grep les files BullMQ, les endpoints, les outils du service IA, et retrouve
 * les mêmes six « non, et voilà pourquoi ». C'est ce coût-là que ce fichier
 * paie une fois.
 *
 * ⚠️ Ce fichier ne DÉCIDE rien : rendre un de ces six travaux suivi depuis la
 * conversation demande un outil côté service IA (donc `apps/ia/app/`), une route
 * de lancement sur le pont, et — pour les trois travaux facturés (enrichissement,
 * export, CV) — un arbitrage de facturation. Aucun des trois ne se code depuis
 * ici.
 *
 * Pur : aucune base, aucun service (GA-07).
 */

export const LONG_JOB_KEYS = [
  'account_analysis',
  'bulk_contact_enrichment',
  'bulk_matching',
  'document_import',
  'cv_generation',
  'data_export',
  'multi_source_search',
] as const

export type LongJobKey = (typeof LONG_JOB_KEYS)[number]

type LongJobSpec = {
  /** Le nom du TRAVAIL tel qu'un humain le lit (#1952.18), dans les deux langues de l'app. */
  name: { fr: string; en: string }
  /** #1952.34 — la page qui POSSÈDE le résultat. Une route réelle de l'app, jamais un écran deviné. */
  resultScreen: string
  /**
   * La clé persistée (`workflow_runs.definition_key`) sous laquelle le travail
   * est suivi depuis la conversation. `null` = il ne l'est pas.
   */
  trackingDefinitionKey: string | null
  /**
   * Le travail publie-t-il des ÉTAPES RÉELLEMENT FRANCHIES ? C'est la condition
   * pour afficher un avancement : sans étapes mesurées, la carte dit « en
   * cours » et rien d'autre (#1952.35 — jamais de faux pourcentage).
   */
  publishesMeasuredProgress: boolean
  /** Pourquoi ce travail n'est PAS suivi depuis la conversation. `null` quand il l'est. */
  notTrackedReason: string | null
}

export const LONG_JOB_SPECS: Record<LongJobKey, LongJobSpec> = {
  account_analysis: {
    name: { fr: 'Analyse', en: 'Analysis' },
    resultScreen: '/accounts',
    trackingDefinitionKey: ANALYSIS_TRACKING_DEFINITION_KEY,
    // Les quatre points de contrôle de phase (`PROGRESS_PHASES`) : une ligne
    // existe si et seulement si l'écriture de cette phase a été validée.
    publishesMeasuredProgress: true,
    notTrackedReason: null,
  },
  bulk_contact_enrichment: {
    name: { fr: 'Enrichissement de contacts', en: 'Contact enrichment' },
    resultScreen: '/contacts',
    trackingDefinitionKey: null,
    publishesMeasuredProgress: false,
    notTrackedReason:
      'La file d’enrichissement existe et elle est asynchrone, mais UN job = UN contact : aucun endpoint ni DTO n’en prend plusieurs. #2434.56 (épopée #3579) : Laura PROPOSE désormais un lot de 1 à 10 contacts (`propose_bulk_enrichment`, coût total annoncé comme plafond) — le clic rejoue la route unitaire contact par contact, facturée au contact RÉSOLU, jamais un job de lot persisté. Rien à suivre par carte : l’avancement est le compte rendu de la carte elle-même.',
  },
  bulk_matching: {
    name: { fr: 'Matching', en: 'Matching' },
    resultScreen: '/consultants',
    trackingDefinitionKey: null,
    publishesMeasuredProgress: false,
    // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — LE MATCHING MASSIF EST
    // DEVENU ASYNCHRONE : `BulkMatchingWorker`, file BullMQ `bulk-matching`,
    // table `bulk_matching_jobs` qui avance besoin par besoin (isolation par
    // besoin, #2293.7). `POST needs/match/bulk` lance un LOT, suivi par
    // `bulk-matching:progress` (Socket.IO). Aucun outil de conversation ne le
    // LANCE encore — `trackingDefinitionKey` reste `null` pour cette raison
    // précise, plus aucune autre : l'architecture qui manquait est construite.
    notTrackedReason:
      'Le matching UNITAIRE reste synchrone (`run_matching` reçoit le classement dans le tour) — inchangé. Le matching MASSIF a désormais sa file asynchrone persistée (#1952.3, `POST needs/match/bulk`) et Laura en PROPOSE désormais le lancement (`propose_long_job`, #1952.3, lot P07 30/09) — le clic du commercial le lance par la route de l’écran. `trackingDefinitionKey` reste `null` : la carte de proposition est une carte d’ÉCRAN, jamais persistée comme run gouverné (`workflow_runs`), donc rien à suivre par carte ici ; l’avancement se lit sur le job lui-même.',
  },
  document_import: {
    name: { fr: 'Import de documents', en: 'Document import' },
    resultScreen: '/settings/imports',
    trackingDefinitionKey: null,
    publishesMeasuredProgress: false,
    // #2326.12 (épopée #2794, 26/09/2026) — L'IMPORT DE CV EN MASSE EST DEVENU
    // ASYNCHRONE (`cv-batch-import.worker.ts`, file BullMQ `cv-batch-import`,
    // ligne `cv_batch_import_jobs` qui avance à chaque fichier) : la moitié de
    // la raison ci-dessous (« s'exécute DANS la requête ») ne tient plus pour
    // ce chemin-là. Elle reste vraie pour les AUTRES imports de documents
    // (contacts, comptes) — `git grep BullModule` dans leurs modules rend
    // toujours 0.
    //
    // #1952.4 (épopée #2844, lot V15 28/09) — Laura LIT ce job
    // (`get_import_overview` → `cv_batch_jobs`, `CvBatchImportService.
    // listRecentJobs`, relayé par `laura/import-overview`) : elle peut dire
    // où en est un import de CV en lot déjà lancé depuis l'écran.
    //
    // #1952.4 (épopée #2844, lot SRC5 28/09 soir) — Laura peut désormais
    // OUVRIR le dépôt PRÉ-CIBLÉ (`propose_guided_action` → `open_screen` →
    // `/consultants?importCv=true`, catalogue `DEEP_LINK_SCREENS` côté
    // service IA), qui ouvre `CvZipImportDialog` directement — le job part
    // de CE dépôt, au clic humain qui dépose le fichier. La conversation ne
    // transporte toujours AUCUN fichier — absence STRUCTURELLE inchangée,
    // et c'est pour ça que `trackingDefinitionKey` reste `null` : ce champ
    // nomme le suivi par CARTE GOUVERNÉE (`workflow_runs.definition_key`,
    // comme `account_analysis`), qu'ouvrir un dépôt n'est pas — `open_screen`
    // est une carte de NAVIGATION (`copilot-card-catalog.ts`), jamais persistée.
    notTrackedReason:
      'L’import de CV en masse a son propre job asynchrone persisté (#2326.12), Laura peut LIRE son état (`get_import_overview`) et LANCER le dépôt pré-ciblé (`open_screen` → `/consultants?importCv=true`, #1952.4) — mais aucun outil de conversation ne dépose le fichier lui-même : structurellement, la conversation ne transporte toujours aucun fichier, donc aucune carte gouvernée à suivre ici. Les autres imports de documents (contacts, comptes) restent, eux, synchrones dans leur requête.',
  },
  cv_generation: {
    name: { fr: 'Génération de CV', en: 'CV generation' },
    resultScreen: '/consultants',
    trackingDefinitionKey: null,
    publishesMeasuredProgress: false,
    // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — LA RÉÉCRITURE (le geste
    // facturé `cv_rewrite`, `ConsultantsService.rewriteCv`) EST DEVENUE
    // ASYNCHRONE EN LOT : `BulkCvRewriteWorker`, file BullMQ
    // `bulk-cv-rewrite`, table `bulk_cv_rewrite_jobs` qui avance consultant
    // par consultant (isolation, #2293.7). `POST consultants/cv-rewrite/bulk`
    // lance un LOT sur UN besoin, suivi par `bulk-cv-rewrite:progress`
    // (Socket.IO). L'arbitrage de facturation cité ci-dessous ne bloque plus :
    // chaque succès débite EXACTEMENT 1 crédit `cv_rewrite`, aucun prix de
    // lot inventé (#1952.2 reste `H`, hors de cette tranche). Aucun outil de
    // conversation ne LANCE encore le lot — `trackingDefinitionKey` reste
    // `null` pour cette seule raison désormais.
    notTrackedReason:
      'La réécriture UNITAIRE reste synchrone (`POST :id/cv-rewrite`) — inchangé. La réécriture EN LOT a désormais sa file asynchrone persistée (#1952.5, `POST consultants/cv-rewrite/bulk`), débitant 1 crédit `cv_rewrite` par consultant réussi — mais aucun outil de conversation ne la lance : câbler ce lancement depuis le chat reste à faire. La composition du dossier de compétences (`CvStudioService.generate`, sans appel modèle) reste, elle, hors de ce point : ce n’est pas le geste facturé.',
  },
  data_export: {
    name: { fr: 'Export', en: 'Export' },
    resultScreen: '/settings/data',
    trackingDefinitionKey: null,
    publishesMeasuredProgress: false,
    // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — L'EXPORT DU VIVIER ENTIER
    // EST DEVENU UN JOB : `BulkExportWorker`, file BullMQ `bulk-export`, table
    // `bulk_export_jobs` (`POST talents/export/bulk`, suivi par
    // `bulk-export:progress`, récupéré via `GET .../download` une fois
    // `done`). Les AUTRES exports (ATS borné, CSV client-side, `file_export`
    // en conversation) restent synchrones, inchangés — pas ce que ce point
    // couvrait.
    notTrackedReason:
      'L’export du vivier ENTIER a désormais sa file asynchrone persistée (#1952.6, `POST talents/export/bulk`) mais aucun outil de conversation ne le lance : câbler ce lancement depuis le chat reste à faire. L’export ATS borné et l’export en conversation d’un tableau déjà construit (`file_export`) restent, eux, synchrones — c’est leur nature, pas un manque.',
  },
  multi_source_search: {
    name: { fr: 'Recherche multi-sources', en: 'Multi-source search' },
    resultScreen: '/accounts',
    trackingDefinitionKey: null,
    publishesMeasuredProgress: false,
    // #1952.7 (épopée #2844, lot SRC5 28/09 soir) — « CHERCHER HORS VIVIER »
    // (#2818, `ExternalSourcingService.search`) EST DEVENUE ASYNCHRONE elle
    // aussi : `MultiSourceSearchWorker`, file BullMQ `multi-source-search`,
    // table `multi_source_search_jobs` qui avance SOURCE PAR SOURCE
    // (`POST needs/:needId/external-sourcing/search/bulk`, suivi par
    // `multi-source-search:progress`). C'EST UNE SECONDE COLLECTE
    // MULTI-SOURCES, DISTINCTE de celle de l'analyse de compte (déjà suivie
    // par SA propre carte, `account_analysis` ci-dessus) — même vocabulaire
    // de point (#1952.7), deux systèmes réels. Aucun outil de conversation ne
    // lance encore celle-ci.
    notTrackedReason:
      '« Chercher hors vivier » a désormais sa file asynchrone persistée (#1952.7, `POST needs/:needId/external-sourcing/search/bulk`) mais Laura en PROPOSE désormais le lancement (`propose_long_job`, #1952.7, lot P07 30/09) — le clic lance la route `search/bulk` ; la carte de proposition n’est pas persistée comme run gouverné, d’où `trackingDefinitionKey: null`. La collecte multi-sources de l’analyse de compte reste, elle, suivie par sa propre carte (`account_analysis`) — un système distinct. Les recherches de la conversation qui lisent de la mémoire déjà collectée répondent toujours dans le tour.',
  },
}

/** Les travaux réellement suivis depuis la conversation — lus, jamais recomptés à la main. */
export function longJobTrackedFromChat(): LongJobKey[] {
  return LONG_JOB_KEYS.filter(key => LONG_JOB_SPECS[key].trackingDefinitionKey !== null)
}

/**
 * #1952.20/21 et #1952.35 — LA PHRASE D'AVANCEMENT, OU RIEN.
 *
 * Rend `null` dès que l'avancement n'est pas ÉTABLI, et c'est le cœur de la
 * règle : `done = 0` n'est PAS « le travail n'a rien fait ». La lecture des
 * points de contrôle rend une liste vide dans DEUX situations qu'elle ne
 * distingue pas — aucune phase franchie, et lecteur absent ou en échec. « 0 sur
 * 4 » affirmerait la première ; « en cours » est vrai dans les deux.
 *
 * Pure : mêmes entrées, même phrase. `done > total` est une lecture qui se
 * contredit — on ne publie pas une phrase fausse pour ne pas rester muet.
 */
export function longJobProgressSentence(spec: LongJobSpec, done: number | null, total: number | null): string | null {
  if (!spec.publishesMeasuredProgress) return null
  if (done === null || total === null) return null
  if (!Number.isFinite(done) || !Number.isFinite(total)) return null
  if (total <= 0 || done <= 0 || done > total) return null
  const step = done > 1 ? 'étapes' : 'étape'
  const finished = done > 1 ? 'terminées' : 'terminée'
  return `${spec.name.fr} en cours — ${done} ${step} sur ${total} ${finished}.`
}

/**
 * #1952.17 — LA PHRASE D'ISSUE D'UNE ANALYSE SUIVIE, À UN SEUL ENDROIT (GA-26).
 *
 * Trois issues terminales, trois phrases — et le mot « échoué » ne s'écrit que
 * d'un ÉCHEC. Une analyse que l'utilisateur a arrêtée
 * (`AnalysisService.cancelByUser`) n'a pas échoué : la dire échouée invitait à
 * relancer, donc à REDÉBITER un travail dont le crédit vient justement d'être
 * rendu.
 *
 * `refundedInFull` est un fait OBSERVÉ au registre, jamais une supposition : à
 * défaut de l'avoir lu, la phrase dit que le remboursement n'est pas observé —
 * elle ne le promet pas, et ne le nie pas non plus.
 *
 * Pure : mêmes entrées, même phrase. Le semis de démonstration l'appelle aussi,
 * pour qu'une salle de démonstration ne montre jamais une formulation que le
 * produit n'écrit plus.
 */
export function analysisSettlementSentence(outcome: 'done' | 'failed' | 'cancelled', refundedInFull: boolean): string {
  if (outcome === 'done') return 'Analyse terminée.'
  const head = outcome === 'cancelled' ? 'Analyse annulée' : 'L’analyse a échoué'
  return refundedInFull
    ? `${head} — les crédits ont été remboursés.`
    : `${head} — remboursement non observé à ce stade.`
}

/**
 * #1952.32 (#2844) — LA LIGNE « À VÉRIFIER » D'UN CONTACT, SUR LE SEUL SIGNAL
 * DE CONFIANCE RÉEL QUE `contacts` PORTE AUJOURD'HUI (`email_confidence`,
 * #2120.68 : `high` | `medium` | `low`, jamais une probabilité).
 *
 * `null` (non mesurée) et `high` (vérifiée) rendent `null` — PAS de ligne :
 * une confiance non mesurée ne se lit jamais « à vérifier », ce serait deviner
 * l'inverse de ce que « non mesuré » veut dire (GA-18/19).
 *
 * Pure, appelée par `CopilotCardService.settleAnalysisTracking` (le résultat
 * réel) ET par `DemoSeedService` (le semis) — un libellé, un seul endroit
 * (GA-26).
 */
export function contactVerificationLine(fullName: string, emailConfidence: string | null): string | null {
  if (emailConfidence === 'medium') return `${fullName} — e-mail trouvé, non confirmé`
  if (emailConfidence === 'low') return `${fullName} — e-mail deviné, à confirmer`
  return null
}
