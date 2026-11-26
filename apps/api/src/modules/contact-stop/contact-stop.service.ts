import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { CONTACT_STOP_REASONS, contactStopReasonFor, type ContactStopReason } from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { SuppressionService } from '../mailer/suppression.service'

/** Un arrêt, tel qu'un chemin d'envoi a besoin de le lire. Non exporté : il ne
 *  voyage que par la signature de {@link ContactStopService.verdict}, et
 *  l'exporter en ferait un type consommé nulle part (knip). */
type ContactStopVerdict = {
  reason: ContactStopReason
  since: string
  motion: string | null
}

/** Ce qu'il faut pour poser un arrêt. Non exporté, même raison. */
type RecordContactStopInput = {
  workspaceId: string
  contactId: string
  /** L'auteur du geste. `null` = le transport (désabonnement, rebond). */
  declaredBy: string | null
  /** La motion au terme de laquelle l'issue est déclarée, s'il y en a une. */
  motion?: string | null
  /** L'issue déclarée. Fournie AVEC `motion`, ou remplacée par `reason`. */
  outcome?: string | null
  /** La raison directe — pour le transport, qui n'est l'issue d'aucune motion. */
  reason?: ContactStopReason
  note?: string | null
}

/**
 * LA PORTE — « cette personne a-t-elle demandé qu'on cesse ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue d'issues nommait `do_not_call` comme condition d'arrêt, et
 * `outcomeStopsMotion` savait le reconnaître. **Aucune ligne de production ne
 * l'appelait.** Un refus était décrit, publié au front, et n'arrêtait rien : le
 * seul verrou réel du produit était `email_suppressions`, indexée par ADRESSE.
 * Un contact joint au téléphone, ou sans adresse, n'avait aucun verrou.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PORTES, ET POURQUOI IL Y EN A DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Un chemin d'envoi connaît soit une PERSONNE (un `contact_id` : armer une
 * cadence, inviter à une réunion), soit une ADRESSE (`to`, `attendees`). Les
 * deux questions n'ont pas la même clé, et prétendre le contraire aurait produit
 * une porte qui ne ferme qu'à moitié.
 *
 *  - la porte PERSONNE, c'est {@link ContactStopService.verdict} (une personne)
 *    et {@link ContactStopService.stoppedAmong} (un lot) ;
 *  - la porte ADRESSE, c'est `SuppressionService.isSuppressed`, déjà consultée
 *    par les huit chemins d'envoi d'e-mail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON RETIRE LE MOYEN, PAS SEULEMENT LA PERMISSION
 * ─────────────────────────────────────────────────────────────────────────────
 * D'où la propriété qui fait tenir l'ensemble : **poser un arrêt alimente les
 * DEUX portes.** Un `do_not_call` sur un contact qui a une adresse inscrit aussi
 * cette adresse à la liste de suppression — sinon la messagerie connectée, le
 * lot d'envoi et l'inscription en séquence chez le CRM resteraient tous
 * atteignables, chacun avec sa propre lecture. Un garde-fou qui se contente de
 * ne plus PROPOSER l'envoi n'est pas un garde-fou.
 *
 * Et l'écriture d'adresse fait, en cascade, ce que la liste de suppression
 * faisait déjà : elle ANNULE les séquences actives de cette personne et saute
 * leurs étapes en attente.
 */
@Injectable()
export class ContactStopService {
  private readonly logger = new Logger(ContactStopService.name)

  constructor(
    @InjectRepository(ContactStopEntity)
    private readonly stops: Repository<ContactStopEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    private readonly suppression: SuppressionService,
  ) {}

