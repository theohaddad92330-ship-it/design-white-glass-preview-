/* ------------------------------------------------------------------ */
/*  Découvrir v2 — contrat de données partagé IA ↔ API ↔ Web.           */
/*  Miroir exact de `agent_docs/discover-v2-contract.md`. Toute         */
/*  divergence de champ casse l'assemblage des cinq lots parallèles.    */
/* ------------------------------------------------------------------ */

import type {
  CriteriaWidenedBy,
  DiscoverCandidate as DiscoverCandidateContract,
  DiscoverResponse as DiscoverResponseContract,
  DiscoverSkillEvidence,
  DiscoverSkillIntermediary,
  DiscoverSkillPendingEmployer,
  DiscoverZoneWidening,
  ZoneCeiling,
} from '@bellum/contracts'
import type { DiscoverCandidateZoneWithPlace } from './discover-zone-widening'
import type { OtherActorKind } from './discover-other-actors'
import type {
  ContextMode,
  DiscoverContractModel,
  DiscoverKnownNeed,
  DiscoverPerson,
  DiscoverSourceAxes,
  OffersVolume,
  SimilarityHeadline,
} from '@bellum/contracts'

/** Un signal « pourquoi maintenant ». La `date` est OBLIGATOIRE côté contrat :
 *  un signal sans date n'est pas un signal, c'est une impression. */
export interface DiscoverSignal {
  /** #3819 — `business` : une actualité commerciale HISTORISÉE du compte
   *  (projet, levée, contrat, nomination, presse…), servie par
   *  `POST /contacts/call-list` — jamais produite par les sources du registre. */
  type: 'tender' | 'award' | 'hiring' | 'legal' | 'tech' | 'business' | 'funding' | 'ecosystem'
  label: string
  date: string
  url?: string
  /**
   * #3928.1 — `true` quand `date` est la date de PREMIÈRE DÉTECTION d'un signal
   * historisé sans date propre (`discoverCallListSignalSchema.dateIsDetection`) :
   * le signal reste lisible, mais « un signal sans date n'est pas récent » — il
   * n'est jamais un « pourquoi maintenant ».
   */
  dateIsDetection?: boolean
  /**
   * #4068 — fait que l'ESPACE détient déjà (historique des signaux du compte,
   * servi par `POST /contacts/call-list`) : il ne périme pas sur la carte
   * (`classifyCardFact`). Jamais posé sur un signal de la recherche.
   */
  fromSpace?: boolean
  /** Ex. titulaire du marché (DECP) = concurrent en place. */
  detail?: string
  /**
   * #2165.46 — offre publiée par un cabinet POUR UN CLIENT (tome 2 §13). Le
   * signal reste affiché — mais il ne dit rien du besoin de l'employeur
   * nommé. Déclaré au contrat (`discoverSignalSchema.intermediated`) depuis
   * le tome 2 ; jamais mirroré ici avant ce lot, donc jamais atteint l'écran.
   */
  intermediated?: boolean
  /**
   * #2616.2 — l'employeur d'un signal `hiring` est-il un organisme PUBLIC
   * (catégorie juridique INSEE 7xxx) ? Déclaré au contrat
   * (`discoverSignalSchema.publicEmployer`) — mirroré ici pour que
   * `excludePublicEmployers` (`discover-filters.ts`) puisse le lire.
   * `undefined` tant que la catégorie juridique n'est pas résolue.
   */
  publicEmployer?: boolean
  /** #4045.1 — le signal recoupe un mot-clé de la recherche (posé par le serveur, un seul lexique). */
  keywordMatch?: boolean
  /** #4115 — la tranche où la grille de signaux (serveur) range ce fait : `strong` (5 au plus) ou `context` (10 au plus). Un rang, jamais une probabilité. */
  tier?: 'strong' | 'context'
  /**
   * #2616.1 — le CDI distinguable : `'CDI'` quand la source porte un code natif
   * VÉRIFIÉ qui s'y résout, `null`/`undefined` sinon — « non observé », jamais
   * deviné (ex. APEC, dont le code interne n'est pas lisible, ou une offre
   * trouvée par recherche publique). Seulement posé sur un signal `hiring`.
   */
  contractType?: 'CDI' | 'CDD' | 'INTERIM' | 'FREELANCE' | null
  /**
   * #3096 — la politique de télétravail de l'offre, seulement quand son TEXTE
   * la dit explicitement (`remote_policy.py`). `null`/`undefined` = non
   * évalué, jamais `'sur_site'` par défaut. Seulement posé sur un signal
   * `hiring`, même restriction que `contractType`.
   */
  remoteWorkPolicy?: 'sur_site' | 'hybride' | 'full_remote' | null
  /**
   * #3097 — la séniorité recherchée, seulement quand le titre ou le niveau
   * d'expérience affiché la dit (`seniority.py`). `null`/`undefined` = non
   * évalué, jamais deviné. Seulement posé sur un signal `hiring`.
   */
  seniority?: 'junior' | 'confirme' | 'senior' | null
  /**
   * #3097 — le libellé de salaire/TJM TEL QUE LA SOURCE L'AFFICHE — jamais
   * estimé. `null`/`undefined` quand la source ne l'affiche pas. Seulement
   * posé sur un signal `hiring`.
   */
  salaryLabel?: string | null
  /**
   * #3204 — la catégorie COMMERCIALE de l'offre (`hiring_signal.py`) :
   * toujours posée sur un signal `hiring` (le classifieur est total — un
   * code de contrat non vérifié rend `skill_demand_signal`, jamais un
   * silence). `null`/`undefined` sur les autres types de signal.
   */
  hiringSignalClass?:
    'internal_hiring' | 'contracting' | 'staffing_signal' | 'skill_demand_signal' | 'agency_posting' | null
  /**
   * #3203 — le delivery fit EXTERNE du compte (`delivery_fit.py`), DISTINCT
   * de `remoteWorkPolicy` ci-dessus qui lit la politique de télétravail des
   * SALARIÉS : les deux ne se déduisent jamais l'un de l'autre. `'unknown'`
   * par défaut, jamais `'compatible'` deviné d'un simple mot « remote ».
   * Seulement posé sur un signal `hiring`.
   */
  deliveryFit?: 'compatible' | 'potentially_compatible' | 'unknown' | 'incompatible' | null
  /**
   * #3237 (reste de #3203.4 — DELIVERY FIT, les treize axes) — le détail
   * ÉVALUÉ SÉPARÉMENT derrière le niveau composé `deliveryFit` ci-dessus
   * (`delivery_fit.py::classify_delivery_fit_axes`, jamais recalculé ici).
   * Rend TOUJOURS les treize clés quand posé (signal `hiring`/`tender`) —
   * `'unknown'` pour un axe non évaluable, jamais omis (un score n'est
   * jamais nu : ses axes, et ce qui n'a pas pu être évalué, sont nommés).
   * `undefined` sur les autres types de signal.
   */
  deliveryFitAxes?: Record<string, 'compatible' | 'potentially_compatible' | 'unknown' | 'incompatible'>
  /**
   * #3204.2 (épopée #3238) — les technologies EXPLICITEMENT nommées
   * (`tech_stack.py`). `undefined`/liste vide = aucune forme du catalogue
   * reconnue, jamais une pile devinée d'un intitulé générique.
   */
  technologies?: string[]
  /**
   * #3204.2 (épopée #3238) — la famille métier du TITRE (`job_family.py`).
   * `null`/`undefined` = titre muet sur la famille, jamais une famille par
   * défaut.
   */
  jobFamily?: string | null
  /**
   * #3204.2 (épopée #3238) — le nom de l'équipe, seulement quand un marqueur
   * explicite l'introduit (`job_context.derive_team`). `null`/`undefined`
   * sinon.
   */
  team?: string | null
  /**
   * #3204.2 (épopée #3238) — la fonction de rattachement hiérarchique,
   * seulement quand un marqueur explicite l'introduit
   * (`job_context.derive_reporting_line`). `null`/`undefined` sinon — RÈGLE
   * de la spec : un intitulé ne suffit pas à identifier le décideur.
   */
  reportsTo?: string | null
  /**
   * #3204.2 (épopée #3238) — l'offre est-elle encore ouverte ? Même fenêtre
   * de fraîcheur que le type « recrutement » (`signal_freshness.py`, GA-26).
   * `null`/`undefined` = date non exploitable, jamais affirmé.
   */
  stillOpen?: boolean | null
  /**
   * #3204.2 (épopée #3238) — combien d'AUTRES offres de la MÊME famille
   * métier ce même employeur a publié dans cette moisson. `undefined`/`null`
   * = non compté (signal non `hiring`).
   */
  similarOfferCount?: number | null
  /**
   * #3205.1 (épopée #3239) — un prestataire TIERS explicitement mentionné
   * dans le texte de l'offre (`provider_mention.py`), jamais l'employeur
   * lui-même. `null`/`undefined` = aucun marqueur de partenariat, jamais un
   * nom deviné.
   */
  thirdPartyProviderMention?: string | null
  /**
   * #3204.2 (épopée #3238, reste) — la ville EXACTE du site qui a publié CE
   * signal (`row.city`, le fait brut de la source), DISTINCTE du nom déjà
   * résolu pour l'entreprise : un employeur multi-sites peut publier des
   * offres dans des villes différentes sans que le nom résolu du groupe ne
   * les distingue. `null`/`undefined` = la source n'affiche pas de ville
   * pour cette ligne, jamais devinée.
   */
  siteCity?: string | null
  /**
   * #3204.7 (épopée #3238, reste du 30/09) — `true` seulement quand LE TEXTE
   * de CETTE offre nomme explicitement un départ/une succession. `false`/
   * `undefined` = non mesuré ou aucun marqueur — jamais deviné d'un volume
   * d'offres. Seulement posé sur un signal `hiring`.
   */
  replacementSignal?: boolean
  /**
   * #4182 (EX-12) — « qui demande ce profil ? », composé par le serveur à partir du SEUL texte de
   * l'offre (`offer_requester.py`). `undefined` = non composé (signal non `hiring`).
   */
  requester?: DiscoverOfferRequester
}

