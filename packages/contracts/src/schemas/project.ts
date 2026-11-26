import { z } from 'zod'
import { APPLICATION_SECTOR_CODES, applicationSectorCodeSchema } from './application-sectors.js'
import { crmProviderSchema } from './crm-adapter.js'
import { financeScopeInfoSchema } from './finance-scope.js'
import { forecastCategorySchema } from './pipe.js'
import { supervisedForfaitFieldsSchema } from './mission-delivery-mode.js'
import { clearanceSchema, spokenLanguageSchema } from './language.js'
import { CASE_BUYING_MODELS, CASE_ORGANISATIONS, CASE_STRATEGIES } from './case-dimensions.js'
import { LOSS_REASON_CODES } from './loss-reason-codes.js'
import { offerDomainSchema } from './onboarding.js'
import { profileTypeAgreementSchema } from './need-presenter-gate.js'
import { staffableVerdictSchema } from './staffable-gate.js'
import { remotePreferenceSchema } from './talent-preferences.js'
import { convergenceStateSchema } from './analysis/convergence.js'
import { commercialTransitionSourceSchema } from './commercial-state-machine.js'

/**
 * Le PROJET — l'objet pivot du CRM/ATS (rapport CRM/ATS Operating System §12,
 * arbitrage Louis du 16/08 : « un Projet unique »).
 *
 * Il n'y a QU'UN objet entre le signal détecté et l'affaire signée. Le rapport
 * désigne la multiplication des objets — besoin, signal, opportunité, projet —
 * comme le premier risque produit (§32 « Mauvais objet pivot → reporting faux ») :
 * trois tables pour la même chose donnent trois compteurs qui ne tombent jamais
 * juste. Un projet est donc détecté, puis qualifié, puis avancé dans le pipe,
 * puis gagné ou perdu — une seule ligne, un seul cycle.
 *
 * Table de stockage : `opportunities` (migration `1787900000000`), CONSERVÉE
 * sous son nom. Le mot « opportunities » est aussi une clé de charge utile
 * renvoyée par le service IA dans `raw_analysis` ; renommer la table à l'aveugle
 * renommerait ce contrat inter-services au passage. Le nom de la table est
 * invisible à l'utilisateur, la sémantique ne l'est pas — c'est elle qu'on
 * unifie ici.
 */

/**
 * Nature/provenance of the entry (matches the materialization projections).
 *
 * `signal` unifies the buy SIGNAL with the need (restitution V2 §6 : « compte,
 * besoin, signal, projet, source, date, confiance »). Un signal n'est PAS un
 * besoin — c'est un fait daté et sourcé qui en annonce peut-être un — d'où une
 * nature distincte plutôt qu'une fusion : le graphe les tient ensemble, l'écran
 * les sépare, et aucun compteur de besoins n'est gonflé par des signaux.
 */
// #1889 — `imported` est la SIXIÈME nature, et elle est ajoutée en FIN (GA-08).
// Une ligne reprise d'un fichier n'a aucune des cinq provenances ci-dessus :
// elle ne vient d'aucune projection, personne ne l'a dérivée d'une analyse. Lui
// prêter l'une des cinq ferait croire à une lecture que le produit n'a pas
// faite — et le jour où l'on compte « les douleurs relevées », elle serait dans
// le total.
// #2174.1 / #2195.33 — `manual` est la SEPTIÈME nature, ajoutée en FIN (GA-08).
// Deux lots du 16/09/2026 ont eu besoin de la même nature le même jour, et
// l'ont d'abord nommée deux fois : `saisi` pour le projet créé implicitement
// par l'assistant de besoin (#2174.1), `manual` pour l'affaire ouverte à la
// main par un commercial (#2195.33, le renouvellement d'une mission en est le
// premier cas). C'est UNE nature, pas deux : dans les deux cas, personne n'a
// dérivé la ligne d'une analyse et personne ne l'a reprise d'un fichier —
// quelqu'un l'a saisie. Deux valeurs pour ce fait-là auraient fait qu'un
// compteur « ouvertes à la main » en rate la moitié. On garde `manual`, du
// vocabulaire des six natures existantes, toutes en anglais.
// Lui prêter `imported` ferait croire à une reprise de données qui n'a pas eu
// lieu, et l'une des cinq projections à une lecture que le produit n'a pas
// faite. La colonne SQL `opportunities.kind` est un `text` SANS contrainte
// CHECK (`1787900000000-Opportunities.ts:32`) : il n'y a rien à élargir en base
// avant d'écrire cette valeur (GA-11 / GA-12).
export const PROJECT_KINDS = ['pain', 'challenge', 'program', 'signal', 'implication', 'imported', 'manual'] as const
export const projectKindSchema = z.enum(PROJECT_KINDS)
export type ProjectKind = z.infer<typeof projectKindSchema>

/**
 * Le cycle du projet, de la détection à la signature.
 *
 * Deux temps dans une seule liste, et c'est voulu :
 *  - `detected` / `potential` décrivent la PREUVE. On les a détectés, personne
 *    ne les a encore regardés. Ils ne sont pas des étapes commerciales et ne
 *    portent aucun montant.
 *  - `qualified` → `won` sont les CINQ étapes du pipe ESN (arbitrage Louis :
 *    figées en nombre et en ordre, renommables en libellé par espace). Les
 *    figer garde les rapports comparables d'un espace à l'autre ; les rendre
 *    renommables laisse chacun parler sa langue.
 *  - `lost` et `dormant` sont les sorties. `dormant` n'est pas un échec : c'est
 *    « plus rien ne bouge », et le confondre avec `lost` fausserait le taux de
 *    transformation dans les deux sens.
 *
 * Ordonnée : l'index dans ce tableau EST la progression (cf. {@link stageOrder}).
 *
 * ⚠️ #4338.1 — RÉORDONNÉE le 19/10/2026 (décision Louis, call refonte UX) :
 * `confirmed` (« Besoin exprimé » : le client l'a dit) passe AVANT `qualified`
 * (« Qualifié » : on sonde ses consultants). Migration d'ORDRE seulement — les
 * valeurs stockées et leur sens sont inchangés, aucune ligne n'est réécrite ;
 * seul « a-t-il avancé ? » entre ces deux étapes change de signe. L'exception
 * est nommée dans `enum-baseline.ts` (GA-08).
 */
export const PROJECT_STAGES = [
  'detected',
  'potential',
  'confirmed',
  'qualified',
  'profiles_submitted',
  'negotiation',
  'won',
  'lost',
  'dormant',
] as const
export const projectStageSchema = z.enum(PROJECT_STAGES)
export type ProjectStage = z.infer<typeof projectStageSchema>

/**
 * Les CINQ étapes du pipe commercial — celles qui s'affichent en colonnes et
 * dont un espace peut renommer le libellé. Ni le nombre, ni l'ordre, ni le fait
 * qu'une étape soit gagnante ne se configurent.
 */
// #4338.1 — Besoin exprimé → Qualifié (ordre seulement, voir PROJECT_STAGES).
export const PIPELINE_STAGES = ['confirmed', 'qualified', 'profiles_submitted', 'negotiation', 'won'] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/**
 * #4338.1 — L'étape où naît une affaire ouverte SANS étape choisie (création
 * nue, détection confirmée par un humain). Elle valait `PIPELINE_STAGES[0]`
 * tant que la première colonne était « Qualifié » ; depuis que « Besoin
 * exprimé » ouvre le pipe, l'index ne dit plus la bonne chose : seul le CLIENT
 * exprime un besoin (#1326, #1333). La valeur écrite reste celle d'avant.
 */
export const DEFAULT_ENTRY_STAGE: PipelineStage = 'qualified'

/**
 * Les QUATRE étapes encore EN JEU — le pipe moins ce qui est déjà signé.
 *
 * ⚠️ Elle est DÉRIVÉE, jamais retapée : une seconde liste littérale divergerait
 * le jour où une étape s'ajoute (GA-57 refuse d'ailleurs les listes de stades
 * hors des trois fichiers qui les portent).
 *
 * Pourquoi elle existe. `PIPELINE_STAGES` décrit ce que le TABLEAU montre —
 * cinq colonnes, `won` compris, parce qu'un kanban finit sur sa colonne
 * gagnante. Un TOTAL, lui, n'a pas le droit d'additionner ces cinq colonnes :
 * il mélangerait de l'argent déjà gagné à de l'argent qui reste à gagner. Voir
 * {@link pipelineSummary}.
 */
export const OPEN_PIPELINE_STAGES: readonly Exclude<PipelineStage, 'won'>[] = PIPELINE_STAGES.filter(
  (stage): stage is Exclude<PipelineStage, 'won'> => stage !== 'won',
)

/** Les états d'entrée : détecté par l'analyse, pas encore regardé par un humain. */
export const INTAKE_STAGES = ['detected', 'potential'] as const

/** Les sorties. `won` en fait partie côté cycle, mais il reste une étape du pipe. */
export const CLOSED_STAGES = ['won', 'lost', 'dormant'] as const

/** Libellés par défaut des cinq étapes, FR et EN. Un espace peut les remplacer ;
 *  ce sont eux qui s'affichent tant qu'il ne l'a pas fait. */
export const DEFAULT_STAGE_LABELS: Readonly<Record<PipelineStage, { fr: string; en: string }>> = {
  // Théo C projects-pipeline.R2 (Louis 22/10/2026) — les cinq colonnes de Théo. Seuls les LIBELLÉS
  // changent : les valeurs stockées gardent leur sens (voir {@link THEO_COLUMN_OF_STAGE}).
  confirmed: { fr: 'À qualifier', en: 'To qualify' },
  qualified: { fr: 'Cadrage', en: 'Scoping' },
  profiles_submitted: { fr: 'Profils présentés', en: 'Profiles submitted' },
  negotiation: { fr: 'Proposition', en: 'Proposal' },
  won: { fr: 'Gagnée', en: 'Won' },
}

/** Les deux SORTIES du pipe : filtrables, jamais des colonnes du kanban. */
export const THEO_EXIT_STAGES = ['lost', 'dormant'] as const

/**
 * Théo C projects-pipeline.R2 — LA CORRESPONDANCE ÉCRITE 9 → 5 (Louis 22/10/2026 : « migration 9→5 avec
 * correspondance, rien perdu »). Aucune ligne n'est réécrite : les neuf valeurs stockées restent, et c'est
 * cette table qui dit où chacune se lit sur l'écran de Théo.
 *
 *  - `confirmed` (Besoin exprimé)  → colonne « À qualifier »
 *  - `qualified` (Qualifié)         → colonne « Cadrage »
 *  - `profiles_submitted`           → colonne « Profils présentés »
 *  - `negotiation` (Négociation)    → colonne « Proposition »
 *  - `won` (Signé)                  → colonne « Gagnée »
 *  - `detected`, `potential`        → `intake` : des pistes, lues dans Signaux (pas de colonne)
 *  - `lost`, `dormant`              → `exit` : Perdue / En sommeil, filtrables, REX de perte gardés
 */
export const THEO_COLUMN_OF_STAGE: Readonly<Record<ProjectStage, PipelineStage | 'intake' | 'exit'>> = {
  detected: 'intake',
  potential: 'intake',
  confirmed: 'confirmed',
  qualified: 'qualified',
  profiles_submitted: 'profiles_submitted',
  negotiation: 'negotiation',
  won: 'won',
  lost: 'exit',
  dormant: 'exit',
}

