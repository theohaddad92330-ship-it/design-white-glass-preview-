import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { assessCvTextQuality, repairLetterSpacing } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { CV_AUTO_PARSE_PROVENANCE_PORT, type CvAutoParseProvenancePort } from './cv-auto-parse-provenance.port'
import {
  CV_AUTO_PARSE_JOB_OPTIONS,
  CV_AUTO_PARSE_QUEUE,
  cvAutoParseJobId,
  type CvAutoParseJobData,
} from './cv-auto-parse.queue'
import { CvParseService } from './cv-parse.service'
import type { StockCandidateRow } from './cv-stock-catch-up.runner'
import type { ReadQualifyCandidateRow } from './cv-read-qualify-catch-up.runner'
import { returnedRows } from '../../database/returned-rows'

/**
 * #3734 (06/10/2026) — le validateur de citations du service IA rejetait le
 * bloc `identity` dès que l'extrait recollait plusieurs lignes ou ré-espaçait
 * une ponctuation : « Non trouvé dans le CV » alors que le nom est la première
 * ligne. Une fiche LUE AVANT cette date et toujours sans nom est concernée
 * (doctrine : un correctif de collecte rattrape l'existant, ciblé, par segment ;
 * « concerné » se décide sur la date de lecture contre la date de la capacité).
 * Borne volontairement large : relire une fiche vraiment sans nom coûte une
 * lecture, en oublier une laisse le défaut à l'écran.
 */
//
// #4401.1 (recette 23/10) — repoussée au 23/10 : le nom d'un CV écrit « M. Jean DUPONT », « Jean Dupont – Poste » ou
// en champs étiquetés (« Nom : … / Prénom : … ») n'était pas lu (`cv_identity.guess_name`, apps/ia) : 6 fiches sur 20
// « Nom non renseigné ». Une fiche lue avant cette date, toujours sans nom, avec un CV en texte, redevient éligible
// au MÊME rattrapage ciblé (`UNREAD_WHERE` : jamais tout le parc, jamais au déploiement, jamais au-dessus d'une
// saisie humaine — la garde `field_provenance` source `human` reste dans la sélection).
export const CV_IDENTITY_CITATION_FIXED_AT = '2026-10-23T12:00:00Z'

/**
 * #3935.3 (08/10/2026) — l'extraction CV s'est étoffée (LinkedIn, langues,
 * `cv-parse.service.ts`, #3935.2) : une fiche LUE AVANT ce correctif a pu être
 * lue avec un prompt qui ne demandait pas encore ces blocs, donc sans jamais
 * les avoir eus — pas parce que le CV ne les porte pas.
 *
 * Même doctrine que {@link CV_IDENTITY_CITATION_FIXED_AT} (« un correctif de
 * collecte rattrape l'existant », CLAUDE.md) et même lecture d'elle :
 * « concerné » se décide sur la date de COLLECTE du segment (`cv_auto_read_at`)
 * contre la date de la capacité, jamais sur un symptôme — une fiche DÉJÀ
 * nommée, par exemple, reste éligible : rien ici ne demande `full_name IS NULL`,
 * à la différence du rattrapage d'identité, parce que le symptôme visé n'est
 * pas le même.
 */
//
// #3935.2a (lot M07, 09/10/2026) — repoussée au 10/10 : environnements, outils
// et certifications (lus depuis toujours, JAMAIS écrits faute de colonne) sont
// désormais écrits par la lecture. Une fiche lue avant cette capacité ne les a
// pas — elle redevient éligible au MÊME rattrapage ciblé (jamais tout le parc,
// jamais automatique au déploiement, jamais au-dessus d'une correction
// humaine). Borne large à dessein : relire coûte une lecture, oublier laisse
// la fiche incomplète.
//
// #3935 (lot P03, décision Louis 09/10/2026) — repoussée au 11/10 : une date
// d'expérience écrite à l'ANNÉE seule (« 2019 – 2021 ») restait vide à la lecture
// du lot M07 ; elle est désormais GARDÉE avec sa précision `year`. Une fiche lue
// avant cette capacité redevient éligible au MÊME rattrapage ciblé — jamais au
// déploiement, jamais au-dessus d'une expérience saisie à la main.
export const CV_COMPLETENESS_FIX_AT = '2026-10-11T00:00:00Z'

