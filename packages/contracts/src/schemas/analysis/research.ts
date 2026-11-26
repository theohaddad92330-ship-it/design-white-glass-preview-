import { z } from 'zod'
import { declaredSignalEntryKindSchema } from '../declared-signal.js'
import { nullableString } from './base.js'
import {
  contractTypeSchema,
  entityRelevanceSchema,
  entityTypeSchema,
  importanceSchema,
  itAutonomySchema,
  severitySchema,
  signalKindSchema,
  siteTypeSchema,
  technologyMaturitySchema,
  timeframeSchema,
  urgencySchema,
} from './primitives.js'

/**
 * Research-phase payload: company facts, sites, programs, technology stack,
 * pains, signals, competitors. Defined by BELLUM-FACTS and BELLUM-RESEARCH
 * prompts (apps/ia/app/prompts/*.py).
 *
 * Wire shape is **snake_case** — see ./account-analysis.ts header.
 */

export const entityNodeSchema = z.object({
  name: nullableString,
  type: z.union([entityTypeSchema, z.string()]).optional().nullable(),
  parent: nullableString,
  region: nullableString,
  estimated_headcount: nullableString,
  it_autonomy: z.union([itAutonomySchema, z.string()]).optional().nullable(),
  // Deterministic relevance gate output (IA app/services/entities.py). Surfaced so
  // the cartography / organigramme can filter or badge non-actionable entities
  // instead of showing SGTM / SG Côte d'Ivoire / SPVs as normal targets (Théo p.6).
  // Previously stripped here because the schema is strict — that's the bug this fixes.
  relevance: z.union([entityRelevanceSchema, z.string()]).optional().nullable(),
  relevanceReason: nullableString,
  getsPlay: z.boolean().optional().nullable(),
  // Actionability flag (Théo p.6): true only for the seller's in-scope operating
  // entities (operational / marque / filiale_strategique / structural BU…). SPV,
  // cédée, homonyme and off-scope noise are false → the cartography defaults to the
  // actionable set and tucks the rest behind an "Autres entités" secondary tab.
  actionable: z.boolean().optional().nullable(),
  // #2302.38 (épopée #2961) — masquage par défaut d'une entité INACTIVE (à
  // distinguer d'une entité CÉDÉE, déjà couverte par `type: 'cedee'`). `false`
  // seulement sur preuve explicite dans les sources ; absent = jamais deviné
  // (bellum_facts.py, territory_resolver.py).
  is_active: z.boolean().optional().nullable(),
  // #2302.44 — masquage par défaut d'une adresse purement administrative sans
  // équipe opérationnelle. Même discipline : `false` seulement sur preuve,
  // absent sinon.
  has_team: z.boolean().optional().nullable(),
})
export type EntityNode = z.infer<typeof entityNodeSchema>

export const siteFranceSchema = z.object({
  city: nullableString,
  region: nullableString,
  type: z.union([siteTypeSchema, z.string()]).optional().nullable(),
  priority: nullableString,
  importance: z.union([importanceSchema, z.string()]).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  is_headquarters: z.boolean().optional().nullable(),
})
export type SiteFrance = z.infer<typeof siteFranceSchema>

export const technologyEntrySchema = z.object({
  name: nullableString,
  usage: nullableString,
  maturity: z.union([technologyMaturitySchema, z.string()]).optional().nullable(),
})
export type TechnologyEntry = z.infer<typeof technologyEntrySchema>

export const itChallengeSchema = z.object({
  title: nullableString,
  description: nullableString,
  severity: z.union([severitySchema, z.string()]).optional().nullable(),
  timeframe: z.union([timeframeSchema, z.string()]).optional().nullable(),
  /** #3978 — le domaine d'offre (code de PACK, `SIGNAL_DOMAIN_CODES`) classé par le modèle à l'analyse.
   *  Absent / vide = non classable : jamais deviné. Lu par `ProjectsService.materialize`. */
  domain_code: nullableString,
})
export type ItChallenge = z.infer<typeof itChallengeSchema>

// Deterministic age class stamped in IA phase 1 (Théo p.7/p.12): a signal older
// than ~24 months is an `archive`, not a live "à relancer" trigger.
export const signalFreshnessSchema = z.enum(['current', 'archive', 'undated'])
export type SignalFreshness = z.infer<typeof signalFreshnessSchema>

