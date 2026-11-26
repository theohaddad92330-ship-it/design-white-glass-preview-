import { z } from 'zod'
import { ACCOUNT_SCORE_GO_MIN } from './account-score.js'
import { accountEntityKindSchema } from './account-entity.js'
import { priorityGateSchema } from './priority-gate.js'
import { paginatedResultSchema } from './pagination.js'
import { analysisVersioningSchema } from './analysis-versioning.js'
import { analysisRunDepthSchema } from './analysis.js'
import { temporalStatusSchema, type TemporalStatus } from './analysis/research.js'
import { SPRINT_LEVELS } from './sprint.js'
import { discoverOriginCriteriaSchema } from './discover-origin.js'
import { relationshipStateSchema } from './sales-context.js'
import { monthDayBeforeYear } from './signal-date.js'

/**
 * État de l'ANALYSE d'un compte.
 *
 * `prospect` est le seul état qui ne décrit PAS un run : c'est un compte versé
 * au portefeuille depuis Découvrir (« Ajouter à mon portefeuille ») et JAMAIS
 * analysé. Il existe parce que le geste doit être réel — il attribue le compte
 * à son commercial (`assigned_to`) et le fait apparaître dans le portefeuille et
 * dans la couverture du manager — sans consommer de crédit ni fabriquer un
 * dossier vide qu'on ferait passer pour une analyse.
 */
export const analysisStatusSchema = z.enum([
  'prospect',
  'analyzing',
  'completed',
  'error',
  'canceled',
  'archived',
  'deleted',
  // MEYER-IMPORT M.4 — un compte VERSÉ par un import de fichier (CRM d'origine) : à compléter, jamais analysé.
  // La valeur est déjà écrite par l'import (`status: 'imported'`) ; la lister rend l'écran capable de la nommer.
  'imported',
])

/**
 * Verser un candidat de Découvrir dans son portefeuille. Le SIREN est la clé de
 * dédoublonnage quand il est connu : re-verser le même candidat ne crée pas un
 * second compte, il (ré)attribue celui qui existe.
 */
export const addToPortfolioSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  siren: z.string().trim().min(1).max(20).optional(),
  sector: z.string().trim().min(1).max(200).optional(),
  website: z.string().trim().min(1).max(300).optional(),
})
export type AddToPortfolioInput = z.infer<typeof addToPortfolioSchema>

/**
 * Cycle de vie COMMERCIAL d'un compte — distinct du `status` d'ANALYSE
 * (Théo p.39 : l'onglet « À suivre » était câblé sur `status='analyzing'`, un
 * état technique transitoire, au lieu d'un tri commercial persistant).
 *
 *  - `inbox`       → analysé, pas encore trié par le commercial (défaut)
 *  - `watching`    → « En observation » — prospect gardé au chaud
 *  - `opportunity` → deal en cours de qualification / opportunité active
 *  - `customer`    → client gagné
 *  - `archived`    → écarté du pipe commercial
 *  - `opening`     → #2117.19 — l'ouverture du compte est ENGAGÉE : le travail
 *                    a commencé, rien n'est signé. L'étape qui manquait entre
 *                    « À potentiel » et « Client actif ».
 *  - `dormant`     → #2117.21 — « En veille » : le commercial SUSPEND le
 *                    travail sur ce compte, en disant pourquoi. Ni écarté (on y
 *                    revient) ni suivi (rien n'est attendu de personne).
 *
 * Le `status` d'analyse reste la vérité technique (analyzing/completed/error…) ;
 * `commercial_status` est piloté par le commercial + pré-classé au run selon le
 * score (voir `deriveCommercialStatusOnComplete`).
 */
export const COMMERCIAL_LIFECYCLE_VALUES = [
  'inbox',
  'watching',
  'opportunity',
  'customer',
  'archived',
  // #2117.19 / #2117.21 (Louis, 15/09/2026) — AJOUTÉES EN FIN, jamais insérées
  // au milieu : la colonne `accounts.commercial_status` porte la valeur ÉCRITE,
  // et l'index de cette liste se lit comme une progression (GA-08). Les cinq
  // premières ne bougent pas, et aucune n'est renommée — ce sont les LIBELLÉS
  // qui changent (#2117.17 / #2117.20), jamais les clés.
  'opening',
  'dormant',
] as const

export const commercialLifecycleSchema = z.enum(COMMERCIAL_LIFECYCLE_VALUES)
export type CommercialLifecycle = z.infer<typeof commercialLifecycleSchema>

/**
 * Le libellé de chaque valeur, en français, pour ce qui ne passe PAS par i18n
 * (contrat, tests, outils internes). L'écran lit
 * `accounts:commercialStatus.<clé>` — les deux doivent dire le même mot, et
 * c'est exactement ce qui avait cessé d'être vrai : cette table gardait
 * « À trier », « À suivre », « Opportunité », « Client » et « Écarté » pendant
 * que l'écran disait déjà autre chose. Une copie oubliée dit l'ancien mot.
 *
 * #2117.17 « À qualifier » (ex-« À trier ») · #2117.20 « Client actif »
 * (ex-« Client ») — tranchés par Louis le 15/09/2026.
 */
export const COMMERCIAL_LIFECYCLE_LABELS: Record<CommercialLifecycle, string> = {
  inbox: 'À qualifier',
  watching: 'En observation',
  opportunity: 'À potentiel',
  customer: 'Client actif',
  archived: 'Hors priorité',
  opening: "En cours d'ouverture",
  dormant: 'En veille',
}

/**
 * Coupure du pré-classement commercial : au-dessus, « Opportunité » ; en
 * dessous, « À suivre ».
 *
 * C'est la MÊME coupure que la bande GO du score — pas une valeur voisine, la
 * même (D44, Louis, 28/08/2026). Elle a un nom à elle parce qu'elle répond à
 * une autre question (« où ranger ce compte ? » et non « quel badge ? »), pas
 * parce qu'elle vaudrait autre chose : elle EMPRUNTE
 * {@link ACCOUNT_SCORE_GO_MIN}, elle ne le recopie pas.
 *
 * Elle a coupé à 7,5 pendant que la bande coupait à 7 — les deux nombres
 * avaient la même origine, l'un a bougé sans l'autre, et le symptôme était un
 * compte noté 7 affiché « GO » et rangé « À suivre ». Louis a aligné sur 7,
 * parce que la bande est ce que l'utilisateur VOIT. Le reclassement des comptes
 * existants est fait par la migration `CommercialStatusCutoffSeven`.
 */
export const COMMERCIAL_OPPORTUNITY_SCORE_MIN = ACCOUNT_SCORE_GO_MIN

/**
 * Pré-classement commercial appliqué à la fin d'un run, UNIQUEMENT si le compte
 * est encore dans l'`inbox` (le tri manuel du commercial n'est jamais écrasé).
 * Score ≥ {@link COMMERCIAL_OPPORTUNITY_SCORE_MIN} → opportunité, sinon à
 * suivre. La coupure n’est PAS retapée ici : elle EST la bande de score que
 * l’utilisateur voit (D44 · 26/08). Elle a valu 7,5 ici pendant que la bande
 * valait 7 — un compte noté 7 s’affichait « GO » et se rangeait « À suivre ».
 *
 * ⚠️ Elle FAIT AUTORITÉ (D53, 26/08) : `AccountsService.markCompleted`
 * l'APPELLE, et son SQL ne connaît plus ni la coupure ni les deux issues — il
 * reçoit le verdict en paramètre. Le SQL en tenait une seconde copie ; les deux
 * ont fini par ne plus dire la même chose, et personne ne pouvait le voir parce
 * que rien n'exerçait cette fonction. La coupure vit ICI et nulle part ailleurs.
 *
 * Ce que le SQL garde, et qu'il doit garder : la GARDE « seulement depuis
 * l'inbox », dans son `CASE`, sous le verrou de ligne — une correction humaine
 * gagne toujours, y compris contre un run qui se termine au même instant.
 */
export function deriveCommercialStatusOnComplete(
  current: CommercialLifecycle,
  priorityScore: number | null | undefined,
): CommercialLifecycle {
  if (current !== 'inbox') return current
  // Score absent → « à suivre » : c'est le côté PRUDENT du doute, pas un zéro
  // affiché. Aucune valeur n'est rendue à l'écran ici, seulement un rangement.
  if (priorityScore == null) return 'watching'
  return priorityScore >= COMMERCIAL_OPPORTUNITY_SCORE_MIN ? 'opportunity' : 'watching'
}

/* ------------------------------------------------------------------ */
/*  Mémoire de relation — couche zéro (annexe méthodo p8)             */
/* ------------------------------------------------------------------ */

/**
 * Le bloc « Mémoire » de la couche zéro (annexe méthodo p8) : ce que l'ESN SAIT
 * déjà de sa relation avec le compte, stocké pour être relu au run suivant.
 *
 * La couche zéro lisait le CRM connecté et la prospection inversée, mais rien ne
 * PERSISTAIT ce que le commercial apprend (« relation, date, owner, prochaine
 * revue, issue, source »). Cet objet le capture — éditable, jamais deviné : un
 * champ vide reste vide.
 *
 * NB : les autres entrées p8 (ATS, Drive, e-mails, notes, CV envoyés) exigent
 * chacune un connecteur dédié et restent hors scope ; c'est la MÉMOIRE de
 * relation qui manquait comme objet.
 */
export const relationshipMemorySchema = z.object({
  /** L'état de la relation en clair (« ancien client », « référé par X »…). */
  relation: z.string().max(500).nullish(),
  /**
   * #3246.relation (décision Louis 16/10/2026) — le STADE de la relation, choisi
   * par le commercial dans la liste fermée `relationshipStateSchema`. Le texte
   * libre `relation` ci-dessus reste et n'est JAMAIS parsé pour remplir ce champ.
   * Absent = la relation n'entre pas dans la similarité des cas (jamais 0).
   */
  relationStage: relationshipStateSchema.nullish(),
  /** Dernier contact connu (ISO `YYYY-MM-DD`). */
  lastContactAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'lastContactAt must be YYYY-MM-DD')
    .nullish(),
  /** Qui, côté ESN, porte la relation. */
  owner: z.string().max(200).nullish(),
  /** Prochaine revue prévue (ISO `YYYY-MM-DD`). */
  nextReviewAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'nextReviewAt must be YYYY-MM-DD')
    .nullish(),
  /** L'issue de la dernière interaction (« pas de budget cette année »…). */
  issue: z.string().max(1000).nullish(),
  /** D'où vient cette mémoire (CRM, e-mail, réseau, mission passée…). */
  source: z.string().max(200).nullish(),
  /**
   * Ce que le commercial sait de SA position sur ce compte (#1085) : le
   * prestataire en place et son échéance, une référence comparable qu'on peut
   * citer, un différenciateur qui a déjà marché ici.
   *
   * ⚠️ Ce N'EST PAS un fait de relation, et le formateur le range dans un bloc
   * SÉPARÉ pour cette raison : un avantage se connaît sans avoir jamais parlé au
   * compte. Le mélanger aux champs ci-dessus ferait conclure « ce compte n'est
   * pas froid » à quelqu'un qui a seulement écrit ce qu'il sait vendre.
   */
  competitiveEdge: z.string().max(2000).nullish(),
})
export type RelationshipMemory = z.infer<typeof relationshipMemorySchema>

/** Le corps de `PATCH /accounts/:id/relationship-memory` — mise à jour partielle. */
export const updateRelationshipMemorySchema = relationshipMemorySchema
export type UpdateRelationshipMemory = z.infer<typeof updateRelationshipMemorySchema>

/**
 * Le porteur d'un compte, NOMMÉ.
 *
 * Restitution V2 §4 : « prévoir un signal visuel "déjà exploré par un collègue"
 * dans les workspaces multi-utilisateurs ». Deux champs, et pas un de plus :
 * l'identifiant sert à savoir si c'est SOI, le nom à l'afficher.
 *
 * ⚠️ Aucun critère protégé n'entre ici (GA-06) — ni photo, ni rôle, ni rien qui
 * permettrait d'ordonner des personnes. Un porteur se DÉSIGNE, il ne se classe
 * pas.
 */
export const accountOwnerSchema = z.object({
  user_id: z.string(),
  /** Prénom + nom, à défaut l'email. Jamais un uuid brut à l'écran. */
  name: z.string(),
})
export type AccountOwner = z.infer<typeof accountOwnerSchema>

/**
 * #2128.2 — la BU (agence/unité) du compte, NOMMÉE. `business_unit_id`
 * vivait déjà sur `account.entity.ts` mais n'atteignait aucun schéma : un uuid
 * brut ne s'affiche pas, c'est la dérivation (nom résolu) qui manquait, pas la
 * donnée — même motif que {@link accountOwnerSchema} juste au-dessus.
 */
export const accountBusinessUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
})
export type AccountBusinessUnit = z.infer<typeof accountBusinessUnitSchema>

/**
 * #2128.19 — un COLLÈGUE a déjà une analyse EN COURS sur ce compte.
 *
 * Chevauchement distinct du porteur ({@link accountOwnerSchema}) : deux
 * commerciaux peuvent relancer la MÊME entreprise sans le savoir, chacun
 * payant son propre run. `started_at` est daté (jamais une phrase), et
 * `colleague` est nommé — même patron que {@link accountOwnerSchema} : pas de
 * critère protégé, pas de compteur, juste un fait et une date (GA-06).
 */
export const accountActiveAnalysisSchema = z.object({
  colleague: z.object({ user_id: z.string(), name: z.string() }),
  started_at: z.string(),
})
export type AccountActiveAnalysis = z.infer<typeof accountActiveAnalysisSchema>

