import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { SAME_GROUP_SQL } from '../../common/same-group-sql'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { accountScopeAnd } from '../manager/manager-bu-scope'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateNoteInput, Note, NoteEntityType, NoteScopeAccount, UpdateNoteInput } from '@bellum/contracts'
import { NoteEntity } from '../../database/entities/note.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Combien de notes on ramène sur une fiche. Au-delà, personne ne lit. */
const NOTES_LIMIT = 200

type NoteRow = {
  id: string
  entityType: NoteEntityType
  entityId: string
  body: string
  authorId: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  pinned: boolean
  createdAt: Date | string
  updatedAt: Date | string
  /** #3895 — absent pour une note qui n'est pas de compte. */
  alsoAppliesToAccountIds?: string[] | null
}

/**
 * #2103.1 / #3758 — deux champs qui n'entrent PAS dans le contrat public de
 * création d'une note (`createNoteSchema`) : ni saisis à la main, seule la
 * cascade de compte rendu les connaît.
 *
 * `meetingRecapSnapshot` est l'instantané structuré (décisions, prochaines
 * étapes, relance) que la carte `post_meeting_summary` de Laura relit —
 * jamais reconstruit depuis `body` après coup.
 */
type CreateNoteOptions = {
  sourceEventId?: string | null
  meetingRecapSnapshot?: Record<string, unknown> | null
  /** #4158.58 — périmètre BU du rédacteur : une note sur un compte hors périmètre est refusée. `null` = aucun cloisonnement. */
  scope?: BusinessUnitScopeClause
}

/**
 * Les notes d'un objet — empilables, datées, signées.
 *
 * Deux règles qui ne sont pas des détails :
 *  - une note n'est modifiable que par SON auteur. Un manager qui réécrit la
 *    note d'un commercial produit un document que plus personne ne croit ;
 *  - la lecture est ouverte à tout l'espace. Une note privée dans un CRM
 *    d'équipe est une information perdue le jour où son auteur part.
 */