/** #4182 — l'auteur de l'annonce, DISTINCT du manager possible. `non_precise` = le texte ne le dit pas. */
export type DiscoverOfferAuthorKind = 'rh' | 'cabinet' | 'non_precise'

/** #4182 — les étapes de qualification, en codes : le texte vit dans le lexique (`discover:needs.requester.method`). */
export type DiscoverRequesterMethodStep =
  'lire_offre' | 'fonction_rh_nomme_auteur' | 'chercher_fonction_operationnelle' | 'demander_au_premier_interlocuteur'

export interface DiscoverOfferRequester {
  author: DiscoverOfferAuthorKind
  /** La fonction de rattachement NOMMÉE par l'offre, jamais une fonction RH ; `null` = non écrite. */
  possibleManagerFunction: string | null
  team: string | null
  /** L'entité visée : le site de l'offre, jamais le groupe. `null` = site non publié. */
  city: string | null
  /** `etaye` = écrit dans l'offre ; `a_identifier` = un rôle à identifier, avec sa méthode. */
  status: 'etaye' | 'a_identifier'
  method: DiscoverRequesterMethodStep[]
}

/**
 * #3204.6/.7 (épopée #3238) — une synthèse MULTI-SIGNAUX sur plusieurs (ou
 * une seule) offres `hiring` du même candidat, qui CITE les offres qui la
 * soutiennent — jamais une conclusion sans preuve.
 */
export interface DiscoverAggregatedSignal {
  aggregateClass: 'team_growth_signal' | 'replacement_signal'
  jobFamily: string
  supportingOffers: { label: string; date: string }[]
  /** En français, explicable tel quel — jamais un code à décoder. */
  reason: string
}

/** Une composante du score, rendue telle quelle dans la carte : un score que le
 *  commercial ne peut pas auditer est un score qu'il n'utilisera pas. */
export interface DiscoverScoreFactor {
  label: string
  /** Contribution SIGNÉE au score (peut être négative). */
  points: number
  evidence?: string
  /** Le bloc du barème d'où vient ce facteur. Optionnel : un instantané
   *  d'AVANT le déploiement qui l'a ajouté ne le porte pas, et l'écran se
   *  replie alors sur la reconnaissance par libellé. */
  block?: ScoreCriterion
  /** Le CODE stable qui remplace `label` à l'écran. Optionnel, à dessein : un
   *  candidat produit par une IA plus ancienne — ou lu depuis le cache — ne le
   *  porte pas, et l'écran retombe sur `label`. */
  label_key?: string
  /** Les valeurs interpolées dans la traduction de `label_key`. */
  label_params?: Record<string, string | number>
}