// #3206.3 (épopée #3240) — ADDITIF à `signalFreshnessSchema`, jamais un
// remplacement : granularité plus fine sur le MÊME calcul (mirror de
// `classify_temporal_status`, `signal_freshness.py`). Le pipeline IA
// (`temporal_status`, stampé sur `recentSignalSchema`) n'émet JAMAIS
// CURRENT_VERIFIED ni SUPERSEDED : les deux sont dérivés côté client
// (`classifyTemporalStatus`, `account.ts`) à partir d'un fait DÉJÀ posé en
// base — `last_verified_at` (`POST /signal-history/verify`) pour le premier,
// `history_status: 'resolved'` (`signal_history`, reste du 30/09) pour le
// second — jamais deviné d'une comparaison de texte entre signaux.
export const temporalStatusSchema = z.enum([
  'RECENT',
  'HISTORICAL',
  'STALE',
  'UNDATED',
  'CURRENT_VERIFIED',
  'SUPERSEDED',
])
export type TemporalStatus = z.infer<typeof temporalStatusSchema>

export const recentSignalSchema = z.object({
  /**
   * #2687 — l'identifiant du signal DANS cette analyse (« s1 », « s2 »…), et le
   * seul lien qu'une hypothèse qualifiée puisse citer.
   *
   * Il n'existait rien de tel, et rien d'autre ne faisait le lien : `sales_implication`
   * et `based_on_signals` sont du texte libre (le prompt demande une
   * reformulation, pas une citation), le signal n'a aucune catégorie commune
   * avec l'hypothèse, et les cardinalités diffèrent (MIN 4 signaux, MIN 3
   * hypothèses) — donc pas d'ordre exploitable non plus. Apparier sur le texte
   * serait un rapprochement par proximité : pire que l'absence, parce que ça a
   * l'air d'une réponse.
   *
   * ⚠️ Ce n'est PAS l'`id` que le web fabrique pour ses clés de rendu
   * (`${accountId}-watch-${index}`) : celui-là est un index dans une liste
   * dédupliquée et fusionnée, il ne survit pas à une analyse de plus.
   *
   * Optionnel par construction : les analyses écrites avant le lien n'ont pas la
   * clé, et un signal sans `id` se lit « cité par aucune hypothèse ».
   */
  id: nullableString,
  signal: nullableString,
  /** Le nom LISIBLE de la source — c'est lui que l'écran affiche. */
  source: nullableString,
  /**
   * Le jeton de traçabilité du scrape (« [P1] », « [O2] »).
   *
   * Il vivait DANS `source`, parce que le prompt le demandait là : la Veille et
   * le panneau « Sources du dossier » affichaient donc « [PR3] » à un
   * commercial, ce qui ne nomme ni média, ni registre, ni date. Les deux
   * informations sont séparées — le nom se lit, la référence se vérifie.
   */
  source_ref: nullableString,
  /**
   * #3922 — le LIEN vérifiable de la source, posé par le pipeline depuis le jeton
   * (`stamp_signal_urls`), jamais écrit par le modèle. Absent sur les signaux
   * collectés AVANT la capacité « lien » : l'écran le dit (collecte antérieure).
   */
  url: nullableString,
  /** #3922 — le genre de source (`press` | `bodacc` | `job` | `tender` | `official` | `other`). */
  source_kind: nullableString,
  /** #4020 / #4022 — le lieu d'une offre d'emploi, tel que collecté (`merge_collector_signals`).
   *  Absent = lieu non précisé : l'écran Opportunités le classe entre France et hors France, jamais deviné. */
  location: nullableString,
  /**
   * #4733.2 — le recrutement d'un DIRIGEANT (COO, CFO et fonctions de même rang), drapeau posé par l'IA sur
   * l'intitulé réel de l'offre (`is_executive_recruitment_title`), jamais deviné. Absent = non reconnu comme tel.
   */
  executive_role: z.boolean().nullish(),
  /** #4182.5 — le dossier « qui demande ce profil ? » d'une OFFRE, lu dans son texte par la collecte
   *  (`stamp_offer_requesters`). Absent = non composé : jamais complété ici. */
  requester: z
    .object({
      author: z.object({ kind: nullableString }).optional().nullable(),
      possibleManager: z
        .object({ function: nullableString, entity: nullableString, evidence: nullableString })
        .optional()
        .nullable(),
      team: nullableString,
      scope: z.object({ city: nullableString }).optional().nullable(),
      status: nullableString,
      method: z.array(z.string()).optional().nullable(),
      openFreelanceMission: z.boolean().optional().nullable(),
    })
    .optional()
    .nullable(),
  /** #4437.5 — le rattachement d'une OFFRE lu dans son intitulé (`stamp_offer_attachments`) : compétences, famille
   *  métier, type de fait, extrait. `unclassified` = « non classé ». Absent = collecte antérieure : jamais deviné. */
  offer_attachment: z
    .object({
      status: z.enum(['attached', 'unclassified']),
      fact_type: nullableString,
      skills: z.array(z.string()),
      job_family: nullableString,
      extract: nullableString,
    })
    .optional()
    .nullable(),
  type: z.union([signalKindSchema, z.string()]).optional().nullable(),
  date: nullableString,
  sales_implication: nullableString,
  /**
   * #2107.31 — l'AMPLEUR business du signal pour l'entreprise cible elle-même
   * (« transformation du groupe entier », « renfort ponctuel sur une seule
   * direction ») — distinct de `sales_implication` (« pourquoi c'est
   * pertinent pour l'ESN »). Produit par BELLUM-SIGNALS (`bellum_signals.py`),
   * jamais déduit du `type` : un mapping type → gravité serait une gravité
   * inventée, pas une lecture. `null` quand l'analyse n'a rien évalué.
   */
  impact: nullableString,
  /** #3978 — le domaine d'offre (code de PACK, `SIGNAL_DOMAIN_CODES`) classé par le modèle à l'analyse.
   *  Absent / vide = non classable : jamais deviné. Lu par `ProjectsService.materialize`. */
  domain_code: nullableString,
  freshness: signalFreshnessSchema.optional(),
  /** #3206.3 — additif à `freshness` (voir {@link temporalStatusSchema}). */
  temporal_status: temporalStatusSchema.optional().nullable(),
  /** #3206.2 — la fenêtre de fraîcheur (en jours) qui a servi à classer ce
   *  signal pour son type, exposée telle quelle depuis `archive_after_days()`. */
  freshness_window_days: z.number().int().optional().nullable(),
  /** #3206.2 (reste, épopée #3240) — la date du signal elle-même, ANALYSÉE et
   *  reformatée en ISO (`_parse_signal_date`, jamais une date inventée) : le
   *  fait devient valide le jour où il est observé. Absent sur un signal
   *  `undated` — sans date analysable, rien à borner. */
  valid_from: z.string().optional().nullable(),
  /** #3206.2 (reste, épopée #3240) — `valid_from` + `freshness_window_days`,
   *  la MÊME frontière qui décide déjà `current`/`archive` pour ce type
   *  (GA-26, jamais un second calcul). Absent avec `valid_from`. */
  valid_to: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  /**
   * #3668.7 — ce que la sélection déterministe a lu de ce signal
   * (`apps/ia/app/services/signal_selection.py`) : `lead` change la décision,
   * `context` (programme général, budget global, autre entité) l'éclaire sans
   * l'imposer. Absent sur les analyses antérieures : jamais lu comme `lead`
   * par défaut côté affichage seulement, le signal garde sa place.
   */
  selection_role: z.enum(['lead', 'context']).optional().nullable(),
  /** #3668.7 — l'entité réellement nommée : la cible, une autre, ou aucune (non vérifiée). */
  entity_match: z.enum(['target', 'other_entity', 'unverified']).optional().nullable(),
  /** #3668.7 — la phrase de la rétrogradation en contexte, affichée telle quelle. */
  selection_reason: nullableString,
  /**
   * #2634.1 — provenance d'un signal DÉCLARÉ (jamais détecté par l'IA) :
   * LinkedIn admis comme source de signaux d'achat UNIQUEMENT par une voie
   * autorisée (saisie manuelle, import d'un export déjà possédé par le
   * client, ou un futur connecteur officiel) — jamais un scraping.
   *
   * Absent = signal produit par le pipeline IA, exactement comme avant ce
   * lot : aucune régression sur les milliers de signaux déjà en base. Ces
   * quatre champs sont ce que l'écran affiche pour qu'un signal saisi à la
   * main ne se confonde jamais avec un signal détecté — ils n'ont pas la même
   * force de preuve (doctrine `c79_collecte_large_mais_propre`).
   */
  entry_kind: declaredSignalEntryKindSchema.optional(),
  /** ISO — quand la déclaration (saisie ou import) a été faite. Posé par le serveur. */
  declared_at: nullableString,
  /** Le nom de l'auteur, résolu à l'écriture. `null` = introuvable, ou `entry_kind` = `connector`. */
  declared_by_name: nullableString,
  /** Import seulement : la date de l'export tel que le client le possédait — distincte de `declared_at`. */
  document_date: nullableString,
})
export type RecentSignal = z.infer<typeof recentSignalSchema>

