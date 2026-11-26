import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { activeTeammateAccountIds } from '../../../common/account-team-membership'
import { Repository } from 'typeorm'
import { isInPortfolio, portfolioScopeFor, type NotificationPreferences, type WorkspaceRole } from '@bellum/contracts'
import { AccountEntity } from '../../../database/entities/account.entity'
import { NotificationPreferenceEntity } from '../../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../../database/entities/profile.entity'
import { personDisplayName } from '../../action-os/run-trace'
import { MailerService } from '../../mailer/mailer.service'
import { SuppressionService } from '../../mailer/suppression.service'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { NotificationsService } from '../notifications.service'

type EmailPreferenceKey = keyof Pick<
  NotificationPreferences,
  'email_on_assignment' | 'email_on_delegation' | 'email_on_mention' | 'email_on_manager_digest'
>

/** Ce dont l'e-mail opt-in a besoin — commun aux gestes de collègue et au digest du manager. */
type EmailDelivery = {
  type: 'account_assigned' | 'action_delegated' | 'team_mention' | 'manager_digest'
  workspaceId: string
  recipientUserId: string
  link: string
  emailPreference: EmailPreferenceKey
  /** Une seule phrase pour l'e-mail — jamais le corps d'un message (c96). */
  emailLine: (actorName: string, lang: 'fr' | 'en') => string
  /** Plusieurs lignes (le digest) : prime sur `emailLine`. */
  emailLines?: (lang: 'fr' | 'en') => string[]
  emailSubject: (actorName: string, lang: 'fr' | 'en') => string
}

type Delivery = EmailDelivery & {
  type: 'account_assigned' | 'action_delegated' | 'team_mention'
  actorUserId: string
  /** Le titre de la notification, une fois l'auteur nommé. */
  title: (actorName: string) => string
}

/**
 * #4158.14 — LE passage obligé des notifications ENTRE COLLÈGUES.
 *
 * Un collègue assigne un compte, délègue une action, mentionne quelqu'un : trois
 * gestes, une seule porte, parce que les règles sont les mêmes pour les trois et
 * qu'une règle recopiée trois fois se désaccorde (GA-26) :
 *
 *  - personne n'est notifié de sa PROPRE action ;
 *  - le destinataire doit être MEMBRE de l'espace du geste (un id d'un autre
 *    espace ne produit rien) ;
 *  - quand le geste porte sur un compte, le destinataire doit y avoir ACCÈS
 *    (même règle de portefeuille que l'ouverture de la fiche) ;
 *  - l'e-mail est un opt-in par type, FAUX par défaut, envoyé au destinataire
 *    seul, sans le corps d'aucun message, jamais depuis une salle de démo.
 *
 * BEST-EFFORT : le geste (assignation, délégation, commentaire) a déjà réussi
 * quand on arrive ici ; une notification qui échoue ne le défait pas. Ne lève
 * donc jamais.
 */
@Injectable()
export class TeamNotificationsService {
  private readonly logger = new Logger(TeamNotificationsService.name)

  constructor(
    private readonly notifications: NotificationsService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @Optional() private readonly mailer?: MailerService,
    @Optional() private readonly suppression?: SuppressionService,
  ) {}

  /** #4158.15 — `accounts.assigned_to` vient de changer vers `recipientUserId`. */
  async notifyAccountAssigned(input: {
    workspaceId: string
    actorUserId: string
    recipientUserId: string
    accountId: string
  }): Promise<void> {
    await this.guarded('account_assigned', async () => {
      const account = await this.accounts.findOne({ where: { id: input.accountId, workspace_id: input.workspaceId } })
      if (!account) return
      await this.deliver({
        type: 'account_assigned',
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        recipientUserId: input.recipientUserId,
        title: actor => `${actor} t'a attribué le compte ${account.company_name}`,
        link: `/accounts/${account.id}`,
        emailPreference: 'email_on_assignment',
        emailSubject: (actor, lang) =>
          lang === 'en' ? `${actor} assigned you an account` : `${actor} t'a attribué un compte`,
        emailLine: (actor, lang) =>
          lang === 'en'
            ? `${actor} assigned you the account ${account.company_name}.`
            : `${actor} t'a attribué le compte ${account.company_name}.`,
      })
    })
  }