/**
 * #4401.1 / #4401.2 (recette 23/10) — l'import de CV lit désormais l'e-mail, le téléphone, la ville, LinkedIn et les
 * expériences ÉCRITS dans le texte (apps/ia `cv_identity`, `cv_experiences`, 21-22/10). Une fiche lue avant cette
 * date a pu sortir SANS coordonnée alors que son CV en porte une (« Aucun moyen de contact n'est renseigné »).
 *
 * Segment CIBLÉ (doctrine « un correctif de collecte rattrape l'existant ») : lue avant cette date ET sans e-mail ni
 * téléphone — jamais tout le parc, jamais une fiche qui a déjà une coordonnée, et (garde commune) jamais une fiche
 * portant une correction humaine. #4401.3 (25/10) — repoussée au 25/10 : le téléphone aux espaces insécables de l'OCR
 * et l'indicatif « (+33) » sont lus (`cv_identity`). Le rejeu ne part pas au déploiement : `scripts/cv-completeness-catch-up.ts`.
 */
export const CV_CONTACT_FIX_AT = '2026-10-25T00:00:00Z'

/** UN seul prédicat « lue avant un correctif qui la concerne » — la sélection ET le pré-tri du texte espacé (GA-26). */
const READ_BEFORE_A_FIX_SQL = `(c.cv_auto_read_at < '${CV_COMPLETENESS_FIX_AT}'
      OR (c.cv_auto_read_at < '${CV_CONTACT_FIX_AT}' AND c.email IS NULL AND c.phone IS NULL))`

/**
 * « CV non lu » — UNE définition, partagée par le compteur du vivier et le
 * rattrapage : un CV en texte, jamais lu par le modèle (ou lu avant le
 * correctif #3734), sans nom, pas archivé, et SANS AUCUNE
 * correction humaine (provenance `human`
 * sur n'importe quelle colonne de la fiche). Une fiche corrigée à la main n'est
 * jamais relue d'office (« une correction humaine gagne toujours »).
 *
 * c97 (décision Louis 12/10) — AUCUNE condition sur `review_status` ici ni dans
 * les deux sélections suivantes : un CV lu qualifie la fiche, donc `qualified` ne
 * dit plus « un humain a validé ». L'exclusion se fait sur la provenance `human`
 * et l'archive ; une fiche auto-qualifiée recollée puis relue reste qualifiée.
 */
export const UNREAD_WHERE = `
  c.workspace_id = $1
  AND c.cv_text IS NOT NULL AND btrim(c.cv_text) <> ''
  AND c.full_name IS NULL
  AND (c.cv_auto_read_at IS NULL OR c.cv_auto_read_at < '${CV_IDENTITY_CITATION_FIXED_AT}')
  AND c.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM field_provenance fp
     WHERE fp.entity_type = 'consultant' AND fp.entity_id = c.id AND fp.source = 'human'
  )`

/**
 * #3935.3 — le rattrapage de COMPLÉTUDE : une fiche déjà lue au moins une fois
 * (sans quoi elle est déjà couverte par l'import normal, qui tourne avec le
 * prompt à jour), lue avant {@link CV_COMPLETENESS_FIX_AT}, pas archivée, et
 * SANS AUCUNE correction humaine — même garde que
 * {@link UNREAD_WHERE}. Délibérément SANS condition sur `full_name` : le
 * symptôme visé ici (LinkedIn/langues jamais lus) n'a aucun rapport avec le
 * nom de la personne.
 */
const COMPLETENESS_CATCH_UP_WHERE = `
  c.workspace_id = $1
  AND c.cv_text IS NOT NULL AND btrim(c.cv_text) <> ''
  AND c.cv_auto_read_at IS NOT NULL AND ${READ_BEFORE_A_FIX_SQL}
  AND c.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM field_provenance fp
     WHERE fp.entity_type = 'consultant' AND fp.entity_id = c.id AND fp.source = 'human'
  )`

/**
 * #3935.6 — le pré-tri SQL des fiches dont le `cv_text` STOCKÉ est espacé lettre
 * à lettre (« L a m i s ») : cinq lettres isolées d'affilée, séparées par un
 * espace. Le SQL ne fait que le pré-tri bon marché ; le verdict est rendu en
 * TypeScript par le MÊME score que l'IA (`assessCvTextQuality`). Mêmes gardes que
 * {@link COMPLETENESS_CATCH_UP_WHERE} : jamais archivée ni portant une
 * correction humaine. `in_completeness` évite de compter deux fois une fiche
 * que la sélection de complétude vise déjà.
 */