/** Les HUIT blocs du barème backend (`app/services/discover_scoring.py`). Un
 *  bloc listé dans `scoreUnmeasured` n'a pas été évalué faute de donnée.
 *  Le commentaire disait « cinq » alors que la liste en portait déjà huit. */
export const SCORE_CRITERIA = [
  'activity',
  'geography',
  'headcount',
  'age',
  'it_surface',
  'signals',
  'accessibility',
  'evidence',
] as const
export type ScoreCriterion = (typeof SCORE_CRITERIA)[number]

export interface DiscoverSuggestedRole {
  title: string
  department: string
}

export interface DiscoverSource {
  name: string
  url?: string
  fetchedAt: string
}

/**
 * État portefeuille, résolu côté API (jamais deviné côté web).
 *
 * ⚠️ Ce fichier est un MIROIR du contrat partagé, et un miroir se désynchronise.
 * C'est exactement le piège qui a cassé l'écran Missions le 19/08 : deux types
 * du même nom, un de chaque côté du fil, chacun cohérent avec lui-même. Toute
 * valeur ajoutée à `discoverPortfolioStateSchema` dans `@bellum/contracts` doit
 * l'être ici aussi — d'où le `satisfies` ci-dessous, qui fait tomber le
 * compilateur si les deux listes divergent.
 */
export type DiscoverPortfolioState = 'new' | 'analyzed' | 'watched' | 'customer' | 'parked'

export interface DiscoverCandidate {
  /* --- REGISTRE (factuel, jamais inventé) --- */
  name: string
  /** OBLIGATOIRE. Pas de SIREN = candidat écarté (voir `normalizeCandidate`). */
  siren: string
  nafCode: string | null
  /**
   * #2265.14 — « jamais un intermédiaire présenté comme client final sans
   * badge » : `true` quand ce candidat est un cabinet de recrutement ou une
   * plateforme de mise en relation qui publie POUR un tiers, jamais le client
   * final lui-même. `undefined` = réponse d'avant ce déploiement.
   */
  isIntermediary?: boolean
  /** #3757 — `true` pour une ESN (concurrente ou partenaire rang 2 potentiel), jamais un client final. */
  isEsnPeer?: boolean
  /** #4746.2 — la pastille d'« Autres acteurs » ; absent = client final ou nature non prouvée (reste dans « Comptes »). */
  actorKind?: OtherActorKind
  /** Lot T — le motif d'une ESN reconnue hors NAF : référentiel ou offres. Absent = NAF, ou non reconnue. */
  esnRecognition?: 'referential' | 'offers' | null
  /** #3757 (reste) — `true` pour un SIREN que CET espace a déclaré partenaire
   *  (fait réel, `partner_relations`) : `isEsnPeer` est alors TOUJOURS `false`. */
  isDeclaredPartner?: boolean
  sector: string | null
  /** #4358.4 — d'où vient le secteur affiché ; absent = rien à dire (jamais deviné). */
  sectorBasis?: 'naf' | 'declared_activity' | 'website'
  city: string | null
  department: string | null
  headcountRange: string | null
  creationDate: string | null
  /**
   * #3877.4 — le nombre d'ÉTABLISSEMENTS de ce compte (registre,
   * `establishmentCount` déjà calculé par `apps/ia/app/routers/discover.py`,
   * jusqu'ici jeté avant l'écran). `null`/`undefined` = non mesuré, JAMAIS
   * confondu avec « un seul établissement » : la déduplication des candidats
   * se fait par SIREN (un compte = une ligne, voir `normalizeDiscoverResponse`),
   * ce champ est ce qui permet à l'écran de dire, SANS gonfler le nombre de
   * comptes, qu'un compte donné tient plusieurs sites. Optionnel (comme
   * `isIntermediary`/`isEsnPeer` ci-dessus) : un instantané d'avant ce lot, ou
   * une fixture de test qui ne le pose pas, reste un candidat valide.
   */
  establishmentCount?: number | null
  /**
   * #3705.5 — rattachement à un groupe, SOURCÉ. `capital_link` = société mère connue (fait) ;
   * `legal_entity_officer` = une personne morale dirige la société (indice, jamais une preuve).
   * Absent = on n'a rien à dire : ni « indépendante », ni ligne vide.
   */
  groupLink?: { kind: 'capital_link' | 'legal_entity_officer'; entities: string[] }
  /**
   * #4892.1 — regroupement de MARQUE proposé (même nom, même ville, SIREN distincts) : la tête liste ses entités,
   * un membre nomme sa tête. Affichage seulement — jamais une fusion de données. Absent = rien à dire.
   */
  brandGroup?:
    | { role: 'head'; members: { siren: string; name: string; city?: string | null; headcountRange?: string | null }[] }
    | { role: 'member'; headSiren: string; headName?: string | null }
  /**
   * #3983.1 — siège / implantation dans la zone demandée, tels que le registre
   * public les PROUVE. Absent sans zone, ou quand le registre ne prouve rien
   * (jamais « 0 établissement »). Aucun effectif local : la source ne le publie
   * pas, et on ne l'invente pas.
   */
  /** #4429.4 — le palier de zone d'un compte élargi (« à 38 km de Toulouse ») ; absent sur un exact. */
  zone?: DiscoverCandidateZoneWithPlace
  geography?: {
    basis: 'headquarters' | 'establishment'
    headquarters: { city: string | null; department: string | null }
    siteCount: number
    sites: { siret: string | null; city: string | null; department: string | null; region: string | null }[]
    zoneRegion: string | null
  }

