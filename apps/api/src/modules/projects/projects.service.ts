import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CASE_BUYING_MODELS,
  CASE_ORGANISATIONS,
  CASE_STRATEGIES,
  CLOSED_UNWON_STAGES,
  decayedConfidence,
  INTAKE_STAGES,
  mostAdvancedNeedStatusSql,
  opportunityEvidenceGaps,
  opportunityFreshness,
  opportunityReadiness,
  opportunityStageDetail,
  projectEvidence,
  projectStageInSql,
  projectStageNotInSql,
  PROJECT_SIMILAR_MAX,
  stageTransitionEffects,
  taskStillOpenSql,
  timelineSystemSubject,
  SIGNAL_DOMAIN_CODES,
  TRIAGED_STAGES,
  type AccountManagerReviewArbitration,
  CLOSED_SUBMISSION_STAGES,
  type ProjectReadinessRow as ContractProjectReadRow,
  type ProjectStage,
  type Btmmp,
  type ProjectLearningRow,
  type ProjectRow,
  type ProjectSimilarResponse,
  type CaseBuyingModel,
  type CaseOrganisation,
  type CaseStrategy,
  type UpdateProjectCaseDimensions,
  type UpdateProjectSectors,
  type ForecastCategory,
} from '@bellum/contracts'
import { firstReturnedRow } from '../../database/returned-rows'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ActivitiesService } from '../activities/activities.service'
import { CommercialTransitionsService } from '../commercial-transitions/commercial-transitions.service'
import { rankSimilar, significantTerms } from './project-similarity'

/**
 * #3978 — le domaine d'offre CLASSÉ par le modèle à l'analyse (`domain_code`, ou
 * `domainCode` selon la voie qui a écrit le JSON), borné au vocabulaire fermé
 * `SIGNAL_DOMAIN_CODES` (paramètre `$2`). Un code hors liste n'est pas écrit ni
 * « corrigé » : `NULL`, c'est-à-dire « non mesuré » à l'écran, jamais un domaine deviné.
 */
const classifiedDomainSql = (alias: string): string => {
  const code = `lower(btrim(COALESCE(${alias}->>'domain_code', ${alias}->>'domainCode')))`
  return `CASE WHEN ${code} = ANY($2::text[]) THEN ${code} END`
}

/**
 * #3978.2 — remplit `primary_domain_code` des lignes DÉJÀ matérialisées d'une voie à
 * partir du classement le plus récent de `raw_analysis` / colonnes du compte. Une seule
 * ligne par libellé (le premier classé gagne, comme `DO NOTHING` garde le premier), et
 * jamais d'écrasement : `o.primary_domain_code IS NULL` est la seule porte.
 */
const domainFillSql = (kind: string, itemsSql: string, alias: string, labelSql: string): string => `
  UPDATE opportunities o
     SET primary_domain_code = d.code
    FROM (
      SELECT DISTINCT ON (md5(src.label)) md5(src.label) AS label_hash, src.code
        FROM (
          SELECT ${labelSql} AS label, ${classifiedDomainSql(alias)} AS code, t.ord
            FROM accounts a
           CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(${itemsSql}) = 'array' THEN ${itemsSql} ELSE '[]'::jsonb END) WITH ORDINALITY AS t(${alias}, ord)
           WHERE a.id = $1
             AND a.status <> 'deleted'
        ) src
       WHERE src.label IS NOT NULL AND src.code IS NOT NULL
       ORDER BY md5(src.label), src.ord
    ) d
   WHERE o.account_id = $1
     AND o.kind = '${kind}'
     AND md5(o.label) = d.label_hash
     AND o.primary_domain_code IS NULL
`

/** #3246 — une valeur hors vocabulaire fermé sort `null`, jamais devinée. */
function closedCaseDimensions(row: {
  strategy: string | null
  buying_model: string | null
  organisation: string | null
}): {
  strategy: CaseStrategy | null
  buying_model: CaseBuyingModel | null
  organisation: CaseOrganisation | null
} {
  return {
    strategy: CASE_STRATEGIES.find(code => code === row.strategy) ?? null,
    buying_model: CASE_BUYING_MODELS.find(code => code === row.buying_model) ?? null,
    organisation: CASE_ORGANISATIONS.find(code => code === row.organisation) ?? null,
  }
}

/**
 * The wire projection of one opportunity joined to its account. Written once and
 * reused by every read below so the three queries can never drift apart.
 */
