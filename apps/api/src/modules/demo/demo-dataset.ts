import { demoRouteEvidenceOf } from './demo-route-evidence'
import {
  CHAT_ATTACHMENT_CATEGORY,
  creditCostOf,
  DEMO_PERSONA_FIRST_NAME,
  FEEDBACK_VERDICTS,
  inferPlacedRoles,
} from '@bellum/contracts'
import { DEMO_ORG_DOCUMENT, demoOrgDocumentContent } from './demo-org-document'
import { buildHistoricalNeeds, readSignalLayers } from '@bellum/contracts'
import type { CrmReadStatus, GroupPerimeter, IntegrationExchange } from '@bellum/contracts'
import type {
  AnalysisScopeSelection,
  DiscoverOriginCriteria,
  CommercialBrief,
  RagDocumentScope,
  RagProcessingStatus,
  CallDebrief,
  CallNextAction,
  CallOutcome,
  ConsultantAbsenceKind,
  ItChallenge,
  MemoryItemKind,
  MemoryItemObjectType,
  OutgoingPaymentStatus,
  PlanPhase,
  ProfileContext,
  QualifiedHypothesis,
  RecentSignal,
  SiteFrance,
  SprintLevel,
  TeamPolicy,
} from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { densifiedContactsFor, type DemoApolloEnrichment } from './demo-contact-density'
import type { DemoDocumentSourceFormat } from './demo-document-files'
import { withDemoOrgCoverage } from './demo-org-graph'
import { sncfOrgGraph, societeGeneraleOrgGraph } from './demo-org-graphs'
import { withDemoDossierRead } from './demo-dossier-read-seed'
import { DEMO_OCCITANIE_COMPANY, DEMO_OCCITANIE_CONTACTS, DEMO_OCCITANIE_ZONE_LABEL } from './demo-occitanie-dossier'
import { demoDataforgeAccessOf } from './demo-dataforge-access'
import { demoHistoricalNeedsOf } from './demo-historical-needs'
import { ANALYSED_ACCOUNT_FILES, analysedContactSeed, type AnalysedAccountFile } from './demo-analysed-accounts'
import { DEMO_BPCE_REAL_CONTACTS_COMPANY } from './bpce-csv-mapping'
import { buildReferenceDossier } from './bpce-reference-dossier'
import { BPCE_ROWS, BPCE_SEED } from './bpce-seed'
import { DEMO_ORANGE_COMPANY, orangeEntityCountry } from './orange-csv-mapping'
import { ORANGE_SEED } from './orange-seed'
import { orangePublicSignals } from './orange-public-complement'
import {
  ORANGE_BUSINESS_DESCRIPTION,
  ORANGE_DECISION_CHAIN,
  ORANGE_DETECTED_TECH_STACK,
  ORANGE_IT_IMPLICATIONS,
  ORANGE_ORG_UNITS,
  orangeAttackAngles,
  orangeEcosystem,
  orangeFinancialIndicators,
  orangeItChallenges,
  orangeOpportunityDomains,
  orangePains,
  orangePrograms,
  ORANGE_DATA_CONFIDENCE,
  orangeCompetitors,
  orangeDossierRead,
  orangeReliabilityNotes,
  orangeTechnologyStack,
  orangeStructuralAxes,
} from './orange-public-reading'
import { bpceOrgGraph } from './demo-org-graph-bpce'
import {
  COMMERCIAL_BRIEF_BY_COMPANY,
  COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY,
  briefActionPlanWeeks,
  briefAttackAngles,
  briefItChallenges,
  briefContactSeeds,
  withoutProbableDuplicates,
  commercialBriefOf,
  briefHeadquarters,
  briefOrgGraph,
  briefScoreFactors,
  briefSitesFrance,
  mergeBriefSignals,
  normalizePersonName,
} from './commercial-brief-seed'
import { SG_COMPTE_COMPLET_CSV } from './data/sg-compte-complet.generated'
import { parseCompteCsvRows } from './compte-csv-parser'
import { seatName, seatNameOrNull } from './demo-seat-names'
import {
  buildSgFamilyRoleSeats,
  mapSgAiApplications,
  mapSgDataReliabilityNotes,
  mapSgDecisionChainSteps,
  mapSgDetectedTechStack,
  mapSgEcosystemThirdParties,
  mapSgEntities,
  mapSgFinancialIndicators,
  mapSgGovernanceContacts,
  mapSgOpportunityDomains,
  mapSgOrgUnits,
  mapSgProgramNames,
  mapSgSitesFrance,
  mapSgStructuralReadingAxes,
} from './sg-csv-mapping'
import {
  mapSgContactTechnologyCounts,
  mapSgEsnPartners,
  mapSgJobFamilyNote,
  mapSgNeedAnnotations,
} from './sg-csv-complement'
import {
  DEMO_QUALIFICATION_ACCOUNT,
  DEMO_QUALIFICATION_GRID_PLACEHOLDER_ID,
  demoQualificationSnapshot,
} from './demo-qualification-seed'

/**
 * Le jeu de démonstration — SOCIÉTÉS RÉELLES.
 *
 * Il portait trois sociétés inventées (Groupe Helios, NovaSanté, Altiver). Elles
 * ont été remplacées par de vraies sociétés (décision Louis, 10-11/08/2026). La
 * raison est commerciale : un prospect à qui on montre « Groupe Helios » ne peut
 * rien vérifier, donc rien croire. Un prospect à qui on montre un compte qu'il
 * connaît reconnaît les faits, et juge le produit sur ce qu'il sait déjà.
 *
 * Décision Louis du 01/10/2026 : la salle ne garde que les comptes CIBLES —
 * Société Générale, Groupe BPCE, SNCF (ENGIE, TotalEnergies et Alstom arrivent
 * par un autre lot). Les quatre autres comptes réels de l'ancien jeu sont
 * retirés ; ce qu'ils portaient est re-semé sur les comptes qui restent.
 *
 * ⚠️ CE QUI CHANGE TOUT : le lien de démonstration est PUBLIC. Ce qui s'affiche
 * ici est lu par des inconnus et, potentiellement, par les sociétés nommées.
 * D'où la règle qui gouverne ce fichier entier :
 *
 *   **Aucune donnée inventée sur une société réelle.** Ce qui n'est pas issu
 *   d'un run réel ou d'une source publique citable ne s'écrit pas.
 *
 * Trois conséquences concrètes, qui expliquent des choix qui surprendraient
 * autrement :
 *
 * 1. **Aucune coordonnée sur une personne RÉELLE.** Les personnes nommées
 *    ci-dessous viennent du registre du commerce : pas d'e-mail, pas de
 *    téléphone, pas d'URL de profil. Un run réel en enrichit de vraies ; les
 *    publier serait une diffusion de données personnelles, et une adresse « en
 *    `.example` » ne règlerait rien — ce serait une donnée inventée attribuée à
 *    quelqu'un qui existe.
 *
 * 1bis. **Des interlocuteurs SIMULÉS portent les coordonnées** (DEMO-02,
 *    arbitrage Louis du 17/08). Le jeu s'arrêtait juste avant ce qu'un prospect
 *    vient voir — quelqu'un à qui écrire —, et une démonstration qui ne montre
 *    jamais le bout de la chaîne ne vend pas. `demo-contact-density.ts` ajoute
 *    donc des personnes qui n'existent pas, avec des adresses en `.example`
 *    (RFC 2606, non routables) et des numéros dans la plage `06 39 98 xx xx`
 *    réservée à la fiction. Inventer une personne n'est pas inventer une donnée
 *    SUR une personne : rien n'est attribué à quelqu'un de réel, et rien de ce
 *    qui est écrit ne peut atteindre qui que ce soit.
 * 2. **Aucun portrait, aucun logo.** On ne dessine pas le visage d'une personne
 *    réelle, et on ne redessine pas la marque d'un tiers. `photo_url` et
 *    `logo_url` valent `null`, et l'interface affiche le monogramme qu'elle
 *    affiche déjà pour tout compte sans logo résolu.
 *
 *    ⚠️ **Ce refus a un LECTEUR DE PLUS depuis le 04/09/2026** (#1350, #1363) :
 *    la liste des missions dessine l'avatar de chaque consultant en poste, et
 *    la lentille « Renouvellements » avec elle. En démonstration, ces avatars
 *    montrent donc le MONOGRAMME, jamais une photo — c'est vide À DESSEIN, et
 *    la raison est celle-ci, pas un semis oublié. Ce qui se recette en
 *    production est la photo ; ce qui se montre en démonstration est le repli,
 *    qui est le cas le plus fréquent chez un vrai client avant enrichissement.
 *
 *    ⚠️ **Ce refus a un LECTEUR DE PLUS depuis le 25/09/2026** (#2097.21) :
 *    la carte de priorité d'« Aujourd'hui » (`PriorityCard.tsx`) dessine
 *    désormais le logo du compte mentionné (`businessObject.logoUrl`,
 *    `demo-briefing.ts`). En démonstration, `logoUrl` reste `null` — même
 *    monogramme que partout ailleurs, jamais la marque d'un tiers redessinée.
 *
 *    ⚠️ **Correctif du 25/09/2026 (même #2097.21)** : `logoUrl` seul ne
 *    suffisait pas — c'est le logo Apollo PERSISTÉ, presque toujours vide, et
 *    aucune des cartes (« comptes qui ont bougé », « alertes de Découvrir »,
 *    priorités) ne montrait jamais d'image en recette. `website` s'ajoute
 *    donc partout où `logoUrl` vit (`businessObject`, `accountsToWatch`), et
 *    N'EST PAS soumis à cette même règle : un favicon réellement servi par le
 *    site n'est pas « la marque d'un tiers redessinée », c'est ce que ce
 *    site sert publiquement à quiconque (même relais que `/accounts`,
 *    `LogoController`). Les cinq dossiers de la salle portent donc leur VRAI
 *    site (SNCF…) jusqu'au brief, exactement comme `/accounts` le
 *    fait déjà — seul `logo_url` reste `null` à dessein.
 *
 *    ⚠️ La liste de ces lecteurs se tient À JOUR. Une justification « vide à
 *    dessein » dont on ne sait plus qui la subit finit par couvrir un vrai
 *    oubli — c'est ainsi qu'un écran livré se découvre vide en réunion.
 * 3. **Deux sortes de contacts, jamais une troisième.** Les personnes NOMMÉES
 *    viennent du registre du commerce ou d'une annonce publique citée, avec
 *    leur fonction exacte. Tout le reste est un RÔLE sans personne
 *    (`full_name: ''`), que l'interface affiche « Rôle à identifier » — c'est
 *    d'ailleurs exactement ce qu'un vrai run produit sur un grand compte froid
 *    avant enrichissement.
 *
 * Ce qui reste écrit par nous, et l'assume : les ANGLES, le PLAN et les
 * MESSAGES. Ce ne sont pas des faits sur la société, ce sont les propositions
 * d'une ESN — la même chose que ce que le produit génère. Chacune s'appuie sur
 * un fait cité juste au-dessus d'elle.
 *
 * Les SHAPES sont inchangées : `account` = colonnes `accounts` + `raw_analysis`
 * en snake_case (mêmes clés qu'`accountAnalysisSchema`), `contacts` = colonnes
 * que les phases 2/3 écrivent, `attackAngles` = lignes `attack_angles`,
 * `actionPlan.weeks` = `PlanPhase[]` de la phase 4.
 */

/* ------------------------------------------------------------------ */
/* Provenance — chaque fait de ce fichier cite d'où il vient           */
/* ------------------------------------------------------------------ */

/**
 * Le relevé du registre. Une date FIXE, et non « aujourd'hui » : ces chiffres
 * ont été collectés ce jour-là (`node scripts/collect-demo-facts.mjs`), et
 * afficher une date glissante laisserait croire qu'ils sont rafraîchis.
 */
const REGISTRY_SOURCE = 'Annuaire des entreprises (INSEE/RNE) — relevé du 11/08/2026'
const REGISTRY_DATE = '2026-08-11'

/** Les annonces légales, deuxième source publique gratuite du dossier. */
const BODACC_SOURCE = 'BODACC (annonces légales, DILA)'

/**
 * Théo A (Louis 22/10) — la source d'un signal de démo avait été pointée vers la page d'ACCUEIL réelle de son éditeur.
 * Refusion R23 : la garde `demo-signal-source-links.spec.ts` (#3922.8) tient le contraire — TOUT lien de démo vit sous
 * le domaine RÉSERVÉ `example.org/demo/` (RFC 2606), jamais un faux lien vers un vrai site. La donnée suit la garde :
 * la table reste, vide, pour qu'un éditeur ne puisse être rebranché qu'en changeant la garde, pas en la contournant.
 * Les offres d'emploi gardent de toute façon un lien distinct (#4031).
 */
const DEMO_PUBLISHER_PAGES: Readonly<Record<string, string>> = {}

/**
 * #3922.8 — le lien de démonstration d'un signal. Le genre nomme le libellé du lien affiché
 * (« Voir l'annonce BODACC », « Voir l'article »…).
 */
export function demoSourceUrl(kind: 'press' | 'bodacc' | 'job' | 'official', slug: string): string {
  // Une OFFRE d'emploi garde son lien propre : une page d'accueil commune ferait des huit offres d'un groupe un seul lien.
  const publisher = kind === 'job' ? null : (DEMO_PUBLISHER_PAGES[slug] ?? null)
  return publisher ?? `https://example.org/demo/${kind}/${slug}`
}

/** Ce que le pipeline a réellement collecté pendant les runs du 10/08/2026. */
const RUN_DATE = '2026-08-10'

/**
 * #4526.4 / #4527.5 — les contacts de la salle d'ORIGINE CRM (`contacts.source = 'crm'`), pour que la puce
 * « Mon CRM » du Répertoire ait de quoi compter en démonstration. Tous les autres restent `demo` : un contact
 * fictif ne passe jamais pour une provenance réelle, sauf ceux-ci, nommés ici et lus par une seule fonction.
 */
export const DEMO_CRM_ORIGIN_CONTACT_NAMES = ['Lorenzo Bini Smaghi', 'Pierre Palmieri', 'Maxime Delaunay'] as const

/**
 * #4597.1 — les contacts de la salle venus d'un FICHIER (`contacts.source = 'import'`), pour que la puce
 * « Importés » du Répertoire ait de quoi compter en démonstration. Distincts des contacts CRM ci-dessus : depuis
 * #4597.2 la puce « Mon CRM » ne compte plus que le CRM.
 */
export const DEMO_IMPORTED_CONTACT_NAMES = ['Younes Berrada', 'Inès Morvan', 'Thibault Revel'] as const

/**
 * #4678-#4680 — les contacts CONNUS (`contacts.source = 'import'`) du compte versé par un fichier (Kiabi) : des personnes
 * SIMULÉES, écrites dans `DENSITY.Kiabi` (`demo-contact-density.ts`). Un contact importé est une relation : bloc
 * « Connu » en tête de la liste, place dans l'organigramme, présence. Le premier est un DSI en doublon probable avec
 * le DSI DÉDUIT du graphe ; le second, un acheteur, est épinglé hors de l'arbre.
 */
export const DEMO_IMPORTED_ACCOUNT_CONTACT_NAMES = ['Sofiane Marchetti', 'Hugo Lenormand'] as const

export function demoContactSource(fullName: string): 'crm' | 'import' | 'demo' {
  if ((DEMO_CRM_ORIGIN_CONTACT_NAMES as readonly string[]).includes(fullName)) return 'crm'
  if ((DEMO_IMPORTED_ACCOUNT_CONTACT_NAMES as readonly string[]).includes(fullName)) return 'import'
  return (DEMO_IMPORTED_CONTACT_NAMES as readonly string[]).includes(fullName) ? 'import' : 'demo'
}

type DemoContact = {
  /**
   * Vide pour un RÔLE sans personne identifiée. L'interface affiche alors le
   * titre + le badge « Rôle à identifier » (`contactDisplayIdentity`), ce qui
   * est l'état réel d'un grand compte froid non enrichi. Inventer un prénom
   * pour « faire vivant » attribuerait une identité à personne.
   */
  full_name: string
  /**
   * `null` sur TOUS les contacts de ce jeu : ce sont des personnes réelles, et
   * un portrait dessiné serait un visage fabriqué. L'interface retombe sur le
   * monogramme, comme pour n'importe quel contact sans photo.
   */
  photo_url: string | null
  title: string
  entity: string
  family: string
  /** `null` (12/10/2026) : un contact des comptes analysés dont l'analyse n'a posé aucun rôle — jamais un rôle deviné. */
  decision_role: string | null
  /** `null` (12/10/2026) : non classé par l'analyse, il se trie en dernier — jamais un rang inventé. */
  priority: number | null
  /**
   * `null` sur les personnes RÉELLES du registre (règle 1), renseigné sur les
   * interlocuteurs SIMULÉS ajoutés par `demo-contact-density.ts` — en `.example`,
   * donc non routable. Voir la règle 1bis de l'en-tête.
   */
  email: string | null
  /** Même règle que `email` : plage de fiction ARCEP, jamais un vrai numéro. */
  phone?: string | null
  /**
   * #2629.2 — décision Louis 22/09/2026. `demo-contact-density.ts` refuse
   * volontairement toute URL de profil sur les interlocuteurs SIMULÉS qu'il
   * génère (« il n'y a pas d'équivalent `.example` d'un réseau social ») :
   * une adresse LinkedIn désigne un compte qui existe, et il n'y a rien
   * d'équivalent à un domaine RFC 2606 pour s'assurer qu'il n'en désigne
   * aucun. Réservé, donc, aux contacts écrits À LA MAIN ici (jamais générés
   * en série) et à un slug visiblement fictif (`demo-bellum-…`) qui ne
   * correspond à aucun profil réel. `undefined`/`null` partout ailleurs.
   */
  linkedin_url?: string | null
  profile_summary: string
  why_contact: string
  /** `null` pour un rôle sans personne : le produit lui-même bloque la
   *  génération de message tant que l'identité n'est pas vérifiée. */
  email_message: { subject: string; body: string } | null
  linkedin_message: string | null
  contact_score: number
  seniority: string
  lifecycle_state: string
  key_points: string[]
  /**
   * #2296.30/.33 (épopée #2964) — l'employeur ACTUEL qu'Apollo a collecté,
   * lu par `detectedNewEmployer` (web) pour PROPOSER — jamais créer seul —
   * la recherche chez le nouvel employeur d'un contact `historique`.
   * Réservé aux interlocuteurs FICTIFS (même garde que `user_status` /
   * `demo_seed_first_door` ci-dessus) : un parcours professionnel est un
   * fait biographique, jamais inventé sur un dirigeant RÉEL des dossiers.
   */
  apollo_enrichment?: DemoApolloEnrichment
  /**
   * #3716 — colonnes d'un import SANS champ d'accueil, sous leur intitulé
   * d'origine (`contacts.extra`). Réservé aux interlocuteurs FICTIFS : le
   * détail « Parcours et informations complémentaires » ne doit jamais s'ouvrir
   * en démo sur un contenu inventé pour une personne réelle. Absent = `{}`.
   */
  extra?: Record<string, string>
  /**
   * Contact ÉCARTÉ, avec son motif (PDF 2, items 82-83).
   *
   * Un seul contact du jeu le porte, et c'est délibéré : la carte « Écarter »
   * ne se voit qu'à l'état écarté, et un prospect qui ouvre la démo doit
   * pouvoir constater que l'outil garde la raison plutôt que de faire
   * disparaître la fiche.
   */
  exclusion_reason?: string | null
  /**
   * #4556 / #4432.4 — le lieu de la fiche quand le jeu le POSE : `null` = lieu inconnu (jamais le siège par défaut).
   * Absent = `demoLocation` (la ville du siège du dossier), comme avant.
   */
  location?: string | null
  /**
   * L'issue de la relation, telle que le commercial la DÉCLARE depuis la ligne
   * du contact. Absente = `new`, l'état de départ (même champ, même défaut
   * que le `user_status?: string` de `demo-seed.service.ts`).
   *
   * ⚠️ Ne concerne que les interlocuteurs FICTIFS du client d'exemple —
   * déclarer qu'un dirigeant RÉEL nous a répondu inventerait un fait sur une
   * personne.
   */
  user_status?: string
  /**
   * #2390.1 / #2390.8 — le fuseau de CE contact quand il diffère du fuseau
   * que `demoTimezone` déduit de son entité (Paris, ou Madrid pour une entité
   * ibérique). Sans lui, tous les contacts de démo vivent à la même heure
   * murale que le visiteur et l'heure « chez l'invité » du pré-brief ne
   * s'afficherait jamais. Absent = déduit, comportement inchangé.
   */
  timezone?: string
  /**
   * #2295.4bis — décision Louis 18/09/2026 (question 24) : lève le verrou
   * #2295.4 de `classifyGroup()` (`first_door`) pour ce contact, SANS jamais
   * affirmer qu'une adresse a été vérifiée — un fait de SEMIS, distinct
   * d'`email_verified` par construction. Absent = `undefined` (comportement
   * inchangé). Réservé aux interlocuteurs FICTIFS : le poser sur un dirigeant
   * RÉEL laisserait croire qu'une vraie personne est joignable sans preuve —
   * voir `DEMO_DELIVERY_CLIENT.contacts` où il est posé.
   */
  demo_seed_first_door?: boolean
  /**
   * #2159.26 — les ÉTIQUETTES que l'équipe a posées sur ce contact (import,
   * saisie). Absent = aucune. Réservé aux interlocuteurs FICTIFS du client
   * d'exemple : classer un dirigeant RÉEL ne se fait pas pour une vitrine.
   */
  tags?: string[]
  /**
   * #2297.51 — coordonnées enrichies ARCHIVÉES par la rétention il y a N jours
   * (relatif au seed, comme `excluded_at`), et ce que l'archive garde. Posé par
   * `demo-contact-density.ts` sur UNE personne simulée, jamais sur un dirigeant réel.
   */
  enrichment_archived_days_ago?: number
  enrichment_archive?: { email: string; phone: string }
  /**
   * #2160.58 — la confirmation POSITIVE d'identité (« Bon contact confirmé »),
   * déclarée depuis la carte Corrections. `undefined` = jamais confirmé
   * (l'état de départ) ; seule sa PRÉSENCE compte pour `demoContactRow`, qui
   * ignore la date réelle (relative au seed — voir `demo-seed.service.ts`).
   *
   * ⚠️ Réservé aux interlocuteurs FICTIFS du client d'exemple — même garde que
   * `user_status`/`demo_seed_first_door` juste au-dessus : déclarer qu'un
   * dirigeant RÉEL a été confirmé inventerait un verdict humain sur une vraie
   * personne.
   */
  identity_confirmed_at?: string
  /**
   * #2160.60 — la levée de la porte « homonyme non résolu » / « entité hors
   * périmètre » (`contact-eligibility.ts`, `isAuthorizedFor`), déclarée depuis
   * la carte Corrections. `undefined` = jamais levée (l'état de départ) ;
   * seule sa PRÉSENCE compte pour `demoContactRow`, qui ignore la date réelle
   * (relative au seed, même patron qu'`identity_confirmed_at` juste au-dessus).
   *
   * ⚠️ Contrairement à `identity_confirmed_at`, PAS réservé aux interlocuteurs
   * FICTIFS du client d'exemple : la porte qu'elle lève ne porte que sur un
   * SIÈGE (`roleSeat`, `full_name` = intitulé de poste, jamais une personne
   * nommée) — l'autoriser n'invente aucun verdict sur une personne réelle
   * identifiée, contrairement à une confirmation d'identité posée sur un
   * dirigeant RÉEL des six dossiers.
   */
  recommendation_authorized_reason?: 'homonym_conflict' | 'entity_mismatch'
  recommendation_authorized_at?: string
  /**
   * #219.8 (#3231, lot Q03) — la relation personne↔entreprise DÉCLARÉE par le
   * commercial. ⚠️ Réservée aux interlocuteurs FICTIFS du client d'exemple :
   * prêter un passé (ex-salarié, ex-prestataire) à un dirigeant RÉEL des six
   * dossiers serait une donnée inventée sur une vraie personne. Seule une
   * relation qui décrit leur rôle ACTUEL dans le client d'exemple est semée.
   */
  declared_person_company_relation?: 'sponsor' | 'buyer'
  /**
   * SIG-B (11/10/2026) — l'offre d'emploi publiée qui NOMME ce contact comme
   * recruteur. ⚠️ Réservée aux interlocuteurs FICTIFS, sur une offre FICTIVE
   * (`.example`) : attribuer une annonce à un dirigeant RÉEL inventerait un fait.
   * Datée relativement au semis (`posted_days_ago`), écrite par
   * {@link demoJobPostingRawData} dans `raw_data.jobPosting`.
   */
  job_posting?: DemoJobPostingProof
  /**
   * #4055.8 — la relecture d'employeur qui prouve « a quitté l'entreprise » : un AUTRE employeur observé, daté.
   * ⚠️ Réservée aux interlocuteurs FICTIFS : dire d'une personne réelle qu'elle a quitté son poste inventerait un fait.
   * Écrite par {@link demoEmploymentCheckRawData} dans `raw_data.employmentCheck`.
   */
  employment_check?: DemoEmploymentCheckProof
  /**
   * #4586.5 — le NOM de cette fiche est tiré de son adresse (la partie locale lisible), jamais saisi : la liste des
   * contacts le dit (« estimé »). Écrit par {@link demoContactRawData} dans `raw_data.nameDerivedFromEmail`, la MÊME clé
   * que l'import réel. ⚠️ Réservé aux interlocuteurs FICTIFS dont l'adresse (`.example`) porte `prenom.nom`.
   */
  name_derived_from_email?: true
}

type DemoAttackAngle = {
  title: string
  description: string
  entry_point: string
  is_recommended: boolean
  rank: number
}

type DemoDossier = {
  account: {
    company_name: string
    /**
     * L'IDENTITÉ de registre du dossier (GA-96), et son code d'activité.
     *
     * Les deux sont RÉELS — pris au registre public, comme les SIREN des
     * filiales que ce fichier porte déjà. Ils ne sont pas décoratifs :
     *
     *  - `siren` est ce qui ancre un rafraîchissement. Sans lui, un dossier de
     *    démonstration relancé retomberait sur une résolution PAR NOM, et
     *    l'écran de confirmation annoncerait « Résolution par nom » au lieu de
     *    nommer la société — c'est-à-dire qu'il montrerait au prospect
     *    exactement le défaut qu'on vient de corriger ;
     *  - `naf_code` remplit le champ « Code NAF » désormais corrigeable sur la
     *    fiche, et alimente les « comptes similaires » (la découverte filtre
     *    dessus). Un dossier de démonstration sans NAF montre un champ vide et
     *    des recommandations sans raison.
     *
     * ⚠️ `null` est une valeur LÉGITIME, et pas un trou : trois dossiers sur sept
     * n'ont pas de SIREN ici, chacun pour une raison écrite à son endroit. Deux
     * parce que leur identité n'est corroborée NULLE PART dans ce dépôt et
     * qu'on n'invente pas un numéro de registre — « un contrat non vérifiable
     * ne se devine pas » vaut aussi pour une donnée de démonstration, qui porte
     * le nom d'une entreprise RÉELLE. Le troisième parce que c'est un client
     * d'exemple FICTIF : lui donner un vrai SIREN le ferait pointer vers une
     * société qui existe.
     *
     * Et c'est une meilleure démonstration ainsi : le produit montre ses DEUX
     * branches — un dossier qui connaît son identité se rafraîchit dessus, un
     * dossier qui n'en a pas se résout par le nom en le DISANT.
     */
    siren: string | null
    naf_code: string | null
    /**
     * #2117.11 — le pays de REGISTRE, lu par le bloc identité du hero. Les
     * six sociétés sont immatriculées en France ; deux n'ont pas de SIREN
     * corroboré ici (numéro non trouvé), ce qui est un fait DISTINCT du pays.
     */
    registry_country: string | null
    sector: string
    employees: string
    revenue: string
    headquarters: string
    website: string
    /** `null` — on ne redessine pas la marque d'un tiers (règle 2). */
    logo_url: string | null
    subsidiaries: string[]
    /**
     * #2165.24 / #2166.3 / #2165.16 — le lien capitalistique (Pappers
     * cartographie). Optionnel : seul le dossier Société Générale en porte
     * un, factuellement vrai (elle EST une tête de groupe, avec les mêmes
     * filiales que `subsidiaries` ci-dessus nomme déjà). Les cinq autres
     * dossiers réels sont des sociétés indépendantes les unes des autres —
     * en inventer une pour deux d'entre elles affirmerait un lien
     * capitalistique FAUX entre deux entreprises RÉELLES, ce que le principe
     * « SIX SOCIÉTÉS RÉELLES » du docblock au-dessus exclut justement.
     */
    group_head_siren?: string | null
    group_role?: 'groupe' | 'filiale' | null
    group_link_source?: string | null
    group_link_observed_at?: Date | null
    /**
     * #3914 — l'origine du compte (`'discover'` quand il vient d'« Analyser »
     * depuis Découvrir, `undefined` ⇒ `null` sinon, jamais une origine
     * devinée) et la raison que Découvrir avait calculée à l'époque
     * (`discover_origin_reason`). Les deux ensemble permettent au dossier de
     * dire « Découvrir avait dit X » quand l'analyse conclut autrement —
     * seul TotalEnergies les porte : c'est le seul compte de la salle dont le
     * verdict (STOP + déclencheur de no-go) se projette en « METTRE EN
     * VEILLE », la seule valeur que lit `AccountVerdictSummary.tsx:195`.
     */
    origin?: string | null
    discover_origin_reason?: string | null
    /** #3819 (lot RBB2) — les critères de Découvrir posés ET satisfaits, avec l'origine. */
    discover_origin_criteria?: DiscoverOriginCriteria | null
    it_challenges: ItChallenge[]
    recent_signals: RecentSignal[]
    priority_score: number
    priority_justification: string
    commercial_status: string
    /**
     * #2159.26 — les ÉTIQUETTES que l'équipe fictive de la salle a posées sur
     * ce compte : SON classement de travail (« cible prioritaire »), jamais un
     * fait affirmé sur la société. Absent = aucune.
     */
    tags?: string[]
    /**
     * #2165.13 — la SOURCE du preset Découvrir « Proches de mes meilleures
     * références ». `undefined` sur les six autres dossiers : seul un compte
     * CLIENT peut porter le marqueur (même règle côté écran), et le seul
     * client de la salle (Nova Logistique) le porte — sinon le preset
     * s'ouvrirait désactivé dans TOUTE démonstration, ce qui montrerait au
     * prospect le défaut que la doctrine « non mesuré n'est jamais 0 »
     * corrige : un preset sourcé désactivé sans qu'aucun geste ne puisse
     * jamais l'activer en démo.
     */
    is_best_reference?: boolean
    /**
     * #3245 (#3209.6) — le PROFIL DE PARI, déclaré (fictif en démo, comme le
     * reste) : sans lui, `get_portfolio_priorities` ne montrerait jamais la
     * diversité au-delà du groupe à un prospect. Absent = non déclaré.
     */
    bet_horizon?: 'short' | 'long' | null
    bet_size?: 'standard' | 'very_large' | null
    bet_access?: 'open' | 'closed' | null
    bet_resource?: string | null
    /** #3282 / #3263.30 — le niveau d'entrée du comité d'achat, saisi (liste fermée). Absent = non déclaré. */
    committee_entry_level?: 'c_level' | 'direction' | 'manager' | 'operational' | null
    /** La porte G1 — trois valeurs sur les quatre dossiers, pour que l'écran
     *  montre la question POSÉE et pas un portefeuille où personne n'a tranché. */
    priority_gate: string
    gate_reason: string | null
    /**
     * LE NIVEAU D'EFFORT (`accounts.sprint`, tome 5 §28-31) — combien d'énergie
     * commerciale ce compte reçoit CETTE semaine. Distinct de `commercial_status`
     * (où en est la relation) et de `priority_gate` (a-t-on décidé de le
     * travailler) : les trois se croisent, ils ne se fusionnent jamais.
     *
     * `null` par défaut en base (migration `1789996184270-AccountSprint.ts`) —
     * et c'était la valeur de TOUS les comptes de la salle jusqu'à ce lot : les
     * deux files du board (`/sprints`) s'ouvraient vides, pas seulement l'une
     * des deux. Les six dossiers réels portent chacun une valeur, sur les
     * QUATRE niveaux — jamais un seul, sinon une file entière resterait vide.
     */
    sprint: SprintLevel | null
    /** Motif de sortie — obligatoire quand `sprint` vaut `no_go`
     *  (`sprintExitProblems`), `null` partout ailleurs : le champ appartient à
     *  la SORTIE, pas à un niveau qu'on traverse. */
    sprint_exit_reason: string | null
    /**
     * BEL-SC-228 (#3257) — la décision générique attachée au niveau
     * (`SprintDecisionFields`). Optionnelles : la plupart des dossiers n'en ont
     * besoin d'aucune, seul `watch` en EXIGE une (`sprintDecisionProblems`).
     */
    sprint_reason?: string | null
    sprint_effort_estimate?: string | null
    sprint_review_at?: string | null
    sprint_promotion_condition?: string | null
    sprint_demotion_condition?: string | null
    /**
     * La mémoire de relation (#1085). Sans elle, la carte s'ouvre VIDE au milieu
     * d'une démonstration : le visiteur voit un formulaire, pas une capacité —
     * et surtout pas le fait qu'elle est relue à chaque analyse.
     *
     * `competitiveEdge` est le champ neuf : ce que le commercial sait de SA
     * position. Il est rangé à part côté serveur, parce qu'un avantage se
     * connaît sans avoir jamais parlé au compte.
     */
    relationship_memory: Record<string, string> | null
    /**
     * Lot D01 (06/10/2026) — `analyzing` : le dossier est SEMÉ en cours d'analyse (lecture
     * précédente lisible, aucun pourcentage). Absent = `completed`, l'état de tous les autres.
     */
    analysis_status?: 'analyzing'
    raw_analysis: Record<string, unknown>
    /**
     * La version PRÉCÉDENTE du dossier (D213) — ce qui rend le tiroir « ce qui
     * a changé » visible en démonstration.
     *
     * ⚠️ UN dossier sur six la porte, à dessein. Le tiroir n'existe que sur un
     * compte réanalysé au moins une fois ; en donner un à tous ferait croire
     * qu'il est toujours là, et masquerait l'état « on n'a pas de quoi
     * comparer » — qui n'est PAS « rien n'a changé » et doit aussi se voir.
     */
    previous_raw_analysis?: Record<string, unknown>
    /** Quand la version précédente a été remplacée (`YYYY-MM-DD`). */
    previous_analysis_at?: string
    /**
     * #2291.2 (lot R, 19/09/2026) — la date de collecte du segment signaux
     * (`accounts.signals_collected_at`, #2543.7). `undefined` sur deux
     * dossiers sur trois : à dessein, c'est ce qui montre en démonstration
     * l'état « collecte antérieure à cette capacité » (doctrine « un
     * correctif de collecte rattrape l'existant », CLAUDE.md) — la fiche le
     * DIT plutôt que de présumer à jour un dossier jamais redaté. SNCF SEUL
     * la porte, FRAÎCHE, pour montrer l'état observé de `contract_model`
     * ci-dessous — sans elle, sa propre fiche se lirait « collecte
     * antérieure » malgré l'observation qu'elle porte.
     */
    signals_collected_at?: string
    /**
     * Recette prod 05/10 — « Date de collecte non mesurée — à revérifier » sur la
     * fiche SNCF : seul `signals_collected_at` était daté. Une SEULE date ISO,
     * posée sur les cinq autres segments datables (contacts, entités, stratégie,
     * lecture du dossier, relation d'accès) — voir {@link demoSegmentCollectedAtColumns}.
     * SNCF SEUL (le dossier qu'on ouvre en réunion) : les autres restent sans
     * date, à dessein, pour montrer l'état « collecte antérieure » (#2291.2).
     */
    segments_collected_at?: string
  }
  contacts: DemoContact[]
  /**
   * #3895 (arbitrage Louis 11/10) — les ANCIENS BESOINS FERMÉS du compte (historique). Sans eux,
   * « ce compte a-t-il déjà eu un besoin ? » (`find_needs.include_closed`, #3889.2) n'a rien à
   * retrouver en démo. Absent = aucun semis (un compte sans historique n'en invente pas).
   */
  closedNeeds?: readonly DemoClosedNeed[]
  attackAngles: DemoAttackAngle[]
  actionPlan: {
    strategy_type: string
    strategy_justification: string
    weeks: PlanPhase[]
  }
}

/** #3895 — un besoin FERMÉ d'un dossier (statut final + motif + date), jamais une piste ouverte. */
type DemoClosedNeed = {
  title: string
  status: 'won' | 'lost' | 'cancelled'
  status_reason: string
  /** Jours écoulés depuis la fermeture (ancré sur le moment du semis, jamais une date en dur). */
  closed_days_ago: number
  skills: readonly { term: string; required: boolean }[]
  seniority: string
  headcount: number
  location: string | null
  /** #4755 (lot 761) — le TJM du besoin passé (€/jour), quand le dossier le porte. Absent = inconnu, jamais 0. */
  tjm_eur?: number
}

/** Un contact NOMMÉ : personne réelle, fonction exacte, zéro coordonnée. */
function namedContact(
  input: Omit<DemoContact, 'photo_url' | 'email' | 'email_message' | 'linkedin_message'> &
    Partial<Pick<DemoContact, 'email_message' | 'linkedin_message'>>,
): DemoContact {
  return { photo_url: null, email: null, email_message: null, linkedin_message: null, ...input }
}

/**
 * Un SIÈGE DE DÉCISION sans personne nommée — ce qu'une analyse produit sur un
 * grand compte froid tant que l'enrichissement n'a pas tourné.
 *
 * Le libellé du rôle sert de nom au siège, DÉLIBÉRÉMENT. Trois options
 * existaient et deux étaient pires :
 *  - inventer un prénom « pour faire vivant » attribuerait une identité à
 *    personne, sur une société réelle, depuis un lien public ;
 *  - laisser le nom vide viderait la carte d'influence de la moitié de ses
 *    nœuds, et un organigramme sans sièges de décision n'apprend rien.
 * Écrire le rôle ne trompe personne : « Responsable de la sécurité des systèmes
 * d'information » ne se lit pas comme le nom de quelqu'un.
 *
 * Ni message ni coordonnée : le produit refuse de rédiger tant que l'identité
 * n'est pas vérifiée (règle Théo p.11), et la démonstration montre cette règle
 * plutôt que de la contourner. `lifecycle_state` reste donc à `detecte`.
 */
/**
 * Marque un contact du jeu comme ÉCARTÉ, avec son motif.
 *
 * Un helper plutôt qu'un champ posé à la main : le motif est OBLIGATOIRE côté
 * produit, et l'oublier ici produirait exactement l'écran qu'on veut éviter —
 * un contact disparu dont personne ne sait pourquoi.
 */
function excluded(contact: DemoContact, reason: string): DemoContact {
  return { ...contact, exclusion_reason: reason }
}

function roleSeat(input: {
  title: string
  entity: string
  family: string
  decision_role: string
  priority: number
  why_contact: string
  key_points: string[]
  contact_score: number
}): DemoContact {
  // Décision Louis 01/11/2026 : les sièges de cadres de la démo portent un NOM FICTIF (`demo-seat-names.ts`) —
  // plus « Rôle à identifier ». Un siège agrégé (famille métier, `buildSgFamilyRoleSeats`) reste sans personne.
  const fictiveName = seatNameOrNull(input.title)
  return {
    full_name: fictiveName ?? input.title,
    photo_url: null,
    email: null,
    email_message: null,
    linkedin_message: null,
    profile_summary: fictiveName
      ? 'Interlocuteur FICTIF de la démonstration, rattaché à ce poste : son nom est inventé, aucune coordonnée ni aucun profil n’est publié. Le registre ne publie que les mandataires sociaux — le titulaire réel se résout par l’enrichissement, qui ne tourne pas depuis une salle de démonstration.'
      : 'Siège de décision identifié par l’analyse ; la personne qui l’occupe n’est pas nommée. Le registre ne publie que les mandataires sociaux — ce niveau-là se résout par l’enrichissement, qui ne tourne pas depuis une salle de démonstration.',
    seniority: 'director',
    lifecycle_state: 'detecte',
    ...input,
  }
}

/* ================================================================== */
/* Dossier 1 — Société Générale                                        */
/* ================================================================== */

const sgChallenges: ItChallenge[] = [
  {
    title: 'Plan stratégique 2029 à outiller techniquement',
    description:
      'Un nouveau plan à horizon 2029 est annoncé pour la fin 2026, après des résultats semestriels record. Ce type de plan s’accompagne de rationalisation applicative et d’accélération cloud, à outiller au rythme trimestriel attendu par les marchés.',
    severity: 'high',
    timeframe: '6 mois',
  },
  {
    title: 'Industrialisation des cas d’usage d’IA générative documentaire',
    description:
      'Le groupe a communiqué sur une approche couplant recherche et IA générative pour exploiter ses bases documentaires. Passer du prototype au run à l’échelle bancaire impose gouvernance des données, MLOps et contrôles de conformité.',
    severity: 'high',
    timeframe: '6 mois',
  },
  {
    title: 'Surface d’attaque des parcours d’authentification',
    description:
      'Chaque nouveau canal digital élargit la surface d’attaque et impose une remédiation continue, sous surveillance réglementaire permanente (DORA, ACPR).',
    severity: 'critical',
    timeframe: 'immédiat',
  },
  {
    title: 'Fragmentation héritée des rapprochements internes',
    description:
      'Plusieurs centaines de filiales et de GIE actifs — dont l’intégration du Crédit du Nord — compliquent la cohérence du système d’information et ralentissent les initiatives transverses de mutualisation.',
    severity: 'medium',
    timeframe: '12 mois',
  },
]

/**
 * ⚠️ #2687 — les `id` ci-dessous ne sont PAS décoratifs : ce sont les clés que
 * `sgHypotheses` cite dans `based_on_signal_ids`, et le seul lien entre un
 * signal et l'angle ESN que la Veille affiche sous lui. Renuméroter un signal
 * sans renuméroter l'hypothèse qui le cite ne casse aucun test de type — ça
 * fait juste disparaître l'angle de l'écran, en silence.
 */
const sgSignals: RecentSignal[] = [
  {
    id: 's1',
    signal:
      'Résultats du deuxième trimestre 2026 en forte hausse, objectifs de rentabilité relevés et programme de rachat d’actions de 1,5 Md€',
    source: 'Les Échos · L’Agefi · BFM Bourse',
    url: demoSourceUrl('press', 'sg-1'),
    source_kind: 'press',
    type: 'budget',
    date: '2026-07',
    sales_implication:
      'Une banque qui relève ses objectifs et rachète ses actions arbitre ses investissements dans les mois qui suivent : la fenêtre de cadrage est ouverte avant les décisions de budget.',
    // #2107.31 — l'ampleur, distincte de la lecture ESN ci-dessus : un
    // résultat de GROUPE arbitre des budgets au-delà d'une seule direction.
    impact: 'Résultat de groupe : arbitrages potentiels sur toutes les directions, pas une seule filiale.',
    freshness: 'current',
  },
  {
    id: 's2',
    signal: 'Nouveau plan stratégique à horizon 2029 annoncé pour la fin 2026',
    source: 'L’Agefi',
    url: demoSourceUrl('press', 'sg-2'),
    source_kind: 'press',
    type: 'projet',
    date: '2026-07',
    sales_implication:
      'Les jalons techniques d’un plan pluriannuel se cadrent AVANT son annonce. C’est maintenant que les équipes cherchent de la capacité, pas après la publication.',
    impact: 'Plan à horizon 2029 annoncé au niveau du groupe entier.',
    freshness: 'current',
  },
  {
    id: 's3',
    signal: 'Augmentation de capital publiée au registre',
    source: BODACC_SOURCE,
    url: demoSourceUrl('bodacc', 'sg-3'),
    source_kind: 'bodacc',
    type: 'legal',
    date: '2026-08-09',
    sales_implication: 'Mouvement capitalistique récent : le dossier reste actif côté juridique et financier.',
    freshness: 'current',
  },
  {
    id: 's4',
    signal:
      'Approche couplant recherche et intelligence artificielle générative pour l’accès aux bases documentaires internes',
    source: 'Le Monde Informatique',
    url: demoSourceUrl('press', 'sg-4'),
    source_kind: 'press',
    type: 'projet',
    date: '2026',
    sales_implication:
      'Un cas d’usage déjà public est un cas d’usage déjà financé au stade prototype : la valeur se déplace vers son industrialisation.',
    freshness: 'current',
  },
  {
    id: 's5',
    signal: 'Réduction de la direction générale à deux dirigeants exécutifs',
    source: 'Communiqué de presse du groupe',
    url: demoSourceUrl('press', 'sg-5'),
    source_kind: 'press',
    type: 'nomination',
    date: '2024-10-31',
    sales_implication:
      'Une direction générale resserrée raccourcit les circuits d’arbitrage — et rend le sponsor de niveau filiale plus déterminant qu’un sponsor groupe.',
    freshness: 'archive',
  },
  // #3680 (reste de #3680.1/.2, épopée #3777) — DEUX ARTICLES SUR LE MÊME
  // ÉVÉNEMENT, pas deux signaux : une dépêche reprend le même communiqué que
  // `s1` (même catégorie `budget`, même mois, même texte — ce qui dédoublonne
  // réellement, `watchEventKey` compare le texte NORMALISÉ). Sans cette ligne,
  // le fusionnement de `distinctWatchEvents` restait non exercé en salle.
  {
    id: 's6',
    signal:
      'Résultats du deuxième trimestre 2026 en forte hausse, objectifs de rentabilité relevés et programme de rachat d’actions de 1,5 Md€',
    source: 'Reuters',
    url: demoSourceUrl('press', 'sg-6'),
    source_kind: 'press',
    type: 'budget',
    date: '2026-07',
    sales_implication: null,
    freshness: 'current',
  },
  // #4403.1 (recette prod 26/10) — un signal HORS MÉTIER : un cours de bourse n'est un signal de recrutement pour aucune
  // ESN. Sur /signals il est NOMMÉ « hors de ton métier » et rangé SOUS les signaux de métier (jamais retiré) : la
  // salle montre la marque et le rang. Aucune implication commerciale inventée : `null`.
  {
    id: 's7',
    signal: 'Le cours de bourse de Société Générale progresse de 2,1 % à Paris dans une séance haussière du CAC 40',
    source: 'BFM Bourse',
    url: demoSourceUrl('press', 'sg-7'),
    source_kind: 'press',
    type: 'presse',
    date: '2026-07',
    sales_implication: null,
    freshness: 'current',
  },
  // #4756 (Louis 28/10) — de quoi CROISER dans l'onglet Historique de /signals : « du Java, à Lille ». Cinq offres PASSÉES
  // (`archive`), lieux et compétences lus dans l'offre, réparties sur les quatre tranches de période. Semées ici
  // (premier compte du jeu hors SNCF) : le tableau `job_offers` de SNCF n'est pas touché.
  {
    id: 's20',
    signal: 'Développeur Java back-end — plateforme paiements (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-06-10',
    location: 'Lille (59)',
    url: demoSourceUrl('job', 'sg-java-lille-1'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java', 'Spring'],
      job_family: 'developpement',
      extract: 'Développeur Java back-end',
    },
    freshness: 'archive',
  },
  {
    id: 's21',
    signal: 'Développeur Java — modernisation des applications de marché (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-02-17',
    location: 'Lille',
    url: demoSourceUrl('job', 'sg-java-lille-2'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java'],
      job_family: 'developpement',
      extract: 'Développeur Java',
    },
    freshness: 'archive',
  },
  {
    id: 's22',
    signal: 'Tech lead Java — socle applicatif (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2025-09-22',
    location: 'Lille (59)',
    url: demoSourceUrl('job', 'sg-java-lille-3'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java', 'Spring'],
      job_family: 'developpement',
      extract: 'Tech lead Java',
    },
    freshness: 'archive',
  },
  {
    id: 's23',
    signal: 'Data engineer — plateforme risques (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-05-05',
    location: 'Paris (75)',
    url: demoSourceUrl('job', 'sg-data-paris'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Python', 'Data engineering'],
      job_family: 'data_ia',
      extract: 'Data engineer',
    },
    freshness: 'archive',
  },
  {
    id: 's24',
    signal: 'Consultant SAP FI — finance de la filiale (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2024-08-19',
    location: 'Lyon (69)',
    url: demoSourceUrl('job', 'sg-sap-lyon'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['SAP'],
      job_family: 'erp',
      extract: 'Consultant SAP FI',
    },
    freshness: 'archive',
  },
]

/**
 * #2687 — CE QUE LES SIGNAUX CI-DESSUS MÈNENT À FAIRE.
 *
 * Sans ça, la Veille de la salle de démonstration montrait cinq faits datés et
 * sourcés, et rien pour répondre à « et donc ? » — exactement le vide que
 * l'issue décrit sur un compte réel.
 *
 * Trois choix à lire avant d'y toucher :
 *
 *  · `based_on_signal_ids` cite les `id` de `sgSignals`. C'est le SEUL lien
 *    entre une hypothèse et un signal ; le texte de `based_on_signals` est une
 *    reformulation lisible, pas une clé, et rien ne se rattache par lui.
 *  · `confidence` suit la règle de convergence de l'analyse (1 signal →
 *    `a_verifier`, 2 → `probable`, 3+ → `confirmee`). Ce n'est pas une
 *    probabilité de signature — aucune n'existe nulle part.
 *  · le signal `s3` (augmentation de capital) n'est cité par AUCUNE hypothèse,
 *    et `s5` non plus : leur ligne d'angle ne s'affiche pas, et c'est le
 *    comportement qu'on veut montrer. Un prospect qui ouvre la salle doit voir
 *    la promesse ET son silence — une démo où tout est rempli ment sur ce que
 *    le produit fait d'une donnée manquante.
 */
const sgHypotheses: QualifiedHypothesis[] = [
  {
    hypothesis: 'Société Générale arbitre ses investissements applicatifs avant les décisions budgétaires du plan 2029',
    based_on_signals: [
      'Objectifs de rentabilité relevés au T2 2026',
      'Plan stratégique à horizon 2029 annoncé pour fin 2026',
    ],
    based_on_signal_ids: ['s1', 's2'],
    confidence: 'probable',
    esn_angle:
      'Cadrage de capacité sur les chantiers applicatifs d’une filiale à autonomie propre, avant l’arbitrage budgétaire du plan',
    first_action:
      'Demander à un responsable applicatif de filiale quels chantiers sont déjà cadrés pour 2027, sans présenter le plan comme acquis',
  },
  {
    hypothesis:
      'L’industrialisation de l’IA générative documentaire devient un chantier de production, pas un prototype',
    based_on_signals: ['Cas d’usage IA générative déjà public sur les bases documentaires internes'],
    based_on_signal_ids: ['s4'],
    confidence: 'a_verifier',
    esn_angle:
      'Renfort sur la mise en production d’un cas d’usage IA déjà prototypé : évaluation, supervision, coût d’inférence',
    first_action:
      'Vérifier auprès d’une équipe data si le cas d’usage publié a un propriétaire en production ou reste une démonstration',
  },
]

/**
 * Le compte SG complet, importé par Louis le 27/09/2026 (CSV, 2 289 lignes,
 * 17 blocs — `data/sg-compte-complet.csv`). Lu depuis le module TS GÉNÉRÉ
 * (`data/sg-compte-complet.generated.ts`, régénéré par
 * `scripts/generate-compte-csv-modules.mjs`) plutôt qu'à l'exécution : le build de
 * cette app est un `tsc` nu (`package.json` → `"build": "tsc -p
 * tsconfig.build.json"`), qui ne copie aucun fichier non-TypeScript dans
 * `dist` — un module généré est le chemin le plus simple qui passe CE build
 * (FINIR-V2-27-09, décision 3), sans config d'assets à ajouter.
 *
 * Le mapping bloc par bloc, le conflit de doctrine sur les trois blocs de
 * contacts opérationnels/prestataires/profils et sa variante conforme, vivent
 * dans `sg-csv-mapping.ts` — pas ici.
 */
const sgCsvRows = parseCompteCsvRows(SG_COMPTE_COMPLET_CSV)

/** Les deux personnes déjà écrites à la main plus bas (mandataires sociaux,
 *  registre du commerce) — le semis CSV ne les redouble jamais. */
const SG_EXISTING_NAMED_CONTACTS = new Set(['lorenzo bini smaghi', 'pierre palmieri'])
const SG_EXISTING_ENTITY_NAMES = new Set(['société générale (maison mère)', 'treezor', 'boursorama / boursobank'])

/**
 * #3679 — LA PISTE COMPLÈTE : la seule du dossier dont AUCUN manque ne bloque
 * « Préparer l'approche » (`leadPrimaryAction`, `qualificationLeads.ts`).
 *
 * Recette 08/10 : 41 pistes, toutes « Identifier le responsable », parce
 * qu'aucune ne portait `offer` (périmètre) ni `btmmp.management` (rôle).
 *
 * ⚠️ `kind: 'besoin'` à l'étape d'INTAKE `potential` — JAMAIS `'signal'` :
 * `demo-account-projects-depth-coverage.spec.ts` (« un signal n'est pas une
 * affaire ») interdit à un signal de porter `offer`/`btmmp` sur le dossier SNCF.
 * Un `besoin` les porte nativement.
 *
 * ⚠️ Posée sur SOCIÉTÉ GÉNÉRALE, pas SNCF : les deux affaires du pipe de SNCF
 * (`DEMO_DELIVERY_CLIENT.pipelineProjects`) portent déjà `primary_domain_code:
 * 'esn_it'` — la seule valeur que `ownDomainCodes` reconnaît dans cette salle
 * (un seul domaine d'offre déclaré, `AccountOpportunityScreen.tsx`). Une
 * troisième ligne SNCF au même domaine aurait rencontré
 * `existingOpportunityId` (`qualificationLeads.ts`) et se serait vue
 * rediriger vers « Ouvrir l'affaire existante » — jamais « Préparer
 * l'approche ». Aucun besoin de SG ne porte de `primary_domain_code` (semé
 * par `materialize` depuis les douleurs du dossier, jamais ce champ) : zéro
 * risque de collision.
 *
 * `management` reprend MOT POUR MOT le titre d'un siège déjà seedé
 * (« Responsable achats informatiques », `contacts` de SG) pour que
 * `matchContactsForRole` le retrouve — jamais un rôle inventé sans personne
 * en face.
 */
// #4116.5 — l'appel d'offres démo porte son marqueur UE (le détail le dit), pas seulement « public ».
export const DEMO_SG_COMPLETE_LEAD = {
  label: 'Appel d’offres ouvert — supervision de la plateforme de paiement instantané',
  detail:
    'Appel d’offres public européen (avis publié au Journal officiel de l’Union européenne, UE) relevé sur le site des marchés du groupe : supervision et exploitation de la plateforme de paiement instantané, lot infogérance.',
  detected_days_ago: 5,
  source: 'BOAMP',
  primary_domain_code: 'esn_it' as const,
  offer: 'Supervision et exploitation de plateforme',
  // Un RÔLE (intitulé du siège), pas le nom fictif : `matchContactsForRole` compare au `title` du contact.
  management: 'Responsable achats informatiques' as const,
}

const sgCsvEntities = mapSgEntities(sgCsvRows, SG_EXISTING_ENTITY_NAMES)
const sgCsvSitesFrance = mapSgSitesFrance(sgCsvRows)
const sgCsvProgramNames = mapSgProgramNames(sgCsvRows)
const sgCsvAiApplications = mapSgAiApplications(sgCsvRows)
const sgCsvDetectedTechStack = mapSgDetectedTechStack(sgCsvRows)
const sgCsvOrgUnits = mapSgOrgUnits(sgCsvRows)
const sgCsvDecisionChainSteps = mapSgDecisionChainSteps(sgCsvRows)
const sgCsvGovernanceContacts = mapSgGovernanceContacts(sgCsvRows, SG_EXISTING_NAMED_CONTACTS)
const sgCsvFamilyRoleSeats = buildSgFamilyRoleSeats(sgCsvRows)
// FINIR-V2-27-09 — les cinq blocs sans champ d'accueil avant ce lot (voir le
// docblock de `sg-csv-mapping.ts`).
const sgCsvStructuralReadingAxes = mapSgStructuralReadingAxes(sgCsvRows)
const sgCsvEcosystemThirdParties = mapSgEcosystemThirdParties(sgCsvRows)
const sgCsvOpportunityDomains = mapSgOpportunityDomains(sgCsvRows)
const sgCsvFinancialIndicators = mapSgFinancialIndicators(sgCsvRows)
const sgCsvDataReliabilityNotes = mapSgDataReliabilityNotes(sgCsvRows)
// Complément du 28/09/2026 (retour de démo de Théo) — voir `sg-csv-complement.ts`.
const sgCsvContactTechnologyCounts = mapSgContactTechnologyCounts(sgCsvRows)
const sgCsvJobFamilyNote = mapSgJobFamilyNote(sgCsvRows)

/** Les ESN employeuses citées au bloc 07 (5 sociétés, aucun nom de personne) —
 *  semées dans `account_partners` du compte Société Générale par
 *  `applySgPartnersAndNeeds`, lue ici pour l'empreinte du semis. */
export const DEMO_SG_ESN_PARTNERS = mapSgEsnPartners(sgCsvRows)
/** Les pistes « Besoin détecté » du compte reliées à leur ligne source
 *  (blocs 11/15) — écrites après `ProjectsService.materialize`. */
export const DEMO_SG_NEED_ANNOTATIONS = mapSgNeedAnnotations(sgCsvRows)

/**
 * Implantations réelles, relevées par l'INSEE pendant le run du 10/08.
 *
 * Les coordonnées sont celles des VILLES (données publiques) : la carte a besoin
 * d'un point, et le registre ne publie pas de latitude. Ce qui est affirmé ici,
 * c'est qu'un établissement actif existe dans cette ville — ça, le registre le
 * dit.
 */
const sgSites: SiteFrance[] = [
  // Brief commercial du 01/10/2026 : le siège est Puteaux (Tours SG, La Défense).
  // Paris 9e (Haussmann) reste un établissement — la direction historique.
  {
    city: 'Puteaux',
    region: 'Île-de-France',
    type: 'siège social',
    priority: 'haute',
    latitude: 48.8847,
    longitude: 2.2381,
    is_headquarters: true,
  },
  {
    city: 'Paris',
    region: 'Île-de-France',
    type: 'établissement',
    priority: 'haute',
    latitude: 48.8738,
    longitude: 2.3312,
    is_headquarters: false,
  },
  {
    city: 'Courbevoie',
    region: 'Île-de-France',
    type: 'établissement',
    priority: 'haute',
    latitude: 48.8975,
    longitude: 2.2569,
    is_headquarters: false,
  },
  {
    city: 'Nancy',
    region: 'Grand Est',
    type: 'établissement',
    priority: 'moyenne',
    latitude: 48.6921,
    longitude: 6.1844,
    is_headquarters: false,
  },
  {
    city: 'Le Mans',
    region: 'Pays de la Loire',
    type: 'établissement',
    priority: 'moyenne',
    latitude: 48.0061,
    longitude: 0.1996,
    is_headquarters: false,
  },
  {
    city: 'Valence',
    region: 'Auvergne-Rhône-Alpes',
    type: 'établissement',
    priority: 'basse',
    latitude: 44.9333,
    longitude: 4.8924,
    is_headquarters: false,
  },
  {
    city: 'Cherbourg-en-Cotentin',
    region: 'Normandie',
    type: 'établissement',
    priority: 'basse',
    latitude: 49.6386,
    longitude: -1.6164,
    is_headquarters: false,
  },
]

const sgPlanPhases: PlanPhase[] = [
  {
    name: 'semaine_1_2',
    title: 'Entrer par une filiale, jamais par le siège',
    objective:
      'Ouvrir un premier échange sur un périmètre où une ESN de 50 à 150 consultants peut être retenue — une filiale à autonomie propre, pas la direction informatique du groupe.',
    actions: [
      {
        action_id: 'SG1',
        action:
          'Prendre contact avec la direction technique de Treezor (filiale de services de paiement, SIREN 807465059) en citant le plan stratégique 2029 et la trajectoire cloud qu’il suppose.',
        contact: 'Directeur des systèmes d’information — filiale de paiement',
        channel: 'linkedin',
        deadline: 'Semaine 1',
        expected_outcome: 'Atelier de cadrage de 45 minutes sur un périmètre borné.',
        kpi: 'Atelier obtenu',
      },
      {
        action_id: 'SG2',
        action:
          'En parallèle, qualifier le processus de référencement fournisseur de la filiale — panel, contrat cadre, exigences de sécurité — sans attendre la validation métier.',
        contact: seatName('Responsable achats informatiques'),
        channel: 'email',
        deadline: 'Semaine 2',
        expected_outcome: 'Le circuit contractuel est connu avant que le besoin soit validé.',
        kpi: 'Circuit d’achat documenté',
      },
    ],
  },
  {
    name: 'semaine_3_4',
    title: 'Ancrer sur l’industrialisation de l’IA documentaire',
    objective: 'Transformer un sujet dont le groupe parle publiquement en périmètre de mission borné et chiffrable.',
    actions: [
      {
        action_id: 'SG3',
        action:
          'Proposer un cadrage d’industrialisation (gouvernance des données, MLOps, contrôles de conformité) sur UN cas d’usage documentaire déjà en production interne.',
        contact: 'Responsable data & IA de business unit',
        channel: 'email',
        deadline: 'Semaine 3',
        expected_outcome: 'Le périmètre du pilote est écrit et partagé.',
        kpi: 'Périmètre validé',
      },
    ],
  },
  {
    name: 'semaine_5_6',
    title: 'Obtenir la première mission bornée',
    objective: 'Sortir de l’échange et placer une mission courte, mesurable, sans engager de programme.',
    actions: [
      {
        action_id: 'SG4',
        action:
          'Proposer une mission pilote de six semaines, deux consultants, avec un livrable daté et un critère d’arrêt écrit.',
        contact: 'Directeur des systèmes d’information — filiale de paiement',
        channel: 'meeting',
        deadline: 'Semaine 5',
        expected_outcome: 'Proposition remise et défendue devant le sponsor.',
        kpi: 'Proposition remise',
      },
    ],
  },
]

/**
 * #4755 (lot 761, craft rule 9) — les faits datés AU SEMIS du tableau « Signaux et besoins » de Société Générale :
 * deux offres de la même équipe le même mois (fusionnées en une ligne dépliable) et un appel d'offres récent.
 * Tout fictif ; aucune source nommée à l'écran.
 */
function sgSeedDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

const SG_SIGNAL_TABLE_JOBS = [
  {
    title: 'Développeur Java back-end — plateforme paiements (H/F)',
    location: 'Paris (75)',
    city: 'Paris',
    department: '75',
    date: sgSeedDaysAgo(6),
    contract_type: 'CDI',
    experience: '5 ans',
    salary: null,
    rome_label: 'Études et développement informatique',
    company: 'Société Générale',
    skills: ['Java', 'Spring'],
    url: null,
    source: 'France Travail',
    board: 'France Travail',
  },
  {
    title: 'Développeur Java back-end — paiements instantanés (H/F)',
    location: 'Paris (75)',
    city: 'Paris',
    department: '75',
    date: sgSeedDaysAgo(9),
    contract_type: 'CDI',
    experience: '3 ans',
    salary: null,
    rome_label: 'Études et développement informatique',
    company: 'Société Générale',
    skills: ['Java', 'Kafka'],
    url: null,
    source: 'APEC',
    board: 'APEC',
  },
]

const SG_SIGNAL_TABLE_TENDERS = [
  {
    title: 'Tierce maintenance applicative des outils de conformité',
    buyer: 'Société Générale',
    location: 'Paris',
    department: '75',
    published_date: sgSeedDaysAgo(21),
    deadline: null,
    cpv: '72267000',
    url: null,
  },
]

const societeGeneraleDossier: DemoDossier = {
  account: {
    company_name: 'Société Générale',
    // #3282 / #3263.30 — l'offre se vend au niveau Direction : un exécutif du comité sort « plus haut ».
    committee_entry_level: 'direction',
    bet_horizon: 'long',
    bet_size: 'very_large',
    bet_access: 'closed',
    bet_resource: 'Architecte cloud',
    // #2159.26 — le classement de travail de l'équipe fictive, pas un fait sur la société.
    tags: ['grand compte', 'banque', 'cible prioritaire', 'Tier A'],
    // Identité de registre corroborée dans ce dépôt : `apps/ia/app/eval/golden/
    // societe-generale.json` et les fixtures d'évaluation portent le même SIREN.
    siren: '552120222',
    naf_code: '64.19Z',
    registry_country: 'FR',
    sector: 'Banque — autres intermédiations monétaires (NAF 64.19Z)',
    employees: '10 000 salariés et plus (tranche INSEE 2023)',
    revenue: '26,8 Md€ au dernier exercice publié (2024, comptes déposés au registre)',
    headquarters: '17 cours Valmy, 92800 Puteaux',
    website: 'https://www.societegenerale.com',
    logo_url: null,
    subsidiaries: ['Boursorama / BoursoBank', 'Treezor', 'Forge', 'Société Générale Holding de Participations'],
    // #2165.24 / #2166.3 / #2165.16 — Société Générale EST la tête de groupe
    // des filiales nommées juste au-dessus (Boursorama, Treezor…) : un fait
    // capitalistique réel, pas une invention pour la démo. `group_head_siren`
    // pointe sur elle-même — c'est la définition du rôle « groupe ».
    group_head_siren: '552120222',
    group_role: 'groupe',
    group_link_source: 'pappers',
    group_link_observed_at: new Date('2026-09-17T00:00:00Z'),
    it_challenges: sgChallenges,
    recent_signals: sgSignals,
    priority_score: 5,
    priority_justification:
      'PRUDENT — le fit d’offre et le calendrier sont bons (plan 2029, industrialisation de l’IA), mais l’accès est le point dur : la direction informatique du groupe est verrouillée et les grandes ESN y sont installées. L’entrée réaliste passe par les filiales à autonomie propre.',
    commercial_status: 'watching',
    priority_gate: 'prioritised',
    gate_reason: null,
    // ARBITRAGE (file « arbitrage » du board d'effort) : sorti, avec son motif.
    // Cohérent avec sa propre `priority_justification` deux lignes plus haut —
    // « l'accès est le point dur : la direction informatique du groupe est
    // verrouillée et les grandes ESN y sont installées » — la même raison,
    // reformulée pour un board qui se lit sans rouvrir la fiche.
    sprint: 'no_go',
    sprint_exit_reason:
      'Direction informatique verrouillée, grandes ESN déjà installées — pas d’entrée réaliste par le siège. Reprendre seulement si une filiale à autonomie propre revient dans les échanges.',
    relationship_memory: {
      relation: 'Référencés au catalogue Achats IT depuis 2023, hors des lots stratégiques.',
      // #3246.relation — le STADE, choisi dans la liste fermée à côté du texte libre (jamais
      // tiré de lui) : référencés et une affaire DevSecOps gagnée — un client en cours.
      relationStage: 'client_actif',
      // #2117.14 — DEMO_OWNER (Maëlle Lorquin) est le seul membre RÉEL de
      // l'espace de démo (« Bellum Conseil » est solo) : un nom hors de cet
      // ⚠️ RENVERSÉ le 29/10/2026 (Louis) : la salle n'est plus solo, voir
      // DEMO_SHARED_ACCOUNT_WORK — « le mode équipe est ce que Bedros et Adel
      // ont acheté ». Le propriétaire de relation reste l'occupant (son nom
      // est celui d'un membre RÉEL de la salle), le texte ci-dessous est l'ancien.
      // espace ne tient pas la règle « qui, côté ESN, porte la relation ».
      owner: 'Maëlle Lorquin',
      lastContactAt: '2026-07-02',
      nextReviewAt: '2026-10-15',
      issue: 'Renouvellement du référencement fournisseur reporté à la fin d’année.',
      source: 'CRM + point trimestriel achats',
      competitiveEdge:
        'Deux ESN déjà installées sur le périmètre paiement. Notre angle est le renfort borné sur les jalons techniques, pas le remplacement — c’est ce qui a marché chez leur homologue en 2024.',
    },
    /**
     * LE TIROIR « CE QUI A CHANGÉ » (D213) — le seul dossier du jeu qui en
     * porte un, parce qu'il est le seul à avoir été réanalysé.
     *
     * Trois des quatre sections sont exercées d'un coup : l'effectif a CHANGÉ,
     * le chiffre d'affaires a DISPARU des sources (il redevient inconnu AVEC sa
     * date — on archive, on ne supprime pas), et le secteur, le siège et le
     * site sont INCHANGÉS. C'est cette dernière ligne qui fait la démonstration :
     * sans elle, le visiteur ne saurait pas si le produit a vérifié le reste ou
     * s'il n'a rien regardé.
     */
    previous_analysis_at: '2026-06-18',
    previous_raw_analysis: {
      demo_seed: true,
      siren: '552120222',
      // A CHANGÉ depuis : la tranche INSEE publiée était l'ancienne.
      employees: '5 000 à 9 999 salariés (tranche INSEE 2022)',
      // A DISPARU des sources : aucun exercice n'était encore déposé.
      // Il redevient inconnu AVEC sa date, il ne s'efface pas.
      revenue: '25,1 Md€ au dernier exercice publié (2023, comptes déposés au registre)',
      // INCHANGÉS — la moitié qui prouve que le reste a été regardé.
      sector: 'Banque — autres intermédiations monétaires (NAF 64.19Z)',
      headquarters: '17 cours Valmy, 92800 Puteaux',
      website: 'https://www.societegenerale.com',
    },
    raw_analysis: {
      demo_seed: true,
      // Les cinq faits de fiche que la phase 1 écrit RÉELLEMENT dans le blob
      // (`AnalysisResearchData`), et sur lesquels le tiroir « ce qui a changé »
      // se calcule. Le jeu ne les portait que sur les colonnes : un dossier de
      // démonstration doit avoir la forme d'un dossier réel, sinon l'écran s'y
      // comporte autrement qu'en production.
      //
      // ⚠️ `revenue` est volontairement ABSENT ici : c'est lui qui a disparu
      // des sources entre les deux versions.
      siren: '552120222',
      sector: 'Banque — autres intermédiations monétaires (NAF 64.19Z)',
      employees: '10 000 salariés et plus (tranche INSEE 2023)',
      headquarters: '17 cours Valmy, 92800 Puteaux',
      website: 'https://www.societegenerale.com',

      /* ---- Ce que le dernier rafraîchissement a changé (#2125.50-.56) -----
         Parité démo : la carte « Ce que le dernier rafraîchissement a changé »
         (`RefreshOutcomeCard`) lit CETTE clé. En production, le serveur l'écrit
         au retour d'un rafraîchissement par axe (`AnalysisRefreshService`) ;
         l'espace de démonstration ne déclenche pas de geste payant, donc sans
         semis l'écran s'ouvrirait vide devant un prospect.

         Les CINQ cas que la carte sait rendre sont exercés d'un coup, et ils
         sont COHÉRENTS avec `previous_raw_analysis` juste au-dessus : l'effectif
         a changé, le chiffre d'affaires a disparu des sources (il redevient
         inconnu AVEC sa date), le site a été trouvé, le siège corrigé à la
         main a survécu au run, et deux faits relus sont revenus IDENTIQUES
         (#2555.2 — la quatrième catégorie du diff, « nouveaux · modifiés ·
         inchangés · erreurs » : sans elle, un fait reconfirmé ne se
         distinguait pas d'un fait jamais revu). */
      last_refresh: {
        at: '2026-09-12T08:12:00.000Z',
        phase: 'signals',
        diff: {
          newFacts: [{ key: 'website', label: 'website', value: 'https://www.societegenerale.com' }],
          changedFacts: [
            {
              key: 'employees',
              label: 'employees',
              before: '5 000 à 9 999 salariés (tranche INSEE 2022)',
              after: '10 000 salariés et plus (tranche INSEE 2023)',
            },
          ],
          obsoleteFacts: [
            {
              key: 'revenue',
              label: 'revenue',
              lastKnownValue: '25,1 Md€ au dernier exercice publié (2023)',
              lastSeenAt: '2026-06-18T00:00:00.000Z',
            },
          ],
          preservedCorrections: [
            {
              key: 'headquarters',
              label: 'headquarters',
              // Brief commercial du 01/10/2026 : le siège est les Tours SG de
              // Puteaux (La Défense) ; le 29 boulevard Haussmann (Paris 9e) est la
              // direction historique, jamais le siège.
              keptValue: '17 cours Valmy, 92800 Puteaux',
              discardedValue: '29 boulevard Haussmann, 75009 Paris',
            },
          ],
          changedRecommendations: [],
          obsoleteActions: [],
          // #2318.4 — les trois catégories qui manquaient au diff pour
          // arriver aux onze champs de LAU-FINAL-059.
          expiredSignals: [
            {
              key: 'levee-2025',
              label: 'Levée obligataire verte (2025)',
              lastKnownValue: '1,5 Md€ — obligation verte',
              lastSeenAt: '2026-05-01T00:00:00.000Z',
            },
          ],
          scoreChanged: { key: 'priority_score', label: 'Score', before: '42', after: '50' },
          confidenceChanged: { key: 'confidence', label: 'Confiance', before: '76', after: '83' },
          unmeasured: [],
          // #2555.2 — secteur et forme juridique relus à l'identique : ni un
          // changement, ni une correction à conserver, un fait RECONFIRMÉ.
          unchangedFacts: 2,
        },
      },

      /* ---- Préparer le rendez-vous (parité démo) --------------------------
         La phase 4 produit ces deux blocs à chaque analyse ; l'écran Plan les
         affiche depuis le chantier Recovery Pack. Sans seed, la carte serait
         absente du lien de démonstration — un écran livré mais vide se
         découvre en réunion, pas en CI. */
      powerQuestions: [
        'Sur quels critères tranchez-vous entre un partenaire déjà référencé et un nouvel entrant ? — [fait verbaliser la vraie barrière]',
        'Qu’est-ce qui, aujourd’hui, vous fait dire qu’un renfort externe a bien fonctionné ? — [donne le KPI de succès, avant la proposition]',
        'Quelle partie du programme prend le plus de retard, et pourquoi ? — [ouvre la douleur sans la nommer à sa place]',
        'Qui, en dehors de vous, doit être convaincu avant une décision ? — [cartographie le circuit sans demander « êtes-vous décideur »]',
      ],
      rdvScript: {
        opening:
          'Merci pour le créneau. J’ai suivi la réorganisation annoncée ce trimestre, et je voulais comprendre ce qu’elle change concrètement pour vos équipes avant de vous proposer quoi que ce soit.',
        positioning:
          'Nous intervenons surtout là où un programme est lancé mais où les profils manquent au moment précis où il accélère. C’est le point où nos clients comparables nous appellent.',
        exploration:
          'Quatre questions ouvertes, posées dans l’ordre : la vraie barrière, le critère de succès, le point de retard, le circuit de décision.',
        proposal:
          'Selon ce qui ressort, un cadrage de deux semaines sur le périmètre le plus tendu, avec un livrable écrit — pas une mission longue décidée aujourd’hui.',
        closing:
          'Si le sujet tient, je vous propose de se revoir avec la personne qui porte le budget. Sinon, je vous laisse mes coordonnées et je ne relance pas.',
      },

      /* La barrière d'ACHAT estimée (tome 3), calculée par le MÊME moteur que la
         production (`access_scoring.barrier_for_company`) sur les valeurs de
         registre de ce dossier (grande entreprise, tranche 10 000+, 2 332
         établissements) — jamais saisie à la main. Re-semée le 01/10/2026
         (retrait des dossiers qui en portaient une). Cohérente avec la
         stratégie du dossier : « entrer petit, sur une filiale qui décide
         seule » — les achats sont déconcentrés, donc une porte par entité. */
      access_barrier: {
        score: 4.8,
        accessibility: 5.9,
        access_class: 'B',
        label: 'Ouvert par une entité',
        proxies: [
          {
            key: 'statut',
            contribution: 3.15,
            evidence: 'grande entreprise au sens INSEE — direction achats, panel fournisseurs, contrôle des dépenses',
            measurable: true,
          },
          {
            key: 'effectif',
            contribution: 2.45,
            evidence: 'effectif 20000 salariés — la maturité achat croît par paliers',
            measurable: true,
          },
          {
            key: 'cotation',
            contribution: 0.0,
            evidence: 'cotation inconnue — aucune source publique ne la lie au SIREN',
            measurable: false,
          },
          {
            key: 'commande_publique',
            contribution: 0.0,
            evidence: 'exposition à la commande publique non vérifiée',
            measurable: false,
          },
          {
            key: 'decentralisation',
            contribution: -0.8,
            evidence: '2332 établissements — référencements déconcentrés probables',
            measurable: true,
          },
          {
            key: 'anciennete',
            contribution: 0.0,
            evidence: 'date de création inconnue',
            measurable: false,
          },
        ],
        measurable: true,
        missing: ['cotation', 'commande_publique', 'anciennete'],
        corrections: [],
        warning: null,
      },
      /** L'ADRESSABILITÉ — même mécanique et mêmes quatre axes non mesurés que
       *  le dossier SNCF (voir son docblock) : `lock` seul est mesuré, classe B
       *  → 3 points sur 6 (`_LOCK_POINTS_BY_CLASS`). */
      addressability: {
        score: 3,
        max: 6,
        unmeasured: ['proportion', 'path', 'relation', 'access_cost'],
        factors: [
          {
            axis: 'lock',
            label: 'Ouvert par une entité — estimation de registre',
            points: 3,
            evidence:
              'barrière estimée 4.8/10 sur 3 proxies publics (classe B) — aucune trace de marché public à son nom',
            block: 'accessibility',
          },
        ],
      },

      /* ---- Identité légale : ce que le registre publie, mot pour mot ---- */
      legal_name: 'SOCIETE GENERALE',
      legal_form: 'Société anonyme',
      capital: null,
      creation_date: null,
      activity_label: 'Autres intermédiations monétaires (64.19Z)',
      corporate_purpose:
        'Établissement de crédit exerçant les activités de banque de détail, de banque de financement et d’investissement et de services financiers spécialisés.',
      financials_history: [
        {
          year: 2024,
          closing_date: '2024-12-31',
          revenue: 26_788_000_000,
          net_result: 5_129_000_000,
          headcount: null,
        },
      ],
      // Bloc 16_INDICATEURS du CSV importé le 27/09/2026 (48 lignes — des
      // indicateurs PAR PÉRIMÈTRE, jamais versés dans `financials_history` qui
      // est un chiffre groupe, voir le docblock de `account-analysis.ts`).
      financial_indicators: sgCsvFinancialIndicators,
      executives: [
        {
          first_name: 'Lorenzo',
          last_name: 'Bini Smaghi',
          role: 'Président du conseil d’administration',
          is_c_level: true,
        },
        { first_name: 'Pierre', last_name: 'Palmieri', role: 'Directeur général délégué', is_c_level: true },
      ],
      c_level: [
        {
          first_name: 'Lorenzo',
          last_name: 'Bini Smaghi',
          role: 'Président du conseil d’administration',
          is_c_level: true,
        },
        { first_name: 'Pierre', last_name: 'Palmieri', role: 'Directeur général délégué', is_c_level: true },
      ],
      subsidiaries: [
        { siren: '351058151', name: 'Boursorama', legal_name: 'BOURSORAMA' },
        { siren: '807465059', name: 'Treezor', legal_name: 'TREEZOR' },
        // #4327.2 — une filiale DÉDUITE (nommée par la presse, sans SIREN) s'affiche « à confirmer » avec sa source ;
        // fictive comme tout le jeu de démo.
        { name: 'Ayvens Conseil', source: 'web', siren: null, source_url: 'https://www.lesechos.fr/finance-marches' },
        {
          siren: '308396308',
          name: 'Société Générale Holding de Participations',
          legal_name: 'SOCIETE GENERALE HOLDING DE PARTICIPATIONS',
        },
        {
          siren: '331302794',
          name: 'Groupement des Cartes Bancaires',
          legal_name: 'GIE GROUPEMENT DES CARTES BANCAIRES',
        },
      ],
      branches: [
        {
          city: 'Puteaux',
          postal_code: '92800',
          country: 'France',
          latitude: 48.8847,
          longitude: 2.2381,
          is_headquarters: true,
        },
        {
          city: 'Paris',
          postal_code: '75009',
          country: 'France',
          latitude: 48.8738,
          longitude: 2.3312,
          is_headquarters: false,
        },
        {
          city: 'Courbevoie',
          postal_code: '92400',
          country: 'France',
          latitude: 48.8975,
          longitude: 2.2569,
          is_headquarters: false,
        },
        {
          city: 'Nancy',
          postal_code: '54000',
          country: 'France',
          latitude: 48.6921,
          longitude: 6.1844,
          is_headquarters: false,
        },
      ],
      branch_count: 2332,

      /* ---- Sources ouvertes relevées pendant le run du 10/08, complétées
         par la stack observée du compte CSV (bloc 13, ligne « citée dans les
         offres du compte » — SG-2190, 27/09/2026) ---- */
      detected_tech_stack: [
        'jQuery',
        'Drupal',
        'Google Analytics',
        'Google Tag Manager',
        'Apache',
        ...sgCsvDetectedTechStack,
      ],
      github_signals: {
        org: 'societe-generale',
        url: 'https://github.com/societe-generale',
        public_repos: 42,
        top_languages: ['Java', 'Python', 'HTML', 'Kotlin', 'TypeScript'],
        active_recent_repos: 10,
        last_activity: '2026-08-07',
      },
      program_names: [
        {
          name: 'Plan stratégique à horizon 2029',
          entity: 'Société Générale',
          budget: 'non communiqué',
          description: 'Plan pluriannuel annoncé pour la fin 2026 (source : L’Agefi).',
          // #3677.7 — objectif / périmètre / horizon : lus dans « Signaux et besoins ».
          objective: 'Simplifier le groupe et réduire le coût d’exploitation du système d’information',
          scope: 'Banque de détail France et fonctions support du groupe',
          horizon: '2029',
        },
        // Bloc 11_PROGRAMMES_TRANSFORMATION du CSV importé le 27/09/2026 (5
        // programmes réels, décrits dans `sg-csv-mapping.ts`).
        ...sgCsvProgramNames,
      ],
      it_implications_for_esn:
        'La taille du groupe (plus de 10 000 salariés, 2 332 établissements ouverts au registre) implique un besoin continu de maintenance applicative, de modernisation cloud et de renforcement de la sécurité. Mais la même taille est le principal obstacle : pour une ESN de 50 à 150 consultants, l’entrée réaliste est une filiale à autonomie propre, pas la direction informatique du groupe.',
      // Bloc 01_LECTURE_STRUCTURELLE du CSV importé le 27/09/2026 (14 axes de
      // lecture généraux sur l'organisation et les cycles d'achat du groupe).
      // + la répartition COMPTÉE des familles de métiers des 91 profils en
      // poste (blocs 06/07, agrégat — aucun nom), complément du 28/09/2026.
      structural_reading_axes: [...sgCsvStructuralReadingAxes, ...(sgCsvJobFamilyNote ? [sgCsvJobFamilyNote] : [])],
      business_description:
        'Société Générale est l’une des principales banques françaises : banque de détail en France et à l’international, banque de financement et d’investissement, services financiers spécialisés. Le groupe compte 2 332 établissements ouverts au registre et a publié 26,8 Md€ au dernier exercice déposé (2024).',
      it_challenges: sgChallenges,
      recent_signals: sgSignals,
      // #4755 (lot 761, craft rule 9) — le tableau « Signaux et besoins » : deux offres de la MÊME équipe le même
      // mois (une ligne dépliable « 1 ligne regroupée ») et un marché public récent, datés au semis.
      it_job_signals: SG_SIGNAL_TABLE_JOBS,
      public_tenders: SG_SIGNAL_TABLE_TENDERS,
      // #2687 — l'angle ESN et la première action que la Veille affiche SOUS le
      // signal qui les fonde. Le lien passe par `based_on_signal_ids`.
      // #3939.a — et le panneau « Hypothèses qualifiées » de la Veille, avec leurs
      // signaux fondateurs (garde `demo-watch-hypotheses.spec.ts`).
      qualified_hypotheses: sgHypotheses,
      // Bloc 10_IMPLANTATIONS du CSV importé le 27/09/2026 — France uniquement
      // (`SitesFranceCard` est nommée « France » ; les 7 implantations hors
      // France du même bloc n'ont pas de champ d'accueil, voir le rapport).
      sites_france: [...sgSites, ...sgCsvSitesFrance],
      technology_stack: [
        { name: 'Cloud hybride', usage: 'Modernisation des infrastructures du groupe', maturity: 'production' },
        { name: 'IA générative documentaire', usage: 'Accès aux bases documentaires internes', maturity: 'adoption' },
        { name: 'Java / Python', usage: 'Langages dominants des dépôts publics du groupe', maturity: 'production' },
        // Bloc 12_APPLICATIONS_IA du CSV importé le 27/09/2026 (15 cas d'usage
        // IA réels et nommés — aucun ne cite ni budget ni staffing, la CSV
        // elle-même le précise en `fiabilite`).
        ...sgCsvAiApplications,
        // Les technologies des profils en poste, COMPTÉES (blocs 06/07,
        // agrégat — aucun nom), complément du 28/09/2026.
        ...sgCsvContactTechnologyCounts,
      ],
      // Bloc 09_ENTITES_ET_PERIMETRE du CSV importé le 27/09/2026 (55 lignes,
      // dédoublonnées contre les trois entités déjà écrites à la main).
      entities_exhaustive: [
        {
          name: 'Société Générale (maison mère)',
          type: 'siege',
          parent: null,
          region: 'Île-de-France',
          estimated_headcount: '10 000 et plus',
          it_autonomy: 'centralisee',
          relevance: 'operational',
          actionable: false,
        },
        {
          name: 'Treezor',
          type: 'filiale',
          parent: 'Société Générale',
          region: 'Île-de-France',
          estimated_headcount: 'non publié',
          it_autonomy: 'autonome',
          relevance: 'filiale_strategique',
          actionable: true,
        },
        {
          name: 'Boursorama / BoursoBank',
          type: 'filiale',
          parent: 'Société Générale',
          region: 'Île-de-France',
          estimated_headcount: 'non publié',
          it_autonomy: 'autonome',
          relevance: 'operational',
          actionable: true,
        },
        ...sgCsvEntities,
      ],
      // #2966 (#2119.43-51) — les 2-4 périmètres priorisés que
      // `apps/ia/app/services/perimeter_score.py::select_priority_perimeters`
      // calcule sur un vrai dossier (score /20 déterministe, 5 axes /4). La
      // maison mère n'y figure JAMAIS (§2 : « pas le groupe, les périmètres
      // actionnables ») — seules les deux filiales qui obtiennent réellement une
      // action commerciale (`actionable: true` ci-dessus) sont priorisées.
      priority_perimeters: [
        {
          name: 'Treezor',
          tier: 'P1',
          perimeterScore: 18,
          scoreBreakdown: [
            { axis: 'operationnelle', label: 'Entité opérationnelle identifiable', points: 4, max: 4 },
            { axis: 'owner', label: 'Sponsor / owner probable', points: 4, max: 4 },
            { axis: 'signal', label: 'Signal spécifique', points: 4, max: 4 },
            { axis: 'fit_offre', label: 'Fit offre ESN', points: 4, max: 4 },
            { axis: 'accessibilite', label: 'Accessibilité (14 jours)', points: 2, max: 4 },
          ],
          whatToSell: ['Renfort développement API paiement', 'Sécurisation infra BaaS'],
          entryRole: 'décideur N-1 (middle-out)',
          confidence: 'high',
          why: '18/20 · entité IT · angle identifié',
        },
        {
          name: 'Boursorama / BoursoBank',
          tier: 'P2',
          perimeterScore: 13,
          scoreBreakdown: [
            { axis: 'operationnelle', label: 'Entité opérationnelle identifiable', points: 4, max: 4 },
            { axis: 'owner', label: 'Sponsor / owner probable', points: 2, max: 4 },
            { axis: 'signal', label: 'Signal spécifique', points: 1, max: 4 },
            { axis: 'fit_offre', label: 'Fit offre ESN', points: 2, max: 4 },
            { axis: 'accessibilite', label: 'Accessibilité (14 jours)', points: 4, max: 4 },
          ],
          whatToSell: [],
          entryRole: 'opérationnel / prescripteur (bottom-up)',
          confidence: 'medium',
          why: '13/20',
        },
      ],
      contacts_out_of_scope: {
        dropped: 12,
        entities: [
          { name: 'Groupements d’intérêt économique internes', count: 8 },
          { name: 'Sociétés civiles immobilières du groupe', count: 4 },
        ],
      },
      // Bloc 17_GARDE_FOUS du CSV importé le 27/09/2026 (20 mises en garde sur
      // la FIABILITÉ DES DONNÉES du dossier — distinctes de `risks`, qui porte
      // le risque COMMERCIAL).
      data_reliability_notes: sgCsvDataReliabilityNotes,
      // #2265.13 — Société Générale porte, au registre, plusieurs entités quasi
      // homonymes (le groupe coté, des filiales et des SCI internes portant un
      // nom proche) : le cas RÉEL qui a fait naître cette exigence (Théo p.10).
      // `status: "selected"` = la désambiguïsation a choisi un candidat DOMINANT
      // sans confirmation humaine — la salle montre l'annonce, pas un choix
      // silencieux.
      homonyms: {
        status: 'selected',
        selectedSiren: '552120222',
        confidence: 0.86,
        message:
          'SIREN 552120222 (SOCIETE GENERALE) retenu parmi 4 homonymes au registre (confiance 86 %, écart de score décisif vs 2ᵉ à 38 %).',
      },
      // #2284 — le verdict de l'Entity Resolver, COMPOSÉ des deux blocs
      // ci-dessus (homonymes + identité registre) : maison mère ancrée sur son
      // SIREN, quatre filiales connues (= `subsidiaries`), confiance 86 (= la
      // confiance de la désambiguïsation). Mêmes faits, un seul verdict.
      entity_resolution: {
        state: 'resolved',
        kind: 'parent_company',
        canonical_id: 'FR-SIREN-552120222',
        commercial_name: 'Société Générale',
        legal_name: 'SOCIETE GENERALE',
        country: 'FR',
        identifiers: { siren: '552120222' },
        domain: 'societegenerale.com',
        naf_code: '64.19Z',
        naf_label: 'Autres intermédiations monétaires',
        location: 'Paris',
        parent_names: [],
        children_count: 4,
        sources: [
          'normalized_name',
          'official_domain',
          'legal_identifier',
          'registry_country',
          'public_company_profile',
          'group_graph',
        ],
        confidence: 86,
        reasons: [],
        question: null,
        resolved_at: '2026-09-24T08:00:00Z',
      },
      competitors: [
        {
          name: 'Capgemini',
          contract_type: 'Transformation, cloud, data',
          strengths: 'Taille, expertise bancaire, capacité programme',
          weaknesses: 'Coût, faible agilité sur des missions courtes',
        },
        {
          name: 'Sopra Steria',
          contract_type: 'Maintenance applicative, intégration',
          strengths: 'Présence installée dans la banque française',
          weaknesses: 'Moins différenciant sur l’industrialisation de l’IA',
        },
      ],
      // Bloc 14_ECOSYSTEME du CSV importé le 27/09/2026 (15 acteurs tiers —
      // acquéreurs de périmètres cédés, partenaires, organismes de place — ni
      // une entité du compte, ni un concurrent ESN).
      ecosystem_third_parties: sgCsvEcosystemThirdParties,
      pains: [
        {
          pain: 'Écart entre le rythme trimestriel attendu par les marchés et la capacité de livraison interne',
          business_impact: 'Des jalons de plan pluriannuel tenus au prix d’arbitrages tardifs',
          esn_offer: 'Renfort cloud et industrialisation de chaînes de livraison',
          urgency: 'high',
        },
        {
          pain: 'Prototypes d’IA générative qui ne passent pas en production',
          business_impact: 'Un investissement déjà consenti qui ne produit pas d’effet mesurable',
          esn_offer: 'Cadrage d’industrialisation : gouvernance, MLOps, conformité',
          urgency: 'high',
        },
      ],
      /* ---- Les prochaines actions du plan (parité démo, #2123.15/.18/.34) --
         Le plan ouvre sur « Trois prochaines actions » et « Horizon 60-90
         jours ». Sans ces lignes, les deux sections s'annonceraient « Non
         produit par la dernière analyse » sur le lien de démonstration — un
         écran livré mais vide se découvre en réunion, pas en CI (craft rule
         n°9). CINQ actions, pour que la troncature à trois SE VOIE, et deux
         échéances lointaines pour que l'horizon fusionné ne soit pas creux.
         Lues à plat par `buildPlanViewData` : aucune clé `plan` n'est ajoutée,
         le lecteur retombe sur la racine du blob.
         */
      nextActions: [
        {
          id: 'demo_sg_next_1',
          chantier: 'contacts',
          label: 'Rappeler le responsable data & IA de la business unit paiements',
          why: 'Il a parlé publiquement du passage en production ; personne ne l’a encore rappelé.',
          horizon: '7j',
        },
        {
          id: 'demo_sg_next_2',
          chantier: 'messages',
          label: 'Envoyer la note de cadrage d’industrialisation à la DSI de la filiale',
          why: 'Le sujet est financé au stade prototype ; la note ouvre sur la gouvernance des données.',
          horizon: '7j',
        },
        {
          id: 'demo_sg_next_3',
          chantier: 'signaux',
          label: 'Suivre les recrutements MLOps annoncés sur les trois derniers mois',
          why: 'Un recrutement interne dit où le budget se déplace.',
          horizon: '30j',
        },
        {
          id: 'demo_sg_next_4',
          chantier: 'compte',
          label: 'Cartographier les filiales qui portent leur propre budget informatique',
          why: 'Le comité d’achat central ferme la porte ; les filiales ne l’ont pas.',
          horizon: '60j',
        },
        {
          id: 'demo_sg_next_5',
          chantier: 'expansion',
          label: 'Préparer l’ouverture d’un second périmètre après une première mission',
          why: 'Le même sponsor couvre deux entités ; l’extension se prépare avant la fin de la première.',
          horizon: '90j',
        },
      ],
      axes_ecartes: [
        {
          angle: 'Entrée directe par la direction informatique du groupe',
          raison:
            'Comité d’achat centralisé, panel fournisseur établi, cycle de 6 à 12 mois : une ESN de cette taille n’y est pas retenue en approche froide.',
          comment_reactiver:
            'À rouvrir si un client commun introduit, ou après une première mission réussie en filiale.',
        },
        {
          angle: 'Filiales bancaires hors de France',
          raison: 'Accessibles sur le papier, mais hors de la zone géographique de l’ESN et sans sponsor local.',
          comment_reactiver: 'À reconsidérer avec un partenaire local en co-traitance.',
        },
      ],
      // Bloc 15_DOMAINES_OPPORTUNITE du CSV importé le 27/09/2026 (14 domaines
      // d'opportunité observés — constat/interprétation/implication déclarés
      // dans la source, aucun score ni persona repris, voir le docblock
      // d'`opportunity_domains` dans account-analysis.ts).
      opportunity_domains: sgCsvOpportunityDomains,
      angles: [
        {
          title: 'Industrialiser un cas d’usage d’IA documentaire déjà public',
          strategy:
            'Le groupe a communiqué sur son approche d’IA générative documentaire. Un sujet dont on parle publiquement est un sujet déjà financé au stade prototype : la valeur restante est son passage en production — gouvernance des données, MLOps, conformité.',
          description:
            'Cadrage de six semaines sur UN cas d’usage documentaire existant, avec un livrable daté et un critère d’arrêt écrit.',
          entry_contact_persona: 'Responsable data & IA de business unit',
          specific_offer: 'Cadrage d’industrialisation, deux consultants, six semaines',
          estimated_deal_size: 'Hypothèse — à recaler sur la grille réelle du client',
          proof: 'Industrialisation d’un socle conteneurisé pour un équipementier',
          proof_status: 'mobilisable',
        },
        {
          title: 'Renfort cloud sur la trajectoire du plan 2029',
          strategy:
            'Sécuriser un jalon technique du plan annoncé pour fin 2026, sur un périmètre défini, sans ouvrir de programme global.',
          description:
            'Deux profils cloud et livraison continue sur une filiale à autonomie propre, mission initiale de huit à douze semaines.',
          entry_contact_persona: 'Directeur des systèmes d’information de filiale',
          specific_offer: 'Renfort d’équipe, deux profils, mission bornée',
          estimated_deal_size: 'Hypothèse — à recaler sur la grille réelle du client',
          proof: 'Socle Kubernetes multi-région pour un opérateur d’énergie',
          proof_status: 'mobilisable',
        },
        {
          title: 'Revue de sécurité applicative sur un parcours d’authentification',
          strategy:
            'Chaque canal digital ajouté élargit la surface d’attaque, sous contrainte réglementaire permanente. Une revue bornée sur UN parcours est un format qu’une direction sécurité peut accepter sans appel d’offres.',
          description: 'Revue ciblée avec plan de remédiation priorisé, six semaines.',
          entry_contact_persona: 'Responsable sécurité applicative',
          specific_offer: 'Revue de sécurité applicative, un parcours, plan de remédiation',
          estimated_deal_size: 'Hypothèse — à recaler sur la grille réelle du client',
          proof: '',
          proof_status: 'absent',
        },
      ],
      comment_ouvrir_compte: {
        strategy:
          'Ne pas ouvrir par le siège. Deux fils en parallèle sur des filiales à autonomie propre, portés par deux personnes distinctes, avec le circuit d’achat qualifié dès la deuxième semaine — pas après la validation métier.',
        entry_points: [
          {
            label: 'Filiale de services de paiement',
            target_profile: 'Direction technique d’une filiale à autonomie propre',
            justification:
              'Décide de ses propres prestataires, cycle court, aucun titulaire identifié dans les sources.',
          },
          {
            label: 'Industrialisation de l’IA documentaire',
            target_profile: 'Responsable data & IA de business unit',
            justification: 'Sujet public, donc déjà financé au stade prototype ; la production reste à faire.',
          },
        ],
      },
      messages: [
        {
          contact_name: 'Directeur des systèmes d’information — filiale de paiement',
          linkedin_message:
            'Bonjour, le plan à horizon 2029 annoncé pour la fin d’année suppose des jalons techniques à tenir trimestre par trimestre. Nous renforçons des équipes cloud sur des périmètres bornés, sans programme à ouvrir. Vingt minutes pour vérifier si ça vous parle ?',
          email_subject: 'Jalons techniques du plan 2029 — renfort borné',
          email_body:
            'Bonjour,\n\nLe plan à horizon 2029 annoncé pour la fin d’année se cadre maintenant, pas après sa publication.\n\nNous intervenons sur des périmètres bornés : deux profils, une échéance, un critère d’arrêt écrit. Pas de programme à ouvrir.\n\nSeriez-vous disponible vingt minutes la semaine prochaine ?\n\nBien à vous,',
          phone_opener:
            'Bonjour, je vous appelle au sujet des jalons techniques du plan 2029 — nous renforçons des équipes cloud sur des périmètres bornés, sans ouvrir de programme.',
        },
      ],
      risks: [
        {
          risk: 'Le référencement fournisseur du groupe bloque l’entrée avant même la discussion technique.',
          probability: 'elevee',
          impact: 'eleve',
          mitigation: 'Qualifier le circuit d’achat de la FILIALE dès la deuxième semaine, en parallèle du fil métier.',
        },
        {
          risk: 'Absence de référence bancaire citable au moment de la qualification.',
          probability: 'moyenne',
          impact: 'moyen',
          mitigation: 'Assumer et compenser par un périmètre volontairement petit, avec un critère d’arrêt écrit.',
        },
      ],
      offers_to_propose: [
        {
          title: 'Cadrage d’industrialisation d’un cas d’usage d’IA documentaire',
          pitch: 'Faire passer en production un prototype existant, sans en démarrer un nouveau.',
          target_contact: 'Responsable data & IA de business unit',
          pain_addressed: 'Des prototypes financés qui ne produisent pas d’effet mesurable.',
          estimated_tjm: 'Hypothèse — à recaler sur la grille réelle du client',
          estimated_team_size: 2,
          estimated_duration: '6 semaines',
          differentiator: 'Un périmètre borné et un critère d’arrêt écrit, pas un audit ouvert.',
        },
      ],
      // #3717.7 — reprend MOT POUR MOT `nextActions[0].label` (`demo_sg_next_1`,
      // plus bas dans ce même blob) : c'est le cas « Première action » = premier
      // élément de « Prochaines actions » que `measurePlanListOverlap` doit
      // détecter, pour que l'écran rende « Déjà en tête » au lieu de répéter la
      // phrase (recette 08/10 : SG n'avait encore aucun cas déclenché).
      immediate_action: 'Rappeler le responsable data & IA de la business unit paiements',
      quick_wins: [
        {
          action:
            'Écrire à la direction technique de la filiale de paiement en citant le plan 2029 et en proposant un atelier de 45 minutes.',
          channel: 'Réseau professionnel',
          contact: 'Directeur des systèmes d’information — filiale de paiement',
          expected_impact: 'Atelier de cadrage obtenu',
          effort: 'low',
        },
        {
          action: 'Qualifier le circuit de référencement fournisseur de la filiale avant toute validation métier.',
          channel: 'E-mail',
          contact: seatName('Responsable achats informatiques'),
          expected_impact: 'Dix semaines de cycle économisées',
          effort: 'low',
        },
      ],
      go_no_go: 'PRUDENT',
      commercial_score: 50,
      data_confidence: 83,
      score_factors: [
        { label: 'Fit — problèmes et offres compatibles', proof_type: 'profile', weight: 4 },
        { label: 'Timing — signaux et budget maintenant', proof_type: 'signal', weight: 4 },
        { label: 'Accessibilité — relation, entité, panel, taille', proof_type: 'contact', weight: 3 },
        { label: 'Concurrence — titulaires installés', proof_type: 'source', weight: 2 },
      ],
      evaluation: {
        go_no_go: 'PRUDENT',
        global_score: 15,
        justification:
          'Potentiel réel (fit et calendrier solides), accès complexe : direction informatique groupe verrouillée, grandes ESN installées, aucune référence bancaire citable. L’entrée passe par les filiales à autonomie propre, sur des missions volontairement petites.',
        // #2118 — LA LECTURE STRUCTURÉE, cas honnête : DEUX axes « non mesurés ».
        // Ils n'ont pas de note, et le score se lit sur cinq axes (15/25), pas
        // sur sept (15/35) : un axe qu'on n'a pas pu évaluer SORT du
        // dénominateur, il ne compte jamais pour zéro (GA-18 / GA-19). C'est la
        // règle qu'un prospect doit pouvoir constater à l'écran, pas seulement
        // lire dans une documentation.
        dossier_read: {
          axes: [
            {
              key: 'adequation_offre',
              state: 'measured',
              value: 4,
              impact: 'Cybersécurité et conformité : ton domaine, sur un secteur bancaire que tu cibles.',
              lever: 'Une référence bancaire citable lèverait la dernière réserve.',
            },
            {
              key: 'potentiel_commercial',
              state: 'measured',
              value: 4,
              impact: 'Le volume existe, mais il se gagne filiale par filiale — pas au niveau du groupe.',
              lever: 'Une première mission dans une filiale autonome ouvre les suivantes.',
            },
            {
              key: 'fraicheur',
              state: 'partial',
              value: 3,
              impact: 'Le calendrier réglementaire est public et daté ; les arbitrages internes ne le sont pas.',
              lever: 'Dater un chantier interne auprès d’un interlocuteur de la filiale.',
            },
            {
              key: 'accessibilite',
              state: 'measured',
              value: 2,
              impact: 'La direction informatique groupe est verrouillée : l’entrée passe par les filiales.',
              lever: 'Identifier une filiale dont le budget informatique est arbitré localement.',
            },
            {
              key: 'concurrence',
              state: 'measured',
              value: 2,
              impact: 'De grandes ESN sont installées et référencées au niveau du groupe.',
              lever: 'Viser un périmètre trop petit pour intéresser un titulaire installé.',
            },
            {
              key: 'capacite_achat_externe',
              state: 'unknown',
              impact: 'Le processus d’achat de prestation des filiales n’a pas pu être établi.',
              lever: 'Le demander au premier échange : il ne se déduit pas d’une source publique.',
            },
            {
              key: 'qualite_preuves',
              state: 'unknown',
              impact: 'Trop peu de sources datées sur le périmètre des filiales pour juger cet axe.',
              lever: 'Une veille sur deux filiales pendant un mois suffirait à le noter.',
            },
          ],
          why_for_your_esn:
            'La conformité réglementaire est l’un de tes trois domaines, et la banque de détail l’un de tes secteurs cibles — mais à moins de dix consultants, le référencement groupe t’est fermé : ce qui rend ce compte jouable pour TOI, c’est l’autonomie budgétaire de certaines filiales, pas la taille du groupe.',
          recommended_scope:
            'Une filiale à autonomie budgétaire, sur un périmètre volontairement petit — pas la direction informatique du groupe.',
          best_entry_point: {
            label: 'Le responsable des achats informatiques d’une filiale autonome',
            target_profile: 'N-1, arbitre son budget sans passer par le groupe',
            why: 'C’est le seul circuit où une ESN non référencée peut être retenue.',
          },
          // #2304.7 (épopée #2932) — Q6, distincte de best_entry_point (QUI) :
          // PAR OÙ entrer commercialement.
          access_path:
            'Le renouvellement du marché de conformité réglementaire d’une filiale s’ouvre hors du référencement groupe : c’est une porte d’entrée locale, pas l’appel d’offres centralisé.',
          obstacles: [
            {
              label: 'Aucune référence bancaire citable',
              why: 'Dans ce secteur, elle est souvent demandée avant la première réunion.',
            },
            {
              label: 'Référencement groupe déjà attribué à de grandes ESN',
              why: 'Le contourner par le haut est impossible à ta taille ; par la filiale, il devient contournable.',
            },
          ],
          anti_advice: {
            what: 'N’envoie pas de dossier de référencement au groupe.',
            why: 'Le circuit exige des références bancaires et une taille d’équipe que tu n’as pas : tu y perdrais six semaines pour un refus administratif, alors que la filiale peut décider en trois.',
          },
          next_action: {
            label: 'Identifier la filiale dont le budget informatique est arbitré localement',
            tab: 'contacts',
          },
          reliability: {
            quality: { state: 'partial', value: 61, note: 'Sources publiques solides, rien sur l’interne.' },
            coverage: { state: 'partial', value: 40, note: 'Deux filiales documentées sur les huit du périmètre.' },
            freshness: { state: 'unknown', note: 'Aucun fait daté de moins de six mois sur les filiales.' },
          },
          missing: [
            {
              label: 'Le processus d’achat de prestation des filiales',
              why: 'Aucune source publique ne le décrit — il se demande.',
            },
            {
              label: 'Un interlocuteur nommé dans une filiale autonome',
              why: 'Aucun mandataire publié ne couvre ce périmètre.',
            },
            {
              label: 'La date du dernier renouvellement de référencement groupe',
              why: 'Sans elle, on ne sait pas quand la porte se rouvre.',
            },
          ],
        },
      },
      plan: {
        commercial_score: 50,
        data_confidence: 83,
        action_plan: {
          strategy: 'land_and_expand',
          justification:
            'Entrer petit, sur une filiale qui décide seule, puis se servir de la mission réussie comme de la référence interne qui manque aujourd’hui.',
          phases: sgPlanPhases,
        },
        evaluation: {
          go_no_go: 'PRUDENT',
          global_score: 15,
          justification: 'Compte à travailler dans la durée, avec un premier périmètre délibérément petit.',
        },
      },
      action_plan: {
        strategy: 'land_and_expand',
        justification:
          'Entrer petit, sur une filiale qui décide seule, puis se servir de la mission réussie comme de la référence interne qui manque aujourd’hui.',
        phases: sgPlanPhases,
      },

      // #2554.1/#2554.2 — la démo ne déclenche aucune actualisation payante :
      // sans semis, `RefreshOutcomeCard` ne montrerait jamais la revérification devant un
      // prospect. Même refus que `last_refresh` (voir `demo-coverage.spec.ts`).
      org: {
        orgGraph: societeGeneraleOrgGraph,
        peopleRefreshDiff: {
          asOf: '2026-09-17T08:00:00.000Z',
          reverified: [
            {
              personId: orgPersonSlug('Lorenzo Bini Smaghi'),
              fullName: 'Lorenzo Bini Smaghi',
              kind: 'reverified',
            },
          ],
          changedPosition: [
            {
              personId: orgPersonSlug('Pierre Palmieri'),
              fullName: 'Pierre Palmieri',
              kind: 'changedPosition',
              previousTitle: 'Directeur général',
              nextTitle: 'Directeur général délégué',
            },
          ],
          // #2318.4 — « nouveaux contacts » : un siège apparu dans ce run,
          // absent du graphe précédent.
          new: [
            {
              personId: orgPersonSlug(seatName('Architecte du système d’information groupe')),
              fullName: seatName('Architecte du système d’information groupe'),
              kind: 'new',
            },
          ],
          // Ni « parti », ni présentée comme à jour : ce siège n'a pas pu être
          // reconfirmé lors de la dernière actualisation.
          notConfirmed: [
            {
              personId: orgPersonSlug(seatName('Responsable sécurité applicative')),
              fullName: seatName('Responsable sécurité applicative'),
              kind: 'notConfirmed',
            },
          ],
          // #2318.4 — « nouvelles entités » : Treezor, déjà dans le graphe
          // courant, présentée ici comme apparue à CE run.
          newEntities: [{ entityId: 'e-sg-treezor', name: 'Treezor' }],
        },
        // Blocs 02_STRUCTURE_GROUPE + 03_ORGANIGRAMME_SI du CSV importé le
        // 27/09/2026 (118 unités réelles — lu par `orgStructureData.ts`,
        // `raw_analysis.org.units`). Aucun occupant nommé : `nb_contacts` du
        // CSV est un COMPTE, jamais une liste de noms.
        units: sgCsvOrgUnits,
        // Bloc 05_CHAINE_ACHATS du CSV importé le 27/09/2026 (27 étapes
        // réelles du circuit d'achat groupe — `raw_analysis.org.decisionChain`,
        // lu par la même section). Pas de description de synthèse ni d'acteurs
        // : aucune ligne du CSV ne les fournit, et en fabriquer une résumerait
        // 27 faits distincts en un seul qu'aucune source ne dit.
        decisionChain: {
          description: null,
          steps: sgCsvDecisionChainSteps,
          estimatedCycleLength: null,
          budgetAuthority: null,
        },
      },
    },
  },
  contacts: [
    namedContact({
      full_name: 'Lorenzo Bini Smaghi',
      title: 'Président du conseil d’administration',
      entity: 'Société Générale',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      profile_summary: `Mandataire social publié au registre du commerce (${REGISTRY_SOURCE}). Aucune information personnelle n’est ajoutée ici : la fonction est le seul fait dont on dispose, et c’est le seul qui compte pour une décision commerciale.`,
      why_contact:
        'Preuve que la gouvernance du compte est identifiée. Ce n’est PAS une porte d’entrée : personne n’ouvre un compte du CAC 40 par son conseil d’administration.',
      contact_score: 30,
      seniority: 'c_suite',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Mandataire social au registre', 'Ne pas ouvrir le compte par lui'],
    }),
    namedContact({
      full_name: 'Pierre Palmieri',
      title: 'Directeur général délégué',
      entity: 'Société Générale',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      profile_summary: `Mandataire social publié au registre du commerce (${REGISTRY_SOURCE}).`,
      why_contact:
        'Utile en fin de cycle pour sécuriser un arbitrage déjà porté en interne, jamais comme première approche à froid.',
      contact_score: 34,
      seniority: 'c_suite',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Mandataire social au registre', 'Direction générale resserrée à deux exécutifs depuis fin 2024'],
    }),
    // Le seul contact ÉCARTÉ du jeu (PDF 2, items 82-83) : la carte
    // « Écarter » ne se voit qu'à cet état, et un prospect doit pouvoir
    // constater que l'outil GARDE la raison au lieu de faire disparaître la
    // fiche.
    excluded(
      roleSeat({
        title: 'Directeur des systèmes d’information — filiale de services de paiement',
        entity: 'Treezor',
        family: 'IT',
        decision_role: 'technical',
        priority: 1,
        why_contact:
          'C’est la porte d’entrée réaliste : une filiale à autonomie propre choisit ses prestataires sans passer par le panel du groupe.',
        key_points: ['Filiale à autonomie propre', 'Aucun titulaire identifié dans les sources'],
        contact_score: 62,
      }),
      'A quitté l’entreprise — poste repris en interne',
    ),
    roleSeat({
      title: 'Responsable data & intelligence artificielle de business unit',
      entity: 'Société Générale',
      family: 'Data',
      decision_role: 'technical',
      priority: 1,
      why_contact:
        'Porte le sujet dont le groupe parle publiquement — l’IA générative documentaire — et donc le besoin d’industrialisation qui reste à faire.',
      key_points: ['Sujet public, donc déjà financé au stade prototype', 'Le passage en production reste ouvert'],
      contact_score: 58,
    }),
    roleSeat({
      title: 'Responsable sécurité applicative',
      entity: 'Société Générale',
      family: 'Cyber',
      decision_role: 'technical',
      priority: 2,
      why_contact:
        'Contrainte réglementaire permanente et surface d’attaque qui s’élargit à chaque canal : une revue bornée est un format acceptable sans appel d’offres.',
      key_points: ['Contrainte réglementaire continue', 'Format court acceptable hors appel d’offres'],
      contact_score: 48,
    }),
    roleSeat({
      title: 'Responsable achats informatiques',
      entity: 'Société Générale',
      family: 'Achat',
      decision_role: 'procurement',
      priority: 3,
      why_contact:
        'À qualifier dès la deuxième semaine pour connaître le circuit contractuel — jamais comme point d’entrée du besoin.',
      key_points: ['Passage obligé', 'À activer APRÈS le sponsor technique'],
      contact_score: 35,
    }),
    roleSeat({
      title: 'Directeur des systèmes d’information groupe',
      entity: 'Société Générale',
      family: 'IT',
      decision_role: 'technical',
      priority: 2,
      why_contact:
        'Sponsor lointain : il arbitre le cadre, pas les missions bornées. À informer une fois la première mission engagée en filiale, jamais avant.',
      key_points: ['Cadre groupe', 'Ne décide pas des missions d’entité'],
      contact_score: 40,
    }),
    roleSeat({
      title: 'Architecte du système d’information groupe',
      entity: 'Société Générale',
      family: 'IT',
      decision_role: 'influencer',
      priority: 2,
      why_contact:
        'Prescripteur discret : aucun partenaire technique n’est retenu durablement sans son avis, même sur un périmètre de filiale.',
      key_points: ['Avis déterminant sur les choix techniques', 'Rarement sollicité en premier, toujours consulté'],
      contact_score: 44,
    }),
    roleSeat({
      title: 'Responsable de la plateforme de données',
      entity: 'Boursorama / BoursoBank',
      family: 'Data',
      decision_role: 'technical',
      priority: 2,
      why_contact:
        'Filiale à autonomie propre, avec ses propres chantiers de données : deuxième porte d’entrée si la première ne répond pas.',
      key_points: ['Filiale à autonomie propre', 'Chantiers de données distincts du groupe'],
      contact_score: 46,
    }),
    // Bloc 04_GOUVERNANCE_ET_ROLES du CSV importé le 27/09/2026 — nommés
    // (chaque `linkedin` du CSV pointe une page de gouvernance ou un
    // communiqué publics, jamais un profil personnel ; vérifié ligne par
    // ligne, voir le docblock de `sg-csv-mapping.ts`), dédoublonnés contre
    // Bini Smaghi et Palmieri ci-dessus. Aucune coordonnée semée : la source
    // publique est citée en texte dans `profile_summary`, jamais dans un
    // champ qui laisserait croire à un profil personnel.
    ...sgCsvGovernanceContacts.map(contact => namedContact({ ...contact, lifecycle_state: 'identite_verifiee' })),
    // Blocs 06/07/08 du CSV (contacts opérationnels, prestataires externes en
    // poste, profils ayant exercé chez le compte) — ~1 900 personnes réelles
    // sourcées d'une base de contacts, PAS d'une annonce publique : les nommer
    // violerait la règle 3 du docblock plus haut. Variante conforme (FINIR-
    // V2-27-09, décision 2) : des sièges anonymes par famille métier RÉELLE,
    // avec le compte RÉEL cité — jamais un nom individuel. Détail dans
    // `sg-csv-mapping.ts` (`buildSgFamilyRoleSeats`).
    // V4-CORRECTIFS 4290.12 (#4055.8) — un 2e contact qui a QUITTÉ l'entreprise, sur un compte de brief : personne
    // SIMULÉE (profil `demo-bellum-`), jamais un dirigeant réel ; la relecture d'employeur a observé un autre employeur.
    {
      full_name: 'Maxime Delaunay',
      photo_url: null,
      title: 'Responsable delivery plateformes',
      entity: 'Société Générale Corporate & Investment Banking',
      family: 'Digital',
      decision_role: 'influencer',
      priority: 5,
      email: null,
      phone: null,
      linkedin_url: 'https://www.linkedin.com/in/demo-bellum-maxime-delaunay',
      profile_summary:
        'Contact ancien du dossier : la dernière relecture d’employeur l’a retrouvé dans une autre entreprise. Son titre d’origine n’est plus à jour.',
      why_contact:
        'Ne plus le solliciter ici : son poste est à repourvoir côté client, la fiche garde la preuve datée.',
      email_message: null,
      linkedin_message: null,
      contact_score: 10,
      seniority: 'confirme',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Autre employeur observé à la dernière relecture'],
      employment_check: { state: 'left', checked_days_ago: 14, organization: 'BPCE' },
    },
    ...sgCsvFamilyRoleSeats.map(seat => roleSeat(seat)),
  ],
  // #4755 (lot 761, craft rule 9) — l'Historique du tableau des signaux : deux besoins passés FERMÉS, l'un gagné,
  // l'autre perdu, avec leur TJM (fictifs, datés au semis). `seedBriefClosedNeeds` les écrit (projet clos + besoin).
  closedNeeds: [
    {
      title: 'TMA Java — plateforme paiements',
      status: 'won',
      status_reason: 'Retenus après soutenance : équipe de trois développeurs Java sur la plateforme paiements.',
      closed_days_ago: 300,
      skills: [
        { term: 'Java', required: true },
        { term: 'Spring', required: false },
      ],
      seniority: 'confirme',
      headcount: 3,
      location: 'Paris (75)',
      tjm_eur: 620,
    },
    {
      title: 'Data engineer — plateforme risques',
      status: 'lost',
      status_reason: 'Perdu au prix : le client a retenu un titulaire déjà référencé.',
      closed_days_ago: 430,
      skills: [
        { term: 'Python', required: true },
        { term: 'Spark', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      location: 'Paris (75)',
      tjm_eur: 680,
    },
  ],
  attackAngles: [
    {
      title: 'Industrialiser un cas d’usage d’IA documentaire déjà public',
      description:
        'Le groupe communique sur son approche d’IA générative documentaire : le prototype est financé, la production reste à faire. Cadrage de six semaines sur un seul cas d’usage, avec critère d’arrêt écrit.',
      entry_point: 'Responsable data & IA de business unit',
      is_recommended: true,
      rank: 1,
    },
    {
      title: 'Renfort cloud sur la trajectoire du plan 2029',
      description:
        'Sécuriser un jalon technique du plan annoncé pour fin 2026, sur une filiale à autonomie propre, sans ouvrir de programme groupe.',
      entry_point: 'Direction des systèmes d’information d’une filiale',
      is_recommended: false,
      rank: 2,
    },
    {
      title: 'Revue de sécurité applicative sur un parcours d’authentification',
      description:
        'Format court et borné, compatible avec une contrainte réglementaire permanente et avec le calendrier d’une direction sécurité.',
      entry_point: 'Responsable sécurité applicative',
      is_recommended: false,
      rank: 3,
    },
  ],
  actionPlan: {
    strategy_type: 'land_and_expand',
    strategy_justification:
      'Entrer petit, sur une filiale qui décide seule, puis se servir de la mission réussie comme de la référence interne qui manque aujourd’hui.',
    weeks: sgPlanPhases,
  },
}

/* ================================================================== */
/* Dossier 5 — SNCF                                                    */
/* ================================================================== */

/**
 * Le dossier issu du run réel du 11/08/2026 (compte `5ca33fc1…`, 1,13 € de
 * fournisseurs). SNCF avait échoué TROIS fois auparavant, toujours sur un
 * dépassement de budget de phase ; le run a abouti une fois corrigé ce que la
 * phase de plan faisait APRÈS avoir fini son plan (voir `phase4_plan.py`).
 *
 * Deux choses du run réel ont été délibérément écartées ici :
 *  - les DATES DE NAISSANCE des mandataires, que le registre publie et que le
 *    pipeline recopie. Un organigramme a besoin d'un nom et d'une fonction ; le
 *    reste est de la donnée personnelle sans usage, et ce lien est public ;
 *  - les « filiales » manifestement fausses que la résolution d'entités a
 *    rattachées au groupe (des enseignes de prêt-à-porter et de coiffure).
 *    Elles sont réelles, mais le lien ne l'est pas.
 */
const sncfChallenges: ItChallenge[] = [
  {
    title: 'Six directions informatiques métiers sous une gouvernance recomposée',
    description:
      'La direction du numérique du groupe pilote les orientations pour six entités métiers qui gardent chacune leurs équipes. La réorganisation de la gouvernance numérique ouvre une fenêtre où priorités et budgets se redéfinissent entité par entité — donc six portes au lieu d’une.',
    severity: 'high',
    timeframe: '6 mois',
    domain_code: 'pmo',
  },
  {
    title: 'Des travaux d’IA encore côté recherche, pas côté exploitation',
    description:
      'Les partenariats académiques se multiplient sur l’IA, la donnée et la maintenance prédictive. C’est le signe d’un besoin réel, mais encore amont : l’écart entre une chaire de recherche et une équipe qui exploite au quotidien est le point de friction classique.',
    severity: 'high',
    timeframe: '12 mois',
    domain_code: 'ia',
  },
  {
    title: 'Régénération des voies et des ouvrages : un enjeu d’ingénierie, pas d’informatique',
    description:
      'Le plan de renouvellement du réseau mobilise des bureaux d’études (génie civil, ouvrages d’art, signalisation). Aucune dominante informatique : l’expertise concernée est l’ingénierie d’infrastructure.',
    severity: 'medium',
    timeframe: '24 mois',
    domain_code: 'industrial_engineering',
  },
  {
    title: 'Refontes applicatives simultanées sur plusieurs entités',
    description:
      'Plusieurs programmes de refonte tournent en parallèle sur des entités différentes, avec des postes ouverts qui disent la tension sur les compétences internes disponibles pour tenir les plannings.',
    severity: 'high',
    timeframe: 'immédiat',
    domain_code: 'esn_it',
  },
  {
    title: 'Disponibilité des systèmes temps réel sous exposition publique',
    description:
      'La régularité du service dépend de systèmes d’information temps réel dont la moindre indisponibilité se voit immédiatement, et publiquement. Cette exposition pousse à investir sur l’observabilité et la résilience plus vite que sur le reste.',
    severity: 'critical',
    timeframe: 'immédiat',
    domain_code: 'esn_it',
  },
  {
    title: 'Obligations de résilience numérique d’un opérateur d’importance vitale',
    description:
      'L’autonomie et la résilience numériques sont un objectif affiché de la nouvelle gouvernance. Pour un opérateur d’importance vitale, ce sont des obligations, pas des intentions — donc un besoin récurrent de renforts spécialisés.',
    severity: 'high',
    timeframe: '12 mois',
    domain_code: 'cyber',
  },
]

const sncfSignals: RecentSignal[] = [
  {
    signal:
      'Partenariat de trois ans avec l’Institut Polytechnique de Paris sur l’IA, les données, la robotique, la maintenance prédictive et les jumeaux numériques',
    source: 'Communiqué de presse',
    url: demoSourceUrl('press', 'sncf-1'),
    source_kind: 'press',
    type: 'partenariat',
    date: '2026-06-12',
    sales_implication:
      'Un partenariat de recherche daté et signé annonce des cas d’usage à industrialiser derrière — c’est là que le besoin devient adressable.',
    freshness: 'current',
    domain_code: 'ia',
  },
  // #4733.6 — le recrutement d'un DIRIGEANT (COO) : `executive_role` posé sur l'intitulé réel, jamais deviné. Il se voit
  // sur « Signaux & besoins » comme un fait fort (« Recrutement de dirigeant »), au rang du déménagement.
  {
    signal: 'SNCF Voyageurs — Directeur des opérations (COO) F/H — Saint-Denis',
    source: 'Offre d’emploi publiée',
    url: demoSourceUrl('job', 'sncf-coo-1'),
    source_kind: 'job',
    type: 'recrutement',
    date: '2026-10-06',
    location: 'Saint-Denis (93)',
    executive_role: true,
    sales_implication:
      'Un directeur des opérations qui arrive réorganise : c’est le moment où les périmètres de prestataires se rouvrent.',
    freshness: 'current',
    // #4182.5 — offre en France (hors stage) : demandeur muet dans le texte, donc « à identifier » avec la méthode.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: {},
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  // SEMIS-PREUVES 4294.6 (#4142.5) — le MÊME fait servi sous une seconde formulation (autre média, autre lien, même
  // jour) : « Pourquoi ce compte maintenant ? » le replie en UNE ligne (`signal-dedupe`), la plus riche gardée. Rien
  // n'est supprimé en base ; ce n'est pas un fait de plus.
  {
    signal:
      'Partenariat de trois ans avec l’Institut Polytechnique de Paris sur l’IA, les données, la robotique et la maintenance prédictive',
    source: 'Presse spécialisée',
    url: demoSourceUrl('press', 'sncf-1b'),
    source_kind: 'press',
    type: 'partenariat',
    date: '2026-06-12',
    freshness: 'current',
    domain_code: 'ia',
  },
  {
    signal:
      'Chaire « Intelligence artificielle et optimisation pour les mobilités » portée avec l’École polytechnique et la direction du numérique du groupe',
    source: 'Communiqué de presse',
    url: demoSourceUrl('press', 'sncf-2'),
    source_kind: 'press',
    type: 'projet',
    date: '2026',
    sales_implication:
      'La direction du numérique porte elle-même la chaire : le sponsor de l’industrialisation est identifié, il reste à trouver son budget de production.',
    freshness: 'current',
    domain_code: 'ia',
  },
  {
    signal:
      'Réorganisation de la gouvernance numérique — une direction informatique groupe pilotant six entités métiers, avec un objectif affiché d’autonomie et de résilience',
    source: 'Communiqué de presse',
    url: demoSourceUrl('press', 'sncf-3'),
    source_kind: 'press',
    type: 'restructuration',
    date: '2025-03',
    sales_implication:
      'Six entités qui gardent leurs équipes, c’est six cycles de décision. Pour une ESN moyenne, c’est une chance : on entre par une entité, pas par le groupe.',
    freshness: 'current',
    domain_code: 'pmo',
  },
  {
    signal:
      'Rapport d’innovation du groupe — déploiement du futur système de communication ferroviaire, capteurs communicants, supervision numérique',
    source: 'Rapport d’activité du groupe',
    url: demoSourceUrl('press', 'sncf-4'),
    source_kind: 'press',
    type: 'projet',
    date: '2025',
    sales_implication:
      'Un remplacement de système de communication ferroviaire est un chantier de plusieurs années : la maintenance de l’existant pendant la transition est un besoin durable.',
    freshness: 'current',
    domain_code: 'esn_it',
  },
  {
    signal: 'Accord-cadre de coopération technologique avec un organisme public de recherche',
    source: 'Le Monde Informatique',
    // #3922.8 — le témoin « Sans lien vérifiable » : la source n'a publié aucune URL, la démo ne l'invente pas.
    type: 'partenariat',
    date: '2025',
    sales_implication: 'Confirme la stratégie amont — et donc l’écart à combler côté exploitation.',
    freshness: 'archive',
  },
  {
    signal: 'Modification de l’administration publiée au registre',
    source: BODACC_SOURCE,
    url: demoSourceUrl('bodacc', 'sncf-6'),
    source_kind: 'bodacc',
    type: 'legal',
    date: '2026-07-03',
    sales_implication: 'Mouvement de gouvernance récent, à recouper avant toute approche nominative.',
    freshness: 'current',
  },
  // #3668.7 — un programme GÉNÉRAL est du contexte, distinct d'un signal exploitable : ni chantier,
  // ni interlocuteur, ni expertise nommés. Il reste visible, rangé après les pistes, avec sa raison.
  {
    signal: 'Programme climat et ambition de transition écologique 2030 du groupe',
    source: 'Communiqué de presse',
    url: demoSourceUrl('press', 'sncf-7'),
    source_kind: 'press',
    type: 'projet',
    date: '2026-02',
    sales_implication: 'Cadre de long terme sans chantier numérique nommé.',
    freshness: 'current',
    selection_role: 'context',
    entity_match: 'unverified',
    selection_reason:
      'Programme général : aucun chantier, interlocuteur ni expertise nommé — contexte, pas un besoin confirmé.',
  },
  // #3921 / #3922.8 — un événement du REGISTRE officiel (ouverture d'établissement), daté et lié à l'annuaire.
  {
    signal: 'Nouvel établissement — Lyon (siège régional Auvergne-Rhône-Alpes)',
    source: 'Registre officiel des entreprises (Sirene)',
    type: 'expansion',
    date: '2026-09-14',
    url: demoSourceUrl('official', 'sncf-etablissement-lyon'),
    source_kind: 'official',
    sales_implication:
      'Un nouveau site régional ouvre des besoins d’exploitation et de support locaux, avant que les marchés ne soient attribués.',
    freshness: 'current',
  },
  // #4732 — un rachat publié : daté de la PUBLICATION de l'acte, avec son lien de preuve (société fictive).
  {
    signal: 'Cession de fonds de commerce — rachat de la société Atelier Rail Services (exemple) par le groupe',
    source: 'Annonce légale',
    type: 'acquisition',
    date: '2026-09-18',
    url: demoSourceUrl('bodacc', 'sncf-rachat-atelier-rail'),
    source_kind: 'bodacc',
    sales_implication:
      'Un rachat rapproche deux systèmes d’information : cadrage d’intégration et cartographie du SI avant tout renfort.',
    freshness: 'current',
  },
  // #4734 — ce que l'annuaire de l'écosystème startup DIT (label, programme, année), daté, jamais interprété (exemple fictif).
  {
    signal: 'Labellisé · French Tech Next40/120 (exemple) · 2025',
    source: "Annuaire de l'écosystème startup",
    type: 'ecosystem',
    date: '2025-11-03',
    url: demoSourceUrl('official', 'sncf-ecosysteme-startup'),
    source_kind: 'official',
    freshness: 'current',
  },
  // #4735.6 — une levée de fonds publiée : date COMPLÈTE de la source, montant dans la devise PUBLIÉE (jamais converti),
  // lien de preuve. Jeune pousse FICTIVE (« exemple ») du secteur : jamais un tour de table prêté à une entreprise réelle.
  {
    signal: 'Levée de fonds : Rail Data Labs (exemple), jeune pousse de la maintenance ferroviaire — 12 M EUR',
    source: 'Base de levées de fonds',
    type: 'levee_fonds',
    date: '2026-09-15',
    url: demoSourceUrl('official', 'sncf-levee-rail-data-labs'),
    source_kind: 'official',
    freshness: 'current',
  },
  // #4733 — le recrutement d'un dirigeant, intitulé réel de l'offre cité, drapeau posé par la reconnaissance.
  {
    signal: 'Offre publiée sur la page carrières : Directeur des Opérations H/F',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2026-10-12',
    url: demoSourceUrl('job', 'sncf-directeur-operations'),
    source_kind: 'job',
    executive_role: true, // #4733.6 — le drapeau que l'écran lit pour en faire un fait fort (craft rule n°9)
    sales_implication:
      'Le recrutement d’un dirigeant des opérations annonce une réorganisation : approche par le sujet de transformation du poste.',
    freshness: 'current',
    // #4182.5 — toute offre en France (hors stage) nomme son demandeur : muette ici, donc « à identifier » avec la méthode.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: {},
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  // #3925 / #3922.8 — une offre lue sur la page carrières du domaine (JSON-LD `JobPosting`), avec son lien.
  {
    signal: 'Offre publiée sur la page carrières : Architecte cloud — Saint-Denis',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2026-10-02',
    url: demoSourceUrl('job', 'sncf-architecte-cloud'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Cloud'],
      job_family: 'infrastructure_cloud',
      extract: 'Architecte cloud',
    },
    sales_implication:
      'Un poste d’architecte cloud ouvert dit un chantier de plateforme en cours : le moment de proposer du renfort en régie.',
    freshness: 'current',
    // #4182.5 (recette démo 21/10) — le demandeur, étayé par le texte de l'offre (jamais un nom inventé).
    requester: {
      author: { kind: 'rh' },
      possibleManager: {
        function: 'Responsable de la plateforme cloud',
        entity: 'Saint-Denis',
        evidence: 'texte_de_l_offre',
      },
      team: 'plateforme cloud',
      scope: { city: 'Saint-Denis' },
      status: 'etaye',
      openFreelanceMission: false,
    },
  },
  // #4403.1 (craft rule n°9) — UNE offre HORS du métier du profil démo (cloud / data / dev) : /signals la marque
  // « hors de ton métier » et la range APRÈS les offres du métier, sans la retirer. Hors métier placé : aucune.
  {
    signal: 'Offre publiée sur la page carrières : Agent de circulation ferroviaire H/F — Lyon',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2026-10-09',
    url: demoSourceUrl('job', 'sncf-agent-circulation'),
    source_kind: 'job',
    sales_implication: 'Un poste d’exploitation ferroviaire ne se place pas en ESN : lu, marqué, rangé plus bas.',
    freshness: 'current',
    // #4182.5 — « hors de ton métier » ne dispense PAS de la règle : toute offre en France (hors stage)
    // nomme son demandeur. Celle-ci est muette, donc « à identifier » AVEC la méthode — jamais un nom
    // inventé, jamais absent. La marque hors métier porte sur le RANG de l'offre, pas sur ce qu'on en sait.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: { city: 'Lyon' },
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  // #4755 (craft rule n°9) — l'onglet « Historique » de /signals : des offres PASSÉES (archivées, > 3 mois) du compte
  // vitrine. Elles se rangent en UNE ligne SNCF (« 4 offres · Java, Spring, … · dernier besoin vu il y a … ») et se
  // dépliquent sur leur détail. Datées, jamais récentes : elles ne remontent pas dans les signaux du jour.
  {
    signal: 'Offre publiée sur la page carrières : Développeur Java senior — Paris',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2026-07-14',
    url: demoSourceUrl('job', 'sncf-passe-1'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java', 'Spring'],
      job_family: 'developpement',
      extract: 'Développeur Java senior',
    },
    sales_implication: 'Une offre retirée reste un besoin déjà exprimé : elle date le dernier chantier Java du compte.',
    freshness: 'archive',
    // #4182.5 — toute offre en France nomme son demandeur ; celle-ci est muette, donc « à identifier » avec la méthode.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: { city: 'Paris' },
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  {
    signal: 'Offre publiée sur la page carrières : Ingénieur Java / Spring Boot — Lyon',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2026-05-20',
    url: demoSourceUrl('job', 'sncf-passe-2'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java', 'Spring'],
      job_family: 'developpement',
      extract: 'Ingénieur Java Spring Boot',
    },
    sales_implication: 'Une offre retirée reste un besoin déjà exprimé : elle date le dernier chantier Java du compte.',
    freshness: 'archive',
    // #4182.5 — toute offre en France nomme son demandeur ; celle-ci est muette, donc « à identifier » avec la méthode.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: { city: 'Lyon' },
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  {
    signal: 'Offre publiée sur la page carrières : Tech lead Java — Paris',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2026-03-09',
    url: demoSourceUrl('job', 'sncf-passe-3'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java'],
      job_family: 'developpement',
      extract: 'Tech lead Java',
    },
    sales_implication: 'Une offre retirée reste un besoin déjà exprimé : elle date le dernier chantier Java du compte.',
    freshness: 'archive',
    // #4182.5 — toute offre en France nomme son demandeur ; celle-ci est muette, donc « à identifier » avec la méthode.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: { city: 'Paris' },
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  {
    signal: 'Offre publiée sur la page carrières : Architecte applicatif Java — Saint-Denis',
    source: 'Page carrières du groupe',
    type: 'recrutement',
    date: '2025-12-02',
    url: demoSourceUrl('job', 'sncf-passe-4'),
    source_kind: 'job',
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Java', 'Cloud'],
      job_family: 'architecture',
      extract: 'Architecte applicatif Java',
    },
    sales_implication: 'Une offre retirée reste un besoin déjà exprimé : elle date le dernier chantier Java du compte.',
    freshness: 'archive',
    // #4182.5 — toute offre en France nomme son demandeur ; celle-ci est muette, donc « à identifier » avec la méthode.
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: { city: 'Saint-Denis' },
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  // #4022 / #4020 (Louis 11/10) — l'écran Opportunités ouvre sur les RECRUTEMENTS, triés France →
  // lieu non précisé → hors France, avec qui contacter. Quatre offres semées pour que la démo montre
  // chaque rang : en France avec une personne liée (« plateforme data » ↔ Younes Berrada, déjà au
  // compte), sans lieu publié, à l'étranger (jamais supprimée), et un second poste cloud qui, avec
  // l'architecte cloud ci-dessus, forme un « besoin d'équipe ». Le lieu est celui de l'offre (`location`).
  {
    signal: 'Data engineer — plateforme data voyageurs (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-06',
    location: 'Lyon (69)',
    url: demoSourceUrl('job', 'sncf-data-engineer'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Data engineering'],
      job_family: 'data_ia',
      extract: 'Data engineer',
    },
    freshness: 'current',
    // #4182.5 — le demandeur, tel que `derive_offer_requester` le compose : étayé par le texte de l'offre.
    requester: {
      author: { kind: 'rh' },
      possibleManager: { function: 'Directeur des données voyageurs', entity: 'Lyon', evidence: 'texte_de_l_offre' },
      team: 'plateforme data',
      scope: { city: 'Lyon' },
      status: 'etaye',
      openFreelanceMission: false,
    },
  },
  // #4044 (Louis 12/10) — « pas d'offres de stages dans tous les signaux » : UNE offre de stage semée
  // à dessein, pour que la démonstration PROUVE qu'elle n'apparaît nulle part (veille, Opportunités,
  // Mes cibles, cloche) — la garde est `demo-internship-excluded.spec.ts`. L'alternance, elle, n'est
  // pas tranchée : aucune offre d'alternance n'est semée ici.
  {
    signal: 'CS27 - Bac 5 - Stage Supply Chain H/F',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-07',
    location: 'Lyon (69)',
    url: demoSourceUrl('job', 'sncf-stage-supply-chain'),
    source_kind: 'job',
    freshness: 'current',
  },
  {
    signal: 'Ingénieur DevOps — supervision des applications voyageurs (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-04',
    location: 'Paris (75)',
    url: demoSourceUrl('job', 'sncf-devops-supervision'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['DevOps'],
      job_family: 'infrastructure_cloud',
      extract: 'Ingénieur DevOps',
    },
    freshness: 'current',
    // #4182.5 — offre muette : l'équipe reste « à identifier », avec la méthode (jamais un nom inventé).
    requester: {
      author: { kind: 'non_precise' },
      possibleManager: null,
      team: null,
      scope: { city: 'Paris' },
      status: 'a_identifier',
      method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
      openFreelanceMission: false,
    },
  },
  // #4399.2 — démo : Data engineer ×2 et DevOps/Architecte cloud forment des équipes ; ce poste projet et l'ingénieur
  // signalisation (sans famille) restent seuls et alimentent « Autres besoins ».
  {
    signal: 'Chef de projet SI billettique (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-03',
    url: demoSourceUrl('job', 'sncf-chef-projet-billettique'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'unclassified',
      fact_type: 'hiring',
      skills: [],
      job_family: null,
      extract: 'Chef de projet SI billettique (H/F)',
    },
    freshness: 'current',
    // #4182.5 — le demandeur, étayé par le texte de l'offre ; aucun lieu publié, donc aucune ville au périmètre.
    requester: {
      author: { kind: 'rh' },
      possibleManager: { function: 'Responsable du système billettique', entity: null, evidence: 'texte_de_l_offre' },
      team: 'billettique',
      scope: {},
      status: 'etaye',
      openFreelanceMission: false,
    },
  },
  {
    signal: 'Ingénieur signalisation ferroviaire (H/F)',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-01',
    location: 'Montréal, Canada',
    url: demoSourceUrl('job', 'sncf-signalisation-montreal'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'unclassified',
      fact_type: 'hiring',
      skills: [],
      job_family: null,
      extract: 'Ingénieur signalisation ferroviaire (H/F)',
    },
    freshness: 'current',
  },
  // #4031 — DECATHLON-FIN : les offres de plusieurs ENTITÉS d'un même groupe remontent, pas seulement celles de
  // l'entité nommée — la Veille de la démo montre trois offres de trois entités (le compteur « Jobs IT » = 3).
  {
    signal: 'SNCF Voyageurs — Ingénieur DevOps (offre publiée) — Paris',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-06',
    url: demoSourceUrl('job', 'sncf-voyageurs-devops'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['DevOps'],
      job_family: 'infrastructure_cloud',
      extract: 'Ingénieur DevOps',
    },
    sales_implication:
      'Une offre DevOps chez une autre entité du groupe confirme un chantier d’industrialisation transverse : un même besoin servi sur plusieurs entités.',
    freshness: 'current',
    // #4182.5 — le demandeur, étayé par le texte de l'offre.
    requester: {
      author: { kind: 'rh' },
      possibleManager: {
        function: 'Responsable de l’industrialisation',
        entity: 'Paris',
        evidence: 'texte_de_l_offre',
      },
      team: 'industrialisation',
      scope: { city: 'Paris' },
      status: 'etaye',
      openFreelanceMission: false,
    },
  },
  {
    signal: 'SNCF Réseau — Data engineer (offre publiée) — Lyon',
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    date: '2026-10-08',
    url: demoSourceUrl('job', 'sncf-reseau-data-engineer'),
    source_kind: 'job',
    // #4437.5 — le rattachement lu dans l'intitulé (compétence, famille) ; « non classé » quand il ne nomme rien.
    offer_attachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['Data engineering'],
      job_family: 'data_ia',
      extract: 'Data engineer',
    },
    sales_implication:
      'Un poste data ouvert côté infrastructure dit un besoin de données distinct de celui de la plateforme cloud.',
    freshness: 'current',
    // V4-CORRECTIFS-C 4286.12 — le popover « Signal détecté » de ce sous-signal nomme le demandeur : étayé par le texte de l'offre.
    requester: {
      author: { kind: 'rh' },
      possibleManager: {
        function: 'Responsable data de l’infrastructure',
        entity: 'Lyon',
        evidence: 'texte_de_l_offre',
      },
      team: 'data infrastructure',
      scope: { city: 'Lyon' },
      status: 'etaye',
      openFreelanceMission: false,
    },
  },
]

const sncfSites: SiteFrance[] = [
  {
    city: 'Saint-Denis',
    region: 'Île-de-France',
    type: 'siège social',
    priority: 'haute',
    latitude: 48.9362,
    longitude: 2.3574,
    is_headquarters: true,
  },
  {
    city: 'Paris',
    region: 'Île-de-France',
    type: 'établissement',
    priority: 'haute',
    latitude: 48.8767,
    longitude: 2.3583,
    is_headquarters: false,
  },
  {
    city: 'Rennes',
    region: 'Bretagne',
    type: 'établissement',
    priority: 'moyenne',
    latitude: 48.1173,
    longitude: -1.6778,
    is_headquarters: false,
  },
  {
    city: 'Marseille',
    region: "Provence-Alpes-Côte d'Azur",
    type: 'établissement',
    priority: 'moyenne',
    latitude: 43.2965,
    longitude: 5.3698,
    is_headquarters: false,
  },
  {
    city: 'Metz',
    region: 'Grand Est',
    type: 'établissement',
    priority: 'moyenne',
    latitude: 49.1193,
    longitude: 6.1757,
    is_headquarters: false,
  },
  {
    city: 'Toulon',
    region: "Provence-Alpes-Côte d'Azur",
    type: 'établissement',
    priority: 'basse',
    latitude: 43.1242,
    longitude: 5.928,
    is_headquarters: false,
  },
  {
    city: 'Vénissieux',
    region: 'Auvergne-Rhône-Alpes',
    type: 'établissement',
    priority: 'basse',
    latitude: 45.6975,
    longitude: 4.8858,
    is_headquarters: false,
  },
  {
    city: 'Reims',
    region: 'Grand Est',
    type: 'établissement',
    priority: 'basse',
    latitude: 49.2583,
    longitude: 4.0317,
    is_headquarters: false,
  },
]

// #3777 — la première action du tableau ET de « Prochains mouvements » : le MÊME texte, pour que la
// note « X sur Y déjà suivies dans le tableau plus bas » (`measurePlanListOverlap`, texte exact) se voie.
const SNCF_FIRST_ACTION =
  'Contacter la direction technique de l’entité numérique du groupe voyageurs en citant la réorganisation de la gouvernance et le fait qu’elle redéfinit les priorités entité par entité.'

const sncfPlanPhases: PlanPhase[] = [
  {
    name: 'semaine_1_2',
    title: 'Entrer par UNE entité, pas par le groupe',
    objective:
      'Six entités métiers gardent leurs équipes informatiques : c’est six cycles de décision, et donc six chances. On en choisit une.',
    actions: [
      {
        action_id: 'SNCF1',
        action: SNCF_FIRST_ACTION,
        contact: seatName('Directeur technique — entité numérique voyageurs'),
        channel: 'linkedin',
        deadline: 'Semaine 1',
        expected_outcome: 'Échange de 30 minutes sur les priorités de l’entité.',
        kpi: 'Échange obtenu',
      },
      {
        action_id: 'SNCF2',
        action:
          'En parallèle, se positionner sur un poste déjà ouvert dans une autre entité — un besoin publié est un besoin déjà arbitré.',
        contact: seatName('Responsable de programme de refonte applicative'),
        channel: 'email',
        deadline: 'Semaine 2',
        expected_outcome: 'Profil présenté sur un poste ouvert.',
        kpi: 'Profil en entretien',
      },
      // #4415 / #4416 (craft n°9) — DEUX étapes qui visent un contact NOMMÉ (personne simulée, LinkedIn seul),
      // pour que l'onglet Plan montre un destinataire + un message prêt, et que sa fiche montre « Plan pour Younes ».
      {
        action_id: 'SNCF5',
        action:
          'Écrire à Younes Berrada sur LinkedIn : lui proposer les deux retours d’acteurs comparables sur la plateforme data.',
        contact: 'Younes Berrada',
        channel: 'linkedin',
        deadline: 'Semaine 1',
        expected_outcome: 'Une réponse qui ouvre un échange sur la plateforme data.',
        kpi: 'Réponse obtenue',
      },
      {
        action_id: 'SNCF6',
        action:
          'Relancer Younes Berrada sur LinkedIn si aucune réponse après trois jours, avec un seul retour chiffré.',
        contact: 'Younes Berrada',
        channel: 'linkedin',
        deadline: 'Semaine 2',
        expected_outcome: 'La conversation s’ouvre avant la fin de la semaine 2.',
        kpi: 'Conversation ouverte',
      },
    ],
  },
  {
    name: 'semaine_3_4',
    title: 'Faire passer un cas d’usage de la recherche à l’exploitation',
    objective:
      'Les partenariats académiques produisent des cas d’usage cadrés que personne n’industrialise. C’est un travail précis, et il a un sponsor identifié.',
    actions: [
      {
        action_id: 'SNCF3',
        action:
          'Proposer un atelier de 45 minutes à la direction du numérique pour identifier LE cas d’usage prioritaire à faire passer en production, puis six semaines pour le premier flux de production.',
        contact: seatName('Responsable data et innovation — direction du numérique'),
        channel: 'email',
        deadline: 'Semaine 3',
        expected_outcome: 'Un cas d’usage nommé et un périmètre écrit.',
        kpi: 'Cas d’usage retenu',
      },
    ],
  },
  {
    name: 'semaine_5_6',
    title: 'Prouver sur la disponibilité',
    objective:
      'La régularité du service dépend de systèmes temps réel dont l’indisponibilité se voit publiquement : un diagnostic d’observabilité se justifie tout seul.',
    actions: [
      {
        action_id: 'SNCF4',
        action:
          'Proposer un diagnostic d’observabilité de six semaines sur un périmètre applicatif borné, avec un plan de remédiation priorisé en livrable.',
        contact: seatName('Directeur technique — entité numérique voyageurs'),
        channel: 'meeting',
        deadline: 'Semaine 5',
        expected_outcome: 'Diagnostic engagé sur un périmètre borné.',
        kpi: 'Diagnostic engagé',
      },
    ],
  },
]

/**
 * #3257.4 (lot restes, 29/09) — LE PARTENAIRE LIÉ À UNE ROUTE PARTENAIRE.
 *
 * Décision Louis 04/10/2026 (« je ne veux plus d'exemples comme ça ») : plus
 * aucune ESN fictive « (exemple) » dans la salle. Le partenaire est une VRAIE
 * ESN OBSERVÉE chez le compte par son brief (`bnp-paribas.json`, entrée `esn`
 * « CGI », niveau `observed`, preuve « Accompagnement IFRS 17 annoncé pour 21
 * mois ; périmètre actuariat, finance et IT »). La DÉCLARATION « partenaire »
 * est un geste de l'équipe de démonstration (comme le niveau d'effort), jamais
 * un fait affirmé sur CGI : la note ne cite que la preuve du brief.
 * `demo-seed.service.ts` l'écrit dans `account_partners` du compte
 * `accountName` — c'est ce que `SprintsService.board()` relit pour afficher
 * « Partenaire : … » sur la carte. SNCF, lui, reste en `partner_route` SANS
 * partenaire lié : c'est le cas « Partenaire à désigner » (#3296).
 */
export const DEMO_SPRINT_PARTNER_ROUTE_PARTNER = {
  accountName: 'BNP Paribas',
  name: 'CGI',
  rank: 'rank2' as const,
  relationship: 'partner' as const,
  note: 'Partenaire déclaré par l’équipe de démonstration. Le brief observe CGI chez BNP Paribas Cardif : accompagnement IFRS 17 annoncé pour 21 mois, périmètre actuariat, finance et IT.',
} as const

/**
 * #3296 (#3269.6) — LE PARTENAIRE QUI DÉCLENCHE LA SUGGESTION `partner_access_found`.
 *
 * `SprintsService.board()` lit désormais `partner_name` pour PROPOSER
 * (`shouldSwitch`, jamais écrit) le passage en route partenaire d'un compte
 * qui n'y est pas encore — la règle existait depuis #3257.8 sans qu'aucun
 * compte de démo ne la déclenche. Groupe BPCE (`volume`, re-semé le
 * 01/10/2026 après le retrait des quatre comptes non cibles) est le choix cohérent : compte non
 * encore arbitré, sans route d'entrée établie — un partenaire qui ouvre une
 * voie d'entrée est exactement ce que le board propose alors, jamais une
 * relation ESN inventée sans rapport avec le dossier. `shouldSwitch` accepte
 * `volume` comme niveau de départ. Décision Louis 04/10/2026 : une VRAIE ESN
 * observée par le brief du compte (`bpce.json`, entrée `esn` « Sopra Steria »,
 * niveau `confirmed`, « Groupement avec Lamp Advisors », périmètre
 * « Intégration et delivery »), déclarée partenaire par l'équipe de démonstration.
 */
export const DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER = {
  accountName: 'Groupe BPCE',
  name: 'Sopra Steria',
  rank: 'rank2' as const,
  relationship: 'partner' as const,
  note: 'Partenaire déclaré par l’équipe de démonstration. Le brief confirme Sopra Steria chez Groupe BPCE, en groupement avec Lamp Advisors (intégration et delivery).',
} as const

/**
 * Recette prod 05/10 — les colonnes `*_collected_at` d'un dossier, déduites de sa
 * date `segments_collected_at`. Absente = AUCUNE colonne (« non mesuré » n'est
 * jamais « à jour », doctrine) : le semis ne pose pas de date qu'il n'a pas.
 */
export function demoSegmentCollectedAtColumns(account: { segments_collected_at?: string }): {
  contacts_collected_at?: Date
  entities_collected_at?: Date
  strategy_collected_at?: Date
  dossier_read_collected_at?: Date
  addressability_relation_collected_at?: Date
} {
  if (!account.segments_collected_at) return {}
  const at = new Date(account.segments_collected_at)
  return {
    contacts_collected_at: at,
    entities_collected_at: at,
    strategy_collected_at: at,
    dossier_read_collected_at: at,
    addressability_relation_collected_at: at,
  }
}

/**
 * Louis 13/10/2026 — la démo n'affiche JAMAIS le bandeau « collecte antérieure /
 * non mesurée » : tout dossier sans date explicite reçoit, pour les SEPT segments
 * datables (signaux inclus, blocs du dossier #4078 compris), une date de collecte RELATIVE à l'ouverture de la
 * salle (`nowMs` − 1 h), donc postérieure à toute capacité datée. Une date
 * explicite du dossier (SNCF) l'emporte. Production inchangée : le bandeau y
 * reste le fait honnête d'un dossier jamais rejoué.
 */
export function demoCollectedAtColumns(
  account: { signals_collected_at?: string; segments_collected_at?: string },
  nowMs: number,
): {
  signals_collected_at: Date
  contacts_collected_at: Date
  entities_collected_at: Date
  strategy_collected_at: Date
  dossier_read_collected_at: Date
  addressability_relation_collected_at: Date
  dossier_blocks_collected_at: Date
} {
  const fallback = new Date(nowMs - 3_600_000)
  const segments = demoSegmentCollectedAtColumns(account)
  return {
    signals_collected_at: account.signals_collected_at ? new Date(account.signals_collected_at) : fallback,
    contacts_collected_at: segments.contacts_collected_at ?? fallback,
    entities_collected_at: segments.entities_collected_at ?? fallback,
    strategy_collected_at: segments.strategy_collected_at ?? fallback,
    dossier_read_collected_at: segments.dossier_read_collected_at ?? fallback,
    addressability_relation_collected_at: segments.addressability_relation_collected_at ?? fallback,
    // #4078 — les cinq blocs du dossier sont SEMÉS (`raw_analysis`) : la salle ne les dit jamais antérieurs.
    dossier_blocks_collected_at: fallback,
  }
}

/** SIG-B — une offre FICTIVE qui nomme un recruteur fictif (voir `DemoContact.job_posting`). */
export type DemoJobPostingProof = { title: string; url: string; posted_days_ago: number }

/**
 * SIG-B — `raw_data` d'un contact de démonstration prouvé par une offre : la MÊME
 * forme que la collecte réelle (`raw_data.jobPosting`, lue par la fiche contact),
 * la date relative au semis. `null` sans offre — aucune preuve inventée.
 */
export function demoJobPostingRawData(
  proof: DemoJobPostingProof | undefined,
  nowMs: number,
): { jobPosting: { title: string; url: string; postedAt: string } } | null {
  if (!proof) return null
  const postedAt = new Date(nowMs - proof.posted_days_ago * 86_400_000).toISOString().slice(0, 10)
  return { jobPosting: { title: proof.title, url: proof.url, postedAt } }
}

/** #4055.8 — voir `DemoContact.employment_check`. */
export type DemoEmploymentCheckProof =
  | { state: 'left'; checked_days_ago: number; organization?: string }
  // SEMIS-PREUVES 4290.13 (#4055.9) — « Non retrouvé » : la relecture n'a PAS retrouvé la personne (datée). Ce n'est pas un
  // départ : la fonction garde son libellé, mais la fiche dit que le titre n'est plus confirmé.
  | { state: 'not_found'; checked_days_ago: number }

/**
 * #4055.8 — `raw_data.employmentCheck` d'un contact de démonstration parti : la MÊME forme que la relecture réelle
 * (`routines/employment-check.ts`), la date relative au semis. `null` sans relecture, et `null` sans employeur
 * observé : « a quitté » ne se pose jamais sans preuve.
 */
export function demoEmploymentCheckRawData(
  proof: DemoEmploymentCheckProof | undefined,
  nowMs: number,
): {
  employmentCheck: { state: 'left'; at: string; organization: string } | { state: 'not_found'; at: string }
} | null {
  if (!proof) return null
  const at = new Date(nowMs - proof.checked_days_ago * 86_400_000).toISOString()
  if (proof.state === 'not_found') return { employmentCheck: { state: 'not_found', at } }
  const organization = proof.organization?.trim()
  if (!organization) return null
  return { employmentCheck: { state: proof.state, at, organization } }
}

/** `raw_data` d'un contact de démonstration : l'offre qui le nomme et/ou la relecture d'employeur ; `null` sans preuve. */
export function demoContactRawData(contact: DemoContact, nowMs = Date.now()): Record<string, unknown> | null {
  const merged = {
    ...demoJobPostingRawData(contact.job_posting, nowMs),
    ...demoEmploymentCheckRawData(contact.employment_check, nowMs),
    ...(contact.name_derived_from_email ? { nameDerivedFromEmail: true } : {}),
  }
  return Object.keys(merged).length > 0 ? merged : null
}

const sncfDossier: DemoDossier = {
  account: {
    company_name: 'SNCF',
    bet_horizon: 'long',
    bet_size: 'very_large',
    bet_access: 'open',
    bet_resource: 'Équipe data',
    // #2291.2 (lot R) — FRAÎCHE (après SEGMENT_CAPABILITY_EPOCH.signals) : voir
    // le docblock du champ sur le type `DemoDossier`. C'est ce qui permet à
    // `contract_model` (raw_analysis, plus bas) de s'afficher OBSERVÉ plutôt
    // que « collecte antérieure à cette capacité ». Re-semée sur SNCF le
    // 01/10/2026 (retrait des quatre comptes non cibles) ; repoussée par
    // #2284.17/.33/.58/.26 (#2978, lot SRC2 28/09/2026, dernière capacité
    // `signals` en date) — sinon SNCF retomberait lui-même « antérieur ».
    // #3922.3 — repoussée APRÈS la capacité « lien source » (SEGMENT_CAPABILITY_EPOCH.signals,
    // 2026-10-10) : SNCF reste le témoin « collecte fraîche », ses signaux portent leur lien.
    // #4327 (19/10, filiales nommées par le web gardées) — dernière capacité `signals` en date, 19:10Z :
    // la collecte fraîche de SNCF est repoussée APRÈS elle, sinon le témoin retomberait « antérieur ».
    // #4398.2 (K1, 21/10, nom légal de l'entité) — nouvelle dernière capacité `signals` (09:12Z) : SNCF repoussée après.
    // #4754 (28/10, offres au-delà de douze mois) — nouvelle dernière capacité `signals` (20:03:39Z) : SNCF repoussée après.
    // #4762 (31/10, collecte sans borne d'âge) — nouvelle dernière capacité `signals` (09:55Z) : SNCF repoussée après.
    // #2322.70 (31/10, rôle/équipe/tension des offres) — nouvelle dernière capacité `signals` (15:50Z) : SNCF repoussée après.
    signals_collected_at: '2026-10-31T15:51:00.000Z',
    // Recette 05/10 — tous les autres segments datés, APRÈS leur dernière capacité.
    // SIG-B (#4016.3, 11/10) — repoussée après la capacité « recruteurs prouvés par
    // une offre » du segment contacts : SNCF reste le témoin « collecte fraîche ».
    // #4923 (30/10, collecte de contacts pilotée par la demande) — nouvelle dernière capacité `contacts`
    // (16:20Z) : SNCF repoussée après, sinon le témoin « collecte fraîche » retomberait « antérieur ».
    segments_collected_at: '2026-10-30T16:40:00.000Z',
    // #2159.26 — le classement de travail de l'équipe fictive, pas un fait sur la société.
    tags: ['grand compte', 'secteur public', 'Tier B'],
    // Corroborée par `apps/ia/tests/test_source_cache.py`, qui rend ce SIREN
    // pour la clé « sncf ».
    siren: '552049447',
    naf_code: '49.10Z',
    registry_country: 'FR',
    sector: 'Transport ferroviaire interurbain de voyageurs (NAF 49.10Z)',
    employees: '10 000 salariés et plus (tranche INSEE 2023)',
    revenue: '43,4 Md€ au dernier exercice publié (2024, comptes déposés au registre)',
    headquarters: '2 place aux Étoiles, 93210 Saint-Denis',
    website: 'https://www.sncf.com',
    logo_url: null,
    subsidiaries: ['SNCF Réseau', 'SNCF Voyageurs', 'SNCF Gares & Connexions', 'SNCF Connect & Tech', 'Keolis'],
    it_challenges: sncfChallenges,
    recent_signals: sncfSignals,
    priority_score: 6,
    priority_justification:
      'PRUDENT — la fragmentation en six entités métiers, souvent vue comme un obstacle, est ici l’atout : une ESN moyenne entre par UNE entité, sur un besoin déjà publié, sans affronter le référencement du groupe.',
    commercial_status: 'watching',
    priority_gate: 'pending',
    gate_reason: null,
    // #3257.4 / #3257.8 (lot restes, 29/09) — ROUTE PARTENAIRE : SNCF porte
    // le dernier niveau du board, jusque-là VIDE.
    // Cohérent avec sa propre justification (« une ESN moyenne entre par UNE
    // entité, sur un besoin déjà publié ») : la voie d'entrée passe par un
    // partenaire sur l'entité, pas par un effort direct. Décision Louis
    // 04/10/2026 : plus d'ESN fictive, et aucune ESN n'est OBSERVÉE chez SNCF
    // (pas de brief commercial) — SNCF porte donc le cas « Partenaire à
    // désigner » (#3296) : `partner_route` sans AUCUN partenaire lié.
    sprint: 'partner_route',
    sprint_exit_reason: null,
    sprint_reason:
      'La voie d’entrée doit passer par un partenaire présent sur l’entité numérique voyageurs — pas par un effort direct sur le compte. Le partenaire reste à désigner.',
    sprint_effort_estimate: 'Désigner le partenaire, puis un point mensuel avec lui ; aucun démarchage direct.',
    // #2117.14 — propriétaire nommé : DEMO_OWNER (Maëlle Lorquin), seul membre
    // réel de l'espace de démo (⚠️ renversé le 29/10/2026 : la salle compte aussi
    // des collègues fictifs, voir DEMO_SHARED_ACCOUNT_WORK). Le reste de la mémoire de relation reste
    // vide : rien dans le jeu ne corrobore un dernier contact ici.
    relationship_memory: { owner: 'Maëlle Lorquin' },
    raw_analysis: {
      demo_seed: true,

      // #2284 — le verdict de l'Entity Resolver pour SNCF, composé des faits
      // DÉJÀ semés sur ce dossier (SIREN, site, NAF, filiales) — rien d'inventé.
      // `confidence: null` : aucune désambiguïsation chiffrée n'est semée ici,
      // et « non mesuré » n'est pas un nombre. La correction semée
      // (`DEMO_ENTITY_RESOLUTION_CORRECTION`) le fait lire « confirmée par
      // votre espace » (#2284.67). Re-semé sur SNCF le 01/10/2026.
      entity_resolution: {
        state: 'resolved',
        kind: 'parent_company',
        canonical_id: 'FR-SIREN-552049447',
        commercial_name: 'SNCF',
        legal_name: 'SNCF',
        country: 'FR',
        identifiers: { siren: '552049447' },
        domain: 'sncf.com',
        naf_code: '49.10Z',
        naf_label: 'Transport ferroviaire interurbain de voyageurs',
        location: 'Saint-Denis',
        parent_names: [],
        children_count: 5,
        sources: ['normalized_name', 'official_domain', 'legal_identifier', 'registry_country', 'group_graph'],
        confidence: null,
        reasons: [],
        question: null,
        resolved_at: '2026-09-24T08:00:00Z',
      },

      /* #2591.4 / #2591.6 — parité démo des TROISIÈME et QUATRIÈME états de
         `RefreshOutcomeCard` : un score non recalculé ET une confiance non
         recalculée. Société Générale démontre déjà « score modifié » et
         « confiance modifiée » ; ce dossier montre les états que #2591 a
         ajoutés — l'axe 'contacts' n'écrit JAMAIS `priority_score` ni
         `raw_analysis.confidence` (seuls 'signals' et ses alias les écrivent),
         donc AUCUN `scoreChanged`/`confidenceChanged` ne doit apparaître ici :
         les faire coexister masquerait les nouveaux cas, la carte donne
         toujours la priorité au « changé » s'il est présent. Re-semé sur SNCF
         le 01/10/2026 (retrait des quatre comptes non cibles). */
      last_refresh: {
        at: '2026-09-16T09:20:00.000Z',
        phase: 'contacts',
        diff: {
          newFacts: [],
          changedFacts: [],
          obsoleteFacts: [],
          preservedCorrections: [],
          changedRecommendations: [],
          obsoleteActions: [],
          expiredSignals: [],
          scoreChanged: null,
          confidenceChanged: null,
          scoreNotRecalculated: { lastKnownValue: '6' },
          confidenceNotRecalculated: { lastKnownValue: '78' },
          unmeasured: [],
          unchangedFacts: 0,
        },
      },

      /* Les offres d'emploi techniques relevées sur le compte — la matière du
         `contract_model` ci-dessous. Re-semées sur SNCF le 01/10/2026 (retrait
         des comptes retirés qui portaient les leurs) : génériques, sans lieu ni
         identifiant d'annonce précis. */
      /* #3916 — les annonces légales BODACC (onglet Vue d'ensemble, carte
         « Annonces légales »). Seedées sur SNCF avec leur forme réelle : un
         dépôt de comptes (avec lien) et une modification (sans lien). */
      legal_signals: [
        {
          date: '2026-06-17',
          type: 'Dépôts des comptes',
          label: 'SNCF VOYAGEURS',
          tribunal: 'Greffe du Tribunal des Activités Economiques de Paris',
          url: 'https://www.bodacc.fr/pages/accueil/',
        },
        // #3921.2 — un changement de dirigeant lu dans une annonce de modification, daté par la parution.
        {
          date: '2026-09-23',
          type: 'Changement de dirigeant',
          label: 'SNCF VOYAGEURS',
          tribunal: 'Greffe du Tribunal des Activités Economiques de Paris',
          url: 'https://www.bodacc.fr/pages/accueil/',
        },
        {
          date: '2026-04-10',
          type: 'Modifications diverses',
          // #3916 — le type précis que l'annonce porte, et le lien de l'annonce.
          precision: 'modification survenue sur le capital (augmentation)',
          label: 'SNCF VOYAGEURS',
          tribunal: 'Greffe du Tribunal des Activités Economiques de Paris',
          url: 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202600801042',
        },
      ],

      // CASCADE-ECRAN — « Peu d'offres du métier : recherche élargie jusqu'aux intitulés voisins » (onglet Signaux &
      // besoins, Recrutements). Même forme que le payload du moteur (`offers_cascade.py`) : deux paliers tentés, le
      // plancher de 5 atteint avec 6 offres du métier — sur les huit recrutements que `sncfSignals` porte déjà.
      offersCascade: {
        floor: 5,
        found: 6,
        belowFloor: false,
        explicit: false,
        reason: null,
        paidCalls: 3,
        tiers: [
          { tier: 'sources', status: 'tenté', gained: 2, paid: 1, cached: 0, notAttempted: 0 },
          { tier: 'terms', status: 'tenté', gained: 1, paid: 0, cached: 1, notAttempted: 0 },
          { tier: 'window', status: 'plancher atteint', gained: 0, paid: 0, cached: 0, notAttempted: 0 },
          { tier: 'group', status: 'plancher atteint', gained: 0, paid: 0, cached: 0, notAttempted: 0 },
        ],
      },
      it_job_signals: [
        // #4044 — l'offre de stage semée à dessein (voir `demo-internship-excluded.spec.ts`) : stockée, jamais servie.
        {
          title: 'CS27 - Bac 5 - Stage Supply Chain H/F',
          location: 'Lyon (69)',
          city: 'Lyon',
          department: '69',
          date: '2026-10-07',
          contract_type: 'Stage',
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'APEC',
        },
        {
          title: 'Responsable exploitation des systèmes temps réel (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2026-08-10',
          contract_type: 'CDI',
          // #3097 — la séniorité (niveau d'expérience affiché) et le salaire,
          // seedés sur CETTE offre pour que la démonstration montre le champ
          // TEL QUE LA SOURCE L'AFFICHE — les autres offres du jeu restent
          // `null`, ce que la source affiche réellement pour elles.
          experience: 'Expérience exigée de 5 An(s)',
          salary: 'Mensuel de 4000.00 Euros à 5000.00 Euros',
          rome_label: 'Direction de systèmes d’information',
          company: 'SNCF Voyageurs',
          skills: ['SAP', 'Kubernetes'],
          // #2322.70 — rôle et équipe lus dans le texte de l'offre ; tension prouvée par l'urgence écrite dans l'annonce.
          role: 'direction_management',
          team: 'exploitation temps réel',
          tension: true,
          tension_reason: 'urgent_text',
          url: 'https://example.org/demo/offres/sncf-exploitation-temps-reel',
          source: 'APEC',
        },
        {
          title: 'Ingénieur plateforme data (H/F)',
          location: 'Saint-Denis (93)',
          city: 'Saint-Denis',
          department: '93',
          date: '2026-08-10',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          rome_label: 'Études et développement informatique',
          company: 'SNCF Connect & Tech',
          skills: ['Snowflake', 'Power BI', 'Azure'],
          // #2322.70 — rôle et équipe lus dans le texte ; tension = durée en ligne MESURÉE (jamais devinée).
          role: 'data_ia',
          team: 'plateforme data',
          tension: true,
          tension_reason: 'online_long',
          tension_days: 82,
          url: 'https://example.org/demo/offres/sncf-plateforme-data',
          source: 'APEC',
        },
        {
          title: 'Technicien support applicatif (H/F)',
          location: 'Lyon (69)',
          city: 'Lyon',
          department: '69',
          date: '2026-04-19',
          contract_type: 'Intérim',
          experience: '3 ans',
          salary: '30 000 – 36 000 € / an',
          rome_label: 'Support informatique',
          company: 'SNCF',
          skills: ['ServiceNow'],
          url: 'https://example.org/demo/offres/sncf-support-applicatif',
          source: 'France Travail',
        },
        // #4757 — l'HISTORIQUE long de ce compte (offres de plus de six mois, datées pour de bon) : de quoi montrer
        // les deux blocs « récents » / « historiques » et la pagination de la fiche (voir `demo-job-history-coverage.spec.ts`).
        {
          title: 'Administrateur systèmes Linux (H/F)',
          location: 'Lyon (69)',
          city: 'Lyon',
          department: '69',
          date: '2025-09-15',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Chef de projet SI ferroviaire (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2025-08-04',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Architecte intégration SAP (H/F)',
          location: 'Saint-Denis (93)',
          city: 'Saint-Denis',
          department: '93',
          date: '2025-07-21',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Ingénieur DevOps Kubernetes (H/F)',
          location: 'Lille (59)',
          city: 'Lille',
          department: '59',
          date: '2025-06-30',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Développeur Java back-end (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2025-06-02',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Product owner billettique (H/F)',
          location: 'Saint-Denis (93)',
          city: 'Saint-Denis',
          department: '93',
          date: '2025-05-12',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Data analyst exploitation (H/F)',
          location: 'Lyon (69)',
          city: 'Lyon',
          department: '69',
          date: '2025-04-22',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Responsable cybersécurité OT (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2025-04-01',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Testeur recette applicative (H/F)',
          location: 'Toulouse (31)',
          city: 'Toulouse',
          department: '31',
          date: '2025-03-10',
          contract_type: 'CDD',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Consultant migration cloud (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2025-02-17',
          contract_type: 'Freelance',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Ingénieur réseau et télécoms (H/F)',
          location: 'Marseille (13)',
          city: 'Marseille',
          department: '13',
          date: '2025-01-27',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        {
          title: 'Scrum master programme voyageurs (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2024-12-09',
          contract_type: 'CDI',
          experience: null,
          salary: null,
          company: 'SNCF Voyageurs',
          skills: [],
          url: null,
          source: 'France Travail',
        },
        // #4759 (HIST-E) — un besoin PASSÉ, daté, avec sa techno : de quoi faire dire à Laura « vous cherchiez un lead
        // Java en novembre dernier » (outil `account/needs-history`), son âge dit et jamais déduit. Fictif, comme le reste.
        {
          title: 'Lead développeur Java (H/F)',
          location: 'Paris (75)',
          city: 'Paris',
          department: '75',
          date: '2025-11-12',
          contract_type: 'CDI',
          experience: '8 ans',
          salary: null,
          rome_label: 'Développement informatique',
          company: 'SNCF',
          skills: ['Java', 'Spring'],
          url: null,
          source: 'APEC',
        },
      ],
      /**
       * #2291.2 (lot R, 19/09/2026) — le modèle de contrat OBSERVÉ, calculé sur
       * les TROIS offres ci-dessus (jamais déduit) : 2 CDI + 1 intérim, aucune
       * profession libérale — la même règle que la fonction partagée
       * (`observe_contract_model`), à la main ici puisque ce jeu est du JSON
       * statique. `public_contracts: null` — BOAMP/DECP sont volontairement
       * absents de ce jeu (voir `DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT`,
       * demo-coverage.ts) : un avis de marché fabriqué se périmerait comme eux.
       */
      contract_model: {
        observed_at: '2026-08-10',
        job_offers: {
          source: 'France Travail',
          total: 3,
          counts: { permanent: 2, fixed_term: 0, interim: 1, freelance: 0, other: 0 },
          since: '2026-04-19',
          until: '2026-08-10',
        },
        public_contracts: null,
      },
      /* La barrière d'ACHAT estimée (tome 3), calculée par le MÊME moteur que la
         production (`access_scoring.barrier_for_company`) sur les valeurs de
         registre de ce dossier (grande entreprise, tranche 10 000+, 329
         établissements) — jamais saisie à la main. Elle montre le cas
         « ouvert par une entité » : achats déconcentrés, donc une porte par
         entité plutôt qu'un seul guichet. La cotation, la commande publique
         et l'ancienneté restent « non mesurées », comme en vrai. */
      access_barrier: {
        score: 4.8,
        accessibility: 5.9,
        access_class: 'B',
        label: 'Ouvert par une entité',
        proxies: [
          {
            key: 'statut',
            contribution: 3.15,
            evidence: 'grande entreprise au sens INSEE — direction achats, panel fournisseurs, contrôle des dépenses',
            measurable: true,
          },
          {
            key: 'effectif',
            contribution: 2.45,
            evidence: 'effectif 20000 salariés — la maturité achat croît par paliers',
            measurable: true,
          },
          {
            key: 'cotation',
            contribution: 0.0,
            evidence: 'cotation inconnue — aucune source publique ne la lie au SIREN',
            measurable: false,
          },
          {
            key: 'commande_publique',
            contribution: 0.0,
            evidence: 'exposition à la commande publique non vérifiée',
            measurable: false,
          },
          {
            key: 'decentralisation',
            contribution: -0.8,
            evidence: '329 établissements — référencements déconcentrés probables',
            measurable: true,
          },
          {
            key: 'anciennete',
            contribution: 0.0,
            evidence: 'date de création inconnue',
            measurable: false,
          },
        ],
        measurable: true,
        missing: ['cotation', 'commande_publique', 'anciennete'],
        corrections: [],
        warning: null,
      },
      /**
       * L'ADRESSABILITÉ (tome 1 §6, `addressabilitySchema`) — le SECOND nombre,
       * jamais fondu dans le score d'intérêt. Calculée comme le calcule
       * `addressability_for_company` (apps/ia/app/services/discover_scoring.py)
       * sur les preuves QUE CE DOSSIER PORTE, jamais une valeur inventée :
       *
       * - `lock` MESURÉ : aucun `awarded_contracts`/`public_tenders` n'est semé
       *   sur ce dossier, donc le calcul retombe sur la barrière ci-dessus
       *   (`_lock_axis_from_barrier`) — classe B → 3 points sur 6.
       * - `proportion`, `relation`, `path`, `access_cost` NON MESURÉS : mêmes
       *   raisons que partout dans la salle (taille de l'ESN inconnue du
       *   dossier, aucun CRM connecté, ingrédient non branché, D60 — le coût
       *   d'accès ne s'estime jamais).
       *
       * `max` = 6 (le seul plafond de `lock`), pas 20 : « non mesuré » ne se
       * mesure jamais à 0, et le dénominateur ne compte que ce qu'on a regardé.
       */
      addressability: {
        score: 3,
        max: 6,
        unmeasured: ['proportion', 'path', 'relation', 'access_cost'],
        factors: [
          {
            axis: 'lock',
            label: 'Ouvert par une entité — estimation de registre',
            points: 3,
            evidence:
              'barrière estimée 4.8/10 sur 3 proxies publics (classe B) — aucune trace de marché public à son nom',
            block: 'accessibility',
          },
        ],
      },

      legal_name: 'SNCF',
      legal_form: 'Société anonyme à capitaux publics',
      capital: null,
      creation_date: null,
      activity_label: 'Transport ferroviaire interurbain de voyageurs (49.10Z)',
      corporate_purpose:
        'Exploitation du réseau ferroviaire national, transport de voyageurs et de marchandises, gestion des gares et services associés.',
      // #4745.8 (Louis 29/10/2026) — SNCF est le client FICTIF de la salle : marge brute, EBE et résultat
      // d'exploitation sont des valeurs de DÉMONSTRATION qui remplissent l'onglet « Stratégie financière » (craft
      // rule n°9). 2022 reste incomplet À DESSEIN : l'EBE y est « Non publié », jamais 0.
      financials_history: [
        {
          year: 2024,
          closing_date: '2024-12-31',
          revenue: 43_354_000_000,
          net_result: null,
          headcount: null,
          gross_margin: 12_140_000_000,
          ebitda: 5_420_000_000,
          operating_result: 2_980_000_000,
        },
        {
          year: 2023,
          closing_date: '2023-12-31',
          revenue: 41_800_000_000,
          net_result: null,
          headcount: null,
          gross_margin: 11_480_000_000,
          ebitda: 5_050_000_000,
          operating_result: 2_610_000_000,
        },
        {
          year: 2022,
          closing_date: null,
          revenue: 39_600_000_000,
          net_result: null,
          headcount: null,
          gross_margin: 10_700_000_000,
          ebitda: null,
          operating_result: 2_240_000_000,
        },
      ],
      /**
       * Nom + fonction, RIEN d'autre. Le registre publie aussi les dates de
       * naissance des mandataires et le pipeline les recopie : elles n'ont
       * aucun usage commercial et ce lien est public.
       */
      executives: [
        {
          first_name: 'Jean',
          last_name: 'Castex',
          role: 'Président du conseil d’administration et directeur général',
          is_c_level: true,
        },
        { first_name: 'Laurent', last_name: 'Trévisani', role: 'Directeur général délégué', is_c_level: true },
      ],
      c_level: [
        {
          first_name: 'Jean',
          last_name: 'Castex',
          role: 'Président du conseil d’administration et directeur général',
          is_c_level: true,
        },
        { first_name: 'Laurent', last_name: 'Trévisani', role: 'Directeur général délégué', is_c_level: true },
      ],
      subsidiaries: [
        { siren: '412280737', name: 'SNCF Réseau', legal_name: 'SNCF RESEAU' },
        { siren: '519037584', name: 'SNCF Voyageurs', legal_name: 'SNCF VOYAGEURS' },
        { siren: '507523801', name: 'SNCF Gares & Connexions', legal_name: 'SNCF GARES & CONNEXIONS' },
        { siren: '483815619', name: 'SNCF Connect & Tech', legal_name: 'SNCF CONNECT & TECH' },
        { siren: '552111809', name: 'Keolis', legal_name: 'KEOLIS' },
        { siren: '528985559', name: 'Rail Logistics Europe', legal_name: 'RAIL LOGISTICS EUROPE' },
      ],
      branches: [
        {
          city: 'Saint-Denis',
          postal_code: '93210',
          country: 'France',
          latitude: 48.9362,
          longitude: 2.3574,
          is_headquarters: true,
        },
        {
          city: 'Paris',
          postal_code: '75010',
          country: 'France',
          latitude: 48.8767,
          longitude: 2.3583,
          is_headquarters: false,
        },
        {
          city: 'Rennes',
          postal_code: '35000',
          country: 'France',
          latitude: 48.1173,
          longitude: -1.6778,
          is_headquarters: false,
        },
      ],
      branch_count: 329,

      detected_tech_stack: ['Dart', 'C++', 'TypeScript', 'Java', 'Kotlin'],
      github_signals: {
        org: 'sncf-connect-tech',
        url: 'https://github.com/sncf-connect-tech',
        public_repos: 111,
        top_languages: ['Dart', 'C++', 'TypeScript', 'Java', 'Kotlin'],
        active_recent_repos: 10,
        last_activity: '2026-08-04',
      },
      program_names: [
        {
          name: 'Partenariat d’innovation avec l’Institut Polytechnique de Paris',
          entity: 'SNCF',
          budget: 'non communiqué',
          description: 'Collaboration de trois ans annoncée le 12 juin 2026.',
          objective: 'Recherche appliquée en intelligence artificielle pour les mobilités',
          horizon: '2029',
        },
        {
          name: 'Chaire « Intelligence artificielle et optimisation pour les mobilités »',
          entity: 'Direction du numérique du groupe',
          budget: 'non communiqué',
          description: 'Portée avec l’École polytechnique.',
        },
        {
          name: 'Futur système de communication ferroviaire',
          entity: 'SNCF Réseau',
          budget: 'non communiqué',
          description: 'Remplacement du système radio ferroviaire actuel, chantier pluriannuel.',
        },
      ],
      it_implications_for_esn:
        'Le groupe se pilote par entités : six directions informatiques métiers gardent leurs équipes sous une gouvernance groupe recomposée. Pour une ESN de 50 à 150 consultants, c’est le meilleur des cinq comptes — on n’affronte pas un référencement de groupe, on entre par une entité, sur un besoin déjà publié.',
      business_description:
        'La Société nationale SNCF est la société mère du groupe ferroviaire public : exploitation du réseau, transport de voyageurs et de marchandises, gestion des gares. Elle a publié 43,4 Md€ au dernier exercice déposé (2024) et compte 329 établissements ouverts au registre.',
      it_challenges: sncfChallenges,
      recent_signals: sncfSignals,
      // #3668.8 — les sources ont répondu : « aucun signal » ne se dirait que dans cet état.
      signal_coverage: {
        status: 'found',
        consulted: ['brave_news', 'france_travail', 'bodacc'],
        unreachable: [],
      },
      signal_selection: { total: sncfSignals.length, context: 1, other_entity: 0, duplicates_merged: 0 },
      sites_france: sncfSites,
      technology_stack: [
        {
          name: 'Futur système de communication ferroviaire',
          usage: 'Remplacement du système radio actuel, chantier pluriannuel',
          maturity: 'adoption',
        },
        { name: 'Système radio ferroviaire actuel', usage: 'En service, en cours de remplacement', maturity: 'legacy' },
        {
          name: 'Plateforme de vente et d’information voyageurs',
          usage: 'Service grand public',
          maturity: 'production',
        },
        { name: 'Jumeaux numériques', usage: 'Modélisation des infrastructures pour la maintenance', maturity: 'poc' },
        { name: 'Capteurs communicants', usage: 'Remontée d’informations en temps réel', maturity: 'adoption' },
      ],
      entities_exhaustive: [
        {
          name: 'Société nationale SNCF',
          type: 'siege',
          parent: null,
          region: 'Île-de-France',
          estimated_headcount: '10 000 et plus (registre)',
          it_autonomy: 'centralisee',
          relevance: 'operational',
          actionable: false,
        },
        {
          name: 'SNCF Connect & Tech',
          type: 'filiale',
          parent: 'SNCF Voyageurs',
          region: 'Île-de-France',
          estimated_headcount: 'non publié',
          it_autonomy: 'autonome',
          relevance: 'filiale_strategique',
          actionable: true,
        },
        {
          name: 'Direction du numérique du groupe',
          type: 'direction',
          parent: 'Société nationale SNCF',
          region: 'Île-de-France',
          estimated_headcount: 'non publié',
          it_autonomy: 'centralisee',
          relevance: 'filiale_strategique',
          actionable: true,
        },
        {
          name: 'SNCF Réseau',
          type: 'filiale',
          parent: 'Société nationale SNCF',
          region: 'France',
          estimated_headcount: 'non publié',
          it_autonomy: 'autonome',
          relevance: 'operational',
          actionable: true,
        },
        {
          name: 'Keolis',
          type: 'filiale',
          parent: 'Société nationale SNCF',
          region: 'France et international',
          estimated_headcount: 'non publié',
          it_autonomy: 'autonome',
          relevance: 'operational',
          actionable: true,
        },
      ],
      competitors: [
        {
          name: 'Grandes ESN généralistes',
          contract_type: 'Transformation, cloud, cybersécurité',
          strengths: 'Présence historique sur les grands comptes du transport public',
          weaknesses: 'Adressent le groupe, rarement une entité en particulier',
        },
      ],
      pains: [
        {
          pain: 'Des cas d’usage d’IA cadrés côté recherche que personne ne fait passer en production',
          business_impact: 'Des partenariats visibles dont l’effet opérationnel tarde',
          esn_offer: 'Atelier de cadrage puis premier flux de production en six semaines',
          urgency: 'high',
        },
        {
          pain: 'Des programmes de refonte simultanés avec des postes ouverts non pourvus',
          business_impact: 'Des plannings tenus au prix d’arbitrages, ou pas tenus',
          esn_offer: 'Renfort en régie sur un poste déjà publié',
          urgency: 'high',
        },
        {
          pain: 'Une indisponibilité applicative immédiatement visible du public',
          business_impact: 'Un incident technique devient un sujet de presse en quelques heures',
          esn_offer: 'Diagnostic d’observabilité et plan de remédiation priorisé',
          urgency: 'high',
        },
      ],
      /* ---- Les prochaines actions du plan (parité démo, #2123.15/.18/.34) --
         Le plan ouvre sur « Trois prochaines actions » et « Horizon 60-90
         jours ». Sans ces lignes, les deux sections s'annonceraient « Non
         produit par la dernière analyse » sur le lien de démonstration — un
         écran livré mais vide se découvre en réunion, pas en CI (craft rule
         n°9). CINQ actions, pour que la troncature à trois SE VOIE, et deux
         échéances lointaines pour que l'horizon fusionné ne soit pas creux.
         Lues à plat par `buildPlanViewData` : aucune clé `plan` n'est ajoutée,
         le lecteur retombe sur la racine du blob.
         */
      nextActions: [
        {
          id: 'demo_sncf_next_1',
          chantier: 'contacts',
          label: 'Rappeler la direction du numérique sur le futur système de communication ferroviaire',
          why: 'Le programme est public, long, et cherche des compétences rares.',
          horizon: '7j',
        },
        {
          id: 'demo_sncf_next_2',
          chantier: 'messages',
          label: 'Écrire à l’entité qui porte la plateforme de vente et d’information voyageurs',
          why: 'Elle contractualise séparément du groupe.',
          horizon: '7j',
        },
        {
          id: 'demo_sncf_next_3',
          chantier: 'signaux',
          label: 'Suivre les marchés publiés autour de la chaire de recherche mobilités',
          why: 'Un partenariat d’innovation précède les marchés d’exécution.',
          horizon: '30j',
        },
        {
          id: 'demo_sncf_next_4',
          chantier: 'compte',
          label: 'Distinguer les entités qui achètent par accord-cadre de celles qui achètent au fil de l’eau',
          why: 'La voie contractuelle n’est pas la même, et l’une est ouverte.',
          horizon: '60j',
        },
        {
          id: 'demo_sncf_next_5',
          chantier: 'expansion',
          label: 'Préparer une deuxième entité du groupe après une première référence',
          why: 'La référence interne est ce qui ouvre la porte suivante.',
          horizon: '90j',
        },
      ],
      axes_ecartes: [
        {
          angle: 'Programme de transformation au niveau du groupe',
          raison:
            'Référencement lourd, cycle long, grandes ESN installées : ce n’est pas le terrain d’une structure de 50 à 150 consultants.',
          comment_reactiver: 'À rouvrir après deux missions livrées dans des entités différentes.',
        },
        {
          angle: 'Systèmes de sécurité ferroviaire',
          raison:
            'Certifications et responsabilités spécifiques au ferroviaire, hors du périmètre d’une ESN généraliste.',
          comment_reactiver: 'Sans objet en l’état du catalogue.',
        },
        {
          angle: 'Remplacement du système de communication ferroviaire',
          raison: 'Chantier d’équipementier, pas de prestation intellectuelle généraliste.',
          comment_reactiver: 'À reconsidérer en sous-traitance auprès d’un intégrateur retenu.',
        },
      ],
      angles: [
        {
          title: 'Industrialiser un cas d’usage issu des travaux de recherche',
          strategy:
            'Les partenariats académiques produisent des cas d’usage cadrés que personne n’exploite. Le sponsor est identifié — la direction du numérique porte elle-même la chaire — et le travail restant est précisément celui d’une ESN : gouvernance des données, chaînes de production, exploitation.',
          description:
            'Atelier de 45 minutes pour nommer le cas d’usage, puis six semaines pour le premier flux en production.',
          entry_contact_persona: 'Responsable data et innovation — direction du numérique',
          specific_offer: 'Atelier de cadrage puis premier flux de production',
          estimated_deal_size: 'Hypothèse — à recaler sur la grille réelle du client',
          proof: 'Chaîne de données sous contrainte de conformité',
          proof_status: 'mobilisable',
        },
        {
          title: 'Renfort sur un programme de refonte déjà doté',
          strategy:
            'Des postes sont ouverts sur plusieurs entités. Un besoin publié est un besoin déjà arbitré : il n’y a pas à convaincre qu’il existe, seulement à le servir plus vite que le recrutement.',
          description:
            'Un à deux profils en régie sur un périmètre borné, en test de quelques semaines avant extension.',
          entry_contact_persona: 'Responsable de programme de refonte applicative',
          specific_offer: 'Renfort en régie sur un poste ouvert',
          estimated_deal_size: 'Hypothèse — à recaler sur la grille réelle du client',
          proof: '',
          proof_status: 'absent',
        },
        {
          title: 'Diagnostic d’observabilité sur les applications voyageurs',
          strategy:
            'Une indisponibilité se voit publiquement en quelques heures. Un diagnostic borné avec plan de remédiation priorisé se justifie tout seul auprès d’une équipe déjà sous tension.',
          description: 'Six semaines, périmètre applicatif borné, plan de remédiation en livrable.',
          entry_contact_persona: 'Directeur technique — entité numérique voyageurs',
          specific_offer: 'Diagnostic d’observabilité, six semaines',
          estimated_deal_size: 'Hypothèse — à recaler sur la grille réelle du client',
          proof: 'Réduction du délai de détection d’incident sur une plateforme à fort trafic',
          proof_status: 'mobilisable',
        },
      ],
      comment_ouvrir_compte: {
        strategy:
          'Ne jamais adresser le groupe. Six entités métiers gardent leurs équipes informatiques : on en choisit une, sur un besoin déjà publié, et on se sert de la mission livrée comme de la référence interne qui ouvre la deuxième.',
        entry_points: [
          {
            label: 'Entité numérique du groupe voyageurs',
            target_profile: 'Directeur technique d’entité',
            justification: 'Entité technique autonome, immatriculée séparément, avec ses propres décisions.',
          },
          {
            label: 'Cas d’usage issu des travaux de recherche',
            target_profile: 'Responsable data et innovation — direction du numérique',
            justification: 'Sponsor identifié, cas d’usage déjà cadré, industrialisation restant à faire.',
          },
        ],
      },
      messages: [
        {
          contact_name: seatName('Responsable data et innovation — direction du numérique'),
          linkedin_message:
            'Bonjour, votre chaire sur l’IA et l’optimisation des mobilités cadre des cas d’usage que personne n’a le temps de faire passer en production. C’est exactement le travail que nous prenons. Quarante-cinq minutes pour en nommer un ?',
          email_subject: 'De la chaire au run — quarante-cinq minutes pour nommer un cas d’usage',
          email_body:
            'Bonjour,\n\nVos partenariats de recherche cadrent des cas d’usage — maintenance prédictive, optimisation des mobilités — dont l’industrialisation reste entière.\n\nC’est le travail que nous prenons : gouvernance des données, chaîne de production, exploitation. Pas un nouveau prototype.\n\nQuarante-cinq minutes pour en nommer un, puis six semaines pour le premier flux en production ?\n\nBien à vous,',
          phone_opener:
            'Bonjour, je vous appelle au sujet de vos cas d’usage de recherche — c’est leur passage en production que nous prenons, pas un prototype de plus.',
        },
      ],
      risks: [
        {
          risk: 'Le référencement fournisseur du groupe s’impose même pour une mission d’entité.',
          probability: 'moyenne',
          impact: 'eleve',
          mitigation:
            'Poser la question dès le premier atelier : « pour une mission de cette taille, quel est le circuit chez vous ? »',
        },
        {
          risk: 'Le cas d’usage retenu n’a de budget que côté recherche, pas côté production.',
          probability: 'elevee',
          impact: 'moyen',
          mitigation:
            'Faire nommer un sponsor MÉTIER dès l’atelier, pas seulement un sponsor académique. Sans lui, le cas d’usage ne passera pas.',
        },
      ],
      offers_to_propose: [
        {
          title: 'Du cas d’usage de recherche au premier flux de production',
          pitch: 'Prendre un cas d’usage déjà cadré et le faire tourner, plutôt qu’en cadrer un de plus.',
          target_contact: seatName('Responsable data et innovation — direction du numérique'),
          pain_addressed: 'Des travaux de recherche visibles dont l’effet opérationnel tarde.',
          estimated_tjm: 'Hypothèse — à recaler sur la grille réelle du client',
          estimated_team_size: 2,
          estimated_duration: '6 semaines',
          differentiator: 'On ne propose pas un prototype de plus : le livrable est un flux qui tourne.',
        },
      ],
      immediate_action:
        'Choisir UNE entité et écrire à sa direction technique — jamais au groupe, dont le référencement dépasse la taille de l’ESN.',
      quick_wins: [
        {
          action:
            'Proposer un atelier de 45 minutes pour nommer le cas d’usage de recherche à industrialiser en premier.',
          channel: 'E-mail',
          contact: seatName('Responsable data et innovation — direction du numérique'),
          expected_impact: 'Un cas d’usage nommé et un périmètre écrit',
          effort: 'low',
        },
        {
          action: 'Se positionner sur un poste déjà ouvert dans une entité — un besoin publié est un besoin arbitré.',
          channel: 'E-mail',
          contact: seatName('Responsable de programme de refonte applicative'),
          expected_impact: 'Profil en entretien',
          effort: 'low',
        },
      ],
      go_no_go: 'PRUDENT',
      commercial_score: 60,
      data_confidence: 78,
      score_factors: [
        { label: 'Fit — problèmes et offres compatibles', proof_type: 'profile', weight: 4 },
        { label: 'Timing — gouvernance recomposée, postes ouverts', proof_type: 'signal', weight: 4 },
        { label: 'Accessibilité — six entités, six cycles de décision', proof_type: 'contact', weight: 4 },
        { label: 'Concurrence — grandes ESN présentes au niveau groupe', proof_type: 'source', weight: 3 },
      ],
      evaluation: {
        go_no_go: 'PRUDENT',
        global_score: 18,
        justification:
          'La fragmentation en six entités, souvent vue comme un obstacle, est ici l’atout : elle offre six portes d’entrée à taille humaine. Le risque reste qu’un référencement de groupe s’impose malgré tout — question à poser dès le premier atelier.',
        // #1607.1 — LES QUATRE BLOCS BELLUM READ, additifs à `justification`
        // ci-dessus (jamais un remplacement — voir `bellumReadSchema`).
        // `nextAction` est une action COMMERCIALE, pas une vérification : ce
        // dossier porte une preuve ACTUELLE (un poste ouvert, cité dans
        // `quick_wins` ci-dessus), pas seulement un signal structurel de
        // mémoire marché. Recensé dans `demo-coverage.ts` (DEMO_SEEDED_TABLES
        // couvre déjà `raw_analysis.evaluation`).
        bellum_read: {
          verdict_line: 'SNCF se travaille par entité, pas au niveau groupe.',
          why: [
            // #2118.16 — le verdict CITE la stratégie validée à l'audit : le
            // compte de démonstration porte `chosen_entry_strategy =
            // 'multiThread'` (DemoSeedService), dans les mots de l'audit.
            'Six entités juridiques distinctes, six cycles de décision indépendants — ton entrée sur plusieurs fils, validée à l’audit, s’y applique',
            'Un besoin déjà publié dans une entité (poste ouvert en refonte applicative)',
            'Aucun référencement transverse de groupe identifié à ce jour',
          ],
          missing: 'Confirmation qu’aucun référencement de groupe ne s’applique à l’entité ciblée.',
          next_action:
            'Se positionner sur le poste ouvert de responsable de programme de refonte applicative, avec une proposition de mission courte.',
        },
        // #2118 — LA LECTURE STRUCTURÉE : sept axes fixes + les blocs rédigés
        // (`dossierReadSchema`). Additive à `bellum_read` ci-dessus, jamais un
        // remplacement. Ce dossier-ci est le cas COMPLET : les sept axes sont
        // notés, chacun avec son impact et son levier. Le dossier Société
        // Générale montre le cas honnête inverse — deux axes « non mesurés »
        // qui SORTENT du dénominateur au lieu de compter pour zéro.
        dossier_read: {
          axes: [
            {
              key: 'adequation_offre',
              state: 'measured',
              value: 4,
              impact: 'Refonte applicative et cloud : le cœur de tes trois domaines, sur un secteur que tu cibles.',
              lever: 'Une référence ferroviaire citable ferait passer cet axe au maximum.',
            },
            {
              key: 'potentiel_commercial',
              state: 'measured',
              value: 4,
              impact: 'Six entités qui achètent séparément : le volume se construit entité par entité, pas d’un coup.',
              lever: 'Une première mission livrée ouvre la deuxième entité sans repasser par un référencement.',
            },
            {
              key: 'fraicheur',
              state: 'measured',
              value: 4,
              impact: 'Un poste ouvert publié ce mois-ci : le besoin est actuel, pas déduit.',
              lever: 'Confirmer la date de démarrage auprès du responsable du programme.',
            },
            {
              key: 'accessibilite',
              state: 'measured',
              value: 4,
              impact: 'Chaque entité décide seule : une ESN de ta taille peut entrer sans passer par le groupe.',
              lever: 'Un sponsor nommé dans l’entité ciblée verrouillerait l’accès.',
            },
            {
              key: 'capacite_achat_externe',
              state: 'partial',
              value: 3,
              impact:
                'L’entité achète de la prestation, mais son processus fournisseur n’est pas documenté publiquement.',
              lever: 'Demander le circuit fournisseur dès le premier échange, avant la validation métier.',
            },
            {
              key: 'concurrence',
              state: 'partial',
              value: 3,
              impact:
                'De grandes ESN sont présentes au niveau du groupe ; leur présence dans l’entité reste à vérifier.',
              lever: 'Vérifier si un accord-cadre de groupe s’applique à l’entité visée.',
            },
            {
              key: 'qualite_preuves',
              state: 'measured',
              value: 3,
              impact: 'Structure et poste ouvert sont sourcés et datés ; la concurrence interne ne l’est pas.',
              lever: 'Une source datée sur les titulaires en place compléterait la lecture.',
            },
          ],
          why_for_your_esn:
            'Tes trois domaines — cloud, data, cybersécurité — répondent exactement au programme de refonte applicative publié, et une structure en six entités autonomes est l’une des rares portes qu’une ESN de moins de dix consultants peut pousser seule. Le transport ferroviaire fait partie de tes secteurs cibles, et l’Île-de-France de ta zone.',
          recommended_scope:
            'Une entité, sur le périmètre du programme de refonte applicative — jamais le groupe, dont le référencement serait hors de portée à ta taille.',
          best_entry_point: {
            label: 'Le responsable du programme de refonte applicative',
            target_profile: 'N-1 opérationnel, porteur du budget du programme',
            why: 'C’est lui qui a publié le besoin, et son entité décide sans arbitrage groupe.',
          },
          obstacles: [
            {
              label: 'Un référencement de groupe pourrait s’imposer malgré l’autonomie de l’entité',
              why: 'Rien ne prouve aujourd’hui qu’il n’existe pas : la question se pose au premier atelier.',
            },
            {
              label: 'Aucune référence ferroviaire citable',
              why: 'À ta taille, la référence sectorielle remplace souvent la taille de l’équipe dans la décision.',
            },
          ],
          anti_advice: {
            what: 'Ne commence pas par la direction informatique du groupe.',
            why: 'Elle n’arbitre pas le budget du programme, et une entrée par le haut ferait redescendre ton dossier dans un processus de référencement que tu ne peux pas tenir seul.',
          },
          next_action: {
            label: 'Vérifier si un accord-cadre de groupe couvre l’entité ciblée',
            tab: 'evaluation',
          },
          reliability: {
            quality: { state: 'measured', value: 78, note: 'Structure et besoin publiés, tous deux sourcés.' },
            coverage: { state: 'partial', value: 55, note: 'Cinq des six entités documentées.' },
            freshness: { state: 'measured', value: 82, note: 'Le poste ouvert date de ce mois-ci.' },
          },
          missing: [
            {
              label: 'Les titulaires en place sur le périmètre applicatif de l’entité',
              why: 'Aucune source datée ne les nomme ; l’axe concurrence reste donc partiel.',
            },
            {
              label: 'Le circuit fournisseur de l’entité',
              why: 'Il n’est pas publié : il se demande, il ne se déduit pas.',
            },
          ],
        },
      },
      plan: {
        commercial_score: 60,
        data_confidence: 78,
        // #3777 — « Prochains mouvements » (`PlanNextMoves`) ne s'affiche que si le plan porte un
        // mouvement, une route, des actions ou « si silence » : la salle n'en semait aucun, la carte
        // et sa note « déjà suivies dans le tableau » restaient introuvables (recette démo 10/10).
        recommendedMovement: {
          movement: 'bottom_up',
          sequence:
            'Direction technique d’UNE entité → responsable de programme → direction du numérique, une fois la première référence interne obtenue.',
          rationale:
            'Le groupe référence au-dessus de la taille d’une ESN moyenne ; une entité qui garde ses équipes informatiques décide seule et plus vite.',
        },
        nextActions: [
          {
            id: 'SNCF-NA1',
            chantier: 'Entrée',
            label: SNCF_FIRST_ACTION,
            why: 'Le seul angle daté du dossier : la réorganisation de la gouvernance redéfinit les priorités.',
            horizon: '7j',
          },
          {
            id: 'SNCF-NA2',
            chantier: 'Besoin publié',
            label:
              'Vérifier le poste ouvert d’architecte cloud et préparer un profil à présenter avant la fin du mois.',
            why: 'Un besoin publié est un besoin déjà arbitré : c’est la porte la moins coûteuse.',
            horizon: '30j',
          },
        ],
        ifNoResponse: {
          trigger: 'Sans réponse de la direction technique sous dix jours ouvrés.',
          alternative_contact: 'Le responsable de programme de refonte applicative de la même entité.',
          different_angle: 'Passer du cadrage de gouvernance au besoin publié (le poste d’architecte cloud).',
          reengagement_pretext: 'Un profil déjà disponible pour le poste ouvert.',
        },
        action_plan: {
          strategy: 'land_and_expand',
          justification:
            'Une entité, un besoin déjà publié, une mission livrée — puis se servir de cette mission comme de la référence interne qui ouvre la deuxième entité.',
          phases: sncfPlanPhases,
        },
        evaluation: {
          go_no_go: 'PRUDENT',
          global_score: 18,
          justification:
            'Le compte le plus abordable des cinq pour une ESN moyenne, à condition de viser une entité et pas le groupe.',
        },
      },
      action_plan: {
        strategy: 'land_and_expand',
        justification:
          'Une entité, un besoin déjà publié, une mission livrée — puis se servir de cette mission comme de la référence interne qui ouvre la deuxième entité.',
        phases: sncfPlanPhases,
      },

      org: { orgGraph: sncfOrgGraph },
    },
  },
  contacts: [
    namedContact({
      full_name: 'Jean Castex',
      title: 'Président du conseil d’administration et directeur général',
      entity: 'SNCF',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      profile_summary: `Mandataire social publié au registre du commerce (${REGISTRY_SOURCE}). Seuls le nom et la fonction sont conservés : le registre publie aussi la date de naissance, qui n’a aucun usage commercial.`,
      why_contact:
        'Identifie la gouvernance du compte. Aucune ESN de 50 à 150 consultants n’ouvre un groupe public par sa direction générale.',
      contact_score: 28,
      seniority: 'c_suite',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Mandataire social au registre', 'Ne pas ouvrir le compte par lui'],
    }),
    namedContact({
      full_name: 'Laurent Trévisani',
      title: 'Directeur général délégué',
      entity: 'SNCF',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      profile_summary: `Mandataire social publié au registre du commerce (${REGISTRY_SOURCE}).`,
      why_contact: 'Utile en fin de cycle pour sécuriser un arbitrage déjà porté, jamais en première approche.',
      contact_score: 30,
      seniority: 'c_suite',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Mandataire social au registre'],
    }),
    roleSeat({
      title: 'Directeur technique — entité numérique voyageurs',
      entity: 'SNCF Connect & Tech',
      family: 'Dev',
      decision_role: 'technical',
      priority: 1,
      why_contact:
        'Entité technique autonome, immatriculée séparément : elle décide de ses prestataires sans passer par le référencement du groupe.',
      key_points: ['Entité autonome, immatriculée séparément', 'Applications exposées au grand public'],
      contact_score: 64,
    }),
    roleSeat({
      title: 'Responsable data et innovation — direction du numérique',
      entity: 'SNCF',
      family: 'Data',
      // #2295.2 / #3401 — champion : porte le besoin en interne (« le sponsor
      // naturel de l'industrialisation ») sans détenir la décision de mission.
      // Re-semé le 01/10/2026 : le siège champion de la salle a quitté avec
      // son dossier.
      decision_role: 'champion',
      priority: 1,
      why_contact:
        'La direction du numérique porte elle-même la chaire de recherche : c’est le sponsor naturel de l’industrialisation qui reste à faire.',
      key_points: ['Porte les partenariats de recherche', 'Le budget de production reste à identifier'],
      contact_score: 60,
    }),
    roleSeat({
      title: 'Responsable de programme de refonte applicative',
      entity: 'SNCF Voyageurs',
      family: 'PMO',
      decision_role: 'user',
      priority: 2,
      why_contact:
        'Des postes ouverts sur son périmètre disent une tension que le recrutement ne comble pas au rythme des plannings.',
      key_points: ['Postes ouverts non pourvus', 'Plannings de programme à tenir'],
      contact_score: 54,
    }),
    roleSeat({
      title: 'Responsable de la sécurité des systèmes d’information',
      entity: 'SNCF',
      family: 'Cyber',
      decision_role: 'technical',
      priority: 2,
      why_contact:
        'Opérateur d’importance vitale : les obligations de résilience numérique créent un besoin récurrent, pas un projet ponctuel.',
      key_points: ['Opérateur d’importance vitale', 'Résilience affichée comme objectif de gouvernance'],
      contact_score: 50,
    }),
    // #4016 L4.2 — le siège dont l'organigramme DÉDUIT le N+1 probable
    // (« Directeur du numérique du groupe »), voir `demo-org-graphs.ts`.
    roleSeat({
      title: 'Responsable des infrastructures numériques',
      entity: 'SNCF',
      family: 'IT',
      decision_role: 'user',
      priority: 3,
      why_contact:
        'Tient l’exploitation des infrastructures du groupe : son rattachement n’est observé par aucune source, l’organigramme le déduit des intitulés.',
      key_points: ['Rattachement déduit des intitulés, jamais observé', 'Socle d’infrastructure commun aux entités'],
      contact_score: 44,
    }),
    roleSeat({
      title: 'Directeur du numérique du groupe',
      entity: 'SNCF',
      family: 'IT',
      decision_role: 'technical',
      priority: 2,
      why_contact:
        'Pilote les orientations des six entités métiers. Il ne décide pas des missions d’entité, mais il décide de ce qui compte — donc de ce qui sera financé.',
      key_points: ['Pilote six entités métiers', 'Décide des priorités, pas des missions'],
      contact_score: 46,
    }),
    roleSeat({
      title: 'Responsable de l’exploitation des systèmes temps réel',
      entity: 'SNCF Voyageurs',
      family: 'IT',
      decision_role: 'user',
      priority: 1,
      why_contact:
        'Chaque indisponibilité de son périmètre devient publique en quelques heures : le besoin d’observabilité n’a pas besoin d’être vendu.',
      key_points: ['Exposition publique immédiate', 'Équipe déjà sous tension'],
      contact_score: 56,
    }),
    roleSeat({
      title: 'Responsable des achats de prestations informatiques',
      entity: 'SNCF',
      family: 'Achat',
      decision_role: 'procurement',
      priority: 3,
      why_contact:
        'À interroger dès le premier atelier : « pour une mission de cette taille, quel est le circuit chez vous ? » — la réponse décide du calendrier.',
      key_points: ['Question à poser au premier atelier', 'Groupe public : circuit possiblement formalisé'],
      contact_score: 34,
    }),
    {
      ...roleSeat({
        title: 'Responsable des systèmes d’information d’une filiale de transport',
        entity: 'Keolis',
        family: 'IT',
        decision_role: 'technical',
        priority: 2,
        why_contact:
          'Filiale à autonomie propre, immatriculée séparément : une porte de plus, indépendante des cinq autres entités.',
        key_points: ['Filiale à autonomie propre', 'Cycle de décision distinct du groupe'],
        contact_score: 48,
      }),
      // #2160.60 — un second siège au même intitulé (voir juste en dessous)
      // rend ce compte AMBIGU sur ce nom : deux fiches actives partagent le
      // même `full_name`, et `filterEligibleContacts` (`contact-eligibility.ts`)
      // écarte les deux du classement pour `homonym_conflict`, sauf levée
      // explicite. CELUI-CI a été passé en revue et autorisé — l'autre, plus
      // bas, montre encore le bouton « Autoriser ». Réversible (revoke) :
      // aucun des deux états n'est un fait qu'on invente sur une personne,
      // puisqu'aucun des deux sièges n'est nommé (`roleSeat`).
      recommendation_authorized_reason: 'homonym_conflict',
      recommendation_authorized_at: '2026-09-20T09:00:00.000Z',
    },
    // #2160.60 — même intitulé que le siège Keolis ci-dessus, remonté séparément
    // sur une autre filiale de transport du groupe : rien dans les sources
    // publiques ne dit s'il s'agit du même titulaire ou de deux personnes
    // distinctes. C'est exactement la porte que la carte « Corrections »
    // (#2160.29) doit montrer — jamais un score attribué à l'aveugle sur les
    // deux fiches à la fois.
    // I31 (05/10) — nom DISTINCT : `idx_contacts_account_normalized_name` (un compte, un nom normalisé) refusait
    // le second siège au même `full_name` ; le semis le sautait en silence (WARN en prod). L'entité lève l'ambiguïté.
    {
      ...roleSeat({
        title: 'Responsable des systèmes d’information d’une filiale de transport',
        entity: 'SNCF Réseau',
        family: 'IT',
        decision_role: 'technical',
        priority: 2,
        why_contact:
          'Même intitulé que le siège identifié chez Keolis, sur une filiale distincte (déjà déclarée dans la liste exhaustive des entités du groupe) : une fiche « homonyme non résolu », pas un doublon à fusionner ni un score à deviner.',
        key_points: ['Même intitulé que le siège Keolis', 'Filiale distincte, immatriculée séparément'],
        contact_score: 40,
      }),
      full_name: `${seatName('Responsable des systèmes d’information d’une filiale de transport')} (SNCF Réseau)`,
    },
    // #2629.2 — décision Louis 22/09/2026 : sème l'unique cas où LinkedIn est
    // le SEUL canal disponible (`channelFallback`, apps/web/…/channel.ts).
    // Re-semé sur SNCF le 01/10/2026 (retrait du compte qui le portait).
    // Personne SIMULÉE, comme les interlocuteurs de `demo-contact-density.ts`
    // (DEMO-02) — jamais un dirigeant réel : rule 1 leur interdit toute
    // coordonnée, LinkedIn compris. L'URL pointe un slug visiblement fictif
    // (`demo-bellum-…`) : LinkedIn n'offre aucun équivalent `.example`
    // (RFC 2606) pour un réseau social, donc rien de mieux qu'un chemin qui
    // se lit comme fictif au premier coup d'œil et ne correspond à aucun
    // profil réel.
    {
      full_name: 'Younes Berrada',
      photo_url: null,
      title: 'Ingénieur plateforme data',
      entity: 'SNCF Connect & Tech',
      family: 'DSI',
      decision_role: 'influencer',
      priority: 4,
      email: null,
      phone: null,
      linkedin_url: 'https://www.linkedin.com/in/demo-bellum-younes-berrada',
      profile_summary:
        'Profil LinkedIn public repéré par la veille ; aucune adresse ni numéro trouvés. Sur un espace réel, c’est l’état d’un contact identifié avant tout enrichissement de coordonnées.',
      why_contact:
        'Le seul canal joignable aujourd’hui est LinkedIn — exactement le repli que l’écran doit proposer quand ni e-mail ni téléphone ne sont connus.',
      email_message: null,
      linkedin_message:
        'Bonjour Younes, je suis vos sujets plateforme data chez SNCF Connect & Tech. J’ai deux retours concrets d’acteurs comparables qui pourraient vous être utiles — je vous les envoie si ça vous intéresse.',
      contact_score: 41,
      seniority: 'confirme',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Identifié via un profil LinkedIn public', 'Ni e-mail ni téléphone trouvés à ce jour'],
    },
    // SIG-B (11/10/2026) — un recruteur NOMMÉ par une offre publiée, la preuve sur
    // sa fiche (offre, lien, date). Personne SIMULÉE (jamais un dirigeant réel),
    // offre FICTIVE en `.example` ; rang le plus bas : un recruteur ne passe
    // jamais devant un décideur. Aucune coordonnée : rien n'est enrichi d'office.
    {
      full_name: 'Inès Morvan',
      photo_url: null,
      title: 'Chargée de recrutement IT',
      entity: 'SNCF Connect & Tech',
      family: 'RH',
      decision_role: 'influencer',
      priority: 5,
      email: null,
      phone: null,
      linkedin_url: 'https://www.linkedin.com/in/demo-bellum-ines-morvan',
      profile_summary:
        'Nommée comme recruteuse sur une offre d’emploi publiée par l’entité. Sur un espace réel, c’est l’offre elle-même qui la prouve — son lien et sa date sont sur cette fiche.',
      why_contact:
        'Elle porte le recrutement d’un poste que vos consultants savent tenir : une voie vers le manager du poste, jamais une porte d’entrée à la place d’un décideur.',
      email_message: null,
      linkedin_message: null,
      contact_score: 22,
      seniority: 'confirme',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Nommée par une offre d’emploi publiée', 'Recrute sur un métier que l’ESN place'],
      job_posting: {
        title: 'Ingénieur DevOps plateforme data (H/F)',
        url: 'https://emploi.sncf-connect-tech.example/offres/ingenieur-devops-plateforme-data',
        posted_days_ago: 6,
      },
    },
    // #4055.8 — un contact qui a QUITTÉ l'entreprise : la relecture a observé un autre employeur (daté). Personne
    // SIMULÉE (profil `demo-bellum-`), jamais un dirigeant réel ; rang le plus bas, aucune coordonnée.
    {
      full_name: 'Thibault Revel',
      photo_url: null,
      title: 'Responsable applications voyageurs',
      entity: 'SNCF Voyageurs',
      family: 'Digital',
      decision_role: 'influencer',
      priority: 5,
      email: null,
      phone: null,
      linkedin_url: 'https://www.linkedin.com/in/demo-bellum-thibault-revel',
      profile_summary:
        'Contact ancien du dossier : la dernière relecture d’employeur l’a retrouvé dans une autre entreprise. Son titre d’origine n’est plus à jour.',
      why_contact:
        'Ne plus le solliciter ici : son poste est à repourvoir côté client, la fiche garde la preuve datée.',
      email_message: null,
      linkedin_message: null,
      contact_score: 10,
      seniority: 'confirme',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Autre employeur observé à la dernière relecture'],
      employment_check: { state: 'left', checked_days_ago: 9, organization: 'Orange Business' },
    },
    // #4295.11 — le contact « Ne pas contacter » qui tombe sur la 1re page de /contacts (voir
    // `DEMO_DO_NOT_CONTACT_LINKEDIN`) : personne SIMULÉE (profil `demo-bellum-`), aucune coordonnée, rang haut du chemin.
    {
      full_name: 'Gaëtan Lemoine',
      photo_url: null,
      title: 'Directeur des achats numériques',
      entity: 'SNCF Voyageurs',
      family: 'Achat',
      decision_role: 'economic',
      priority: 1,
      email: null,
      phone: null,
      linkedin_url: 'https://www.linkedin.com/in/demo-bellum-gaetan-lemoine',
      profile_summary:
        'Interlocuteur de démonstration : a demandé à ne plus être sollicité. La liste « Ne pas contacter » de l’espace le désigne.',
      why_contact: 'Montre ce que devient un contact dont le refus est enregistré : badge, filtre et envoi bloqué.',
      email_message: null,
      linkedin_message: null,
      contact_score: 60,
      seniority: 'confirme',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Refus de sollicitation enregistré'],
    },
    // SEMIS-PREUVES 4290.13 (#4055.9) — un contact au TITRE PÉRIMÉ : la dernière relecture d'employeur ne l'a PAS
    // retrouvé (« Non retrouvé », daté) — ce n'est pas un départ prouvé, la fonction garde son libellé. Personne
    // SIMULÉE (profil `demo-bellum-`), jamais un dirigeant réel ; rang le plus bas, aucune coordonnée.
    {
      full_name: 'Mathilde Garnier',
      photo_url: null,
      title: 'Responsable exploitation des applications billettique',
      entity: 'SNCF Voyageurs',
      family: 'Digital',
      decision_role: 'influencer',
      priority: 5,
      email: null,
      phone: null,
      linkedin_url: 'https://www.linkedin.com/in/demo-bellum-mathilde-garnier',
      profile_summary:
        'Contact ancien du dossier : la dernière relecture d’employeur ne l’a pas retrouvée. Son titre n’est plus confirmé, sans que son départ soit établi.',
      why_contact:
        'À revérifier avant toute prise de contact : la fiche garde la date de la relecture, pas une conclusion.',
      email_message: null,
      linkedin_message: null,
      contact_score: 10,
      seniority: 'confirme',
      lifecycle_state: 'identite_verifiee',
      key_points: ['Non retrouvée à la dernière relecture d’employeur'],
      employment_check: { state: 'not_found', checked_days_ago: 14 },
    },
  ],
  attackAngles: [
    {
      title: 'Industrialiser un cas d’usage issu des travaux de recherche',
      description:
        'Les partenariats académiques cadrent des cas d’usage que personne n’exploite. Le sponsor est identifié — la direction du numérique porte la chaire — et le travail restant est exactement celui d’une ESN.',
      entry_point: 'Responsable data et innovation — direction du numérique',
      is_recommended: true,
      rank: 1,
    },
    {
      title: 'Renfort sur un programme de refonte déjà doté',
      description:
        'Des postes ouverts sur plusieurs entités : un besoin publié est un besoin arbitré, il n’y a qu’à le servir plus vite que le recrutement.',
      entry_point: 'Responsable de programme de refonte applicative',
      is_recommended: false,
      rank: 2,
    },
    {
      title: 'Diagnostic d’observabilité sur les applications voyageurs',
      description:
        'Une indisponibilité devient publique en quelques heures : un diagnostic borné avec plan de remédiation priorisé se justifie de lui-même.',
      entry_point: 'Directeur technique — entité numérique voyageurs',
      is_recommended: false,
      rank: 3,
    },
  ],
  actionPlan: {
    strategy_type: 'land_and_expand',
    strategy_justification:
      'Une entité, un besoin déjà publié, une mission livrée — puis se servir de cette mission comme de la référence interne qui ouvre la deuxième entité.',
    weeks: sncfPlanPhases,
  },
}

/**
 * Le PROPRIÉTAIRE de la salle de démonstration — le commercial que le visiteur
 * incarne le temps de sa visite.
 *
 * Il vit dans le jeu de données pour deux raisons.
 *
 * 1. Une salle du pool n'avait PAS de nom du tout : `DemoPoolService` crée le
 *    profil avec sa seule adresse, et le pied de la barre latérale retombait
 *    sur « Utilisateur » — le repli honnête d'un profil sans identité.
 * 2. Le 28/08, sur le lien public, une salle affichait « [supprimé]
 *    [supprimé] » : un visiteur avait ouvert Réglages › Confidentialité et
 *    supprimé le compte PROPRIÉTAIRE de la salle. L'anonymisation RGPD a fait
 *    exactement son travail ; ce qui manquait, c'est que la salle continuait
 *    d'être servie sans identité, et que rien ne la rétablissait jamais —
 *    `profiles` n'est purgée par aucune des trois listes, parce que c'est
 *    l'identité et non du contenu.
 *
 * Le nom est FICTIF, comme le reste du jeu, et il appartient à l'ESN fictive de
 * la démonstration (Bellum Conseil — voir {@link DEMO_RAG_DOCUMENTS}). Il vit
 * ICI, à un seul endroit : le semis l'écrit, la réparation d'une salle le
 * rétablit, et personne ne le génère.
 */
export const DEMO_OWNER = {
  first_name: DEMO_PERSONA_FIRST_NAME,
  last_name: 'Lorquin',
  /**
   * L'adresse AFFICHÉE de la propriétaire de la salle (Équipe, /team). Le profil de
   * la salle appartient à un compte du pool, donc `profiles.email` porte l'adresse
   * d'un VRAI compte : elle ne sort jamais d'une salle démo (recette 14/10/2026).
   * Domaine `.test`, comme les autres adresses du jeu.
   */
  email: 'maelle.lorquin@exemple.test',
  /**
   * LE FUSEAU DE LA SALLE (décision Louis, 14/09/2026 — « ajouter un fuseau par
   * utilisateur »). Réglages › Profil › Identité porte maintenant ce réglage :
   * sans semis, un prospect y verrait un champ à remplir et non un profil
   * renseigné.
   *
   * `Europe/Paris` parce que c'est VRAI de l'ESN fictive de la démonstration
   * (Bellum Conseil, dont les comptes et les besoins sont français) — ce n'est
   * pas la copie du défaut du produit, c'est le fuseau de cette ESN-là.
   *
   * ⚠️ La salle n'adopte JAMAIS le fuseau du visiteur : elle est prêtée à
   * quelqu'un d'autre toutes les trente minutes, et un fuseau écrit par le
   * visiteur précédent serait lu par le suivant. Un visiteur PEUT le changer
   * pendant son bail — c'est le geste qu'on veut lui faire faire — et
   * `restoreOwnerIdentity` le remet à cette valeur au bail suivant, exactement
   * comme le prénom juste au-dessus.
   */
  timezone: 'Europe/Paris',
} as const

/**
 * #3238.8 — les niveaux de séniorité que la salle « vend », seul réglage du
 * portefeuille d'offre semé : le portefeuille n'est lu en démo que pour croiser
 * la séniorité cherchée par une offre d'emploi (Découvrir) avec ce que la
 * société place. Le LEXIQUE reste à ses défauts (aucune surcharge) : le
 * vocabulaire PAR DÉFAUT du produit, raison de `demo-coverage.ts`, est intact.
 * `junior` est omis à dessein : la démo montre les deux rendus (« niveau que
 * tu places » / « niveau que tu ne places pas »).
 */
/**
 * #2927 (#2159.54/.55) — « MES CONTACTS PERSONNELS » : deux contacts importés en portée Personnel sur Société
 * Générale. Ils ne figurent dans AUCUNE liste d'équipe (table à part) : la salle montre la section « visibles par
 * toi seul » remplie, jamais un écran vide devant un prospect (craft rule n°9).
 */
export const DEMO_PERSONAL_CONTACTS = [
  {
    account: 'Société Générale',
    full_name: 'Clémence Aubry',
    title: 'Responsable achats prestations IT',
    email: 'clemence.aubry@exemple.test',
  },
  {
    account: 'Société Générale',
    full_name: 'Hugo Delmas',
    title: 'Ancien collègue — directeur de programme',
    email: 'hugo.delmas@exemple.test',
  },
] as const

/**
 * Théo B c3-imports-sources.R4 — l'HISTORIQUE DES IMPORTS de la salle (craft rule n°9) : deux imports TERMINÉS, jamais
 * un import « en cours » ou « interrompu » (leurs parts ne sont plus au stockage : « Reprendre » serait un faux geste).
 * Les noms de fichiers sont ceux qu'un commercial ESN dépose vraiment ; les lignes écartées portent leur raison, comme
 * en production. Rien ici ne nomme un fournisseur.
 */
export const DEMO_IMPORT_HISTORY = [
  {
    filename: 'Contacts salon Data Paris.csv',
    type: 'contact',
    format: 'csv',
    daysAgo: 1,
    totalRows: 214,
    imported: 198,
    breakdown: { contact: { created: 198, matched: 9, duplicates: 3, rejected: 4, toReconcile: 0 } },
    issues: [
      { row: 12, kind: 'duplicate', reason: 'duplicate', label: 'Camille Duval' },
      { row: 57, kind: 'duplicate', reason: 'duplicate', label: 'Claire Vasseur' },
      { row: 130, kind: 'duplicate', reason: 'duplicate', label: 'Alex Martin' },
      { row: 33, kind: 'rejected', reason: 'missing_required_field', label: null },
      { row: 96, kind: 'rejected', reason: 'missing_required_field', label: null },
      { row: 141, kind: 'rejected', reason: 'missing_required_field', label: null },
      { row: 208, kind: 'rejected', reason: 'missing_required_field', label: null },
    ],
  },
  {
    filename: 'Comptes grands groupes 2026.xlsx',
    type: 'account',
    format: 'xlsx',
    daysAgo: 5,
    totalRows: 120,
    imported: 112,
    breakdown: { account: { created: 112, matched: 0, duplicates: 0, rejected: 8, toReconcile: 0 } },
    // #5223 — UN classeur, DEUX feuilles lues par le même dépôt : le bilan se ventile par feuille (la somme est celle du job).
    sheets: [
      { name: 'Grands groupes', totalRows: 80, created: 76, rejected: 4 },
      { name: 'ETI', totalRows: 40, created: 36, rejected: 4 },
    ],
    issues: [
      { row: 9, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'Grands groupes' },
      { row: 14, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'Grands groupes' },
      { row: 22, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'Grands groupes' },
      { row: 41, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'Grands groupes' },
      { row: 58, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'ETI' },
      { row: 77, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'ETI' },
      { row: 90, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'ETI' },
      { row: 113, kind: 'rejected', reason: 'missing_required_field', label: null, sheet: 'ETI' },
    ],
  },
] as const

export const DEMO_SOLD_SENIORITY_LEVELS = ['confirme', 'senior'] as const

/**
 * LE PROFIL ESN DE « BELLUM CONSEIL » — #1921 (13/09/2026, Louis).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PROFIL EXISTE MAINTENANT, ET PAS AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * La raison d'origine de `esn_profiles` vide — « c'est l'onboarding qui le
 * remplit » — tenait tant qu'un visiteur de la salle passait PAR l'onboarding.
 * Depuis que la salle sème `user_onboarding_state` en `completed` (même lot),
 * plus personne n'y passe : la raison est devenue fausse, pas seulement
 * datée. Sans ce profil, la carte « Ton profil » de `/welcome` affichait
 * « À compléter » sur ses quatre lignes à un prospect qui vient d'atteindre
 * un écran présenté comme le fruit d'un questionnaire déjà rempli.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RIEN D'INVENTÉ QUI NE SOIT DÉJÀ VRAI AILLEURS DANS LE JEU DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn_name` REPREND « Bellum Conseil » — la MÊME ESN fictive que partout
 * ailleurs dans la salle ({@link DEMO_RAG_DOCUMENTS}, {@link DEMO_LEGAL_ENTITY},
 * le docblock de {@link DEMO_CONSULTANTS}), jamais un second nom inventé ici.
 * Le reste se LIT sur le banc et les dossiers déjà seedés, pas composé à côté :
 *  - `consultant_size` ('1-10') compte les sept lignes de {@link DEMO_CONSULTANTS} ;
 *  - `staffing_model` reflète leur répartition réelle (six CDI, un freelance) ;
 *  - `expertise_areas` reprend les TROIS familles que leurs stacks couvrent
 *    réellement — Cloud & Infrastructure (Kubernetes/Terraform/AWS), Data &
 *    IA (MLOps/Kubeflow/Airflow), Cybersécurité & Conformité (sécurité
 *    applicative/conformité) — et rien d'autre : positionner une quatrième
 *    famille sans profil derrière ferait mentir le vivier ;
 *  - `positioning` (« 3-5 domaines avec références solides ») décrit
 *    exactement ces trois familles, chacune avec une référence CV réelle ;
 *  - `target_sectors` et `target_company_types` couvrent les dossiers de
 *    {@link DEMO_DOSSIERS} — banque (Société Générale, Groupe BPCE), transport
 *    ferroviaire (SNCF) — et d'autres secteurs ciblés, déclarés mais sans
 *    dossier : c'est l'état honnête d'une ESN qui cible plus large que son
 *    portefeuille actuel ;
 *  - `sales_team_size` (« seul, fondateur/indépendant ») et `main_sales_pain`
 *    tiennent la même doctrine que partout ailleurs dans la salle : un seul
 *    occupant, qui prospecte, positionne et livre — une salle de démonstration
 *    n'est le compte de personne d'autre.
 *
 * ⚠️ `offer_portfolio` (le LEXIQUE de l'espace, D17) n'est PAS ici, et ne doit
 * jamais l'être : la raison documentée dans `demo-coverage.ts` — montrer le
 * vocabulaire PAR DÉFAUT du produit, celui que le prospect doit reconnaître —
 * n'a rien à voir avec l'identité de l'ESN et reste entièrement valide.
 */
/**
 * #3754.6 — les postes que l'ESN de la salle vise, chacun avec son niveau décideur (1 signataire … 4 influenceur).
 * Semés dans `esn_target_personas` (`DemoSeedService.seedTargetPersonas`) : un compte de la salle (Société Générale)
 * montre alors l'ORDRE et la RAISON (« Niveau 1 pour vous — signataire »). Des intitulés sans contact correspondant
 * restent dans la liste : un poste visé n'est pas un contact trouvé.
 * ⚠️ Pas de « DSI », « directeur technique » ni « Chief Data Officer » ici : Société Générale compte une dizaine de DSI/CIO/CDO,
 * qui rempliraient SEULS les dix lignes du chemin recommandé (10/10 « Niveau 1 », recette du 07/10). Le test
 * `demo-target-personas.spec.ts` passe par `rankAccountContacts` — ce que l'écran affiche — et exige plusieurs niveaux
 * ET un contact sans niveau.
 */
export const DEMO_TARGET_PERSONAS: readonly { category: string; title: string; decision_level: 1 | 2 | 3 | 4 }[] = [
  { category: 'Direction générale', title: 'Directeur général délégué', decision_level: 1 },
  { category: 'Gouvernance', title: 'Directeur de la gouvernance des données', decision_level: 3 },
  { category: 'Data & IA', title: 'Responsable data & intelligence artificielle', decision_level: 2 },
  { category: 'Transformation', title: 'Directeur de la transformation digitale', decision_level: 2 },
  { category: 'Achats', title: 'Responsable achats informatiques', decision_level: 3 },
  { category: 'Sécurité', title: 'Responsable sécurité applicative', decision_level: 3 },
  { category: 'Architecture', title: 'Architecte du système d’information', decision_level: 4 },
  { category: 'Data & IA', title: 'Responsable de la plateforme de données', decision_level: 4 },
]

export const DEMO_ESN_PROFILE = {
  esn_name: 'Bellum Conseil',
  consultant_size: '1-10',
  sales_team_size: 'Je suis seul (fondateur / indépendant)',
  positioning: 'Multi-compétences ciblées - 3-5 domaines avec références solides',
  staffing_model: 'Principalement CDI + quelques freelances ponctuels',
  expertise_areas: [
    'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
    'Data & Intelligence Artificielle',
    'Cybersécurité & Conformité',
  ],
  target_sectors: [
    'Banque de détail & Banque privée',
    'Aéronautique & Défense',
    'Tech & Startups / Scale-ups',
    'Transport ferroviaire & Aérien',
  ],
  target_company_types: ['CAC40 / SBF120 (grands comptes)', 'Startups & Scale-ups'],
  // #4556.4 — l'Occitanie AUSSI (Airbus, Blagnac) : sans elle la fiche cadrée sur l'Occitanie classait ses dix
  // contacts « Hors zone » sans zone nommée. Paris reste la première zone (là où Bellum Conseil intervient).
  geo_zones: ['Paris & Île-de-France', 'Toulouse & Occitanie'],
  main_sales_pain: 'Gérer mon temps entre prospection, delivery et management',
  /**
   * Lot 26 (#2038, #2039, #2040, #2041) — neuf colonnes ADDITIVES, mêmes
   * règles : rien qui ne se lise déjà ailleurs dans la salle.
   *  - `service_types`/`service_types_proven` : la régie porte les six CDI et
   *    le freelance du banc ; le conseil accompagne le cadrage des cinq
   *    dossiers — les deux sont VENDUS, donc « prouvés ».
   *  - `service_types_desired` : l'audit n'est encore livré nulle part dans
   *    la salle — une ambition, jamais confondue avec les deux ci-dessus.
   *  - `reference_sectors` : sous-ensemble de `target_sectors` qui a un
   *    dossier RÉEL et nommé dans {@link DEMO_DOSSIERS} — Société Générale
   *    (banque) et SNCF (transport ferroviaire).
   *  - `case_study_results`/`client_testimonials` : ancrés sur ces deux
   *    mêmes comptes, jamais un troisième nom inventé.
   *  - `staffing_modes` traduit « quelques freelances ponctuels » en mode
   *    explicite ; `profile_validation_methods`/`contractual_constraints`
   *    restent plausibles pour une boutique de sept consultants.
   *  - `expertise_no_concrete_proof` (#2039.6, épopée #2880) : « Cybersécurité
   *    & Conformité » est déclarée dans `expertise_areas` ci-dessous mais
   *    n'a NI dossier ({@link DEMO_DOSSIERS}) NI résultat/témoignage cité
   *    au-dessus — l'état honnête, cohérent avec le reste de la salle.
   *  - `expertise_client_reference` (#2039.2, épopée #2880) : les DEUX
   *    autres familles déclarées — Cloud & Infrastructure, Data & IA — sont
   *    précisément celles que `case_study_results`/`client_testimonials`
   *    montrent déjà (Société Générale, SNCF) ; jamais un troisième nom
   *    inventé, jamais la même famille que `expertise_no_concrete_proof`.
   *  - `expertise_partner` / `expertise_talent_pool` (#2039.4/.5, épopée
   *    #2880, vague G lot g10) : « Cloud & Infrastructure » — la famille
   *    dont le libellé nomme déjà les partenaires (AWS, Azure, GCP), cohérent
   *    avec `partner_relationship` ci-dessous, et dont {@link DEMO_CONSULTANTS}
   *    porte un profil RÉEL immédiatement disponible (Camille Roussel,
   *    Kubernetes/Terraform/AWS) — un vivier, pas un chiffre inventé. Une
   *    même expertise peut reposer sur plusieurs fondements à la fois : ce
   *    n'est jamais un « ou bien ».
   *  - `expertise_personal_experience` (#2039.3, épopée #2880, vague G lot
   *    g10) : « Data & Intelligence Artificielle » — la troisième famille
   *    déclarée, jamais réutilisée pour les deux fondements ci-dessus,
   *    pour ne pas laisser croire que toutes les expertises reposent sur
   *    tout à la fois.
   */
  service_types: ['Régie', 'Conseil'],
  service_types_proven: ['Régie'],
  service_types_desired: ['Audit'],
  // #2041.1 — DEUX secteurs prioritaires, et c'est le chiffre qui compte : la
  // relance se déclenche STRICTEMENT au-delà de `PRIORITY_SECTORS_NUDGE_THRESHOLD`
  // (2). La salle montre donc le bon état — un choix TENU — et non une ESN qui
  // se fait reprendre devant un prospect. Les deux sont ceux qui portent un
  // dossier RÉEL dans {@link DEMO_DOSSIERS}, comme `reference_sectors` : une
  // priorité sans preuve à côté aurait été une troisième vérité sur la même
  // page. Voir la bulle « trop de secteurs prioritaires » dans
  // `demo-coverage.ts` pour ce que le visiteur peut déclencher lui-même.
  priority_sectors: ['Banque de détail & Banque privée', 'Transport ferroviaire & Aérien'],
  reference_sectors: ['Banque de détail & Banque privée', 'Transport ferroviaire & Aérien'],
  case_study_results: ['Mission Société Générale reconduite après douze mois'],
  client_testimonials: ['« Une équipe technique solide et autonome » — RSSI, SNCF'],
  // #2961 (#2302.28) — les MÊMES deux comptes que `case_study_results`/
  // `client_testimonials` ci-dessus, nommés seuls : jamais un troisième nom
  // inventé.
  reference_accounts: ['Société Générale', 'SNCF'],
  expertise_no_concrete_proof: ['Cybersécurité & Conformité'],
  expertise_client_reference: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)', 'Data & Intelligence Artificielle'],
  expertise_personal_experience: ['Data & Intelligence Artificielle'],
  expertise_partner: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'],
  expertise_talent_pool: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'],
  staffing_modes: ['Recrutement après besoin'],
  profile_validation_methods: ['Entretien technique interne'],
  contractual_constraints: ['Préavis de fin de mission'],

  /**
   * Lot « la parité démo du questionnaire » (15/09/2026) — LES 76 COLONNES
   * AJOUTÉES ICI.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE TROU MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * Le bloc ci-dessus (10 champs) est tout ce que `seedEsnProfile` semait :
   * le questionnaire porte aujourd'hui 89 clés de réponse sur 56 questions
   * (`esnAnswersSchema`, `packages/contracts/src/schemas/onboarding.ts`), et
   * l'ancienne garde `demo-coverage.spec.ts` ne voyait que la TABLE
   * `esn_profiles` — verte pendant que 37+ colonnes neuves restaient vides.
   * `demo-esn-profile-columns-coverage.spec.ts` descend la garde au niveau
   * COLONNE et fait échouer la CI tant que chacune n'a pas de réponse écrite.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * RIEN D'INVENTÉ QUI NE SE LISE DÉJÀ AILLEURS
   * ─────────────────────────────────────────────────────────────────────────
   * Toutes les valeurs à catalogue fermé sont copiées VERBATIM depuis le
   * contrat qui les possède (`onboarding/answers-*.ts`,
   * `profile-questionnaire.ts`) — jamais retapées. Le reste tient la même
   * narration que le bloc Temps 1 : Maëlle Lorquin ({@link DEMO_OWNER}),
   * fondatrice seule, sept consultants (six CDI, un freelance ponctuel,
   * {@link DEMO_CONSULTANTS}), trois comptes actifs ({@link DEMO_DOSSIERS} :
   * Société Générale, Groupe BPCE, SNCF), vente
   * majoritairement DIRECTE, complétée d'un second canal partenaire
   * (« Partenaires ESN », #2067.2 — jamais de rang 2/rang 3, ni de cabinets).
   * `frein_attempted`/`frein_stopped` reprennent MOT POUR MOT
   * `DEMO_PROFILE_CONTEXT.coachingInsights` (juste plus bas dans ce
   * fichier) — même personne, même diagnostic, les deux objets ne se
   * contredisent pas.
   *
   * Sept colonnes de la table restent VIDES À DESSEIN, avec leur raison
   * écrite dans `DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE`
   * (`demo-coverage.ts`) : `offer_portfolio` (D17, lexique distinct de
   * l'identité ESN) ; `placed_roles`, `known_competitors`,
   * `support_preferences`, `target_accounts_maturity`, `social_proof_level`
   * (colonnes sans AUCUN lecteur produit — cf. le docblock de
   * `TEMPS2_ANSWER_KEYS` dans `onboarding.ts`) ; `outreach_channels` (lue
   * DÉFENSIVEMENT par `sales_context.py`, mais `esnAnswersToProfileData` ne
   * la fait jamais parvenir jusque-là — la colonne n'est atteignable par
   * AUCUN profil réel aujourd'hui) ; `public_sector_practice`,
   * `shared_data_scope` (questions du profil progressif dont le PRÉDICAT DE
   * BRANCHEMENT — `targetsPublicSector`, `worksAlone` dans
   * `profile-questionnaire.ts` — les masque pour CE profil précis : Bellum
   * Conseil ne cible pas le secteur public, et sa fondatrice est seule). Les
   * remplir quand même ferait mentir la narration que le reste de ce profil
   * raconte.
   *
   * #2067.2 (décision Louis du 18/09/2026 nuit) — `partner_relationship`,
   * `partners_regular_count`, `partners_occasional_count` étaient masquées
   * ici par ce même `worksThroughPartners` (Bellum Conseil ne déclarait aucun
   * canal partenaire) : elles sont désormais SEEDÉES, juste au-dessous de
   * `go_to_market_channels` dans ce bloc, trace `// #2067.2 — démo :
   * partenaires semés`.
   */
  // Temps 2 — le complément de profil.
  decision_maker_personas: [
    "DSI / Directeur des Systèmes d'Information",
    'CTO / Directeur Technique',
    'RSSI / Directeur Cybersécurité',
    'Responsable Infrastructure & Production',
  ],
  avg_sales_cycle: '3 à 6 mois',
  avg_tjm: '550-700',
  client_references: ['Migration cloud pour Société Générale', 'Audit cybersécurité pour SNCF'],
  no_go_sectors: ['Retail & Grande distribution', 'BTP & Construction'],

  // Portefeuille d'offre et placement.
  offer_domain: 'esn_it',
  offer_domains: ['CLOUD_DEVOPS_SRE', 'DATA_ENGINEERING', 'CYBER_IAM_GRC', 'AI_ML_GENAI'],
  recruits_for_clients: 'no',

  // Maturité, effectif réel — lot L15.
  esn_maturity_situation: 'Activité stabilisée',
  active_clients_band: '1 à 5 clients actifs',
  revenue_recurrence: 'Un mix de récurrent et de one-shot',
  client_concentration_risk: 'Un client pèse fort mais reste minoritaire',
  company_growth_goal: 'Développer un nouveau secteur ou une nouvelle offre',
  consultants_managed_by_user_band: '6 à 15 consultants',
  available_consultants_band: 'Quelques consultants disponibles en intercontrat',
  // #2035.1 / #2035.2 — le geste empêché, rendu concret : l'ESN de démo
  // (`consultant_size: '1-10'`) appartient à un groupe bien plus grand, et sa
  // BU a son propre effectif intermédiaire — trois chiffres, trois populations.
  consultant_size_group_band: '200-500',
  consultant_size_business_unit_band: '10-30',
  // #2035.8 — la démonstration la plus honnête : `consultant_size` a été
  // répondu il y a 140 jours (bien au-delà du seuil de 90,
  // `EFFECTIF_FRESHNESS_STALE_AFTER_DAYS`, @bellum/contracts), donc PÉRIMÉ —
  // l'écran doit le signaler, pas l'afficher comme si c'était d'aujourd'hui.
  // #2045.15 — même colonne, même honnêteté pour le réseau : `former_clients_count_band`
  // (ci-dessous) a été répondu début janvier, bien au-delà du seuil de 180
  // jours (`RESEAU_FRESHNESS_STALE_AFTER_DAYS`) — l'écran doit le signaler.
  effectif_observed_at: {
    consultant_size: '2026-05-01T00:00:00.000Z',
    former_clients_count_band: '2026-01-01T00:00:00.000Z',
  },

  // Vivier de consultants déclaré — #2046.
  talent_pool_identified_band: '6-15',
  // Théo O onboarding-catalogue — trois réponses MISES DE CÔTÉ (#2027, les quatre états d'incertitude) : le
  // catalogue de l'onboarding montre « Tes réponses à reprendre » dès l'ouverture de la salle, jamais un écran vide.
  talent_pool_qualified_band: 'Je ne sais pas encore',
  talent_pool_available_band: '1-5',
  talent_pool_availability_recency_band: 'Je préfère répondre plus tard',
  talent_pool_avg_tjm_band: '550-700',
  talent_pool_mobility_band: 'Mobiles en France',
  talent_pool_consent_status: 'partiel',
  talent_pool_other_processes_band: 'À vérifier avec mon équipe',
  talent_pool_engagement_reality_band: 'Une partie seulement',
  talent_pool_revalidation_frequency: 'mensuelle',
  talent_pool_state_interested_band: '6-15',
  talent_pool_state_available_band: '1-5',
  talent_pool_state_secured_band: '1-5',
  talent_pool_state_presentable_band: '0',

  // Base de clients déclarée — #2047. `client_base_active_accounts_band`
  // n'existe pas : `active_clients_band` ci-dessus porte déjà cette réponse.
  client_base_missions_ongoing_band: '1-5',
  client_base_missions_completed_band: '6-15',
  client_base_renewals_band: 'quelques_uns',
  client_base_satisfaction_band: 'mesuree_bonne',
  client_base_referrals_band: 'quelques_unes',
  client_base_rex_band: 'parfois',
  client_base_case_studies_band: '1-5',
  client_base_cross_sell_band: 'tente_occasionnellement',
  client_base_deadlines_band: 'quelques_unes',
  client_base_followup_regularity: 'regulier',
  client_base_followup_owner: 'Le commercial du compte',

  // Canaux d'entrée et unités comparables — lot L19.
  entry_channels_used: [
    'Réseau personnel et anciens clients',
    'Appels sortants',
    'Réseaux sociaux professionnels',
    "Appels d'offres et consultations",
    'Consultants en mission',
  ],
  entry_channels_measured: ['Appels sortants', 'Réseaux sociaux professionnels'],
  entry_channels_last_starts: ['Réseau personnel et anciens clients', 'Consultants en mission'],
  entry_channels_time_split: ['Appels sortants', 'Réseaux sociaux professionnels'],
  // #2048.13 — la période sur laquelle portent les chiffres, canal par canal.
  // L'ESN de démonstration mesure DEUX canaux (ci-dessus) mais ne sait dater que
  // le premier : connaître un volume et connaître sa fenêtre de temps sont deux
  // choses, et les réseaux sociaux professionnels restent ici un ordre de
  // grandeur non daté — jamais une période inventée à la place de l'utilisateur.
  entry_channels_period: ['Appels sortants'],
  // #2045.1/.2/.4/.7 — le réseau personnel pour quatre portes ci-dessus.
  former_clients_count_band: '6-15',
  former_colleagues_count_band: '1-5',
  partners_count_band: '1-5',
  referrers_count_band: '1-5',
  activity_measures_tracked: ['Comptes travaillés', 'Rendez-vous tenus', 'Démarrages de mission'],
  activity_reference_period: 'Le trimestre écoulé',

  // Client idéal, interlocuteurs, chemins d'accès — lot L17 (#2042, #2043,
  // #2044). Colonnes apparues sur `esn-profile.entity.ts` APRÈS que ce lot
  // ait branché de main : `demo-esn-profile-columns-coverage.spec.ts` (qui
  // lit l'entité sur le disque, pas une liste recopiée) les a nommées comme
  // trou d'intégration au moment de la fusion des quatre branches de la
  // vague. Valeurs cohérentes avec le reste de la narration : deux comptes
  // grands comptes réglementés (Société Générale, SNCF), cycle 3 à 6 mois
  // et panier 30-75 k€ déjà posés au Temps 2/profil progressif,
  // décideurs opérationnels (DSI/CTO/RSSI), dépendance au réseau personnel
  // déjà nommée comme frein commercial.
  // Recette 21/10 U.4 — ces champs, avec `priority_sectors`, `no_go_sectors`, `target_company_types`, `geo_zones`,
  // `company_locations` et `decision_maker_personas`, sont ce que « Appliquer ma cible » (Découvrir) lit : le panneau
  // est plein en démo sans rien semer de plus. `ideal_client_structure` (groupe coté) reste volontairement hors table :
  // il se NOMME sous « Aussi dans ta cible ».
  ideal_client_size: ['500 à 5 000 salariés', 'Plus de 5 000 salariés'],
  ideal_client_structure: ['Groupe coté / grand compte'],
  ideal_client_maturity: ['Client établi, activité stable'],
  ideal_client_territory: ['Clients basés en Île-de-France'],
  ideal_client_accessibility: 'Accessible via un intermédiaire (partenaire, recommandation)',
  ideal_client_max_sales_cycle: '3 à 6 mois',
  ideal_client_min_deal_size: '10 000 à 50 000 €',
  ideal_client_referencement_constraints: ['Accord-cadre ou marché existant requis'],
  ideal_client_current_state: ['Déjà un client connu', 'Correspond au profil théorique'],
  real_response_level: 'Niveau management intermédiaire',
  budget_validator: 'Les achats, après validation technique',
  access_orienteur: 'Le contact opérationnel du moment',
  entry_channels_dependency: ['Réseau personnel et anciens clients'],
  entry_channels_prerequisites: [
    'Référence vérifiable sur un compte comparable',
    'Habilitation ou accord de confidentialité',
  ],
  entry_channels_saturation: ['Consultants en mission'],

  // Capacité réelle et continuité des dossiers — lot L19.
  weekly_sales_time_declared: '5 à 10 heures par semaine',
  weekly_sales_time_protected: '2 à 5 heures par semaine',
  weekly_sales_time_residual: 'Moins de 2 heures par semaine',
  workload_variability: 'Elle est imprévisible, un imprévu peut manger la semaine',
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  weekly_sales_time_slots: ['Tôt le matin, avant 9 h', 'En fin de journée, après 16 h'],
  competing_workloads: [
    'Le delivery et le suivi des consultants en poste',
    'L’encadrement et le management de l’équipe',
  ],
  dossier_continuity_practices: ['Un suivi tenu à jour dans le CRM', 'Une prochaine action datée sur chaque compte'],
  dossier_continuity_breaks: ['Une activité s’interrompt sans qu’on le voie'],

  // Cartographie de l'outillage — #2054.
  tooling_crm: 'Moi seul',
  tooling_ats: "Nous n'avons pas cet outil",
  tooling_erp: "Nous n'avons pas cet outil",
  tooling_mailbox: 'Moi seul',
  tooling_calendar: 'Moi seul',
  tooling_drive: 'Moi seul',
  tooling_spreadsheet: 'Moi seul',
  tooling_enrichment: "Nous n'avons pas cet outil",
  tooling_sourcing_platform: "Nous n'avons pas cet outil",
  tooling_bi: "Nous n'avons pas cet outil",
  tooling_personal_notes: 'Moi seul',
  tooling_reference: 'Un tableur',
  tooling_reference_data: ['Les comptes et leurs interlocuteurs', 'Les besoins et les opportunités en cours'],
  tooling_reference_freshness: 'Mise à jour il y a moins d’une semaine',
  tooling_reference_confidence: 'Je vérifie les points importants',
  tooling_reference_export: 'Oui, je peux exporter moi-même',
  tooling_duplicates: 'Non, chaque information a un seul endroit',
  tooling_pain: 'Tout reste dans un tableur que je mets à jour seul, rien n’est automatisé.',
  // #4971.1 — un outil MAISON, nommé : déclaré, jamais affiché « branché » (#4971.2).
  tooling_internal_names: ['Le suivi des comptes maison'],

  // Freins commerciaux et les trois relances — #2055.
  sales_freins: [
    "Le temps : je n'ai pas le temps de prospecter",
    'La priorisation : je ne sais pas par quoi commencer',
  ],
  frein_attempted: 'Bloquer un créneau fixe chaque semaine pour la prospection.',
  frein_stopped: 'Le créneau saute dès qu’une mission démarre.',
  frein_stopped_reason: 'Le delivery et le management prennent le pas dès qu’un client presse.',

  // Profil progressif — restitution V2 §21-30 (dialogue « Ton profil commercial »).
  user_role: 'Fondateur / CEO',
  role_tenure: '5 ans et plus',
  industry_tenure: '10 ans et plus',
  individual_goal: 'Ouvrir de nouveaux comptes',
  monthly_target: '2-3 comptes',
  // #2032.10 — les fonctions RÉELLEMENT exercées sur le parcours, posées par la
  // question qui suit `user_role` (`profile-questionnaire.ts`, `when:
  // answers.user_role`, satisfait ici). Les trois choisies sont exactement ce
  // que `main_sales_pain` décrit déjà — « gérer mon temps entre prospection,
  // delivery et management ». Lue par le prompt `bellum_profiler.py` (section
  // « La personne qui répond ») et par `esnAnswersToProfileData`
  // (`analysis.ts` → `sellerFunctionsPracticed`), jamais par un moteur de
  // notation (GA-338).
  role_functions_practiced: ['Vente / prospection', 'Delivery / conseil en mission', 'Management / direction'],
  // #2052 (lot L19) — les objectifs commerciaux NOMMÉS, en complément du
  // champ historique ci-dessus. Trois niveaux d'engagement DIFFÉRENTS,
  // volontairement : un objectif tenu (`new_accounts`), un repère de travail
  // (`meetings`, pour se situer sans s'y engager) et une ambition qualitative
  // (`structuring`, sans chiffre — portée par `note`).
  esn_objectives: [
    {
      kind: 'new_accounts',
      value: 3,
      unit: 'comptes',
      period: 'monthly',
      horizon: null,
      commitmentLevel: 'objective',
      source: 'human',
      observedAt: '2026-09-01T00:00:00.000Z',
      note: null,
    },
    {
      kind: 'meetings',
      value: 12,
      unit: 'rendez-vous',
      period: 'monthly',
      horizon: null,
      commitmentLevel: 'benchmark',
      source: 'human',
      observedAt: '2026-09-01T00:00:00.000Z',
      note: null,
    },
    {
      kind: 'structuring',
      value: null,
      unit: null,
      period: 'quarterly',
      horizon: 'Fin T4 2026',
      commitmentLevel: 'ambition',
      source: 'human',
      observedAt: '2026-09-01T00:00:00.000Z',
      note: "Mettre en place un CRM à jour pour toute l'équipe",
    },
  ],
  company_age: '6-10 ans',
  company_size: '6-10',
  // #2015.7 — la filiation déclarée : Bellum Conseil est une structure
  // indépendante, cohérent avec sa taille (6-10) et son âge (6-10 ans) — un
  // groupe ou une filiale porterait typiquement un effectif ou une ancienneté
  // différents.
  company_group_structure: 'Entreprise indépendante',
  // #2053.4 — la visibilité déclarée sur le délai d'encaissement : Bellum
  // Conseil le suit déjà dans BellumAI, donc le délai lui-même (conditionné
  // par `tracksPaymentDelay`) est aussi seedé juste en dessous.
  payment_delay_visibility: 'Oui, ici (Missions › Encaissements)',
  payment_delay_band: '45-60 jours',
  consultants_on_mission: '6-15',
  consultants_in_pipe: '1-5',
  team_overlap: 'Jamais',
  ramp_up_capacity: '1-2 semaines',
  avg_deal_size: '30-75 k€',
  // #2053.3 — le coût MENSUEL de l'intercontrat, DISTINCT de
  // `available_consultants_band` (un effectif, plus bas dans cet objet).
  intercontrat_cost: '5-10 k€',
  target_margin: '21-30 %',
  portfolio_size: '1-5',
  accounts_relationship_status: 'Mixte',
  regulated_sector_readiness: 'Références bancaires ou assurantielles citables',
  // #2067.2 — démo : partenaires semés (décision Louis 18/09 nuit). Un
  // second canal, EN PLUS du direct : `worksThroughPartners`
  // (`profile-questionnaire.ts`) s'active désormais, donc les trois réponses
  // ci-dessous cessent d'être masquées — l'audit (« Ta charge active,
  // arbitrée », #2067.2) rend « partenaires réguliers » ET leur nombre au
  // lieu de « aucun partenaire ». Cohérent avec l'écosystème déjà semé sur le
  // compte FICTIF ({@link DEMO_DOSSIERS}, `partners` : Sopra Steria en
  // rang 1 déclaré, mc2i en rang 2) — Bellum Conseil vend
  // majoritairement en direct mais travaille aussi avec des partenaires.
  go_to_market_channels: ['Direct client final', 'Partenaires ESN'],
  partner_relationship: 'Partenaires réguliers, contrats en place',
  partners_regular_count: '2',
  partners_occasional_count: '1',
  // #2036.9 — l'ambition territoriale DÉCLARÉE, jamais une zone déjà active :
  // `geo_zones` vaut « Paris & Île-de-France » (là où Bellum Conseil intervient
  // aujourd'hui), donc la zone SOUHAITÉE est une autre — sinon la démonstration
  // effacerait à l'écran la distinction que GA-338 tient dans le code (#2036.10 :
  // une zone souhaitée n'est jamais lue comme une capacité). Lue par le prompt
  // `bellum_profiler.py` (« Ambition territoriale déclarée »).
  growth_target_zones: ['Lyon & Auvergne-Rhône-Alpes'],
  // #2036.2 (#2847) — remote et déplacements DÉCLARÉS, distinct de `geo_zones`
  // et de `growth_target_zones` ci-dessus. Bellum Conseil est parisien
  // (`geo_zones` : « Paris & Île-de-France »), cohérent avec un remote
  // partiel plutôt qu'un remote total. Lu par le prompt `bellum_profiler.py`
  // (« Remote et déplacements déclarés »).
  remote_and_travel_scope: [
    'Remote partiel (quelques jours sur site)',
    'Déplacements ponctuels chez le client acceptés',
  ],
  // #2036.8 (#2847) — la posture territoriale DÉCLARÉE, v1 tranché sans Louis :
  // Bellum Conseil intervient déjà à Paris (`geo_zones`, capacité avérée) et
  // vise Lyon (`growth_target_zones` ci-dessus, une intention) — les DEUX
  // postures sont déclarées à la fois pour que la démonstration montre
  // qu'elles ne se confondent jamais dans la même valeur. Lu par le prompt
  // `bellum_profiler.py` (« Posture territoriale déclarée »).
  zone_capability_status: [
    'Je peux intervenir (capacité déjà avérée)',
    'Je souhaite développer ces zones (pas encore une capacité avérée)',
  ],
  // #3923.a — les métiers que Bellum Conseil place RÉELLEMENT (`placed_roles`),
  // cohérents avec son banc (développement, data, cloud). Lus par Découvrir
  // (`signalRelevance`) : « Développeurs Java et consultants cloud » ressort
  // « Pertinent », « Ingénieurs et techniciens propulsion nucléaire » passe
  // APRÈS les autres signaux avec « Hors métier » et sa raison.
  placed_roles: ['Développeur', 'Data', 'Cloud', 'DevOps'],
  // Théo O onboarding-couverture (22/10/2026, craft rule n°9) — un profil d'espace COMPLET en V23 : les 26 « Précisions de
  // cadrage ». Cohérent avec Bellum Conseil (cloud / data / cyber, banque et aéronautique, Paris) ; lues par le profiler
  // (`bellum_profiler.py`, « Cadrage — … »). Des déclarations : elles ne connectent aucun outil et n'autorisent aucun envoi.
  activity_nature: ['ESN spécialiste'],
  first_name: 'Alex',
  scope_level: 'Mon entreprise',
  scope_unit: 'Bellum Conseil',
  language_capabilities: ['Français', 'Anglais'],
  offer_pitch:
    'Nous renforçons les équipes cloud et data des grands comptes bancaires et aéronautiques avec des profils déjà référencés, présentables sous quinze jours.',
  priority_expertise: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'],
  skill_technos: ['Kubernetes', 'Terraform', 'SQL'],
  bench_status: 'Oui, à une date prochaine',
  recruiting_priorities: ['Confirmer les disponibilités', 'Réduire l’intercontrat'],
  commercial_limits: 'Marge visée 22 % en régie ; budget d’achat des freelances plafonné à 520 € par jour.',
  currency: 'EUR',
  target_nature: ['Clients finaux'],
  target_size: ['Grand groupe', 'ETI'],
  country_scope: ['France', 'Belgique'],
  geography_detail: 'Île-de-France en priorité, télétravail partiel au-delà.',
  no_go: 'Pas de rang 2, pas de mission hors France métropolitaine.',
  account_access: 'Accord-cadre en cours avec la Société Générale ; ancienne mission livrée chez Airbus.',
  horizon: 'Sous 60 jours',
  success_target: 'Identifier trois comptes et préparer les bons interlocuteurs.',
  data_sources: ['Portefeuille de comptes', 'Contacts et échanges', 'CV et dossiers de compétences'],
  tools: ['Tableur', 'CRM', 'Messagerie professionnelle'],
  workflow_pain: 'Relancer les devis sans retaper les mêmes informations.',
  delivery_frictions: ['Validations client', 'Factures à préparer'],
  autonomy: 'Préparer puis me faire valider les actions externes',
  context_policy: 'Avec mon activité comme contexte',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est IMPLANTÉE (siège +
  // bureaux), distinct de `geo_zones` (« Paris & Île-de-France ») qui dit où
  // elle PROSPECTE. Lue par la couche entreprise du profil à trois couches
  // (`company.locations`) et par le prompt (« Implantation »).
  company_locations: ['Paris (siège)', 'Lyon'],
  // #2060 — la question ouverte qui FERME le parcours. Cohérente avec le
  // reste du profil de démo : Bellum Conseil est un cabinet fondé et animé
  // par une seule personne (`sales_team_size` = « Je suis seul » plus haut
  // dans ce fichier), donc un vrai « non couvert par les questions » pour ce
  // profil précis. Lue verbatim par le prompt (« Ce qui n'a pas été couvert
  // par le questionnaire »), proposée en faits « à revoir », jamais en faits certains (#2060.10, renversé en partie le 11/10 — #4016 L13b).
  uncovered_activity_note:
    "Je cherche un associé commercial à temps partiel. Je n'ai encore trouvé personne, donc rien à déclarer ailleurs dans ce questionnaire. J'ouvre un point de présence à Lyon en janvier.",
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ. Bellum Conseil est semé en Business Manager qui décide le
  // staffing mais PAS la marge/facturation : la salle de démo montre donc
  // le cas normal (#2033.9 en action) ET le cas déclaré sans réponse est déjà
  // couvert par un autre compte de démo — voir `demo-coverage.ts`.
  decisions_alone: ['Envoyer une offre commerciale', 'Fixer un tarif ou une remise'],
  decisions_to_validate: ['Signer un nouveau compte client', "Inviter quelqu'un dans l'espace"],
  people_managed: ['Des Business Managers'],
  recruitment_accounts_authority: 'Je dois faire valider',
  staffing_authority: 'Je décide seul',
  // Volontairement « je n'ai pas cette responsabilité » : c'est CE champ que
  // la salle de démo montre pour prouver #2033.9 (Laura décline et le dit).
  margin_billing_authority: "Je n'ai pas cette responsabilité",
  tools_access: ['CRM', 'Messagerie professionnelle'],
  invite_authority: 'Je dois faire valider',
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial. Bellum Conseil semé avec une petite équipe pluri-
  // fonctionnelle et une coordination hebdomadaire, plausible pour une ESN
  // de sa taille.
  associates_count: '1 associé',
  recruiters_team_size: '1 recruteur',
  delivery_team_size: '6-15 personnes',
  marketing_team_size: '1 personne (temps partiel ou plein)',
  ops_team_size: '1 personne',
  team_coordination_mode: 'Réunion hebdomadaire formelle',
  weekly_calls: '21-50',
  weekly_emails: '21-50',
  weekly_linkedin: '1-20',
  sales_routine: ['Priorisation hebdo', 'Revue CRM'],
  sales_blockers: ['Peu de temps', 'Manque de profils disponibles'],
  tooling: ['Excel / Google Sheets'],
  proactivity_level: 'Me suggérer des actions',
  // #2058.2 / #2058.10 — moments acceptés et niveau de détail attendu.
  contact_windows: ['Matin (avant 12h)', 'Après-midi (12h-18h)'],
  detail_level: 'Court et dense',
  /**
   * #2006.22 — réfuté en production le 20/09 : chaque réponse s'affichait
   * avec la même coche, migrée ou confirmée. `mapRowToAnswerMeta`
   * (`answer-meta.mapper.ts`) existait déjà mais n'avait AUCUN appelant —
   * `demo-coverage.ts` le classait « vide à dessein » pour cette raison
   * précise, devenue FAUSSE une fois ce lot lui donné un appelant
   * (`GET /esn-profile/answer-status`) : reclassé SEEDÉ ici.
   *
   * Deux clés seulement, MAËLLE les a explicitement revues dans le
   * formulaire (`source: 'user'`) — le reste du profil de démonstration
   * n'a jamais été confirmé et s'affiche donc « Non confirmé », comme un
   * compte réel migré avant ce lot. `actorId: null` : l'identifiant réel
   * de {@link DEMO_OWNER} n'est connu qu'AU SEMIS (paramètre `ownerUserId`
   * de `seedEsnProfile`), jamais ici où l'objet est statique — l'inventer
   * serait une donnée fictive.
   */
  answer_meta: {
    contact_windows: {
      question: { key: 'contact_windows', label: 'profileQuestions.items.contact_windows.label', version: 1 },
      questionnaireVersion: 1,
      provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-19T09:00:00.000Z', actorId: null },
      status: 'confirmed',
      branchReason: 'personal_profile',
      consumerAreas: ['audit'],
    },
    detail_level: {
      question: { key: 'detail_level', label: 'profileQuestions.items.detail_level.label', version: 1 },
      questionnaireVersion: 1,
      provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-19T09:00:00.000Z', actorId: null },
      status: 'confirmed',
      branchReason: 'personal_profile',
      consumerAreas: ['audit'],
    },
  },
  /**
   * #2056 (appels d'offres) / #2057 (contenu) — lot « le questionnaire ne
   * demandait pas encore ces deux canaux ».
   *
   * Le bloc AO reste VIDE À DESSEIN : `pursuesRfps` (`profile-questionnaire.ts`)
   * ne s'active que sur le secteur public (`targetsPublicSector`, déjà FAUX
   * pour ce profil — CAC40/SBF120 et scale-ups, jamais l'administration) ou sur
   * `go_to_market_channels` contenant "Appels d'offres" (ici
   * `['Direct client final', 'Partenaires ESN']` depuis #2067.2 — ni l'un ni
   * l'autre n'est "Appels d'offres"). Les onze colonnes AO — les neuf
   * d'origine plus `rfp_deal_value` (#2056.11) et `rfp_owner_assignment`
   * (#2057.10) — sont donc masquées pour CE profil, raison écrite dans
   * `demo-coverage.ts` — même mécanisme que `public_sector_practice` juste
   * au-dessus.
   *
   * Le bloc contenu, lui, EST atteignable : `weekly_linkedin` vaut '1-20'
   * (au-dessus), donc `doesContentMarketing` est vrai. La narration reprend
   * exactement le défaut que #2057.14 nomme : Bellum Conseil PUBLIE
   * (`content_funnel_stages_reached: ['Publier']`) sans exploiter les
   * réactions ni ouvrir de conversation — `weekly_calls`/`weekly_emails`
   * valent '21-50' (prospection de base qui TIENT), donc le conseil calculé
   * est « exploiter davantage », jamais un refus.
   */
  content_active_profile: ['Profil personnel LinkedIn'],
  content_audience_size: '500-2 000',
  content_visible_expertise: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'],
  content_reactions: 'Quelques likes, peu de commentaires',
  content_conversations_generated: 'Occasionnellement',
  content_funnel_stages_reached: ['Publier'],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
  // nombres. `consultant_count` reste DANS la tranche `consultant_size`
  // ci-dessus ('1-10') : les deux coexistent sur ce profil, comme sur un
  // compte réel qui répond au nombre après avoir répondu à la tranche.
  consultant_count: 6,
  annual_revenue_amount: 620_000,
  annual_revenue_period: 'Dernier exercice clos',
  // #2640.2 — le site de l'entreprise. `.example` (RFC 2606), même convention
  // que {@link DEMO_DOSSIERS}' `nova-logistique.example` : jamais un domaine
  // réel réclamé pour une ESN fictive.
  esn_website: 'https://www.bellum-conseil.example',
} as const

/**
 * LE CONTEXTE DE PROFIL (sortie du Profileur) DE « BELLUM CONSEIL » — #2075.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ : DEUX OBJETS PORTENT DEUX RÉPONSES DIFFÉRENTES
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn_profiles` (ci-dessus) porte les RÉPONSES BRUTES au questionnaire —
 * l'écran d'onboarding et « Ton profil » de `/welcome` les lisent. L'audit
 * commercial (`/settings/profile/audit`) lit un objet DIFFÉRENT : la lecture
 * DÉRIVÉE que produit le Profileur (`profiles.profile_context`), jamais
 * seedée nulle part avant ce lot. Le premier remplissait déjà, le second
 * laissait l'écran vide en démo — c'est le second câble coupé que ce lot pose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RIEN D'INVENTÉ QUI NE SE LISE DÉJÀ AILLEURS DANS LE JEU DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * `esnArchetype`/`sellingPosture` traduisent {@link DEMO_ESN_PROFILE} (boutique
 * 1-10 consultants, 3-5 domaines de référence → `boutiqueExpert` ;
 * positionnement expertise cloud/data/cyber, jamais le moins-disant sur le
 * volume → `expertiseRare`). `idealAccountProfile.sectorsPriority` REPREND
 * `target_sectors`, mot pour mot. `decisionLevel`/`entryStrategy` reprennent
 * la phrase-exemple de l'issue #2075 elle-même (« priorité aux managers et
 * directeurs de BU, avant les C-level groupe ») : entrer PAR EN BAS, pas par
 * le comité de direction. `coachingInsights.mainWeakness` traduit
 * `main_sales_pain` (« gérer mon temps entre prospection, delivery et
 * management »), pas un vice inventé pour l'occasion.
 *
 * ⚠️ Doctrine tenue : aucun pourcentage, aucune probabilité de closing, aucun
 * fournisseur nommé (les intitulés « Cloud & Infrastructure », « Data & IA »
 * décrivent une EXPERTISE consultant, pas un outil BellumAI), Laura nommée
 * dans `bellumPhrases.welcome` avec le prénom du propriétaire de la salle
 * ({@link DEMO_OWNER}), aucun critère protégé.
 *
 * `analysisParameters` est inclus alors que le lot #2075 ne le demandait pas
 * nommément : `build-audit.ts` (branche `page-restitution-audit`) le lit pour
 * la conséquence « Proposer les bonnes routines » et l'ajoute à la liste des
 * axes NON ÉTABLIS s'il manque — l'omettre aurait rendu un écran de démo
 * partiellement vide sans raison (voir le rapport de ce lot).
 */
export const DEMO_PROFILE_CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    // #4516.4 — une taille visée (et non « all ») : en démo, Découvrir PROPOSE la taille du profil (`proposeProfileSize`
    // rend `null` pour « all »). « grandCompte » garde la tension d'audit « grands comptes sans voie d'accès »
    // (`demo-audit-*-coverage.spec.ts` : grandCompte OU all, avec l'entrée bottomUp).
    size: 'grandCompte',
    sectorsPriority: [...DEMO_ESN_PROFILE.target_sectors],
    decisionLevel: 'director',
    entryStrategy: 'bottomUp',
  },
  analysisParameters: {
    braveQueriesCount: 12,
    firecrawlPagesCount: 6,
    contactsTarget: 40,
    analysisDepth: 'standard',
    maxTokensResearch: 12000,
    focusAreas: [...DEMO_ESN_PROFILE.expertise_areas],
  },
  messagingStyle: {
    tone: 'directExpert',
    messageLength: 'concise',
    valuePropositionAngle:
      'Trois domaines de référence — cloud & infrastructure, data & IA, cybersécurité & conformité — avec une référence vérifiable sur chacun, pas un catalogue généraliste.',
    differentiationPoints: [
      'Une référence CV réelle par domaine, jamais un profil générique',
      'Principalement des consultants en CDI, quelques freelances ponctuels',
    ],
    avoid: [
      'Ne pas citer de tarif avant le premier échange qualifiant le besoin',
      'Ne pas promettre une disponibilité avant d’avoir confirmé le consultant',
    ],
  },
  coachingInsights: {
    mainWeakness: 'Le temps consacré à la prospection recule dès qu’une mission démarre.',
    keyAdvice:
      'Bloquer un créneau fixe chaque semaine pour la prospection, même en période de forte charge de delivery.',
    cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 8 },
    // #2067.1 / #2067.3 (lot welcome/audit W7, 15/09/2026) — sans ce bloc,
    // le bloc « Viser un rythme mensuel » de l'audit commercial n'affichait
    // jamais rien en démo (`AuditConsequences.tsx` → `consequence('kpiTargets')`).
    // `conversionRateTarget` est rempli pour respecter le schéma
    // (`kpiTargetsSchema`, les trois champs sont requis ENSEMBLE) mais
    // n'a AUCUN lecteur côté écran : doctrine « aucune probabilité ».
    // #2067.2 — la cible partenaires suit l'archétype. L'espace de démo a une
    // porte partenaire (`go_to_market_channels: [… 'Partenaires ESN']`) et
    // déclare `partners_regular_count: '2'` : la cible est ANCRÉE sur cette
    // base, et 2 tombe dans la plage `boutiqueExpert` (2-4) posée par
    // `PARTNERS_PER_MONTH_BY_ARCHETYPE` (apps/ia/app/models/profile_context.py).
    // Sans cette ligne, la démo montrerait un « rythme mensuel » amputé de sa
    // troisième cible — un écran livré mais vide en démo se découvre en
    // réunion, pas en CI.
    kpiTargets: { accountsPerMonth: 8, rdvPerMonth: 4, conversionRateTarget: '10-15 %', partnersPerMonth: 2 },
  },
  bellumPhrases: {
    welcome: `Bonjour ${DEMO_OWNER.first_name}, c’est Laura : j’ai retenu ton positionnement expertise rare en cloud, data et cybersécurité, je vais prioriser les comptes qui correspondent à ce profil.`,
    firstAnalysisCta: 'Lancer ta première analyse de compte',
    weeklySummaryIntro: 'Voici ce qui a bougé sur tes dossiers cette semaine.',
    emptyState: 'Aucun dossier pour l’instant — tape le nom d’une entreprise pour commencer.',
    scoreContext: 'Le score se lit par axe, jamais comme une chance de signer.',
  },
  // #2069.1→.14 / #2074.17→.27 (W7, 15/09/2026) — sans ce bloc, `/welcome`
  // n'affichait jamais la section « Premiers comptes à analyser » en
  // démonstration : `welcomeSummary` est `.optional()` côté contrat (une liste
  // de suggestions vide est un résultat juste quand la mémoire marché n'a rien
  // rendu), mais rien ne le seedait ici, donc `WelcomeScreen.tsx` la taisait
  // TOUJOURS pour un visiteur de la salle — un chantier livré et testé côté IA
  // (`welcome_account_suggestions.py`), jamais vu en démo. Garde dédiée :
  // `demo-profile-context-coverage.spec.ts`.
  //
  // Les trois suggestions reprennent des secteurs et expertises DÉJÀ VRAIS
  // dans {@link DEMO_ESN_PROFILE} (mêmes règles que le reste de cet objet),
  // sur des entreprises DIFFÉRENTES des six dossiers déjà seedés — ce sont des
  // comptes qu'un commercial n'a pas encore ouverts, pas une redite des
  // dossiers existants.
  welcomeSummary: {
    profileRecap:
      'Tu es une ESN de 1 à 10 consultants, basée en "Paris & Île-de-France", spécialisée "Cloud & Infrastructure", "Data & Intelligence Artificielle" et "Cybersécurité & Conformité", qui cible les "CAC40 / SBF120 (grands comptes)" en "Banque de détail & Banque privée" et "Aéronautique & Défense". Tu travailles principalement en "CDI" et ton équipe commerciale, c’est toi seul.',
    searchesPersonalization:
      'Les recherches cibleront en priorité les comptes "Cloud & Infrastructure", "Data & IA" et "Cybersécurité & Conformité", en "Île-de-France".',
    contactsPersonalization:
      'Les contacts identifiés seront des "DSI", "CTO" et "Head of Data" (pas des opérationnels juniors).',
    messagesPersonalization:
      'Les messages seront rédigés sur un ton "direct et expert", concis — jamais consultatif ni corporate.',
    scoringPersonalization:
      'Le scoring évaluera la correspondance entre la stack observée et tes trois domaines de référence, jamais une chance de signer.',
    firstAnalysisSuggestions: [
      {
        // 15/10/2026 — Crédit Agricole est désormais un compte OUVERT de la salle (dossier de compte) : la suggestion
        // propose un compte pas encore ouvert, du même secteur.
        companyName: 'La Banque Postale',
        sector: 'Banque de détail & Banque privée',
        reason:
          'Une pile cloud et data déjà observée dans ce secteur, qui recoupe tes expertises "Cloud & Infrastructure" et "Data & Intelligence Artificielle".',
      },
      {
        companyName: 'Dassault Aviation',
        sector: 'Aéronautique & Défense',
        reason: 'Un environnement où la "Cybersécurité & Conformité" revient souvent, dans un secteur que tu cibles.',
      },
      {
        companyName: 'Doctolib',
        sector: 'Tech & Startups / Scale-ups',
        reason: 'Une scale-up française dont la stack observée recoupe tes trois domaines de référence.',
      },
    ],
  },
  // #2088.34 — LA LECTURE DE LAURA, distincte des huit détecteurs déterministes
  // (#2029, `onboarding-contradictions.ts`) : `DEMO_ESN_PROFILE.priority_sectors`
  // est volontairement à DEUX (commentaire #2041.1 plus haut), donc aucun de ces
  // huit détecteurs ne se déclenche dans cette salle. Cette carte-ci vient d'une
  // AUTRE tension, réelle dans le jeu de données : `kpiTargets.accountsPerMonth`
  // (8, ci-dessus) porté par un commercial SEUL (`sales_team_size`), dont le
  // frein déjà déclaré est justement le temps partagé entre prospection,
  // delivery et management (`main_sales_pain`, repris dans
  // `coachingInsights.mainWeakness`) — rien d'inventé qui ne se lise déjà
  // ailleurs dans {@link DEMO_ESN_PROFILE} / ce même objet.
  contradiction: {
    statement:
      'Tu vises 8 comptes analysés par mois tout en étant seul sur la vente, entre prospection, delivery et management. Tu l’as dit toi-même : le temps consacré à la prospection recule dès qu’une mission démarre. Ce rythme reste à vérifier dans la durée.',
    reasoning:
      'Ça vient de trois réponses : ton objectif de 8 comptes par mois, « Je suis seul (fondateur / indépendant) » sur la vente, et ton frein principal « gérer mon temps entre prospection, delivery et management ».',
  },
}

/* ================================================================== */
/* Dossier 7 — Groupe BPCE                                             */
/* ================================================================== */

/**
 * Le compte « Groupe BPCE », semé EN ENTIER depuis `data/bpce-compte-complet.csv`
 * (1 073 lignes, 25 blocs, importé le 30/09/2026 — « aucune ligne perdue »,
 * décision Louis). Le routage bloc par bloc, la garantie « chaque `id` du CSV
 * finit quelque part » et le conflit de doctrine vivent dans `bpce-csv-mapping.ts`.
 *
 * ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ, POUR CE SEUL DOSSIER (décision Louis
 * 30/09/2026, prise après avertissement sur le risque RGPD — « Tout,
 * coordonnées incluses », confirmé deux fois) : les contacts de ce dossier sont
 * des personnes RÉELLES, NOMMÉES, avec email, téléphone et LinkedIn. C'est
 * l'INVERSE des règles 1 et 3 du docblock de tête de ce fichier (12/08/2026),
 * qui RESTENT en vigueur pour les six autres dossiers : les gardes qui les
 * tiennent portent une exemption NOMMÉE pour ce dossier
 * (`DEMO_BPCE_REAL_CONTACTS_COMPANY`), jamais une suppression.
 *
 * Rien n'est inventé au-delà du CSV : ni SIREN, ni code NAF, ni effectif, ni
 * chiffre d'affaires, ni siège (le relevé n'en publie pas) — « non renseigné »,
 * jamais un repli deviné. Le niveau d'effort (`sprint`) reste vide : personne
 * n'a encore arbitré ce compte, le relevé donne les portes d'entrée, pas la
 * décision de l'équipe.
 */
/**
 * Les sites du compte BPCE : ceux du relevé CSV (tous secondaires) et le siège
 * que le brief commercial du 01/10/2026 pose — les Tours Duo, Paris 13e. Le
 * relevé ne disait pas où est le siège ; le brief le dit, et aucun site du
 * relevé ne prétend l'être (un test le fige).
 */
const bpceSitesFrance: SiteFrance[] = [
  {
    city: 'Paris 13e',
    region: 'Île-de-France',
    type: 'siège social',
    priority: null,
    importance: null,
    latitude: 48.8282,
    longitude: 2.3558,
    is_headquarters: true,
  },
  ...BPCE_SEED.sitesFrance.map(site => ({ ...site, is_headquarters: false })),
]

const bpceDossier: DemoDossier = {
  account: {
    company_name: DEMO_BPCE_REAL_CONTACTS_COMPANY,
    tags: ['grand compte', 'banque coopérative', 'Tier A'],
    siren: null,
    naf_code: null,
    registry_country: 'FR',
    sector: 'Groupe bancaire coopératif — Banques Populaires et Caisses d’Epargne',
    employees: '',
    revenue: '',
    // Brief commercial du 01/10/2026 : le siège est les Tours Duo, Paris 13e ;
    // Strasbourg (campus) est un site secondaire, jamais le siège.
    headquarters: '7 promenade Germaine Sablon, 75013 Paris',
    website: 'https://groupebpce.com',
    logo_url: null,
    subsidiaries: [],
    it_challenges: BPCE_SEED.itChallenges,
    recent_signals: BPCE_SEED.recentSignals,
    // #3420 (recette 03/10) — un compte NON ARBITRÉ ne porte pas le verdict « NO-GO » (score < 5) :
    // il se lisait face à une route « partenaire » recommandée. Palier PRUDENT
    // (`ACCOUNT_SCORE_PRUDENT_MIN`). La stratégie « volume » reste : c'est elle qui déclenche la
    // suggestion de bascule vers la route partenaire (#3296, `suggested_switch`) — la bascule EST
    // la résolution montrée de l'écart stratégie/route.
    priority_score: 5,
    priority_justification:
      'Compte non encore arbitré : le relevé importé le 30/09/2026 décrit la structure, les portes d’entrée et les domaines ouverts à la prestation — pas la décision de l’équipe.',
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'volume',
    sprint_exit_reason: null,
    relationship_memory: null,
    raw_analysis: {
      demo_seed: true,
      // D10 (Louis 05/10) — le palier 5 est POSÉ par la démo, pas arbitré : l'écran l'écrit.
      score_unarbitrated: true,
      /**
       * #2959 (recette prod 02/10) — LA ROUTE COMMERCIALE CALCULÉE, SEMÉE.
       *
       * « Badge Partenaire déclaré présent, aucune Route visible » : la salle
       * n'avait aucun compte dont le plan porte une route. Groupe BPCE porte un
       * partenaire DÉCLARÉ en place (`DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER`,
       * « Kalvyn Access (exemple) ») et AUCUNE relation active : c'est exactement
       * le cas où le moteur (`recommend_commercial_route`, `opening_movement.py`)
       * rend la route « partenaire » — mêmes mots que ses tables, relus mot pour
       * mot par `test_demo_route_seed_matches_engine.py`. Posée à la racine, lue
       * par `buildPlanViewData` comme `nextActions` (aucune clé `plan` ajoutée).
       */
      recommendedRoute: {
        route: 'partenaire',
        label: 'l’entrée passe par un partenaire déjà en place',
        rationale: 'un partenaire est déjà en place sur le compte : entrer par lui plutôt que par un détour',
        first_door: 'le partenaire déjà en place sur le compte',
        info_to_obtain: 'ce que le partenaire accepte de dire de l’organisation et jusqu’où il peut introduire',
        proof: 'une introduction confirmée par le partenaire, pas seulement promise',
        next_contact: 'le contact que le partenaire désigne dans le compte',
        passage_condition: 'le partenaire ne se sent pas contourné',
        fallback_plan: 'repartir en direct_accessible si le partenaire ne fait pas l’introduction',
        discouraged_route: 'direct_accessible',
      },
      // #2284 — l'état « non résolue » de l'Entity Resolver : le relevé ne
      // publie aucun SIREN pour le groupe (voir `siren: null` ci-dessus), donc
      // rien d'ancré — le nom et le domaine officiel ne suffisent pas à résoudre
      // une entité (#2284.28), et l'écran le DIT au lieu d'inventer un numéro.
      // Re-semé sur Groupe BPCE le 01/10/2026 (retrait des quatre comptes non cibles).
      entity_resolution: {
        state: 'unresolved',
        kind: null,
        canonical_id: null,
        commercial_name: 'Groupe BPCE',
        legal_name: null,
        country: null,
        identifiers: {},
        domain: 'groupebpce.com',
        naf_code: null,
        naf_label: null,
        location: null,
        parent_names: [],
        children_count: null,
        sources: ['normalized_name', 'official_domain'],
        confidence: null,
        reasons: ['Aucun identifiant légal corroboré — dossier construit à partir du nom et du site officiel.'],
        question: null,
        resolved_at: '2026-09-24T08:00:00Z',
      },
      // Théo A comptes-fiche-reference.N4 — le dossier de RÉFÉRENCE : une archive figée,
      // lue en lecture seule (l'import du 30/09–01/10/2026, jamais revérifié en ligne).
      // Pour le travailler aujourd'hui : « Créer une copie de travail ».
      reference_archive: {
        label: 'Archive du dépôt fourni',
        period_from: '2026-09-30',
        period_to: '2026-10-01',
        scope_note: 'périmètre France',
        verified_online: false,
      },
      // Théo A comptes-fiche-reference.N1/N2/N3/R3 — ce que l'archive montre de plus : programmes cités, pratiques
      // achats, organisation par regroupements, expertises, TJM par circuit, besoins, écosystème. COMPTÉ dans le relevé.
      reference_dossier: buildReferenceDossier(BPCE_ROWS, { statementDate: '01/10/2026' }),
      business_description: BPCE_SEED.businessDescription,
      it_implications_for_esn: BPCE_SEED.itImplications,
      it_challenges: BPCE_SEED.itChallenges,
      recent_signals: BPCE_SEED.recentSignals,
      pains: BPCE_SEED.pains,
      program_names: BPCE_SEED.programNames,
      entities_exhaustive: BPCE_SEED.entitiesExhaustive,
      sites_france: bpceSitesFrance,
      technology_stack: BPCE_SEED.technologyStack,
      detected_tech_stack: BPCE_SEED.detectedTechStack,
      structural_reading_axes: BPCE_SEED.structuralReadingAxes,
      ecosystem_third_parties: BPCE_SEED.ecosystemThirdParties,
      opportunity_domains: BPCE_SEED.opportunityDomains,
      financial_indicators: BPCE_SEED.financialIndicators,
      // Un score n'est jamais nu : ses quatre axes, chacun nommé par ce que le
      // relevé du 30/09/2026 en dit (domaines, besoins et signaux, portes
      // d'entrée, ESN en place) — mêmes poids que les autres dossiers.
      score_factors: [
        { label: 'Fit — 14 domaines d’opportunité relevés', proof_type: 'profile', weight: 4 },
        { label: 'Timing — 18 besoins observés et 11 signaux de recrutement', proof_type: 'signal', weight: 4 },
        {
          label: 'Accessibilité — référencement central, achats régionaux autonomes',
          proof_type: 'contact',
          weight: 3,
        },
        { label: 'Concurrence — 15 prestataires en place', proof_type: 'source', weight: 2 },
      ],
      data_reliability_notes: BPCE_SEED.dataReliabilityNotes,
      org: {
        orgGraph: bpceOrgGraph,
        units: BPCE_SEED.orgUnits,
        decisionChain: {
          description: BPCE_SEED.decisionChain.description,
          steps: BPCE_SEED.decisionChain.steps,
          estimatedCycleLength: null,
          budgetAuthority: null,
        },
      },
    },
  },
  contacts: BPCE_SEED.contacts.map(contact => ({
    ...namedContact({
      full_name: contact.full_name,
      title: contact.title,
      entity: contact.entity,
      family: contact.family,
      decision_role: contact.decision_role,
      priority: contact.priority,
      profile_summary: contact.profile_summary,
      why_contact: contact.why_contact,
      contact_score: contact.contact_score,
      seniority: contact.seniority,
      lifecycle_state: contact.lifecycle_state,
      key_points: contact.key_points,
      tags: contact.tags,
    }),
    // Décision Louis 30/09/2026 (docblock ci-dessus) : les coordonnées RELEVÉES,
    // jamais inventées — `null` quand le CSV n'en porte pas.
    email: contact.email,
    phone: contact.phone,
    linkedin_url: contact.linkedin_url,
  })),
  attackAngles: BPCE_SEED.attackAngles,
  actionPlan: {
    strategy_type: 'land_and_expand',
    strategy_justification:
      'Le relevé (lignes BPCE-0159, BPCE-U0042, BPCE-U0046) dit trois choses : les achats sont centralisés, le circuit doit être qualifié avant de proposer, et les besoins observés en direct — data, PMO, finance — coïncident avec les domaines les mieux notés. On qualifie le circuit, puis on entre par un domaine ouvert en direct.',
    weeks: [
      {
        name: 'semaine_1_2',
        title: 'Qualifier le circuit d’achat avant de proposer',
        objective:
          'Identifier la catégorie d’achat, l’acheteur central puis le relais régional, et savoir si une filiale a un circuit local en plus du circuit groupe.',
        actions: [
          {
            action_id: 'BPCE1',
            action:
              'Identifier la catégorie d’achat et l’acheteur de la centrale d’achats groupe, puis le relais de l’entité visée (ligne BPCE-0159).',
            contact: 'Centrale d’achats groupe',
            channel: 'email',
            deadline: 'Semaine 1',
            expected_outcome: 'La catégorie d’achat et l’interlocuteur central sont connus.',
            kpi: 'Interlocuteur achats identifié',
          },
          {
            action_id: 'BPCE2',
            action:
              'Qualifier l’outil d’e-sourcing et l’applicabilité du dispositif fournisseurs à la filiale visée — points aveugles documentés (lignes BPCE-U0043, BPCE-U0042).',
            contact: 'Responsable achats de l’entité',
            channel: 'email',
            deadline: 'Semaine 2',
            expected_outcome: 'Le circuit contractuel est connu avant de proposer.',
            kpi: 'Circuit d’achat documenté',
          },
        ],
      },
      {
        name: 'semaine_3_4',
        title: 'Entrer par un domaine ouvert en direct',
        objective:
          'Approcher le manager opérationnel qui exprime le besoin, sur un domaine où le relevé observe un sourcing direct (data, PMO, finance — ligne BPCE-U0046).',
        actions: [
          {
            action_id: 'BPCE3',
            action:
              'Contacter le manager opérationnel ou le prescripteur d’un besoin observé en sourcing direct, pour comprendre le besoin (le contrat peut passer par un intermédiaire).',
            contact: 'Manager opérationnel du besoin',
            channel: 'linkedin',
            deadline: 'Semaine 3',
            expected_outcome: 'Un échange de qualification sur un besoin réel.',
            kpi: 'Échange obtenu',
          },
        ],
      },
    ],
  },
}

/* ================================================================== */
/* Dossiers 8 à 10 — ENGIE, TotalEnergies, Alstom (briefs commerciaux)  */
/* ================================================================== */

/**
 * Une ligne de la section `fiche-compte` du brief (« Effectif », « Chiffre
 * d'affaires »…), ou `''` : « non renseigné », jamais un repli deviné.
 */
/**
 * L'effectif tel que l'en-tête du compte l'affiche (« <valeur> salariés » quand la valeur ne porte pas
 * déjà de mot de personnes) : une ligne de fiche qui raconte une trajectoire (« Environ 4 100 en 2025 ;
 * vers 4 500 ; 400 embauches en 2026 ») se réduit à son nombre de tête — le reste du texte vit dans le
 * brief, il n'est jamais perdu.
 */
export function briefHeadcount(value: string): string {
  if (!value || /salari|collaborat|employ|personnes/i.test(value)) return value
  const head = /^(?:(?:environ|près de|plus de)\s+)?\d[\d\s\u00a0\u202f]*\d|^\d/i.exec(value)
  return head ? head[0].trim() : value
}

/** Les entités du brief, au format de `raw_analysis.entities_exhaustive` (dossiers de brief ET compte Orange). */
function briefEntitiesExhaustive(brief: CommercialBrief) {
  return brief.entities.map(entity => ({
    name: entity.name,
    type: 'filiale',
    parent: null,
    region: entity.country ?? null,
    estimated_headcount: null,
    it_autonomy: null,
    relevance: null,
    relevanceReason: entity.note ?? entity.nature ?? '',
    is_active: entity.status === 'active',
    actionable: null,
  }))
}

function briefFicheValue(brief: CommercialBrief, field: RegExp): string {
  const section = brief.sections.find(candidate => candidate.key === 'fiche-compte')
  const row = section?.rows.find(candidate => typeof candidate['champ'] === 'string' && field.test(candidate['champ']))
  const value = row?.['valeur']
  return typeof value === 'string' ? value : ''
}

/**
 * Un dossier de la salle construit DEPUIS un brief commercial (01/10/2026) :
 * rien n'y est recopié à la main, tout vient de `data/commercial-briefs/<slug>.json`
 * par `commercial-brief-seed.ts`. Même forme que le dossier BPCE : un compte NON
 * arbitré (`sprint: null`, porte `pending`) — le classeur décrit le compte, pas
 * la décision de l'équipe —, aucun angle d'attaque inventé, le plan d'action est
 * celui du classeur. Le niveau d'effort (`sprint`) est un arbitrage de
 * DÉMONSTRATION, motivé par un fait du brief : la salle à six comptes doit
 * occuper chaque niveau du board d'effort (`demo-sprint-board-coverage.spec.ts`).
 * Les contacts, les signaux de Veille et le brief lui-même
 * s'ajoutent dans la fabrique de {@link DEMO_DOSSIERS} (une seule porte, la même
 * que pour Société Générale et BPCE).
 */
function briefDossier(config: {
  company: string
  sector: string
  website: string
  tags: string[]
  /** Le niveau d'effort de DÉMONSTRATION (voir le docblock) et, s'il y a lieu, la porte G1. */
  arbitration: Pick<
    DemoDossier['account'],
    | 'sprint'
    | 'sprint_reason'
    | 'sprint_effort_estimate'
    | 'sprint_promotion_condition'
    | 'priority_gate'
    | 'gate_reason'
    | 'commercial_status'
  >
  /**
   * La lecture structurée du dossier (`raw_analysis.evaluation`), quand la salle
   * en porte une pour ce compte — tirée des faits et des garde-fous du brief,
   * jamais d'une source extérieure (voir {@link totalEnergiesEvaluation}).
   */
  evaluation?: Record<string, unknown>
  /** Pays du registre ; la France par défaut, `CH` pour ABB Suisse (périmètre suisse, décision Louis 04/10/2026). */
  registryCountry?: string
  /** Lot D01 (06/10/2026) — sème le dossier « en cours d'analyse » (voir `DemoDossier['account'].analysis_status`). */
  analysisStatus?: 'analyzing'
  /**
   * #3914 — quand ce dossier vient d'« Analyser » depuis Découvrir : l'origine
   * (`'discover'`) et la raison que Découvrir avait calculée à l'époque, pour
   * que le dossier puisse dire « Découvrir avait dit X » si l'analyse conclut
   * autrement. Absent sur les cinq autres dossiers de la salle (origine
   * inconnue, jamais devinée).
   */
  discoverOrigin?: { reason: string; criteria?: DiscoverOriginCriteria }
  /**
   * #4526.7 — ce compte VIENT du CRM du client (`origin = 'crm'`) : la puce « Mon CRM » du portefeuille a de quoi
   * s'afficher. Réservé aux comptes dont le brief dit déjà une relation (client en cours, ancien client).
   */
  crmOrigin?: true
  /**
   * #4597.1 — ce compte VIENT d'un fichier importé (`origin = 'import'`) : la puce « Importés » du portefeuille a
   * de quoi s'afficher. Jamais cumulé avec `crmOrigin` : un fichier n'est pas un CRM (#4597.2).
   */
  importedOrigin?: true
  /**
   * #3817 (lot N05, 08/10) — ce que la recherche de signaux a RÉELLEMENT
   * consultée, QUAND ce dossier en porte une (absent, comme avant, pour tous
   * les autres comptes du classeur = « analyse antérieure », jamais un faux
   * `found`). Sans elle, aucun compte de la salle ne pouvait prouver la
   * distinction « zéro signal » / « source injoignable » (`AccountSynthesisCards.tsx:78`,
   * `TabNeeds.tsx:232`) — recette prod 08/10 : NON PROUVABLE faute de rejeu réel
   * sur JCDecaux France, faute d'accès réseau depuis ce conteneur.
   */
  signalCoverage?: { status: 'incomplete'; consulted?: string[]; unreachable: { source: string; reason?: string }[] }
  /** #3895 — l'historique des besoins FERMÉS du compte (voir {@link DemoDossier.closedNeeds}). */
  closedNeeds?: readonly DemoClosedNeed[]
  /**
   * #3246.relation — la mémoire de relation SAISIE par l'équipe de démonstration, quand le
   * dossier porte un cas comparable (BNP Paribas, ENGIE) : le STADE seul, dans la liste fermée
   * `relationshipStateSchema`. Absent = `null`, comme les autres dossiers du classeur.
   */
  relationshipMemory?: Record<string, string>
}): DemoDossier {
  const brief = COMMERCIAL_BRIEF_BY_COMPANY[config.company]
  if (!brief) throw new Error(`Aucun brief commercial pour « ${config.company} »`)
  const rootId = `e-${normalizePersonName(config.company).replace(/ /g, '-')}`
  const seeds = briefContactSeeds(brief, new Set())
  const headquarters = briefHeadquarters(brief)
  return {
    account: {
      company_name: config.company,
      tags: config.tags,
      siren: null,
      naf_code: null,
      registry_country: config.registryCountry ?? 'FR',
      sector: config.sector,
      employees: briefHeadcount(briefFicheValue(brief, /^effectif/i)),
      revenue: briefFicheValue(brief, /^chiffre d/i),
      headquarters,
      website: config.website,
      logo_url: null,
      subsidiaries: brief.entities.filter(entity => entity.status === 'active').map(entity => entity.name),
      // #3914 — `undefined` ⇒ pas d'origine Découvrir (cinq dossiers sur six).
      origin: config.discoverOrigin ? 'discover' : config.crmOrigin ? 'crm' : config.importedOrigin ? 'import' : null,
      discover_origin_reason: config.discoverOrigin?.reason ?? null,
      // #3819 (lot RBB2) — « Sélectionné sur … » : jamais un critère non posé.
      discover_origin_criteria: config.discoverOrigin?.criteria ?? null,
      it_challenges: briefItChallenges(brief),
      recent_signals: [],
      // #3420 — non arbitré : palier PRUDENT, jamais « NO-GO » (voir Groupe BPCE).
      priority_score: 5,
      priority_justification:
        'Le brief commercial du 01/10/2026 décrit le compte, ses sites, ses personnes et ce qui s’y prépare — pas la décision de l’équipe : le niveau d’effort ci-dessous est celui de la démonstration, tiré des faits du brief.',
      sprint_exit_reason: null,
      ...config.arbitration,
      relationship_memory: config.relationshipMemory ?? null,
      ...(config.analysisStatus ? { analysis_status: config.analysisStatus } : {}),
      raw_analysis: {
        demo_seed: true,
        // D10 (Louis 05/10) — palier 5 « non arbitré » (#3420) : l'écran le dit sous le score.
        score_unarbitrated: true,
        // Même état « non résolue » que Groupe BPCE : le brief ne publie aucun SIREN.
        entity_resolution: {
          state: 'unresolved',
          kind: null,
          canonical_id: null,
          commercial_name: config.company,
          legal_name: null,
          country: null,
          identifiers: {},
          domain: new URL(config.website).hostname.replace(/^www\./, ''),
          naf_code: null,
          naf_label: null,
          location: null,
          parent_names: [],
          children_count: null,
          sources: ['normalized_name', 'official_domain'],
          confidence: null,
          reasons: ['Aucun identifiant légal corroboré — dossier construit à partir du nom et du site officiel.'],
          question: null,
          resolved_at: brief.generated_at,
        },
        headquarters,
        score_factors: briefScoreFactors(brief),
        ...(config.evaluation ? { evaluation: config.evaluation } : {}),
        sites_france: briefSitesFrance(brief),
        ...(config.signalCoverage ? { signal_coverage: config.signalCoverage } : {}),
        entities_exhaustive: briefEntitiesExhaustive(brief),
        org: { orgGraph: briefOrgGraph(brief, rootId, seeds) },
      },
    },
    contacts: [],
    ...(config.closedNeeds ? { closedNeeds: config.closedNeeds } : {}),
    attackAngles: briefAttackAngles(brief),
    actionPlan: {
      strategy_type: 'land_and_expand',
      strategy_justification:
        'Le plan d’action du brief commercial du compte, repris tel que le classeur l’écrit — pas arbitré par l’équipe.',
      weeks: briefActionPlanWeeks(brief),
    },
  }
}

const engieDossier = briefDossier({
  company: 'ENGIE',
  // #4526.7 — client en cours : il vient du CRM, la puce « Mon CRM » du portefeuille le compte.
  crmOrigin: true,
  // #3246.relation — stade saisi par l'équipe de démonstration : la supervision des flux
  // énergétiques (lot 1) est gagnée et l'effort visé est l'extension — un client en cours.
  relationshipMemory: { relationStage: 'client_actif' },
  sector: 'Énergie — électricité, gaz et services à l’énergie',
  website: 'https://www.engie.com',
  tags: ['grand compte', 'énergie', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'extension',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : la majorité des profils identifiés sont des externes déjà en poste (voir « ESN présentes ») — la porte d’entrée est une extension de périmètre chez des acheteurs qui recourent déjà à la prestation, pas une première mission.',
  },
})

/**
 * #2118.45-47 — LE COMPTE QUI SAIT DIRE NON : TotalEnergies porte le no-go de
 * la salle à six comptes (décision Louis, 01/10/2026 — le dossier qui le portait
 * a quitté la salle). Seuls les axes que le brief MESURE reçoivent une note ;
 * ce qu'il ne permet pas d'évaluer (l'accès à la cellule d'arrêt de Feyzin, le
 * budget de prestation) reste `unknown`, sans note, et sort du dénominateur
 * (GA-18 / GA-19) : le score se lit sur cinq axes (11/25), jamais sur sept. Aucune
 * probabilité. Chaque phrase reprend un garde-fou ou un fait du brief
 * (`totalenergies.json` : « Hors IT », « Aucun budget de prestation »,
 * « Cellule d'arrêt de Feyzin non nommée », « Organigramme métier daté »).
 * Cohérent avec l'arbitrage du compte : `watch` + porte `parked`/`bad_timing`.
 */
const totalEnergiesEvaluation = {
  go_no_go: 'STOP',
  global_score: 11,
  justification:
    'Une fenêtre réelle (le grand arrêt de Feyzin en 2027) mais hors informatique : le brief ne porte aucune hypothèse d’offre IT et aucun budget de prestation n’est documenté. Lecture de nos sources à la date du brief, pas une affirmation sur ce que TotalEnergies achète.',
  dossier_read: {
    axes: [
      {
        key: 'adequation_offre',
        state: 'measured',
        value: 1,
        impact:
          'Le brief est hors IT : aucune hypothèse ne porte sur le développement, l’ERP, le cloud, la data ou la cyber. Le compte se lit en ingénierie, projet et supply sur des plateformes industrielles.',
        lever: 'Une hypothèse du brief qui rejoint ton périmètre, une fois qualifiée, changerait la lecture.',
      },
      {
        key: 'potentiel_commercial',
        state: 'partial',
        value: 2,
        impact:
          'Le grand arrêt de Feyzin 2027 (100 M€, près de 2 000 personnes) est un volume réel — mais 100 M€ de grand arrêt ne signifie pas une enveloppe de prestation intellectuelle.',
        lever: 'Qualifier auprès de la cellule d’arrêt si elle recourt à de l’ingénierie externe.',
      },
      {
        key: 'fraicheur',
        state: 'partial',
        value: 3,
        impact:
          'La fenêtre est datée (Feyzin 2027, annoncé en février 2026 ; Donges d’avril à juin 2026), mais les 64 fonctions de direction de branche proviennent de documents antérieurs au changement de marque.',
        lever: 'Revalider les titulaires des fonctions de branche avant de s’y appuyer.',
      },
      {
        key: 'accessibilite',
        state: 'unknown',
        impact:
          'La cellule d’arrêt de Feyzin n’est pas nommée : les rôles sont publiés pour Donges, pas les titulaires de Feyzin 2027. Le applications voyageurs et la qualification HSE conditionnent en outre l’accès aux sites.',
        lever:
          'Identifier le responsable d’arrêt de Feyzin et la direction régionale Auvergne-Rhône-Alpes — la première action du brief.',
      },
      {
        key: 'capacite_achat_externe',
        state: 'unknown',
        impact:
          'Aucun budget de prestation intellectuelle n’est documenté : les montants d’investissement ne préjugent pas d’une enveloppe accessible.',
        lever: 'Le demander à la cellule d’arrêt : il ne se déduit pas d’une source publique.',
      },
      {
        key: 'concurrence',
        state: 'measured',
        value: 2,
        impact:
          'Dix acteurs sont identifiés sur l’ingénierie et les projets, une cinquantaine d’entreprises extérieures par grand arrêt, et de grands ensembliers sont installés sur les programmes de reconversion.',
        lever:
          'L’espace est dans le renfort de la cellule d’arrêt et les lots d’exécution, pas dans le pilotage global.',
      },
      {
        key: 'qualite_preuves',
        state: 'partial',
        value: 3,
        impact:
          'Les faits du brief sont sourcés et datés, mais plusieurs références de partenaires sont des indices (« relation publique ciblée, pas panel ESN ») et certaines sources n’ont pas été rouvertes.',
        lever: 'Rouvrir les sources marquées « à vérifier » avant de les citer à un interlocuteur.',
      },
    ],
    why_for_your_esn:
      'Le compte se lit par plateforme industrielle et par grand arrêt, pas par segment financier : la fenêtre de Feyzin est le signal le plus actionnable du brief, mais elle ouvre de l’ingénierie et du contrôle de projet, pas de l’informatique. Pour ton ESN, c’est une veille datée, pas une ouverture.',
    recommended_scope:
      'Aucune offre à engager maintenant : se positionner avant la fin 2026 sur la cellule de préparation du grand arrêt, si elle se constitue.',
    best_entry_point: {
      label: 'Le responsable d’arrêt de Feyzin et la direction régionale Auvergne-Rhône-Alpes',
      target_profile: 'Cellule de préparation du grand arrêt 2027',
      why: 'C’est la première action du brief : la cellule se constitue dès maintenant, et ses titulaires ne sont pas publics.',
    },
    obstacles: [
      {
        label: 'Aucun budget de prestation documenté',
        why: '100 M€ de grand arrêt ne signifie pas une enveloppe de prestation intellectuelle.',
      },
      {
        label: 'Qualification HSE et applications voyageurs',
        why: 'Ils conditionnent l’accès aux sites, avant toute discussion commerciale.',
      },
    ],
    anti_advice: {
      what: 'N’affirme pas un besoin informatique sur ce compte.',
      why: 'Le brief est hors IT : chaque hypothèse porte une question de qualification qui peut conclure à l’absence de besoin — présenter une mission serait affirmer ce que le brief marque « à vérifier ».',
    },
    next_action: {
      label: 'Identifier le responsable d’arrêt de Feyzin',
      tab: 'contacts',
    },
    reliability: {
      quality: {
        state: 'partial',
        value: 65,
        note: 'Faits sourcés et datés, mais plusieurs références partenaires sont des indices non confirmés.',
      },
      coverage: {
        state: 'partial',
        value: 40,
        note: 'Organisation métier couverte, hors informatique ; les titulaires de la cellule de Feyzin ne sont pas publics.',
      },
      freshness: {
        state: 'partial',
        value: 55,
        note: 'Fenêtre 2027 datée ; organigramme métier antérieur au changement de marque.',
      },
    },
    // #2118.45-47 — LE BLOC NO-GO : temporaire (le contrat ne permet pas d'écrire
    // un no-go définitif), avec son contexte daté et son déclencheur nommé.
    no_go: {
      temporary: true,
      context:
        'Le brief du 01/10/2026 ne porte aucune hypothèse d’offre informatique et ne documente aucun budget de prestation ; la cellule d’arrêt de Feyzin 2027 n’est pas nommée. C’est une lecture de nos sources à cette date, pas une affirmation sur ce que fait ou ne fait pas TotalEnergies.',
      trigger:
        'Les rôles de la cellule d’arrêt de Feyzin sont publiés (comme ils l’ont été pour Donges), ou le référencement fournisseur s’ouvre.',
    },
    missing: [
      {
        label: 'Les titulaires de la cellule d’arrêt de Feyzin 2027',
        why: 'Les rôles sont publiés pour Donges ; ceux de Feyzin ne sont pas publics.',
      },
      {
        label: 'Une enveloppe de prestation intellectuelle',
        why: 'Aucun budget de prestation n’est documenté — il se demande.',
      },
      {
        label: 'Des titulaires de fonctions de branche revalidés',
        why: 'Les 64 fonctions proviennent de documents antérieurs au changement de marque.',
      },
    ],
  },
}

const totalEnergiesDossier = briefDossier({
  evaluation: totalEnergiesEvaluation,
  // Lot D01 (06/10/2026, #3666) — LE COMPTE « EN COURS D'ANALYSE » de la salle : une actualisation tourne,
  // et la lecture précédente (la lecture structurée ci-dessus, déjà lisible) reste consultable, jamais
  // présentée comme le nouveau résultat. C'est la société qu'aucune démonstration client n'ouvre
  // (veille, porte « pas maintenant »). Aucun pourcentage n'est semé : le serveur répond « en cours »
  // sans chiffre (`AnalysisService.getStatus`, branche démonstration).
  analysisStatus: 'analyzing',
  // #3914 — Découvrir avait fait remonter ce compte sur un signal de
  // recrutement (grand arrêt de Feyzin) ; l'analyse approfondie conclut
  // « METTRE EN VEILLE » (STOP + déclencheur de no-go, hors IT) — les deux
  // verdicts divergent, et c'est précisément le cas que #3914 demande de
  // rendre lisible : AccountVerdictSummary cite cette raison sous le verdict.
  // #3819 (lot RBB2) — + les critères posés dans Découvrir (secteur, zone, signal) : le dossier
  // dit « Sélectionné dans Découvrir sur : secteur … · zone … · signal : recrutement ».
  discoverOrigin: {
    reason: 'Un signal de recrutement sur le grand arrêt de Feyzin',
    // #3819 (lot W-C 13/10) — la compétence cherchée (grand arrêt = maintenance) suit le compte.
    // #4646 — + l'offre qui a fait sortir le compte, recopiée avec sa date et le jour où Découvrir l'a montrée.
    criteria: {
      sectors: ['oil_gas'],
      zone: 'Lyon (69)',
      signals: ['hiring'],
      skills: ['maintenance'],
      offers: [{ title: 'Responsable maintenance — arrêt programmé', date: '2026-10-12', seen: '2026-10-20' }],
      // #4433.9 — Feyzin n'est pas Lyon : le compte est sorti par l'élargissement à 50 km, et le dossier le DIT.
      zone_widened: { tier: 'radius_50', distance_km: 12, place: 'Lyon' },
    },
  },
  company: 'TotalEnergies',
  sector: 'Énergie — pétrole, gaz, électricité et énergies bas carbone',
  website: 'https://totalenergies.com',
  tags: ['grand compte', 'énergie', 'brief commercial'],
  // VEILLE : le brief date la fenêtre (grand arrêt 2027 de Feyzin) et ne promet
  // aucune offre IT — rien à engager avant que la cellule d'arrêt ne se constitue.
  // Porte G1 « pas maintenant » (`bad_timing`), jamais « hors cible » : le compte
  // n'est pas écarté, son moment n'est pas venu.
  arbitration: {
    commercial_status: 'watching',
    priority_gate: 'parked',
    gate_reason: 'bad_timing',
    sprint: 'watch',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : la fenêtre est le grand arrêt 2027 de Feyzin, et le brief ne promet aucune offre IT — rien à engager tant que sa cellule d’arrêt n’est pas constituée.',
    sprint_effort_estimate: 'Aucun — surveillance passive uniquement.',
    sprint_promotion_condition:
      'Les rôles de la cellule d’arrêt de Feyzin sont publiés (comme ils l’ont été pour Donges) ou le référencement fournisseur s’ouvre.',
  },
})

const alstomDossier = briefDossier({
  company: 'Alstom',
  sector: 'Industrie ferroviaire — matériel roulant et signalisation',
  website: 'https://www.alstom.com',
  tags: ['grand compte', 'industrie ferroviaire', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'focus',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : une fenêtre ouverte en 2026 — des postes ouverts sur plusieurs sites et une montée en charge à Belfort — c’est le compte où l’effort se concentre maintenant.',
  },
})

// Démo ESN Nantes (05/10/2026) : deux comptes de plus, construits depuis leur brief comme les trois précédents.
// Cadrage hors IT (ingénierie, qualité, méthodes, essais, supply chain) : c'est du contenu, le contrat ne change pas.
const navalGroupDossier = briefDossier({
  company: 'Naval Group',
  sector: 'Naval de défense — sous-marins, propulsion nucléaire et systèmes de combat',
  website: 'https://www.naval-group.com',
  tags: ['grand compte', 'naval de défense', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'focus',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : le site d’Indret doit absorber 12 M d’heures de charge entre 2026 et 2032 pour 2,5 M d’heures de capacité par an (SNLE 3G et porte-avions France Libre) — le besoin d’ingénierie est arithmétique, c’est là que l’effort se concentre.',
  },
})

const chantiersAtlantiqueDossier = briefDossier({
  company: "Chantiers de l'Atlantique",
  sector: 'Construction navale — paquebots, défense et énergies marines',
  website: 'https://www.chantiers-atlantique.com',
  tags: ['grand compte', 'construction navale', 'brief commercial'],
  arbitration: {
    commercial_status: 'watching',
    priority_gate: 'parked',
    gate_reason: 'bad_timing',
    sprint: 'watch',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : un renfort de 500 personnes en bureaux d’études est annoncé pour le porte-avions France Libre (10 M d’heures, 2031-2038) — mais le compte est vierge dans nos bases, tout est à ouvrir : compte mince, on le suit avant de l’engager.',
    sprint_effort_estimate: 'Aucun — veille sur l’annonce du renfort.',
    sprint_promotion_condition:
      'Les postes du renfort en bureaux d’études pour le porte-avions France Libre sont publiés, ou un premier contact du compte est identifié.',
  },
})

/* ------------------------------------------------------------------ */
/* Dossiers 11 à 15 — démos clients du 06/10 (QuickSort) et 07/10 (Meedz) */
/* ------------------------------------------------------------------ */

/**
 * Cinq comptes construits depuis leur brief (04/10/2026), pour deux démonstrations
 * RÉELLES : QuickSort (mardi 06/10, 15 h) voit BNP Paribas, Bpifrance et Sanofi ;
 * Meedz (mercredi 07/10, 14 h) voit ADEO - Leroy Merlin et Kiabi. Comme les trois
 * autres comptes à brief : non arbitrés par l'équipe (porte `pending`), le niveau
 * d'effort est un arbitrage de DÉMONSTRATION motivé par un fait du brief : `focus`
 * pour Bpifrance, Sanofi, ADEO et ABB Suisse (les comptes de la semaine),
 * `partner_route` pour BNP Paribas (décision Louis 04/10/2026 : la route partenaire
 * avec partenaire lié quitte l'ESN fictive), `watch` pour Kiabi et Chantiers de
 * l'Atlantique (comptes minces : veille, avec sa condition de réveil). Plafond
 * `focus` = 8 (règle d'exécution du service des sprints), à ne pas relever. Jamais
 * `volume` ni `extension` : la carte « sans mouvement » du pilotage compte
 * les comptes de la file exécution sans activité journalisée
 * (`demo-pilotage-no-movement-coverage.spec.ts`, #3509 : UN seul, ENGIE).
 */
/**
 * Décision Louis 04/10/2026 — BNP Paribas porte aussi les cas comparables
 * ({@link DEMO_SIMILAR_CASES}), qui vivaient sur un compte fictif. La
 * comparaison lit d'abord le secteur : il est donc celui du REGISTRE (BNP
 * Paribas SA, NAF 64.19Z, le même que Société Générale) — un fait public,
 * jamais une valeur posée pour faire ressembler. Aucune position de groupe
 * n'est posée (elle exigerait un lien capitalistique sourcé, voir
 * `demo-dataset.spec.ts`).
 */
const bnpParibasDossier = briefDossier({
  company: 'BNP Paribas',
  // #4526.7 — ancien client : il vient du CRM, la puce « Mon CRM » du portefeuille le compte.
  crmOrigin: true,
  // #3246.relation — stade saisi par l'équipe de démonstration : la mission « Fiabilisation du
  // socle de paiements — lot 1 » (`DEMO_SIMILAR_CASES.won`) est terminée — un ancien client.
  relationshipMemory: { relationStage: 'ancien_client' },
  sector: 'Banque — autres intermédiations monétaires (NAF 64.19Z)',
  website: 'https://group.bnpparibas',
  tags: ['grand compte', 'banque', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    // Décision Louis 04/10/2026 (plus de compte ni d'ESN fictifs) : BNP Paribas
    // porte la route partenaire AVEC partenaire lié (`DEMO_SPRINT_PARTNER_ROUTE_PARTNER`,
    // CGI, ESN observée par le brief chez BNP Paribas Cardif).
    sprint: 'partner_route',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : le compte est déjà servi par de grandes ESN sur chaque métier (CGI observé chez BNP Paribas Cardif sur IFRS 17) — la voie d’entrée passe par un partenaire présent, pas par un démarchage direct.',
  },
})

const bpifranceDossier = briefDossier({
  company: 'Bpifrance',
  sector: 'Banque publique d’investissement — financement, garantie, innovation et fonds propres',
  website: 'https://www.bpifrance.fr',
  tags: ['grand compte', 'banque publique', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'focus',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : la direction du Digital construit une fintech interne « AI-native » et recrute son patron data — le moment où une offre data et IA est utile —, avec 66 besoins observés et 11 prescripteurs nommés.',
  },
})

const sanofiDossier = briefDossier({
  company: 'Sanofi',
  sector: 'Industrie pharmaceutique — santé humaine, vaccins et médecine de spécialités',
  website: 'https://www.sanofi.com',
  tags: ['grand compte', 'pharmacie', 'brief commercial'],
  // #3817 (lot N05, 08/10) — ZÉRO signal, mais la famille « emploi » nommée
  // injoignable plutôt que « marché vide » (recette prod JCDecaux France,
  // doctrine « on n'affiche pas ce qu'on n'a pas »). Sanofi est déjà le compte
  // de la salle sans narration « pas maintenant » qui l'expliquerait autrement.
  signalCoverage: {
    status: 'incomplete',
    consulted: ['brave_news', 'bodacc'],
    unreachable: [{ source: 'france_travail', reason: 'Quota API atteint' }],
  },
  // #3895 (arbitrage Louis 11/10) — un ANCIEN besoin fermé sur le vrai compte Sanofi : « Sanofi a-t-il eu
  // des besoins fermés ? » (`find_needs.include_closed`, #3889.2) retrouve un fait PASSÉ, jamais une piste.
  closedNeeds: [
    {
      title: 'Architecte données — plateforme analytique R&D',
      status: 'cancelled',
      status_reason: 'Besoin annulé par le client : le projet a été regroupé dans le programme data du groupe.',
      closed_days_ago: 140,
      skills: [
        { term: 'Architecture de données', required: true },
        { term: 'Python', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      location: 'Paris (75)',
    },
    // Lot 764 (31/10/2026) — un besoin passé de PLUS de six mois : sans lui, l'Historique de Sanofi (onglet du
    // compte comme page Signaux › Historique) restait vide en salle — le seul besoin fermé datait de 140 jours.
    {
      title: 'Tierce maintenance applicative — référentiel qualité des sites',
      status: 'won',
      status_reason: 'Mission remportée : équipe de trois consultants, reconduite un an.',
      closed_days_ago: 420,
      skills: [
        { term: 'Java', required: true },
        { term: 'Oracle', required: false },
      ],
      seniority: 'confirme',
      headcount: 3,
      location: 'Lyon (69)',
      tjm_eur: 640,
    },
  ],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'focus',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : le Digital France (300 M€ de digital et d’IA sur 2025-2026) est la porte d’une société Python et IA, et trois fenêtres datées s’ouvrent en 2027 (siège de La Défense, intégration des acquisitions, productivité de la R&D par l’IA) — l’effort se concentre maintenant sur cette porte.',
  },
})

const adeoDossier = briefDossier({
  company: 'ADEO - Leroy Merlin',
  sector: 'Distribution — bricolage, habitat et services à la maison',
  website: 'https://www.adeo.com',
  tags: ['grand compte', 'distribution', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'focus',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : un référencement dynamique unique (OBMS) ouvre les 18 business units, et 85 des 118 profils identifiés sont déjà des externes — le compte achète de la prestation en continu : l’effort se concentre sur le dossier de référencement.',
  },
})

const kiabiDossier = briefDossier({
  company: 'Kiabi',
  // #4597.1 — versé par un fichier : la puce « Importés » du portefeuille le compte (et « Mon CRM » non).
  importedOrigin: true,
  sector: 'Distribution — prêt-à-porter familial',
  website: 'https://www.kiabi.com',
  tags: ['grand compte', 'distribution', 'brief commercial'],
  arbitration: {
    commercial_status: 'watching',
    priority_gate: 'parked',
    gate_reason: 'bad_timing',
    sprint: 'watch',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : la direction des achats indirects, centralisée depuis septembre 2024, revoit les panels IT, et 14 profils sur 16 sont déjà des externes — compte mince, on le suit jusqu’à la prochaine consultation.',
    sprint_effort_estimate: 'Aucun — veille sur la prochaine consultation des panels IT.',
    sprint_promotion_condition: 'La consultation des panels IT de la direction des achats indirects s’ouvre.',
  },
})

// Démos clients (04/10/2026) : ABB Suisse, périmètre « suisse ». La fiche du classeur porte « Effectif et chiffre
// d'affaires » en UNE ligne (en dollars, jamais convertis) : elle sert d'effectif tel quel, le chiffre d'affaires reste
// « non renseigné » plutôt que découpé ou deviné.
const abbSuisseDossier = briefDossier({
  company: 'ABB Suisse',
  registryCountry: 'CH',
  sector: 'Électrification et automatisation industrielle — Suisse',
  website: 'https://global.abb',
  tags: ['grand compte', 'industrie', 'Suisse', 'brief commercial'],
  arbitration: {
    commercial_status: 'inbox',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: 'focus',
    sprint_reason:
      'Arbitrage de démonstration d’après le brief : un régime contractuel à qualifier avant tout (pas de location de services depuis l’étranger) et 33 cibles de qualification alignées — c’est le compte où l’effort se concentre en premier sur la qualification, pas sur l’offre.',
  },
})

/**
 * Pose le brief sur le compte : `raw_analysis.commercial_brief` (ce que lit
 * l'onglet « Ce que je sais ») et ses signaux dans `recent_signals` — la colonne
 * que lit la Veille ET la clé du blob, qui doivent rester les mêmes. Idempotent :
 * un libellé de signal déjà là n'est jamais redoublé.
 */
function withCommercialBrief<T extends DemoDossier['account']>(account: T, brief: CommercialBrief): T {
  const recentSignals = mergeBriefSignals(account.recent_signals, brief)
  return {
    ...account,
    recent_signals: recentSignals,
    raw_analysis: { ...account.raw_analysis, recent_signals: recentSignals, commercial_brief: brief },
  }
}

/**
 * Décision Louis 04/10/2026 — le VRAI compte de la salle qui porte la moitié
 * « après la signature » (missions, factures, positionnements) : voir
 * {@link DEMO_DELIVERY_CLIENT}. SNCF : vitrine généraliste, prospectée par aucun
 * cabinet des démonstrations de la semaine. Aucune personne n'est créée : les
 * interlocuteurs de livraison sont les sièges (sans nom) déjà semés par son
 * dossier.
 */
export const DEMO_DELIVERY_CARRIER = 'SNCF'

/**
 * Les six dossiers seedés dans une salle de démonstration : les six comptes
 * CIBLES (décision Louis, 01/10/2026) — Société Générale, Groupe BPCE, SNCF,
 * ENGIE, TotalEnergies, Alstom. Aucun autre compte cible.
 *
 * L'ordre compte : c'est celui de la liste des comptes, et donc ce qu'un
 * prospect voit en premier — et ce que lisent les trois premiers comptes du
 * briefing et des promotions du pipe (`take: 3`).
 */
/**
 * #4016 L4.1 (décision Louis 11/10/2026) — les contacts de la salle dont
 * l'adresse est ESTIMÉE (motif de l'entreprise, vérifiée). Le semis pose sur
 * chacun une provenance `inferred` du champ `email` (`field_provenance`) ; la
 * fiche et les listes la badgent « estimé, vérifié le … ». Jamais une personne
 * réelle : seuls des interlocuteurs SIMULÉS (`.example`) y figurent.
 */
export const DEMO_ESTIMATED_EMAIL_CONTACTS: readonly string[] = ['Élise Varennes']

/**
 * #4497 (PR 12C) — les clés que la fiche lit dans `raw_analysis.plan` QUAND il existe, sinon à la racine
 * (`buildPlanViewData` : `plan ?? raw`). Recopiées telles quelles dans le `plan` créé ci-dessous, pour que
 * la fiche d'un dossier sans `plan` lise exactement ce qu'elle lisait à la racine.
 */
const DEMO_PLAN_READER_KEYS = [
  'actionPlan',
  'action_plan',
  'followedSignal',
  'ifNoResponse',
  'nextActionsByHorizon',
  'recommendedMovement',
  'recommendedRoute',
  'reverseProspects',
  'salesContext',
] as const

/**
 * #4497 — les prochaines actions des dossiers qui n'en semaient aucune, écrites depuis LEURS signaux semés
 * (postes ouverts BPCE, brief commercial ENGIE) : sans elles, « Reprendre le fil » et la colonne « Sujet &
 * prochaine action » restaient vides sur ces comptes devant un prospect (craft rule n°9).
 */
const DEMO_LIST_NEXT_ACTIONS: Readonly<Record<string, readonly Record<string, string>[]>> = {
  'Groupe BPCE': [
    {
      id: 'demo_bpce_next_1',
      chantier: 'Besoin publié',
      label: 'Présenter un profil d’architecte de solutions sur le poste ouvert de Solution Architect',
      why: 'Un poste publié est un besoin déjà arbitré : c’est la porte la moins coûteuse du compte.',
      horizon: '7j',
    },
    {
      id: 'demo_bpce_next_2',
      chantier: 'Besoin publié',
      label: 'Qualifier le lot sécurité financière derrière le poste de chef de projet SI',
      why: 'Le poste dit le sujet, pas le lot : le périmètre se demande avant tout positionnement.',
      horizon: '30j',
    },
  ],
  ENGIE: [
    {
      id: 'demo_engie_next_1',
      chantier: 'Entrée',
      label: 'Caler un échange avec la DSI sur le plan de transformation du brief commercial',
      why: 'Le brief nomme le plan et la DSI ; personne ne l’a encore rencontrée sur ce sujet.',
      horizon: '7j',
    },
    {
      id: 'demo_engie_next_2',
      chantier: 'Messages',
      label: 'Envoyer la référence d’intégration post-acquisition à la direction financière',
      why: 'L’acquisition du brief ouvre des chantiers d’intégration que la direction financière pilote.',
      horizon: '30j',
    },
  ],
}

export const DEMO_DOSSIERS: readonly DemoDossier[] = [
  societeGeneraleDossier,
  // Groupe BPCE : tout le CSV BPCE (voir `bpceDossier`). Deuxième dans l'ordre
  // de semis depuis le retrait de quatre comptes non cibles
  // (Louis, 01/10/2026) : les trois PREMIERS comptes seedés sont ceux que le
  // briefing et les promotions du pipe lisent (`take: 3`).
  bpceDossier,
  sncfDossier,
  engieDossier,
  totalEnergiesDossier,
  alstomDossier,
  // Démo ESN Nantes (05/10/2026) : en FIN de liste — les trois premiers comptes sont ceux que le briefing lit (`take: 3`).
  navalGroupDossier,
  chantiersAtlantiqueDossier,
  // Démos clients du 06/10 (QuickSort) et du 07/10 (Meedz) — ajoutés EN FIN de liste : l'ordre des six premiers
  // (ce que lisent le briefing et les promotions du pipe, `take: 3`) ne bouge pas.
  bnpParibasDossier,
  bpifranceDossier,
  sanofiDossier,
  adeoDossier,
  kiabiDossier,
  // Démos clients (04/10/2026) : ABB Suisse, en fin de liste pour la même raison.
  abbSuisseDossier,
].map(dossier => {
  // Les interlocuteurs simulés sont ajoutés ICI plutôt qu'écrits dans chaque
  // dossier : les faits vérifiables et les personnes fabriquées ne se relisent
  // pas de la même façon, et les mélanger dans un même tableau finirait par
  // faire passer les unes pour les autres. Le fichier de densité porte sa règle
  // dans son en-tête ; celui-ci garde la sienne.
  const base = [...dossier.contacts, ...densifiedContactsFor(dossier.account.company_name)]
  // Les cinq comptes à brief commercial (01/10/2026) : les personnes du classeur
  // s'ajoutent à celles déjà semées (dédoublonnées par nom normalisé), le brief
  // voyage dans `raw_analysis.commercial_brief`, et ses projets et postes ouverts
  // entrent dans les signaux de la Veille. SNCF n'a pas de brief : aucune ligne.
  const brief = COMMERCIAL_BRIEF_BY_COMPANY[dossier.account.company_name]
  const briefSeeds = brief
    ? briefContactSeeds(brief, new Set(base.map(contact => normalizePersonName(contact.full_name))))
    : []
  // Société Générale : le classeur nomme la même personne deux fois (« Nom Prénom » / « Prénom NOM ») — on ne sème
  // jamais ces fiches en double, le prospect lirait « 17 doublons possibles » sur des doublons que la démo a créés.
  const briefContacts = (
    dossier.account.company_name === 'Société Générale' ? withoutProbableDuplicates(briefSeeds, base) : briefSeeds
  ).map(contact => namedContact(contact))
  const contacts = [...base, ...briefContacts]
  // Le bandeau de couverture est posé ICI, et pas dans le graphe : c'est le
  // SEUL endroit où la liste finale des contacts est connue. Écrit un cran plus
  // haut, il annoncerait un nombre d'avant la densification — un prospect
  // cliquerait sur « 12 découverts » et trouverait 51 fiches.
  const briefed = brief ? withCommercialBrief(dossier.account, brief) : dossier.account
  // #3755.9 — le compte qualifié axe par axe sur la grille de la salle : l'instantané
  // du verdict voyage dans `raw_analysis.qualification` (l'identifiant de grille est
  // remplacé au semis par celui de la grille réellement insérée, `seedQualificationGrid`).
  const account =
    briefed.company_name === DEMO_QUALIFICATION_ACCOUNT
      ? {
          ...briefed,
          raw_analysis: {
            ...briefed.raw_analysis,
            qualification: demoQualificationSnapshot(
              DEMO_QUALIFICATION_GRID_PLACEHOLDER_ID,
              '2026-10-06T08:00:00.000Z',
            ),
          },
        }
      : briefed
  return {
    ...dossier,
    contacts,
    account: withDemoDossierRead(withDemoOrgCoverage(withListNextActions(account), contacts)),
  }
})

/**
 * #4497 — la liste des comptes lit la prochaine action à `raw_analysis.plan.nextActions[0]` (`GET /accounts`),
 * comme le fait l'analyse réelle. Certains dossiers de la salle la semaient à la RACINE du blob (Société
 * Générale : son `plan` ne la portait pas, si bien que ni la liste ni la fiche ne la voyaient), d'autres pas
 * du tout (BPCE, ENGIE). Un `plan` existant reçoit les actions de la racine ; un dossier sans `plan` en reçoit
 * un, fait des clés que la fiche lisait à la racine — sa fiche ne change donc pas, sa ligne de liste se remplit.
 */
function withListNextActions(account: DemoDossier['account']): DemoDossier['account'] {
  const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
  const plan = raw['plan'] && typeof raw['plan'] === 'object' ? (raw['plan'] as Record<string, unknown>) : null
  if (Array.isArray(plan?.['nextActions']) && (plan['nextActions'] as unknown[]).length > 0) return account
  const nextActions = Array.isArray(raw['nextActions'])
    ? (raw['nextActions'] as unknown[])
    : DEMO_LIST_NEXT_ACTIONS[account.company_name]
  if (!nextActions || nextActions.length === 0) return account
  const base = plan ?? Object.fromEntries(DEMO_PLAN_READER_KEYS.filter(key => key in raw).map(key => [key, raw[key]]))
  return { ...account, raw_analysis: { ...raw, plan: { ...base, nextActions } } }
}

/** Le dossier du compte porteur de la livraison (décision Louis 04/10/2026), tel que la salle le sème. */
function deliveryCarrierAccount(): DemoDossier['account'] {
  const found = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === DEMO_DELIVERY_CARRIER)
  if (!found) throw new Error(`Compte porteur de la livraison absent de la salle : ${DEMO_DELIVERY_CARRIER}`)
  return found.account
}
export const DEMO_DELIVERY_CARRIER_ACCOUNT = deliveryCarrierAccount()

/* ------------------------------------------------------------------ */
/* Vivier de consultants (écran « Vivier », annexe méthodo p22)         */
/* ------------------------------------------------------------------ */

type DemoConsultant = {
  full_name: string
  /**
   * #2195.12 — le MANAGER hiérarchique, par son nom dans ce même vivier.
   *
   * ABSENT sur la plupart des fiches, et c'est la démonstration elle-même :
   * « non renseigné » est l'état ordinaire d'une colonne qu'on vient d'ouvrir,
   * et la fiche ne montre alors AUCUNE ligne « Manager » — ni un vide, ni un
   * nom deviné. Deux fiches le portent pour que le champ se VOIE en démo.
   */
  manager_full_name?: string
  /**
   * #2185.10 — le référent COMMERCIAL, pas le manager hiérarchique ci-dessus.
   * ABSENT sur la plupart des fiches — « non attribué » est l'état ordinaire
   * d'un vivier qui vient d'ouvrir cette colonne. `true` pose
   * `owner_user_id` sur l'unique occupant de la salle de démo (même patron
   * que `assigned_to` sur les comptes/contacts, #1408/#2160.9) : deux fiches
   * le portent pour que « Suivi par… » se VOIE en démo, les autres montrent
   * « Non attribué ».
   */
  owned_by_visitor?: boolean
  /**
   * Théo C talents-vivier.N1/N2 — la DERNIÈRE CONFIRMATION de la disponibilité déclarée, en jours avant le
   * seed (`consultants.availability_checked_at`). ABSENT = jamais confirmée, un état réel : la disponibilité
   * positive d'une fiche jamais confirmée se lit « À reconfirmer · sans confirmation ». Un âge au-delà de
   * 60 jours fait lire « À reconfirmer · confirmation il y a N jours ». Les six états de la colonne
   * « Disponibilité & planning » se voient ainsi en démonstration, sur les comptes de la salle.
   */
  availability_checked_days_ago?: number
  /**
   * Théo C talents-vivier.R3 — combien de compétences de la stack sont PROUVÉES (source `mission`), les
   * premières de la liste. ABSENT = aucune : l'axe « Compétences prouvées » du score se lit 0 sur ce profil
   * (une mesure), alors qu'il est non évaluable sur une fiche sans compétence.
   */
  proven_skill_count?: number
  /** Théo C talents-vivier.A12 — dans les favoris de l'unique occupant de la salle (`user_favorites`, `talent`). */
  favorite?: boolean
  title: string
  seniority: string
  /** Années d'expérience — SAISIES, jamais déduites (décision du 31/08/2026,
   *  écran Vivier). Reprises TELLES QUELLES du CV narratif déjà semé
   *  (« … (9 ans) » en tête de chaque `cv_text`) : la même vérité écrite deux
   *  fois plutôt qu'un chiffre neuf inventé pour la démo. */
  years_experience: number
  /** La ville géocodée (Base Adresse Nationale, décision du 31/08/2026, écran
   *  Vivier) — sert d'ancre à `latitude`/`longitude`, coordonnées RÉELLES et
   *  FIXES : semer en appelant l'API en direct rendrait la salle de
   *  démonstration dépendante du réseau. */
  city: string
  latitude: number
  longitude: number
  availability: string
  /** Décalage en jours par rapport au jour du seed — une date figée dans le
   *  code afficherait « disponible depuis 8 mois » au bout de quelques mois. */
  available_in_days: number | null
  contract_type: string
  /**
   * #2948 (#2329.28) — force `engagement_kind` à `partenaire` plutôt que de le
   * laisser se DÉDUIRE de `contract_type` (le patron ordinaire, ci-dessous
   * dans `DemoSeedService.seedVivier`). `partenaire` n'a pas de `contract_type`
   * qui le désigne : la personne EST l'entité partenaire, distincte du cadre
   * salarié/freelance/portage. `undefined` = engagement dérivé normalement,
   * l'état de six profils sur sept.
   */
  engagement_kind_override?: 'partenaire' | 'sous_traitance'
  /**
   * #2972 — le COMPTE de l'ESN partenaire dont ce consultant est le sous-traitant
   * (`consultants.partner_account_id`, E-09), par son NOM. Posé APRÈS le semis des
   * comptes (le vivier est écrit avant eux) : `DemoSeedService.linkSubcontractorPartners`.
   */
  partner_account?: string
  /** Mode de travail voulu (`consultants.remote_preference`) — écran Vivier,
   *  PDF-22 §01. `undefined` = non renseigné, un état réel et volontaire sur
   *  un des sept profils : tout le monde n'a pas répondu à cette question. */
  remote_preference?: 'sur_site' | 'hybride' | 'full_remote' | 'indifferent'
  /**
   * #2182.39 / #2182.54 — DEPUIS COMBIEN DE JOURS PERSONNE NE LUI A PARLÉ.
   *
   * `consultants.last_contact_at` existait depuis `1789374912846-TalentPool`
   * et n'était écrit par AUCUN semis : la colonne « Dernière interaction » du
   * vivier et le filtre « Fraîcheur » auraient dit « non mesuré » sur les sept
   * profils de la salle — juste, et parfaitement vide à montrer.
   *
   * Absent = `null` À DESSEIN sur deux profils : « aucun échange enregistré »
   * est un état RÉEL du vivier, et ce n'est PAS « contacté il y a 0 jour ».
   * L'étalement (4 · 40 · 120 · 260 · 430 jours) fait mordre les trois seuils
   * du filtre — 3, 6 et 12 mois — sur un vivier de sept personnes.
   */
  last_contact_days_ago?: number
  tjm: number
  stack: string[]
  sectors: string[]
  zones: string[]
  references: string[]
  /** Langues parlées — l'axe 6 du matching resterait « non évaluable » sans elles. */
  languages: { code: string; level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2' | 'natif' | null }[]
  /** Habilitations. Un seul profil en porte une : c'est ce qui rend visible le
   *  motif d'exclusion `clearance_missing` sur un besoin qui l'exige. */
  clearances: string[]
  /** D'OÙ VIENT LA FICHE (`consultants.source`) — groupe « Identité et contact »
   *  de la fiche talent, et ligne « Source » de son onglet Consentement.
   *  La colonne existait, le semis ne l'écrivait pas : les deux écrans
   *  affichaient « Non renseigné » sur les sept profils. C'est un fait de l'ESN
   *  FICTIVE sur son PROPRE recrutement — rien d'inventé sur un tiers. */
  source: 'manual' | 'cv' | 'import' | 'ats' | 'referral'
  /** Déplacements acceptés (`consultants.travel_acceptance`) — groupe
   *  « Couverture et langues ». `undefined` reste `null` : « on n'a pas
   *  demandé » est un état réel, et deux profils sur sept le portent. */
  travel_acceptance?: 'aucun' | 'ponctuel' | 'frequent'
  /**
   * #2948 (#2329.19/.22/.23) — mobilité FINE : fréquence sur site, distincte de
   * `travel_acceptance` ci-dessus (déplacements PONCTUELS, ailleurs qu'au
   * domicile). `undefined` reste `null` en base — l'état ordinaire.
   */
  site_frequency?: 'jamais' | 'ponctuelle' | 'reguliere' | 'permanente'
  /** #2948 (#2329.22) — `undefined` reste `null`. */
  international_mobility?: boolean
  /** #2948 (#2329.23) — `undefined` reste `null`, jamais une chaîne vide. */
  mobility_restrictions?: string
  /** #2948 (#2329.30) — `undefined` reste `null`. */
  process_in_progress?: boolean
  /** #2948 (#2329.31) — `undefined` reste `null`. */
  process_exclusive?: boolean
  /** #2948 (#2329.32) — `undefined` reste `null`, jamais une chaîne vide. */
  process_other_interviews?: string
  /**
   * #2948 (#2329.33) — décalage en JOURS par rapport au jour du semis (même
   * patron que `available_in_days`), converti en date ISO par
   * `DemoSeedService`. `undefined` reste `null`.
   */
  process_decision_deadline_in_days?: number
  /**
   * Consentement (§7.3, filtre #2182.51) — décalage en jours, comme
   * `last_contact_days_ago`. `undefined` = jamais recueilli (état `none`),
   * l'état ordinaire de la majorité des profils — quatre sur sept le
   * gardent tel quel. Les trois autres font mordre chacun des trois états
   * RESTANTS que `consentState()` distingue, sur un vivier de sept
   * personnes : recueilli et valable (`consent_expires_in_days` lointain),
   * recueilli mais bientôt échu (dans la fenêtre `CONSENT_WARNING_DAYS`),
   * recueilli puis expiré (`consent_expires_in_days` négatif).
   */
  consent_given_days_ago?: number
  /** `undefined` = pas d'échéance connue (reste `valid` tant qu'un accord est
   *  recueilli). Négatif = déjà expiré, positif = expire dans N jours. */
  consent_expires_in_days?: number
  consent_basis?: string
  wants: string
  notes: string
  /** CV source de la réécriture p22. Sans lui, `POST /consultants/:id/cv-rewrite`
   *  répond 400 — la démo du matching s'arrêterait là. */
  cv_text: string
  /**
   * #2329.12-.16 — LES MÉTADONNÉES DU TJM (`consultants.tjm_metadata`,
   * `tjmMetadataSchema`) : devise, source, contexte, date d'observation et
   * confidentialité — distinctes du montant lui-même (`tjm`). `undefined`
   * reste `null` en base : « non renseigné » est l'état ordinaire, la
   * majorité des profils le garde tel quel, même patron que
   * `consent_given_days_ago`/`travel_acceptance` ci-dessus.
   *
   * `observed_at` est un décalage en JOURS par rapport au jour du semis
   * (même patron que `last_contact_days_ago`) plutôt qu'une date figée dans
   * le code, convertie en date ISO par `DemoSeedService`.
   */
  tjm_metadata?: {
    currency: string | null
    source: string | null
    context: string | null
    observed_at_days_ago: number | null
    confidential: boolean
  }
  /**
   * #3410.10/.11/.13/.14 (retour bêta #3410) — quatre préférences NOUVELLES :
   * « une préférence négative est aussi importante qu'une compétence
   * positive » (Louis). `undefined` reste `[]`/`null` en base — l'état
   * ordinaire des six profils qui ne les portent pas ; un seul les montre,
   * pour que le groupe « Préférences » de la fiche talent ne s'ouvre pas vide.
   */
  preferred_client_types?: string[]
  refused_clients?: string[]
  environments_to_avoid?: string[]
  non_negotiable_conditions?: string
  /**
   * #3406 (retour bêta #3406) — informations TERRAIN capitalisées, remontées
   * par ce consultant. Un seul profil du vivier en porte, pour que l'écran
   * « Renseignement terrain » ne s'ouvre pas vide en démo — les six autres
   * montrent l'état ordinaire (« aucune information capitalisée »), un fait
   * réel plutôt qu'un manque à combler.
   */
  field_reports?: {
    accountName: string
    entity?: string
    possibleSponsor?: string
    decisionMakers?: string[]
    peopleToContact?: string[]
    uncoveredNeed?: string
    confidentialityLevel: 'interne' | 'partage_limite' | 'confidentiel'
    confidence: 'faible' | 'moyenne' | 'forte'
    notForCommercialUse?: boolean
    recordedByName: string
    declaredDaysAgo: number
  }[]
}

/**
 * Le banc de l'ESN de démonstration.
 *
 * ⚠️ Ces personnes-là sont FICTIVES, et c'est cohérent : ce sont les
 * consultants de « Bellum Conseil », l'ESN imaginaire dont le visiteur emprunte
 * le compte. Les sociétés analysées sont réelles ; l'ESN qui les prospecte ne
 * l'est pas. Aucune coordonnée, aucun portrait.
 *
 * Les profils RÉPONDENT aux trois dossiers : exploitation de plateforme et
 * observabilité (SNCF, Groupe BPCE), industrialisation de l'IA (Société
 * Générale, SNCF), sécurité applicative (Société Générale), systèmes
 * d'information industriels et reprise de données lors d'une sortie d'activité
 * (SNCF, Groupe BPCE). Un vivier sans rapport avec le portefeuille montrerait l'écran
 * et pas la mécanique : le matching sortirait vide.
 */
/**
 * #2972 — le nom de l'ESN partenaire d'Anthony Vasseur. CGI n'a plus de ligne `accounts` (une ESN partenaire n'est
 * pas un compte prospect) : l'UPDATE de `linkSubcontractorPartners` visait un compte introuvable et sautait. Le
 * consultant se rattache à l'ANCRE existante Groupe INTM (statut `deleted`, exclue de /accounts), déclarée ICI parce
 * que le vivier est évalué avant le reste du module.
 */
export const DEMO_EXTERNAL_SOURCING_PARTNER_NAME = 'Groupe INTM'

export const DEMO_CONSULTANTS: readonly DemoConsultant[] = [
  // Deux profils AJOUTÉS pour le matching (PDF 4) : sans eux, la démonstration
  // du classement ne montrait rien d'intéressant sur le besoin phare — personne
  // ne cumulait les deux compétences obligatoires en étant disponible, et
  // surtout aucun profil n'atterrissait dans « non évaluables », le bloc qui
  // porte toute la règle « je ne sais pas n'est pas non ».
  {
    full_name: 'Camille Roussel',
    availability_checked_days_ago: 2,
    proven_skill_count: 3,
    favorite: true,
    last_contact_days_ago: 4,
    title: 'Architecte de plateforme — conteneurs et infrastructure as code',
    seniority: 'senior',
    years_experience: 9,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    availability: 'immediate',
    available_in_days: 0,
    contract_type: 'cdi',
    remote_preference: 'hybride',
    tjm: 640,
    stack: ['Kubernetes', 'Terraform', 'Observabilité', 'AWS', 'CI/CD'],
    sectors: ['Plateformes numériques', 'Énergie'],
    // '69' (Lyon) EN PLUS de 'IDF' : c'est un des deux départements que
    // l'espace de démo suit (`DEMO_TERRITORIES`) — le seul format qu'un code
    // de zone doit prendre pour que la prospection inversée vers le marché
    // (`departmentsFromZones`) le RÉSOLVE. 'IDF' ne désigne aucun département,
    // à dessein (voir `DEMO_REVERSE_MARKET_COVERAGE`) ; il reste pour ne rien
    // changer aux écrans qui le lisaient déjà.
    zones: ['IDF', '69'],
    // #2182.51 — l'état `valid` : recueilli il y a longtemps, échéance encore
    // lointaine.
    consent_given_days_ago: 200,
    consent_expires_in_days: 400,
    consent_basis: 'Candidature spontanée, entretien du 2026-01-14',
    references: ['Socle Kubernetes multi-région pour un opérateur d’énergie'],
    languages: [
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'c1' },
    ],
    clearances: [],
    source: 'manual',
    travel_acceptance: 'ponctuel',
    // #2948 (#2329.19/.22) — ponctuelle sur site, ouverte à l'international :
    // cohérent avec le déplacement ponctuel déjà déclaré ci-dessus.
    site_frequency: 'ponctuelle',
    international_mobility: true,
    wants: 'Construire un socle qui tient, pas empiler des outils.',
    notes: 'Disponible immédiatement, confirmée cette semaine.',
    // #3410.10/.11/.13/.14 — retour bêta #3410 : « une préférence négative
    // est aussi importante qu'une compétence positive ».
    preferred_client_types: ['Grand compte', 'Scale-up'],
    refused_clients: ['Ancien Client SA'],
    environments_to_avoid: ['Astreinte'],
    non_negotiable_conditions: 'Pas de déplacement le vendredi après-midi',
    // #3406 — retour bêta #3406.
    field_reports: [
      {
        accountName: 'Société Générale',
        entity: 'DSI Marchés',
        possibleSponsor: 'Le directeur technique de la plateforme trading',
        decisionMakers: ['La directrice des systèmes d’information'],
        peopleToContact: ['Un lead technique croisé en mission'],
        uncoveredNeed: 'Un socle d’observabilité partagé entre les équipes trading n’existe pas encore.',
        confidentialityLevel: 'confidentiel',
        confidence: 'moyenne',
        notForCommercialUse: false,
        recordedByName: 'Louis Schlegel',
        declaredDaysAgo: 3,
      },
    ],
    cv_text: [
      'CAMILLE ROUSSEL — Architecte de plateforme (9 ans)',
      '',
      'EXPÉRIENCE',
      '2022-2026 — Architecte plateforme, opérateur d’énergie. Conception et exploitation d’un socle Kubernetes multi-région, industrialisé en Terraform. Observabilité de bout en bout, budget d’erreur tenu deux ans de suite.',
      '2019-2022 — Ingénieure infrastructure, plateforme numérique. Migration d’un parc de machines virtuelles vers des conteneurs, chaînes CI/CD refaites.',
      '2017-2019 — Administratrice systèmes et réseaux.',
      '',
      'COMPÉTENCES',
      'Kubernetes, Terraform, AWS, observabilité, CI/CD.',
    ].join('\n'),
  },
  {
    full_name: 'Hakim Barreau',
    last_contact_days_ago: 430,
    // #2195.12 — rattaché à l'architecte senior du vivier. SAISI ici comme il
    // le serait sur la fiche, jamais dérivé d'une unité ou d'un portefeuille.
    manager_full_name: 'Camille Roussel',
    title: 'Ingénieur infrastructure — conteneurs',
    seniority: 'confirme',
    years_experience: 6,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    // Disponibilité INCONNUE, à dessein : c'est le profil qui atterrit dans
    // « non évaluables » et qui montre la règle la plus importante du module.
    // L'inventer disponible ferait exactement ce que le produit s'interdit.
    availability: 'inconnu',
    available_in_days: null,
    contract_type: 'freelance',
    // #2948 (#2329.28) — le seul profil `partenaire` du vivier de démo : porte
    // à lui seul l'axe TJM déclaré (`tjm_metadata`, ordinaire) ET ce nouveau
    // statut, plutôt qu'un huitième profil ajouté rien que pour ça.
    engagement_kind_override: 'partenaire',
    remote_preference: 'full_remote',
    tjm: 600,
    stack: ['Kubernetes', 'Terraform', 'GitLab CI'],
    sectors: ['Industrie'],
    zones: ['IDF', 'remote'],
    references: ['Industrialisation d’un socle conteneurisé pour un équipementier'],
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: [],
    source: 'cv',
    travel_acceptance: 'aucun',
    wants: 'Des missions d’industrialisation, pas de la maintenance.',
    notes: 'Disponibilité à confirmer — sa dernière mission n’a pas de date de fin connue.',
    /** #2329.12/.13/.14 — déclaré PAR LUI, récemment, sans confidentialité :
     *  le cas ordinaire de la métadonnée, celui que la majorité des fiches
     *  finira par porter. */
    tjm_metadata: {
      currency: 'EUR',
      source: 'Déclaré par le consultant',
      context: null,
      observed_at_days_ago: 12,
      confidential: false,
    },
    cv_text: [
      'HAKIM BARREAU — Ingénieur infrastructure (6 ans)',
      '',
      'EXPÉRIENCE',
      '2023-2026 — Ingénieur infrastructure, équipementier industriel. Industrialisation d’un socle conteneurisé (Kubernetes, Terraform), chaînes GitLab CI.',
      '2020-2023 — Ingénieur systèmes, intégrateur.',
      '',
      'COMPÉTENCES',
      'Kubernetes, Terraform, GitLab CI.',
    ].join('\n'),
  },
  {
    full_name: 'Yanis Berthier',
    availability_checked_days_ago: 10,
    proven_skill_count: 2,
    owned_by_visitor: true,
    last_contact_days_ago: 40,
    title: 'Ingénieur plateforme — observabilité et fiabilité',
    seniority: 'senior',
    years_experience: 8,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    availability: 'immediate',
    available_in_days: 0,
    contract_type: 'cdi',
    remote_preference: 'hybride',
    tjm: 620,
    stack: ['Kubernetes', 'Observabilité', 'Prometheus', 'Go', 'CI/CD', 'Fiabilité'],
    sectors: ['Plateformes numériques', 'Transport'],
    zones: ['IDF', 'remote'],
    // #2182.51 — l'état `expiring` : à l'intérieur de la fenêtre de 30 jours
    // que `consentState()` (`CONSENT_WARNING_DAYS`) surveille.
    consent_given_days_ago: 335,
    consent_expires_in_days: 15,
    consent_basis: 'Accord donné en entretien',
    references: ['Réduction du délai de détection d’incident sur une plateforme à fort trafic'],
    languages: [
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'b2' },
    ],
    clearances: [],
    source: 'referral',
    travel_acceptance: 'ponctuel',
    wants: 'Des sujets d’exploitation où le résultat se mesure, pas du cadrage sans suite.',
    notes: 'Sort d’un intercontrat de trois semaines — à placer vite.',
    // #2986 (recette démo 06/10) — sa mission finit la première de la fenêtre d'action : la 1re ligne
    // (écran /missions/renouvellements, supprimé #3656) nommait cette contrainte ; elle reste portée par la fiche consultant.
    mobility_restrictions:
      'Pas de mission hors Île-de-France plus de deux jours par semaine — trajet de garde à assurer.',
    /** #2329.16 — CONFIDENTIELLE : une grille salariale interne, jamais
     *  montrée au client. Le champ reste derrière `finance:read` comme le
     *  reste du TJM (une saisie, pas encore un gate d'export — voir le
     *  docblock de `tjmMetadataSchema`) : la salle doit pouvoir montrer une
     *  fiche où l'axe confidentialité est coché. */
    tjm_metadata: {
      currency: 'EUR',
      source: 'Grille salariale interne',
      context: 'Jamais communiqué au client sans validation du manager.',
      observed_at_days_ago: 5,
      confidential: true,
    },
    cv_text: [
      'YANIS BERTHIER — Ingénieur plateforme (8 ans)',
      '',
      'EXPÉRIENCE',
      '2023-2026 — Ingénieur fiabilité, plateforme à fort trafic. Mise en place de l’observabilité de bout en bout (Prometheus, traces distribuées) sur une architecture Kubernetes de plusieurs centaines de services. Délai moyen de détection d’incident divisé par quatre.',
      '2020-2023 — Ingénieur DevOps, éditeur logiciel. Industrialisation des chaînes d’intégration et de déploiement, migration progressive vers Kubernetes.',
      '2018-2020 — Administrateur systèmes, hébergeur.',
      '',
      'COMPÉTENCES',
      'Kubernetes, Prometheus, Go, CI/CD, observabilité, gestion d’incident, ingénierie de fiabilité.',
      '',
      'FORMATION',
      '2018 — Master informatique, université française.',
    ].join('\n'),
  },
  {
    full_name: 'Salomé Dufour',
    availability_checked_days_ago: 12,
    proven_skill_count: 2,
    // #2195.12 — la seconde fiche qui porte un manager : une seule ne
    // prouverait pas que la colonne relie des gens.
    manager_full_name: 'Camille Roussel',
    title: 'Ingénieure données — industrialisation de modèles',
    seniority: 'confirme',
    years_experience: 5,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    availability: 'sous_1_mois',
    available_in_days: 28,
    contract_type: 'cdi',
    tjm: 580,
    stack: ['Python', 'MLOps', 'Kubeflow', 'Airflow', 'PostgreSQL', 'Gouvernance des données'],
    sectors: ['Banque', 'Transport', 'Plateformes numériques'],
    zones: ['IDF', 'remote'],
    // #2182.51 — l'état `expired` : recueilli, mais l'échéance est déjà
    // passée. Tant qu'il n'est pas repris, un positionnement sera refusé
    // (`consent.states.expired`) — l'état que le filtre doit pouvoir isoler.
    consent_given_days_ago: 400,
    consent_expires_in_days: -30,
    consent_basis: 'Cooptation, accord signé',
    references: [
      'Passage en production d’un modèle de maintenance prédictive',
      'Chaîne de données sous contrainte de conformité',
    ],
    languages: [
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'c1' },
    ],
    clearances: [],
    source: 'manual',
    travel_acceptance: 'frequent',
    // #2948 (#2329.30/.32/.33) — cohérent avec sa fin de mission connue
    // (`notes` ci-dessous) : elle est déjà en discussion ailleurs, sans
    // exclusivité accordée (`process_exclusive` reste `undefined` = non
    // demandé).
    process_in_progress: true,
    process_other_interviews: 'Entretien final chez un autre acteur du transport, réponse attendue sous deux semaines.',
    process_decision_deadline_in_days: 14,
    // #2986 (recette prod 04/10) — une restriction de mobilité NOMMÉE sur une affectée dont la
    // mission finit dans 28 jours : le panneau « Repositionner le consultant » de
    // (ancien /missions/renouvellements, supprimé #3656) la citait (raison « constraints »). Sans elle, la démo ne montrait
    // jamais cette raison, et la prod n'en porte aucune.
    mobility_restrictions: 'Pas de déplacement hors Île-de-France en semaine — rythme de garde alternée.',
    wants: 'Faire tourner en production ce qui est resté au stade du prototype.',
    notes: 'Fin de mission connue au 30 du mois prochain.',
    cv_text: [
      'SALOMÉ DUFOUR — Ingénieure données (5 ans)',
      '',
      'EXPÉRIENCE',
      '2024-2026 — Ingénieure données, opérateur de transport. Industrialisation d’un modèle de maintenance prédictive resté deux ans au stade du prototype : chaîne de production, surveillance, reprise des incidents.',
      '2022-2024 — Ingénieure données, ESN. Construction de chaînes de données sous contrainte de conformité pour un client bancaire (traçabilité, gouvernance, contrôles).',
      '2021-2022 — Analyste données.',
      '',
      'COMPÉTENCES',
      'Python, SQL, Airflow, Kubeflow, PostgreSQL, MLOps, gouvernance des données.',
      '',
      'FORMATION',
      '2021 — École d’ingénieurs, spécialité données.',
    ].join('\n'),
  },
  {
    full_name: 'Antoine Rivière',
    proven_skill_count: 1,
    owned_by_visitor: true,
    last_contact_days_ago: 260,
    title: 'Architecte cloud et intégration',
    seniority: 'expert',
    years_experience: 14,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    availability: 'sous_3_mois',
    available_in_days: 82,
    contract_type: 'cdi',
    remote_preference: 'hybride',
    tjm: 780,
    stack: ['Kubernetes', 'Terraform', 'Intégration de systèmes', 'Reprise de données', 'AWS', 'Azure'],
    sectors: ['Industrie', 'Banque'],
    zones: ['IDF', 'remote'],
    references: [
      'Convergence de deux systèmes d’information après acquisition',
      'Fermeture et reprise de données d’une activité cédée',
    ],
    languages: [
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'b1' },
    ],
    // #2206.12 — il est shortlisté (voir plus bas) sur « Consultant sécurité
    // applicative — parcours d'authentification », qui EXIGE cette
    // habilitation (garde `demo-need-sheet-coverage.spec.ts` : aucun rôle
    // n'exige une habilitation que son propre profil positionné ne détient
    // pas). Cohérent avec son parcours (« sécurisation des échanges pendant
    // la transition », secteurs industrie/banque, déjà réguliers) : ce n'est
    // pas une habilitation étrangère à son profil.
    clearances: ['Agrément sécurité du donneur d’ordre'],
    source: 'ats',
    wants: 'Des sujets d’architecture avec mandat de décision.',
    notes: 'Profil de référence pour une soutenance — bon en avant-vente.',
    /** #2329.13/.44 — DATÉ, LOIN dans le passé : le TJM tel que sa dernière
     *  mission facturée l'a fixé, jamais revalidé depuis. La date d'observation
     *  (`observed_at`), pas `updated_at`, porte ce fait — voir le docblock de
     *  `tjmMetadataSchema` (« un TJM ressaisi tel quel trois mois après reste
     *  vieux de trois mois »). 260 jours dépasse `TJM_HISTORICAL_AFTER_DAYS`
     *  (180, `tjmObservedFreshness`) : ce profil est celui qui lève le badge
     *  « contexte historique » sur l'onglet Disponibilité & TJM (`TalentRatesTab`,
     *  #2948 lot du 27/09) — le seul écran qui distingue enfin « contexte
     *  historique » d'« actuel ». */
    tjm_metadata: {
      currency: 'EUR',
      source: 'Dernière mission facturée',
      context: 'TJM de la mission de convergence SI 2022-2026, non revalidé depuis.',
      observed_at_days_ago: 260,
      confidential: false,
    },
    cv_text: [
      'ANTOINE RIVIÈRE — Architecte cloud et intégration (14 ans)',
      '',
      'EXPÉRIENCE',
      '2022-2026 — Architecte, groupe industriel. Convergence de deux systèmes d’information après une acquisition : cartographie des interfaces, reprise de données, sécurisation des échanges pendant la transition.',
      '2017-2022 — Architecte cloud, ESN. Migrations AWS et Azure, industrialisation Terraform et Kubernetes pour des clients industriels. Fermeture et reprise de données d’une activité cédée, à date imposée.',
      '2012-2017 — Ingénieur systèmes et intégration.',
      '',
      'COMPÉTENCES',
      'Kubernetes, Terraform, AWS, Azure, intégration de systèmes, reprise de données, cartographie d’interfaces.',
      '',
      'FORMATION',
      '2012 — École d’ingénieurs.',
    ].join('\n'),
  },
  {
    full_name: 'Inès Kaczmarek',
    availability_checked_days_ago: 6,
    proven_skill_count: 3,
    favorite: true,
    last_contact_days_ago: 120,
    title: 'Consultante sécurité applicative',
    seniority: 'senior',
    years_experience: 9,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    availability: 'sous_1_mois',
    available_in_days: 21,
    contract_type: 'cdi',
    remote_preference: 'sur_site',
    tjm: 720,
    stack: [
      'Sécurité applicative',
      'Revue de code',
      'Authentification forte',
      'Conformité',
      // #3830.4 — compétence LIBRE (hors référentiel : `canonicalSkill` la laisse nulle), celle que
      // la fiche AFFICHE et que le filtre doit retrouver par sous-chaîne (« risque ») — le cas de
      // la recette prod 08/10 (« Analyse de risque » invisible au filtre), absent du vivier réel.
      'Analyse de risque',
      'Gestion des vulnérabilités',
    ],
    sectors: ['Banque', 'Transport', 'Plateformes numériques'],
    zones: ['IDF', 'remote'],
    references: [
      'Revue de sécurité d’un parcours d’authentification bancaire',
      'Mise en conformité d’un opérateur d’importance vitale',
    ],
    languages: [
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'b2' },
    ],
    /**
     * DEUX habilitations, de deux familles.
     *
     * La seconde n'est pas décorative : le rôle « Consultant sécurité
     * applicative » de la salle EXIGE l'agrément du donneur d'ordre, et Inès y
     * est déjà positionnée chez le client. Un rôle qui exigerait une
     * habilitation que son propre profil positionné ne détient pas donnerait un
     * écran qui se contredit — le rapprochement écarterait quelqu'un qui est
     * déjà parti chez le client. C'est la même règle que « aucun rôle ne
     * s'annonce plus loin que ce que ses profils permettent », un cran plus loin.
     */
    clearances: ['Confidentiel Défense', 'Agrément sécurité du donneur d’ordre'],
    source: 'referral',
    travel_acceptance: 'ponctuel',
    wants: 'Des revues qui débouchent sur des correctifs, pas sur un rapport classé.',
    notes: 'Habituée aux contextes réglementés.',
    cv_text: [
      'INÈS KACZMAREK — Consultante sécurité applicative (9 ans)',
      '',
      'EXPÉRIENCE',
      '2023-2026 — Consultante sécurité, secteur bancaire. Revue de sécurité de parcours d’authentification forte, plan de remédiation priorisé, accompagnement des équipes de développement jusqu’à la correction.',
      '2019-2023 — Ingénieure sécurité, opérateur d’importance vitale. Mise en conformité réglementaire, gestion des vulnérabilités sur un parc applicatif étendu.',
      '2017-2019 — Développeuse, puis référente sécurité applicative.',
      '',
      'COMPÉTENCES',
      'Sécurité applicative, revue de code, authentification forte, gestion des vulnérabilités, conformité réglementaire.',
      '',
      'FORMATION',
      '2017 — Master sécurité des systèmes d’information.',
    ].join('\n'),
  },
  {
    full_name: 'Marc Ouedraogo',
    availability_checked_days_ago: 140,
    proven_skill_count: 2,
    title: 'Ingénieur systèmes d’information industriels',
    seniority: 'confirme',
    years_experience: 7,
    // Laval, et non Paris comme les six autres — le SEUL profil dont `zones`
    // porte une ville PRÉCISE (« Laval ») en plus de « IDF ». Diversifier la
    // démo : sans lui, un rayon de 50 km autour de Paris (maquette) inclurait
    // le vivier entier et ne démontrerait rien.
    city: 'Laval',
    latitude: 48.0698,
    longitude: -0.77,
    availability: 'immediate',
    available_in_days: 0,
    contract_type: 'cdi',
    remote_preference: 'sur_site',
    tjm: 560,
    // #3830.3 — recette démo du 07/10 : le filtre compétences (#3830.1/.2, déjà
    // corrigé ddb5ec0f68) ne peut se PROUVER en salle démo si rien n'y porte la
    // compétence cherchée. « Kubernetes » était déjà indexé (Camille Roussel,
    // Hakim Barreau, Yanis Berthier, Antoine Rivière, et les trois fiches de
    // sourcing externe), mais « Java » et « Spring » n'apparaissaient dans
    // AUCUNE `stack` du vivier. Ajoutées ICI plutôt que sur une fiche NEUVE :
    // chaque profil de ce vivier porte déjà une mission, un `field_report` ou
    // un état de consentement précis que `demo-talent-filters-coverage.spec.ts`
    // et les gardes voisines vérifient un par un — une fiche neuve sans
    // mission casse la garde « sans mission » (#2182.23/.53, vide À DESSEIN sur
    // cette salle). Réaliste pour un ingénieur SI industriel qui fait aussi de
    // l'intégration applicative.
    stack: [
      'SI industriel',
      'Supervision de production',
      'Intégration et tests',
      'SQL',
      'Java',
      'Spring',
      'Documentation technique',
    ],
    sectors: ['Industrie', 'Transport'],
    zones: ['IDF', 'Laval', 'remote'],
    references: [
      'Supervision d’une chaîne de production sur site',
      'Reprise d’un poste ouvert en intérim, avec transfert de compétence',
    ],
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: [],
    source: 'import',
    // #2948 (#2329.19/.22/.23) — permanente sur site (cohérent avec
    // `remote_preference: 'sur_site'` et son « envie » ci-dessous), pas
    // d'international, une restriction NOMMÉE plutôt qu'une case cochée.
    site_frequency: 'permanente',
    international_mobility: false,
    mobility_restrictions: 'Pas de découché plus de trois nuits — garde d’enfant en semaine.',
    wants: 'Des missions sur site, avec des interlocuteurs qui connaissent leur atelier.',
    notes: 'Mobile en région — c’est ce qui manque le plus sur les sites industriels.',
    cv_text: [
      'MARC OUEDRAOGO — Ingénieur systèmes d’information industriels (7 ans)',
      '',
      'EXPÉRIENCE',
      '2023-2026 — Ingénieur SI industriel, équipementier. Supervision d’une chaîne de production et intégration des données d’atelier (services Java/Spring). Reprise d’un poste tenu en intérim depuis huit mois, avec documentation et transfert de compétence en fin de mission.',
      '2020-2023 — Ingénieur intégration et tests, sous-traitant industriel.',
      '2019-2020 — Technicien méthodes.',
      '',
      'COMPÉTENCES',
      'SI industriel, supervision de production, intégration et tests, SQL, Java, Spring, documentation technique.',
      '',
      'FORMATION',
      '2019 — École d’ingénieurs, spécialité industrielle.',
    ].join('\n'),
  },
  {
    /**
     * #3068 — LA DÉMONSTRATION DU BADGE « INTERRUPTION À CONFIRMER ».
     *
     * Sans elle, `a_confirmer` (`deriveStaffing`, #3068) restait un état que
     * seule la CI mesurait : aucun profil du vivier de démonstration ne
     * portait de mission interrompue non confirmée, donc le badge ne se
     * voyait nulle part en salle — recette écran du 27/09 : « NON PROUVÉ en
     * prod (vivier vide, aucun consultant) ». Une SEULE mission, TERMINÉE par
     * interruption, sans confirmation de disponibilité : c'est le cas que
     * `MissionEndService.declareInterruption` pose par construction
     * (`availability_confirmed` démarre à `false`, un second geste humain
     * séparé le lève) et que `deriveStaffing` doit refléter PARTOUT (vivier,
     * stats, filtres) — pas seulement dans l'écran de fin de mission.
     */
    full_name: 'Léa Fontaine',
    title: 'Cheffe de projet SI — pilotage de programme',
    seniority: 'confirme',
    years_experience: 8,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    /** Déclarée « inconnue » : personne n'a mis à jour cette case depuis
     *  l'interruption — exactement l'écart que le badge DÉRIVÉ comble, pas
     *  une déclaration qu'on aurait pu inventer à sa place. */
    availability: 'inconnu',
    available_in_days: null,
    contract_type: 'cdi',
    remote_preference: 'hybride',
    tjm: 580,
    stack: ['Pilotage de programme', 'SI', 'Conduite du changement', 'Planification'],
    sectors: ['Services financiers'],
    zones: ['IDF'],
    references: ['Pilotage d’un programme de refonte SI sur dix-huit mois'],
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: [],
    source: 'manual',
    wants: 'Un cadrage clair avant de s’engager sur un nouveau programme.',
    notes: 'Mission précédente interrompue — disponibilité à reconfirmer.',
    cv_text: [
      'LÉA FONTAINE — Cheffe de projet SI (8 ans)',
      '',
      'EXPÉRIENCE',
      '2021-2026 — Cheffe de projet SI, secteur financier. Pilotage d’un programme de refonte, coordination de trois équipes.',
      '2018-2021 — Chargée de projet SI.',
      '',
      'COMPÉTENCES',
      'Pilotage de programme, SI, conduite du changement, planification.',
    ].join('\n'),
  },
  {
    /**
     * #2972 — PARITÉ DÉMO DU PARTENAIRE. Le relevé escaladé affiche « Partenaire : … » quand son consultant est en
     * SOUS-TRAITANCE (`consultants.partner_account_id`) ; aucun profil du vivier ne l'était, la ligne ne se voyait
     * donc jamais en salle (recette Z : « Partenaire : … sur un espace réel »). Un consultant d'une ESN partenaire
     * RÉELLE déjà déclarée (`DEMO_DECLARED_PARTNER_ACCOUNT`), avec sa mission escaladée juste plus bas (CRA absent,
     * trois relances). Personne fictive, comme tout le banc de « Bellum Conseil » : aucune coordonnée, aucun portrait,
     * aucun fait avancé sur l'ESN partenaire elle-même.
     */
    full_name: 'Anthony Vasseur',
    title: 'Développeur d’intégration — sous-traitance',
    // #4016 L4.3 — séniorité NON posée mais 6 ans saisis : le vivier et la fiche
    // montrent « Confirmé » badgé « estimé » (tranche déduite des années).
    seniority: 'inconnu',
    years_experience: 6,
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    availability: 'inconnu',
    available_in_days: null,
    contract_type: 'freelance',
    engagement_kind_override: 'sous_traitance',
    partner_account: DEMO_EXTERNAL_SOURCING_PARTNER_NAME,
    remote_preference: 'hybride',
    tjm: 540,
    stack: ['Support applicatif', 'Intégration de flux', 'SQL', 'Recette'],
    sectors: ['Transport'],
    zones: ['IDF'],
    references: ['Reprise du run d’une chaîne d’échanges inter-applicatifs'],
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: [],
    source: 'referral',
    wants: 'Un périmètre de run clair, avec un interlocuteur côté client.',
    notes: 'Mis à disposition par l’ESN partenaire — son relevé passe par elle.',
    cv_text: [
      'ANTHONY VASSEUR — Développeur d’intégration (6 ans)',
      '',
      'EXPÉRIENCE',
      '2022-2026 — Développeur d’intégration, mis à disposition par une ESN partenaire. Run d’une chaîne d’échanges inter-applicatifs, recette des évolutions.',
      '2020-2022 — Développeur support applicatif.',
      '',
      'COMPÉTENCES',
      'Support applicatif, intégration de flux, SQL, recette.',
    ].join('\n'),
  },
]

/**
 * #4577.3 (Louis 01/11/2026) — les champs de fiche talent « SAISIS À LA MAIN » de la salle : une provenance `human`
 * datée (`field_provenance`, `seedHandEnteredTalentFields`) que la fiche lit (`field_sources`) et marque « Saisi à la
 * main ». Un champ ne peut y figurer que s'il porte déjà une valeur (garde `demo-hand-entered-talent-coverage.spec.ts`).
 * Camille Roussel : son TJM corrigé après un appel — le champ que le commercial corrige en premier (#4577.9).
 */
export const DEMO_HAND_ENTERED_TALENT_FIELDS: readonly {
  full_name: string
  fields: readonly string[]
  daysAgo: number
}[] = [{ full_name: 'Camille Roussel', fields: ['tjm'], daysAgo: 3 }]

/**
 * Métiers placés DÉDUITS (décision Louis 11/10/2026, craft rule 9) — calculés
 * par la VRAIE déduction (`inferPlacedRoles`, contracts) sur le contexte semé
 * de Bellum Conseil : positionnement et expertises ({@link DEMO_ESN_PROFILE}),
 * portefeuille d'offres, et les titres + compétences de {@link DEMO_CONSULTANTS}.
 * Aucune ligne écrite à la main : chaque indice affiché vient d'une donnée semée.
 * La cybersécurité (expertise + portefeuille) ressort « déduit » à côté des
 * quatre métiers DÉCLARÉS, avec ses indices et les gestes Confirmer / Retirer.
 */
export const DEMO_INFERRED_PLACED_ROLES = inferPlacedRoles({
  texts: [
    { field: 'positioning', text: DEMO_ESN_PROFILE.positioning },
    { field: 'expertise_areas', text: DEMO_ESN_PROFILE.expertise_areas.join(' · ') },
  ],
  offerDomain: DEMO_ESN_PROFILE.offer_domain,
  offerDomains: DEMO_ESN_PROFILE.offer_domains,
  consultants: DEMO_CONSULTANTS.map(consultant => ({ title: consultant.title, skills: consultant.stack })),
  missions: [],
})

/* ------------------------------------------------------------------ */
/* Le lot N — import de CV depuis un ZIP ou une messagerie (#2568/#2569) */
/* ------------------------------------------------------------------ */

/** Un document d'ORIGINE, tel qu'un import en dépose — jamais le binaire. */
export type DemoCvImportDocument = {
  filename: string
  /** Date RÉELLE du fichier (entrée ZIP ou message) — jamais la date du semis. */
  capturedAt: string
  text: string
  /** #2542.3 — vrai quand SEULE une partie du fichier a pu être lue
   *  (#1954.16/.30). Absent = `false`, comme pour un import réel dont le
   *  service d'extraction ne l'a pas signalé. */
  partial?: boolean
}

/**
 * Une fiche née du lot N — distincte des sept profils de `DEMO_CONSULTANTS`,
 * dont le matching dépend d'un compte exact et sans doublon (voir
 * `talent_identity_decisions` dans `demo-coverage.ts`).
 */
export type DemoCvImportConsultant = {
  full_name: string | null
  review_status: 'needs_review' | 'qualified'
  source: 'cv' | 'referral'
  notes: string
  /** Un pour une fiche neuve, deux pour un doublon résolu (#2569.2). */
  documents: readonly DemoCvImportDocument[]
  /**
   * #2183.21/#2183.26 (#2784) — la ville et les formations telles qu'une
   * fiche QUALIFIÉE les porterait une fois le geste de revue passé
   * (`CvParseService.commit`). Aucun appel de modèle ici, comme le reste de
   * ce semis (`cv_text` brut) : ces deux champs sont l'ÉTAT D'ARRIVÉE du même
   * geste que la salle de démo doit pouvoir montrer sans le rejouer —
   * recette écran du 27/09/2026, qui trouvait ces deux champs « Non
   * renseigné » même sur une fiche `qualified` née d'un CV déposé.
   * `undefined` = fiche non qualifiée, ou volontairement sans ces deux
   * champs (Julien Fabre homonyme, Samir Ouazani en échec partiel).
   */
  location?: string
  education?: readonly string[]
  /** #3935.2a — environnements, outils, certifications tels que la lecture du CV
   *  les écrit. `undefined` = non lu (la fiche le DIT), jamais une liste vide. */
  environments?: readonly string[]
  tools?: readonly string[]
  certifications?: readonly string[]
  /** #3935.2b — les expériences telles que la lecture du CV les écrit dans
   *  `consultant_experiences` (provenance `model`). #3935 (lot P03) — les dates
   *  dans la forme de la lecture : « 2019 » (année seule, gardée avec sa
   *  précision `year`), « 2019-03 » (mois) — jamais complétées. */
  experiences?: readonly {
    role: string
    entreprise: string | null
    date_debut: string | null
    date_fin: string | null
    realisations: string | null
    preuve: string
  }[]
}

/**
 * Théo C talents-recrutement — l'écran Recrutement n'est pas vide en démonstration : trois des quatre candidats semés
 * par {@link DEMO_CV_IMPORT_CONSULTANTS} sont déjà rangés ; le quatrième (Julien Fabre, premier homonyme) reste « À
 * qualifier » — jamais rangée = à qualifier. `occurrence` départage les deux Julien Fabre (rang parmi les homonymes).
 * « Écartée » reste vide : une colonne vide se montre, elle ne se remplit pas pour faire joli.
 */
export const DEMO_RECRUITMENT_SEED_SPECS: readonly {
  persona: string
  occurrence: number
  stage: 'call_planned' | 'qualified' | 'on_hold'
  reason?: string
  /** Jours avant l'échange annoncé — à « Échange prévu » seulement. */
  inDays?: number
}[] = [
  {
    persona: 'Inès Castel',
    occurrence: 0,
    stage: 'qualified',
    reason: 'Échange concluant : profil cloud solide, disponible sous un mois.',
  },
  { persona: 'Samir Ouazani', occurrence: 0, stage: 'call_planned', inDays: 3 },
  {
    persona: 'Julien Fabre',
    occurrence: 1,
    stage: 'on_hold',
    reason: 'Même nom qu’une fiche existante : à vérifier avant de poursuivre.',
  },
]

/**
 * #2569.4 — le parcours du lot N doit être VISIBLE en démonstration : un
 * doublon résolu automatiquement, une exception isolée pour revue.
 *
 * Trois fiches, pour deux histoires :
 *
 *  - **Inès Castel** — #2569.2 : deux versions de son CV se recoupent (même
 *    empreinte d'identité, deux fichiers). La plus RÉCENTE (2025) a remplacé
 *    le texte de la fiche ; l'ancienne (2023) reste un document consultable.
 *  - **Julien Fabre × 2** — #2569.3 : un homonyme existe déjà dans le vivier
 *    (`source: 'referral'`, arrivé avant tout import) et le lot N en dépose un
 *    second, sans e-mail ni téléphone. Aucune clé forte ne les rapproche : le
 *    calcul RÉEL d'identité (`GET /talents/:id/identity`, pas une donnée
 *    figée) les classe `ambiguous`, exactement la même mécanique que la
 *    fonction pure `decideCvBatchFileAction` isole comme exception à l'import.
 *    Ferme le résidu nommé dans `talent_identity_decisions`
 *    (« la démonstration ne montre pas une proposition de doublon tant que le
 *    jeu n'a pas de doublon réel à montrer ») — désormais elle en a un.
 *  - **Samir Ouazani** — #2542.3 : un dossier de compétences dont UNE page
 *    n'a pas pu être décodée (#1954.16/.30) — la salle doit montrer au moins
 *    un document d'échec NOMMÉ (compagnons du lot #2542), et « rien n'est
 *    écrit sans texte » (#2542.1) rend un échec TOTAL impossible à seeder
 *    autrement qu'en le nommant ici : cette fiche est le seul état persistant
 *    qui reste visible d'une lecture qui n'a pas pleinement abouti.
 */
export const DEMO_CV_IMPORT_CONSULTANTS: readonly DemoCvImportConsultant[] = [
  {
    full_name: 'Inès Castel',
    // Décision Louis 12/10 (c97) — CV lu = fiche qualifiée.
    review_status: 'qualified',
    source: 'cv',
    notes:
      'Import ZIP (lot N) : deux versions de son CV se recoupaient — la plus récente a remplacé le texte de la fiche, les deux fichiers d’origine restent consultables.',
    // #2183.21/#2183.26 (#2784) — la ville et les formations citées dans le
    // CV le plus récent ci-dessous (« Lyon », « Master MIAGE »), telles
    // qu'une revue validée les aurait écrites (`readLocationFromIdentity`,
    // le bloc `education`). Fiche qualifiée (c97) : le doute restant porte
    // sur le DOUBLON, pas sur ces deux champs, déjà lisibles onglet Profil.
    location: 'Lyon (69)',
    education: ['Master MIAGE — Université Lyon 1 — 2019'],
    // #3935.2a — cités tels quels par son CV 2025 ci-dessous (rubriques
    // ENVIRONNEMENTS / OUTILS / CERTIFICATIONS) : rien d'inventé.
    environments: ['Azure', 'SQL Server', 'Agile Scrum'],
    tools: ['Jira', 'Confluence', 'MS Project'],
    certifications: ['PMP — PMI'],
    // #3935.2b — lues dans son CV 2025 ci-dessous, ligne par ligne. #3935 (lot
    // P03, décision Louis 09/10) — les dates n'y sont écrites qu'à l'ANNÉE
    // (« 2023-2025 ») : gardées à l'année, la fiche affiche « 2023 → 2025 ».
    experiences: [
      {
        role: 'Cheffe de projet SI senior',
        // #3895 (arbitrage Louis 11/10) — le CV nomme Sanofi comme CLIENT (vrai compte des briefs) :
        // `search_talents.experience_client` retrouve cette expérience sur `entreprise`.
        entreprise: 'Sanofi',
        date_debut: '2023',
        date_fin: '2025',
        realisations: 'Pilotage de deux migrations applicatives menées en parallèle, budget tenu.',
        preuve:
          '2023-2025 — Cheffe de projet SI senior, mission chez le client Sanofi (cabinet de conseil). Pilotage de deux migrations applicatives menées en parallèle, budget tenu.',
      },
      {
        role: 'Chargée de projet junior',
        entreprise: null,
        date_debut: '2019',
        date_fin: '2021',
        realisations: null,
        preuve: '2019-2021 — Chargée de projet junior.',
      },
    ],
    documents: [
      {
        filename: 'Ines_Castel_CV_2023.pdf',
        capturedAt: '2023-11-02',
        text: [
          'INÈS CASTEL — Cheffe de projet SI (5 ans)',
          '',
          'EXPÉRIENCE',
          '2021-2023 — Cheffe de projet SI, cabinet de conseil. Pilotage d’un chantier de migration applicative.',
          '2019-2021 — Chargée de projet junior.',
        ].join('\n'),
      },
      {
        filename: 'Ines_Castel_CV_2025.pdf',
        capturedAt: '2025-09-10',
        text: [
          'INÈS CASTEL — Cheffe de projet SI senior (7 ans)',
          'Lyon (69)',
          '',
          'EXPÉRIENCE',
          '2023-2025 — Cheffe de projet SI senior, mission chez le client Sanofi (cabinet de conseil). Pilotage de deux migrations applicatives menées en parallèle, budget tenu.',
          '2021-2023 — Cheffe de projet SI, même cabinet.',
          '2019-2021 — Chargée de projet junior.',
          '',
          'FORMATION',
          'Master MIAGE — Université Lyon 1 — 2019',
          '',
          'ENVIRONNEMENTS : Azure, SQL Server, Agile Scrum',
          'OUTILS : Jira, Confluence, MS Project',
          'CERTIFICATIONS : PMP — PMI',
        ].join('\n'),
      },
    ],
  },
  {
    full_name: 'Julien Fabre',
    review_status: 'qualified',
    source: 'referral',
    notes: 'Déjà dans le vivier avant le lot N.',
    documents: [],
  },
  {
    full_name: 'Julien Fabre',
    // Décision Louis 12/10 (c97) — CV lu = fiche qualifiée.
    review_status: 'qualified',
    source: 'cv',
    notes:
      'Import (lot N) isolé pour revue : un homonyme existe déjà dans le vivier, sans e-mail ni téléphone pour trancher — personne n’a confirmé s’il s’agit de la même personne.',
    documents: [
      {
        filename: 'Julien_Fabre_CV.pdf',
        capturedAt: '2026-09-12',
        // #3811.4 — une section « COMPÉTENCES » dont la lecture ne sort RIEN (une seule compétence composée,
        // pas de liste) : la revue de cette fiche montre le bandeau « Lecture partielle » + le champ de saisie
        // manuelle, au lieu d'un « non trouvé » qui ferait croire que le CV n'en parle pas. Absent du vivier réel.
        text: [
          'JULIEN FABRE',
          '',
          'EXPÉRIENCE',
          '2022-2026 — Consultant fonctionnel, secteur assurance.',
          '',
          'COMPÉTENCES',
          'Gestion de projet',
        ].join('\n'),
      },
    ],
  },
  {
    full_name: 'Samir Ouazani',
    // Décision Louis 12/10 (c97) — CV lu = fiche qualifiée.
    review_status: 'qualified',
    source: 'cv',
    notes:
      'Import (lot N) : une page de ce dossier de compétences n’a pas pu être décodée (scan intercalé dans un fichier autrement numérique). Le texte récupéré est exploitable ; la fiche le dit — certains champs peuvent rester « non trouvé » sans être confirmés absents.',
    documents: [
      {
        filename: 'Samir_Ouazani_dossier_competences.pdf',
        capturedAt: '2026-09-15',
        text: [
          'SAMIR OUAZANI — Ingénieur données (6 ans)',
          '',
          'EXPÉRIENCE',
          '2020-2026 — Ingénieur données, secteur transport. Pipelines de collecte et de qualité de données, migration vers un entrepôt cloud.',
        ].join('\n'),
        partial: true,
      },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Sourcing externe de consultants (#2818)                             */
/* ------------------------------------------------------------------ */

/** L'ESN partenaire dont un profil est cité en « banc partenaire »
 *  (`partner_bench`). Décision Louis 04/10/2026 : plus d'ESN fictive — c'est une
 *  VRAIE ESN OBSERVÉE chez le client de livraison par son brief (`sanofi.json`,
 *  entrée `esn` « Groupe INTM », niveau `observed`, « Externe en poste »,
 *  périmètre « Delivery »). Ce n'est pas un de NOS fournisseurs de données
 *  (`no-vendor-names-in-app.test.ts` vise ceux-là). */

/** La compétence partagée avec le besoin phare « Ingénieur infrastructure —
 *  socle conteneurisé du portail » (SNCF, `skills: [Kubernetes…]` plus
 *  haut) : sans elle, l'écran « Chercher hors vivier » s'ouvrirait vide sur ce
 *  besoin — le même défaut que l'onglet « Sites » cité dans le docblock de
 *  `demo-coverage.ts`. */
export const DEMO_EXTERNAL_SOURCING_SKILL = 'Kubernetes'

type DemoExternalSourcingConsultant = {
  full_name: string
  title: string
  /** Une seule des trois sources du port (`external-sourcing-provider.ts`) —
   *  voir `seedExternalSourcingExamples` pour comment chaque valeur se
   *  traduit en colonnes RÉELLES (`kind`, `engagement_kind`,
   *  `partner_account_id`, `review_status`), jamais une catégorie inventée. */
  sourceKind: 'network_referral' | 'partner_bench' | 'inbound_candidacy' | 'csv_ats_import' | 'external_directory'
}

/**
 * Trois fiches, une par source du port — sans elles, aucune des trois requêtes
 * de `ExternalSourcingService` ne rendait la moindre ligne en démonstration :
 * les sept profils de `DEMO_CONSULTANTS` sont tous des salariés/freelances
 * directs (`engagement_kind` dérivé de `contract_type`, jamais
 * `sous_traitance`), et les personas de `DEMO_CV_IMPORT_CONSULTANTS` n'ont
 * aucune compétence structurée (`consultant_skills`) — leur CV est un texte
 * narratif, jamais extrait en démo. EN PLUS des deux groupes ci-dessus,
 * jamais un rattachement dedans.
 */
export const DEMO_EXTERNAL_SOURCING_CONSULTANTS: readonly DemoExternalSourcingConsultant[] = [
  { full_name: 'Karim Belkacem', title: 'Ingénieur infrastructure', sourceKind: 'partner_bench' },
  { full_name: 'Lison Faure', title: 'Ingénieure plateforme', sourceKind: 'inbound_candidacy' },
  { full_name: 'Marc Thévenin', title: 'Administrateur systèmes', sourceKind: 'csv_ats_import' },
  // #2190.3 (lot P07 30/09) — la source « recommandations et réseau » : une fiche
  // dont `source` dit « cooptation », non encore relue.
  { full_name: 'Inès Marchetti', title: 'Ingénieure cloud', sourceKind: 'network_referral' },
  // #2190.5 / #2190.7 (lot D2 02/10) — un profil DÉJÀ importé depuis l'annuaire externe : la recherche
  // elle-même n'est jamais semée (sans clé, aucun appel réseau), mais ce que l'import a laissé — une fiche
  // du vivier à l'origine tracée — se voit en démonstration. Fictif, sans e-mail ni téléphone.
  { full_name: 'Maëlle R.', title: 'Ingénieure plateforme Kubernetes', sourceKind: 'external_directory' },
]

/* ------------------------------------------------------------------ */
/* Historique d'activité (écran « Historique »)                        */
/* ------------------------------------------------------------------ */

type DemoUserAction = {
  action_type: string
  channel: string | null
  /** Nom de la société du dossier concerné — le seed le résout en `account_id`. */
  company: string | null
  /** Nom du contact concerné — résolu en `contact_id` par le seed. */
  contact: string | null
  /** Ancienneté en heures au moment du seed. Une date en dur vieillirait :
   *  l'écran affiche « il y a … », donc l'ancrage doit être relatif. */
  hours_ago: number
  metadata: Record<string, unknown>
}

/**
 * Une exécution de workflow TERMINÉE, pour que l'Action Center ne s'ouvre pas
 * sur un écran vide en démonstration (règle de parité démo).
 *
 * Elle ne montre que des pas INTERNES — une notification et un rappel : rien
 * n'est censé être parti vers un outil tiers depuis une salle de démo, et un run
 * affichant « email envoyé » ou « fiche CRM créée » laisserait croire qu'un
 * message fictif a réellement quitté le produit.
 */
type DemoWorkflowRun = {
  definition_key: string
  definition_version: number
  trigger: string
  status: string
  company: string
  hours_ago: number
  steps: {
    key: string
    intentType: string
    outcome: string
    attempts: number
    externalRef: string | null
    creditsSpent: number
    reason: string | null
  }[]
}

export const DEMO_WORKFLOW_RUN: DemoWorkflowRun = {
  definition_key: 'dormant_account_revival',
  definition_version: 1,
  trigger: 'account_dormant',
  status: 'done',
  company: 'Société Générale',
  hours_ago: 26,
  steps: [
    {
      key: 'notify_owner',
      intentType: 'notify_user',
      outcome: 'done',
      attempts: 1,
      externalRef: null,
      creditsSpent: 0,
      reason: 'Alerte envoyée au responsable du compte : aucun échange depuis plus de 60 jours.',
    },
    {
      key: 'schedule_decision',
      intentType: 'schedule_reminder',
      outcome: 'done',
      attempts: 1,
      externalRef: null,
      creditsSpent: 0,
      reason: 'Rappel interne enregistré (aucun agenda connecté).',
    },
  ],
}

/**
 * #3532 (lot X80, recette Y23) — UN RUN DE CARTE EXÉCUTÉ SUR SG, pour que « Actions
 * exécutées » et le fil de l'onglet « Historique & preuves » aient une carte réelle à
 * montrer. `card_prepare_message` est la carte du catalogue (`copilot-card-catalog.ts`) : un
 * seul pas, le brouillon généré, jamais envoyé. Aucun contact visé, aucune écriture tierce.
 */
export const DEMO_CARD_RUN = {
  definition_key: 'card_prepare_message',
  company: 'Société Générale',
  hours_ago: 20,
  outcome: 'Brouillon préparé pour relecture. Aucun message n’a été envoyé.',
  targetObject: 'Message d’approche — Société Générale',
  nextStep: 'Relire le brouillon puis l’envoyer toi-même.',
  stepReason: 'Brouillon généré à partir du dossier ; rien n’est parti.',
} as const

/**
 * #2946 — UNE DEMANDE D'APPROBATION Action OS EN ATTENTE, POUR QUE LA TÂCHE
 * `source = 'action_os_approval'` NE RESTE PAS SEEDÉE NULLE PART.
 *
 * `WorkflowRunnerService.requestApproval` pose désormais une tâche « Valider :
 * … » sur le décideur dès qu'un run se fige en attente d'accord (le pont
 * Action OS → Tâche, `createApprovalTasks`) — mais aucun dossier de
 * démonstration n'en portait un : la table `tasks` était bien SEEDÉE (d'autres
 * lignes), donc invisible à la garde par table, alors que ce type de tâche
 * précis n'avait jamais existé en salle.
 *
 * `project_to_expert_push` (p29, `workflow-catalog.ts`) est le SEUL workflow du
 * catalogue dont `minimumLevel` est `n2_user_approval` sur un pas IRRÉVERSIBLE
 * (l'envoi du push profil) — le choix le plus réaliste pour illustrer
 * l'approbation, plutôt que d'inventer un motif qu'aucune définition ne porte.
 *
 * `n2_user_approval`, pas `n3_manager_approval` : le décideur EST l'auteur du
 * run (`createApprovalTasks` pose alors la tâche sur `run.user_id` lui-même) —
 * une seule tâche à seeder, aucun second membre d'équipe à fabriquer.
 *
 * Le run reste `status: 'awaiting_approval'` — RIEN n'exécute son pas
 * `push_profile` (un email fictif ne part jamais d'une salle de démonstration,
 * même raison que `DEMO_WORKFLOW_RUN` juste au-dessus) : la démonstration
 * montre la DEMANDE, pas son issue.
 */
export const DEMO_ACTION_OS_APPROVAL = {
  definition_key: 'project_to_expert_push',
  definition_version: 1,
  trigger: 'project_qualified',
  requiredLevel: 'n2_user_approval',
  hours_ago: 5,
  /** Même phrase que celle que `requestApproval` fige dans `summary` en prod
   *  (`"<intent> — <target>"` par pas nécessitant l'accord). */
  summary: 'Envoyer le push profil relu à l’interlocuteur du projet — Julien Fabre',
  estimated_credits: 0,
} as const

/**
 * #1952 — UN TRAVAIL LONG, EN COURS, DANS LA SALLE DE DÉMONSTRATION.
 *
 * L'analyse de compte est le seul des sept travaux longs de #1952 qui soit à la
 * fois asynchrone et lançable depuis la conversation ; elle porte donc une carte
 * de suivi (`card_account_analysis`). Sans cette ligne, l'Action Center d'une
 * démonstration ne montre que des exécutions TERMINÉES : un prospect ne voit
 * jamais à quoi ressemble un travail de plusieurs minutes pendant qu'il tourne,
 * qui est exactement la promesse de #1952.
 *
 * Trois choix, et leur raison :
 *  - `status: 'running'` — l'état qu'on veut montrer. Rien ne le fera bouger :
 *    une salle de démonstration n'a pas de file d'analyse, et le suivi n'écrit
 *    une issue que sur un job OBSERVÉ (`external_ref` nul ci-dessous) ;
 *  - l'avancement est MESURÉ, jamais simulé : la phrase dit des étapes
 *    réellement franchies, dans la forme exacte que produit le code
 *    (`longJobProgressSentence`) — pas un pourcentage, pas une barre qui défile ;
 *  - aucun message de fil n'est semé avec : `chat_messages` est vide à dessein
 *    en démonstration (« la démonstration consiste à poser une question à
 *    Laura »), et une carte pendue à un tour que personne n'a joué mentirait.
 */
// RAB2 (Louis 10/10 soir) — les cartes de suivi d'analyse annoncent le prix de
// l'analyse PAR DÉFAUT, lu dans la grille (jamais un 8 ni un 10 recopié).
const DEMO_ANALYSIS_CREDITS = creditCostOf('account_analysis')

export const DEMO_COPILOT_LONG_JOB = {
  company: 'Société Générale',
  minutes_ago: 6,
  estimated_credits: DEMO_ANALYSIS_CREDITS,
  /** Le débit OBSERVÉ au lancement — l'analyse se paie à l'envoi, pas à l'arrivée. */
  spent_credits: DEMO_ANALYSIS_CREDITS,
  phases_done: 2,
  phases_total: 4,
} as const

/**
 * #1952.17 — UN TRAVAIL LONG QUE QUELQU'UN A ARRÊTÉ.
 *
 * L'issue « annulée » n'existait pas : la carte repliait l'arrêt volontaire sur
 * l'échec, annonçait « L'analyse a échoué » et invitait à relancer — donc à
 * REDÉBITER. Le chemin est réel et atteignable : on lance l'analyse depuis la
 * conversation, on l'arrête depuis l'écran du compte
 * (`accountsApi.cancelAnalysis` → `AnalysisService.cancelByUser`), qui rend le
 * crédit. Sans cette ligne, une démonstration ne montre jamais l'état terminal
 * qui vient d'être réparé — et c'est précisément l'écran vide qui se découvre en
 * réunion plutôt qu'en CI.
 *
 * Trois choix, et leur raison :
 *  - un AUTRE compte que le travail qui tourne : deux cartes sur le même dossier
 *    liraient comme deux analyses du même compte, ce qui n'arrive pas (le suivi
 *    est unique par lancement) ;
 *  - `spent_credits: 0` — le crédit a été RENDU, et le registre de la démo le
 *    montre. Ce n'est pas « non mesuré » : c'est mesuré à zéro, ce qui est vrai ;
 *  - la phrase d'issue vient de `analysisSettlementSentence`, la fonction du
 *    produit : recopiée ici, elle divergerait le jour où la formulation change.
 *
 * ⚠️ Le débit et son remboursement sont le RÉCIT de la carte, pas un mouvement
 * de registre : `credit_ledger` est vide à dessein en démonstration (« aucun
 * crédit n'est débité en démo »), exactement comme pour le travail qui tourne
 * au-dessus, qui porte déjà ses 8 crédits. Les deux cartes racontent la même
 * histoire ; l'écran de facturation, lui, ne montre aucun mouvement, et c'est
 * ce que sa propre entrée de couverture explique.
 */
export const DEMO_COPILOT_CANCELLED_JOB = {
  company: 'Groupe BPCE',
  minutes_ago: 52,
  estimated_credits: DEMO_ANALYSIS_CREDITS,
  /** Le débit observé au lancement — celui que le remboursement a annulé. */
  debited_credits: DEMO_ANALYSIS_CREDITS,
  /** Le remboursement OBSERVÉ au registre : il couvre le débit, donc « remboursés ». */
  refunded_credits: DEMO_ANALYSIS_CREDITS,
} as const

/**
 * #1952.32 (#2844, lot h9 27/09/2026) — LE TRAVAIL LONG QUI A FINI, POUR QUE
 * LA CARTE MONTRE ENFIN « CE QUI DOIT ÊTRE VÉRIFIÉ ».
 *
 * `CardResult.toVerify` ne se pose QUE sur une carte de suivi d'analyse
 * `done` (`CopilotCardService.settleAnalysisTracking`) — or les deux SEULES
 * cartes semées jusqu'ici ({@link DEMO_COPILOT_LONG_JOB}, running ;
 * {@link DEMO_COPILOT_CANCELLED_JOB}, cancelled) n'atteignent jamais `done` :
 * la ligne ne se montrait donc JAMAIS en salle, quel que soit le
 * fonctionnement réel du produit (raison écrite dans `demo-coverage.ts`
 * jusqu'à ce lot). Cette troisième carte ferme ce trou.
 *
 * Trois choix, et leur raison :
 *  - SNCF, un compte QUE les deux autres cartes ne visent pas — deux
 *    cartes sur le même dossier liraient comme deux analyses du même
 *    compte, ce qui n'arrive pas (le suivi est unique par lancement) ;
 *  - `phases_done === phases_total` — le seul travail des trois qui montre
 *    l'état d'ARRIVÉE, pas un vol en cours ni un arrêt ;
 *  - `toVerify` n'est PAS écrit ici en dur : il est RECALCULÉ au semis à
 *    partir des contacts RÉELLEMENT posés sur SNCF (`email_confidence`
 *    'medium'/'low', densifiés par `demo-contact-density.ts`) via la MÊME
 *    fonction pure que la production (`contactVerificationLine`, GA-26) —
 *    jamais une liste de noms recopiée qui divergerait du jeu de contacts le
 *    jour où il change.
 */
export const DEMO_COPILOT_DONE_JOB = {
  company: 'SNCF',
  minutes_ago: 18,
  estimated_credits: DEMO_ANALYSIS_CREDITS,
  spent_credits: DEMO_ANALYSIS_CREDITS,
  phases_done: 4,
  phases_total: 4,
  /**
   * #3416.x2 — « Ce que ça apprend » : `CardResult.analysisFound` est RECOMPTÉ au
   * semis sur les contacts réellement posés sur ce compte, jamais écrit en dur.
   * Le drapeau fait entrer ce comportement dans l'empreinte du semis : les salles
   * déjà semées sont re-semées et gagnent la ligne.
   */
  found_from_contacts: true,
} as const

/**
 * #3192 (recette prod 02/10) — UN FIL DE LAURA DE ONZE TOURS SUR LE COMPTE PHARE.
 *
 * Le contrôle de densité de réponse (classer la question avant de répondre : une
 * relance « Et X… ? » d'un fil chargé tient en DEUX phrases) ne se voit que sur
 * un fil long : « aucun fil de 10+ tours » en salle comme en production. Onze
 * tours sur SNCF (client de livraison, décision Louis 04/10/2026), qui ne
 * disent QUE ce que le dossier semé dit déjà — le besoin ouvert et les missions
 * (`salesContext`), la voie d'entrée par une entité, les besoins ouverts, la
 * prochaine action de la liste cible. Aucun lien personnel ni déclaration sur
 * une personne réelle (décision Louis 04/10). Les premiers tours
 * sont développés ; le dernier est la relance MICRO, tenue en deux phrases.
 * `demo-long-thread-coverage.spec.ts` compte les tours et les phrases.
 */
export const DEMO_LONG_LAURA_THREAD = {
  // Littéral : `DEMO_DELIVERY_CLIENT` est défini plus bas dans ce fichier ; la garde compare les deux.
  accountName: 'SNCF',
  turns: [
    {
      question: 'Où en est SNCF ?',
      answer:
        'SNCF est le client de livraison de la salle : un groupe piloté par entités, où six directions informatiques métiers gardent leurs équipes. Un besoin y est ouvert et des missions de l’ESN y sont en cours. Plusieurs autres besoins sont suivis, dont le socle conteneurisé du portail et la fiabilisation des flux temps réel. La relation est donc engagée, mais pas verrouillée : le prochain palier du programme de refonte applicative reste à sécuriser.',
    },
    {
      question: 'Quelle est la relation avec eux ?',
      answer:
        'Un besoin ouvert et des missions en cours appuient la relation : ce n’est pas une approche à froid. Elle se lit « besoin ouvert » dans le dossier, une inférence qui cite les missions de l’ESN comme preuve.',
    },
    {
      question: 'Par où entrer pour la suite ?',
      answer:
        'Par une entité, jamais par le groupe : le dossier dit que son référencement dépasse la taille d’une ESN moyenne. On sert un besoin déjà publié, puis on se sert de la mission livrée comme de la référence interne qui ouvre la deuxième entité.',
    },
    {
      question: 'Quels besoins sont ouverts ?',
      answer:
        'Trois ressortent pour la démonstration : « Ingénieur infrastructure — socle conteneurisé du portail », « Ingénieur données — fiabilisation des flux temps réel » et « Consultant sécurité applicative — parcours d’authentification ». D’autres besoins du même client sont ouverts dans l’écran Besoins, avec leur statut.',
    },
    {
      question: 'Détaille-moi le besoin sur le portail.',
      answer:
        'Le besoin « Ingénieur infrastructure — socle conteneurisé du portail » demande un profil Kubernetes pour poser le socle de conteneurs du programme de refonte applicative. Il est lié au chantier de refonte, le palier que le client veut sécuriser en premier. Le matching se lance depuis l’écran du besoin, et c’est toi qui valides la shortlist avant tout envoi. Aucun profil n’est transmis au client sans ton accord.',
    },
    {
      question: 'Quelle première approche pour l’entité ?',
      answer:
        'Écrire à la direction technique de l’entité, avec la référence d’une mission comparable plutôt qu’un discours général. L’objectif du premier échange est de caler un rendez-vous sur le palier suivant.',
    },
    {
      question: 'Qui connaît-on déjà là-bas ?',
      answer:
        'Personne de nommé : le dossier porte des sièges, sans nom, et deux mandataires sociaux qu’on n’ouvre pas en première approche. Aucun lien personnel n’est déclaré sur ce compte.',
    },
    {
      question: 'Que faire cette semaine sur ce compte ?',
      answer:
        'Deux gestes : écrire à la direction technique de l’entité pour caler un rendez-vous, puis envoyer la référence de mission comparable. Les deux figurent comme prochaines actions de la liste cible, et rien n’est envoyé sans ton clic.',
    },
    {
      question: 'Et le rendez-vous de tout à l’heure ?',
      answer:
        'Le brief est prêt : le rendez-vous se lit comme une opportunité ouverte, avec la posture à tenir, deux résultats à obtenir et trois questions à poser.',
    },
    // #4445.1 — une réponse de plus de cinq puces : en salle, la liste se REPLIE (5 visibles + « Voir le 1 autre »).
    {
      question: 'Que préparer avant d’écrire à l’entité ?',
      answer:
        'Six points à passer en revue :\n- Relire le besoin ouvert et les missions en cours.\n- Choisir la mission comparable qui sert de référence.\n- Repérer la direction technique de l’entité.\n- Rédiger deux ou trois questions pour le premier échange.\n- Valider la shortlist avant tout envoi de profil.\n- Relire le message, que tu enverras toi-même.',
    },
    {
      question: 'Résume-moi tout ça en trois points.',
      answer:
        '1. La relation est engagée : besoin ouvert, missions en cours. 2. On entre par une entité, sur un besoin publié, jamais par le groupe. 3. Cette semaine : écrire à la direction technique, puis envoyer la référence comparable.',
    },
    {
      question: 'Et les achats, on sait comment ça passe ?',
      answer:
        'Pas encore : le circuit d’achat est une question à poser au premier atelier. La réponse décidera du calendrier.',
    },
  ],
} as const

/**
 * Théo L1 — sélecteur avancé — UN FIL DE LAURA PARTI D'UNE OFFRE D'EMPLOI (décision Louis 22/10/2026).
 *
 * Un fil NOMMÉ sur le compte phare, comme ceux qu'ouvre « Demander à Laura »
 * depuis le détail d'une offre de la Veille : la question porte sur UNE
 * offre semée du compte phare, et la réponse ne dit que ce que son signal dit
 * déjà — la date, le lieu, l'équipe et le manager possible étayés par le texte
 * de l'offre, la lecture commerciale du dossier. Aucune source nommée, aucun
 * nom de personne. `demo-job-offer-thread-coverage.spec.ts` le confronte au jeu.
 */
export const DEMO_JOB_OFFER_THREAD = {
  // Littéral : `DEMO_DELIVERY_CLIENT` est défini plus bas dans ce fichier ; la garde compare les deux.
  accountName: 'SNCF',
  offerLabel: 'Offre publiée sur la page carrières : Architecte cloud — Saint-Denis',
  daysAgo: 2,
  turns: [
    {
      question: 'Que me dit cette offre d’architecte cloud chez SNCF ?',
      answer:
        'L’offre est publiée le 2 octobre 2026 sur la page carrières du groupe, pour Saint-Denis. Son texte situe le poste dans l’équipe plateforme cloud, avec un responsable de la plateforme cloud comme manager possible — une fonction, pas un nom. Un poste d’architecte ouvert dit un chantier de plateforme en cours : c’est le moment de proposer du renfort en régie.',
    },
    {
      question: 'Comment je l’approche ?',
      answer:
        'Par l’équipe plateforme cloud plutôt que par les ressources humaines qui ont rédigé l’offre : propose un renfort sur le chantier, avec la référence d’une mission comparable. Tu prépares le message, je ne l’envoie pas — c’est toi qui le relis et l’envoies.',
    },
  ],
}
/**
 * #3775.a (lot M12, 09/10/2026) — UN FIL QUI CITE UNE SOURCE PERSONNELLE.
 *
 * La ligne orange de « Partager dans l'espace » (`ShareConversation`,
 * `share.restrictedSourceNotice` : « un collègue qui ouvre ce lien pourra le
 * lire, même sans accès à cette connexion ») ne s'observait qu'avec une
 * messagerie personnelle connectée — aucune salle n'en a, et la recette prod
 * l'a marquée « non prouvable » deux fois. Ce fil, DATÉ de cinq jours, porte une
 * réponse dont la source a été marquée personnelle À L'ÉCRITURE
 * (`restricted: true`, posé en production par `markRestrictedSources`) : c'est
 * précisément le cas que la ligne protège — un extrait déjà écrit reste lisible
 * même quand la connexion n'existe plus. La réponse ne cite que la date et le
 * silence d'un échange, jamais un corps de message (doctrine). Aucune personne
 * réelle n'est nommée. `demo-restricted-source-thread.spec.ts` le passe par la
 * seule porte d'écriture du contexte (`persistedChatContext`).
 */
export const DEMO_RESTRICTED_SOURCE_THREAD = {
  // Littéral : `DEMO_DELIVERY_CLIENT` est défini plus bas dans ce fichier.
  accountName: 'SNCF',
  daysAgo: 5,
  question: 'Où en est mon dernier échange avec les achats de SNCF ?',
  answer:
    'D’après ta messagerie personnelle, ton dernier échange avec l’équipe achats de SNCF date du 29 septembre et n’a pas reçu de réponse depuis. Une relance courte cette semaine reste raisonnable : propose un créneau pour le premier atelier.',
  context: {
    active: {
      profile: { present: true, name: null },
      account: { present: true, name: 'SNCF', as_of: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [
      { kind: 'email', label: 'Ta messagerie personnelle', as_of: '2026-09-29', restricted: true },
      { kind: 'account_dossier', label: 'Dossier SNCF', as_of: null },
    ],
    not_consulted: [],
  },
} as const

/**
 * #2429.9 (épopée #2852, lot P07 30/09/2026) — LE PLAN DE LA CONVERSATION
 * D'EXEMPLE, ET SA VERSION 2. La réponse d'exemple de Laura porte un bloc
 * `action_plan` (version 1 = le texte du message, jamais réécrit) ; la version 2
 * est une modification d'un humain (une étape précisée) : l'écran montre
 * « version 2 » et l'historique, au lieu d'une capacité invisible en réunion
 * (règle #9). Les noms de comptes sont ceux déjà semés dans cette conversation.
 */
export const DEMO_SAMPLE_PLAN_V1 = {
  type: 'action_plan' as const,
  title: 'Cette semaine',
  objective: 'Ouvrir une porte chez les deux comptes les plus chauds.',
  steps: [
    { label: 'Appeler SNCF sur le besoin publié', when: 'Lundi' },
    { label: 'Préparer le point Groupe BPCE', when: 'Mercredi' },
  ],
}
export const DEMO_SAMPLE_PLAN_V2 = {
  ...DEMO_SAMPLE_PLAN_V1,
  steps: [
    {
      label: 'Appeler SNCF sur le besoin publié',
      detail: 'Demander qui porte le besoin côté data.',
      when: 'Lundi',
    },
    { label: 'Préparer le point Groupe BPCE', when: 'Mercredi' },
    { label: 'Relancer Société générale avant le renouvellement', when: 'Vendredi' },
  ],
}

/**
 * #3294 / #3278 — « COMPTES OUVERTS NON ÉTENDUS » ENFIN DÉMONTRABLE. Le diagnostic du maillon faible veut ≥ 3 comptes
 * ouverts à UN seul contact, la moitié ou plus des comptes ouverts joignables ; les cinq comptes ouverts de la salle
 * portent des dizaines de contacts, la famille restait « non évaluée » (recette Z2 04/10).
 *
 * ⚠️ DÉCISION LOUIS 05/10 (PR #3615, `demo-partner-esn-not-accounts.spec.ts`) : une ESN partenaire n'est PAS un compte
 * prospect — la première version de ce semis (Inetum, Aubay, Talan, SII, Devoteam) remplissait /accounts de comptes
 * quasi vides, exactement ce que la décision refuse. Ce sont ici de grands COMPTES CLIENTS réels d'une ESN (Airbus,
 * Orange, EDF, Renault, Thales), réduits à ce qui est public et sans risque — nom, secteur, site, siège social, une
 * ligne de lecture — avec UN siège de décision sans nom chacun (`roleSeat` : jamais une personne inventée sur une
 * société réelle). Aucun effectif, chiffre d'affaires, SIREN ni score affirmé. 5 / 10 comptes joignables = la moitié.
 *
 * 12/10/2026 — RETRAIT ASSUMÉ PAR LOUIS (craft rule n°9, pas un contournement de test) : « un compte ouvert à un seul
 * contact n'arrive jamais dans la vraie vie ». Airbus, EDF, Renault et Thales sont devenus des dossiers ALIMENTÉS par de
 * vraies analyses ({@link DEMO_ANALYSED_ACCOUNTS}) ; Safran, BoursoBank et les dix comptes minces ajoutés un temps
 * (Michelin, Saint-Gobain, Schneider Electric, Air France-KLM, La Poste, Carrefour, Bouygues, Vinci, AXA, L'Oréal) sont
 * RETIRÉS : la démo ne fabrique pas de comptes quasi vides pour montrer « comptes ouverts non étendus » (classé « vide à
 * dessein », `DEMO_WEAKEST_LINK_EXTENSION_COVERAGE`). Il ne reste ici qu'Orange, riche : il porte les contacts réels du
 * relevé que Théo a déposé dans le Drive « DÉMO CLIENTS » (`data/orange-consultants.csv`, voir `orange-csv-mapping.ts`).
 * Aucun compte d'extension ne peut plus naître à un siège sans nom : `contacts` et `nextAction` sont obligatoires.
 *
 * 15/10/2026 — Safran et VINCI REVIENNENT, RICHES cette fois, avec Crédit Agricole et Enedis : chacun alimenté par le
 * dossier de compte que Théo a déposé (`dossierAccountFacts`, brief converti par `convert:account-dossier`) — des
 * centaines de contacts nommés, entités, sites, organigramme. Le retrait du 12/10 visait les comptes MINCES ; il tient.
 */
const EXTENSION_ACCOUNT_FACTS: readonly {
  company_name: string
  sector: string
  website: string
  headquarters: string
  /** Entités et divisions PUBLIQUES du groupe — jamais un effectif ni un chiffre. */
  subsidiaries: string[]
  /** La lecture de compte : faits publics et durables, aucun chiffre, aucune date. */
  reading: string
  /**
   * 12/10/2026 — un compte ALIMENTÉ par un relevé (Orange, annexe du Drive « DÉMO CLIENTS ») : OBLIGATOIRE. Plus aucun
   * compte d'extension à un siège sans nom (Louis 12/10 : « ça n'arrive jamais dans la vraie vie »).
   */
  contacts: DemoContact[]
  /**
   * 12/10/2026 — les fiches dont l'organigramme du brief est lu (`briefOrgGraph`) : celles du compte, pour qu'un nœud du
   * graphe soit toujours un contact semé. Absent : les personnes du brief.
   */
  orgSeeds?: Parameters<typeof briefOrgGraph>[2]
  /**
   * Recette 12/10/2026 — les entités du relevé qui ne sont pas en France, avec leur pays (code ISO) : lisibles au graphe
   * (`country`) et aux entités du compte (`entities_exhaustive.region`), pas seulement dans une étiquette de contact.
   */
  foreignEntities?: readonly { name: string; country: string }[]
  /**
   * 13/10/2026 (Louis) — PARITÉ AVEC GROUPE BPCE : besoins, signaux de recrutement, vision, programmes, stack, domaines,
   * indicateurs, unités, plan d'action, tels que `orange-public-complement.ts` et `orange-public-reading.ts` les fournissent.
   */
  withPublicComplement?: boolean
  nextAction: { title: string; objective: string; expectedResult: string; dueInDays: number }
}[] = [
  {
    company_name: 'Orange',
    withPublicComplement: true,
    sector: 'Télécommunications',
    website: 'https://www.orange.com',
    // 12/10/2026 — le siège n'est PAS confirmé par le dossier de compte (« Paris » dans la base, Issy-les-Moulineaux en
    // hypothèse, à vérifier) : la colonne le dit, elle n'affirme pas la commune.
    headquarters: 'Paris (siège à vérifier)',
    // 12/10/2026 — les entités du relevé de Théo (Drive « DÉMO CLIENTS »), hors le groupe lui-même ; les filiales hors
    // France y restent sous leur propre nom (jamais mêlées au siège France).
    subsidiaries: ORANGE_SEED.entities.filter(entity => entity !== DEMO_ORANGE_COMPANY),
    reading:
      'Orange : opérateur de télécommunications qui sert le grand public et les entreprises, ces dernières à travers sa filiale Orange Business — à la fois concurrent et canal de rang 2 pour une ESN : deux logiques d’achat à distinguer. Compte alimenté par le dossier de compte déposé le 12/10/2026 : fiche légale (seul le SIREN est confirmé), chiffres de marché sourcés, projets, achats, ESN observées en poste, décideurs en tête, puis les contacts du relevé avec leurs coordonnées du groupe. « En poste » vient de l’export 2024 et l’organigramme est reconstitué, pas officiel.',
    // 12/10/2026 — les fiches du relevé ENRICHIES du dossier de compte (décideurs en tête, coordonnées du groupe Orange EN
    // CLAIR, jamais inventées ; voir `orange-csv-mapping.ts`). `personKeys` est une clé de relevé, pas un champ du jeu.
    contacts: ORANGE_SEED.contacts.map(({ personKeys: _personKeys, ...contact }) => namedContact(contact)),
    // L'organigramme du compte est lu des mêmes fiches (les décideurs du dossier) : jamais d'autre nom que le contact semé.
    orgSeeds: ORANGE_SEED.contacts,
    foreignEntities: ORANGE_SEED.foreignEntities.map(name => ({ name, country: orangeEntityCountry(name) })),
    nextAction: {
      title: 'Choisir l’entité Orange à ouvrir en premier',
      objective:
        'Passer du dossier de compte (décideurs, ESN en poste, achats) à une première porte d’entrée qualifiée chez Orange.',
      expectedResult: 'Une entité retenue et un premier contact en poste à approcher.',
      dueInDays: 10,
    },
  },
  // 15/10/2026 — les quatre dossiers de compte déposés par Théo (Drive « DÉMO CLIENTS »), convertis par
  // `convert:account-dossier`. Tout ce que la fiche porte vient du brief : siège, entités, contacts (coordonnées du
  // groupe EN CLAIR, jamais inventées), organigramme lu des mêmes fiches. Ce que les dossiers ne disent pas (plan
  // d'action, angles d'attaque, défis SI) reste vide — voir `DEMO_ACCOUNT_DOSSIERS_COVERAGE`.
  dossierAccountFacts({
    company_name: 'Crédit Agricole',
    sector: 'Banque et assurance',
    website: 'https://www.credit-agricole.com',
    reading:
      'Crédit Agricole : groupe bancaire mutualiste — caisses régionales, filiales métiers et une informatique groupe — où l’achat de prestations se joue entité par entité. Compte alimenté par le dossier de compte déposé le 15/10/2026 : fiche, chiffres de marché sourcés, projets, achats, besoins en base, ESN observées (indice, jamais un référencement prouvé), décideurs en tête puis les contacts du relevé avec leurs coordonnées du groupe.',
    nextAction: {
      title: 'Choisir l’entité Crédit Agricole à ouvrir en premier',
      objective: 'Passer du dossier de compte à une première porte d’entrée qualifiée, entité par entité.',
      expectedResult: 'Une entité retenue et un premier décideur en poste à approcher.',
      dueInDays: 10,
    },
  }),
  dossierAccountFacts({
    company_name: 'VINCI',
    sector: 'Concessions et construction',
    website: 'https://www.vinci.com',
    reading:
      'VINCI : groupe de concessions (aéroports, autoroutes) et de construction, très décentralisé, avec une ESN captive dans le groupe. Compte alimenté par le dossier de compte déposé le 15/10/2026 : fiche légale, marché par métier, projets data et IA, postes ouverts, portails achats, ESN et intégrateurs cités, décideurs en tête puis les contacts du relevé avec leurs coordonnées du groupe.',
    nextAction: {
      title: 'Choisir le pôle VINCI à ouvrir en premier',
      objective:
        'Passer du dossier de compte à une première porte d’entrée qualifiée (Airports, Highways ou Autoroutes).',
      expectedResult: 'Un pôle retenu et un premier décideur en poste à approcher.',
      dueInDays: 10,
    },
  }),
  dossierAccountFacts({
    company_name: 'Enedis',
    sector: 'Énergie — distribution d’électricité',
    website: 'https://www.enedis.fr',
    reading:
      'Enedis : gestionnaire du réseau de distribution d’électricité, entité adjudicatrice — au-dessus des seuils, l’achat passe par un avis européen puis un référencement. Compte alimenté par le dossier de compte déposé le 15/10/2026 : marchés de référencement, lots d’achats, organisation de la DSI, territoires, applications, prestataires cités, puis les contacts du relevé avec leurs coordonnées du groupe.',
    nextAction: {
      title: 'Qualifier la voie d’accès à Enedis',
      objective: 'Établir si l’entrée passe par un titulaire du référencement (rang 2) ou par un lot ouvert.',
      expectedResult: 'Une voie d’accès retenue et un premier contact de la DSI à approcher.',
      dueInDays: 10,
    },
  }),
  dossierAccountFacts({
    company_name: 'Safran',
    sector: 'Aéronautique, espace et défense',
    website: 'https://www.safran-group.com',
    reading:
      'Safran : groupe aéronautique, spatial et de défense fait de sociétés qui décident chacune de leur informatique, avec deux ERP qui cohabitent (SAP sur l’industrie, Infor M3 sur la finance et plusieurs sociétés) et un portail achats unique. Compte alimenté par le dossier de compte déposé le 15/10/2026 : sociétés du groupe, paysage SI, signaux, achats, ESN et intégrateurs cités, puis les profils relevés (sans coordonnée, employeur LinkedIn non vérifié).',
    nextAction: {
      title: 'Vérifier l’ERP de la société Safran visée',
      objective:
        'Avant tout rendez-vous, établir si la société est sur SAP ou sur Infor M3 — proposer l’un à l’autre fait perdre le compte.',
      expectedResult: 'Une société retenue, son ERP vérifié et un premier responsable de domaine à approcher.',
      dueInDays: 10,
    },
  }),
]

/**
 * 15/10/2026 — un compte d'extension alimenté par un DOSSIER DE COMPTE (Crédit Agricole, VINCI, Enedis, Safran) : siège,
 * entités et contacts lus du brief converti — jamais écrits à la main, jamais devinés. L'organigramme est lu des mêmes
 * fiches (`orgSeeds`) : un nœud du graphe est toujours un contact semé.
 */
function dossierAccountFacts(input: {
  company_name: string
  sector: string
  website: string
  reading: string
  nextAction: { title: string; objective: string; expectedResult: string; dueInDays: number }
}): (typeof EXTENSION_ACCOUNT_FACTS)[number] {
  const brief = COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[input.company_name]
  if (!brief) throw new Error(`Aucun dossier de compte pour « ${input.company_name} »`)
  const seeds = briefContactSeeds(brief, new Set())
  return {
    ...input,
    headquarters: briefHeadquarters(brief),
    subsidiaries: brief.entities
      .filter(entity => entity.status === 'active' && entity.name !== input.company_name)
      .map(entity => entity.name),
    contacts: seeds.map(contact => namedContact(contact)),
    orgSeeds: seeds,
  }
}

/**
 * D13 (Louis 06/10/2026) — UN compte d'extension REMPLI, par le chemin des dossiers de brief : la même forme que
 * {@link briefDossier} (identité « non résolue », palier 5 « non arbitré » D10), écrite par `seedDossier` — jamais un
 * second INSERT. Ce que la fiche ne porte PAS, et pourquoi : aucun effectif, chiffre d'affaires, SIREN ni NAF (un
 * numéro qu'on ne peut pas corroborer ne se devine pas), aucun signal daté, aucun défi SI (une analyse qu'on n'a pas
 * faite), aucun contact de plus qu'UN siège sans nom — le diagnostic « comptes ouverts non étendus » (#3294) reste
 * démontrable.
 */
type DemoExtensionAccount = DemoDossier['account'] & {
  contacts: DemoContact[]
  /**
   * D13 — l'ACTION à programmer, pour que « À programmer » (compte suivi sans tâche ouverte à venir) ne contredise
   * plus « Dernière analyse : aujourd'hui ». C'est un geste à faire, pas un fait sur la société : il découle du
   * diagnostic (#3294) — un seul siège identifié, le second reste à trouver.
   */
  nextAction: { title: string; objective: string; expectedResult: string; dueInDays: number }
  /** 12/10/2026 — les comptes ANALYSÉS portent, comme un dossier, leurs angles d'attaque et leur plan d'action réels. */
  attackAngles?: DemoAttackAngle[]
  actionPlan?: DemoDossier['actionPlan']
}

function extensionAccount(facts: (typeof EXTENSION_ACCOUNT_FACTS)[number]): DemoExtensionAccount {
  const { company_name, sector, website, headquarters, subsidiaries, reading } = facts
  const account: DemoExtensionAccount = {
    company_name,
    tags: ['grand compte'],
    siren: null,
    naf_code: null,
    registry_country: 'FR',
    sector,
    employees: '',
    revenue: '',
    headquarters,
    website,
    logo_url: null,
    subsidiaries,
    it_challenges: [],
    recent_signals: [],
    priority_score: 5,
    priority_justification: reading,
    commercial_status: 'watching',
    priority_gate: 'pending',
    gate_reason: null,
    sprint: null,
    sprint_exit_reason: null,
    relationship_memory: null,
    raw_analysis: {
      demo_seed: true,
      // D10 (Louis 05/10) — palier 5 « non arbitré » (#3420) : l'écran le dit sous le score.
      score_unarbitrated: true,
      entity_resolution: {
        state: 'unresolved',
        kind: null,
        canonical_id: null,
        commercial_name: company_name,
        legal_name: null,
        country: null,
        identifiers: {},
        domain: new URL(website).hostname.replace(/^www\./, ''),
        naf_code: null,
        naf_label: null,
        location: null,
        parent_names: [],
        children_count: null,
        sources: ['normalized_name', 'official_domain'],
        confidence: null,
        reasons: ['Aucun identifiant légal corroboré — dossier construit à partir du nom et du site officiel.'],
        question: null,
        resolved_at: null,
      },
      headquarters,
    },
    contacts: facts.contacts,
    nextAction: facts.nextAction,
  }
  // 12/10/2026 — un compte d'extension qui porte un DOSSIER DE COMPTE (Orange) : le brief voyage dans
  // `raw_analysis.commercial_brief` (ce que lit l'onglet « Ce que je sais »), ses projets entrent dans la Veille
  // (`recent_signals`), ses ESN dans « ESN présentes » (voir `seedExtensionAccounts`), et la fiche porte ses sites, ses
  // entités et son organigramme — la même forme que les dossiers de brief, par le même code. Ce que le dossier ne
  // dit pas reste vide : ni plan d'action, ni angle d'attaque, ni défi SI, ni effectif, ni SIREN en colonne.
  const brief = COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[company_name]
  if (!brief) return account
  // 13/10/2026 — parité BPCE : les signaux de recrutement, de vision et de projets (datés au semis) entrent AVANT ceux du
  // brief (qui ne redouble jamais un libellé), les besoins deviennent des défis SI.
  const itChallenges = facts.withPublicComplement ? orangeItChallenges() : account.it_challenges
  const complemented = facts.withPublicComplement
    ? {
        ...account,
        it_challenges: itChallenges,
        recent_signals: orangePublicSignals(),
        raw_analysis: { ...account.raw_analysis, it_challenges: itChallenges },
      }
    : account
  const briefed = withCommercialBrief(complemented, brief)
  const publicReading = facts.withPublicComplement
    ? {
        business_description: ORANGE_BUSINESS_DESCRIPTION,
        it_implications_for_esn: ORANGE_IT_IMPLICATIONS,
        pains: orangePains(brief),
        program_names: orangePrograms(brief),
        detected_tech_stack: [...ORANGE_DETECTED_TECH_STACK],
        structural_reading_axes: orangeStructuralAxes(brief),
        ecosystem_third_parties: orangeEcosystem(),
        opportunity_domains: orangeOpportunityDomains(),
        financial_indicators: orangeFinancialIndicators(brief),
        data_reliability_notes: orangeReliabilityNotes(brief),
        technology_stack: orangeTechnologyStack(),
        // 14/10/2026 — la lecture en sept axes et la fiabilité du dossier : plus de bandeau « antérieure à… » en démo.
        evaluation: { dossier_read: orangeDossierRead(brief) },
        data_confidence: ORANGE_DATA_CONFIDENCE,
        competitors: orangeCompetitors(brief),
      }
    : {}
  const filled = withDemoOrgCoverage(
    {
      ...briefed,
      raw_analysis: {
        ...briefed.raw_analysis,
        ...publicReading,
        score_factors: briefScoreFactors(brief),
        sites_france: briefSitesFrance(brief),
        entities_exhaustive: [
          ...briefEntitiesExhaustive(brief),
          ...(facts.foreignEntities ?? []).map(entity => ({
            name: entity.name,
            type: 'filiale',
            parent: null,
            region: entity.country,
            estimated_headcount: null,
            it_autonomy: null,
            relevance: null,
            relevanceReason: 'Entité hors France citée par le relevé du compte.',
            is_active: true,
            actionable: null,
          })),
        ],
        org: {
          orgGraph: briefOrgGraph(
            brief,
            `e-${normalizePersonName(company_name).replace(/ /g, '-')}`,
            facts.orgSeeds ?? briefContactSeeds(brief, new Set()),
            // Un compte alimenté par un relevé (Orange) : ses contacts en poste entrent au graphe (recette 12/10).
            {
              withCurrentContacts: Boolean(facts.orgSeeds),
              pathFromDecisionMakers: Boolean(facts.orgSeeds),
              extraEntities: facts.foreignEntities ?? [],
            },
          ),
          ...(facts.withPublicComplement
            ? {
                units: ORANGE_ORG_UNITS,
                decisionChain: { ...ORANGE_DECISION_CHAIN, estimatedCycleLength: null, budgetAuthority: null },
              }
            : {}),
        },
      },
    },
    account.contacts,
  )
  // 13/10/2026 — parité BPCE : des pistes d'approche (un angle par domaine) et un plan d'action, lus du brief complété.
  return facts.withPublicComplement
    ? {
        ...filled,
        attackAngles: orangeAttackAngles(),
        actionPlan: {
          strategy_type: 'land_and_expand',
          strategy_justification:
            'Le dossier dit trois choses : aucun référencement ESN n’est confirmé, le circuit passe par le portail fournisseurs officiel, et les chantiers lourds (SFR, datacenters souverains, IA, cyber) naissent côté entités. On qualifie le circuit, puis on entre par une offre d’emploi ouverte ou le besoin déjà en présentation.',
          weeks: briefActionPlanWeeks(brief),
        },
      }
    : filled
}

export const DEMO_EXTENSION_ACCOUNTS: readonly DemoExtensionAccount[] =
  EXTENSION_ACCOUNT_FACTS.map(extensionAccount).map(withDemoDossierRead)

/**
 * #4116 (13/10/2026) — LES APPELS D'OFFRES EUROPÉENS d'un compte analysé (craft rule 9). EDF publie ses achats
 * informatiques au Journal officiel de l'UE (entité adjudicatrice) : deux avis RÉELS, titre, acheteur, CPV et DATE DE
 * PUBLICATION relus le 13/10/2026 sur l'API de la source (« EDF SA », CPV 72* / 48*, dans la fenêtre de 24 mois de la
 * collecte). Les dates sont les VRAIES dates de publication, jamais inventées ni glissantes ; l'avis ne porte ni lieu
 * ni date limite : elles restent nulles (« on n'affiche pas ce qu'on n'a pas »). ⚠️ Fenêtre de 24 mois : ces avis
 * (novembre 2024) sortent de la source fin novembre 2026 — les remplacer alors par des avis plus récents.
 * La source n'est jamais nommée (le libellé de l'écran est « Marchés publics »).
 */
function demoPublicTendersOf(company: string): Array<Record<string, string | null>> {
  if (company !== 'EDF') return []
  return [
    {
      title:
        'Accord Cadre pour la fourniture d’une plateforme externalisée permettant des communications vidéo, audio et messagerie instantanée à sécurité renforcée',
      buyer: 'EDF SA',
      location: null,
      department: null,
      published_date: '2024-11-29',
      deadline: null,
      cpv: '72500000, 72000000',
      url: 'https://ted.europa.eu/fr/notice/-/detail/729388-2024',
    },
    {
      title: 'Fourniture & maintenance licences de SAILPOINT et d’expertise sur le produit',
      buyer: 'EDF SA',
      location: null,
      department: null,
      published_date: '2024-11-25',
      deadline: null,
      cpv: '48000000',
      url: 'https://ted.europa.eu/fr/notice/-/detail/718169-2024',
    },
  ]
}

/**
 * #3915.decp (décision Louis 16/10/2026) — UN MARCHÉ PUBLIC ATTRIBUÉ d'un compte analysé (craft rule 9). Fait RÉEL,
 * relu le 16/10/2026 sur la source ouverte des marchés attribués (millésime vivant, recherche par SIREN TITULAIRE
 * 428677124, THALES SERVICES NUMERIQUES SAS) : objet, CPV, durée, montant et DATE DE NOTIFICATION tels que publiés,
 * jamais inventés. Le compte est le TITULAIRE : aucune entreprise tierce n'y est désignée comme concurrent installé.
 * L'acheteur n'est publié que par son SIRET : non résolu ici, il reste nul (« on n'affiche pas ce qu'on n'a pas »).
 * ⚠️ Fenêtre de 24 mois : ce marché (septembre 2026) sort de la collecte en septembre 2028.
 * La source n'est jamais nommée (le libellé de l'écran est « Marchés publics attribués »).
 */
function demoAwardedContractsOf(company: string): Array<Record<string, string | number | null>> {
  if (company !== 'Thales') return []
  return [
    {
      title:
        'Prestations intellectuelles informatique au profit du Ministère de l’Europe et des affaires étrangères et de l’Agence pour l’enseignement français à l’étranger - Innovation et expertise DATA-IA',
      buyer: null,
      winner: 'THALES SERVICES NUMERIQUES SAS',
      amount: 22500000,
      location: null,
      department: '44',
      notified_date: '2026-09-01',
      cpv: '72000000',
      url: null,
    },
  ]
}

/**
 * #4416.3 (craft n°9) — « Plan pour <prénom> » doit se voir sur une fiche de la démo hors SNCF : DEUX étapes e-mail visent
 * Till Rausch (CIO Thales Deutschland, e-mail pro porté par l'analyse), rangées dans la phase « MOIS 1 » du MÊME plan
 * — celui du blob d'analyse (lu par la fiche) ET celui de la table, jamais deux sources. Le nom est le `full_name` du
 * contact : c'est la clé de jointure. L'analyse réelle n'en nomme aucune ; ces deux étapes sont semées pour la démo et
 * ne prétendent à aucun message déjà rédigé (le préparateur rédige à l'ouverture, rien ne part sans validation).
 */
const DEMO_THALES_DEUTSCHLAND_STEPS: ReadonlyArray<Record<string, string>> = [
  {
    action_id: 'action_month1_till_1',
    action:
      'Écrire à Till Rausch (CIO Thales Deutschland) pour vérifier si le périmètre allemand accepte un dispositif transfrontalier cloud/SRE.',
    contact: 'Till Rausch',
    channel: 'email',
    deadline: 'J+7',
    kpi: 'Réponse sur l’éligibilité géographique',
    expectedOutcome: 'Éligibilité du dispositif transfrontalier confirmée ou écartée.',
  },
  {
    action_id: 'action_month1_till_2',
    action: 'Relancer Till Rausch avec un cadrage court : runbooks, continuité et contrôles d’accès documentés.',
    contact: 'Till Rausch',
    channel: 'email',
    deadline: 'J+14',
    kpi: 'Échange de cadrage obtenu',
    expectedOutcome: 'Un échange de cadrage de 30 minutes avec la direction IT allemande.',
  },
]

/** Range les étapes de démo dans la phase « MOIS 1 » d'une liste de phases (`actions`) ; rien d'autre n'est touché. */
function withDemoThalesSteps<T extends { name?: unknown; actions?: unknown }>(phases: readonly T[]): T[] {
  return phases.map(phase =>
    phase.name === 'MOIS 1' && Array.isArray(phase.actions)
      ? { ...phase, actions: [...phase.actions, ...DEMO_THALES_DEUTSCHLAND_STEPS] }
      : phase,
  )
}

/** Le blob d'analyse de Thales avec ses deux étapes de démo dans `plan.actionPlan.phases` (la liste que lit la fiche). */
function thalesRawWithDemoSteps(company: string, raw: Record<string, unknown>): Record<string, unknown> {
  if (company !== 'Thales') return raw
  const plan = raw['plan'] as Record<string, unknown> | undefined
  const actionPlan = plan?.['actionPlan'] as Record<string, unknown> | undefined
  const phases = actionPlan?.['phases']
  if (!plan || !actionPlan || !Array.isArray(phases)) return raw
  return { ...raw, plan: { ...plan, actionPlan: { ...actionPlan, phases: withDemoThalesSteps(phases) } } }
}

/** #3278.r42 — `plan.recommendedRoute` de l'analyse + les citations semées ; rien si le compte n'a pas de route. */
function routeWithEvidence(company: string, analysis: Record<string, unknown>): Record<string, unknown> {
  const evidence = demoRouteEvidenceOf(company)
  const plan = analysis['plan']
  if (Object.keys(evidence).length === 0 || typeof plan !== 'object' || plan === null) return {}
  const route = (plan as Record<string, unknown>)['recommendedRoute']
  if (typeof route !== 'object' || route === null) return {}
  return { plan: { ...plan, recommendedRoute: { ...route, ...evidence } } }
}

/**
 * 12/10/2026 — LES QUATRE COMPTES ANALYSÉS (Louis) : Airbus, EDF, Renault, Thales, alimentés par de VRAIES analyses
 * lancées en production puis épurées (`demo-analysed-accounts.ts`, `data/analysed-accounts/*.json`). Même chemin
 * d'écriture que tous les dossiers (`seedExtensionAccounts` → `seedDossier`) : fiche, `raw_analysis`, contacts, entités
 * dérivées, angles d'attaque et plan d'action. Le score et le rang des contacts sont ceux de l'analyse — ni recalculés
 * ni inventés ; ce qu'elle n'a pas mesuré reste `null` (jamais 0).
 */
/** #4760 — les besoins historiques d'un compte analysé ; `undefined` quand la couche n'en porte aucun (rien à nommer). */
function historicalNeedsOf(rawAnalysis: unknown): ReturnType<typeof buildHistoricalNeeds> | undefined {
  return buildHistoricalNeeds(readSignalLayers(rawAnalysis)) ?? undefined
}

function analysedAccount(company_name: string, file: AnalysedAccountFile): DemoExtensionAccount {
  const { account } = file
  const publicTenders = demoPublicTendersOf(company_name)
  const awardedContracts = demoAwardedContractsOf(company_name)
  return {
    company_name,
    tags: ['grand compte'],
    siren: account.siren,
    naf_code: account.naf_code,
    registry_country: 'FR',
    sector: account.sector,
    employees: account.employees,
    revenue: account.revenue,
    headquarters: account.headquarters,
    website: account.website,
    // On ne redessine pas la marque d'un tiers, et le logo de l'export venait d'un fournisseur (règle 2).
    logo_url: null,
    subsidiaries: account.subsidiaries,
    it_challenges: account.it_challenges as ItChallenge[],
    recent_signals: account.recent_signals as RecentSignal[],
    priority_score: account.priority_score ?? 0,
    priority_justification: account.priority_justification,
    commercial_status: account.commercial_status,
    priority_gate: account.priority_gate,
    gate_reason: account.gate_reason,
    bet_horizon: account.bet_horizon,
    sprint: null,
    sprint_exit_reason: null,
    relationship_memory: null,
    // 13/10/2026 — le brief « Ce que je sais » du compte (Louis) : la fiche s'ouvre dessus (`resolveArrivalTab`).
    raw_analysis: {
      demo_seed: true,
      ...thalesRawWithDemoSteps(company_name, account.raw_analysis),
      // #3278.r42 — la route du plan cite sa preuve, son signal et son historique de canal.
      ...routeWithEvidence(company_name, thalesRawWithDemoSteps(company_name, account.raw_analysis)),
      ...(commercialBriefOf(company_name) ? { commercial_brief: commercialBriefOf(company_name) } : {}),
      // #4760 — les besoins historiques NOMMÉS (label + date réelle), tirés de la couche `signal_layers` du compte
      // (craft rule 9) : EDF n'en a aucun (couche présente, 0 historique) — la fiche n'affiche alors rien. Le semis
      // `demoHistoricalNeedsOf` (Renault), posé plus bas, prime.
      ...(historicalNeedsOf(account.raw_analysis) ? { historical_needs: historicalNeedsOf(account.raw_analysis) } : {}),
      // #4116 — appels d'offres européens publiés par le compte (craft rule 9).
      ...(publicTenders.length > 0 ? { public_tenders: publicTenders } : {}),
      // #3915.decp — un marché public attribué réel et daté (Thales, titulaire).
      ...(awardedContracts.length > 0 ? { awarded_contracts: awardedContracts } : {}),
      // #4760 — les besoins historiques NOMMÉS (libellé, date réelle, source) ; rien si le compte n'en porte pas.
      ...(demoHistoricalNeedsOf(company_name) ? { historical_needs: demoHistoricalNeedsOf(company_name) } : {}),
      // Lot 776 — « Accès au compte · Base commune » (Renault), relayé par le lecteur d'accès à défaut de fiche réelle.
      ...(demoDataforgeAccessOf(company_name) ? { dataforge_access: demoDataforgeAccessOf(company_name) } : {}),
    },
    contacts: [
      ...file.contacts.map(analysedContactSeed),
      // #4556 / #4432.4 — le dossier cadré sur l'Occitanie : les trois cas de lieu (voir `demo-occitanie-dossier.ts`).
      ...(company_name === DEMO_OCCITANIE_COMPANY ? DEMO_OCCITANIE_CONTACTS : []),
    ],
    attackAngles: file.attackAngles,
    actionPlan: {
      strategy_type: 'land_and_expand',
      strategy_justification: file.actionPlan.strategy_justification,
      weeks: (company_name === 'Thales'
        ? withDemoThalesSteps(file.actionPlan.weeks as PlanPhase[])
        : file.actionPlan.weeks) as PlanPhase[],
    },
    nextAction: {
      title: `Choisir l’entité ${company_name} à ouvrir en premier`,
      objective: `Passer de l’analyse de ${company_name} à une première porte d’entrée qualifiée.`,
      expectedResult: 'Une entité retenue et un premier contact à approcher.',
      dueInDays: 10,
    },
  }
}

export const DEMO_ANALYSED_ACCOUNTS: readonly DemoExtensionAccount[] = ANALYSED_ACCOUNT_FILES.map(
  ({ company_name, file }) => withDemoDossierRead(analysedAccount(company_name, file)),
)

/**
 * #3544.5 — « AU-DELÀ DE 50 LIGNES » DÉMONTRABLE. /projects/presentations (ex-/consultants?view=submissions, #4528) monte 50
 * présentations puis propose « Afficher les 50 suivants » (`PresentationsPage`, `PRESENTATIONS_PAGE = 50`) ; la salle n'en portait que 11, la
 * pagination ne s'y voyait donc jamais (recette démo 04/10 : « non prouvable »). Le semis complète les positionnements
 * ÉCRITS à la main jusqu'à ce total sur les couples (affaire, consultant) de la salle — jamais un consultant ni une
 * affaire inventés, jamais d'« accepté » (aucune mission ne leur répond).
 */
export const DEMO_SUBMISSIONS_MIN_TOTAL = 58

/**
 * Les traces d'activité de la démo : ce qu'un commercial est censé avoir fait
 * dans les jours précédents. Sans elles, « Historique » et les compteurs du
 * tableau de bord s'ouvrent à zéro — un espace qui n'a jamais servi.
 *
 * ⚠️ Aucune trace d'ENVOI vers une personne réelle. Les seules actions
 * nominatives portent sur des mandataires sociaux et se limitent à ce qui reste
 * dans le produit (copie d'un message, analyse terminée, export) : une salle de
 * démonstration ne doit pas laisser croire qu'un e-mail est parti chez
 * quelqu'un.
 */
export const DEMO_USER_ACTIONS: readonly DemoUserAction[] = [
  {
    action_type: 'analysis_completed',
    channel: null,
    company: 'Société Générale',
    contact: null,
    hours_ago: 74,
    metadata: {},
  },
  {
    action_type: 'message_copied',
    channel: 'email',
    company: 'Société Générale',
    // Rattaché au SIÈGE de décision pour lequel le brouillon existe vraiment,
    // pas à un mandataire social : on n'a rédigé pour aucun d'eux, et une trace
    // le laisserait croire.
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    hours_ago: 71,
    metadata: { subject: 'Jalons techniques du plan 2029 — renfort borné' },
  },
  // #3532 (recette Y18) — la fiche Société Générale ouvre, mais « Message copié » et
  // « Analyse terminée » n'étaient visibles nulle part : le fil « Ce qui s'est passé sur ce
  // compte » est récent d'abord et ne montre que 12 lignes, or les deux lignes ci-dessus
  // datent de 71-74 h, sous les exécutions et les consultations plus récentes. Ces deux-ci
  // sont RÉCENTES : elles tiennent le haut du fil, donc la traduction FR/EN se voit sans
  // cliquer « Voir les lignes plus anciennes ».
  {
    action_type: 'analysis_completed',
    channel: null,
    company: 'Société Générale',
    contact: null,
    hours_ago: 5,
    metadata: {},
  },
  {
    action_type: 'message_copied',
    channel: 'email',
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    hours_ago: 4,
    metadata: { subject: 'Relance après le comité d’architecture — renfort borné' },
  },
  {
    action_type: 'analysis_completed',
    channel: null,
    company: 'Groupe BPCE',
    contact: null,
    hours_ago: 60,
    metadata: {},
  },
  /**
   * #2319.114 (#2985, lot h9 27/09/2026) — la tâche CRM créée par BellumAI,
   * ATTEIGNABLE depuis le Journal d'activité (`/actions/$id`), pour que le
   * bouton de clôture (`crmTaskClosable`, câblé lot h8) se montre en salle.
   *
   * Rattachée à Marion Teixeira, contact SIMULÉ de SNCF (`.example`, voir
   * `demo-contact-density.ts`) — jamais un dirigeant réel : aucune trace
   * d'écriture ne doit laisser croire qu'une tâche a été posée sur quelqu'un
   * qui existe. `external_ref` est visiblement fictif (`demo-`) : cliquer
   * « Marquer la tâche CRM comme faite » en salle atteint la MÊME porte
   * qu'en production (`CrmService.closeTask` → `getValidAccessToken`), qui
   * refuse AVANT tout appel réseau faute de CRM connecté — `crm_connections`
   * est vide à dessein en démonstration (`demo-coverage.ts`). Le geste
   * n'appelle donc jamais un CRM réel, même patron que les autres gestes
   * d'écriture en démo.
   */
  {
    action_type: 'crm_task_created',
    channel: null,
    company: 'SNCF',
    contact: 'Marion Teixeira',
    hours_ago: 30,
    metadata: {
      detail: 'Tâche CRM créée — Rappeler Marion Teixeira après le comité de sécurité',
      router_intent: 'create_crm_task',
      crm_provider: 'hubspot',
      external_ref: 'demo-hubspot-task-0001',
    },
  },
  {
    action_type: 'plan_action_completed',
    channel: null,
    company: 'Groupe BPCE',
    contact: null,
    hours_ago: 52,
    metadata: { action: 'Qualifier le circuit de référencement d’une entité' },
  },
  {
    action_type: 'message_copied',
    channel: 'linkedin',
    company: 'SNCF',
    contact: seatName('Directeur du numérique du groupe'),
    hours_ago: 28,
    metadata: { subject: 'Une entité, un besoin publié — proposition de point' },
  },
  { action_type: 'analysis_completed', channel: null, company: 'SNCF', contact: null, hours_ago: 20, metadata: {} },
  {
    action_type: 'plan_action_completed',
    channel: null,
    company: 'SNCF',
    contact: null,
    hours_ago: 12,
    metadata: { action: 'Choisir l’entité par laquelle ouvrir le compte' },
  },
  {
    action_type: 'export',
    channel: null,
    company: 'Société Générale',
    contact: null,
    hours_ago: 6,
    metadata: { format: 'pdf' },
  },
  /* ---------------------------------------------------------------- */
  /* Les ISSUES déclarées — réponse, rendez-vous, affaire signée.       */
  /*                                                                   */
  /* Sans elles, « réponses » et « rendez-vous » de la semaine se       */
  /* diraient « non mesuré » dans la salle de démonstration : c'est la  */
  /* réponse HONNÊTE, mais elle ne montre pas la capacité. Un prospect  */
  /* doit voir le compteur porter un chiffre, puis pouvoir le faire     */
  /* bouger lui-même depuis la ligne d'un contact.                      */
  /*                                                                   */
  /* ⚠️ Elles portent UNIQUEMENT sur le client d'exemple et ses         */
  /* interlocuteurs FICTIFS, dont les fiches sont semées avec le statut */
  /* correspondant (`meeting` / `replied`). Les deux vérités — statut   */
  /* du contact et trace au journal — naissent du même geste en         */
  /* production : les semer séparément fabriquerait un état que le      */
  /* produit ne sait pas produire. Déclarer qu'un dirigeant RÉEL nous a */
  /* répondu serait, lui, inventer un fait sur une personne.            */
  /* ---------------------------------------------------------------- */
  // #2117.24 — le MÊME geste qui écrit « Affaire signée » écrit aussi le
  // changement de statut commercial (de → vers, motif) : les semer séparément
  // fabriquerait un état que le produit ne sait pas produire. Le panneau
  // « Motif et historique » du hero en démo le lit.
  {
    action_type: 'commercial_status_changed',
    channel: null,
    company: 'SNCF',
    contact: null,
    hours_ago: 9,
    metadata: {
      label: 'Statut commercial modifié',
      detail: 'Bon de commande signé pour la refonte de la plateforme de suivi',
      from: 'opportunity',
      to: 'customer',
      reason: 'Bon de commande signé pour la refonte de la plateforme de suivi',
      via: 'declaration',
    },
  },
  {
    action_type: 'deal_signed',
    channel: null,
    company: 'SNCF',
    contact: null,
    hours_ago: 9,
    metadata: { label: 'Affaire signée', via: 'declaration', declared: true, previous_status: 'opportunity' },
  },
  // Décision Louis 04/10/2026 — « Rendez-vous décroché » et l'e-mail vérifié
  // (#2715.1) restent vides à dessein : chacun attribuait un échange à une
  // personne RÉELLE (« décision Louis 04/10 : aucune déclaration inventée sur une
  // personne réelle »).
  //
  // Lot D01 (06/10/2026) — « Réponse reçue » ne revient PAS comme action
  // déclarée : le test actions.service.spec (#2771) interdit toute action
  // `response_received` en démo. Le cas « a répondu » (#3689, #3639) est porté
  // par le statut `replied` du contact simulé (Nadia Perrin) et par son
  // échange e-mail ENTRANT (`DEMO_ACTIVITIES`), sans geste déclaratif.
]

/* ------------------------------------------------------------------ */
/* Objectifs du mois (écran « Pilotage », manager)                     */
/* ------------------------------------------------------------------ */

/** Objectifs du mois EN COURS pour l'utilisateur de la salle de démo. Le mois
 *  est calculé au seed : un mois figé afficherait un cockpit vide. */
/**
 * LA MÉMOIRE COLLECTIVE — les mises en relation déjà enregistrées dans la salle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA REMPLIT, ET CE QUE ÇA NE PEUT PAS REMPLIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau du bas de l'écran — « Ce mois-ci, Bellum a connecté N fois deux
 * personnes de ton équipe ». Sans ces lignes, il dirait « pas assez d'historique
 * pour mesurer » : une phrase VRAIE, mais qui ne montre rien.
 *
 * ⚠️ Les CROISEMENTS eux-mêmes ne sont pas seedés, et la raison n'est pas un
 * oubli. Un croisement nomme un COLLÈGUE, donc exige une seconde ligne dans
 * `workspace_members` ET dans `profiles` — les deux portent une clé étrangère
 * DURE vers `auth.users(id)` (`1784000000000-MultiUserWorkspaces.ts:65` et
 * `1780000000000-OnboardingProfilesSchema.ts:67`). Fabriquer un collègue de
 * démonstration reviendrait donc à créer un vrai compte d'authentification,
 * c'est-à-dire un identifiant qui se connecte. La salle a un seul occupant, et
 * cette contrainte-là est structurelle, pas un arbitrage.
 *
 * Ce qui est enregistré ici est donc ce qui EST enregistrable : la trace, dont
 * les deux colonnes d'identité ne portent aucune clé étrangère. `to_user_id`
 * vaut `null` — le pont désigne un RÔLE et non une personne, ce qui est
 * exactement le cas « canal cadre » du croisement G11.
 *
 * ⚠️ Aucune date littérale : le semis calcule le mois COURANT. « Août 2026 »
 * cesserait d'être crédible au premier changement de mois, et la salle se remet
 * à neuf à chaque visite.
 */
export const DEMO_BRIDGE_CONTACTS: ReadonlyArray<{ account: string; kind: string }> = [
  { account: 'Société Générale', kind: 'openDoor' },
  { account: 'Société Générale', kind: 'prospectionCollision' },
  { account: 'Société Générale', kind: 'crossStaffing' },
  { account: 'Société Générale', kind: 'knownReferencing' },
  { account: 'Groupe BPCE', kind: 'openDoor' },
  { account: 'Groupe BPCE', kind: 'crossStaffing' },
  { account: 'Groupe BPCE', kind: 'prospectionCollision' },
  { account: 'SNCF', kind: 'openDoor' },
  { account: 'SNCF', kind: 'knownReferencing' },
  { account: 'SNCF', kind: 'prospectionCollision' },
  { account: 'SNCF', kind: 'crossStaffing' },
]

/**
 * LES CONTACTS « À QUALIFIER » — sans entreprise connue (#1473).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA SALLE DE DÉMONSTRATION EN PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts.account_id` est nullable depuis la migration
 * `1791601447382-ContactWithoutAccount` : le commercial qui rencontre quelqu'un
 * en salon peut le saisir sans lui inventer une société. C'est une capacité
 * user-facing — un onglet « À qualifier » dans la liste, une case à cocher dans
 * la modale de création — et une capacité user-facing se montre en démo, sinon
 * elle se découvre vide en réunion.
 *
 * DEUX fiches, pas une : avec une seule, l'onglet montrerait une liste d'un
 * élément, ce qui ne se lit pas comme une file de travail. Deux suffisent à ce
 * que la colonne « Entreprise » affiche « À qualifier » plusieurs fois de suite,
 * là où le prospect regarde.
 *
 * ⚠️ CE QU'ELLES NE PORTENT PAS, ET POURQUOI CE N'EST PAS UN OUBLI
 * Ni script d'appel, ni cadence, ni signaux, ni périmètre : tout cela se DÉDUIT
 * de l'entreprise, et il n'y en a pas. Les fabriquer écrirait un script qui ne
 * parle d'aucune société — une donnée inventée devant un prospect. La fiche
 * montre l'identité et le geste qui manque : rattacher une entreprise.
 *
 * ⚠️ Ces deux personnes sont FICTIVES, comme tous les interlocuteurs du client
 * d'exemple, et leurs coordonnées sont en `.example` — qui ne délivre jamais.
 * On ne déclare rien sur une personne réelle qui n'aurait pas d'employeur.
 */
export const DEMO_UNQUALIFIED_CONTACTS: readonly {
  full_name: string
  title: string
  email: string | null
  phone: string | null
  /** D'où vient la rencontre — c'est ce qui rend le rattachement possible plus
   *  tard, et ce qu'on relit six mois après pour se souvenir de qui c'est. */
  why_contact: string
  profile_summary: string
  key_points: string[]
}[] = [
  {
    full_name: 'Camille Roussel',
    title: 'Responsable transformation digitale',
    email: 'camille.roussel@contact.example',
    phone: '+33 6 12 44 90 18',
    why_contact:
      'Rencontrée au salon Big Data & AI Paris, stand voisin. Cherche un partenaire data pour un chantier de refonte, mais n’a pas dit chez qui — carte de visite sans logo.',
    profile_summary:
      'Rencontre de salon. Le poste et le besoin sont connus, l’entreprise ne l’est pas encore : à rattacher au prochain échange.',
    key_points: [
      'Rencontrée sur un salon — aucune société renseignée à ce stade',
      'Besoin évoqué : refonte data, partenaire à trouver',
      'Prochaine étape : confirmer l’employeur pour ouvrir le dossier',
    ],
  },
  {
    full_name: 'Sofiane Berthier',
    title: 'Directeur des systèmes d’information',
    email: null,
    phone: '+33 6 88 03 27 51',
    why_contact:
      'Recommandé par un ancien client, qui a donné le numéro sans préciser la société. À rappeler pour qualifier — la recommandation vaut mieux qu’un appel à froid.',
    profile_summary:
      'Recommandation. Le numéro et le rôle sont connus, l’entreprise reste à établir : c’est l’objet du premier appel.',
    key_points: [
      'Recommandation d’un ancien client — pas d’appel à froid',
      'Aucune adresse e-mail à ce stade, seulement un mobile',
      'Prochaine étape : qualifier l’employeur pendant le premier appel',
    ],
  },
]

/**
 * #4016 L6 (Louis 11/10/2026) — LA FUSION AUTOMATIQUE D'UN DOUBLON CERTAIN, SEMÉE.
 *
 * Craft rule n°9 : la liste « Fusionnés par Bellum » (écran Qualité des
 * données) et son geste « Annuler la fusion » doivent se voir dans la salle.
 * Le doublon est celui que la vraie vie produit le plus : la même personne
 * saisie deux fois — une fiche de salon, puis la même ressaisie par un import —,
 * même nom, même adresse. Il est bâti sur un contact « à qualifier » FICTIF
 * (`DEMO_UNQUALIFIED_CONTACTS`, adresse en `.example`) : jamais sur une
 * personne réelle d'un des dossiers, et sans société (l'index d'unicité
 * nom × compte ne s'applique pas à deux fiches sans compte).
 *
 * La fiche absorbée est mise de côté (`deleted_at`) et pointe vers la
 * survivante (`merged_into_id`) ; la paire est journalisée `auto_merged` —
 * exactement l'écriture du balayeur. « Annuler » la rend, comme en réel.
 */
export const DEMO_AUTO_MERGED_DUPLICATE = {
  keptFullName: 'Camille Roussel',
  /** Ce que l'import a ajouté de différent — le poste, ressaisi autrement. */
  absorbedTitle: 'Resp. transformation digitale',
  reason: 'Même adresse et même nom',
  confidence: 0.99,
} as const

/**
 * #4016 L6 (Louis 11/10/2026) — LE PIPE « DÉTECTÉ, À REVOIR », SEMÉ.
 *
 * Craft rule n°9 : la bande « Détecté, à revoir » du pipe doit se voir dans la
 * salle, avec ses deux gestes (confirmer, écarter). Une ligne par passage :
 *  · intérêt → affaire, sur le dossier SNCF — le libellé est celui de
 *    l'affaire qu'ouvrira « Confirmer », jamais le nom d'une personne ;
 *  · shortlist → positionnement, sur un besoin semé et un profil du vivier pas
 *    encore positionné dessus (lus dans la salle, jamais inventés) ;
 *  · entretien → mission, sur un positionnement semé sans mission.
 * Le semis écrit ce que le balayeur écrit — des lignes `detected` —, sans
 * jamais créer l'affaire, le positionnement ou la mission : c'est le clic du
 * visiteur qui le fait.
 */
export const DEMO_PIPELINE_DETECTIONS = {
  interest: {
    company: 'SNCF',
    label: 'Intérêt exprimé à l’appel — renfort data sur la maintenance prédictive',
  },
} as const

/**
 * LE CONTACT DONT L'ACCROCHE ÉCHOUE AVEC UNE RAISON NOMMÉE (#2648.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTACT, ET PAS UN DES 30 DÉJÀ SEMÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/routers/icebreaker.py` refuse de générer quand NI le poste NI
 * le rôle de décision ne sont connus ET qu'aucun signal récent n'existe sur le
 * compte — c'est le SEUL cas où le moteur nomme la raison (`insufficient_context`)
 * plutôt que de laisser Claude broder sur du vide. Sans un contact qui remplit
 * exactement cette condition, un visiteur qui clique « Générer » sur N'IMPORTE
 * QUEL contact de la salle reçoit toujours trois accroches : les six dossiers
 * réels donnent tous un `title`, et les deux contacts « à qualifier »
 * (`DEMO_UNQUALIFIED_CONTACTS`) portent `decision_role: 'unknown'` — une
 * chaîne non vide, donc VRAIE pour le `or` du moteur. La capacité livrée
 * (moteur → enveloppe → écran) resterait donc invisible en démonstration,
 * exactement la situation que la craft rule n°9 vise.
 *
 * ⚠️ DÉLIBÉRÉMENT SÉPARÉ de `DEMO_UNQUALIFIED_CONTACTS` : cette liste-là garantit
 * « le poste est connu, seule l'entreprise manque » (`demo-unqualified-contacts-
 * coverage.spec.ts` exige `title.trim().length > 0` sur chaque fiche) — une
 * garantie VRAIE et utile pour l'onglet « À qualifier », que ce contact-ci
 * violerait par construction. Un contact de plus qui va plus loin (ni poste,
 * ni rôle) mérite son propre semis plutôt que d'affaiblir cette garde.
 *
 * `account_id: null` (comme les contacts « à qualifier ») : la SEULE façon de
 * garantir `recent_signals` vide sans toucher aux signaux des six dossiers
 * réels, qui servent d'autres démonstrations.
 *
 * ⚠️ `entity: 'Consultant indépendant'`, et NON vide — sans quoi la porte
 * d'IDENTITÉ (`isContactIdentityComplete`, `@bellum/contracts` : nom complet +
 * une ANCRE parmi title/entity/linkedin_url) resterait fermée, et le bouton
 * « Générer » de `ContactIcebreakers.tsx` resterait DÉSACTIVÉ — personne ne
 * pourrait jamais cliquer jusqu'à `insufficient_context`. `entity` n'est lu
 * QUE par cette porte-là : `apps/ia/app/routers/icebreaker.py` n'inspecte que
 * `title` et `decision_role`, jamais `entity`. Et c'est un fait VRAI, pas
 * fabriqué : un indépendant a ce statut par lui-même, sans qu'aucune
 * entreprise-employeur n'ait besoin d'être connue pour autant — à la
 * différence d'une « BU » (`DEMO_UNQUALIFIED_CONTACTS`), qui suppose un
 * employeur. `linkedin_url` était l'autre ancre possible ; jamais utilisée
 * (`demoApolloProfile` : une URL sur le vrai domaine mènerait nulle part ou
 * chez un homonyme, fictif ou non).
 */
export const DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT: {
  full_name: string
  title: string
  entity: string
  decision_role: null
  email: string | null
  phone: string | null
  why_contact: string
  profile_summary: string
  key_points: string[]
} = {
  full_name: 'Corentin Fabre',
  // Vide, à dessein : ni poste ni rôle ne sont connus — voir le commentaire
  // au-dessus. `entity`, lui, EST connu (son propre statut) et sert d'ancre
  // d'identité sans jamais entrer dans la condition du moteur IA.
  title: '',
  entity: 'Consultant indépendant',
  decision_role: null,
  email: null,
  phone: '+33 6 71 09 44 52',
  why_contact:
    'Numéro laissé au standard d’un salon, sans poste ni service précisés — la personne n’a pas eu le temps de se présenter avant l’appel suivant.',
  profile_summary:
    'Contact laissé au standard. Ni le poste ni le rôle dans la décision ne sont connus à ce stade : rien à quoi accrocher un message personnalisé avant le premier échange.',
  key_points: [
    'Numéro recueilli au standard — poste et service non précisés',
    'Aucun signal récent ne le rattache à un besoin identifié',
    'Prochaine étape : qualifier le poste et le rôle au premier appel',
  ],
}

export const DEMO_MEMBER_OBJECTIVE = {
  target_meetings: 12,
  target_accounts: 20,
  target_revenue: '180000',
  // Lot FA (#2114.16-.22) — les quatre axes qui complètent les sept objectifs
  // commerciaux nommés du cockpit personnel. `target_margin_percent` reste
  // une CHAÎNE comme `target_revenue` (colonne `numeric`, même transformation).
  target_qualified_needs: 6,
  target_placements: 3,
  target_margin_percent: '28',
  target_consultants_on_mission: 5,
} as const

/**
 * La base de connaissance de la salle de démonstration.
 *
 * L'onglet « Mes documents » était vide : le dépôt d'un document EST le geste
 * qu'on voulait montrer, mais il est refusé en démonstration — un visiteur ne
 * laisse pas un document de son entreprise sur un espace partagé et remis à
 * neuf entre deux passages. Sans ces documents, l'écran ne montrait donc
 * rien du tout, ce qui est la pire des deux options.
 *
 * Ils appartiennent à l'ESN FICTIVE (Bellum Conseil), pas aux sociétés
 * analysées : une référence client inventée au nom d'une société réelle serait
 * exactement ce que ce fichier s'interdit.
 *
 * #1954 — le quatrième est un document JOINT DEPUIS LE CHAT avant la portée
 * « fil seul » : il est resté dans la base, inchangé, et « Connaissances » le
 * marque « jointe depuis le chat » (décision de Louis, 12/09/2026). Sans lui, la
 * marque ne se verrait jamais en démonstration.
 *
 * #2431.5 (reste, épopée #2886) — un document porte `replaces` : « Grille…
 * (v2) » REMPLACE « Grille… (démo) ». Sans ce couple, le lien de version
 * (`archived_at`/`replaced_by_id`) livré ce lot n'aurait jamais de preuve
 * visible en démonstration — l'ancien resterait invisible (exclu de
 * `listForWorkspace`) et personne ne verrait jamais qu'il existe toujours,
 * archivé, plutôt que supprimé.
 */
/** #3750.8 — le titre du classeur à onglets de la salle (cité par le chat scripté). */
export const DEMO_BRAND_MESSAGING_TITLE = 'Brand Messaging — Bellum Conseil (classeur, démo)'

/** #3889 — le titre des notes d'avant-vente Sanofi de la salle (cité par le chat scripté). */
export const DEMO_SANOFI_PROJECT_NOTES_TITLE = 'Notes d’avant-vente — projets Sanofi (démo)'

/** #3750.8 — ses onglets : un morceau chacun, ligne d'en-tête en tête. */
const DEMO_BRAND_MESSAGING_UNITS: ReadonlyArray<{ label: string; content: string }> = [
  {
    label: '01 · Positionnement',
    content: [
      'Thème\tMessage\tÀ éviter',
      'Promesse\tDes équipes data et cloud opérationnelles en quatre semaines\t« transformation digitale »',
      'Différence\tUn périmètre écrit et un critère d’arrêt convenus avant de commencer\t« accompagnement global »',
      'Cible\tDirections techniques de 500 à 5 000 salariés (clients FICTIFS)\t« grands comptes » sans précision',
    ].join('\n'),
  },
  {
    label: '04 · Personas',
    content: [
      'Persona\tCe qui l’empêche de dormir\tAngle',
      'Directeur technique\tUne plateforme migrée que personne n’exploite\tL’exploitation, sans toucher à la conception',
      'Responsable achats\tDes TJM qui dérivent sans justification\tLa grille publiée et sa révision annuelle',
      'Chef de projet data\tDes renforts qui arrivent après le jalon\tUn démarrage sous quatre semaines, daté',
    ].join('\n'),
  },
  {
    label: '07 · Objections',
    content: [
      'Objection\tRéponse\tPreuve à citer',
      'Trop cher\tComparer le coût sur la durée de la mission, pas le TJM seul\tRéférence exploitation : détection d’incident divisée par quatre',
      'On a déjà un prestataire\tProposer un périmètre précis à côté du prestataire en place, jamais à sa place\tMéthode de cadrage en six semaines',
      'Pas le bon moment\tDemander quel jalon arrive et caler la proposition dessus\tDémarrage sous quatre semaines',
      'Vous êtes trop petits\tDeux ingénieurs dédiés valent mieux qu’une équipe tournante\tContinuité sur six mois de la référence',
    ].join('\n'),
  },
  {
    label: '09 · Preuves',
    content: [
      'Preuve\tChiffre\tConditions de citation',
      'Exploitation de plateforme après migration\tDétection d’incident divisée par quatre en quatre mois\tCitable sans nom de client',
      'Cadrage en six semaines\tDécision d’arrêt ou d’extension à la semaine 6\tCitable',
    ].join('\n'),
  },
  {
    label: '10 · Ton et vocabulaire',
    content: [
      'Règle\tÀ écrire\tÀ ne pas écrire',
      'Concret\t« deux ingénieurs data, six mois, démarrage sous quatre semaines »\t« une équipe d’experts passionnés »',
      'Sobre\t« détection d’incident divisée par quatre »\t« des résultats exceptionnels »',
      'Daté\t« jalon de la semaine 6 »\t« rapidement »',
      'Direct\tUne question précise en fin de message\tUne liste de cinq questions',
      'Honnête\t« nous ne faisons pas la conception des modèles »\t« nous faisons tout »',
    ].join('\n'),
  },
]

export const DEMO_RAG_DOCUMENTS: Array<{
  title: string
  category: string
  content: string
  /** #2779 — la portée ; absente = `workspace` (le défaut de la colonne). */
  scope?: RagDocumentScope
  /** #2779 — le compte visé quand `scope = 'account'` (nom d'un compte SEMÉ). */
  company?: string
  /** #2431.5 (reste, épopée #2886) — le TITRE du document que celui-ci remplace
   *  (résolu par titre au semis, les deux lignes n'ayant pas encore d'id). */
  replaces?: string
  /** #3750.8 — les MORCEAUX citables (un par onglet), semés dans
   *  `rag_document_chunks` : Laura cite « Titre — 07 · Objections ». */
  units?: ReadonlyArray<{ label: string; content: string }>
  /** #3669.2 — le statut de traitement semé ; absent = non évalué (NULL), jamais « exploitable » par défaut. */
  processingStatus?: RagProcessingStatus
  /** #3803 (3803.7) — l'ORIGINAL semé (fabriqué depuis `content`, `demo-document-files.ts`).
   *  Absent = déposé « avant #3803 » : l'aperçu dit « original non conservé ». */
  source?: { fileName: string; format: DemoDocumentSourceFormat }
}> = [
  {
    title: 'Méthode d’avant-vente — cadrage en six semaines (démo)',
    category: 'Méthode',
    processingStatus: 'usable',
    source: { fileName: 'methode-avant-vente.pdf', format: 'pdf' },
    content: [
      'Cadrage en six semaines, format utilisé sur les premières missions chez un nouveau compte.',
      'Semaine 1 : atelier de 45 minutes, périmètre écrit et critère d’arrêt convenu.',
      'Semaines 2 à 5 : livraison sur le périmètre, point hebdomadaire de quinze minutes.',
      'Semaine 6 : restitution, plan de suite chiffré, décision d’arrêt ou d’extension.',
      'Règle : le périmètre ne s’élargit jamais en cours de route. Ce qui apparaît est noté pour la suite.',
    ].join('\n'),
  },
  // #4072.7 — l'organigramme DÉPOSÉ du compte vitrine : « Lire les organigrammes de tes documents » le lit
  // (titre « organigramme », portée `account`) ; en démo la réponse vient de `demoOrgDocumentPeople`, même contenu.
  {
    title: DEMO_ORG_DOCUMENT.title,
    category: DEMO_ORG_DOCUMENT.category,
    scope: 'account',
    company: DEMO_ORG_DOCUMENT.company,
    processingStatus: 'usable',
    content: demoOrgDocumentContent(),
  },
  {
    title: 'Référence client — exploitation de plateforme après migration (démo)',
    category: 'Référence',
    processingStatus: 'usable',
    content: [
      'Client : plateforme numérique française, 700 salariés (client FICTIF, comme toute cette base).',
      'Contexte : plateforme d’apprentissage automatique fraîchement migrée, exploitation retenant les équipes de construction.',
      'Mission : deux ingénieurs sur l’exploitation, sans toucher à la conception des modèles.',
      'Résultat : délai moyen de détection d’incident divisé par quatre en quatre mois.',
      'Ce qui a marché : un périmètre qui s’arrête explicitement à la porte de la conception.',
    ].join('\n'),
  },
  {
    title: 'Grille de tarification et politique de remise (démo)',
    category: 'Commercial',
    content: [
      'Développeur confirmé : 520 à 600 € par jour. Architecte : 700 à 820 €.',
      'Ingénieur données : 560 à 660 €. Expert sécurité : 720 à 900 €.',
      'Remise volume : 3 % au-delà de 3 profils, 6 % au-delà de 6, plafond 8 %.',
      'Remise engagement : 4 % pour 12 mois fermes. Non cumulable au-delà de 8 %.',
      'Toute remise au-delà de 8 % passe par la direction commerciale.',
    ].join('\n'),
  },
  // #2431.5 (reste, épopée #2886) — REMPLACE le document juste au-dessus (voir
  // `replaces`). L'ancien est archivé par `DemoSeedService`, pas supprimé.
  {
    title: 'Grille de tarification et politique de remise — v2 (démo)',
    category: 'Commercial',
    processingStatus: 'usable',
    content: [
      'Développeur confirmé : 540 à 620 € par jour. Architecte : 720 à 850 €.',
      'Ingénieur données : 580 à 680 €. Expert sécurité : 740 à 920 €.',
      'Remise volume : 3 % au-delà de 3 profils, 6 % au-delà de 6, plafond 8 %.',
      'Remise engagement : 4 % pour 12 mois fermes. Non cumulable au-delà de 8 %.',
      'Toute remise au-delà de 8 % passe par la direction commerciale.',
      'Révision annuelle des tarifs (janvier) — remplace la grille précédente.',
    ].join('\n'),
    replaces: 'Grille de tarification et politique de remise (démo)',
  },
  {
    title: 'Compte rendu d’atelier de cadrage — joint à Laura (démo)',
    category: CHAT_ATTACHMENT_CATEGORY,
    content: [
      'Atelier de cadrage de 45 minutes, client FICTIF, comme toute cette base.',
      'Besoin exprimé : renfort de deux ingénieurs données pour six mois.',
      'Critère d’arrêt convenu : premier tableau de pilotage en production à la semaine 6.',
      'Prochaine étape : proposition chiffrée avant la fin du mois.',
    ].join('\n'),
  },
  // #2667.2 — décision de Louis (QCM du 21/09) : « pptx ET OCR des images ».
  // Contenu au format que rend VRAIMENT `document_text._extract_pptx`
  // (`[Diapositive N]` par bloc, notes séparées) — pas une texture inventée
  // pour la démo, le résultat réel d'une extraction .pptx.
  {
    title: 'Trame de présentation commerciale — jointe à Laura (pptx, démo)',
    category: CHAT_ATTACHMENT_CATEGORY,
    processingStatus: 'partial',
    source: { fileName: 'trame-presentation-commerciale.pptx', format: 'pptx' },
    content: [
      '[Diapositive 1]',
      'Proposition de collaboration — Bellum Conseil (client FICTIF, comme toute cette base)',
      '[Diapositive 2]',
      'Contexte : refonte de la plateforme de suivi logistique',
      'Périmètre : deux ingénieurs data, six mois, démarrage sous quatre semaines',
      '[Notes]',
      'Insister sur la référence Exploitation de plateforme après migration — délai de détection divisé par quatre.',
      '[Diapositive 3]',
      'Tarification : développeur confirmé 520 à 600 € / jour, remise volume au-delà de 3 profils',
    ].join('\n'),
  },
  // #3751.7 — Connaissances accepte désormais docx ET xlsx (comme le trombone du
  // chat) : la salle les montre. Contenu au format que rend VRAIMENT
  // `document_text._extract_docx` (un paragraphe par ligne) puis `_extract_xlsx`
  // (une ligne de tableur par ligne, colonnes séparées par des TABULATIONS) —
  // fictif, comme toute cette base.
  {
    title: 'Offre de services — modèle de réponse (docx, démo)',
    category: 'Pitch commercial',
    source: { fileName: 'offre-de-services.docx', format: 'docx' },
    content: [
      'Offre de services — Bellum Conseil (client FICTIF, comme toute cette base)',
      'Objet : renfort de deux ingénieurs données pour six mois.',
      'Engagement : démarrage sous quatre semaines, point hebdomadaire de quinze minutes.',
      'Conditions : remise volume au-delà de 3 profils, révision annuelle en janvier.',
    ].join('\n'),
  },
  {
    title: 'Grille de disponibilité des consultants (xlsx, démo)',
    category: 'Commercial',
    source: { fileName: 'grille-disponibilite.xlsx', format: 'xlsx' },
    content: [
      ['Profil', 'Séniorité', 'Disponible dès', 'TJM (€)'].join('\t'),
      ['Ingénieur données', 'Confirmé', 'Sous 2 semaines', '620'].join('\t'),
      ['Architecte cloud', 'Senior', 'Sous 4 semaines', '780'].join('\t'),
      ['Expert sécurité', 'Senior', 'Immédiate', '820'].join('\t'),
    ].join('\n'),
  },
  // Contenu au format que rend VRAIMENT la lecture d'image par le modèle
  // (`claude_service.call_claude_image_text`) : le TEXTE visible, verbatim,
  // rien d'autre — jamais une description de la photo elle-même.
  {
    title: 'Organigramme capturé en réunion — joint à Laura (image, démo)',
    category: CHAT_ATTACHMENT_CATEGORY,
    content: [
      'Direction des systèmes d’information',
      'Antoine Fabre — Directeur des systèmes d’information',
      'Nadia Costa — Responsable transformation digitale',
      'Équipe exploitation (4 personnes) — rattachée à la DSI',
    ].join('\n'),
  },
  // #2779 — les trois portées neuves de #1954, une chacune. Le compte visé est
  // le client FICTIF de la salle : aucune note inventée sur une société réelle.
  {
    title: 'Mes notes de préparation d’entretien (personnel, démo)',
    category: 'Méthode',
    scope: 'personal',
    content: [
      'Avant chaque premier rendez-vous : relire le dernier échange, préparer trois questions ouvertes.',
      'Ne jamais annoncer un tarif avant d’avoir compris le périmètre.',
    ].join('\n'),
  },
  {
    title: 'Compte rendu d’atelier de cadrage — SNCF',
    category: 'Référence',
    scope: 'account',
    company: 'SNCF',
    content: [
      'Atelier de cadrage tenu avec l’équipe d’exploitation : priorité à l’observabilité des systèmes temps réel.',
      'Prochaine étape proposée : maquette du tableau de suivi en deux semaines.',
    ].join('\n'),
  },
  // #3669.2 — un document NON exploitable se dit tel quel (« à corriger »), il
  // n'est jamais annoncé comme intégré. Contenu = ce que la lecture a
  // réellement rendu : rien d'exploitable.
  {
    title: 'Export CRM des anciennes missions — colonnes illisibles (démo)',
    category: 'Référence',
    processingStatus: 'to_fix',
    content: 'Fichier reçu. Aucune ligne n’a pu être lue : l’en-tête des colonnes est absent.',
  },
  // #3623 — un document JOINT À UNE ANALYSE depuis /search (le trombone ingère le contenu, puis le
  // rattache au compte). La salle refuse le dépôt : sans ce document semé au compte, le visiteur ne
  // verrait jamais ce que « joindre une base documentaire » donne. Un CSV, comme celui d'un commercial
  // (recherches déjà menées) — FICTIF, rattaché au même compte démo que le compte rendu d'atelier.
  {
    title: 'Recherches déjà menées sur SNCF (csv, démo)',
    category: 'Autre',
    scope: 'account',
    company: 'SNCF',
    source: { fileName: 'recherches-sncf.csv', format: 'csv' },
    content: [
      'Sujet,Constat,Source',
      'Observabilité,Un appel d’offres temps réel annoncé pour le prochain semestre,Veille de l’équipe',
      'Gouvernance,Un nouveau directeur technique arrivé cette année,Annonce interne',
    ].join('\n'),
  },
  // #3889 (épopée #3977, 11/10) — « quels projets a Sanofi dans nos documents ? »
  // (`search_document_projects`) : des notes d'avant-vente FICTIVES rattachées au
  // compte Sanofi de la salle. Chaque ligne illustre UN rangement, sur ce que le
  // texte DIT : un besoin annulé (le même que `closedNeeds`, #3895), un besoin
  // ouvert, une mission terminée, un besoin évoqué sans date ni statut (« non
  // daté ») et un projet du client. Aucune date écrite : le texte ne vieillit pas.
  {
    title: DEMO_SANOFI_PROJECT_NOTES_TITLE,
    category: 'Référence',
    scope: 'account',
    company: 'Sanofi',
    content: [
      'Notes d’avant-vente FICTIVES de la salle de démonstration : aucun fait public sur la société.',
      'Besoin annulé par le client : architecte données pour la plateforme analytique R&D, regroupé dans le programme data du groupe.',
      'Besoin ouvert : deux ingénieurs data sur la qualification des données de pharmacovigilance, démarrage annoncé au prochain trimestre.',
      'Mission terminée : cadrage en six semaines d’un tableau de suivi qualité, restitution faite au comité.',
      'Besoin évoqué en réunion : un chef de projet pour la refonte du portail fournisseurs.',
      'Projet du client : programme de productivité de la R&D par l’IA, cité dans le brief commercial.',
    ].join('\n'),
  },
  {
    title: 'Charte qualité de l’ESN — base durable (démo)',
    category: 'Méthode',
    scope: 'knowledge_base',
    source: { fileName: 'charte-qualite.md', format: 'md' },
    content: [
      'Toute mission démarre par une réunion de lancement et un plan qualité signé.',
      'Revue de mission mensuelle avec le client ; indicateurs partagés.',
    ].join('\n'),
  },
  // #3750.8 — un classeur LONG à onglets, comme le « Brand Messaging » qu'une
  // ESN dépose : chaque onglet est un morceau, cité par son nom. Contenu
  // FICTIF (Bellum Conseil), rangées séparées par tabulation comme les rend
  // l'extraction xlsx (`document_text._xlsx_units`).
  {
    title: DEMO_BRAND_MESSAGING_TITLE,
    category: 'Commercial',
    content: DEMO_BRAND_MESSAGING_UNITS.map(unit => unit.content).join('\n'),
    units: DEMO_BRAND_MESSAGING_UNITS,
    // #3803 — le classeur à ONGLETS de la salle : la grille s'ouvre sur un onglet par morceau.
    source: { fileName: 'brand-messaging-bellum-conseil.xlsx', format: 'xlsx' },
  },
]

/**
 * Notes de démonstration — la mémoire écrite à la main sur un compte ou un
 * contact (socle CRM).
 *
 * Sans elles, le panneau « Notes » d'une fiche s'ouvre vide au milieu d'une
 * démonstration : le visiteur voit un cadre, pas une capacité. Ce sont des
 * observations de terrain FICTIVES, du même registre que le reste du jeu —
 * datées relativement à la remise à neuf de la salle pour qu'elles ne
 * vieillissent jamais.
 */
type DemoNote = {
  /** `company` seul → note de compte ; avec `contact` → note de contact. */
  company: string
  contact: string | null
  body: string
  daysAgo: number
  pinned: boolean
  /** #3895 — les AUTRES entités du même groupe pour lesquelles la note vaut (noms de comptes de la salle). */
  alsoAppliesTo?: readonly string[]
}

export const DEMO_NOTES: readonly DemoNote[] = [
  {
    // #3895 — une note ACHATS écrite sur le groupe. Elle valait aussi pour BoursoBank (entité sœur) ; 12/10/2026 :
    // BoursoBank est RETIRÉ (compte à un seul siège, Louis : « ça n'arrive jamais dans la vraie vie »), la portée
    // « autres entités du groupe » n'a donc plus de compte à désigner — voir `DEMO_NOTE_GROUP_SCOPE_COVERAGE`.
    company: 'Société Générale',
    contact: null,
    body: 'Règle achats du groupe : toute prestation au-delà de 50 k€ passe par trois devis comparés et le référencement central.',
    daysAgo: 1,
    pinned: false,
  },
  {
    company: 'Société Générale',
    contact: null,
    body: "Référencement fournisseur à renouveler en fin d'année : la porte d'entrée passe par les achats IT, pas par la direction technique. À reprendre avant octobre.",
    daysAgo: 6,
    pinned: true,
  },
  {
    company: 'Société Générale',
    contact: null,
    body: 'Deux ESN déjà installées sur le périmètre paiement. Notre angle est le renfort borné sur les jalons techniques, pas le remplacement.',
    daysAgo: 2,
    pinned: false,
  },
  {
    company: 'SNCF',
    contact: null,
    body: "Besoin confirmé côté entité, mais la décision d'achat remonte au niveau groupe. Prévoir un sponsor interne avant toute proposition chiffrée.",
    daysAgo: 3,
    pinned: false,
  },
  {
    company: 'Groupe BPCE',
    contact: null,
    body: 'Relevé importé le 30/09 : plusieurs domaines ouverts à la prestation sont listés ; reste à arbitrer lequel ouvrir en premier.',
    daysAgo: 1,
    pinned: false,
  },
  // #3687/#3688 — la fiche CONTACT recomposée met l'éditeur de notes en tête de
  // la zone centrale : sans note de contact, la démo montrerait un cadre vide
  // à l'endroit même que la recomposition met en avant. Fictives, comme le reste.
  //
  // ⚠️ #3688 — le NOM doit être celui d'un contact du jeu : un nom inconnu est
  // sauté EN SILENCE par `DemoSeedService` (ces deux notes n'avaient jamais été
  // semées). La garde `demo-contact-workspace-coverage.spec.ts` le vérifie.
  // Un seul auteur : la salle n'a qu'UN occupant (`workspace_members` et
  // `profiles` portent une clé étrangère dure vers `auth.users`, voir
  // `demo-coverage.ts` — #1408) ; « deux notes d'auteurs différents » reste
  // donc vrai en production, jamais mis en scène ici.
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    body: 'Préfère un échange court en début de semaine ; le périmètre paiement passe par lui avant les achats IT.',
    daysAgo: 5,
    pinned: true,
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    body: 'A demandé une référence sur un renfort borné aux jalons techniques avant de proposer un point à son équipe.',
    daysAgo: 1,
    pinned: false,
  },
]

/**
 * #2151.59 — une note libre sur un candidat DÉCOUVRIR, avant qu'il ne devienne
 * un compte. `siren` est celui que `demoDiscoverResponse` assigne (par rang)
 * à « Verdal Distribution (démo) », le premier candidat scripté
 * (`demo-scripts.ts`) — la salle ne fait aucun appel réseau, donc ce SIREN
 * est le même à chaque recherche. Sans cette ligne, le panneau de notes du
 * candidat que tout visiteur croise en premier s'ouvrirait vide.
 */
export const DEMO_DISCOVER_CANDIDATE_NOTE = {
  siren: '000000001',
  body: 'Programme de transformation annoncé en mai, 14 postes IT ouverts depuis : à qualifier avant le re-référencement des prestataires.',
  daysAgo: 2,
}

/**
 * Les ACTIVITÉS d'exemple — la timeline d'un dossier de démonstration.
 *
 * Sans elles, l'onglet « Historique » s'ouvre sur « aucune activité » au moment
 * exact où un prospect demande « et l'historique de mes échanges ? ».
 *
 * Trois précautions, parce qu'une timeline est faite pour être crue :
 *
 *  - `source` vaut `manual` et JAMAIS `mailbox` : aucune messagerie n'est
 *    connectée à une salle de démonstration, et prétendre le contraire est
 *    exactement le mensonge que la garde de couverture existe pour empêcher.
 *    La SEULE exception est `system`, sur la trace d'une porte de décision
 *    (#2124.68) : là, c'est bien le produit qui écrit la ligne quand quelqu'un
 *    tranche, et l'écrire `manual` serait le mensonge symétrique ;
 *  - un fil se termine par une réponse REÇUE sur un compte et par un silence sur
 *    un autre — c'est ce qui fait vivre « en attente de réponse » à l'écran
 *    plutôt que de le montrer figé ;
 *  - une réunion INTERNE figure dans le jeu, pour que la distinction « ça compte
 *    comme une touche client / ça ne compte pas » soit visible et pas théorique.
 */
type DemoActivity = {
  company: string
  contact: string | null
  kind: 'email' | 'call' | 'meeting' | 'gate_decision' | 'workflow' | 'crm_lookup'
  direction: 'inbound' | 'outbound' | 'internal'
  /**
   * D'où vient la ligne. `manual` par DÉFAUT et pour presque tout le jeu (voir
   * le bloc ci-dessus). L'exception est la trace d'une porte de décision :
   * en production c'est le produit qui l'écrit quand quelqu'un tranche, donc
   * `system` — et la démonstration ne met pas en scène une provenance qu'elle
   * n'aurait pas.
   */
  source?: 'system'
  /**
   * ⚠️ Sur une ligne `gate_decision`, l'objet n'est PAS une phrase : c'est le
   * couple `<porte> — <décision>`, la forme exacte que
   * `DecisionGatesService.trace` écrit en production (#2124.68). C'est ce que
   * `timelineEventTitle` traduit côté écran ; y écrire une phrase française
   * ferait passer la démonstration à côté du chemin réel.
   */
  subject: string | null
  body: string | null
  daysAgo: number
  durationSeconds: number | null
  /**
   * L'issue de l'appel (N11-B, 30/08/2026). `undefined` sur tout ce qui n'est
   * pas un appel — le contrat (`logActivitySchema`) refuse une issue posée
   * ailleurs — et `undefined`, jamais une valeur bidon, sur un appel dont
   * l'issue n'a pas été renseignée : `TimelinePanel` écrit alors « Issue non
   * renseignée », qui EST l'état vrai d'un appel qu'on vient de loguer sans
   * prendre le temps de qualifier.
   *
   * ⚠️ Les DEUX moitiés comptent dans le jeu : un appel qui montre son issue,
   * et un qui ne la montre pas — sinon la salle ne prouve jamais que le
   * produit sait aussi DIRE qu'il ne sait pas.
   */
  outcome?: CallOutcome
  /**
   * #2377.1/.4/.6 — le debrief du compilateur de fin d'appel, avec
   * l'éventuelle prochaine action déclarée. Seedé sur UN SEUL appel du jeu
   * (SNCF) : c'est ce que l'écran affiche dès qu'on ouvre le
   * détail d'un échange, et un jeu qui ne le montrerait jamais laisserait la
   * salle découvrir un bloc vide en réunion.
   *
   * #2984 — `recordingConsent` et `followUpDraft` rejoignent le même objet :
   * `DemoSeedService` sérialise `callDebrief` tel quel dans la colonne JSON,
   * sans repasser par `composeFollowUpDraft` (réservé à la vraie saisie) —
   * seedés ici à la main, sur le MÊME appel, pour la même raison que le reste
   * de ce commentaire.
   */
  callDebrief?: CallDebrief & {
    nextAction?: CallNextAction | null
    recordingConsent?: boolean
    followUpDraft?: { subject: string | null; body: string } | null
  }
}

export const DEMO_ACTIVITIES: readonly DemoActivity[] = [
  // ── Client d'exemple — le fil que le BRIEF D'AVANT relit (01/09/2026) ──────
  //
  // Le bloc 02 du brief (« ce qu'on s'est dit ») lit le journal d'activité du
  // compte. Sans ces trois lignes, le rendez-vous branché sur le client
  // d'exemple (`demo-event-nova`) ouvrirait un brief dont l'historique se
  // retire — et la salle ne montrerait jamais un bloc sourcé sur DEUX
  // capacités à la fois, ce qui est la moitié intéressante de la ligne
  // d'origine.
  //
  // Les trois racontent une progression, dans l'ordre où on la lit à voix
  // haute avant d'entrer : un premier cadrage, un retour écrit, puis le point
  // qui reste ouvert. Le corps est écrit ici comme partout ailleurs dans ce
  // jeu — il est STOCKÉ dans le journal ; c'est l'EXPOSER au copilote ou à un
  // tiers qui reste refusé, et le brief n'affiche que le SUJET.
  {
    company: 'SNCF',
    // Décision Louis 04/10/2026 — note de l'équipe sur le COMPTE : aucun
    // interlocuteur nommé ni réponse prêtée à une personne réelle.
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — renfort du programme de refonte applicative',
    body: 'Notes de l’équipe : cadrage du renfort sur le programme de refonte applicative de l’entité, à partir du besoin publié. Prochaine étape : chiffrer le renfort.',
    daysAgo: 34,
    durationSeconds: 3600,
  },
  // Décision Louis 04/10/2026 — le réseau dormant (`search_dormant_network`)
  // ne lit plus les interlocuteurs du client d'exemple (retiré) : ces notes
  // d'équipe ne visent aucun contact.
  {
    company: 'SNCF',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Référencement — bon de commande du renfort produit',
    body: 'Point sur la porte achats : le bon de commande attend l’arbitrage du budget. Rien n’est bloqué sur le fond.',
    daysAgo: 9,
    durationSeconds: 720,
    outcome: 'connected_qualified',
    callDebrief: {
      fact: 'Le bon de commande est chez les achats, en attente d’arbitrage budget.',
      need: 'Un renfort produit confirmé, périmètre déjà cadré.',
      engagement: 'Relancer la porte achats avant la fin du mois.',
      nextAction: {
        owner: 'Maëlle Lorquin',
        dueDate: '2026-09-30',
        condition: 'si le bon de commande n’est pas signé avant la fin du mois',
        expectedResult: 'Bon de commande signé, mission calée pour démarrage.',
      },
      // #2984 — consentement déclaré, et un brouillon de suivi qui ne
      // reprend QUE ce que le debrief ci-dessus porte déjà — jamais un texte
      // inventé pour la démo.
      recordingConsent: true,
      followUpDraft: {
        subject: null,
        body: [
          'Bonjour,',
          '',
          'Suite à notre échange téléphonique,',
          'Le bon de commande est chez les achats, en attente d’arbitrage budget.',
          'Je reviens vers vous au sujet de : un renfort produit confirmé, périmètre déjà cadré.',
          'Pour rappel : je relance la porte achats avant la fin du mois.',
          'Prochaine étape : si le bon de commande n’est pas signé avant la fin du mois.',
          '',
          'Bien à vous,',
        ].join('\n'),
      },
    },
  },
  // Société Générale — un fil qui ATTEND une réponse : la relance est le geste
  // que la démonstration veut faire faire.
  {
    company: 'Société Générale',
    contact: null,
    kind: 'meeting',
    direction: 'outbound',
    subject: 'Cadrage — jalons techniques du plan 2029',
    body: 'Tour de table sur le périmètre paiement. Deux ESN déjà installées ; notre entrée se fait par le renfort borné sur les jalons, pas par le remplacement. Prochaine étape : chiffrer deux profils.',
    daysAgo: 12,
    durationSeconds: 3600,
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    kind: 'email',
    direction: 'inbound',
    subject: 'RE: Cadrage — jalons techniques',
    body: "Merci pour le point. Envoie-moi deux profils sur le volet conformité, je les fais circuler en interne avant la commission d'achat.",
    daysAgo: 9,
    durationSeconds: null,
  },
  // Un appel LOGUÉ mais SANS issue choisie — le cas le plus fréquent en
  // clientèle : on note la durée en sortant de l'appel, on qualifie plus
  // tard, parfois jamais. `outcome` reste `undefined` À DESSEIN : c'est ce
  // qui fait écrire « Issue non renseignée » à `TimelinePanel`, la moitié du
  // produit qui dit ce qu'il ignore plutôt que d'inventer un « décroché » par
  // défaut.
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    kind: 'call',
    direction: 'outbound',
    subject: 'Point d’avancement — avant l’envoi des profils',
    body: null,
    daysAgo: 6,
    durationSeconds: 300,
  },
  // #3697.8 — un appel CONSIGNÉ dont le débrief porte une objection RÉELLEMENT exprimée : la ligne
  // « Objection exprimée » de la relation (fiche contact) a ainsi sa provenance — cet appel — à
  // montrer. Ce contact n'a AUCUN numéro en démonstration (poste sans titulaire) : c'est aussi la
  // fiche où « Préparer mon appel » se montre sans numéro. Rien n'est appelé : l'appel est SEMÉ.
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    kind: 'call',
    direction: 'outbound',
    subject: 'Retour sur les profils conformité',
    body: null,
    daysAgo: 2,
    durationSeconds: 420,
    outcome: 'connected_qualified',
    callDebrief: {
      fact: 'A lu les deux profils conformité envoyés.',
      objection: 'Un prestataire est déjà référencé sur ce périmètre ; il veut comparer les délais avant de décider.',
    },
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    kind: 'email',
    direction: 'outbound',
    subject: 'Deux profils conformité — disponibilités',
    body: 'Bonjour,\n\nComme convenu, deux profils sur le volet conformité, disponibles début septembre. Je reste à disposition pour un échange de trente minutes cette semaine.\n\nBien à vous',
    daysAgo: 4,
    durationSeconds: null,
  },
  // SNCF — une relation vivante : ils ont répondu en dernier.
  {
    company: 'SNCF',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Point sur le besoin publié',
    body: null,
    daysAgo: 7,
    durationSeconds: 840,
    // L'ISSUE DÉCLARÉE — cohérente avec ce qui suit : l'e-mail entrant trois
    // jours plus tard confirme un budget et une mise en relation, exactement
    // ce qu'annonce un appel « décroché, qualifié ». Sans elle, la salle
    // n'aurait jamais montré l'écran écrire autre chose qu'« Issue non
    // renseignée » sur son unique appel.
    outcome: 'connected_qualified',
  },
  {
    company: 'SNCF',
    contact: null,
    kind: 'email',
    direction: 'inbound',
    subject: 'RE: Point sur le besoin publié — sponsor interne',
    body: "Le besoin est confirmé côté entité mais la décision remonte au niveau groupe. Je vous mets en relation avec l'acheteur référent la semaine prochaine.",
    daysAgo: 3,
    durationSeconds: null,
  },
  // Lot D01 (06/10/2026) — LE FIL D'UN CONTACT QUI A RÉPONDU (Nadia Perrin,
  // interlocutrice SIMULÉE du client de livraison) : un premier message, puis sa
  // réponse REÇUE — c'est ce que « Traiter la réponse » et « Répondre » lisent.
  // Le message sortant est une trace déclarative, jamais une preuve d'envoi.
  {
    company: 'SNCF',
    contact: 'Nadia Perrin',
    kind: 'email',
    direction: 'outbound',
    subject: 'Renfort sur la refonte applicative — deux profils possibles',
    body: 'Bonjour Nadia,\n\nJulien Castaing m’a indiqué que vous suiviez les achats de prestations numériques de l’entité. Nous pouvons proposer deux profils pour le renfort de la refonte applicative. Auriez-vous quelques minutes pour en parler ?\n\nBien à vous',
    daysAgo: 6,
    durationSeconds: null,
  },
  {
    company: 'SNCF',
    contact: 'Nadia Perrin',
    kind: 'email',
    direction: 'inbound',
    subject: 'RE: Renfort sur la refonte applicative — deux profils possibles',
    body: 'Bonjour,\n\nMerci pour votre message. Envoyez-moi les deux profils avec leurs disponibilités : je les présente au comité d’achat de jeudi. Pouvez-vous aussi me préciser le tarif journalier ?\n\nCordialement',
    daysAgo: 2,
    durationSeconds: null,
  },
  // Le relais d'introduction : Julien Castaing a répondu et ouvert la porte des
  // achats (l'autorisation d'introduction est enregistrée au semis des voies d'accès).
  {
    company: 'SNCF',
    contact: 'Julien Castaing',
    kind: 'email',
    direction: 'inbound',
    subject: 'RE: Point sur le besoin — introduction auprès des achats',
    body: 'Bonjour,\n\nD’accord pour que vous preniez contact avec Nadia Perrin de ma part, pour le renfort uniquement. Je reste le sponsor du programme.\n\nCordialement',
    daysAgo: 8,
    durationSeconds: null,
  },
  {
    company: 'SNCF',
    contact: 'Mathieu Brossard',
    kind: 'email',
    direction: 'outbound',
    subject: 'Panel de prestataires SI — première prise de contact',
    body: 'Bonjour Mathieu,\n\nNous accompagnons des directions du numérique sur des renforts bornés. Seriez-vous disponible pour échanger sur le prochain référencement du panel ?\n\nBien à vous',
    daysAgo: 5,
    durationSeconds: null,
  },
  // #2124.68 — LA PORTE DE DÉCISION DANS L'HISTORIQUE (craft rule n°9).
  //
  // Le journal des portes existait depuis le 19/08 et la salle n'en montrait
  // aucune : l'onglet « Historique & preuves » d'une démonstration ne racontait
  // que des e-mails, alors que la moitié intéressante du produit est de garder
  // QUI a tranché, QUOI, et ce qui manquait au moment de décider.
  //
  // L'objet porte la forme RÉELLE de production (`<porte> — <décision>`) : le
  // libellé lisible est posé par l'écran, et c'est précisément le chemin que ce
  // semis doit exercer. Un prospect lit donc « Priorité du compte — franchie »,
  // jamais `account_priority — accept`, qui est la ligne mesurée sur ce même
  // compte le 14/09/2026.
  //
  // `direction: 'internal'` : décider de son portefeuille n'est pas une touche
  // client, et la mélanger aux échanges ferait passer un compte pour plus
  // travaillé qu'il ne l'est.
  {
    company: 'Société Générale',
    contact: null,
    kind: 'gate_decision',
    direction: 'internal',
    source: 'system',
    subject: 'account_priority — accept',
    body: 'Calendrier et fit d’offre confirmés ; l’accès reste le point dur. Le compte entre au portefeuille prioritaire.',
    daysAgo: 2,
    durationSeconds: null,
  },
  // Société Générale — LA LECTURE ET L'ACTION EXÉCUTÉE (#3505, #3532 ; recette
  // prod 02/10 : « démo SG : 0 consulté ton CRM, aucune exécution semée »).
  // Même forme que ce que la production écrit : `ActivitiesService.recordCrmLookup`
  // journalise le GESTE (ni objet ni corps, `source: 'system'`) à CHAQUE lecture,
  // et `CopilotCardService.recordInTimeline` pose le libellé MÉTIER de la carte
  // réglée. Douze lectures identiques le même jour : l'écran les regroupe en une
  // ligne « × 12 » — c'est ce regroupement que la salle doit pouvoir montrer.
  ...Array.from({ length: 12 }, (): DemoActivity => ({
    company: 'Société Générale',
    contact: null,
    kind: 'crm_lookup',
    direction: 'internal',
    source: 'system',
    subject: null,
    body: null,
    daysAgo: 1,
    durationSeconds: null,
  })),
  {
    company: 'Société Générale',
    contact: null,
    kind: 'workflow',
    direction: 'internal',
    source: 'system',
    subject: 'Préparer un message',
    body: 'Message préparé pour validation — rien n’a été envoyé.',
    daysAgo: 1,
    durationSeconds: null,
  },
  // Groupe BPCE — une seule touche, ANCIENNE (#3262.24, #3284) : compte en file
  // exécution (`volume`, cadence légère) sans mouvement depuis plus de
  // `FOCUS_STALE_DAYS` — c'est ce qui allume la carte « sans mouvement » de la
  // bande de décision de /pilotage. Le silence est réel, pas un défaut de seed :
  // la tâche « Reprendre contact : aucun échange depuis plus d’un mois » le dit.
  {
    company: 'Groupe BPCE',
    contact: null,
    kind: 'email',
    direction: 'outbound',
    subject: 'Renfort — domaines ouverts à la prestation',
    body: 'Bonjour,\n\nVotre groupe publie plusieurs domaines ouverts à la prestation. Nous intervenons en renfort sur ce type de périmètre pendant que les équipes en place poursuivent leur trajectoire — sans les remplacer.\n\nSeriez-vous disponible pour vingt minutes ?',
    daysAgo: 38,
    durationSeconds: null,
  },
  // Groupe BPCE — une touche RÉCENTE (#3509) : compte en file exécution (`volume`)
  // qui n'avait AUCUNE activité, donc comptait « sans mouvement » à côté de
  // leboncoin (carte de /pilotage : 2 au lieu de 1 en recette démo du 01/10).
  // Un compte suivi par le comité se travaille : le journal le dit.
  {
    company: DEMO_BPCE_REAL_CONTACTS_COMPANY,
    contact: null,
    kind: 'meeting',
    direction: 'internal',
    subject: 'Point comité — périmètre des entités et ordre d’approche',
    body: 'Revue du périmètre par entité et de l’ordre d’approche avant la prochaine prise de contact. Décision : commencer par les directions métiers déjà identifiées.',
    daysAgo: 3,
    durationSeconds: 1800,
  },
  // Une réunion INTERNE : elle apparaît dans l'historique, mais ne compte pas
  // comme une touche client.
  {
    company: 'Groupe BPCE',
    contact: null,
    kind: 'meeting',
    direction: 'internal',
    subject: 'Préparation interne — angle renfort',
    body: 'Revue de l’angle avant la prise de contact. Décision : entrer par le renfort, pas par le remplacement.',
    daysAgo: 40,
    durationSeconds: 1800,
  },
  // #3691 — LE CONTACT QUI MONTRE « OÙ EN EST LA RELATION » (craft rule n°9).
  // Un siège de décision (jamais une personne réelle) avec TOUT ce que le résumé
  // distingue : une première tentative, une RÉPONSE enregistrée, puis une
  // nouvelle tentative restée SANS réponse. La messagerie de la salle est
  // annoncée connectée : « sans réponse » est donc une lecture fiable, pas une
  // absence de lecture. Ajoutées EN FIN de tableau : des gardes lisent ce
  // tableau par indice (`DEMO_EVENT_PARTICIPANTS.activityIndex`).
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    kind: 'email',
    direction: 'outbound',
    subject: 'Trajectoire cloud 2029 — renfort borné sur les jalons',
    body: 'Premier message : proposition d’un renfort borné sur les jalons de la trajectoire cloud.',
    daysAgo: 14,
    durationSeconds: null,
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    kind: 'email',
    direction: 'inbound',
    subject: 'RE: Trajectoire cloud 2029 — renfort borné sur les jalons',
    body: 'Réponse : intéressé, demande un format d’atelier avant d’en parler au comité d’architecture.',
    daysAgo: 10,
    durationSeconds: null,
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    kind: 'email',
    direction: 'outbound',
    subject: 'Atelier de 45 minutes — trois créneaux proposés',
    body: 'Relance : trois créneaux pour l’atelier. Aucune réponse à ce jour.',
    daysAgo: 4,
    durationSeconds: null,
  },
  // #3688 — la fiche « note + historique » du MÊME siège : un appel consigné,
  // un point INTERNE (a eu lieu, n'est pas un échange client : il sort du fil
  // « Relation client » et du résumé) et une relance téléphonique PLANIFIÉE
  // (daysAgo négatif = futur : « planifié » ≠ « tenu », elle se lit sous
  // « À venir » et ne compte dans aucun échange). Ajoutés EN FIN : des gardes
  // lisent ce tableau par indice.
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    kind: 'call',
    direction: 'outbound',
    subject: 'Appel de qualification — personne au bureau',
    body: null,
    daysAgo: 7,
    durationSeconds: 60,
    outcome: 'no_answer',
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    kind: 'meeting',
    direction: 'internal',
    subject: 'Préparation interne — angle de l’atelier avant la relance',
    body: 'Point d’équipe : décider de l’angle (renfort borné) et de qui relance. Aucun échange avec le contact.',
    daysAgo: 3,
    durationSeconds: 900,
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    kind: 'call',
    direction: 'outbound',
    subject: 'Relance téléphonique — créneau réservé',
    body: null,
    daysAgo: -2,
    durationSeconds: null,
  }, // #3904.1 (lot M05, 09/10) — le geste « appeler » du plan d'actions de Laura
  // (`get_action_plan`) : un compte dont la DERNIÈRE tentative est un appel
  // sortant resté sans réponse depuis plus de deux semaines. 35 jours : dans la
  // fenêtre par défaut du bilan (90 j), au-delà de `FOCUS_STALE_DAYS` (30) pour
  // ne rien changer aux comptes « sans mouvement » de /pilotage. Ajouté EN FIN :
  // des gardes lisent ce tableau par indice.
  {
    company: 'Alstom',
    contact: null,
    kind: 'call',
    direction: 'outbound',
    subject: 'Appel de prise de contact — messagerie',
    body: null,
    daysAgo: 35,
    durationSeconds: 45,
    outcome: 'no_answer',
  },
  // #3904 (décision Louis 09/10) — l'AUTRE règle du geste « appeler » : deux
  // e-mails SORTANTS consécutifs restés sans réponse. ENGIE (dossier de la
  // salle sans aucun échange jusqu'ici) : 44 puis 32 jours — au-delà de
  // `FOCUS_STALE_DAYS` (30), rien ne change aux comptes « sans mouvement ».
  // Aucune personne nommée, aucun corps inventé au-delà d'un message de
  // prise de contact générique. Ajoutés EN FIN : des gardes lisent par indice.
  {
    company: 'ENGIE',
    contact: null,
    kind: 'email',
    direction: 'outbound',
    subject: 'Renfort — prise de contact',
    body: 'Bonjour,\n\nNous intervenons en renfort sur des périmètres applicatifs comparables aux vôtres. Seriez-vous disponible pour vingt minutes ?',
    daysAgo: 44,
    durationSeconds: null,
  },
  {
    company: 'ENGIE',
    contact: null,
    kind: 'email',
    direction: 'outbound',
    subject: 'Renfort — relance',
    body: 'Bonjour,\n\nJe me permets de revenir vers vous au sujet de mon précédent message. Un créneau de vingt minutes vous conviendrait-il ?',
    daysAgo: 32,
    durationSeconds: null,
  },
]

/**
 * #2974 (recette prod 02/10) — les PARTICIPANTS d'événement de la salle : le
 * contact de chaque réunion ou appel qui en nomme un (`activity_participants`,
 * lu par `CampaignAudienceService.listEvents`). Sans eux, le sélecteur
 * « Événement » de la source « Participants d'un événement » ne s'affichait
 * jamais en démo. Dérivé de `DEMO_ACTIVITIES` : aucune personne de plus, ni
 * aucun échange de plus — jamais un événement sans personne à cibler.
 * `activityIndex` = rang dans `DEMO_ACTIVITIES`.
 */
export const DEMO_EVENT_PARTICIPANTS: readonly { activityIndex: number; contact: string }[] = DEMO_ACTIVITIES.flatMap(
  (activity, activityIndex) =>
    (activity.kind === 'meeting' || activity.kind === 'call') && activity.contact
      ? [{ activityIndex, contact: activity.contact }]
      : [],
)

/**
 * Les TÂCHES d'exemple — ce qu'il reste à faire dans la salle.
 *
 * `dueInDays` est relatif au seed, donc à la remise à neuf : une date écrite en
 * dur afficherait « en retard de 240 jours » quelques mois après le déploiement,
 * et le retard est justement le chiffre qu'on veut voir juste.
 *
 * Le jeu contient délibérément UNE tâche en retard : sans elle, l'écran ne
 * montre jamais l'état qu'un commercial reconnaît le mieux, et le bloc
 * « en retard » d'« Aujourd'hui » resterait invisible en démonstration.
 */
type DemoTask = {
  company: string | null
  contact: string | null
  title: string
  details: string | null
  priority: 'normal' | 'high'
  dueInDays: number
  /**
   * #2392 — la CLÔTURE DE FIN DE JOURNÉE lit les tâches par le chemin de
   * production. Sans une tâche close et une créée « aujourd'hui », ses
   * sections Résultats, Blocages et Engagements resteraient vides en salle de
   * démonstration. Relatif au seed, comme `dueInDays`. Absent = créée il y a
   * trois jours et encore ouverte (le comportement d'avant).
   */
  createdDaysAgo?: number
  closed?: { status: 'done' | 'cancelled'; resultNote: string }
  /** #2395.8 (épopée #2871), seconde moitié — « à quoi ressemble fait ? »,
   *  distinct de `details`. Requis à la création depuis ce lot : chaque
   *  entrée en porte un, réel pour la démo, jamais un texte générique
   *  répété. */
  expectedResult: string
  /** #2395.4/#2395.9 (épopée #2901) — jamais deviné : seedé UNIQUEMENT sur la
   *  tâche dont le texte le dit déjà (« par téléphone plutôt que par mail »),
   *  pour que le champ neuf se voie sans en inventer sur les autres. */
  channel?: 'phone' | 'email' | 'linkedin' | 'meeting'
  /** #2395.8 (épopée #2871) — POURQUOI cette tâche, distinct de `details` et
   *  d'`expectedResult`. Requis à la création depuis ce lot : chaque entrée
   *  en porte un, réel pour la démo, jamais un texte générique répété. */
  objective: string
  /** #3271.8 reste (épopée #3298) — le rituel d'où l'action vient : seedé sur
   *  quelques tâches ouvertes pour que « actions créées » se voie dans
   *  /team › Rituels. Jamais sur les autres — elles ne viennent d'aucun rituel. */
  ritualKey?: 'monthly' | 'quarterly'
}

export const DEMO_TASKS: readonly DemoTask[] = [
  // #2392 — une tâche COCHÉE le jour même (section « Résultats »), une
  // ABANDONNÉE avec sa raison (section « Blocages »), et une PROMESSE prise dans
  // la journée (section « Engagements pris »).
  {
    company: 'SNCF',
    contact: null,
    title: 'Envoyer le compte rendu du point',
    details: null,
    priority: 'normal',
    dueInDays: 0,
    closed: { status: 'done', resultNote: 'Compte rendu transmis à l’équipe programme, prochain point jeudi.' },
    objective: 'Garder l’équipe programme alignée sur les décisions du point.',
    expectedResult: 'Le compte rendu est transmis, prochain point calé.',
  },
  {
    company: 'Groupe BPCE',
    contact: null,
    title: 'Caler un déjeuner avec un responsable technique du groupe',
    details: null,
    priority: 'normal',
    dueInDays: 0,
    closed: {
      status: 'cancelled',
      resultNote: 'Le responsable part en congé trois semaines — à reprendre à son retour.',
    },
    objective: 'Ouvrir un contact direct avec un responsable technique du groupe.',
    expectedResult: 'Un déjeuner calé avec un responsable technique du groupe.',
  },
  {
    company: 'Société Générale',
    contact: null,
    title: 'Envoyer deux profils cloud promis en réunion',
    details: 'Promis ce matin au directeur des systèmes d’information.',
    priority: 'high',
    dueInDays: 3,
    createdDaysAgo: 0,
    expectedResult: 'Les deux profils reçus et validés par le DSI, prêts pour un premier échange.',
    objective: 'Tenir la promesse faite au DSI en réunion.',
  },
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
    title: 'Relancer sur les deux profils conformité',
    details: 'Envoyés il y a quatre jours, sans réponse. Relancer par téléphone plutôt que par mail.',
    priority: 'high',
    dueInDays: -2,
    channel: 'phone',
    objective: 'Obtenir une décision sur les deux profils conformité.',
    expectedResult: 'Une décision, positive ou négative, sur les deux profils conformité.',
  },
  {
    company: 'SNCF',
    contact: null,
    title: 'Obtenir le nom de l’acheteur référent',
    details: 'Promis en fin de semaine dernière lors du point sur le besoin publié.',
    priority: 'normal',
    dueInDays: 0,
    objective: 'Savoir qui décide côté achats pour adresser le bon interlocuteur.',
    expectedResult: 'Le nom de l’acheteur référent, obtenu.',
    ritualKey: 'monthly',
  },
  {
    company: 'Groupe BPCE',
    contact: null,
    title: 'Préparer l’angle renfort sur les domaines ouverts',
    details: null,
    priority: 'normal',
    dueInDays: 1,
    objective: 'Arriver au déjeuner avec un angle prêt à présenter.',
    expectedResult: 'Un angle « renfort sur les domaines ouverts » prêt à présenter.',
    ritualKey: 'monthly',
  },
  {
    company: null,
    contact: null,
    title: 'Mettre à jour la grille tarifaire du trimestre',
    details: null,
    priority: 'normal',
    dueInDays: 6,
    objective: 'Garder les propositions alignées sur les tarifs en vigueur.',
    expectedResult: 'La grille tarifaire à jour pour le trimestre en cours.',
    ritualKey: 'quarterly',
  }, // #3688 — la tâche FUTURE du siège de la fiche « note + historique » : une
  // action à venir (échéance, responsable), lue à part des échanges passés.
  {
    company: 'Société Générale',
    contact: seatName('Directeur des systèmes d’information groupe'),
    title: 'Préparer le format de l’atelier de 45 minutes',
    details: 'Le DSI en a demandé le format avant d’en parler au comité d’architecture.',
    priority: 'normal',
    dueInDays: 3,
    objective: 'Répondre à la demande de format sans attendre la relance.',
    expectedResult: 'Un format d’atelier d’une page, prêt à joindre à la relance.',
  },
]

/**
 * #2123.46/#2123.47 (16/09/2026) — LES TÂCHES DU PLAN D'ACTION, POUR L'ÉCRAN
 * `/actions`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE JEU N'EST PAS `DEMO_TASKS` CI-DESSUS
 * ─────────────────────────────────────────────────────────────────────────
 * `DEMO_TASKS` sème la table `tasks` (l'écran « Mes tâches » générique).
 * `action_plan_items` est une table DIFFÉRENTE : la ligne que le plan d'un
 * compte affiche (`ActionPlanBoard`) ET que `GET /plan-items/mine` liste sur
 * `/actions` (l'onglet « Mes relances » de `ActionCenter`, via `MyRelancesList`
 * — DÉCISION Louis 17/09/2026 : la section `MyPlanTasks`, qui l'avait branché
 * le 16/09/2026, faisait double emploi avec cet onglet et a été retirée).
 * Avant ce lot, la porte `/plan-items/mine` était prête et testée côté API,
 * mais AUCUNE ligne
 * `action_plan_items` n'existait dans le jeu de démo — le widget se serait
 * ouvert vide sur le lien public, découvert en réunion plutôt qu'en CI
 * (craft rule n°9).
 *
 * Chaque entrée porte un compte RÉEL de {@link DEMO_DOSSIERS} — jamais un
 * compte inventé pour l'occasion : une tâche sur une société qui n'existe pas
 * dans la salle serait une trace sans dossier à ouvrir.
 *
 * `dueInDays` suit EXACTEMENT la convention de {@link DemoTask} (relatif au
 * semis, jamais une date écrite en dur) — et `null` est un troisième état,
 * PAS un quatrième `dueInDays: 0` : une tâche saisie sans échéance en est une
 * quand même (#2123.46), et l'écran doit la montrer sans date plutôt que
 * d'en inventer une. Le jeu porte donc DEUX cas volontaires, en plus du cas
 * normal (SNCF) qui a une raison sociale lisible — pour que le libellé
 * normal se voie, pas seulement le repli « Compte sans nom » de l'écran :
 *  - Société Générale : AUCUNE échéance (`null`) ;
 *  - Groupe BPCE : EN RETARD (`dueInDays: -2`), même choix que `DEMO_TASKS`
 *    plus haut — sans lui, l'état qu'un commercial reconnaît le mieux ne se
 *    voit jamais en démonstration.
 *
 * #2068.1 — décision Louis 19/09/2026 (2068.11) : « Plan à 4 semaines » de
 * l'audit (`/settings/profile/audit`) lit désormais CETTE table
 * (`buildThirtyDayPlanFromActions`, `apps/web/.../lib/build-audit.ts`), en
 * plaçant chaque tâche dans une fenêtre glissante de 7 jours depuis `due_date`.
 * Trois tâches SEULES (SNCF +3j, Société Générale sans date, Groupe BPCE en
 * retard) ne rempliraient que la semaine en cours — les TROIS dernières
 * entrées (Société Générale +10j, Groupe BPCE +17j, SNCF +24j) placent une tâche dans
 * CHACUNE des trois semaines suivantes, pour que le plan démonstratif montre
 * les 4 semaines REMPLIES plutôt que 3 vides sur 4. Comptes RÉELS, toujours
 * ({@link DEMO_DOSSIERS}) — voir `demo-audit-plan-coverage.spec.ts` pour la
 * preuve EXÉCUTÉE (une garde aveugle par TABLE ne verrait pas une semaine
 * vide).
 */
type DemoPlanTask = {
  company: string
  label: string
  dueInDays: number | null
  /** #2123.46 — le responsable SAISI au formulaire, jamais une délégation. */
  ownerName: string | null
  /**
   * #2123.46 — le résultat attendu et l'indicateur, que la carte du plan
   * affiche (la veille et le panneau besoin les écrivent). Semés sur UNE tâche,
   * pour que la démonstration montre les deux champs, et `null` sur les autres
   * — une action saisie à la main n'en porte pas forcément.
   */
  expectedOutcome: string | null
  kpi: string | null
  /**
   * #2715.1 (23/09/2026) — le contact que cette tâche vise, par NOM (résolu en
   * `contact_id` au semis, même porte que {@link DEMO_USER_ACTIONS}). `null`
   * sur les six tâches d'origine : elles ciblaient un compte, jamais une
   * personne. La seule tâche qui en porte un vise Directeur technique — entité numérique voyageurs (SNCF
   * LOGISTIQUE, client d'exemple, interlocuteur FICTIF) — jamais un dirigeant
   * RÉEL des six autres dossiers : eux ne reçoivent par construction aucune
   * trace d'ENVOI (voir l'avertissement au-dessus de `DEMO_USER_ACTIONS`).
   */
  contact: string | null
  /**
   * #4163 LF — le « POURQUOI » de la relance, écrit dans `action_plan_items.reason` : la file « À traiter » le
   * montre sous le titre de la carte. Un fait DÉJÀ semé sur le dossier, jamais un fait inventé pour l'occasion ;
   * `undefined` = aucune raison écrite (la carte nomme alors sa source : « Issu du plan d'action de … »).
   */
  reason?: string
  /**
   * #2396.1 (24/09/2026, recette salle de démo f9f23f887) — LE CHIP DE MODE DE
   * COMPLÉTION, SEMÉ. `PlanItemFacts.tsx` n'affiche la puce
   * (« manuelle »/« preuve ») que sur une ligne `execution_status: 'done'`
   * ET `completion_mode` non nul (`facts.status === 'done' && facts.completionMode`).
   * Les sept tâches d'origine sont TOUTES `todo` : la puce ne s'était jamais
   * montrée en démonstration, sur AUCUN dossier. `undefined` = tâche ouverte,
   * comportement inchangé.
   */
  executionStatus?: 'done'
  /**
   * Requis quand `executionStatus === 'done'` — jamais deviné (GA-18/GA-19).
   * `'manual'` : issue choisie par un commercial (`ActionPlanItemsService
   * .applyStatus`). `'proof'` : envoi vérifié qui a refermé l'action toute
   * seule (`CadenceService.completeOpenItemsByProof`) — `outcome` y reste
   * `null`, personne n'a choisi.
   */
  completionMode?: 'manual' | 'proof'
  // #3416.1 (lot C14 30/09) — `blocked_by_procurement` ajouté à la liste
  // curatée : les valeurs listées ici sont celles réellement SEMÉES, pas
  // les vingt-quatre d'`ActionPlanOutcome`.
  outcome?:
    | 'positive'
    | 'declined'
    | 'deferred'
    | 'qualified'
    | 'no_response'
    | 'blocked_by_procurement'
    | 'blocked_by_margin'
    | 'technical_error'
    | 'abandoned'
    | null
  /**
   * Jours ÉCOULÉS depuis le semis (jamais une date en dur) — même convention
   * que `dueInDays`, signe opposé. Ignoré si `executionStatus` n'est pas `'done'`.
   */
  completedDaysAgo?: number
  /**
   * #3289 (#3264.31/.32/.33) — le canal de l'action (colonne `channel`), lu par
   * `SendTimingService`. `undefined` = aucun canal, comportement inchangé.
   */
  channel?: 'email' | 'phone' | 'linkedin'
  /**
   * #3289 — l'INSTANT de complétion, posé par jour de semaine et heure UTC :
   * le dernier `weekday` (1 = lundi … 5 = vendredi) écoulé à `utcHour`:00 UTC.
   * Remplace `completedDaysAgo` (un écart en jours ne fixe pas le jour de la
   * semaine, donc ne peut pas montrer un créneau). 8 h UTC = matin, 13 h UTC =
   * après-midi à Paris été comme hiver — le créneau ne dépend pas de l'heure d'été.
   */
  completedSlot?: { weekday: 1 | 2 | 3 | 4 | 5; utcHour: 8 | 13 }
  /**
   * #3287 (#3265.2) — ce qui arrête CETTE action (colonne `stop_condition`),
   * lu par `PlanItemFacts` (« S'arrête quand : … »). `undefined` = non posé.
   * `source_recommendation` et `external_execution_id` ne sont PAS semés
   * (`method_rule` l'est depuis X64, sur UN seul scénario : voir `methodRule`) :
   * le premier et le second n'ont d'écrivain que des gestes
   * précis (panneau de renouvellement, ajout de contact), le troisième ne
   * dit vrai qu'après un événement d'agenda réellement créé — le semer serait
   * inventer un fournisseur connecté.
   */
  stopCondition?: string
  /**
   * #3274.4 (recette prod 02/10) — la règle du corpus méthode sous laquelle
   * l'action a été posée (colonne `method_rule`). Posée sur UN seul scénario :
   * cinq actions faites, sans résultat, sur le client d'exemple FICTIF — ce qui
   * fait basculer la règle à « contredite par cet espace »
   * (`workspaceDeactivatedRuleIds`). Les autres lignes ne portent aucune règle.
   */
  methodRule?: string
  /**
   * #4418 — la touche de cadence (colonne `cadence_step`) d'une relance PLANIFIÉE par un « Marquer envoyé »
   * (`CadenceService.scheduleForContact`, J+3/J+6/J+9) : la file « Aujourd'hui » la montre comme n'importe
   * quelle relance de cadence. `undefined` = action saisie à la main (aucune touche).
   */
  cadenceStep?: 'relance' | 'preuve_sociale' | 'close_loop'
}

export const DEMO_PLAN_TASKS: readonly DemoPlanTask[] = [
  {
    company: 'SNCF',
    label: 'Envoyer la synthèse de l’audit sécurité au RSSI',
    dueInDays: 3,
    ownerName: null,
    expectedOutcome: 'Obtenir un créneau de restitution avec le RSSI',
    kpi: 'Rendez-vous de restitution posé',
    contact: null,
    reason: 'La synthèse de l’audit sécurité est le livrable promis au RSSI.',
  },
  // #2923 — QUATRE tâches manuelles supplémentaires sur SNCF (re-semées le
  // 01/10/2026, retrait des quatre comptes non cibles), pour que ce dossier vedette porte CINQ
  // tâches manuelles au total (> NEXT_ACTIONS_MAX = 3) : sans elles, `UserActionSection` (ActionPlanBoard.tsx) n'affichait
  // jamais son bouton « voir plus » en démonstration — la coupure à 3 existe
  // dans le composant depuis #2317.6/#2317.7, mais aucun dossier de démo
  // n'avait jamais porté assez de lignes manuelles pour la déclencher. Les
  // quatre libellés reprennent des faits déjà semés sur ce dossier
  // (`sncfChallenges`, `sncfSignals` ci-dessus) — jamais un fait inventé
  // pour l'occasion.
  {
    company: 'SNCF',
    label: 'Cartographier les besoins d’interopérabilité entre les six entités',
    dueInDays: 5,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  {
    company: 'SNCF',
    label: 'Proposer un renfort régie sur le besoin publié de l’entité numérique voyageurs',
    dueInDays: 8,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    stopCondition: 'Le RSSI a répondu à la proposition, dans un sens ou dans l’autre.',
  },
  {
    company: 'SNCF',
    label: 'Qualifier le périmètre éligible au renfort externe (hors périmètres sensibles)',
    dueInDays: 12,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    stopCondition: 'Le périmètre est qualifié, ou écarté par le RSSI.',
  },
  {
    company: 'SNCF',
    label: 'Préparer un point sur la montée en charge de la refonte applicative',
    dueInDays: 15,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  // #3265.13 (épopée #3287) — UNE ACTION FAITE avec une issue sur SNCF, l'un
  // des trois premiers dossiers seedés que `BriefingService.buildDemo` porte
  // sur « Aujourd'hui » (`accounts.find({ take: 3 })`, ordre de semis de
  // `DEMO_DOSSIERS` : Société Générale, Groupe BPCE, SNCF). Sans elle, la
  // ligne « dernier résultat déclaré » de `PriorityCard` ne se voyait jamais
  // en salle. Le libellé reprend le fait déjà semé (la refonte applicative de
  // `sncfChallenges`) — jamais un fait inventé pour l'occasion — comme un
  // pas antérieur à la tâche « Préparer un point… » juste au-dessus :
  // confirmer le besoin avant de préparer le point. `dueInDays: null` : une
  // tâche FAITE sort du plan à 4 semaines (même convention que SNCF
  // LOGISTIQUE plus bas).
  {
    company: 'SNCF',
    label: 'Confirmer le besoin de renfort sur la refonte applicative',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'qualified',
    completedDaysAgo: 3,
  },
  {
    company: 'Société Générale',
    label: 'Qualifier le sponsor budgétaire du programme DORA',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  {
    company: 'Groupe BPCE',
    label: 'Relancer après le comité d’architecture',
    dueInDays: -2,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    reason: 'Le comité d’architecture de Groupe BPCE a eu lieu : la suite donnée n’est pas encore connue.',
  },
  // #2068.1 — les trois entrées suivantes remplissent les semaines 2, 3 et 4
  // du plan à 4 semaines (voir le docblock ci-dessus) : sans elles, seule la
  // semaine en cours porterait une priorité en démonstration.
  {
    company: 'Société Générale',
    label: 'Envoyer la grille tarifaire actualisée au sponsor',
    dueInDays: 10,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  {
    company: 'Groupe BPCE',
    label: 'Reprendre contact : aucun échange depuis plus d’un mois',
    dueInDays: 17,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  {
    company: 'SNCF',
    label: 'Qualifier l’entité par laquelle ouvrir le compte',
    dueInDays: 24,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  // #2715.1 (correction du coordinateur, 23/09) — LA tâche du plan qui montre
  // un e-mail VRAIMENT envoyé (`send_status: 'email_sent'`), pour que
  // `ActionPlanBoard` ne porte jamais QUE des tâches sans statut d'envoi en
  // démonstration. Rattachée à Directeur technique — entité numérique voyageurs (SNCF, client
  // d'exemple, interlocuteur FICTIF — voir le docblock de `DemoPlanTask`) ;
  // le `message_sent`/`via:'bellum'` qui la rend « vérifiée » est semé plus
  // bas, dans `DEMO_USER_ACTIONS`.
  {
    company: 'SNCF',
    label: 'Relancer sur la reprise du run après l’envoi de la synthèse',
    dueInDays: 4,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: seatName('Directeur technique — entité numérique voyageurs'),
  },
  // #4521.6 — UNE CARTE E-MAIL ISSUE DU PLAN, complète pour la rafale « Traiter : E-mails » : le contact nommé
  // (résolu depuis `contact_id`), le signal cité dans la consigne (lu par `readPlanSignal`, « Repli de CA : … »),
  // et le canal e-mail qui offre « Générer le mail ». Interlocuteur FICTIF et chiffres FICTIFS de la salle de démo.
  {
    company: 'SNCF',
    label:
      'Envoyer un email J1 (5 lignes, pas de PJ) au Directeur technique en s’appuyant sur le signal factuel du repli de CA (72,4 M€ à 69,1 M€)',
    dueInDays: 0,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    channel: 'email',
    reason: 'Le repli du chiffre d’affaires de l’entité est l’angle d’ouverture du premier e-mail.',
  },
  // #4418 — UNE RELANCE ISSUE D'UN « MARQUER ENVOYÉ », visible dans Aujourd'hui : le commercial a envoyé un
  // message hors Bellum puis l'a noté, Bellum planifie la relance (J+3) comme pour un envoi Bellum. Libellé
  // au format réel de `CadenceService` (« <touche> — <contact> »). Aucune preuve d'envoi n'est semée : « fait »
  // reste déclaratif. Interlocuteur FICTIF, comme la relance ouverte juste au-dessus.
  {
    company: 'SNCF',
    label: 'Relance — Directeur technique — entité numérique voyageurs',
    dueInDays: 0,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    cadenceStep: 'relance',
  },
  // #2396.1 (24/09/2026, recette f9f23f887) — DEUX tâches déjà FAITES, pour
  // que le chip de mode de complétion ait quelque chose à lire. `dueInDays:
  // null` volontairement : une tâche faite sort de « mes actions ouvertes »
  // (`ActionPlanItemsService.listOpenForUser`), donc jamais du plan à 4
  // semaines de l'audit — lui donner une échéance affirmerait un état que
  // l'écran ne produit jamais (`demo-audit-plan-coverage.spec.ts` ne lit que
  // les tâches datées).
  {
    company: 'SNCF',
    label: 'Confirmer le go du run pilote après le comité',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    // #3265.13 — rattachée à Directeur technique — entité numérique voyageurs (comme la relance ouverte plus
    // haut) : sa fiche Contact montre ainsi l'issue « Positif » ET le
    // prochain geste (`ContactLastOutcomeCard`).
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'positive',
    completedDaysAgo: 2,
  },
  {
    company: 'SNCF',
    label: 'Reprendre contact après réponse au dernier e-mail',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'proof',
    outcome: null,
    completedDaysAgo: 1,
  },
  // #3416.1 (lot C14 30/09, beta-feedback #3416) — une tâche FAITE avec l'une
  // des quatre issues ajoutées à la recette (`blocked_by_procurement`), pour
  // que la démonstration montre la case « bloqué par les achats » et non
  // seulement les issues historiques (`positive`, `qualified`,
  // `connected_qualified`, semées plus haut).
  {
    company: 'SNCF',
    label: 'Attendre la validation achats avant signature',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'blocked_by_procurement',
    completedDaysAgo: 3,
  },
  // #3416 (recette 30/09) — les trois autres issues ajoutées (`blocked_by_margin`,
  // `technical_error`, `abandoned`) : l'issue choisie se LIT maintenant sur la
  // ligne faite (`PlanItemFacts`), donc la salle les montre toutes les quatre
  // sans qu'un visiteur ait à écrire.
  {
    company: 'Société Générale',
    label: 'Chiffrer l’extension de périmètre avec la marge cible',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'blocked_by_margin',
    completedDaysAgo: 4,
  },
  {
    company: 'Groupe BPCE',
    label: 'Envoyer le dossier via le portail fournisseur',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'technical_error',
    completedDaysAgo: 5,
  },
  {
    company: 'Société Générale',
    label: 'Relancer le sponsor budgétaire sans retour',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'abandoned',
    completedDaysAgo: 6,
  },
  // #3289 (#3264.31/.32/.33, lot P09 30/09) — HUIT relances par e-mail FAITES,
  // avec issue, pour que « Mes relances » montre le créneau appris (mardi
  // matin : 4 réponses sur 4 ; jeudi après-midi : 1 sur 4). Posées sur des
  // dossiers du jeu (depuis le retrait du 01/10/2026 les trois dossiers sont
  // aussi les trois premiers : `BriefingService` y lit le « dernier résultat
  // déclaré », qui reste une issue déclarée). Libellé
  // générique : aucun fait inventé sur ces comptes, et aucun contact visé.
  {
    company: 'SNCF',
    label: 'Relancer SNCF par e-mail après l’envoi de la synthèse',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'positive',
    channel: 'email',
    completedSlot: { weekday: 2, utcHour: 8 },
  },
  {
    company: 'SNCF',
    label: 'Relancer SNCF par e-mail pour confirmer la réception',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'positive',
    channel: 'email',
    completedSlot: { weekday: 2, utcHour: 8 },
  },
  {
    company: 'Société Générale',
    label: 'Relancer Société Générale par e-mail après l’envoi de la synthèse',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'qualified',
    channel: 'email',
    completedSlot: { weekday: 2, utcHour: 8 },
  },
  {
    company: 'Société Générale',
    label: 'Relancer Société Générale par e-mail pour confirmer la réception',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'positive',
    channel: 'email',
    completedSlot: { weekday: 2, utcHour: 8 },
  },
  {
    company: 'SNCF',
    label: 'Relancer SNCF par e-mail avant le point d’équipe',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    channel: 'email',
    completedSlot: { weekday: 4, utcHour: 13 },
  },
  {
    company: 'Société Générale',
    label: 'Relancer Société Générale par e-mail avant le point d’équipe',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    channel: 'email',
    completedSlot: { weekday: 4, utcHour: 13 },
  },
  {
    company: 'Groupe BPCE',
    label: 'Relancer Groupe BPCE par e-mail après l’envoi de la synthèse',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    channel: 'email',
    completedSlot: { weekday: 4, utcHour: 13 },
  },
  {
    company: 'Groupe BPCE',
    label: 'Relancer Groupe BPCE par e-mail pour confirmer la réception',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'positive',
    channel: 'email',
    completedSlot: { weekday: 4, utcHour: 13 },
  },
  // #3274.4 — le scénario « règle contredite » : cinq actions faites sans résultat
  // sous la même règle, et AUCUN résultat positif sous elle (un seul suffirait à
  // ne pas la contredire).
  {
    company: 'SNCF',
    label: 'Rappeler le sponsor du programme de refonte applicative',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    completedDaysAgo: 10,
    methodRule: 'plan_de_compte_hebdomadaire',
  },
  {
    company: 'SNCF',
    label: 'Relancer l’acheteur sur le bon de commande du renfort',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    completedDaysAgo: 17,
    methodRule: 'plan_de_compte_hebdomadaire',
  },
  {
    company: 'SNCF',
    label: 'Reprendre contact avec la direction des opérations',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    completedDaysAgo: 24,
    methodRule: 'plan_de_compte_hebdomadaire',
  },
  {
    company: 'SNCF',
    label: 'Proposer un point de cadrage à l’équipe terrain',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    completedDaysAgo: 31,
    methodRule: 'plan_de_compte_hebdomadaire',
  },
  {
    company: 'SNCF',
    label: 'Relancer le référent des applications terrain',
    dueInDays: null,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
    executionStatus: 'done',
    completionMode: 'manual',
    outcome: 'no_response',
    completedDaysAgo: 38,
    methodRule: 'plan_de_compte_hebdomadaire',
  },
  // #3282 / #3263.19 (recette Z2 04/10) — « Prochaine action : <date> » sur un
  // siège du comité d'achat SG. Le journal ne la montrait que sur NOVA : six
  // sièges SG sans date devant un prospect. Action OUVERTE, datée, rattachée au
  // siège du DSI groupe (`contact`) — l'écran la lit sur le classement de contacts
  // (`next_action_due_date`), il ne la recalcule pas.
  {
    company: 'Société Générale',
    label: 'Préparer le point de cadrage avec le DSI groupe',
    dueInDays: 6,
    ownerName: null,
    expectedOutcome: 'Un créneau de cadrage posé avec le DSI groupe',
    kpi: null,
    contact: seatName('Directeur des systèmes d’information groupe'),
  },
  // #3282 (recette 05/10 : le siège « rôle » ne montrait rien à l'écran) — la même mention sur des
  // personnes NOMMÉES du comité SG : leur nom est unique et se rapproche sans ambiguïté, là où un siège
  // sans titulaire peut être écarté du classement (homonyme) et perdre sa date.
  {
    company: 'Société Générale',
    label: 'Envoyer la synthèse du dossier au directeur général délégué',
    dueInDays: 4,
    ownerName: null,
    expectedOutcome: 'La synthèse lue avant le comité de pilotage',
    kpi: null,
    contact: 'Pierre Palmieri',
  },
  {
    company: 'Société Générale',
    label: 'Caler un échange avec le président du conseil d’administration',
    dueInDays: 9,
    ownerName: null,
    expectedOutcome: 'Un créneau d’échange posé',
    kpi: null,
    contact: 'Lorenzo Bini Smaghi',
  },
  // #3691 — la RELANCE EN RETARD du siège qui porte déjà une tâche future (« point de cadrage », +6 j) :
  // le résumé « où en est la relation » montre alors la relance en retard EN PREMIER (elle reste en retard),
  // l'autre action derrière « + 1 autre action ouverte ».
  {
    company: 'Société Générale',
    label: 'Relancer le DSI groupe : trois créneaux d’atelier sans réponse',
    dueInDays: -2,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: seatName('Directeur des systèmes d’information groupe'),
  },
  // Lot L-A (#4164, craft rule n°9) — LA FILE « AUJOURD'HUI » doit porter les cinq gestes et les
  // quatre sections en démonstration. Les relances du plan n'avaient AUCUN canal ouvert : tout
  // tombait en « Tâches ». Deux relances de plus, avec leur canal, pour que « E-mails » ait du
  // retard et « LinkedIn » un geste du jour — sur des comptes déjà cibles, avec des faits déjà
  // semés (le comité d'architecture BPCE, le DSI groupe SG), jamais un fait inventé.
  {
    company: 'Groupe BPCE',
    label: 'Envoyer par e-mail le compte rendu du comité d’architecture au sponsor',
    dueInDays: -1,
    ownerName: null,
    expectedOutcome: 'Obtenir la date du prochain comité',
    kpi: 'Date du prochain comité connue',
    contact: null,
    channel: 'email',
    reason: 'Le compte rendu du comité d’architecture a été promis au sponsor.',
  },
  {
    company: 'Société Générale',
    label: 'Répondre sur LinkedIn au DSI groupe après l’atelier',
    dueInDays: 0,
    ownerName: null,
    expectedOutcome: 'Garder le fil avec le DSI groupe',
    kpi: 'Réponse du DSI groupe',
    contact: null,
    channel: 'linkedin',
    reason: 'Le DSI groupe a échangé avec toi à l’atelier : le fil se garde chaud.',
  },
  // #4485 (décision Louis 24/10, « Proposer de les clore ») — DEUX relances ouvertes en retard de PLUS DE
  // 30 jours (-45 et -92 j, relatif au semis, jamais une date en dur), sur des comptes déjà cibles : sans
  // elles, le bandeau « N actions en retard de plus de 30 jours — les marquer faites ? » ne se voit jamais en
  // démonstration. Elles ne portent aucun canal ni contact : de vieilles relances de ménage, pas un fait.
  {
    company: 'Groupe BPCE',
    label: 'Recontacter le sponsor après la revue d’architecture de l’été',
    dueInDays: -45,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
  {
    company: 'SNCF',
    label: 'Reprendre le fil avec la DSI sur le périmètre d’audit',
    dueInDays: -92,
    ownerName: null,
    expectedOutcome: null,
    kpi: null,
    contact: null,
  },
]

/* ------------------------------------------------------------------ */
/* Client d'exemple — le volet ATS et delivery (arbitrage Louis 17/08)  */
/* ------------------------------------------------------------------ */

/**
 * Le client FICTIF qui porte la moitié « delivery » de la démonstration.
 *
 * Pourquoi il existe, et pourquoi il est fictif alors que les six autres
 * dossiers sont de vraies sociétés.
 *
 * Les écrans Positionnements, Missions et Prêt à facturer ne se remplissent
 * qu'à partir d'un contrat SIGNÉ. Les rattacher à l'une des six sociétés
 * réelles du jeu de démonstration afficherait « mission en cours chez X » à un
 * prospect — c'est-à-dire affirmerait une relation commerciale qui n'existe
 * pas, sur une société qui existe, elle. C'est la ligne rouge du jeu depuis le
 * passage aux comptes réels. Les laisser vides, à l'inverse, cachait la moitié
 * ATS du produit à celui qui ouvre le lien.
 *
 * D'où ce sixième compte, et trois précautions qui le rendent impossible à
 * confondre :
 *  - son nom porte la mention « client d'exemple » ;
 *  - son domaine est en `.example`, réservé par la RFC 2606 et donc jamais
 *    attribuable à une vraie société ;
 *  - il est marqué `customer`, pas prospect : il n'apparaît pas dans les vues
 *    de conquête, où il n'aurait rien à faire.
 *
 * Son dossier d'analyse est volontairement mince. Ce compte n'est pas là pour
 * montrer ce que Bellum DÉCOUVRE — les cinq autres le font, avec des données
 * réelles — mais ce qu'il devient une fois l'affaire gagnée.
 */
/**
 * Le verdict d'un retour client sur un positionnement — le vocabulaire du
 * CONTRAT, pas un synonyme.
 *
 * ⚠️ Ce type existe à cause d'une panne de PRODUCTION : ce jeu écrivait
 * « strong / good / weak / acceptable », que la contrainte SQL
 * `submission_feedback_verdicts_check` refuse (`unknown | below | meets |
 * above`). Le semis levait donc une 23514 à cet endroit, `tidy()` l'attrapait,
 * et la salle était servie TELLE QUELLE — c'est-à-dire amputée de TOUT ce qui
 * vient après : missions, affectations, relevés d'activité, facturation, et
 * les six blocs propagés qui les lisent. Un prospect lisait « Aucune mission »
 * sur un produit qui en sème sept.
 *
 * Le champ était typé `string` : ni `tsc` ni aucune suite ne pouvait le voir.
 * Il est désormais tenu par le contrat, donc la compilation refuse le prochain
 * synonyme — c'est la seule garde qui ne dort jamais.
 */
type DemoFeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

/** Le retour client d'un positionnement de démonstration. */
type DemoSubmissionFeedback = {
  technical: DemoFeedbackVerdict
  experience: DemoFeedbackVerdict
  communication: DemoFeedbackVerdict
  price: DemoFeedbackVerdict
  verbatim: string
}

/**
 * #2335.5 — le retour du CONSULTANT, un objet SÉPARÉ du retour client
 * ci-dessus (jamais fusionnés, doctrine LAU-FINAL-076). Huit axes qui lui sont
 * propres.
 */
type DemoConsultantFeedback = {
  interest: DemoFeedbackVerdict
  understanding: DemoFeedbackVerdict
  manager: DemoFeedbackVerdict
  mission: DemoFeedbackVerdict
  conditions: DemoFeedbackVerdict
  concerns: DemoFeedbackVerdict
  availability: DemoFeedbackVerdict
  decision: DemoFeedbackVerdict
  verbatim: string
}

/**
 * #2196.31 — L'EXCEPTION « NON APPLICABLE » d'un relevé, en démonstration.
 *
 * Posée sur le DERNIER mois d'une mission en régie TERMINÉE, qui n'a aucun
 * relevé ce mois-là : sans elle, la ligne s'afficherait « manquant » pour
 * toujours. La mission choisie a fini il y a plus de deux mois (`ends_in_days:
 * -76`) : l'exception ne masque JAMAIS le mois précédent, où « Cadrage données
 * transport — lot 2 » doit continuer de montrer l'état « manquant ».
 *
 * Le motif est un fait de SEMIS, comme le reste de la salle : aucune donnée
 * réelle n'est affirmée — la mission et son client sont fictifs.
 */
export const DEMO_TIMESHEET_EXCEPTIONS: readonly {
  mission_label: string
  reason: string
  marked_days_ago: number
}[] = [
  {
    mission_label: 'Migration du socle applicatif vers les conteneurs — lot 1',
    reason:
      'Dernier mois de mission : les derniers jours ont été facturés avec le mois précédent (avenant de clôture), aucun relevé séparé.',
    marked_days_ago: 70,
  },
]

/**
 * Théo 23/10/2026 (lot talents-vivier) — « CV LU = FICHE QUALIFIÉE » : le
 * bandeau du vivier annonce « 3 CV lus cette semaine : 3 fiches qualifiées »
 * avec leurs noms. SEMÉE : trois fiches de {@link DEMO_CONSULTANTS} portent un
 * `cv_auto_read_at` récent (`DemoSeedService`), la colonne existe déjà — ni table
 * ni clé de raw_analysis neuve. La progression d'un import en cours et les
 * lectures en échec, elles, restent vides à dessein (voir ci-dessus).
 */
export const DEMO_CV_READ_THIS_WEEK: readonly string[] = ['Camille Roussel', 'Anthony Vasseur', 'Léa Fontaine']

/**
 * #2175.29 (épopée #2880, lot V33) — L'ACCORD RÉEL d'un positionné, en salle :
 * son TJM ET son CV validés par geste (`tjm_validated_at` / `cv_validated_at`,
 * #2948). Sans lui, le fait « Accord réel et restrictions » du rail consultant
 * resterait « À vérifier » sur toutes les fiches, et « Prêt à démarrer » ne
 * se verrait jamais. UN seul consultant — Marc Ouedraogo, positionné sur
 * « Ingénieur données » —, pour que la salle montre les deux issues.
 */
export const DEMO_AGREEMENT_CONFIRMED_CONSULTANT = 'Marc Ouedraogo'

/**
 * L3 Pilotage › Staffing (14/10/2026, `/pilotage/staffing`) — ce que la page affiche, côté salle.
 *
 * Consultants et missions sont ceux du jeu existant (`DEMO_CONSULTANTS`, `DEMO_DELIVERY_CLIENT`) ; rien n'est
 * inventé à côté, tout est RELATIF à `now` :
 *  - `dailyCostCents` : coût journalier de QUELQUES consultants seulement. Camille Roussel (intercontrat depuis
 *    la fin de sa mission) a un coût → l'intercontrat est chiffré en € ; Léa Fontaine, elle aussi sans mission,
 *    n'en a PAS → la page dit « coût non renseigné » au lieu d'un montant.
 *  - `absences` : un congé à venir (la capacité d'une semaine baisse) et un congé déjà pris ce mois-ci
 *    (il sort du dénominateur du TACE).
 *  - `currentMonthTimesheets` : jours saisis ce mois-ci sur les missions en cours, en part des jours ouvrés
 *    écoulés — le TACE RÉEL du mois courant. Les relevés du mois précédent sont déjà dans les missions.
 *  - `taceThresholdPercent` : le seuil d'alerte que cette ESN fictive a saisi, pour que l'alerte se voie.
 */
export const DEMO_STAFFING = {
  taceThresholdPercent: 80,
  dailyCostCents: {
    'Camille Roussel': 41_000,
    'Yanis Berthier': 52_000,
    'Salomé Dufour': 49_000,
    'Antoine Rivière': 56_000,
    'Hakim Barreau': 47_000,
    'Marc Ouedraogo': 58_000,
  } as Record<string, number>,
  absences: [
    { consultant: 'Yanis Berthier', starts_in_days: 7, length_days: 5, kind: 'leave' },
    { consultant: 'Hakim Barreau', starts_in_days: -6, length_days: 3, kind: 'leave' },
    // #2408.17 — une absence EN COURS et LONGUE (≥ `PROLONGED_ABSENCE_DAYS`) :
    // allume « Absence prolongée » sur la mission de Marc dans /missions.
    { consultant: 'Marc Ouedraogo', starts_in_days: -4, length_days: 15, kind: 'sick' },
  ] as readonly { consultant: string; starts_in_days: number; length_days: number; kind: ConsultantAbsenceKind }[],
  currentMonthTimesheets: [
    { mission: 'Socle conteneurisé des applications terrain — run', consultant: 'Hakim Barreau', share: 0.9 },
    { mission: 'Supervision de la chaîne de production — mission longue', consultant: 'Marc Ouedraogo', share: 1 },
    {
      mission: 'Industrialisation d’un cas d’usage de recherche — mise en production',
      consultant: 'Salomé Dufour',
      share: 0.55,
    },
    {
      mission: 'Convergence des applications temps réel — lots interfaces et reprise',
      consultant: 'Antoine Rivière',
      share: 0.85,
    },
  ] as readonly { mission: string; consultant: string; share: number }[],
} as const

/**
 * Épopée #2880 (lot V33) — LE CROISEMENT EXPERTISE ↔ FONDEMENT/PREUVE, en
 * salle. Trois lignes STOCKÉES, et c'est la projection qui fait le reste :
 * les réponses plates de {@link DEMO_ESN_PROFILE} (« Data & IA » repose sur
 * une expérience personnelle, « Cybersécurité » sur une simple volonté)
 * restent LUES telles quelles — l'audit à 3 états montre donc les trois
 * issues côte à côte :
 *  - Cloud & Infrastructure : une référence client PROUVÉE par une mission
 *    RÉELLE de la salle (#2039.9), citable (#2039.13), et un vivier prouvé
 *    par un consultant réel du banc → « vous pouvez le vendre maintenant » ;
 *  - Data & IA : une référence client DÉCLARÉE, anonymisable, rattachée à
 *    rien → « vous le savez faire », « pas encore de preuve » ;
 *  - Cybersécurité : la seule volonté de développement → savoir-faire « pas
 *    encore ».
 * Les objets source sont relus par leur NOM dans la salle (mission, consultant),
 * jamais par un identifiant inventé : absent ⇒ la ligne n'est pas écrite.
 */
export const DEMO_EXPERTISE_GROUNDINGS = [
  {
    expertise_key: 'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
    kind: 'client_reference' as const,
    state: 'proven' as const,
    source: { type: 'mission' as const, name: 'Migration du socle applicatif vers les conteneurs — lot 1' },
    label: 'Conteneurisation du socle applicatif, livrée en lot 1',
    confidentiality: 'citable' as const,
  },
  {
    expertise_key: 'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
    kind: 'talent_pool' as const,
    state: 'proven' as const,
    source: { type: 'consultant' as const, name: 'Camille Roussel' },
    label: null,
    confidentiality: null,
  },
  {
    expertise_key: 'Data & Intelligence Artificielle',
    kind: 'client_reference' as const,
    state: 'declared' as const,
    source: null,
    label: 'Cadrage d’un entrepôt de données transport',
    confidentiality: 'anonymizable' as const,
  },
]

/**
 * LE CLIENT DE LIVRAISON — décision Louis 04/10/2026 (« je ne veux plus
 * d'exemples comme ça »).
 *
 * La moitié « après la signature » de la démonstration (besoins gagnés,
 * positionnements, missions, factures, poste ouvert, fil long de Laura) vivait
 * sur un client FICTIF. Elle est désormais rattachée à un VRAI compte de la
 * salle, {@link DEMO_DELIVERY_CARRIER} (SNCF, dont le brief observe des
 * besoins et des postes ouverts) : ce sont les objets de l'ESN de démonstration
 * — le persona —, ses missions et ses factures, jamais un fait affirmé sur
 * SNCF. Le semis ne crée AUCUN compte : il pose sur le dossier SNCF déjà
 * semé le statut client, le marqueur de meilleure référence, la BU et la
 * déclaration « client interne » (gestes de l'équipe de démonstration), et les
 * deux clés d'analyse qui décrivent la RELATION de l'ESN avec le compte
 * (`salesContext.relationship`, l'axe `relation` de `addressability`). Tout ce qui décrivait la société fictive
 * (barrière d'achat, postes ouverts, pile technique, enjeux, objections,
 * marché public) a disparu avec elle : SNCF garde son propre `raw_analysis`,
 * celui de son brief.
 */
export const DEMO_DELIVERY_CLIENT = {
  account: {
    company_name: DEMO_DELIVERY_CARRIER,
    commercial_status: 'customer' as const,
    // #2165.13 — le compte CLIENT de la salle porte le marqueur : c'est ce qui
    // donne au preset Découvrir « Proches de mes meilleures références » une
    // source non vide en démonstration (geste de l'équipe de démonstration).
    is_best_reference: true,
    // #2159.26 — l'étiquette posée par l'équipe : un classement de travail.
    tags: ['client'],
    // #219.6 (#3231) — CLIENT INTERNE DÉCLARÉ par l'équipe de démonstration :
    // la direction du digital de SNCF sert des métiers (brief : « Digital
    // France »), Laura lit alors une direction qui sert des métiers.
    declared_internal_client_mode: 'internal_service' as const,
    // #219.6 (J05) — les QUATRE rôles nommés par l'équipe de démonstration (SNCF est fictif ici).
    declared_internal_sponsor: 'Direction Digital France',
    declared_internal_users: 'Équipes des agences et du contrôle',
    declared_legal_entity: 'SNCF Voyageurs',
    declared_end_client: 'Les voyageurs',
    // #3278.2 (lot M11) — TROIS des six critères de route déclarés par l'équipe de
    // démonstration (SNCF est fictif ici) ; les trois autres restent vides À DESSEIN,
    // pour que la salle montre aussi un critère NOMMÉ « non évalué ».
    declared_route_scope: 'TMA des applications de vente en agence',
    declared_route_objectives: 'Réduire les incidents en agence avant l’été',
    declared_route_timing: 'Renouvellement du marché de TMA au premier trimestre',
    // #3278.1 (décision Louis 11/10/2026) — le fait de la route « événement ou communauté » ; le fait « inbound /
    // contenu » reste vide À DESSEIN (voir `DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE`).
    declared_route_event: 'Rencontré au salon Rail Digital Days, en septembre',
    // #3278.2b (Louis 15/10) — budget et disponibilité déclarés ; `declared_route_network` vide À DESSEIN.
    declared_route_budget: 'Enveloppe TMA d’environ 400 k€ par an',
    declared_route_availability: 'Deux consultants disponibles dès novembre',
  },

  /**
   * La seule clé d'analyse posée sur le compte porteur : l'ÉTAT DE LA RELATION
   * de l'ESN de démonstration avec lui, sans lequel le brief d'avant
   * rendez-vous n'a pas d'objectif à afficher. `besoin_ouvert` est cohérent
   * avec les objets semés (un besoin gagné, des missions en cours) ; une
   * inférence plafonne à 99 et CITE sa preuve — ici, les objets de l'ESN.
   * Fusionnée dans le `raw_analysis` du dossier (`jsonb_set`), jamais à sa place.
   */
  analysis: {
    /**
     * #2298.4 — l'adressabilité, réduite à ce que l'ESN de démonstration SAIT :
     * l'axe RELATION est mesuré par SES missions sur le compte ; les quatre
     * autres axes restent NOMMÉS « non mesurés », jamais fondus dans un zéro.
     */
    addressability: {
      score: 3,
      max: 3,
      unmeasured: ['lock', 'proportion', 'path', 'access_cost'],
      factors: [
        {
          axis: 'relation',
          label: 'Une relation existe déjà — l’entrée n’est pas froide',
          label_key: 'axes.relation',
          points: 3,
          evidence: '12 missions en cours ou passées chez ce compte',
        },
      ],
    },
    salesContext: {
      salesContextVersion: 1,
      // #2645.2 — le modèle de revenu dérivé du questionnaire de l'ESN de démo.
      esnProfile: { businessModel: { revenueModel: 'mixte' } },
      relationship: {
        state: 'besoin_ouvert',
        derivation: 'inferred',
        confidence: 80,
        evidence: ['un besoin ouvert et des missions de l’ESN de démonstration en cours sur ce compte'],
      },
    },
  },

  /**
   * Les ESN en place chez ce client — deux, dont une à certitude FAIBLE.
   *
   * Elles sont posées sur le client FICTIF et sur lui seul. Le jeu de données
   * s'interdit de déclarer qu'une ESN nommée travaille chez EDF ou TF1 : ce
   * serait une affirmation sur un lien commercial entre deux tiers réels, que
   * personne n'a vérifiée. (Historique : la mécanique
   * se montre sans rien affirmer de personne.
   *
   * La seconde porte volontairement une certitude faible : c'est la distinction
   * visuelle que le tome 1 §21.3 demande de montrer, et une liste où tout est
   * « forte » ne l'enseignerait pas.
   */
  /**
   * #2122 — TROIS LIGNES, TROIS TYPES DE RELATION, ET UNE LIGNE À QUALIFIER.
   *
   * La section « Écosystème & accès » nomme la relation avec huit types et
   * refuse d'affirmer sans preuve attachée. Une démonstration où les trois
   * lignes seraient identiques n'enseignerait ni l'un ni l'autre : elle
   * montrerait une liste, pas une lecture.
   *
   * · `analysis` + date  ⇒ « Relation actuelle sourcée », étiquetée DÉDUITE ;
   * · `declared` + rang 1 ⇒ « Rang 1 déclaré », la parole de l'espace ;
   * · `analysis` SANS date ⇒ une HYPOTHÈSE (« Concurrent potentiel »), qui
   *   atterrit dans « Informations à qualifier » : l'origine promet une preuve
   *   qui n'est pas là, et l'écran le dit au lieu de l'affirmer.
   *
   * #2151.33 / #2151.34 (18/09/2026) — UNE QUATRIÈME LIGNE, EN RANG 2.
   *
   * Les trois lignes ci-dessus ne portaient aucun rang 2 : les filtres
   * « relation existante » et « ouverture au rang 2 » de Découvrir
   * (`FilterRail.tsx`) n'avaient donc rien à montrer une fois cochés — un
   * écran livré mais vide en démo. La quatrième ligne, `rank: 'rank2'` +
   * `relationship: 'partner'`, donne aux deux filtres un résultat non vide,
   * sans retoucher les trois premières (chacune enseigne déjà autre chose).
   *
   * ⚠️ La DIVERGENCE de deux sources reste VIDE À DESSEIN en démonstration, et
   * la raison est celle du bloc « mémoire marché » de `demo-coverage.ts` : elle
   * demanderait qu'une observation du corpus PARTAGÉ pointe sur ce compte, et
   * les quatre tables de la mémoire marché ne se sèment pas — y écrire une
   * ligne fictive l'injecterait dans le corpus que lisent des ESN concurrentes.
   * Le mécanisme est tenu par `ecosystemRelations.test.ts` et
   * `AccountEcosystemTop.test.tsx`, pas par le jeu de démonstration.
   */
  // Décision Louis 04/10/2026 — AUCUNE ESN en place : le dossier SNCF n'en
  // nomme aucune (il cite « de grandes ESN présentes au niveau du groupe »,
  // sans nom). Les quatre lignes de démonstration (déduite datée, rang 1
  // déclaré, hypothèse sans date, rang 2) sont VIDES À DESSEIN ici — voir
  // `demo-coverage.ts` ; le rang 2 et la déclaration vivent sur les vraies ESN
  // des briefs (BNP Paribas / CGI, Groupe BPCE / Sopra Steria).
  partners: [] as {
    name: string
    certainty: 'forte' | 'moyenne' | 'faible' | null
    scope: string | null
    note: string
    detectedDaysAgo: number | null
    rank: 'rank1' | 'rank2' | 'unknown'
    relationship: 'partner' | 'competitor' | 'unknown'
    partnerSource: 'analysis' | 'declared'
    competitiveRisk: string | null
    complementarity: string | null
    nextVerificationDaysFromNow: number | null
  }[],

  /**
   * Les entités du client fictif — la porte de filiale du §7.1.
   *
   * Deux, dont une SANS rang 1 connu : c'est la distinction que l'écran doit
   * enseigner. « Un rang 1 installé » et « aucun rang 1 connu » mènent à deux
   * stratégies opposées, et une liste où tout serait « inconnu » ne le
   * montrerait pas.
   */
  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LE DOSSIER DE FACTURATION (26/08/2026) — la lentille delivery de /accounts
   * ─────────────────────────────────────────────────────────────────────────
   * `billing` désigne l'entité qui REÇOIT la facture, et ce qu'on sait d'elle.
   * Une seule des deux la porte : au plus une payeuse par compte, et c'est un
   * index partiel unique qui le tient en base.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * L'IDENTITÉ LÉGALE (31/08/2026) — et comment on la donne sans mentir
   * ─────────────────────────────────────────────────────────────────────────
   * Le 26/08, ces deux entités portaient `siren: null`, avec une raison juste :
   * « cette société est FICTIVE, et lui attribuer un SIREN la ferait pointer
   * vers une entreprise qui existe vraiment ». La carte du portefeuille affiche
   * désormais le SIREN et le SIRET sous le nom : les laisser vides aurait montré
   * un écran amputé de sa ligne la plus visible à toute personne qui ouvre la
   * démonstration.
   *
   * ⚠️ Le numéro choisi ÉCHOUE VOLONTAIREMENT LA CLÉ DE LUHN — la somme
   * pondérée de `404404405` vaut 33, qui n'est pas un multiple de dix. Aucun
   * SIREN attribué ne peut avoir cette forme : l'INSEE ne délivre que des
   * numéros dont la clé est bonne. Il est donc IMPOSSIBLE qu'il désigne une
   * entreprise réelle, ce qui répond exactement à l'objection du 26/08 au lieu
   * de la contourner.
   *
   * Le SIRET commence par ce SIREN, comme tout SIRET : ses cinq derniers
   * chiffres (le NIC) désignent l'établissement. Il est écrit ICI et jamais
   * calculé depuis le SIREN — c'est précisément ce que le produit refuse de
   * faire, et la démonstration ne peut pas montrer le contraire de sa règle.
   *
   * La preuve d'identité est `human_declared`, jamais `public_registry` : aucun
   * registre public ne porte une société qui n'existe pas, et lui en attribuer
   * un serait fabriquer une provenance. « Quelqu'un de l'espace l'a saisi » est
   * VRAI de ce jeu de données, et la pastille « vérifié » montre alors ce
   * qu'elle sait montrer — sa source et sa date.
   *
   * La première entité, elle, n'a AUCUNE identité déclarée : c'est l'autre
   * moitié de la règle, celle où la pastille se TAIT. Sans elle, la
   * démonstration ferait croire que tout compte porte un badge.
   *
   * ⚠️ Le dossier est DÉLIBÉRÉMENT INCOMPLET : le contrat court, le contact de
   * facturation est celui de la mission, mais `paymentTermsDays` est `null`. Un
   * dossier parfait n'aurait rien montré de la lentille — c'est le BLOQUEUR
   * « conditions de règlement inconnues », avec son lien de réparation, que le
   * prospect doit voir vivre. Les six dossiers réels, eux, n'ont aucune entité
   * payeuse et portent donc « pas d'entité de facturation » : c'est vrai, c'est
   * le premier geste du métier, et l'inventer sur SNCF ou la Société Générale
   * serait une affirmation commerciale sur une entreprise réelle.
   */
  // Décision Louis 04/10/2026 — deux VRAIES entités du dossier SNCF (SNCF
  // Voyageurs, SNCF Connect & Tech), sans SIREN ni identité affirmés ; la
  // seconde porte le dossier de facturation DÉCLARÉ par l'ESN de démonstration
  // (geste du persona sur un compte), incomplet à dessein. Son contact est un
  // SIÈGE du dossier (sans nom), jamais une personne réelle.
  entities: [
    {
      name: 'SNCF Voyageurs',
      kind: 'division' as const,
      rank1: 'unknown' as const,
      billing: null,
      siren: null as string | null,
      siret: null as string | null,
      identity: null as { source: 'public_registry' | 'human_declared'; checkedDaysAgo: number } | null,
    },
    {
      name: 'SNCF Connect & Tech',
      kind: 'subsidiary' as const,
      rank1: 'no' as const,
      siren: null as string | null,
      siret: null as string | null,
      identity: null as { source: 'public_registry' | 'human_declared'; checkedDaysAgo: number } | null,
      billing: {
        legalName: 'SNCF Connect & Tech',
        // Le contrat-cadre court encore : relatif, jamais une date figée.
        contractExpiresInDays: 210,
        // VIDE À DESSEIN — le bloqueur que la démonstration doit montrer.
        paymentTermsDays: null as number | null,
        /** Le même siège que le contact de facturation des missions. */
        contactName: seatName('Directeur technique — entité numérique voyageurs'),
      },
    },
  ],

  /**
   * LES DEUX INTERLOCUTEURS DU CLIENT D'EXEMPLE — et pourquoi ceux-là.
   *
   * ────────────────────────────────────────────────────────────────────────
   * CE QUI ÉTAIT MESURÉ (28/08/2026)
   * ────────────────────────────────────────────────────────────────────────
   * Ce compte ne portait AUCUN contact : `DemoSeedService` n'en crée que pour
   * les cinq dossiers réels. Deux capacités livrées s'ouvraient donc vides ou
   * fausses devant un prospect :
   *
   *  - « missions signées par contact » n'avait pas une ligne à rendre — donc
   *    aucun badge « a signé N missions », donc aucune façon de distinguer à
   *    l'écran un ACHETEUR d'un simple prospect ;
   *  - `assessInvoiceReadiness` pousse `missing_billing_contact` dès que
   *    `billingContactId` vaut `null`. Les SEPT missions le portaient, y compris
   *    les deux que ce fichier décrit comme « prêtes à facturer » : l'écran
   *    « Prêt à facturer » de la salle n'avait aucune ligne prête.
   *
   * ────────────────────────────────────────────────────────────────────────
   * CES DEUX PERSONNES SONT INVENTÉES — ET C'EST LA SOCIÉTÉ QUI L'AUTORISE
   * ────────────────────────────────────────────────────────────────────────
   * Partout ailleurs, le jeu nomme des personnes RÉELLES publiées au registre du
   * commerce, et leur refuse la moindre coordonnée : leur en fabriquer une
   * serait une donnée inventée SUR quelqu'un, sur un lien ouvert à tous. Ici
   * c'est l'inverse, et pour la même raison que l'analyse et les ESN en place
   * plus haut (historique, client fictif retiré le 04/10/2026), et
   * sur une société qui n'existe pas la mécanique se montre sans rien affirmer
   * de personne. Inventer une personne est moins grave qu'inventer une donnée
   * SUR une personne.
   *
   * Les garde-fous qui rendent ça tenable sont ceux de `demo-contact-density` :
   * adresses en `.example` (RFC 2606, jamais attribuable ni routable), numéros
   * dans la plage `06 39 98 xx xx` réservée par l'ARCEP à la fiction, aucune URL
   * de profil — il n'existe pas d'équivalent `.example` d'un réseau social — et
   * `source: 'demo'` posé par le semis, qui dit lui-même que rien n'a été
   * collecté. Aucun de ces deux noms n'apparaît ailleurs dans le jeu :
   * `demo-dataset.spec.ts` le vérifie, faute de quoi une fiche fabriquée
   * viendrait se coller sur une personne réelle par simple homonymie.
   *
   * ────────────────────────────────────────────────────────────────────────
   * DEUX, ET CES DEUX RÔLES-LÀ
   * ────────────────────────────────────────────────────────────────────────
   * Un seul contact ne montrerait rien : le badge « a signé N missions » existe
   * pour distinguer celui qui ENGAGE de celui qu'on démarche, et deux fiches du
   * même bord rendraient la colonne muette. Le jeu porte donc les deux bouts de
   * la chaîne de signature d'une ESN :
   *
   *  - le DIRECTEUR DES SYSTÈMES D'INFORMATION (`technical`), qui décide du
   *    besoin et porte deux des missions en cours — c'est lui qui donne au badge
   *    un compte supérieur à un, sans quoi la colonne compterait sans compter ;
   *  - l'ACHETEUR (`procurement`), qui tient le bon de commande et n'en signe
   *    qu'une. C'est le rôle que la doctrine nomme « la porte achats » : sans
   *    lui à l'écran, un prospect ne verrait jamais que l'outil sait les
   *    distinguer.
   *
   * Ils sont rattachés aux entités DÉJÀ déclarées juste au-dessus : la division
   * informatique pour l'un, le groupe pour l'autre. Rien de neuf n'est nommé —
   * une entité citée par un contact et absente de `entities` se lirait comme une
   * colonne remplie au hasard.
   */
  // Décision Louis 04/10/2026 — AUCUNE déclaration inventée sur une personne
  // RÉELLE (mandataire du registre) : les missions et la facturation pointent
  // des SIÈGES (sans nom) déjà semés par le dossier SNCF, et première porte /
  // identité confirmée restent vides à dessein (voir `demo-coverage.ts`).
  //
  // Lot D01 du 06/10/2026 (recette démo : « aucun contact Répondu, aucun sponsor,
  // aucune séquence active ») — trois interlocuteurs SIMULÉS, jamais des
  // personnes réelles : même règle que `demo-contact-density.ts` (adresse en
  // `.example`, numéro dans la plage de fiction ARCEP, aucune URL de profil,
  // `source: 'demo'` posé au semis), noms et e-mails EN CLAIR. Une personne
  // inventée n'attribue rien à quelqu'un qui existe ; c'est ce qui permet de
  // montrer « Traiter la réponse », « Répondre », le relais d'introduction et la
  // carte Séquences sur un compte GO (SNCF, route partenaire — pas de NO-GO).
  contacts: [
    {
      ...namedContact({
        full_name: 'Nadia Perrin',
        title: 'Responsable des achats de prestations numériques',
        entity: 'SNCF Voyageurs',
        family: 'Achat',
        decision_role: 'procurement',
        priority: 1,
        profile_summary:
          'Interlocutrice SIMULÉE de la salle de démonstration (adresse en .example) : porte les achats de prestations numériques de l’entité. A répondu au premier message de l’équipe.',
        why_contact:
          'L’acheteuse référente que le sponsor interne a annoncée : elle a répondu au premier message et attend une proposition de profils.',
        contact_score: 78,
        seniority: 'manager',
        lifecycle_state: 'actionnable',
        key_points: [
          'A répondu au premier message : veut voir deux profils avant le comité d’achat.',
          'Introduite par le sponsor interne du programme de refonte applicative.',
        ],
      }),
      email: 'nadia.perrin@sncf-groupe.example',
      phone: '06 39 98 41 27',
      user_status: 'replied',
      tags: ['achats', 'a répondu'],
      declared_person_company_relation: 'buyer' as const,
    },
    {
      ...namedContact({
        full_name: 'Julien Castaing',
        title: 'Directeur de programme — refonte applicative',
        entity: 'SNCF Voyageurs',
        family: 'PMO',
        decision_role: 'economic',
        priority: 1,
        profile_summary:
          'Interlocuteur SIMULÉ de la salle de démonstration (adresse en .example) : sponsor interne du programme de refonte applicative, relais d’introduction vers les achats.',
        why_contact:
          'Le sponsor du besoin : il a accepté de nous introduire auprès de l’acheteuse référente — une introduction autorisée, jamais présentée comme une recommandation sans son accord.',
        contact_score: 82,
        seniority: 'director',
        lifecycle_state: 'actionnable',
        key_points: [
          'Sponsor du programme de refonte applicative.',
          'Introduction vers les achats autorisée par lui (enregistrée).',
        ],
      }),
      email: 'julien.castaing@sncf-groupe.example',
      phone: '06 39 98 41 63',
      user_status: 'contacted',
      tags: ['sponsor', 'relais'],
      declared_person_company_relation: 'sponsor' as const,
    },
    {
      ...namedContact({
        full_name: 'Mathieu Brossard',
        title: 'Responsable de la relation fournisseurs SI',
        entity: 'SNCF',
        family: 'Achat',
        decision_role: 'influencer',
        priority: 2,
        profile_summary:
          'Interlocuteur SIMULÉ de la salle de démonstration (adresse en .example) : pilote le panel de prestataires SI, inscrit à une séquence active.',
        why_contact:
          'Il tient le panel des prestataires SI : une séquence en deux touches, la première déjà faite, la suivante à venir.',
        contact_score: 66,
        seniority: 'manager',
        lifecycle_state: 'actionnable',
        key_points: ['Séquence active : premier message fait, relance prévue.', 'Aucune réponse à ce jour.'],
      }),
      email: 'mathieu.brossard@sncf-groupe.example',
      phone: '06 39 98 42 08',
      user_status: 'contacted',
      tags: ['panel'],
    },
    // #4016 L4.1 (décision Louis 11/10/2026) — l'e-mail ESTIMÉ, semé. Même
    // règle que les trois au-dessus (personne SIMULÉE, adresse en `.example`,
    // aucune URL de profil). Son adresse suit le motif `prenom.nom@` des trois
    // adresses déjà connues du compte : c'est exactement ce que
    // `EmailEstimateService` déduirait — la salle ne sonde jamais un vrai
    // serveur, elle SÈME la provenance `inferred` (`DEMO_ESTIMATED_EMAIL_CONTACTS`)
    // et la fiche la badge « estimé, vérifié le … ».
    {
      ...namedContact({
        full_name: 'Élise Varennes',
        title: 'Responsable architecture SI',
        entity: 'SNCF Voyageurs',
        family: 'IT',
        // #4324.1 — rangée « À qualifier » À DESSEIN : c'est le seul titulaire du siège technique du compte SNCF, et
        // « Places à pourvoir » ne doit PAS le déclarer vide (un intitulé voisin tient la place, même non vérifié).
        decision_role: 'unknown',
        priority: 2,
        profile_summary:
          'Interlocutrice SIMULÉE de la salle de démonstration (adresse en .example) : tient les choix d’architecture de la refonte applicative. Son adresse est ESTIMÉE d’après le motif des adresses connues du compte.',
        why_contact:
          'Elle arbitre les choix techniques de la refonte : son adresse est déduite du motif de l’entreprise et vérifiée, jamais une preuve.',
        contact_score: 61,
        seniority: 'manager',
        lifecycle_state: 'qualifie',
        key_points: ['Adresse estimée (motif prenom.nom@ du compte), vérifiée, jamais écrite à la main.'],
      }),
      email: 'elise.varennes@sncf-groupe.example',
      // #4586.5 — son nom est la partie locale de son adresse : la liste le montre « estimé ».
      name_derived_from_email: true,
      phone: '06 39 98 40 17',
      user_status: 'new',
      tags: ['architecture'],
    },
  ] as DemoContact[],

  /**
   * Ce qu'on sait de la façon d'entrer chez ce client — sur le compte FICTIF,
   * et sur lui seul.
   *
   * Les cinq comptes RÉELS du jeu gardent un verrouillage `inconnu`, et c'est
   * volontaire : affirmer qu'un groupe réel est « accessible via Untel » serait
   * une déclaration invérifiable sur deux tiers. L'onglet n'est pas vide pour
   * autant — il montre les sept portes et dit pourquoi il ne sait pas, ce qui
   * est exactement la réponse honnête pour une entreprise privée.
   */
  // Décision Louis 05/10/2026 (« démo au max ») — le coût d'accès revient, comme
  // déclaration de l'ÉQUIPE de démo sur le COMPTE (geste permis), plus prêtée à
  // une personne réelle. Sans au moins un fait, `access_facts` reste vide et la
  // sonde de complétude purge la salle en boucle (incident du 05/10, salle
  // jamais prête). Le verrou de marché public reste vide à dessein : il citerait
  // un marché inventé.
  accessFacts: [
    {
      kind: 'cost' as const,
      value: '3 % de commission via le porteur',
      detail: 'déclaré par l’équipe : passage par le porteur du contrat-cadre',
      source: 'déclaré dans Bellum',
      provenance: 'human' as const,
      observedDaysAgo: 20,
    },
  ] as {
    kind: 'cost' | 'lock' | 'path'
    value: string
    detail: string
    source: string
    provenance: 'human' | 'analysis'
    observedDaysAgo: number
  }[],

  /** Le besoin gagné dont découle tout le reste. */
  project: {
    label: 'Observabilité des applications voyageurs — renfort exploitation',
    stage: 'won' as const,
    detail:
      'Trois mois de renfort sur l’exploitation de la plateforme de suivi : observabilité de bout en bout et réduction du délai de détection d’incident.',
    amount_cents: 111_600_00,
    /**
     * La date de signature ATTENDUE, en jours depuis maintenant — négatif ici,
     * parce que cette affaire est déjà signée (`closed_at` = il y a trente
     * jours). Elle valait le 34ᵉ jour : l'affaire a glissé de quatre jours, ce
     * qui est l'écart ordinaire d'un pipe réel et la seule chose que la colonne
     * « Signature attendue » a d'intéressant à raconter sur une affaire close.
     *
     * ⚠️ Un OFFSET, jamais une date en dur : la salle se remet à neuf à chaque
     * visite, et « 14/04/2026 » cesserait d'être crédible au premier changement
     * de mois. Même raison que `status_changed_days_ago` sur les besoins.
     */
    expected_close_in_days: -34,
    /**
     * Le secteur de la DEMANDE, pas celui du compte (addendum Stelya §4.1).
     * Sans lui, le panneau « Secteur de la demande » s'ouvre vide en démo — et
     * un écran vide se découvre en réunion, pas en CI. La mission créée depuis
     * ce projet en hérite, ce qui montre le pont au passage.
     */
    application_sector_codes: ['rail'],
    primary_domain_code: 'esn_it' as const,
  },

  /**
   * Trois positionnements, choisis pour que l'entonnoir DISE quelque chose.
   *
   * Le troisième est le plus important : `no_feedback` est le motif qu'aucun
   * CRM ne propose et que l'écran compte À PART. Sans lui, le taux
   * d'acceptation afficherait 50 % là où la vérité est « un sur deux a répondu ».
   */
  submissions: [
    {
      consultant: 'Yanis Berthier',
      stage: 'accepted' as const,
      // #2335.1 — le sous-statut, niveau de détail EN PLUS de `stage`, seedé
      // pour que la fiche démo montre le badge, pas seulement en production.
      substatus: 'selected' as const,
      submitted_days_ago: 34,
      first_feedback_days_ago: 27,
      closed_days_ago: 25,
      outcome_reason: null,
      proposed_rate_cents: 620_00,
      // #2177.24 / .8 / .28 / .30 — le détail du positionnement, seedé pour
      // que la fiche démo montre autre chose qu'un dialogue vide.
      channel: 'email' as const,
      message:
        'Bonjour, je vous propose le profil de Yanis Berthier pour le poste. CV et disponibilités en pièce jointe.',
      availability: 'Disponible sous deux semaines',
      conditions: 'Télétravail deux jours par semaine, astreinte non incluse',
      // #2189.39 (épopée #2940) — la prochaine action de CE positionnement,
      // seedée pour que la fiche démo montre le bloc, pas seulement en
      // production. Attribuée au même porteur que le projet.
      next_action_label: 'Préparer le dossier de facturation de la mission',
      next_action_due_days_from_now: 5,
      // #2887 (#2371.9) — l'accord du consultant à être PROPOSÉ pour CETTE
      // opportunité, déclaré AVANT l'envoi (#2320.18) — distinct du retour
      // `consultant_feedback` ci-dessous, qui porte sur l'ISSUE de l'entretien.
      // Antérieur à `submitted_days_ago` (34) : l'accord précède l'envoi.
      consultant_agreement: true,
      consultant_agreement_date_days_ago: 36,
      feedback: {
        // « au-dessus / au-dessus / conforme / conforme » — le profil est pris.
        technical: 'above',
        experience: 'above',
        communication: 'meets',
        price: 'meets',
        verbatim: 'Profil aligné sur le besoin, disponible tout de suite. On part avec lui.',
      } satisfies DemoSubmissionFeedback,
      // #2335.5 — le retour du consultant sur CE positionnement, séparé du
      // retour client juste au-dessus : deux blocs, jamais un seul.
      consultant_feedback: {
        interest: 'above',
        understanding: 'meets',
        manager: 'meets',
        mission: 'above',
        conditions: 'meets',
        concerns: 'unknown',
        availability: 'meets',
        decision: 'above',
        verbatim: 'Le poste me plaît beaucoup, l’équipe a l’air solide. Je suis partant.',
      } satisfies DemoConsultantFeedback,
      interview_days_ago: 29,
    },
    {
      consultant: 'Salomé Dufour',
      stage: 'rejected' as const,
      substatus: 'declined' as const,
      submitted_days_ago: 34,
      first_feedback_days_ago: 26,
      closed_days_ago: 26,
      outcome_reason: 'seniority' as const,
      outcome_detail: 'Le client cherchait un profil déjà passé par de l’exploitation à fort trafic.',
      proposed_rate_cents: 580_00,
      feedback: {
        // L'EXPÉRIENCE est en dessous, et c'est le motif du refus (`seniority`) :
        // le verdict et la raison doivent raconter la même chose.
        technical: 'meets',
        experience: 'below',
        communication: 'above',
        price: 'meets',
        verbatim: 'Très bon fond technique, mais pas encore le vécu d’astreinte que le poste demande.',
      } satisfies DemoSubmissionFeedback,
      interview_days_ago: null,
    },
    {
      consultant: 'Antoine Rivière',
      stage: 'rejected' as const,
      // « Sans réponse » est un sous-statut à part — même distinction que
      // `outcome_reason: 'no_feedback'` juste en dessous.
      substatus: 'no_response' as const,
      submitted_days_ago: 31,
      first_feedback_days_ago: null,
      closed_days_ago: 3,
      outcome_reason: 'no_feedback' as const,
      outcome_detail: 'Relancé deux fois, jamais de réponse. Clos pour ne pas fausser le délai de retour.',
      proposed_rate_cents: 540_00,
      feedback: null,
      interview_days_ago: null,
    },
  ],

  /**
   * Le SECOND projet du client d'exemple — celui qui est encore en cours.
   *
   * Les rôles ouverts ne pendent pas du projet GAGNÉ juste au-dessus : celui-là
   * est clos, avec sa date de clôture et son issue. Y accrocher un besoin « à
   * qualifier » afficherait, sur la même carte, une affaire terminée et un rôle
   * que personne n'a encore lu — un écran qui se contredit sous les yeux d'un
   * prospect.
   *
   * Il porte le même client FICTIF, pour la raison écrite au-dessus de
   * {@link DEMO_DELIVERY_CLIENT} : le lien de démonstration est public, et
   * afficher « cherche un ingénieur sécurité » au nom d'une des six sociétés
   * réelles serait une affirmation sur leur recrutement que personne n'a
   * vérifiée.
   */
  openProject: {
    label: 'Programme de refonte applicative — renfort et exploitation',
    detail:
      'Renfort du programme de refonte applicative et reprise de son exploitation : socle conteneurisé, sécurisation du parcours d’authentification, supervision des flux d’entrepôt.',
    stage: 'qualified' as const,
    amount_cents: 84_000_00,
    /** L'échéance PROCHE du pipe — trois semaines et demie. Voir la note sur
     *  l'étalement au-dessus de `pipelineProjects`. */
    expected_close_in_days: 26,
    application_sector_codes: ['rail'],
    primary_domain_code: 'esn_it' as const,
    /**
     * #2172.37 — L'OBJECTIF, celui qu'on écrit en convertissant une piste.
     *
     * Une PHRASE, pas un montant : le montant a déjà sa colonne, et un objectif
     * chiffré se relirait comme un engagement de chiffre d'affaires. La seule
     * affaire de la salle qui en porte un — les autres sont antérieures à la
     * conversion, et leur en inventer un ferait croire que le champ se remplit
     * tout seul.
     */
    objective: 'Décrocher un cadrage de trois semaines avec la DSI avant la fin du trimestre',
    /**
     * #2324.37 — LES RISQUES de l'affaire, sur la fiche opportunité. Seule
     * l'affaire ouverte en porte : les autres n'en ont pas d'écrit, et la fiche
     * n'en montre alors aucune ligne — les deux états se voient en démo.
     */
    risks: 'Budget de l’exercice suivant pas encore voté ; un prestataire en place sur l’exploitation du portail.',
    /**
     * #3266.1 (#3292, tranché sans Louis) — LE GRAIN équipe/site/projet de
     * l'affaire, saisi par le commercial. Seule l'affaire ouverte en porte un,
     * même règle que `risks` juste au-dessus : les deux états (renseigné /
     * absent) se voient en démo.
     */
    scope_label: 'Direction des systèmes d’information — site de Lyon',
    /**
     * #1325 (4/9) — LA PROCHAINE ACTION de l'affaire, sur la carte du pipe.
     *
     * Semée comme une VRAIE tâche rattachée au projet (`tasks.project_id`), et
     * pas comme un champ décoratif : c'est cette table-là que la projection lit
     * (`taskStillOpenSql`), et un seed qui n'aurait pas la forme que l'écran lit
     * afficherait « aucune prochaine action » sur une démonstration censée la
     * montrer — le défaut « un seed doit lire comme l'écran », déjà payé ici.
     */
    nextAction: { title: 'Envoyer les trois profils au responsable exploitation', dueInDays: 3 },
  },

  /**
   * LES DEUX AUTRES AFFAIRES OUVERTES — ce qui fait du pipe un PIPE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI MANQUAIT, ET QUI SE VOYAIT
   * ─────────────────────────────────────────────────────────────────────────
   * Avant ces deux lignes, UNE seule affaire de la salle était ouverte — le
   * programme de refonte applicative, en « Qualifié ». Les cinq colonnes du pipe
   * s'ouvraient donc avec une colonne occupée, une colonne « Signé » pleine des
   * projets dérivés des missions, et trois colonnes vides au milieu. Un
   * prospect ne voyait jamais une affaire AVANCER.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * L'ÉTALEMENT DES ÉCHÉANCES — ET POURQUOI IL EST DÉLIBÉRÉ
   * ─────────────────────────────────────────────────────────────────────────
   * Un vrai pipe d'ESN ne signe pas tout le même mois. Les quatre affaires
   * datées de la salle s'étalent donc :
   *
   *  - le projet GAGNÉ, attendu il y a trente-quatre jours (déjà signé) ;
   *  - le programme de refonte applicative, à vingt-six jours — l'échéance PROCHE ;
   *  - la supervision applicative, à quatre-vingt-douze jours — trois mois ;
   *  - le schéma directeur data, à cent quatre-vingt-un jours — six mois.
   *
   * ⚠️ AU MOINS UNE affaire datée reste AU-DELÀ DE SOIXANTE JOURS, et c'est une
   * propriété tenue par un test, pas par une relecture. Une salle dont toutes
   * les échéances tomberaient sous deux mois raconterait une ESN qui n'a plus
   * rien à signer au-delà du trimestre — l'inverse exact de ce qu'on montre à
   * un prospect. Ici, deux affaires la tiennent (quatre-vingt-douze et cent
   * quatre-vingt-un jours), donc perdre l'une des deux ne suffit pas à faire
   * basculer la salle.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ LA SECONDE N'A PAS DE MONTANT, ET C'EST TOUT SON INTÉRÊT
   * ─────────────────────────────────────────────────────────────────────────
   * `amount_cents` est ABSENT du schéma directeur data — absent, pas `0`. Un
   * projet sans montant saisi n'est pas un projet à zéro euro : c'est la règle
   * « non mesuré n'est jamais zéro », et `pipelineSummary` la tient déjà en le
   * comptant dans `without_amount` au lieu de l'additionner.
   *
   * Sans cette ligne, le total du pipe s'affichait comme un chiffre COMPLET :
   * le plancher (« au moins X € sur N projets »), le compteur « 1 projet sans
   * montant saisi » et la pastille de colonne étaient livrés et invisibles en
   * démonstration. Avec elle, les trois apparaissent — et le prospect voit que
   * l'outil sait dire ce qu'il ne sait pas.
   *
   * ⚠️ Ce qu'on ne fait PAS : retirer les montants des AUTRES pour rendre le
   * total « non mesuré ». Il faudrait que tout le pipe soit non chiffré, et une
   * salle de démonstration qui affiche « non mesuré » en tête de pipe se lit
   * comme un produit vide. Cette entrée-là est classée « vide à dessein » dans
   * `demo-coverage.ts`.
   *
   * ⚠️ Aucun rôle ouvert ne pend de ces deux affaires : les besoins du kanban
   * restent accrochés au programme de refonte applicative, qui les porte déjà tous. Leur
   * en accrocher ici gonflerait `shortlist_count` sur des colonnes dont le pied
   * a justement été réglé rôle par rôle.
   */
  pipelineProjects: [
    {
      label: 'Supervision applicative 24/7 — extension du périmètre',
      detail:
        'Extension de l’astreinte à l’ensemble des applications métier : reprise des alertes, écriture des procédures d’escalade et permanence week-end.',
      stage: 'negotiation' as const,
      amount_cents: 148_500_00,
      expected_close_in_days: 92,
      nextAction: { title: 'Faire valider la clause d’astreinte week-end', dueInDays: 5 },
      application_sector_codes: ['rail'],
      primary_domain_code: 'esn_it' as const,
      /**
       * #2107.2 — AU-DELÀ du seuil de fraîcheur de l'ontologie
       * (`OPPORTUNITY_FRESH_DAYS`, 30 jours, `opportunity-ontology.ts`) : SANS
       * cette affaire, la salle ne montrerait jamais la carte « Aujourd'hui »
       * d'une affaire vieillissante (`project_stale`). Une prochaine action est
       * DÉJÀ semée sur cette affaire (`nextAction` juste au-dessus) : elle ne
       * porte donc QUE la raison `ageing`, jamais `without_next_action` — les
       * deux cartes restent démontrables séparément en salle.
       */
      stage_entered_days_ago: 35,
    },
    {
      label: 'Schéma directeur data — cadrage et pilotage',
      detail:
        'Cadrage du schéma directeur data avant arbitrage budgétaire : inventaire des flux, trajectoire de convergence et pilotage de la feuille de route.',
      stage: 'profiles_submitted' as const,
      /**
       * ⚠️ PAS DE `amount_cents` — et pas `null` non plus : le champ est
       * ABSENT. Le cadrage n'est pas chiffré tant que le périmètre n'est pas
       * arbitré, ce qui est l'état ordinaire d'une affaire à ce stade. C'est
       * `pipelineSummary` qui le compte dans `without_amount`, et l'écran qui
       * dit « au moins X € » au lieu de faire passer un total partiel pour un
       * total.
       */
      expected_close_in_days: 181,
      application_sector_codes: ['rail'],
      primary_domain_code: 'esn_it' as const,
    },
  ] as readonly {
    label: string
    detail: string
    stage: 'negotiation' | 'profiles_submitted'
    /** ABSENT quand personne n'a chiffré l'affaire. Jamais `0`. */
    amount_cents?: number
    expected_close_in_days: number
    application_sector_codes: string[]
    primary_domain_code: 'esn_it'
    /**
     * ABSENT sur le cadrage data, et c'est le point : la troisième affaire du
     * pipe n'a AUCUNE tâche ouverte. Sans elle, la démonstration ne montrerait
     * jamais ni « Aucune prochaine action » sur une carte, ni la carte
     * « Sans prochaine action » du haut avec un chiffre autre que zéro — deux
     * états que le produit rend et qu'un prospect doit voir.
     */
    nextAction?: { title: string; dueInDays: number }
    /**
     * #2107.2 — ABSENT = 17 jours, le défaut historique de ce jeu (défini par
     * le semis, jamais recopié ici). Explicite seulement sur l'affaire qui
     * doit franchir le seuil de fraîcheur de l'ontologie (30 jours) — une
     * seconde affaire vieillie NE serait qu'un doublon de démonstration.
     */
    stage_entered_days_ago?: number
  }[],

  /**
   * #4137 — UN DOSSIER ARCHIVÉ, pour que l'onglet « Archivés » du pipe ne
   * s'ouvre pas sur un vide en réunion. On archive, on ne supprime pas : la
   * ligne garde son étape (`dormant`, sortie sans échec) et seul `archived_at`
   * la range — « Désarchiver » la remet exactement où elle était.
   *
   * ⚠️ `dormant`/`abandoned` et NON `lost` : une affaire perdue entrerait dans la
   * calibration de la probabilité (#4016 L1) et déplacerait ses chiffres pour une
   * raison qui n'a rien à voir avec elle. Ni montant ni échéance : absents, jamais 0.
   */
  archivedProject: {
    label: 'Audit de sécurité des postes — mise en veille',
    detail: 'Cadrage suspendu faute de budget sur l’exercice ; dossier rangé, à rouvrir à la reprise des arbitrages.',
    detected_days_ago: 70,
    archived_days_ago: 18,
  },

  /**
   * #1889 — LES SIGNAUX DÉTECTÉS DU COMPTE, ET POURQUOI LA SALLE EN PORTE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI MANQUAIT
   * ─────────────────────────────────────────────────────────────────────────
   * Toutes les lignes d'`opportunities` de la salle étaient des `besoin` à une
   * étape du pipe. L'onglet Projets d'un dossier de compte annonçait donc
   * « 0 signal, compté à part » — alors que sur un vrai compte, l'analyse en
   * détecte plus que de projets (quinze projets et six signaux sur le compte
   * qui a produit le retour). Un prospect ne voyait jamais la distinction que
   * le bandeau explique, ni la pastille qui la sépare.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ILS SONT, ET CE QU'ILS NE SONT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * `kind: 'signal'` et `stage: 'detected'` — les DEUX, parce que c'est la
   * forme exacte qu'écrit le produit : un signal n'est pas entré dans le pipe,
   * personne ne l'a encore regardé. C'est aussi ce qui fait exister en
   * démonstration le filtre « Dans le pipe » : sans une seule ligne hors pipe,
   * la pastille ne retirerait jamais rien et se lirait comme cassée.
   *
   * ⚠️ AUCUN MONTANT, AUCUNE ÉCHÉANCE — absents, pas `0` ni une date devinée.
   * Un signal n'est pas chiffré : c'est un fait observé, pas une affaire.
   *
   * ⚠️ Ils portent le même client FICTIF que le reste de la salle, pour la
   * raison écrite au-dessus de {@link DEMO_DELIVERY_CLIENT} : le lien de
   * démonstration est public, et attribuer un signal à l'une des sociétés
   * réelles serait une affirmation que personne n'a vérifiée.
   */
  // Décision Louis 04/10/2026 — repris des FAITS du dossier SNCF (offres
  // relevées, structure par entités, obligations d'opérateur d'importance
  // vitale) : aucun événement public inventé sur une société réelle.
  detectedSignals: [
    {
      label: 'Poste ouvert — exploitation des systèmes temps réel',
      detail:
        'Offre relevée sur SNCF Voyageurs (APEC) : responsable exploitation des systèmes temps réel — supervision et astreinte à prévoir.',
      detected_days_ago: 12,
    },
    {
      label: 'Gouvernance numérique recomposée par entités',
      detail:
        'Le dossier décrit six directions informatiques métiers sous une gouvernance groupe recomposée — la fenêtre où les prestataires en place se rediscutent.',
      detected_days_ago: 29,
    },
    {
      label: 'Poste ouvert — ingénieur plateforme data',
      detail: 'Offre relevée sur SNCF Connect & Tech (APEC) : plateforme data, besoin publié et non déduit.',
      detected_days_ago: 9,
      primary_domain_code: 'esn_it' as const,
    },
    {
      label: 'Résilience numérique — opérateur d’importance vitale',
      detail:
        'Le dossier cite les obligations de résilience numérique d’un opérateur d’importance vitale : un besoin récurrent, pas un projet ponctuel.',
      detected_days_ago: 17,
      primary_domain_code: 'esn_it' as const,
    },
    {
      label:
        'Le dossier du compte décrit un groupe piloté par entités : six directions informatiques métiers gardent leurs équipes sous une gouvernance groupe recomposée, et une ESN moyenne y entre par une entité, sur un besoin déjà publié, sans affronter le référencement du groupe ni les grandes ESN présentes à son niveau.',
      detail: 'Signal repris tel quel depuis la synthèse du dossier — aucune reformulation, aucune coupe.',
      detected_days_ago: 4,
    },
    {
      // #3678.7 — un signal HORS CIBLE : le domaine est connu et n'est PAS celui
      // de l'offre de la salle (esn_it). Il reste consultable, ne devient jamais
      // une recommandation (« ce que ça change » le dit : hors de ton offre).
      label: 'Refonte de la politique de trésorerie groupe — consultation de cabinets de conseil financier',
      detail: 'Consultation relevée sur le site du groupe : conseil financier, sans lien avec une prestation IT.',
      detected_days_ago: 21,
      primary_domain_code: 'finance' as const,
    },
  ] as readonly {
    label: string
    detail: string
    detected_days_ago: number
    /** ABSENT sur un signal qu'aucun domaine ne rapproche — et c'est ce qui le
     *  laisse « isolé ». Jamais un domaine deviné pour faire joli. */
    primary_domain_code?: 'esn_it' | 'finance'
  }[],

  /**
   * #2172 — LA PISTE ÉCARTÉE DE LA SALLE, avec son motif.
   *
   * Une file de qualification sans aucune ligne écartée ne montre pas ce qu'on
   * fait du bruit — or c'est la moitié de la promesse : « ce qui ne tient pas
   * sort de la file, et reste consultable avec sa raison ». Elle vise le
   * DEUXIÈME signal par son rang dans la liste ci-dessus, pas une clé inventée :
   * l'identifiant n'existe qu'une fois la ligne écrite.
   *
   * ⚠️ Le motif est un vrai motif (`bad_timing`), pas `other` : « Autre » est le
   * choix de qui n'a pas voulu trancher, et une démonstration qui l'affiche
   * enseigne le mauvais geste.
   */
  dismissedLead: {
    signalIndex: 1,
    reason: 'bad_timing' as const,
    note: 'Arbitrage budgétaire annoncé pour janvier — rien à faire avant.',
  },

  /**
   * #3679 — UNE PISTE EN VEILLE : la file montre les trois états (active, en
   * veille, écartée), pas seulement le dernier. Une pause datée, sans motif —
   * c'est ce que la contrainte SQL (`shape_check`) impose à `snoozed`.
   */
  snoozedLead: {
    signalIndex: 2,
    snoozedInDays: 21,
  },

  /**
   * Deux projets REPRIS D'UN FICHIER — la sixième nature (#1889).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ILS SONT SEMÉS
   * ─────────────────────────────────────────────────────────────────────────
   * L'import écrit désormais des projets, et `kind: 'imported'` est la nature
   * qu'il pose. Sans une ligne dans la salle, la démonstration ne montrerait
   * jamais le seul endroit où le produit DIT qu'une ligne ne vient d'aucune
   * analyse — et c'est précisément la question d'un prospect qui reprend une
   * base : « qu'est-ce que deviennent mes données existantes ? ».
   *
   * ⚠️ `stage: 'detected'` pour le premier : c'est ce que l'import pose quand le
   * fichier n'écrit pas l'une de NOS étapes, et c'est le cas le plus fréquent —
   * le vocabulaire d'un ancien outil n'est pas le nôtre. Le second porte une
   * étape du pipe, parce qu'un fichier PEUT la porter, et que les deux formes
   * doivent exister pour qu'on voie la différence.
   *
   * ⚠️ Ni montant ni échéance sur le premier : une colonne absente du fichier
   * reste absente. Écrire `0` ferait entrer une affaire à zéro euro dans le pipe
   * valorisé de la démonstration.
   */
  /**
   * #2195.33 — L'AFFAIRE DE RENOUVELLEMENT, SEMÉE POUR QU'ELLE SE VOIE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ELLE EST SEMÉE
   * ─────────────────────────────────────────────────────────────────────────
   * Le panneau de renouvellement porte désormais « construire la proposition »,
   * qui ouvre le formulaire de création d'affaire. Un prospect qui clique voit
   * un formulaire VIDE — c'est normal, c'est un formulaire — mais il ne verrait
   * jamais le RÉSULTAT du geste : une affaire NEUVE au pipe, rattachée à la
   * mission qu'elle prolonge. Sans cette ligne, la démonstration s'arrête au
   * bouton (règle #9).
   *
   * ⚠️ `kind: 'manual'` — la septième nature. C'est le seul endroit du produit
   * où une ligne dit « quelqu'un l'a saisie », et c'est exactement la réponse à
   * « est-ce que je peux créer une affaire à la main ? ».
   *
   * ⚠️ Elle porte un montant ET une échéance, contrairement au premier projet
   * repris ci-dessous : une proposition de renouvellement qu'on construit, on
   * la chiffre. Ce n'est pas une valeur devinée par le produit — c'est ce qu'un
   * commercial aurait saisi.
   *
   * `missionLabel` désigne la mission renouvelée, par son LIBELLÉ : c'est la
   * clé que `missionIds` porte, et un identifiant écrit en dur dans un jeu de
   * données serait faux au premier semis.
   */
  manualRenewalProject: {
    label: 'Renouvellement — convergence des applications temps réel',
    detail:
      'Affaire ouverte à la main depuis le panneau de renouvellement. Elle prolonge une mission en cours ; c’est une affaire NEUVE, pas celle d’origine.',
    objective: 'Reconduire douze mois avec le même consultant, périmètre élargi à la reprise de données.',
    stage: 'qualified',
    amount_cents: 21_600_000,
    expected_close_on: '2026-12-15',
    missionLabel: 'Convergence des applications temps réel — lots interfaces et reprise',
    // #4291.3 — les interlocuteurs de l'affaire, PAR NOM dans le compte porteur (le sponsor du programme et l'acheteuse
    // référente, déjà semés ci-dessus) : sans eux, l'affaire de 216 000 € s'ouvrait sans personne à qui parler.
    contacts: [
      { full_name: 'Julien Castaing', role: 'sponsor' },
      { full_name: 'Nadia Perrin', role: 'acheteur' },
    ],
  } as {
    label: string
    detail: string
    objective: string
    stage: string
    amount_cents: number
    expected_close_on: string
    missionLabel: string
    contacts: readonly { full_name: string; role: 'sponsor' | 'acheteur' | 'prescripteur' | 'utilisateur' }[]
  },

  importedProjects: [
    {
      label: 'Refonte des applications voyageurs',
      detail: 'Ligne reprise de l’ancien outil commercial. Aucune analyse ne l’a relue.',
      stage: 'detected',
      amount_cents: null,
      expected_close_on: null,
      // #3712 — le cas « Détecté » d'une fiche Contact : le directeur de programme de la refonte applicative est
      // rattaché (par identité) à cette ligne reprise, à l'étape `detected`. Les idées détectées du compte restent
      // sans interlocuteur (garde #3624) : c'est une ligne REPRISE, pas une déduction.
      contacts: [{ full_name: 'Julien Castaing', role: 'prescripteur' as const }],
    },
    {
      label: 'Tierce maintenance applicative — lot 2',
      detail: 'Affaire reprise avec son étape : le fichier portait l’un de nos noms d’étape.',
      stage: 'qualified',
      amount_cents: 18_000_000,
      expected_close_on: '2027-01-31',
    },
  ] as readonly {
    label: string
    detail: string
    stage: string
    amount_cents: number | null
    expected_close_on: string | null
    contacts?: readonly { full_name: string; role: 'sponsor' | 'acheteur' | 'prescripteur' | 'utilisateur' }[]
  }[],

  /**
   * #3676 / #3714 — « SIGNAUX ET BESOINS » : LES QUATRE CAS QUE LA SURFACE UNIQUE
   * DOIT SAVOIR DISTINGUER, sur le compte de la salle.
   *
   *  · une DEMANDE CONFIRMÉE (`stage: confirmed`) — la seule ligne qui mérite le
   *    mot besoin : elle rend le résumé « Besoins confirmés » avec son lien vers
   *    l'objet ;
   *  · une affaire TRAVAILLÉE à titre générique (montant saisi) — doit RESTER :
   *    `projectNature` ne lit jamais le titre, seulement le travail ;
   *  · une GÉNÉRALITÉ sans travail ni source — sort des compteurs et des
   *    priorités (compteur `generic_deductions`), reste lisible, rien n'est
   *    effacé ;
   *  · un PROGRAMME nommé et sourcé — fait documenté, jamais éliminé par son titre.
   *
   * ⚠️ Même client FICTIF que le reste de la salle : aucun fait attribué à une
   * société réelle. Les signaux datés (récent / historique) viennent de
   * `detectedSignals` ; la piste, de ses signaux convergents.
   */
  signalsAndNeedsCases: [
    {
      kind: 'pain',
      label: 'Renfort exploitation des systèmes temps réel — demande confirmée par la DSI',
      detail: 'Besoin exprimé en réunion, confirmé par écrit par le client.',
      stage: 'confirmed',
      source: 'client',
      amount_cents: null,
      days_ago: 6,
      // #3624 (R2 07/10) — « Contacter <nom> » sous « Demandes confirmées » : la recette prod a trouvé
      // 0 bouton, parce que `project_contacts` n'était semé que sur l'affaire QUALIFIÉE du compte, jamais
      // sur cette demande confirmée. Interlocuteurs SIMULÉS de la salle (voir `contacts` plus haut).
      contacts: [
        { full_name: 'Julien Castaing', role: 'sponsor' },
        { full_name: 'Nadia Perrin', role: 'acheteur' },
      ],
    },
    {
      kind: 'implication',
      label: 'Cette activité implique des systèmes critiques',
      detail: 'Déduction de l’analyse, reprise par le commercial : montant saisi après un échange validé.',
      stage: 'detected',
      source: null,
      amount_cents: 90_000_00,
      days_ago: 14,
    },
    {
      kind: 'implication',
      // Libellé distinct de l'affaire travaillée : (compte, nature, libellé) est unique en base.
      label: 'Cette activité implique des données sensibles',
      detail: 'Déduction générique de l’analyse : aucun fait, aucune action, aucun propriétaire.',
      stage: 'detected',
      source: null,
      amount_cents: null,
      days_ago: 14,
    },
    {
      kind: 'program',
      label: 'Ambition 2026–2030 — programme de modernisation du système d’information',
      detail: 'Programme nommé dans le rapport annuel du groupe.',
      stage: 'detected',
      source: 'Rapport annuel 2025',
      amount_cents: null,
      days_ago: 40,
    },
  ] as readonly {
    kind: 'pain' | 'implication' | 'program'
    label: string
    detail: string
    stage: string
    source: string | null
    amount_cents: number | null
    days_ago: number
    contacts?: readonly { full_name: string; role: 'sponsor' | 'acheteur' | 'prescripteur' | 'utilisateur' }[]
  }[],

  /**
   * Cinq rôles ouverts, dans CINQ colonnes différentes du kanban.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CINQ, ET PAS UN
   * ─────────────────────────────────────────────────────────────────────────
   * La salle n'en portait qu'UN. Le kanban des besoins s'ouvrait donc sur neuf
   * colonnes vides et une seule remplie : le pied contextuel de chaque colonne —
   * celui qui dit ce qui bloque CHEZ ELLE — changeait bien d'une colonne à
   * l'autre, et personne ne pouvait le voir changer. Un écran dont la mécanique
   * ne se montre que sur une ligne se découvre en réunion, pas en CI (règle #9).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUE CHAQUE LIGNE DOIT FAIRE VOIR
   * ─────────────────────────────────────────────────────────────────────────
   * Le pied d'une carte n'a que deux choses à dire, et elles se lisent sur deux
   * mesures distinctes : l'ÂGE DANS L'ÉTAPE (`status_changed_at`) et le nombre
   * de PROFILS POSITIONNÉS (`shortlist_count`). Une démonstration où toutes les
   * colonnes reposeraient sur la même mesure montrerait quatre fois le même
   * pied. D'où la répartition :
   *
   *  - « à qualifier », posé depuis dix-neuf jours et SANS aucun profil : il n'y
   *    a rien d'autre à dire que son âge — c'est le stock qui dort ;
   *  - « en veille », depuis trente-quatre jours, avec son MOTIF (obligatoire
   *    sur cet état) et sans TJM communiqué : la colonne compte à part ce qu'on
   *    ne sait pas chiffrer, plutôt que de l'afficher à zéro ;
   *  - « matching en cours », DEUX profils positionnés ;
   *  - « shortlist prête », UN profil retenu, prêt à partir ;
   *  - « en validation client », UN profil déjà parti chez le client.
   *
   * ⚠️ Les deux premiers ont une shortlist VIDE, et c'est un vrai zéro : rien
   * n'a été positionné sur eux. « Aucun profil » y est la vérité, pas une
   * mesure manquante — c'est la distinction que la colonne Shortlist existe pour
   * montrer, et la fabriquer non nulle partout la ferait disparaître.
   *
   * ⚠️ Et l'inverse est aussi tenu : AUCUN rôle ne s'annonce plus loin que ce
   * que ses profils permettent. Un besoin en « shortlist prête » avec zéro
   * profil positionné est un écran qui se contredit lui-même — c'était l'état de
   * la salle avant ce lot, et c'est pourquoi {@link DEMO_FLAGSHIP_NEED} est
   * repassé en « matching à lancer ».
   */
  openNeeds: [
    {
      title: 'Ingénieur systèmes — supervision des systèmes temps réel',
      status: 'to_qualify' as const,
      status_reason: null,
      status_changed_days_ago: 19,
      skills: [
        { term: 'SI industriel', required: true },
        { term: 'Supervision de production', required: true },
        { term: 'SQL', required: false },
      ],
      seniority: 'confirme',
      headcount: 1,
      target_tjm_cents: 560_00,
      location: 'Lyon (69)',
      // #2173.29 — cohérent avec `constraints` juste plus bas (« présence sur
      // site trois jours par semaine ») : ni sur site à 100 %, ni full remote.
      remote: 'hybride' as const,
      contract_kind: 'regie' as const,
      urgency: 'normale' as const,
      source: 'meeting_notes' as const,
      provenance: 'human' as const,
      start_in_days: null,
      deadline_in_days: null,
      /**
       * LE RÔLE QUI EXIGE UNE HABILITATION — et il en faut UN dans la salle.
       *
       * Sans lui, l'axe 12 du rapprochement (« une habilitation manquante
       * ÉCARTE ») ne se montre nulle part : un prospect verrait treize axes
       * annoncés et n'en verrait jamais un seul écarter quelqu'un. C'est
       * exactement le trou que ce lot ferme — le champ existait des deux côtés
       * et rien ne le remplissait, donc le garde-fou ne s'appliquait jamais.
       */
      languages: [
        { code: 'fr', level: 'natif' },
        { code: 'en', level: 'b2' },
      ],
      clearances: ['Confidentiel Défense'],
      context:
        'Le site de Lyon passe sa supervision des systèmes temps réel sur un socle unique. L’équipe interne tient le run ; elle cherche quelqu’un pour reprendre la couche de supervision et la documenter avant la bascule de janvier.',
      expertise: 'Supervision industrielle',
      stack: ['Ignition', 'PostgreSQL', 'Modbus'],
      constraints: 'Astreinte une semaine sur quatre, présence sur site trois jours par semaine.',
      /** #2323.22 — LE PROCESSUS, texte libre : sans lui, la porte PRÉSENTER
       *  n'a jamais un seul rôle où montrer les cinq critères tous réunis. */
      presentation_process:
        'Un entretien technique avec l’équipe run, puis une validation du responsable infrastructure.',
      /** #2939 (#2174.32/.34) — COMMENT LE CLIENT DÉCIDE, distinct du
       *  recrutement CÔTÉ ESN (`presentation_process` juste au-dessus) : la
       *  DSI valide le principe, puis le budget passe par les achats — sans
       *  ce champ, la fiche du besoin ne peut jamais montrer le processus de
       *  décision rempli à côté du processus de présentation. */
      decision_process: 'Validation de principe par la DSI, puis passage obligatoire par les achats pour le budget.',
      procurement_involvement: 'implique' as const,
      /** #2323.18 — l'accord client sur ce type de profil, déjà obtenu en
       *  réunion (cohérent avec `context`, « L’équipe interne tient le run »). */
      profile_type_agreement: 'agreed' as const,
      /** #3409.2 — LA NATURE : formulée en réunion (`source: 'meeting_notes'`
       *  ci-dessus), donc EXPRIMÉE — pas un simple signal capté ailleurs. Le
       *  seul besoin de la salle qui porte une nature, pour que la fiche
       *  montre le contrôle rempli au moins une fois, pas seulement muet. */
      convergence_state: 'besoin_exprime' as const,
      /**
       * #2323.38-.42 — LE RÔLE SANS AUCUNE CONTRADICTION, à dessein.
       *
       * Un processus à deux entretiens pour un démarrage non pressé, une
       * présence sur site cohérente avec `remote: 'hybride'`, freelance non
       * exclu, budget non concerné (mission courte, `duration_months` non
       * porté ici) : la salle doit aussi montrer un rôle qui PASSE le moteur
       * de contradictions, pas seulement ceux qui le déclenchent.
       */
      interview_rounds: 2,
      onsite_days_per_week: 3,
      freelance_excluded: false,
      budget_validated: true,
      /** Le PLANCHER, distinct du tarif cible : l'un est ce qu'on vise, l'autre
       *  ce en dessous de quoi on ne descend pas. */
      min_tjm_cents: 480_00,
      /** ⚠️ Pas de budget communiqué, et jamais 0 : la fiche doit pouvoir
       *  montrer « le client n'a pas communiqué de budget » à côté d'un rôle par
       *  ailleurs complet. */
      budget_cents: null,
      shortlist: [],
    },
    {
      title: 'Ingénieur infrastructure — socle conteneurisé du portail',
      status: 'matching' as const,
      status_reason: null,
      status_changed_days_ago: 5,
      skills: [
        { term: 'Kubernetes', required: true },
        { term: 'Terraform', required: true },
        { term: 'GitLab CI', required: false },
      ],
      seniority: 'confirme',
      headcount: 2,
      target_tjm_cents: 600_00,
      location: 'Lyon',
      // #2173.29
      remote: 'full_remote' as const,
      contract_kind: 'regie' as const,
      urgency: 'haute' as const,
      source: 'client_email' as const,
      provenance: 'human' as const,
      // Trente-quatre jours : au-delà de l'horizon « démarre bientôt » (trente),
      // là où celui d'en dessous est dedans. Une liste où tout démarre bientôt
      // n'apprend pas à lire le compteur.
      start_in_days: 34,
      deadline_in_days: 9,
      /** Une langue exigée SANS habilitation : les deux exigences sont
       *  indépendantes, et un rôle qui porterait toujours les deux ferait croire
       *  qu'elles vont ensemble. */
      languages: [{ code: 'en', level: 'b2' }],
      clearances: [],
      context:
        'Le programme de refonte applicative migre vers un socle conteneurisé. Deux postes, sur la même équipe, pour tenir la plateforme et le pipeline de livraison pendant la reprise.',
      expertise: null,
      stack: ['Kubernetes', 'Terraform', 'GitLab CI'],
      constraints: null,
      /**
       * #2323.40 — LA CONTRADICTION MONTRABLE : `remote: 'full_remote'` juste
       * au-dessus, et un jour de présence exigé ici. Sans un rôle qui la
       * déclenche, l'écran « Ce que le poste exige » ne montrerait jamais la
       * section contradictions — un moteur livré et jamais vu en démo.
       */
      onsite_days_per_week: 1,
      interview_rounds: 3,
      freelance_excluded: false,
      budget_validated: true,
      /**
       * ⚠️ LE PLANCHER EXISTE ICI, et il est indispensable — c'est le rôle qui
       * porte le rapprochement de la salle, donc celui qui montre le verdict
       * « go / no-go » COMPLET.
       *
       * L'axe « économie » du verdict compare la cible au plancher, et il est
       * DÉCISIF : sans plancher il n'est pas renseigné, et un axe décisif non
       * renseigné interdit le « oui » (une ignorance n'est pas une promesse).
       * Le seul rôle censé démontrer le verdict s'ouvrirait alors sur « je
       * manque de données ». Trois des cinq rôles gardent leur plancher à
       * `null` : la phrase « aucun plancher n'est saisi » reste montrable.
       */
      min_tjm_cents: 520_00,
      /** Le budget de l'affaire, tel que le client l'a annoncé. Il n'est PAS
       *  dérivé du tarif cible : « TJM × jours × postes » varierait selon qu'on
       *  compte vingt ou vingt-et-un jours par mois — c'est le calcul refusé
       *  pour le « CA potentiel », et le refuser ici aussi tient la même ligne. */
      budget_cents: 288_000_00,
      shortlist: [
        {
          consultant: 'Hakim Barreau',
          stage: 'shortlisted' as const,
          stage_entered_days_ago: 3,
          submitted_days_ago: null,
          proposed_rate_cents: null,
        },
        {
          consultant: 'Antoine Rivière',
          stage: 'shortlisted' as const,
          stage_entered_days_ago: 2,
          submitted_days_ago: null,
          proposed_rate_cents: null,
        },
        /**
         * #2567.3 — LE VIVIER : UN PROFIL PARTI CHEZ LE CLIENT SANS RETOUR.
         *
         * Seize jours de silence, au-delà des quatorze de
         * `INTERVENTION_THRESHOLDS.submissionSilenceDays` — c'est la donnée
         * MINIMALE qui fait que `detectStalledSubmissions`
         * (`intervention-rules.ts`) produit RÉELLEMENT `submission_stalled`
         * sur cette ligne : `submitted_days_ago` posé, ni retour ni clôture
         * (l'insertion de `seedOpenNeeds` ne porte ni `first_feedback_at` ni
         * `closed_at`, donc les deux restent NULL en base). Marc Ouedraogo est
         * réutilisé — seul consultant de la salle jusque-là sans aucun
         * positionnement en cours, aucune fiche neuve à inventer.
         */
        {
          consultant: 'Marc Ouedraogo',
          stage: 'submitted' as const,
          stage_entered_days_ago: 16,
          submitted_days_ago: 16,
          proposed_rate_cents: 600_00,
        },
      ],
    },
    {
      title: 'Ingénieur données — fiabilisation des flux temps réel',
      status: 'shortlist_ready' as const,
      status_reason: null,
      status_changed_days_ago: 6,
      skills: [
        { term: 'Airflow', required: true },
        { term: 'Python', required: true },
        { term: 'PostgreSQL', required: false },
      ],
      seniority: 'confirme',
      headcount: 1,
      target_tjm_cents: 580_00,
      location: 'Lyon',
      // #2173.29
      remote: 'hybride' as const,
      contract_kind: 'regie' as const,
      urgency: 'normale' as const,
      source: 'client_email' as const,
      provenance: 'human' as const,
      // Trente-cinq jours : juste après la fin d'affectation de la personne
      // retenue, qui se libère dans vingt-huit. La démonstration montre ainsi
      // une shortlist qui TIENT, au lieu d'un profil promis avant d'être libre.
      start_in_days: 35,
      deadline_in_days: 12,
      /**
       * ⚠️ LE RÔLE QUI N'EXIGE RIEN, et c'est la moitié qu'on oublie.
       *
       * Sans lui, la salle ne montrerait jamais les phrases d'absence — « l'axe
       * langues sort du calcul au lieu de valoir zéro », « tant qu'il n'y a pas
       * d'habilitation, rien n'écarte un profil qui n'en aurait pas ». C'est
       * précisément la partie du produit qui dit ce qu'il ignore, et une salle
       * entièrement remplie l'efface.
       */
      languages: [],
      clearances: [],
      context: null,
      expertise: null,
      stack: [],
      constraints: null,
      min_tjm_cents: null,
      budget_cents: null,
      shortlist: [
        {
          consultant: 'Salomé Dufour',
          stage: 'shortlisted' as const,
          stage_entered_days_ago: 6,
          submitted_days_ago: null,
          proposed_rate_cents: null,
        },
      ],
    },
    {
      title: 'Consultant sécurité applicative — parcours d’authentification',
      status: 'client_review' as const,
      status_reason: null,
      status_changed_days_ago: 8,
      skills: [
        { term: 'Sécurité applicative', required: true },
        { term: 'Revue de code', required: true },
        { term: 'Authentification forte', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      target_tjm_cents: 720_00,
      location: 'Lyon',
      // #2173.29 — cohérent avec `constraints` (« revue sur site, badge
      // nominatif, pas d'accès distant »).
      remote: 'sur_site' as const,
      contract_kind: 'regie' as const,
      urgency: 'normale' as const,
      source: 'client_email' as const,
      provenance: 'human' as const,
      start_in_days: 21,
      deadline_in_days: 4,
      /** Une SECONDE habilitation, d'une autre famille que la première : les
       *  habilitations ne sont pas une liste fermée — chaque donneur d'ordre a
       *  les siennes, et une salle qui n'en montrerait qu'une le ferait croire. */
      languages: [{ code: 'fr', level: 'natif' }],
      clearances: ['Agrément sécurité du donneur d’ordre'],
      context:
        'Le parcours d’authentification du portail est repris avant l’ouverture aux partenaires externes. Le client veut une revue indépendante de celle de son intégrateur.',
      expertise: 'Sécurité applicative',
      stack: ['OAuth 2.1', 'OWASP ASVS'],
      constraints: 'Revue sur site, badge nominatif, pas d’accès distant aux environnements de production.',
      min_tjm_cents: 640_00,
      budget_cents: null,
      shortlist: [
        {
          consultant: 'Inès Kaczmarek',
          stage: 'submitted' as const,
          stage_entered_days_ago: 8,
          submitted_days_ago: 8,
          proposed_rate_cents: 720_00,
        },
        /**
         * #2206.12 — LA COLLISION D'ÉQUIPE, EN DÉMO.
         *
         * Antoine Rivière (architecte cloud) est DÉJÀ shortlisté sur
         * « Ingénieur infrastructure — socle conteneurisé du portail »,
         * quelques besoins plus haut. Cette seconde ligne, sur un besoin
         * DISTINCT et toujours OUVERT, est exactement ce que
         * `detectStaffingCollisions` (`@bellum/contracts`) lit : deux
         * positionnements ouverts du même consultant sur deux besoins
         * concurrents. Encore au stade `shortlisted` (piste explorée, pas
         * encore un CV envoyé) — sans cette ligne, la nature
         * `staffing_collision` n'avait aucun cas à montrer en démonstration.
         */
        {
          consultant: 'Antoine Rivière',
          stage: 'shortlisted' as const,
          stage_entered_days_ago: 4,
          submitted_days_ago: null,
          proposed_rate_cents: null,
        },
      ],
    },
    /**
     * #2942 — LES DEUX COLONNES QUI MANQUAIENT AU KANBAN DES BESOINS.
     *
     * `NEED_OPEN_STATUSES` (`need-status.ts`) porte désormais `interview` et
     * `negotiation`, entre « en validation client » et « gagné » : le Pipe des
     * besoins sait enfin distinguer un client qui a REÇU un profil d'un client
     * qui FAIT PASSER un entretien ou qui NÉGOCIE les conditions. Deux colonnes
     * neuves ouvertes sans rôle qui les occupe seraient deux colonnes vides sur
     * l'écran de démonstration — la garde `demo-coverage.spec.ts`
     * (« couverture des colonnes du kanban des besoins ») le refuse.
     */
    {
      title: 'Data engineer plateforme — reprise du pipeline de facturation',
      status: 'interview' as const,
      status_reason: null,
      status_changed_days_ago: 3,
      skills: [
        { term: 'Airflow', required: true },
        { term: 'dbt', required: true },
        { term: 'SQL avancé', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      target_tjm_cents: 680_00,
      location: 'Lyon',
      // #2173.29
      remote: 'hybride' as const,
      contract_kind: 'regie' as const,
      urgency: 'normale' as const,
      source: 'client_email' as const,
      provenance: 'human' as const,
      start_in_days: 14,
      deadline_in_days: null,
      languages: [{ code: 'fr', level: 'natif' }],
      clearances: [],
      context:
        'Le pipeline de facturation actuel casse à chaque montée en charge. Le client veut quelqu’un pour le reprendre et le fiabiliser avant la clôture annuelle.',
      expertise: 'Ingénierie de la donnée',
      stack: ['Airflow', 'dbt', 'PostgreSQL'],
      constraints: null,
      min_tjm_cents: 600_00,
      budget_cents: null,
      shortlist: [
        {
          consultant: 'Inès Kaczmarek',
          // #2942 — `SUBMISSION_STAGES.interview` (submission.ts) : « le client a
          // demandé à rencontrer la personne » — la RAISON pour laquelle ce
          // besoin lui-même est passé de « en validation client » à
          // « entretien ». Même consultante qu'au rôle « sécurité applicative »
          // plus haut : une collision de staffing DE PLUS, sur un état neuf.
          stage: 'interview' as const,
          stage_entered_days_ago: 3,
          submitted_days_ago: 6,
          proposed_rate_cents: 680_00,
        },
      ],
    },
    {
      title: 'Product owner mobilité — refonte des applications voyageurs',
      status: 'negotiation' as const,
      status_reason: null,
      status_changed_days_ago: 2,
      skills: [
        { term: 'Product management', required: true },
        { term: 'Mobilité / ferroviaire', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      target_tjm_cents: 700_00,
      location: 'Lyon',
      // #2173.29
      remote: 'hybride' as const,
      contract_kind: 'regie' as const,
      urgency: 'haute' as const,
      source: 'client_email' as const,
      provenance: 'human' as const,
      start_in_days: 10,
      deadline_in_days: 5,
      languages: [{ code: 'fr', level: 'natif' }],
      clearances: [],
      context:
        'Le client a choisi la candidate. Il reste à s’accorder sur la date de démarrage et le TJM, entre le tarif cible et le plancher communiqué.',
      expertise: 'Product management',
      stack: [],
      constraints: null,
      /** Le PLANCHER, distinct du tarif cible : c'est exactement l'écart que la
       *  négociation en cours cherche à combler. */
      min_tjm_cents: 640_00,
      budget_cents: null,
      shortlist: [
        {
          consultant: 'Antoine Rivière',
          // Le client a PRIS le profil (`accepted`) : c'est ce qui distingue la
          // négociation d'un entretien encore en cours — le choix est fait, il
          // reste à s'accorder sur les conditions.
          stage: 'accepted' as const,
          stage_entered_days_ago: 2,
          submitted_days_ago: 11,
          proposed_rate_cents: 700_00,
        },
      ],
    },
    {
      title: 'Chef de projet — programme de refonte applicative',
      status: 'on_hold' as const,
      /** Obligatoire sur une mise en veille : sans motif, c'est exactement le
       *  besoin que personne ne rouvre — rien ne dit ce qu'on attend ni de qui. */
      status_reason: 'Budget gelé jusqu’à l’arbitrage de novembre — le client a demandé de suspendre.',
      status_changed_days_ago: 34,
      /** #3389.13 — « attente AVEC DATE » : la reprise prévue de cette veille, dans N jours (négatif : déjà échue — la salle montre la carte « reprise échue » du brief). */
      resume_in_days: -2,
      skills: [
        { term: 'Gestion de projet', required: true },
        { term: 'Conduite du changement', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      /** NON COMMUNIQUÉ, jamais zéro : c'est la ligne qui fait dire à la colonne
       *  « 1 sans TJM » au lieu d'absorber un rôle gratuit dans son cumul. */
      target_tjm_cents: null,
      location: 'Lyon',
      // #2173.29 — NON RENSEIGNÉ, délibérément : la démo doit montrer que
      // l'absence affiche « non renseigné », jamais « sur site » par défaut
      // (craft rule n°9 / GA-18-GA-19). Cohérent avec les autres champs `null`
      // de ce besoin en veille — rien n'a été qualifié.
      remote: null,
      contract_kind: 'forfait' as const,
      urgency: 'basse' as const,
      source: 'meeting_notes' as const,
      provenance: 'human' as const,
      start_in_days: null,
      deadline_in_days: null,
      /** En veille depuis trente-quatre jours : rien n'a été qualifié, donc rien
       *  n'est exigé. Un rôle mis en veille dont les exigences seraient
       *  complètes se contredirait lui-même. */
      languages: [],
      clearances: [],
      context: null,
      expertise: null,
      stack: [],
      constraints: null,
      min_tjm_cents: null,
      budget_cents: null,
      shortlist: [],
    },
    /**
     * #2173.49 — LE BESOIN ARCHIVÉ, pour que la vue « Archivés » ne soit pas
     * vide (règle « parité démo »).
     *
     * ⚠️ Le POINT de cette ligne : le statut reste `to_qualify`, celui qu'il
     * portait le jour où on l'a rangé — jamais `lost` ni `cancelled`.
     * Archiver n'est PAS une clôture (décision Louis, 17/09/2026) : ce
     * besoin n'a jamais été tranché, il a simplement été mis de côté le
     * temps que le client revienne. Un prospect qui ouvre « Archivés » doit
     * voir un statut « À qualifier » sur une ligne rangée — la preuve que le
     * rangement ne raconte rien sur l'avancement.
     */
    {
      title: 'Data analyst reporting — tableau de bord d’exploitation',
      status: 'to_qualify' as const,
      status_reason: null,
      status_changed_days_ago: 40,
      archived_days_ago: 12,
      skills: [
        { term: 'Power BI', required: true },
        { term: 'SQL', required: true },
      ],
      seniority: 'confirme',
      headcount: 1,
      target_tjm_cents: 520_00,
      location: 'Lyon',
      // #2173.29
      remote: 'hybride' as const,
      contract_kind: 'regie' as const,
      urgency: null,
      source: 'client_email' as const,
      provenance: 'human' as const,
      start_in_days: null,
      deadline_in_days: null,
      languages: [],
      clearances: [],
      context:
        'Le client a demandé un tableau de bord d’exploitation, puis n’a plus donné de nouvelles depuis six semaines. Rangé le temps qu’il revienne — rien n’a été tranché.',
      expertise: null,
      stack: [],
      constraints: null,
      min_tjm_cents: null,
      budget_cents: null,
      shortlist: [],
    },
  ],

  /**
   * LES BESOINS REFUSÉS FAUTE DE PROFIL — PDF 4 §8.4.
   *
   * ⚠️ Une liste SÉPARÉE d'`openNeeds`, et ce n'est pas de la coquetterie : un
   * besoin refusé est en `lost`, un statut qui n'a AUCUNE colonne sur le kanban
   * des besoins. Les mélanger écrirait trois rôles en base que l'écran qu'on
   * cherche à remplir ne montrerait jamais — et ferait tomber la garde qui
   * vérifie précisément que chaque rôle semé a une colonne où atterrir.
   *
   * Ils sont semés par la MÊME boucle : ce sont des `project_needs` ordinaires,
   * ils portent seulement un verdict G3.
   */
  refusedNeeds: [
    {
      title: 'Ingénieur plateforme Kubernetes — socle de conteneurs',
      status: 'lost' as const,
      status_reason: 'Aucun profil Kubernetes disponible dans le vivier à la date demandée.',
      status_changed_days_ago: 22,
      skills: [
        { term: 'Kubernetes', required: true },
        { term: 'Terraform', required: false },
      ],
      seniority: 'senior',
      headcount: 1,
      target_tjm_cents: 680_00,
      location: 'Lyon',
      // #2173.29
      remote: 'hybride' as const,
      contract_kind: 'regie' as const,
      urgency: 'haute' as const,
      source: 'meeting_notes' as const,
      provenance: 'human' as const,
      start_in_days: -30,
      deadline_in_days: null,
      languages: [],
      clearances: [],
      context: null,
      expertise: null,
      stack: [],
      constraints: null,
      min_tjm_cents: null,
      budget_cents: null,
      /** Douze mois : avec le TJM, c'est ce qui rend le CA non adressé calculable. */
      duration_months: 12,
      staffable: 'no' as const,
      staffable_reason: 'Compétence absente du vivier',
      staffable_decided_days_ago: 22,
      shortlist: [],
    },
    {
      title: 'DevOps K8s — industrialisation des déploiements',
      status: 'lost' as const,
      status_reason: 'Deux profils pressentis, aucun disponible sur la fenêtre du client.',
      status_changed_days_ago: 47,
      skills: [
        { term: 'K8s', required: true },
        { term: 'GitLab CI', required: false },
      ],
      seniority: 'confirme',
      headcount: 1,
      target_tjm_cents: 620_00,
      location: 'Villeurbanne (69)',
      // #2173.29
      remote: 'sur_site' as const,
      contract_kind: 'regie' as const,
      urgency: 'normale' as const,
      source: 'meeting_notes' as const,
      provenance: 'human' as const,
      start_in_days: -60,
      deadline_in_days: null,
      languages: [],
      clearances: [],
      context: null,
      expertise: null,
      stack: [],
      constraints: null,
      min_tjm_cents: null,
      budget_cents: null,
      duration_months: 6,
      staffable: 'no' as const,
      staffable_reason: 'Compétence absente du vivier',
      staffable_decided_days_ago: 47,
      shortlist: [],
    },
    {
      title: 'Administrateur kube — reprise d’un cluster existant',
      status: 'lost' as const,
      status_reason: 'Fermé faute de profil ; le client a repris l’exploitation en interne.',
      status_changed_days_ago: 71,
      skills: [{ term: 'kube', required: true }],
      seniority: 'confirme',
      headcount: 1,
      /** SANS TJM CIBLE, délibérément : c'est ce besoin-là qui fait apparaître
       *  « 1 sans TJM cible » sous le montant. Un CA non adressé qui ne dirait
       *  pas ce qu'il n'a pas compté se lirait comme un total. */
      target_tjm_cents: null,
      location: 'Lyon',
      // #2173.29 — un second « non renseigné », sur un besoin déjà perdu :
      // personne n'a eu le temps de le préciser avant la clôture.
      remote: null,
      contract_kind: 'regie' as const,
      urgency: 'basse' as const,
      source: 'meeting_notes' as const,
      provenance: 'human' as const,
      start_in_days: -90,
      deadline_in_days: null,
      languages: [],
      clearances: [],
      context: null,
      expertise: null,
      stack: [],
      constraints: null,
      min_tjm_cents: null,
      budget_cents: null,
      duration_months: 9,
      staffable: 'no' as const,
      staffable_reason: 'Compétence absente du vivier',
      staffable_decided_days_ago: 71,
      shortlist: [],
    },
  ],

  /**
   * #2558.1 — UN BESOIN SANS PROJET (craft rule n°9).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE CAS-LÀ, ET PAS UN AUTRE
   * ─────────────────────────────────────────────────────────────────────────
   * François Thomas (call bêta du 17/09/2026, cité par la migration
   * `1795711263408-NeedWithoutProject`) : la majorité des missions d'ESN ne
   * produisent aucun signal public. `openNeeds`/`refusedNeeds` ci-dessus
   * portent tous un `project_id` — la migration qui rend le projet FACULTATIF
   * (`project_needs.account_id`, `POST /projects/needs`) est livrée depuis la
   * vague J (18/09/2026) sans qu'aucun semis n'exerce jamais `project_id:
   * NULL`. La garde par table restait verte : `project_needs` est classée
   * SEEDÉE depuis longtemps, et une table remplie ne dit rien de la FORME de
   * ce qu'elle contient.
   *
   * Ce n'est PAS un doublon d'un besoin existant à qui on retire le projet —
   * `seedNeedWithoutProject` (`demo-seed.service.ts`) écrit une ligne à part,
   * jamais rattachée à `client.openProject` ni à `client.pipelineProjects`.
   * L'histoire : une alerte presse repère un poste ouvert chez SNCF
   * avant qu'aucun round de recrutement ne soit formalisé en projet — c'est
   * l'usage normal que #2558.1 ouvre, pas un cas limite.
   *
   * ⚠️ NI tarif cible NI budget : rien n'a encore été discuté avec le client,
   * donc rien n'est chiffré — jamais `0`, qui se lirait comme un prix connu.
   * NI habilitation NI langue exigée : un signal de presse ne porte pas ce
   * niveau de détail, la fiche montre l'ABSENCE plutôt que d'inventer.
   */
  needWithoutProject: {
    title: 'Data engineer — plateforme data',
    status: 'to_qualify' as const,
    status_reason: null,
    status_changed_days_ago: 2,
    skills: [
      { term: 'EDI', required: true },
      { term: 'Talend', required: false },
    ],
    seniority: 'confirme',
    headcount: 1,
    target_tjm_cents: null,
    location: 'Lille',
    contract_kind: 'regie' as const,
    urgency: 'normale' as const,
    // Détecté, pas rapporté par un humain en réunion — la même distinction
    // que les signaux de `detectedSignals` plus haut dans le semis.
    source: 'company_news' as const,
    provenance: 'pipeline' as const,
    start_in_days: null,
    deadline_in_days: null,
    languages: [] as { code: string; level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2' | 'natif' | null }[],
    clearances: [] as string[],
    context:
      'Repéré via une alerte presse : SNCF Connect & Tech publie une offre d’ingénieur plateforme data (Saint-Denis). Aucun contact n’a encore confirmé le besoin — rien n’est formalisé en projet.',
    expertise: 'Intégration EDI',
    stack: ['Talend', 'SQL'],
    constraints: null,
    min_tjm_cents: null,
    budget_cents: null,
  },

  /**
   * #3681 — UNE ANNONCE DE RECRUTEMENT INTERNE (craft rule n°9).
   *
   * Un poste en CDI chez le client n'est PAS une mission de prestation
   * accessible à une ESN : son type (`contract_kind: 'recrutement'`) est le seul
   * témoin, jamais une lecture du titre. L'onglet Besoins du compte la NOMME à
   * part, sans geste, et elle ne compte pas comme demande ouverte — le compte de
   * la salle porte aussi de vraies demandes (`openNeeds`), donc les DEUX états
   * se voient côte à côte. Ni tarif ni budget : une annonce RH n'en porte pas.
   */
  internalHireNeed: {
    title: 'Responsable BI (CDI) — recrutement interne',
    context: 'Offre d’emploi publiée par la direction des systèmes d’information du client : recrutement en CDI.',
    location: 'Paris',
    status_changed_days_ago: 6,
  },

  /**
   * Les DOCUMENTS d'un besoin — devis, NDA, contrat cadre (fiche besoin,
   * dossier du 26/08 image 02). Rattachés par TITRE au besoin ci-dessus, comme
   * `shortlist` l'est par nom de consultant : `seedOpenNeeds` construit une
   * table titre → id pendant la boucle d'insertion, puis relit celle-ci.
   *
   * ⚠️ Trois besoins sur cinq n'en portent AUCUN — délibéré. Une salle où
   * chaque rôle porterait un devis ne montrerait jamais la phrase d'absence
   * (« Aucun document sur ce besoin pour l'instant »), qui est la moitié du
   * produit que la garde de parité vérifie aussi.
   */
  needDocuments: [
    {
      need: 'Ingénieur systèmes — supervision des systèmes temps réel',
      kind: 'quote' as const,
      name: 'Devis_TempsReelLyon_20052026.pdf',
      status: 'sent' as const,
      // 31/08/2026 — de VRAIS octets : la salle montre un bouton qui ouvre
      // quelque chose, ce qu'aucun écran ne pouvait faire avant le stockage.
      stored: true,
    },
    {
      need: 'Ingénieur systèmes — supervision des systèmes temps réel',
      kind: 'nda' as const,
      name: 'NDA_TempsReelLyon.pdf',
      status: 'signed' as const,
      stored: true,
    },
    {
      need: 'Ingénieur systèmes — supervision des systèmes temps réel',
      kind: 'master_agreement' as const,
      name: 'Contrat_cadre_TempsReelLyon.pdf',
      status: 'pending' as const,
      // SANS fichier, à dessein : « en attente » veut dire qu'on l'attend
      // encore. C'est l'état que la fiche doit savoir montrer, et une salle où
      // chaque pièce s'ouvre ne le montrerait jamais.
      stored: false,
    },
    {
      need: 'Ingénieur infrastructure — socle conteneurisé du portail',
      kind: 'nda' as const,
      name: 'NDA_RefonteApplicative.pdf',
      status: 'signed' as const,
      stored: false,
    },
    {
      need: 'Chef de projet — programme de refonte applicative',
      kind: 'quote' as const,
      name: 'Devis_RefonteApplicative.pdf',
      status: 'draft' as const,
      stored: false,
    },
  ],

  /**
   * Les « prochaines étapes » COCHABLES d'un besoin — distinctes de
   * `needNextAction`, une dérivation non persistée qui reste à côté (voir
   * `need-step.ts`). Même mécanique de rattachement par TITRE que
   * `needDocuments` ci-dessus.
   *
   * Trois statuts REPRÉSENTÉS sur des besoins DIFFÉRENTS — `done`, `todo`,
   * `pending` — pour qu'une case cochée, un badge « À faire » et un badge
   * « En attente » soient tous visibles sans qu'un visiteur ait à cocher quoi
   * que ce soit lui-même.
   */
  needSteps: [
    {
      need: 'Ingénieur systèmes — supervision des systèmes temps réel',
      label: 'Valider la short list des profils',
      status: 'done' as const,
    },
    {
      need: 'Ingénieur systèmes — supervision des systèmes temps réel',
      label: 'Organiser les entretiens',
      status: 'todo' as const,
    },
    {
      need: 'Ingénieur systèmes — supervision des systèmes temps réel',
      label: 'Envoyer la proposition commerciale',
      status: 'pending' as const,
    },
    {
      need: 'Ingénieur infrastructure — socle conteneurisé du portail',
      label: 'Lancer le rapprochement',
      status: 'done' as const,
    },
    {
      need: 'Ingénieur infrastructure — socle conteneurisé du portail',
      label: 'Présenter les profils retenus',
      status: 'todo' as const,
    },
    {
      need: 'Ingénieur données — fiabilisation des flux temps réel',
      label: 'Qualifier le besoin avec le client',
      status: 'todo' as const,
    },
    {
      need: 'Consultant sécurité applicative — parcours d’authentification',
      label: 'Vérifier les habilitations requises',
      status: 'pending' as const,
    },
    {
      need: 'Chef de projet — programme de refonte applicative',
      label: 'Relancer le client sur le budget',
      status: 'pending' as const,
    },
  ],

  /**
   * #2171.22 — Section « Actions et prochaines étapes » de la fiche
   * OPPORTUNITÉ (distincte de `needSteps` ci-dessus, qui porte le BESOIN) —
   * même mécanique COCHABLE, rattachée cette fois au projet unique de
   * `openProject` (`project.id`, `seedOpenNeeds`), sans indirection par titre
   * puisqu'il n'y en a qu'un dans ce lot.
   *
   * Trois statuts REPRÉSENTÉS — `done`, `todo`, `pending` — même raison que
   * `needSteps` : une case cochée, un badge « À faire » et un badge
   * « En attente » tous visibles sans qu'un visiteur coche quoi que ce soit.
   */
  projectSteps: [
    { label: 'Qualifier le budget avec le sponsor', status: 'done' as const },
    { label: 'Envoyer le devis actualisé', status: 'pending' as const },
    { label: 'Planifier la relance à J+7', status: 'todo' as const },
  ],

  /**
   * #2171.24 — Section « Documents » de la fiche OPPORTUNITÉ, distincte de
   * `needDocuments` ci-dessus (un rôle précis) : suivie au niveau de
   * L'AFFAIRE, sur le projet unique de `openProject`. Sans fichier joint,
   * comme le contrat le porte pour cette tranche (`project-document.ts`).
   *
   * Deux statuts REPRÉSENTÉS — `sent`, `draft` — pour que la salle montre la
   * fois où une pièce est déjà partie et la fois où elle ne l'est pas encore.
   */
  projectDocuments: [
    { kind: 'quote' as const, name: 'Devis_RefonteApplicative_v2.pdf', status: 'sent' as const },
    { kind: 'master_agreement' as const, name: 'Contrat_cadre_RefonteApplicative.pdf', status: 'draft' as const },
  ],

  /**
   * #2193.51 (épopée #2953) — Les DOCUMENTS d'une MISSION (contrat signé,
   * avenant, NDA), distincts de `projectDocuments` juste au-dessus (au
   * niveau de l'AFFAIRE) : semés sur la mission active de la salle
   * (« Fiabilisation plateforme — renfort exploitation »), même mission que
   * `seedMissionTracking`/`seedMissionFeedback`.
   *
   * Trois statuts REPRÉSENTÉS — `signed`, `draft`, `sent` — même raison que
   * `projectDocuments` : montrer la fois où une pièce est déjà signée et la
   * fois où elle ne l'est pas encore.
   */
  missionDocuments: [
    { kind: 'contract' as const, name: 'Contrat_FiabilisationPlateforme.pdf', status: 'signed' as const },
    { kind: 'amendment' as const, name: 'Avenant_Astreinte_Novembre.pdf', status: 'draft' as const },
    // #2095.45 (L1, 31/10/2026) — un avenant ENVOYÉ il y a neuf jours, toujours
    // pas signé : il nourrit la carte « Aujourd'hui » « avenant en attente de
    // signature » (`mission_amendment_pending`, `BriefingService.buildEngineCards`)
    // — craft rule n°9. `sentDaysAgo` date l'envoi (`updated_at`), sans quoi la
    // carte dirait « envoyé il y a 0 jour » sur un semis de la veille.
    {
      kind: 'amendment' as const,
      name: 'Avenant_Prolongation_T1.pdf',
      status: 'sent' as const,
      sentDaysAgo: 9,
    },
  ],

  /**
   * CE QUI REMPLIT LE VERDICT « GO / NO-GO » D'UN BESOIN — un seul rôle, et
   * c'est le point.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ UN SEUL RAPPROCHEMENT, PAS CINQ
   * ─────────────────────────────────────────────────────────────────────────
   * Le verdict lit le DERNIER rapprochement déjà exécuté. En seeder un sur
   * chacun des cinq rôles montrerait cinq bandeaux verts, c'est-à-dire un
   * produit qui aurait toujours une réponse — exactement ce que la règle
   * refuse. Un seul rôle en porte un : celui-là montre le verdict COMPLET (six
   * axes renseignés, ses profils, sa lecture d'acceptation), les quatre autres
   * montrent « JE MANQUE DE DONNÉES » avec leurs absences NOMMÉES.
   *
   * C'est la moitié qu'on oublie, et c'est la plus importante à démontrer :
   * « personne n'a regardé le vivier » n'est pas « personne ne convient ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ LES AXES SONT CEUX DU MOTEUR, ÉCRITS TELS QU'IL LES ÉCRIT
   * ─────────────────────────────────────────────────────────────────────────
   * `availability`, `rate` et `sector` sont les trois seuls axes que le verdict
   * relit (`readAxes`), et il lit leur SCORE. `100` sur `availability` est la
   * valeur que `axisAvailability` rend quand le profil est libre au plus tard
   * au démarrage demandé ; `null` est ce qu'il rend sur une disponibilité
   * inconnue — jamais zéro. Les trois profils ci-dessous couvrent les deux :
   * deux libres à temps, un plus tard.
   */
  needVerdict: {
    /** Le rôle qui porte le rapprochement. Rattaché par TITRE, comme les
     *  documents et les étapes — un titre introuvable est SAUTÉ, pas inventé. */
    need: 'Ingénieur infrastructure — socle conteneurisé du portail',
    /** Le seuil de l'espace (`MATCH_DEFAULT_THRESHOLD`), pas un nombre choisi. */
    threshold: 60,
    /** Combien de profils sont réellement passés par les treize axes. ⚠️ Jamais
     *  0 : « 0 évalué » veut dire que la question n'a pas été posée, et l'axe
     *  sortirait du décompte au lieu de montrer le verdict. */
    evaluated: 12,
    runDaysAgo: 2,
    /**
     * #2916 / #2399.2 (`c93_matching_auto_besoin_entrant`) — ce rapprochement
     * est celui que la routine « Matcher un besoin entrant » a ÉCRIT à
     * l'arrivée du rôle : la fiche besoin le montre « lancé automatiquement »
     * (craft rule n°9). Les quatre autres rôles n'en portent pas — leur
     * fiche ne dit rien, comme celle d'un besoin arrivé routine éteinte.
     */
    autoLaunched: true,
    // Refonte Théo (23/10) — `mustHave` : les compétences obligatoires du rôle (Kubernetes, Terraform)
    // couvertes et manquantes, écrites dans la forme de l'axe du moteur (`skillAxis`) pour que la fiche
    // dise la correspondance EN CLAIR (« Correspond : … · Manque : … »), jamais en points.
    entries: [
      {
        consultant: 'Camille Roussel',
        correspondence: 92,
        pushable: 78,
        availability: 100,
        rate: 100,
        sector: 100,
        mustHave: { covered: ['Kubernetes', 'Terraform'], missing: [] as string[] },
      },
      {
        consultant: 'Hakim Barreau',
        correspondence: 88,
        pushable: 74,
        availability: 100,
        rate: 100,
        sector: 0,
        mustHave: { covered: ['Kubernetes', 'Terraform'], missing: [] as string[] },
      },
      // Le troisième porte les deux nuances qui font parler la carte : libre
      // APRÈS le démarrage, et sans expérience du secteur. Sans lui, la
      // « lecture d'acceptation » ne montrerait que des faits favorables et ne
      // dirait jamais ce qu'elle sait dire.
      {
        consultant: 'Yanis Berthier',
        correspondence: 84,
        pushable: 71,
        availability: 45,
        rate: 75,
        sector: 0,
        mustHave: { covered: ['Kubernetes'], missing: ['Terraform'] },
      },
    ],
  },

  /**
   * LES CONCURRENTS DU PANEL — l'axe « concurrence » du verdict.
   *
   * ⚠️ Le semis d'analyse écrit déjà des partenaires sur ce compte, mais tous
   * en `relationship: 'unknown'` : ils prouvent que le panel a été REGARDÉ, et
   * c'est déjà la moitié qui compte (« regardé et vide » n'est pas « jamais
   * regardé »). Il en faut néanmoins des NOMMÉMENT concurrents, sans quoi
   * l'axe sortirait toujours au vert et la salle ne montrerait jamais l'état
   * qu'un commercial rencontre neuf fois sur dix.
   */
  competitors: [
    { name: 'Prestataire historique du socle', scope: 'TMA des applications temps réel' },
    { name: 'Intégrateur du programme de refonte', scope: 'Refonte du portail' },
  ],

  /**
   * LES CONTACTS DE L'AFFAIRE — l'axe « accès » du verdict.
   *
   * ⚠️ AUCUN n'a le rôle `decideur`, et c'est délibéré : c'est très exactement
   * l'état de la maquette (« rang connu · décideur manquant »), et c'est une
   * ATTENTION MESURÉE, pas un axe vide. La distinction est tout le sujet — on
   * SAIT qu'il manque un décideur, ce qui n'est pas la même chose que ne rien
   * savoir des contacts. Un seul `decideur` ici ferait disparaître de la salle
   * la nuance que l'écran a été construit pour montrer.
   */
  projectContactRoles: ['sponsor', 'prescripteur', 'acheteur', 'utilisateur'] as const,

  /**
   * Huit missions, et c'est délibéré : elles montrent les états que les écrans
   * doivent savoir distinguer. Une vue qui n'afficherait que des lignes prêtes
   * ne dirait pas à quoi elle sert.
   *
   *  - une RÉGIE au relevé validé → prête à facturer ;
   *  - une régie SANS relevé et sans date de fin → bloquée, et l'écran dit
   *    pourquoi ;
   *  - un FORFAIT → qui ne réclame aucun relevé, l'état qu'on oublie toujours
   *    de montrer et qui fait croire à un bug quand il apparaît en clientèle ;
   *  - une régie QUI SE TERMINE dans moins d'un mois → la fin d'affectation
   *    qu'il faut préparer ;
   *  - une mission TERMINÉE il y a plus de deux mois → l'après, que le jeu de
   *    données ne montrait nulle part ;
   *  - une régie au relevé REJETÉ, motif à l'appui → le relevé qu'un humain
   *    vient de renvoyer à son auteur ;
   *  - une régie au relevé rejeté PUIS REDÉPOSÉ → la trace qui SURVIT à la
   *    correction, et sans laquelle la moitié de la fonctionnalité reste
   *    invisible en démonstration ;
   *  - une régie INTERROMPUE avant son terme (`terminated`) → l'état que la
   *    salle ne montrait nulle part, et la TROISIÈME mission de Yanis Berthier
   *    chez le même client : c'est elle qui fait enfin dire « placé 3 fois » au
   *    vivier. Sa raison complète est écrite en face d'elle.
   *
   * ────────────────────────────────────────────────────────────────────────
   * LES DEUX DERNIÈRES : POURQUOI DEUX LIGNES, ET PAS UNE
   * ────────────────────────────────────────────────────────────────────────
   * Rejeter un relevé ne le supprime pas — il repart vers son auteur, qui le
   * corrige et le redépose, et le MOTIF reste lisible après le redépôt. L'écran
   * lit cette différence sur le STATUT : `rejected` écrit « rejeté le … »,
   * n'importe quel autre statut avec une trace écrit « rejeté le …, puis
   * redéposé » (`TimesheetsPage.tsx`). Une seule ligne rejetée ne montrerait
   * donc que la première moitié, et un prospect en conclurait que corriger
   * efface le motif — l'inverse de ce que le produit fait.
   *
   * ⚠️ Les DEUX relevés tombent PILE sur les jours attendus, à dessein. L'écart
   * ne dit rien du rejet : un relevé peut être juste au jour près et être
   * renvoyé parce que les jours sont mal IMPUTÉS. En leur donnant un écart, on
   * ne saurait plus si la ligne bloque parce qu'elle a été refusée ou parce
   * qu'il manque des jours — c'est-à-dire qu'on ne verrait pas la seule chose
   * que `blocksInvoicing: status === 'rejected' || …` a été écrit pour tenir.
   *
   * ⚠️ Les motifs ne nomment AUCUN mois. Le mois du relevé est calculé au seed
   * (le mois PRÉCÉDENT), il change donc à chaque visite : « trois jours de juin
   * imputés à juillet » serait faux onze mois sur douze devant un prospect.
   *
   * ────────────────────────────────────────────────────────────────────────
   * LES DEUX DERNIÈRES SONT CE QUI REND TROIS BULLES DE LAURA VISIBLES
   * ────────────────────────────────────────────────────────────────────────
   * Elles ne sont pas fabriquées POUR les bulles — ce serait mettre la garde
   * avant la règle. Elles comblent un trou du jeu de données que trois écrans
   * montraient déjà : le vivier annonçait « fin de mission connue au 30 du mois
   * prochain » sur Salomé Dufour et « disponible immédiatement » sur Camille
   * Roussel alors qu'AUCUNE affectation ne le confirmait, et l'onglet des
   * missions n'avait jamais rien fini. Trois détections de Laura s'en nourrissent
   * au passage, chacune sur la mesure qui parle de SON sujet :
   *
   *  - `consultant_free_soon` — toutes les affectations en cours d'une personne
   *    finissent sous 30 jours, aucune n'est sans fin, et un besoin reste ouvert.
   *    C'est Salomé Dufour, dont la fiche l'annonçait déjà.
   *  - `long_bench` — aucune affectation en cours, aucune sans fin, la dernière
   *    terminée il y a plus de 30 jours. C'est Camille Roussel, et le besoin
   *    ouvert du jeu (« Architecte de plateforme ») est justement celui où elle
   *    arrive en tête : la bulle mène quelque part.
   *  - `mission_ended_without_feedback` — mission terminée depuis plus de deux
   *    semaines sans `rex_entries`. C'est la même mission terminée, et c'est ce
   *    qui rend enfin VRAIE la raison écrite en face de `rex_entries` dans
   *    `demo-coverage.ts` (« le bloc REX en attente se remplit tout seul depuis
   *    les missions terminées du client d'exemple »), qui promettait jusqu'ici
   *    quelque chose que les données ne tenaient pas.
   *
   * ⚠️ Le plafond de proactivité tient : un visiteur en verra UNE, deux s'il
   * reste plus de vingt minutes. Voir `DEMO_LAURA_BUBBLES_REACHABLE`.
   */
  missions: [
    {
      label: 'Fiabilisation plateforme — renfort exploitation',
      /** #2195.22 à .29 — PARITÉ DÉMO du statut de renouvellement.
       *  À J-55, rien n'est engagé — et c'est le constat qu'un commercial POSE,
       *  pas l'absence de constat. C'est la ligne qui fait la démonstration de la
       *  différence entre `non_engage` et « non renseigné ». */
      renewal_status: 'non_engage' as const,
      /**
       * #2989.2 — PARITÉ DÉMO du badge de surallocation (« Suralloué · N % »).
       *
       * Yanis Berthier porte CETTE mission ET « Refonte du portail
       * fournisseurs — forfait » (plus bas), toutes deux `active` et actives
       * EN MÊME TEMPS aujourd'hui (J-24 → J+55 ici, J-40 → J+12 pour l'autre).
       * Chaque affectation entre à `load_percent: 100` dans le semis
       * (`demo-seed.service.ts`, `INSERT INTO mission_assignments`) : le cumul
       * de Yanis Berthier est donc de 200 % PAR CONSTRUCTION, sans qu'aucune
       * valeur n'ait été ajoutée pour cette seule démonstration. C'est ce
       * couple qui rend le badge visible en démo — `demo-planning-coverage.spec.ts`
       * le vérifie plutôt que de le supposer.
       */
      consultant: 'Yanis Berthier',
      status: 'active' as const,
      started_days_ago: 24,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 24,
      /**
       * #2195.2 — J-60 EN DÉMONSTRATION, et c'est la raison du nombre.
       *
       * Elle finissait à SOIXANTE-HUIT jours, c'est-à-dire dans `far` : une
       * fenêtre que `GET /delivery/renewals` ne sert PAS. L'écran de décision
       * de renouvellement ouvrait donc sa pastille « Sous 60 jours » à zéro
       * devant un prospect, et rien ne disait si c'était une bonne nouvelle ou
       * une salle amputée. Cinquante-cinq la place DANS la fenêtre, et reste
       * au-dessus des trente jours que lit `consultantsFreeingSoon` — Yanis
       * Berthier ne bascule donc pas en « se libère bientôt ».
       */
      ends_in_days: 55,
      daily_rate: 620,
      /** Coût chargé : saisi à la main, jamais deviné (arbitrage n°5). */
      loaded_daily_cost_cents: 430_00,
      /**
       * Le CANAL, saisi comme en clientèle. QUATRE canaux différents sur les
       * dix missions — direct, partenaire, portage, et le canal non renseigné :
       * la vue « marge par canal » n'a d'intérêt que si elle montre un ÉCART, et
       * une démo où tout est « direct » afficherait une seule ligne chiffrée —
       * c'est-à-dire l'écran vide qu'on découvre en réunion.
       *
       * ⚠️ `subcontracting` reste le seul des cinq qu'aucune mission ne porte, et
       * c'est assumé : la salle montre déjà DEUX canaux intermédiés chiffrés
       * (partenaire et portage), qui font la même démonstration. Une cinquième
       * ligne n'ajouterait qu'une ligne.
       */
      channel: 'direct' as const,
      /**
       * Le client EXIGE un bon de commande, et il est là.
       *
       * C'est le cas « exigence satisfaite » : le drapeau est levé et la ligne
       * reste prête à facturer. Sans lui, la démonstration ne montrerait que le
       * cas où le bon manque, et un prospect conclurait que cocher la case
       * bloque la facturation.
       *
       * ⚠️ La colonne était LUE (`assessInvoiceReadiness` en tire le bloqueur
       * `missing_po`) et écrite NULLE PART jusqu'au 29/08/2026 : elle valait
       * `false` chez tous les clients, donc le bloqueur ne se déclenchait nulle
       * part. Le semis ne peut la remplir que depuis que le produit sait
       * l'écrire — l'inverse serait une salle de démonstration qui montre une
       * capacité qu'aucun client ne peut utiliser.
       */
      requires_po: true,
      /** Pas d'intermédiaire sur une mission directe : `null`, jamais 0 — zéro
       *  dirait « le partenaire ne prend rien », ce qui suppose un partenaire. */
      partner_commission_daily_cents: null as number | null,
      po_number: 'PO-2026-0418',
      /**
       * LA DATE, LE MONTANT ET LE VOLUME DU BON DE COMMANDE (30/08/2026).
       *
       * C'est la mission qui montre la BARRE DE CONSOMMATION — les trois
       * colonnes ajoutées par ce lot étaient lues nulle part en démonstration
       * jusqu'ici, donc l'onglet « Conditions commerciales » n'aurait jamais
       * montré autre chose que « Volume non renseigné », sur les DIX
       * missions de la salle.
       *
       * Trente jours au tarif de la mission (620 €), soit 18 600 € — un
       * montant qui se lit comme un bon de commande, pas comme un chiffre
       * rond arbitraire. Le relevé de la mission porte déjà 18 jours
       * VALIDÉS (voir plus bas) : la barre s'affiche donc à 60 %, il reste
       * douze jours — ni un bon tout juste ouvert ni un bon sur le point
       * d'être dépassé, l'état le plus fréquent en clientèle.
       */
      po_issued_on_days_ago: 29,
      po_amount_cents: 1_860_000,
      po_volume_days: 30,
      billing_cadence: 'monthly',
      notice_days: 30,
      /**
       * LES CONDITIONS DE RÈGLEMENT (30/08/2026, panneau latéral de
       * planification, PDF-22 §7) — « à 60 jours fin de mois », l'exemple
       * même de la fiche de lecture. Seule mission de la salle à les porter :
       * les huit autres montrent l'état « non renseigné » que le produit sait
       * déjà afficher, et celle-ci montre ce que ce lot ajoute par-dessus.
       */
      payment_terms_days: 60,
      payment_terms_basis: 'end_of_month' as const,
      /**
       * #2420 — LE MOTEUR DE MARGE : une mission SALARIÉE au coût IMPORTÉ, avec
       * une allocation interne configurée. C'est la mission qui montre les
       * TROIS niveaux — commerciale, brute (ses frais et sa facture fournisseur
       * amortis), et la contribution, qui n'est jamais un résultat net.
       */
      cost_source: 'employee' as const,
      currency: 'EUR',
      cost_breakdown: { employeeCostOrigin: 'imported' as const, internalAllocationDailyCents: 25_00 },
      cost_recorded_rate_cents: 620_00 as number | null,
      contract_kind: 'regie' as const,
      role_title: 'Ingénieur d’exploitation',
      /**
       * QUI SIGNE — le contact de facturation, par son nom.
       *
       * Le semis le résout en `billing_contact_id` sur la table des contacts
       * qu'il vient d'écrire (`demo-seed.service.ts`), et un nom qui ne
       * résoudrait pas est DIT dans le journal du semis plutôt qu'écrit `null`
       * en silence — c'est ce silence-là qui avait laissé sept missions sans
       * personne d'affecté.
       *
       * ⚠️ Toutes les missions ne portent PAS de contact, et c'est la moitié
       * qui fait la démonstration : `assessInvoiceReadiness` pousse
       * `missing_billing_contact` sur celles qui n'en ont pas. Les remplir
       * toutes ferait disparaître de la salle un bloqueur que le produit
       * affiche, et un prospect ne verrait jamais l'écran qui le lui demande.
       *
       * Celle-ci est l'une des deux « prêtes à facturer » : sans contact, elle
       * portait ce bloqueur et l'écran n'avait rien de prêt à montrer.
       */
      billing_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      /**
       * CELUI QUI VALIDE LE RELEVÉ (30/08/2026) — le troisième des trois
       * contacts du panneau latéral, et « le plus manquant » de l'écran
       * (PDF-22 §7). Même personne que le contact de facturation : c'est un
       * cas réel et le plus simple à démontrer, pas une règle du produit — les
       * deux rôles restent deux colonnes distinctes en base.
       */
      cra_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      /** Relevé validé, jamais rejeté → la ligne est PRÊTE. */
      timesheet: {
        days: 18,
        status: 'validated' as const,
        expected_days: 18,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
      },
      /**
       * Les FRAIS (30/08/2026) — la seule mission de la salle à en porter, à
       * dessein : les huit autres montrent l'état le plus fréquent, « marge
       * hors frais », et celle-ci montre ce que ce lot ajoute par-dessus.
       *
       * Deux lignes, 500 € au total, sur une mission démarrée il y a 24 jours :
       * amorties, elles pèsent 500 00 / 24 ≈ 21 €/jour, qui viennent réduire la
       * marge journalière de 190 € (620 − 430) affichée par ailleurs — de quoi
       * rendre visible que « marge » et « marge nette des frais » sont deux
       * chiffres distincts sur la MÊME mission.
       */
      /**
       * Les AVENANTS (#2783, 02/10/2026) — un accepté, un simulé, tous deux à
       * effet dans l'horizon du prévisionnel (`effective_in_days` > 0).
       * `new_term` reste un JSON libre : le prévisionnel les COMPTE, jamais ne
       * les chiffre.
       */
      amendments: [
        {
          event_type: 'daily_rate_change' as const,
          status: 'accepted' as const,
          effective_in_days: 21,
          proof: 'Avenant n°1 signé par le client — revalorisation du TJM',
          previous_term: { daily_rate: 620 },
          new_term: { daily_rate: 650 },
          note: 'Revalorisation annuelle convenue au dernier comité de pilotage.',
        },
        {
          event_type: 'end_date_change' as const,
          status: 'proposed' as const,
          effective_in_days: 60,
          proof: 'Échange e-mail du client demandant une prolongation de deux mois',
          previous_term: null,
          new_term: { extension_months: 2 },
          note: 'Prolongation à confirmer par bon de commande.',
        },
      ],
      expenses: [
        { label: 'Billets de train — déplacement client', amount_cents: 180_00, days_ago: 20 },
        { label: 'Nuit d’hôtel — astreinte sur site', amount_cents: 320_00, days_ago: 6 },
      ],
      /**
       * Les FACTURES FOURNISSEUR (30/08/2026) — la même mission que les frais,
       * à dessein : elle montre les DEUX sources de coût ajoutées par ce lot,
       * amorties ENSEMBLE dans la même marge nette. `status: 'pending'` — reçue,
       * pas encore vérifiée, le cas le plus fréquent d'une facture qui vient
       * d'arriver.
       */
      supplier_invoices: [
        { reference: 'FA-2026-0512', amount_cents: 900_00, days_ago: 12, status: 'pending' as const },
      ],
      /**
       * LE PAIEMENT SORTANT (31/08/2026) — l'état DOMINANT de la maquette, et
       * la seule ligne que « Relancer les paiements » peut toucher.
       *
       * `valide` et EN RETARD : le relevé est validé par le client (juste
       * au-dessus), la facture du sous-traitant existe (juste au-dessus aussi),
       * quelqu'un a assumé le paiement — et la date prévue est passée. Sans
       * cette ligne, le bouton de relance en masse s'ouvrirait DÉSACTIVÉ devant
       * un prospect, et la capacité entière serait invisible.
       *
       * ⚠️ Aucune coordonnée bancaire ici, comme partout : la salle montre le
       * SUIVI d'un paiement, jamais son déclenchement.
       */
      outgoing_payment: {
        status: 'valide' as OutgoingPaymentStatus,
        /** Le dû vient de la facture ci-dessus, jamais de `jours × TJM`. */
        amount_cents: 900_00,
        settled_amount_cents: null as number | null,
        scheduled_days_ago: 9,
        paid_days_ago: null as number | null,
        reminders_sent: 1,
        rejection_reason: null as string | null,
      },
    },
    {
      label: 'Cadrage données transport — lot 2',
      /**
       * #2195.22 à .29 — AUCUN `renewal_status`, ET C'EST LA DÉMONSTRATION.
       *
       * `null` n'est pas `non_engage`. Cette ligne dit « personne n'a encore
       * ouvert ce renouvellement » ; celle de Yanis Berthier, juste au-dessus,
       * dit « quelqu'un l'a ouvert et a constaté que rien n'était engagé ».
       * L'écran les rend différemment, et une salle où toutes les lignes
       * portent un statut n'aurait jamais montré la différence — c'est-à-dire
       * aurait montré « non mesuré » rendu comme un constat.
       */
      consultant: 'Inès Kaczmarek',
      status: 'active' as const,
      started_days_ago: 52,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 52,
      /**
       * Sans date de fin, volontairement : c'est le cas que le produit refuse
       * d'alerter (on n'invente pas une échéance) et il doit se voir en démo.
       */
      ends_in_days: null,
      daily_rate: 560,
      loaded_daily_cost_cents: null,
      // Sans coût chargé : sa marge est NON MESURABLE, et elle est comptée à
      // part sur sa ligne de canal plutôt qu'absorbée.
      channel: 'partner' as const,
      /**
       * Le bon de commande est EXIGÉ et il MANQUE — le seul endroit du jeu où
       * le bloqueur `missing_po` se déclenche.
       *
       * Elle portait déjà deux bloqueurs (relevé absent, contact de facturation
       * inconnu) : c'est ce CUMUL que l'écran affiche en clientèle, et ajouter
       * le troisième ne change pas son état — elle était bloquée, elle le
       * reste. Le poser sur une des deux missions « prêtes » aurait vidé
       * l'écran « Prêt à facturer » de la salle.
       */
      requires_po: true,
      /**
       * Commission INCONNUE sur un canal intermédié — et c'est un cas à part
       * entière : `trueDailyCostCents` rend alors `null` plutôt que de faire
       * passer l'intermédiaire pour gratuit. Elle reste donc dans la colonne
       * « non mesurées » de sa ligne de canal, à côté de la mission `partner`
       * qui, elle, est chiffrée.
       */
      partner_commission_daily_cents: null as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: null,
      contract_kind: 'regie' as const,
      role_title: 'Data engineer',
      /** Sans contact de facturation : elle porte donc DEUX bloqueurs, le
       *  relevé manquant et le contact inconnu. C'est ce cumul que l'écran
       *  affiche en clientèle, et il n'existait nulle part en démonstration. */
      billing_contact: null as string | null,
      /** Aucun relevé → BLOQUÉE, et l'écran dit pourquoi. */
      timesheet: null,
    },
    {
      label: 'Refonte des applications voyageurs — forfait',
      /** #2195.22 à .29 — PARITÉ DÉMO du statut de renouvellement.
       *  #2195.25 — LA LIGNE QUI PORTE LA DÉCISION DU 16/09/2026. Le client a
       *  ANNONCÉ qu'il reconduit : un fait, daté, vérifiable. L'issue demandait ici
       *  « Renouvellement probable » ; ce libellé aurait mis un pronostic sous les
       *  yeux d'un prospect, sur l'écran même où la doctrine l'interdit. */
      renewal_status: 'reconduction_annoncee' as const,
      consultant: 'Yanis Berthier',
      status: 'active' as const,
      started_days_ago: 40,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 12,
      /**
       * #2195.5 — J-15 EN DÉMONSTRATION.
       *
       * Cent vingt jours la rangeaient dans `far`, invisible de l'écran de
       * décision. Douze la placent dans la quinzaine — la fenêtre où une
       * proposition de reconduction doit déjà être écrite.
       *
       * ⚠️ Yanis Berthier porte AUSSI « Fiabilisation plateforme », qui finit
       * à cinquante-cinq jours : `consultantsFreeingSoon` lit le MAXIMUM de
       * ses affectations en cours, donc cinquante-cinq, et il reste hors de
       * « se libère bientôt ». La bulle continue de désigner Salomé seule.
       */
      ends_in_days: 12,
      /**
       * Un forfait n'a NI TJM NI relevé : il se facture aux jalons. C'est
       * l'état que le produit doit savoir montrer sans le confondre avec une
       * fiche mal remplie — sinon il réclame un relevé pour toujours.
       */
      daily_rate: null,
      loaded_daily_cost_cents: null,
      // Un forfait au canal NON RENSEIGNÉ : c'est la troisième ligne de la vue,
      // celle qu'on ne doit jamais ranger avec le direct.
      channel: 'unknown' as const,
      /** Bon de commande NON exigé, alors qu'un numéro est renseigné : les deux
       *  champs sont indépendants, et une salle où « exigé » suivrait « présent »
       *  laisserait croire que le produit le déduit. */
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      /** #2420 — le FORFAIT : temps équipe, sous-traitance, budget consommé et
       *  reste à faire. La projection à terminaison est une ESTIMATION : l'état
       *  affiché est « partielle », jamais « mesurée ». */
      cost_source: 'fixed_price' as const,
      currency: 'EUR',
      cost_breakdown: {
        fixedPriceTeamTimeCostCents: 1_650_000,
        fixedPriceSubcontractingCostCents: 300_000,
        fixedPriceBudgetConsumedCents: 1_200_000,
        fixedPriceRemainingWorkCents: 900_000,
      },
      po_number: 'PO-2026-0512',
      /**
       * Le bon de commande est CONNU — date, montant, volume — et la
       * consommation reste NON MESURABLE quand même : un forfait n'a pas de
       * relevé (`timesheet: null` plus bas), donc `mission_timesheets` ne
       * porte aucune ligne pour cette mission. `PoConsumptionBlock` doit
       * écrire « Consommation non mesurée », jamais « 0 % consommé » — c'est
       * l'état que cette mission existe pour montrer, distinct du volume
       * NON renseigné que porte une autre ligne de la salle.
       */
      po_issued_on_days_ago: 46,
      po_amount_cents: 2_700_000,
      po_volume_days: 45,
      /**
       * ⚠️ « milestone » et non « monthly » depuis le 30/08/2026 — LA LENTILLE
       * « PRÊT À FACTURER » exigeait un `not_due` quelque part dans la salle, et
       * `assessInvoiceReadiness` ne le rend QUE pour une cadence explicitement
       * `milestone` ou `fixed_price` (`invoice-readiness.ts`). Le commentaire
       * juste en dessous affirmait déjà « l'état de facturation mensuel ne se
       * pose pas » — c'était l'INTENTION depuis l'origine de ce lot, jamais
       * tenue : avec `monthly`, cette mission tombait `blocked`
       * (`missing_cost` + `missing_billing_contact`), masquant le seul cas que
       * la colonne « Prêt à facturer » ne pouvait montrer nulle part ailleurs.
       * Recompté par `demo-account-invoice-readiness-coverage.spec.ts`.
       */
      billing_cadence: 'milestone',
      notice_days: 60,
      contract_kind: 'forfait' as const,
      role_title: null,
      /** Un forfait se facture aux jalons : l'état de facturation mensuel ne se
       *  pose pas (`not_due`). Lui poser un contact ne montrerait rien de plus,
       *  et le laisser vide garde une ligne où le champ reste à remplir. */
      billing_contact: null as string | null,
      // #2587 — zéro ligne n'est pas zéro risque. Cette mission n'a NI relevé
      // (`timesheet: null` ci-dessus) NI ligne `invoice_readiness` (absente de
      // `DEMO_DELIVERY_CLIENT.invoices` plus bas) : c'est la mission de la
      // salle dont l'onglet « Risque & opportunité » montre les axes « Relevés
      // d'activité » et « Paiement » à « non mesuré », jamais à 0. Lui ajouter
      // un relevé ou une facture retirerait cette démonstration — vérifier
      // `mission-scores-axis-without-data.spec.ts` avant d'y toucher.
      timesheet: null,
    },
    {
      /**
       * La mission qui SE TERMINE — vingt-huit jours, exactement ce que la
       * fiche de Salomé Dufour annonce déjà (« sous_1_mois », note « fin de
       * mission connue au 30 du mois prochain »). Sans elle, le vivier
       * affirmait une libération que rien en base ne confirmait : c'est le
       * segment « à revalider » du pool de talents qui le disait, et il avait
       * raison.
       *
       * Le sujet est le sien — elle a industrialisé un modèle de maintenance
       * prédictive chez un opérateur de transport, et ce client fictif exploite
       * une flotte. Son refus sur l'autre lot (« le client cherchait un profil
       * déjà passé par de l'exploitation à fort trafic ») porte sur un poste
       * d'exploitation, pas sur celui-ci.
       */
      label: 'Industrialisation d’un cas d’usage de recherche — mise en production',
      /** #2195.22 à .29 — PARITÉ DÉMO du statut de renouvellement.
       *  #2195.32 — un retour a été demandé et il est RETENU : devant un prospect,
       *  le bouton « Demander un feedback » est donc désactivé sur cette ligne et
       *  actif sur les autres. Une capacité qu'on ne voit qu'en la re-cliquant ne
       *  se démontre pas. */
      renewal_status: 'feedback_demande' as const,
      consultant: 'Salomé Dufour',
      status: 'active' as const,
      started_days_ago: 118,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 3,
      /** Vingt-huit jours : sous les trente que lit `consultantsFreeingSoon`. */
      ends_in_days: 28,
      daily_rate: 580,
      loaded_daily_cost_cents: 405_00,
      channel: 'direct' as const,
      /** Exigé et fourni, comme la première : c'est le cas majoritaire en
       *  clientèle, et les deux missions « prêtes » de la salle doivent le
       *  rester. */
      requires_po: true,
      partner_commission_daily_cents: null as number | null,
      po_number: 'PO-2026-0331',
      /**
       * VOLUME NON RENSEIGNÉ, À DESSEIN (30/08/2026) — ni `po_issued_on_days_ago`
       * ni `po_amount_cents` ni `po_volume_days` : le numéro du bon de
       * commande est connu, rien d'autre ne l'est encore. C'est l'état le
       * PLUS fréquent en clientèle au tout début d'un contrat — quelqu'un a
       * noté la référence en réunion, personne n'a encore ressaisi le
       * montant ni le volume — et sans une ligne comme celle-ci, la salle
       * n'aurait montré que des bons de commande déjà complets.
       *
       * `PoConsumptionBlock` doit écrire « Volume non renseigné » ici,
       * JAMAIS une barre à 0 % : le manque est nommé avec le geste pour le
       * combler, pas confondu avec « rien n'a été consommé ». Vrai même si
       * cette mission porte par ailleurs un relevé validé (vingt jours) :
       * la barre exige les DEUX termes, quel que soit ce que dit le relevé.
       */
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Ingénieure données',
      /** La SECONDE « prête à facturer », et le second point du compteur de
       *  Directeur technique — entité numérique voyageurs : c'est lui qui fait passer le badge à « a signé 2
       *  missions » — un compteur qui vaudrait un partout ne compterait rien. */
      billing_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      /**
       * Un relevé validé qui NE COLLE PAS aux jours attendus, avec son
       * explication. C'est le seul endroit du jeu où l'écart se voit : le
       * relevé de la première mission tombe pile, donc la colonne « écart » et
       * le champ d'explication restaient vides en démonstration alors que le
       * produit les lit.
       */
      timesheet: {
        days: 20,
        status: 'validated' as const,
        expected_days: 21,
        gap_explanation: 'Un jour de congé posé le 14, accepté par le client.',
        rejected_days_ago: null,
        rejection_reason: null,
      },
      /**
       * LA MISSION QUI DÉRAPE — PDF 5 §7.2, et la parité démo du détecteur.
       *
       * ⚠️ Un relevé UNIQUE ne montre rien : la règle d'honnêteté exige « deux
       * signaux minimum, sur trois mois minimum ». Sans cet historique, toutes
       * les missions de la salle seraient « qu'on ne sait pas lire » — vrai, et
       * un prospect ne verrait jamais l'alerte elle-même.
       *
       * Ce que ces trois mois font voir, et c'est exactement le message du §7.2
       * (« trois mois d'écart négatif : −2, −4, −6 jours ») :
       *
       *  1. **écart de jours croissant** — 19/21, 18/21, 17/21 puis 20/21 sur le
       *     mois courant : QUATRE mois consécutifs sous la charge attendue.
       *     Aucun n'est catastrophique seul ; c'est la suite qui l'est, et
       *     c'est ce qu'aucun écran ne montrait ;
       *  2. **validation client de plus en plus lente** — le client met environ
       *     3 jours, puis 12, puis 22 à valider après la clôture du mois. Les
       *     écarts sont larges à dessein : la longueur d'un mois varie de trois
       *     jours dans l'année, et deux paliers serrés se croiseraient au
       *     printemps sans que personne ne comprenne pourquoi la salle a changé.
       *
       * ⚠️ Le signal « jours contestés » ne pouvait PAS servir ici, et le refus
       * est déjà écrit dans `demo-coverage.ts` : `disputed` est un état que le
       * code LIT mais qu'AUCUN geste du produit n'écrit. En semer un montrerait
       * à un prospect un état qu'il ne pourra atteindre par aucun clic — et
       * deux entrées du même fichier se contrediraient.
       *
       * Deux signaux, trois mois : l'alerte se déclenche. Les deux signaux
       * aveugles de ce dépôt (délai de remise, satisfaction) s'affichent « non
       * mesurés » — la salle montre donc AUSSI l'honnêteté du détecteur, qui
       * est la moitié de ce qu'on vend.
       *
       * ⚠️ L'historique commence à `months_ago: 2` et jamais 1 : le relevé
       * COURANT de cette mission occupe déjà le mois précédent, et
       * `mission_timesheets` est unique par (mission, mois, consultant). Les
       * superposer ferait taire silencieusement une des deux lignes.
       */
      driftHistory: [
        { months_ago: 4, days: 19, expected_days: 21, status: 'validated' as const, validated_days_ago: 89 },
        { months_ago: 3, days: 18, expected_days: 21, status: 'validated' as const, validated_days_ago: 50 },
        { months_ago: 2, days: 17, expected_days: 21, status: 'validated' as const, validated_days_ago: 9 },
      ],
      /**
       * La facture ENTRANTE qui JUSTIFIE le paiement sortant ci-dessous
       * (31/08/2026).
       *
       * ⚠️ Elle est ajoutée parce qu'elle est NÉCESSAIRE, pas pour enrichir la
       * salle : sans elle, cette ligne s'afficherait « en attente validation »
       * à côté de « aucune facture ne chiffre encore ce paiement » — un état
       * que le produit REFUSE de créer (`OutgoingPaymentsService.generate`
       * exige la facture), donc une salle qui montrerait une donnée que le
       * code ne peut pas produire.
       *
       * Elle rend au passage `marginWithExpenses` distinct de `margin` sur une
       * SECONDE mission. Six des neuf restent sans aucune source de coût
       * ajoutée : l'état le plus fréquent en clientèle reste visible.
       */
      supplier_invoices: [
        { reference: 'FA-2026-0530', amount_cents: 1_240_00, days_ago: 9, status: 'validated' as const },
      ],
      /**
       * LE PAIEMENT SORTANT (31/08/2026) — l'état « en attente validation »,
       * celui que la maquette Finance compte à 29.
       *
       * Le relevé est validé, la facture est là, personne ne l'a encore assumé.
       * C'est le seau « À valider », et c'est la ligne dont l'action suivante
       * est un vrai bouton.
       */
      outgoing_payment: {
        status: 'a_valider' as OutgoingPaymentStatus,
        amount_cents: 1_240_00,
        settled_amount_cents: null as number | null,
        scheduled_days_ago: null as number | null,
        paid_days_ago: null as number | null,
        reminders_sent: 0,
        rejection_reason: null as string | null,
      },
      /**
       * LE DOSSIER D'ADMINISTRATION DES VENTES — COMPLET (31/08/2026).
       *
       * Cette mission finit dans vingt-huit jours : elle est donc TOUJOURS dans
       * la file ADV, quel que soit le jour où la démonstration s'ouvre (fenêtre
       * de renouvellement J-30). C'est ce qui garantit que l'écran n'est jamais
       * vide — un semis daté « ce mois-ci » serait hors du mois courant un jour
       * sur deux.
       *
       * Elle est le SEUL dossier complet des trois seedés, et c'est délibéré :
       * sans lui, l'écran ne montrerait que des lignes rouges et un prospect
       * conclurait que le produit ne sait rien clôturer.
       *
       * ⚠️ `payment_details_transmitted_days_ago` porte une DATE, pas un
       * numéro. Bellum ne stocke aucun moyen de paiement — voir
       * `mission_adv_records` et son commentaire de table.
       */
      adv: {
        client_billing_reference: 'REF-FOURN-2026-0114',
        payment_terms_days: 45,
        payment_details_transmitted_days_ago: 22,
        /** L'entité de facturation, DÉSIGNÉE par son nom — le semis le résout
         *  sur `account_entities`, comme il le fait déjà pour le contact. */
        client_entity: 'SNCF Voyageurs' as string | null,
      },
    },
    {
      /**
       * La mission TERMINÉE, et le seul endroit du jeu où l'après-mission
       * existe.
       *
       * Soixante-seize jours, pas quinze : au-delà de soixante-deux jours, la
       * date de fin est forcément antérieure au premier jour du mois précédent
       * QUELLE QUE SOIT la date du jour — c'est la borne que « Prêt à
       * facturer » applique (`m.ends_on >= $2::date`). En dessous, la ligne
       * réapparaîtrait certains jours du mois dans une vue de facturation où
       * elle n'a plus rien à faire, et un mois sur deux la démonstration
       * montrerait un bloqueur qui n'en est pas un.
       *
       * Elle porte donc AUSSI l'intercontrat de Camille Roussel — sa fiche dit
       * « disponible immédiatement, confirmée cette semaine », et c'est
       * maintenant vérifiable : sa dernière affectation s'est arrêtée là.
       */
      label: 'Migration du socle applicatif vers les conteneurs — lot 1',
      consultant: 'Camille Roussel',
      status: 'ended' as const,
      started_days_ago: 256,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 70,
      /**
       * ⚠️ NÉGATIF = la mission est DÉJÀ finie. Le seed calcule
       * `dateOnly(-ends_in_days)`, donc une valeur négative rend une date
       * PASSÉE — ici il y a soixante-seize jours.
       */
      ends_in_days: -76,
      daily_rate: 640,
      loaded_daily_cost_cents: 440_00,
      channel: 'direct' as const,
      /** Un contrat plus ancien, sans exigence de bon de commande : toutes les
       *  missions d'un même client ne se facturent pas sous le même régime, et
       *  c'est justement pourquoi le drapeau vit sur la MISSION. */
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      po_number: 'PO-2025-0912',
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Architecte de plateforme',
      /** Terminée : elle est hors de la fenêtre de facturation, et lui poser un
       *  contact n'ajouterait rien à ce que l'après-mission sert à montrer. */
      billing_contact: null as string | null,
      /**
       * Aucun relevé, et c'est exact : ceux de cette mission portent sur des
       * mois que l'écran « Prêt à facturer » ne regarde plus. En poser un sur
       * le mois précédent déclarerait des jours travaillés APRÈS la fin du
       * contrat — une donnée fausse, pas un écran mieux rempli.
       */
      timesheet: null,
    },
    {
      /**
       * Le relevé REJETÉ — celui qu'un humain vient de renvoyer à son auteur.
       *
       * Elle porte AUSSI la disponibilité d'Antoine Rivière : sa fiche annonce
       * « sous 3 mois, 82 jours » et rien en base ne le confirmait. Une mission
       * qui finit dans quatre-vingt-deux jours la rend vraie — même raison que
       * les deux missions ajoutées au-dessus pour Salomé Dufour et Camille
       * Roussel. Quatre-vingt-deux jours passent aussi largement les trente de
       * `consultantsFreeingSoon` : il ne bascule pas dans « se libère bientôt »,
       * et la bulle `consultant_free_soon` continue de désigner Salomé seule.
       *
       * Le sujet est le sien — sa référence est la convergence de deux systèmes
       * après acquisition, avec cartographie des interfaces et reprise de
       * données ; le client de livraison exploite des systèmes temps réel.
       */
      label: 'Convergence des applications temps réel — lots interfaces et reprise',
      /** #2195.22 à .29 — PARITÉ DÉMO du statut de renouvellement.
       *  La reconduction se discute : un échange est ouvert, rien n'est acté. C'est
       *  l'état le plus fréquent en clientèle, et il ne promet rien. */
      renewal_status: 'discussion_en_cours' as const,
      /**
       * #2413.49 à .57 (épopée #2965) — LE CAS À UN SEUL RAIL POSITIF.
       *
       * Le client a répondu ; le consultant n'a pas encore été interrogé
       * (`null`, jamais `non` — personne n'a posé la question). Elle prouve
       * que `canConfirmRenewal` refuse un « Renouvelé » ici tant que le
       * second rail n'a pas, lui aussi, répondu `oui` (#2413.57).
       */
      renewal_client_rail: {
        intent: 'oui' as const,
        scope: null,
        budget: null,
        process: 'Attend le retour du service achats',
        updatedAt: null,
        updatedBy: null,
      },
      consultant: 'Antoine Rivière',
      status: 'active' as const,
      /** Commencée bien avant le mois précédent : sinon la ligne n'apparaît pas. */
      started_days_ago: 95,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 8,
      /**
       * #2195.3 — J-45 EN DÉMONSTRATION.
       *
       * Quarante et un jours : dans la fenêtre J-45 née le 16/09/2026, et
       * toujours au-dessus des trente que lit `consultantsFreeingSoon` — ce
       * que le commentaire ci-dessus exige explicitement pour Antoine
       * Rivière.
       */
      ends_in_days: 41,
      daily_rate: 780,
      loaded_daily_cost_cents: 545_00,
      /**
       * LA SEULE MISSION INTERMÉDIÉE ET CHIFFRÉE — et sans elle, le « coût de
       * l'intermédiation » reste `null` en démonstration.
       *
       * L'écart entre le direct et le passage par un intermédiaire est
       * « l'indicateur le plus stratégique » du PDF 8 §5.3 : c'est lui qui
       * justifie ou non un chantier de référencement. Il se calcule sur la
       * ligne `direct` MOINS la ligne `partner`, et il rend `null` dès qu'un
       * des deux manque. La salle ne portait qu'une mission `partner`, sans
       * coût chargé et sans relevé : la ligne `partner` valait donc « non
       * mesurée », et la tuile disait pour toujours qu'elle ne savait pas —
       * exactement l'écran livré-mais-vide qu'on découvre en réunion.
       *
       * Le cas est celui que le contrat décrit lui-même : « un compte peut être
       * servi en direct ET via un intermédiaire, parfois la même année ». Cinq
       * missions du même client sont en direct, celle-ci passe par un
       * intermédiaire référencé.
       */
      channel: 'partner' as const,
      requires_po: true,
      /**
       * La commission de l'intermédiaire, 65 € par jour sur un TJM de 780 €.
       *
       * ⚠️ La colonne était LUE par `trueDailyCostCents` et écrite NULLE PART
       * jusqu'au 29/08/2026. Sans elle, le coût réel de cette mission est
       * INCONNU (et non le TJM d'achat : ce serait faire travailler
       * l'intermédiaire gratuitement), donc la ligne `partner` sortait du
       * calcul et l'écart avec le direct ne se chiffrait pas.
       */
      partner_commission_daily_cents: 65_00 as number | null,
      /** #2420 — le PARTENAIRE : prix d'achat, fee (la commission juste au-dessus)
       *  et part de la marge qui lui revient — la marge brute les retire tous. */
      cost_source: 'partner' as const,
      currency: 'EUR',
      cost_breakdown: { partnerPurchaseDailyCents: 545_00, partnerSplitPercent: 10 },
      cost_recorded_rate_cents: 780_00 as number | null,
      po_number: 'PO-2026-0574',
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Architecte d’intégration',
      /**
       * Signée par l'ACHETEUR, pas par la direction informatique — et c'est le
       * point de la seconde fiche : le compteur ne mesure pas la même chose
       * chez les deux, et une salle où tout serait signé par la même personne
       * ne le montrerait pas.
       *
       * ⚠️ Elle porte un contact ET reste BLOQUÉE, par son relevé rejeté :
       * « on sait qui signe » n'est pas « c'est prêt ». Sans une ligne comme
       * celle-ci, un prospect conclurait que renseigner le contact suffit.
       */
      billing_contact: seatName('Responsable des achats de prestations informatiques') as string | null,
      /**
       * PILE sur les jours attendus, et rejeté quand même : c'est tout
       * l'intérêt. L'écart ne dit rien du rejet, et sans une ligne comme
       * celle-ci « ce qui bloque » se confondrait avec « il manque des jours ».
       */
      timesheet: {
        days: 21,
        status: 'rejected' as const,
        expected_days: 21,
        gap_explanation: null,
        rejected_days_ago: 4,
        rejection_reason:
          'Les jours de reprise de données sont imputés au lot « interfaces » : le bon de commande impose une répartition par lot.',
        // #2415.7 — les cinq jours de reprise de données, exactement ceux que
        // le motif nomme : jamais les 21 jours du mois entier.
        contested_days: 5 as number | null,
      },
      /**
       * LE PAIEMENT REFUSÉ (31/08/2026) — et il est refusé pour la MÊME raison
       * que le relevé au-dessus, ce qui est tout l'intérêt de le poser ici.
       *
       * Un rejet porte TOUJOURS son motif : la contrainte SQL le tient, et
       * « refusé » sans rien d'autre ne se relit pas six mois plus tard, quand
       * le consultant demandera pourquoi il a été payé en retard. C'est le seul
       * état qui n'entre dans AUCUNE des quatre tuiles — il n'est ni sorti, ni
       * en attente de sortir — et la salle doit montrer cette ligne-là pour que
       * le compteur « hors de ces totaux » ait quelque chose à annoncer.
       *
       * Aucune facture rattachée, à dessein : un paiement peut être refusé
       * AVANT que la pièce n'arrive, et c'est même le cas le plus fréquent.
       */
      outgoing_payment: {
        status: 'rejete' as OutgoingPaymentStatus,
        amount_cents: null as number | null,
        settled_amount_cents: null as number | null,
        scheduled_days_ago: null as number | null,
        paid_days_ago: null as number | null,
        reminders_sent: 0,
        rejection_reason:
          'Le relevé a été renvoyé au consultant : la répartition par lot n’est pas celle du bon de commande. Le paiement repartira sur le relevé corrigé.' as
            string | null,
      },
    },
    {
      /**
       * L'ESCALADE (#2196.24, 17/09/2026) — le neuvième état du relevé, et le
       * seul qui restait sans ligne en démonstration : « le sujet remonte à un
       * humain » après trois relances sans retour.
       *
       * Une DEUXIÈME mission active pour Antoine Rivière, pas un cas nouveau —
       * Inès Kaczmarek et Yanis Berthier en portent déjà deux chacun ailleurs
       * dans ce même jeu de données, et rien n'y régresse. `ends_in_days: null`
       * la tient hors du calcul de `consultantsFreeingSoon` (qui lit le MAXIMUM
       * des échéances connues) : elle ne déplace pas la bulle « se libère
       * bientôt », qui continue de désigner Salomé seule.
       */
      label: 'Cadrage du connecteur de données — lot escalade',
      consultant: 'Antoine Rivière',
      status: 'active' as const,
      started_days_ago: 70,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 70,
      /** Sans échéance connue : le mois précédent reste TOUJOURS couvert, quel
       *  que soit le jour où la démonstration s'ouvre — même raison que les
       *  deux missions d'Inès Kaczmarek. */
      ends_in_days: null,
      daily_rate: 620,
      loaded_daily_cost_cents: null,
      channel: 'direct' as const,
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Intégrateur EDI',
      billing_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      /**
       * TROIS relances envoyées, aucun relevé arrivé : `recordReminder` pose
       * `escalated` dès que la troisième touche un statut `expected`,
       * `missing` ou `draft` (`timesheets.service.ts`). `days: 0` parce que
       * rien n'a été déposé — l'escalade porte sur une ABSENCE, jamais sur un
       * relevé partiel.
       */
      timesheet: {
        days: 0,
        status: 'escalated' as const,
        expected_days: 20,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
        reminders_sent: 3,
        last_reminder_at_days_ago: 2,
      },
    },
    {
      /**
       * #2972 — LA MISSION ESCALADÉE DU SOUS-TRAITANT. Même état que celle d'Antoine Rivière (trois relances, aucun
       * CRA), portée par un consultant d'ESN partenaire : le relevé escaladé nomme alors « Partenaire : … »
       * (`TimesheetsService.dueEscalations`, `consultants.partner_account_id`), et l'ADV est le contact de facturation.
       * Sans date de fin (hors `consultantsFreeingSoon`), canal direct et sans coût chargé : hors de tout calcul de
       * marge, qui reste « non mesurable » sous son seuil.
       */
      label: 'Run des échanges inter-applicatifs — lot escalade partenaire',
      consultant: 'Anthony Vasseur',
      status: 'active' as const,
      started_days_ago: 95,
      stage_entered_days_ago: 95,
      ends_in_days: null,
      daily_rate: 590,
      loaded_daily_cost_cents: null,
      channel: 'direct' as const,
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Développeur d’intégration',
      billing_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      timesheet: {
        days: 0,
        status: 'escalated' as const,
        expected_days: 20,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
        reminders_sent: 3,
        last_reminder_at_days_ago: 3,
      },
    },
    {
      /**
       * Le relevé rejeté PUIS REDÉPOSÉ — la seconde moitié de la
       * fonctionnalité, celle qu'on oublie.
       *
       * Son statut est repassé à `submitted` : la correction a été faite et le
       * relevé attend maintenant la validation du client. Le motif, lui, EST
       * TOUJOURS LÀ — on archive, on ne supprime pas — et l'écran écrit
       * « rejeté le …, puis redéposé ». Sans cette ligne, un prospect verrait
       * le motif disparaître dès qu'on corrige, c'est-à-dire l'inverse de ce
       * que le produit fait.
       *
       * Sans date de fin, et ce n'est pas un oubli : la fiche d'Hakim Barreau
       * porte « disponibilité à confirmer — sa dernière mission n'a pas de date
       * de fin connue », et c'est cette mission-là. Sa disponibilité INCONNUE
       * — le profil qui atterrit dans « non évaluables » — devient enfin
       * vérifiable au lieu d'être affirmée toute seule.
       */
      label: 'Socle conteneurisé des applications terrain — run',
      /** #2195.22 à .29 — PARITÉ DÉMO du statut de renouvellement.
       *  Bloqué, et ce n'est PAS le délai : cette mission n'a pas de date de fin.
       *  Les deux alertes se superposent sur la même ligne — la fenêtre « Sans date
       *  de fin » dit le défaut de donnée, le statut dit la décision empêchée. */
      renewal_status: 'bloque' as const,
      consultant: 'Hakim Barreau',
      status: 'active' as const,
      started_days_ago: 138,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 15,
      /** Sans échéance connue : c'est ce que sa fiche dit déjà. */
      ends_in_days: null,
      daily_rate: 600,
      loaded_daily_cost_cents: 420_00,
      channel: 'direct' as const,
      /** Contrat de 2026, comme les autres du même millésime : le bon de
       *  commande y est exigé, et il est là. */
      requires_po: true,
      partner_commission_daily_cents: null as number | null,
      /** #2420 — le FREELANCE : TJM fournisseur (400 €) + commission (20 €), soit
       *  exactement le coût chargé saisi — la liste et la fiche disent le même
       *  nombre. Taxes non renseignées : nommées comme non comptées. */
      cost_source: 'freelance' as const,
      currency: 'EUR',
      cost_breakdown: { supplierDailyRateCents: 400_00, supplierCommissionDailyCents: 20_00 },
      cost_recorded_rate_cents: 600_00 as number | null,
      po_number: 'PO-2026-0233',
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Ingénieur d’exploitation conteneurs',
      /** Sans contact : c'est la quatrième mission qui porte le bloqueur
       *  « contact de facturation inconnu », et il faut qu'il en reste assez
       *  pour que l'écran de préparation ait quelque chose à demander. */
      billing_contact: null as string | null,
      /**
       * Les jours sont ceux d'APRÈS correction — donc justes, et sans écart.
       * Le motif raconte ce qui n'allait pas la première fois.
       */
      timesheet: {
        days: 21,
        status: 'submitted' as const,
        expected_days: 21,
        gap_explanation: null,
        rejected_days_ago: 11,
        rejection_reason:
          'Les nuits d’astreinte étaient comptées comme des jours travaillés : le contrat les facture sur une ligne distincte.',
        // #2415.7 — les deux nuits d'astreinte, exactement celles que le
        // motif nomme. La trace SURVIT au redépôt (on archive, on ne
        // supprime pas) : ce mois est redéposé (`submitted`), la quantité
        // contestée du rejet reste lisible.
        contested_days: 2 as number | null,
      },
      /**
       * LE DOSSIER ADV À MOITIÉ FAIT (31/08/2026) — l'état le plus fréquent en
       * clientèle, et celui qu'aucune capture d'écran ne montre jamais.
       *
       * La référence cliente est là, les conditions de règlement aussi ; les
       * coordonnées n'ont jamais été transmises et personne n'a désigné
       * l'entité qui facture. Deux motifs, deux gestes, et une ligne qui montre
       * qu'un dossier se répare par morceaux.
       *
       * Cette mission n'a PAS de date de fin (`ends_in_days: null`) : elle
       * tombe donc dans la fenêtre `unknown` de `renewalsToAct` et reste dans
       * la file tous les jours de l'année. Son ancienneté s'affiche « non
       * mesuré » — la seconde démonstration que ce lot doit faire.
       */
      adv: {
        client_billing_reference: 'REF-FOURN-2026-0208',
        payment_terms_days: 60,
        payment_details_transmitted_days_ago: null,
        client_entity: null as string | null,
      },
    },
    {
      /**
       * LA TROISIÈME MISSION DE YANIS BERTHIER CHEZ LE MÊME CLIENT.
       *
       * ──────────────────────────────────────────────────────────────────────
       * CE QU'ELLE FAIT VOIR, ET QUI MANQUAIT
       * ──────────────────────────────────────────────────────────────────────
       * Le vivier affiche « placé N fois » — un compteur qui DIFFÈRE des
       * positionnements montrés à côté, et c'est tout son intérêt. Il ne
       * pouvait pas se voir : personne n'était placé plus de deux fois, et une
       * salle où chacun est placé une ou deux fois ne dit pas ce que le
       * compteur compte. Yanis en porte maintenant TROIS, tous chez le même
       * client d'exemple — le profil qu'un client redemande, qui est
       * exactement la personne qu'un directeur d'agence veut repérer.
       *
       * ⚠️ Le compteur lit `mission_assignments` jointes aux missions dont
       * `started_on <= CURRENT_DATE` (`PropagationService.placementsOf`) : une
       * mission FINIE compte toujours comme un placement — elle a bien eu
       * lieu. C'est pourquoi celle-ci peut être dans le passé.
       *
       * ──────────────────────────────────────────────────────────────────────
       * POURQUOI DANS LE PASSÉ, ET POURQUOI `terminated`
       * ──────────────────────────────────────────────────────────────────────
       * Yanis est déjà sur deux missions EN COURS (le renfort exploitation et
       * le forfait applications voyageurs). Une troisième qui chevaucherait les
       * deux autres montrerait quelqu'un affecté à 300 % — le semis pose
       * `load_percent: 100` sur chaque affectation — et un prospect qui
       * regarde la fiche verrait une donnée qui ne peut pas être vraie. Elle
       * s'est donc déroulée AVANT elles, et elle est close.
       *
       * `terminated` et non `ended` : interrompue avant son terme, « le cas
       * dont on veut apprendre ». C'est un état que la salle ne montrait nulle
       * part — le tableau des missions le range en « Terminée », et le bloc
       * « REX en attente » le lit comme il lit les missions finies
       * (`capitalisation.service.ts`, `status IN ('ended','terminated')`). La
       * mission TERMINÉE du jeu reste unique, elle : c'est elle qui porte
       * `mission_ended_without_feedback`.
       *
       * ⚠️ Sans coût chargé saisi, à dessein : les conditions commerciales
       * n'ont jamais été complétées sur une mission arrêtée en cours de route.
       * Elle reste donc HORS du calcul de marge, qui doit continuer à
       * s'afficher « non mesurable » sous son seuil de cinq missions — le
       * franchir montrerait un chiffre auquel le produit refuse lui-même de
       * croire.
       */
      label: 'Reprise de l’ordonnancement des flux — lot pilote',
      consultant: 'Yanis Berthier',
      status: 'terminated' as const,
      started_days_ago: 310,
      /** Depuis combien de jours la mission est dans SON statut — ici depuis
       *  son interruption. */
      stage_entered_days_ago: 214,
      /** Négatif = une date PASSÉE : `dateOnly(-ends_in_days)` la rend. */
      ends_in_days: -214,
      daily_rate: 590,
      /** Jamais saisi : la mission s'est arrêtée avant que les conditions
       *  commerciales soient complétées. Absent, et non zéro. */
      loaded_daily_cost_cents: null,
      channel: 'direct' as const,
      /** Contrat de 2025 : le bon de commande n'y était pas exigé. Le régime de
       *  facturation change avec le contrat, pas avec le client — c'est pour ça
       *  que le drapeau vit sur la MISSION. */
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      po_number: 'PO-2025-0871',
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Ingénieur d’exploitation',
      /** Sans contact : le bloqueur « contact de facturation inconnu » doit
       *  rester visible sur assez de lignes pour que l'écran ait quoi
       *  demander. */
      billing_contact: null as string | null,
      /** Le dernier relevé a été validé avant l'arrêt : la mission s'est
       *  interrompue, elle n'a pas été bâclée. */
      timesheet: {
        days: 18,
        status: 'validated' as const,
        expected_days: 18,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
      },
    },
    {
      /**
       * LE PORTAGE — la cinquième ligne de « Marge par canal ».
       *
       * ────────────────────────────────────────────────────────────────────
       * POURQUOI ELLE EXISTE
       * ────────────────────────────────────────────────────────────────────
       * `portage` est devenu un canal le 29/08/2026. Un canal que le contrat
       * connaît et qu'aucune mission ne porte ouvre en démonstration une
       * cinquième ligne VIDE : on aurait ajouté une colonne pour montrer un
       * trou, ce qui est pire que les quatre d'avant. C'est le défaut que ce
       * dépôt connaît par cœur — du code juste, calculé, testé, que rien
       * n'alimente.
       *
       * ────────────────────────────────────────────────────────────────────
       * POURQUOI ELLE EST DANS LE PASSÉ, ET POURQUOI HAKIM BARREAU
       * ────────────────────────────────────────────────────────────────────
       * Le semis pose `load_percent: 100` sur chaque affectation. Une neuvième
       * mission EN COURS afficherait quelqu'un affecté à 200 %, et le vivier
       * — qui lit ces affectations pour dire qui est disponible — mentirait
       * sur l'écran d'à côté. Elle est donc CLOSE et bornée dans le passé,
       * comme la mission interrompue de Yanis Berthier, pour la même raison.
       *
       * Hakim Barreau parce qu'il porte une seule mission, toujours en cours :
       * une seconde mission close derrière lui ne change ni sa disponibilité
       * ni l'intercontrat de Camille Roussel, qui est la démonstration de
       * l'écran Vivier.
       *
       * ────────────────────────────────────────────────────────────────────
       * LES FRAIS DE GESTION SONT SAISIS, ET C'EST LE POINT
       * ────────────────────────────────────────────────────────────────────
       * Sur un canal intermédié, une commission inconnue rend le coût inconnu
       * (`trueDailyCostCents`) : sans eux, la ligne s'afficherait « non
       * mesurée » — juste, et toujours muette. Avec eux la salle montre une
       * marge de portage CHIFFRÉE, à côté du direct et du partenaire, ce qui
       * est exactement la comparaison que l'écran existe pour permettre.
       *
       * 610 € vendus, 395 € de coût chargé, 55 € de frais de gestion : le coût
       * réel est 450 €, soit ~26 % de marge — sous le direct, au-dessus du
       * partenaire. Un ordre plausible, et surtout TROIS valeurs distinctes :
       * une salle où tous les canaux tombent au même chiffre ne montre pas
       * l'écart pour lequel la vue existe.
       */
      label: 'Supervision applicative du socle transport — astreinte',
      consultant: 'Hakim Barreau',
      status: 'ended' as const,
      started_days_ago: 300,
      /** Depuis combien de jours la mission est dans SON statut — ici depuis sa
       *  clôture. */
      stage_entered_days_ago: 95,
      /**
       * Négatif = une date PASSÉE : `dateOnly(-ends_in_days)` la rend.
       *
       * ⚠️ QUATRE-VINGT-QUINZE JOURS, et le nombre n'est pas décoratif :
       * `invoice-readiness.service` retient `m.ends_on >= <1er du mois
       * précédent>`, et ce jour-là peut être à soixante et un jours
       * d'aujourd'hui (un 31 précédé d'un mois de 31 jours). Une mission close
       * plus près réapparaîtrait CERTAINS JOURS DU MOIS comme un bloqueur de
       * facturation qui n'en est pas un — la démonstration montrerait un défaut
       * un mois sur deux, et personne ne saurait pourquoi. C'est la même borne
       * que la mission interrompue, et pour la même raison.
       */
      ends_in_days: -95,
      daily_rate: 610,
      loaded_daily_cost_cents: 395_00,
      channel: 'portage' as const,
      /** Bon de commande non exigé : le régime de facturation vit sur la
       *  MISSION, et celle-ci n'en demandait pas. */
      requires_po: false,
      /**
       * Les frais de gestion de la société de portage, SAISIS.
       *
       * C'est la seconde moitié du coût réel d'une journée. Les laisser à
       * `null` rendrait le coût inconnu — et non égal au TJM d'achat, ce qui
       * ferait passer la société de portage pour gratuite sur exactement le
       * canal qu'on vient d'ajouter pour pouvoir le comparer aux autres.
       */
      partner_commission_daily_cents: 55_00 as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Ingénieur supervision',
      /** Sans contact de facturation, comme les cinq autres missions qui n'en
       *  portent pas : `contact_signed_missions` ne compte que celles qui en
       *  nomment un, et remplir les huit ferait disparaître de la salle un
       *  bloqueur que le produit affiche. Close depuis plus de trois mois, elle
       *  est de toute façon hors de la fenêtre « Prêt à facturer ». */
      billing_contact: null as string | null,
      /** Le dernier mois a été relevé et validé avant la clôture : c'est lui
       *  qui donne ses JOURS à la ligne de canal — sans relevé exploitable, la
       *  marge du portage resterait non mesurable. */
      timesheet: {
        days: 17,
        status: 'validated' as const,
        expected_days: 17,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
      },
    },
    {
      /**
       * LE PAIEMENT SORTANT PAYÉ (31/08/2026) — l'état que la salle ne
       * montrait JAMAIS.
       *
       * ─────────────────────────────────────────────────────────────────────
       * POURQUOI IL MANQUAIT, ET POURQUOI CE N'ÉTAIT PAS UN OUBLI
       * ─────────────────────────────────────────────────────────────────────
       * `paye` est atteignable en UN clic depuis `valide` (« Marquer payé »
       * dans le menu de la ligne) : l'agent qui a semé les trois autres états
       * l'a laissé de côté à dessein pour ne pas DÉRANGER les deux seules
       * missions de la salle qui portent un relevé VALIDÉ dans la fenêtre du
       * mois observé — déjà prises par `valide` (Fiabilisation plateforme) et
       * `a_valider` (Industrialisation d’un cas d’usage de recherche), toutes deux
       * nécessaires à l'écran « Prêt à facturer ». En sacrifier une pour
       * `paye` aurait vidé cet écran-là d'un état qu'il existe pour montrer.
       *
       * Ce lot AJOUTE une DIXIÈME mission plutôt que d'en réutiliser une :
       * « trouve une autre mission, ou ajoute-en une » — la consigne du lot.
       *
       * ─────────────────────────────────────────────────────────────────────
       * POURQUOI ACTIVE, PAS TERMINÉE, ET POURQUOI INÈS KACZMAREK
       * ─────────────────────────────────────────────────────────────────────
       * ⚠️ Un premier essai la fermait (`status: 'ended'`, close depuis douze
       * jours) pour rester dans la fenêtre du mois précédent. `demo-seed.
       * service.spec.ts` a refusé : TOUTE mission `ended` de la salle doit
       * être bornée à plus de soixante-et-un jours, pour ne JAMAIS réapparaître
       * comme un faux bloqueur sur « Prêt à facturer » — la même garde qui
       * borne la mission interrompue de Yanis Berthier et celle de portage.
       * Fermer celle-ci à douze jours aurait rouvert exactement ce défaut.
       *
       * `status: 'active'`, `ends_in_days: null` (aucune échéance connue)
       * évite le problème à la racine : le mois PRÉCÉDENT est TOUJOURS couvert
       * par une mission sans date de fin (`ends_on IS NULL` passe la clause de
       * `OutgoingPaymentsService.list` comme celle de « Prêt à facturer »),
       * quel que soit le jour de la démonstration.
       *
       * Inès Kaczmarek porte déjà UNE mission active (« Cadrage données
       * transport »). Celle-ci en fait sa DEUXIÈME concurrente — un consultant
       * à 200 %, pas un cas nouveau : Yanis Berthier porte déjà deux missions
       * actives simultanées (Fiabilisation plateforme + Refonte du portail
       * fournisseurs) dans ce même jeu de données, et rien n'y régresse.
       */
      label: 'Reprise de la volumétrie tarifaire — lot de clôture',
      /** #2195.22 à .29 — PARITÉ DÉMO du statut de renouvellement.
       *  #2195.37 — la seule ligne CLOSE de la salle. Elle prouve deux choses à la
       *  fois : que « Clôturer » aboutit, et qu'une ligne close reste LISIBLE le
       *  soir même — l'écran cesse de la réclamer, il ne la fait pas disparaître. */
      renewal_status: 'renouvele' as const,
      /**
       * #2413.49 à .57 (épopée #2965) — PARITÉ DÉMO du dual track.
       *
       * La SEULE ligne `renouvele` de la salle porte les DEUX rails à `oui` —
       * `canConfirmRenewal` (`@bellum/contracts`) l'exige, et une ligne
       * « Renouvelé » sans rail se lirait comme le NO-GO #2413.67 contourné.
       * Voir `demo-renewal-rails-coverage.spec.ts`.
       */
      renewal_client_rail: {
        intent: 'oui' as const,
        scope: 'Même périmètre, reconduit à l’identique',
        budget: null,
        process: null,
        updatedAt: null,
        updatedBy: null,
      },
      renewal_consultant_rail: {
        intent: 'oui' as const,
        conditions: null,
        availability: 'oui' as const,
        otherOptions: null,
        updatedAt: null,
        updatedBy: null,
      },
      consultant: 'Inès Kaczmarek',
      status: 'active' as const,
      started_days_ago: 55,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 55,
      /** Sans échéance connue, comme l'autre mission d'Inès Kaczmarek : c'est
       *  ce qui garde le mois précédent TOUJOURS couvert, quel que soit le
       *  jour où la démonstration s'ouvre. */
      ends_in_days: null,
      daily_rate: 580,
      loaded_daily_cost_cents: 400_00,
      channel: 'direct' as const,
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      /** #2420 — le coût a été saisi quand le TJM valait 560 € ; il en vaut 580
       *  aujourd'hui. L'alerte « tarif changé » se lit sur cette mission-là. */
      cost_recorded_rate_cents: 560_00 as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Data engineer',
      // Le même contact que la toute première mission de la salle : deux
      // missions du même client d'exemple partagent le même interlocuteur
      // côté facturation.
      billing_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      /** Le dernier mois a été relevé et VALIDÉ avant la clôture — c'est la
       *  condition qui autorise le paiement (`outgoingPaymentBlockers`). */
      timesheet: {
        days: 20,
        status: 'validated' as const,
        expected_days: 20,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
      },
      /**
       * La facture ENTRANTE qui justifie le paiement — sans elle,
       * `demo-outgoing-payments-coverage.spec.ts` refuse tout paiement
       * chiffré : « on ne paie pas sur parole ».
       */
      supplier_invoices: [
        { reference: 'FA-2026-0605', amount_cents: 1_160_000, days_ago: 16, status: 'validated' as const },
      ],
      /**
       * LE PAIEMENT — `paye`, avec un montant SORTI distinct du DÛ : 10 000 €
       * (une retenue de 100 €), pour que la maquette (« Montant TTC » contre
       * « sorti : … ») ait quelque chose à distinguer sur CET état précis, en
       * plus des trois autres.
       */
      outgoing_payment: {
        status: 'paye' as OutgoingPaymentStatus,
        amount_cents: 1_160_000,
        settled_amount_cents: 1_150_000 as number | null,
        scheduled_days_ago: 14,
        paid_days_ago: 13,
        reminders_sent: 0,
        rejection_reason: null as string | null,
      },
    },
    {
      /**
       * #2566.2/#2566.4 — LA MISSION LONGUE AU BON DE COMMANDE EXPIRÉ.
       *
       * Le call bêta François Thomas (17/09/2026) le nomme explicitement :
       * « missions longues, tous les mois c'est la même facture ; une chose
       * qui change, c'est le nombre de jours, le numéro de bon de commande
       * peut aussi changer ». Cette mission montre le cœur du critère de
       * recette : le mois par défaut de l'écran (le PRÉCÉDENT) porte un
       * relevé VALIDÉ — aucun bloqueur de CRA — mais un bon de commande
       * expiré avant sa fin : `po_period_mismatch` est le SEUL bloqueur
       * rendu, pour que le blocage se voie sans bruit.
       *
       * #2566.4 — « DEUX MOIS DÉJÀ FACTURÉS », LE RESTE DU CRITÈRE, EST SEMÉ
       * plus bas dans `invoices` (`months_ago: 2` et `3`, réglés) : sans eux,
       * la mission n'avait qu'un blocage à montrer, jamais l'historique qui en
       * fait une reconduction plutôt qu'un premier mois. Une tentative
       * antérieure les avait retirés parce qu'ils faisaient passer le compte
       * mesurable de la tuile « Délai de paiement » de dix à douze lignes et
       * rougissaient quatre assertions calibrées EXACTEMENT sur dix
       * (`demo-dataset.spec.ts` §D42). Ce lot recalibre ces quatre assertions
       * plutôt que de laisser le critère à moitié rempli : les deux délais
       * choisis (vingt et quarante jours) laissent la MÉDIANE à trente-deux
       * jours inchangée — seul le PLANCHER cesse d'être exact, ce que §D42
       * documente maintenant.
       *
       * Marc Ouedraogo est le SEUL consultant de la salle sans aucune mission
       * dans ce jeu de données avant ce lot — le réutiliser plutôt qu'en
       * inventer un neuvième garde les sept fiches déjà bâties intactes.
       * `availability: 'immediate'` sur sa fiche vivier reste tel quel : c'est
       * un champ DÉCLARATIF, déjà décorrélé du staffing réel ailleurs dans
       * cette salle (Yanis Berthier porte deux missions actives avec la même
       * étiquette).
       */
      label: 'Supervision de la chaîne de production — mission longue',
      consultant: 'Marc Ouedraogo',
      status: 'active' as const,
      // Plus de six mois — la fenêtre exigée par le critère de recette, et
      // large pour couvrir `months_ago: 3` de l'historique de facturation quel
      // que soit le jour de la visite.
      started_days_ago: 195,
      stage_entered_days_ago: 195,
      // Ouverte : une mission longue au sens de ce lot n'a pas de terme connu.
      ends_in_days: null,
      daily_rate: 560,
      loaded_daily_cost_cents: 390_00,
      channel: 'direct' as const,
      requires_po: true,
      partner_commission_daily_cents: null as number | null,
      po_number: 'PO-2026-0091',
      // Le bon de commande D'ORIGINE, émis au démarrage de la mission.
      po_issued_on_days_ago: 195,
      /**
       * ⚠️ EXPIRÉ — quarante jours dans le passé. Robuste à n'importe quel
       * jour de visite : la fin du mois PRÉCÉDENT (le mois que l'écran ouvre
       * par défaut) ne recule jamais de plus de trente et un jours, quarante
       * la couvre donc toujours. C'est la donnée qui fait apparaître
       * `po_period_mismatch` — le trou que ce lot comble, faute duquel un bon
       * de commande expiré n'était JAMAIS distingué d'un bon de commande
       * toujours valide.
       */
      po_valid_until_days_ago: 40,
      /**
       * #2563/#2566 (lot G2, 07/10/2026) — LE VOLUME DU BON DE COMMANDE, enfin
       * renseigné sur LA mission longue de la salle, pour que « Préparer la
       * facture de <mois> » montre le reste à consommer ET son dépassement :
       * soixante jours au bon de commande ; les deux mois déjà facturés
       * (`month_preparations`, vingt-deux jours chacun, sans relevé conservé)
       * plus les vingt jours du mois précédent font soixante-quatre, donc un
       * dépassement de quatre jours — l'alerte qu'un chargé d'affaires doit
       * voir AVANT de préparer. La barre de la fiche reste cohérente : vingt
       * jours relevés + quarante-quatre saisis, soit soixante-quatre sur soixante.
       */
      po_volume_days: 60,
      po_amount_cents: 3_360_000,
      /**
       * Les mois DÉJÀ préparés et facturés : même facture chaque mois, seuls les
       * jours et le N° de bon de commande changent (le bon d'origine a été
       * remplacé il y a trois mois). Jours SAISIS faute de relevé conservé.
       */
      month_preparations: [
        { months_ago: 3, manual_days: 22, po_number: 'PO-2026-0088' },
        { months_ago: 2, manual_days: 22, po_number: 'PO-2026-0091' },
      ],
      // L'option « préparer chaque mois automatiquement » est active sur cette mission.
      auto_prepare_invoice: true,
      billing_cadence: 'monthly',
      notice_days: 30,
      contract_kind: 'regie' as const,
      role_title: 'Ingénieur SI industriel',
      // Le même interlocuteur que la toute première mission de la salle — un
      // cas réel, le plus simple à démontrer (voir sa note d'origine).
      billing_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      cra_contact: seatName('Directeur technique — entité numérique voyageurs') as string | null,
      /**
       * Le relevé du mois PRÉCÉDENT — VALIDÉ, à dessein : le seul bloqueur que
       * cette ligne doit montrer est celui du bon de commande. Vingt jours,
       * le nombre qui « change chaque mois » dans les mots du client.
       */
      timesheet: {
        days: 20,
        status: 'validated' as const,
        expected_days: 20,
        gap_explanation: null,
        rejected_days_ago: null,
        rejection_reason: null,
      },
    },
    {
      /**
       * #2195.50 — LA MISSION « AU-DELÀ DE 60 JOURS » (DÉCISION LOUIS 20/09/2026).
       *
       * ─────────────────────────────────────────────────────────────────────
       * POURQUOI ELLE N'EXISTAIT PAS AVANT CE LOT
       * ─────────────────────────────────────────────────────────────────────
       * Jusqu'ici, AUCUNE mission de la salle ne finissait au-delà de la
       * fenêtre de renouvellement — un choix ANTÉRIEUR et DÉLIBÉRÉ (#2195.2) :
       * une mission qui finissait à soixante-huit jours avait été RAMENÉE à
       * cinquante-cinq (voir la note sur « Fiabilisation plateforme — renfort
       * exploitation », première mission de cette liste), précisément pour
       * qu'aucune pastille de la lentille d'échéance (`MissionEndWindowFilter`) ne s'ouvre à zéro devant un
       * prospect. `GET /delivery/renewals` excluait alors `far` par
       * construction : semer une mission lointaine n'aurait RIEN montré.
       *
       * Ce lot inverse la raison : `renewalsToAct(..., includeFar: true)` sert
       * désormais cette fenêtre, et l'écran l'ordonne APRÈS « Sans date de
       * fin ». Sans une mission qui y tombe, la nouvelle pastille resterait à
       * zéro en démonstration — la même panne que celle que #2195.2 évitait
       * déjà pour « Sous 60 jours », déplacée d'une fenêtre.
       *
       * ─────────────────────────────────────────────────────────────────────
       * SOIXANTE ET ONZE JOURS, ET LE CONSULTANT CHOISI
       * ─────────────────────────────────────────────────────────────────────
       * Le nombre reprend celui mesuré en production le matin même sur une
       * mission réelle (hors salle de démonstration) qui a motivé la décision
       * de Louis — pas un chiffre rond arbitraire.
       *
       * ⚠️ Marc Ouedraogo, et PAS un autre : les six autres profils du vivier
       * portent chacun une calibration EXACTE qu'une mission de plus déplace.
       * Essayé et REFUSÉ avant lui :
       *  - Antoine Rivière (déjà deux missions) — `demo-pipe-dates-and-
       *    placements.spec.ts` compte qui est « placé N fois » sur les
       *    missions STARTED d'un consultant ; une troisième le fait franchir
       *    le seuil de trois, et un test dédié VÉRIFIE que Yanis Berthier est
       *    seul à l'atteindre (« sait dire NON — sans la troisième mission de
       *    Yanis, plus personne n'est placé trois fois ») ;
       *  - Hakim Barreau et Inès Kaczmarek, même raison (déjà deux chacun) ;
       *  - Salomé Dufour — bulle `consultant_free_soon` : « son UNIQUE
       *    affectation en cours finit dans vingt-huit jours » ;
       *  - Camille Roussel — bulle `long_bench` : « elle n'en a AUCUNE en
       *    cours ni aucune sans fin » ;
       * Marc Ouedraogo ne porte qu'UNE mission (`ends_in_days: null`, donc
       * hors du calcul de `consultantsFreeingSoon`, qui lit le MAXIMUM des
       * échéances CONNUES) et aucune bulle ni aucun compteur exact ne le nomme
       * par son nombre de missions — seul le §D42 le mentionne, et par ses
       * FACTURES (`invoices`, un tableau séparé que cette mission ne touche
       * pas), jamais par son nombre de missions.
       *
       * ─────────────────────────────────────────────────────────────────────
       * MINIMALE À DESSEIN
       * ─────────────────────────────────────────────────────────────────────
       * Aucun relevé, aucun bon de commande, aucune facture fournisseur, aucun
       * coût chargé : son seul objet est de peupler la fenêtre lointaine, pas
       * de redémontrer une capacité déjà seedée ailleurs dans cette salle.
       */
      label: 'Cartographie du parc applicatif — lot d’options',
      consultant: 'Marc Ouedraogo',
      status: 'active' as const,
      started_days_ago: 15,
      /** Depuis combien de jours la mission est dans SON statut. Sans lui,
       *  la colonne « Dans ce statut » lirait le défaut `now()` pour toutes. */
      stage_entered_days_ago: 15,
      /** #2195.50 — SOIXANTE ET ONZE jours : au-delà des soixante de l'échelle
       *  par défaut, donc `far` — voir la note ci-dessus. */
      ends_in_days: 71,
      daily_rate: 610,
      // Sans coût chargé : sa marge est NON MESURABLE, à dessein — cette
      // mission n'a rien à ajouter au moteur de marge, déjà démontré ailleurs.
      loaded_daily_cost_cents: null,
      channel: 'direct' as const,
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: null,
      contract_kind: 'regie' as const,
      role_title: 'Architecte réseau',
      billing_contact: null as string | null,
      /** Trop tôt pour un relevé — la mission vient de démarrer et sa fenêtre
       *  de facturation n'a pas de raison d'être seedée ici. */
      timesheet: null,
    },
    {
      /**
       * #3068 — LA MISSION INTERROMPUE DONT LA DISPONIBILITÉ N'EST PAS
       * CONFIRMÉE — la preuve écran du badge `a_confirmer` (voir le docblock
       * de « Léa Fontaine », `DEMO_CONSULTANTS`).
       *
       * Léa Fontaine ne porte QUE cette mission : aucune autre affectation ne
       * viendrait masquer l'état dérivé attendu (`deriveStaffing` ne regarde
       * l'interruption QUE quand `active.length === 0`). `status: 'terminated'`
       * / `end_reason: 'interruption'`, bornée dans le PASSÉ — même raison que
       * la troisième mission de Yanis Berthier plus haut : une affectation
       * encore « en cours » afficherait une charge qui ne peut pas être vraie.
       *
       * La ligne `mission_interruptions` associée (semée juste après
       * l'affectation, `DemoSeedService.seedDeliveryClient`, quand
       * `end_reason === 'interruption'`) porte `availability_confirmed:
       * false` — LE fait qui bascule `deriveStaffing` en `a_confirmer` plutôt
       * qu'en `available`.
       *
       * ⚠️ Sans coût chargé ni bon de commande : une mission arrêtée avant
       * terme n'a jamais eu le temps de voir ses conditions commerciales
       * complétées, même raison que la mission interrompue de Yanis Berthier.
       */
      label: 'Cadrage du programme de refonte SI — arrêt anticipé',
      consultant: 'Léa Fontaine',
      status: 'terminated' as const,
      started_days_ago: 90,
      stage_entered_days_ago: 12,
      ends_in_days: -12,
      daily_rate: 580,
      loaded_daily_cost_cents: null,
      channel: 'direct' as const,
      requires_po: false,
      partner_commission_daily_cents: null as number | null,
      po_number: null,
      billing_cadence: 'monthly',
      notice_days: null,
      contract_kind: 'regie' as const,
      role_title: 'Cheffe de projet SI',
      billing_contact: null as string | null,
      timesheet: null,
      /** #3068 — le motif TYPÉ (`missions.end_reason`, migration
       *  `1796321339461-MissionEndChecklist`) : cette mission-là est celle qui
       *  le porte à `'interruption'` en démonstration. */
      end_reason: 'interruption' as const,
    },
  ],

  /**
   * L'HISTORIQUE DE FACTURATION — D42 (Louis, 28/08/2026).
   *
   * ────────────────────────────────────────────────────────────────────────
   * CE QUI ÉTAIT MESURÉ
   * ────────────────────────────────────────────────────────────────────────
   * `invoice_readiness` était classée « vide à dessein », avec pour raison que
   * « l'état de facturation se RECALCULE à chaque lecture ». C'est vrai des
   * BLOQUEURS — et faux du reste : `RevenueService.dso()` lit la TABLE. En
   * démonstration la requête ramenait zéro ligne, et la tuile « Délai de
   * paiement » disait pour toujours « non mesurable — 0 facture sur les 10
   * nécessaires ». Une capacité livrée, juste, qu'aucun prospect ne voyait.
   *
   * ────────────────────────────────────────────────────────────────────────
   * QUINZE LIGNES, ET POURQUOI PLUS DE TREIZE DEPUIS #2566.4
   * ────────────────────────────────────────────────────────────────────────
   * Le seuil de mesurabilité porte sur ce qui est CALCULÉ, jamais sur ce qui
   * est écarté (`measurability.ts`, « trente factures contestées ne rendent
   * pas mesurable un DSO qui n'a qu'une observation »). À l'origine (D42),
   * treize lignes donnaient DIX délais exploitables — exactement le plancher,
   * sans marge. #2566.4 y ajoute DEUX délais propres de plus (la mission
   * longue au bon de commande expiré a aussi deux mois déjà réglés), portant
   * le calculable à DOUZE : le plancher n'est plus une valeur exacte, il a
   * deux lignes de marge. La MÉDIANE, elle, ne bouge pas — les deux délais
   * ajoutés (vingt et quarante jours) encadrent la paire centrale sans la
   * déplacer (`demo-dataset.spec.ts` §D42, recalibré par ce lot).
   *
   * Ce que la tuile affiche avec ces quinze lignes — mesuré, pas espéré :
   * « 32 jours · 1 facture écartée faute de dates · 2 factures contestées,
   * hors du calcul ». Les garder toutes ferait dire 36 jours : le refus AGIT,
   * et un prospect le voit agir.
   *
   * ────────────────────────────────────────────────────────────────────────
   * CE QUE CHAQUE LIGNE MONTRE
   * ────────────────────────────────────────────────────────────────────────
   *  - douze mois réglés entre 18 et 61 jours — un portefeuille normal, avec
   *    deux clients lents (dont les deux mois de la mission longue, #2566.4) ;
   *  - un mois CONTESTÉ qui court encore, réglé pour partie (le client a payé
   *    ce qu'il ne conteste pas) ;
   *  - un mois contesté puis LEVÉ, réglé en entier : le litige levé reste
   *    hors du calcul, parce que lever un litige ne réécrit pas le temps
   *    qu'il a fait perdre ;
   *  - un mois MAL DATÉ — le règlement a été saisi à l'envers de l'émission.
   *    Le calcul écarte le délai négatif et le COMPTE : un historique mal
   *    saisi ne doit pas se lire comme un historique court.
   *
   * ⚠️ Aucune ligne sur le mois PRÉCÉDENT ni sur le mois courant : c'est la
   * fenêtre de l'écran « Prêt à facturer », et y poser une facture rendrait
   * « facturé » les trois états que les missions ci-dessus existent pour
   * montrer. Le plus récent des mois facturés est donc l'avant-dernier.
   *
   * ⚠️ `reminders_sent` n'est pas ici, et c'est la décision de Louis : on ne
   * montre pas des relances envoyées à des clients fictifs qui n'en ont jamais
   * reçu. Le zéro est écrit en littéral dans la requête du seed.
   *
   * ⚠️ Les mois sont choisis DANS la fenêtre de la mission qui les porte, quel
   * que soit le jour de la visite — un mois facturé hors mission serait
   * invisible à l'écran (la requête borne sur `started_on`/`ends_on`) et faux
   * quand même. `demo-dataset.spec.ts` le vérifie sur trois ans de calendrier.
   */
  invoices: [
    // La mission TERMINÉE porte l'historique long : c'est la seule dont la
    // fenêtre remonte à huit mois.
    {
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 3,
      billed_days: 19,
      paid_days: 19,
      /** Trente jours de règlement, tenus à trois jours près. */
      payment_delay_days: 38,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      /**
       * ────────────────────────────────────────────────────────────────────
       * #2419.4 — LE RÈGLEMENT PARTIEL SANS LITIGE, et il manquait
       * ────────────────────────────────────────────────────────────────────
       * Le jeu portait DÉJÀ un paiement partiel (`months_ago: 6`), mais il est
       * CONTESTÉ : le litige passe avant, la ligne s'affiche « En litige », et
       * le cas que ce lot répare n'apparaissait donc nulle part en salle.
       *
       * Celui-ci n'a pas de litige. Le client a réglé neuf jours sur
       * vingt et un, et il n'a jamais donné suite — la situation la plus banale
       * d'un recouvrement, et celle qui a coûté le plus cher : le produit
       * disait « Réglée », sortait la ligne de la file de relance, et les douze
       * jours restants n'étaient plus réclamés par personne.
       *
       * Ce qu'il montre en salle : statut « Échue », le retard en jours, la
       * relance due, et le RESTE DÛ nommé dans la colonne « Montant ».
       *
       * ⚠️ Son délai de règlement reste CINQUANTE-DEUX jours, inchangé : un
       * encaissement partiel est un encaissement, il entre dans le délai de
       * paiement au même titre que les autres (le DSO mesure un DÉLAI, pas une
       * complétude). Déplacer ce chiffre décalerait la médiane du portefeuille
       * pour une raison qui n'a rien à voir.
       */
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 4,
      billed_days: 21,
      paid_days: 9,
      payment_delay_days: 52,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 5,
      billed_days: 20,
      paid_days: 20,
      /** Le mois le plus lent du portefeuille sain : soixante et un jours. */
      payment_delay_days: 61,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      /**
       * Le litige qui COURT — et le paiement partiel qui va avec : le client
       * règle ce qu'il ne conteste pas. C'est le cas normal, et c'est pour lui
       * que « payé » et « facturé » sont deux montants distincts.
       */
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 6,
      billed_days: 21,
      paid_days: 16,
      payment_delay_days: 96,
      dispute_opened_days_after_invoice: 21,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: 'Le client conteste deux jours facturés sur un lot que son bon de commande ne couvre pas.',
    },
    {
      /**
       * Le litige LEVÉ, puis réglé en entier. Il reste hors du calcul : le
       * filtre porte sur l'OUVERTURE du litige et jamais sur sa levée.
       */
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 7,
      billed_days: 20,
      paid_days: 20,
      payment_delay_days: 118,
      dispute_opened_days_after_invoice: 18,
      dispute_resolved_days_after_invoice: 96,
      dispute_reason: 'Le client conteste l’écart entre les jours du relevé validé et ceux portés sur la facture.',
    },
    {
      /**
       * La MAL DATÉE. Le règlement est saisi AVANT l'émission — l'inversion
       * classique d'une reprise d'historique. Le délai serait négatif : le
       * calcul l'écarte et le compte, plutôt que de laisser une erreur de
       * saisie tirer la moyenne vers le bas.
       *
       * ⚠️ Ce n'est pas une facture SANS date d'émission : le produit refuse
       * d'enregistrer un paiement sur un mois qui n'a pas été marqué comme
       * facturé (`InvoiceReadinessService.recordPayment`), donc cet état-là
       * n'existe dans aucune instance et n'a rien à faire dans une salle de
       * démonstration. L'inversion, elle, se saisit tous les jours.
       */
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 8,
      billed_days: 18,
      paid_days: 18,
      payment_delay_days: -6,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    // Les trois missions EN COURS portent les mois récents : deux mois chacune
    // au plus, parce que leur fenêtre ne remonte pas plus haut.
    {
      mission: 'Industrialisation d’un cas d’usage de recherche — mise en production',
      months_ago: 2,
      billed_days: 20,
      paid_days: 20,
      payment_delay_days: 21,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Industrialisation d’un cas d’usage de recherche — mise en production',
      months_ago: 3,
      billed_days: 21,
      paid_days: 21,
      payment_delay_days: 29,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      /**
       * Le mois le plus vite réglé du jeu. ⚠️ Dix-huit jours et non trente :
       * sur un mois `months_ago: 2`, la facture est émise le 5 du mois suivant
       * — soit vingt-quatre jours avant aujourd'hui dans le pire des cas (une
       * visite le 1er d'un mois précédé de février). Au-delà, le règlement
       * tomberait DEMAIN, et la salle afficherait un paiement à venir.
       */
      mission: 'Socle conteneurisé des applications terrain — run',
      months_ago: 2,
      billed_days: 21,
      paid_days: 21,
      payment_delay_days: 18,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Socle conteneurisé des applications terrain — run',
      months_ago: 3,
      billed_days: 20,
      paid_days: 20,
      payment_delay_days: 31,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Socle conteneurisé des applications terrain — run',
      months_ago: 4,
      billed_days: 19,
      paid_days: 19,
      payment_delay_days: 45,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Convergence des applications temps réel — lots interfaces et reprise',
      months_ago: 2,
      billed_days: 20,
      paid_days: 20,
      payment_delay_days: 22,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Convergence des applications temps réel — lots interfaces et reprise',
      months_ago: 3,
      billed_days: 21,
      paid_days: 21,
      payment_delay_days: 33,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    /**
     * #2566.4 — LES DEUX MOIS DÉJÀ FACTURÉS de la mission longue au bon de
     * commande expiré (voir sa fiche dans `missions`, ci-dessus). Sans eux,
     * cette mission n'aurait qu'un blocage à montrer — jamais l'historique
     * réglé qui en fait une RECONDUCTION mensuelle, pas un premier mois.
     *
     * Réglés, non contestés, datés : deux lignes « propres » de plus, comme
     * les six autres missions actives de ce tableau. `months_ago: 2` et `3`,
     * jamais 0 ni 1 — le mois que l'écran « Prêt à facturer » ouvre par
     * défaut, gardé intact pour la même raison que partout ailleurs ici.
     *
     * ⚠️ Vingt et quarante jours de délai, pas au hasard : insérés dans les
     * dix délais propres existants (18,21,22,29,31,33,38,45,52,61), ils
     * encadrent la paire centrale (31,33) sans la déplacer — la MÉDIANE reste
     * TRENTE-DEUX jours. Seul le PLANCHER de mesurabilité cesse d'être exact
     * (`demo-dataset.spec.ts` §D42, recalibré par ce lot).
     */
    {
      mission: 'Supervision de la chaîne de production — mission longue',
      months_ago: 2,
      billed_days: 20,
      paid_days: 20,
      payment_delay_days: 20,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Supervision de la chaîne de production — mission longue',
      months_ago: 3,
      billed_days: 20,
      paid_days: 20,
      payment_delay_days: 40,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    /**
     * ────────────────────────────────────────────────────────────────────────
     * LES DEUX IMPAYÉES — sans elles, l'écran « Encaissements » n'a rien à
     * montrer de ce pour quoi il existe
     * ────────────────────────────────────────────────────────────────────────
     * Les quinze lignes ci-dessus sont TOUTES réglées : elles ont été semées
     * pour la tuile « Délai de paiement », qui ne regarde que ce qui est rentré.
     * Le seau « En retard » de l'écran d'encaissement restait donc vide, et avec
     * lui la gravité colorée du retard et la relance due — c'est-à-dire toute la
     * raison d'ouvrir l'écran.
     *
     * Elles vivent sur la mission INTERROMPUE, et c'est le cas le plus
     * reconnaissable d'une ESN : le chantier s'est arrêté en cours de route, les
     * deux derniers mois ont été facturés, et le client a cessé de répondre.
     * C'est exactement l'argent qu'on ne va chercher que si un écran le nomme.
     *
     * ⚠️ Elles n'entrent dans AUCUN calcul de délai de paiement : les deux
     * requêtes du DSO filtrent `ir.paid_at IS NOT NULL`. Une impayée est un
     * RETARD, pas un délai — la moyenne d'un portefeuille ne se mesure pas sur
     * une facture qui n'est jamais rentrée.
     *
     * ⚠️ Les mois 8 et 9 sont choisis DANS la fenêtre de cette mission
     * (commencée il y a 310 jours, arrêtée il y a 214) : `demo-dataset.spec.ts`
     * le vérifie sur trois ans de calendrier, et un mois hors mission serait
     * invisible à l'écran (la requête borne sur `started_on` / `ends_on`).
     *
     * ⚠️ LE SEAU « EN ATTENTE » RESTE VIDE, ET C'EST MESURÉ, PAS OUBLIÉ. Une
     * facture émise et PAS ENCORE ÉCHUE porte forcément sur un mois récent —
     * or les deux mois récents sont justement ceux que ce jeu laisse SANS
     * facture, pour que l'écran « Prêt à facturer » puisse montrer ses trois
     * états. Reste le mois M-2 : ses trois créneaux sûrs sont déjà pris, et les
     * autres missions n'ont pas de fenêtre qui le couvre à toutes les dates de
     * visite (la garde balaie trois ans de calendrier). Poser la ligne ailleurs
     * la rendrait invisible un jour sur deux — ce qui est pire qu'un seau vide,
     * parce qu'on ne saurait plus lequel des deux on regarde.
     */
    {
      mission: 'Reprise de l’ordonnancement des flux — lot pilote',
      months_ago: 8,
      billed_days: 18,
      /** Jamais rentrée. `null` et non `0` : « zéro euro encaissé » et « on
       *  n'a rien encaissé du tout » ne se lisent pas pareil sur un compteur. */
      paid_days: null as number | null,
      /** Aucun règlement : il n'y a pas de délai à mesurer, seulement un retard
       *  à afficher. */
      payment_delay_days: null as number | null,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
    {
      mission: 'Reprise de l’ordonnancement des flux — lot pilote',
      months_ago: 9,
      billed_days: 20,
      paid_days: null as number | null,
      payment_delay_days: null as number | null,
      dispute_opened_days_after_invoice: null,
      dispute_resolved_days_after_invoice: null,
      dispute_reason: null,
    },
  ],
}

/**
 * Les factures du client d'exemple, DATÉES pour la visite en cours.
 *
 * Tout est relatif à `now`, comme le reste du jeu : une date en dur afficherait
 * « payé il y a quatorze mois » quelques mois après le déploiement.
 *
 * La dérivation vit ICI et nulle part ailleurs — le seed l'insère, les tests la
 * relisent. Deux chemins qui la referaient divergeraient, et c'est le semis qui
 * aurait tort sans que personne ne le sache.
 *
 * ⚠️ MIDI UTC, jamais minuit. Le SQL du délai de paiement fait
 * `to_char(ir.invoiced_at, 'YYYY-MM-DD')`, qui convertit dans le fuseau de la
 * SESSION : à minuit, un serveur à l'est ou à l'ouest lit un autre jour et le
 * délai vaut un jour de plus ou de moins. À midi, aucun fuseau réel ne bouge la
 * date.
 *
 * ⚠️ Émission le 5 du mois SUIVANT : on facture un mois une fois qu'il est clos.
 */
export function demoInvoiceHistory(now: number): {
  missionLabel: string
  /** Le mois couvert, au premier du mois — la maille de `(mission_id, period_month)`. */
  periodMonth: string
  reference: string
  invoicedAt: string
  /** `null` si la mission n'a pas de TJM : un montant ne s'invente pas. */
  invoicedAmountCents: number | null
  dueOn: string
  /** `null` = JAMAIS RENTRÉE. Une impayée est un retard, pas un délai : elle
   *  sort des deux requêtes du délai de paiement (`paid_at IS NOT NULL`) et
   *  entre dans le seau « En retard » de l'écran d'encaissement. */
  paidAt: string | null
  paidAmountCents: number | null
  disputedAt: string | null
  disputeReason: string | null
  disputeResolvedAt: string | null
}[] {
  const day = 86_400_000
  const visit = new Date(now)
  const rateByMission = new Map(DEMO_DELIVERY_CLIENT.missions.map(mission => [mission.label, mission.daily_rate]))

  return DEMO_DELIVERY_CLIENT.invoices.map((invoice, index) => {
    const period = new Date(Date.UTC(visit.getUTCFullYear(), visit.getUTCMonth() - invoice.months_ago, 1))
    const periodMonth = period.toISOString().slice(0, 10)
    const invoicedAt = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 5, 12))
    const shift = (days: number): string => new Date(invoicedAt.getTime() + days * day).toISOString()
    // `undefined` (mission introuvable) et `null` (forfait sans TJM) mènent au
    // même endroit : on n'écrit pas de montant. Jamais `0`, qui se lirait
    // « facturé zéro euro » sur un écran de chiffre d'affaires.
    const rate = rateByMission.get(invoice.mission) ?? null
    // ⚠️ `days === null` (facture jamais réglée) rend `null` et JAMAIS 0 : « zéro
    // euro encaissé » se lirait comme un règlement à zéro, alors que rien n'est
    // rentré du tout. Les deux ne se corrigent pas de la même façon.
    const cents = (days: number | null): number | null => (rate === null || days === null ? null : rate * days * 100)

    return {
      missionLabel: invoice.mission,
      periodMonth,
      // La référence suit le MOIS couvert : un numéro qui citerait l'année en
      // cours serait faux le jour où la salle est rejouée l'année suivante.
      reference: `F-${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}-${String(index + 1).padStart(2, '0')}`,
      invoicedAt: invoicedAt.toISOString(),
      invoicedAmountCents: cents(invoice.billed_days),
      dueOn: shift(30).slice(0, 10),
      paidAt: invoice.payment_delay_days === null ? null : shift(invoice.payment_delay_days),
      paidAmountCents: cents(invoice.paid_days),
      disputedAt:
        invoice.dispute_opened_days_after_invoice === null ? null : shift(invoice.dispute_opened_days_after_invoice),
      disputeReason: invoice.dispute_reason,
      disputeResolvedAt:
        invoice.dispute_resolved_days_after_invoice === null
          ? null
          : shift(invoice.dispute_resolved_days_after_invoice),
    }
  })
}

/**
 * #2419.9 — UN PAIEMENT NON RAPPROCHÉ, pour que la tuile ait quelque chose à
 * montrer.
 *
 * `invoice_payments` était classée « vide à dessein » dans `demo-coverage.ts`
 * (#2419.1) : aucun écran ne la lisait encore. Le seau « Non rapproché » de
 * `/pilotage/finance` la lit désormais — la laisser vide ferait un écran
 * livré, muet devant un prospect (craft rule n°9), la leçon déjà payée par
 * l'onglet « Sites ».
 *
 * UNE seule ligne, sans mission ni facture rattachées : c'est le sens même
 * de « non rapproché » (#2419.1, `invoice_readiness_id NULL`) — un virement
 * reçu et constaté par quelqu'un, qu'aucun humain n'a encore rattaché.
 * `payer` porte un libellé bancaire réaliste, pas un nom de client : un
 * virement non rapproché est précisément celui dont le libellé ne suffit pas
 * à savoir qui a payé.
 */
export function demoUnmatchedPayments(now: number): {
  amountCents: number
  receivedOn: string
  payer: string
  reference: string
}[] {
  const day = 86_400_000
  return [
    {
      amountCents: 480_000,
      receivedOn: new Date(now - 6 * day).toISOString().slice(0, 10),
      payer: 'Virement SEPA — libellé « REF 88213 »',
      reference: 'VIR-DEMO-01',
    },
  ]
}

/**
 * Le rôle recherché posé sur le projet le plus avancé du PIPE — celui des cinq
 * dossiers réels, pas du client d'exemple.
 *
 * Il vivait en dur dans le SQL du seed. Il est remonté ici pour une raison
 * précise : la garde qui vérifie quelles COLONNES du kanban des besoins la
 * démonstration remplit doit pouvoir le LIRE. Une garde qui recopie à la main la
 * liste des états seedés cesse d'être vraie à la première ligne ajoutée
 * ailleurs — et un inventaire ne prouve jamais sa propre complétude.
 *
 * `status_changed_at` à douze jours et `source`/`provenance` renseignées : sans
 * elles, la seule ligne du kanban dirait « non mesuré » et « origine inconnue »,
 * honnête et impossible à distinguer d'une colonne cassée pour qui regarde
 * l'écran pour la première fois. `client_email` + `human` racontent le cas le
 * plus fort du produit : un client a ÉCRIT, ce n'est pas un indice deviné.
 *
 * ⚠️ Il était en « shortlist prête » et portait ZÉRO profil positionné — aucun
 * positionnement de la salle ne renseignait `need_id`. La carte annonçait donc
 * une shortlist prête au-dessus de « aucun profil positionné » : un écran qui se
 * contredit tout seul. « Matching à lancer » est ce que les données disent
 * vraiment, et c'est aussi l'état vers lequel la bulle `long_bench` pousse — le
 * geste proposé et l'état du besoin se répondent enfin. La « shortlist prête »
 * de la démonstration vit désormais chez le client d'exemple, avec son profil.
 */
/**
 * Théo C projects-besoins — la page d'origine de l'offre qui a fait naître le besoin phare : le lien est
 * VISIBLE sur la ligne et la carte du besoin (« sources cliquables »). Une vraie page publique, jamais un
 * domaine inventé.
 */
export const DEMO_FLAGSHIP_NEED_SOURCE_URL = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi'

export const DEMO_FLAGSHIP_NEED = {
  title: 'Architecte de plateforme',
  status: 'to_match' as const,
  status_changed_days_ago: 12,
  skills: [
    { term: 'Kubernetes', required: true },
    { term: 'Terraform', required: true },
    { term: 'Observabilité', required: false },
  ],
  seniority: 'senior',
  headcount: 2,
  target_tjm_cents: 650_00,
  /**
   * Le LIEU, que la ligne « lieu · mode » de la carte lit. Sans lui, la carte
   * n'affichait que le mode — une moitié de ligne sur la seule carte visible.
   *
   * ⚠️ « Lyon » et non « Île-de-France » depuis le 30/08/2026 — LA PROSPECTION
   * INVERSÉE DEPUIS UN BESOIN (`GET /projects/needs/:needId/reverse-prospects`)
   * exige deux besoins ouverts, sur des comptes DIFFÉRENTS, qui partagent leur
   * zone. Aucune paire de la salle ne la partageait : ce besoin était seul en
   * « Île-de-France », les cinq de SNCF en « Lyon (69) » ou
   * « Lyon ». Reprendre le siège du client d'exemple (`DEMO_DELIVERY_CLIENT.
   * account.headquarters`) fait apparaître une piste RÉELLE — ses compétences
   * (Kubernetes, Terraform) recoupaient déjà « Ingénieur infrastructure —
   * socle conteneurisé du portail », sur un AUTRE compte — sans qu'aucune autre
   * donnée n'ait besoin de changer. Recompté sur le jeu, avec les mêmes
   * fonctions que le serveur (`sameZone`, `sharedSkillTerms`), par
   * `demo-reverse-prospects-coverage.spec.ts`.
   */
  location: 'Lyon',
  // #2173.29
  remote: 'hybride' as const,
  contract_kind: 'regie' as const,
  urgency: 'haute' as const,
  source: 'client_email' as const,
  provenance: 'human' as const,
}

/**
 * Le pipeline PARTENAIRE de la salle de démonstration (tome 4 §11).
 *
 * Trois ESN FICTIVES — domaines `.example`, comme le reste du jeu — à trois
 * étapes différentes du cycle, parce que c'est le cycle qui se montre, pas une
 * liste. Celle qui est en « flux actif » porte des placements : c'est le seul
 * état où le score à cinq axes existe, et un prospect doit pouvoir constater
 * que l'outil DIT « pas encore assez d'historique » sur les deux autres plutôt
 * que d'afficher un zéro.
 */
/**
 * Les territoires SUIVIS par l'espace de démonstration (tome 4 §21.3).
 *
 * Deux départements et pas dix : l'écran Marché montre une variation semaine
 * après semaine, et une liste de dix lignes toutes à « — » se lirait comme une
 * panne plutôt que comme une veille qui vient de démarrer.
 */
export const DEMO_TERRITORIES: readonly string[] = ['31', '69']

/**
 * CE QUE LAURA GARDE EN TÊTE dans la salle de démonstration.
 *
 * Pourquoi ces lignes existent. L'écran Réglages › Mémoire de Laura (tome 6
 * §12.1) est la réponse à « qu'est-ce qu'elle sait de moi ? ». Ouvert vide, il
 * répond « rien » — c'est-à-dire qu'il ne montre NI la capacité, NI le geste qui
 * la rend acceptable : retirer une ligne. La table était classée « vide à
 * dessein » au motif que « la mémoire se remplit en épinglant une réponse » ;
 * c'était vrai tant que la mémoire ne vivait que dans la barre du copilote, où
 * l'on passe justement pour épingler. Ce n'est plus vrai d'un écran de réglages,
 * qu'on ouvre pour VÉRIFIER.
 *
 * Trois lignes et pas dix, choisies pour montrer les trois natures — un fait
 * constaté, une façon de travailler, une correction imposée — et l'échéance, qui
 * est la seule chose que la liste ne peut pas raconter autrement. Le visiteur
 * peut toujours en épingler une quatrième depuis la barre du copilote : le geste
 * reste montrable, il n'est simplement plus le seul contenu de l'écran.
 *
 * ⚠️ `expiresInDays` est un DÉLAI, pas une date : figée, l'échéance finirait par
 * être dépassée et la ligne disparaîtrait de l'écran sans que personne ne l'ait
 * décidé — c'est le même piège que la photo « du mois dernier » des indicateurs
 * de stock.
 */
export const DEMO_MEMORY_FACTS: readonly {
  fact: string
  /**
   * #1962 — la NATURE, lue dans le contrat plutôt que recopiée : une nature
   * ajoutée là-bas est immédiatement semable ici, et une nature retirée fait
   * rougir ce fichier au lieu de semer une valeur que la base refuserait.
   */
  kind: MemoryItemKind
  origin: 'manual' | 'copilot' | 'analysis'
  /**
   * #1918.1 / #1918.2 — pour qui l'élément vaut : `user` (le propriétaire de la
   * salle, sous lequel le visiteur est connecté), `workspace` (tout l'espace)
   * ou `business_unit` (les membres d'UN périmètre, nommé par `businessUnit`).
   * Chaque portée SEMÉE l'est au moins une fois SANS compte — voir
   * `DEMO_MEMORY_SCOPE_COVERAGE` et `demo-memory-scope-coverage.spec.ts`.
   * `conversation` n'est pas semée, et la raison est écrite au registre.
   */
  scope: 'user' | 'workspace' | 'business_unit'
  /** Le compte concerné, par son nom, ou `null` pour tout l'espace. */
  company: string | null
  /**
   * #1918.2 — le périmètre concerné, par son NOM (`DEMO_BUSINESS_UNITS`), pour
   * `scope: 'business_unit'` et pour elle seule. Le semis le résout en
   * identifiant ; introuvable, il SAUTE la ligne — un élément d'équipe sans
   * équipe serait une portée qui ne filtre rien.
   */
  businessUnit?: string | null
  /**
   * #2260.7 — L'OBJET VISÉ : contact, besoin, consultant ou mission, PAR SON
   * NOM dans le référentiel qui le porte (`contacts.full_name`,
   * `project_needs.title`, `consultants.full_name`, `missions.label`). Le
   * semis le résout en identifiant, bornée à l'espace de la salle ; introuvable,
   * il SAUTE la ligne — un objet visé qui ne désigne rien mentirait sur ce que
   * la ligne est.
   */
  object?: { type: MemoryItemObjectType; name: string } | null
  daysAgo: number
  /** Un DÉLAI depuis le semis ; négatif = déjà échu (#1916.24 : « non utilisé par Laura aujourd'hui »). */
  expiresInDays: number | null
  /**
   * Q1 (décision de Louis du 13/09) — pour une note de Laura (`origin:
   * 'copilot'`) : il y a combien de jours le propriétaire de la salle l'a
   * CONFIRMÉE en en réécrivant le texte. Absent = jamais confirmée (« à
   * vérifier »). Le geste correspondant (`text_changed`) figure dans `history`.
   */
  confirmedDaysAgo?: number
  /**
   * #1916.23 — les gestes déjà faits sur l'élément, du plus ancien au plus
   * récent, par le propriétaire de la salle. Écrits dans `memory_fact_events`
   * (voir `DemoSeedService`), recomptés par `demo-memory-sections-coverage.spec.ts`.
   */
  history?: readonly {
    event: 'text_changed' | 'scope_changed' | 'expiry_changed'
    daysAgo: number
    previousValue: string | null
    newValue: string | null
  }[]
}[] = [
  {
    fact: "Chez ce groupe, le référencement fournisseur se rejoue en fin d'année : rien ne se signe avant octobre.",
    kind: 'fact',
    origin: 'copilot',
    // Une note de Laura : le défaut de la décision du 12/09 (« toi uniquement »).
    scope: 'user',
    company: 'Société Générale',
    daysAgo: 9,
    expiresInDays: null,
  },
  {
    // #1918.2 — LA MÉMOIRE D'UNE ÉQUIPE, dans la salle : ni « moi », ni toute
    // l'ESN. Le visiteur porte « Agence Lyon » (`seedBusinessUnits` l'y
    // rattache), donc il la VOIT, avec le nom du périmètre en badge — ce qui est
    // exactement ce que #1918.2 demandait de distinguer. Sans compte : elle ne
    // dépend d'aucune résolution, donc le semis ne peut pas la sauter.
    fact: "À Lyon, on ne se positionne pas sous 480 € par jour sur les profils Data — c'est la règle de l'agence.",
    kind: 'workspace_rule',
    origin: 'manual',
    scope: 'business_unit',
    businessUnit: 'Agence Lyon',
    company: null,
    daysAgo: 14,
    expiresInDays: null,
  },
  {
    fact: 'Je préfère des messages courts, tutoiement, trois lignes maximum — pas de formule de politesse longue.',
    kind: 'preference',
    origin: 'manual',
    // L'exemple même du retour #1918 : une préférence personnelle ne devient pas
    // une règle de toute l'ESN. Sans compte : elle ne dépend d'aucune résolution.
    scope: 'user',
    company: null,
    daysAgo: 21,
    expiresInDays: null,
  },
  {
    fact: "Ne propose plus de régie pure : l'ESN ne vend qu'au forfait et en centre de services.",
    kind: 'correction',
    origin: 'manual',
    // Une règle de l'ESN, que la personne a choisi de PARTAGER : c'est la ligne
    // qui montre le badge « Toute ton ESN » à côté des deux « Toi uniquement ».
    scope: 'workspace',
    company: null,
    daysAgo: 4,
    // #1916.9 — SANS échéance depuis le 13/09 : une correction datée se range
    // dans « Éléments temporaires » (l'échéance prime), et la section
    // « Corrections terrain » resterait vide. L'échéance est montrée par
    // l'élément temporaire ci-dessous.
    expiresInDays: null,
    // #1916.23 — son histoire : posée « pour moi », partagée le lendemain, puis
    // précisée. C'est l'élément dont le bouton « Historique » raconte le plus.
    history: [
      { event: 'scope_changed', daysAgo: 3, previousValue: 'user', newValue: 'workspace' },
      {
        event: 'text_changed',
        daysAgo: 2,
        previousValue: 'Ne propose plus de régie.',
        newValue: "Ne propose plus de régie pure : l'ESN ne vend qu'au forfait et en centre de services.",
      },
    ],
  },
  {
    // Q1 (13/09) — une note de Laura CONFIRMÉE : le propriétaire de la salle en a
    // réécrit le texte il y a deux jours. L'origine reste « retenue d'une réponse
    // de Laura » ; le libellé dit « confirmée par <prénom> ». Sans compte : le
    // semis ne peut pas la sauter.
    fact: "Les appels d'offres publics de la région passent désormais par la plateforme régionale : réponse en ligne uniquement.",
    kind: 'fact',
    origin: 'copilot',
    scope: 'workspace',
    company: null,
    daysAgo: 8,
    expiresInDays: null,
    confirmedDaysAgo: 2,
    history: [
      {
        event: 'text_changed',
        daysAgo: 2,
        previousValue: "Les appels d'offres publics passeraient par une plateforme régionale.",
        newValue:
          "Les appels d'offres publics de la région passent désormais par la plateforme régionale : réponse en ligne uniquement.",
      },
    ],
  },
  {
    // #1916.6 — un OBJECTIF PERSONNEL : pour soi, sans compte ni échéance.
    fact: "Mon objectif du trimestre : deux nouveaux comptes signés en Occitanie, dont un dans l'aéronautique.",
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    company: null,
    daysAgo: 12,
    expiresInDays: null,
  },
  {
    // #1916.7 — une RÈGLE DE L'ESN : partagée avec tout l'espace, sans compte.
    fact: "Nous ne répondons pas aux appels d'offres de tierce maintenance applicative sous 300 k€.",
    kind: 'fact',
    origin: 'manual',
    scope: 'workspace',
    company: null,
    daysAgo: 30,
    expiresInDays: null,
  },
  {
    // #1916.11 — un ÉLÉMENT TEMPORAIRE en service : l'échéance à quarante jours
    // montre « Jusqu'au … » sans jamais expirer pendant une démonstration.
    fact: 'Jusqu’au salon de Toulouse, priorité aux comptes de Haute-Garonne dans les relances.',
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    company: null,
    daysAgo: 6,
    expiresInDays: 40,
  },
  {
    // #1916.24 / #1916.22 — un élément ÉCHU : il reste à l'écran avec sa date,
    // marqué « non utilisé par Laura aujourd'hui » — « on archive, on ne
    // supprime pas ». Échu douze jours après… quarante-cinq jours de vie.
    fact: 'Pendant les congés d’août, ne propose pas de rendez-vous avant le 1er septembre.',
    kind: 'preference',
    origin: 'manual',
    scope: 'user',
    company: null,
    daysAgo: 45,
    expiresInDays: -12,
  },
  // ───────────────────────────────────────────────────────────────────────────
  // #1962.5/.7/.9/.10 — LES QUATRE NATURES AJOUTÉES, UNE CHACUNE.
  //
  // Sans elles, la salle de démonstration montre quatre étiquettes de nature
  // que personne ne voit jamais : l'écran serait livré et l'écart se
  // découvrirait en réunion. Chacune est écrite comme un commercial l'aurait
  // écrite, et la différence entre les quatre se LIT sur la ligne.
  // ───────────────────────────────────────────────────────────────────────────
  {
    // Une RÈGLE DE L'ESN nommée comme telle : partagée, et son étiquette le dit.
    fact: 'Nous ne signons aucun contrat-cadre sans clause de révision annuelle des taux.',
    kind: 'workspace_rule',
    origin: 'manual',
    scope: 'workspace',
    company: null,
    daysAgo: 21,
    expiresInDays: null,
  },
  {
    // Une OBSERVATION SOURCÉE : elle cite d'où elle vient, dans son texte.
    fact: "Ouverture d'un centre de services à Nantes annoncée au communiqué du 3 mars — 40 recrutements visés.",
    kind: 'sourced_observation',
    origin: 'analysis',
    scope: 'workspace',
    company: null,
    daysAgo: 15,
    expiresInDays: null,
  },
  {
    // Une HYPOTHÈSE : Laura l'a tirée d'une réponse, personne ne l'a vérifiée.
    // La ligne dit « elle éclaire, elle ne tranche pas » — et le prompt ne la
    // range PLUS avec les faits à respecter en priorité.
    fact: 'Ils réinternaliseraient une partie de leur data engineering — à confirmer auprès de la DSI.',
    kind: 'hypothesis',
    origin: 'copilot',
    scope: 'user',
    company: null,
    daysAgo: 4,
    expiresInDays: null,
  },
  {
    // Un CONTEXTE TEMPORAIRE : la NATURE, avec une échéance qui ne tombe pas
    // pendant une démonstration.
    fact: "Appel d'offres en cours sur le lot infrastructure : ne pas relancer les opérationnels d'ici la remise.",
    kind: 'temporary_context',
    origin: 'manual',
    scope: 'workspace',
    company: null,
    daysAgo: 3,
    expiresInDays: 35,
  },
  // ───────────────────────────────────────────────────────────────────────────
  // #2260.7 — L'OBJET VISÉ, UN PAR TYPE : contact, besoin, consultant, mission.
  //
  // Sans ces quatre lignes, le badge nommé et cliquable que ce lot ajoute à
  // Réglages › Mémoire de Laura ne se verrait jamais en démonstration — une
  // capacité livrée mais invisible (craft rule n°9). Les quatre anchors sont
  // DÉJÀ semés ailleurs (`seedDeliveryClient`, `seedVivier`, `DEMO_STAFFED_NEED`) :
  // rien n'est inventé pour l'occasion, voir `DEMO_MEMORY_OBJECT_COVERAGE`.
  // ───────────────────────────────────────────────────────────────────────────
  {
    // Un SIÈGE (sans nom) du dossier SNCF — décision Louis 04/10/2026 : une note
    // de l'équipe sur un rôle, jamais une déclaration sur une personne réelle.
    fact: 'Contact de facturation déclaré par l’équipe pour les missions SNCF : le siège « Directeur technique — entité numérique voyageurs ».',
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    company: DEMO_DELIVERY_CLIENT.account.company_name,
    object: { type: 'contact', name: seatName('Directeur technique — entité numérique voyageurs') },
    daysAgo: 5,
    expiresInDays: null,
  },
  {
    // Le rôle POURVU (`DEMO_STAFFED_NEED`) — la mission qui en est née est
    // celle que la salle montre en cours.
    fact: 'Le renfort d’exploitation a été calé sur un régime d’astreinte identique à celui déjà en place.',
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    company: DEMO_DELIVERY_CLIENT.account.company_name,
    // Le titre EXACT de `DEMO_STAFFED_NEED.title` — une référence directe est
    // impossible ici (déclaré plus bas dans ce fichier, `const` en zone morte
    // temporelle) ; `demo-memory-object-coverage.spec.ts` ne recompte que le
    // TYPE, pas ce texte, donc rien ne garde les deux synchronisés à part ce
    // commentaire — les deux valent « Ingénieur d’exploitation — renfort
    // plateforme ».
    object: { type: 'need', name: 'Ingénieur d’exploitation — renfort plateforme' },
    daysAgo: 18,
    expiresInDays: null,
  },
  {
    // Le consultant affecté à la mission « Fiabilisation plateforme ».
    fact: 'Yanis Berthier connaît déjà la plateforme de supervision — l’a suggéré lui-même côté client.',
    kind: 'preference',
    origin: 'manual',
    scope: 'user',
    company: null,
    object: { type: 'consultant', name: 'Yanis Berthier' },
    daysAgo: 10,
    expiresInDays: null,
  },
  {
    // La mission née du rôle pourvu ci-dessus.
    fact: 'Le client demande un point d’avancement mensuel sur cette mission, hors relevé d’activité.',
    kind: 'fact',
    origin: 'manual',
    scope: 'workspace',
    company: DEMO_DELIVERY_CLIENT.account.company_name,
    object: { type: 'mission', name: 'Fiabilisation plateforme — renfort exploitation' },
    daysAgo: 7,
    expiresInDays: null,
  },
]

export const DEMO_PARTNER_RELATIONS: readonly {
  name: string
  stage: string
  roles: string[]
  contactName: string | null
  needsReceived90d: number
  needsGiven90d: number
  placementsActive: number
  placementsTotal: number
  lastActivityDaysAgo: number
  notes: string | null
  /** La clause de non-sollicitation du cadre. `null` = personne ne l'a
   *  déclarée — l'état de DÉPART, et le plus fréquent en vrai. */
  nonSolicitation: boolean | null
  /** #3270 (BEL-SC-241) — le cadre de gouvernance rang 2, quand une des
   *  quatre ESN de démo le porte. Absent = aucun champ cadré (l'état de
   *  départ de la plupart des lignes réelles), pas une valeur devinée. */
  governance?: {
    entryDoorScope?: string | null
    accountsAccessible?: string[] | null
    accountsForbidden?: string[] | null
    profilesSought?: string[] | null
    domainsCovered?: string[] | null
    marginFloorPercent?: number | null
    marginSharePercent?: number | null
    accountOwnership?: string | null
    actionOwnership?: string | null
    presentationTerms?: string | null
    paymentTerms?: string | null
    delayTerms?: string | null
    ourContactName?: string | null
    ourContactEmail?: string | null
    durationTerms?: string | null
    exitConditions?: string | null
    referencingProof?: string | null
    confidentialityLevel?: string | null
  }
}[] = [
  {
    name: 'Talan / Talan Consulting',
    stage: 'flux_actif',
    roles: ['client'],
    contactName: 'Directrice d’agence Sud-Ouest',
    needsReceived90d: 7,
    needsGiven90d: 2,
    placementsActive: 3,
    placementsTotal: 6,
    lastActivityDaysAgo: 4,
    notes:
      'Observée chez Groupe BPCE par le brief (groupement avec Capgemini sur le programme de transformation) — flux de débordements Data déclaré par l’équipe de démonstration.',
    // Personne n'a lu le cadre pour y chercher la clause : c'est l'état de
    // départ, et c'est la garde « aussi notre client » qui bloque ici.
    nonSolicitation: null,
    // #3270 — LE PÉRIMÈTRE EST CADRÉ, LA MARGE ET LE NON-CONTOURNEMENT NE LE
    // SONT PAS : exactement l'exemple du retour bêta (« aucune règle de
    // marge ni de non-contournement n'est enregistrée »). PARTNER READINESS
    // rend donc « rules_missing », pas « active », malgré le flux réel — la
    // preuve que le statut se dérive du CADRE, jamais du seul flux.
    governance: {
      entryDoorScope: 'Débordements Data sur le programme de transformation de Groupe BPCE',
      accountsAccessible: ['Groupe BPCE'],
      profilesSought: ['Data engineer', 'Analytics engineer'],
      domainsCovered: ['Data'],
      accountOwnership: 'partner',
      actionOwnership: 'shared',
      presentationTerms: 'CV anonymisé, validation avant envoi au client final',
      ourContactName: 'Julie Marchand',
      ourContactEmail: 'julie.marchand@bellum-it.com',
      durationTerms: 'Reconduction tacite, revue annuelle',
    },
  },
  {
    name: 'Devoteam',
    stage: 'en_discussion',
    roles: ['client', 'concurrent'],
    contactName: 'Business manager Toulouse',
    needsReceived90d: 0,
    needsGiven90d: 0,
    placementsActive: 0,
    placementsTotal: 0,
    lastActivityDaysAgo: 11,
    notes:
      'Observée chez ENGIE et Société Générale par leurs briefs (externes en poste) — échange en cours déclaré par l’équipe de démonstration.',
    nonSolicitation: null,
  },
  {
    name: 'Avanade',
    stage: 'identifie',
    roles: ['fournisseur'],
    contactName: null,
    needsReceived90d: 0,
    needsGiven90d: 1,
    placementsActive: 0,
    placementsTotal: 1,
    lastActivityDaysAgo: 32,
    notes: 'Observée chez ENGIE par le brief (deux externes en poste) — jamais contactée.',
    nonSolicitation: null,
  },
  {
    // La QUATRIÈME, et sa raison d'être : c'est la seule qui montre l'AUTRE
    // garde dure. Les deux refus qui protègent « viser le rang 1 » étaient
    // écrits et jamais armés ; une démo où aucun ne se déclenche laisserait
    // exactement la même impression qu'avant — celle d'un garde-fou qu'on
    // croit voir. Elle a donc l'historique nécessaire (≥ 3 placements) ET une
    // clause DÉCLARÉE, qui l'emporte sur tout le reste.
    name: 'Serma Safety & Security',
    stage: 'cadre_signe',
    roles: ['fournisseur'],
    contactName: 'Directeur du développement',
    needsReceived90d: 4,
    needsGiven90d: 0,
    placementsActive: 2,
    placementsTotal: 5,
    lastActivityDaysAgo: 7,
    notes:
      'Observée chez ENGIE par le brief (deux externes en poste) — cadre et clause de non-sollicitation déclarés par l’équipe de démonstration.',
    nonSolicitation: true,
    // #3270 — LE CADRE COMPLET : les dix-huit dimensions sont posées (la
    // clause de non-sollicitation ci-dessus EST la dix-huitième,
    // « non-contournement » — voir le docblock de `partner-governance.ts`).
    // PARTNER READINESS rend « active » (risque nul, stage `cadre_signe`) :
    // le seul des quatre exemples de démo qui le montre.
    governance: {
      entryDoorScope: 'Sûreté et sécurité des systèmes, comptes énergie',
      accountsAccessible: ['ENGIE'],
      accountsForbidden: [],
      profilesSought: ['Ingénieur sûreté de fonctionnement', 'Ingénieur validation'],
      domainsCovered: ['Sûreté', 'Validation'],
      marginFloorPercent: 12,
      marginSharePercent: 25,
      accountOwnership: 'partner',
      actionOwnership: 'shared',
      presentationTerms: 'CV anonymisé, brief écrit avant tout envoi',
      paymentTerms: '45 jours fin de mois',
      delayTerms: '48h pour répondre à un brief',
      ourContactName: 'Julie Marchand',
      ourContactEmail: 'julie.marchand@bellum-it.com',
      durationTerms: '12 mois reconductibles',
      exitConditions: 'Préavis de 30 jours de part et d’autre',
      referencingProof: 'Cadre signé le 03/04/2026, référencé par le directeur du développement',
      confidentialityLevel: 'restricted',
    },
  },
  {
    // #3270.6 (SURFACES, lot Q08 30/09) — LA CINQUIÈME, ET SEULE À AVOIR UN
    // JUMEAU DANS `account_partners` : c'est le MÊME nom que
    // `DEMO_SPRINT_PARTNER_ROUTE_PARTNER` (déclaré sur SNCF, plus haut dans ce
    // fichier). Sans ce jumeau, le rapprochement par nom que la fiche Compte
    // fait maintenant (`TabPartners.tsx`, en lecture seule) resterait invisible
    // en démo — un écran livré mais vide en démo se découvre en réunion, pas
    // en CI (craft rule 9). Aucun cadre encore posé : c'est l'état réel d'un
    // partenaire tout juste identifié comme voie d'entrée, pas encore gouverné
    // — PARTNER READINESS y rend « observed », un TROISIÈME statut de démo
    // (Talan = rules_missing, Serma = active).
    name: 'CGI',
    stage: 'identifie',
    roles: ['fournisseur'],
    contactName: null,
    needsReceived90d: 0,
    needsGiven90d: 0,
    placementsActive: 0,
    placementsTotal: 0,
    lastActivityDaysAgo: 21,
    notes: 'Observée chez BNP Paribas par le brief — voie d’entrée identifiée, cadre pas encore posé.',
    nonSolicitation: null,
  },
  {
    /**
     * #3404.5 — LA CINQUIÈME, ET SA RAISON D'ÊTRE : LE LIEN ENTRE UNE
     * PRÉSENCE RANG 2 ET LE CADRE GOUVERNÉ.
     *
     * Même nom que la quatrième ligne du client FICTIF (`client.partners`,
     * « mc2i », rang 2 / partenaire) : c'est
     * `demo-seed.service.ts` qui pose `account_partners.partner_relation_id`
     * vers CETTE ligne, une fois les deux insérées. Sans elle, l'onglet
     * Partenaires du compte fictif n'aurait jamais montré qu'un rang 2 peut
     * être un objet métier structuré — seulement un badge.
     *
     * Le cadre est délibérément CONTRADICTOIRE avec le flux réel (2 placements
     * actifs) : une clause de non-sollicitation ET un partage sous le
     * plancher déclaré, pour montrer les DEUX gardes du retour bêta dans la
     * même salle — « interdit une approche directe » et « détruit la marge ».
     */
    name: 'mc2i',
    stage: 'flux_actif',
    roles: ['fournisseur'],
    contactName: 'Responsable du run applicatif',
    needsReceived90d: 2,
    needsGiven90d: 0,
    placementsActive: 2,
    placementsTotal: 3,
    lastActivityDaysAgo: 18,
    notes:
      'Observée chez Société Générale par le relevé du compte (externe en poste) — cadre et clause déclarés par l’équipe de démonstration.',
    nonSolicitation: true,
    governance: {
      entryDoorScope: 'Run applicatif du périmètre reporting',
      accountsAccessible: ['Société Générale'],
      profilesSought: ['Consultant reporting BI'],
      domainsCovered: ['Reporting'],
      marginFloorPercent: 15,
      // Sous le plancher : c'est CE partage, sur CE compte, qui rend visible
      // « quand un rang 2 détruit la marge » (#3404.14).
      marginSharePercent: 8,
      accountOwnership: 'partner',
      actionOwnership: 'shared',
      paymentTerms: '60 jours fin de mois',
      ourContactName: 'Julie Marchand',
      // #3404 (recette démo 01/10) — la date de fin se lit dans la durée : le
      // cadre n'a pas de colonne « fin » séparée (tranché sans Louis : une
      // seule ligne « Durée », jamais une date inventée à côté d'un texte).
      durationTerms: '12 mois reconductibles, échéance au 31/03/2027',
      // #3404 (recette démo 01/10) — « Preuve du référencement » : la modale
      // la liste dans « Manque encore » tant qu'elle n'est pas posée.
      referencingProof: 'Mail de référencement du directeur des achats, 12/02/2026',
    },
  },
  {
    // #3270.6 reste (recette salle démo, 30/09/2026) — LA SIXIÈME, MÊME RAISON
    // QUE LA CINQUIÈME juste au-dessus : le MÊME nom que
    // `DEMO_DELIVERY_CLIENT.account.partners` (« Sopra Steria »,
    // SNCF, rang 1 déclaré). Sans ce jumeau, la modale « Écosystème
    // & accès » de la fiche compte du client d'exemple ouvrait sur AUCUN
    // `PartnerReadinessPanel` — le rapprochement par nom (`TabPartners.tsx`)
    // ne trouvait rien à côté de « Sopra Steria » (SANS le suffixe), une
    // coïncidence de nom dans `accountsAccessible` de Serma Safety & Security
    // (gouvernance, ci-dessus) qui n'est PAS une relation partenaire. Même état
    // que Lorvane : identifiée, cadre pas encore posé — PARTNER READINESS y
    // rend « observed », comme sur SNCF.
    name: 'Sopra Steria',
    stage: 'identifie',
    roles: ['fournisseur'],
    contactName: null,
    needsReceived90d: 0,
    needsGiven90d: 0,
    placementsActive: 0,
    placementsTotal: 0,
    lastActivityDaysAgo: 190,
    notes:
      'Leur nom revient sur les offres data du client d’exemple — voie d’entrée identifiée, cadre pas encore posé.',
    nonSolicitation: null,
  },
]

/**
 * L'HISTORIQUE DE CORRECTION de l'organigramme du dossier d'exemple
 * (OrgGraph FINAL §7 — le tiroir « Historique des corrections »).
 *
 * Sans lui, le tiroir de correction s'ouvre VIDE devant un prospect, et la
 * promesse « versionné et réversible » n'a rien à montrer. Or c'est exactement
 * ce qu'un directeur commercial regarde : qui a corrigé quoi, pourquoi, et
 * est-ce qu'on peut revenir en arrière.
 *
 * ⚠️ Les trois lignes sont COHÉRENTES avec le graphe seedé, et ce n'est pas un
 * détail de présentation : la reprise après un run (`replayCorrections`) rejoue
 * les corrections actives sur le graphe. Une ligne active dont la `newValue` ne
 * serait pas celle du graphe ferait CHANGER l'organigramme de démonstration à
 * la première réanalyse, sans que personne ne comprenne pourquoi.
 *
 *  · la première est active, et sa `newValue` est le titre que le graphe
 *    affiche ;
 *  · la deuxième est ANNULÉE — elle porte sa pierre tombale et n'est pas
 *    rejouée ; le graphe montre donc le niveau d'origine ;
 *  · la troisième EST cette annulation, déposée comme n'importe quelle autre
 *    correction : l'histoire se lit dans un seul sens.
 */
type DemoOrgCorrection = {
  /** Le dossier visé, par son nom d'entreprise — l'id n'existe qu'au semis. */
  companyName: string
  objectType: 'person' | 'entity' | 'edge'
  objectId: string
  field: string
  oldValue: string | null
  newValue: string | null
  reason: string
  evidence: { kind: string; ref?: string; date?: string; claim: string }
  graphVersionBefore: number
  graphVersionAfter: number
  /** Annulée ? La ligne RESTE — on archive, on ne supprime pas. */
  reverted: boolean
  /** Il y a combien de jours. La démonstration date ses faits. */
  daysAgo: number
  /** #2126.26 — le geste : absent = « corriger ». « Confirmer » n'avance pas la version. */
  motive?: 'corrected' | 'confirmed'
}

/**
 * UN plan d'enrichissement d'organigramme par etat visible (§11 FINAL, 31/08/2026).
 *
 * Ce que la salle doit montrer, et qu'un tableau vide ne montrerait pas :
 *
 * - un plan TERMINE, avec l'ecart entre ce qui avait ete ANNONCE et ce qui a
 *   REELLEMENT ete debite : c'est tout l'interet des deux colonnes ;
 * - un plan PARTIEL, dont une vague est tombee. Le bouton « reprendre » a alors
 *   quelque chose a reprendre, et la vague en echec porte un `actualCredits` a
 *   `null` (rien n'a ete debite) et non a `0`, qui dirait « c'etait gratuit ».
 *
 * Les `contactIds` sont fictifs a dessein : la salle montre l'HISTORIQUE d'un
 * plan, pas un plan a executer.
 */
type DemoOrgEnrichmentJob = {
  companyName: string
  mode: 'next_batch' | 'direction' | 'missing_roles'
  targetParams: Record<string, unknown>
  waveSize: number
  estimatedCredits: number
  /** `null` = aucune vague n'a encore abouti. Jamais `0`. */
  actualCredits: number | null
  waves: Array<{
    index: number
    contactIds: string[]
    status: 'pending' | 'done' | 'failed'
    actualCredits: number | null
    matched: number | null
    error: string | null
  }>
  error: string | null
  daysAgo: number
}

/**
 * #3235 (#3212.4/.6, recette démo 05/10) — « Historique des analyses » et la révision de verdict
 * de la fiche Société Générale : DEUX runs terminés, le plus ancien en NO-GO, le dernier en PRUDENT
 * (le verdict que le dossier affiche déjà — `priority_justification`, jamais un second jugement).
 * `explainVerdictChange` en tire sa phrase : facteur dominant nouveau + déclencheur NO-GO levé.
 * Dates RELATIVES à l'ouverture de la salle (jamais figées). Aucun `prompt_versions` : pas de
 * « modèle changé » inventé.
 */
/**
 * Lot 757 — CONTACTS 3/6 (arbitrage Louis 31/10) : le SÉLECTEUR groupe + filiales que l'analyse ouvre quand on
 * tape « Société Générale » en démonstration (`GET group-perimeter/:siren`, aucun appel réseau en salle).
 * Entités RÉELLES du groupe, déjà nommées par ce jeu (`subsidiaries` du compte, SIREN du registre) ; la taille et
 * le siège ne sont écrits que là où ce fichier les porte déjà — ailleurs `null`, « non publié », jamais un chiffre
 * inventé (GA-18). Garde : `account-group-perimeter.controller.spec.ts`.
 */
export const DEMO_GROUP_PERIMETER: GroupPerimeter = {
  rootSiren: '552120222',
  headSiren: '552120222',
  truncated: false,
  entities: [
    {
      siren: '552120222',
      name: 'SOCIETE GENERALE',
      role: 'groupe',
      headcountLabel: '10 000 salariés et plus',
      city: 'Puteaux',
      region: 'Île-de-France',
      isActive: true,
    },
    {
      siren: '351058151',
      name: 'BOURSORAMA',
      role: 'filiale',
      headcountLabel: null,
      city: null,
      region: null,
      isActive: true,
    },
    {
      siren: '807465059',
      name: 'TREEZOR',
      role: 'filiale',
      headcountLabel: null,
      city: null,
      region: null,
      isActive: true,
    },
    {
      siren: '308396308',
      name: 'SOCIETE GENERALE HOLDING DE PARTICIPATIONS',
      role: 'filiale',
      headcountLabel: null,
      city: null,
      region: null,
      isActive: true,
    },
  ],
}

export const DEMO_ANALYSIS_RUNS: readonly {
  company: string
  daysAgo: number
  scope_mode: string
  /**
   * Cadrage analyse (15/10, décision D) — le cadrage confirmé du run, que le dossier
   * récapitule en tête (« Cadrage appliqué : … »). FICTIF, comme tout ce fichier ;
   * absent = un run d'avant la feature, qui ne fabrique aucune ligne.
   */
  scope_selection?: AnalysisScopeSelection
  verdict_snapshot: {
    verdict: string
    dominantFactors: string[]
    noGoTrigger: string | null
    profileVersion: string | null
  }
}[] = [
  {
    company: 'Société Générale',
    daysAgo: 48,
    scope_mode: 'group',
    verdict_snapshot: {
      verdict: 'NO-GO',
      dominantFactors: ['timing'],
      noGoTrigger: 'Aucun point d’entrée identifié : la direction informatique du groupe est verrouillée',
      profileVersion: null,
    },
  },
  {
    company: 'Société Générale',
    daysAgo: 6,
    scope_mode: 'group',
    scope_selection: {
      objectives: ['open_account', 'find_decision_makers'],
      geo_perimeter: 'france',
      excluded_entities: ['SG Kleinwort Hambros'],
      selected_angles: ['data'],
      business_families: ['Data / IA', 'Cloud'],
      hierarchy_levels: ['n2', 'n1'],
      depth: 'deep',
      // Lot 757 — les filiales COCHÉES dans le sélecteur de périmètre : un coéquipier qui ouvre ce run voit sur
      // quelles entités les contacts ont été cherchés (le groupe ET ces deux-là). Voir `DEMO_GROUP_PERIMETER`.
      contact_entities: [
        { siren: '351058151', name: 'BOURSORAMA' },
        { siren: '807465059', name: 'TREEZOR' },
      ],
    },
    verdict_snapshot: {
      verdict: 'PRUDENT',
      dominantFactors: ['timing', 'fit'],
      noGoTrigger: null,
      profileVersion: null,
    },
  },
  // G.7 (recette R4 18/10, 4180.2) — EDF : deux analyses terminées, MÊME verdict. La fiche dit « Même verdict
  // depuis le … » (`compareLastRuns` → `unchanged`) — le pendant de la révision de Société Générale.
  {
    company: 'EDF',
    daysAgo: 41,
    scope_mode: 'group',
    verdict_snapshot: { verdict: 'GO', dominantFactors: ['fit', 'timing'], noGoTrigger: null, profileVersion: null },
  },
  {
    company: 'EDF',
    daysAgo: 9,
    scope_mode: 'group',
    verdict_snapshot: { verdict: 'GO', dominantFactors: ['fit', 'timing'], noGoTrigger: null, profileVersion: null },
  },
]

/**
 * #3682 (recette démo 10/10) — « Dernière vérification » absent sur SNCF démo : la ligne lit le
 * dernier `analysis_runs.completed_at` (`resolveLastAnalyzedByAccount`). Un run TERMINÉ récent par
 * compte des briefs démo, `verdict_snapshot` NULL (= jamais un verdict deviné : pas de « révision »
 * fabriquée). Dates RELATIVES à l'ouverture de la salle.
 */
export const DEMO_VERIFICATION_RUNS: readonly {
  company: string
  daysAgo: number
  scope_mode: string
  /**
   * Théo B r1-recherche.N6 — le cadrage CONSERVÉ du run : objectifs, angle, zone, entités ciblées/exclues, postes à
   * placer, niveau de contact. Le dossier le rappelle en tête (« Cadrage appliqué : … »). Absent = pas de rappel.
   */
  scope_selection?: AnalysisScopeSelection
}[] = [
  { company: 'SNCF', daysAgo: 1, scope_mode: 'group' },
  {
    // #4556 / #4432.4 — Airbus (siège à Blagnac), dossier cadré sur l'Occitanie : les contacts de la zone d'abord.
    company: DEMO_OCCITANIE_COMPANY,
    daysAgo: 2,
    scope_mode: 'group',
    scope_selection: {
      objectives: ['open_account', 'find_decision_makers'],
      geo_perimeter: 'region',
      geo_areas: [DEMO_OCCITANIE_ZONE_LABEL],
      depth: 'deep',
    },
  },
  {
    company: DEMO_BPCE_REAL_CONTACTS_COMPANY,
    daysAgo: 1,
    scope_mode: 'group',
    // Entités RÉELLES du groupe (réseaux Banque Populaire et Caisse d'Epargne, Natixis) — jamais un monde fictif.
    scope_selection: {
      objectives: ['open_account', 'prepare_meeting'],
      angle: 'Placer deux profils Data sur la direction des risques, en région lyonnaise.',
      geo_perimeter: 'region',
      geo_areas: ['Auvergne-Rhône-Alpes'],
      included_entities: ['Banque Populaire Auvergne-Rhône-Alpes', 'Caisse d’Epargne Rhône Alpes'],
      excluded_entities: ['Natixis'],
      business_families: ['Data / IA'],
      hierarchy_levels: ['n2', 'n1'],
      depth: 'deep',
    },
  },
]

/**
 * Théo B r2-mes-analyses — « Mes analyses » ne se lit pas avec des seuls runs réussis : une analyse ÉCHOUÉE (« Réessayer »)
 * et des profondeurs différentes (Rapide / Approfondie) sont ce qu'une démonstration doit montrer. Comptes RÉELS de la
 * salle (jamais un compte inventé) ; dates relatives à l'ouverture de la salle. Aucun run « en cours » : dans une salle
 * figée il resterait à vie « en cours », ce que la salle n'a pas le droit de mentir.
 */
export const DEMO_HISTORY_RUNS: readonly {
  company: string
  daysAgo: number
  scope_mode: string
  status: 'completed' | 'error'
  depth: 'quick' | 'deep'
}[] = [
  { company: 'Orange', daysAgo: 3, scope_mode: 'group', status: 'error', depth: 'quick' },
  { company: 'Safran', daysAgo: 6, scope_mode: 'group', status: 'completed', depth: 'deep' },
  { company: 'Enedis', daysAgo: 9, scope_mode: 'france', status: 'completed', depth: 'quick' },
  // #4290.12 / #4295.11 — SNCF ouvre `/contacts` (portée « recommandé » : comptes dans l'ordre de leur dernière analyse
  // terminée) : son contact « a quitté » et son contact « Ne pas contacter » tombent sur la 1re page, pas à la 3e.
  { company: 'SNCF', daysAgo: 0, scope_mode: 'group', status: 'completed', depth: 'quick' },
]

export function demoOrgEnrichmentJobs(): DemoOrgEnrichmentJob[] {
  return [
    {
      companyName: 'Société Générale',
      mode: 'next_batch',
      targetParams: { mode: 'next_batch' },
      waveSize: 50,
      // Annonce 6, consomme 5 : l'ecart EXISTE et se voit.
      estimatedCredits: 6,
      actualCredits: 5,
      waves: [
        {
          index: 0,
          contactIds: ['demo-sg-1', 'demo-sg-2', 'demo-sg-3'],
          status: 'done',
          actualCredits: 3,
          matched: 3,
          error: null,
        },
        {
          index: 1,
          contactIds: ['demo-sg-4', 'demo-sg-5'],
          status: 'done',
          actualCredits: 2,
          matched: 2,
          error: null,
        },
      ],
      error: null,
      daysAgo: 6,
    },
    {
      companyName: 'Société Générale',
      mode: 'missing_roles',
      targetParams: { mode: 'missing_roles' },
      waveSize: 50,
      estimatedCredits: 4,
      // Une seule vague a abouti : la vague tombee ne compte pas pour zero.
      actualCredits: 2,
      waves: [
        {
          index: 0,
          contactIds: ['demo-sg-6', 'demo-sg-7'],
          status: 'done',
          actualCredits: 2,
          matched: 2,
          error: null,
        },
        {
          index: 1,
          contactIds: ['demo-sg-8', 'demo-sg-9'],
          status: 'failed',
          actualCredits: null,
          matched: null,
          error: "Le service d'analyse n'a pas repondu dans le temps imparti.",
        },
      ],
      error: "Le service d'analyse n'a pas repondu dans le temps imparti.",
      daysAgo: 2,
    },
  ]
}

export function demoOrgCorrections(): DemoOrgCorrection[] {
  return [
    {
      companyName: 'Société Générale',
      objectType: 'person',
      objectId: 'p-pierre-palmieri',
      field: 'title',
      oldValue: 'Directeur général adjoint',
      newValue: 'Directeur général délégué',
      reason: 'Titre exact relevé sur la page « Gouvernance » du site du groupe.',
      evidence: { kind: 'official_site', ref: 'Page « Gouvernance » — societegenerale.com', claim: 'title' },
      graphVersionBefore: 1,
      graphVersionAfter: 2,
      reverted: false,
      daysAgo: 9,
    },
    {
      companyName: 'Société Générale',
      objectType: 'person',
      objectId: 'p-pierre-palmieri',
      field: 'hierarchyLevel',
      oldValue: 'L1',
      newValue: 'L2',
      reason: 'Je le pensais sous le directeur général ; en fait il siège au comité de direction.',
      evidence: { kind: 'workspace_user', claim: 'level' },
      graphVersionBefore: 2,
      graphVersionAfter: 3,
      reverted: true,
      daysAgo: 5,
    },
    {
      companyName: 'Société Générale',
      objectType: 'person',
      objectId: 'p-pierre-palmieri',
      field: 'hierarchyLevel',
      oldValue: 'L2',
      newValue: 'L1',
      reason: 'Annulation : Je le pensais sous le directeur général ; en fait il siège au comité de direction.',
      evidence: { kind: 'workspace_user', claim: 'level' },
      graphVersionBefore: 3,
      graphVersionAfter: 4,
      reverted: false,
      daysAgo: 5,
    },
    // #2126.26 — « Confirmer » : le titre est toujours vrai, revu en rendez-vous.
    // Une ligne au ledger, AUCUNE version avancée : DEMO_ORG_GRAPH_VERSION reste 4.
    {
      companyName: 'Société Générale',
      objectType: 'person',
      objectId: 'p-pierre-palmieri',
      field: 'title',
      oldValue: 'Directeur général délégué',
      newValue: 'Directeur général délégué',
      reason: 'Confirmé en rendez-vous : toujours directeur général délégué.',
      evidence: { kind: 'workspace_user', claim: 'title' },
      graphVersionBefore: 4,
      graphVersionAfter: 4,
      reverted: false,
      daysAgo: 2,
      motive: 'confirmed',
    },
    // #2310.54 — une ENTITÉ se corrige comme une personne. Le type portait déjà
    // `objectType: 'entity'` (le ledger et la route API l'acceptaient depuis le
    // 29/08) ; aucune ligne ne l'utilisait jamais parce qu'aucun écran ne
    // pouvait l'écrire. « Confirmer », comme la ligne juste au-dessus : aucune
    // version avancée, le graphe seedé n'a pas à changer pour que cette ligne
    // existe.
    {
      companyName: 'Société Générale',
      objectType: 'entity',
      objectId: 'e-sg-dsi',
      field: 'name',
      oldValue: 'Direction des systèmes d’information groupe',
      newValue: 'Direction des systèmes d’information groupe',
      reason: 'Confirmé en comité : le nom exact de l’entité n’a pas changé depuis la dernière collecte.',
      evidence: { kind: 'workspace_user', claim: 'identity' },
      graphVersionBefore: 4,
      graphVersionAfter: 4,
      reverted: false,
      daysAgo: 1,
      motive: 'confirmed',
    },
  ]
}

/**
 * La version que le dossier d'exemple porte après ces corrections.
 *
 * ⚠️ Elle est écrite sur `accounts.org_graph_version` au semis, et pas
 * seulement dans le blob : c'est la COLONNE que le verrou optimiste lit. Une
 * salle où la colonne dit 1 pendant que l'historique montre quatre versions
 * accepterait une correction avec `expectedGraphVersion: 1` — et le premier
 * prospect à cliquer verrait un conflit qui n'existe pas.
 */
export const DEMO_ORG_GRAPH_VERSION = 4

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CESSION DE CRÉANCE — le contrat factor et ses cessions (31/08/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Sans elles, `/missions/cessions` s'ouvre VIDE en démonstration : quatre
 * compteurs à zéro, un tableau vide, et rien qui explique à un prospect ce que
 * l'écran sert à faire. C'est le défaut que la craft rule n°9 existe pour
 * fermer — un écran livré mais vide se découvre en réunion, pas en CI.
 *
 * ⚠️ Les cessions se posent sur des mois RÉELLEMENT facturés du client
 * d'exemple ({@link DEMO_DELIVERY_CLIENT}), et leur montant est celui de la
 * facture. Inventer un montant à côté ferait un écran où la cession et la
 * facture ne se recoupent pas — ce qu'un prospect verrait tout de suite.
 *
 * ⚠️ Le nom du factor est INVENTÉ, comme le client d'exemple : aucune société
 * d'affacturage réelle n'est nommée dans ce dépôt.
 *
 * ⚠️ Le mois M-8 de la mission interrompue reste SANS cession, à dessein : il
 * est facturé, impayé, et c'est lui qui remplit la tuile « Cession manquante »
 * — le premier chiffre de l'écran dans les maquettes du 26/08. Lui donner une
 * cession viderait la tuile, et avec elle le geste « Préparer la cession ».
 */
type DemoSettlement = { shortfall_cents: number; days_ago: number; reference: string; reversed?: boolean }

export const DEMO_FACTORING = {
  contract: {
    factor_name: 'Méridien Affacturage',
    contract_reference: 'AFF-2026-014',
    /** 2,50 % — un taux d'affacturage courant, en points de base. */
    commission_rate_bps: 250,
    outstanding_limit_cents: 500_000_00,
    started_days_ago: 240,
  },
  /**
   * Cinq cessions, choisies pour montrer CINQ situations distinctes : réglée au
   * centime, réglée en dessous, transmise et en attente, reprise par le factor,
   * et préparée mais pas encore partie.
   */
  assignments: [
    {
      /** Le cas normal : cédée, réglée, le compte y est. */
      mission: 'Reprise de l’ordonnancement des flux — lot pilote',
      months_ago: 9,
      status: 'settled' as const,
      assigned_days_ago: 250 as number | null,
      settled_days_ago: 240 as number | null,
      own_rate_bps: null as number | null,
      decision_reason: null as string | null,
      /** `shortfall_cents: 0` = le factor a versé le net attendu, au centime. */
      settlements: [{ shortfall_cents: 0, days_ago: 240, reference: 'AVIS-2026-07' }] as DemoSettlement[],
    },
    {
      /**
       * L'ÉCART — la raison d'être de la réconciliation. Le factor a retenu
       * 150 € de plus que la commission convenue, sans l'annoncer. C'est le
       * genre de retenue qu'on ne voit jamais sans un écran qui la nomme.
       */
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 5,
      status: 'settled' as const,
      assigned_days_ago: 150 as number | null,
      settled_days_ago: 138 as number | null,
      own_rate_bps: null as number | null,
      decision_reason: null as string | null,
      settlements: [{ shortfall_cents: 150_00, days_ago: 138, reference: 'AVIS-2026-11' }] as DemoSettlement[],
    },
    {
      /** L'ENCOURS : chez le factor, pas encore réglée. */
      mission: 'Socle conteneurisé des applications terrain — run',
      months_ago: 2,
      status: 'assigned' as const,
      assigned_days_ago: 18 as number | null,
      settled_days_ago: null as number | null,
      own_rate_bps: null as number | null,
      decision_reason: null as string | null,
      settlements: [] as DemoSettlement[],
    },
    {
      /**
       * La REPRISE. Le mois est contesté par le client ; le factor a rendu la
       * créance et repris son avance. Deux règlements dont le second est
       * NÉGATIF — c'est le seul endroit du jeu où l'argent repart, et la
       * colonne n'a aucune contrainte de signe exprès.
       */
      mission: 'Migration du socle applicatif vers les conteneurs — lot 1',
      months_ago: 6,
      status: 'recalled' as const,
      assigned_days_ago: 180 as number | null,
      settled_days_ago: null as number | null,
      own_rate_bps: null as number | null,
      decision_reason:
        'Le client conteste deux jours de ce mois : le factor a rendu la créance et repris son avance. Le recouvrement revient à l’ESN.' as
          string | null,
      settlements: [
        { shortfall_cents: 0, days_ago: 172, reference: 'AVIS-2026-09' },
        { shortfall_cents: 0, days_ago: 96, reference: 'REPRISE-2026-09', reversed: true },
      ] as DemoSettlement[],
    },
    {
      /**
       * PRÉPARÉE et pas encore transmise — l'état où « Préparer la cession »
       * laisse la ligne, et le seul qui porte un taux DÉROGATOIRE (1,80 % au
       * lieu de 2,50 %) : c'est ce que `effectiveCommissionRateBps` arbitre.
       */
      mission: 'Convergence des applications temps réel — lots interfaces et reprise',
      months_ago: 3,
      status: 'prepared' as const,
      assigned_days_ago: null as number | null,
      settled_days_ago: null as number | null,
      own_rate_bps: 180 as number | null,
      decision_reason: null as string | null,
      settlements: [] as DemoSettlement[],
    },
  ],
  /**
   * Un règlement reçu que rien ne rapproche encore — la file de travail de
   * l'écran. Sans lui, le seau « À rapprocher » resterait vide et personne ne
   * comprendrait ce que le geste « Rapprocher » sert à faire.
   */
  unreconciled_settlements: [{ amount_cents: 12_000_00, days_ago: 6, reference: 'AVIS-2026-14' }],
}

/**
 * Les cessions du client d'exemple, DATÉES et CHIFFRÉES pour la visite en cours.
 *
 * La dérivation vit ICI et nulle part ailleurs, exactement comme
 * {@link demoInvoiceHistory} : le seed l'insère, les tests la relisent. Le
 * montant cédé est celui de la FACTURE — il se LIT dans l'historique plutôt que
 * de se réécrire, sinon l'écran des cessions et celui des encaissements
 * annonceraient deux chiffres pour la même créance.
 */
export function demoFactoringAssignments(now: number): {
  missionLabel: string
  periodMonth: string
  status: 'prepared' | 'assigned' | 'settled' | 'rejected' | 'recalled'
  /** Le montant cédé, en centimes. `null` quand la facture elle-même n'en a
   *  pas — on ne chiffre pas une cession sur un montant qui n'existe pas. */
  assignedAmountCents: number | null
  /** Le taux DÉROGATOIRE, ou `null` pour « celui du contrat ». */
  commissionRateBps: number | null
  assignedOn: string | null
  settledOn: string | null
  decisionReason: string | null
  settlements: { amountCents: number; receivedOn: string; reference: string }[]
}[] {
  const day = 86_400_000
  const dateOnly = (daysAgo: number): string => new Date(now - daysAgo * day).toISOString().slice(0, 10)
  const invoices = new Map(
    demoInvoiceHistory(now).map(invoice => [`${invoice.missionLabel}#${invoice.periodMonth}`, invoice]),
  )
  const visit = new Date(now)

  return DEMO_FACTORING.assignments.flatMap(assignment => {
    const period = new Date(Date.UTC(visit.getUTCFullYear(), visit.getUTCMonth() - assignment.months_ago, 1))
    const periodMonth = period.toISOString().slice(0, 10)
    const invoice = invoices.get(`${assignment.mission}#${periodMonth}`)
    // Une cession sans facture ne s'écrit pas : elle serait refusée par le
    // produit lui-même (`FactoringService.prepare`), et la salle mentirait sur
    // ce qu'il autorise.
    if (!invoice) return []

    const assignedAmountCents = invoice.invoicedAmountCents
    const rateBps = assignment.own_rate_bps ?? DEMO_FACTORING.contract.commission_rate_bps
    // La même dérivation que l'écran, et non une seconde : le net attendu est
    // la créance moins sa commission.
    const expectedNet =
      assignedAmountCents === null ? null : assignedAmountCents - Math.round((assignedAmountCents * rateBps) / 10_000)

    return [
      {
        missionLabel: assignment.mission,
        periodMonth,
        status: assignment.status,
        assignedAmountCents,
        commissionRateBps: assignment.own_rate_bps,
        assignedOn: assignment.assigned_days_ago === null ? null : dateOnly(assignment.assigned_days_ago),
        settledOn: assignment.settled_days_ago === null ? null : dateOnly(assignment.settled_days_ago),
        decisionReason: assignment.decision_reason,
        settlements:
          expectedNet === null
            ? []
            : assignment.settlements.map(settlement => ({
                // `reversed` : l'avance REPRISE par le factor, donc négative.
                amountCents: settlement.reversed
                  ? -(expectedNet - settlement.shortfall_cents)
                  : expectedNet - settlement.shortfall_cents,
                receivedOn: dateOnly(settlement.days_ago),
                reference: settlement.reference,
              })),
      },
    ]
  })
}
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LES NOTES DE FRAIS de la salle de démonstration (31/08/2026)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Le lien de démonstration est PUBLIC : ces personnes sont FICTIVES, comme les
 * consultants de la salle, et aucun montant ne prétend décrire une dépense
 * réelle d'une des sociétés nommées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SALLE DOIT MONTRER — et pourquoi chaque note existe
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois tuiles non vides (une file vide ne montre pas un produit), et surtout
 * les DEUX verdicts de conformité, parce que c'est la décision de fond du
 * domaine :
 *
 *  · `F-2026-006` — CONFORME. Cinq lignes, toutes sous leur plafond, trois
 *    justificatifs. C'est la note de référence, celle qu'on lit en trente
 *    secondes avant de valider.
 *  · `2026-04-001` — NON VÉRIFIÉE. Elle porte une ligne `supplies`, catégorie
 *    que le barème ne plafonne pas. Le produit écrit « non vérifié » et COMPTE
 *    la ligne non comparée ; il n'écrit pas « conforme ». C'est LE point que
 *    cette salle existe pour rendre visible : un barème incomplet ne délivre
 *    pas un satisfecit.
 *  · `0146` — REFUSÉE, avec son motif, et une anomalie qui l'explique : deux
 *    lignes identiques au centime le même jour. La vérification automatique
 *    trouve quelque chose, ce qui vaut mieux qu'une salle où elle ne trouve
 *    jamais rien et paraît décorative.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ `missionLabel` N'EST RENSEIGNÉ QUE SUR LES NOTES « EN ATTENTE »
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas un oubli, c'est la seule façon de montrer le lien avec la marge
 * SANS le fausser. Valider une note écrit une ligne `mission_expenses` sur sa
 * mission : semer des notes DÉJÀ validées avec une mission obligerait à semer
 * aussi la ligne de coût correspondante, et la marge nette des missions de la
 * salle — documentée au lot du 30/08 avec ses 500 € sur UNE seule mission —
 * cesserait d'être celle que ce lot-là décrit.
 *
 * Les notes en attente, elles, portent leur mission : un prospect qui clique
 * « Valider » dans la salle voit la ligne de coût apparaître pour de vrai sur
 * la mission. Le lien est donc DÉMONTRÉ, pas raconté.
 *
 * Les notes déjà décidées portent `missionLabel: null` — un déplacement interne
 * ou un salon, cas parfaitement ordinaire d'une note sans mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LES DATES SONT DÉRIVÉES D'UN MOIS, JAMAIS D'UN « IL Y A N JOURS »
 * ─────────────────────────────────────────────────────────────────────────────
 * `monthsAgo` + `dayOfMonth` plutôt qu'un décalage en jours : un décalage fait
 * glisser les lignes d'un mois à l'autre au fil des semaines, et la
 * vérification automatique se mettrait à crier « ligne hors période » sur une
 * salle qui n'a pas bougé. Une salle qui alerte à tort apprend à ne plus lire
 * les alertes.
 */
export const DEMO_EXPENSE_POLICY = {
  label: 'Barème interne — déplacements clients',
  reimbursement_basis: 'actual' as const,
  /**
   * `vat_recoverable` est une DONNÉE, pas une règle codée : en France, le
   * transport de personnes et l'hébergement du personnel n'ouvrent pas droit à
   * déduction, la restauration si. C'est national, daté, et ça bouge — d'où le
   * paramètre plutôt qu'une table en dur dans une fonction.
   *
   * ⚠️ `supplies`, `mileage` et `other` sont ABSENTS de ce barème, à dessein :
   * ce sont eux qui produisent le verdict « non vérifié » de `2026-04-001`.
   * Les ajouter rendrait la salle « toujours conforme », c'est-à-dire
   * exactement l'impression qu'on ne veut pas donner.
   */
  caps: [
    { category: 'meal' as const, cap_cents: 25_00, vat_recoverable: true },
    { category: 'hotel' as const, cap_cents: 150_00, vat_recoverable: false },
    { category: 'train' as const, cap_cents: 200_00, vat_recoverable: false },
    { category: 'plane' as const, cap_cents: 450_00, vat_recoverable: false },
    { category: 'taxi' as const, cap_cents: 80_00, vat_recoverable: false },
    { category: 'parking' as const, cap_cents: 30_00, vat_recoverable: true },
  ],
  /**
   * LE BARÈME KILOMÉTRIQUE de la salle (31/08/2026).
   *
   * ⚠️ Il est SEMÉ parce qu'il est SAISI : c'est le barème que l'ESN de
   * démonstration s'est donné, pas un barème officiel recopié. La distinction
   * n'est pas cosmétique — le produit ne fournit AUCUN barème kilométrique, et
   * en pré-remplir un serait une donnée fictive présentée comme une règle. Ici,
   * la salle joue le rôle de l'ESN qui a fait la saisie, exactement comme elle
   * porte des plafonds de repas que personne n'a « fournis ».
   *
   * Deux puissances, parce qu'une seule ne montrerait pas que le tarif dépend
   * du véhicule. La date d'effet est calculée par le semis (1er janvier de
   * l'année en cours) : une date en dur périmerait la salle en janvier.
   */
  mileageRates: [
    { fiscal_horsepower: 4, cents_per_km: 52 },
    { fiscal_horsepower: 5, cents_per_km: 60 },
  ],
}

export const DEMO_EXPENSE_REPORTS = [
  {
    reference: 'F-2026-006',
    bearer_name: 'Inès Kaczmarek',
    status: 'pending' as const,
    monthsAgo: 1,
    missionLabel: 'Cadrage données transport — lot 2' as string | null,
    rejection_reason: null as string | null,
    lines: [
      {
        category: 'meal' as const,
        label: 'Repas – Déjeuner',
        dayOfMonth: 15,
        city: 'Paris',
        detail: null as string | null,
        amount_cents: 18_50,
        vat_rate_bps: 1000,
      },
      {
        category: 'hotel' as const,
        label: 'Hôtel',
        dayOfMonth: 14,
        city: 'Paris',
        detail: 'Chambre simple' as string | null,
        amount_cents: 120_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'train' as const,
        label: 'Train – Paris → Lyon',
        dayOfMonth: 14,
        city: 'Paris',
        detail: '2e classe' as string | null,
        amount_cents: 89_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'meal' as const,
        label: 'Repas – Dîner',
        dayOfMonth: 14,
        city: 'Lyon',
        detail: null as string | null,
        amount_cents: 23_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'taxi' as const,
        label: 'Taxi',
        dayOfMonth: 14,
        city: 'Lyon',
        detail: null as string | null,
        amount_cents: 68_00,
        vat_rate_bps: 1000,
      },
    ],
    /**
     * Un poids MANQUANT sur la troisième pièce, à dessein : l'écran doit écrire
     * « non mesuré » et non « 0 KB », qui se lirait « fichier vide ».
     *
     * `stored` (31/08/2026) — les DEUX premières portent de vrais octets, la
     * troisième non, et c'est la moitié du produit qu'il faut aussi montrer :
     * « cette pièce est référencée, on ne la détient pas ». Une salle où tout
     * s'ouvre ne montrerait jamais cette phrase-là, et un prospect en
     * conclurait que le produit détient toujours tout.
     */
    attachments: [
      {
        file_name: 'Facture_hotel.pdf',
        content_type: 'application/pdf',
        byte_size: 127_000 as number | null,
        stored: true,
      },
      {
        file_name: 'Ticket_train.pdf',
        content_type: 'application/pdf',
        byte_size: 91_000 as number | null,
        stored: true,
      },
      {
        file_name: 'Justificatif_taxi.jpg',
        content_type: 'image/jpeg',
        byte_size: null as number | null,
        stored: false,
      },
    ],
  },
  {
    reference: '2026-04-001',
    bearer_name: 'Hakim Barreau',
    status: 'pending' as const,
    monthsAgo: 2,
    missionLabel: 'Migration du socle applicatif vers les conteneurs — lot 1' as string | null,
    rejection_reason: null as string | null,
    lines: [
      {
        category: 'hotel' as const,
        label: 'Hôtel – deux nuits',
        dayOfMonth: 9,
        city: 'Nantes',
        detail: null as string | null,
        amount_cents: 135_00,
        vat_rate_bps: 1000,
      },
      // La ligne qui rend le verdict « non vérifié » : `supplies` n'est pas au
      // barème, donc elle n'est comparée à rien — et le produit le DIT.
      {
        category: 'supplies' as const,
        label: 'Adaptateur réseau — dépannage sur site',
        dayOfMonth: 10,
        city: 'Nantes',
        detail: null as string | null,
        amount_cents: 12_00,
        vat_rate_bps: 2000,
      },
    ],
    attachments: [
      {
        file_name: 'Note_hotel_nantes.pdf',
        content_type: 'application/pdf',
        byte_size: 64_000 as number | null,
        stored: false,
      },
    ],
  },
  {
    reference: '2026-03-004',
    bearer_name: 'Salomé Dufour',
    status: 'validated' as const,
    monthsAgo: 3,
    missionLabel: null as string | null,
    rejection_reason: null as string | null,
    lines: [
      {
        category: 'plane' as const,
        label: 'Vol – Paris → Toulouse',
        dayOfMonth: 11,
        city: 'Paris',
        detail: 'Aller-retour' as string | null,
        amount_cents: 312_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'hotel' as const,
        label: 'Hôtel – salon professionnel',
        dayOfMonth: 11,
        city: 'Toulouse',
        detail: null as string | null,
        amount_cents: 148_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'meal' as const,
        label: 'Repas – Déjeuner',
        dayOfMonth: 12,
        city: 'Toulouse',
        detail: null as string | null,
        amount_cents: 21_40,
        vat_rate_bps: 1000,
      },
    ],
    attachments: [
      {
        file_name: 'Billet_avion.pdf',
        content_type: 'application/pdf',
        byte_size: 88_000 as number | null,
        stored: false,
      },
      {
        file_name: 'Note_hotel_toulouse.pdf',
        content_type: 'application/pdf',
        byte_size: 71_000 as number | null,
        stored: false,
      },
    ],
  },
  {
    reference: '2026-02-00066',
    bearer_name: 'Antoine Rivière',
    status: 'validated' as const,
    monthsAgo: 4,
    missionLabel: null as string | null,
    rejection_reason: null as string | null,
    lines: [
      {
        category: 'train' as const,
        label: 'Train – Paris → Lille',
        dayOfMonth: 6,
        city: 'Paris',
        detail: '2e classe' as string | null,
        amount_cents: 62_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'parking' as const,
        label: 'Parking gare',
        dayOfMonth: 6,
        city: 'Paris',
        detail: null as string | null,
        amount_cents: 18_00,
        vat_rate_bps: 2000,
      },
    ],
    attachments: [
      {
        file_name: 'Billet_train_lille.pdf',
        content_type: 'application/pdf',
        byte_size: 42_000 as number | null,
        stored: false,
      },
    ],
  },
  {
    reference: '0146',
    bearer_name: 'Yanis Berthier',
    status: 'rejected' as const,
    monthsAgo: 5,
    missionLabel: null as string | null,
    /**
     * Le motif est OBLIGATOIRE en base
     * (`expense_reports_rejection_reason_check`) : une salle qui montrerait un
     * refus muet montrerait un état que le produit refuse d'écrire.
     */
    rejection_reason:
      'Deux fois le même justificatif de taxi — merci de ne garder que la course réellement engagée et de redéposer.' as
        string | null,
    lines: [
      // Le doublon EXACT — même catégorie, même jour, même montant : c'est
      // exactement ce que la vérification automatique cherche, et la raison du
      // refus. Sans lui, la salle montrerait un encart qui ne trouve jamais rien.
      {
        category: 'taxi' as const,
        label: 'Taxi – aéroport',
        dayOfMonth: 20,
        city: 'Marseille',
        detail: null as string | null,
        amount_cents: 54_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'taxi' as const,
        label: 'Taxi – aéroport',
        dayOfMonth: 20,
        city: 'Marseille',
        detail: null as string | null,
        amount_cents: 54_00,
        vat_rate_bps: 1000,
      },
      {
        category: 'meal' as const,
        label: 'Repas – Déjeuner',
        dayOfMonth: 20,
        city: 'Marseille',
        detail: null as string | null,
        amount_cents: 19_80,
        vat_rate_bps: 1000,
      },
    ],
    attachments: [
      { file_name: 'Recu_taxi.jpg', content_type: 'image/jpeg', byte_size: 55_000 as number | null, stored: false },
    ],
  },
  /**
   * LE BROUILLON (31/08/2026) — la note que le prospect peut ouvrir et finir.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI IL EST ICI, ET POURQUOI IL EST SEUL
   * ─────────────────────────────────────────────────────────────────────────
   * L'écran de dépôt est livré ; sans brouillon semé, il s'ouvrirait vide
   * devant un prospect, et « déposer une note » resterait un bouton dont on
   * raconte l'effet au lieu de le montrer. Un seul, parce que la file du
   * valideur reste le sujet de l'écran : cinq brouillons la noieraient.
   *
   * ⚠️ `missionLabel` est NULL, comme les notes déjà décidées, et pour la même
   * raison : un brouillon ne produit AUCUNE ligne `mission_expenses` tant qu'il
   * n'est pas validé — mais s'il en portait une, le prospect qui le soumet puis
   * le valide ferait bouger la marge nette documentée par le lot du 30/08. Le
   * lien avec la marge se démontre déjà sur les deux notes EN ATTENTE, qui,
   * elles, portent leur mission.
   *
   * ⚠️ Il porte la SEULE ligne kilométrique de la salle, avec sa distance et sa
   * puissance fiscale. C'est ce qui rend le barème kilométrique visible :
   * 180 km × 0,60 € = 108 € opposables pour 132 € réclamés, soit un dépassement
   * de 24 € que l'écran nomme. Sans ces deux champs, la ligne serait « non
   * vérifiée » et le barème saisi ne servirait à rien de démontrable.
   */
  {
    reference: 'BROUILLON-2026-01',
    bearer_name: 'Inès Kaczmarek',
    status: 'draft' as const,
    monthsAgo: 0,
    missionLabel: null as string | null,
    rejection_reason: null as string | null,
    lines: [
      {
        category: 'mileage' as const,
        label: 'Trajet client — Paris → Rouen (aller-retour)',
        dayOfMonth: 6,
        city: 'Rouen',
        detail: 'Véhicule personnel' as string | null,
        amount_cents: 132_00,
        // Une indemnité kilométrique ne porte pas de TVA récupérable : le taux
        // n'a pas été lu, et « 0 % » serait un fait fiscal qu'on n'a pas.
        vat_rate_bps: null as number | null,
        distance_km: 180,
        fiscal_horsepower: 5,
      },
      {
        category: 'meal' as const,
        label: 'Repas – Déjeuner',
        dayOfMonth: 6,
        city: 'Rouen',
        detail: null as string | null,
        amount_cents: 21_00,
        vat_rate_bps: 1000 as number | null,
      },
    ],
    // Un brouillon sans justificatif : c'est l'état ordinaire d'une note qu'on
    // vient de commencer, et la vérification automatique le DIT plutôt que de
    // laisser croire que le dossier est complet.
    attachments: [] as {
      file_name: string
      content_type: string
      byte_size: number | null
      // ⚠️ Présent même sur un tableau VIDE : sans lui, l'union des
      // formes de justificatifs perd `stored` et le semis ne compile plus.
      // Un tableau vide a quand même une forme.
      stored: boolean
    }[],
  },
]

/**
 * LE RÔLE POURVU — celui qui rend visible « Mission attribuée » (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FERME DANS LA SALLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau « Staffing » d'une fiche besoin porte quatre chiffres, et le
 * quatrième — « Mission attribuée » — n'a de sens qu'avec `missions.need_id`,
 * la colonne posée par la migration `1791001000001`. Sans ce rôle, la salle
 * n'aurait montré ce chiffre que sur des besoins ouverts qui ne sont encore
 * devenus AUCUNE mission : « 0 » partout, c'est-à-dire une capacité livrée qui
 * a l'air d'une capacité vide — exactement ce que la parité démo existe pour
 * empêcher.
 *
 * ⚠️ Il est posé sur le projet GAGNÉ du client d'exemple, celui que la première
 * mission de la salle porte déjà, et son état est `won` : un rôle dont une
 * mission est née EST un rôle gagné. Le poser sur le projet ouvert aurait
 * fabriqué l'inverse — un besoin encore en cours qui affiche une mission.
 *
 * ⚠️ CE QUE LA SALLE NE MONTRE PAS, ET POURQUOI. Le second cas de la règle — des
 * missions existent sur l'affaire et aucune ne dit son rôle, donc « non
 * mesuré » — n'est PAS montrable : `missions_opportunity_uniq` (index UNIQUE sur
 * `missions(opportunity_id)`) interdit une seconde mission sur la même affaire,
 * et il faudrait justement deux missions dont une seule est liée. Fabriquer ce
 * cas demanderait de violer une contrainte du produit pour illustrer un état de
 * transition qui disparaîtra de lui-même. Il reste couvert par les tests
 * (`missionsAssignedOf`), pas par la salle.
 */
export const DEMO_STAFFED_NEED = {
  title: 'Ingénieur d’exploitation — renfort plateforme',
  status: 'won' as const,
  status_changed_days_ago: 24,
  skills: [
    { term: 'Exploitation', required: true },
    { term: 'Supervision', required: true },
    { term: 'Astreinte', required: false },
  ],
  seniority: 'confirme',
  headcount: 1,
  /** Le TJM du rôle, cohérent avec la mission qui en est née (620 €/j vendus). */
  target_tjm_cents: 620_00,
  location: 'Lyon',
  // #2173.29
  remote: 'sur_site' as const,
  contract_kind: 'regie' as const,
  urgency: 'normale' as const,
  source: 'client_email' as const,
  provenance: 'human' as const,
  context:
    'Le client a demandé un renfort d’exploitation sur sa plateforme pendant la reprise du run. Le rôle a été pourvu : la mission qui en est née est celle que la salle montre en cours.',
}

/**
 * #2178 — LE BESOIN SANS PROFIL DÉFENDABLE (craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BESOIN EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `MatchDrawer.tsx` rend désormais `NoMatchCausesBanner` et
 * `NextBestMoveActions` (dix arbitrages, `next-best-move.ts`) quand un
 * classement rend `recommended` ET `borderline` VIDES tous les deux. Sans
 * besoin qui produise réellement ce zéro, l'écran livré par #2178 ne se
 * découvre qu'en salle — exactement ce que la craft rule n°9 interdit.
 *
 * ⚠️ AUCUN `MatchRun` n'est fabriqué ici, et c'est le point : la doctrine du
 * dépôt (docblock plus haut, §44-49) refuse un résultat de classement inventé
 * à la même hauteur qu'elle refuse une donnée d'entreprise inventée. Ce
 * besoin est un `project_needs` ORDINAIRE — la même table, les mêmes
 * colonnes que {@link DEMO_STAFFED_NEED} — et c'est `MatchingService.execute`
 * (`apps/api/.../matching/matching.service.ts`), le moteur RÉEL à treize axes
 * (`engine.ts`, `axes.ts`), qui produit le zéro EN LE FAISANT TOURNER contre
 * les sept profils de {@link DEMO_CONSULTANTS} quand la salle ouvre ce besoin.
 *
 * ⚠️ RATTACHÉ à {@link DEMO_DELIVERY_CLIENT} (SNCF, le SEUL client
 * fictif de la salle), JAMAIS à l'une des six sociétés RÉELLES de
 * {@link DEMO_DOSSIERS} (Groupe BPCE, SNCF, Société Générale) : `demo-seed.service.spec.ts` (« ne pose aucun de ces rôles sur
 * l'une des six sociétés RÉELLES ») le vérifie déjà — poser un rôle ouvert
 * sur une entreprise réelle affirmerait quelque chose sur son recrutement que
 * personne n'a vérifié, exactement l'interdit que ce test garde. Le lien de
 * démonstration est PUBLIC.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE ZÉRO EST GARANTI, PAS ESPÉRÉ
 * ─────────────────────────────────────────────────────────────────────────
 * `COBOL` et `JCL`, tous deux OBLIGATOIRES, n'apparaissent dans AUCUN `stack`
 * des sept profils du vivier (vérifié : aucune occurrence de « COBOL », « JCL »
 * ou « mainframe » ailleurs dans ce fichier) — chaque profil sort donc avec
 * l'exclusion `missing_required_skill`, BLOQUANTE (`EXCLUSION_SEVERITY` du
 * contrat), et l'axe `must_have` (25 des 100 points de pondération, le plus
 * lourd des douze) tombe à 0 pour tous les sept.
 *
 * Un blocage seul ne suffit pas — `classify()` (`engine.ts`) ne descend en
 * « écarté » que si la correspondance reste SOUS le seuil (60/100 par
 * défaut) ; au-dessus, un profil bloqué atterrit en « limites », qui compte
 * lui aussi dans le test « zéro résultat ». Le reste du besoin est choisi
 * pour que CHAQUE axe restant reste à 0, HORS dénominateur, ou insuffisant à
 * lui seul pour franchir le seuil :
 *
 *  - `location: 'Strasbourg'` — aucune zone du vivier (`IDF`, `69`, `Laval`,
 *    `remote`) ne la couvre. ⚠️ `MatchingService.loadNeed` écrit TOUJOURS
 *    `remote: null` sur le `MatchNeed` qu'il rend (`remote` de
 *    `project_needs` n'est lu nulle part dans cette fonction) : `axisLocation`
 *    (`axes.ts`) crédite donc au mieux 35/100 — jamais 60 — un profil qui
 *    accepte le distanciel mais n'a aucune zone en commun, et 0 à celui qui
 *    ne l'accepte pas. `remote: 'sur_site'` sur CE besoin ne change donc rien
 *    au calcul ; il reste posé pour ce que l'écran affiche au commercial.
 *  - `languages: [{ code: 'de', level: 'c1' }]` — AUCUN des sept profils ne
 *    déclare l'allemand (`fr` et parfois `en` seulement) : l'axe langue tombe
 *    à 0, jamais hors dénominateur, ce qui pèse RÉELLEMENT sur la moyenne au
 *    lieu de s'en retirer.
 *  - `stack: ['COBOL', 'Mainframe']` — ce que `axisEnvironment` compare, ce
 *    sont les compétences PRATIQUÉES (`references` + compétences prouvées en
 *    mission), qu'aucun des sept ne porte non plus pour ces deux termes :
 *    l'axe environnement tombe à 0 lui aussi.
 *  - `seniority: 'non précisée'` (aucune bande reconnue par `bandFromText`)
 *    sort l'axe séniorité du dénominateur plutôt que de gonfler
 *    artificiellement un score.
 *
 * ⚠️ CE BESOIN NE FUIT PAS LE SECTEUR DU COMPTE. `accountSector` vient de
 * `DEMO_DELIVERY_CLIENT.account.sector` (« Transport et logistique »), qui
 * CONTIENT le mot « Transport » : quatre des sept profils du vivier
 * (Yanis Berthier, Salomé Dufour, Inès Kaczmarek, Marc Ouedraogo, qui portent
 * tous « Transport » dans leurs secteurs déclarés) matchent donc l'axe
 * secteur à 100/100 via `mentions()` (`text.ts`) — un faux ami mesuré à la
 * main, PAS ignoré : le calcul ci-dessous l'inclut, et le zéro tient quand
 * même. `contract_kind: 'regie'` (jamais `'recrutement'`) tient aussi l'axe
 * statut contractuel à 100 pour tout le monde, également inclus.
 *
 * Le pire cas calculé à la main (Yanis Berthier : immédiatement disponible,
 * secteur à 100 via « Transport », zone en désaccord mais distanciel accepté
 * à 35, statut contractuel à 100, aucune contrainte client) plafonne à
 * 41/100 — dix-neuf points sous le seuil de 60. Les six autres restent tous
 * en dessous (Camille Roussel 29, Marc Ouedraogo 37, Salomé Dufour et Inès
 * Kaczmarek 27, Antoine Rivière 16 ; Hakim Barreau atterrit « non évaluable »,
 * disponibilité inconnue). Le sourcing (les CV-import éventuels, hors de
 * {@link DEMO_CONSULTANTS}) n'entre pas dans ce calcul : ce besoin ne
 * prétend couvrir qu'un vivier ENTIÈREMENT tourné vers le cloud, cohérent
 * avec le reste de la salle. Chaque profil ÉVALUABLE (donc hors Hakim) porte
 * en plus, individuellement, `correspondenceScore < 60` ET l'exclusion
 * `missing_required_skill` — VÉRIFIÉ, pas seulement calculé à la main, par
 * `demo-no-defendable-profile-coverage.spec.ts`, qui fait tourner
 * `evaluateCandidate` (le moteur réel) sur le meilleur cas de chacun.
 *
 * `target_tjm_cents: null` — rien n'a encore été chiffré côté client, comme
 * {@link DEMO_DELIVERY_CLIENT}`.needWithoutProject` juste avant dans ce
 * fichier. `status: 'to_match'` — le besoin apparaît PRÊT à être rapproché,
 * pas encore qualifié : c'est l'état où un commercial ouvrirait le tiroir de
 * rapprochement et tomberait, aujourd'hui, sur l'écran que #2178 vient de
 * construire.
 *
 * Semé par `DemoSeedService.seedNoDefendableProfileNeed`, RATTACHÉ au client
 * fictif {@link DEMO_DELIVERY_CLIENT} mais SANS projet — même famille que
 * `seedNeedWithoutProject` (#2558.1) : un besoin qui n'a pas encore de
 * dossier n'en fabrique pas un pour exister. Une ESN qui fait tenir un
 * existant de gestion mainframe pendant que le reste de l'équipe avance sur
 * le portail conteneurisé (voir `DEMO_STAFFED_NEED`, même client) est un cas
 * plausible, cohérent avec le reste du dossier SNCF.
 */
export const DEMO_NO_DEFENDABLE_PROFILE_NEED = {
  title: 'Ingénieur mainframe COBOL — maintien du cœur stocks',
  status: 'to_match' as const,
  status_changed_days_ago: 5,
  skills: [
    { term: 'COBOL', required: true },
    { term: 'JCL', required: true },
  ],
  // Texte libre (`project_needs.seniority`, `z.string().trim().max(40)`),
  // jamais une bande reconnue par `bandFromText` (« junior », « confirme »,
  // « senior », « expert », « architecte ») : le client n'a pas donné de
  // niveau pour cette compétence d'appoint, et le deviner fabriquerait un axe
  // qui n'a pas lieu d'exister plutôt que de le sortir honnêtement du calcul.
  seniority: 'non précisée',
  headcount: 1,
  // Rien n'a encore été chiffré côté client — jamais 0, qui se lirait comme
  // un tarif connu.
  target_tjm_cents: null as number | null,
  location: 'Strasbourg',
  // Accès physique à la salle mainframe : le poste ne se tient pas à
  // distance, une contrainte que le vivier actuel ne couvre pas non plus.
  remote: 'sur_site' as const,
  contract_kind: 'regie' as const,
  urgency: 'normale' as const,
  source: 'client_email' as const,
  provenance: 'human' as const,
  // Aucun des sept profils ne déclare l'allemand — voir le docblock.
  languages: [{ code: 'de', level: 'c1' }] as { code: string; level: string | null }[],
  // Compétences PRATIQUÉES attendues (`axisEnvironment`) : aucun des sept
  // profils ne les porte en référence de mission — voir le docblock.
  stack: ['COBOL', 'Mainframe'],
  context:
    'Le cœur de gestion des stocks tourne encore sur un existant COBOL, hébergé sur mainframe, pendant que le reste de l’équipe avance sur le portail conteneurisé. Le client demande un renfort dédié à ce socle historique, sur site, le temps que la bascule complète soit démarrée.',
}

/**
 * LA SOCIÉTÉ QUI FACTURE, DANS LA SALLE DE DÉMONSTRATION.
 *
 * `legal_entities` était classée « vide à dessein » avec une raison qui tenait
 * tant que la capacité n'avait aucun écran : « la capacité se découvre dans
 * Réglages, où elle est expliquée ». Réglages › Sociétés existe depuis le
 * 31/08/2026 — et un écran livré mais VIDE devant un prospect est exactement ce
 * que la parité de démonstration existe pour empêcher.
 *
 * ⚠️ UNE SEULE, et c'est la moitié importante de la décision. La raison
 * d'origine reste vraie : une salle présente UNE ESN fictive, et y déclarer deux
 * raisons sociales montrerait une organisation de groupe que le reste du jeu de
 * données ne raconte pas — aucune mission de la salle ne porte de rattachement,
 * et le visiteur verrait un arbitrage sans conséquence visible. Une ligne, c'est
 * « voici ta société, en voici une seconde si tu en as » ; deux, c'est un groupe
 * inventé.
 *
 * C'est la même ESN que partout ailleurs dans la salle — celle dont le visiteur
 * emprunte le siège, et dont la grille tarifaire est dans la base de
 * connaissance. Lui inventer un autre nom ici la ferait diverger d'elle-même à
 * l'écran suivant.
 *
 * L'identifiant légal est un SIREN FICTIF (`000` en tête : aucune entreprise
 * réelle ne commence ainsi, et la clé de Luhn n'est pas valide). Un vrai numéro
 * désignerait une vraie société dans un jeu de données qui n'est pas le sien.
 */
export const DEMO_LEGAL_ENTITY = {
  name: 'Bellum Conseil',
  registration_number: '000123456',
  country: 'FR',
} as const
/* ------------------------------------------------------------------ */
/*  LES PHOTOS DE TERRITOIRE DE LA SALLE DE DÉMONSTRATION (31/08/2026) */
/* ------------------------------------------------------------------ */

/**
 * TROIS photos par département suivi — et trois, pas une. QUATRE pour la
 * Haute-Garonne depuis #2206.42, pour que l'HORIZON STRUCTUREL s'y voie aussi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES N'EXISTAIENT PAS, ET CE QUI A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `territory_snapshots` est PARTAGÉE entre tous les espaces : le nombre d'offres
 * IT en Haute-Garonne est le même pour tout le monde. Le semis s'en tenait donc
 * à l'abonnement et ne fabriquait aucune photo — « en fabriquer de fausses
 * ferait mentir la moyenne de tout le monde ». C'était juste, et le prix en
 * était que l'écran Marché s'ouvrait devant un prospect avec « Aucune photo
 * encore prise », c'est-à-dire un écran mort.
 *
 * La colonne `source` tranche : ces lignes portent `'demo'`, et rien de réel ne
 * les lit — ni la médiane de recrutement du référentiel (`refreshBaselines`
 * lit `'sweep'`), ni le tableau d'un espace client qui suivrait le même
 * département, ni le balayage du lundi, dont le prédicat d'existence porte
 * lui aussi sur `'sweep'`.
 *
 * ⚠️ TROIS et non une : la variation se lit entre DEUX photos. Une seule ferait
 * répondre « non mesuré » sur les quatre mesures des deux territoires — juste,
 * et parfaitement illisible en réunion.
 *
 * ⚠️ #2206.42 — une QUATRIÈME photo, à `weeksAgo: 6` (42 jours), s'ajoute pour
 * la Haute-Garonne SEULE. Sans elle, l'écran n'a que trois photos serrées sur
 * deux semaines : assez pour l'horizon ACTUEL, pas pour le STRUCTUREL, qui
 * exige un fond d'au moins 30 jours (`STRUCTURAL_TREND_MIN_SPAN_DAYS`). Avec
 * elle, « Tendance de fond » se lit depuis le 42ᵉ jour au lieu d'écrire « non
 * mesuré — pas encore assez de recul » sur toute la salle de démonstration.
 * Le Rhône reste à TROIS : il montre le cas symétrique, celui où le fond n'a
 * réellement pas encore assez de recul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE CHIFFRE MONTRE, ET POURQUOI CELUI-LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * · `offers` de la Haute-Garonne atteint 100 à la dernière photo : c'est la
 *   BORNE de collecte, et l'écran doit écrire « au moins 100 » puis REFUSER
 *   d'en tirer une tendance, sur les DEUX horizons — la borne s'applique à
 *   `structuralTrend` exactement comme à `trend`. Les trois autres mesures,
 *   elles, ont une tendance lisible sur les deux horizons.
 * · Le Rhône est borné aux TROIS photos : c'est le cas d'un gros territoire, où
 *   la collecte plafonne en permanence.
 * · `SCC France` entre à la dernière photo (mouvement « nouvelle entrée ») et
 *   `Capgemini` en sort (mouvement « sortie ») : les deux formes de mouvement
 *   que l'écran sait désormais nommer.
 *
 * Les dates sont CALCULÉES au semis — figées, elles cesseraient d'être « la
 * semaine dernière » au premier lundi suivant.
 */
type DemoTerritorySnapshot = {
  department: string
  weeksAgo: number
  offers: number | null
  esnPresent: number | null
  openTenders: number | null
  awardedContracts: number | null
  buyersWithIncumbent: number | null
  topTechnologies: { term: string; count: number }[]
  esnHiring: { name: string; offers: number }[]
}

export const DEMO_TERRITORY_SNAPSHOTS: readonly DemoTerritorySnapshot[] = [
  {
    // #2206.42 — la photo la plus ANCIENNE de la Haute-Garonne : c'est elle qui
    // donne son fond à « Tendance de fond ». 42 jours, pas 30 pile : la garde
    // du contrat (`STRUCTURAL_TREND_MIN_SPAN_DAYS`) veut un écart RÉEL, pas une
    // valeur à la limite qui deviendrait fausse au premier jour qui passe.
    department: '31',
    weeksAgo: 6,
    offers: 52,
    esnPresent: 1290,
    openTenders: 4,
    awardedContracts: 8,
    buyersWithIncumbent: 5,
    topTechnologies: [
      { term: 'java', count: 14 },
      { term: 'cloud', count: 8 },
      { term: 'data', count: 5 },
    ],
    esnHiring: [
      { name: 'sopra steria', offers: 5 },
      { name: 'sii', offers: 3 },
    ],
  },
  {
    department: '31',
    weeksAgo: 2,
    offers: 78,
    esnPresent: 1316,
    openTenders: 6,
    awardedContracts: 11,
    buyersWithIncumbent: 8,
    topTechnologies: [
      { term: 'java', count: 19 },
      { term: 'cloud', count: 12 },
      { term: 'data', count: 9 },
      { term: 'cyber', count: 6 },
    ],
    esnHiring: [
      { name: 'sopra steria', offers: 7 },
      { name: 'sii', offers: 5 },
      { name: 'capgemini', offers: 4 },
    ],
  },
  {
    department: '31',
    weeksAgo: 1,
    offers: 91,
    esnPresent: 1316,
    openTenders: 8,
    awardedContracts: 11,
    buyersWithIncumbent: 8,
    topTechnologies: [
      { term: 'java', count: 22 },
      { term: 'cloud', count: 14 },
      { term: 'data', count: 9 },
      { term: 'cyber', count: 7 },
    ],
    esnHiring: [
      { name: 'sopra steria', offers: 9 },
      { name: 'sii', offers: 4 },
      { name: 'capgemini', offers: 4 },
    ],
  },
  {
    department: '31',
    weeksAgo: 0,
    offers: 100,
    esnPresent: 1318,
    openTenders: 11,
    awardedContracts: 12,
    buyersWithIncumbent: 9,
    topTechnologies: [
      { term: 'java', count: 24 },
      { term: 'cloud', count: 17 },
      { term: 'data', count: 11 },
      { term: 'cyber', count: 8 },
      { term: 'devops', count: 6 },
    ],
    esnHiring: [
      { name: 'sopra steria', offers: 12 },
      { name: 'sii', offers: 4 },
      { name: 'scc france', offers: 3 },
    ],
  },
  {
    department: '69',
    weeksAgo: 2,
    offers: 100,
    esnPresent: 2104,
    openTenders: 14,
    awardedContracts: 19,
    buyersWithIncumbent: 15,
    topTechnologies: [
      { term: 'java', count: 26 },
      { term: 'sap', count: 15 },
      { term: 'cloud', count: 13 },
      // #3816 (lot C4) — Kubernetes est sur la fiche de Camille Roussel : sans un terme qu'elle porte,
      // « trouve-moi des missions pour ce profil » ne relierait aucun recruteur du Rhône à son profil.
      { term: 'kubernetes', count: 11 },
    ],
    esnHiring: [
      { name: 'sii', offers: 11 },
      { name: 'alten', offers: 8 },
    ],
  },
  {
    department: '69',
    weeksAgo: 1,
    offers: 100,
    esnPresent: 2110,
    openTenders: 12,
    awardedContracts: 21,
    buyersWithIncumbent: 16,
    topTechnologies: [
      { term: 'java', count: 25 },
      { term: 'sap', count: 16 },
      { term: 'cloud', count: 14 },
      // #3816 (lot C4) — Kubernetes est sur la fiche de Camille Roussel : sans un terme qu'elle porte,
      // « trouve-moi des missions pour ce profil » ne relierait aucun recruteur du Rhône à son profil.
      { term: 'kubernetes', count: 12 },
    ],
    esnHiring: [
      { name: 'sii', offers: 10 },
      { name: 'alten', offers: 9 },
    ],
  },
  {
    department: '69',
    weeksAgo: 0,
    offers: 100,
    esnPresent: 2113,
    openTenders: 9,
    awardedContracts: 22,
    buyersWithIncumbent: 16,
    topTechnologies: [
      { term: 'java', count: 27 },
      { term: 'sap', count: 16 },
      { term: 'cloud', count: 15 },
      // #3816 (lot C4) — Kubernetes est sur la fiche de Camille Roussel : sans un terme qu'elle porte,
      // « trouve-moi des missions pour ce profil » ne relierait aucun recruteur du Rhône à son profil.
      { term: 'kubernetes', count: 12 },
    ],
    esnHiring: [
      { name: 'sii', offers: 10 },
      { name: 'alten', offers: 9 },
    ],
  },
]

/**
 * LES GESTES HORS OUTIL COCHÉS SUR LES MISSIONS DE LA SALLE (craft rule n°9, #1503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SEMIS EXISTE, ALORS QUE LES PARCOURS SE REMPLISSENT SEULS
 * ─────────────────────────────────────────────────────────────────────────
 * Depuis que les parcours se DÉRIVENT des objets, les sept pistes se remplissent
 * toutes seules dans la salle : les comptes, les besoins, les projets et les
 * missions de la démonstration sont de vrais objets, donc ils se placent. Rien à
 * seeder de ce côté-là, et c'est la meilleure preuve que la dérivation marche.
 *
 * La checklist, elle, ne se dérive de rien — c'est tout son objet : badge
 * d'accès, VPN, matériel, kick-off sont les gestes qu'AUCUNE table ne porte.
 * Sans ce semis, le bloc « Gestes hors outil » d'une fiche mission s'afficherait
 * « 0 / 14 » sur les dix missions de la salle, et un prospect en conclurait que
 * personne ne s'en sert.
 *
 * ⚠️ Ce qui est coché reste COHÉRENT avec l'ancienneté de la mission : une
 * mission démarrée il y a 24 jours n'a pas son « Point à J+30 ». Cocher tout
 * ferait une salle où rien n'est jamais en cours — et une checklist pleine ne
 * montre pas à quoi sert une checklist.
 */
export const DEMO_CHAIN_MANUAL_MARKS: readonly { missionLabel: string; positions: readonly number[] }[] = [
  {
    // 24 jours : l'onboarding est fait, les rituels sont calés, le point à J+30
    // n'a pas encore eu lieu — et c'est ce qui rend la ligne crédible.
    missionLabel: 'Fiabilisation plateforme — renfort exploitation',
    positions: [9, 10, 11, 12, 13, 14, 15, 16, 17],
  },
  {
    // 52 jours : le point à J+30 est passé, la mi-parcours non.
    missionLabel: 'Cadrage données transport — lot 2',
    positions: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  },
  {
    // Une mission qui vient de démarrer : le contrat et le bon de commande sont
    // là, les accès pas encore. C'est le cas qui montre qu'une case NON cochée
    // est une information, pas un oubli d'affichage.
    missionLabel: 'Reprise de l’ordonnancement des flux — lot pilote',
    positions: [9, 10],
  },
]

/**
 * #2155.13 à .21 puis #2156.5 à .48 — la liste « Mes cibles » de la salle de
 * démonstration.
 *
 * Elle ne nomme AUCUN compte : ses éléments référencent les dossiers semés plus
 * haut (les deux premiers comptes, le premier contact), exactement comme en
 * production. Quatre statuts de travail, trois provenances, une priorité laissée
 * non posée — ce que l'écran distingue.
 *
 * Elle porte AUSSI le modèle complet, sans quoi un prospect verrait des colonnes
 * vides là où le produit en promet dix-huit : une liste NÉE d'une recherche
 * (`source` + `sourceQuery`), rattachée à une équipe, EN COURS, avec sa prochaine
 * action. Et un élément RETIRÉ avec son motif (#2156.31) : la trace existe même
 * quand la ligne ne s'affiche plus, c'est tout l'intérêt d'archiver.
 */
export const DEMO_TARGET_LIST = {
  name: 'Banques et assurances — trimestre en cours',
  objective: 'Décrocher trois rendez-vous avec des directions informatiques avant la fin du trimestre',
  team: 'Cellule grands comptes',
  status: 'in_progress',
  visibility: 'workspace',
  source: 'saved_search',
  sourceQuery: { secteur: 'Banque et assurance', effectif: 'plus de 500', region: 'Île-de-France' },
  nextAction: 'Caler les trois premiers appels avant vendredi',
  nextActions: ['Appeler la DSI pour caler un rendez-vous', 'Envoyer la référence mission comparable', null],
  selectionReasons: [
    'Deux offres d’emploi ouvertes sur la même compétence depuis six semaines',
    'Programme de modernisation annoncé au dernier rapport annuel',
    'Rencontré sur un salon, a demandé à être recontacté en fin de trimestre',
  ],
  removal: {
    reason: 'Déjà cliente d’une autre cellule — retirée de la liste, pas du portefeuille',
  },
} as const

/**
 * Théo B c2-mes-listes — « Contacts › Mes listes » ne se lit pas avec la seule liste mixte : le sélecteur
 * Contacts / Comptes a besoin d'une liste de CONTACTS pure, et l'archive (« 1 liste archivée ») d'une liste
 * rangée. Les contacts sont ceux déjà semés — aucune personne n'est inventée pour elles. La liste archivée
 * garde ses éléments : on archive, on ne supprime pas.
 */
export const DEMO_CONTACT_TARGET_LISTS = [
  {
    name: 'Interlocuteurs Data & BI',
    objective: 'Responsables Data et BI des comptes en cadrage. Aucune inscription automatique.',
    status: 'in_progress',
    contactCount: 3,
    nextAction: 'Relancer ceux qui n’ont pas été sollicités depuis 30 jours',
  },
  {
    name: 'Salon Data Paris 2025',
    objective: 'Contacts rencontrés au salon. Archivée en septembre.',
    status: 'archived',
    contactCount: 2,
    nextAction: null,
  },
] as const

/**
 * #3753.7 — la liste « Ciblage — tiering ESN » : ce qu'un prospect voit quand une
 * ESN a IMPORTÉ son ciblage (tier A/B/C, raison, problématiques, projets IT).
 *
 * Elle référence les premiers dossiers semés (comme `DEMO_TARGET_LIST`) : aucun
 * compte n'est inventé pour elle. Le tier est la LETTRE de l'ESN — jamais un
 * pourcentage. Les problématiques et projets IT sont des HYPOTHÈSES DU VENDEUR
 * (non vérifiées, affichées « selon votre ciblage »). La dernière ligne n'a AUCUN
 * tier : c'est le cas qui prouve qu'une absence ne fait aucune ligne.
 */
export const DEMO_TIERED_TARGET_LIST = {
  name: 'Ciblage 2026 — tiering de l’ESN',
  objective: 'Retrouver tel quel le ciblage déjà fait : tier, raison, problématiques adressables',
  items: [
    {
      tier: 'A',
      reason: 'Programme de transformation SI annoncé, DSI déjà rencontrée',
      addressableIssues: 'Dette applicative sur le socle historique, besoin de renfort data',
      upcomingItProjects: 'Refonte du portail clients au second semestre',
    },
    {
      tier: 'A',
      reason: 'Trois offres ouvertes sur nos compétences cœur depuis deux mois',
      addressableIssues: 'Difficulté à recruter des profils cloud',
      upcomingItProjects: 'Migration vers le cloud public',
    },
    {
      tier: 'B',
      reason: 'Budget IT en hausse au dernier rapport annuel',
      addressableIssues: 'Pilotage de la sous-traitance IT',
      upcomingItProjects: null,
    },
    {
      tier: 'C',
      reason: 'Secteur adjacent, aucun signal récent',
      addressableIssues: null,
      upcomingItProjects: null,
    },
    { tier: null, reason: null, addressableIssues: null, upcomingItProjects: null },
  ],
} as const

/**
 * #2126.47-.60 (épopée #2787) — LES OUTCOMES COMMERCIAUX semés.
 *
 * Deux lignes, pour montrer les DEUX formes que l'objet distingue (voir
 * `commercial-outcome.ts`) : un outcome porté par un CONTACT précis
 * (`message_replied`, attaché au premier contact rencontré par le semis), et
 * un outcome de PORTÉE COMPTE, sans contact (`declined`, `contactId: null`) —
 * un partenariat ou une offre refusés au niveau de l'entreprise, pas d'une
 * personne. `seedCommercialOutcomes` (demo-seed.service.ts) les rattache aux
 * premier et second comptes/contacts du semis : l'identité précise importe
 * peu ici, la démo montre l'OBJET, pas un scénario dédié (même choix que
 * `seedTargetLists`, qui prend « le premier compte » sans plus de précision).
 */
export const DEMO_COMMERCIAL_OUTCOMES = {
  contactOutcome: {
    type: 'message_replied',
    reason: 'A répondu au premier message avec une question sur les délais de démarrage.',
  },
  accountOutcome: {
    type: 'declined',
    reason: 'Le partenariat proposé a été refusé — budget déjà engagé avec un concurrent cette année.',
  },
} as const

/**
 * #4188 — UN compte « déjà envoyé » vers le CRM de la salle, pour que la fiche
 * montre « Dans <CRM> » et qu'un second envoi se lise « déjà présent ».
 *
 * La destination est le connecteur CRM FICTIF de la salle, celui que la carte
 * d'export nomme déjà « démonstration » (`CrmService.getStatus`, lot D01) :
 * aucune ligne `crm_connections`, donc aucun lien vers une fiche (jamais un
 * lien deviné). L'identifiant porte le préfixe `demo-` de ce connecteur.
 */
export const DEMO_ACCOUNT_CRM_EXPORT = {
  companyName: 'SNCF',
  provider: 'hubspot',
  crmRecordId: 'demo-sncf-societe',
  destinationLabel: 'Bellum Conseil — CRM fictif',
} as const

/**
 * #4051 — « Importé le <date> depuis <fichier> » : UN import passé, fictif, que l'historique de chaque fiche
 * d'exemple (compte, contact, consultant) rend — pour qu'un prospect voie d'où vient une fiche (craft rule n°9).
 * Les noms de fichier sont évidemment fictifs (`exemple`) ; la date est relative au semis, jamais figée.
 * Seul un fichier est nommé : jamais un fournisseur à nous.
 */
export const DEMO_IMPORT_MARKS = {
  daysAgo: 9,
  /** Comptes et contacts d'exemple : un export de CRM déposé en fichier. */
  recordsFile: 'export-crm-exemple.csv',
  /** Consultants d'exemple : un lot de CV déposé en archive. */
  consultantsFile: 'vivier-cv-exemple.zip',
} as const

/**
 * #4459.4 (craft rule n°9) — UN compte « Venu de ton CRM » analysé, avec ses contacts d'origine ET ceux que
 * l'analyse a apportés. La salle marque tout son portefeuille comme importé (`DEMO_IMPORT_MARKS`) ; sur CE
 * dossier, les contacts nommés ici n'en reçoivent PAS la trace : ils se lisent « Apporté par Bellum », le
 * compteur dit « N dans ton CRM · 2 trouvés par l'analyse » (N = tous les autres contacts du dossier) et « Compléter le compte » a quelque chose à
 * proposer. Aucune personne inventée : ce sont les contacts déjà semés du dossier.
 */
export const DEMO_CRM_COMPLETION = {
  companyName: 'Société Générale',
  broughtContacts: ['Pierre Palmieri', 'Maxime Delaunay'],
} as const

/**
 * #2284.67-.69 — la correction d'identité semée : l'espace de démonstration a
 * CONFIRMÉ l'entité résolue de SNCF (« c'est bien celle-ci »). Elle ne vise
 * que des faits déjà semés sur le dossier (même SIREN, même raison sociale) —
 * rien n'est inventé, et la carte montre l'état « confirmée par votre espace ».
 */
export const DEMO_ENTITY_RESOLUTION_CORRECTION = {
  companyName: 'SNCF',
  request: {
    decision: 'confirmed',
    target_name: 'SNCF',
    target_siren: '552049447',
    note: null,
  },
} as const

/**
 * #2293.5 / .6 — un LOT d'analyses multi-comptes dans la salle de démonstration.
 *
 * Comme « Mes cibles », il ne nomme AUCUN compte de la salle en dur : ses deux
 * premiers sous-jobs RÉFÉRENCENT les deux premiers dossiers semés (état
 * « terminée », jamais débités — la démo ne débite rien). Le troisième est une
 * AMBIGUÏTÉ « à confirmer » avec deux entités fictives, pour que le prospect
 * voie le geste de confirmation. Données fictives : espace de démonstration.
 *
 * #2283.32 (épopée #2983) — le quatrième RÉFÉRENCE le troisième dossier semé
 * (état `needs_resolution`) : son analyse a ABOUTI, mais le Résolveur
 * d'identité (#2284) resterait ambigu pour ce nom. Ces candidats sont
 * FICTIFS, même convention que `ambiguous` ci-dessus (SIREN 900000xxx) —
 * `raw_analysis.entity_resolution` du dossier référencé, lui, N'EST PAS touché
 * et reste hors de l'état `ambiguous` (`DEMO_ENTITY_RESOLUTION_COVERAGE` :
 * « jamais de donnée fictive » l'emporte sur un verdict qui se prétendrait
 * sourcé au registre). Le prospect voit ici les DEUX issues possibles :
 * demander une résolution (ouvrir le dossier) ou exclure du lot.
 */
export const DEMO_ANALYSIS_BATCH = {
  source: 'names' as const,
  ambiguous: {
    name: 'Groupe Horizon',
    candidates: [
      { name: 'Groupe Horizon SA', siren: '900000011', city: 'Lyon' },
      { name: 'Horizon Services', siren: '900000029', city: 'Nantes' },
    ],
  },
  needsResolution: {
    candidates: [
      { name: 'Silex Group SA', siren: '900000037', city: 'Bordeaux' },
      { name: 'Silex Participations', siren: '900000045', city: 'Toulouse' },
    ],
  },
}

/**
 * #4611.9 — « où en est le travail lancé ? », en démonstration (craft n°9).
 *
 * `get_work_progress` (Laura) lit les lots d'analyses de l'espace. Le premier lot de la salle
 * (`DEMO_ANALYSIS_BATCH`) n'a que des sous-jobs terminés ou à trancher : la carte d'avancement n'y aurait montré
 * ni « en cours » ni « en erreur ». Ce SECOND lot, lancé la veille, porte ce qui manque : une analyse rendue,
 * une en cours, une en file, et UNE EN ERREUR avec la raison que l'amont a donnée (`launch_error`, le code que
 * le lot écrit quand un lancement échoue) — jamais une raison inventée. Les rattrapages, eux, ne sont pas
 * semés : aucun journal par espace ne les tient, la carte les rend NON MESURÉS (c'est l'état réel du produit,
 * et c'est la case « non mesurée » que la salle doit montrer).
 *
 * Données FICTIVES, assumées comme telles ; aucun débit (`charged = false`).
 */
export const DEMO_WORK_PROGRESS = {
  analysisBatch: {
    source: 'names' as const,
    hoursAgo: 20,
    /** `accountIndex` = rang du dossier semé que le sous-job référence ; `null` = jamais lancé (échec au lancement). */
    items: [
      { state: 'done' as const, accountIndex: 0, failureCode: null },
      { state: 'running' as const, accountIndex: 1, failureCode: null },
      { state: 'queued' as const, accountIndex: 2, failureCode: null },
      { state: 'failed' as const, accountIndex: null, failureCode: 'launch_error', name: 'Meridian Industries' },
    ],
  },
}

/**
 * #2455 — un contexte de travail ENREGISTRÉ (LAU-FINAL-168), déjà présent au
 * premier chargement de « Mes contextes de travail » (`ProfilePage`). Le
 * profil principal (comptes/secteurs du jeu de démo) reste inchangé — c'est
 * précisément ce que ce contexte démontre : une VARIANTE à côté, jamais une
 * mutation.
 */
export const DEMO_WORK_CONTEXT = {
  name: 'Automobile — grand Ouest',
  objective: 'Décrocher un premier rendez-vous avec un équipementier automobile du grand Ouest',
  sectors: ['Automobile'],
  territories: ['Bretagne', 'Pays de la Loire'],
} as const

/**
 * #2571.5 — l'appel d'offres de la salle de démonstration, avec son inconnue.
 *
 * Réfuté en recette le 18/09/2026 : `/rfp` s'ouvrait sur « Aucun appel
 * d'offres importé » — la prévisualisation de besoin (`GET
 * /rfp/:id/need-preview`, #2571.2) était juste, calculée, testée, et
 * personne ne pouvait l'atteindre en démo. Ce titre alimente `seedRfp`
 * (`demo-seed.service.ts`), qui appelle `demoRfpAnalysis` (`demo-scripts.ts`)
 * — le MÊME script que l'import en direct, pour que la salle ne montre
 * jamais un écran que le produit ne sait pas rendre.
 */
/**
 * #2957 (#2180.53) — l'import d'appel d'offres INTERROMPU de la salle : un
 * aperçu déjà rendu, jamais confirmé, que `/rfp` propose de reprendre.
 */
export const DEMO_RFP_INTERRUPTED_IMPORT = {
  title: 'Consultation socle de données (démo) — import en cours',
  reference: 'DEMO-2026-DATA-017',
  documentNames: ['CCTP_socle_donnees.pdf', 'Reglement_consultation.pdf'],
} as const

export const DEMO_RFP = {
  title: 'Consultation infrastructure cloud (démo)',
  /** #2957 (#2181.15) — le commentaire d'équipe de l'exigence bloquée. */
  blockedComment:
    'En attente du plafond de pénalités côté acheteur — question posée sur la plateforme, relance vendredi.',
} as const

/**
 * #2005.3 / #2087.14 — LES PÉRIMÈTRES DE TRAVAIL de la salle de démonstration.
 *
 * Trois échelles différentes, parce que c'est ce que la question « à quelle
 * échelle travailles-tu réellement ? » demande de montrer : une agence, une BU
 * sectorielle, une nouvelle activité. Sans elles, l'écran des périmètres
 * s'ouvrirait sur « Aucun périmètre » devant un prospect — et le niveau d'accès
 * intermédiaire, qui est l'argument d'un groupe à plusieurs agences, n'aurait
 * rien à désigner.
 *
 * ⚠️ Les effectifs du troisième sont volontairement ABSENTS : « non renseigné »
 * est un état que l'écran doit savoir rendre (et ne JAMAIS rendre « 0 »), et un
 * jeu de démonstration où tout est rempli ne le prouve jamais.
 */
export const DEMO_BUSINESS_UNITS = [
  {
    name: 'Agence Lyon',
    kind: 'agency',
    territory: 'Auvergne-Rhône-Alpes',
    specialties: ['Data', 'Cloud'],
    consultantCount: 42,
    teamSize: 4,
    portfolioNote: 'Grands comptes industriels et banque régionale',
    // #2005.5 (DÉCISION Louis 17/09, lot CP2) — saisis par le responsable de
    // BU dans les réglages des périmètres.
    capacityAvailableConsultants: 5,
    quarterObjective: 'Signer deux nouveaux comptes industriels avant fin de trimestre',
  },
  {
    name: 'BU Banque & Assurance',
    kind: 'business_unit',
    territory: 'National',
    specialties: ['Core banking', 'Conformité', 'Data'],
    consultantCount: 68,
    teamSize: 6,
    portfolioNote: 'Comptes bancaires et assurantiels, toutes régions',
    capacityAvailableConsultants: 3,
    quarterObjective: 'Renouveler les deux missions qui arrivent à échéance en octobre',
  },
  {
    name: 'Équipe Nouvelles activités',
    kind: 'new_venture',
    territory: null,
    specialties: ['IA générative'],
    consultantCount: null,
    teamSize: null,
    portfolioNote: null,
    // ⚠️ Volontairement ABSENTS, même raison que les effectifs ci-dessus :
    // « non renseigné » doit rester un état que l'écran sait rendre.
    capacityAvailableConsultants: null,
    quarterObjective: null,
  },
] as const

/**
 * #2420.17 — LE SEUIL D'ALERTE DE MARGE DE L'ESPACE, réglé pour la salle de
 * démonstration.
 *
 * `PATCH delivery/finance/margin-threshold` existait sans aucun appelant web :
 * « Seuil d'alerte · non réglé » restait en lecture seule sur
 * `/pilotage/finance`, et un prospect qui découvre le nouveau formulaire de
 * Réglages y aurait trouvé « non réglé » alors même que le geste vient d'être
 * livré. Le défaut du produit reste `null` (éteint) : un seul espace, celui de
 * la démo, le règle — pour que le formulaire ait quelque chose à montrer
 * RÉGLÉ, et que le diagnostic de marge basse de Laura ait une chance de se
 * déclencher.
 */
export const DEMO_MARGIN_ALERT_THRESHOLD_PERCENT = 20

/**
 * Théo D settings-espace.N5 — LA SIGNATURE PROPOSÉE ET LE PIED DE DOCUMENT de la salle de démonstration.
 *
 * Réglages › Mon espace › Marque & documents les montre RÉGLÉS, avec l'aperçu d'un dossier de compétences, au lieu de
 * champs vides devant un prospect. Aucune coordonnée réelle : l'ESN de la salle s'appelle `DEMO_ESN_PROFILE.esn_name`
 * et le numéro est le numéro de test réservé aux œuvres de fiction (01 99 00 xx xx).
 */
export const DEMO_DOCUMENT_IDENTITY = {
  signature: "L'équipe Bellum Conseil\n01 99 00 12 34 · contact@bellum-conseil.example",
  footer: 'Bellum Conseil · Document confidentiel, établi pour son destinataire',
} as const

/**
 * #2366 / #2382 — le centre d'approbation de l'outreach, rempli en démo
 * (craft rule n°9). Une ligne par VUE que l'écran distingue — à valider,
 * modifié, prêt, exécuté — pour qu'un prospect voie les onglets vivre, et un
 * appel en « rappel convenu » pour la machine d'appel.
 *
 * `template` = le gabarit d'origine (version 1), `body` = la version
 * personnalisée (version 2), `edit` = une retouche humaine (version 3) : c'est
 * ce qui remplit le diff à trois versions (#2382.3). Aucun message n'est
 * « envoyé » par le semis : `copied_manual` est un geste déclaratif, jamais
 * une preuve d'envoi.
 */
export const DEMO_OUTREACH_MESSAGES: readonly {
  contact: string
  intent: 'open_relationship' | 'follow_up' | 'reactivate' | 'push_profile'
  source: 'contacts' | 'laura' | 'sequences' | 'today'
  status: 'needs_review' | 'approved' | 'copied_manual'
  template: { subject: string; body: string }
  subject: string
  body: string
  edit?: { subject: string; body: string }
  /**
   * #2877 (#2385.4, recette 02/10) — natures DÉCLARÉES par le relecteur de la
   * salle (jamais lues dans le corps) : la carte s'ouvre sur « Signalé : … »,
   * puisque le geste d'écriture est refusé en lecture seule.
   */
  quality_flags?: readonly ('wrong_fact' | 'wrong_cta' | 'wrong_persona')[]
  /**
   * #3419.1 — les variables annotées sur la VERSION COURANTE : valeur, source,
   * date, confiance, usage externe. Un fait établi ET un fait à confirmer, pour
   * que le panneau montre les deux états (jamais « inconnu » lu comme autorisé).
   */
  variables?: readonly {
    name: string
    value: string
    source: string
    as_of: string
    confidence: 'confirmed' | 'probable' | 'unverified'
    external_use: 'allowed' | 'forbidden' | 'unknown'
  }[]
}[] = [
  {
    contact: 'Lorenzo Bini Smaghi',
    intent: 'open_relationship',
    source: 'laura',
    status: 'needs_review',
    quality_flags: ['wrong_fact'],
    variables: [
      {
        name: 'Annonce de refonte du socle data',
        value: 'La banque a annoncé la refonte de son socle data.',
        source: 'Communication publique de la banque',
        as_of: '2026-09-10',
        confidence: 'confirmed',
        external_use: 'allowed',
      },
      {
        name: 'Chantier comparable livré',
        value: 'Un chantier data comparable livré l’an dernier.',
        source: 'Référence interne, à confirmer avec le client',
        as_of: '2026-09-10',
        confidence: 'unverified',
        external_use: 'unknown',
      },
      // #3752.7 — la SOURCE DOCUMENTAIRE : la preuve citée vient d'un document de
      // la base de l'espace (`DEMO_RAG_DOCUMENTS`), nommé par son titre exact —
      // c'est ce que la génération réelle renvoie dans `knowledgeSources`.
      {
        name: 'Exploitation après migration',
        value: 'Délai moyen de détection d’incident divisé par quatre en quatre mois.',
        source: 'Document de l’espace : Référence client — exploitation de plateforme après migration (démo)',
        as_of: '2026-09-10',
        confidence: 'confirmed',
        external_use: 'allowed',
      },
      // #2877 / #3419.4 — la SOURCE MÉMOIRE MARCHÉ : un corpus AGRÉGÉ
      // (observation-industrie, jamais une fiche d'une personne identifiée),
      // qui ne lave donc jamais, seule, l'usage externe (`forbidden` ici,
      // `unknown` serait tout aussi valide — jamais `allowed`, le schéma le
      // refuse).
      {
        name: 'Tendance sectorielle cloud',
        value: 'Plusieurs banques françaises accélèrent leur migration cloud au second semestre 2026.',
        source: 'Mémoire marché : tendance-cloud-banque-2026',
        as_of: '2026-09-10',
        confidence: 'probable',
        external_use: 'forbidden',
      },
    ],
    template: {
      subject: 'Bonjour {prénom}',
      body: 'Bonjour {prénom},\nNous accompagnons des DSI sur leurs projets data.\nSeriez-vous disponible 20 minutes ?',
    },
    subject: 'Votre programme data 2027',
    body: 'Bonjour Lorenzo,\nVotre annonce sur la refonte du socle data de la banque a retenu mon attention.\nNous avons livré un chantier comparable l’an dernier.\nSeriez-vous disponible 20 minutes jeudi ?',
  },
  // #3420 (lot Q06) — l'OUVERTURE qui précède la relance de Lucie : une
  // relance sans premier contact est un mauvais scénario relationnel (#3420.2)
  // et « suite à mon précédent message » contredit l'historique (#3420.9).
  // Le message est `copied_manual` — un geste déclaratif, jamais une preuve
  // d'envoi — et c'est lui que le serveur compte comme « déjà parti ».
  {
    // #4163 LF — un siège sans nom ne reçoit pas de séquence : la cadence vise une personne NOMMÉE (même fonction, SNCF).
    contact: 'Grégory Pinault',
    intent: 'open_relationship',
    source: 'sequences',
    status: 'copied_manual',
    template: {
      subject: 'Un retour d’expérience cloud',
      body: 'Bonjour {prénom},\nNous avons livré une migration cloud.',
    },
    subject: 'Un retour d’expérience cloud',
    body: 'Bonjour,\nNous avons livré une migration cloud chez SNCF, dans le transport ferroviaire.\nSeriez-vous disponible pour en voir le retour d’expérience ?',
  },
  {
    // #4163 LF — un siège sans nom ne reçoit pas de séquence : la cadence vise une personne NOMMÉE (même fonction, SNCF).
    contact: 'Grégory Pinault',
    intent: 'follow_up',
    source: 'sequences',
    status: 'needs_review',
    template: {
      subject: 'Suite à notre échange',
      body: 'Bonjour {prénom},\nJe reviens vers vous suite à mon précédent message.',
    },
    subject: 'Suite à notre échange',
    body: 'Bonjour,\nJe reviens vers vous suite à mon précédent message sur vos achats digitaux chez SNCF, dans le transport ferroviaire.\nAvez-vous eu le temps d’y jeter un œil ?',
    edit: {
      subject: 'Suite à notre échange',
      body: 'Bonjour,\nJe reviens vers vous suite à mon précédent message sur vos achats digitaux chez SNCF, dans le transport ferroviaire.\nJe joins le retour d’expérience du projet cloud évoqué.\nAvez-vous eu le temps d’y jeter un œil ?',
    },
  },
  {
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    intent: 'push_profile',
    source: 'contacts',
    status: 'approved',
    template: { subject: 'Un profil pour {compte}', body: 'Bonjour {prénom},\nUn de nos consultants se libère.' },
    subject: 'Un architecte cloud disponible en novembre',
    body: 'Bonjour,\nUn de nos architectes cloud se libère en novembre.\nSon dernier projet était chez SNCF, dans le transport ferroviaire, comme vos chantiers en cours.\nPuis-je vous le présenter cette semaine ?',
  },
  {
    contact: 'Isabelle Rouault',
    intent: 'reactivate',
    source: 'today',
    status: 'copied_manual',
    template: { subject: 'Des nouvelles', body: 'Bonjour {prénom},\nCela fait un moment.' },
    subject: 'Des nouvelles depuis le salon',
    body: 'Bonjour Isabelle,\nRavi de vous avoir croisé au salon la semaine dernière.\nUn café cette semaine pour prolonger l’échange ?',
  },
  /**
   * #3419/#3420 (30/09/2026, lot C16, retours bêta #3419/#3420) — la vue
   * « bloqué » du centre d'approbation n'avait aucun message pour l'illustrer
   * en salle de démo. `Pierre Palmieri` (Société Générale) porte, sur sa
   * fiche, la note « jamais comme première approche à froid » — exactement le
   * geste que ce brouillon commet, avec une affirmation de relation non
   * prouvée en plus (#3419.2) : un cas réaliste, pas fabriqué pour le test.
   */
  {
    contact: 'Pierre Palmieri',
    intent: 'open_relationship',
    source: 'laura',
    status: 'needs_review',
    template: {
      subject: 'Votre gouvernance',
      body: 'Bonjour {prénom},\nNous travaillons déjà avec votre groupe.',
    },
    subject: 'Votre gouvernance',
    body: 'Bonjour Pierre,\nNous travaillons déjà avec votre groupe sur plusieurs sujets IT de la banque.\nPouvons-nous en parler ?',
  },
  /**
   * #3420.13 (lot Q06) — LE RENDEZ-VOUS IMPOSÉ dès le premier message : la
   * phrase « je vous propose un rendez-vous jeudi » n'est pas une question,
   * et personne n'a encore écrit à ce contact. Le centre d'approbation le
   * range dans « bloqué » avec son motif, et la question polie des autres
   * messages du jeu (« Seriez-vous disponible… ? ») passe.
   */
  {
    contact: 'Philippe Marchand',
    intent: 'open_relationship',
    source: 'laura',
    status: 'needs_review',
    template: { subject: 'Un rendez-vous', body: 'Bonjour {prénom},\nJe vous propose un rendez-vous jeudi.' },
    subject: 'Un rendez-vous jeudi',
    body: 'Bonjour Philippe,\nJe vous propose un rendez-vous jeudi à 14 h pour vous présenter notre offre pour le transport ferroviaire.',
  } /**
   * #3419.2 (lot Z08) — UNE TECHNOLOGIE AFFIRMÉE SANS PREUVE : « vous utilisez
   * Databricks » alors que l'enrichissement du compte ne la confirme pas. Le
   * centre d'approbation le range dans « bloqué » avec son motif.
   */,
  {
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    // Décision Louis 04/10/2026 — un SIÈGE du dossier SNCF, sans statut de
    // relation déclaré (« nouveau ») : le message est donc une OUVERTURE.
    intent: 'open_relationship',
    source: 'laura',
    status: 'needs_review',
    template: {
      subject: 'Votre plateforme data',
      body: 'Bonjour {prénom},\nVous utilisez Databricks. Un échange vous dirait-il ?',
    },
    subject: 'Votre plateforme data',
    body: 'Bonjour,\nVous utilisez Databricks pour votre socle data chez SNCF, dans le transport ferroviaire. Un échange de vingt minutes vous dirait-il ?',
    // #3419 (recette démo 10/10) — la variable que le motif « technologie affirmée sans être confirmée »
    // vise : valeur, source, date, confiance, usage externe NON établi.
    variables: [
      {
        name: 'Technologie du socle data',
        value: 'Databricks',
        source: 'Mention dans une offre d’emploi, non recoupée',
        as_of: '2026-09-18',
        confidence: 'unverified',
        external_use: 'unknown',
      },
    ],
  },
  /**
   * #3420 (lot X62, recette prod 02/10 : « 'Il manque une preuve' absent ») —
   * UN FAIT AFFIRMÉ SANS PREUVE : « notre consultant est disponible » sans
   * qu'aucune disponibilité ne soit prouvée. Le centre d'approbation et la
   * fiche du contact le rangent dans « bloqué » avec « Il manque une preuve »
   * (`unverifiable_claim`). Message FICTIF de la salle, jamais parti : « à relire ».
   */
  {
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    intent: 'push_profile',
    source: 'contacts',
    status: 'needs_review',
    template: { subject: 'Un consultant pour vous', body: 'Bonjour {prénom},\nNotre consultant est disponible.' },
    subject: 'Un consultant pour votre équipe plateforme',
    body: 'Bonjour,\nNotre consultant est disponible dès lundi pour renforcer votre équipe plateforme chez SNCF, dans le transport ferroviaire.\nPuis-je vous le présenter cette semaine ?',
    // #3419 — « il manque une preuve » : la disponibilité n'est prouvée par rien.
    variables: [
      {
        name: 'Disponibilité du consultant',
        value: 'Disponible dès lundi',
        source: 'Aucune preuve de disponibilité au dossier',
        as_of: '2026-09-18',
        confidence: 'unverified',
        external_use: 'unknown',
      },
    ],
  },
]

/** #2366.5 — un appel en « rappel convenu » : la machine d'appel est distincte du message. */
export const DEMO_OUTREACH_CALL_TASKS: readonly {
  contact: string
  reason: string
  objective: string
  pitch: string
  status: 'callback' | 'ready'
  /**
   * Lot L-A (#4164) — l'échéance de l'appel, en jours RELATIFS au semis (jamais une date en dur) :
   * négatif = en retard. C'est ce qui range l'appel dans « En retard / Aujourd'hui / Cette semaine »
   * de la page « Aujourd'hui ».
   */
  scheduledInDays: number
}[] = [
  {
    contact: 'Lorenzo Bini Smaghi',
    reason: 'A demandé à être rappelé après son comité de jeudi',
    objective: 'Caler un rendez-vous de cadrage',
    pitch: 'Le retour d’expérience du socle data livré chez un assureur',
    status: 'callback',
    scheduledInDays: 2,
  },
  // Lot L-A — un appel EN RETARD et un appel DU JOUR : la file ne montre un retard d'appel que si
  // la démo en porte un.
  {
    contact: 'Mathieu Brossard',
    reason: 'Sans réponse à ses deux derniers e-mails',
    objective: 'Obtenir quinze minutes cette semaine',
    pitch: 'Le point d’avancement sur le besoin plateforme, en deux phrases',
    status: 'ready',
    scheduledInDays: -1,
  },
  {
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    reason: 'A ouvert la proposition hier sans répondre',
    objective: 'Confirmer la réception de la proposition',
    pitch: 'Un rappel court : la proposition tient en une page',
    status: 'ready',
    scheduledInDays: 0,
  },
]

/**
 * #2768 (#2369.9/.10, #2369.14) — recette 28/09/2026 : `/settings/knowledge` ›
 * onglet « Mémoire de style » disait « Aucun style appris » / « Aucune règle
 * proposée », donc « Comparer » n'apparaissait nulle part — l'écran n'était
 * pas défaillant, il n'avait RIEN à montrer (`message_style_templates`/
 * `message_style_rule_proposals` classées « vide à dessein » depuis #2768,
 * raison : un template naît d'un geste explicite que la démo ne compose pas
 * elle-même). Renversement ASSUMÉ, même famille que #1509→#1515 pour les
 * séquences outreach : la doctrine « on ne sème pas un geste que personne n'a
 * posé » cède ici, parce que le NO-GO de #2369.14 (« Laura affirme avoir
 * appris sans montrer les règles ») ne se recette qu'avec au moins un
 * template et une proposition à l'écran.
 *
 * UN template `active`, canal `email` (dans `PREVIEW_SUPPORTED_CHANNELS` de
 * `MessageStyleTab.tsx`) — c'est ce qui rend le bouton « Comparer » visible,
 * qui a besoin d'un template dont le canal génère un exemple réel.
 */
export const DEMO_MESSAGE_STYLE_TEMPLATES: readonly {
  objective: string
  channel: 'email' | 'linkedin' | 'phone'
  persona: string
  status: 'draft' | 'validated' | 'active' | 'deprecated' | 'archived'
  forbidden: readonly string[]
  version: number
  /** #2947 (#2204.60/.61/.63) — déclarés par l'ESN FICTIVE de la salle (Bellum Conseil). */
  pitch: string | null
  tone: string | null
  signature: string | null
  /** #2204.65 — portée ÉQUIPE : le nom d'une équipe de la salle (`DEMO_BUSINESS_UNITS`). Absent : tout l'espace. */
  scope?: 'business_unit'
  businessUnitName?: string
}[] = [
  {
    objective: 'Relance après silence — reprendre contact sans culpabiliser',
    channel: 'email',
    persona: 'Direct, court, une seule question ouverte',
    status: 'active',
    forbidden: ['superlatifs commerciaux', 'relance à double question'],
    version: 2,
    pitch: 'Un retour d’expérience concret plutôt qu’une présentation du cabinet',
    tone: 'Vouvoiement, phrases courtes, aucune formule d’excuse',
    signature: 'L’équipe commerciale — Bellum Conseil (cabinet de démonstration)',
  },
  // #2204.65 (17/10) — la portée ÉQUIPE : le même objectif, posé sur l'Agence Lyon. Résolu avant le style d'espace
  // pour les membres de cette agence (équipe > espace), jamais pour les autres.
  {
    objective: 'Relance après silence — reprendre contact sans culpabiliser',
    channel: 'email',
    persona: 'Industriel régional, ton de proximité',
    // G.10 — une seule version ACTIVE par objectif et canal : « v1 et v2 actifs » se lisait comme un doublon de style.
    status: 'archived',
    forbidden: ['anglicismes commerciaux'],
    version: 1,
    pitch: 'Un retour d’expérience d’une usine de la région plutôt qu’une présentation du cabinet',
    tone: 'Tutoiement une fois le contact établi, phrases courtes',
    signature: 'L’Agence Lyon — Bellum Conseil (cabinet de démonstration)',
    scope: 'business_unit',
    businessUnitName: 'Agence Lyon',
  },
]

/**
 * #3427 — la bibliothèque d'exemples commerciaux de la salle de démo : TROIS
 * textes FICTIFS (client de démonstration), un par statut utile à la lecture —
 * approuvé en verbatim, approuvé en inspiration, à revoir (une affirmation de
 * résultat que aucune donnée ne soutient encore). `expectedVariables` se lit
 * dans le texte, jamais recopié. Le statut « à revoir » ici est le cas que
 * l'écran doit montrer : un exemple NON activable, avec sa raison nommée.
 */
export const DEMO_MESSAGE_LIBRARY_ENTRIES: readonly {
  title: string
  body: string
  channel: 'linkedin_draft' | 'email_draft' | 'call_brief'
  scenarioId: 'accepted_connection' | 'dormant_connection' | 'referred_contact' | 'cold_approach'
  persona: string
  decisionRole: string
  stage: string
  route: string
  objective: string
  mandatoryFacts: readonly string[]
  /** #3439.1 — les faits de `mandatoryFacts` déjà confirmés par le propriétaire de la démo. */
  confirmedFacts: readonly string[]
  claims: readonly { kind: string; statement: string; verifiedFactId: string | null }[]
  status: 'approuve' | 'a_revoir'
  mode: 'verbatim' | 'inspiration'
  usageConstraints: readonly string[]
}[] = [
  {
    title: 'Invitation acceptée — Manager — question de périmètre',
    body: 'Bonjour {{Prénom du contact}}, content d’être connectés. Sur {{périmètre}} chez {{Entreprise}}, c’est plutôt le build ou le run qui concentre la charge en ce moment ?',
    channel: 'linkedin_draft',
    scenarioId: 'accepted_connection',
    persona: 'manager',
    decisionRole: 'prescripteur',
    stage: 'ouverture',
    route: 'invitation_acceptee',
    objective: 'ouvrir la conversation sans démarche commerciale',
    mandatoryFacts: [],
    confirmedFacts: [],
    claims: [],
    status: 'approuve',
    mode: 'verbatim',
    usageConstraints: ['Aucune promesse de délai ni de résultat.'],
  },
  {
    title: 'Relance d’une connexion silencieuse — Décideur',
    body: 'Bonjour {{Prénom du contact}}, nous étions entrés en contact il y a quelque temps. Où en est {{sujet}} chez {{Entreprise}} ? Je reprends avec une question, pas une offre.',
    channel: 'email_draft',
    scenarioId: 'dormant_connection',
    persona: 'decideur',
    decisionRole: 'décideur',
    stage: 'reprise',
    route: 'connexion_dormante',
    objective: 'reprendre le fil sans relance insistante',
    mandatoryFacts: ['Le dernier échange est daté dans le dossier.'],
    confirmedFacts: [],
    claims: [],
    status: 'approuve',
    mode: 'inspiration',
    usageConstraints: ['Reformuler avec le contexte réel du compte — ne pas copier mot pour mot.'],
  },
  {
    title: 'Approche à froid — Opérationnel — retour d’expérience',
    body: 'Bonjour {{Prénom du contact}}, sur un projet {{technologie}} comparable, l’équipe a gagné trois semaines de mise en production. Ce point vous parle-t-il sur {{Entreprise}} ?',
    channel: 'linkedin_draft',
    scenarioId: 'cold_approach',
    persona: 'operationnel',
    decisionRole: 'utilisateur',
    stage: 'ouverture',
    route: 'approche_froide',
    objective: 'ouvrir par un retour d’expérience concret',
    mandatoryFacts: ['Un projet comparable réel, avec l’accord du client, est rattaché à l’exemple.'],
    confirmedFacts: [],
    claims: [{ kind: 'resultat', statement: 'trois semaines de mise en production gagnées', verifiedFactId: null }],
    status: 'a_revoir',
    mode: 'verbatim',
    usageConstraints: ['Non activable tant que le résultat cité n’est pas soutenu par un fait vérifié.'],
  },
  {
    title: 'Contact recommandé — Opérationnel — mise en relation',
    body: 'Bonjour {{Prénom du contact}}, {{Référent}} m’a suggéré de vous écrire sur {{technologie}} chez {{Entreprise}}. Quel profil manque le plus à votre équipe aujourd’hui ?',
    channel: 'linkedin_draft',
    scenarioId: 'referred_contact',
    persona: 'operationnel',
    decisionRole: 'utilisateur',
    stage: 'ouverture',
    route: 'contact_recommande',
    objective: 'ouvrir une conversation en citant un référent réel',
    mandatoryFacts: [
      'Identité du référent connue.',
      'Accord du référent pour citer son nom.',
      'Relation avec le référent documentée.',
      'Périmètre confirmé avec le référent.',
    ],
    confirmedFacts: ['Identité du référent connue.', 'Accord du référent pour citer son nom.'],
    claims: [],
    status: 'approuve',
    mode: 'verbatim',
    usageConstraints: ['Ne jamais citer un référent dont l’accord n’est pas confirmé.'],
  },
  {
    // #3443 — l'exemple de COMPORTEMENT (jamais récité) : un appel à froid qui demande 30 secondes,
    // respecte le cadre achats et finit sur une action proportionnée. Texte fictif de démonstration.
    title: 'Appel à froid — Manager Data — le refus devient une information',
    body: 'Bonjour {{Civilité et nom}}, auriez-vous 30 secondes pour que je vous explique pourquoi j’appelle ?\n\nSi la réponse est « pas de besoin » : « Compris. C’est vrai sur la période actuelle, ou le recours externe est limité de manière générale ? »\n\nSi la réponse est « nous passons par nos partenaires référencés » : « C’est clair, je ne cherche pas à contourner ce cadre. Les opérationnels choisissent-ils eux-mêmes, ou est-ce centralisé par les achats ? »\n\nSi c’est centralisé : arrêter côté opérationnel et proposer une synthèse courte, en demandant le meilleur email.',
    channel: 'call_brief',
    scenarioId: 'cold_approach',
    persona: 'manager',
    decisionRole: 'prescripteur',
    stage: 'ouverture',
    route: 'approche_froide',
    objective: 'obtenir une information réelle, sans forcer le rendez-vous',
    mandatoryFacts: [],
    confirmedFacts: [],
    claims: [],
    status: 'approuve',
    mode: 'inspiration',
    usageConstraints: ['Exemple de comportement, pas à réciter : le déroulé compte, pas les mots.'],
  },
]

/**
 * #2768 (#2369.7/.8) — UNE proposition `pending` : le geste humain que le
 * NO-GO de #2369.14 exige de pouvoir poser en salle de démo (Adopter/Refuser),
 * jamais une règle déjà durcie (elle naît toujours `pending`, doctrine).
 */
export const DEMO_MESSAGE_STYLE_RULE_PROPOSALS: readonly {
  signal: 'wording_preference' | 'structure_preference' | 'tone_preference'
  observation: string
}[] = [
  {
    signal: 'wording_preference',
    observation: 'Préfère « échanger » à « débriefer » dans les relances envoyées à un CODIR',
  },
]

/**
 * #2836 — LE MANAGER CLIENT de chaque mission de la salle, par intitulé : le
 * contact, CHEZ LE CLIENT, qui encadre le consultant
 * (`missions.client_manager_contact_id`).
 *
 * UNE seule mission désignée, et c'est la moitié de la démonstration : le
 * résumé du compte nomme le manager client sur cette ligne, et n'affiche
 * AUCUNE ligne sur les autres (« on n'affiche pas ce qu'on n'a pas »). Le
 * contact est le DSI simulé du client d'exemple — interlocuteur FICTIF, jamais
 * un dirigeant réel. Un nom qui ne résout pas part en `null` au semis et le
 * dit dans le journal.
 */
export const DEMO_MISSION_CLIENT_MANAGER: Readonly<Record<string, string>> = {
  'Fiabilisation plateforme — renfort exploitation': seatName('Directeur technique — entité numérique voyageurs'),
}

/**
 * Refonte Théo MISSIONS-A (23/10) — L'OBJECTIF ET LE PÉRIMÈTRE d'une mission, que la carte d'identité du
 * dossier écrit sous les dates (maquette `missions-dossier`). Clé = libellé de la mission ; une seule
 * mission cadrée : l'absence (aucune ligne) doit aussi se voir sur les autres.
 */
export const DEMO_MISSION_FRAME: Readonly<Record<string, { objective: string; perimeter: string }>> = {
  'Fiabilisation plateforme — renfort exploitation': {
    objective: 'Fiabiliser la plateforme d’exploitation des applications voyageurs.',
    perimeter: 'Observabilité, astreinte de niveau 2 et automatisation des reprises sur incident.',
  },
}

/**
 * #3413 « autre BU » (lot D2 02/10, décision Louis 02/10) — UN transfert de BU
 * semé, pour que la ligne « BU propriétaire » et l'Historique de la fiche mission
 * ne s'ouvrent pas vides devant un prospect : la mission passe de la BU de son
 * compte (`DEMO_BUSINESS_UNITS[0]`, « Agence Lyon ») à « BU Banque & Assurance ».
 * Écrit comme le geste réel l'écrit : `missions.business_unit_id` + UNE ligne de
 * `record_field_audit` (noms de BU, règle `mission_business_unit_transfer`, source
 * `human`). Clé = libellé de la mission ; une clé qui ne résout pas ne part pas.
 */
export const DEMO_MISSION_BUSINESS_UNIT_TRANSFER: Readonly<
  Record<string, { fromBusinessUnit: string; toBusinessUnit: string; daysAgo: number }>
> = {
  'Fiabilisation plateforme — renfort exploitation': {
    fromBusinessUnit: 'Agence Lyon',
    toBusinessUnit: 'BU Banque & Assurance',
    daysAgo: 9,
  },
}

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — UN écart de portée
 * semé, pour que le contrôle avant action de la fiche contact (« Avant d'agir sur
 * ce contact ») et de Laura (`get_contact_preflight`) ne s'ouvre pas vide devant
 * un prospect. Deux relevés `pipeline` du POSTE d'un siège ANONYME de SNCF (jamais
 * une personne nommée), chacun avec la portée que son analyse a DÉCLARÉE : le
 * dossier groupe lit « Directeur technique », l'analyse des filiales lit le
 * directeur technique de l'entité numérique voyageurs. Deux vérités, chacune dans
 * sa portée — `scope_difference`, jamais une valeur « choisie ». Le second relevé
 * porte la valeur que la fiche affiche (le journal ne contredit pas la ligne).
 * Écrit comme `ProvenanceService.commit` l'écrit (`record_field_audit`).
 */
export const DEMO_CONTACT_SCOPE_DIFFERENCE = {
  contact: seatName('Directeur technique — entité numérique voyageurs'),
  field: 'title',
  first: { value: 'Directeur technique', scope: 'Groupe entier', daysAgo: 20 },
  second: { value: 'Directeur technique — entité numérique voyageurs', scope: 'Filiales', daysAgo: 6 },
} as const

/**
 * X66 / #3547 — le MÊME forfait encadré, lu sur la fiche d'un BESOIN : celui du
 * client d'exemple déjà au forfait (« Chef de projet — refonte du portail
 * transporteurs », en veille). Posé par un UPDATE du semis APRÈS les besoins
 * (une colonne de plus à un INSERT lu par rang décalerait tout ce qui suit).
 * Rôle tenu : cadrage ; équipe côté client par noms fictifs, sans nombre déclaré
 * (« 2 personnes » — jamais « 0 »).
 */
export const DEMO_SUPERVISED_FORFAIT_NEED = {
  title: 'Chef de projet — programme de refonte applicative',
  supervision_role: 'framing' as const,
  client_team_size: null as number | null,
  client_team_names: ['Camille Girard', 'Hugo Lemaire'],
}

/**
 * #4270.5 (19/10/2026) — PARITÉ DÉMO du PROFIL FORFAIT / CONSEIL (craft rule n°9). Deux besoins, au forfait
 * encadré, qui donnent à voir ce que le profil change quand un visiteur le choisit dans Réglages :
 * un besoin lu comme un PROJET À CADRER (périmètre, sponsor, budget renseignés — la carte « Projet à cadrer »)
 * et un besoin GAGNÉ, suivi comme un PROJET (la carte « Projet gagné », liée à la mission en forfait encadré
 * `DEMO_SUPERVISED_FORFAIT_MISSION`, sans staffing proposé).
 *
 * Posés SANS projet (comme `needWithoutProject`), au client fictif de la salle, jamais à l'une des sociétés
 * réelles. La salle reste l'espace STAFFING (`workspace_profile` NULL, voir `demo-coverage.ts`) : ces deux
 * lignes ne changent rien à la navigation du visiteur, elles attendent qu'il bascule le profil.
 */
export const DEMO_FORFAIT_PROFILE_NEEDS = {
  toScope: {
    title: 'Cadrage — refonte du SI de paie (forfait)',
    status: 'to_qualify' as const,
    status_changed_days_ago: 3,
    context:
      'Refonte du SI de paie sur deux pays : périmètre à arrêter avec la DRH et la DSI avant tout chiffrage. Le client attend une proposition de cadrage au forfait.',
    budget_cents: 180_000_00,
    supervision_role: 'framing' as const,
    client_team_names: ['Camille Girard', 'Hugo Lemaire'],
    // SEMIS-PREUVES 4291.7 (#4270.3) — le SPONSOR du projet à cadrer : le décideur déclaré du besoin (une
    // PERSONNE du compte, `decision_maker_contact_id`), lu par la carte « Projet à cadrer ». Sans lui, la carte
    // disait « sponsor non renseigné » et la preuve du cadrage (périmètre + sponsor + budget) restait à moitié vide.
    sponsor_contact_name: 'Julien Castaing',
  },
  won: {
    title: 'Refonte du portail paiement — forfait gagné',
    status: 'won' as const,
    status_changed_days_ago: 21,
    context:
      'Forfait gagné : cadrage et supervision de la refonte du portail de paiement, réalisée par les équipes du client. Suivi comme un projet, aucun consultant à placer.',
    budget_cents: 95_000_00,
    supervision_role: 'both' as const,
    client_team_names: ['Camille Girard', 'Hugo Lemaire', 'Inès Marchand'],
    sponsor_contact_name: 'Julien Castaing',
  },
}

/**
 * #3547 (02/10/2026) — PARITÉ DÉMO du FORFAIT ENCADRÉ (craft rule n°9) : UNE
 * mission où l'ESN cadre et supervise un forfait réalisé par les salariés du
 * client, SANS consultant. Hors de `DEMO_DELIVERY_CLIENT.missions` à dessein
 * (même raison que `DEMO_START_READINESS_MISSION`) : les gardes de relevés, de
 * facturation et de planning lisent ce tableau-là en supposant un consultant par
 * mission — celle-ci n'en a pas, c'est précisément ce qu'elle montre.
 *
 * Le TJM de référence et le coût chargé sont saisis : la marge se calcule sans
 * consultant (elle vient des conditions commerciales, D43). L'équipe client est
 * dite par NOMS ET par un nombre déclaré plus grand : la fiche écrit « 8 personnes ».
 * Noms fictifs, comme tout le jeu de la salle.
 */
export const DEMO_SUPERVISED_FORFAIT_MISSION = {
  label: 'Cadrage et supervision du forfait refonte paiement — équipe client',
  status: 'active' as const,
  started_days_ago: 21,
  stage_entered_days_ago: 21,
  ends_in_days: 75,
  daily_rate: 900,
  loaded_daily_cost_cents: 560_00,
  contract_kind: 'forfait' as const,
  delivery_mode: 'supervised' as const,
  supervision_role: 'both' as const,
  client_team_size: 8,
  client_team_names: ['Camille Girard', 'Hugo Lemaire', 'Inès Marchand'],
  role_title: 'Directeur de programme — cadrage et supervision',
}

/**
 * #2338 / #2409 — PARITÉ DÉMO du double accord et de la checklist de
 * démarrage (craft rule n°9). UNE mission pas encore démarrée (`onboarding`,
 * début dans douze jours), hors de `DEMO_DELIVERY_CLIENT.missions` à dessein :
 * les gardes de relevés, facturation et marge lisent ce tableau-là, et une
 * mission qui n'a encore rien produit n'a rien à y montrer.
 *
 * Checklist PARTIELLE, c'est ce que la fiche doit savoir montrer : l'accord du
 * client et le bon de commande sont confirmés (avec leur preuve), l'accord du
 * consultant ne l'est pas encore — la fiche affiche « Accords à confirmer »,
 * verdict « Bloqué », et nomme ce qui manque ; l'accès du premier jour reste
 * une réserve.
 */
export const DEMO_START_READINESS_MISSION = {
  label: 'Renfort sécurité du programme de refonte applicative — démarrage',
  consultant: 'Hakim Barreau',
  status: 'onboarding' as const,
  starts_in_days: 12,
  daily_rate: 640,
  contract_kind: 'regie' as const,
  role_title: 'Ingénieur sécurité applicative',
  checks: [
    {
      item: 'client_agreement' as const,
      proof: 'Mail de la DSI du client confirmant le démarrage',
      confirmed_days_ago: 3,
    },
    {
      item: 'contract_signed' as const,
      proof: 'Bon de commande signé reçu',
      confirmed_days_ago: 2,
    },
  ],
}

/**
 * #3014 — le résumé de la PREMIÈRE synchronisation, dans la salle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN RÉSUMÉ ÉCRIT EN DUR, ET PAS CALCULÉ COMME EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * En production, `IntegrationSyncService.summarize()` COMPTE ce qui a
 * vraiment changé pendant la fenêtre du run — jamais une donnée inventée. Une
 * salle de démonstration n'a pas d'OAuth HubSpot à compléter (personne n'y
 * dépose ses vrais identifiants CRM), donc `justConnectedProvider` ne se
 * déclenche jamais : sans ce semis, le prospect ne verrait JAMAIS à quoi
 * ressemble l'écran que ce chantier construit — exactement le défaut que la
 * craft rule n°9 existe pour empêcher. Les sept lignes ci-dessous sont donc
 * des données FICTIVES, assumées comme telles (comme `DEMO_ANALYSIS_BATCH`
 * juste au-dessus) : un run déjà TERMINÉ, retrouvable via
 * `GET /tools/hubspot/sync-runs/latest` sans qu'aucun clic n'ait eu lieu.
 *
 * Une ambiguïté, jamais zéro : la ligne existe pour que le prospect voie le
 * VOCABULAIRE non technique que #2207.31 promet (« à confirmer avant de les
 * rapprocher »), jamais le mot « doublon » ou « ambigu ».
 */
export const DEMO_INTEGRATION_SYNC_RUN = {
  provider: 'hubspot' as const,
  started_minutes_ago: 6,
  finished_minutes_ago: 4,
  summary: [
    { domain: 'accounts' as const, count: 3, label: { fr: '3 comptes mis à jour', en: '3 accounts updated' } },
    { domain: 'contacts' as const, count: 5, label: { fr: '5 contacts retrouvés', en: '5 contacts found' } },
    { domain: 'meetings' as const, count: 2, label: { fr: '2 rendez-vous retrouvés', en: '2 meetings found' } },
    { domain: 'exchanges' as const, count: 8, label: { fr: '8 échanges retrouvés', en: '8 exchanges found' } },
    { domain: 'actions' as const, count: 4, label: { fr: '4 actions enregistrées', en: '4 actions logged' } },
    {
      domain: 'ambiguities' as const,
      count: 1,
      label: {
        fr: '1 fiche à confirmer avant de la rapprocher',
        en: '1 record to confirm before merging it',
      },
    },
    { domain: 'pages' as const, count: 6, label: { fr: '6 pages alimentées', en: '6 pages indexed for Laura' } },
  ],
}

/**
 * #3246 (lot X65, recette prod 02/10) — « aucun cas comparable » en démonstration.
 *
 * `find_similar_cases` (Laura) compare le compte ouvert aux cas GAGNÉS (un
 * retour de mission) et PERDUS (une opportunité `lost` avec son motif) du MÊME
 * espace. La salle n'en portait aucun : Laura répondait « aucun cas comparable »
 * sur chaque dossier, et le prospect ne voyait jamais le raisonnement par cas.
 *
 * Décision Louis 04/10/2026 (« je ne veux plus d'exemples comme ça ») : le
 * compte fictif qui les portait a quitté la salle. Les deux cas sont ceux de
 * l'ESN de démonstration (le persona : sa mission, son retour, son
 * opportunité perdue) chez BNP Paribas — un vrai compte de la salle, même
 * secteur de registre (NAF 64.19Z) que Société Générale, ce que la
 * comparaison lit. Aucun fait n'est affirmé sur BNP Paribas au-delà de cette
 * mesure publique ; la mission « Migration du
 * socle… » du client de livraison reste SANS retour : le bloc « REX en
 * attente » continue de se remplir seul.
 */
export const DEMO_SIMILAR_CASES = {
  account: {
    company_name: 'BNP Paribas',
  },
  /** Le cas PERDU : une opportunité `lost` et son motif. */
  lost: {
    label: 'Renfort conformité des paiements — consultation fermée',
    detail: 'Consultation restreinte à trois ESN référencées.',
    loss_reason: 'Hors panel fournisseurs : le client a retenu une ESN déjà référencée au niveau du groupe.',
    // #3989.9 (Louis 15/10/2026) — le motif dans la liste FERMÉE commune ; la phrase ci-dessus en est la précision.
    loss_reason_code: 'competitor_won' as const,
    closed_days_ago: 95,
    primary_domain_code: 'esn_it',
    // #3246 (lot W9) — vocabulaires fermés : consultation restreinte aux ESN référencées, entrée en direct.
    strategy: 'conquete_directe' as const,
    buying_model: 'referencement' as const,
  },
  /** Le cas GAGNÉ : une mission terminée (> 61 jours, voir la garde de facturation) et son retour. */
  won: {
    label: 'Fiabilisation du socle de paiements — lot 1',
    role_title: 'Architecte de plateforme',
    status: 'ended' as const,
    started_days_ago: 330,
    ends_in_days: -140,
    daily_rate: 680,
    contract_kind: 'regie' as const,
    rex: {
      summary: 'Mission livrée dans le périmètre ; le client a reconduit un second lot.',
      what_worked: 'Entrée par la direction des moyens de paiement, puis une preuve sur un périmètre voisin.',
      what_failed: 'Le référencement groupe a retardé le démarrage de six semaines.',
      // #3246 (lot W9) — l'entrée s'est faite en étendant un compte déjà en relation, achat par accord-cadre.
      strategy: 'extension_de_compte' as const,
      buying_model: 'accord_cadre' as const,
    },
  },
} as const

/**
 * #3295 — DÉMO DES PERTES. Décision Louis (brief P01 du 07/10/2026, ratifie la
 * ligne du 04/10 : « la démo montre les vrais comptes des briefs ») : pas de
 * dossier fictif « (exemple) » pour porter le REX de perte. Il vit sur la
 * MÊME opportunité perdue que {@link DEMO_SIMILAR_CASES.lost} (BNP Paribas, un
 * vrai dossier de la salle), approfondie plutôt que dupliquée — `project_id`
 * n'est pas unique sur `lost_deal_rex` (une perte, un REX de plus sur la même
 * opportunité), donc rien n'empêche cette seconde écriture.
 *
 * Un SEUL REX reste sous le seuil de deux convergents qu'exige une
 * proposition d'apprentissage (NO-GO #3272.7) : `lost_deal_rule_proposals` et
 * `workspace_method_rules` restent vides pour leur propre raison, inchangée
 * par ce semis (voir `demo-coverage.ts`).
 *
 * Chaque champ renseigné porte sa DISTINCTION fait/hypothèse (#3272.2) : ce
 * que le client a dit (`retour_client`), ce que l'équipe a constaté
 * (`fait_confirme`) et ce qu'elle suppose sans preuve (`hypothese`) ne se
 * confondent jamais. Les champs sans donnée réelle restent `null` — jamais
 * devinés pour remplir le formulaire.
 */
export const DEMO_LOST_DEAL_REX = {
  sponsor: 'Aucun sponsor métier identifié — l’échange est resté au niveau des achats.',
  route_used: 'Entrée par l’appel d’offres groupe, sans relation préalable avec la direction métier.',
  last_action: {
    value: 'Le client a confirmé par écrit le maintien du fournisseur déjà référencé au niveau du groupe.',
    distinction: 'fait_confirme' as const,
  },
  declared_motif: 'panel' as const,
  declared_motif_note: {
    value: 'Le client a dit retenir une ESN déjà référencée au niveau du groupe.',
    distinction: 'retour_client' as const,
  },
  suspected_motif: 'mauvaise_personne' as const,
  suspected_motif_note: {
    value:
      'L’entrée par les achats, sans sponsor métier, a probablement coûté la mise en avant de la preuve technique.',
    distinction: 'hypothese' as const,
  },
  what_team_knows_now: {
    value: 'Chercher le sponsor métier AVANT l’ouverture de la consultation, pas après.',
    distinction: 'interpretation_commerciale' as const,
  },
} as const

/**
 * #3295 — 2e REX de perte, sur un AUTRE vrai compte de la salle (ENGIE), au MÊME motif que le premier
 * (BNP : hors panel / mauvaise personne). Décision Louis 13/10/2026 (recette RECETTE-4-FIX), qui
 * renverse la ligne du 11/10 nuit (motif DIFFÉRENT, donc rien à proposer) : deux pertes qui se
 * ressemblent sont exactement ce que le parcours Proposer → Adopter → Activer → Laura cite la règle
 * exige — avec un seul motif commun, le bouton « Proposer une règle » se joue en salle. Seule la
 * PROPOSITION reste à faire au clic du visiteur : `lost_deal_rule_proposals` et `workspace_method_rules`
 * restent vides, rien n'est adopté pour lui. Chaque champ garde sa distinction fait/hypothèse ; les
 * champs sans donnée restent `null`.
 */
export const DEMO_SECOND_LOST_DEAL = {
  account: { company_name: 'ENGIE' },
  lost: {
    label: 'Appui à la migration du poste de travail — consultation clôturée',
    detail: 'Consultation restreinte aux ESN référencées au niveau du groupe.',
    loss_reason: 'Hors panel : l’ESN n’était pas référencée chez ce client, qui a reconduit son fournisseur habituel.',
    // #3989.9 — liste fermée commune.
    loss_reason_code: 'competitor_won' as const,
    closed_days_ago: 48,
    primary_domain_code: 'esn_it',
  },
  rex: {
    sponsor: 'Le responsable du poste de travail était favorable, sans la main sur le référencement des fournisseurs.',
    route_used: 'Entrée par la direction des systèmes d’information, puis renvoi vers les achats du groupe.',
    last_action: {
      value: 'Le client a notifié par courriel la reconduction du fournisseur déjà référencé.',
      distinction: 'fait_confirme' as const,
    },
    declared_motif: 'panel' as const,
    declared_motif_note: {
      value: 'Le client a indiqué que seules les ESN du panel groupe pouvaient être retenues.',
      distinction: 'retour_client' as const,
    },
    suspected_motif: 'mauvaise_personne' as const,
    suspected_motif_note: {
      value:
        'S’adresser à la DSI sans passer par les achats, qui tiennent le panel, a sans doute fermé la porte trop tard.',
      distinction: 'hypothese' as const,
    },
    what_team_knows_now: {
      value: 'Identifier qui tient le référencement du groupe avant de répondre à une consultation restreinte.',
      distinction: 'interpretation_commerciale' as const,
    },
  },
} as const

/**
 * #4289.2 / #3246.5 (recette démo 21/10) — UNE PERTE SUR UN AUTRE CLIENT ACTIF, pour que la fiche ENGIE ait des cas
 * comparables. Les seuls cas clos de la salle étaient sur BNP Paribas (ancien client) et sur ENGIE elle-même (exclue de
 * sa propre comparaison) : ENGIE n'avait aucun point commun mesurable, donc aucune section — alors que la comparaison
 * par stade de relation ({@link DEMO_SECOND_LOST_DEAL}, « client actif ») est précisément ce qu'on veut y montrer.
 * Une perte simple, sans REX : le motif est celui de la liste fermée, rien n'est inventé au-delà.
 */
export const DEMO_THIRD_LOST_DEAL = {
  account: { company_name: 'Société Générale' },
  lost: {
    label: 'Renfort tests automatisés — consultation clôturée',
    detail: 'Consultation restreinte : le client a internalisé le lot de tests automatisés.',
    loss_reason: 'Le client a internalisé le lot : plus de budget prestataire sur ce périmètre.',
    loss_reason_code: 'no_budget' as const,
    closed_days_ago: 70,
    primary_domain_code: 'esn_it',
  },
} as const

/**
 * #3403 (X73) — les semis des voies d'accès personnelles, DANS le jeu de données : ils vivaient dans
 * `demo-seed.service.ts`, donc hors de l'empreinte de semis (`demo-seed-fingerprint.ts`) — une salle
 * semée avant un changement de ces lignes (ex. la chaleur du lien, X68) n'était jamais re-semée.
 * Les dates sont des écarts en JOURS (jamais une date calculée : l'empreinte reste stable d'un jour à l'autre).
 */
export const DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS: readonly {
  contact: string
  linkKind: string
  verified: boolean
  /** Date FIXE (les deux premiers liens, déjà anciens) — sinon `authorizedDaysAgo`. */
  authorizedAt?: string
  authorizedDaysAgo?: number
  channel: string
  /** #3403.12 — chaleur DÉCLARÉE ; absente sur plusieurs lignes à dessein (non déclarée ≠ distante). */
  warmth?: 'distant' | 'cordial' | 'close'
}[] = [
  {
    contact: 'Philippe Marchand',
    linkKind: 'consultant',
    verified: true,
    authorizedAt: '2026-08-10',
    channel: 'verbal',
    warmth: 'close',
  },
  {
    contact: 'Isabelle Rouault',
    linkKind: 'explicit_recommendation',
    verified: false,
    authorizedAt: '2026-09-05',
    channel: 'email',
  },
  // #3403 (recette 30/09 : « 2 voies sur 11 ») — les cinq autres voies portées
  // par un LIEN déclaré, sur des contacts DÉJÀ semés, datées par rapport à
  // l'ouverture de la salle (une date figée vieillirait au-delà des 180 jours
  // et virerait à « à revérifier »). Réparties sur quatre comptes plutôt
  // qu'empilées sur un seul : un compte réel n'a jamais onze portes.
  {
    contact: 'Pierre Palmieri',
    linkKind: 'former_colleague',
    verified: true,
    authorizedDaysAgo: 40,
    channel: 'verbal',
    warmth: 'cordial',
  },
  {
    contact: 'Lorenzo Bini Smaghi',
    linkKind: 'former_manager',
    verified: false,
    authorizedDaysAgo: 75,
    channel: 'verbal',
    warmth: 'distant',
  },
  {
    contact: 'Laurent Trévisani',
    linkKind: 'common_relation',
    verified: false,
    authorizedDaysAgo: 20,
    channel: 'email',
  },
  {
    contact: 'Karim Belhadj',
    linkKind: 'alumni_network',
    verified: true,
    authorizedDaysAgo: 90,
    channel: 'verbal',
  },
  {
    contact: 'Céline Lombard',
    linkKind: 'event_encounter',
    verified: false,
    authorizedDaysAgo: 30,
    channel: 'verbal',
  },
  // Décision Louis 04/10/2026 — plus de voie personnelle sur une personne
  // RÉELLE du client de livraison : un lien « ancien collègue » ou « rencontre »
  // est une déclaration sur une personne. Vide à dessein : « décision Louis 04/10 :
  // aucune déclaration inventée sur une personne réelle ».
  //
  // Lot D01 (06/10/2026) — une seule voie revient, portée par l'interlocuteur
  // SIMULÉ qui est le sponsor (Julien Castaing, `.example`) : l'autorisation
  // d'introduction vers les achats est ENREGISTRÉE (son e-mail de réponse est au
  // journal, 8 jours), pour prouver qu'elle reste retrouvable sans le module
  // « Introduction chaude » (#3690, #3712).
  {
    contact: 'Julien Castaing',
    linkKind: 'explicit_recommendation',
    verified: true,
    authorizedDaysAgo: 8,
    channel: 'email',
    warmth: 'cordial',
  },
]

/**
 * #3696 (parité démo, lot K12 07/10) — LE BROUILLON DÉJÀ LÀ, À L'OUVERTURE DU
 * PANNEAU.
 *
 * Nadia Perrin (SNCF, simulée) porte déjà le fil de la recette décrite par
 * #3695 (« Email suggéré → Relancer → Faire connaître une expertise ») : deux
 * lignes de son fil Email, dans l'ordre d'apparition — une VARIANTE précédente
 * puis le brouillon ACTUEL (texte identique à celui déjà envoyé, journal
 * `seedOutreachMessages`), pour que le panneau les affiche sans geste du
 * commercial (`DemoSeedService.seedMessageDraftVersions`).
 */
export const DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS: readonly {
  contact: string
  channel: string
  subject: string
  body: string
  createdDaysAgo: number
}[] = [
  {
    contact: 'Nadia Perrin',
    channel: 'email',
    subject: 'Renfort sur la refonte applicative',
    body: 'Bonjour Nadia,\n\nNous accompagnons des entités du groupe sur des renforts ponctuels. Seriez-vous disponible pour en parler ?\n\nBien à vous',
    createdDaysAgo: 7,
  },
  {
    contact: 'Nadia Perrin',
    channel: 'email',
    subject: 'Renfort sur la refonte applicative — deux profils possibles',
    body: 'Bonjour Nadia,\n\nJulien Castaing m’a indiqué que vous suiviez les achats de prestations numériques de l’entité. Nous pouvons proposer deux profils pour le renfort de la refonte applicative. Auriez-vous quelques minutes pour en parler ?\n\nBien à vous',
    createdDaysAgo: 6,
  }, // Théo B m2-brouillons.N2 — un brouillon à TROIS versions : « Expéditeur, version & historique » montre le fil entier.
  {
    contact: 'Nadia Perrin',
    channel: 'email',
    subject: 'Renfort sur la refonte applicative — deux profils disponibles en novembre',
    body: 'Bonjour Nadia,\n\nJulien Castaing m’a indiqué que vous suiviez les achats de prestations numériques de l’entité. Nous pouvons proposer deux profils, disponibles en novembre, pour le renfort de la refonte applicative. Auriez-vous quelques minutes pour en parler cette semaine ?\n\nBien à vous',
    createdDaysAgo: 5,
  },
]

/**
 * Théo M2 — envoi programmé — DEUX envois déjà programmés dans la Messagerie « À venir » : l'e-mail et l'e-mail de
 * suivi de Nadia Perrin (SNCF, simulée), brouillons SEMÉS ci-dessous, validés puis datés par le commercial démo.
 * Rien ne part jamais d'une salle de démonstration (le chemin d'envoi refuse `demo_send_blocked`) : la ligne montre
 * l'écran, elle ne promet aucun départ. Heures relatives à « maintenant », fuseau de l'utilisateur démo.
 */
export const DEMO_SCHEDULED_SEND_SEED_SPECS: readonly {
  contact: string
  channel: 'email' | 'follow_up_email'
  inHours: number
  timeZone: string
}[] = [
  { contact: 'Nadia Perrin', channel: 'email', inHours: 20, timeZone: 'Europe/Paris' },
  { contact: 'Nadia Perrin', channel: 'follow_up_email', inHours: 68, timeZone: 'Europe/Paris' },
]

/**
 * #2370 (épopée #2947) — UN MESSAGE DÉJÀ PRÉPARÉ PAR CANAL NEUF DU COMPOSER.
 *
 * Laura prépare, le commercial envoie : chaque ligne est un brouillon du fil du
 * canal (`message_draft_versions`), sur un contact SIMULÉ de la salle qui porte la
 * coordonnée du canal — le dossier SNCF qu'on ouvre en réunion. Les faits cités
 * sont ceux du jeu lui-même (Julien Castaing a introduit Nadia Perrin, qui veut
 * voir deux profils avant le comité d'achat). `message partenaire` n'a pas de
 * ligne : voir `DEMO_PREPARED_CHANNELS_COVERAGE`.
 */
export const DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS: readonly {
  contact: string
  channel: 'introduction_request' | 'partner_message' | 'follow_up_email' | 'profile_push' | 'linkedin_connection_note'
  subject: string | null
  body: string
  createdDaysAgo: number
}[] = [
  // Théo B C5.A24 — SMS et WhatsApp sont retirés des approches : plus de brouillon semé.
  // #2370.introduction_request
  {
    contact: 'Julien Castaing',
    channel: 'introduction_request',
    subject: null,
    body: 'Bonjour Julien,\n\nVous pilotez le programme de refonte applicative : pourriez-vous me présenter à la personne qui en suit l’exploitation, pour vérifier que nos deux profils s’intègrent bien à l’équipe en place ?\n\nSi cela vous aide, voici un paragraphe à transférer tel quel :\n« Bellum Conseil propose deux profils pour le renfort de la refonte applicative ; l’équipe souhaite valider avec l’exploitation qu’ils s’intègrent aux rituels en place. Un échange de 20 minutes suffirait. »\n\nSi ce n’est pas le bon moment, aucun souci.\n\nBien à vous',
    createdDaysAgo: 3,
  },
  // #2370.follow_up_email
  {
    contact: 'Nadia Perrin',
    channel: 'follow_up_email',
    subject: 'Refonte applicative — calendrier du comité',
    body: 'Bonjour Nadia,\n\nMerci pour votre réponse à notre premier message. Pour préparer votre comité d’achat, nous avons ajouté aux deux profils leurs dates de démarrage possibles. Souhaitez-vous que je vous les adresse cette semaine ?\n\nBien à vous',
    createdDaysAgo: 1,
  },
  // #2370.profile_push
  {
    contact: 'Nadia Perrin',
    channel: 'profile_push',
    subject: 'Développeur senior — refonte applicative',
    body: 'Bonjour Nadia,\n\nPour le renfort de la refonte applicative, un premier profil : développeur senior, huit ans de refontes d’applications métier, habitué aux revues d’architecture avec les équipes d’exploitation. Un échange de 20 minutes avec lui avant votre comité vous serait-il utile ?\n\nBien à vous',
    createdDaysAgo: 1,
  },
  // #2370.linkedin_connection_note — ≤ 300 caractères, aucune offre.
  {
    contact: 'Younes Berrada',
    channel: 'linkedin_connection_note',
    subject: null,
    body: 'Bonjour Younes, nous suivons les sujets plateforme data de SNCF Connect & Tech et échangeons régulièrement avec des équipes comparables. Ravi de vous compter dans mon réseau.',
    createdDaysAgo: 4,
  },
]

export const DEMO_PERSONAL_ACCESS_EXTRA_SEEDS = {
  /** Le compte que la salle montre déjà comme CLIENT (état de relation CRM). */
  clientAccount: 'SNCF',
  /**
   * #3285 — un compte en relation DORMANTE (état de relation déclaré) : le reçu « ouverture de compte
   * fermé » de Laura ne se voit que sur un compte dormant, et la salle n'en montrait aucun (recette prod
   * 02/10 : « aucun compte dormant identifié pour le rejeu »).
   */
  dormantAccount: 'Alstom',
  /**
   * Décision Louis 04/10/2026 — plus d'ESN fictive : une VRAIE ESN CONFIRMÉE par
   * le brief du compte (`bpce.json`, entrée `esn` « Capgemini / Capgemini Invent »,
   * « Groupement avec Talan sur le programme de transformation ; externes en
   * poste », périmètre « Pilotage programme + delivery »). `placements: 2` = le
   * pluriel « externes en poste », sans compte plus précis inventé.
   */
  referencedEsn: {
    accountName: 'Groupe BPCE',
    // Le nom EXACT du relevé : la déclaration promeut la ligne observée, jamais une seconde.
    name: 'Capgemini / Capgemini Invent',
    placements: 2,
    detectedDaysAgo: 3,
    perimeter: 'Pilotage programme et delivery — groupement avec Talan sur le programme de transformation',
  },
  /**
   * SEMIS-PREUVES 4292.10 (#4271.2, 20/10/2026) — un compte à ACCÈS À BÂTIR : un rang 1 installé AILLEURS que
   * chez nous (`account_entities.rank1_incumbent = 'yes'`, sans aucune ESN `rank1` référencée sur le compte —
   * sinon il lirait « référencé »). Société Générale : son brief nomme des ESN en poste (Capgemini, Sogeti…) sur
   * l'entité informatique, jamais nous. Déclaration de l'ÉQUIPE de démonstration sur une entité DÉJÀ dérivée des
   * contacts (aucune entité inventée). Le pendant « référencé » (#4271.1) est `referencedEsn` plus haut (BPCE).
   */
  toBuildAccess: {
    accountName: 'Société Générale',
    entityName: 'Société Générale - ITIM / ASR',
  },
  /**
   * SEMIS-PREUVES 4295.19 (#4016.44, 20/10/2026) — l'ÉCRAN où le coût d'accès se lit « estimé » : l'onglet Accès
   * d'un compte (`/accounts/:id`, onglet Accès). Il faut DEUX comptes : l'un (`source`) porte un verrou ET un coût
   * déclarés par l'équipe ; l'autre (`target`) porte le MÊME verrou et AUCUN coût → l'estimation reprend la
   * déclaration du premier, badgée, nommée, datée. Générique à dessein : aucun marché cité, aucun chiffre inventé
   * (le coût dit ce qu'il reste à confirmer). Le client de livraison (SNCF) n'est PAS touché : ses gardes
   * (`demo-need-access-lock.spec.ts`) tiennent son verrou vide, et un verrou y changerait l'axe Accès de ses besoins.
   */
  costEstimate: {
    lock: 'semi_ouvert',
    lockDetail: 'déclaré par l’équipe de démonstration : accès par les entités plutôt que par le siège',
    source: {
      accountName: 'Groupe BPCE',
      cost: 'Frais de référencement du groupe, à confirmer avec les achats',
      costDetail: 'déclaré par l’équipe de démonstration : passage par le référencement groupe',
      daysAgo: 15,
    },
    target: { accountName: 'Société Générale', daysAgo: 12 },
  },
  jobChange: {
    accountName: 'Société Générale',
    label: 'Ancien collègue arrivé à la direction des systèmes d’information',
    detail:
      'Rejoint la DSI du groupe il y a deux mois — vous avez travaillé ensemble avant cela (lien déclaré par l’équipe de démonstration).',
    daysAgo: 50,
  },
} as const

/**
 * #2556 (recette prod 07/10, Thales : « Déjà dans ton CRM » et rien d'autre) —
 * la présence du CRM FICTIF de la salle de démonstration (« Bellum Conseil —
 * CRM fictif », `crm.service.ts`) pour les dossiers semés. Le bloc « Ce que
 * BellumAI ajoute à ce que tu sais » la lit comme il lit un vrai CRM.
 *
 * Ce qui est VRAI PAR CONSTRUCTION : les deux premières personnes NOMMÉES du
 * dossier (le CRM connaît une partie de l'équipe, pas toute) et un dernier
 * contact CRM daté à J-45 (relatif, calculé à l'appel). Aucune affaire ouverte
 * inventée. Un compte hors salle n'est pas connu du CRM fictif : `null`.
 */
const DEMO_CRM_KNOWN_CONTACTS = 2
const DEMO_CRM_LAST_ACTIVITY_DAYS = 45

export function demoCrmPresence(
  companyName: string | null | undefined,
  now: number,
): {
  contacts: Array<{ id: string; name: string | null; email: string | null; jobTitle: string | null }>
  lastActivityAt: string
} | null {
  const wanted = (companyName ?? '').trim().toLowerCase()
  if (!wanted) return null
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name.trim().toLowerCase() === wanted)
  if (!dossier) return null
  const named = dossier.contacts.filter(contact => contact.full_name.trim())
  const known = (named.length > 0 ? named : dossier.contacts).slice(0, DEMO_CRM_KNOWN_CONTACTS)
  if (known.length === 0) return null
  return {
    contacts: known.map((contact, index) => ({
      id: `demo-crm-${index + 1}`,
      name: contact.full_name.trim() || null,
      email: null,
      jobTitle: contact.title || null,
    })),
    lastActivityAt: new Date(now - DEMO_CRM_LAST_ACTIVITY_DAYS * 86_400_000).toISOString(),
  }
}

/**
 * #2561/#2562 — LES VENTES ODOO DE LA SALLE DE DÉMONSTRATION (fictives).
 *
 * La salle n'a AUCUNE instance Odoo branchée (`crm_connections` vide à dessein) :
 * `MissionOdooSalesService` sert ces ventes-ci À LA PLACE de la lecture réelle,
 * et SEULEMENT dans un espace `is_demo`. Dates RELATIVES (calculées à la
 * lecture) : une date en dur périmerait la démonstration en un mois.
 *
 * Chacune montre un des quatre états de la section « Ventes dans Odoo » :
 *  - S00118 : la prestation de la mission SNCF déjà en cours → « déjà une mission »
 *    (rapprochée par le libellé de la prestation) ;
 *  - S00124 et S00131 : deux ventes à reprendre (SNCF, Société Générale — deux
 *    comptes de la salle) → « Reprendre en mission » ;
 *  - S00137 : un client sans compte Bellum → l'absence de compte est NOMMÉE,
 *    rien n'est proposé.
 * Lu par `demo-odoo-sales-coverage.spec.ts`, classé dans `demo-coverage.ts`.
 */
export const DEMO_ODOO_SALES = [
  {
    id: 118,
    reference: 'S00118',
    client: DEMO_DELIVERY_CARRIER,
    client_ref: null,
    ordered_days_ago: 31,
    starts_in_days: -24,
    invoice_status: 'to invoice',
    lines: [{ label: 'Fiabilisation plateforme — renfort exploitation', quantity: 79, unit_price: 650 }],
  },
  {
    id: 124,
    reference: 'S00124',
    client: DEMO_DELIVERY_CARRIER,
    client_ref: null,
    ordered_days_ago: 6,
    starts_in_days: 10,
    invoice_status: 'no',
    lines: [{ label: 'Data engineer — migration de l’entrepôt de données', quantity: 60, unit_price: 680 }],
  },
  {
    id: 131,
    reference: 'S00131',
    client: 'Société Générale',
    client_ref: 'BC-2026-0412',
    ordered_days_ago: 12,
    starts_in_days: 20,
    invoice_status: 'no',
    lines: [{ label: 'Architecte cloud — socle de conteneurs', quantity: 80, unit_price: 850 }],
  },
  {
    id: 137,
    reference: 'S00137',
    client: 'Decathlon',
    client_ref: null,
    ordered_days_ago: 20,
    starts_in_days: -5,
    invoice_status: 'invoiced',
    lines: [{ label: 'Chef de projet — déploiement magasins', quantity: 40, unit_price: 720 }],
  },
] as const

/**
 * #3918.b / #3920.crm / #3903 (lot M01, 09/10/2026) — les affaires du CRM de
 * l'ESN de démonstration chez Société Générale, pour que la veille du compte,
 * la cloche et le bilan de relance de Laura montrent ce que le CRM ajoute :
 * une affaire ouverte qui dort, une affaire perdue, une affaire gagnée dont le
 * cycle de renouvellement est écoulé. Les phrases affichées ne sont PAS écrites
 * ici : elles sortent des MÊMES règles que la production
 * (`crm-deal-signal-rules.ts`), appliquées à ces dates relatives.
 *
 * Société Générale parce qu'elle porte déjà, dans la salle, une sortante
 * récente sans réponse (`DEMO_ACTIVITIES`) : le bilan de relance y croise un
 * deal ouvert jamais closé sans fabriquer un second échange.
 */
/**
 * #4072.1 (12/10/2026) — LES CONTACTS DÉJÀ CONNUS DANS LE CRM de l'ESN chez le compte vitrine : l'organigramme
 * les marque « déjà connu : dans ton CRM » et les passe devant dans leur niveau. `DemoSeedService.seedCrmDeals`
 * pose `contacts.crm_record_id` / `crm_synced_at` sur les `count` premiers contacts du compte — des personnes
 * qui y sont déjà, aucune n'est inventée. Les interlocuteurs de missions passées viennent, eux, de
 * {@link DEMO_MISSION_CLIENT_MANAGER}.
 */
export const DEMO_ORG_CRM_MARKED_CONTACTS = {
  account: 'Société Générale',
  /** La MÊME règle que {@link demoCrmPresence} : le CRM fictif connaît les deux premières personnes NOMMÉES. */
  count: DEMO_CRM_KNOWN_CONTACTS,
  syncedDaysAgo: 21,
} as const

/**
 * #4293.5 (#4072.1, recette prod 19/10) — « 0 Déjà connu : dans ton CRM » sur la démo SG alors que le semis marquait
 * « les premiers contacts du compte » : les contacts d'un lot partagent la même `created_at`, l'ordre lu en base
 * est donc arbitraire et ne retombait pas sur les personnes du graphe. On marque désormais PAR NOM — les mêmes
 * personnes que {@link demoCrmPresence} (donc que l'organigramme) — et jamais par rang.
 */
export function crmMarkedContactIds(
  rows: ReadonlyArray<{ id: string; full_name: string | null }>,
  presence: { contacts: ReadonlyArray<{ name: string | null }> } | null,
): string[] {
  const wanted = new Set((presence?.contacts ?? []).map(c => (c.name ?? '').trim().toLowerCase()).filter(Boolean))
  return rows.filter(row => wanted.has((row.full_name ?? '').trim().toLowerCase())).map(row => row.id)
}

export const DEMO_CRM_DEALS = {
  account: 'Société Générale',
  deals: [
    {
      deal_id: 'demo-sg-tma-banque-detail',
      name: 'TMA applicative — Banque de détail',
      stage_label: 'Proposition envoyée',
      amount: 240000,
      created_days_ago: 150,
      last_activity_days_ago: 62,
      closed_days_ago: null,
      is_closed: false,
      is_won: null,
    },
    {
      deal_id: 'demo-sg-migration-cloud-risques',
      name: 'Migration cloud — Direction des risques',
      stage_label: 'Perdue',
      amount: 180000,
      created_days_ago: 260,
      last_activity_days_ago: 125,
      closed_days_ago: 125,
      is_closed: true,
      is_won: false,
    },
    {
      deal_id: 'demo-sg-centre-services-data',
      name: 'Centre de services data',
      stage_label: 'Gagnée',
      amount: 320000,
      created_days_ago: 470,
      last_activity_days_ago: 380,
      closed_days_ago: 380,
      is_closed: true,
      is_won: true,
    },
  ],
} as const

/**
 * SYNC-A (19/10/2026, craft rule n°9) — LE MIROIR CRM en démo : les trois affaires de Société Générale
 * (`DEMO_CRM_DEALS`, compte RÉEL des briefs) copiées dans `crm_deals`, avec le pipeline et ses étapes,
 * le propriétaire des fiches et quatre activités (sujet, type, date — jamais de corps, doctrine c96).
 * Fournisseur `demo` : aucun CRM réel derrière, comme `crm_deal_facts`.
 */
export const DEMO_CRM_MIRROR = {
  owner: { external_id: 'demo-owner-commercial', name: 'Responsable commercial (démo)' },
  pipeline: {
    external_id: 'demo-pipe-esn',
    label: 'Pipe ESN',
    stages: [
      { external_id: 'demo-stage-qualification', label: 'Qualification', position: 0, status: 'open' },
      { external_id: 'demo-stage-proposition', label: 'Proposition envoyée', position: 1, status: 'open' },
      { external_id: 'demo-stage-gagnee', label: 'Gagnée', position: 2, status: 'won' },
      { external_id: 'demo-stage-perdue', label: 'Perdue', position: 3, status: 'lost' },
    ],
  },
  /** La raison de perte de l'affaire perdue, telle qu'un CRM la porte. */
  lostReason: 'Budget réalloué en interne',
  /**
   * #4604.4 (craft rule n°9) — les champs personnalisés que le CRM fictif porte sur les affaires (clé = nom d'API
   * du champ, comme chez un vrai CRM). Du texte court ou un nombre : le bloc « Ce que dit ton CRM » les montre
   * en lignes « nom : valeur ». Jamais un corps de note.
   */
  dealCustomFields: {
    'demo-sg-tma-banque-detail': { budget_it_annuel: '2,4 M€', segment_client: 'Grand compte', nb_sites: 14 },
    'demo-sg-migration-cloud-risques': { budget_it_annuel: '1,1 M€', segment_client: 'Grand compte' },
    'demo-sg-centre-services-data': { segment_client: 'Grand compte', nb_sites: 3 },
  } as Readonly<Record<string, Readonly<Record<string, string | number>>>>,
  activities: [
    {
      external_id: 'demo-sg-act-appel-dsi',
      kind: 'call',
      subject: 'Point d’avancement avec la DSI banque de détail',
      days_ago: 62,
      done: true,
      deal_id: 'demo-sg-tma-banque-detail',
    },
    {
      external_id: 'demo-sg-act-soutenance',
      kind: 'meeting',
      subject: 'Soutenance de la proposition TMA',
      days_ago: 75,
      done: true,
      deal_id: 'demo-sg-tma-banque-detail',
    },
    {
      external_id: 'demo-sg-act-relance',
      kind: 'task',
      subject: 'Relancer l’acheteur sur la proposition TMA',
      days_ago: -7,
      done: false,
      deal_id: 'demo-sg-tma-banque-detail',
    },
    {
      external_id: 'demo-sg-act-debrief-perte',
      kind: 'note',
      subject: 'Débrief de la perte — migration cloud',
      days_ago: 125,
      done: null,
      deal_id: 'demo-sg-migration-cloud-risques',
    },
  ],
} as const

/**
 * #3699.6 — LA BIBLIOTHÈQUE DE DOCUMENTS ATTACHABLES, en démo (craft rule n°9).
 *
 * Le catalogue d'assets outreach est d'ordinaire semé paresseusement au premier
 * affichage, SANS fichier : la salle le sème ici, à l'identique du catalogue de
 * démarrage (`DEFAULT_OUTREACH_ASSETS`), plus UNE fiche d'offre joignable sans
 * condition — et deux d'entre eux portent un vrai PDF fictif
 * (`outreach_asset_file`). Le dialogue d'envoi montre donc des pièces à
 * choisir, dont une retenue par son droit d'usage (« après intérêt
 * confirmé »). L'envoi, lui, reste refusé en salle (`demo_send_blocked`) :
 * aucune pièce ne part jamais d'ici.
 */
export const DEMO_OUTREACH_ASSETS: readonly {
  title: string
  description: string
  category: 'case_study' | 'company_brochure' | 'resume' | 'other'
  usageRights: 'always' | 'after_interest_confirmed'
  file: { fileKey: string; fileName: string; title: string; lines: readonly string[] } | null
}[] = [
  {
    title: 'Plaquette ESN — présentation générale',
    description: 'Présentation courte des expertises et références de votre ESN.',
    category: 'company_brochure',
    usageRights: 'after_interest_confirmed',
    file: {
      fileKey: 'outreach-asset:plaquette',
      fileName: 'plaquette-esn-demo.pdf',
      title: 'Plaquette — ESN de démonstration',
      lines: [
        'Document fictif de la salle de démonstration.',
        'Expertises : data, cloud, delivery agile.',
        '120 consultants, 4 agences.',
      ],
    },
  },
  {
    title: 'Cas client — livraison chiffrée',
    description: 'Un cas client comparable, avec un résultat chiffré, pour un message de valeur (cadence J6).',
    category: 'case_study',
    usageRights: 'after_interest_confirmed',
    file: null,
  },
  {
    title: 'CV consultant senior',
    description: "Le profil d'un consultant senior, à joindre seulement une fois l'intérêt confirmé.",
    category: 'resume',
    usageRights: 'after_interest_confirmed',
    file: null,
  },
  {
    title: 'Fiche offre — audit de plateforme data',
    description: "Une page : le périmètre, la durée et le livrable d'un audit data de trois semaines.",
    category: 'other',
    usageRights: 'always',
    file: {
      fileKey: 'outreach-asset:fiche-offre-data',
      fileName: 'fiche-offre-audit-data-demo.pdf',
      title: 'Fiche offre — audit de plateforme data',
      lines: [
        'Document fictif de la salle de démonstration.',
        'Durée : 3 semaines. Livrable : diagnostic et feuille de route.',
      ],
    },
  },
]

/**
 * P05.a (#3246, lot 09/10) — LA BASE ANONYME COMMUNE, EN DÉMONSTRATION.
 *
 * Quatre espaces FICTIFS de la salle (« ESN A » à « ESN D », jamais une vraie
 * ESN, jamais un identifiant d'espace réel) déclarent des issues par étape de
 * relance. Elles passent par la MÊME mutualisation que le réel
 * (`rewriteActionOutcomeCells` → `poolSharedCells`, scope `demo`), donc la
 * salle ne montre que ce que le seuil laisse passer :
 *  · `relance` — 4 espaces, 10 issues positives sur 18 ;
 *  · `preuve_sociale` — 3 espaces, 8 sur 12 ;
 *  · `initial` — DEUX espaces seulement : sous le seuil, il ne sort pas. C'est
 *    voulu — la salle montre aussi ce que la base commune TAIT.
 * La réponse scriptée de Laura (`demo-chat-script.ts`, `p-shared-base-elsewhere`)
 * cite exactement ces comptes ; `demo-shared-base-coverage.spec.ts` le tient.
 */
export const DEMO_SHARED_BASE_ACTION_OUTCOMES: ReadonlyArray<{
  workspaceId: string
  value: string
  positive: number
  negative: number
}> = [
  { workspaceId: 'demo-esn-a', value: 'relance', positive: 4, negative: 2 },
  { workspaceId: 'demo-esn-b', value: 'relance', positive: 3, negative: 2 },
  { workspaceId: 'demo-esn-c', value: 'relance', positive: 2, negative: 2 },
  { workspaceId: 'demo-esn-d', value: 'relance', positive: 1, negative: 2 },
  { workspaceId: 'demo-esn-a', value: 'preuve_sociale', positive: 3, negative: 1 },
  { workspaceId: 'demo-esn-b', value: 'preuve_sociale', positive: 3, negative: 1 },
  { workspaceId: 'demo-esn-c', value: 'preuve_sociale', positive: 2, negative: 2 },
  { workspaceId: 'demo-esn-a', value: 'initial', positive: 2, negative: 6 },
  { workspaceId: 'demo-esn-b', value: 'initial', positive: 1, negative: 5 },
]

/**
 * P05.b (#3246, lot 09/10) — les cas gagnés / perdus de la base commune, en
 * démonstration : les MÊMES quatre espaces FICTIFS, sur des comptes du profil
 * de Société Générale (division NAF 64, grande entreprise, tête de groupe).
 * Mutualisés comme le réel (`rewriteCaseOutcomeCells`, scope `demo`) :
 *  · secteur `naf_64` — 4 espaces, 5 gagnés, 4 perdus ;
 *  · taille `ge` — 3 espaces, 4 gagnés, 3 perdus ;
 *  · position `groupe` — 3 espaces, 4 gagnés, 3 perdus.
 * Aucun nom de client : une ligne ne porte que son profil.
 */
export const DEMO_SHARED_BASE_CASE_OUTCOMES: ReadonlyArray<{
  workspaceId: string
  nafCode: string
  employees: string
  groupRole: 'groupe' | 'filiale'
  won: number
  lost: number
}> = [
  {
    workspaceId: 'demo-esn-a',
    nafCode: '64.19Z',
    employees: '10 000 salariés et plus',
    groupRole: 'groupe',
    won: 2,
    lost: 1,
  },
  {
    workspaceId: 'demo-esn-b',
    nafCode: '64.19Z',
    employees: '10 000 salariés et plus',
    groupRole: 'groupe',
    won: 1,
    lost: 2,
  },
  {
    workspaceId: 'demo-esn-c',
    nafCode: '64.92Z',
    employees: '5 000 à 9 999 salariés',
    groupRole: 'groupe',
    won: 1,
    lost: 0,
  },
  {
    workspaceId: 'demo-esn-d',
    nafCode: '64.30Z',
    employees: '250 à 499 salariés',
    groupRole: 'filiale',
    won: 1,
    lost: 1,
  },
]

/**
 * P05.c (#3246, lot 09/10) — les signaux qui précèdent une affaire, en
 * démonstration : les MÊMES quatre espaces FICTIFS. Mutualisés comme le réel
 * (`rewriteSignalDealCells`, scope `demo`) :
 *  · `budget` — 4 espaces, 4 signaux sur 11 suivis d'une affaire ouverte sous 90 jours ;
 *  · `nomination` — DEUX espaces seulement : sous le seuil, il ne sort pas.
 */
export const DEMO_SHARED_BASE_SIGNAL_DEALS: ReadonlyArray<{
  workspaceId: string
  signalType: string
  signals: number
  followedByDeal: number
}> = [
  { workspaceId: 'demo-esn-a', signalType: 'budget', signals: 3, followedByDeal: 1 },
  { workspaceId: 'demo-esn-b', signalType: 'budget', signals: 4, followedByDeal: 2 },
  { workspaceId: 'demo-esn-c', signalType: 'budget', signals: 2, followedByDeal: 1 },
  { workspaceId: 'demo-esn-d', signalType: 'budget', signals: 2, followedByDeal: 0 },
  { workspaceId: 'demo-esn-a', signalType: 'nomination', signals: 5, followedByDeal: 2 },
  { workspaceId: 'demo-esn-b', signalType: 'nomination', signals: 3, followedByDeal: 1 },
]

/**
 * #4286.15.c (décision Louis 22/10/2026, craft rule 9) — `market_pattern` EN DÉMONSTRATION : des
 * recrutements repérés par les MÊMES quatre espaces FICTIFS, mutualisés comme le réel
 * (`rewriteMarketPatternCells`, scope `demo`), au profil de Société Générale (banque `naf_64`, grande
 * entreprise, Île-de-France). Des intitulés génériques et des codes postaux, jamais une société réelle :
 *  · `data` — 4 espaces, 5 recrutements, jusqu'à la cellule fine (secteur, taille, région) ;
 *  · `cloud` — 3 espaces dont un hors Île-de-France : sort au secteur et à la taille, toutes régions ;
 *  · `securite` — DEUX espaces seulement : sous le seuil, il ne sort pas.
 */
export const DEMO_SHARED_BASE_MARKET_PATTERNS: ReadonlyArray<{
  workspaceId: string
  jobTitle: string
  nafCode: string
  employees: string
  address: string
}> = [
  {
    workspaceId: 'demo-esn-a',
    jobTitle: 'Data Engineer',
    nafCode: '64.19Z',
    employees: '10 000 salariés et plus',
    address: '75009 Paris',
  },
  {
    workspaceId: 'demo-esn-a',
    jobTitle: 'Data Scientist',
    nafCode: '64.19Z',
    employees: '10 000 salariés et plus',
    address: '75009 Paris',
  },
  {
    workspaceId: 'demo-esn-b',
    jobTitle: 'Data Engineer',
    nafCode: '64.92Z',
    employees: '10 000 salariés et plus',
    address: '92800 Puteaux',
  },
  {
    workspaceId: 'demo-esn-c',
    jobTitle: 'Data Engineer',
    nafCode: '64.11Z',
    employees: '10 000 salariés et plus',
    address: '75013 Paris',
  },
  {
    workspaceId: 'demo-esn-d',
    jobTitle: 'Data Scientist',
    nafCode: '64.30Z',
    employees: '10 000 salariés et plus',
    address: '92400 Courbevoie',
  },
  {
    workspaceId: 'demo-esn-a',
    jobTitle: 'Ingénieur DevOps',
    nafCode: '64.19Z',
    employees: '10 000 salariés et plus',
    address: '75009 Paris',
  },
  {
    workspaceId: 'demo-esn-b',
    jobTitle: 'Ingénieur DevOps',
    nafCode: '64.92Z',
    employees: '10 000 salariés et plus',
    address: '92800 Puteaux',
  },
  {
    workspaceId: 'demo-esn-c',
    jobTitle: 'Ingénieur cloud',
    nafCode: '64.11Z',
    employees: '10 000 salariés et plus',
    address: '69002 Lyon',
  },
  {
    workspaceId: 'demo-esn-a',
    jobTitle: 'Analyste cybersécurité',
    nafCode: '64.19Z',
    employees: '10 000 salariés et plus',
    address: '75009 Paris',
  },
  {
    workspaceId: 'demo-esn-b',
    jobTitle: 'Analyste cybersécurité',
    nafCode: '64.92Z',
    employees: '10 000 salariés et plus',
    address: '92800 Puteaux',
  },
]

/**
 * #4016 L1 (décision Louis 11/10/2026) — LA CALIBRATION DE LA PROBABILITÉ, EN
 * SALLE DE DÉMONSTRATION (craft rule 9).
 *
 * Le panneau « CA probable du trimestre » (`/projects`) calibre chaque affaire
 * ouverte sur les affaires CLOSES de l'espace qui avaient atteint son stade.
 * Sans issues closes, la salle n'afficherait que « non mesuré » ; sans PERTE,
 * elle afficherait une probabilité écrasée vers le haut. D'où sept affaires
 * closes au parcours journalisé (gagnées et perdues, à des stades différents)
 * et une affaire ouverte en négociation qui tombe dans les trois mois à venir.
 *
 * ⚠️ Même client FICTIF que le reste de la salle : aucune issue d'affaire n'est
 * attribuée à une société réelle. `reached` est le plus haut stade ouvert que
 * l'affaire a atteint : le semis écrit au journal `commercial_transitions` chaque
 * stade du pipe jusqu'à lui (ordre du contrat, jamais une liste retapée — GA-57),
 * puis l'issue.
 */
export const DEMO_PROBABILITY_CALIBRATION = {
  openDeal: {
    label: 'Supervision des applications de vente — lot 2',
    detail:
      'Extension du dispositif d’observabilité aux applications de vente en ligne : reprise des tableaux de bord et des seuils d’alerte.',
    stage: 'negotiation' as const,
    amount_cents: 64_000_00,
    expected_close_in_days: 34,
    stage_entered_days_ago: 9,
  },
  closedDeals: [
    {
      label: 'Tierce maintenance applicative — billettique',
      outcome: 'won' as const,
      reached: 'negotiation' as const,
      amount_cents: 210_000_00,
      closed_days_ago: 160,
    },
    {
      label: 'Renfort exploitation — période estivale',
      outcome: 'won' as const,
      reached: 'negotiation' as const,
      amount_cents: 48_000_00,
      closed_days_ago: 120,
    },
    {
      label: 'Audit de résilience des systèmes temps réel',
      outcome: 'won' as const,
      reached: 'negotiation' as const,
      amount_cents: 36_000_00,
      closed_days_ago: 95,
    },
    {
      label: 'Pilotage de la migration des serveurs d’applications',
      outcome: 'won' as const,
      reached: 'negotiation' as const,
      amount_cents: 92_000_00,
      closed_days_ago: 70,
    },
    {
      label: 'Refonte du portail fournisseurs',
      outcome: 'lost' as const,
      reached: 'negotiation' as const,
      amount_cents: 130_000_00,
      closed_days_ago: 140,
    },
    {
      label: 'Assistance à la recette — outil de planification',
      outcome: 'lost' as const,
      reached: 'profiles_submitted' as const,
      amount_cents: 41_000_00,
      closed_days_ago: 110,
    },
    {
      label: 'Cadrage de la plateforme d’intégration',
      outcome: 'lost' as const,
      reached: 'confirmed' as const,
      amount_cents: 27_000_00,
      closed_days_ago: 60,
    },
  ],
}

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE de la salle (craft rule n°9) : Réglages › Équipe
 * s'ouvre sur une politique saisie, et Laura la cite quand elle organise une journée.
 * Les plages tombent HORS de la journée que la salle planifie (10 h – 18 h,
 * `apps/web/src/features/demo/demo-weekly-plan.ts`, même politique en snake_case) —
 * sauf la plage du lundi, que la carte scriptée contourne — : le visiteur PEUT la changer.
 */
export const DEMO_TEAM_POLICY: TeamPolicy = {
  // 8 h 30 – 10 h : matinée de prospection, aucune réunion.
  prospectingWindows: [{ startMinute: 510, endMinute: 600 }],
  // #2770.37 — des plages PAR JOUR : « 12:00–14:00 (lun.) » (pause déjeuner du lundi, ISO 1) et,
  // chaque jour, 18 h – 20 h (aucun bloc proposé en soirée). Deux plages, sans chevauchement un même jour
  // (`teamPolicySchema`) ; la base tient au plus quatre plages par liste (CHECK de la migration
  // `1796440017293-WorkspaceTeamPolicySettings`).
  forbiddenWindows: [
    { startMinute: 720, endMinute: 840, weekdays: [1] },
    { startMinute: 1080, endMinute: 1200 },
  ],
  maxMeetingsPerDay: 4,
  dailyCallTarget: 20,
}

/**
 * #3989 (Louis 11/10/2026, `c94_base_commune_capitalise_tout`) — les faits
 * société de la base commune, en démonstration : des RÔLES qu'un utilisateur
 * d'un espace FICTIF a apportés sur Société Générale (SIREN 552120222, déjà
 * celui du dossier de la salle). Ils passent par la MÊME frontière que le réel
 * (`upsertSharedCompanyPeople` → `toSharedPersonFact`, scope `demo`) : apportés
 * par un utilisateur, ils entrent ANONYMISÉS — le rôle, jamais la personne.
 * Les noms ci-dessous sont FICTIFS et ne sortent pas : la frontière les retire,
 * et `demo-shared-base-coverage.spec.ts` le prouve. L'amorce scriptée
 * `p-shared-base-roles` cite ces deux rôles.
 */
export const DEMO_SHARED_BASE_COMPANY_ROLES: ReadonlyArray<{
  source: 'import' | 'manual'
  fullName: string
  title: string
}> = [
  { source: 'import', fullName: 'Ana Démo', title: 'Responsable achats IT' },
  { source: 'manual', fullName: 'Paul Fictif', title: 'Directeur de la transformation digitale' },
]

/**
 * #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — l'apprentissage des messages dans la
 * base commune, en démonstration : les MÊMES quatre espaces FICTIFS déclarent des
 * signaux (comptes seulement, jamais un corps de message). Mutualisés comme le
 * réel (`rewriteMessageLearningCells`, scope `demo`), lus par le service IA à la
 * génération d'un message dans la salle :
 *  · `approved_after_edit` — 4 espaces, 10 retouchés ;
 *  · `approved_without_edit` — 3 espaces, 6 validés tels quels ;
 *  · `wrong_fact` — 3 espaces, 7 signalés « faux fait » ;
 *  · `wrong_cta` — DEUX espaces seulement : sous le seuil, il ne sort pas.
 */
export const DEMO_SHARED_BASE_MESSAGE_LEARNING: ReadonlyArray<{
  workspaceId: string
  signal: string
  count: number
}> = [
  { workspaceId: 'demo-esn-a', signal: 'approved_after_edit', count: 3 },
  { workspaceId: 'demo-esn-b', signal: 'approved_after_edit', count: 3 },
  { workspaceId: 'demo-esn-c', signal: 'approved_after_edit', count: 2 },
  { workspaceId: 'demo-esn-d', signal: 'approved_after_edit', count: 2 },
  { workspaceId: 'demo-esn-a', signal: 'approved_without_edit', count: 2 },
  { workspaceId: 'demo-esn-b', signal: 'approved_without_edit', count: 2 },
  { workspaceId: 'demo-esn-c', signal: 'approved_without_edit', count: 2 },
  { workspaceId: 'demo-esn-a', signal: 'wrong_fact', count: 3 },
  { workspaceId: 'demo-esn-b', signal: 'wrong_fact', count: 2 },
  { workspaceId: 'demo-esn-c', signal: 'wrong_fact', count: 2 },
  { workspaceId: 'demo-esn-a', signal: 'wrong_cta', count: 2 },
  { workspaceId: 'demo-esn-b', signal: 'wrong_cta', count: 1 },
]

/**
 * L2 PILOTAGE › PIPE, EN SALLE DE DÉMONSTRATION (craft rule 9, Louis 14/10/2026).
 *
 * L'onglet `/pilotage/pipe` lit quatre choses que la salle n'avait pas : la
 * catégorie DÉCLARÉE d'une opportunité, ses dates prévues (dont certaines
 * dépassées ou repoussées), l'historique de ses stades et de son montant (le
 * waterfall), et le dernier contact (les signaux de risque). Sans elles, l'écran
 * s'ouvre vide devant un prospect.
 *
 * ⚠️ Comptes RÉELS des dossiers de la salle (jamais un compte « exemple »).
 * Les opportunités sont celles d'un commercial — le seul de la salle : pas de
 * coéquipiers fictifs (Louis 14/10), voir `DEMO_PIPE_COVERAGE`.
 *
 * ⚠️ Tout est RELATIF à `now` : « il y a 12 jours », « à 60 % du mois en
 * cours ». Une date en dur cesserait d'être crédible au premier changement de
 * mois, et le waterfall (mois en cours) serait vide le 1ᵉʳ du mois. Un nombre
 * est un « il y a N jours » ; `{ m: f }` place l'événement à la fraction `f` du
 * mois écoulé — donc TOUJOURS dans la période du waterfall.
 *
 * Le journal est COHÉRENT avec l'état courant de chaque ligne (dernier montant,
 * dernière date, dernier stade) : le waterfall tombe juste, sans « écart non
 * expliqué » — garde : `demo-pipe-journal.spec.ts`.
 */
export type DemoPipeWhen = number | { m: number }

export interface DemoPipeDeal {
  account: string
  label: string
  detail: string
  stage: 'qualified' | 'confirmed' | 'profiles_submitted' | 'negotiation' | 'won' | 'lost' | 'dormant'
  /** Montant courant ; `null` = jamais saisi (absent, pas 0). */
  amountCents: number | null
  /** La déclaration du commercial ; `null` = non déclarée. */
  category: 'commit' | 'best_case' | 'pipeline' | 'omitted' | null
  /** Date prévue courante, en jours depuis maintenant (négatif = dépassée) ; `null` = non fixée. */
  expectedCloseInDays: number | null
  created: DemoPipeWhen
  stageEntered: DemoPipeWhen
  closed?: DemoPipeWhen
  transitions: readonly { from: string | null; to: string; at: DemoPipeWhen }[]
  amountChanges: readonly { fromCents: number | null; toCents: number | null; at: DemoPipeWhen }[]
  /** Chaque report de date prévue : de J+x à J+y (en jours depuis maintenant), saisi à `at`. */
  closeDateChanges: readonly { fromInDays: number; toInDays: number; at: DemoPipeWhen }[]
  /** Dernière touche enregistrée sur l'affaire ; absent = aucune connue. */
  lastActivityDaysAgo?: number
}

// #4338.1 — historiques écrits dans l'ordre Besoin exprimé (`confirmed`) → Qualifié
// (`qualified`) : une avancée de démo ne se lit jamais comme un recul.
export const DEMO_PIPE_L2 = {
  /** Catégories déclarées sur des opportunités DÉJÀ semées (par libellé exact). */
  existingDeclarations: [
    { label: 'Supervision des applications de vente — lot 2', category: 'commit' },
    { label: 'Programme de refonte applicative — renfort et exploitation', category: 'best_case' },
    { label: 'Renouvellement — convergence des applications temps réel', category: 'pipeline' },
  ] as readonly { label: string; category: 'commit' | 'best_case' | 'pipeline' | 'omitted' }[],

  deals: [
    {
      account: 'Société Générale',
      label: 'Renfort data engineering — plateforme de pilotage des risques',
      detail: 'Squad de quatre data engineers pour la plateforme de pilotage des risques de marché.',
      stage: 'negotiation',
      amountCents: 240_000_00,
      category: 'commit',
      expectedCloseInDays: 21,
      created: 120,
      stageEntered: 12,
      transitions: [
        { from: null, to: 'confirmed', at: 120 },
        { from: 'confirmed', to: 'qualified', at: 95 },
        { from: 'qualified', to: 'profiles_submitted', at: 60 },
        { from: 'profiles_submitted', to: 'negotiation', at: 12 },
      ],
      amountChanges: [{ fromCents: 200_000_00, toCents: 240_000_00, at: { m: 0.3 } }],
      closeDateChanges: [],
      lastActivityDaysAgo: 5,
    },
    {
      account: 'SNCF',
      label: 'Tierce maintenance applicative — systèmes de billettique',
      detail: 'Reprise de la maintenance applicative des systèmes de billettique, périmètre élargi après le cadrage.',
      stage: 'negotiation',
      amountCents: 180_000_00,
      category: 'best_case',
      expectedCloseInDays: -9,
      created: 150,
      stageEntered: 40,
      transitions: [
        { from: null, to: 'confirmed', at: 150 },
        { from: 'confirmed', to: 'qualified', at: 120 },
        { from: 'qualified', to: 'profiles_submitted', at: 85 },
        { from: 'profiles_submitted', to: 'negotiation', at: 40 },
      ],
      amountChanges: [{ fromCents: 220_000_00, toCents: 180_000_00, at: { m: 0.5 } }],
      closeDateChanges: [
        { fromInDays: -60, toInDays: -30, at: 50 },
        { fromInDays: -30, toInDays: -15, at: 30 },
        { fromInDays: -15, toInDays: -9, at: 14 },
      ],
      lastActivityDaysAgo: 34,
    },
    {
      account: 'Groupe BPCE',
      label: 'Squad paiements instantanés — renfort run',
      detail: 'Renfort du run des paiements instantanés : astreintes, supervision, correctifs.',
      stage: 'negotiation',
      amountCents: 96_000_00,
      category: null,
      expectedCloseInDays: 30,
      created: 70,
      stageEntered: 20,
      transitions: [
        { from: null, to: 'confirmed', at: 70 },
        { from: 'confirmed', to: 'qualified', at: 55 },
        { from: 'qualified', to: 'profiles_submitted', at: 38 },
        { from: 'profiles_submitted', to: 'negotiation', at: 20 },
      ],
      amountChanges: [],
      closeDateChanges: [],
      lastActivityDaysAgo: 2,
    },
    {
      account: 'ENGIE',
      label: 'Assistance exploitation — réseaux de distribution',
      detail: 'Assistance à l’exploitation des applications de conduite des réseaux de distribution.',
      stage: 'profiles_submitted',
      amountCents: null,
      category: 'pipeline',
      expectedCloseInDays: 45,
      created: 60,
      stageEntered: 10,
      transitions: [
        { from: null, to: 'confirmed', at: 60 },
        { from: 'confirmed', to: 'qualified', at: 40 },
        { from: 'qualified', to: 'profiles_submitted', at: 10 },
      ],
      amountChanges: [],
      closeDateChanges: [],
      lastActivityDaysAgo: 8,
    },
    {
      account: 'TotalEnergies',
      label: 'Renfort sécurité applicative — raffinage',
      detail: 'Deux ingénieurs sécurité applicative pour les outils de supervision de raffinerie.',
      stage: 'profiles_submitted',
      amountCents: 150_000_00,
      category: 'best_case',
      expectedCloseInDays: 35,
      created: 75,
      stageEntered: 14,
      transitions: [
        { from: null, to: 'confirmed', at: 75 },
        { from: 'confirmed', to: 'qualified', at: 45 },
        { from: 'qualified', to: 'profiles_submitted', at: 14 },
      ],
      amountChanges: [],
      closeDateChanges: [],
      lastActivityDaysAgo: 4,
    },
    {
      account: 'Alstom',
      label: 'Industrialisation CI/CD — chaîne de signalisation',
      detail: 'Industrialisation de la chaîne d’intégration et de livraison des logiciels de signalisation.',
      stage: 'profiles_submitted',
      amountCents: 110_000_00,
      category: 'commit',
      expectedCloseInDays: -3,
      created: 90,
      stageEntered: 70,
      transitions: [
        { from: null, to: 'confirmed', at: 90 },
        { from: 'confirmed', to: 'qualified', at: 80 },
        { from: 'qualified', to: 'profiles_submitted', at: 70 },
      ],
      amountChanges: [],
      closeDateChanges: [],
      lastActivityDaysAgo: 25,
    },
    {
      account: 'Naval Group',
      label: 'Cadrage plateforme de simulation — lot 1',
      detail: 'Cadrage de la plateforme de simulation des systèmes de combat, premier lot.',
      stage: 'confirmed',
      amountCents: 60_000_00,
      category: 'omitted',
      expectedCloseInDays: 60,
      created: { m: 0.15 },
      stageEntered: { m: 0.15 },
      transitions: [{ from: null, to: 'confirmed', at: { m: 0.15 } }],
      amountChanges: [],
      closeDateChanges: [],
      lastActivityDaysAgo: 1,
    },
    {
      account: 'Société Générale',
      label: 'Migration cloud — lot socle d’infrastructure',
      detail: 'Socle d’infrastructure pour la migration des applications vers le cloud privé du groupe.',
      stage: 'qualified',
      amountCents: 110_000_00,
      category: 'best_case',
      expectedCloseInDays: 40,
      created: 45,
      stageEntered: 30,
      transitions: [
        { from: null, to: 'confirmed', at: 45 },
        { from: 'confirmed', to: 'qualified', at: 30 },
      ],
      amountChanges: [],
      closeDateChanges: [],
      lastActivityDaysAgo: 6,
    },
    {
      account: 'SNCF',
      label: 'Programme de pilotage des opérations ferroviaires',
      detail: 'Piste détectée, besoin exprimé ce mois-ci : pilotage des opérations ferroviaires.',
      stage: 'confirmed',
      amountCents: 75_000_00,
      category: null,
      expectedCloseInDays: null,
      created: 80,
      stageEntered: { m: 0.4 },
      transitions: [
        { from: null, to: 'detected', at: 80 },
        { from: 'detected', to: 'confirmed', at: { m: 0.4 } },
      ],
      amountChanges: [],
      closeDateChanges: [],
    },
    {
      account: 'SNCF',
      label: 'Renfort exploitation — infrastructure voyageurs',
      detail: 'Renfort exploitation de l’infrastructure d’information voyageurs. Signé ce mois-ci.',
      stage: 'won',
      amountCents: 130_000_00,
      category: 'commit',
      expectedCloseInDays: null,
      created: 100,
      stageEntered: { m: 0.6 },
      closed: { m: 0.6 },
      transitions: [
        { from: null, to: 'confirmed', at: 100 },
        { from: 'confirmed', to: 'qualified', at: 85 },
        { from: 'qualified', to: 'profiles_submitted', at: 60 },
        { from: 'profiles_submitted', to: 'negotiation', at: 45 },
        { from: 'negotiation', to: 'won', at: { m: 0.6 } },
      ],
      amountChanges: [{ fromCents: 150_000_00, toCents: 130_000_00, at: { m: 0.2 } }],
      closeDateChanges: [],
    },
    {
      account: 'Alstom',
      label: 'Assistance à la recette — outil de planification industrielle',
      detail: 'Assistance à la recette d’un outil de planification industrielle. Perdu ce mois-ci.',
      stage: 'lost',
      amountCents: 90_000_00,
      category: 'best_case',
      expectedCloseInDays: null,
      created: 95,
      stageEntered: { m: 0.45 },
      closed: { m: 0.45 },
      transitions: [
        { from: null, to: 'confirmed', at: 95 },
        { from: 'confirmed', to: 'qualified', at: 70 },
        { from: 'qualified', to: 'profiles_submitted', at: 50 },
        { from: 'profiles_submitted', to: 'lost', at: { m: 0.45 } },
      ],
      amountChanges: [],
      closeDateChanges: [],
    },
    {
      account: 'ENGIE',
      label: 'Migration du SI achats — reprise des interfaces',
      detail: 'Mise en sommeil ce mois-ci : le client reporte la migration.',
      stage: 'dormant',
      amountCents: 50_000_00,
      category: 'pipeline',
      expectedCloseInDays: null,
      created: 70,
      stageEntered: { m: 0.7 },
      transitions: [
        { from: null, to: 'confirmed', at: 70 },
        { from: 'confirmed', to: 'dormant', at: { m: 0.7 } },
      ],
      amountChanges: [],
      closeDateChanges: [],
    },
    // ── L'historique clos des 90 jours (taux de gain) et des 180 jours (cycle) — tous clos AVANT
    //    le début du mois courant (≥ 35 jours), donc hors du waterfall du mois.
    ...(
      [
        ['Société Générale', 'Renfort DevSecOps — programme de conformité', 85_000_00, 'won', 38, 90],
        ['Groupe BPCE', 'Support applicatif niveau 3 — canal digital', 120_000_00, 'won', 41, 120],
        ['ENGIE', 'Supervision des flux énergétiques — lot 1', 64_000_00, 'won', 48, 75],
        ['SNCF', 'Reprise de la maintenance des automates', 98_000_00, 'won', 60, 150],
        ['TotalEnergies', 'Pilotage de la migration des serveurs — site Nord', 72_000_00, 'won', 78, 110],
        ['Alstom', 'Refonte du portail fournisseurs — Alstom', 55_000_00, 'lost', 40, 70],
        ['Naval Group', 'Assistance PMO — programme navires', 45_000_00, 'lost', 52, 90],
        ['Groupe BPCE', 'Cadrage plateforme de données client', 70_000_00, 'lost', 80, 100],
      ] as const
    ).map(([account, label, amountCents, outcome, closedDaysAgo, createdDaysAgo]): DemoPipeDeal => ({
      account,
      label,
      detail:
        outcome === 'won'
          ? 'Affaire signée dans les trois derniers mois.'
          : 'Affaire perdue dans les trois derniers mois.',
      stage: outcome,
      amountCents,
      category: outcome === 'won' ? 'commit' : 'best_case',
      expectedCloseInDays: null,
      created: createdDaysAgo,
      stageEntered: closedDaysAgo,
      closed: closedDaysAgo,
      transitions: [
        { from: null, to: 'confirmed', at: createdDaysAgo },
        { from: 'confirmed', to: outcome, at: closedDaysAgo },
      ],
      amountChanges: [],
      closeDateChanges: [],
    })),
  ] as readonly DemoPipeDeal[],
}

/**
 * Refonte Pilotage L1 (Louis 14/10/2026, craft rule 9) — « CE QUI A BOUGÉ » EN
 * SALLE DE DÉMONSTRATION.
 *
 * Le Cockpit `/pilotage` ouvre sur sept compteurs (créées, avancées, reculées,
 * perdues, signées, missions qui finissent, encaissé). Sans mouvements récents,
 * la salle les montrerait tous à « 0 » devant un prospect.
 *
 * Chaque affaire porte le parcours qui l'a menée là, du plus ancien au plus
 * récent, en JOURS AVANT LA VISITE — jamais une date figée : le semis les
 * résout contre `now`, donc la salle reste « de cette semaine » quel que soit
 * le jour où le prospect l'ouvre. Le DERNIER pas de chaque parcours tombe dans
 * les sept derniers jours ; les précédents sont plus anciens et ne comptent pas
 * dans la semaine.
 *
 * Les comptes sont ceux des briefs commerciaux de la salle (noms complets), pas
 * un compte fictif. Un montant `null` est un montant jamais saisi : la salle
 * montre aussi « montant non saisi », jamais 0 €.
 */
export const DEMO_PILOTAGE_WEEK_MOVES = [
  // ── créées (première détection dans la semaine) ──
  {
    account: 'Société Générale',
    label: 'Refonte du portail de pilotage des risques',
    amount_cents: 120_000_00,
    path: [{ to: 'qualified', days_ago: 2 }],
  },
  {
    account: 'BNP Paribas',
    label: 'Data office — renfort en ingénierie des données',
    amount_cents: 96_000_00,
    path: [{ to: 'qualified', days_ago: 1 }],
  },
  {
    account: 'ENGIE',
    label: 'Supervision des postes de conduite — consultation',
    amount_cents: null,
    path: [{ to: 'qualified', days_ago: 4 }],
  },
  // ── avancées ──
  {
    account: 'Société Générale',
    label: 'Migration des applications de paiement vers le cloud',
    amount_cents: 210_000_00,
    path: [
      { to: 'qualified', days_ago: 40 },
      { to: 'confirmed', days_ago: 3 },
    ],
  },
  {
    account: 'Alstom',
    label: 'Maintenance évolutive des outils de signalisation',
    amount_cents: 150_000_00,
    path: [
      { to: 'qualified', days_ago: 50 },
      { to: 'confirmed', days_ago: 25 },
      { to: 'profiles_submitted', days_ago: 2 },
    ],
  },
  {
    account: 'TotalEnergies',
    label: 'Plateforme de données de trading — renfort',
    amount_cents: 180_000_00,
    path: [
      { to: 'qualified', days_ago: 70 },
      { to: 'confirmed', days_ago: 45 },
      { to: 'profiles_submitted', days_ago: 20 },
      { to: 'negotiation', days_ago: 5 },
    ],
  },
  // ── reculée ──
  {
    account: 'Groupe BPCE',
    label: 'Renfort exploitation des chaînes de paiement',
    amount_cents: 75_000_00,
    path: [
      { to: 'qualified', days_ago: 60 },
      { to: 'confirmed', days_ago: 35 },
      { to: 'negotiation', days_ago: 15 },
      { to: 'confirmed', days_ago: 4 },
    ],
  },
  // ── perdue ──
  {
    account: 'BNP Paribas',
    label: 'Centre de service applicatif — consultation',
    amount_cents: 140_000_00,
    path: [
      { to: 'qualified', days_ago: 55 },
      { to: 'negotiation', days_ago: 20 },
      { to: 'lost', days_ago: 3 },
    ],
  },
  // ── signée ──
  {
    account: 'ENGIE',
    label: 'Tierce maintenance applicative — systèmes de supervision',
    amount_cents: 95_000_00,
    path: [
      { to: 'qualified', days_ago: 65 },
      { to: 'confirmed', days_ago: 40 },
      { to: 'negotiation', days_ago: 12 },
      { to: 'won', days_ago: 1 },
    ],
  },
] as const satisfies readonly {
  account: string
  label: string
  amount_cents: number | null
  path: readonly { to: string; days_ago: number }[]
}[]

/**
 * Les règlements de la semaine (Cockpit › « encaissé »). Une facture par
 * mission, émise le lendemain du début du mois, réglée `paid_days_ago` jours
 * avant la visite — résolu contre `now` au semis. La maille est celle du mois
 * PRÉCÉDENT (`months_ago: 1`), que l'historique de la salle n'utilise pas :
 * l'unicité `(mission, mois)` ne peut donc pas être heurtée.
 */
export const DEMO_PILOTAGE_RECENT_PAYMENTS = [
  {
    mission: 'Industrialisation d’un cas d’usage de recherche — mise en production',
    billed_days: 20,
    paid_days_ago: 2,
  },
  { mission: 'Socle conteneurisé des applications terrain — run', billed_days: 21, paid_days_ago: 4 },
  {
    mission: 'Convergence des applications temps réel — lots interfaces et reprise',
    billed_days: 20,
    paid_days_ago: 5,
  },
] as const

/** Un règlement daté contre `now`, ou `null` si le jour de la visite ne laisse pas la place (facture pas encore émise). */
export function demoPilotageRecentPayments(now: number): {
  missionLabel: string
  periodMonth: string
  reference: string
  invoicedAt: string
  invoicedAmountCents: number | null
  dueOn: string
  paidAt: string
}[] {
  const day = 86_400_000
  const visit = new Date(now)
  const firstOfMonth = Date.UTC(visit.getUTCFullYear(), visit.getUTCMonth(), 1, 12)
  const periodMonth = new Date(Date.UTC(visit.getUTCFullYear(), visit.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
  const rateByMission = new Map(DEMO_DELIVERY_CLIENT.missions.map(mission => [mission.label, mission.daily_rate]))
  const invoicedAt = firstOfMonth + day
  return DEMO_PILOTAGE_RECENT_PAYMENTS.flatMap((payment, index) => {
    const paidAt = now - payment.paid_days_ago * day
    // Réglée avant d'être émise n'a pas de sens : le 1er ou le 2 du mois, la facture n'existe pas encore.
    if (paidAt <= invoicedAt) return []
    const rate = rateByMission.get(payment.mission) ?? null
    return [
      {
        missionLabel: payment.mission,
        periodMonth,
        reference: `F-${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}-W${index + 1}`,
        invoicedAt: new Date(invoicedAt).toISOString(),
        invoicedAmountCents: rate === null ? null : rate * payment.billed_days * 100,
        dueOn: new Date(invoicedAt + 30 * day).toISOString().slice(0, 10),
        paidAt: new Date(paidAt).toISOString(),
      },
    ]
  })
}

/* ------------------------------------------------------------------ */
/* Mode équipe — trois collègues fictifs (#4158.13)                    */
/* ------------------------------------------------------------------ */

/** Le rôle d'un collègue fictif — un sous-ensemble de `WorkspaceRole`, jamais `owner`. */
type DemoColleagueRole = 'sales' | 'admin'

type DemoColleague = {
  /** Identifiant stable dans le jeu — celui que lisent les actions déléguées et l'activité ci-dessous. */
  key: string
  /**
   * L'identifiant d'utilisateur, FIXE. Il vit ICI et nulle part ailleurs : les
   * lots qui parlent d'équipe en démonstration (notifications, page /team)
   * s'alignent sur CETTE liste et ne fabriquent jamais un second collègue.
   */
  userId: string
  first_name: string
  last_name: string
  /** Sur un domaine réservé (RFC 2606) : l'adresse ne reçoit rien, ne se connecte nulle part. */
  email: string
  role: DemoColleagueRole
  /** Les comptes de la salle que ce collègue porte (`accounts.assigned_to`) — des noms de `DEMO_DOSSIERS`. */
  accounts: readonly string[]
}

/**
 * #4158.13 (Louis, 14/10/2026) — TROIS COLLÈGUES FICTIFS pour l'espace de démonstration.
 *
 * Avec la propriétaire (`DEMO_OWNER`) ils font quatre membres actifs : assez pour
 * que la barre latérale affiche « Équipe » (dès deux membres actifs) et que
 * `/team` montre une équipe vivante — comptes portés par des collègues, actions
 * déléguées, activité — au lieu d'un cockpit à une personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE SONT CES COLLÈGUES, ET CE QU'ILS NE SONT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Des lignes `profiles` + `workspace_members`, qui portent toutes deux une clé
 * étrangère DURE vers `auth.users(id)` : chaque collègue a donc un compte
 * d'authentification, créé SANS mot de passe (comme celui de l'occupant de la
 * salle par `DemoPoolService.resolvePoolUser`) sur une adresse de domaine
 * réservé — rien n'y arrive, personne ne s'en sert pour se connecter, et la
 * session de la salle n'est mintée que pour son occupant.
 *
 * Les noms sont FICTIFS, comme le reste du jeu, et ne désignent aucune personne
 * réelle. Les comptes qu'ils portent sont des comptes SECONDAIRES de la salle :
 * les dossiers vedettes (Société Générale, BPCE, SNCF…) restent ceux de
 * l'occupant, dont tout le parcours de démonstration dépend.
 */
export const DEMO_COLLEAGUES: readonly DemoColleague[] = [
  {
    key: 'lea',
    userId: 'de0c0000-0000-4000-8000-000000000a01',
    first_name: 'Léa',
    last_name: 'Marchand',
    email: 'lea.marchand@exemple.test',
    role: 'sales',
    accounts: ['Alstom', 'Naval Group'],
  },
  {
    key: 'karim',
    userId: 'de0c0000-0000-4000-8000-000000000a02',
    first_name: 'Karim',
    last_name: 'Benali',
    email: 'karim.benali@exemple.test',
    role: 'sales',
    accounts: ['Bpifrance', 'ADEO - Leroy Merlin'],
  },
  {
    key: 'sophie',
    userId: 'de0c0000-0000-4000-8000-000000000a03',
    first_name: 'Sophie',
    last_name: 'Vasseur',
    email: 'sophie.vasseur@exemple.test',
    role: 'admin',
    accounts: ["Chantiers de l'Atlantique", 'Kiabi'],
  },
]

/**
 * #2128.19 (recette D3 01/11) — UNE ANALYSE EN COURS PAR UN COLLÈGUE (craft rule 9). Le bandeau de collaboration du
 * dossier (`active_analysis_by_colleague`, `resolveActiveAnalysisByColleague`) lit un `analysis_runs` au statut
 * `analyzing` porté par un AUTRE utilisateur du même espace : sans collègue seedé, la salle ne le montrait jamais.
 * Le compte est un compte SECONDAIRE du collègue (jamais un dossier vedette de l'occupant), et le run est daté
 * RELATIVEMENT au semis (quelques minutes) : il se lit « en cours » à l'ouverture de la salle.
 */
export const DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE: {
  /** Un compte de la salle, porté par ce collègue. */
  company: string
  /** La clé d'un collègue de {@link DEMO_COLLEAGUES}. */
  colleague: string
  minutesAgo: number
} = { company: 'Naval Group', colleague: 'lea', minutesAgo: 12 }

/**
 * #4158.13 — QUELQUES ACTIONS DÉLÉGUÉES (`action_plan_items.assigned_to`). Créées
 * par l'occupant (c'est lui qui délègue), portées par un collègue : elles
 * apparaissent sur le cockpit de l'assigné et dans « Actions partagées » de
 * `/team`. Aucune n'est faite ni en retard : une démonstration montre du travail
 * en cours, pas un retard fabriqué.
 */
export const DEMO_DELEGATED_ACTIONS: readonly {
  /** Un compte de la salle. */
  company: string
  /** La clé d'un collègue de {@link DEMO_COLLEAGUES}. */
  colleague: string
  label: string
  dueInDays: number
}[] = [
  {
    company: 'Alstom',
    colleague: 'lea',
    label: 'Préparer le point de cadrage avec la direction des achats',
    dueInDays: 4,
  },
  {
    company: 'Bpifrance',
    colleague: 'karim',
    label: 'Relire la synthèse du dossier avant le prochain rendez-vous',
    dueInDays: 6,
  },
  {
    company: 'Kiabi',
    colleague: 'sophie',
    label: 'Valider le périmètre de la proposition avec la direction',
    dueInDays: 3,
  },
]

/**
 * 29/10/2026 (Louis) — LE GESTE D'ÉQUIPE QUE LA DÉMO NE MONTRAIT PAS : un compte ANALYSÉ par le premier
 * membre (l'occupant, {@link DEMO_OWNER}) et TRAVAILLÉ par le second (un collègue fictif de
 * {@link DEMO_COLLEAGUES}). C'est le P0 de Bedros et Adel (#4731) : « un coéquipier agit sur le compte
 * qu'un autre a analysé ». Jusque-là, seul un test en mémoire le prouvait — le prospect ne le voyait pas.
 *
 * ⚠️ RENVERSEMENT ASSUMÉ de #2117.14 (« l'espace de démo est SOLO, DEMO_OWNER seul membre réel ») :
 * « le mode équipe est ce que Bedros et Adel ont acheté : un prospect doit le voir » (craft rule n°9).
 * La solitude de l'espace avait déjà cédé à #4158.13 (trois collègues, 14/10/2026) ; restait que chacun
 * ne travaillait QUE ses propres comptes. Ici, un compte vedette de l'occupant reçoit une tâche portée
 * par un collègue.
 *
 * C'est une TÂCHE (`action_plan_items`), jamais une ligne `user_actions` : deux auteurs dans
 * `user_actions` sur un même compte se liraient comme une « collision de prospection » (#3398.2), un
 * signal que la salle n'a pas à fabriquer. Aucun envoi, aucun appel fournisseur : rien ne sort de la démo.
 * Le collègue est FICTIF, sur un domaine réservé (voir {@link DEMO_COLLEAGUES}).
 */
export const DEMO_SHARED_ACCOUNT_WORK: readonly {
  /** Un compte de l'occupant, analysé par lui (jamais un compte porté par un collègue). */
  company: string
  /** La clé du collègue qui le travaille, dans {@link DEMO_COLLEAGUES}. */
  colleague: string
  label: string
  dueInDays: number
}[] = [
  {
    company: 'Société Générale',
    colleague: 'lea',
    label: 'Reprendre le cadrage du périmètre paiement analysé par Maëlle, avec la direction des achats',
    dueInDays: 5,
  },
]

/**
 * #4158.13 — L'ACTIVITÉ des collègues (`user_actions`), pour que le fil
 * d'activité de `/team` et le journal de l'espace montrent autre chose que
 * l'occupant. Des analyses terminées sur LEURS comptes : aucune de ces lignes
 * n'est sur un compte de l'occupant (rien ne ressemble à une collision de
 * prospection), et aucune ne porte de preuve d'envoi.
 */
export const DEMO_COLLEAGUE_ACTIVITY: readonly {
  colleague: string
  company: string
  action_type: string
  hours_ago: number
}[] = [
  { colleague: 'lea', company: 'Alstom', action_type: 'analysis_completed', hours_ago: 30 },
  { colleague: 'lea', company: 'Naval Group', action_type: 'analysis_completed', hours_ago: 52 },
  { colleague: 'karim', company: 'Bpifrance', action_type: 'analysis_completed', hours_ago: 21 },
  { colleague: 'karim', company: 'ADEO - Leroy Merlin', action_type: 'analysis_completed', hours_ago: 77 },
  { colleague: 'sophie', company: 'Kiabi', action_type: 'analysis_completed', hours_ago: 9 },
]

/**
 * Théo D team-activite.N2 (Louis 22/10/2026) — UN SUJET D'ÉQUIPE OUVERT, pour que « Équipe › Activité & échanges »
 * montre un échange à l'ouverture : un collègue (fictif, voir {@link DEMO_COLLEAGUES}) demande à l'occupant de
 * relire un point sur un compte de la salle. Aucune réponse n'est semée : répondre est un geste du visiteur.
 */
export const DEMO_TEAM_THREADS: readonly {
  /** La clé d'un collègue de {@link DEMO_COLLEAGUES}. */
  colleague: string
  /** Un compte de la salle. */
  company: string
  body: string
  hoursAgo: number
}[] = [
  {
    colleague: 'lea',
    company: 'Société Générale',
    body: 'Peux-tu relire les conditions du renfort Data avant mon échange avec la direction ? Le périmètre est clair ; il reste à confirmer le démarrage.',
    hoursAgo: 26,
  },
]

/**
 * Théo D team-recherches (Louis 22/10/2026) — LES RECHERCHES CONSERVÉES DE L'ÉQUIPE, semées pour que
 * « Équipe › Recherches » ne s'ouvre pas vide devant un prospect. Trois recherches Découvrir de
 * collègues et de l'occupant ; les analyses de compte de la page viennent des `analysis_runs` déjà
 * semés, rien à dupliquer ici. Les comptes sont NOS comptes de salle (jamais le monde fictif de la
 * maquette) ; `accounts` vide = « aucun compte du résultat n'est encore dans l'espace ».
 */
export const DEMO_TEAM_RESEARCH: readonly {
  /** `owner` = l'occupant ; sinon la clé d'un collègue de {@link DEMO_COLLEAGUES}. */
  author: string
  title: string
  scopeLabel: string
  filters: Record<string, unknown>
  resultCount: number
  accounts: readonly string[]
  daysAgo: number
}[] = [
  {
    author: 'lea',
    title: 'Banque & assurance · Lyon',
    scopeLabel: 'Lyon · Banque / Assurance · Clients finaux',
    filters: { city: 'Lyon', freetext: 'banque assurance' },
    resultCount: 2,
    accounts: ['BNP Paribas', 'Crédit Agricole'],
    daysAgo: 3,
  },
  {
    author: 'karim',
    title: 'Data & BI · Marseille',
    scopeLabel: 'Marseille · Tous secteurs · Data / BI · Clients finaux',
    filters: { city: 'Marseille', technologiesObserved: 'Data BI' },
    resultCount: 3,
    accounts: [],
    daysAgo: 6,
  },
  {
    author: 'owner',
    title: 'SAP · France',
    scopeLabel: 'France · Tous secteurs · SAP · Clients finaux',
    filters: { technologiesObserved: 'SAP' },
    resultCount: 8,
    accounts: ['Orange', 'SNCF', 'ENGIE'],
    daysAgo: 7,
  },
]

/**
 * #4189.8 (Louis 15/10/2026) — LE CONFLIT DE SYNCHRO CRM QUE LA SALLE MONTRE.
 *
 * Aucune ligne `crm_connections` / `sync_record_events` : un CRM n'est toujours pas branché en
 * démonstration (voir `demo-coverage.ts`, `crm_sync_cursors`). `CrmReadSyncService.status` rend,
 * pour une SALLE seulement, cette ligne FICTIVE marquée `demo: true` : une fiche contact dont
 * l'e-mail diffère entre Bellum (correction humaine, GARDÉE) et le CRM (PROPOSÉ, jamais appliqué).
 * La date est relative à l'appel — jamais une date figée qui vieillit.
 */
export function demoCrmReadStatus(now: Date): CrmReadStatus {
  const at = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  return {
    // #4189.8 — HubSpot : c'est le CRM que la salle montre « branché » (CRM fictif) ; la ligne de lecture suit.
    provider: 'hubspot',
    accountLabel: 'Démonstration',
    objects: ['accounts', 'contacts'],
    incremental: 'modified_at',
    lastSyncAt: at,
    lastError: null,
    conflicts: 2,
    // Théo D settings-integrations.N3 — l'onglet À relire montre NOS vrais comptes : le nom d'une société diffère entre
    // la valeur Bellum (gardée) et l'enregistrement du CRM (proposé). Aucune coordonnée de personne n'est inventée.
    conflictItems: [
      {
        entityType: 'account',
        entityLabel: 'Société Générale',
        field: 'company_name',
        bellumValue: 'Société Générale',
        crmValue: 'SOCIETE GENERALE SA',
        at,
      },
      {
        entityType: 'account',
        entityLabel: 'Orange',
        field: 'company_name',
        bellumValue: 'Orange',
        crmValue: 'Orange SA',
        at,
      },
    ],
    demo: true,
  }
}

/**
 * Théo D settings-integrations.N4 — l'historique des échanges de la salle : des opérations plausibles avec le CRM
 * fictif qu'elle présente « branché » (mêmes constantes que `demoCrmReadStatus`), marquées `demo`, dates relatives
 * à l'appel. Aucune table n'est semée : les lignes ne sont rendues que lorsque le journal réel est vide.
 */
export function demoCrmExchanges(now: Date): IntegrationExchange[] {
  const ago = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
  return [
    {
      id: 'demo-exchange-1',
      at: ago(2),
      provider: 'hubspot',
      kind: 'read',
      entityType: 'account',
      counts: { created: 0, updated: 38, skipped: 4, conflicts: 2 },
      result: 'to_review',
      detail: null,
      demo: true,
    },
    {
      id: 'demo-exchange-2',
      at: ago(20),
      provider: 'hubspot',
      kind: 'write',
      entityType: 'contact',
      counts: null,
      result: 'confirmed',
      detail: null,
      demo: true,
    },
    {
      id: 'demo-exchange-3',
      at: ago(26),
      provider: 'hubspot',
      kind: 'read',
      entityType: 'contact',
      counts: { created: 12, updated: 9, skipped: 0, conflicts: 0 },
      result: 'done',
      detail: null,
      demo: true,
    },
  ]
}

/**
 * 16/10/2026 — les CRM FICTIFS que la fenêtre « Envoyer vers … » liste en démonstration (craft rule n°9).
 *
 * Louis veut envoyer vers PLUSIEURS CRM : la salle en montre trois, pour que le prospect voie le choix —
 * deux accessibles en écriture (le premier est le principal, coché d'office) et un branché en lecture
 * seule, listé mais non cochable, avec sa raison. Aucune ligne `crm_connections`, aucun jeton : l'envoi
 * répond `demo-<empreinte>` sans réseau (`CrmWriteService.write`).
 */
export const DEMO_CRM_PUSH_TARGETS: ReadonlyArray<{
  provider: 'hubspot' | 'salesforce' | 'odoo'
  destination: string
  writable: boolean
  readOnlyReason: string | null
}> = [
  { provider: 'hubspot', destination: 'Bellum Conseil — CRM fictif', writable: true, readOnlyReason: null },
  { provider: 'salesforce', destination: 'Bellum Conseil — CRM fictif', writable: true, readOnlyReason: null },
  {
    provider: 'odoo',
    destination: 'Bellum Conseil — CRM fictif',
    writable: false,
    readOnlyReason: 'Branché en lecture seule : le droit d’écriture n’a pas été accordé à cet outil.',
  },
]

/**
 * #4349 V.2 (décision Louis 19/10) — LES COMPÉTENCES SANS PROFIL, semées (craft rule n°9).
 *
 * Trois besoins fictifs refusés faute de profil sur la MÊME compétence, dans la fenêtre du détecteur
 * (`MISSING_EXPERTISE_THRESHOLDS` : trois refus, 90 jours) : le bloc de Pilotage › Staffing s'affiche en
 * démo. Deux besoins sur trois portent un TJM et une durée, le troisième non — le montant dit ce qui
 * reste dehors, il ne devine rien. Sans projet (`project_id` NULL), comme `needWithoutProject`.
 */
export const DEMO_MISSING_EXPERTISE: Readonly<{
  skill: string
  needs: readonly {
    title: string
    refused_days_ago: number
    target_tjm_cents: number | null
    duration_months: number | null
  }[]
}> = {
  skill: 'Kubernetes',
  needs: [
    {
      title: 'Ingénieur plateforme Kubernetes — migration cloud',
      refused_days_ago: 12,
      target_tjm_cents: 75_000,
      duration_months: 6,
    },
    {
      title: 'SRE Kubernetes — fiabilisation des déploiements',
      refused_days_ago: 31,
      target_tjm_cents: 80_000,
      duration_months: 4,
    },
    {
      title: 'Architecte conteneurs Kubernetes — cadrage',
      refused_days_ago: 55,
      target_tjm_cents: null,
      duration_months: null,
    },
  ],
}

/**
 * #4688 — l'AFFICHAGE d'une connexion BoondManager branchée dans l'espace de démonstration.
 *
 * Aucune ligne n'est écrite dans `ats_connections` : un jeton fictif partirait en appel réel vers l'éditeur (voir
 * `demo-coverage.ts`). `AtsService.status` rend ceci pour un espace de démonstration — un prospect voit la carte
 * « branché » (instance, mode OAuth2, scopes, dernier échange), et aucune lecture ne part.
 * Tout est FICTIF et sert à la démonstration seule ; les scopes ne sont pas ceux d'un éditeur réel.
 *
 * LA SEULE définition de cette connexion : le panneau (`AtsService.status`) ET la carte de la grille (l'overlay de
 * `withDemoConnections`, lu par `/tools`) la consomment — c'est ce qui les empêche de se contredire (#4689).
 *
 * Les dates sont ancrées sur le début du JOUR (UTC), pas sur l'instant du rendu : un jeu de démonstration est figé.
 * Elles avancent d'un jour par jour et ne sont jamais dans le futur.
 */
export function demoAtsConnection(nowMs = Date.now()): {
  instanceLabel: string
  scopes: string
  lastExchangeAt: string
  connectedAt: string
  /** #4688.11 — un `meta.warnings` fictif, pour que « Vérifier la connexion » montre la ligne d'avertissement en démo. */
  warnings: string[]
} {
  const dayStartMs = nowMs - (nowMs % 86_400_000)
  return {
    warnings: ['appOauthRedirection'],
    instanceLabel: 'esn-demo.boondmanager.example',
    // #4691.3 — l'écran ne propose une écriture que si son scope est accordé : la démo accorde les deux d'écriture (fictifs).
    scopes: 'consultants:lecture besoins:lecture missions:lecture deliveries:write opportunities:write',
    lastExchangeAt: new Date(dayStartMs - 2 * 3_600_000).toISOString(),
    connectedAt: new Date(dayStartMs - 21 * 86_400_000).toISOString(),
  }
}

/**
 * #4996.4 (Louis 02/11) — la zone de BU du collègue fictif sur Société Générale : une BU DE LA SALLE
 * (`DEMO_BUSINESS_UNITS`, la banque va à « BU Banque & Assurance »), jamais un nom écrit à part. `seedTeamGuardrails`
 * la cherche par son nom dans `business_units` de l'espace ; absente, aucune zone n'est posée.
 */
export const DEMO_SG_ZONE_BUSINESS_UNIT: string = DEMO_BUSINESS_UNITS[1].name

/**
 * #4996 L7 — LA ZONE du collègue fictif sur Société Générale : les deux entités qui portent le plus de contacts
 * dans le dossier (à égalité, l'ordre alphabétique). DÉRIVÉE des libellés que les contacts portent déjà — comme les
 * entités du compte elles-mêmes (`seedAccount`) : aucune répartition inventée, aucun nom écrit à la main. Elle vit
 * ici, et non en SQL, parce que `contacts` ne se lit plus en SQL brut de plus (GA-405). Les libellés sont en
 * minuscules, sans espace de bord : `seedTeamGuardrails` les compare à `lower(btrim(account_entities.name))`.
 * Les autres entités du compte restent « hors de ton périmètre » pour ce collègue.
 */
export const DEMO_SG_ZONE_ENTITY_LABELS: readonly string[] = (() => {
  const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
  const counts = new Map<string, number>()
  for (const contact of sg?.contacts ?? []) {
    const label = (contact.entity ?? '').trim().toLowerCase()
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([label]) => label)
})()