  /** #4158.16 — `action_plan_items.assigned_to` vient de changer vers `recipientUserId`. */
  async notifyActionDelegated(input: {
    workspaceId: string
    actorUserId: string
    recipientUserId: string
    accountId: string | null
  }): Promise<void> {
    await this.guarded('action_delegated', async () => {
      const account = input.accountId
        ? await this.accounts.findOne({ where: { id: input.accountId, workspace_id: input.workspaceId } })
        : null
      await this.deliver({
        type: 'action_delegated',
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        recipientUserId: input.recipientUserId,
        title: actor =>
          account ? `${actor} t'a délégué une action sur ${account.company_name}` : `${actor} t'a délégué une action`,
        link: account ? `/accounts/${account.id}` : '/actions',
        emailPreference: 'email_on_delegation',
        emailSubject: (actor, lang) =>
          lang === 'en' ? `${actor} delegated an action to you` : `${actor} t'a délégué une action`,
        emailLine: (actor, lang) =>
          lang === 'en'
            ? `${actor} delegated an action to you${account ? ` on ${account.company_name}` : ''}.`
            : `${actor} t'a délégué une action${account ? ` sur ${account.company_name}` : ''}.`,
      })
    })
  }

  /**
   * #4158.17 — une notification par personne mentionnée, dédoublonnée, sans
   * l'auteur. `deliver` retire de lui-même qui n'est pas membre ou n'a pas
   * accès : on peut donc passer la liste brute du commentaire.
   */
  async notifyMentions(input: {
    workspaceId: string
    actorUserId: string
    mentionedUserIds: readonly string[]
    accountId: string | null
    conversationId: string | null
  }): Promise<void> {
    const recipients = [...new Set(input.mentionedUserIds)].filter(id => id !== input.actorUserId)
    if (recipients.length === 0) return
    await this.guarded('team_mention', async () => {
      const accountId = input.accountId ?? (await this.accountOfConversation(input.workspaceId, input.conversationId))
      const link = accountId ? `/accounts/${accountId}` : '/team'
      for (const recipientUserId of recipients) {
        await this.deliver({
          type: 'team_mention',
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          recipientUserId,
          accessAccountId: accountId,
          title: actor => `${actor} t'a mentionné dans un commentaire d'équipe`,
          link,
          emailPreference: 'email_on_mention',
          emailSubject: (actor, lang) =>
            lang === 'en' ? `${actor} mentioned you in a team comment` : `${actor} t'a mentionné dans un commentaire`,
          // Le FAIT, jamais le texte du commentaire (c96).
          emailLine: (actor, lang) =>
            lang === 'en'
              ? `${actor} mentioned you in a team comment.`
              : `${actor} t'a mentionné dans un commentaire d'équipe.`,
        })
      }
    })
  }

  /**
   * #4158.28 — le digest hebdomadaire du manager (L5) : la MÊME porte, la MÊME préférence
   * (`email_on_manager_digest`, faux par défaut) que les gestes de collègue — pas un second chemin.
   * Pas d'auteur (c'est une synthèse, pas un geste) : la règle « pas de ma propre action » ne
   * s'applique pas, mais le destinataire doit être MEMBRE de l'espace. Rend `true` quand la ligne
   * est posée dans l'app (le dédoublonnage hebdomadaire reste à l'appelant) ; ne lève jamais.
   */
  async notifyManagerDigest(input: {
    workspaceId: string
    recipientUserId: string
    title: string
    lines: readonly string[]
  }): Promise<boolean> {
    let created = false
    await this.guarded('manager_digest', async () => {
      const membership = await this.workspaceContext.getMembership(input.recipientUserId, input.workspaceId)
      if (!membership) return
      // Le marqueur de dédoublonnage (la ligne dans l'app) est posé AVANT l'éventuel e-mail.
      await this.notifications.createNotification(input.recipientUserId, {
        type: 'manager_digest',
        title: input.title,
        body: input.lines.join('\n'),
        link: '/team',
        origin: 'user_triggered',
        workspaceId: input.workspaceId,
      })
      created = true
      await this.sendEmailIfOptedIn({
        type: 'manager_digest',
        workspaceId: input.workspaceId,
        recipientUserId: input.recipientUserId,
        link: '/team',
        emailPreference: 'email_on_manager_digest',
        emailSubject: () => input.title,
        emailLine: () => input.lines.join(' '),
        emailLines: () => [...input.lines],
      })
    })
    return created
  }