/**
 * D'où vient un compte — la seule attribution honnête du §12.
 *
 * `null` sur tout compte antérieur au déploiement, et ça le reste : lui
 * attribuer une origine rétroactivement inventerait une histoire. Le compteur
 * de contribution les exclut et DIT combien il en exclut.
 */
export const ACCOUNT_ORIGINS = ['discover', 'search', 'import', 'crm', 'manual'] as const
export const accountOriginSchema = z.enum(ACCOUNT_ORIGINS)
export type AccountOrigin = (typeof ACCOUNT_ORIGINS)[number]

export const accountSchema = z.object({
  id: z.string().guid(),
  user_id: z.string().guid(),
  company_name: z.string(),
  // Nom commercial, quand il diffère de la raison sociale (#2117.9). Même
  // geste que `phone` / `address` juste en dessous : aucune collecte ne le
  // remplit, saisi à la main (migration `1796321725100`).
  trade_name: z.string().nullable().optional(),
  sector: z.string().nullable(),
  employees: z.string().nullable(),
  revenue: z.string().nullable(),
  headquarters: z.string().nullable(),
  website: z.string().nullable(),
  // Champs de fiche saisis à la main (socle CRM, migration `1789301274613`) :
  // aucune collecte ne les remplit. `phone` est le standard, `address` l'adresse
  // de travail — distincte de `headquarters`, qui porte le siège du registre.
  // `.optional()` parce que les réponses antérieures ne les portent pas.
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  // Legacy denormalised columns. The same data lives strictly typed inside
  // ``raw_analysis``; we keep these as ``unknown[]`` so existing rows + tests
  // built against ad-hoc shapes don't have to migrate at once.
  subsidiaries: z.array(z.unknown()).default([]),
  it_challenges: z.array(z.unknown()).default([]),
  recent_signals: z.array(z.unknown()).default([]),
  priority_score: z.number().nullable(),
  priority_justification: z.string().nullable(),
  // Stored as a permissive ``Record<string, unknown>`` so the column accepts
  // any legacy/in-flight blob. Consumers should call ``parseAccountAnalysis``
  // (see ``./analysis/account-analysis``) to get the strictly typed view.
  raw_analysis: z.record(z.string(), z.unknown()).nullable(),
  status: analysisStatusSchema,
  // Tri commercial persistant (cf. `commercialLifecycleSchema`). Optionnel :
  // les lignes legacy antérieures à la migration n'ont pas la colonne — le
  // service la lit avec un fallback `'inbox'`.
  commercial_status: commercialLifecycleSchema.optional(),
  /**
   * La porte G1 (PDF 2 §4.4 B2) : est-ce qu'on travaille ce compte ?
   *
   * ⚠️ Axe DIFFÉRENT de `commercial_status` juste au-dessus, qui dit où en est
   * la relation. Un client peut être mis en veille sans cesser d'être client ;
   * les fusionner le ferait disparaître de la facturation. Optionnel : un
   * instantané d'avant ce déploiement n'a pas la clé.
   */
  priority_gate: priorityGateSchema.optional(),
  gate_reason: z.string().nullable().optional(),
  gate_decided_at: z.string().nullable().optional(),
  /**
   * #3407.1 (beta 30/09/2026) — le NIVEAU D'EFFORT du board (`sprint.ts`),
   * REPRIS ici pour que la LISTE (`/accounts`) puisse le montrer sans forcer
   * un aller au board (`?lens=effort`) pour une simple lecture. La colonne
   * existe depuis `1789996184270-AccountSprint.ts` / `1796373242104-
   * SprintPortfolioDecision.ts` ; ce contrat ne fait que cesser de la garder
   * pour lui seul — même geste que `naf_code` juste en dessous (#2265.14).
   * `null`/absent = aucun niveau posé, jamais un niveau deviné.
   */
  sprint: z.enum(SPRINT_LEVELS).nullable().optional(),
  /** Pourquoi ce compte est à ce niveau (`SprintDecisionFields.reason`). */
  sprint_reason: z.string().nullable().optional(),
  /** Prochaine date à laquelle ce classement se rediscute (ISO `YYYY-MM-DD`). */
  sprint_review_at: z.string().nullable().optional(),
  // « Le plan se replanifie après chaque réponse » (annexe méthodo p27) : posé
  // quand un événement contact (réponse, RDV, bounce, refus) périme le plan.
  // L'app affiche alors un nudge — c'est le clic de l'utilisateur qui replanifie
  // (on ne dépense jamais un crédit sans clic). NULL/absent = rien en attente.
  replan_suggested_at: z.string().nullable().optional(),
  // Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8).
  // Ce que l'ESN sait déjà de sa relation avec le compte, éditable et relu au run
  // suivant. NULL/absent = aucune mémoire saisie.
  relationship_memory: relationshipMemorySchema.nullable().optional(),
  error_message: z.string().nullable(),
  user_context: z.string().nullable(),
  api_cost_euros: z.number().nullable(),
  // Pappers SIREN (9-digit French company id). Persisted from Phase 1 so the
  // per-company result cache can key on it. Nullable for legacy / non-FR rows.
  siren: z.string().nullable().optional(),
  // Registry NAF/APE code (e.g. "62.01Z"). Persisted from Phase 1 so "comptes
  // similaires" (Théo p.41) can seed discovery by NAF proximity. Nullable/legacy.
  naf_code: z.string().nullable().optional(),
  // #2265.14 — même jugement que le badge « intermédiaire, pas client final »
  // de /discover, calculé sur ce même NAF (`classify_actor_type`, apps/ia).
  // NULL = compte jamais rejoué depuis ce lot, jamais un `false` deviné.
  actor_type: z.string().nullable().optional(),
  is_intermediary: z.boolean().nullable().optional(),
  // Cross-border canonical-account pivot (non-FR markets) : identifiant registre
  // national CANONIQUE (CIK US / corp id CA / UID CH / BCE BE / RCS LU) + pays du
  // registre. FR backfillé depuis ``siren`` ; NULL sur les lignes FR récentes
  // (le chemin français reste ancré sur ``siren``). Migration 1785860000000.
  registry_id: z.string().nullable().optional(),
  registry_country: z.string().nullable().optional(),
  // Logo réel renvoyé par Apollo Organizations Enrich (migration 1785930000000).
  // NULL = pas de logo Apollo → le front peut afficher le favicon réel du site
  // en fallback (calculé à l'affichage, jamais persisté). Rien d'inventé.
  logo_url: z.string().nullable().optional(),
  // Bloc firmographique FACTUEL du même appel Apollo (employés estimés,
  // industrie, fondation, LinkedIn/Twitter, funding, technologies) — stocké
  // AS-IS en camelCase (AnalysisApolloOrgEnrichment). Champ absent = absent.
  apollo_enrichment: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  // ``updated_at`` doubles as ``refreshed_at`` (the trigger bumps it on every
  // write, and the last write of a run is the ``completed`` flip). ``age_days``
  // is the derived whole-day staleness the API surfaces on the detail payload
  // so the UI can flag dossiers worth refreshing. Optional/nullable — only the
  // detail GET sets it; list rows omit it.
  age_days: z.number().nullable().optional(),
  // Vraie date de « dernière analyse » = ``MAX(analysis_runs.completed_at)`` sur
  // les runs TERMINÉS. ``null`` = aucun run terminé connu (compte jamais analysé,
  // ou compte legacy antérieur au suivi des runs). Jamais dérivée de
  // ``created_at`` côté API — la retombée éventuelle sur la date de création est
  // un choix de présentation, explicite, côté client. Optionnel : présent sur le
  // détail ET les lignes de liste.
  last_analyzed_at: z.string().nullable().optional(),
  /** #3682.5 — la veille automatique RÉELLEMENT configurée pour ce compte ; absent/null = aucune (jamais un « 24 h » supposé). */
  watch_cadence: z.enum(['daily']).nullable().optional(),
  /** #4283.8 — le jour (AAAA-MM-JJ, Paris) de la prochaine ré-analyse automatique d'un compte SUIVI ; absent/null = aucune annoncée. */
  next_reanalysis_at: z.string().nullable().optional(),
  /** Recette 21/10 K4 — pourquoi un compte SUIVI n'a pas de date de ré-analyse : veille suspendue, ou jamais analysé. Null = date présente. « not_followed » = compte non suivi (recette 22/10 K4). */
  next_reanalysis_reason: z.enum(['suspended', 'never_analyzed', 'not_followed']).nullable().optional(),
  /** #3682.3 — vérification ≠ événement : deux dates, une seule lecture (`summarizeSignalFreshness`). */
  /** LUDOVIC-C LC.8 — le signal DOMINANT, même lecture que la ligne de liste (`AccountListItem.signal_preview`). */
  signal_preview: z
    .object({
      label: z.string(),
      source: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      date: z.string().nullable().optional(),
      freshness: z.enum(['current', 'archive', 'undated']).nullable().optional(),
    })
    .nullable()
    .optional(),
  signal_freshness: z
    .object({
      verifiedAt: z.string().nullable(),
      eventDate: z.string().nullable(),
      state: z.enum(['current', 'historical', 'undated', 'none']),
    })
    .optional(),
  // #2117.41-45 — la fraîcheur PAR DIMENSION. Écrites par `AnalysisRefreshService`
  // (`apps/api/src/modules/analysis/analysis-refresh.service.ts`) à chaque
  // rafraîchissement ciblé (« Rafraîchir un axe » du menu « … ») depuis
  // l'addendum Théo P1 — la colonne existait déjà sur `AccountEntity`, le
  // commentaire qui l'écrit disait « lue par l'écran » et rien ne la lisait :
  // c'est le défaut n°1 du dépôt (code juste que personne n'appelle) vu côté
  // contrat. `entities_refreshed_at` est la fraîcheur de l'ORGANIGRAMME — la
  // structure de l'entreprise — d'où « observation structurelle » côté écran.
  // Nullable = jamais rafraîchi sur cet axe depuis (ou compte antérieur à la
  // colonne) ; l'écran affiche alors « non mesuré », jamais une date devinée.
  signals_refreshed_at: z.string().nullable().optional(),
  contacts_refreshed_at: z.string().nullable().optional(),
  entities_refreshed_at: z.string().nullable().optional(),
  strategy_refreshed_at: z.string().nullable().optional(),
  // #AF.2-.3 (18/09/2026) — la date de la dernière collecte RÉELLE du segment
  // contacts (pipeline complet OU rafraîchissement ciblé), distincte de
  // `contacts_refreshed_at` ci-dessus qui ne porte que le geste « Rafraîchir ».
  // Écrite par `AnalysisPersistenceService.saveContacts`. C'est CETTE date que
  // l'écran compare à `SEGMENT_CAPABILITY_EPOCH.contacts` pour son aveu de
  // fraîcheur — `isSegmentCollectionStale`. Nullable = jamais datée (tous les
  // dossiers antérieurs à ce lot), traité comme CONCERNÉ par un rattrapage.
  contacts_collected_at: z.string().nullable().optional(),
  // LUDOVIC-C LC.1 — la remise de l'existant aux règles actuelles (homonymes), sans recollecte.
  // Comparée à `CONTACT_RULES_CAPABILITY.at` par `isContactRulesCatchupNeeded`.
  contacts_rules_applied_at: z.string().nullable().optional(),
  // #2543.7 (18/09/2026) — même rôle que `contacts_collected_at`, pour les
  // trois autres segments rejouables séparément. Écrites respectivement par
  // `AccountsService.applyResearch`, `AnalysisPersistenceService.saveOrgChart`
  // et `savePlan`. Nullable = jamais datée (tous les dossiers antérieurs à ce
  // lot), traité comme CONCERNÉ par un rattrapage — jamais présumé à jour.
  signals_collected_at: z.string().nullable().optional(),
  entities_collected_at: z.string().nullable().optional(),
  strategy_collected_at: z.string().nullable().optional(),
  // #2118.51 (18/09/2026) — le CINQUIÈME segment : la lecture du dossier en
  // sept axes (`evaluation.dossier_read`, #2118), distincte de `strategy` —
  // une future capacité sur l'angle/mode d'entrée ne doit jamais dater cette
  // colonne, et réciproquement. Écrite par `AnalysisPersistenceService
  // .savePlan`, au même point que `strategy_collected_at`. Nullable = jamais
  // datée (tout dossier antérieur à ce lot), CONCERNÉE par un rattrapage.
  dossier_read_collected_at: z.string().nullable().optional(),
  // #4078 (14/10/2026) — le SEPTIÈME segment : les cinq blocs du dossier complet (axes
  // de lecture, écosystème, domaines d'opportunité, indicateurs financiers, garde-fous),
  // écrits par `DossierBlocksStep` après l'analyse. Nullable = jamais datée.
  dossier_blocks_collected_at: z.string().nullable().optional(),
  /**
   * #2128.1 — QUI PORTE CE COMPTE, sur le DOSSIER comme sur la liste.
   *
   * Dérivé de `accounts.assigned_to` et NOMMÉ côté serveur par
   * `AccountsService.resolveOwnerNames` — la seule dérivation du nom de porteur
   * du dépôt, et elle le reste : recomposer « prénom + nom, à défaut l'email »
   * une deuxième fois côté navigateur (depuis `GET /workspaces/members`, qui
   * dit `fullName ?? email`) donnerait deux libellés pour la même personne
   * (GA-26).
   *
   * ⚠️ Le champ vivait UNIQUEMENT sur `accountListItemSchema` jusqu'au
   * 14/09/2026, alors que `GET /accounts/:id` répond déjà `SELECT a.*` : la
   * colonne `assigned_to` arrivait donc au navigateur sur le dossier sans être
   * au contrat, et sans qu'aucun écran ne la lise. Le monter ICI est ce qui
   * rend le bandeau Collaboration possible sans inventer de second chemin.
   *
   * ⚠️ TROIS ÉTATS, et ils ne se rendent pas pareil — « non mesuré » n'est
   * jamais « 0 », ni un vide muet (GA-18/GA-19) :
   *  · un objet — quelqu'un porte ce compte, et il est nommé ;
   *  · `null` — la lecture a eu lieu, PERSONNE ne le porte. L'écran le DIT
   *    (« propriétaire non renseigné »), il ne laisse pas la ligne vide ;
   *  · ABSENT — une API antérieure à ce champ. L'écran n'affirme alors rien du
   *    tout, surtout pas « non attribué », qui serait une affirmation.
   */
  owner: accountOwnerSchema.nullable().optional(),
  /**
   * #2128.2 — la BU (agence/unité), NOMMÉE. Mêmes trois états que
   * {@link accountOwnerSchema.owner} ci-dessus : un objet (BU connue), `null`
   * (lu, aucune BU posée sur ce compte), ou ABSENT (réponse antérieure à ce
   * champ — l'écran n'affirme alors rien).
   */
  business_unit: accountBusinessUnitSchema.nullable().optional(),
  /**
   * #2128.19 — même TROIS états que {@link accountOwnerSchema.owner} :
   *  · un objet — un collègue a une analyse `analyzing` en cours sur ce
   *    compte, nommé et daté ;
   *  · `null` — lu, aucune analyse en cours par un AUTRE que l'appelant ;
   *  · ABSENT — réponse antérieure à ce champ, l'écran n'affirme rien.
   */
  active_analysis_by_colleague: accountActiveAnalysisSchema.nullable().optional(),
  /**
   * #2265.5 (épopée #2851) — CE compte est-il un PARTENAIRE que l'espace a
   * DÉCLARÉ (`account_partners.relationship = 'partner'`, même nom sur un
   * autre compte) ? Un fait saisi ou confirmé par l'équipe, jamais deviné :
   * `true` ou ABSENT — l'état ordinaire n'affirme rien.
   */
  is_declared_partner: z.boolean().optional(),
  /**
   * #2159.26 — les ÉTIQUETTES du compte, normalisées (`normalizeTags`,
   * `tags.ts`). `[]` = aucune étiquette. Optionnel : une réponse antérieure à
   * la colonne ne la porte pas.
   */
  tags: z.array(z.string()).optional(),
  /**
   * Import universel (Louis 27/09/2026) — les colonnes d'un fichier importé
   * SANS champ d'accueil, sous leur en-tête d'origine. `{}` = rien d'importé en
   * plus ; optionnel : une réponse antérieure à la colonne ne la porte pas.
   */
  extra: z.record(z.string(), z.string()).optional(),
  /**
   * #2319.5 — LE LIEN CAPITALISTIQUE, tel qu'observé par le registre (Pappers
   * `/v2/entreprise/cartographie`, migration `1795650000000`). Les colonnes
   * existaient déjà en base (`accounts.group_role`, `.group_head_siren`,
   * `.group_link_observed_at`) — écrites par `AccountsService` pour le filtre
   * Groupe/filiale de Découvrir (#2165.24) et jamais montées jusqu'au contrat,
   * alors que `GET /accounts/:id` les rend déjà (`SELECT a.*`) : même défaut
   * que `owner` ci-dessus, monté ici pour la même raison — un rendez-vous se
   * prépare aussi en sachant si le compte en face EST une filiale.
   *
   * ⚠️ Un fait DATÉ, jamais deviné (doctrine du fichier de migration) :
   * `group_role` seul ne dit pas si le lien tient encore. `group_link_observed_at`
   * est donc la date qui permet à un bloc du brief de citer CETTE observation-là
   * plutôt qu'une autre écriture de la fiche (même règle que `last_analyzed_at`
   * face à `updated_at`).
   *
   * `null` = lu, aucun lien connu. Optionnel : une réponse antérieure à ces
   * colonnes ne les porte pas — l'écran n'affirme alors rien.
   */
  group_role: z.enum(['groupe', 'filiale']).nullable().optional(),
  group_head_siren: z.string().nullable().optional(),
  group_link_observed_at: z.string().nullable().optional(),
  /**
   * #219.6 (#3231, lot X50) — CLIENT INTERNE : ce compte est-il une direction
   * interne servant des métiers (`internal_service`) ou un client direct
   * (`external_buyer`) ? Une DÉCLARATION du commercial (correction humaine,
   * provenance « saisi à la main »), jamais déduite d'un texte. `null` = non
   * déclaré : Laura et le plan ne disent rien.
   */
  declared_internal_client_mode: z.enum(['internal_service', 'external_buyer']).nullable().optional(),
  /**
   * #219.6 (J05) — les QUATRE rôles d'une direction interne, NOMMÉS par le commercial
   * (commanditaire interne, utilisateurs, entité juridique, client final). Texte libre,
   * en clair ; `null` = non nommé, Laura ne comble jamais le trou.
   */
  declared_internal_sponsor: z.string().nullable().optional(),
  declared_internal_users: z.string().nullable().optional(),
  declared_legal_entity: z.string().nullable().optional(),
  declared_end_client: z.string().nullable().optional(),
  /**
   * #3278.2 (lot M11) — les SIX critères de la route commerciale sans source
   * structurée, DÉCLARÉS par le commercial (texte libre, en clair). `null` = non
   * déclaré : Laura le nomme « non évalué », jamais une valeur devinée.
   */
  declared_route_scope: z.string().nullable().optional(),
  declared_route_objectives: z.string().nullable().optional(),
  declared_route_available_roles: z.string().nullable().optional(),
  declared_route_partners: z.string().nullable().optional(),
  declared_route_history: z.string().nullable().optional(),
  declared_route_timing: z.string().nullable().optional(),
  // #3278.2b (Louis 15/10) — déclaratifs ; absent / vide = « non renseigné ».
  declared_route_budget: z.string().nullable().optional(),
  declared_route_availability: z.string().nullable().optional(),
  declared_route_network: z.string().nullable().optional(),
  /** #3278.1 (décision Louis 11/10/2026) — contact noué en événement / communauté, et compte venu par un contenu : faits déclarés. */
  declared_route_event: z.string().nullable().optional(),
  declared_route_inbound: z.string().nullable().optional(),
  /** D'où vient ce compte (`discover` | `search` | `import` | `crm` | `manual`).
   *  `null`/absent = origine inconnue (compte antérieur au 22/08). */
  origin: accountOriginSchema.nullable().optional(),
  /**
   * #3914 — la raison CALCULÉE qui a fait remonter ce compte dans Découvrir
   * (angle, signal daté ou facteurs de score), quand `origin` vaut `discover`.
   * C'est elle que l'écran cite quand l'analyse conclut différemment de ce que
   * Découvrir avait dit. `null`/absent = compte venu autrement, ou antérieur
   * à ce lot — jamais une raison devinée.
   */
  discover_origin_reason: z.string().nullable().optional(),
  /**
   * #3819 (lot RBB) — les critères de Découvrir (secteur, zone, effectif,
   * signal) posés ET satisfaits quand le compte a été ajouté. `null`/absent =
   * compte venu autrement, antérieur, ou ajouté sans critère — rien à nommer.
   */
  discover_origin_criteria: discoverOriginCriteriaSchema.nullable().optional(),
})