  /* --- CALCULÉ (déterministe, explicable) --- */
  /** `null` = aucun critère n'était évaluable. À rendre « score indisponible »,
   *  JAMAIS `0` : « on n'a rien pu mesurer » et « ce compte ne correspond à
   *  rien » sont deux affirmations opposées, et les confondre est ce qui
   *  affichait « 0/100 » sur toute la liste. */
  score: number | null
  /** Dénominateur réel du badge (plafonds des seuls blocs mesurés). `null`
   *  quand il n'y a pas de score du tout. */
  scoreMax: number | null
  /** Blocs du barème sans donnée — affichés tels quels plutôt que notés zéro. */
  scoreUnmeasured: ScoreCriterion[]
  scoreFactors: DiscoverScoreFactor[]
  /** Le SECOND nombre (tome 1 §6.4) : « peux-tu y entrer ? ». Optionnel — un
   *  instantané d'avant ce déploiement ne le porte pas. */
  addressability?: {
    score: number | null
    max: number
    unmeasured: string[]
    factors: (DiscoverScoreFactor & { axis: string })[]
  }
  /**
   * La barrière d'ACHAT estimée (tome 3) — le TROISIÈME nombre, qui ne se fond
   * ni dans l'intérêt ni dans l'accès. `null` quand moins de trois proxies sont
   * mesurables : « non estimable » est une réponse, « classe A » n'en serait
   * pas une.
   */
  barrier?: {
    score: number | null
    accessibility: number | null
    access_class: 'A' | 'B' | 'C' | 'D' | null
    label: string | null
    proxies: { key: string; contribution: number; evidence: string; measurable: boolean }[]
    measurable: boolean
    missing: string[]
    corrections: { key: string; delta: number; label: string; evidence: string }[]
  } | null
  signals: DiscoverSignal[]
  /**
   * #3204.6/.7 (épopée #3238) — un raisonnement MULTI-SIGNAUX sur les offres
   * `hiring` ci-dessus : `team_growth_signal` (au moins deux offres de la
   * même famille métier, citées) ou `replacement_signal` (une offre dont le
   * texte nomme explicitement un départ). `undefined`/liste vide = aucun
   * ensemble ne dépasse le seuil de sa propre règle — jamais deviné.
   */
  aggregatedSignals?: DiscoverAggregatedSignal[]
  /**
   * Décision 1 (18/09/2026) — `true` SEULEMENT quand la recherche a
   * réellement interrogé les sources datées pour ce candidat (les premières
   * lignes rendues, en nombre borné). `false`/absent = candidat non ciblé —
   * `signals` reste `[]` mais ce n'est PAS une mesure : l'écran doit dire
   * « non mesuré », jamais « aucun signal » (GA-18/19).
   */
  signalsSearched?: boolean
  /** #4677 — `pending` = signaux en cours (arrière-plan) ≠ `none` = cherché, rien ≠ `unavailable` = source muette. */
  signalsState?: 'pending' | 'none' | 'unavailable'
  /** #4284.26 — ses seules offres sont hors des métiers de l'espace : gardé, rangé plus bas, l'écran le dit. */
  outOfTrade?: boolean
  /** Second axe : à quel point la donnée sous-jacente est sûre (0-100). */
  dataConfidence: number | null

  /* --- SUGGÉRÉ (LLM, étiqueté comme tel côté UI) --- */
  angle: string | null
  suggestedRoles: DiscoverSuggestedRole[]

  /**
   * #2544.2 — LES PERSONNES QU'UNE SOURCE A NOMMÉES.
   *
   * À ne pas confondre avec `suggestedRoles` juste au-dessus : celui-là liste
   * des FONCTIONS écrites par un modèle, celui-ci des personnes PUBLIÉES, avec
   * la provenance et la date de chaque fait. Le type vient du contrat partagé
   * (`@bellum/contracts`) plutôt que d'être recopié ici : c'est lui qui refuse
   * qu'un lieu de travail soit attribué au registre public, et une copie
   * locale perdrait ce refus au premier oubli.
   *
   * Optionnel : une réponse d'avant ce déploiement n'a pas la clé, et l'écran
   * se comporte alors exactement comme avant.
   */
  people?: DiscoverPerson[]

  /* --- QUALIFICATION (déterministe, avant le score) --- */
  /**
   * Le verdict du conseil de qualification : cette ligne représente-t-elle une
   * organisation à laquelle une ESN peut vendre ?
   *
   * Il vient AVANT le score et le domine : un « à vérifier » bien noté reste en
   * dessous d'un « recommandé » moins bien noté, parce que le score mesure
   * l'intérêt commercial et le verdict dit si la ligne est une cible.
   *
   * Optionnel : une réponse produite avant cette fonctionnalité n'en a pas, et
   * l'écran doit alors se comporter exactement comme avant.
   */
  qualification?: DiscoverQualification

  /* --- ÉTAT PORTEFEUILLE (résolu côté API) --- */
  portfolioState: DiscoverPortfolioState
  /** Motif et date de l'écartement à la porte G1, quand il y en a un. */
  parkedReason?: string | null
  parkedAt?: string | null
  accountId: string | null
  /** #2166.1 — le logo, SEULEMENT quand ce candidat est déjà un compte possédé
   *  de l'espace (apparié sur le SIREN). Jamais deviné depuis le nom. Absent =
   *  candidat pas encore possédé, l'écran retombe sur la pastille à initiale. */
  logoUrl?: string | null
  website?: string | null
  /** #2165.24 / #2166.3 / #2165.16 — même règle que `logoUrl` ci-dessus :
   *  SEULEMENT quand ce candidat est déjà un compte possédé qui porte un lien
   *  capitalistique résolu. `undefined` = candidat pas encore possédé,
   *  `null` = compte possédé sans lien connu — l'écran écrit « non renseigné »,
   *  jamais vide trompeur. */
  groupRole?: 'groupe' | 'filiale' | null
  groupHeadSiren?: string | null
  /** #4294.7 — « Déjà travaillée » : SEULEMENT à `true`, quand le compte de l'espace porte une relation ou une
   *  mission passée (calculé à la lecture par l'API). Absent = pas travaillé, ou lecture indisponible. */
  workedBefore?: true

  /**
   * #3819.1 — « besoins connus », SEULEMENT pour un compte déjà possédé
   * (résolu en une requête groupée, `DiscoverPortfolioService.resolveKnownNeeds`).
   * `0` est un fait MESURÉ (compte possédé, aucun besoin ouvert), jamais une
   * absence. `undefined` = candidat neuf (rien à connaître), requête en échec
   * (« non cherché »), ou réponse d'avant ce déploiement.
   */
  knownNeedsCount?: number

  /** #4068 — les besoins connus EUX-MÊMES (les plus récents) : la carte en montre au moins un. */
  knownNeeds?: DiscoverKnownNeed[]

  /**
   * #4067 — ce que l'ESPACE sait déjà de ce candidat (historique des signaux,
   * CRM, mémoire marché, référentiel, Drive, missions / vivier), en axes
   * nommés. Pèse dans le tri (`discoverRankRatio`) et nourrit la ligne
   * « Pourquoi ». Absent = réponse d'avant ce déploiement : classement d'avant.
   */
  sourceAxes?: DiscoverSourceAxes