/** Position d'une étape dans le cycle. Sert au tri et à « l'étape a-t-elle
 *  avancé ou reculé ? » — un recul est légitime (on se corrige), il est juste
 *  journalisé comme tel. */
export function stageOrder(stage: ProjectStage): number {
  return PROJECT_STAGES.indexOf(stage)
}

/** Vrai pour les cinq étapes du pipe. Un projet `detected` n'a rien à faire
 *  dans une colonne de pipeline : il n'a pas encore été regardé. */
export function isPipelineStage(stage: string): stage is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(stage)
}

/** Issue d'un projet clos. `abandoned` n'est pas `lost` : personne n'a gagné,
 *  et compter un abandon comme une perte fausse le taux de transformation. */
export const PROJECT_OUTCOMES = ['won', 'lost', 'abandoned'] as const
export const projectOutcomeSchema = z.enum(PROJECT_OUTCOMES)
export type ProjectOutcome = z.infer<typeof projectOutcomeSchema>

/** Confidence scale derived from evidence strength. */
export const PROJECT_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const projectConfidenceSchema = z.enum(PROJECT_CONFIDENCE_LEVELS)
export type ProjectConfidence = z.infer<typeof projectConfidenceSchema>

/**
 * One materialized opportunity row as returned by `GET /opportunities`, joined to
 * its parent account. `kind`/`confidence`/`lifecycle_status` are kept as plain
 * strings on the wire (the columns are `text`) — the UI maps the known values and
 * degrades gracefully on anything unexpected. Dates are ISO strings.
 */
/**
 * BTMMP — la grille de qualification d'un besoin (annexe méthodo p21). Six axes
 * de texte libre (ce que le commercial a APPRIS) ; le vide n'est jamais deviné.
 * Défini ici parce que `projectRowSchema` le porte. Détail des axes et calcul
 * de complétude plus bas (`BTMMP_AXES`, `btmmpCompleteness`).
 */
export const btmmpSchema = z.object({
  budget: z.string().max(2000).nullish(),
  timing: z.string().max(2000).nullish(),
  mission: z.string().max(2000).nullish(),
  management: z.string().max(2000).nullish(),
  process: z.string().max(2000).nullish(),
  nextStep: z.string().max(2000).nullish(),
})
export type Btmmp = z.infer<typeof btmmpSchema>

export const projectRowSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  company_name: z.string().nullable(),
  sector: z.string().nullable(),
  /** #1325 — de quoi reconnaître l'entreprise sur une carte du Kanban.
   *  Nullables et jamais devinés : une URL inventée afficherait le logo d'une
   *  autre société. */
  logo_url: z.string().nullable(),
  website: z.string().nullable(),
  kind: z.string(),
  label: z.string(),
  detail: z.string().nullable(),
  offer: z.string().nullable(),
  source: z.string().nullable(),
  confidence: z.string().nullable(),
  urgency: z.string().nullable(),
  /**
   * L'étape courante — LE champ de cycle du projet.
   *
   * `lifecycle_status` (l'ancien cycle FR `nouveau|confirme|obsolete|…`) reste
   * en base, repris une fois dans `stage` par la migration puis plus jamais lu :
   * deux champs d'état sur le même objet finissent toujours par se contredire,
   * et c'est la contradiction qui casse un rapport, pas la colonne morte.
   */
  stage: projectStageSchema,
  /** Depuis quand le projet est à cette étape — c'est ce qui rend « bloqué
   *  depuis 40 jours » calculable sans deviner. */
  stage_entered_at: z.string(),
  /** Une mission existe déjà sur ce projet. Optionnel : un instantané
   *  IndexedDB d'avant ce déploiement n'a pas la clé, et l'absence de blocage
   *  vaut mieux qu'une liste qui ne valide plus. */
  has_mission: z.boolean().optional(),
  /**
   * #1325 (4/9) — LA PROCHAINE ACTION du projet : la tâche encore ouverte qui
   * vient en premier, avec son échéance.
   *
   * ⚠️ TRIVALENT, comme `has_next_action` l'est déjà pour le compteur d'entête
   * de colonne, et pour la même raison :
   *
   *  · `undefined` — l'API ne l'a pas dit. Le web se déploie en une minute
   *    (Vercel), l'API en plusieurs (Railway) : pendant la fenêtre, une carte
   *    neuve lit une réponse ancienne. Elle n'affiche alors RIEN — écrire
   *    « aucune prochaine action » sur une réponse muette est une affirmation.
   *  · `null` — aucune tâche ouverte. C'est une vraie réponse, et c'est
   *    exactement ce que `without_next_action` compte.
   *  · l'objet — le titre et la date de l'échéance.
   *
   * `due_on` est une chaîne ISO courte (`2026-09-12`) : la colonne SQL est de
   * type `date`, castée en texte par la projection. Un objet `Date` traverserait
   * le fil en chaîne pleine et se relirait au fuseau du navigateur — un jour de
   * décalage à l'écran, une échéance « hier » au lieu d'« aujourd'hui ».
   */
  next_action: z
    .object({
      title: z.string(),
      due_on: z.string(),
    })
    .nullable()
    .optional(),
  /** Porteur du projet. `null` = non attribué, l'état honnête de départ : la
   *  colonne n'est pas remplie depuis le créateur du compte. */
  owner_id: z.string().nullable(),
  /** #4191 R22 — nom du porteur lu sur son profil (`null` = porteur absent ou sans nom). */
  owner_name: z.string().nullable().optional(),
  /** #4158.34 — objet PRIVÉ : visible de son porteur et de qui gère l'équipe. Absent = partagé. */
  is_private: z.boolean().optional(),
  /**
   * #2172.37 — CE QU'ON CHERCHE À OBTENIR, écrit à la conversion d'une piste.
   *
   * ⚠️ TRIVALENT, pour la même raison que `next_action` juste au-dessus :
   *  · `undefined` — l'API n'a pas dit (réponse antérieure au lot) ;
   *  · `null` — aucun objectif écrit, une vraie réponse ;
   *  · la phrase — ce que quelqu'un a saisi.
   */
  objective: z.string().nullable().optional(),
  /**
   * #2324.37 — les RISQUES identifiés sur l'affaire, saisis à l'écran ou
   * proposés par Laura (`propose_opportunity_update`, validés d'un clic).
   * `null` = personne ne les a écrits : l'écran n'en montre AUCUNE ligne.
   */
  risks: z.string().nullable().optional(),
  /** Date de clôture ESPÉRÉE, saisie. Jamais déduite d'une moyenne de cycle. */
  expected_close_on: z.string().nullable(),
  /**
   * La catégorie DÉCLARÉE par le commercial (L2 Pipe, Louis 14/10/2026) —
   * `commit` / `best_case` / `pipeline` / `omitted`. Une déclaration, pas une
   * probabilité. `null` = non déclarée, `undefined` = API antérieure au lot.
   */
  forecast_category: forecastCategorySchema.nullable().optional(),
  /** Date de clôture RÉELLE, posée au passage en gagné/perdu/abandonné. */
  closed_at: z.string().nullable(),
  outcome: projectOutcomeSchema.nullable(),
  /**
   * Le MODE D'ENTRÉE, quand il est connu (I-45).
   *
   * ⚠️ La colonne existait, elle était ÉCRITE — c'est par elle que la routine
   * « changement de poste » ouvre une porte sur le nouvel employeur d'un contact
   * qu'on connaît — et elle n'atteignait aucun écran. La porte était donc créée,
   * puis noyée parmi trois cent soixante autres projets détectés : le cas que le
   * tome 1 appelle « le plus rentable des six » ne produisait rien de visible.
   *
   * `null` sur la quasi-totalité des projets, et c'est normal : la plupart
   * n'entrent par aucun chemin particulier.
   */
  access_mode: z.string().nullable().optional(),
  /** Motif de perte, choisi dans le catalogue de l'espace. `null` tant que
   *  personne ne l'a dit — « perdu sans raison » est une information, pas un
   *  trou à combler par un défaut. */
  loss_reason: z.string().nullable(),
  /** #3989.9 (Louis 15/10/2026) — le motif de perte dans la LISTE FERMÉE commune ;
   *  `loss_reason` devient sa précision libre facultative. `null` = non dit. */
  loss_reason_code: z.enum(LOSS_REASON_CODES).nullable().optional(),
  /** Qualification BTMMP (annexe méthodo p21), `null` tant que le besoin n'est
   *  pas qualifié. Cf. `btmmpCompleteness` pour le verdict « qualifié ». */
  btmmp: btmmpSchema.nullable().optional(),
  /**
   * #3266.1 (tranché sans Louis, #3292) — LE GRAIN équipe/site/projet qui
   * porte l'opportunité, dans le périmètre du compte. Un champ texte libre,
   * SAISI par le commercial — jamais un septième axe BTMMP (six axes fixes,
   * annexe méthodo p21 : l'étendre est une décision produit à part) et jamais
   * dérivé de l'org-graph du compte (qui modélise des personnes, pas un
   * périmètre équipe/site/projet). `null` = personne ne l'a écrit — l'écran
   * n'en montre alors aucune ligne, même règle que `risks` (#2324.37).
   *
   * `.optional()` pour le deploy-skew, comme `objective` : une API antérieure
   * à la colonne ne renvoie pas le champ.
   */
  scope_label: z.string().nullable().optional(),
  first_detected_at: z.string(),
  updated_at: z.string(),
  /**
   * Montant d'affaire estimé, en euros (devise implicite EUR), tel que SAISI par
   * le commercial sur le détail du besoin (cockpit manager §10 — pipeline valorisé).
   * `null` = jamais renseigné : le champ existe, la donnée non. Le pipeline € ne
   * somme QUE les montants réellement saisis — un besoin sans montant n'entre
   * jamais dans un total comme s'il valait 0 (règle « jamais de montant inventé »).
   *
   * `.optional()` en plus de `.nullable()` pour le deploy-skew : une API antérieure
   * à la colonne ne renvoie pas le champ (absent ≠ 0 € ≠ null saisi).
   */
  estimated_amount: z.number().nullable().optional(),
  /**
   * Le même montant, en CENTIMES et sous sa devise — la forme canonique depuis
   * le pivot. `estimated_amount` (euros, flottant) reste renvoyé pour les
   * écrans qui le lisent déjà ; un flottant qui traverse deux conversions
   * affiche 1 999,99 € là où le commercial a saisi 2 000.
   *
   * `null` = jamais saisi. Un projet sans montant n'entre JAMAIS dans un total
   * comme s'il valait 0 : il est compté à part (cf. {@link pipelineSummary}).
   */
  amount_cents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  /**
   * Les secteurs d'APPLICATION de cette demande (codes `APPLICATION_SECTORS`,
   * addendum Stelya §4.1). Vide ≠ « secteur du compte » : un projet sans
   * secteur déclaré n'en a pas, et le matching le DIT plutôt que de faire
   * passer le secteur du groupe pour celui de la demande.
   *
   * `.optional()` pour le deploy-skew, comme `has_mission` : un instantané
   * IndexedDB antérieur n'a pas la clé.
   */
  application_sector_codes: z.array(z.string()).optional(),
  /** La famille de prestation achetée (un des 66 domaines d'offre). `null` =
   *  non dit — jamais déduit du domaine dominant du vendeur, qui décrirait ce
   *  qu'on VEND et non ce que le client ACHÈTE. */
  primary_domain_code: z.string().nullable().optional(),
  /**
   * #2170.19 — LE NOMBRE DE PROFILS POSITIONNÉS, sommé sur tous les besoins
   * du projet (même prédicat que `positioned_consultants_count` sur un
   * besoin — `submitted_at IS NOT NULL`). `0` est une VRAIE réponse : la
   * requête a compté, elle a trouvé personne — même règle que
   * `shortlist_count` sur la fiche d'un besoin.
   *
   * `.optional()` pour le deploy-skew, comme `has_mission` : un instantané
   * IndexedDB antérieur n'a pas la clé.
   */
  positioned_count: z.number().int().min(0).optional(),
  /**
   * #2170.13 — LE BESOIN PRINCIPAL, sur la carte : le titre du PREMIER besoin
   * non archivé (`project_needs.title`, projects.service.ts). `null` =
   * aucun besoin rattaché — un état valide depuis #2558.1, jamais un
   * placeholder inventé.
   *
   * `.optional()` pour le deploy-skew, comme `has_mission` : un instantané
   * IndexedDB antérieur n'a pas la clé.
   */
  primary_need_title: z.string().nullable().optional(),
  /** #4344.2 — l'identifiant de ce besoin principal : la carte du pipe mène à SA fiche. Absent = instantané antérieur. */
  primary_need_id: z.string().nullable().optional(),
  /**
   * Théo C projects-pipeline.N3 — LE NOMBRE DE POSTES de l'affaire, sommé sur ses besoins non archivés
   * (« Estimation HT · N poste(s) » sur la carte). `null` = aucun besoin : la carte n'a pas de ligne, jamais « 0 poste ».
   *
   * `.optional()` pour le deploy-skew, comme `has_mission` : un instantané IndexedDB antérieur n'a pas la clé.
   */
  needs_headcount: z.number().int().min(1).nullable().optional(),
  /**
   * #2170.5 — LE STADE DÉRIVÉ « EN ENTRETIEN(S) », jamais saisi. Décision
   * Louis G6 16/09 : `Submission.stage === 'interview'` reste la SOURCE de
   * vérité (un entretien concerne une PERSONNE, pas une affaire) ; le projet
   * affiche un dérivé, sommé sur tous ses positionnements — même patron que
   * `positioned_count` juste au-dessus, jamais une seconde définition.
   *
   * `.optional()` pour le deploy-skew, comme `has_mission` : un instantané
   * IndexedDB antérieur n'a pas la clé.
   */
  interview_count: z.number().int().min(0).optional(),
  /**
   * #2170.50 — PARMI CES ENTRETIENS, AU MOINS UN prévu dans les sept jours à
   * venir (`interviews.scheduled_at`, seule table qui porte une date — le
   * `stage` du positionnement ne la porte pas). `undefined` = API antérieure
   * au déploiement, jamais compté comme « rien cette semaine ».
   */
  interview_this_week: z.boolean().optional(),
  /**
   * #2171.39 — ARCHIVER, un rangement NEUTRE (même mécanisme que
   * `ProjectNeed.archived_at`) : `null` = active, un horodatage = rangée.
   * `stage`/`outcome` ne bougent jamais pour ce geste.
   *
   * `.optional()` pour le deploy-skew, comme `has_mission` : une API
   * antérieure à la colonne ne renvoie pas le champ.
   */
  archived_at: z.string().nullable().optional(),
})
export type ProjectRow = z.infer<typeof projectRowSchema>