  private async accountOfConversation(workspaceId: string, conversationId: string | null): Promise<string | null> {
    if (!conversationId) return null
    const rows = await this.accounts.manager.query<{ attached_account_id: string | null }[]>(
      `SELECT attached_account_id FROM chat_conversations WHERE workspace_id = $1 AND conversation_id = $2 LIMIT 1`,
      [workspaceId, conversationId],
    )
    return rows[0]?.attached_account_id ?? null
  }

  private async deliver(delivery: Delivery & { accessAccountId?: string | null }): Promise<void> {
    const { workspaceId, actorUserId, recipientUserId } = delivery
    if (recipientUserId === actorUserId) return

    const membership = await this.workspaceContext.getMembership(recipientUserId, workspaceId)
    if (!membership) return

    if (
      delivery.accessAccountId &&
      !(await this.canOpenAccount(workspaceId, membership.role, recipientUserId, delivery.accessAccountId))
    ) {
      return
    }

    const actorName = await this.displayNameOf(actorUserId)
    await this.notifications.createNotification(recipientUserId, {
      type: delivery.type,
      title: delivery.title(actorName),
      link: delivery.link,
      origin: 'user_triggered',
      workspaceId,
      actorUserId,
    })

    await this.sendEmailIfOptedIn(delivery, actorName)
  }

  /** Même règle que l'ouverture de la fiche : `portfolioScopeFor` + `isInPortfolio` (co-équipier actif compris, #4996 L3). */
  private async canOpenAccount(
    workspaceId: string,
    role: WorkspaceRole,
    userId: string,
    accountId: string,
  ): Promise<boolean> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) return false
    const scope = portfolioScopeFor(role, await this.workspaceContext.portfolioVisibilityOf(workspaceId), userId)
    if (!scope) return true
    const teammate = (await activeTeammateAccountIds(this.accounts.manager, workspaceId, userId, [accountId])).has(
      accountId,
    )
    return isInPortfolio(scope, account, teammate)
  }

  /**
   * #4158.19 — l'e-mail INTERNE. Désactivé par défaut : sans ligne de
   * préférences, ou interrupteur faux ⇒ aucun appel au mailer. Jamais depuis
   * un espace de démonstration (visiteur anonyme), jamais vers une adresse
   * supprimée, et seulement au destinataire.
   */
  private async sendEmailIfOptedIn(delivery: EmailDelivery, actorName = ''): Promise<void> {
    if (!this.mailer) return
    try {
      const prefs = await this.prefs.findOne({ where: { user_id: delivery.recipientUserId } })
      if (prefs?.[delivery.emailPreference] !== true) return

      const demo = await this.accounts.manager.query<{ is_demo: boolean }[]>(
        `SELECT is_demo FROM workspaces WHERE id = $1 LIMIT 1`,
        [delivery.workspaceId],
      )
      if (demo[0]?.is_demo === true) return

      const recipient = await this.profiles.findOne({ where: { user_id: delivery.recipientUserId } })
      const email = recipient?.email?.trim()
      if (!email) return
      if (this.suppression && (await this.suppression.isSuppressedForUser(delivery.recipientUserId, email))) return

      const lang = prefs.email_language === 'en' ? 'en' : 'fr'
      await this.mailer.sendNotificationEmail({
        to: email,
        subject: delivery.emailSubject(actorName, lang),
        heading: delivery.emailSubject(actorName, lang),
        bodyLines: delivery.emailLines?.(lang) ?? [delivery.emailLine(actorName, lang)],
        ctaUrl: `${frontendBaseUrl()}${delivery.link}`,
        ctaLabel: lang === 'en' ? 'Open in BellumAI' : 'Ouvrir dans BellumAI',
      })
    } catch (error) {
      this.logger.warn('E-mail entre collègues non envoyé (la notification in-app reste)', {
        error: { name: error instanceof Error ? error.name : typeof error },
        tags: { feature: delivery.type },
      })
    }
  }

  private async displayNameOf(userId: string): Promise<string> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    return (profile && personDisplayName(profile)) || 'Un collègue'
  }

  private async guarded(feature: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      this.logger.warn('Notification entre collègues non créée (le geste reste effectif)', {
        error: { name: error instanceof Error ? error.name : typeof error },
        tags: { feature },
      })
    }
  }
}

/** `FRONTEND_URL` peut lister plusieurs origines pendant une migration de domaine : la première. */
function frontendBaseUrl(): string {
  const first = (process.env['FRONTEND_URL'] ?? 'http://localhost:3000').split(',')[0]?.trim()
  return (first || 'http://localhost:3000').replace(/\/+$/, '')
}