/**
 * #219.6 (#3231) — les deux valeurs de la déclaration « client interne ». Miroir
 * EXACT de `INTERNAL_CLIENT_MODES` (`apps/ia/app/services/internal_client.py`) et
 * de la contrainte SQL `accounts_declared_internal_client_mode_check` : un test
 * lit les deux fichiers (GA-26, un seul vocabulaire).
 */
export const INTERNAL_CLIENT_MODES = ['internal_service', 'external_buyer'] as const
export type InternalClientMode = (typeof INTERNAL_CLIENT_MODES)[number]

export const createAccountSchema = z.object({
  company_name: z.string().min(1),
  user_context: z.string().optional(),
  // Scope lock (Théo p.10) : SIREN de l'entité choisie dans le sélecteur de
  // périmètre. Persisté immédiatement + transmis au run pour ancrer la recherche.
  siren: z
    .string()
    .regex(/^\d{9}$/)
    .optional(),
  /** D'où vient ce compte. Jamais deviné : absent = origine inconnue, et le
   *  compteur de contribution l'exclut plutôt que de l'attribuer. */
  origin: accountOriginSchema.optional(),
  /** #3914 — la raison CALCULÉE côté Découvrir, posée SEULEMENT avec `origin:
   *  'discover'`. Voir {@link accountSchema}.discover_origin_reason. */
  discover_origin_reason: z.string().optional(),
  /** #3819 (lot RBB) — voir {@link accountSchema}.discover_origin_criteria. */
  discover_origin_criteria: discoverOriginCriteriaSchema.optional(),
})

/**
 * Clé de tri pour la liste de comptes — `${field}_${dir}`.
 * Le défaut implicite côté API est `date_desc`.
 *
 * #2627.1 — `score_asc`/`score_desc` trient sur `priority_score`, le NOMBRE
 * qui fait déjà foi pour `accountScoreFilterSchema` (high/medium/low = les
 * mêmes coupures GO/PRUDENT/NO-GO) : un tri « verdict » qui inventerait une
 * autre grille contredirait le filtre.
 */
export const accountSortKeySchema = z.enum([
  'name_asc',
  'name_desc',
  'date_asc',
  'date_desc',
  'score_asc',
  'score_desc',
])

/**
 * Corps du `PATCH /accounts/:id/commercial-status` — tri commercial manuel.
 *
 * #2117.23 — `reason` est OPTIONNEL au contrat : la plupart des déplacements
 * n'appellent aucune justification, et un motif exigé partout se remplirait de
 * « . ». Il est OBLIGATOIRE à l'écran pour un statut de SORTIE
 * (`COMMERCIAL_STATUSES_REQUIRING_REASON`, juste en dessous). Il voyage dans
 * l'entrée d'historique (#2117.24) : le motif appartient à la TRANSITION, pas
 * au statut.
 */
export const setCommercialStatusSchema = z.object({
  status: commercialLifecycleSchema,
  reason: z.string().trim().min(1).max(500).optional(),
})

/**
 * #2117.23 — les statuts de SORTIE du pipe : l'écran n'y envoie jamais un
 * compte sans motif. Un seul endroit (GA-26) — l'écran et ses tests le lisent.
 */
export const COMMERCIAL_STATUSES_REQUIRING_REASON: readonly CommercialLifecycle[] = ['archived', 'dormant']
export type SetCommercialStatusRequest = z.infer<typeof setCommercialStatusSchema>

/**
 * #2165.13 — marquer/démarquer un compte comme « meilleure référence », la
 * source du preset Découvrir « Proches de mes meilleures références »
 * (`accounts.is_best_reference`, migration 1795620000001-AccountBestReference).
 */
export const setBestReferenceSchema = z.object({ value: z.boolean() })
export type SetBestReferenceRequest = z.infer<typeof setBestReferenceSchema>

/**
 * #3245 (reste de #3209.6) — le PROFIL DE PARI d'un compte, DÉCLARÉ par le
 * commercial (colonnes `bet_*` de `accounts`, migration
 * 1796413395732-AccountBetProfile). Jamais déduit : ni de `estimatedDealSize`
 * (texte libre du modèle), ni de `employees` (format libre). Chaque champ
 * accepte `null` = « retirer la déclaration » ; un champ absent de la requête
 * reste tel quel.
 */
export const BET_HORIZONS = ['short', 'long'] as const
export const BET_SIZES = ['standard', 'very_large'] as const
export const BET_ACCESSES = ['open', 'closed'] as const
export const BET_RESOURCE_MAX = 60
export const setBetProfileSchema = z
  .object({
    horizon: z.enum(BET_HORIZONS).nullable(),
    size: z.enum(BET_SIZES).nullable(),
    access: z.enum(BET_ACCESSES).nullable(),
    resource: z.string().trim().max(BET_RESOURCE_MAX).nullable(),
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: 'bet_profile_empty' })
export type SetBetProfileRequest = z.infer<typeof setBetProfileSchema>

/** #3245 — une ligne de l'écran Réglages › Charge commerciale : le dossier et ce
 *  qui en est DÉCLARÉ (`null` = non déclaré, jamais une valeur par défaut). */
export const betProfileRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  horizon: z.enum(BET_HORIZONS).nullable(),
  size: z.enum(BET_SIZES).nullable(),
  access: z.enum(BET_ACCESSES).nullable(),
  resource: z.string().nullable(),
})
export type BetProfileRow = z.infer<typeof betProfileRowSchema>

/**
 * #2117.21 — « En veille » ne se pose QUE PAR UN GESTE HUMAIN, avec motif
 * (décision de Louis, 15/09/2026, qui lève la décision parquée).
 *
 * La raison est celle qui interdisait la valeur jusqu'ici : un compte
 * « dormant » DÉRIVÉ d'un silence ne mesure pas le compte, il mesure notre
 * absence de nouvelles — et « conclure d'un silence » est un refus écrit. La
 * valeur existe donc, mais aucun chemin système (routine de rafraîchissement,
 * fin d'analyse, import, CRM, Laura) ne l'écrit : elle n'est vraie que parce
 * qu'un commercial l'a dite, et le motif est la trace qu'il l'a dite.
 */
export const COMMERCIAL_STATUSES_HUMAN_ONLY: readonly CommercialLifecycle[] = ['dormant']

/** Qui demande l'écriture du statut commercial. `system` = tout ce qui n'est
 *  pas le geste d'un commercial — et c'est le défaut, côté fermé. */