const ROW_PROJECTION = `
  o.id                AS id,
  o.account_id        AS account_id,
  a.company_name      AS company_name,
  a.sector            AS sector,
  -- #1325 - une liste d'entreprises se reconnait, elle ne se lit pas. Le
  -- Kanban n'affichait qu'une colonne de noms parce que ces deux colonnes ne
  -- voyageaient pas ; le composant d'avatar, lui, existait deja cote ecran.
  -- (Pas d'accent grave ici : on est DANS un template literal.)
  a.logo_url          AS logo_url,
  a.website           AS website,
  o.kind              AS kind,
  o.label             AS label,
  o.detail            AS detail,
  o.offer             AS offer,
  o.source            AS source,
  o.confidence        AS confidence,
  o.urgency           AS urgency,
  o.stage             AS stage,
  o.stage_entered_at  AS stage_entered_at,
  o.owner_id          AS owner_id,
  -- #4191 R22 - le nom du porteur voyage avec la ligne (profil), sans dépendre de la liste des membres.
  (SELECT NULLIF(TRIM(CONCAT_WS(' ', pown.first_name, pown.last_name)), '')
     FROM profiles pown WHERE pown.user_id = o.owner_id LIMIT 1) AS owner_name,
  -- #2172.37 - ce qu'on cherche a obtenir, ecrit a la conversion d'une piste.
  -- NULL = personne ne l'a ecrit ; jamais devine depuis le libelle du besoin.
  o.objective         AS objective,
  -- #2324.37 - les risques de l'affaire. NULL = personne ne les a ecrits.
  o.risks             AS risks,
  -- #3266.1 (#3292) - le grain equipe/site/projet, saisi par le commercial.
  -- NULL = personne ne l'a ecrit, jamais devine depuis l'org-graph du compte.
  o.scope_label       AS scope_label,
  o.expected_close_on AS expected_close_on,
  -- L2 Pipe — déclaration humaine, NULL = non déclarée (jamais devinée).
  o.forecast_category AS forecast_category,
  o.closed_at         AS closed_at,
  o.outcome           AS outcome,
  o.access_mode       AS access_mode,
  o.loss_reason       AS loss_reason,
  o.loss_reason_code  AS loss_reason_code,
  o.btmmp             AS btmmp,
  o.first_detected_at AS first_detected_at,
  o.updated_at        AS updated_at,
  -- #2171.39 — NULL = active, un horodatage = rangée. Jamais un second
  -- status : stage/outcome gardent ce qu'ils portaient (même mécanisme que
  -- project_needs.archived_at). (Pas d'accent grave ici : on est DANS un
  -- template literal.)
  o.archived_at        AS archived_at,
  -- numeric revient en string via le driver pg ; le cast float8 le rend en nombre
  -- JS (les montants sont des euros, la precision double suffit) — le wire porte
  -- alors number|null, jamais une chaine qui casserait un toLocaleString cote web.
  o.estimated_amount::float8 AS estimated_amount,
  -- bigint revient aussi en chaîne : le cast rend un nombre JS. Les centimes d'un
  -- pipe ESN tiennent très largement dans un entier sûr.
  o.amount_cents::int AS amount_cents,
  o.currency          AS currency,
  -- Le secteur d'APPLICATION de la demande et la famille de prestation achetée
  -- (addendum Stelya §4.1). Ils ne sont PAS repris du compte : un compte
  -- industriel porte « automatisation d'une ligne » et « maintenance nucléaire »,
  -- et leur donner le secteur du groupe rend interchangeables deux profils qui
  -- ne le sont pas.
  o.application_sector_codes AS application_sector_codes,
  o.primary_domain_code      AS primary_domain_code,
  -- Une mission existe-t-elle déjà sur ce projet ? Le §15 veut qu'un retour
  -- arrière depuis « gagné » soit BLOQUÉ tant qu'elle n'est pas traitée, et
  -- l'écran ne peut pas le savoir seul. Calculé ici, dans la MÊME requête :
  -- une seconde lecture par carte transformerait le pipe en attente.
  EXISTS (SELECT 1 FROM missions m WHERE m.opportunity_id = o.id) AS has_mission,
  -- #2170.19 - LE NOMBRE DE PROFILS POSITIONNES. Meme predicat que
  -- positioned_consultants_count sur UN besoin (open-needs.service.ts,
  -- decision Louis 17/09 : submitted_at IS NOT NULL est LA condition),
  -- somme sur TOUS les besoins du PROJET : la carte compte l'affaire, pas un
  -- role recherche. Cast ::int : COUNT(*) revient en bigint (chaine pg), le
  -- meme defaut que amount_cents juste au-dessus.
  -- (Pas d'accent grave ici : on est DANS un template literal.)
  (SELECT COUNT(*) FROM submissions sub
     JOIN project_needs n ON n.id = sub.need_id
    WHERE n.project_id = o.id AND sub.submitted_at IS NOT NULL)::int AS positioned_count,
  -- #2170.13 - LE BESOIN PRINCIPAL, sur la carte. ProjectNeedsPanel n'existait
  -- que dans le tiroir de detail : la carte ne disait rien du role recherche.
  --
  -- Le PREMIER besoin NON ARCHIVE (cree en premier) : le role pour lequel
  -- l'affaire a ete ouverte, jamais le besoin le PLUS AVANCE
  -- (most_advanced_need_status, project-pipeline.service.ts) qui repond a une
  -- question differente (ou en est le staffing) -- deux definitions de
  -- "principal" divergeraient au premier projet a deux besoins (GA-26).
  --
  -- NULL = aucun besoin rattache, un etat valide depuis #2558.1.
  (
    SELECT n.title FROM project_needs n
     WHERE n.project_id = o.id AND n.archived_at IS NULL
     ORDER BY n.created_at ASC
     LIMIT 1
  ) AS primary_need_title,
  -- Théo C projects-pipeline.N3 - LE NOMBRE DE POSTES, sur la carte (« Estimation HT · N poste(s) »). Somme des
  -- postes des besoins NON ARCHIVES ; SUM sur zero ligne rend NULL, et c'est voulu : une affaire sans besoin n'a pas
  -- de ligne, jamais « 0 poste ». Cast ::int : SUM(int) revient en bigint (chaine pg).
  (
    SELECT SUM(n.headcount) FROM project_needs n
     WHERE n.project_id = o.id AND n.archived_at IS NULL
  )::int AS needs_headcount,
  -- #4344.2 - le MEME besoin (meme ORDER BY), par son identifiant : la carte du pipe mene a sa fiche.
  (
    SELECT n.id FROM project_needs n
     WHERE n.project_id = o.id AND n.archived_at IS NULL
     ORDER BY n.created_at ASC
     LIMIT 1
  ) AS primary_need_id,
  -- #1325 (4/9) - LA PROCHAINE ACTION, sur la carte et non plus seulement comptee.
  --
  -- L'entete de colonne disait deja "N sans prochaine action" (#1325 3/9.1) :
  -- le serveur SAVAIT donc, projet par projet, si une tache ouverte existait --
  -- il n'en rendait que la SOMME. La carte, elle, ne pouvait rien en dire, et
  -- l'issue demande "Prochaine action : envoyer 3 profils vendredi", pas un
  -- compteur. C'est le defaut n.1 du depot vu par l'autre bout : la donnee est
  -- calculee, personne ne la sert.
  --
  -- Le predicat vient de "taskStillOpenSql" et n'est PAS reecrit (GA-54) : le
  -- meme compteur d'entete l'utilise, et deux definitions de "encore ouverte"
  -- feraient dire a la colonne et a la carte deux choses opposees sur la meme
  -- tache annulee.
  --
  -- Une SEULE sous-requete qui rend un objet, plutot que deux qui rendraient
  -- chacune un champ : deux ORDER BY identiques ecrits deux fois sont deux
  -- occasions de diverger, et rien ne garantirait que le titre et la date
  -- viennent de la MEME tache.
  --
  -- "due_on::text" : la colonne est de type "date", et le driver pg rend un
  -- OBJET pour ce type en SQL brut. Sans le cast, le wire porterait une valeur
  -- que le contrat declare "string" -- le piege deja paye sur ce depot.
  --
  -- "NULL" = aucune tache ouverte, ce qui est une vraie reponse (c'est
  -- exactement ce que "without_next_action" compte). L'absence du CHAMP, elle,
  -- veut dire que l'API est anterieure au lot : le contrat le distingue.
  (
    SELECT json_build_object('title', tk.title, 'due_on', tk.due_on::text)
      FROM tasks tk
     WHERE tk.project_id = o.id AND ${taskStillOpenSql('tk')}
     ORDER BY tk.due_on ASC, tk.created_at ASC
     LIMIT 1
  ) AS next_action,
  -- #2170.5 - LE STADE DERIVE "EN ENTRETIEN(S)", jamais saisi. Decision Louis
  -- G6 16/09 : submissions.stage = 'interview' reste la source de verite (un
  -- entretien concerne une PERSONNE, pas une affaire) ; le projet affiche un
  -- derive, somme sur tous ses positionnements. Meme jointure directe que
  -- positioned_count aurait pu utiliser (submissions.project_id existe en
  -- direct, need_id est nullable) -- un COUNT qui ne depend pas d'un besoin
  -- rattache.
  (SELECT COUNT(*) FROM submissions sub
    WHERE sub.project_id = o.id AND sub.stage = 'interview')::int AS interview_count,
  -- #2170.50 - PARMI CES ENTRETIENS, AU MOINS UN prevu dans les sept jours a
  -- venir. Seule la table "interviews" porte une DATE (scheduled_at) ; le
  -- stage du positionnement ne la porte pas. Fenetre glissante depuis
  -- MAINTENANT, jamais depuis minuit : un entretien a 8h ne doit pas sortir
  -- du filtre a 8h01.
  EXISTS (
    SELECT 1 FROM interviews i
      JOIN submissions sub ON sub.id = i.submission_id
     WHERE sub.project_id = o.id
       AND i.scheduled_at >= now()
       AND i.scheduled_at < now() + interval '7 days'
  ) AS interview_this_week,
  -- #2170.3 (tranché sans Louis) — de quoi calculer stage_detail à la lecture
  -- (withStageDetail, plus bas) : le même besoin le PLUS AVANCÉ que le
  -- diagnostic de pipe lit déjà (project-pipeline.service.ts), écrit une
  -- seule fois (GA-26 — mostAdvancedNeedStatusSql, @bellum/contracts).
  -- N'est PAS une colonne du contrat de carte : projection interne, jamais
  -- renvoyée telle quelle (voir withStageDetail).
  ${mostAdvancedNeedStatusSql('o.id')} AS most_advanced_need_status
`

/**
 * How many rows the cross-account comparison scores in memory. The SQL already
 * narrows to the needs that share at least one word with the reference; this is
 * the ceiling that keeps a 300-account workspace from ranking its whole graph on
 * one click.
 */
const SIMILAR_CANDIDATE_LIMIT = 200

/** Borne dure de l'agrégat d'apprentissage — au-delà, ce n'est plus une leçon,
 *  c'est un export. */
const LEARNING_MAX_ROWS = 60

/**
 * Applique la décroissance de fraîcheur à la confiance d'une ligne
 * (addendum final p47 — « opportunity decay »).
 *
 * Sans elle, un recrutement repéré en mars continue d'être annoncé « confiance
 * élevée » en septembre, et le commercial ouvre sa journée sur une urgence
 * périmée. La confiance ne remonte JAMAIS avec le temps : seule une preuve
 * nouvelle le peut, et elle passe par une réanalyse.
 *
 * Appliqué à la LECTURE, pas en base : une confiance dégradée écrite en dur
 * empêcherait une réanalyse de la relever, et figerait l'erreur.
 */
function withDecayedConfidence<T extends ProjectRow>(row: T): T {
  const current = row.confidence
  if (current !== 'high' && current !== 'medium' && current !== 'low') return row
  const freshness = opportunityFreshness(row.first_detected_at)
  const decayed = decayedConfidence(current, freshness)
  return decayed === current ? row : { ...row, confidence: decayed }
}

/**
 * La ligne telle qu'elle sort d'une LECTURE : ce que la base porte, plus le
 * niveau de preuve que ce qu'elle porte permet de revendiquer.
 *
 * Le champ est ajouté EN FIN, jamais au milieu (GA-08) — et il est dérivé, donc
 * une version antérieure du web qui ne le lit pas continue de fonctionner à
 * l'identique.
 */
// #2119.2 — LE TYPE VIENT DU CONTRAT, il n'est plus réécrit ici.
// Tant qu'il vivait dans ce fichier, `evidence` traversait le fil à chaque
// appel sans qu'aucun écran ne PUISSE le lire : le web typait la réponse
// `ProjectRow[]` et le champ disparaissait à la frontière. Une dérivation vit à
// un seul endroit ; un contrat de réponse aussi.
// Le champ est OPTIONNEL au contrat (un client peut lire une réponse antérieure
// au champ pendant un déploiement) et TOUJOURS présent ici : c'est cette route
// qui le produit. L'asymétrie est le sujet, pas un accident — la resserrer côté
// émetteur est ce qui garde `undefined` lisible comme « l'API n'a pas dit »
// plutôt que comme « il arrive que la route l'oublie ».
type ProjectReadRow = ContractProjectReadRow & {
  evidence: NonNullable<ContractProjectReadRow['evidence']>
  readiness: NonNullable<ContractProjectReadRow['readiness']>
}