  /**
   * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE.
   *
   * Seul `kind: 'sector'` arrive sur ce chemin (NAF exact contre le
   * portefeuille) : `twin`/`tech` restent le panneau « Similaires » de la
   * fiche compte. `undefined` = candidat déjà possédé, secteur NAF non
   * apparié, ou réponse d'avant ce déploiement — jamais deviné.
   */
  similarityHeadline?: SimilarityHeadline
  /** DISCOVER-OFFRES (15/10) — « N offres en France sur 90 jours » (aperçu gratuit, additionné par domaine). Absent = aucune ligne, jamais « 0 ». */
  offersVolume?: OffersVolume
  /** #3408 — pile OBSERVÉE par la mémoire marché ; nourrit le « Périmètre conseillé » quand aucune offre ne nomme de techno. */
  technologiesObserved?: string[]
  /** COMPETENCE-TROUVE — « N offres <compétence> » + la plus récente : la preuve qu'il recrute dessus. Absent = aucune ligne. */
  skillEvidence?: DiscoverSkillEvidence
  /** #4433 — remonté par élargissement (moins de 10 exacts) : « proche : JavaScript ». Absent = résultat exact. */
  widenedBy?: CriteriaWidenedBy
  /** #4430 — ajouté à une recherche par compétence maigre par une collecte d'offres fraîche. */
  skillFreshFill?: boolean
  /** #4430 — offres lues dans le cache commun : la date de leur collecte (AAAA-MM-JJ). Absent = aucune ligne. */
  jobsAsOf?: string
  /** #4791.2 / #4762.1 — le besoin DATÉ observé chez ce compte (« Besoin Java, mars 2025 »). Absent = aucune ligne. */
  observedNeed?: DiscoverCandidateContract['observedNeed']
  /** #4793.1 — entré dans la liste par la base COMMUNE (jamais un fournisseur nommé). Absent = venu du registre. */
  fromCommonBase?: boolean
  /** #4437 — ajouté par le palier voisin d'un signal maigre : pourquoi il est là. Absent sur l'exact. */
  widenedFrom?: DiscoverCandidateContract['widenedFrom']

  /** #2291.2 — comment cette entreprise CONTRACTUALISE, observé sur ses offres
   *  d'emploi et ses avis de marchés publics (type du contrat partagé, jamais
   *  recopié). Absent = jamais cherché ; `null` = cherché, non observé — les
   *  deux restent « non observé » à l'écran, jamais une préférence déduite. */
  contractModel?: DiscoverContractModel | null

  sources: DiscoverSource[]
}

/** Verdict de qualification d'un candidat + la raison qui l'a produit. */
export interface DiscoverQualification {
  verdict: 'recommended' | 'to_verify' | 'excluded'
  /** Identifiant STABLE de la raison (`natural_person`, `no_employees`…) : c'est
   *  lui que l'écran traduit et sur lequel on peut filtrer. */
  code: string | null
  reason: string
  /** Les autres doutes relevés sur la même ligne. */
  otherCodes: string[]
  /** #4358.4 — le secteur demandé est lu par l'ACTIVITÉ ou le SITE de l'entreprise (NAF flou) : nommé à l'écran. */
  sectorAttachment?: { sector: string; via: 'activity' | 'site' }
  /** #3983.1 — filiales retenues d'une holding écartée (code `holding_subsidiary_in_zone`). */
  subsidiaries?: Array<{ name: string }>
}

/** Une source injoignable / sans clé / hors quota. Non négociable : elle est
 *  rendue à l'écran, jamais avalée en silence. */
export interface DiscoverDegradedSource {
  source: string
  reason: string
  /** Combien d'entreprises l'entrée concerne, quand le backend le sait. */
  count?: number
  /** Nature de l'entrée — permet de la CADRER sans lire la phrase française :
   *  `capability` (la source a répondu, plus LARGE que demandé), `no-match`
   *  (elle a répondu « rien ne correspond »), `not-examined` (borne de
   *  couverture : rien n'a été jugé), `ambiguous` (examinée puis rejetée),
   *  `unreachable` (registre muet). **Absent = panne** — défaut fail-loud. */
  kind?: string
  /** Les VALEURS que la raison désigne, quand elle en désigne. Absent plutôt que
   *  deviné. Deux emplois aujourd'hui :
   *  - `kind: 'capability'` — QUELS critères la source n'a pas su exprimer, dans
   *    le vocabulaire d'écran (`sector`, `city`) ;
   *  - `unknown_sector` (#2469) — les libellés de secteur refusés, que l'écran
   *    recompose dans sa phrase. Ils arrivaient avant NOYÉS dans une phrase
   *    française construite côté IA, donc ni traduisibles ni accordables. */
  fields?: string[]
}

/** Ce que la recherche a réellement couvert.
 *
 *  La résolution SIREN est bornée par nécessité : l'API coupe l'appel à 45 s et
 *  120 résolutions coûtent 85 à 144 s de file d'attente derrière le limiteur du
 *  registre. Sans ce bloc, l'écran affichait un nombre de résultats sans dire
 *  combien d'entreprises n'avaient tout simplement jamais été regardées — un
 *  « 3 résultats » qui se lit comme un fait de marché alors que c'est un fait de
 *  budget. */
export interface DiscoverCoverage {
  /** Entreprises distinctes sorties de la moisson. */
  candidatesFound: number
  resolutionsAttempted: number
  resolved: number
  /** Examinées PUIS rejetées : plusieurs entités portent ce nom. */
  rejectedAmbiguous: number
  /** Examinées, registre muet — une panne, pas un fait sur l'entreprise. */
  rejectedUnreachable: number
  /** JAMAIS examinées. Ni retenues, ni écartées : non regardées. */
  notExamined: number
  /** #4319.2 — les noms des entreprises détectées mais non identifiées : l'écran les LISTE. */
  notIdentifiedNames?: string[]
  /** `complete` | `max-resolutions` | `time-budget`. */
  stoppedOn: string
  resolveOffset: number
  hasMore: boolean
  /** #4746.6 — résolues puis retirées par le filtre « Clients finaux ». Absent = non mesuré (jamais 0). */
  filteredByEntityType?: number
}

/**
 * #2489.3/D1 (décision Louis, 18/09/2026 après-midi) — la cible déclarée du
 * profil ESN filtre Découvrir par défaut. Le compteur n'est PAS décoratif :
 * `applied: false` (bouton « chercher hors de ma cible » actionné) et
 * `applied: true, excludedCount: 0` (le filtre a tourné et n'a rien écarté)
 * sont deux affirmations DIFFÉRENTES. `undefined` sur
 * `DiscoverResponse.targetSectorFilter` est la TROISIÈME lecture : l'espace
 * n'a déclaré aucune cible, il n'y a rien à écarter (GA-18/GA-19).
 */
