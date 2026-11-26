import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  TALENT_DUPLICATE_CONFIDENCE,
  compareTalentFields,
  findTalentDuplicates,
  indexTalentIdentities,
  resolveTalentIdentityState,
  stateAfterDecision,
  type TalentDocument,
  type TalentDocumentKind,
  type TalentDuplicateAction,
  type TalentDuplicateDecision,
  type TalentDuplicateDecisionInput,
  type TalentDuplicateMatch,
  type TalentDuplicatePreview,
  type TalentDuplicateProposal,
  type TalentDuplicateReason,
  type TalentDuplicatesReport,
  type TalentIdentity,
  type TalentIdentityCandidate,
  type TalentIdentityCard,
  type TalentIdentityHistoryEntry,
  type TalentIdentityIndex,
  type TalentIdentityState,
} from '@bellum/contracts'
import { TalentIdentityDecisionEntity } from '../../database/entities/talent-identity-decision.entity'
import { returnedRows } from '../../database/returned-rows'

/** Ce que la comparaison lit d'une fiche — une ligne, tous signaux compris. */
export type IdentityRow = {
  id: string
  workspace_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  public_profile_url: string | null
  location: string | null
  employer: string | null
  title: string | null
  review_status: string
  created_at: Date | string
  document_hashes: string[] | null
  experience_keys: string[] | null
  external_ids: string[] | null
}

type DecisionRow = {
  id: string
  talent_id: string
  other_talent_id: string | null
  action: string
  state: string
  reason: string | null
  assignee_id: string | null
  assignee_name: string | null
  decided_by_name: string | null
  created_at: Date | string
  undone_at: Date | string | null
  document_ids: string[] | null
}

/** Le plafond déjà tenu par le dépôt de CV : au-delà, le vivier n'est plus comparé d'un bloc. */
const IDENTITY_LOAD_LIMIT = 5000

/**
 * #2327 — LAU-FINAL-068 : la résolution d'identité des talents.
 *
 * ⚠️ On PROPOSE, on ne fusionne JAMAIS (`c37_fusion_doublons`). Ce service n'a
 * aucun chemin qui efface une fiche, un champ ou un document : il lit, il
 * compare, il ENREGISTRE des décisions — et « mettre à jour » COPIE des
 * documents, sans réécrire la fiche.
 *
 * Le rapprochement lui-même vit dans `findTalentDuplicates` (contrat partagé) :
 * ce service ne fait que lui fournir la matière — une ligne par fiche, avec les
 * onze sources d'identité que la base connaît.
 */
@Injectable()
export class TalentIdentityService {
  constructor(
    @InjectRepository(TalentIdentityDecisionEntity)
    private readonly decisions: Repository<TalentIdentityDecisionEntity>,
  ) {}

  private query<T>(sql: string, params: unknown[] = []): Promise<T> {
    return this.decisions.manager.query<T>(sql, params)
  }

