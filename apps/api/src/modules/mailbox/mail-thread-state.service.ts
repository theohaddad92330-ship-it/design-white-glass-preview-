import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'
import type { MailThreadStateCounts } from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MailThreadMarkEntity } from '../../database/entities/mail-thread-mark.entity'

const CONFLICT = { conflictPaths: ['user_id', 'thread_id'] }

/**
 * Théo B M1.N1 / M1.N2 / M1.N3 / M1.N6 — l'état de traitement d'un fil, TENU CÔTÉ BELLUM (personnel, comme la
 * messagerie : scopé par `user_id`). Aucun contenu de message, aucun appel au fournisseur, aucun rappel externe.
 * Chaque `.upsert` ne touche QUE sa colonne : reporter n'efface ni la marque « traité » ni le rattachement.
 */
@Injectable()
export class MailThreadStateService {
  constructor(
    @InjectRepository(MailThreadMarkEntity) private readonly marks: Repository<MailThreadMarkEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
  ) {}

  async snooze(
    userId: string,
    threadId: string,
    until: string | null,
    now: Date = new Date(),
  ): Promise<{ snoozeUntil: string | null }> {
    const date = until === null ? null : new Date(until)
    if (date !== null && (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime())) {
      throw new BadRequestException('Un report vise une date à venir.')
    }
    await this.marks.upsert({ user_id: userId, thread_id: threadId, snooze_until: date }, CONFLICT)
    return { snoozeUntil: date ? date.toISOString() : null }
  }

  async setPriority(userId: string, threadId: string, priority: boolean): Promise<{ priority: boolean }> {
    await this.marks.upsert({ user_id: userId, thread_id: threadId, priority_manual: priority }, CONFLICT)
    return { priority }
  }

  /** Le contact doit appartenir à l'espace actif : sinon n'importe quel identifiant rattacherait un fil à un autre client. */
  async linkContact(
    userId: string,
    workspaceId: string | null,
    threadId: string,
    contactId: string,
  ): Promise<{ contactId: string }> {
    const contact = workspaceId
      ? await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
      : null
    if (!contact) throw new BadRequestException("Ce contact n'existe pas dans ton espace de travail.")
    await this.marks.upsert({ user_id: userId, thread_id: threadId, contact_id: contactId }, CONFLICT)
    return { contactId }
  }

  /** Les compteurs des onglets de traitement (traités, non pertinents, archivés, reportés, prioritaires). */
  async counts(userId: string, now: Date = new Date()): Promise<MailThreadStateCounts> {
    const [treated, irrelevant, archived, snoozed, prioritized] = await Promise.all([
      this.marks.count({ where: { user_id: userId, state: 'treated' } }),
      this.marks.count({ where: { user_id: userId, state: 'irrelevant' } }),
      this.marks.count({ where: { user_id: userId, state: 'archived' } }),
      this.marks.count({ where: { user_id: userId, snooze_until: MoreThan(now) } }),
      this.marks.count({ where: { user_id: userId, priority_manual: true } }),
    ])
    return { treated, irrelevant, archived, snoozed, prioritized }
  }
}