/**
 * Corps de `PATCH /projects/:id/stage` — le commercial déplace le projet.
 *
 * Aucune transition n'est interdite : reculer une étape est un geste de
 * correction légitime, et un pipe qui ne laisse pas revenir en arrière se fait
 * contourner par des projets qu'on n'ose plus toucher. Le mouvement est
 * simplement horodaté et journalisé.
 *
 * Une seule exigence, et elle est VÉRIFIÉE : `lost` demande son motif. Ce
 * commentaire l'annonçait depuis l'origine sans que rien ne l'applique — le
 * champ était `nullish()` et le contrôleur passait `?? null`. Un projet perdu
 * sans raison est pourtant le seul cas où le pipe n'apprend rien, et c'est
 * précisément la matière de la table `loss_reasons`.
 *
 * L'exigence ne porte QUE sur `lost` : ni `dormant` (personne n'a perdu, plus
 * rien ne bouge), ni les retours en arrière — demander à un commercial de
 * justifier une étape mal saisie lui apprend à ne plus la corriger.
 */
export const updateProjectStageSchema = z
  .object({
    stage: projectStageSchema,
    /** #3989.9 (Louis 15/10/2026) — la PRÉCISION libre, facultative, du motif de perte. */
    loss_reason: z.string().trim().max(200).nullish(),
    /** #3989.9 — le motif dans la liste FERMÉE commune ; obligatoire pour `lost`. */
    loss_reason_code: z.enum(LOSS_REASON_CODES).nullish(),
    /** #3246 (lot W9 + lot cloud 14/10) — vocabulaires FERMÉS (`case-dimensions.ts`), saisis à la clôture ; absents = non touchés. */
    strategy: z.enum(CASE_STRATEGIES).nullish(),
    buying_model: z.enum(CASE_BUYING_MODELS).nullish(),
    organisation: z.enum(CASE_ORGANISATIONS).nullish(),
    /**
     * Ce que l'utilisateur a COCHÉ dans le panneau d'effets (PDF 2 §8.5).
     *
     * Le panneau les affichait, les cochait, et les jetait au moment d'envoyer :
     * la case « créer la mission » d'un projet gagné n'a jamais créé une seule
     * mission. Le serveur exécute ce qu'il sait faire et REND le reste, pour que
     * l'écran puisse dire ce qui demande encore un geste.
     */
    accepted_actions: z.array(z.string().min(1).max(60)).max(12).optional(),
  })
  // #3989.9 — « perdu » demande son motif dans la liste fermée commune ; la précision reste libre.
  .refine(value => value.stage !== 'lost' || Boolean(value.loss_reason_code), {
    message: 'Un projet perdu demande son motif — c’est ce qui rend la perte exploitable.',
    path: ['loss_reason_code'],
  })
export type UpdateProjectStage = z.infer<typeof updateProjectStageSchema>

/**
 * #3246 — stratégie, modèle d'achat et organisation de la décision d'une
 * affaire DÉJÀ clôturée. Le geste de clôture les écrit, mais une perte
 * clôturée avant ces lots n'a aucune autre porte : ce corps ne touche JAMAIS
 * à l'étape ni à la date de clôture. `null` efface (une correction humaine
 * gagne) ; une clé absente n'est pas touchée.
 */
export const updateProjectCaseDimensionsSchema = z
  .object({
    strategy: z.enum(CASE_STRATEGIES).nullable().optional(),
    buying_model: z.enum(CASE_BUYING_MODELS).nullable().optional(),
    organisation: z.enum(CASE_ORGANISATIONS).nullable().optional(),
  })
  .strict()
  .refine(
    value => value.strategy !== undefined || value.buying_model !== undefined || value.organisation !== undefined,
    {
      message: 'Au moins un des trois choix est requis.',
    },
  )
export type UpdateProjectCaseDimensions = z.infer<typeof updateProjectCaseDimensionsSchema>

/**
 * #2195.33 — LE CORPS DE `POST /projects` : la porte de création d'une affaire.
 *
 * ⚠️ #2174.1 — LA MÊME PORTE SERT LE PROJET IMPLICITE, et c'est une décision.
 * L'assistant de besoin doit pouvoir partir d'un compte jamais analysé ; un
 * besoin SANS projet parent a été refusé (le `project_id: null` voyagerait dans
 * toutes les lectures qui remontent vers le projet, donc dans chacune). Le
 * projet se crée donc au nom du compte, PAR CETTE PORTE — deux portes pour le
 * même geste auraient fait qu'un compteur « ouvertes à la main » en rate la
 * moitié. Les champs de #2195.33 sont tous facultatifs : l'assistant n'envoie
 * que `account_id` et `label`, exactement ce qu'il envoyait.
 *
 * ⚠️ #2558.1 (18/09/2026) — LE REFUS CI-DESSUS A ÉTÉ LEVÉ, et sa raison a été
 * PAYÉE, pas contournée : `project_id: null` voyage bien dans les lectures,
 * alors `project_needs.account_id` a été ajoutée (migration `1795711263408`)
 * pour qu'AUCUNE d'elles n'ait à remonter au projet pour trouver le compte.
 * Ce qui précède reste vrai pour le cas où il Y A un projet à créer : cette
 * porte-ci demeure la seule du geste « créer l'affaire ». Ce qui change, c'est
 * qu'un besoin peut désormais ne pas en avoir du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE N'EXISTAIT PAS, ET POURQUOI ELLE EXISTE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les affaires naissaient toutes par MATÉRIALISATION du moteur d'analyse
 * (`ProjectsService.materialize`) ou par conversion d'une piste
 * (`POST /projects/:id/convert`) : le contrôleur ne portait AUCUN `POST
 * /projects` et aucun `CreateProjectDto`. Le bouton « construire la
 * proposition » du panneau de renouvellement n'avait donc pas de destination —
 * un renouvellement est une affaire NEUVE (décision Louis du 16/09/2026), pas
 * celle d'origine, et sans porte de création il n'y avait rien à pré-remplir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SCHÉMA N'AUTORISE PAS, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **On ne crée jamais une affaire tout seul.** Une écriture CRM/ERP passe par
 * une porte : geste d'utilisateur = auto-approuvé (le clic EST la décision),
 * geste de système = demande visible. Cette porte-ci n'est traversable QUE par
 * un geste d'utilisateur : le panneau de renouvellement NAVIGUE vers l'écran de
 * création pré-rempli, il n'appelle pas cette route. Aucun service du dépôt ne
 * l'appelle, et c'est vérifié (`projects.create-is-a-human-gesture.spec.ts`).
 *
 * ⚠️ `kind` n'est pas dans le corps : une affaire ouverte par cette porte est
 * `manual`, toujours. Laisser l'appelant choisir sa nature lui permettrait
 * d'écrire `pain` — c'est-à-dire de faire passer une saisie pour une douleur
 * relevée par l'analyse.
 *
 * ⚠️ Aucun champ n'a de valeur de remplissage. `estimated_amount` absent reste
 * `null` (« — »), jamais `0` : un pipe où les affaires sans montant valent zéro
 * euro annonce un chiffre faux que la direction finit par croire.
 */
