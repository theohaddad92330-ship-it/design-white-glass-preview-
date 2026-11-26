import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ContactResolutionCorrection, ContactResolutionCorrectionRequest } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ContactResolutionCorrectionEntity } from '../../database/entities/contact-resolution-correction.entity'
import { ContactEntity } from '../../database/entities/contact.entity'

/** Collision d'unicité PostgreSQL : deux gestes simultanés ont visé le même numéro. */
const UNIQUE_VIOLATION = '23505'
const MAX_ATTEMPTS = 3

function toContract(row: Omit<ContactResolutionCorrectionEntity, 'id'>): ContactResolutionCorrection {
  return {
    version: row.version,
    decision: row.decision,
    dedup_key: row.dedupKey,
    note: row.note,
    decided_at: row.decidedAt.toISOString(),
  }
}

/**
 * #2159.35 — la correction de rapprochement de contact VERSIONNÉE par l'espace.
 *
 * Une ligne par geste : `insert`, jamais `update` ni `delete` — la plus haute
 * version gagne, les précédentes restent l'historique (on archive, on ne
 * supprime pas). La clé de rapprochement (`email:<adresse>`) est DÉRIVÉE de
 * l'e-mail ACTUEL de la fiche au moment du geste, jamais composée côté client
 * (qui n'a pas accès à la ligne brute du fichier importé) — même normalisation
 * que `ImportWriterService.existingKeys('contact', …)`, jamais une seconde.
 */
@Injectable()
export class ContactResolutionCorrectionsService {
  constructor(
    @InjectRepository(ContactResolutionCorrectionEntity)
    private readonly corrections: Repository<ContactResolutionCorrectionEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  async list(workspaceId: string, contactId: string): Promise<ContactResolutionCorrection[]> {
    const rows = await this.corrections.find({ where: { workspaceId, contactId }, order: { version: 'ASC' } })
    return rows.map(toContract)
  }

  async record(input: {
    readonly workspaceId: string
    readonly contactId: string
    readonly decidedBy: string
    readonly request: ContactResolutionCorrectionRequest
  }): Promise<ContactResolutionCorrection> {
    const { request } = input
    const contact = await this.contacts.findOne({ where: { id: input.contactId, workspace_id: input.workspaceId } })
    if (!contact) throw new NotFoundException('Fiche introuvable dans votre espace.')
    const email = (contact.email ?? '').trim().toLowerCase()
    if (!email) {
      throw new BadRequestException(
        'Cette fiche ne porte aucun e-mail : l’import ne la rapproche jamais par ce chemin, rien à corriger.',
      )
    }
    const dedupKey = `email:${email}`
    const note = request.note?.trim() ? request.note.trim() : null
    for (let attempt = 1; ; attempt += 1) {
      const latest = await this.corrections.findOne({
        where: { workspaceId: input.workspaceId, contactId: input.contactId },
        order: { version: 'DESC' },
      })
      const row: Omit<ContactResolutionCorrectionEntity, 'id'> = {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        version: (latest?.version ?? 0) + 1,
        decision: request.decision,
        dedupKey,
        note,
        decidedBy: input.decidedBy,
        decidedAt: new Date(),
      }
      try {
        await this.corrections.insert(row)
        return toContract(row)
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code
        if (code !== UNIQUE_VIOLATION || attempt >= MAX_ATTEMPTS) throw error
      }
    }
  }

  /**
   * #2159.35 — les fiches dont la DERNIÈRE correction dit « ce n'est pas
   * elle » : `ImportWriterService.existingKeys('contact', …)` les retire du
   * map qu'il rend, pour que la ligne suivante d'un import CRÉE plutôt que de
   * mettre à jour la mauvaise personne. `DISTINCT ON` prend la plus haute
   * VERSION par fiche (une correction humaine gagne toujours, quelle que soit
   * sa date) ; le nom de la clé de rapprochement ne sort pas d'ici, seul
   * l'identifiant de la fiche compte pour ce filtre — une clé qui change plus
   * tard n'empêche pas la protection de continuer à s'appliquer À CETTE FICHE.
   */
  async rejectedContactIds(workspaceId: string): Promise<Set<string>> {
    const rows = await this.corrections
      .createQueryBuilder('c')
      .distinctOn(['c.contact_id'])
      .select('c.contact_id', 'contact_id')
      .addSelect('c.decision', 'decision')
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .orderBy('c.contact_id', 'ASC')
      .addOrderBy('c.version', 'DESC')
      .getRawMany<{ contact_id: string; decision: string }>()
    return new Set(rows.filter(row => row.decision === 'rejected').map(row => row.contact_id))
  }
}