export type CommercialStatusWriteOrigin = 'human' | 'system'

/**
 * #2117.21 — la porte d'écriture du statut commercial, à UN seul endroit
 * (GA-26) : l'API et l'écran la lisent tous les deux.
 *
 * Rend le code du REFUS, ou `null` quand l'écriture est légitime :
 *  - `human_only`      → un chemin système a tenté un statut réservé à l'humain
 *  - `reason_required` → un statut de sortie (ou de veille) sans motif
 */
export function commercialStatusWriteRefusal(
  status: CommercialLifecycle,
  origin: CommercialStatusWriteOrigin,
  reason: string | null | undefined,
): 'human_only' | 'reason_required' | null {
  if (origin !== 'human' && COMMERCIAL_STATUSES_HUMAN_ONLY.includes(status)) return 'human_only'
  if (COMMERCIAL_STATUSES_REQUIRING_REASON.includes(status) && !reason?.trim()) return 'reason_required'
  return null
}

/** Buckets de score utilisés comme filtre — mappés en SQL côté service. */
export const accountScoreFilterSchema = z.enum(['high', 'medium', 'low'])

/**
 * #1580 — les TROIS métriques décisionnelles du bandeau de tête que le
 * serveur sait filtrer (`headlineCounters` compte les mêmes trois, plus
 * `followed` qui n'est PAS un filtre — voir `accountListQuerySchema.headline`).
 */
// Refonte Théo (23/10/2026) — `toResume` et `activeRelations` : les chiffres « À reprendre » et « Relations
// actives » de la bande de tête se cliquent, sur le prédicat qui les compte. Ajoutés EN FIN de liste.
export const ACCOUNT_LIST_HEADLINE_FILTERS = [
  'withoutNextAction',
  'newSignals7d',
  'accessClassAB',
  'toResume',
  'activeRelations',
] as const
export const accountListHeadlineFilterSchema = z.enum(ACCOUNT_LIST_HEADLINE_FILTERS)
export type AccountListHeadlineFilter = z.infer<typeof accountListHeadlineFilterSchema>

/**
 * #2150.13 — au-delà de ce nombre de jours depuis la dernière analyse, un compte
 * est « À rafraîchir » : la pastille de ligne ET le filtre `freshness=stale` lisent
 * CE nombre (GA-26 — il vivait en dur dans `AccountTableRow`, et le filtre serveur
 * l'aurait recopié).
 */
export const ACCOUNT_STALE_AFTER_DAYS = 90

/**
 * Filtres acceptés par `GET /accounts`. Tous optionnels — l'absence
 * d'un champ vaut "pas de filtre" (défaut côté serveur).
 *
 *  - `q`      → recherche texte sur `company_name` (ILIKE %q%)
 *  - `status` → filtre statut. `'all'` est admis pour le mapping URL ↔ API,
 *               le service le traite comme "pas de filtre".
 *  - `sort`   → ordre de tri. Défaut serveur : `date_desc`.
 *  - `sector` → ILIKE %sector% sur `account.sector`.
 *  - `score`  → bucket priority_score : `high` ≥ 7, `medium` 5–7, `low` < 5.
 */
/**
 * #4498.a (PR 12C) — UN AXE SE COCHE À PLUSIEURS : une valeur seule (les appelants d'avant, les liens partagés)
 * OU une liste de 1 à 40 valeurs. Le service lit les deux par `asList` ; une valeur inconnue dans la liste
 * refuse toute la requête. Dans l'URL d'API : `?sector=a&sector=b` (le parseur de requête rend une liste).
 */
const ACCOUNT_LIST_MULTI_MAX = 40
const oneOrMany = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, z.array(schema).min(1).max(ACCOUNT_LIST_MULTI_MAX)])

/** Une valeur seule ou une liste, rendue en liste (jamais `undefined` : `[]` = pas de filtre). */
export function asList<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? [...(value as readonly T[])] : [value as T]
}

export const accountListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: oneOrMany(z.enum(['all', ...analysisStatusSchema.options])).optional(),
  /**
   * #3184.1 (recette prod 30/09) — « DÉJÀ CONNU », PAS « TERMINÉ ».
   *
   * `status: 'completed'` exclut un compte dont l'analyse s'est INTERROMPUE
   * (timeout, lot multi-entreprises coupé en route) alors que ses contacts
   * sont déjà enregistrés (`AnalysisWorker.saveContacts` écrit AVANT que
   * `savePlan` ne fasse passer `status` à `completed` — les deux phases ne
   * sont pas atomiques). `search_workspace_accounts` (Laura, « ai-je déjà ce
   * compte ? ») filtrait sur `status: 'completed'` et répondait « aucun compte
   * ni contact exploitable » pour un compte qu'un fil VOISIN, scopé par
   * `account_id`, lisait avec missions et contacts — la même donnée, deux
   * réponses contradictoires.
   *
   * `reusableOnly: true` élargit à « `completed` OU au moins un contact déjà
   * enregistré » — orthogonal à `status` (jamais les deux à la fois) : un
   * compte encore `prospect`/`analyzing` SANS contact reste exclu, exactement
   * le cas que le filtre `completed` voulait éviter (répondre par un dossier
   * qui n'existe pas encore).
   */
  reusableOnly: z.boolean().optional(),
  // Onglets « À suivre » / « Opportunités » (Théo p.39) : filtre sur le cycle
  // de vie COMMERCIAL, orthogonal au `status` d'analyse. `'all'` = pas de filtre.
  lifecycle: oneOrMany(z.enum(['all', ...commercialLifecycleSchema.options])).optional(),
  sort: accountSortKeySchema.optional(),
  sector: oneOrMany(z.string().trim().min(1)).optional(),
  score: oneOrMany(accountScoreFilterSchema).optional(),
  /**
   * La porte de priorité (G1) — « montre-moi ce que j'ai écarté, et pourquoi »
   * (tome 1, U08).
   *
   * `decision_gate_crossings` enregistre le franchissement depuis le PDF 1, et
   * `accounts.priority_gate` porte l'état depuis le PDF 2. Rien, côté écran, ne
   * permettait de revoir les comptes écartés : le motif et la date existaient
   * en base et ne se lisaient nulle part. Un journal qu'on ne peut pas relire
   * n'est pas un journal.
   */
  gate: oneOrMany(z.enum(['all', ...priorityGateSchema.options])).optional(),
  /**
   * LE TYPE D'ENTITÉ porté par le compte (31/08/2026) — « montre-moi les
   * comptes qui ont une filiale », « ceux organisés en business units ».
   *
   * ⚠️ Le filtre porte sur les ENTITÉS du compte (`account_entities.kind`), pas
   * sur le compte lui-même : un compte n'a pas de « type », il a des
   * subdivisions qui en ont un. Un compte est retenu dès qu'UNE de ses entités
   * porte le type demandé — c'est la lecture qu'un commercial fait
   * spontanément, et la seule qui ne perde pas un groupe parce que sa deuxième
   * filiale est typée autrement.
   *
   * `'all'` ≡ pas de filtre. Les valeurs suivent {@link ACCOUNT_ENTITY_KINDS} —
   * elles ne sont pas recopiées ici, sans quoi ajouter un type au vocabulaire
   * laisserait ce filtre en arrière sans que rien ne rougisse.
   */
  entityKind: oneOrMany(z.enum(['all', ...accountEntityKindSchema.options])).optional(),
  /**
   * #1580 — LE BANDEAU DE TÊTE DEVIENT UN RACCOURCI DE TRAVAIL.
   *
   * Les trois métriques DÉCISIONNELLES du bandeau (« sans prochaine action »,
   * « signal récent », « accessibilité A/B ») filtrent désormais la POPULATION
   * SERVEUR complète — jamais seulement la page déjà chargée, qui grandirait en
   * scrollant (même défaut déjà payé sur `/contacts`).
   *
   * ⚠️ « suivis » (`followed`) n'est PAS une valeur possible ici : cliquer ce
   * chiffre-là ne filtre pas, il RAMÈNE au portefeuille complet (même geste que
   * le lien « Voir tout le portefeuille » déjà posé sur ce bandeau) — ce n'est
   * pas un axe de restriction, donc il n'a pas sa place dans ce filtre.
   *
   * Les trois valeurs sont les mêmes clés que `accountListCountersSchema`, et
   * le service RÉUTILISE littéralement les prédicats SQL qui comptent ces
   * mêmes populations (`headlineCounters`) — une dérivation vit à un seul
   * endroit, deux chemins qui la refont divergent.
   */
  headline: accountListHeadlineFilterSchema.optional(),
  /**
   * #1575.1 — LE CINQUIÈME COMPTEUR : « {n} avec des parcours observés ».
   *
   * `'covered'` restreint la liste aux comptes que la mémoire marché couvre
   * (≥ `MARKET_MEMORY_MIN_PATHS` parcours observés) ; `'all'` ≡ pas de filtre,
   * l'idiome déjà employé par `status`, `lifecycle` et `gate` juste au-dessus.
   *
   * ⚠️ CE N'EST PAS UN `headline`, ET C'EST LA PARTIE COÛTEUSE DU LOT. Les
   * quatre chiffres du bandeau sont comptés par la MÊME requête que celle qui
   * liste, et les trois cliquables rejouent le prédicat SQL qui les compte
   * (`HEADLINE_FILTER_PREDICATE`). Celui-ci ne partage ni cette source ni ce
   * mécanisme : sa valeur vient de `GET /accounts/market-memory-portfolio`, et
   * la couverture n'est pas une expression SQL — c'est l'arbitrage
   * `resolveMarketCompany`, en TypeScript, sur les tables d'un AUTRE module
   * (GA-07 est au plafond, la composition vit donc dans le contrôleur).
   *
   * Le ranger avec les trois autres aurait promis un compteur de
   * `accountListCountersSchema` qui n'existe pas et un prédicat SQL que
   * personne ne peut écrire. `account.market-covered.test.ts` l'y tient.
   */
  marketCovered: z.enum(['all', 'covered']).optional(),
  /**
   * #2150.13 — LA VUE « À ACTUALISER ».
   *
   * `'stale'` restreint la liste aux comptes dont la dernière analyse AFFICHÉE
   * date de plus de {@link ACCOUNT_STALE_AFTER_DAYS} jours — la population de la
   * pastille « À rafraîchir » de chaque ligne, filtrée côté SERVEUR (jamais la
   * seule page chargée). Un compte jamais daté n'y entre pas : « non daté » n'est
   * pas « périmé ». `'all'` ≡ pas de filtre.
   */
  freshness: z.enum(['all', 'stale']).optional(),
  /**
   * #2150.14/.18 — « MES FAVORIS », RÉTABLI. Revirement ASSUMÉ de #1800
   * (09/09/2026, « tu peux supprimer la notion de favori ») : retour bêta
   * #2150, tranché par Louis le 15/09/2026. `'mine'` restreint aux comptes que
   * l'APPELANT a personnellement mis en favori (table `user_favorites`,
   * jamais partagée à l'équipe — voir `UserFavoriteEntity`). `'all'` ≡ pas de
   * filtre, le même idiome que `freshness` juste au-dessus.
   */
  favorite: z.enum(['all', 'mine']).optional(),
  /**
   * #2150.15 — « PARTAGÉS AVEC MON ÉQUIPE » : les comptes PORTÉS PAR UN
   * COLLÈGUE — un `assigned_to` renseigné et différent de l'appelant.
   *
   * ⚠️ Un compte LIBRE (`assigned_to IS NULL`) n'est porté par personne : il
   * n'entre PAS dans ce filtre, qui ne remplace pas la file des non-attribués
   * (`portfolioScopeFor`, `includeUnassigned`). « Membre du même espace » est
   * déjà garanti par le `workspace_id` de la requête — ce filtre ne fait
   * qu'exclure le portefeuille personnel de l'appelant.
   */
  /**
   * #4498.c (PR 12C) — « HISTORIQUE DOCUMENTÉ » : le compte porte (`with`) ou non (`without`) au moins une
   * preuve enregistrée (`proofs.account_id`). Une preuve est un fait de livraison relu ; « sans » dit
   * seulement qu'aucune n'est enregistrée, jamais qu'il n'y a rien eu. `'all'` ≡ pas de filtre.
   */
  documentedHistory: z.enum(['all', 'with', 'without']).optional(),
  /**
   * #4498.c — « RÉFÉRENCES AUTORISÉES DE MON ESN UNIQUEMENT » : au moins une preuve du compte dont la citation
   * est EXPLICITEMENT autorisée par le client (`citation_allowed = true`) ; `null` (« pas demandé ») n'est pas
   * une autorisation. `'all'` ≡ pas de filtre.
   */
  authorizedReferences: z.enum(['all', 'only']).optional(),
  /**
   * #4526.2 — « MON CRM » : `'only'` restreint aux comptes que le commercial connaît déjà par son CRM
   * (`origin` crm/import, ou lien CRM quand l'origine est inconnue). Calculé à la LECTURE, jamais écrit.
   * `'all'` ≡ pas de filtre.
   */
  crm: z.enum(['all', 'only']).optional(),
  /**
   * #4597.1 — « IMPORTÉS » : `'only'` restreint aux comptes venus d'un fichier (jamais d'un CRM). Calculé à la
   * lecture, `origin` jamais réécrit. `'all'` ≡ pas de filtre.
   */
  imported: z.enum(['all', 'only']).optional(),
  /** #4597.3 — les comptes créés par CET import (identifiant du job, jamais sa date). Un filtre AJOUTÉ. */
  importJob: z.string().guid().optional(),
  /**
   * #4158.25 — `'mine'` : « MES COMPTES » = ceux dont je suis le responsable
   * (`assigned_to`) OU un co-équipier actif (`account_team_members`). Ne change pas
   * la visibilité — tout l'espace voit déjà tout ; c'est un angle de plus.
   */
  ownership: z.enum(['all', 'teammate', 'mine']).optional(),
  /**
   * #2159.26 — les comptes qui portent CETTE étiquette. Normalisée côté
   * serveur (`normalizeTag`) : « SAP » et « sap » filtrent pareil.
   */
  tag: oneOrMany(z.string().trim().min(1).max(80)).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const accountListItemSchema = accountSchema
  .pick({
    id: true,
    company_name: true,
    sector: true,
    employees: true,
    priority_score: true,
    status: true,
    priority_gate: true,
    gate_reason: true,
    gate_decided_at: true,
    // #3407.1 — le niveau d'effort, sa raison et sa date de revue, sur la
    // ligne de liste : voir le commentaire de `accountSchema` ci-dessus.
    sprint: true,
    sprint_reason: true,
    sprint_review_at: true,
    commercial_status: true,
    created_at: true,
    last_analyzed_at: true,
    watch_cadence: true,
    signal_freshness: true,
    // #2128.1 — le porteur est DÉFINI sur `accountSchema` et REPRIS ici, il
    // n'est plus redéfini : la liste et le dossier doivent dire le même mot.
    owner: true,
    // #2159.26 — les étiquettes, pour la liste filtrable.
    tags: true,
    // #2809 (#2293.3) — nécessaire pour lancer un lot d'analyse (`POST
    // /analysis-batches`, source `portfolio`) SANS re-résoudre le nom par
    // recherche : la ligne porte déjà le SIREN canonique du compte. `null` =
    // compte legacy/non-FR sans SIREN, jamais deviné.
    siren: true,
    // #2265.14 (épopée #2851) — repris À L'IDENTIQUE (GA-26) pour dériver le
    // badge « intermédiaire, pas client final » (`isIntermediaryActor`) sans
    // recalcul serveur : le NAF est déjà en base, la liste ne fait qu'ARRÊTER
    // de le garder pour elle seule.
    naf_code: true,
  })
  .extend({
    /**
     * #3407.4 (recette 30/09) — LA DERNIÈRE ET LA PROCHAINE ACTION, sur la ligne.
     * Déjà LUES par `AccountsService.portfolioPriorities` (#3209) pour le seul
     * copilote : la liste cesse de les garder pour lui. `null` = aucune action
     * tracée / aucun plan, jamais une date ou une action devinée.
     */
    last_action_at: z.string().nullable().optional(),
    /** #4497.a — le siège inscrit au registre : la ligne en tire la VILLE. `null`/absent = aucun texte. */
    headquarters: z.string().nullable().optional(),
    /** #4989.2 — villes d'implantation connues (registre + analyse). Absent = aucune connue, jamais une liste vide. */
    sites: z.array(z.string()).optional(),
    next_action_label: z.string().nullable().optional(),
    /**
     * #4584 — le compte est « À REPRENDRE » au sens EXACT de la bande (suivi, avec une tâche ouverte datée
     * d'aujourd'hui ou après) : le même prédicat serveur que `counters` — l'étagère « Reprendre le fil » n'en
     * a pas d'autre. Absent = non mesuré, jamais « faux ».
     */
    to_resume: z.boolean().optional(),
    next_action_horizon: z.string().nullable().optional(),
    /**
     * Refonte Théo (comptes-liste) — LES PERSONNES du compte, pour la colonne « Personnes » :
     * leur nombre et deux visages (initiales), le décideur d'abord. `has_decider` = au moins un
     * contact au rôle décisionnel technique ou économique (le badge « Décideur »). Absent = non
     * lu (API plus ancienne) ; `count: 0` n'est jamais écrit à l'écran.
     */
    people: z
      .object({
        count: z.number().int().min(0),
        has_decider: z.boolean(),
        top: z.array(z.object({ name: z.string(), is_decider: z.boolean() })).max(2),
      })
      .optional(),
    // Logo Apollo + site web : de quoi afficher le logo réel dans les listes
    // (favicon du site en fallback d'affichage). Optionnels — projections legacy.
    logo_url: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    /**
     * #1577 — le nombre de PARCOURS OBSERVÉS par la mémoire marché sur ce
     * compte, pour le fragment « · 41 parcours observés » sous le nom.
     *
     * TROIS ÉTATS, ET ILS NE SE RENDENT PAS PAREIL :
     *  · un `number` — la mémoire couvre ce compte. Toujours ≥
     *    `MARKET_MEMORY_MIN_PATHS`, parce que le seuil est appliqué par le
     *    service de lecture et par personne d'autre ;
     *  · `null` — la lecture a eu lieu et ce compte n'est PAS couvert (sous le
     *    seuil, homonymes non départagés, ou absent du corpus). « Non mesuré »,
     *    donc aucun fragment — surtout pas « 0 parcours observés », qui
     *    affirmerait qu'on a regardé et qu'il n'y a rien ;
     *  · ABSENT — la mémoire marché n'a pas pu être lue du tout
     *    (`status: 'unavailable'`), ou l'API est antérieure à ce champ. Une
     *    panne ne se raconte pas comme une absence de couverture.
     *
     * ⚠️ Le champ ne porte AUCUNE date et AUCUNE identité : les tables de
     * mémoire marché ne comptent que des organisations, et #1582 pose
     * explicitement « aucune date affichée ».
     */
    market_paths_observed: z.number().int().nullable().optional(),
    primary_signal: z.string().nullable().optional(),
    signal_preview: z
      .object({
        label: z.string(),
        source: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        date: z.string().nullable().optional(),
        /** #3682 — fraîcheur du FAIT cité (jamais celle de la recherche). `archive` = contexte historique. */
        freshness: z.enum(['current', 'archive', 'undated']).nullable().optional(),
      })
      .nullable()
      .optional(),
    /**
     * #2150.14/.18 — l'appelant a-t-il personnellement mis CE compte en
     * favori ? PERSONNEL (jamais l'équipe) — voir `favorite` juste au-dessus
     * sur `accountListQuerySchema` et `UserFavoriteEntity` côté données.
     *
     * Optionnel : une projection antérieure au lot (public API, MCP, un
     * appelant sans identité de personne) ne le porte pas — absent n'affirme
     * rien, il n'y a simplement personne à qui demander « est-ce TON favori ».
     */
    is_favorite: z.boolean().optional(),
    /**
     * D10 (Louis 05/10) — le score du compte est un palier POSÉ, pas arbitré par
     * l'équipe (`raw_analysis.score_unarbitrated`). Optionnel : absent = rien à
     * dire (jamais un « arbitré » deviné).
     */
    score_unarbitrated: z.boolean().optional(),
    /**
     * #4016.91 (18/10) — le /25 de l'évaluation, l'échelle de la FICHE. La liste l'affiche à la place du
     * `priority_score` /10. Absent = dossier sans /25 lisible : la liste retombe sur le /10 nommé comme tel.
     */
    score_25: z.number().min(0).max(25).optional(),
    /** #2265.5 — voir `is_declared_partner` sur le dossier : même fait, même règle. */
    is_declared_partner: z.boolean().optional(),
  })