const SPACED_TEXT_SELECT = `
  SELECT c.id, c.cv_text,
         (c.cv_auto_read_at IS NOT NULL AND ${READ_BEFORE_A_FIX_SQL}) AS in_completeness
    FROM consultants c
   WHERE c.workspace_id = $1
     AND c.cv_text ~ '(^|[[:space:]])[[:alpha:]]( [[:alpha:]]){4,}([[:space:]]|$)'
        AND c.archived_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM field_provenance fp
        WHERE fp.entity_type = 'consultant' AND fp.entity_id = c.id AND fp.source = 'human'
     )
   ORDER BY c.created_at ASC`

type SpacedTextCandidate = { id: string; repaired: string; original: string; inCompleteness: boolean }

/**
 * LA LECTURE AUTOMATIQUE DES CV À L'IMPORT (04/10/2026, import ZIP de 688 CV —
 * `c88_lecture_auto_cv_import`, D366 levée pour ce chemin).
 *
 * Trois gestes :
 *  - `enqueue` — appelé par `CvIntakeService.intakeAutomatic` après CHAQUE
 *    fiche créée (ZIP en ligne, ZIP volumineux, dépôt auto, pièce jointe) ;
 *  - `readOne` — le travail du worker : la proposition du modèle, écrite en
 *    provenance `model` sans qualifier (`CvParseService.autoRead`), puis
 *    journalisée comme la revue la journalise ;
 *  - `enqueueUnread` / `unreadCount` — le RATTRAPAGE ciblé (doctrine « un
 *    correctif de collecte rattrape l'existant ») : un geste dans le vivier,
 *    jamais au déploiement.
 *
 * Aucun crédit débité : la lecture est incluse dans l'import.
 */
@Injectable()
export class CvAutoParseService {
  private readonly logger = new Logger(CvAutoParseService.name)