  /**
   * Les fiches de l'espace, avec leurs signaux d'identité.
   *
   *  - l'employeur est celui qu'on CONNAÎT : le partenaire qui porte la personne
   *    (#2327.6). Rien n'est deviné pour les autres ;
   *  - les empreintes et les expériences viennent de TOUS les documents, archivés
   *    compris : un document retiré reste une preuve d'identité (#2327.22) ;
   *  - les identifiants externes sont ceux que la reprise a liés (`sync_links`),
   *    préfixés par l'outil — le même numéro chez deux outils ne désigne
   *    personne en commun (#2327.10 / #2327.11).
   */
  async loadIdentities(workspaceId: string): Promise<IdentityRow[]> {
    return this.query<IdentityRow[]>(
      `SELECT c.id, c.workspace_id, c.full_name, c.email, c.phone, c.public_profile_url,
              c.zones[1] AS location, pa.company_name AS employer, c.title, c.review_status, c.created_at,
              docs.hashes AS document_hashes, docs.keys AS experience_keys, links.ids AS external_ids
         FROM consultants c
         LEFT JOIN accounts pa ON pa.id = c.partner_account_id
         LEFT JOIN LATERAL (
           SELECT array_agg(DISTINCT d.content_sha256) FILTER (WHERE d.content_sha256 IS NOT NULL) AS hashes,
                  array_agg(DISTINCT k.key) FILTER (WHERE k.key IS NOT NULL) AS keys
             FROM consultant_documents d
             LEFT JOIN LATERAL unnest(d.experience_keys) AS k(key) ON true
            WHERE d.consultant_id = c.id
         ) docs ON true
         LEFT JOIN LATERAL (
           SELECT array_agg(s.provider || ':' || s.external_id) AS ids
             FROM sync_links s
            WHERE s.workspace_id = c.workspace_id AND s.entity_type = 'consultant' AND s.internal_id = c.id
         ) links ON true
        WHERE c.workspace_id = $1 AND c.archived_at IS NULL
        ORDER BY c.created_at ASC
        LIMIT ${IDENTITY_LOAD_LIMIT}`,
      [workspaceId],
    )
  }

  /**
   * Incident boucle API (05/10/2026) — le vivier d'un LOT (import ZIP), lu UNE
   * fois : avant, chaque CV d'une archive de 688 fichiers relisait jusqu'à
   * 5 000 fiches (une requête lourde + leur conversion par CV).
   */
  async openCandidateIndex(workspaceId: string): Promise<TalentCandidateIndex> {
    const rows = await this.loadIdentities(workspaceId)
    return new TalentCandidateIndex(workspaceId, rows.map(toIdentity))
  }

  /** Les fiches existantes qui pourraient être la personne qu'on dépose ou qu'on saisit. */
  async findForCandidate(workspaceId: string, candidate: TalentIdentityCandidate): Promise<TalentDuplicateMatch[]> {
    const rows = await this.loadIdentities(workspaceId)
    return findTalentDuplicates({ ...candidate, workspaceId }, rows.map(toIdentity))
  }

  /**
   * Les doublons possibles d'une fiche EXISTANTE, après les décisions humaines.
   *
   *  - « pas la même personne » et « mettre à jour » retirent la paire pour de
   *    bon (#2327.12) ;
   *  - « ignorer » la retire tant qu'aucun signal PLUS FORT que celui qu'on a
   *    ignoré n'apparaît ;
   *  - « attribuer » la laisse visible, avec la décision.
   */
  async reportForTalent(workspaceId: string, talentId: string): Promise<TalentDuplicatesReport> {
    const rows = await this.loadIdentities(workspaceId)
    const self = rows.find(row => row.id === talentId)
    if (!self) throw new NotFoundException('Talent introuvable')
    const matches = findTalentDuplicates({ ...toIdentity(self), workspaceId, selfId: talentId }, rows.map(toIdentity))
    const decisions = await this.activeDecisions(workspaceId, talentId)
    const items: TalentDuplicateProposal[] = []
    for (const match of matches) {
      const decision = latestFor(decisions, talentId, match.talentId)
      if (decision && hidesMatch(decision, match)) continue
      items.push({ ...match, decision: decision ? toDecision(decision) : null })
    }
    return { state: resolveTalentIdentityState(items), items }
  }