export interface DiscoverTargetSectorFilter {
  applied: boolean
  excludedCount: number
  /** Les secteurs CANDIDATS écartés (jamais les secteurs cibles déjà connus
   *  de l'utilisateur) — le POURQUOI mesuré en prod le 18/09. */
  excludedSectors: string[]
}

/**
 * #4361.2 — ce que « Exclure les sociétés cotées » a fait. Absent quand l'interrupteur n'est pas
 * posé. `unknownCount` = les comptes RESTÉS dont la cotation n'est pas établie : on prouve
 * « cotée », jamais « non cotée ». `sourceAvailable: false` = rien n'a pu être vérifié, rien retiré.
 */
export interface DiscoverListingFilter {
  applied: boolean
  excludedCount: number
  unknownCount: number
  sourceAvailable: boolean
}

export interface DiscoverResponse {
  candidates: DiscoverCandidate[]
  /** Lot 786 (#5203) — combien de cartes le filtre « Besoins connus » a retirées ; absent = aucune. */
  needsFilteredOut?: number
  /** Lot Q — la liste est déjà affichée ; un second passage la complète en arrière-plan (jamais bloquant). */
  completing?: boolean
  /** #4363.3 — `true` = PREMIER LOT seulement : la liste complète arrive et prendra sa place (ordre possiblement changé). */
  partial?: boolean
  /** Critères normalisés EFFECTIVEMENT appliqués par le backend. */
  query: Record<string, unknown>
  degraded: DiscoverDegradedSource[]
  /** `null` quand le backend ne le renvoie pas encore. */
  coverage: DiscoverCoverage | null
  /** Le tri PROPOSÉ d'entrée, déduit de la maturité déclarée de l'ESN (§8.3).
   *  Absent d'un backend antérieur — l'écran retombe alors sur l'intérêt. */
  recommendedSort?: 'interest' | 'addressability' | 'balanced'
  /** #2489.3/D1 — absent quand l'espace n'a déclaré aucun secteur cible. */
  targetSectorFilter?: DiscoverTargetSectorFilter
  /** #4361.2 — absent quand « Exclure les sociétés cotées » n'est pas posé. */
  listingFilter?: DiscoverListingFilter
  /** #4429.4 — la ville seule rendait trop peu de comptes : le palier appliqué, écrit au-dessus
   *  de la liste. Absent quand rien n'a été élargi. */
  zoneWidening?: DiscoverZoneWidening
  /** #4045 — des cartes n'ont pas pu être cherchées dans le budget : leur collecte finit
   *  en arrière-plan (cache partagé). L'écran relit UNE fois, ~20 s plus tard. */
  jobsPending?: boolean
  /** COMPETENCE-TROUVE — cabinets et ESN qui recrutent sur la compétence : une section repliée, à part. */
  skillIntermediaries?: DiscoverSkillIntermediary[]
  /** #4674 — employeurs prouvés par une offre, identité en cours : sans SIREN, donc sans action. */
  skillPendingEmployers?: DiscoverSkillPendingEmployer[]
  /** #4437 — le palier voisin d'un recrutement qualifié maigre ; absent quand rien n'a été élargi. */
  widening?: DiscoverResponseContract['widening']
}

/* ------------------------------------------------------------------ */
/*  Requêtes                                                           */
/* ------------------------------------------------------------------ */

/** Tranche d'effectif proposée à l'écran. Elle est traduite en
 *  `headcountMin`/`headcountMax` pour l'API, et revient telle quelle dans
 *  `DiscoverCandidate.headcountRange`. */
export const HEADCOUNT_RANGES = ['any', '1-9', '10-49', '50-249', '250-999', '1000+', '250-4999'] as const
export type HeadcountRange = (typeof HEADCOUNT_RANGES)[number]

/** #3908 — les tranches COCHABLES du rail (cumul) : `'any'` n'en fait pas
 *  partie — il n'est pas une tranche, c'est l'absence de toute tranche cochée. */
export const HEADCOUNT_RANGES_SELECTABLE = HEADCOUNT_RANGES.filter(
  // #4361.1 — `250-4999` est la borne du préréglage « Middle market », pas une tranche à cocher :
  // la proposer à côté de 250-999 et 1000+ ferait deux fois le même réglage (GA-26).
  (range): range is Exclude<HeadcountRange, 'any' | '250-4999'> => range !== 'any' && range !== '250-4999',
)

/** Bornes numériques (min, max) d'un libellé de tranche registre, ou `null`.
 *  « 100 à 199 salariés » → [100, 199] ; « 200+ salariés » → [200, ∞].
 *
 *  Ici (plutôt que `discover-filters.ts`, qui l'exporte toujours) : ce fichier
 *  n'importe rien de `discover-ranking.ts`, qui en a aussi besoin pour le tri
 *  « Taille » (#3814) — `discover-filters.ts` IMPORTE déjà `discover-ranking.ts`,
 *  et le faire tourner dans l'autre sens créerait une dépendance circulaire. */
export function parseHeadcountLabel(label: string | null): [number, number] | null {
  if (!label) return null
  const numbers = (label.match(/\d[\d\s ]*/g) ?? []).map(n => Number(n.replace(/[\s ]/g, '')))
  if (numbers.length === 0) return null
  // #3814 — recette prod 08/10 : la borne BASSE est le PREMIER nombre du
  // libellé, celui que « X à Y salariés » / « X salariés et plus » publient
  // TOUJOURS en tête — jamais le plus petit trouvé n'importe où dans le
  // texte (`Math.min`, aveugle à un chiffre qui traînerait ailleurs : une
  // note, un code). Une tranche numérique se LIT à sa place, elle ne se
  // devine pas en fouillant toute la chaîne.
  const low = numbers[0]!
  if (/(\+|\bet\s+plus\b|\bou\s+plus\b)/i.test(label)) return [low, Infinity]
  // Même raison pour la borne HAUTE : le SECOND nombre de « X à Y salariés »,
  // jamais le plus grand trouvé n'importe où (un chiffre qui traînerait
  // ailleurs — une année, une note — ferait lire une tranche plus large
  // qu'elle ne l'est).
  return [low, numbers[1] ?? low]
}

/**
 * #4436.3 — l'effectif qu'une carte peut ÉCRIRE, ou `null` (« taille non publiée »). Recette prod 23/10 : la
 * source nationale livrait le libellé déjà écrit (« 0 salarié », « 0 à 0 salariés ») — un effectif nul n'est pas
 * mesuré, il ne s'affiche jamais « 0 » (GA-18/19). Même règle que `displayable_headcount` côté IA.
 */