@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(NoteEntity) private readonly notes: Repository<NoteEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async list(
    userId: string,
    entityType: NoteEntityType,
    entityId: string,
    scope: BusinessUnitScopeClause = null,
  ): Promise<Note[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // #4158.62 — les droits suivent l'ENTITÉ : les notes d'un compte hors du périmètre BU du lecteur
    // ne se lisent pas (404, comme un compte inexistant). `null` = aucun cloisonnement, aucune requête de plus.
    if (scope && entityType === 'account') await this.assertAccountInScope(entityId, workspaceId, scope)
    // #3895 — sur un compte, on lit aussi les notes d'une autre entité du groupe qui
    // DISENT valoir ici. Les autres objets n'ont pas de portée de groupe.
    const scopeSelect = entityType === 'account' ? 'n.also_applies_to_account_ids AS "alsoAppliesToAccountIds",' : ''
    const scopeWhere =
      entityType === 'account'
        ? `(n.entity_id = $2 OR (n.entity_type = 'account' AND $2 = ANY(n.also_applies_to_account_ids)))`
        : 'n.entity_id = $2'
    const rows = await this.notes.manager.query<NoteRow[]>(
      `SELECT n.id, n.entity_type AS "entityType", n.entity_id AS "entityId", n.body,
              ${scopeSelect}
              n.user_id AS "authorId", p.first_name AS "firstName", p.last_name AS "lastName",
              p.email AS "email", n.pinned, n.created_at AS "createdAt", n.updated_at AS "updatedAt"
       FROM notes n
       LEFT JOIN profiles p ON p.user_id = n.user_id
       WHERE n.entity_type = $1 AND ${scopeWhere} AND n.workspace_id = $3
       ORDER BY n.pinned DESC, n.created_at DESC
       LIMIT $4`,
      [entityType, entityId, workspaceId, NOTES_LIMIT],
    )
    return this.toWireWithScope(rows, entityId, workspaceId, scope)
  }

  /** #3895 — les AUTRES entités du groupe d'un compte, celles où une note peut aussi valoir. */
  async groupEntities(
    userId: string,
    accountId: string,
    scope: BusinessUnitScopeClause = null,
  ): Promise<NoteScopeAccount[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // #4158.62 — les droits suivent l'ENTITÉ : le compte ouvert et chaque entité nommée passent la
    // même clause de périmètre BU que `GET /accounts/:id/group-entities`. `null` = aucune clause.
    return this.notes.manager.query<NoteScopeAccount[]>(
      `SELECT s.id, s.company_name AS name
         FROM accounts o JOIN accounts s ON ${SAME_GROUP_SQL}
        WHERE o.id = $1 AND o.workspace_id = $2${accountScopeAnd(scope, 'o.business_unit_id')}${accountScopeAnd(scope, 's.business_unit_id')}
        ORDER BY s.company_name`,
      [accountId, workspaceId],
    )
  }

  async create(userId: string, input: CreateNoteInput, options: CreateNoteOptions = {}): Promise<Note> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertEntityBelongsToWorkspace(input.entityType, input.entityId, workspaceId)
    // #4158.58 — l'écriture suit le même périmètre que la lecture (#4158.62) : 403 nommé, rien n'est écrit.
    if (options.scope && input.entityType === 'account') {
      const inScope = await this.accountInScope(input.entityId, workspaceId, options.scope)
      if (!inScope)
        throw new ForbiddenException('Ce compte est hors de ton périmètre : tu ne peux pas y écrire de note.')
    }
    const scope = input.alsoAppliesToAccountIds ?? []
    await this.assertScopeIsSameGroup(input.entityId, scope, workspaceId)

    const saved = await this.notes.save(
      this.notes.create({
        workspace_id: workspaceId,
        user_id: userId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        body: input.body.trim(),
        pinned: input.pinned ?? false,
        also_applies_to_account_ids: scope,
        source_event_id: options.sourceEventId ?? null,
        meeting_recap_snapshot: options.meetingRecapSnapshot ?? null,
      }),
    )
    return this.readOne(saved.id, workspaceId)
  }

  /**
   * #2103.1 — LE PRÉALABLE du déclencheur post-RDV : ce rendez-vous a-t-il
   * déjà un compte rendu ? Sans cette réponse, proposer un CR après l'heure
   * de fin d'un rendez-vous externe le reproposerait indéfiniment.
   */
  async existsForSourceEvent(userId: string, sourceEventId: string): Promise<boolean> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.notes.manager.query<{ id: string }[]>(
      `SELECT id FROM notes WHERE workspace_id = $1 AND source_event_id = $2 LIMIT 1`,
      [workspaceId, sourceEventId],
    )
    return rows.length > 0
  }

  async update(userId: string, noteId: string, input: UpdateNoteInput): Promise<Note> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const note = await this.notes.findOne({ where: { id: noteId, workspace_id: workspaceId } })
    if (!note) throw new NotFoundException('Note introuvable')
    if (note.user_id !== userId) throw new ForbiddenException("Seul l'auteur peut modifier sa note")

    if (input.body !== undefined) note.body = input.body.trim()
    if (input.pinned !== undefined) note.pinned = input.pinned
    if (input.alsoAppliesToAccountIds !== undefined) {
      if (note.entity_type !== 'account' && input.alsoAppliesToAccountIds.length > 0)
        throw new BadRequestException('La portée groupe ne concerne que les notes de compte')
      await this.assertScopeIsSameGroup(note.entity_id, input.alsoAppliesToAccountIds, workspaceId)
      note.also_applies_to_account_ids = input.alsoAppliesToAccountIds
    }
    await this.notes.save(note)
    return this.readOne(noteId, workspaceId)
  }

  async remove(userId: string, noteId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const note = await this.notes.findOne({ where: { id: noteId, workspace_id: workspaceId } })
    if (!note) throw new NotFoundException('Note introuvable')
    if (note.user_id !== userId) throw new ForbiddenException("Seul l'auteur peut supprimer sa note")
    await this.notes.delete({ id: noteId })
  }

  private async readOne(noteId: string, workspaceId: string): Promise<Note> {
    const rows = await this.notes.manager.query<NoteRow[]>(
      `SELECT n.id, n.entity_type AS "entityType", n.entity_id AS "entityId", n.body,
              n.also_applies_to_account_ids AS "alsoAppliesToAccountIds",
              n.user_id AS "authorId", p.first_name AS "firstName", p.last_name AS "lastName",
              p.email AS "email", n.pinned, n.created_at AS "createdAt", n.updated_at AS "updatedAt"
       FROM notes n
       LEFT JOIN profiles p ON p.user_id = n.user_id
       WHERE n.id = $1 AND n.workspace_id = $2`,
      [noteId, workspaceId],
    )
    const row = rows[0]
    if (!row) throw new NotFoundException('Note introuvable')
    const [note] = await this.toWireWithScope([row], row.entityId, workspaceId)
    if (!note) throw new NotFoundException('Note introuvable')
    return note
  }

  /**
   * #3895 — nomme la portée de chaque note et, vue depuis une autre entité du
   * groupe, son origine. Les noms viennent des comptes de L'ESPACE : un id hors
   * espace n'a pas de nom et n'est pas servi (jamais un id brut à l'écran).
   */
  private async toWireWithScope(
    rows: NoteRow[],
    viewedEntityId: string,
    workspaceId: string,
    scope: BusinessUnitScopeClause = null,
  ): Promise<Note[]> {
    const ids = [
      ...new Set(
        rows.flatMap(row =>
          row.entityType === 'account' ? [row.entityId, ...(row.alsoAppliesToAccountIds ?? [])] : [],
        ),
      ),
    ]
    const names = new Map<string, string>()
    if (ids.length > 0) {
      const named = await this.notes.manager.query<NoteScopeAccount[]>(
        // #4158.62 — une entité hors du périmètre du lecteur n'est pas nommée (ni sa portée, ni son origine).
        `SELECT id, company_name AS name FROM accounts WHERE id = ANY($1::uuid[]) AND workspace_id = $2${accountScopeAnd(scope, 'business_unit_id')}`,
        [ids, workspaceId],
      )
      for (const account of named) names.set(account.id, account.name)
    }
    const named = (id: string): NoteScopeAccount | null => {
      const name = names.get(id)
      return name === undefined ? null : { id, name }
    }
    return rows.map(row => ({
      ...toWire(row),
      alsoAppliesTo: (row.alsoAppliesToAccountIds ?? []).flatMap(id => named(id) ?? []),
      inheritedFrom: row.entityType === 'account' && row.entityId !== viewedEntityId ? named(row.entityId) : null,
    }))
  }

  /** #4158.62 — le compte lu passe la même clause de périmètre BU que sa fiche ; sinon 404. */
  private async assertAccountInScope(accountId: string, workspaceId: string, scope: BusinessUnitScopeClause) {
    if (!(await this.accountInScope(accountId, workspaceId, scope))) throw new NotFoundException('Objet introuvable')
  }

  private async accountInScope(accountId: string, workspaceId: string, scope: BusinessUnitScopeClause) {
    const rows = await this.notes.manager.query<unknown[]>(
      `SELECT 1 FROM accounts WHERE id = $1 AND workspace_id = $2${accountScopeAnd(scope, 'business_unit_id')} LIMIT 1`,
      [accountId, workspaceId],
    )
    return rows.length > 0
  }

  /**
   * #3895 — une portée de groupe se vérifie, elle ne se croit pas : chaque compte
   * visé doit être de CET espace et du MÊME groupe que le compte de la note. Un
   * seul manquant refuse tout (rien d'écrit à moitié).
   */
  private async assertScopeIsSameGroup(originId: string, scope: string[], workspaceId: string): Promise<void> {
    if (scope.length === 0) return
    const rows = await this.notes.manager.query<{ id: string }[]>(
      `SELECT s.id FROM accounts o JOIN accounts s ON ${SAME_GROUP_SQL}
        WHERE o.id = $1 AND o.workspace_id = $2 AND s.id = ANY($3::uuid[])`,
      [originId, workspaceId, scope],
    )
    if (rows.length !== new Set(scope).size)
      throw new BadRequestException("Une entité n'appartient pas au même groupe que ce compte")
  }

  /**
   * Une note attachée à un objet d'un AUTRE espace serait une fuite : elle
   * s'afficherait chez son propriétaire légitime. On vérifie donc que la cible
   * appartient bien à l'espace avant d'écrire — un id inconnu est un 404, jamais
   * un rattachement silencieux.
   */
  private async assertEntityBelongsToWorkspace(
    entityType: NoteEntityType,
    entityId: string,
    workspaceId: string,
  ): Promise<void> {
    const table = NOTE_TARGET_TABLES[entityType]

    // Les objets du CRM/ATS arrivent par tranches : `projects` et `submissions`
    // n'existent pas encore quand cette tranche part. Sans ce contrôle, une note
    // sur un objet à venir remonterait « relation does not exist » — une erreur
    // technique là où la réponse honnête est « pas encore disponible ».
    const [{ exists }] = await this.notes.manager.query<{ exists: boolean }[]>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [table],
    )
    if (!exists) throw new BadRequestException(`Les notes ne sont pas encore disponibles sur cet objet`)

    const rows = await this.notes.manager.query<{ id: string }[]>(
      `SELECT id FROM ${table} WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [entityId, workspaceId],
    )
    if (rows.length === 0) throw new NotFoundException('Objet introuvable')
  }
}

/**
 * Table cible par type d'objet. Liste FERMÉE et littérale : le nom de table
 * entre dans la requête, donc il ne peut jamais venir d'une valeur d'entrée.
 */
const NOTE_TARGET_TABLES: Readonly<Record<NoteEntityType, string>> = {
  account: 'accounts',
  contact: 'contacts',
  // La TABLE d'un projet s'appelle `opportunities` : le pivot (T1) a unifié le
  // vocabulaire du produit sans renommer la table, dont le nom voyage aussi
  // comme clé de charge utile depuis le service IA. Écrire `projects` ici
  // faisait répondre « pas encore disponible » à toute note de projet — le
  // genre de faute qu'un test d'intégration ne voit pas et qu'un utilisateur
  // rencontre au premier clic.
  project: 'opportunities',
  consultant: 'consultants',
  mission: 'missions',
  submission: 'submissions',
}

function toWire(row: NoteRow): Note {
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    body: row.body,
    authorId: row.authorId,
    authorName: full || row.email || null,
    pinned: row.pinned,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    alsoAppliesTo: [],
    inheritedFrom: null,
  }
}