export const createProjectSchema = z
  .object({
    /** Le compte porteur. L'affaire n'existe pas hors d'un dossier client. */
    account_id: z.string().guid(),
    /** Ce qu'on vend, en une ligne. Le seul champ obligatoire avec le compte :
     *  une affaire sans nom ne se retrouve pas dans une colonne de Kanban. */
    label: z.string().trim().min(1).max(200),
    /** Le contexte long. Vide reste vide — jamais recopié du libellé. */
    detail: z.string().trim().max(2000).nullish(),
    /** Ce qu'on cherche à obtenir, même champ que la conversion d'une piste. */
    objective: z.string().trim().max(500).nullish(),
    /**
     * L'étape d'entrée, bornée aux CINQ colonnes du pipe.
     *
     * Ni `detected` ni `potential` : ces deux-là décrivent la PREUVE — « on l'a
     * détecté, personne ne l'a encore regardé » — et une affaire qu'un humain
     * vient de saisir a, par construction, été regardée. Ni `lost`, ni `won`,
     * ni `dormant` : on n'ouvre pas une affaire déjà fermée.
     * L'énumération est LUE dans `PIPELINE_STAGES`, jamais recopiée.
     */
    stage: z.enum(PIPELINE_STAGES).optional(),
    /** La clôture ESPÉRÉE, jamais déduite d'un cycle moyen. */
    expected_close_on: z.string().date().nullish(),
    /** Le montant SAISI, en euros. Jamais négatif — une affaire ne se soustrait
     *  pas. Absent = `null`, et `null` n'est pas `0`. */
    estimated_amount: z.number().min(0).nullish(),
    /** À qui elle appartient. Absent = `null` : une affaire sans propriétaire
     *  n'appartient pas à celui qui l'a saisie, et c'est justement ce qu'un
     *  cockpit cherche à repérer. */
    owner_id: z.string().guid().nullish(),
    /**
     * #2195.33 — la mission dont cette affaire est le RENOUVELLEMENT.
     *
     * Le lien est porté par `missions.renewal_opportunity_id` et non par
     * `missions.opportunity_id` : ce dernier nomme l'affaire qui a PRODUIT la
     * mission, et l'écraser ferait perdre d'où la mission vient. Deux colonnes,
     * deux faits distincts.
     */
    renewal_of_mission_id: z.string().guid().nullish(),
    /** #3266.1 — le grain équipe/site/projet, saisi à la création. Une chaîne
     *  vide part à `null` : jamais un périmètre « vide » stocké. */
    scope_label: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform(value => (value ? value : null))
      // `.optional()` APRÈS le `.transform()` : en zod 4, avant, la clé deviendrait obligatoire dans le type inféré.
      .optional(),
  })
  .strict()
export type CreateProject = z.infer<typeof createProjectSchema>

/**
 * #3266.1 — Body for `PATCH /projects/:id/scope`. Le grain équipe/site/projet
 * de l'opportunité, ou `null` pour l'effacer. Même patron que
 * `updateProjectRisksSchema` (#2324.37) : une chaîne vide devient `null`.
 */
export const updateProjectScopeSchema = z
  .object({
    scope_label: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform(value => (value ? value : null)),
  })
  .strict()

/**
 * Body for `PATCH /opportunities/:id/amount` (cockpit manager §10 — pipeline
 * valorisé). Le commercial saisit un montant d'affaire estimé en euros, ou passe
 * `null` pour l'effacer. Jamais négatif — un montant d'affaire ne se soustrait pas.
 * Aucune valeur par défaut : ne pas saisir laisse le champ à `null` (« — »), on
 * n'invente jamais un montant.
 */
export const updateProjectAmountSchema = z.object({
  estimated_amount: z.number().nonnegative().nullable(),
})
export type UpdateProjectAmount = z.infer<typeof updateProjectAmountSchema>

/**
 * #2324.37 — Body for `PATCH /projects/:id/risks`. Le texte des risques de
 * l'affaire, ou `null` pour l'effacer. Une chaîne vide devient `null` : un
 * risque « vide » stocké passerait pour « aucun risque », ce qu'on ne sait pas.
 */
export const updateProjectRisksSchema = z
  .object({
    risks: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .transform(value => (value ? value : null)),
  })
  .strict()

/**
 * Corps de `PATCH /projects/:id/sectors` — le secteur d'application de la
 * DEMANDE, et la famille de prestation achetée (addendum Stelya §4.1, C05 du
 * registre de doctrine).
 *
 * Les deux colonnes existaient depuis la migration `1790020847361` et l'axe de
 * matching les LISAIT déjà ; aucun chemin ne pouvait les écrire. L'axe retombait
 * donc toujours sur le secteur du COMPTE — c'est-à-dire que la règle « le
 * secteur appartient au Projet » était vraie dans le modèle et inerte en
 * production.
 *
 * Deux refus délibérés :
 *
 *  - **Aucun défaut.** Un projet sans secteur n'hérite pas de celui du compte :
 *    le repli existe côté matching et il est NOMMÉ à l'écran. Le recopier ici
 *    ferait passer une déduction pour une saisie, et plus personne ne saurait
 *    lequel des deux il lit.
 *  - **Les codes sont VALIDÉS.** Un code inconnu est refusé plutôt que stocké :
 *    un secteur mal orthographié ne remonte sur aucune recherche, et son
 *    porteur croit l'avoir renseigné. C'est la leçon de la file d'alias du
 *    vivier.
 *
 * Remplacement complet et non fusion : `[]` est la façon d'effacer, et c'est le
 * geste qu'on veut pouvoir faire quand on s'est trompé de secteur.
 */
export const updateProjectSectorsSchema = z.object({
  application_sector_codes: z.array(applicationSectorCodeSchema).max(APPLICATION_SECTOR_CODES.length),
  /** `null` efface. Absent = inchangé — un écran qui n'édite que les secteurs
   *  ne doit pas effacer la famille de prestation en passant. */
  primary_domain_code: offerDomainSchema.nullable().optional(),
})
export type UpdateProjectSectors = z.infer<typeof updateProjectSectorsSchema>

/**
 * Cross-account echo of a need (`GET /opportunities/:id/similar`, restitution V2
 * §7 « comparer à un besoin similaire sur un autre compte »).
 *
 * A match is a REAL row of the same table, found on ANOTHER account of the SAME
 * workspace — never a generated look-alike. It carries the only two things that
 * justify showing it: how strongly it overlaps the reference, and on which terms.
 * A comparison that finds nothing returns an empty `matches` list, and the UI says
 * so.
 */
export const projectSimilarMatchSchema = projectRowSchema.extend({
  /** Deterministic lexical overlap with the reference need, 0 → 1. */
  match_score: z.number().min(0).max(1),
  /** Significant terms carried by BOTH needs — the justification shown to the rep. */
  shared_terms: z.array(z.string()),
})
export type ProjectSimilarMatch = z.infer<typeof projectSimilarMatchSchema>

export const projectSimilarResponseSchema = z.object({
  /** The need being compared, re-read server-side (never trusted from the client). */
  reference: projectRowSchema,
  matches: z.array(projectSimilarMatchSchema),
})
export type ProjectSimilarResponse = z.infer<typeof projectSimilarResponseSchema>

/** Upper bound on returned matches — a comparison is a shortlist, not a dump. */
export const PROJECT_SIMILAR_MAX = 5

/**
 * CRM object a besoin lands as. A besoin is a would-be opportunity, so each CRM
 * gets its idiomatic object rather than a lowest-common-denominator task:
 * `deal` (HubSpot, Pipedrive), `note` (Attio — on the Company record), `task`
 * (Salesforce — a real Opportunity would require a fabricated CloseDate/Stage,
 * which we never invent; and the Attio fallback when the besoin has no company).
 * The `opportunity` value is reserved for a future honest Salesforce Opportunity.
 */
export const PROJECT_CRM_OBJECTS = ['deal', 'note', 'task', 'opportunity'] as const
export const projectCrmObjectSchema = z.enum(PROJECT_CRM_OBJECTS)
export type ProjectCrmObject = z.infer<typeof projectCrmObjectSchema>

/**
 * Result of exporting a besoin to the connected CRM
 * (`POST /opportunities/:id/export-crm`, Théo TF1 p39 — les connecteurs
 * exportaient déjà un contact ; un besoin n'avait aucun chemin). `provider` is
 * the CRM that answered (first connected among hubspot/salesforce/pipedrive/
 * attio); `object` is the kind of record created there (so the UI confirms
 * honestly what it pushed — a deal, a note…); `id` is that record's id.
 */
export const projectCrmExportResponseSchema = z.object({
  // #4185 — les fournisseurs du contrat de l'adaptateur commun (un seul endroit).
  provider: crmProviderSchema,
  object: projectCrmObjectSchema,
  id: z.string(),
})
export type ProjectCrmExportResponse = z.infer<typeof projectCrmExportResponseSchema>

/* ------------------------------------------------------------------ */
/*  Qualification BTMMP d'un besoin ouvert (annexe méthodo p21)        */
/*  `btmmpSchema` / `Btmmp` sont définis plus haut (portés par         */
/*  `projectRowSchema`). Ici : axes, mise à jour, complétude.      */
/* ------------------------------------------------------------------ */

/** Les six axes, dans l'ordre de la page — clés stables pour l'UI et le calcul. */
export const BTMMP_AXES = ['budget', 'timing', 'mission', 'management', 'process', 'nextStep'] as const
export type BtmmpAxis = (typeof BTMMP_AXES)[number]

/** Le corps de `PATCH /opportunities/:id/btmmp`. Mise à jour partielle : un axe
 *  absent n'écrase rien, un axe présent mais vide l'efface. */
export const updateBtmmpSchema = btmmpSchema
export type UpdateBtmmp = z.infer<typeof updateBtmmpSchema>

/**
 * Complétude déterministe de la qualification (0-6) + le verdict « qualifié ».
 *
 * Un besoin n'est QUALIFIÉ que lorsque les six axes portent une réponse — c'est
 * la règle p21, pas un seuil arbitraire. Pur, sans invention : un axe vide (ou
 * fait d'espaces) ne compte pas.
 */