/**
 * #2150.14/.18 — ce que rend `POST` / `DELETE /accounts/:id/favorite`.
 *
 * Le couple (id, is_favorite) voyage ensemble : sans `is_favorite`, un cache
 * qui reçoit la réponse devrait se souvenir de ce qu'il vient d'envoyer pour
 * savoir quelle ligne corriger — et deux clics rapides sur deux comptes
 * différents suffisent à appliquer la mauvaise réponse à la mauvaise ligne
 * (même raisonnement que l'ancien `favoriteStateSchema`, #1800).
 */
export const accountFavoriteStateSchema = z.object({
  id: z.string().guid(),
  is_favorite: z.boolean(),
})
export type AccountFavoriteState = z.infer<typeof accountFavoriteStateSchema>

/**
 * Raw "besoins" row for ONE account, surfaced by ``GET /accounts/needs`` and
 * consumed by the « Besoins » page (portfolio-wide view of what each account
 * NEEDS, so a commercial picks who to call by need rather than by score).
 *
 * Nothing here is invented: every field is a slice of what the analysis already
 * produced and stored — ``pains`` / ``it_implications_for_esn`` / ``angles`` /
 * ``program_names`` come out of ``raw_analysis``, ``it_challenges`` is its own
 * accounts column. The derivation into displayable need items is pure and lives
 * client-side (``features/needs/model/needs.ts``), same split as the Veille.
 *
 * Only the sub-keys the page reads are pulled out of the JSONB — the full
 * ``raw_analysis`` blob never crosses the wire for a whole portfolio.
 */