  constructor(
    @InjectQueue(CV_AUTO_PARSE_QUEUE) private readonly queue: Queue<CvAutoParseJobData>,
    private readonly cvParse: CvParseService,
    @Inject(CV_AUTO_PARSE_PROVENANCE_PORT) private readonly provenance: CvAutoParseProvenancePort,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  /**
   * Met UNE fiche en file. Ne lève jamais : une file indisponible ne doit pas
   * faire échouer l'import qui l'appelle — la fiche reste « non lue », donc
   * rattrapable par le geste du vivier.
   */
  async enqueue(
    workspaceId: string,
    userId: string,
    consultantId: string,
    options: { delay?: number } = {},
  ): Promise<boolean> {
    try {
      // Un job TERMINÉ (lu, ou en échec après ses tentatives) garde son
      // identifiant quelques heures : sans ce ménage, BullMQ ignorerait en
      // silence la remise en file d'une fiche dont la lecture avait échoué.
      const jobId = cvAutoParseJobId(consultantId)
      const existing = await this.queue.getJob(jobId)
      if (existing) {
        const state = await existing.getState()
        if (state !== 'completed' && state !== 'failed') return true
        await existing.remove()
      }
      await this.queue.add(
        'cv-auto-parse',
        { workspaceId, userId, consultantId },
        // #3883 — rattrapage du stock : un job DIFFÉRÉ (débit borné), jamais tout d'un coup.
        { ...CV_AUTO_PARSE_JOB_OPTIONS, jobId, ...(options.delay ? { delay: options.delay } : {}) },
      )
      return true
    } catch (error) {
      this.logger.warn(`Lecture automatique non mise en file pour ${consultantId} : ${(error as Error).message}`)
      return false
    }
  }

  /** Le travail d'UN job. Laisse remonter l'indisponibilité du service IA. */
  async readOne(data: CvAutoParseJobData): Promise<{ written: number }> {
    const { workspaceId, userId, consultantId } = data
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    const currentSources = await this.provenance.currentSources('consultant', consultantId)
    const outcome = await this.cvParse.autoRead(consultantId, workspaceId, userId, currentSources, {
      demo: workspace?.is_demo === true,
    })
    if (!outcome) return { written: 0 }
    // Décision Louis 12/10 — CV lu = fiche qualifiée : le passage est journalisé comme le reste.
    const changes = outcome.written.map(entry => ({
      field: entry.column,
      oldValue: entry.previous,
      newValue: entry.value,
    }))
    if (outcome.qualified) changes.push({ field: 'review_status', oldValue: 'needs_review', newValue: 'qualified' })
    if (changes.length === 0) return { written: 0 }
    // Même journal que la revue (`commitCvParse`) : sans ces lignes, la revue
    // suivante lirait une provenance INCONNUE (traitée `pipeline`) et refuserait
    // de remplacer ce que le modèle a écrit — un arbitre sans mémoire (D379).
    await this.provenance.commit({
      workspaceId,
      entityType: 'consultant',
      entityId: consultantId,
      source: 'model',
      actorId: null,
      rule: 'cv_parse.auto_read',
      changes,
    })
    return { written: outcome.written.length }
  }

  /**
   * #3883 — rattrapage du stock : les fiches au CV JAMAIS lu, TOUS les espaces réels (démo
   * exclue), avec les drapeaux que `isNeverReadStock` (runner) tranche en TypeScript. Le SQL
   * ne fait que le pré-tri bon marché ; les gardes (qualifiée, archivée, correction humaine)
   * sont rejugées côté code, là où le test sait dire NON.
   */
  async neverReadStockCandidates(): Promise<StockCandidateRow[]> {
    return this.consultants.manager.query<StockCandidateRow[]>(
      `SELECT c.id, c.workspace_id, c.user_id, c.cv_auto_read_at, c.review_status, c.archived_at,
              EXISTS (
                SELECT 1 FROM field_provenance fp
                 WHERE fp.entity_type = 'consultant' AND fp.entity_id = c.id AND fp.source = 'human'
              ) AS has_human
         FROM consultants c
         JOIN workspaces w ON w.id = c.workspace_id
        WHERE c.cv_text IS NOT NULL AND btrim(c.cv_text) <> ''
          AND c.cv_auto_read_at IS NULL
          AND COALESCE(w.is_demo, false) = false
        ORDER BY c.workspace_id, c.created_at ASC`,
    )
  }

  /** Décision Louis 12/10 (c97) — candidates du rattrapage « CV lu = qualifiée » ; le runner rejuge en TypeScript. */
  async needsReviewCandidates(): Promise<ReadQualifyCandidateRow[]> {
    return this.consultants.manager.query<ReadQualifyCandidateRow[]>(
      `SELECT c.id, c.workspace_id, c.cv_auto_read_at, c.review_status, c.archived_at,
              COALESCE(w.is_demo, false) AS is_demo
         FROM consultants c
         JOIN workspaces w ON w.id = c.workspace_id
        WHERE c.review_status = 'needs_review' AND c.cv_auto_read_at IS NOT NULL`,
    )
  }

  /** Qualifie ces fiches (idempotent : le filtre re-vérifie le statut). Rend le nombre écrit. */
  async qualify(consultantIds: string[]): Promise<number> {
    if (consultantIds.length === 0) return 0
    // UPDATE … RETURNING rend `[lignes, nombre]` sous pg : `returnedRows` (garde `returned-rows.spec`).
    const rows = returnedRows<{ id: string }>(
      await this.consultants.manager.query(
        `UPDATE consultants SET review_status = 'qualified', qualified_at = now()
          WHERE id = ANY($1::uuid[]) AND review_status = 'needs_review' AND archived_at IS NULL
          RETURNING id`,
        [consultantIds],
      ),
    )
    this.logger.log(`Rattrapage CV lu = qualifiée : ${rows.length} fiche(s) qualifiée(s)`)
    return rows.length
  }

  /** Combien de CV de l'espace n'ont pas encore été lus. */
  async unreadCount(workspaceId: string): Promise<number> {
    const rows = await this.consultants.manager.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM consultants c WHERE ${UNREAD_WHERE}`,
      [workspaceId],
    )
    return Number(rows[0]?.count ?? 0)
  }

  /** Le rattrapage ciblé : met en file les fiches non lues de l'espace. */
  async enqueueUnread(workspaceId: string, userId: string): Promise<{ queued: number }> {
    const rows = await this.consultants.manager.query<{ id: string }[]>(
      `SELECT c.id FROM consultants c WHERE ${UNREAD_WHERE} ORDER BY c.created_at ASC`,
      [workspaceId],
    )
    let queued = 0
    for (const row of rows) {
      if (await this.enqueue(workspaceId, userId, row.id)) queued += 1
    }
    this.logger.log(`Rattrapage lecture des CV : ${queued} fiche(s) mise(s) en file pour l’espace ${workspaceId}`)
    return { queued }
  }

  /** #3935.3 — combien de fiches lues AVANT le correctif de complétude du
   *  08/10/2026 restent à relire (même file, aucun crédit neuf : le texte du
   *  CV est déjà en base). */
  async completenessCatchUpCount(workspaceId: string): Promise<number> {
    const rows = await this.consultants.manager.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM consultants c WHERE ${COMPLETENESS_CATCH_UP_WHERE}`,
      [workspaceId],
    )
    // #3935.6 — plus les fiches au texte espacé que la sélection ci-dessus ne vise pas déjà.
    const spaced = (await this.spacedTextCandidates(workspaceId)).filter(candidate => !candidate.inCompleteness)
    return Number(rows[0]?.count ?? 0) + spaced.length
  }

