import { Logger } from '@nestjs/common'
import type { LauraJobDrafts } from './laura-job.port'

const logger = new Logger('LauraJobDrafts')

/**
 * #4016 L5 (reprise 20/10) — le PORT du mandat `laura_send`, vu d'Action OS.
 * Réalisé par `OutreachDelegationService.awaitIfMandated` (branché dans
 * `action-os.module.ts`, `useExisting`) : un port plutôt qu'un import, pour ne
 * pas ajouter de dépendance service → service entre modules (GA-07).
 */
export const LAURA_SEND_MANDATE = Symbol('LAURA_SEND_MANDATE')
export type LauraSendMandate = {
  awaitIfMandated(
    workspaceId: string | null,
    messageId: string,
    scope: 'laura_send',
    originatedAt: Date,
  ): Promise<boolean>
}

/** Ce que le job a besoin d'écrire : le message canonique (réalisé par `OutreachMessageService.create`). */
type CanonicalDraftWriter = {
  create(
    ctx: { userId: string; workspaceId: string; role: 'member' },
    dto: {
      contact_id: string
      channel: 'email' | 'linkedin' | 'phone'
      intent: 'open_relationship'
      source: 'laura'
      subject: string | null
      body: string
    },
    stops: (contactIds: readonly string[]) => Promise<Set<string>>,
    actorKind: 'model',
  ): Promise<{ id: string }>
}

/**
 * #2276 tranche 2 — le brouillon généré par le job de Laura devient le message
 * canonique d'Outreach. Même écriture que la carte « préparer un message »
 * (#2366.2) : né `needs_review`, préparé n'est jamais envoyé. `role` n'est pas
 * lu par `create` (remplissage de type, jamais une autorisation empruntée).
 *
 * #4016 L5 (reprise 20/10) — un brouillon E-MAIL est proposé au mandat
 * `laura_send` : rattaché seulement si un mandat est signé et vivant (le service
 * décide), sinon il reste ordinaire (c82 inchangée). Rien ne part ici.
 */
export function lauraJobDraftsFrom(outreach: CanonicalDraftWriter, mandate: LauraSendMandate | null): LauraJobDrafts {
  return {
    keep: async input => {
      const message = await outreach.create(
        { userId: input.userId, workspaceId: input.workspaceId, role: 'member' },
        {
          contact_id: input.contactId,
          channel: input.channel,
          intent: 'open_relationship',
          source: 'laura',
          subject: input.subject,
          body: input.body,
        },
        async () => new Set<string>(),
        'model',
      )
      if (input.channel === 'email' && mandate) {
        // Un échec ici laisse un brouillon ordinaire, jamais un brouillon perdu.
        await mandate
          .awaitIfMandated(input.workspaceId, message.id, 'laura_send', new Date())
          .catch((error: unknown) => logger.warn(`Mandat Laura non relu : ${(error as Error).message}`))
      }
      return message.id
    },
  }
}