  /** #2327.19 — les deux fiches côte à côte, avant toute décision. */
  async preview(workspaceId: string, talentId: string, otherId: string): Promise<TalentDuplicatePreview> {
    const rows = await this.loadIdentities(workspaceId)
    const a = rows.find(row => row.id === talentId)
    const b = rows.find(row => row.id === otherId)
    if (!a || !b) throw new NotFoundException('Talent introuvable')
    const [match] = findTalentDuplicates({ ...toIdentity(a), workspaceId, selfId: a.id }, [toIdentity(b)])
    const [documentsA, documentsB, historyA, historyB, decisions] = await Promise.all([
      this.documentsOf(a.id),
      this.documentsOf(b.id),
      this.historyOf(workspaceId, a.id),
      this.historyOf(workspaceId, b.id),
      this.activeDecisions(workspaceId, a.id),
    ])
    const cardA = toCard(a)
    const cardB = toCard(b)
    return {
      a: cardA,
      b: cardB,
      match: match ?? null,
      fields: compareTalentFields(cardA, cardB),
      documents: { a: documentsA, b: documentsB },
      history: { a: historyA, b: historyB },
      consequences: {
        documentsCopiedOnUpdate: documentsB.length,
        fieldsOverwritten: 0,
        mergeAvailable: false,
      },
      decisions: decisions.filter(row => pairOf(row, a.id) === b.id).map(toDecision),
    }
  }