  /**
   * #3935.6 — les fiches dont le `cv_text` stocké est espacé lettre à lettre ET
   * recollable. Le fichier d'origine n'est PAS conservé (`consultant_documents`
   * ne garde que le texte) : une ré-extraction est impossible, mais le recollage
   * est déterministe. Un texte mauvais pour une autre raison (illisible, quasi
   * vide) n'est pas rattrapable d'ici — il demande un nouveau dépôt du fichier.
   */
  private async spacedTextCandidates(workspaceId: string): Promise<SpacedTextCandidate[]> {
    const rows = await this.consultants.manager.query<{ id: string; cv_text?: unknown; in_completeness?: boolean }[]>(
      SPACED_TEXT_SELECT,
      [workspaceId],
    )
    const candidates: SpacedTextCandidate[] = []
    for (const row of rows) {
      if (typeof row.cv_text !== 'string') continue
      if (!assessCvTextQuality(row.cv_text).reasons.includes('lettre_a_lettre')) continue
      const repaired = repairLetterSpacing(row.cv_text)
      // Recollé mais encore espacé : on n'écrit pas un texte qui ne vaut pas mieux.
      if (assessCvTextQuality(repaired).reasons.includes('lettre_a_lettre')) continue
      candidates.push({ id: row.id, repaired, original: row.cv_text, inCompleteness: row.in_completeness === true })
    }
    return candidates
  }

  /** #3935.3 — le rattrapage ciblé de complétude : un geste dans le vivier,
   *  jamais un passage automatique au déploiement — même mécanique que
   *  {@link enqueueUnread}, même file asynchrone, qui ne bloque jamais la
   *  boucle API (doctrine de l'incident ZIP CV du 05/10). */
  async enqueueCompletenessCatchUp(workspaceId: string, userId: string, limit?: number): Promise<{ queued: number }> {
    const rows = await this.consultants.manager.query<{ id: string }[]>(
      // #3883 — `limit` : le script ponctuel relit par LOTS reprenables ; sans lui, tout.
      `SELECT c.id FROM consultants c WHERE ${COMPLETENESS_CATCH_UP_WHERE} ORDER BY c.created_at ASC${
        limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(limit))}` : ''
      }`,
      [workspaceId],
    )
    // #3935.6 — le texte espacé se RECOLLE avant la relecture. La limite borne aussi ces
    // fiches : jamais recollée sans être relue (elle sortirait de la sélection).
    const ids = rows.map(row => row.id)
    let room = limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(limit)) - ids.length
    for (const candidate of await this.spacedTextCandidates(workspaceId)) {
      if (!ids.includes(candidate.id)) {
        if (candidate.inCompleteness || room <= 0) continue
        ids.push(candidate.id)
        room -= 1
      }
      // L'ancien texte est la condition d'écriture : un texte qui a bougé n'est pas écrasé.
      await this.consultants.manager.query(`UPDATE consultants SET cv_text = $1 WHERE id = $2 AND cv_text = $3`, [
        candidate.repaired,
        candidate.id,
        candidate.original,
      ])
    }
    let queued = 0
    for (const id of ids) {
      if (await this.enqueue(workspaceId, userId, id)) queued += 1
    }
    this.logger.log(`Rattrapage complétude CV : ${queued} fiche(s) mise(s) en file pour l’espace ${workspaceId}`)
    return { queued }
  }
}
