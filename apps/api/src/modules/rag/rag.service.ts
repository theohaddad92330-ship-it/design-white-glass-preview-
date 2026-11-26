import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { failure, success, type Result } from '@bellum/utils'
import { IsNull, Repository } from 'typeorm'
import type { RagDocumentPreview, RagDocumentScope } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'

type RagFailureCode =
  | 'not_found'
  | 'delete_failed'
  | 'update_failed'
  | 'scope_requires_conversation'
  // #2779 — `account` sans compte, ou vers un compte d'un autre espace.
  | 'scope_requires_account'
  | 'account_not_in_workspace'

export type RagFailure = {
  code: RagFailureCode
  message: string
  cause?: unknown
}

type RagDocumentSummary = Pick<
  RagDocumentEntity,
  'id' | 'title' | 'category' | 'created_at' | 'user_id' | 'scope' | 'account_id' | 'processing_status'
>

/** #2779 — les portées que TOUTE l'équipe voit dans « Connaissances ». Un
 *  document `account` y est listé (l'équipe sait qu'il existe) ; c'est à la
 *  RÉCUPÉRATION qu'il ne sert qu'à son compte. */
const TEAM_LISTED_SCOPES: readonly RagDocumentScope[] = ['workspace', 'knowledge_base', 'account']