export function publishedHeadcount(label: string | null | undefined): string | null {
  const text = label?.trim() ?? ''
  if (!text || /\b(?:pas\s+de|aucun|sans)\s+salari|non\s+employeu/i.test(text)) return null
  const bounds = parseHeadcountLabel(text)
  return bounds && bounds[1] === 0 ? null : text
}

/**
 * Ancienneté de l'entreprise, traduite en `createdAfter` / `createdBefore`.
 *
 * #3941.1 — `lt8` s'ajoute aux trois tranches historiques : huit ans est le
 * seuil RÉEL du statut Jeune Entreprise Innovante (CGI art. 44 sexies-0 A),
 * pas un chiffre deviné pour les besoins du filtre « Startup » (voir
 * `STARTUP_SEGMENT` ci-dessous). Additive, comme le reste de ce fichier.
 */
export const COMPANY_AGE_BUCKETS = ['any', 'lt3', '3to10', 'lt8', 'gt10'] as const
export type CompanyAgeBucket = (typeof COMPANY_AGE_BUCKETS)[number]

/** #2165.24 — rôle capitalistique demandé au rail. Aucune source (registre,
 *  signaux) ne l'exprime : croisé côté écran sur `DiscoverCandidate.groupRole`
 *  (`applyRailConstraints`), dans les deux modes. */
export const GROUP_ROLE_OPTIONS = ['any', 'groupe', 'filiale'] as const
export type GroupRoleOption = (typeof GROUP_ROLE_OPTIONS)[number]

/**
 * #2642.2 — un CERCLE autour de `city`, en kilomètres. `'any'` = pas de
 * contrainte. L'API du registre refuse au-delà de 50 km : #4641 — 100 km
 * (`DISCOVER_MAX_CITY_RADIUS_KM`, `@bellum/contracts`) est servi par le
 * service IA en sept cercles de 50 km, jamais envoyé tel quel au registre.
 */
export const CITY_RADIUS_OPTIONS = ['any', '10', '25', '50', '100'] as const
export type CityRadiusOption = (typeof CITY_RADIUS_OPTIONS)[number]

/**
 * Louis 01/11/2026 (#4515, RÉVISE #4641 du 27/10 : 100 km, qui révisait #4515.1 : 25 km) — une ville seule cherche à
 * 25 km PAR DÉFAUT, partout où une ville se saisit (rail, recherche libre, tuiles, Laura côté IA), affiché et
 * modifiable. « Ville exacte » (`any`), 10, 50 et 100 km restent des choix explicites. L'élargissement AUTOMATIQUE
 * du service IA (#4429 / #4675 : 100 km, département, région ; jamais le pays : #4640) part de ce rayon-là, jamais
 * d'un rayon choisi (`DEFAULT_CITY_RADIUS_KM`, `zone_tiers.py`).
 */
export const DEFAULT_CITY_RADIUS_KM: CityRadiusOption = '25'

/**
 * #3983.2 (#3705.3) — la BASE d'une zone département/région : `presence` = au
 * moins un établissement ACTIF y est (ce que le registre fait déjà, le défaut) ;
 * `headquarters` = le SIÈGE y est. Sans zone, sans effet.
 */
export const SITE_BASIS_OPTIONS = ['presence', 'headquarters'] as const
export type SiteBasisOption = (typeof SITE_BASIS_OPTIONS)[number]

/** Filtres de `POST /ia/discover/registry` (champ `filters` du corps). */
/**
 * ⚠️ MIROIR À LA MAIN du contrat partagé (`discoverRegistryFiltersSchema`).
 *
 * Il avait silencieusement divergé : six critères existaient au contrat, à
 * l'API et au service IA, et manquaient ici — donc l'écran ne pouvait pas les
 * envoyer, sans qu'aucun type ne s'en plaigne. C'est
 * `discover-types-mirror-the-contract.test.ts` qui rend cette divergence
 * ROUGE : il lit les clés du schéma zod et exige qu'elles soient toutes ici.
 */
export interface DiscoverRegistryFilters {
  sector?: string
  /** Secteurs croisés — le registre est interrogé une fois par secteur côté
   *  backend, puis les listes fusionnées par SIREN (maquette p.20, multi). */
  sectors?: string[]
  nafCode?: string
  /** UN département — ce que Pappers sait prendre. */
  department?: string
  /** TOUS les départements — ce que gouv.fr sait prendre (`departement=31,33`
   *  mesuré à 142, contre 97 et 45 séparément). */
  departments?: string[]
  region?: string
  /** #2642.1 — région à PLUSIEURS codes (rail : IDF + Occitanie cochées
   *  ensemble). Même mécanisme que `departments`. */
  regions?: string[]
  /** Chiffre d'affaires en euros. ⚠️ Le service IA les déclarait « sans
   *  équivalent gouv.fr » : c'est périmé depuis, `ca_min` filtre. */
  revenueMin?: number
  revenueMax?: number
  /** `PME` | `ETI` | `GE`. Jamais un défaut : l'utilisateur le coche. */
  companyCategory?: string[]
  /** Catégorie juridique INSEE (`nature_juridique`). */
  legalCategory?: string
  city?: string
  /** #2642.2 — un CERCLE autour de `city`, en kilomètres. Sans effet sans
   *  ville résolue en commune (côté IA). */
  radiusKm?: number
  /** #3983.2 — la base de la zone département/région : `headquarters` = le
   *  SIÈGE y est ; `presence` (ou absent) = au moins un établissement actif. */
  siteBasis?: 'headquarters' | 'presence'
  headcountMin?: number
  headcountMax?: number
  /** #3908 — union de plusieurs tranches cochées (non contiguës). Voir le
   *  commentaire du schéma partagé (`discoverRegistryFiltersSchema`). */
  headcountRanges?: Array<{ headcountMin?: number; headcountMax?: number }>
  /** ISO `YYYY-MM-DD`. */
  createdAfter?: string
  createdBefore?: string
  freetext?: string
  /** #4045.1 — mots-clés de la recherche : ils TRIENT les signaux, ne retirent aucune entreprise. */
  keywords?: string[]
  /** #2165.28 — pile technique OBSERVÉE par la mémoire marché (côté serveur). */
  technologiesObserved?: string[]
  /** #2165.30 — au moins une ESN OBSERVÉE sur ce compte. Seul `true` filtre —
   *  `false` ne veut rien dire (doctrine c65, GA-259). */
  externalRecourseObserved?: boolean
  /** #4632.2 — famille de rôles observée : l'API CLASSE la liste par la mémoire marché (aucune exclusion). */
  roleFamilyObserved?: string
  /** #4632.2 — écosystème lié à (ESN observée) : même mécanisme. */
  ecosystemObserved?: string
  /** #5203 — période et nature des besoins : RETIRENT ce qui ne correspond pas (`all` / vide = rien n'est retiré). */
  needsPeriod?: 'all' | 'recent' | 'old'
  needsNature?: Array<'recrutement' | 'mission' | 'projet'>
  /** #4361.2 — retire les sociétés PROUVÉES cotées. Seul `true` filtre — `false` n'affirme jamais
   *  « non cotée ». */
  excludeListed?: boolean
  /** #4429.4 — « revenir à Toulouse seule » : la ville stricte, aucun palier tenté. */
  zoneStrict?: boolean
  /** #4429.4 (25/10) — « revenir au barreau d'avant » : jusqu'où l'élargissement automatique peut aller. */
  zoneCeiling?: ZoneCeiling
  /** #4433.3 — « Élargir la zone » monte d'UN palier (département, région), jamais la France ; la ville reste posée. */
  zoneRaise?: 'department' | 'region'
}