  /**
   * Pose l'arrêt — et retire le moyen.
   *
   * L'issue est validée par {@link contactStopReasonFor}, qui exige DEUX choses
   * ensemble : que l'issue arrête la motion selon le catalogue, et qu'elle porte
   * sur la personne. Sans la première, un `do_not_call` déclaré au terme d'une
   * motion qui ne l'a jamais prévu poserait un arrêt sur quelqu'un que personne
   * n'a appelé ; sans la seconde, une fin de mission ferait taire un client.
   */
  async record(input: RecordContactStopInput): Promise<ContactStopVerdict> {
    const reason = this.resolveReason(input)

    const contact = await this.contacts.findOne({
      where: { id: input.contactId, workspace_id: input.workspaceId, deleted_at: IsNull() },
    })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')

    await this.stops
      .createQueryBuilder()
      .insert()
      .values({
        workspace_id: input.workspaceId,
        contact_id: contact.id,
        reason,
        motion: input.motion?.trim() || null,
        outcome: input.outcome?.trim() || null,
        note: input.note?.trim() || null,
        declared_by: input.declaredBy,
      })
      // Dire deux fois « ne me contactez plus » est le même fait, pas deux.
      .orIgnore()
      .execute()

    // LE MOYEN. Sans cette ligne, l'arrêt ne ferme que la porte PERSONNE, et
    // huit chemins d'envoi d'e-mail resteraient ouverts sur la même personne.
    const email = contact.email?.trim()
    if (email) {
      try {
        await this.suppression.suppress(input.workspaceId, email, reason)
      } catch (error) {
        // On ne perd pas l'arrêt pour autant : il est déjà posé, et la porte
        // PERSONNE ferme déjà les chemins qui connaissent un `contact_id`.
        // Le dire fort, en revanche — c'est la moitié du verrou qui manque.
        this.logger.error('Arrêt posé mais adresse NON supprimée', {
          error,
          tags: { 'contact_stop.contact': contact.id, 'contact_stop.reason': reason },
        })
      }
    }

    const stored = await this.stops.findOne({ where: { contact_id: contact.id } })
    return {
      reason,
      since: (stored?.created_at ?? new Date()).toISOString(),
      motion: stored?.motion ?? null,
    }
  }

  /** L'arrêt de ce contact, ou `null`. La lecture que consultent les chemins. */
  async verdict(workspaceId: string, contactId: string): Promise<ContactStopVerdict | null> {
    const row = await this.stops.findOne({ where: { workspace_id: workspaceId, contact_id: contactId } })
    if (!row) return null
    return {
      reason: row.reason as ContactStopReason,
      since: row.created_at.toISOString(),
      motion: row.motion,
    }
  }

  /**
   * Les contacts arrêtés parmi ceux-ci — une requête, pas N.
   *
   * Une lecture PAR CONTACT sur un lot de mille rendrait le cron de
   * synchronisation quadratique, et un contrôle trop coûteux finit par être
   * retiré. Un ensemble VIDE est une réponse, jamais « on ne sait pas ».
   */
  async stoppedAmong(workspaceId: string, contactIds: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(contactIds)].filter(id => id.length > 0)
    if (unique.length === 0) return new Set()
    const rows = await this.stops.find({
      where: { workspace_id: workspaceId, contact_id: In(unique) },
      select: ['contact_id'],
    })
    return new Set(rows.map(row => row.contact_id))
  }

  /**
   * #2380.61 — comme {@link stoppedAmong}, mais chaque arrêt porte SA raison
   * (`do_not_call`, `unsubscribed`…) : l'écran l'affiche, il ne la devine pas.
   */
  async stopReasonsAmong(workspaceId: string, contactIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(contactIds)].filter(id => id.length > 0)
    if (unique.length === 0) return new Map()
    const rows = await this.stops.find({
      where: { workspace_id: workspaceId, contact_id: In(unique) },
      select: ['contact_id', 'reason'],
    })
    return new Map(rows.map(row => [row.contact_id, row.reason]))
  }

  /**
   * La raison à inscrire, ou un refus EXPLICITE.
   *
   * Un arrêt inventé est aussi coûteux qu'une insistance : il ferait cesser une
   * relance légitime sans que personne comprenne pourquoi. On ne devine donc
   * rien — une issue qui n'arrête pas sa motion est refusée en le disant.
   */
  private resolveReason(input: RecordContactStopInput): ContactStopReason {
    if (input.motion && input.outcome) {
      const derived = contactStopReasonFor(input.motion, input.outcome)
      if (!derived) {
        throw new BadRequestException(
          `« ${input.outcome} » n'arrête pas la motion « ${input.motion} » : aucun arrêt n'est posé.`,
        )
      }
      return derived
    }
    if (input.reason && CONTACT_STOP_REASONS.includes(input.reason)) return input.reason
    throw new BadRequestException("Un arrêt demande une issue de motion, ou une raison d'arrêt connue.")
  }
}
