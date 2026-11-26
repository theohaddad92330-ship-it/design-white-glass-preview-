import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository } from 'typeorm'
import { isPersonErasureKeyConfigured } from '../../common/person-erasure-hmac'
import { EmailSuppressionEntity } from '../../database/entities/email-suppression.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { erasedEmailFingerprint } from '../contacts/person-erasure-fingerprint'

/**
 * Opt-out / suppression list for outreach email (Palier 1 garde-fou RGPD).
 * `isSuppressed` gates every send; `suppress` is called by the public
 * unsubscribe endpoint. Scoped per workspace, email normalised lower-case.
 *
 * Deux lectures, parce qu'il y a deux natures d'envoi :
 *  - {@link isSuppressed} — l'envoi appartient à un ESPACE (relance à un
 *    contact, lot d'envoi, digest de veille d'un espace précis) ;
 *  - {@link isSuppressedForUser} — l'envoi appartient à une PERSONNE (résumé
 *    hebdomadaire, digest de relances en retard, newsletter changelog). Un
 *    utilisateur peut être membre de plusieurs espaces ; n'en consulter qu'un
 *    laisserait passer le courrier par la porte d'à côté.
 */
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name)

  constructor(
    @InjectRepository(EmailSuppressionEntity)
    private readonly suppressions: Repository<EmailSuppressionEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
  ) {}

  /**
   * #2297.51 — DEUX FORMES d'opposition, et le contrôle lit les deux : l'adresse
   * en clair (toute opposition ordinaire) et son EMPREINTE HMAC (l'opposition
   * d'une personne effacée, RGPD art. 17, dont l'adresse n'est plus conservée —
   * `PersonErasureService`). Ne lire que la première rouvrirait l'envoi à la
   * seule personne qui a demandé le plus fort qu'on la laisse tranquille.
   *
   * Sans clé d'empreinte, le contrôle ne faiblit pas : l'adresse en clair est
   * lue, et si l'espace porte une opposition en empreinte qu'on ne sait plus
   * reconnaître, on se TAIT — l'envoi est refusé plutôt que deviné.
   */
  async isSuppressed(workspaceId: string, email: string): Promise<boolean> {
    const normalised = email.trim().toLowerCase()
    if (!isPersonErasureKeyConfigured()) {
      const clear = await this.suppressions.count({ where: { workspace_id: workspaceId, email: normalised } })
      if (clear > 0) return true
      const unreadable = await this.suppressions.count({
        where: { workspace_id: workspaceId, erased_at: Not(IsNull()) },
      })
      if (unreadable > 0) {
        // Ni l'adresse ni la clé dans le journal : l'espace, et la raison.
        this.logger.error(
          `Envoi refusé sur l'espace ${workspaceId} : une opposition en empreinte ne se vérifie pas sans PERSON_ERASURE_HMAC_KEY`,
        )
        return true
      }
      return false
    }
    const print = erasedEmailFingerprint(workspaceId, normalised)
    const forms = print ? [normalised, print] : [normalised]
    const count = await this.suppressions.count({ where: { workspace_id: workspaceId, email: In(forms) } })
    return count > 0
  }

  /**
   * Vrai dès qu'UN SEUL espace de cet utilisateur porte l'opt-out.
   *
   * Asymétrie assumée : se réabonner demande un geste explicite, alors qu'un
   * envoi non désiré coûte la réputation du domaine expéditeur — qui, elle, se
   * répare en semaines. Dans le doute, on se tait.
   */
  async isSuppressedForUser(userId: string, email: string): Promise<boolean> {
    const normalised = email.trim().toLowerCase()
    if (!normalised) return false

    const memberships = await this.members.find({ where: { user_id: userId } })
    for (const membership of memberships) {
      if (await this.isSuppressed(membership.workspace_id, normalised)) return true
    }
    return false
  }

  /** Idempotent — a repeat unsubscribe is a no-op (unique on workspace_id+email). */
  async suppress(workspaceId: string, email: string, reason: string): Promise<void> {
    const normalised = email.trim().toLowerCase()
    // #2297.51 — l'adresse d'une personne effacée est DÉJÀ opposée, en
    // empreinte : un désabonnement ultérieur (vieux lien) ne la réécrit pas en
    // clair. Sans clé, on enregistre en clair — perdre une opposition serait pire.
    const print = isPersonErasureKeyConfigured() ? erasedEmailFingerprint(workspaceId, normalised) : null
    const alreadyErased =
      print !== null && (await this.suppressions.count({ where: { workspace_id: workspaceId, email: print } })) > 0
    if (!alreadyErased) {
      await this.suppressions
        .createQueryBuilder()
        .insert()
        .values({ workspace_id: workspaceId, email: normalised, reason })
        .orIgnore()
        .execute()
    }
    await this.stopSequencesFor(workspaceId, normalised)
    await this.stopContactsFor(workspaceId, normalised, reason)
  }

  /**
   * L'opt-out ferme AUSSI la porte « personne », pas seulement la porte
   * « adresse ».
   *
   * Les deux portes existent parce qu'un chemin d'envoi connaît soit une
   * adresse, soit un `contact_id` : armer une cadence, synchroniser un CRM ou
   * proposer un appel ne partent pas d'une adresse. Poser l'une sans l'autre
   * laisserait un désabonné parfaitement inscriptible en séquence — c'est
   * exactement le trou que ce lot ferme dans l'autre sens.
   *
   * SQL brut, comme l'arrêt des séquences juste au-dessus : cela évite un
   * import circulaire mailer ↔ contact-stop, et la portée reste stricte
   * (l'espace et l'adresse).
   *
   * `unsubscribed` et non la raison brute reçue : la contrainte
   * `contact_stops_reason_check` porte un vocabulaire fermé, et un rebond arrive
   * par le même chemin sous un autre mot. Un `bounced` distinct demandera un
   * appelant qui sache le dire — aujourd'hui aucun ne le fait, et écrire un mot
   * qu'aucun chemin ne produit fabriquerait une statistique fausse.
   */
  private async stopContactsFor(workspaceId: string, email: string, reason: string): Promise<void> {
    if (!email) return
    try {
      await this.suppressions.query(
        `INSERT INTO contact_stops (workspace_id, contact_id, reason, note)
         SELECT c.workspace_id, c.id, 'unsubscribed', $3
           FROM contacts c
          WHERE c.workspace_id = $1 AND lower(c.email) = $2 AND c.deleted_at IS NULL
         ON CONFLICT (contact_id) DO NOTHING`,
        [workspaceId, email, reason],
      )
    } catch (cause) {
      this.logger.warn('arrêt du contact après opt-out impossible', { error: cause, workspaceId })
    }
  }

  /**
   * Un opt-out ou un rebond ARRÊTE les séquences en cours de cet interlocuteur.
   *
   * C'est la moitié manquante des quatre conditions d'arrêt « non
   * désactivables » (PDF 2 §10.4). Deux l'étaient déjà — une réponse et un
   * rendez-vous mettent la séquence en pause. Les deux autres ne l'étaient pas :
   * l'opt-out et le rebond bloquaient l'ENVOI au dernier moment, mais la
   * séquence restait `active` avec ses étapes en attente, indéfiniment. Elle
   * continuait de compter dans les tableaux, de proposer des échéances, et de
   * faire croire qu'un fil était vivant alors que l'adresse était morte ou que
   * la personne avait demandé qu'on lui fiche la paix.
   *
   * `cancelled` et non `paused` : une pause se reprend, et ni un opt-out ni une
   * adresse qui rebondit ne se reprennent.
   *
   * SQL brut volontaire, comme l'arrêt sur réponse : cela évite un import
   * circulaire mailer ↔ outreach, et la portée reste stricte (l'espace et
   * l'adresse). Best-effort : un échec ici ne doit jamais empêcher l'opt-out
   * lui-même d'être enregistré — c'est lui qui protège vraiment la personne.
   */
  private async stopSequencesFor(workspaceId: string, email: string): Promise<void> {
    if (!email) return
    try {
      await this.suppressions.query(
        `UPDATE outreach_sequences s SET status = 'cancelled'
         FROM contacts c
         WHERE s.contact_id = c.id
           AND s.status = 'active'
           AND c.workspace_id = $1
           AND lower(c.email) = $2`,
        [workspaceId, email],
      )
      // Les étapes restantes sont SKIPPÉES, pas laissées en attente : une étape
      // `pending` sur une séquence annulée continue de remonter dans « ce qui
      // est dû aujourd'hui ».
      await this.suppressions.query(
        `UPDATE outreach_sequence_steps st SET status = 'skipped'
         FROM outreach_sequences s, contacts c
         WHERE st.sequence_id = s.id
           AND s.contact_id = c.id
           AND st.status = 'pending'
           AND s.status = 'cancelled'
           AND c.workspace_id = $1
           AND lower(c.email) = $2`,
        [workspaceId, email],
      )
    } catch (cause) {
      this.logger.warn('arrêt des séquences après opt-out impossible', { error: cause, workspaceId })
    }
  }
}