/**
 * #2687 — une hypothèse qualifiée : ce que l'analyse déduit d'un faisceau de
 * signaux, et ce qu'elle propose d'en faire.
 *
 * Elle était produite depuis #275 et **invisible du web** : `qualified_hypotheses`
 * n'était pas déclaré dans `accountAnalysisShape`, et `parseAccountAnalysis` ne
 * garde que les clés déclarées. L'angle ESN était calculé, stocké, et personne
 * ne pouvait le lire — le motif « du code juste que personne n'appelle »,
 * ici dans sa variante « une donnée juste que personne ne peut lire ».
 *
 * `confidence` n'est PAS une probabilité : c'est une échelle de convergence
 * (1 signal → `a_verifier`, 2 → `probable`, 3+ → `confirmee`), plafonnée côté IA
 * par le nombre de signaux distincts. Elle se conteste signal par signal ; une
 * « chance de closing » ne se conteste pas, et reste refusée (`c26_probabilite`).
 */
export const qualifiedHypothesisSchema = z.object({
  hypothesis: nullableString,
  /** Les signaux fondateurs, EN PROSE — une reformulation, pas une citation.
   *  Lisible par un humain, inutilisable comme clé de rapprochement. */
  based_on_signals: z.array(z.string()).optional(),
  /** Les `recent_signals[].id` fondateurs — LE lien, et le seul. */
  based_on_signal_ids: z.array(z.string()).optional(),
  confidence: nullableString,
  /** L'offre / le renfort ESN à proposer sur cette hypothèse. */
  esn_angle: nullableString,
  /** La première action, qui TESTE l'hypothèse sans la présenter comme un fait. */
  first_action: nullableString,
})
export type QualifiedHypothesis = z.infer<typeof qualifiedHypothesisSchema>