export function btmmpCompleteness(btmmp: Btmmp | null | undefined): {
  filled: BtmmpAxis[]
  missing: BtmmpAxis[]
  score: number
  qualified: boolean
} {
  const filled: BtmmpAxis[] = []
  const missing: BtmmpAxis[] = []
  for (const axis of BTMMP_AXES) {
    const value = btmmp?.[axis]
    if (typeof value === 'string' && value.trim().length > 0) filled.push(axis)
    else missing.push(axis)
  }
  return { filled, missing, score: filled.length, qualified: missing.length === 0 }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Boucle d'apprentissage (restitution V2 §6)                                */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Une cellule de ce que l'ESN a APPRIS de ses propres usages : sur un secteur et
 * une offre, combien de besoins ont fini convertis, transformés en action, ou
 * déclarés obsolètes.
 *
 * Le §6 demande que « chaque analyse améliore la base globale ». Le graphe
 * enregistrait déjà ce que chaque analyse produit ; ce qui manquait, c'est le
 * retour : ce que l'ÉQUIPE en a fait. Ces compteurs ne sont donc rien d'autre
 * que des cycles de vie réellement déplacés par des commerciaux — aucun modèle,
 * aucune estimation, aucun score. Une équipe qui n'a jamais rien déplacé produit
 * un agrégat VIDE, et la boucle reste silencieuse plutôt que d'inventer un
 * apprentissage.
 */
export const projectLearningRowSchema = z.object({
  /** Secteur du compte porteur. `null` quand le compte n'en porte pas. */
  sector: z.string().nullable(),
  /** Offre ESN rattachée au besoin. `null` quand aucune ne l'était. */
  offer: z.string().nullable(),
  kind: z.string(),
  /** Besoins passés à « converti » — l'affaire a existé. */
  converted: z.number().int().min(0),
  /** Besoins passés à « transformé en action ». */
  transformed: z.number().int().min(0),
  /** Besoins déclarés obsolètes — ce qui n'a PAS pris compte autant. */
  obsolete: z.number().int().min(0),
})
export type ProjectLearningRow = z.infer<typeof projectLearningRowSchema>

/** Réponse de `GET /opportunities/learning`. */
export const projectLearningSchema = z.object({
  rows: z.array(projectLearningRowSchema),
})
export type OpportunityLearning = z.infer<typeof projectLearningSchema>

/** Au-delà, le bloc envoyé à l'IA devient du bruit : on garde les cellules les
 *  plus documentées (cf. `renderWorkspaceLearning` côté API). */
export const OPPORTUNITY_LEARNING_PROMPT_MAX_ROWS = 12

/* ────────────────────────────────────────────────────────────────────────── */
/*  Les rôles recherchés — le « besoin » comme SOUS-LIGNE du projet           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Un rôle ou une capacité que le client cherche, à l'intérieur d'un projet.
 *
 * C'est ici que la décision « un Projet unique » se paie en clarté : le
 * « besoin » n'est plus un objet concurrent du projet, c'est une de ses lignes.
 * Un projet « refonte du SI paiement » peut chercher deux architectes et un
 * chef de projet — trois lignes, un seul projet, un seul montant, un seul
 * cycle. Compter les besoins ne gonfle donc plus le pipeline.
 */
export const CONTRACT_KINDS = ['regie', 'forfait', 'recrutement', 'inconnu'] as const
export const contractKindSchema = z.enum(CONTRACT_KINDS)
export type ContractKind = z.infer<typeof contractKindSchema>

/**
 * Les états d'un besoin (PDF 2 §7.4, décision D13 : EN BASE, pas dérivés).
 *
 * Les quatre premières sont HISTORIQUES et restent acceptées — renommer une
 * valeur d'enum est le premier interdit du §2.3, et `enum-additivity` le refuse.
 * `open` et `staffed` ne sont plus écrites (la reprise les a converties en
 * `to_qualify` et `won`) ; `lost` et `cancelled` restent de plein droit.
 *
 * Les dix suivantes sont AJOUTÉES en fin de liste : la garde refuse une
 * insertion au milieu, et l'ordre de cette liste pilote des tris d'écran.
 * L'ordre de travail, lui, vit dans `NEED_STATUS_ORDER` (`need-status.ts`).
 */
/** L'urgence déclarée d'un besoin (§7.3). Quatre valeurs, et l'absence est une
 *  réponse : `null` veut dire que personne ne l'a dite. */
export const NEED_URGENCIES = ['basse', 'normale', 'haute', 'critique'] as const
export const needUrgencySchema = z.enum(NEED_URGENCIES)
export type NeedUrgency = (typeof NEED_URGENCIES)[number]

/**
 * #2939 (#2174.34) — LES ACHATS : le service achats est dans la boucle, ou il
 * ne l'est pas. Deux valeurs, pas trois : un « peut-être » ferait passer une
 * absence de réponse pour un arbitrage — voir `need-compilation.ts` (#2322.49),
 * qui RÉIMPORTE cette échelle plutôt que d'en tenir une seconde (GA-26).
 */
export const NEED_PROCUREMENT_INVOLVEMENTS = ['implique', 'non_implique'] as const
export const needProcurementInvolvementSchema = z.enum(NEED_PROCUREMENT_INVOLVEMENTS)
export type NeedProcurementInvolvement = z.infer<typeof needProcurementInvolvementSchema>

/**
 * Les douze sources de création d'un besoin (§7.2).
 *
 * Le PDF en liste onze et cite LinkedIn comme douzième possible. C'est un REFUS
 * (décision D12, déjà la règle du dépôt) : le scraping expose le compte de
 * l'utilisateur à la suspension. `pasted_text` est le chemin retenu à la
 * place — l'utilisateur colle une offre, on l'extrait, et la provenance reste
 * HUMAINE parce que c'est lui qui a apporté le texte.
 */
export const NEED_SOURCES = [
  'manual',
  'from_account',
  'job_posting',
  'hiring_signal',
  'company_news',
  'tender',
  'client_email',
  'meeting_notes',
  'crm_import',
  'ats_import',
  'csv_import',
  'pasted_text',
] as const
export const needSourceSchema = z.enum(NEED_SOURCES)
export type NeedSource = (typeof NEED_SOURCES)[number]

export const NEED_PROVENANCES = ['human', 'connector', 'pipeline', 'model'] as const
export const needProvenanceSchema = z.enum(NEED_PROVENANCES)
export type NeedProvenance = (typeof NEED_PROVENANCES)[number]

/**
 * L'ORIGINE d'un besoin — un AXE distinct de `NEED_SOURCES` (§7.2, plus haut).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CHAMP DE PLUS ALORS QUE `NEED_SOURCES` EXISTE DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────
 * `NEED_SOURCES` mélange TROIS axes sous une seule liste (PDF-22, fiche
 * « 08 — Créer un besoin ») : l'ORIGINE (`manual`, `from_account`), le CANAL
 * (`job_posting`, `tender`, `client_email`, `meeting_notes`) et un MÉCANISME
 * D'IMPORT (`crm_import`, `ats_import`, `csv_import`). L'assistant de création
 * en quatre étapes demande « d'où vient CE besoin » comme une question à PART
 * de « par quel canal l'a-t-on reçu » — un appel d'offres reçu directement d'un
 * client et un appel d'offres public ne sont pas la même origine, et les deux
 * peuvent arriver par le même dépôt de document.
 *
 * `NEED_SOURCES` n'est PAS retiré ni réduit — une énumération ne perd jamais de
 * valeur (garde `enum-additivity.test.ts`) — et continue de porter le mécanisme
 * technique (`crm_import`…) et les canaux historiques déjà écrits en base.
 * `origin` et `channel` sont deux colonnes ADDITIVES, jamais dérivées de
 * `source`, et jamais l'inverse : deux dérivations de la même paire
 * divergeraient au premier import qui pose l'un sans l'autre.
 *
 * ⚠️ « Sourcing interne » N'EST PAS une valeur de cet enum : PDF-22 le nomme en
 * toutes lettres comme un BOUTON (une action de recherche dans le vivier), pas
 * un type de besoin. Il n'a donc pas d'entrée ici.
 */
export const NEED_ORIGINS = ['entrant', 'sortant', 'appel_offres', 'apport_affaires'] as const
export const needOriginSchema = z.enum(NEED_ORIGINS)
export type NeedOrigin = (typeof NEED_ORIGINS)[number]

/**
 * Le CANAL par lequel le besoin est arrivé — le second axe démêlé de
 * `NEED_SOURCES` (voir {@link NEED_ORIGINS} juste au-dessus pour la raison
 * complète). Trois valeurs seulement : le direct (le client s'adresse à
 * l'ESN), le partenaire (un apporteur tiers) et le portage (le consultant
 * porte sa propre mission). `null` = personne ne l'a dit — jamais un défaut.
 */
export const NEED_CHANNELS = ['direct', 'partenaire', 'portage'] as const
export const needChannelSchema = z.enum(NEED_CHANNELS)
export type NeedChannel = (typeof NEED_CHANNELS)[number]

export const PROJECT_NEED_STATUSES = [
  'open',
  'staffed',
  'lost',
  'cancelled',
  'detected',
  'to_qualify',
  'qualified',
  'to_match',
  'matching',
  'shortlist_ready',
  'submitted',
  'client_review',
  'won',
  'on_hold',
  'to_reactivate',
  // #2942, #2152.9/.10 — AJOUTÉS EN FIN (GA-08 : l'ordre des treize valeurs
  // précédentes ne bouge pas). L'ORDRE DE TRAVAIL, lui, vit dans
  // `NEED_STATUS_ORDER` (`need-status.ts`), qui les place entre
  // `client_review` et `won` — c'est cette liste-ci qui régit l'affichage du
  // filtre et la garde GA-12, pas la progression.
  'interview',
  'negotiation',
] as const
export const projectNeedStatusSchema = z.enum(PROJECT_NEED_STATUSES)

/**
 * Le corps de la porte d'état d'un besoin (PDF 2 §7.4).
 *
 * `open` et `staffed` sont ACCEPTÉES en base mais refusées ici : elles ne sont
 * plus écrites, et les laisser passer par l'API recréerait à la main l'état que
 * la reprise vient de faire disparaître.
 */
export const changeNeedStatusSchema = z.object({
  status: z.enum([
    'detected',
    'to_qualify',
    'qualified',
    'to_match',
    'matching',
    'shortlist_ready',
    'submitted',
    'client_review',
    'won',
    'lost',
    'cancelled',
    'on_hold',
    'to_reactivate',
  ]),
  reason: z.string().trim().max(200).nullish(),
  /** #3389.13 — la date de reprise d'une veille (AAAA-MM-JJ). Facultative ;
   *  `needResumeOnProblem` dit quand elle n'a pas de sens. */
  resume_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  /** #2967 (lot V39) — qui produit la transition : `human` (défaut), `laura`
   *  (l'utilisateur VALIDE une proposition de Laura) ou `human_correction`
   *  (une correction, qui exige un motif et gagne toujours). */
  source: commercialTransitionSourceSchema.optional(),
})
export type ChangeNeedStatus = z.infer<typeof changeNeedStatusSchema>
export type ProjectNeedStatus = z.infer<typeof projectNeedStatusSchema>

/** Une compétence demandée : le terme, et s'il est éliminatoire. Le niveau reste
 *  libre parce qu'aucune échelle commune ne survit à deux clients.
 *  `proof` (#2939, #2174.23) : ce qui ferait dire que le critère est rempli
 *  (« certification à jour », « référence vérifiable ») — texte libre, jamais
 *  une case à cocher qui prétendrait avoir vérifié quoi que ce soit. */
export const requiredSkillSchema = z.object({
  term: z.string().trim().min(1).max(80),
  required: z.boolean().default(true),
  level: z.string().trim().max(40).nullish(),
  proof: z.string().trim().max(120).nullish(),
})
export type RequiredSkill = z.infer<typeof requiredSkillSchema>

export const projectNeedSchema = z.object({
  id: z.string().guid(),
  /**
   * #2558.1 — LE PROJET EST OPTIONNEL DEPUIS LE 18/09/2026.
   *
   * `null` = ce besoin n'appartient à aucun projet, et c'est un ÉTAT VALIDE.
   * La majorité des missions d'ESN ne produisent aucun signal public (retour
   * bêta François Thomas, 17/09/2026) : exiger un projet forçait à en inventer
   * un par mission de régie, c'est-à-dire à créer de la donnée vide pour
   * satisfaire une contrainte technique.
   *
   * ⚠️ Ceci ne défait PAS #2174.1 / #2558.2 (créer le projet SANS sortir du
   * parcours, arbitrage de Louis du 16/09) : ce chemin-là reste le bon quand
   * il Y A un projet à créer. Celui-ci ajoute le cas où il n'y a rien à créer.
   */
  project_id: z.string().guid().nullable(),
  /**
   * #2558.1 — LE COMPTE, et c'est lui le vrai lien.
   *
   * Requis, jamais `null` : un besoin sans compte n'a aucun sens et ne serait
   * joignable par personne. C'est l'invariant qui REMPLACE le
   * `project_id NOT NULL` d'avant — on ne remplace pas une contrainte par
   * rien. Porté en propre par `project_needs.account_id` (migration
   * `1795711263408`), et non plus déduit de `opportunities.account_id`.
   */
  account_id: z.string().guid(),
  title: z.string(),
  skills: z.array(requiredSkillSchema),
  seniority: z.string().nullable(),
  /** Combien de personnes. 1 par défaut — jamais 0, qui se lirait « rien à faire ». */
  headcount: z.number().int().min(1),
  /** TJM cible en CENTIMES. `null` = non communiqué, jamais 0. */
  target_tjm_cents: z.number().int().nullable(),
  start_on: z.string().nullable(),
  duration_months: z.number().int().nullable(),
  location: z.string().nullable(),
  /**
   * #2173.29 — LE TÉLÉTRAVAIL DU BESOIN, en RÉUTILISANT `remotePreferenceSchema`
   * (GA-26) : la même énumération à quatre valeurs (`sur_site` / `hybride` /
   * `full_remote` / `indifferent`) que `consultants.remote_preference` et
   * `talent.workMode` — un second enum pour la même idée aurait divergé au
   * premier import.
   *
   * ⚠️ `null` = personne ne l'a dit — JAMAIS un défaut « sur_site ». Si une
   * extraction de document existe, elle ne devine pas cette valeur : elle ne
   * la pose que si le texte source la dit explicitement.
   */
  remote: remotePreferenceSchema.nullable().optional(),
  contract_kind: contractKindSchema,
  /** #3547 — le FORFAIT ENCADRÉ (mode, rôle tenu, équipe côté client). Absent d'une
   *  API antérieure ; `staffed` = comportement historique. */
  ...supervisedForfaitFieldsSchema.shape,
  status: projectNeedStatusSchema,
  /** Le motif de clôture — présent seulement sur une perte ou une annulation. */
  status_reason: z.string().nullable().optional(),
  /** #3389.13 — quand la veille doit être reprise. `null` = pas de date donnée. */
  resume_on: z.string().nullable().optional(),
  status_changed_at: z.string().nullable().optional(),
  /** `null` = personne n'a dit l'urgence. Jamais un défaut « normale », qui
   *  ferait passer pour un arbitrage ce qui n'est qu'une absence de réponse. */
  urgency: needUrgencySchema.nullable().optional(),
  source: needSourceSchema.nullable().optional(),
  provenance: needProvenanceSchema.nullable().optional(),
  detected_at: z.string().nullable().optional(),
  contact_id: z.string().guid().nullable().optional(),
  owner_id: z.string().guid().nullable().optional(),
  /** #4158.34 — objet PRIVÉ : visible de son porteur et de qui gère l'équipe. Absent = partagé. */
  is_private: z.boolean().optional(),
  budget_cents: z.number().int().nullable().optional(),
  min_tjm_cents: z.number().int().nullable().optional(),
  expertise: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  stack: z.array(z.string()).optional(),
  /** Les langues exigées par le poste (axe 6). Vide = le besoin n'en demande pas. */
  languages: z.array(spokenLanguageSchema).optional(),
  /** Les habilitations exigées (axe 12). Une habilitation manquante bloque.
   *  Même forme QU'À L'ÉCRITURE (`clearanceSchema`) : deux bornes différentes
   *  d'un côté et de l'autre laisseraient passer à la lecture ce que l'écriture
   *  refuse, et l'écart ne se verrait qu'au premier import. */
  clearances: z.array(clearanceSchema).optional(),
  constraints: z.string().nullable().optional(),
  /** #2323.22 — LE PROCESSUS de présentation/recrutement, en texte libre —
   *  jamais une énumération de ses étapes (voir `need-presenter-gate.ts` pour
   *  la raison). Même patron que `constraints`/`context` juste au-dessus. */
  presentation_process: z.string().nullable().optional(),
  /** #2939 (#2174.32) — COMMENT LE CLIENT DÉCIDE en interne (comité, DSI,
   *  validation budgétaire…) — distinct de `presentation_process`, qui porte
   *  le recrutement CÔTÉ ESN. Texte libre, même patron. Migration
   *  `1796322191039-NeedDecisionProcessAndProcurement.ts`. */
  decision_process: z.string().nullable().optional(),
  /** #2939 (#2174.33) — LE DÉCIDEUR : une PERSONNE, jamais une chaîne de
   *  caractères — même forme que `contact_id` (l'interlocuteur) ci-dessus.
   *  `null` = personne ne l'a dit, jamais deviné. */
  decision_maker_contact_id: z.string().guid().nullable().optional(),
  /** #2939 (#2174.34) — voir {@link NEED_PROCUREMENT_INVOLVEMENTS}. */
  procurement_involvement: needProcurementInvolvementSchema.nullable().optional(),
  /** #2323.38 — le nombre d'ENTRETIENS du processus. `null` = non renseigné,
   *  jamais 0 (0 se lirait « pas d'entretien du tout », une vraie réponse
   *  distincte). Sert `need-contradictions.ts` (démarrage immédiat + process
   *  à 4 entretiens) — voir ce fichier pour la raison du champ STRUCTURÉ
   *  plutôt qu'une lecture de `presentation_process` en texte libre. */
  interview_rounds: z.number().int().min(0).max(10).nullable().optional(),
  /** #2323.40 — jours de PRÉSENCE SUR SITE exigés par semaine, 0 à 5. `null`
   *  = non renseigné. Distinct de `remote` (la politique déclarée) : les deux
   *  ensemble détectent la contradiction full remote + présence exigée. */
  onsite_days_per_week: z.number().int().min(0).max(5).nullable().optional(),
  /** #2323.41 — le CLIENT exclut les freelances sur ce besoin. `null` =
   *  non renseigné, jamais `false` par défaut — un booléen deviné inventerait
   *  une exigence que personne n'a formulée. */
  freelance_excluded: z.boolean().nullable().optional(),
  /** #2323.42 — le budget de la mission est-il VALIDÉ côté client ? `null` =
   *  non renseigné. Distinct de `budget_cents`/`target_tjm_cents` (le
   *  MONTANT) : ce champ porte l'ACCORD, pas le chiffre. */
  budget_validated: z.boolean().nullable().optional(),
  /** #2323.18 — la porte PRÉSENTER, « accord sur le type de profil » — voir
   *  {@link profileTypeAgreementSchema} (`need-presenter-gate.ts`) pour la
   *  raison des trois états. `unknown` = pas encore demandé au client. */
  profile_type_agreement: profileTypeAgreementSchema.optional(),
  /** La porte G3. `unknown` = la question n'a pas été posée, jamais « non ». */
  staffable: staffableVerdictSchema.optional(),
  staffable_reason: z.string().nullable().optional(),
  staffable_decided_at: z.string().nullable().optional(),
  /** D'où vient ce besoin — voir {@link NEED_ORIGINS}. `null` = personne ne
   *  l'a dit, jamais un défaut. */
  origin: needOriginSchema.nullable().optional(),
  /** Par quel canal il est arrivé — voir {@link NEED_CHANNELS}. */
  channel: needChannelSchema.nullable().optional(),
  /** Les certifications EXIGÉES par le poste — un besoin peut en demander,
   *  distinct des certifications qu'un CONSULTANT porte sur son profil.
   *  Vide = aucune exigée, jamais un défaut « aucune connue ». */
  required_certifications: z.array(z.string()).optional(),
  deadline_at: z.string().nullable(),
  /**
   * #2173.49 — ARCHIVÉ, jamais un statut. Décision Louis 17/09/2026 : un
   * rangement neutre — `status` ne change PAS quand ce champ se pose. `null`
   * = actif, une date = quand il a été rangé. `.optional()` comme les champs
   * voisins récemment ajoutés : le web se déploie en une minute, l'API en
   * plusieurs.
   */
  archived_at: z.string().nullable().optional(),
  /** #2952 (#2305.13/.14/.15/.16) — le niveau de convergence SIGNAL → PROJET
   *  PLAUSIBLE/CONFIRMÉ → BESOIN DÉTECTÉ/EXPRIMÉ (voir `convergence.ts`).
   *  `null` = jamais évalué, jamais un niveau deviné. */
  convergence_state: convergenceStateSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type ProjectNeed = z.infer<typeof projectNeedSchema>

/**
 * #2952 (#2305.18) — LA PORTE DE CONVERGENCE : le seul chemin d'écriture de
 * `convergence_state`, séparée du patch générique pour la même raison que
 * {@link changeNeedStatusSchema} — c'est le champ dont une valeur mal posée
 * ferait croire à une transition qui n'a jamais eu lieu.
 *
 * `foundingSignalIds` n'est exigé qu'au niveau `projet_plausible`
 * (`assertConvergenceCitesFoundingSignals`, #2305.35) : les autres niveaux ne
 * sont pas définis par un faisceau de signaux dans l'issue source.
 */
export const changeNeedConvergenceStateSchema = z.object({
  to: convergenceStateSchema,
  foundingSignalIds: z.array(z.string().trim().min(1)).optional(),
})
export type ChangeNeedConvergenceState = z.infer<typeof changeNeedConvergenceStateSchema>

export const createProjectNeedSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    skills: z.array(requiredSkillSchema).max(30).optional(),
    seniority: z.string().trim().max(40).nullish(),
    headcount: z.number().int().min(1).max(200).optional(),
    target_tjm_cents: z.number().int().min(0).nullish(),
    start_on: z.string().date().nullish(),
    duration_months: z.number().int().min(1).max(120).nullish(),
    location: z.string().trim().max(120).nullish(),
    /** #2173.29 — voir {@link projectNeedSchema.remote} pour la raison de la
     *  réutilisation (GA-26). `null`/absent = non renseigné, jamais deviné. */
    remote: remotePreferenceSchema.nullish(),
    contract_kind: contractKindSchema.optional(),
    /** #3547 — le FORFAIT ENCADRÉ. Cohérence (mode ⇒ forfait, rôle/équipe ⇒ mode)
     *  vérifiée par `deliveryModeProblems` côté service ; le CHECK SQL est le filet. */
    ...supervisedForfaitFieldsSchema.shape,
    languages: z.array(spokenLanguageSchema).max(8).optional(),
    clearances: z.array(clearanceSchema).max(8).optional(),
    /** D'où vient ce besoin. La colonne et sa contrainte existaient depuis le
     *  chantier CRM ; aucun chemin d'écriture ne les renseignait, si bien qu'un
     *  besoin issu d'une offre d'emploi ne pouvait pas être distingué d'une
     *  saisie manuelle — et le badge « détecté » du §6.2 n'aurait rien eu à
     *  afficher. */
    source: needSourceSchema.nullish(),
    provenance: needProvenanceSchema.nullish(),
    /**
     * L'urgence déclarée, et le PROPRIÉTAIRE du besoin.
     *
     * Même histoire que `source` et `provenance` juste au-dessus, un cran plus
     * loin : les deux colonnes existent depuis le chantier CRM, les deux sont
     * LUES (le badge d'urgence de la colonne « Rôle », `owner_id` dans la
     * liste transverse et dans `toNeedWire`) — et aucune n'était dans un
     * schéma d'écriture. Comme ce schéma est `.strict()`, les envoyer partait
     * en 400 : « qui s'en occupe » et « est-ce que ça presse » restaient vides
     * pour toujours, et un vide honnête se lit « personne n'a rempli » plutôt
     * que « le chemin n'existe pas ».
     *
     * ⚠️ Aucun DÉFAUT ni sur l'une ni sur l'autre. Une urgence absente n'est
     * pas « normale » — ce serait faire passer pour un arbitrage ce qui n'est
     * qu'une absence de réponse — et un besoin sans propriétaire n'appartient
     * pas à celui qui l'a créé : c'est justement ce que le cockpit cherche à
     * repérer. `null` reste `null`.
     *
     * Les quatre valeurs d'urgence sont exactement celles de la contrainte
     * `project_needs_urgency_check` (migration `1789537604211-NeedFields.ts`,
     * ligne 52), liées par GA-12 : rien à élargir en base, donc rien à écrire
     * qu'elle refuserait en fin de course.
     */
    urgency: needUrgencySchema.nullish(),
    owner_id: z.string().guid().nullish(),
    /**
     * #2174.11 (épopée #2939) — L'INTERLOCUTEUR. La colonne existe depuis
     * toujours (`projectNeedSchema.contact_id`), LUE par `open-needs.service.ts`
     * (`need.contact_id AS contact_id`) — et jamais dans un schéma d'écriture :
     * cinquième « colonne lue, jamais écrite » de ce fichier (voir `owner_id`
     * juste au-dessus pour la troisième). `null`/absent = personne ne l'a
     * encore dit, jamais deviné.
     */
    contact_id: z.string().guid().nullish(),
    /** L'ORIGINE et le CANAL — deux champs, jamais une liste unique (PDF-22,
     *  fiche « 08 — Créer un besoin »). Voir {@link NEED_ORIGINS} et
     *  {@link NEED_CHANNELS} pour la raison du découplage d'avec `source`. */
    origin: needOriginSchema.nullish(),
    channel: needChannelSchema.nullish(),
    /** Les certifications exigées par le poste. `[]` = aucune exigée — un
     *  geste légitime pour en retirer une, jamais un défaut deviné. */
    required_certifications: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    deadline_at: z.string().datetime().nullish(),
    /**
     * #2174.17 — LE PROBLÈME à résoudre. La colonne existe depuis longtemps
     * (`projectNeedSchema.context`, lue par `NeedDetailPage.tsx` et semée par
     * `DemoSeedService`) ; seule la création n'en offrait pas la saisie — un
     * besoin créé à la main ne pouvait jamais porter cette phrase, seulement
     * un besoin réécrit après coup.
     */
    context: z.string().trim().max(2000).nullish(),
    /**
     * #2939 (#2174.16) — LA CAPACITÉ RECHERCHÉE. La colonne existe depuis
     * `NeedFields` (`projectNeedSchema.expertise`, lue par
     * `open-needs.service.ts` et `NeedDetailPage.tsx` — « Expertise attendue »)
     * ; seule la création n'en offrait pas la saisie, même patron que `context`
     * (#2174.17) juste au-dessus.
     */
    expertise: z.string().trim().max(2000).nullish(),
    /**
     * #2323.22 — LE PROCESSUS de présentation/recrutement, texte libre — même
     * raison et même patron que `context` (#2174.17) juste au-dessus : jamais
     * une énumération de ses étapes, une décision produit qu'aucune spec ne
     * donne (voir `need-presenter-gate.ts`).
     */
    presentation_process: z.string().trim().max(2000).nullish(),
    /**
     * #2939 (#2174.32) — COMMENT LE CLIENT DÉCIDE en interne, même patron
     * texte libre que `presentation_process` juste au-dessus.
     */
    decision_process: z.string().trim().max(2000).nullish(),
    /**
     * #2939 (#2174.33) — LE DÉCIDEUR, vérifié CÔTÉ SERVEUR contre le compte du
     * besoin — même garde que `contact_id` (#2174.11).
     */
    decision_maker_contact_id: z.string().guid().nullish(),
    /** #2939 (#2174.34) — voir {@link NEED_PROCUREMENT_INVOLVEMENTS}. */
    procurement_involvement: needProcurementInvolvementSchema.nullish(),
    /**
     * #2939 (#2174.31) — LES CONTRAINTES ADMINISTRATIVES du poste (astreinte,
     * déplacements, horaires). La colonne existe depuis `NeedFields`
     * (`projectNeedSchema.constraints`, lue par `NeedDetailPage.tsx` —
     * « Contraintes ») ; même patron que `expertise` et `context` ci-dessus.
     */
    constraints: z.string().trim().max(2000).nullish(),
    /** #2323.38-.42 — les quatre champs structurés qui alimentent
     *  `need-contradictions.ts` (packages/contracts). Voir
     *  {@link projectNeedSchema} pour la raison de chacun ; même patron
     *  d'écriture que `presentation_process` juste au-dessus. */
    interview_rounds: z.number().int().min(0).max(10).nullish(),
    onsite_days_per_week: z.number().int().min(0).max(5).nullish(),
    freelance_excluded: z.boolean().nullish(),
    budget_validated: z.boolean().nullish(),
  })
  .strict()
export type CreateProjectNeed = z.infer<typeof createProjectNeedSchema>

/**
 * #2558.1 — LE CORPS DE `POST /projects/needs` : créer un besoin AU NOM D'UN
 * COMPTE, avec ou sans projet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PORTE DE PLUS, ALORS QU'ON EN REFUSE D'HABITUDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `POST /projects/:id/needs` porte le projet DANS L'URL : aucun corps ne peut
 * y décrire un besoin sans projet — ce n'est pas un champ à rendre facultatif,
 * c'est le chemin lui-même qui l'exige. La majorité des missions d'ESN ne
 * produisent aucun signal public (retour bêta du 17/09/2026), et les attacher
 * à un projet inventé revenait à fabriquer de la donnée vide.
 *
 * ⚠️ Les deux portes ne font PAS le même geste, et c'est ce qui les autorise à
 * coexister : `:id/needs` ajoute une ligne À UN PROJET (et son plafond de
 * lignes par projet s'applique), celle-ci crée un besoin CHEZ UN CLIENT. Le
 * compte est requis des deux côtés — simplement, ici il est dit, là il est
 * déduit du projet parent.
 *
 * `project_id` reste accepté : rattacher dès la création est le cas le plus
 * fréquent, et l'imposer par une seconde requête ferait deux écritures pour un
 * seul geste utilisateur.
 */
export const createAccountNeedSchema = createProjectNeedSchema
  .extend({
    /** Le CLIENT. Requis : un besoin sans compte n'a aucun sens et ne serait
     *  joignable par personne — c'est l'invariant qui remplace le
     *  `project_id NOT NULL` retiré en base. */
    account_id: z.string().guid(),
    /** Le projet, s'il y en a un. Absent ou `null` = il n'y en a pas, et c'est
     *  un état VALIDE — jamais « à compléter plus tard ». */
    project_id: z.string().guid().nullish(),
  })
  .strict()
export type CreateAccountNeed = z.infer<typeof createAccountNeedSchema>

export const updateProjectNeedSchema = createProjectNeedSchema
  .partial()
  .extend({ status: projectNeedStatusSchema.optional() })
  .refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier' })
export type UpdateProjectNeed = z.infer<typeof updateProjectNeedSchema>

/* ────────────────────────────────────────────────────────────────────────── */
/*  Les personnes du projet                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Le rôle d'un contact SUR CE PROJET — distinct de son rôle de décision sur le
 * compte. La même personne est sponsor d'un projet et simple utilisatrice d'un
 * autre ; confondre les deux fait viser le mauvais interlocuteur.
 */
export const PROJECT_CONTACT_ROLES = [
  'sponsor',
  'decideur',
  'prescripteur',
  'acheteur',
  'utilisateur',
  'bloqueur',
] as const
export const projectContactRoleSchema = z.enum(PROJECT_CONTACT_ROLES)
export type ProjectContactRole = z.infer<typeof projectContactRoleSchema>

export const projectContactSchema = z.object({
  contact_id: z.string().guid(),
  full_name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  role: projectContactRoleSchema,
  created_at: z.string(),
})
export type ProjectContact = z.infer<typeof projectContactSchema>

export const linkProjectContactSchema = z.object({ role: projectContactRoleSchema }).strict()

/* ────────────────────────────────────────────────────────────────────────── */
/*  Le pipe : compter sans jamais inventer                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/** Une colonne du pipe : son étape, ce qu'elle contient, ce qu'elle vaut. */
export const pipelineColumnSchema = z.object({
  stage: projectStageSchema,
  /** Libellé effectif — celui de l'espace s'il l'a renommé, sinon le défaut. */
  label: z.string(),
  count: z.number().int().min(0),
  /**
   * Somme des montants RÉELLEMENT saisis, en centimes. Les projets sans montant
   * n'y entrent pas : ils sont comptés dans `without_amount`. Additionner des
   * `null` comme des zéros donne un pipe qui a l'air petit et faux — et c'est le
   * chiffre que la direction regarde en premier.
   */
  amount_cents: z.number().int().min(0),
  without_amount: z.number().int().min(0),
  /**
   * #1325 (3/9.1) — combien de projets de cette colonne n'ont AUCUNE prochaine
   * action ouverte. C'est ce qui rend l'entête actionnable : « 3 projets ·
   * 129 k€ · 1 sans prochaine action » dit où regarder.
   *
   * ⚠️ Un projet dont on n'a pas demandé l'état n'y entre PAS : « non mesuré
   * n'est pas mesuré à zéro », et ici un faux compte déclencherait une alerte
   * qui n'existe pas.
   */
  without_next_action: z.number().int().min(0),
})
export type PipelineColumn = z.infer<typeof pipelineColumnSchema>

export const pipelineSummarySchema = z.object({
  columns: z.array(pipelineColumnSchema),
  /**
   * L'entonnoir d'entrée : les projets DÉTECTÉS que personne n'a encore repris.
   *
   * Les SIGNAUX en sont exclus. Un signal est un fait daté et sourcé qui annonce
   * peut-être un projet — pas un projet en attente. Les compter ici gonflerait
   * l'entonnoir de plusieurs centaines de lignes et donnerait, sur le même
   * écran, un chiffre différent de celui de la lentille Portefeuille : deux
   * compteurs pour la même chose, exactement ce que le pivot existe pour finir.
   */
  intake: z.number().int().min(0),
  /** Les signaux, comptés À PART. Ils existent, ils ne sont pas des projets. */
  signals: z.number().int().min(0),
  /**
   * #3714 — les DÉDUCTIONS GÉNÉRIQUES (`projectNature` = `generic`), comptées À
   * PART : elles ne sont ni du travail en attente ni un signal daté. Sorties de
   * `intake`, jamais effacées. `.optional()` pour le deploy-skew.
   */
  generic_deductions: z.number().int().min(0).optional(),
  /**
   * Les trois totaux portent les QUATRE étapes encore en jeu
   * ({@link OPEN_PIPELINE_STAGES}). Le signé est compté juste en dessous, et
   * jamais dedans — voir {@link pipelineSummary}.
   */
  total_count: z.number().int().min(0),
  total_amount_cents: z.number().int().min(0),
  total_without_amount: z.number().int().min(0),
  /** Le SIGNÉ, compté à part. Trois champs, la même règle que ci-dessus : un
   *  montant non saisi n'entre pas dans la somme, il est compté. */
  signed_count: z.number().int().min(0),
  signed_amount_cents: z.number().int().min(0),
  signed_without_amount: z.number().int().min(0),
})
export type PipelineSummary = z.infer<typeof pipelineSummarySchema>

/**
 * Ce que `GET /projects/pipeline` rend : le résumé, PLUS le périmètre servi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE PÉRIMÈTRE VOYAGE AVEC LE CHIFFRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit annonce « **Mon** pipe » et lisait le pipe de l'ESPACE : sur une ESN
 * à cinq commerciaux, le même chiffre s'affichait cinq fois sous cinq « mon ».
 * Un chiffre juste sur le mauvais périmètre est pire qu'un chiffre absent —
 * personne ne le remarque.
 *
 * Le périmètre se demande donc par `?scope=own|workspace`, et il REVIENT avec la
 * réponse. Sans ce retour, l'écran ne peut pas dire ce qu'il montre, et un pipe
 * restreint qui tombe à zéro se lit « je n'ai rien vendu ».
 *
 * ⚠️ `scope.outsideAnyPortfolio` est la moitié qui manque, et c'est la même
 * raison que sur le chiffre d'affaires (D1 · 26/08/2026) : un projet que
 * PERSONNE ne porte, sur un compte attribué à personne, n'entre dans le total de
 * personne. Sur un espace où rien n'est attribué, « Mon pipe : 0 » serait la
 * phrase fausse — la vraie est « rien ne t'est rattaché ». Il est donc COMPTÉ et
 * NOMMÉ, jamais tu.
 *
 * ⚠️ Le SCHÉMA du résumé lui-même ne bouge pas : `pipelineSummary()` reste PUR et
 * ne connaît aucun périmètre. Le périmètre est une propriété de la LECTURE, pas
 * du calcul — les mélanger obligerait la fonction pure à recevoir un identifiant
 * d'utilisateur pour compter des colonnes.
 */
export const pipelineSummaryResponseSchema = pipelineSummarySchema.extend({ scope: financeScopeInfoSchema })
export type PipelineSummaryResponse = z.infer<typeof pipelineSummaryResponseSchema>

/**
 * Le résumé du pipe. PUR : mêmes lignes, même résultat, testable sans base.
 *
 * Aucune pondération, aucune probabilité, aucun forecast (arbitrage Louis) : un
 * pipe pondéré que personne ne tient à jour produit un chiffre faux que la
 * direction finit par croire. On additionne ce qui est saisi, et on affiche à
 * part ce qui ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN TOTAL N'ADDITIONNE JAMAIS DEUX STATUTS (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `PIPELINE_STAGES` porte cinq colonnes, `won` compris — c'est ce que le
 * TABLEAU montre, et un kanban commercial finit bien sur sa colonne gagnante.
 * Les trois totaux, eux, ne sommaient jusqu'ici que ces cinq colonnes : ils
 * ajoutaient donc le SIGNÉ à ce qui reste à gagner, sous un chiffre affiché
 * « X € sur N projets au pipe » et « Mon pipe » à trente pixels du chiffre
 * d'affaires signé.
 *
 * Deux conséquences, et la seconde est la pire :
 *  · le pipe est gonflé de tout l'argent déjà gagné ;
 *  · il ne DIMINUE JAMAIS quand on gagne. Une affaire qui se signe change de
 *    colonne sans quitter le total — le seul chiffre censé mesurer « ce qu'il
 *    reste à vendre » monte à chaque victoire et ne redescend qu'en cas de
 *    perte. C'est un chiffre faux qui a l'air juste.
 *
 * La règle vient telle quelle du CRM de Louis, feuille `ANOMALIES CRM` du
 * 16/08 (l. 14, « consolider SANS additionner les statuts ») et feuille
 * `MULTIOFFRES` (« additionner leurs statuts gonfle artificiellement le pipe »).
 *
 * Donc : `total_*` porte {@link OPEN_PIPELINE_STAGES}, `signed_*` porte `won`,
 * `columns` ne bouge pas — la colonne Signé reste VUE, elle n'est plus SOMMÉE.
 * `lost` et `dormant` restent hors des deux : ils ne sont dans aucune colonne.
 */
export function pipelineSummary(
  rows: readonly {
    stage: string
    kind?: string | null
    amount_cents?: number | null
    /**
     * #1325 (3/9.1) — le projet a-t-il une prochaine action ouverte ?
     *
     * ⚠️ TRIVALENT. `undefined` veut dire « on ne l'a pas demandé au serveur »,
     * pas « il n'en a pas ». Compter un projet dont on ignore l'état comme
     * « sans action » afficherait une alerte fausse : c'est « non mesuré n'est
     * pas mesuré à zéro », appliqué à un compteur.
     */
    has_next_action?: boolean | null
    // #3714 — ce que `projectNature` lit pour décider qu'une ligne d'entrée est
    // une généralité : tout est optionnel, une ligne qui ne le porte pas reste
    // lue comme avant.
    source?: string | null
    owner_id?: string | null
    expected_close_on?: string | null
    btmmp?: Btmmp | null
    next_action?: { title: string; due_on: string } | null
    has_mission?: boolean
    objective?: string | null
    risks?: string | null
    scope_label?: string | null
  }[],
  labels: Partial<Record<PipelineStage, string>> = {},
  language: 'fr' | 'en' = 'fr',
): PipelineSummary {
  const columns: PipelineColumn[] = PIPELINE_STAGES.map(stage => ({
    stage,
    label: labels[stage]?.trim() || DEFAULT_STAGE_LABELS[stage][language],
    count: 0,
    amount_cents: 0,
    without_amount: 0,
    without_next_action: 0,
  }))
  const byStage = new Map(columns.map(column => [column.stage, column]))
  let intake = 0
  let signals = 0
  let genericDeductions = 0

  for (const row of rows) {
    if ((INTAKE_STAGES as readonly string[]).includes(row.stage)) {
      // Un signal n'est pas un projet en attente : c'est un fait qui en annonce
      // peut-être un. Il est compté à part.
      if (row.kind === 'signal') signals++
      // #3714 — une déduction générique sans travail non plus : compteur à part.
      else if (projectNature({ ...row, kind: row.kind ?? '', source: row.source ?? null }) === 'generic') {
        genericDeductions++
      } else intake++
      continue
    }
    const column = byStage.get(row.stage as PipelineStage)
    if (!column) continue // `lost` / `dormant` : sortis du pipe, pas une colonne.
    column.count++
    if (typeof row.amount_cents === 'number' && Number.isFinite(row.amount_cents)) {
      column.amount_cents += row.amount_cents
    } else {
      column.without_amount++
    }
    // `=== false` et non `!row.has_next_action` : `undefined` (non demandé) ne
    // doit pas grossir un compteur qui déclenche une alerte à l'écran.
    // #4291.8 — une affaire SIGNÉE n'a plus de relance commerciale due : son suivi est la planification.
    if (row.has_next_action === false && row.stage !== 'won') column.without_next_action++
  }

  // ⚠️ On somme les colonnes ENCORE EN JEU, pas `columns`. Le filtre est écrit
  // ici et pas au moment de remplir les colonnes : le tableau doit garder ses
  // cinq colonnes, c'est le TOTAL qui n'a pas le droit de les additionner.
  const open = columns.filter(column => (OPEN_PIPELINE_STAGES as readonly string[]).includes(column.stage))
  const signed = columns.filter(column => column.stage === 'won')
  const sum = (of: readonly PipelineColumn[], key: 'count' | 'amount_cents' | 'without_amount') =>
    of.reduce((total, column) => total + column[key], 0)

  return {
    columns,
    intake,
    signals,
    generic_deductions: genericDeductions,
    total_count: sum(open, 'count'),
    total_amount_cents: sum(open, 'amount_cents'),
    total_without_amount: sum(open, 'without_amount'),
    signed_count: sum(signed, 'count'),
    signed_amount_cents: sum(signed, 'amount_cents'),
    signed_without_amount: sum(signed, 'without_amount'),
  }
}

/**
 * Ce qu'une transition d'étape entraîne mécaniquement : la date d'entrée bouge
 * toujours, et une sortie pose son issue et sa date de clôture. Pur, pour que
 * le service n'ait pas à réinventer la règle à chaque appel.
 */
export function stageTransitionEffects(
  next: ProjectStage,
  now: Date,
): { stage_entered_at: Date; closed_at: Date | null; outcome: ProjectOutcome | null } {
  if (next === 'won') return { stage_entered_at: now, closed_at: now, outcome: 'won' }
  if (next === 'lost') return { stage_entered_at: now, closed_at: now, outcome: 'lost' }
  // `dormant` n'est PAS une perte : plus rien ne bouge, personne n'a gagné, et
  // rien ne dit que c'est fini. Pas de date de clôture, pas d'issue.
  if (next === 'dormant') return { stage_entered_at: now, closed_at: null, outcome: null }
  // Rouvrir un projet clos efface sa clôture : la laisser afficherait « gagné le
  // 3 mars » sur un projet redevenu en négociation.
  return { stage_entered_at: now, closed_at: null, outcome: null }
}

/**
 * #3714 — LA CLASSIFICATION UNIQUE « généralité / fait documenté / travail ».
 *
 * Une ligne `projects` de nature `implication` est une DÉDUCTION de l'analyse
 * (« cette activité implique des systèmes critiques ») : tant que personne ne l'a
 * travaillée ni sourcée, ce n'est pas une affaire — l'écran du dossier, les
 * compteurs du pipe, les résumés de compte et Laura doivent la lire de la même
 * façon, donc la règle vit ICI, une fois (GA-26).
 *
 *  · `worked`     — une trace de travail humain existe (propriétaire, note,
 *                   action, qualification, montant, échéance, mission, étape
 *                   avancée). JAMAIS reclassée sur son titre : une affaire
 *                   mal intitulée reste une affaire.
 *  · `documented` — pas de travail, mais un fait ou un programme NOMMÉ : il
 *                   rejoint les signaux, sans promesse de besoin. « Climat »,
 *                   « Ambition 2026–2030 » ne sont pas interdits par mot-clé :
 *                   aucune lecture du titre ici.
 *  · `generic`    — déduction sans fait ni décision : quitte les priorités ET
 *                   les compteurs commerciaux ; reste lisible, en contexte
 *                   secondaire. Aucune donnée n'est effacée ni modifiée.
 */
export type ProjectNature = 'worked' | 'documented' | 'generic'

export type ProjectNatureInput = {
  kind: string
  stage: string
  source: string | null
  owner_id?: string | null
  amount_cents?: number | null
  expected_close_on?: string | null
  btmmp?: Btmmp | null
  next_action?: { title: string; due_on: string } | null
  has_next_action?: boolean | null
  has_mission?: boolean
  objective?: string | null
  risks?: string | null
  scope_label?: string | null
}

const filled = (value: string | null | undefined): boolean => typeof value === 'string' && value.trim().length > 0

function hasHumanWork(row: ProjectNatureInput): boolean {
  if (!(INTAKE_STAGES as readonly string[]).includes(row.stage)) return true
  if (filled(row.owner_id) || row.has_next_action === true || row.next_action) return true
  if (typeof row.amount_cents === 'number' || filled(row.expected_close_on)) return true
  if (row.has_mission === true) return true
  if (filled(row.objective) || filled(row.risks) || filled(row.scope_label)) return true
  return Object.values(row.btmmp ?? {}).some(value => typeof value === 'string' && filled(value))
}

export function projectNature(row: ProjectNatureInput): ProjectNature {
  if (hasHumanWork(row)) return 'worked'
  if (row.kind !== 'implication') return 'documented'
  return filled(row.source) ? 'documented' : 'generic'
}