  /**
   * #2327.20 — enregistre une décision humaine sur la paire (`talentId`, autre).
   *
   * La RÈGLE qui rapprochait la paire et l'état qui en découle sont figés dans
   * la ligne (#2327.21) : dans six mois, « pourquoi a-t-on dit que c'était la
   * même personne » a une réponse.
   */
  async decide(
    workspaceId: string,
    userId: string,
    talentId: string,
    input: TalentDuplicateDecisionInput,
  ): Promise<TalentDuplicateDecision> {
    if (input.otherTalentId === talentId) throw new BadRequestException('Une fiche ne se compare pas à elle-même.')
    const rows = await this.loadIdentities(workspaceId)
    const a = rows.find(row => row.id === talentId)
    const b = rows.find(row => row.id === input.otherTalentId)
    if (!a || !b) throw new NotFoundException('Talent introuvable')

    if (input.action === 'assign_to_recruiter') {
      const members = await this.query<{ user_id: string }[]>(
        `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, input.assigneeId],
      )
      if (members.length === 0) {
        throw new BadRequestException('On ne confie une proposition qu’à un membre de l’espace.')
      }
    }

    const [match] = findTalentDuplicates({ ...toIdentity(a), workspaceId, selfId: a.id }, [toIdentity(b)])
    const derived = resolveTalentIdentityState(match ? [match] : [])
    const state = stateAfterDecision(input.action, derived)
    const reason = match?.reason ?? null

    const documentIds =
      input.action === 'update_existing' ? await this.copyDocuments(workspaceId, userId, a.id, b.id, reason) : []

    return this.record(workspaceId, userId, {
      talentId: a.id,
      otherTalentId: b.id,
      action: input.action,
      state,
      reason,
      assigneeId: input.action === 'assign_to_recruiter' ? input.assigneeId : null,
      documentIds,
    })
  }

  /**
   * #2327.12 — mémorise « ce n'est pas la même personne » pour chaque fiche
   * écartée au dépôt. Une fiche écartée qui n'est pas dans l'espace est ignorée
   * en silence : l'identifiant vient du navigateur.
   */
  async rememberKeptSeparate(
    workspaceId: string,
    userId: string,
    talentId: string,
    dismissed: readonly TalentDuplicateMatch[],
  ): Promise<void> {
    for (const match of dismissed) {
      await this.record(workspaceId, userId, {
        talentId,
        otherTalentId: match.talentId,
        action: 'keep_separate',
        state: 'new',
        reason: match.reason,
        assigneeId: null,
        documentIds: [],
      })
    }
  }

  /** #2327.17 — trace le rattachement d'un CV déposé à une fiche existante. */
  async rememberAttached(
    workspaceId: string,
    userId: string,
    talentId: string,
    documentId: string,
    reason: TalentDuplicateReason | null,
  ): Promise<void> {
    await this.journal(workspaceId, userId, talentId, 'update_existing', reason)
    await this.record(workspaceId, userId, {
      talentId,
      otherTalentId: null,
      action: 'update_existing',
      state: 'updated',
      reason,
      assigneeId: null,
      documentIds: [documentId],
    })
  }

  /**
   * #2327.25 — annule une décision : la ligne est DATÉE, jamais effacée, et les
   * documents qu'elle avait copiés sont ARCHIVÉS (#2327.22) — les originaux,
   * eux, n'ont jamais bougé.
   */
  async undo(workspaceId: string, userId: string, decisionId: string): Promise<void> {
    const result = await this.query<unknown>(
      `UPDATE talent_identity_decisions
          SET undone_at = now(), undone_by = $1
        WHERE id = $2 AND workspace_id = $3 AND undone_at IS NULL
        RETURNING id, document_ids`,
      [userId, decisionId, workspaceId],
    )
    // #vague-23 — `returnedRows` et non une relecture à la main : un UPDATE …
    // RETURNING rend `[lignes, nombre]`, indexer autrement rend un tableau
    // « truthy » et le 404 ci-dessous ne partirait jamais.
    const updated = returnedRows<{ id: string; document_ids: string[] | null }>(result)
    if (updated.length === 0) throw new NotFoundException('Décision introuvable ou déjà annulée')
    const copies = updated[0]?.document_ids ?? []
    if (copies.length > 0) {
      await this.query(
        `UPDATE consultant_documents SET archived_at = now()
          WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL`,
        [workspaceId, copies],
      )
    }
  }

  /** Les décisions EN VIGUEUR qui touchent une fiche, des deux côtés de la paire. */
  private activeDecisions(workspaceId: string, talentId: string): Promise<DecisionRow[]> {
    return this.query<DecisionRow[]>(
      `SELECT d.id, d.talent_id, d.other_talent_id, d.action, d.state, d.reason, d.assignee_id,
              NULLIF(trim(concat_ws(' ', pa.first_name, pa.last_name)), '') AS assignee_name,
              NULLIF(trim(concat_ws(' ', pd.first_name, pd.last_name)), '') AS decided_by_name,
              d.created_at, d.undone_at, d.document_ids
         FROM talent_identity_decisions d
         LEFT JOIN profiles pa ON pa.user_id = d.assignee_id
         LEFT JOIN profiles pd ON pd.user_id = d.decided_by
        WHERE d.workspace_id = $1 AND d.undone_at IS NULL
          AND (d.talent_id = $2 OR d.other_talent_id = $2)
        ORDER BY d.created_at DESC`,
      [workspaceId, talentId],
    )
  }

  /**
   * Copie les documents de `fromId` sur `toId` — de nouvelles lignes, les
   * originaux intacts. Aucun champ de la fiche n'est touché.
   */
  private async copyDocuments(
    workspaceId: string,
    userId: string,
    toId: string,
    fromId: string,
    reason: TalentDuplicateReason | null,
  ): Promise<string[]> {
    const copied = await this.query<{ id: string }[]>(
      `INSERT INTO consultant_documents
              (consultant_id, workspace_id, kind, filename, mime_type, size_bytes, extracted_text, uploaded_by,
               content_sha256, experience_keys)
       SELECT $1, $2, d.kind, d.filename, d.mime_type, d.size_bytes, d.extracted_text, $3,
              d.content_sha256, d.experience_keys
         FROM consultant_documents d
        WHERE d.consultant_id = $4 AND d.archived_at IS NULL
       RETURNING id`,
      [toId, workspaceId, userId, fromId],
    )
    const ids = copied.map(row => row.id)
    if (ids.length > 0) {
      await this.journal(workspaceId, userId, toId, 'update_existing', reason, String(ids.length))
    }
    return ids
  }

  /** #2327.21 — le journal de la fiche : avant, après, source, auteur, date ET règle. */
  private async journal(
    workspaceId: string,
    userId: string,
    talentId: string,
    action: TalentDuplicateAction,
    reason: TalentDuplicateReason | null,
    newValue = '1',
  ): Promise<void> {
    await this.query(
      `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id, rule)
       VALUES ($1, 'consultant', $2, $3, $4, $5, 'human', $6, $7)`,
      [workspaceId, talentId, 'documents', null, newValue, userId, `talent_identity.${action}:${reason ?? 'none'}`],
    )
  }

  private async record(
    workspaceId: string,
    userId: string,
    decision: {
      talentId: string
      otherTalentId: string | null
      action: TalentDuplicateAction
      state: TalentIdentityState
      reason: TalentDuplicateReason | null
      assigneeId: string | null
      documentIds: string[]
    },
  ): Promise<TalentDuplicateDecision> {
    const [saved] = await this.query<{ id: string; created_at: Date | string }[]>(
      `INSERT INTO talent_identity_decisions
              (workspace_id, talent_id, other_talent_id, action, state, reason, assignee_id, decided_by, document_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid[])
       RETURNING id, created_at`,
      [
        workspaceId,
        decision.talentId,
        decision.otherTalentId,
        decision.action,
        decision.state,
        decision.reason,
        decision.assigneeId,
        userId,
        decision.documentIds,
      ],
    )
    return {
      id: saved?.id ?? '',
      talentId: decision.talentId,
      otherTalentId: decision.otherTalentId,
      action: decision.action,
      state: decision.state,
      reason: decision.reason,
      assigneeId: decision.assigneeId,
      assigneeName: null,
      decidedByName: null,
      decidedAt: new Date(saved?.created_at ?? Date.now()).toISOString(),
      undoneAt: null,
    }
  }

  private async documentsOf(talentId: string): Promise<TalentDocument[]> {
    const rows = await this.query<
      {
        id: string
        kind: string
        filename: string
        mime_type: string | null
        size_bytes: number | null
        extracted_len: number | string | null
        created_at: Date | string
        uploader: string | null
        has_original?: boolean | null
      }[]
    >(
      `SELECT d.id, d.kind, d.filename, d.mime_type, d.size_bytes,
              length(coalesce(d.extracted_text, '')) AS extracted_len, d.created_at,
              (d.storage_path IS NOT NULL) AS has_original,
              NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '') AS uploader
         FROM consultant_documents d
         LEFT JOIN profiles p ON p.user_id = d.uploaded_by
        WHERE d.consultant_id = $1 AND d.archived_at IS NULL
        ORDER BY d.created_at DESC`,
      [talentId],
    )
    return rows.map(row => ({
      id: row.id,
      kind: row.kind as TalentDocumentKind,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      extractedChars: Number(row.extracted_len ?? 0),
      uploadedAt: new Date(row.created_at).toISOString(),
      uploadedByName: row.uploader,
      // #4034.5 — même lecture que `TalentService.listDocuments`.
      hasOriginal: row.has_original === true,
    }))
  }

  private async historyOf(workspaceId: string, talentId: string): Promise<TalentIdentityHistoryEntry[]> {
    const rows = await this.query<
      {
        field: string
        old_value: string | null
        new_value: string | null
        source: string
        actor: string | null
        created_at: Date | string
        rule: string | null
      }[]
    >(
      `SELECT a.field, a.old_value, a.new_value, a.source, a.created_at, a.rule,
              NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '') AS actor
         FROM record_field_audit a
         LEFT JOIN profiles p ON p.user_id = a.actor_id
        WHERE a.workspace_id = $1 AND a.entity_type = 'consultant' AND a.entity_id = $2
        ORDER BY a.created_at DESC
        LIMIT 20`,
      [workspaceId, talentId],
    )
    return rows.map(row => ({
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      source: row.source,
      actorName: row.actor,
      at: new Date(row.created_at).toISOString(),
      rule: row.rule,
    }))
  }
}

/**
 * Incident boucle API (05/10/2026) — le vivier d'un lot, en mémoire le temps
 * du lot. La comparaison reste `findTalentDuplicates`, la même fonction que
 * `findForCandidate` : mêmes réponses, sans relire la base à chaque CV.
 *
 * `remember` tient l'index à jour de ce que le lot ÉCRIT lui-même (fiche
 * créée, document rattaché) : ce que la relecture par CV voyait avant, deux
 * CV de la même personne dans la même archive se reconnaissent toujours.
 */
export class TalentCandidateIndex {
  /** Rangé par clé normalisée (`indexTalentIdentities`) : une recherche ne
   *  relit que les fiches qui partagent une clé avec le candidat. */
  private readonly index: TalentIdentityIndex
  private readonly byId = new Map<string, TalentIdentity>()

  constructor(
    private readonly workspaceId: string,
    identities: readonly TalentIdentity[],
  ) {
    for (const identity of identities) this.byId.set(identity.id, identity)
    this.index = indexTalentIdentities(identities)
  }

  find(candidate: TalentIdentityCandidate): TalentDuplicateMatch[] {
    return this.index.find({ ...candidate, workspaceId: this.workspaceId })
  }

  remember(
    talentId: string,
    signals: { email?: string | null; phone?: string | null; documentHashes: string[]; experienceKeys: string[] },
  ): void {
    const known = this.byId.get(talentId)
    if (known) {
      const completed: TalentIdentity = {
        ...known,
        documentHashes: [...new Set([...(known.documentHashes ?? []), ...signals.documentHashes])],
        experienceKeys: [...new Set([...(known.experienceKeys ?? []), ...signals.experienceKeys])],
      }
      this.byId.set(talentId, completed)
      this.index.add(completed)
      return
    }
    const created: TalentIdentity = {
      id: talentId,
      workspaceId: this.workspaceId,
      fullName: null,
      email: signals.email ?? null,
      phone: signals.phone ?? null,
      lastEmployer: null,
      publicProfileUrl: null,
      location: null,
      documentHashes: [...signals.documentHashes],
      experienceKeys: [...signals.experienceKeys],
      externalIds: [],
    }
    this.byId.set(talentId, created)
    this.index.add(created)
  }
}

function toIdentity(row: IdentityRow): TalentIdentity {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    lastEmployer: row.employer,
    publicProfileUrl: row.public_profile_url,
    location: row.location,
    documentHashes: row.document_hashes ?? [],
    experienceKeys: row.experience_keys ?? [],
    externalIds: row.external_ids ?? [],
  }
}

function toCard(row: IdentityRow): TalentIdentityCard {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    publicProfileUrl: row.public_profile_url,
    title: row.title,
    location: row.location,
    reviewStatus: row.review_status,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function pairOf(row: DecisionRow, talentId: string): string | null {
  return row.talent_id === talentId ? row.other_talent_id : row.talent_id
}

function latestFor(rows: DecisionRow[], talentId: string, otherId: string): DecisionRow | null {
  // Les lignes arrivent de la plus récente à la plus ancienne.
  return rows.find(row => pairOf(row, talentId) === otherId) ?? null
}

function hidesMatch(decision: DecisionRow, match: TalentDuplicateMatch): boolean {
  if (decision.action === 'keep_separate' || decision.action === 'update_existing') return true
  if (decision.action === 'ignore') {
    const ignored = decision.reason ? (TALENT_DUPLICATE_CONFIDENCE[decision.reason as TalentDuplicateReason] ?? 0) : 0
    return match.confidence <= ignored
  }
  return false
}

function toDecision(row: DecisionRow): TalentDuplicateDecision {
  return {
    id: row.id,
    talentId: row.talent_id,
    otherTalentId: row.other_talent_id,
    action: row.action as TalentDuplicateAction,
    state: row.state as TalentIdentityState,
    reason: (row.reason as TalentDuplicateReason | null) ?? null,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    decidedByName: row.decided_by_name,
    decidedAt: new Date(row.created_at).toISOString(),
    undoneAt: row.undone_at ? new Date(row.undone_at).toISOString() : null,
  }
}