/**
 * #2170.3 (tranché sans Louis) — la ligne BRUTE que `ROW_PROJECTION` rend,
 * `most_advanced_need_status` compris : une projection SQL interne à ce
 * fichier, jamais un champ du contrat de carte (voir `withStageDetail`).
 */
type RawProjectRow = ProjectRow & { most_advanced_need_status: string | null }

/**
 * Applique le BARÈME DE PREUVE à la ligne (addendum final p42-46 —
 * « fait → projet → opportunité »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE LIGNE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `EVIDENCE_REQUIREMENTS` dit depuis des mois qu'« un signal isolé ne fait pas
 * un projet : il faut au moins deux faits datés qui convergent ». Le barème
 * était juste, testé, et n'avait AUCUN appelant — pendant que cet écran
 * annonçait « 383 projets détectés à reprendre » pour un seul projet
 * réellement au pipe. Un barème que personne n'appelle ne protège rien.
 *
 * Calculé à la LECTURE, exactement comme {@link withDecayedConfidence} juste
 * au-dessus : un niveau figé en base empêcherait une qualification de le
 * relever. Qualifier le BTMMP ou déplacer le projet dans le pipe suffit à le
 * faire monter au prochain affichage, sans backfill et sans migration.
 *
 * ⚠️ Il ne RETIRE rien et n'éteint aucune détection : les lignes restent, à leur
 * étape, dans le même ordre. Ce qui change est ce qu'elles PRÉTENDENT être — et
 * ce qui leur manque est NOMMÉ, jamais compté zéro.
 *
 * #3266.16 (BEL-SC-237) — `readiness` COMBINE ce barème (`opportunityEvidenceGaps`)
 * et celui de `btmmpCompleteness` en un seul blocage à traiter — aucun des deux
 * n'est recalculé, voir le docblock d'`opportunityReadiness` (@bellum/contracts).
 * `confidence` y entre déjà DÉCROISSANTE : cette fonction tourne après
 * {@link withDecayedConfidence} dans le pipeline (`listForWorkspace`), jamais
 * un second calcul de fraîcheur.
 */
function withEvidence(row: ProjectRow): ProjectReadRow {
  const confidence =
    row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : null
  return {
    ...row,
    evidence: projectEvidence(row),
    readiness: opportunityReadiness({ btmmp: row.btmmp, evidenceGaps: opportunityEvidenceGaps(row), confidence }),
  }
}

/**
 * #2170.3 (tranché sans Louis) — L'AFFINAGE « profils recherchés/préparés/
 * entretien », sur CHAQUE carte, sans rouvrir `PIPELINE_STAGES` (GA-08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'épopée #2949 (#2170.3) demandait un sixième stade de pipe. La doctrine
 * `c56_etapes_du_pipe` fige `PIPELINE_STAGES` en nombre et en ordre (GA-08),
 * et `opportunityStageDetail` (@bellum/contracts, #2324.20/21/23) répond
 * DÉJÀ à ce besoin — un AFFINAGE dérivé du besoin le plus avancé, jamais une
 * étape de plus — mais seul `ProjectPipelineService.health()` (le diagnostic
 * agrégé) le calculait ; aucune carte du Kanban ne le lisait.
 *
 * Même patron que {@link withEvidence} juste au-dessus : calculé À LA
 * LECTURE, aucune migration, `most_advanced_need_status` ne quitte JAMAIS
 * cette fonction — c'est une projection SQL interne, pas un champ public.
 */
function withStageDetail(row: RawProjectRow): ProjectReadRow {
  const { most_advanced_need_status, ...rest } = row
  return { ...withEvidence(rest), stage_detail: opportunityStageDetail(row.stage, most_advanced_need_status) }
}