export const accountNeedsRowSchema = z.object({
  account_id: z.string().guid(),
  company_name: z.string(),
  sector: z.string().nullable(),
  score: z.number().nullable(),
  updated_at: z.string().nullable(),
  it_implications: z.string().nullable(),
  pains: z
    .array(
      z.object({
        pain: z.string().nullable().optional(),
        business_impact: z.string().nullable().optional(),
        esn_offer: z.string().nullable().optional(),
        urgency: z.string().nullable().optional(),
      }),
    )
    .nullable(),
  it_challenges: z
    .array(
      z.object({
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        severity: z.string().nullable().optional(),
        timeframe: z.string().nullable().optional(),
      }),
    )
    .nullable(),
  programs: z
    .array(
      z.object({
        name: z.string().nullable().optional(),
        budget: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .nullable(),
  angles: z
    .array(
      z.object({
        angle: z.string().nullable().optional(),
        offer: z.string().nullable().optional(),
      }),
    )
    .nullable(),
  /**
   * Signaux d'achat du compte (`accounts.recent_signals`) — la 5ᵉ nature de
   * l'Opportunity Graph (§6). Le libellé voyage sous quatre clés selon l'âge de
   * la ligne (`title` récent, `label`/`description`/`signal` legacy), d'où la
   * forme permissive : le modèle web lit la première présente. `.optional()`
   * pour le deploy-skew — une API antérieure ne renvoie pas le champ.
   */
  signals: z
    .array(
      z.object({
        title: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        signal: z.string().nullable().optional(),
        source: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        date: z.string().nullable().optional(),
        salesImplication: z.string().nullable().optional(),
        sales_implication: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
})

/**
 * Le critère qui rapproche un compte suggéré du profil du vendeur.
 *
 * Fermé à dessein : trois valeurs, les mêmes que les trois poids du calcul
 * serveur (`similar-scoring.ts`). Une chaîne libre laisserait le serveur
 * inventer des raisons que l'app ne saurait ni traduire ni vérifier.
 */
export const similarityReasonSchema = z.enum(['sector', 'geo', 'size'])
export type SimilarityReason = z.infer<typeof similarityReasonSchema>

/**
 * #2040.18 — LA CONFIANCE D'UN RAPPROCHEMENT, EN PALIERS NOMMÉS.
 *
 * Le rapprochement se juge sur TROIS axes, et ces trois axes sont trois
 * RÉPONSES du questionnaire d'onboarding : les secteurs visés (`sector`), les
 * zones géographiques (`geo`), les types d'entreprises ciblés (`size`). Un axe
 * sur lequel le questionnaire est MUET n'est pas un axe raté : il n'a pas été
 * mesuré. Le compter 0 ferait dire au score la complétude de nos réponses au
 * lieu de la proximité du compte — c'est exactement « non mesuré rendu 0 ».
 *
 * D'où ces trois paliers, qualitatifs et nommés — jamais un nombre nu, jamais
 * un pourcentage :
 *
 *  - `etayee`      → les trois axes étaient évaluables. Le score a un sens, et
 *                    lui seul est publié ({@link SIMILARITY_AXES_REQUIRED}).
 *  - `partielle`   → un ou deux axes évaluables. Les critères matchés se
 *                    nomment toujours, mais AUCUN score n'est publié : sous
 *                    trois axes évalués, il n'y a pas de score (doctrine).
 *  - `non_etayee`  → aucun axe évaluable — le questionnaire ne dit rien de ce
 *                    que ce vendeur cible. La suggestion reste honnête (elle
 *                    vient du secteur registre du portefeuille), elle n'est
 *                    simplement rapprochée de rien.
 *
 * Ce qui n'a pas pu être évalué est NOMMÉ à côté, dans
 * `similarity_unevaluated` : « on ne t'a pas demandé / tu n'as pas répondu »
 * se dit, « ça ne matche pas » serait faux.
 */
export const SIMILARITY_CONFIDENCE_TIERS = ['etayee', 'partielle', 'non_etayee'] as const
export const similarityConfidenceSchema = z.enum(SIMILARITY_CONFIDENCE_TIERS)
export type SimilarityConfidence = z.infer<typeof similarityConfidenceSchema>

/**
 * Le nombre d'axes évaluables en dessous duquel il n'y a PAS de score (doctrine
 * « un score n'est jamais nu ; sous 3 axes évalués, il n'y a pas de score »).
 * Il vit ICI et nulle part ailleurs (GA-26) : le serveur s'en sert pour décider
 * d'émettre `score_similarity`, la garde s'en sert pour le prouver.
 *
 * ⚠️ Son nom ne porte PAS le mot « score », et c'est voulu : ce 3 est un COMPTE
 * D'AXES, jamais une coupure du /10. GA-56 lit tout `…SCORE… = <0..10>` comme
 * une bande de score recopiée à la main — elle a raison de le faire, et c'est
 * au nom de dire ce que le nombre est.
 */
export const SIMILARITY_AXES_REQUIRED = 3

/**
 * #1576 / #1632 — LA RAISON PRINCIPALE, ET LE COMPTE QU'ELLE NOMME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CHAMP À PART, ET PAS UNE QUATRIÈME VALEUR DE `similarityReason`
 * ─────────────────────────────────────────────────────────────────────────────
 * `similarity_reasons` est la LISTE des critères du profil vendeur qu'un
 * candidat recoupe (secteur / zone / taille) : elle répond à « en quoi ce compte
 * ressemble à ce que TU cherches ». Celui-ci répond à une autre question — « à
 * quel compte de TON portefeuille ce candidat ressemble, et par quoi ». Les
 * confondre obligerait l'écran à deviner laquelle des deux il rend.
 *
 * Le retour l'exige : **une seule raison par carte, la plus forte disponible, et
 * elle NOMME toujours le compte de référence**. « Ressemble à Thales » se
 * comprend ; « similarité 0,84 » ne se comprend pas — et un score nu est refusé
 * partout ailleurs dans ce dépôt (`c26_probabilite`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE FORCE, ET CE QUI N'Y EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `twin`   — une mission a été SIGNÉE sur le compte de référence.
 *  2. `tech`   — au moins trois technologies communes discriminantes, observées
 *                des deux côtés par la mémoire marché (`market-techno-affinity`).
 *  3. `sector` — la PROVENANCE de la suggestion : elle a été découverte à partir
 *                du secteur registre de ce compte-là. Toujours disponible, parce
 *                que toute suggestion est semée par un compte du portefeuille.
 *
 * ⚠️ Le « profil d'externalisation comparable » demandé par les deux retours
 * n'est PAS ici, et ne peut pas y être : `market_company_signal.
 * externalization_score` n'est pas normalisé par cohorte, donc il mesure la
 * TAILLE de l'entreprise et non son comportement d'achat. Le refus est inscrit
 * (`MARKET_MEMORY_SCORING_ENABLED`, #1640.6) et gardé (GA-257). Comparer deux
 * scores non normalisés est la même faute d'un cran plus loin : deux entreprises
 * « au même profil » seraient deux entreprises de la même taille.
 *
 * ⚠️ `twin` NOMME les missions gagnées, il ne s'en sert PAS pour AMORCER la
 * découverte — l'amorçage par missions gagnées a été refusé le 21/08/2026 (voir
 * {@link SIMILAR_SEED_FLOOR}) parce qu'un espace sans mission perdrait la
 * fonctionnalité entière. Ici, un espace sans mission perd un LIBELLÉ : les
 * cartes restent, avec la raison suivante dans l'ordre.
 */
export const similarityHeadlineSchema = z.object({
  kind: z.enum(['twin', 'tech', 'sector']),
  /** Le compte du portefeuille que la phrase nomme. Jamais vide : une raison
   *  qui ne nomme personne est exactement celle que le retour rejette. */
  referenceAccount: z.string().min(1),
  /** Les technologies communes, `kind: 'tech'` seulement. Listées, jamais
   *  résumées en un nombre. */
  technologies: z.array(z.string().min(1)).optional(),
})
export type SimilarityHeadline = z.infer<typeof similarityHeadlineSchema>

/**
 * #2127.26 / .27 / .29 / .30 — les critères qu'une suggestion partage avec le
 * compte de référence, dans l'ordre d'affichage. ⚠️ Un critère neuf s'ajoute EN
 * FIN de liste (GA-08).
 *
 * · `geo`          — même département (code postal) ou même ville, des deux côtés ;
 * · `size`         — tranches d'effectif qui se recoupent, des deux côtés ;
 * · `external_use` — recours à des externes OBSERVÉ des deux côtés par la mémoire
 *                    marché (les deux entreprises couvertes). Jamais une part,
 *                    jamais un « n'externalise pas » quand un côté ne l'est pas.
 * · `role_family`  — au moins une FAMILLE DE RÔLES recrutée en commun, observée
 *                    des deux côtés par la mémoire marché (`market_company_signal
 *                    .role_families`, un comptage par entreprise — jamais une
 *                    personne). Le seau résiduel (« Autre ») ne compte jamais :
 *                    il ne nomme rien.
 *
 * ⚠️ Ni `similarity_reasons` ni ce tableau ne sont PERSISTÉS — les deux sont
 * recalculés à chaque réponse depuis le registre et la mémoire marché en
 * lecture seule. Élargir cette liste n'ouvre donc AUCUNE migration SQL (GA-11 /
 * GA-12 ne s'appliquent qu'à une valeur qui voyage jusqu'à une colonne).
 */
export const SIMILARITY_SHARED_CRITERIA = ['geo', 'size', 'external_use', 'role_family'] as const
export type SimilaritySharedCriterion = (typeof SIMILARITY_SHARED_CRITERIA)[number]

export const similarAccountSuggestionSchema = z.object({
  id: z.string().min(1),
  company_name: z.string().min(1),
  sector: z.string().min(1),
  /**
   * La VILLE du siège, telle que le registre la publie.
   *
   * #1415 — « pour chaque suggestion afficher : nom, secteur court,
   * LOCALISATION ». Elle voyageait déjà, mais NOYÉE : `buildSuggestionDescription`
   * la concatène au secteur dans `description` (« SUSVILLE · Transports
   * routiers de fret de proximité »), que la carte rendait SOUS une pastille
   * qui affichait déjà le secteur. Le même fait s'écrivait donc deux fois, et
   * la ville était illisible entre les deux.
   *
   * Champ à part entière, donc : l'écran choisit sa mise en forme au lieu de
   * découper une phrase. Absente quand le fournisseur ne l'expose pas — jamais
   * devinée depuis le nom ni depuis le code postal.
   */
  city: z.string().nullable().optional(),
  description: z.string().min(1),
  score_similarity: z.number().min(0).max(1).optional(),
  /**
   * Les critères RÉELLEMENT matchés (SIM-01, audit terrain du 17/08).
   *
   * `score_similarity` seul est un scalaire : trois critères de poids 3-2-2 s'y
   * écrasent, et l'écran affichait donc la même phrase pour un compte qui coche
   * les trois et pour un compte qui n'en coche aucun. Absent d'une API
   * antérieure au champ : l'app retombe alors sur le niveau dérivé du scalaire,
   * jamais sur du vide.
   */
  similarity_reasons: z.array(similarityReasonSchema).optional(),
  /**
   * #2040.18 — la CONFIANCE du rapprochement, en paliers nommés
   * ({@link SIMILARITY_CONFIDENCE_TIERS}). Un score n'est jamais nu : il ne
   * voyage qu'accompagné de ses axes (`similarity_reasons`), de ce qui n'a pas
   * pu être évalué (`similarity_unevaluated`) et de ce palier.
   *
   * `.optional()` pour le deploy-skew : une API antérieure au champ ne le rend
   * pas, et l'écran retombe alors exactement sur son affichage d'avant.
   */
  similarity_confidence: similarityConfidenceSchema.optional(),
  /**
   * #2040.18 — les axes que le questionnaire n'a PAS rendus évaluables, NOMMÉS.
   * Ce n'est pas « ça ne matche pas » : c'est « tu ne l'as pas dit ». Omis
   * quand les trois axes étaient évaluables.
   */
  similarity_unevaluated: z.array(similarityReasonSchema).optional(),
  /**
   * La raison PRINCIPALE, celle qui nomme un compte du portefeuille
   * ({@link similarityHeadlineSchema}). Une seule, la plus forte disponible.
   *
   * `.optional()` pour le deploy-skew : une API antérieure au champ ne le rend
   * pas, et l'écran retombe alors exactement sur son affichage d'avant.
   */
  similarity_headline: similarityHeadlineSchema.optional(),
  /**
   * Sur COMBIEN de comptes analysés cette proposition est bâtie.
   *
   * Ajouté le 26/08/2026 (D24). Le moteur s'amorce sur les comptes analysés de
   * l'espace, jusqu'à trois secteurs distincts — et **un seul suffisait** à
   * remplir la carte « Comptes proches de ta cible ». Avec une seule amorce, ce
   * qui est proposé n'est pas un voisinage de portefeuille : ce sont d'autres
   * sociétés du secteur du seul compte qu'on a regardé. La proposition reste
   * utile ; c'est son TITRE qui promettait davantage.
   *
   * On ne bloque donc rien et on ne met rien à zéro : on NOMME la base. Même
   * règle que partout ailleurs — ce qui n'est pas mesuré se dit, il ne
   * s'invente pas.
   *
   * La valeur est identique sur toutes les suggestions d'une réponse : elle est
   * répétée parce que la réponse est un TABLEAU, et l'envelopper dans un objet
   * obligerait trois écrans à suivre un changement de forme pour un seul
   * entier. Absente d'une API antérieure au champ ⇒ l'écran ne dit rien de
   * plus, exactement comme avant.
   */
  seed_count: z.number().int().min(1).optional(),
  /**
   * #2127.26 / .27 / .29 — CE QUE LA SUGGESTION PARTAGE AVEC LE COMPTE DE RÉFÉRENCE.
   *
   * Distinct de `similarity_reasons` (ce que TU cibles, lu contre le profil
   * vendeur) et de `similarity_headline` (la raison principale, UNE) : ici, les
   * critères que le candidat partage avec le compte que la raison NOMME. Sur le
   * dossier d'un compte, c'est le compte ouvert.
   *
   * N'y entre que ce qui est VÉRIFIÉ des deux côtés : une donnée absente d'un
   * côté ne produit rien — jamais « zone différente », jamais « taille autre ».
   * Absent (ou vide) = rien à dire, et l'écran ne dit rien.
   */
  reference_shared: z.array(z.enum(SIMILARITY_SHARED_CRITERIA)).optional(),
})

/**
 * En dessous de combien d'amorces la carte NOMME sa base (D24, 26/08/2026).
 *
 * Trois, comme le nombre maximum d'amorces que le moteur retient : au plafond,
 * la proposition croise réellement plusieurs secteurs du portefeuille ; en
 * dessous, elle prolonge un seul compte et le dit.
 *
 * ⚠️ Ce n'est PAS le seuil que la spécification du 21/08 demandait — elle
 * exigeait « trois missions gagnées ». Basculer l'amorçage sur les missions
 * gagnées a été REFUSÉ : la plupart des espaces n'en ont aucune pendant des
 * mois, la fonctionnalité mourrait, et les deux bases ne disent pas la même
 * chose — les comptes analysés disent ce qu'on VISE, les missions gagnées ce
 * qu'on sait vendre.
 */
export const SIMILAR_SEED_FLOOR = 3

/**
 * #1576 — combien de missions signées il faut dans l'espace avant qu'une carte
 * ose dire « où tu as gagné une mission ».
 *
 * Trois, comme le retour l'écrit : « sous 3 missions gagnées dans l'espace, la
 * raison 1 est indisponible — on ne calcule pas une ressemblance sur deux
 * observations ». Le seuil porte sur l'ESPACE, pas sur le compte : une seule
 * mission sur un seul client ne dit pas encore ce que cette ESN sait vendre.
 *
 * ⚠️ À ne pas confondre avec {@link SIMILAR_SEED_FLOOR}, qui compte des comptes
 * ANALYSÉS et décide si la carte nomme sa base. Les deux valent trois et ne
 * mesurent pas la même chose : les comptes analysés disent ce qu'on VISE, les
 * missions signées ce qu'on a GAGNÉ.
 */
export const SIMILAR_TWIN_MIN_MISSIONS = 3

/**
 * One append-only analysis run for an account (Théo P0 : « Un compte racine,
 * plusieurs AnalysisRun. Historique, refresh, debug, export »). Surfaced by
 * ``GET /accounts/:id/runs`` and rendered in the account-detail « Historique des
 * analyses » panel. ``cost_eur`` arrives as a Postgres ``numeric`` string; dates
 * are ISO strings over the wire.
 */
export const analysisRunSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  status: z.string(),
  scope_mode: z.string().nullable(),
  siren: z.string().nullable(),
  cost_eur: z.union([z.string(), z.number()]).nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  /**
   * #2318.5 — LAU-FINAL-059, VERSIONING : les neuf identifiants qu'une analyse
   * doit conserver, assemblés par `buildAnalysisVersioning` (jamais recalculés
   * ici). Optionnel : un run lu par un chemin qui ne l'attache pas (voir
   * `AnalysisRunsService.listForAccount`) reste un run valide sans lui.
   */
  versioning: analysisVersioningSchema.optional(),
  /**
   * #3288 — le cadrage confirmé avant le débit ; seule la profondeur (`quick|verified|deep`) se lit
   * à l'écran. `null`/absent = un run d'avant les paliers, compté « vérifiée ».
   */
  scope_selection: z.object({ depth: analysisRunDepthSchema.optional() }).passthrough().nullable().optional(),
})

/**
 * #3212.4/.6 (épopée #3235) — la révision NOMMÉE d'un verdict qui a changé
 * entre les deux DERNIERS runs terminés de ce compte : ancien verdict,
 * nouveau verdict, cause(s), date. Surfacée par ``GET /accounts/:id/verdict-revision``
 * et par ``AccountRunsContainer``. `null` = rien à expliquer (moins de deux
 * runs terminés capturés, ou verdict inchangé) — jamais un tiroir vide qui se
 * lirait comme une révision passée sous silence.
 */
export const verdictRevisionSchema = z.object({
  previousVerdict: z.string(),
  newVerdict: z.string(),
  changedAt: z.string(),
  /** #3235 — le déclencheur NO-GO de chaque instantané : sans lui, un NO-GO ne se nomme pas comme la fiche. */
  previousNoGoTrigger: z.string().nullable().optional(),
  newNoGoTrigger: z.string().nullable().optional(),
  causes: z.array(z.string()).min(1),
})
export type VerdictRevision = z.infer<typeof verdictRevisionSchema>

/**
 * #4180 — « Même verdict depuis le <date> » : les deux dernières analyses terminées portent le MÊME verdict
 * (`compareLastRuns` → `unchanged`). `unchangedSince` = la plus ancienne analyse consécutive qui le portait déjà.
 * Absent (`null` côté route) quand le verdict a changé, est illisible, ou qu'il n'y a pas deux analyses.
 */
export type VerdictUnchanged = { unchangedSince: string }

/**
 * Cost transparency per account (Drive backlog #12 — Matteo gap-analysis : « pas
 * assez de visibilité sur les coûts réels des requêtes/APIs »). Surfaces the
 * ALREADY-tracked run cost so a commercial can pilot spend: nothing is invented,
 * every figure reads a stored column.
 *
 *  - `api_cost_euros`       → the account's own stored cost (``accounts.api_cost_euros``,
 *                             overwritten by the latest run — i.e. the current dossier).
 *  - `analyses_count`       → number of recorded ``analysis_runs`` rows for the account.
 *  - `total_run_cost_euros` → SUM of ``analysis_runs.cost_eur`` across the history,
 *                             ``null`` when no run carries a cost yet (legacy rows).
 *  - `last_run_cost_euros`  → the newest run's ``cost_eur``, ``null`` when untracked.
 *
 * Values are stored USD (Anthropic bills USD; the ``_euros``/``_eur`` names are a
 * legacy convention — see ``AccountsService.setApiCost``). Surfaced by
 * ``GET /accounts/:id/cost``.
 */
export const accountCostSummarySchema = z.object({
  account_id: z.string().guid(),
  api_cost_euros: z.number().nullable(),
  analyses_count: z.number().int().min(0),
  total_run_cost_euros: z.number().nullable(),
  last_run_cost_euros: z.number().nullable(),
})

/**
 * LES COMPTEURS DE TÊTE DU PORTEFEUILLE (PDF-04 §1.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE SERVEUR, ET PAS L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette liste est paginée (25/page, défilement infini). Un compteur dérivé des
 * comptes CHARGÉS mentirait dès la 2ᵉ page, et pire : il GRANDIRAIT en faisant
 * défiler, ce qui est le contraire de ce qu'un total raconte. Chaque compteur
 * est donc compté par le serveur sur l'ENSEMBLE du filtre — c'est ce que
 * `AccountContent.tsx` réclamait en toutes lettres depuis qu'on a retiré les
 * onglets, et c'est le chemin que `lifecycleTally` (contacts) a déjà ouvert.
 *
 * ⚠️ CHAQUE CHAMP EST OPTIONNEL, ET C'EST LA RÈGLE QUI COMPTE.
 * Absent ⇒ l'écran n'affiche RIEN pour ce compteur. Jamais « 0 » : « je n'ai
 * pas pu compter » et « il n'y en a aucun » sont deux phrases différentes, et
 * la seconde déclencherait un soulagement qu'aucune mesure ne justifie. Chaque
 * compteur échoue SÉPARÉMENT — une lecture ratée n'en éteint pas quatre.
 *
 * ⚠️ Deux des six compteurs de la source ne sont PAS ici, et c'est délibéré :
 *  - « montant du pipe (droit financier) » — Σ des affaires OUVERTES, une somme
 *    qui vit dans le pipe des projets et derrière `finance:read`. La colonne
 *    « Facturé » du portefeuille compte autre chose (ce qui EST facturé) ;
 *    servir l'une pour l'autre sous le mot « pipe » serait un chiffre faux.
 *  - « comptes dormants » — la décision parquée est LEVÉE (#2117.21, Louis,
 *    15/09/2026) : `dormant` EST une valeur de `commercialLifecycleSchema`
 *    depuis ce jour. Le COMPTEUR, lui, n'arrive pas avec elle, et pour la
 *    raison même qui avait fait parquer la décision : il compterait des comptes
 *    que quelqu'un a MIS en veille, jamais des comptes dont on n'a plus de
 *    nouvelles. Le jour où il existera, il lira la valeur déclarée
 *    (`commercial_status = 'dormant'`) et rien d'autre — dériver « dormant »
 *    d'un silence reste un refus écrit du §7 de la source.
 */
export const accountListCountersSchema = z.object({
  /**
   * Les comptes SUIVIS — `watching` / `opportunity` / `opening` / `customer`
   * (#2117.19 : un compte dont l'ouverture est engagée est suivi, sinon le
   * déplacer l'effacerait des compteurs). La même
   * population que le contrôle d'hygiène du cockpit
   * (`ACCOUNT_HYGIENE_PREDICATES.followedAccounts`), et par le même prédicat :
   * un compte qu'on ne suit pas n'attend rien de personne.
   */
  followed: z.number().int().optional(),
  /**
   * Parmi eux, ceux sur lesquels RIEN n'est programmé — aucune tâche ouverte
   * dont l'échéance est encore devant (`noUpcomingTask`). Le chiffre que la
   * pastille de ligne montre compte par compte, dit ici en une fois.
   */
  withoutNextAction: z.number().int().optional(),
  /**
   * Les comptes sur lesquels un signal est APPARU dans les sept derniers jours.
   *
   * ⚠️ Seules les détections EXACTES comptent : une ligne issue du backfill dit
   * seulement que le signal était DÉJÀ là à cette date, pas qu'il vient
   * d'apparaître. La compter ferait passer une reprise d'historique pour de
   * l'actualité.
   */
  newSignals7d: z.number().int().optional(),
  /**
   * Les comptes de classe d'accès A ou B — « les ouverts probables » de la
   * source. La classe vient de la barrière d'accès de l'analyse ; un compte
   * jamais évalué n'est dans AUCUNE classe, il n'est donc pas compté (et n'est
   * surtout pas rangé en D par défaut).
   */
  accessClassAB: z.number().int().optional(),
  /** Refonte Théo — « Comptes dans l'espace » : tout le périmètre filtré. Illisible = absent, jamais 0. */
  total: z.number().int().optional(),
  /** Refonte Théo — « Relations actives » : compte client ou ouverture en cours. */
  activeRelations: z.number().int().optional(),
  /** Refonte Théo — « Favoris » : les comptes épinglés par l'appelant. */
  favorites: z.number().int().optional(),
  /** #4526.5 — « Mon CRM » : même prédicat que le filtre `crm`. Illisible = absent, jamais 0 ; 0 = la puce se tait. */
  crm: z.number().int().optional(),
  /** #4597.1 — « Importés » : même prédicat que le filtre `imported`. Illisible = absent, jamais 0 ; 0 = la puce se tait. */
  imported: z.number().int().optional(),
})
export type AccountListCounters = z.infer<typeof accountListCountersSchema>

export const accountListResponseSchema = paginatedResultSchema(accountListItemSchema).extend({
  /**
   * Optionnel : seule la 1ʳᵉ page (offset 0) les calcule — les pages suivantes
   * n'ont pas à repayer l'agrégat, et les instantanés IndexedDB d'avant ce
   * déploiement (sans le champ) restent valides.
   */
  counters: accountListCountersSchema.optional(),
})

/** L'échelle d'importance d'un signal — sa dérivation est documentée sur
 *  {@link signalImportance} (déclarée ici parce que le schéma la consomme). */
export const signalImportanceSchema = z.enum(['high', 'medium', 'low'])
export type SignalImportance = z.infer<typeof signalImportanceSchema>

export const accountSignalItemSchema = z.object({
  id: z.string().min(1),
  account_id: z.string().guid(),
  account_created_at: z.string(),
  account_score: z.number().nullable(),
  company_name: z.string(),
  date: z.string().nullable(),
  label: z.string(),
  sector: z.string().nullable(),
  source: z.string().nullable(),
  /** #3922 — le lien vérifiable de la source ; `null` = « Sans lien vérifiable » (jamais deviné). */
  source_url: z.string().nullable().optional(),
  /** #3922 — le genre de source (`resolveSignalSourceLink` le valide). */
  source_kind: z.string().nullable().optional(),
  /** #4182.5 — le dossier « qui demande ce profil ? » d'une offre (lu dans son texte) ; absent = non composé. */
  requester: z.record(z.string(), z.unknown()).nullable().optional(),
  /** #4437.5 — le rattachement d'une offre (compétences, famille métier, type de fait, extrait lu) ; `unclassified` = « non classé », jamais deviné ; absent = collecte antérieure. */
  offer_attachment: z
    .object({
      status: z.enum(['attached', 'unclassified']),
      fact_type: z.string().nullable(),
      skills: z.array(z.string()),
      job_family: z.string().nullable(),
      extract: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /** #4756 — le lieu d'une offre, tel que le collecteur l'a lu (`recent_signals[].location`) ; absent = inconnu, jamais deviné. */
  location: z.string().nullable().optional(),
  /** #3922.3 — quand le segment signaux de ce compte a été collecté : l'écran le compare à la capacité « lien source » (`SEGMENT_CAPABILITY_EPOCH.signals`) pour DIRE « collecte antérieure ». */
  signals_collected_at: z.string().nullable().optional(),
  type: z.string().nullable(),
  // current | archive | undated — stamped by the IA (mirror of signal_freshness.py).
  freshness: z.string().nullable().optional(),
  /**
   * #3206.3 (épopée #3240) — ADDITIF à `freshness`, jamais un remplacement :
   * RECENT | HISTORICAL | STALE | UNDATED, stampé par l'IA (mirror de
   * `classify_temporal_status` dans `signal_freshness.py`). CURRENT_VERIFIED
   * et SUPERSEDED ne sont jamais émis — ils supposeraient un événement de
   * vérification et une détection de doublon qui n'existent pas encore.
   * `null`/absent sur une ligne d'avant ce déploiement : {@link classifyTemporalStatus}
   * la dérive alors avec la MÊME règle, jamais une seconde règle divergente.
   */
  temporal_status: z.string().nullable().optional(),
  /**
   * #3206.2 (épopée #3240) — la fenêtre de fraîcheur (en jours) qui a servi à
   * classer CE signal pour son type, exposée telle quelle depuis
   * `archive_after_days()` : pas une valeur nouvelle, celle qui a déjà décidé.
   */
  freshness_window_days: z.number().int().nullable().optional(),
  /**
   * « Ce que ça peut vouloir dire commercialement » (#1424).
   *
   * Produit par l'analyse (`sales_implication` de `research.py`), stocké dans
   * `recent_signals`, semé en démo, affiché sur la fiche compte et dans le PDF —
   * et JETÉ par cette projection jusqu'au 04/09/2026. La Veille écrivait donc la
   * même phrase statique sous les deux cents signaux d'un espace.
   *
   * `null` quand le signal n'en porte pas : l'écran n'affiche alors rien de plus
   * qu'un conseil générique, jamais une lecture inventée.
   */
  sales_implication: z.string().nullable().optional(),
  /**
   * #2107.31 — l'AMPLEUR business du signal pour l'entreprise cible, distincte
   * de `sales_implication` (« pourquoi pour l'ESN »). Reparentée depuis
   * `recent_signals[].impact` (research.ts), jamais recalculée ici — même
   * discipline que `sales_implication` juste au-dessus.
   */
  impact: z.string().nullable().optional(),
  /**
   * De quoi RECONNAÎTRE l'entreprise dans le flux (#1423).
   *
   * `logo_url` est le logo réel persisté ; `website` sert au repli favicon
   * calculé à l'affichage. Les deux existent en base depuis des mois — la
   * requête du flux ne les sélectionnait pas, et la Veille montrait une colonne
   * d'initiales là où le reste du produit montre des logos.
   */
  logo_url: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  // ── Signal history (V2 §11) ────────────────────────────────────────────────
  // Joined from the `signal_history` table when the signal has been materialized
  // (every completed analysis + every refresh does it). All optional: a signal
  // seen for the first time by an older build simply carries no history yet, and
  // the UI then says nothing rather than guessing a date.
  // `date` above is the date OF the news; `first_detected_at` is when BELLUM
  // first saw it — two different questions the Veille used to conflate.
  first_detected_at: z.string().nullable().optional(),
  // false = backfilled row: the signal was already there at that date, we don't
  // know when it appeared → the UI says "tracked since", never "detected on".
  first_detection_exact: z.boolean().optional(),
  last_seen_at: z.string().nullable().optional(),
  last_changed_at: z.string().nullable().optional(),
  change_count: z.number().int().min(0).optional(),
  // active | resolved — resolved = no longer present in the latest analysis.
  history_status: z.string().nullable().optional(),
  resolved_at: z.string().nullable().optional(),
  // ── Importance + action déclenchée (V2 §20 — l'objet `Signal`) ──────────────
  // `importance` est DÉRIVÉE de règles déjà en place (cf. `signalImportance`),
  // jamais un score inventé : `null` quand rien ne permet de la calculer.
  importance: signalImportanceSchema.nullable().optional(),
  // L'action que ce signal a effectivement déclenchée (`action_plan_items`).
  // `null` = le signal n'a encore rien produit — l'écran n'affiche alors rien.
  action_id: z.string().guid().nullable().optional(),
  action_label: z.string().nullable().optional(),
  /**
   * Théo L1 — sélecteur avancé — l'identifiant de la ligne d'historique de ce
   * signal (`signal_history.id`). C'est par lui qu'une OFFRE D'EMPLOI se désigne
   * comme périmètre de Laura (`job_offer`) : la seule identité stable d'un
   * signal, le blob `recent_signals` étant réécrit à chaque analyse. Absent tant
   * que le signal n'est pas historisé — jamais un identifiant deviné.
   */
  history_id: z.string().guid().optional(),
  /**
   * #3206.2 (partiel, épopée #3240) — la dernière fois qu'un commercial a
   * cliqué « Marquer vérifié » sur ce signal (`POST /signal-history/verify`).
   * `null` tant que personne ne l'a fait — jamais déduit d'une re-détection :
   * une observation n'est pas une vérification. Alimente
   * {@link classifyTemporalStatus} pour CURRENT_VERIFIED.
   */
  last_verified_at: z.string().nullable().optional(),
  /**
   * #4088.2 — « QUI ÇA CONCERNE » : le contact le mieux placé du compte, celui que
   * le classement des contacts (`rankAccountContacts`, le MÊME que l'onglet
   * Contacts du dossier, GA-26) met en tête de son chemin recommandé. Nom et
   * intitulé de poste EN CLAIR. `null` = le compte n'a aucun contact classable ;
   * absent = non lu (réponse d'avant ce déploiement, lecture indisponible) —
   * jamais un nom deviné. Aucun critère protégé n'entre dans ce rang (c58).
   */
  decision_maker: z
    .object({ contact_id: z.string(), name: z.string(), title: z.string().nullable() })
    .nullable()
    .optional(),
})

// ── Signal freshness (single source of truth for "nouveaux signaux") ──────────
// TS mirror of apps/ia/app/services/signal_freshness.py so the Cockpit and the
// Veille count the SAME thing (Théo restitution p.35/p.40: "les KPI doivent
// partager la même source"; a 2021 signal is an archive, not a live trigger).
const SIGNAL_ARCHIVE_AFTER_MS = 730 * 24 * 60 * 60 * 1000 // ~24 months

const SIGNAL_YEAR = '(?:19|20)\\d{2}'
// Numeric shapes, anchored on the first year: a year RANGE ("2023-2024") or year[-/]month[-/]day.
const SIGNAL_NUMERIC_RE = new RegExp(
  `(${SIGNAL_YEAR})[-–/](${SIGNAL_YEAR})(?!\\d)|(${SIGNAL_YEAR})(?:[-/](\\d{1,2})(?!\\d)(?:[-/](\\d{1,2})(?!\\d))?)?`,
)
// "23 octobre 2026", "1er oct. 2026", "octobre 2026" — text is accent-stripped + lowercased first.
const SIGNAL_TEXT_RE = new RegExp(
  `(?<!\\d)(?:(\\d{1,2})(?:er|ere)?\\s+)?([a-z]{3,9})\\.?\\s+(${SIGNAL_YEAR})(?!\\d)`,
  'g',
)
const SIGNAL_MONTHS_FR: Readonly<Record<string, number>> = {
  janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4,
  mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9,
  octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
} // prettier-ignore

/** The FIRST plausible date in a date-ish string, as a UTC ms timestamp. Anchors
 *  on the first year and only consumes a month/day that belongs to THAT year —
 *  numeric glued to it ("2021-03-10") or spelled out in French around it
 *  ("23 octobre 2026", "1 janv. 2026", accents/case/dot free) — so
 *  "2024 (full year accounts filed 2025-11)" reads 2024, not the later 2025-11.
 *  Month clamped to 1-12, day to the real last day of the month. `null` when no year.
 *  #4832 — an INCOMPLETE date reads at the END of its period (« 2024 » → 31/12/2024, « 2024-03 » → 31/03/2024,
 *  « octobre 2026 » → 31/10/2026; a year range « 2023-2024 » → end of 2024), never its start: the same clock as
 *  the IA's `read_signal_date` (#4647), so a fact is never `archive` here and `current` there. One reading of a
 *  range, in `periodEndMs`.
 *
 *  ⚠️ TWIN of `read_signal_date` in apps/ia/app/services/signal_freshness.py (#4647):
 *  the same shapes must be read in BOTH files — fix one, fix the other (#4716).
 *  English months are read by neither ("à mesurer", #4647).
 *  Exported so the API's weekly veille digest windows on the SAME clock.
 *  #4832 — lit la FIN de la période (miroir de `read_signal_date`, #4647), pas son début : c'est la lecture
 *  de CLASSEMENT (archive, fenêtre des digests, provenance). `_parse_signal_date` (début) ne sert qu'à
 *  `source_judge` côté IA et n'a pas de consommateur TS.
 *  ⚠️ change one, change the other (cas partagés : signal-date.test.ts ↔
 *  apps/ia/tests/test_signal_freshness.py, #4716). */
export function signalDateMs(date: string | null | undefined): number | null {
  const text = String(date ?? '')
  // #4832 — une PLAGE d'années (« 2023-2024 ») vaut la fin de SA dernière année, jamais « mois 20 » (le `-20` de
  // « 2024 » avalé comme un mois débordait sur 2024-08). Même lecture que `_read_parts` côté IA.
  const range = /((?:19|20)\d{2})\s*[-–/]\s*((?:19|20)\d{2})/.exec(text)
  if (range) return Date.UTC(Number(range[2]), 11, 31)
  const m = /((?:19|20)\d{2})(?:[-/](0?[1-9]|1[0-2])(?!\d)(?:[-/](\d{1,2}))?)?/.exec(text)
  if (!m) return null
  const year = Number(m[1])
  if (m[2]) return periodMs(year, Number(m[2]), m[3] ? Number(m[3]) : null)
  const named = monthDayBeforeYear(text.slice(0, m.index))
  if (!named) return Date.UTC(year, 11, 31)
  return periodMs(year, named.month, named.day)
}

/** #4832 — une date incomplète vaut la FIN de sa période : dernier jour du mois, 31/12 pour l'année seule (#4647). */
function periodMs(year: number, month: number, day: number | null): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Date.UTC(year, month - 1, day === null ? lastDay : Math.min(lastDay, Math.max(1, day)))
}

/** A signal is archived when the IA stamped it `archive`, or (legacy rows with no
 *  stamp) when its date is older than ~24 months. Undated / future → not archived. */
export function isSignalArchived(signal: { freshness?: string | null; date?: string | null }, nowMs: number): boolean {
  const f = (signal.freshness ?? '').toLowerCase()
  if (f === 'archive') return true
  if (f === 'current' || f === 'undated') return false
  const ms = signalDateMs(signal.date)
  return ms !== null && nowMs - ms > SIGNAL_ARCHIVE_AFTER_MS
}

/**
 * Importance d'un signal (V2 §20 — le rapport exige « type, source, date,
 * fraîcheur, IMPORTANCE, action » et il manquait une pondération).
 *
 * Échelle courte et **entièrement dérivée de règles déjà en vigueur** — aucun
 * score n'est inventé, aucun poids n'est choisi à la main :
 *
 *  - `low`    — le signal est ARCHIVÉ au sens de {@link isSignalArchived}, la
 *               règle partagée Cockpit/Veille : « un signal de 2021 est une
 *               archive, pas un déclencheur ».
 *  - `high`   — signal actif ET SOURCÉ. C'est exactement la règle du moteur de
 *               preuves du pipeline (`app/services/dated_proof.py` : « un signal
 *               sans source n'est pas une preuve ») : seul un signal actif qu'on
 *               peut citer justifie une action.
 *  - `medium` — signal actif mais sans source citable : réel, non opposable.
 *  - `null`   — RIEN ne permet de le situer dans le temps (fraîcheur `undated`
 *               stampée par l'IA, ou aucune date lisible et aucun stamp). On ne
 *               devine pas : l'écran n'affiche alors aucune importance.
 */
export function signalImportance(
  signal: { freshness?: string | null; date?: string | null; source?: string | null },
  nowMs: number = Date.now(),
): SignalImportance | null {
  const freshness = (signal.freshness ?? '').toLowerCase()
  // L'IA a explicitement dit « je n'ai pas su dater » → on ne pondère pas.
  if (freshness === 'undated') return null
  // Ni stamp de fraîcheur, ni année lisible : aucune base pour juger.
  if (freshness !== 'current' && freshness !== 'archive' && signalDateMs(signal.date) === null) return null
  if (isSignalArchived(signal, nowMs)) return 'low'
  return (signal.source ?? '').trim().length > 0 ? 'high' : 'medium'
}

/** Count of ACTIVE (non-archived) signals — the shared "nouveaux signaux" metric. */
export function countActiveSignals(
  signals: ReadonlyArray<{ freshness?: string | null; date?: string | null }>,
  nowMs: number = Date.now(),
): number {
  return signals.reduce((n, s) => (isSignalArchived(s, nowMs) ? n : n + 1), 0)
}

// ── Statuts temporels nommés (#3206.3, épopée #3240) ──────────────────────────
// `temporalStatusSchema` est défini une seule fois (`analysis/research.js`,
// à côté de `signalFreshnessSchema`) — réutilisé ici, jamais redéfini.

/** Types dont un signal ARCHIVÉ reste un ÉTAT passé utile de contexte plutôt
 *  qu'une fenêtre d'action manquée — mirror de `_STATE_SIGNAL_TYPES`
 *  (`signal_freshness.py`), une seule liste, jamais deux qui divergent. */
const STATE_SIGNAL_TYPES = new Set(['nomination', 'partenariat', 'restructuration', 'acquisition'])

/**
 * #3206.2 (partiel, épopée #3240) — combien de temps une VÉRIFICATION humaine
 * reste valable avant de retomber sur le statut dérivé. Une vérification se
 * périme aussi : « vérifié il y a un an » n'est plus une raison de dire
 * CURRENT_VERIFIED aujourd'hui. Tranché sans Louis : 90 jours, le même ordre
 * de grandeur qu'un trimestre commercial.
 */
const VERIFICATION_VALID_MS = 90 * 24 * 60 * 60 * 1000

/**
 * RECENT / HISTORICAL / STALE / UNDATED / CURRENT_VERIFIED / SUPERSEDED pour
 * un signal — d'abord SUPERSEDED (`history_status: 'resolved'`,
 * `signal_history` : ce signal n'est plus rapporté par la dernière analyse —
 * la donnée dit elle-même qu'il a été remplacé, reste du 30/09 épopée #3240),
 * puis une vérification humaine RÉCENTE (`last_verified_at`, posée par
 * `POST /signal-history/verify`, JAMAIS déduite d'une re-détection : une
 * observation n'est pas une vérification — elle gagne sur tout le reste, même
 * doctrine que « une correction humaine gagne toujours »), sinon le stamp posé
 * par l'IA (`temporal_status`), sinon dérivé avec la MÊME règle que
 * `classify_temporal_status` (Python) à partir de `freshness`/`date`/`type`,
 * pour les lignes analysées avant ce déploiement. `null` quand rien ne situe
 * le signal dans le temps (même garde que {@link signalImportance} : jamais
 * une devinette).
 *
 * SUPERSEDED gagne même sur CURRENT_VERIFIED : un signal qu'un commercial a
 * vérifié puis qui a disparu de l'analyse suivante n'est plus le fait actuel,
 * quelle que soit la fraîcheur de cette vérification passée.
 */
export function classifyTemporalStatus(
  signal: {
    temporal_status?: string | null
    freshness?: string | null
    date?: string | null
    type?: string | null
    last_verified_at?: string | null
    history_status?: string | null
  },
  nowMs: number = Date.now(),
): TemporalStatus | null {
  if (signal.history_status === 'resolved') return 'SUPERSEDED'
  if (signal.last_verified_at) {
    const verifiedMs = Date.parse(signal.last_verified_at)
    if (Number.isFinite(verifiedMs) && verifiedMs <= nowMs && nowMs - verifiedMs <= VERIFICATION_VALID_MS) {
      return 'CURRENT_VERIFIED'
    }
  }
  const stamped = temporalStatusSchema.safeParse((signal.temporal_status ?? '').toUpperCase())
  if (stamped.success) return stamped.data
  const freshness = (signal.freshness ?? '').toLowerCase()
  if (freshness === 'undated') return 'UNDATED'
  if (freshness !== 'current' && freshness !== 'archive' && signalDateMs(signal.date) === null) return null
  if (!isSignalArchived(signal, nowMs)) return 'RECENT'
  return STATE_SIGNAL_TYPES.has((signal.type ?? '').trim().toLowerCase()) ? 'HISTORICAL' : 'STALE'
}

/**
 * Corps de `POST /accounts/needs/play` — préparer l'attaque d'un besoin.
 *
 * Le besoin n'existe pas en base : il est dérivé de `raw_analysis` à chaque
 * lecture. L'écran envoie donc ce qu'il affiche, et le serveur en recalcule la
 * clé stable (`needKey`) — c'est elle qui décide si l'équipe repaie ou relit.
 */
export const needPlayRequestSchema = z.object({
  account_id: z.string().guid(),
  kind: z.string().min(1).max(40),
  label: z.string().min(1).max(500),
  detail: z.string().max(4000).nullish(),
  offer: z.string().max(200).nullish(),
  urgency: z.string().max(100).nullish(),
})
export type NeedPlayRequest = z.infer<typeof needPlayRequestSchema>

export type Account = z.infer<typeof accountSchema>
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>
export type CreateAccount = z.infer<typeof createAccountSchema>
export type AccountSortKey = z.infer<typeof accountSortKeySchema>
export type AccountScoreFilter = z.infer<typeof accountScoreFilterSchema>
export type AccountListQuery = z.infer<typeof accountListQuerySchema>
export type AccountListItem = z.infer<typeof accountListItemSchema>
export type AccountListResponse = z.infer<typeof accountListResponseSchema>
export type AccountSignalItem = z.infer<typeof accountSignalItemSchema>
export type AccountNeedsRow = z.infer<typeof accountNeedsRowSchema>
export type SimilarAccountSuggestion = z.infer<typeof similarAccountSuggestionSchema>
export type AnalysisRun = z.infer<typeof analysisRunSchema>
export type AccountCostSummary = z.infer<typeof accountCostSummarySchema>
