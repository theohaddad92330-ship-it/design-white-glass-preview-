import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NoteEntity } from '../../database/entities/note.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { candidateNoteEntityId } from './candidate-note-entity-id'

/** Réexportée pour les appelants existants (`candidateNoteEntityId` vit
 *  désormais dans son propre fichier, voir son docblock GA-07). */
export { candidateNoteEntityId }

/** Jamais un `NoteEntityType` public (`packages/contracts/note.ts`) : un
 *  candidat Découvrir n'a pas de ligne en base, donc pas de table à vérifier
 *  dans `NOTE_TARGET_TABLES` — le générique `NotesService` ne sait pas écrire
 *  ici, et ce module n'a pas à y entrer. */
const ENTITY_TYPE = 'discover_candidate'

type DiscoverCandidateNote = {
  id: string
  body: string
  createdAt: string
  authorId: string | null
  /** `null` quand le membre a quitté l'espace — jamais un id brut à l'écran. */
  authorName: string | null
}

type NoteRow = {
  id: string
  body: string
  createdAt: Date | string
  authorId: string | null
  firstName: string | null
  lastName: string | null
}

const SELECT_NOTE = `
  SELECT n.id, n.body, n.created_at AS "createdAt", n.user_id AS "authorId",
         p.first_name AS "firstName", p.last_name AS "lastName"
  FROM notes n
  LEFT JOIN profiles p ON p.user_id = n.user_id
`

/**
 * #2151.59 — une note de terrain LIBRE, datée et signée, attachée au candidat
 * de Découvrir (identifié par son SIREN, il n'a pas de ligne en base).
 *
 * Réutilise la table `notes` (déjà polymorphe, datée, signée, scopée espace)
 * plutôt qu'une table neuve : SEULE la clé change. `entity_id` (uuid) est
 * dérivé de façon STABLE du SIREN + de l'espace (`candidateNoteEntityId`),
 * jamais un identifiant aléatoire — la même recherche retrouve toujours les
 * mêmes notes.
 *
 * `claimForAccount` porte la « reprise à la conversion » : quand le candidat
 * devient un dossier de compte, les lignes déjà écrites sont RE-TAGUÉES sur
 * le compte créé (même ligne, jamais une copie) — voir `AccountsService.create`.
 */
@Injectable()
export class DiscoverCandidateNotesService {
  private readonly logger = new Logger(DiscoverCandidateNotesService.name)

  constructor(
    @InjectRepository(NoteEntity) private readonly notes: Repository<NoteEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async list(userId: string, siren: string): Promise<DiscoverCandidateNote[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const entityId = candidateNoteEntityId(workspaceId, siren)
    const rows = await this.notes.manager.query<NoteRow[]>(
      `${SELECT_NOTE} WHERE n.entity_type = $1 AND n.entity_id = $2 AND n.workspace_id = $3
       ORDER BY n.created_at DESC`,
      [ENTITY_TYPE, entityId, workspaceId],
    )
    return rows.map(toWire)
  }

  async create(userId: string, siren: string, body: string): Promise<DiscoverCandidateNote> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const entityId = candidateNoteEntityId(workspaceId, siren)
    const saved = await this.notes.save(
      this.notes.create({
        workspace_id: workspaceId,
        user_id: userId,
        entity_type: ENTITY_TYPE,
        entity_id: entityId,
        body: body.trim(),
        pinned: false,
      }),
    )
    const [row] = await this.notes.manager.query<NoteRow[]>(`${SELECT_NOTE} WHERE n.id = $1`, [saved.id])
    return toWire(row)
  }

  /**
   * Jamais fatal : un incident ici ne doit pas empêcher la création du compte
   * (elle a déjà réussi quand cette méthode est appelée) — seulement être
   * journalisé, pour qu'on puisse le rattraper à la main.
   */
  async claimForAccount(workspaceId: string, siren: string | null, accountId: string): Promise<void> {
    if (!siren) return
    const entityId = candidateNoteEntityId(workspaceId, siren)
    try {
      await this.notes.manager.query(
        `UPDATE notes SET entity_type = 'account', entity_id = $1
         WHERE entity_type = $2 AND entity_id = $3 AND workspace_id = $4`,
        [accountId, ENTITY_TYPE, entityId, workspaceId],
      )
    } catch (error) {
      this.logger.warn('claimForAccount: la reprise des notes candidat a échoué', { error, accountId, siren })
    }
  }
}

function toWire(row: NoteRow): DiscoverCandidateNote {
  const authorName = row.firstName || row.lastName ? [row.firstName, row.lastName].filter(Boolean).join(' ') : null
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    authorId: row.authorId,
    authorName,
  }
}