/**
 * Opportunity Graph (restitution V2 §6-7) — read + lifecycle + materialization
 * over the `opportunities` table (migration `1787900000000`).
 *
 * The table is the proprietary substrate that lets a "besoin" be dated, sourced
 * and moved through a lifecycle. `materialize` keeps it fresh for NEW analyses
 * with the SAME deterministic projection as the migration backfill (pains /
 * it_challenges / program_names / it_implications_for_esn), additive and
 * idempotent — `ON CONFLICT DO NOTHING` preserves any manual qualification and
 * the first-detected date across re-analyses.
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name)

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly repo: Repository<ProjectEntity>,
    // Journal d'activité — `@Optional()` comme dans `SubmissionsService` : les
    // specs qui construisent le service à la main n'ont pas à le simuler, et
    // sans lui le déplacement se comporte exactement comme avant.
    @Optional() private readonly activities?: ActivitiesService,
    // #2320.7/.23 (épopée #2967) — le journal de la chaîne commerciale, ÉTENDU
    // au sujet `'opportunity'` (migration `1796322820001`) : le pivot de la
    // chaîne (compte/périmètre/porteur/étape/valeur, cette table) manquait à
    // l'appel du journal que #2320.23 a posé pour le reste de la chaîne.
    // `@Optional()`, même motif que `activities` juste au-dessus.
    @Optional() private readonly commercialTransitions?: CommercialTransitionsService,
  ) {}

  /**
   * Portfolio-wide feed of materialized opportunities, joined to their account.
   * Scoped on the workspace (with the account-parent fallback that mirrors the
   * RLS policy, since `workspace_id` may be transiently NULL). Newest first.
   */
  /**
   * Les projets de l'espace, ou ceux d'un SEUL compte (PDF 2 §4.2,
   * ticket BEL-CRM-104).
   *
   * Le filtre par compte est le même chemin, avec une clause de plus : un
   * second endpoint qui reprojetterait les mêmes colonnes finirait par ne plus
   * dire la même chose que le premier — c'est exactement ce que le compteur
   * divergent de la PR #947 a coûté.
   *
   * #2801 — `id` FILTRE la même ligne pour LA FICHE (`/projects/$id`), même
   * précédent que `useMission` (`GET /delivery/missions?id=…`) : un second
   * `SELECT` par identifiant aurait fabriqué une seconde vérité pour le même
   * projet — exactement ce que le paragraphe ci-dessus refuse déjà pour le
   * compte.
   */
  async listForWorkspace(
    workspaceId: string,
    accountId?: string,
    id?: string,
    options: { archivedOnly?: boolean } = {},
  ): Promise<ProjectReadRow[]> {
    // #4137 — le pipe ne montre que les dossiers ACTIFS (recette prod 31/10 : l'archivé restait au kanban après
    // rechargement). Les rangés ne se lisent que par `archivedOnly`, et la fiche (`id`) retrouve le sien pour le
    // désarchiver.
    const archivedFilter = options.archivedOnly
      ? 'AND o.archived_at IS NOT NULL'
      : id
        ? ''
        : 'AND o.archived_at IS NULL'
    try {
      const rows = await this.repo.manager.query<RawProjectRow[]>(
        `
        SELECT
          ${ROW_PROJECTION}
        FROM opportunities o
        JOIN accounts a ON a.id = o.account_id
        WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> 'deleted'
          AND ($2::uuid IS NULL OR o.account_id = $2::uuid)
          AND ($3::uuid IS NULL OR o.id = $3::uuid)
          ${archivedFilter}
        ORDER BY o.first_detected_at DESC, o.id
        `,
        [workspaceId, accountId ?? null, id ?? null],
      )
      return rows.map(row => withStageDetail(withDecayedConfidence(row)))
    } catch (err) {
      this.logger.error('listForWorkspace error', { error: err })
      return []
    }
  }

  /**
   * #2319 (arbitrage owner/ressource, lot X60) — LES CONFLITS DE PORTEUR d'un
   * compte, lus sur des champs RÉELS, jamais écrits par un second geste :
   * un consultant dont le référent commercial (`consultants.owner_user_id`,
   * #2185.10) n'est pas le porteur de l'affaire (`opportunities.owner_id`) est
   * positionné (`submitted_at` posé — LA condition de Louis, 17/09 — et stade
   * non clos) sur un besoin de cette affaire. Deux commerciaux se disputent la
   * même ressource : c'est à un humain d'arbitrer, rien n'est réattribué ici.
   *
   * Les DEUX porteurs doivent exister (`IS NOT NULL`) : un porteur non attribué
   * n'est pas un conflit, et une ligne sans nom lisible est écartée plutôt
   * qu'étiquetée d'un nom inventé (on n'affiche pas ce qu'on n'a pas).
   * Lecture seule, scopée à l'espace ; un échec rend vide, comme `listForWorkspace`.
   */
  async listOwnerResourceConflicts(workspaceId: string, accountId: string): Promise<AccountManagerReviewArbitration[]> {
    try {
      const rows = await this.repo.manager.query<
        {
          project_id: string
          project_label: string
          need_title: string | null
          consultant_id: string
          consultant_name: string
          account_owner_name: string | null
          account_owner_email: string | null
          resource_owner_name: string | null
          resource_owner_email: string | null
        }[]
      >(
        `
        SELECT DISTINCT o.id AS project_id, o.label AS project_label, n.title AS need_title,
               c.id AS consultant_id, c.full_name AS consultant_name,
               NULLIF(TRIM(CONCAT_WS(' ', po.first_name, po.last_name)), '') AS account_owner_name,
               po.email AS account_owner_email,
               NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), '') AS resource_owner_name,
               pr.email AS resource_owner_email
          FROM opportunities o
          JOIN accounts a ON a.id = o.account_id
          JOIN project_needs n ON n.project_id = o.id
          JOIN submissions sub ON sub.need_id = n.id
          JOIN consultants c ON c.id = sub.consultant_id
          LEFT JOIN profiles po ON po.user_id = o.owner_id
          LEFT JOIN profiles pr ON pr.user_id = c.owner_user_id
         WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
           AND c.workspace_id = $1
           AND o.account_id = $2::uuid
           AND a.status <> 'deleted'
           AND o.archived_at IS NULL
           AND n.archived_at IS NULL
           AND sub.submitted_at IS NOT NULL
           AND sub.stage <> ALL($3::text[])
           AND o.owner_id IS NOT NULL
           AND c.owner_user_id IS NOT NULL
           AND c.owner_user_id <> o.owner_id
         ORDER BY o.label, c.full_name
        `,
        [workspaceId, accountId, [...CLOSED_SUBMISSION_STAGES]],
      )
      return rows.flatMap(row => {
        const accountOwnerName = row.account_owner_name || row.account_owner_email
        const resourceOwnerName = row.resource_owner_name || row.resource_owner_email
        if (!accountOwnerName || !resourceOwnerName) return []
        return [
          {
            projectId: row.project_id,
            projectLabel: row.project_label,
            needTitle: row.need_title,
            consultantId: row.consultant_id,
            consultantName: row.consultant_name,
            accountOwnerName,
            resourceOwnerName,
          },
        ]
      })
    } catch (err) {
      this.logger.error('listOwnerResourceConflicts error', { error: err })
      return []
    }
  }

  /**
   * #2195.33 — CRÉER UNE AFFAIRE À LA MAIN. La porte de `POST /projects`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE CLIC EST LA DÉCISION — CE QUE CETTE MÉTHODE N'EST PAS
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ **On ne crée jamais une affaire tout seul.** Aucun balayage, aucune
   * routine, aucun outil du copilote n'appelle cette méthode : son seul
   * appelant est `ProjectsController.create`, derrière `JwtGuard` +
   * `WorkspacePermissionGuard('records:write')`. Un geste de SYSTÈME qui
   * voudrait ouvrir une affaire devrait passer par une demande visible avec
   * prévisualisation figée — ce n'est pas cette porte-ci.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE CLOISONNEMENT EST DANS LE `INSERT ... SELECT`, PAS APRÈS
   * ─────────────────────────────────────────────────────────────────────────
   * Le compte est relu DANS l'insertion (`FROM accounts a WHERE a.id = $2 AND
   * (a.workspace_id = $1 …)`). Vérifier après coup laisserait une fenêtre où
   * l'affaire est déjà écrite ; vérifier avant, en deux requêtes, laisserait la
   * même fenêtre en plus petit. Zéro ligne insérée = le compte n'existe pas
   * DANS CET ESPACE, et le contrôleur rend 404 — jamais 403 : la différence
   * entre les deux réponses dirait si l'identifiant existe ailleurs.
   *
   * ⚠️ `kind` vaut `manual`, écrit ICI et pas reçu de l'appelant : une saisie
   * ne doit jamais pouvoir se faire passer pour une douleur relevée par
   * l'analyse. `source` reste `NULL` — aucun témoin n'a été identifié, et
   * `confidence` reste `NULL` aussi : un humain qui saisit n'est pas une
   * mesure de confiance (« non mesuré » n'est pas « faible »).
   *
   * `ON CONFLICT DO NOTHING` sur `(account_id, kind, md5(label))` — l'index
   * unique de la table : saisir deux fois le même libellé sur le même compte
   * rend l'affaire DÉJÀ existante plutôt qu'un doublon. Le contrôleur le
   * distingue d'un compte introuvable en relisant la ligne.
   */
  async createForWorkspace(
    workspaceId: string,
    input: {
      accountId: string
      label: string
      detail?: string | null
      objective?: string | null
      stage: ProjectStage
      expectedCloseOn?: string | null
      estimatedAmount?: number | null
      ownerId?: string | null
      scopeLabel?: string | null
    },
  ): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        WITH inserted AS (
          INSERT INTO opportunities (
            workspace_id, account_id, kind, label, detail, objective,
            stage, stage_entered_at, owner_id, expected_close_on, estimated_amount,
            source, confidence, scope_label
          )
          -- #4336.1 — une affaire créée dans Bellum a une origine : la saisie manuelle.
          SELECT a.workspace_id, a.id, 'manual', $3, $4, $5,
                 $6, now(), $7::uuid, $8::date, $9::numeric,
                 'manual'::text, NULL::text, $10::text
            FROM accounts a
           WHERE a.id = $2::uuid
             AND a.workspace_id = $1
             AND a.status <> 'deleted'
          ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
          RETURNING id
        )
        SELECT ${ROW_PROJECTION}
          FROM opportunities o
          JOIN accounts a ON a.id = o.account_id
         WHERE o.id IN (SELECT id FROM inserted)
        `,
        [
          workspaceId,
          input.accountId,
          input.label,
          input.detail ?? null,
          input.objective ?? null,
          input.stage,
          input.ownerId ?? null,
          input.expectedCloseOn ?? null,
          input.estimatedAmount ?? null,
          input.scopeLabel ?? null,
        ],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('createForWorkspace error', { error: err })
      return null
    }
  }

  /**
   * Ce que l'ESN a APPRIS de ses propres usages (restitution V2 §6 — « chaque
   * analyse améliore la base globale »).
   *
   * Agrégat déterministe sur les cycles de vie que l'équipe a RÉELLEMENT
   * déplacés : par secteur × offre × nature, combien de besoins ont été
   * convertis, transformés en action, ou déclarés obsolètes. Les lignes jamais
   * touchées (`nouveau`) sont exclues — elles ne disent rien de ce qui marche.
   *
   * Ce n'est ni un score, ni un modèle, ni une prédiction : ce sont des
   * décisions humaines comptées. Une équipe qui n'a rien déplacé obtient un
   * agrégat vide, et la boucle reste muette plutôt que d'inventer un
   * apprentissage. Dégrade en `[]` sur erreur (jamais bloquant).
   */
  async summarizeLearning(workspaceId: string): Promise<ProjectLearningRow[]> {
    try {
      return await this.repo.manager.query<ProjectLearningRow[]>(
        `
        SELECT
          NULLIF(btrim(a.sector), '')  AS sector,
          NULLIF(btrim(o.offer), '')   AS offer,
          o.kind                       AS kind,
          -- Depuis le pivot Projet, la leçon se lit sur l'ÉTAPE : gagné, avancé
          -- dans le pipe, ou endormi. L'ancien cycle FR n'est plus écrit, et
          -- continuer à l'interroger aurait figé l'apprentissage à la veille de
          -- la migration sans que rien ne le dise.
          --
          -- ⚠️ Les trois listes viennent du CONTRAT (D37) et PARTITIONNENT la
          -- population : gagné, encore en jeu et pris en charge, clos sans
          -- affaire. Elles étaient écrites à la main, et le stade qualifié
          -- n'entrait alors dans aucun panier tout en étant compté dans la
          -- population : une équipe qui qualifie sans avancer ne produisait que
          -- des lignes à zéro, jetées au tri. La boucle se taisait sur un geste
          -- bien réel. (Pas de guillemet oblique ici : ce SQL vit dans un
          -- littéral de gabarit, et il en fermerait la chaîne.)
          COUNT(*) FILTER (WHERE o.stage = 'won')::int AS converted,
          COUNT(*) FILTER (WHERE ${projectStageInSql('o.stage', TRIAGED_STAGES)})::int AS transformed,
          COUNT(*) FILTER (WHERE ${projectStageInSql('o.stage', CLOSED_UNWON_STAGES)})::int AS obsolete
        FROM opportunities o
        JOIN accounts a ON a.id = o.account_id
        WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> 'deleted'
          -- Les projets que personne n'a regardés ne disent rien de ce qui marche.
          AND ${projectStageNotInSql('o.stage', INTAKE_STAGES)}
        GROUP BY 1, 2, 3
        ORDER BY converted DESC, transformed DESC, obsolete DESC, kind
        LIMIT ${LEARNING_MAX_ROWS}
        `,
        [workspaceId],
      )
    } catch (err) {
      this.logger.error('summarizeLearning error', { error: err })
      return []
    }
  }

  /**
   * Advance one opportunity's lifecycle. Scoped to the caller's workspace
   * (defense in depth) — returns null when the row is absent or out of scope so
   * the controller can 404 instead of silently touching another team's data.
   */
  async updateStage(
    id: string,
    workspaceId: string,
    stage: ProjectStage,
    lossReason: string | null = null,
    userId?: string,
    // #3246 (lot W9 + lot cloud 14/10) — vocabulaires fermés saisis à la clôture ; null = ne pas toucher.
    caseDimensions: {
      strategy?: string | null
      buying_model?: string | null
      organisation?: string | null
      /** #3989.9 — le motif de perte dans la liste FERMÉE commune (`LOSS_REASON_CODES`). */
      loss_reason_code?: string | null
    } = {},
  ): Promise<ProjectRow | null> {
    // Les effets mécaniques (date d'entrée, clôture, issue) sont calculés par une
    // fonction PURE et testée du contrat : le SQL ne doit pas décider si « gagné »
    // clôt le projet, sinon la règle finit recopiée de travers dans le deuxième
    // chemin d'écriture.
    const effects = stageTransitionEffects(stage, new Date())
    try {
      // `firstReturnedRow` et non `rows[0]` : TypeORM rend `[lignes, nombre]`
      // sur un UPDATE, si bien que `rows[0]` était le TABLEAU des lignes. Le
      // type annonçait un objet, la trace lisait `undefined` partout, et
      // personne ne le voyait — le web ne lit pas cette réponse.
      const moved = firstReturnedRow<ProjectRow>(
        await this.repo.manager.query<ProjectRow[]>(
          `
        UPDATE opportunities o
        SET stage = $3,
            stage_entered_at = $4,
            closed_at = $5,
            outcome = $6,
            -- Le motif ne s'efface QUE si le projet cesse d'être perdu : sortir
            -- de « perdu » sans effacer la raison laisserait un projet actif
            -- portant « trop cher » comme s'il l'était encore.
            -- Le cast de $7 n'est pas décoratif : dans un CASE, le paramètre
            -- n'a aucun contexte de type et Postgres retombe sur "text". Ça
            -- tombe juste ici, mais le jour où la colonne change de type, la
            -- requête est refusée EN ENTIER — c'est ce qui a mis l'espace de
            -- démonstration hors service.
            loss_reason = CASE WHEN $3 = 'lost' THEN $7::text ELSE NULL END,
            -- #3989.9 (Louis 15/10/2026) — le motif FERMÉ commun suit la même règle que sa précision.
            loss_reason_code = CASE WHEN $3 = 'lost' THEN $11::text ELSE NULL END,
            -- #3246 — jamais effacés par un déplacement qui ne les fournit pas.
            strategy = COALESCE($8::text, o.strategy),
            buying_model = COALESCE($9::text, o.buying_model),
            organisation = COALESCE($10::text, o.organisation),
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
          [
            id,
            workspaceId,
            stage,
            effects.stage_entered_at,
            effects.closed_at,
            effects.outcome,
            lossReason,
            caseDimensions.strategy ?? null,
            caseDimensions.buying_model ?? null,
            caseDimensions.organisation ?? null,
            caseDimensions.loss_reason_code ?? null,
          ],
        ),
      )
      if (moved && userId) await this.traceStageChange(workspaceId, userId, moved)
      if (moved) await this.recordStageTransition(workspaceId, id, stage, lossReason, userId ?? null)
      return moved
    } catch (err) {
      this.logger.error('updateStage error', { error: err })
      return null
    }
  }

  /**
   * La trace du mouvement dans la timeline du compte et du projet.
   *
   * `stage_change` était un type d'activité déclaré, contraint en base et
   * traduit à l'écran, que personne n'écrivait — la timeline racontait donc les
   * e-mails et taisait les décisions commerciales.
   *
   * Best-effort, comme la trace des positionnements : perdre une ligne
   * d'historique ne doit jamais faire échouer le déplacement lui-même. Et la
   * clé porte l'horodatage d'entrée en plus de l'étape — un projet qui revient
   * en négociation le mois suivant est un second mouvement réel, qu'une clé
   * sans date avalerait en doublon.
   */
  private async traceStageChange(workspaceId: string, userId: string, project: ProjectRow): Promise<void> {
    if (!this.activities || !project.account_id) return
    try {
      const enteredAt = project.stage_entered_at ?? new Date().toISOString()
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'stage_change',
          source: 'system',
          direction: 'outbound',
          // #2124.68 — même forme que la trace des portes : le contexte
          // lisible, puis la CLÉ d'étape, que l'écran traduit.
          subject: timelineSystemSubject(project.label ?? 'Projet', project.stage),
          body: project.loss_reason ?? null,
          occurredAt: new Date().toISOString(),
          durationSeconds: null,
          accountId: project.account_id,
          contactId: null,
          projectId: project.id,
          linkReason: 'project_explicit',
          externalId: `project:${project.id}:${project.stage}:${enteredAt}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Stage-change trace not recorded: ${(error as Error).message}`)
    }
  }

  /**
   * #2320.7/.23 (épopée #2967) — le journal APPEND-ONLY de la chaîne
   * commerciale, ÉTENDU au pivot de la chaîne (subject_type `'opportunity'`,
   * migration `1796322820001`) : la table `opportunities` avait déjà son
   * mouvement d'étape (`stageTransitionEffects`) et sa trace best-effort dans
   * la timeline (`traceStageChange` ci-dessus), mais jamais de ligne dans le
   * journal que #2320.23 a posé pour le reste de la chaîne
   * (need/shortlist/submission/mission) — la chaîne avait un trou sur son
   * propre pivot.
   *
   * `fromState` est le DERNIER `to_state` déjà journalisé pour ce projet —
   * jamais une seconde lecture de `opportunities` : une transition se lit
   * depuis le journal qui la garde, pas depuis la table qu'elle décrit
   * (GA-26). `null` pour la toute première ligne d'un projet, comme pour les
   * quatre autres sujets.
   *
   * Best-effort, même motif que `traceStageChange` : perdre une ligne
   * d'historique ne doit jamais faire échouer le déplacement qu'elle ne fait
   * qu'enregistrer. `@Optional()` (constructeur) : les specs qui construisent
   * le service à la main n'ont rien à simuler, le déplacement se comporte
   * exactement comme avant.
   */
  private async recordStageTransition(
    workspaceId: string,
    projectId: string,
    toState: ProjectStage,
    lossReason: string | null,
    actorId: string | null,
  ): Promise<void> {
    if (!this.commercialTransitions) return
    try {
      const history = await this.commercialTransitions.history('opportunity', projectId, workspaceId)
      const fromState = history.length > 0 ? (history[history.length - 1]?.toState ?? null) : null
      await this.commercialTransitions.record({
        workspaceId,
        subjectType: 'opportunity',
        subjectId: projectId,
        fromState,
        toState,
        actorId,
        proof: lossReason,
      })
    } catch (error) {
      this.logger.warn(`Stage transition not recorded: ${(error as Error).message}`)
    }
  }

  /** Attribuer (ou retirer, avec `null`) le porteur du projet. */
  /**
   * #2172.36 -> .40 - LA CONVERSION D'UNE PISTE, COTE LIGNE.
   *
   * Les trois champs que porte la ligne elle-meme - l'etape de depart, le
   * porteur, l'objectif - s'ecrivent en UNE seule requete, et pas en trois
   * appels a `updateStage` / `updateOwner` / un troisieme : une conversion a
   * moitie ecrite laisserait une piste deplacee dans le pipe sans porteur, ou
   * un porteur pose sur une ligne restee « detectee ». Les deux satellites (la
   * tache de prochaine action, le role) vivent dans d'autres tables et sont
   * orchestres par le controleur, comme la porte G8.
   *
   * Les effets mecaniques de l'etape viennent de la MEME fonction pure que
   * `updateStage` (`stageTransitionEffects`) : deux chemins d'ecriture qui
   * decideraient chacun si « gagne » clot le projet finiraient par ne plus dire
   * la meme chose.
   */
  async applyConversion(
    id: string,
    workspaceId: string,
    input: { stage: ProjectStage; ownerId: string; objective: string },
    userId?: string,
  ): Promise<ProjectRow | null> {
    const effects = stageTransitionEffects(input.stage, new Date())
    try {
      // #2320.14 (épopée #2967) — l'étape RÉELLE avant conversion, lue AVANT
      // l'UPDATE ci-dessous : c'est le `fromState` du signal, jamais deviné
      // depuis `INTAKE_STAGES` (une opportunité peut y avoir été replacée).
      const before = await this.repo.manager.query<{ stage: ProjectStage }[]>(
        `SELECT stage FROM opportunities WHERE id = $1 LIMIT 1`,
        [id],
      )
      const priorStage = before[0]?.stage ?? null
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET stage = $3,
            stage_entered_at = $4,
            closed_at = $5,
            outcome = $6,
            owner_id = $7,
            objective = $8,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [
          id,
          workspaceId,
          input.stage,
          effects.stage_entered_at,
          effects.closed_at,
          effects.outcome,
          input.ownerId,
          input.objective,
        ],
      )
      const moved = firstReturnedRow<ProjectRow>(rows)
      if (moved && userId) await this.traceStageChange(workspaceId, userId, moved)
      if (moved && priorStage) {
        await this.recordSignalConversion(workspaceId, id, priorStage, input.objective, userId ?? null)
      }
      return moved
    } catch (err) {
      this.logger.error('applyConversion error', { error: err })
      return null
    }
  }

  /**
   * #2320.14 (épopée #2967) — Signal→Piste, sujet `'signal'` (migration
   * `1796340800001`). `applyConversion` ("LA CONVERSION D'UNE PISTE",
   * #2172.36→.40) posait déjà un porteur et un objectif sur une opportunité
   * encore `detected`/`potential` (INTAKE_STAGES), sans jamais l'écrire dans
   * le journal APPEND-ONLY que #2320.23 tient pour le reste de la chaîne —
   * exactement le trou que #2320.7/.23 avaient déjà comblé pour le sujet
   * `'opportunity'` (voir `recordStageTransition` ci-dessus).
   *
   * `proof` porte l'OBJECTIF saisi à la conversion : c'est l'interprétation
   * explicable que #2320.14 demande, jamais une seconde donnée à deviner —
   * `applyConversion` l'exige déjà (`input.objective`, non-nullable).
   *
   * Best-effort, même motif que `traceStageChange`/`recordStageTransition` :
   * perdre une ligne d'historique ne doit jamais faire échouer la conversion
   * qu'elle ne fait qu'enregistrer.
   */
  private async recordSignalConversion(
    workspaceId: string,
    projectId: string,
    fromStage: ProjectStage,
    objective: string,
    actorId: string | null,
  ): Promise<void> {
    if (!this.commercialTransitions) return
    try {
      await this.commercialTransitions.record({
        workspaceId,
        subjectType: 'signal',
        subjectId: projectId,
        fromState: fromStage,
        toState: 'piste',
        actorId,
        proof: objective,
      })
    } catch (error) {
      this.logger.warn(`Signal conversion not recorded: ${(error as Error).message}`)
    }
  }

  async updateOwner(id: string, workspaceId: string, ownerId: string | null): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET owner_id = $3, updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, ownerId],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateOwner error', { error: err })
      return null
    }
  }

  /** Saisir (ou effacer) la date de clôture ESPÉRÉE. Jamais déduite d'un cycle
   *  moyen : une date inventée fait rater un trimestre à la prévision. */
  async updateExpectedClose(id: string, workspaceId: string, date: string | null): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET expected_close_on = $3, updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, date],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateExpectedClose error', { error: err })
      return null
    }
  }

  /**
   * #3246 — écrire la stratégie / le modèle d'achat d'une affaire DÉJÀ clôturée,
   * sans rejouer la clôture : ni étape, ni date, ni porte G8. Une clé absente
   * n'est pas touchée (flag faux) ; `null` efface (une correction humaine gagne).
   * Même périmètre que `updateStage`. `null` de retour : absente / hors espace.
   */
  async updateCaseDimensions(
    id: string,
    workspaceId: string,
    patch: UpdateProjectCaseDimensions,
  ): Promise<{
    strategy: CaseStrategy | null
    buying_model: CaseBuyingModel | null
    organisation: CaseOrganisation | null
  } | null> {
    try {
      const rows = await this.repo.manager.query<
        { strategy: string | null; buying_model: string | null; organisation: string | null }[]
      >(
        `
        UPDATE opportunities o
        SET strategy = CASE WHEN $3::boolean THEN $4::text ELSE o.strategy END,
            buying_model = CASE WHEN $5::boolean THEN $6::text ELSE o.buying_model END,
            organisation = CASE WHEN $7::boolean THEN $8::text ELSE o.organisation END,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING o.strategy AS strategy, o.buying_model AS buying_model, o.organisation AS organisation
        `,
        [
          id,
          workspaceId,
          patch.strategy !== undefined,
          patch.strategy ?? null,
          patch.buying_model !== undefined,
          patch.buying_model ?? null,
          patch.organisation !== undefined,
          patch.organisation ?? null,
        ],
      )
      const row = firstReturnedRow<{
        strategy: string | null
        buying_model: string | null
        organisation: string | null
      }>(rows)
      return row ? closedCaseDimensions(row) : null
    } catch (err) {
      this.logger.error('updateCaseDimensions error', { error: err })
      return null
    }
  }

  /** #3246 — lire les trois choix fermés d'une affaire (null = jamais saisis). */
  async readCaseDimensions(
    id: string,
    workspaceId: string,
  ): Promise<{
    strategy: CaseStrategy | null
    buying_model: CaseBuyingModel | null
    organisation: CaseOrganisation | null
  } | null> {
    try {
      const rows = await this.repo.manager.query<
        { strategy: string | null; buying_model: string | null; organisation: string | null }[]
      >(
        `
        SELECT o.strategy AS strategy, o.buying_model AS buying_model, o.organisation AS organisation
        FROM opportunities o
        JOIN accounts a ON a.id = o.account_id
        WHERE o.id = $1
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        `,
        [id, workspaceId],
      )
      const row = rows?.[0]
      return row ? closedCaseDimensions(row) : null
    } catch (err) {
      this.logger.error('readCaseDimensions error', { error: err })
      return null
    }
  }

  /**
   * Saisir (ou effacer, avec `null`) le montant d'affaire estimé d'une opportunité
   * (cockpit manager §10 — pipeline valorisé). Scopée au workspace du caller
   * (défense en profondeur) : `null` de retour quand la ligne est absente ou
   * hors-scope → le contrôleur répond 404. On ne stocke QUE ce que l'utilisateur
   * a saisi ; `null` signifie « pas de montant », jamais 0 € par défaut.
   */
  async updateAmount(id: string, workspaceId: string, amount: number | null): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        -- Les deux formes bougent ENSEMBLE. Les laisser diverger donnerait deux
        -- pipes différents selon l'écran qui lit, et personne ne saurait lequel
        -- croire. Les centimes sont la forme canonique ; les euros restent pour
        -- les écrans qui les lisent déjà.
        SET estimated_amount = $3,
            amount_cents = CASE WHEN $3::numeric IS NULL THEN NULL ELSE ROUND($3::numeric * 100)::bigint END,
            currency = COALESCE(o.currency, 'EUR'),
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, amount],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateAmount error', { error: err })
      return null
    }
  }

  /**
   * L2 Pipe (Louis 14/10/2026) — écrire (ou effacer, `null`) la catégorie
   * DÉCLARÉE par le commercial. Une déclaration humaine, jamais une probabilité
   * ni un champ déduit de l'étape. Même portée que `updateRisks` : l'espace de
   * l'appelant, jamais un compte supprimé. `null` de retour : absente / hors espace.
   */
  async updateForecastCategory(
    id: string,
    workspaceId: string,
    category: ForecastCategory | null,
  ): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET forecast_category = $3,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, category],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateForecastCategory error', { error: err })
      return null
    }
  }

  /**
   * #2324.37 — écrire (ou effacer, `null`) les risques de l'affaire. Même
   * portée que `updateAmount` : l'espace de l'appelant, jamais un compte supprimé.
   */
  async updateRisks(id: string, workspaceId: string, risks: string | null): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET risks = $3,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, risks],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateRisks error', { error: err })
      return null
    }
  }

  /**
   * #3266.1 (#3292) — écrire (ou effacer, `null`) le grain équipe/site/projet
   * de l'opportunité. Même portée que `updateRisks` : l'espace de l'appelant,
   * jamais un compte supprimé.
   */
  async updateScope(id: string, workspaceId: string, scopeLabel: string | null): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET scope_label = $3,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, scopeLabel],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateScope error', { error: err })
      return null
    }
  }

  /**
   * #2171.39 — ARCHIVER / DÉSARCHIVER l'opportunité. Même rangement NEUTRE que
   * `ProjectPipelineService.archiveNeed` (décision Louis 17/09/2026) :
   * `archived_at` seul bouge, jamais `stage` ni `outcome`. Idempotence
   * REFUSÉE comme `archiveNeed` — archiver une opportunité déjà archivée rend
   * une erreur nommée plutôt qu'un succès silencieux, pour qu'un appelant
   * sache que rien n'a changé.
   *
   * Une lecture avant l'écriture (au lieu d'un `WHERE archived_at IS [NOT]
   * NULL` dans l'UPDATE) : sans elle, 0 ligne rendue confondrait « introuvable »
   * et « déjà dans cet état » — deux réponses que l'appelant doit distinguer.
   */
  async archiveOpportunity(
    id: string,
    workspaceId: string,
    archived: boolean,
  ): Promise<{ status: 'ok'; row: ProjectRow } | { status: 'not_found' } | { status: 'already' }> {
    try {
      const current = await this.repo.manager.query<{ archived_at: string | null }[]>(
        `
        SELECT o.archived_at AS archived_at
        FROM opportunities o
        JOIN accounts a ON a.id = o.account_id
        WHERE o.id = $1
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        LIMIT 1
        `,
        [id, workspaceId],
      )
      if (current.length === 0) return { status: 'not_found' }

      const alreadyThere = archived ? current[0].archived_at !== null : current[0].archived_at === null
      if (alreadyThere) return { status: 'already' }

      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET archived_at = $3,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, archived ? new Date() : null],
      )
      const row = firstReturnedRow<ProjectRow>(rows)
      return row ? { status: 'ok', row } : { status: 'not_found' }
    } catch (err) {
      this.logger.error('archiveOpportunity error', { error: err })
      return { status: 'not_found' }
    }
  }

  /**
   * Saisir les secteurs d'APPLICATION de la demande et la famille de prestation
   * achetée (addendum Stelya §4.1, doctrine C05).
   *
   * Les deux colonnes existaient et l'axe de matching les lisait déjà ; rien ne
   * pouvait les écrire, si bien que l'axe retombait TOUJOURS sur le secteur du
   * compte. La règle « le secteur appartient au Projet » était vraie dans le
   * modèle et inerte en production.
   *
   * Remplacement complet des secteurs : `[]` efface, et c'est le geste qu'on
   * veut pouvoir faire quand on s'est trompé. La famille de prestation, elle,
   * n'est touchée que si la clé est PRÉSENTE — un écran qui n'édite que les
   * secteurs ne doit pas l'effacer en passant.
   */
  async updateSectors(id: string, workspaceId: string, patch: UpdateProjectSectors): Promise<ProjectRow | null> {
    try {
      const touchesDomain = Object.hasOwn(patch, 'primary_domain_code')
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET application_sector_codes = $3::text[],
            primary_domain_code = CASE WHEN $4::boolean THEN $5::text ELSE o.primary_domain_code END,
            updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, patch.application_sector_codes, touchesDomain, patch.primary_domain_code ?? null],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateSectors error', { error: err })
      return null
    }
  }

  /**
   * Enregistre la qualification BTMMP d'un besoin (annexe méthodo p21). Fusion
   * present-only : un axe absent du patch n'écrase rien, un axe présent (même
   * vide) le remplace. Scopé workspace — `null` si le besoin est hors scope.
   */
  async updateBtmmp(id: string, workspaceId: string, patch: Btmmp): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        UPDATE opportunities o
        SET btmmp = COALESCE(o.btmmp, '{}'::jsonb) || $3::jsonb, updated_at = now()
        FROM accounts a
        WHERE o.id = $1
          AND a.id = o.account_id
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        RETURNING ${ROW_PROJECTION}
        `,
        [id, workspaceId, JSON.stringify(patch)],
      )
      return firstReturnedRow<ProjectRow>(rows)
    } catch (err) {
      this.logger.error('updateBtmmp error', { error: err })
      return null
    }
  }

  /**
   * One opportunity row by id, scoped to the caller's workspace — the server-side
   * read behind the besoin→CRM export (the client's copy is never trusted). Same
   * workspace/parent-fallback + not-deleted guard as {@link findSimilar}. `null`
   * when the row is absent or out of scope → the controller answers 404 instead of
   * leaking another team's besoin.
   */
  async getRow(id: string, workspaceId: string): Promise<ProjectRow | null> {
    try {
      const rows = await this.repo.manager.query<ProjectRow[]>(
        `
        SELECT
          ${ROW_PROJECTION}
        FROM opportunities o
        JOIN accounts a ON a.id = o.account_id
        WHERE o.id = $1
          AND (o.workspace_id = $2 OR a.workspace_id = $2)
          AND a.status <> 'deleted'
        LIMIT 1
        `,
        [id, workspaceId],
      )
      return rows[0] ?? null
    } catch (err) {
      this.logger.error('getRow error', { error: err })
      return null
    }
  }

  /**
   * « Comparer à un besoin similaire sur un autre compte » (restitution V2 §7).
   *
   * Reads the reference need server-side from its id (the client's copy is never
   * trusted), then looks for the SAME need on the workspace's OTHER accounts. The
   * SQL narrows to rows sharing at least one significant word; the ranking and
   * the justification come from {@link rankSimilar}. Nothing is generated: an
   * empty `matches` list means the portfolio really holds no comparable need, and
   * the panel says exactly that.
   *
   * Returns `null` only when the reference is absent or outside the caller's
   * workspace → the controller answers 404 instead of leaking another team's row.
   */
  async findSimilar(id: string, workspaceId: string): Promise<ProjectSimilarResponse | null> {
    const referenceRows = await this.repo.manager.query<ProjectRow[]>(
      `
      SELECT
        ${ROW_PROJECTION}
      FROM opportunities o
      JOIN accounts a ON a.id = o.account_id
      WHERE o.id = $1
        AND (o.workspace_id = $2 OR a.workspace_id = $2)
        AND a.status <> 'deleted'
      LIMIT 1
      `,
      [id, workspaceId],
    )
    const reference = referenceRows[0]
    if (!reference) return null

    const terms = significantTerms(reference.label, reference.offer)
    // A need made only of stopwords has nothing to compare on — say so rather
    // than return the newest rows and call them "similar".
    if (terms.length === 0) return { reference, matches: [] }

    const candidates = await this.repo.manager.query<ProjectRow[]>(
      `
      SELECT
        ${ROW_PROJECTION}
      FROM opportunities o
      JOIN accounts a ON a.id = o.account_id
      WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
        AND a.status <> 'deleted'
        AND o.account_id <> $2
        AND (o.label ILIKE ANY($3::text[]) OR COALESCE(o.offer, '') ILIKE ANY($3::text[]))
      ORDER BY o.first_detected_at DESC, o.id
      LIMIT ${SIMILAR_CANDIDATE_LIMIT}
      `,
      [workspaceId, reference.account_id, terms.map(term => `%${term}%`)],
    )

    return { reference, matches: rankSimilar(reference, candidates, PROJECT_SIMILAR_MAX) }
  }

  /**
   * Materialize an account's opportunities from its persisted analysis blob.
   * Mirrors the five deterministic projections of the migration backfill,
   * scoped to one account. Additive + idempotent (`ON CONFLICT DO NOTHING`) so a
   * re-analysis never overwrites lifecycle or `first_detected_at`. Best-effort:
   * a materialization blip must never fail an analysis that already completed
   * (same contract as `recordAnalysisCompleted`).
   */
  async materialize(accountId: string): Promise<void> {
    try {
      // ─────────────────────────────────────────────────────────────────────
      // `source` = un TÉMOIN, jamais le nom de la voie (mesuré le 28/08/2026)
      // ─────────────────────────────────────────────────────────────────────
      // Les cinq projections écrivaient dans `source` le nom de leur propre
      // lane : 'pain', 'challenge', 'program', 'implication', et 'signal' en
      // repli quand le signal n'avait AUCUNE source. Sur quatre voies sur cinq,
      // une absence de source passait donc pour une source — `source` ne disait
      // rien de plus que la colonne `kind` juste à côté — et la ligne
      // revendiquait « un événement daté ET sourcé » (EVIDENCE_REQUIREMENTS.fact)
      // sur une tautologie.
      //
      // Ici c'est la DONNÉE qui mentait, pas le barème : l'inverse exact de D27.
      // Une ligne sans témoin identifié laisse `source` à NULL, et « fait »
      // redevient vrai sans qu'on touche à sa définition.
      //
      // Pourquoi NULL et pas mieux : `painPointSchema`, `itChallengeSchema` et
      // `programNameSchema` (packages/contracts/.../analysis/research.ts) ne
      // portent AUCUN champ de source — il n'y a rien à écrire, et inventer
      // serait pire que se taire. Seul `recentSignalSchema` en porte une : c'est
      // la seule voie qui en écrit une.
      //
      // ⚠️ Les lignes DÉJÀ en base gardent leur valeur (`ON CONFLICT DO NOTHING`
      // ne les repassera jamais ici, et on archive, on ne supprime pas). C'est
      // la LECTURE qui les remet d'aplomb, dans `isWitness` côté contrats.

      // 1) Expressed pains (raw_analysis.pains[]) — strongest evidence.
      await this.repo.manager.query(
        `
        INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, offer, urgency, source, confidence, primary_domain_code)
        SELECT a.workspace_id, a.id, 'pain',
               NULLIF(btrim(p->>'pain'), ''), NULLIF(p->>'business_impact', ''), NULLIF(p->>'esn_offer', ''),
               NULLIF(p->>'urgency', ''), NULL::text, 'high', ${classifiedDomainSql('p')}
        FROM accounts a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.raw_analysis -> 'pains', '[]'::jsonb)) AS p
        WHERE a.id = $1
          AND a.status <> 'deleted'
          AND jsonb_typeof(a.raw_analysis -> 'pains') = 'array'
          AND NULLIF(btrim(p->>'pain'), '') IS NOT NULL
        ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
        `,
        [accountId, SIGNAL_DOMAIN_CODES],
      )

      // 2) IT challenges (accounts.it_challenges[]).
      await this.repo.manager.query(
        `
        INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, offer, source, confidence, primary_domain_code)
        SELECT a.workspace_id, a.id, 'challenge',
               NULLIF(btrim(c->>'title'), ''), NULLIF(c->>'description', ''), NULLIF(c->>'esn_offer_match', ''),
               NULL::text, 'medium', ${classifiedDomainSql('c')}
        FROM accounts a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.it_challenges, '[]'::jsonb)) AS c
        WHERE a.id = $1
          AND a.status <> 'deleted'
          AND jsonb_typeof(a.it_challenges) = 'array'
          AND NULLIF(btrim(c->>'title'), '') IS NOT NULL
        ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
        `,
        [accountId, SIGNAL_DOMAIN_CODES],
      )

      // 3) Named programs (raw_analysis.program_names[]) — string OR {name,…}.
      await this.repo.manager.query(
        `
        INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, source, confidence)
        SELECT a.workspace_id, a.id, 'program',
               NULLIF(btrim(COALESCE(pr->>'name', pr#>>'{}')), ''), NULLIF(pr->>'description', ''),
               NULL::text, 'medium'
        FROM accounts a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.raw_analysis -> 'program_names', '[]'::jsonb)) AS pr
        WHERE a.id = $1
          AND a.status <> 'deleted'
          AND jsonb_typeof(a.raw_analysis -> 'program_names') = 'array'
          AND NULLIF(btrim(COALESCE(pr->>'name', pr#>>'{}')), '') IS NOT NULL
        ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
        `,
        [accountId],
      )

      // 4) Buy signals (accounts.recent_signals[]) — la 5ᵉ nature du graphe
      //    (§6 « compte, besoin, signal, projet, source, date, confiance »). Un
      //    signal n'est pas un besoin : il entre sous son propre `kind`, garde sa
      //    VRAIE source (« Les Échos », « BODACC »… — pas le nom de la lane) et
      //    ne gonfle jamais un compteur de besoins. Confiance dérivée de la règle
      //    déjà en vigueur côté Veille : sans source, pas de preuve.
      //
      //    ⚠️ Le repli `COALESCE(…, 'signal')` a sauté : il annulait exactement la
      //    phrase ci-dessus. Un signal SANS source repartait avec `source =
      //    'signal'` — la lane, encore — et se retrouvait « daté ET sourcé »
      //    alors que la ligne d'à côté disait `confidence = 'low'` PARCE QUE la
      //    source manquait. Les deux colonnes se contredisaient sur la même
      //    ligne ; c'est `confidence` qui avait raison.
      await this.repo.manager.query(
        `
        INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, source, confidence, primary_domain_code)
        SELECT a.workspace_id, a.id, 'signal',
               NULLIF(btrim(COALESCE(s->>'title', s->>'label', s->>'description', s->>'signal')), ''),
               NULLIF(btrim(COALESCE(s->>'salesImplication', s->>'sales_implication')), ''),
               NULLIF(btrim(s->>'source'), ''),
               CASE WHEN NULLIF(btrim(s->>'source'), '') IS NULL THEN 'low' ELSE 'medium' END,
               ${classifiedDomainSql('s')}
        FROM accounts a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.recent_signals, '[]'::jsonb)) AS s
        WHERE a.id = $1
          AND a.status <> 'deleted'
          AND jsonb_typeof(a.recent_signals) = 'array'
          AND NULLIF(btrim(COALESCE(s->>'title', s->>'label', s->>'description', s->>'signal')), '') IS NOT NULL
        ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
        `,
        [accountId, SIGNAL_DOMAIN_CODES],
      )

      // 5) ESN implication (raw_analysis.it_implications_for_esn) — a deduction,
      //    not a sourced fact → low confidence.
      await this.repo.manager.query(
        `
        INSERT INTO opportunities (workspace_id, account_id, kind, label, source, confidence)
        SELECT a.workspace_id, a.id, 'implication',
               NULLIF(btrim(a.raw_analysis ->> 'it_implications_for_esn'), ''), NULL::text, 'low'
        FROM accounts a
        WHERE a.id = $1
          AND a.status <> 'deleted'
          AND NULLIF(btrim(a.raw_analysis ->> 'it_implications_for_esn'), '') IS NOT NULL
        ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
        `,
        [accountId],
      )
      // #3978.2 — le RATTRAPAGE des lignes déjà matérialisées (voir `fillClassifiedDomains`).
      await this.fillClassifiedDomains(accountId)
    } catch (err) {
      this.logger.error('materialize error', { error: err, accountId })
    }
  }

  /**
   * #3978.2 — remplit `primary_domain_code` des pistes DÉJÀ matérialisées (pain, enjeu,
   * signal) depuis le classement le plus récent du compte. `ON CONFLICT DO NOTHING`
   * (dans `materialize`) ne repasse jamais sur une ligne existante : sans ceci, un compte
   * rejoué recevrait ses nouveaux `domain_code` en `raw_analysis` mais ses lignes resteraient
   * sans domaine. On ne remplit QUE le NULL : un domaine déjà posé — par une correction
   * humaine (`primary_domain_code` du PATCH) ou une analyse précédente — gagne. Programme
   * et implication n'ont pas de voie : le modèle ne les classe pas.
   *
   * Seul geste du rejeu de RECHERCHE sur les pistes (`AnalysisPersistenceService
   * .refreshOpportunityDomains`, après « Actualiser », la veille quotidienne ou le rattrapage
   * ciblé du segment `signals`) : il ne CRÉE aucune piste — ça reste le rôle de
   * `materialize`, en fin d'analyse complète. Un libellé que le rejeu a réécrit ne se
   * rapproche pas (clé `md5(label)`) : sa piste reste sans domaine, jamais un domaine deviné.
   * Best-effort, ne lève jamais.
   */
  async fillClassifiedDomains(accountId: string): Promise<void> {
    try {
      await this.repo.manager.query(
        domainFillSql('pain', "COALESCE(a.raw_analysis -> 'pains', '[]'::jsonb)", 'p', "NULLIF(btrim(p->>'pain'), '')"),
        [accountId, SIGNAL_DOMAIN_CODES],
      )
      await this.repo.manager.query(
        domainFillSql('challenge', "COALESCE(a.it_challenges, '[]'::jsonb)", 'c', "NULLIF(btrim(c->>'title'), '')"),
        [accountId, SIGNAL_DOMAIN_CODES],
      )
      await this.repo.manager.query(
        domainFillSql(
          'signal',
          "COALESCE(a.recent_signals, '[]'::jsonb)",
          's',
          "NULLIF(btrim(COALESCE(s->>'title', s->>'label', s->>'description', s->>'signal')), '')",
        ),
        [accountId, SIGNAL_DOMAIN_CODES],
      )
    } catch (err) {
      this.logger.error('fillClassifiedDomains error', { error: err, accountId })
    }
  }
}