/** Corps complet de `POST /ia/discover/registry`. */
export interface DiscoverRegistryQuery {
  filters: DiscoverRegistryFilters
  limit: number
  /** #2489.3/D1 — le bouton « chercher hors de ma cible ». Jamais posé par
   *  défaut : la cible déclarée du profil ESN filtre TOUJOURS tant que
   *  l'utilisateur ne choisit pas explicitement de l'ignorer. */
  includeOutOfTarget?: boolean
  /** #2454.10 / #2451.1 — le mode CHOISI (`LAURA_CONTEXT_MODES`). Absent = défaut de l'espace, côté serveur. */
  contextMode?: ContextMode
  /** #4433 — « revenir au strict » : aucun élargissement par paliers. Absent = élargissement permis. */
  strictCriteria?: boolean
}

/** Les sources interrogées quand rien n'est coché (et par « Voir les signaux d'intention »). */
export const DEFAULT_SIGNAL_SOURCES = ['tender', 'award', 'hiring'] as const
/**
 * #3941.5 (Louis 17/10) — l'augmentation de capital (BODACC B) est un CRITÈRE qui se COCHE : n'importe quelle
 * société en publie une, ce n'est pas un signal d'ESN par défaut. Jamais dans le défaut.
 */
// #4732.1 (recette 01/11) — « Rachat ou fusion » (BODACC) se coche de même : jamais dans le défaut.
const OPT_IN_SIGNAL_SOURCES = ['capital', 'deal'] as const
/** Sources interrogeables par le mode Signaux (`sources` du corps). */
export const SIGNAL_SOURCES = [...DEFAULT_SIGNAL_SOURCES, ...OPT_IN_SIGNAL_SOURCES] as const
export type SignalSource = (typeof SIGNAL_SOURCES)[number]

/**
 * #2165.45 — les CINQ natures qu'un signal RENDU peut porter
 * (`discoverSignalSchema.type` côté contrat). Plus large que `SIGNAL_SOURCES` :
 * `legal`/`tech` sont produits ailleurs (BODACC, tech-detect), jamais
 * interrogeables à la source, mais bien affichés — donc filtrables à l'écran.
 */
export const SIGNAL_NATURES = [
  'tender',
  'award',
  'hiring',
  'legal',
  'tech',
  // #3819 — l'actualité commerciale historisée du compte, filtrable comme les autres.
  'business',
  // #3941 — la levée de fonds annoncée, filtrable comme les autres natures.
  'funding',
  // F2 — l'appartenance à un écosystème, filtrable : un signal d'écosystème venu de l'historique garde sa nature.
  'ecosystem',
] as const satisfies readonly DiscoverSignal['type'][]

/** Corps de `POST /ia/discover/signals`. */
export interface DiscoverSignalsQuery {
  /** #2454.10 — même mode que `DiscoverRegistryQuery`. */
  contextMode?: ContextMode
  /** #3551 — « chercher hors de ma cible », comme `DiscoverRegistryQuery`. */
  includeOutOfTarget?: boolean
  department?: string
  sinceDays: number
  keywords?: string
  sources?: SignalSource[]
  limit: number
  /** Secteurs cochés au rail, appliqués côté serveur sur le NAF **résolu** —
   *  les sources de signal ne rendent ni SIREN ni NAF. Omis quand aucun n'est
   *  posé : une recherche non restreinte ne doit rien retirer. */
  sectors?: string[]
  /** #2165.28 — même critère, même mécanisme que `DiscoverRegistryFilters`. */
  technologiesObserved?: string[]
  /** #2165.30 — même critère, même mécanisme que `DiscoverRegistryFilters`. */
  externalRecourseObserved?: boolean
  /** #4632.2 — même critère, même mécanisme que `DiscoverRegistryFilters`. */
  roleFamilyObserved?: string
  /** #4632.2 — même critère, même mécanisme que `DiscoverRegistryFilters`. */
  ecosystemObserved?: string
  /** #5203 — même critère, même mécanisme que `DiscoverRegistryFilters`. */
  needsPeriod?: 'all' | 'recent' | 'old'
  needsNature?: Array<'recrutement' | 'mission' | 'projet'>
  /**
   * #3096 — RÉFUTÉ en prod le 27/09 : absent de ce contrat, la politique de
   * télétravail cochée au rail n'atteignait jamais le serveur
   * (`DiscoverSignalsRequest.remotePolicies`), qui l'applique AVANT de
   * tronquer à `limit` — sans elle ici, la page rendue au croisement écran
   * n'a plus jamais été composée en tenant compte du choix. Omis quand aucune
   * politique n'est cochée.
   */
  remotePolicies?: Array<'sur_site' | 'hybride' | 'full_remote'>
  /** #3097 — même défaut, même mécanisme, pour la séniorité recherchée. */
  seniorities?: Array<'junior' | 'confirme' | 'senior'>
  /**
   * #3226 (#3203.6) — même défaut, même mécanisme, pour le delivery fit
   * externe (`DiscoverSignalsRequest.deliveryFitFilter`).
   */
  deliveryFitFilter?: Array<'compatible' | 'potentially_compatible' | 'unknown' | 'incompatible'>
}