export const painPointSchema = z.object({
  pain: nullableString,
  business_impact: nullableString,
  esn_offer: nullableString,
  urgency: z.union([urgencySchema, z.string()]).optional().nullable(),
  /** #3978 — le domaine d'offre (code de PACK, `SIGNAL_DOMAIN_CODES`) classé par le modèle à l'analyse.
   *  Absent / vide = non classable : jamais deviné. Lu par `ProjectsService.materialize`. */
  domain_code: nullableString,
})
export type PainPoint = z.infer<typeof painPointSchema>

export const competitorSchema = z.object({
  name: nullableString,
  contract_type: z.union([contractTypeSchema, z.string()]).optional().nullable(),
  strengths: nullableString,
  weaknesses: nullableString,
})
export type Competitor = z.infer<typeof competitorSchema>

export const programNameSchema = z.object({
  name: nullableString,
  entity: nullableString,
  budget: nullableString,
  description: nullableString,
  /** #3677.7 — l'OBJECTIF, le PÉRIMÈTRE documenté et l'HORIZON : portés seulement quand la source les dit, jamais déduits. */
  objective: nullableString,
  scope: nullableString,
  horizon: nullableString,
})
export type ProgramName = z.infer<typeof programNameSchema>

/**
 * Une note de lecture GÉNÉRIQUE — un fait nommé, avec son CONSTAT, son
 * INTERPRÉTATION, son IMPLICATION commerciale et sa FIABILITÉ (FINIR-V2-27-09,
 * dossier SG complet, blocs `01_LECTURE_STRUCTURELLE`, `14_ECOSYSTEME`,
 * `15_DOMAINES_OPPORTUNITE`, `16_INDICATEURS`, `17_GARDE_FOUS`).
 *
 * Générique à dessein — « utilisable par toute analyse », pas seulement le
 * compte SG : un axe de lecture, un acteur tiers de l'écosystème, un domaine
 * d'opportunité, un indicateur financier ou une mise en garde partagent tous
 * la même forme (un libellé + un constat qu'on interprète et dont on tire une
 * implication commerciale, avec sa fiabilité déclarée) — aucun n'avait de
 * champ d'accueil avant ce lot.
 *
 * `amount`/`currency`/`period` restent `null` sauf quand la note porte
 * effectivement un chiffre daté (bloc `16_INDICATEURS`) — jamais déduits.
 *
 * ⚠️ Ce n'est PAS un score, ni un pourcentage de chance : aucune probabilité
 * n'y est portée (doctrine `c26_probabilite`) — seulement le fait, sa lecture
 * et sa fiabilité DÉCLARÉE par la source.
 */
export const keyNoteSchema = z.object({
  label: nullableString,
  constat: nullableString,
  interpretation: nullableString,
  implication: nullableString,
  reliability: nullableString,
  amount: z.number().optional().nullable(),
  currency: nullableString,
  period: nullableString,
})
export type KeyNote = z.infer<typeof keyNoteSchema>