@Injectable()
export class RagService {
  constructor(
    @InjectRepository(RagDocumentEntity)
    private readonly docs: Repository<RagDocumentEntity>,
    // #2779 — « ce compte est-il de cet espace ? », avant d'y rattacher un document.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * #2779 — le compte d'une portée `account` vient du CORPS de la requête :
   * il n'est accepté que s'il appartient à l'espace résolu côté serveur. Une
   * erreur de lecture refuse (fail closed) — jamais un rattachement deviné.
   */
  async accountInWorkspace(accountId: string, workspaceId: string): Promise<boolean> {
    try {
      return (await this.accounts.count({ where: { id: accountId, workspace_id: workspaceId } })) > 0
    } catch {
      return false
    }
  }

  /**
   * List every document in a workspace (multi-user Phase 2 — the first read
   * migrated off per-user scoping; template for the rest, see
   * `agent_docs/multi-user-workspaces.md`). Returns the whole team's documents
   * regardless of which member created them. Identical to the old per-user
   * scoping today, since one user = one workspace and each row's `workspace_id`
   * was backfilled from its owner (proven in the spec). Each row keeps `user_id`
   * as created-by attribution.
   */
  async listForWorkspace(workspaceId: string, userId: string): Promise<RagDocumentSummary[]> {
    try {
      return await this.docs.find({
        // #1954.7 — un document `conversation` sert SEULEMENT au fil qui l'a
        // déposé : il ne doit JAMAIS apparaître dans la base de l'espace que
        // « Connaissances » liste. Sans ce filtre, tout ce qu'un utilisateur
        // joint au chat réapparaîtrait ici, exactement le défaut que la
        // portée existe pour fermer.
        // #2779 — un tableau = OU : les portées d'équipe, plus le `personal`
        // de L'APPELANT seulement (jamais celui d'un collègue).
        // #2431.5 (reste, épopée #2886) — un document ARCHIVÉ (remplacé par
        // `replaceDocument`) n'est plus jamais montré comme actif ici — on
        // archive, on ne supprime pas : la ligne reste en base, seulement
        // absente de cette liste.
        where: [
          ...TEAM_LISTED_SCOPES.map(scope => ({ ...workspaceScopeWhere(workspaceId), scope, archived_at: IsNull() })),
          { ...workspaceScopeWhere(workspaceId), scope: 'personal', user_id: userId, archived_at: IsNull() },
        ],
        select: ['id', 'title', 'category', 'created_at', 'user_id', 'scope', 'account_id', 'processing_status'],
        order: { created_at: 'DESC' },
      })
    } catch {
      return []
    }
  }

  async deleteForUser(
    id: string,
    userId: string,
    workspaceId: string,
  ): Promise<Result<{ sourceObjectId: string | null }, RagFailure>> {
    try {
      // #1954.20 — « retirer » une pièce jointe du chat SUPPRIME le document
      // ingéré (Louis, 12/09/2026) ; « Connaissances » passe par la même porte.
      // UNE instruction bornée à l'AUTEUR et à l'ESPACE : ni un collègue, ni
      // l'auteur depuis un autre espace. Rien trouvé = 404, jamais un succès muet.
      const where = { id, user_id: userId, workspace_id: workspaceId }
      // #3803 (3803.1) — l'original part AVEC le document : son identifiant est
      // lu sous le MÊME cloisonnement, avant que la ligne qui le porte parte.
      const owned = await this.docs.findOne({ where, select: ['id', 'source_object_id'] })
      const result = await this.docs.delete(where)
      if (!result.affected) return failure({ code: 'not_found', message: 'Document introuvable' })
      return success({ sourceObjectId: owned?.source_object_id ?? null })
    } catch (cause) {
      return failure({ code: 'delete_failed', message: 'Impossible de supprimer le document', cause })
    }
  }

  /**
   * #1954.22 — changer la portée d'un document DÉJÀ attaché (Louis, 12/09/2026,
   * même décision que #1954.7). `conversation` sans fil visé est refusé AVANT
   * toute écriture — même garde que la contrainte SQL
   * `rag_documents_conversation_scope_requires_id_check`, qu'un `update` mal
   * formé violerait sinon en base plutôt qu'en amont. `workspace` efface
   * toujours `conversation_id` (hygiène : la colonne ne sert plus une fois la
   * portée élargie, même si la contrainte SQL l'autoriserait à rester).
   * Même cloisonnement que `deleteForUser` : AUTEUR et ESPACE dans la MÊME
   * instruction, jamais `where: { id }`.
   */
  async updateScopeForUser(
    id: string,
    userId: string,
    workspaceId: string,
    scope: RagDocumentScope,
    conversationId: string | null,
    accountId: string | null = null,
  ): Promise<Result<undefined, RagFailure>> {
    if (scope === 'conversation' && !conversationId) {
      return failure({
        code: 'scope_requires_conversation',
        message: 'Un fil est requis pour restreindre la portée à cette conversation.',
      })
    }
    // #2779 — `account` exige un compte, ET un compte de CET espace.
    if (scope === 'account') {
      if (!accountId) {
        return failure({ code: 'scope_requires_account', message: 'Un compte est requis pour cette portée.' })
      }
      if (!(await this.accountInWorkspace(accountId, workspaceId))) {
        return failure({ code: 'account_not_in_workspace', message: 'Compte introuvable' })
      }
    }
    try {
      const result = await this.docs.update(
        { id, user_id: userId, workspace_id: workspaceId },
        {
          scope,
          conversation_id: scope === 'conversation' ? conversationId : null,
          account_id: scope === 'account' ? accountId : null,
        },
      )
      if (!result.affected) return failure({ code: 'not_found', message: 'Document introuvable' })
      return success()
    } catch (cause) {
      return failure({ code: 'update_failed', message: 'Impossible de changer la portée du document', cause })
    }
  }

  /**
   * #3803 (3803.5) — QUI peut LIRE un document : son auteur (toute portée), et
   * l'espace entier pour un document d'ÉQUIPE — exactement ce que
   * « Connaissances » liste ({@link TEAM_LISTED_SCOPES}). Un `personal` ou un
   * `conversation` d'un collègue reste invisible. L'ESPACE est dans CHAQUE
   * branche du OU : un autre espace ne trouve jamais rien, même par l'auteur.
   */
  private readableWhere(id: string, userId: string, workspaceId: string) {
    return [
      { id, ...workspaceScopeWhere(workspaceId), user_id: userId },
      ...TEAM_LISTED_SCOPES.map(scope => ({ id, ...workspaceScopeWhere(workspaceId), scope })),
    ]
  }

  /**
   * #1954.19 — PRÉVISUALISER un document déjà attaché (Louis, 12/09/2026 :
   * « un clic sur la pièce ouvrira un aperçu de son contenu »).
   *
   * #3803 — l'aperçu s'ouvre AUSSI depuis Connaissances, par un collègue
   * (« un collègue de l'espace ouvre le même aperçu ; un autre espace
   * jamais ») : lecture par {@link readableWhere}, et l'ORIGINAL conservé est
   * décrit (`source`), `null` quand il n'existe pas — jamais une clé absente.
   */
  async getPreviewForReader(
    id: string,
    userId: string,
    workspaceId: string,
  ): Promise<Result<RagDocumentPreview, RagFailure>> {
    const doc = await this.docs.findOne({
      where: this.readableWhere(id, userId, workspaceId),
      select: ['id', 'title', 'content', 'category', 'source_object_id'],
    })
    if (!doc) return failure({ code: 'not_found', message: 'Document introuvable' })
    return success({
      id: doc.id,
      title: doc.title ?? null,
      content: doc.content ?? null,
      category: doc.category ?? null,
      source: doc.source_object_id ? await this.describeSource(doc.source_object_id, workspaceId) : null,
    })
  }

  /** L'original décrit — lu dans l'ESPACE et au DOMAINE, jamais par son seul id. */
  private async describeSource(objectId: string, workspaceId: string): Promise<RagDocumentPreview['source']> {
    try {
      const [row] = await this.docs.manager.query<{ file_name: string; content_type: string; byte_size: string }[]>(
        `SELECT file_name, content_type, byte_size FROM storage_objects
           WHERE id = $1 AND workspace_id = $2 AND domain = 'rag_document_source'`,
        [objectId, workspaceId],
      )
      if (!row) return null
      return { fileName: row.file_name, contentType: row.content_type, byteSize: Number(row.byte_size) }
    } catch {
      // Une lecture qui échoue retombe sur le texte, jamais sur un original deviné.
      return null
    }
  }

  /**
   * #3803 (3803.2/3803.5) — l'objet de l'original d'un document LISIBLE par
   * l'appelant. `not_found` quand le document est invisible OU n'a pas
   * d'original : les deux se disent pareil (un 404 bavard est un annuaire).
   */
  async sourceObjectIdForReader(id: string, userId: string, workspaceId: string): Promise<Result<string, RagFailure>> {
    const doc = await this.docs.findOne({
      where: this.readableWhere(id, userId, workspaceId),
      select: ['id', 'source_object_id'],
    })
    if (!doc?.source_object_id) return failure({ code: 'not_found', message: 'Original introuvable' })
    return success(doc.source_object_id)
  }

  /**
   * #3803 (3803.1) — lie l'original rangé à son document. Borné à l'ESPACE, et
   * seulement si le document n'en porte pas déjà un (un doublon détecté à
   * l'ingestion rend l'id d'un document EXISTANT : son original reste le sien).
   */
  async attachSource(id: string, workspaceId: string, objectId: string): Promise<boolean> {
    const result = await this.docs.update(
      { id, ...workspaceScopeWhere(workspaceId), source_object_id: IsNull() },
      { source_object_id: objectId },
    )
    return Boolean(result.affected)
  }

  /**
   * #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
   * importée. Le NOUVEAU document a déjà été ingéré (même porte que `ingest`,
   * `RagController.replace`) quand cette méthode tourne : elle ne fait QUE
   * lier l'ancien au nouveau, jamais un second dépôt.
   *
   * On archive, on ne supprime pas : `archived_at` date le remplacement,
   * `replaced_by_id` pointe vers le nouveau document — la ligne ancienne
   * reste lisible par son identifiant (citation déjà rendue, historique du
   * copilote), seulement retirée de `listForWorkspace` (Connaissances).
   *
   * Même cloisonnement que `deleteForUser`/`updateScopeForUser` : AUTEUR et
   * ESPACE dans la MÊME instruction, jamais `where: { id }` — ni un collègue,
   * ni l'auteur depuis un autre espace, ne peuvent remplacer ce document.
   */
  async replaceDocument(
    oldDocumentId: string,
    userId: string,
    workspaceId: string,
    newDocumentId: string,
  ): Promise<Result<undefined, RagFailure>> {
    try {
      const result = await this.docs.update(
        { id: oldDocumentId, user_id: userId, workspace_id: workspaceId },
        { archived_at: new Date(), replaced_by_id: newDocumentId },
      )
      if (!result.affected) return failure({ code: 'not_found', message: 'Document introuvable' })
      return success()
    } catch (cause) {
      return failure({ code: 'update_failed', message: 'Impossible de lier le document de remplacement', cause })
    }
  }
}
