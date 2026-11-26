import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { MissionStatus, NotificationType } from '@bellum/contracts'
import { mailboxToolName } from '@bellum/contracts'
import { killSwitchCut } from '../../common/kill-switches'
import { Correlated } from '../../correlation-id/background-correlation'
import { AccountEntity } from '../../database/entities/account.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { NotificationsService } from './notifications.service'

/**
 * LES TROIS ANNONCES D'ENGAGEMENT — #2082.4 / .5 / .6.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉMETTEUR D'ABORD, LA PRÉFÉRENCE ENSUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois types demandés — « Rendez-vous à préparer », « Fin de mission »,
 * « Réponse client » — n'avaient AUCUN émetteur : le balayage du 16/09/2026 a
 * retrouvé les appelants de `NotificationsService`, et aucun ne venait de
 * l'agenda ni du suivi de mission. Poser l'interrupteur seul aurait promis un
 * envoi qui ne serait jamais arrivé — la dette que `notifications.ts` nomme
 * déjà pour `changelog` (type déclaré, zéro producteur). Ce fichier est la
 * moitié qui manquait ; la préférence n'existe que parce qu'il existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CE QUE « RÉPONSE CLIENT » ANNONCE, ET CE QU'ELLE N'ANNONCE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle annonce QU'UNE RÉPONSE EST ARRIVÉE, et l'endroit où la lire. Jamais son
 * contenu, jamais son objet, jamais son expéditeur. D65 : le corps d'un message
 * ne sort pas vers un humain qui n'y a pas droit — et une notification est
 * visible plus largement qu'un écran authentifié (aperçu, liste, demain une
 * notification système sur un téléphone verrouillé). Le corps EST stocké dans
 * le journal d'activité depuis l'arbitrage du 16/08 : STOCKER et EXPOSER sont
 * deux décisions distinctes, et la seconde reste refusée.
 *
 * C'est pourquoi rien, ici, ne lit un corps : le port de messagerie ne rend que
 * des MÉTADONNÉES, et seul leur NOMBRE traverse jusqu'au texte affiché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI BORNE CE BALAYAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · un INTERRUPTEUR d'opérateur (`notifications.engagement`), consulté avant
 *    toute lecture ;
 *  · la PRÉFÉRENCE de la personne, type par type — un seul des trois coché ne
 *    fait lire que sa source ;
 *  · un VERROU de tick (une seule réplique par passage) ;
 *  · un ANTI-DOUBLON de 20 h par type et par personne — la même marge que le
 *    digest d'actions en retard, pour absorber la gigue du cron ;
 *  · une SOURCE MUETTE ne produit rien : un agenda non branché, une messagerie
 *    absente ou une lecture en échec ne fabriquent pas une notification « 0 ».
 *
 * ⚠️ GA-07 — l'agenda et la messagerie arrivent par des PORTS duck-typés,
 * câblés dans `notifications.module.ts` : ce fichier n'importe aucun service
 * d'un autre module. Les missions, elles, se lisent par leur REPOSITORY, ce que
 * le cliquet ne compte pas non plus.
 */

/** L'agenda, vu d'ici : une fenêtre, des évènements. Rien d'autre. */
type EngagementAgendaPort = {
  listEvents(userId: string, request: { from: string; to: string; limit?: number }): Promise<readonly unknown[]>
}

/**
 * La messagerie, vue d'ici — et ce que ce type REFUSE de porter.
 *
 * `messages` est volontairement une liste d'objets aux seules métadonnées
 * utiles au tri (qui a écrit, quand). Aucun `body`, aucun `snippet`, aucun
 * `subject` : un champ qu'on ne reçoit pas ne peut pas fuiter dans un titre.
 */
type EngagementMailboxPort = {
  listRecentMessages(
    userId: string,
    options: { windowDays: number; limit: number },
  ): Promise<{
    // #2404.7 — la messagerie BRANCHÉE, pour nommer la SOURCE de l'annonce
    // (`mailboxToolName`). Optionnel : un port qui ne le rend pas (test,
    // implémentation ancienne) laisse simplement la source `null`.
    provider?: string | null
    messages: readonly { from?: string | null; date?: string | null }[]
    ownAddress: string | null
  } | null>
}

export const ENGAGEMENT_AGENDA_PORT = Symbol('ENGAGEMENT_AGENDA_PORT')
export const ENGAGEMENT_MAILBOX_PORT = Symbol('ENGAGEMENT_MAILBOX_PORT')
/** Le verrou de tick, en PORT — même patron que `OPS_WEEKLY_REPORT_LOCK`. */
export const ENGAGEMENT_ALERTS_LOCK = 'ENGAGEMENT_ALERTS_LOCK'
type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** « Au plus une par jour et par type », avec la marge de gigue du cron. */
const DEDUP_WINDOW_MS = 20 * HOUR_MS
/** Le rendez-vous se prépare la veille, ou pas du tout. */
const MEETING_HORIZON_MS = 36 * HOUR_MS
/** Une fin de mission se joue AVANT la fin : la fenêtre imminente du contrat. */
const MISSION_HORIZON_DAYS = 30
/** La fenêtre de lecture de la messagerie — un jour, comme la cadence. */
const REPLY_WINDOW_DAYS = 1
const REPLY_LIMIT = 50
/**
 * Les statuts d'une mission qui COURT ENCORE — lus de `missionStatusSchema`,
 * jamais devinés.
 *
 * `ended` et `terminated` sont déjà finies : les annoncer serait annoncer le
 * passé. `renewed` a déjà trouvé sa suite. Restent les trois qui peuvent encore
 * se renouveler — dont `paused`, dont la reprise est attendue et dont la date de
 * fin court toujours.
 *
 * ⚠️ Cette liste est comparée à des valeurs que le produit PRODUIT vraiment.
 * Un prédicat écrit sur un vocabulaire imaginaire est toujours faux en
 * production, et ses fixtures de test l'inventent — c'est un défaut que ce
 * dépôt a déjà payé.
 */
const LIVE_MISSION_STATUSES: readonly MissionStatus[] = ['onboarding', 'active', 'paused']

/** Le jour calendaire d'une date `YYYY-MM-DD`, comparé sans fuseau. */
function withinDays(endsOn: string | null | undefined, now: Date, days: number): boolean {
  if (typeof endsOn !== 'string' || endsOn.trim() === '') return false
  const at = Date.parse(endsOn)
  if (Number.isNaN(at)) return false
  return at >= now.getTime() && at <= now.getTime() + days * DAY_MS
}

@Injectable()
export class EngagementAlertsService {
  private readonly logger = new Logger(EngagementAlertsService.name)

  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(ENGAGEMENT_AGENDA_PORT) private readonly agenda?: EngagementAgendaPort,
    @Optional() @Inject(ENGAGEMENT_MAILBOX_PORT) private readonly mailbox?: EngagementMailboxPort,
    // Sans verrou câblé, le balayage tourne tel quel : c'est le comportement
    // mono-instance, et c'est ce qui permet de le construire à la main en test.
    @Optional() @Inject(ENGAGEMENT_ALERTS_LOCK) private readonly underLock?: UnderSingletonLock,
  ) {}

  @Cron('40 7 * * *', { name: 'engagement-alerts', timeZone: 'Europe/Paris' })
  @Correlated('engagement-alerts')
  async run(now: Date = new Date()): Promise<void> {
    // L'interrupteur d'opérateur, AVANT toute lecture : couper une capacité ne
    // doit pas laisser tourner ses requêtes.
    if (killSwitchCut('notifications.engagement')) return
    const sweep = async (): Promise<void> => {
      const rows = await this.prefs.find({
        where: [{ meeting_prep: true }, { mission_end: true }, { client_reply: true }],
      })
      let sent = 0
      for (const row of rows) {
        const userId = row?.user_id
        if (!userId) continue
        if (row.meeting_prep) sent += (await this.emitMeetingPrep(userId, now)) ? 1 : 0
        if (row.mission_end) sent += (await this.emitMissionEnd(userId, now)) ? 1 : 0
        if (row.client_reply) sent += (await this.emitClientReply(userId)) ? 1 : 0
      }
      this.logger.log(`Engagement alerts: ${sent} notification(s) for ${rows.length} opted-in user(s)`)
    }
    // Le verrou de tick, appelé par son JETON : à N répliques, les ticks
    // courent dans la fenêtre lire-puis-écrire et doubleraient les annonces.
    // Sans verrou câblé (specs qui construisent le service à la main), le
    // balayage tourne tel quel — c'est le comportement mono-instance.
    if (this.underLock) await this.underLock('engagement-alerts', sweep)
    else await sweep()
  }

  /** #2082.4 — les rendez-vous qui arrivent, et qui se préparent la veille. */
  async emitMeetingPrep(userId: string, now: Date): Promise<boolean> {
    if (!this.agenda) return false
    if (await this.alreadySent(userId, 'meeting_prep')) return false
    let count = 0
    try {
      const events = await this.agenda.listEvents(userId, {
        from: now.toISOString(),
        to: new Date(now.getTime() + MEETING_HORIZON_MS).toISOString(),
        limit: 50,
      })
      count = events.length
    } catch (error) {
      // Agenda non branché, ou source muette. Les deux se disent pareil : on ne
      // sait pas, donc on n'annonce rien. Surtout pas « 0 rendez-vous ».
      this.logger.debug?.('Engagement alerts: agenda illisible, aucune annonce', { error })
      return false
    }
    if (count === 0) return false
    await this.notifications.createNotification(userId, {
      type: 'meeting_prep',
      title: count > 1 ? `${count} rendez-vous à préparer` : 'Un rendez-vous à préparer',
      body:
        count > 1
          ? `${count} rendez-vous sont posés dans les 36 prochaines heures. Les préparer se fait maintenant.`
          : 'Un rendez-vous est posé dans les 36 prochaines heures. Le préparer se fait maintenant.',
      link: '/briefing', // #4359 — /agenda n'est plus une route
    })
    return true
  }

  /** #2082.5 — une mission qui se termine, annoncée AVANT qu'elle se termine. */
  async emitMissionEnd(userId: string, now: Date): Promise<boolean> {
    if (await this.alreadySent(userId, 'mission_end')) return false
    try {
      const workspaces = await this.workspacesOf(userId)
      if (workspaces.length === 0) return false
      const rows = await this.missions.find({
        where: { workspace_id: In(workspaces), status: In([...LIVE_MISSION_STATUSES]) },
        select: ['id', 'ends_on', 'status'],
      })
      const ending = rows.filter(row => withinDays(row?.ends_on, now, MISSION_HORIZON_DAYS)).length
      if (ending === 0) return false
      await this.notifications.createNotification(userId, {
        type: 'mission_end',
        title: ending > 1 ? `${ending} missions arrivent à leur terme` : 'Une mission arrive à son terme',
        body:
          ending > 1
            ? `${ending} missions se terminent dans les ${MISSION_HORIZON_DAYS} jours. Un renouvellement se joue avant la fin, pas après.`
            : `Une mission se termine dans les ${MISSION_HORIZON_DAYS} jours. Un renouvellement se joue avant la fin, pas après.`,
        link: '/missions',
      })
      return true
    } catch (error) {
      this.logger.warn('Engagement alerts: lecture des missions en échec, aucune annonce', { error })
      return false
    }
  }

  /**
   * #2082.6 — une réponse est ARRIVÉE. Le fait, et rien d'autre.
   *
   * 🔴 Ce qui traverse jusqu'au texte est un NOMBRE. Pas un expéditeur, pas un
   * objet, pas un extrait : D65 tient ici par l'absence de code qui pourrait
   * les lire, pas par une convention de rédaction.
   */
  async emitClientReply(userId: string): Promise<boolean> {
    if (!this.mailbox) return false
    if (await this.alreadySent(userId, 'client_reply')) return false
    let count = 0
    // #2404.7 — D'OÙ vient l'information : la messagerie CONNECTÉE elle-même
    // (Gmail/Outlook), ce que l'espace a BRANCHÉ — jamais un de nos
    // fournisseurs. `null` tant que le port ne rend pas de `provider`, jamais
    // deviné (GA-18/GA-19).
    let source: string | null = null
    try {
      const recent = await this.mailbox.listRecentMessages(userId, {
        windowDays: REPLY_WINDOW_DAYS,
        limit: REPLY_LIMIT,
      })
      if (!recent) return false
      const own = (recent.ownAddress ?? '').trim().toLowerCase()
      // Une réponse est ce qui ARRIVE : ce que la personne a elle-même envoyé
      // n'en est pas une. Sans adresse connue, on ne devine pas — on se tait.
      if (own === '') return false
      count = recent.messages.filter(message => (message?.from ?? '').trim().toLowerCase() !== own).length
      source = mailboxToolName(recent.provider ?? null)
    } catch (error) {
      this.logger.debug?.('Engagement alerts: messagerie illisible, aucune annonce', { error })
      return false
    }
    if (count === 0) return false
    await this.notifications.createNotification(userId, {
      type: 'client_reply',
      title: count > 1 ? `${count} réponses sont arrivées` : 'Une réponse est arrivée',
      source,
      body:
        count > 1
          ? `${count} réponses sont arrivées dans ta messagerie depuis hier. Elles se lisent dans ta boîte, pas ici.`
          : 'Une réponse est arrivée dans ta messagerie depuis hier. Elle se lit dans ta boîte, pas ici.',
      link: '/inbox',
    })
    return true
  }

  /** Les espaces de cette personne — la portée de ses missions. */
  private async workspacesOf(userId: string): Promise<string[]> {
    const rows = await this.accounts.find({ where: { user_id: userId }, select: ['workspace_id'] })
    const ids = new Set<string>()
    for (const row of rows) {
      const id = row?.workspace_id
      if (typeof id === 'string' && id !== '') ids.add(id)
    }
    return [...ids]
  }

  private async alreadySent(userId: string, type: NotificationType): Promise<boolean> {
    try {
      return (await this.notifications.countSince(userId, type, new Date(Date.now() - DEDUP_WINDOW_MS))) > 0
    } catch (error) {
      // En échec de lecture, on se TAIT. Une notification doublée est du bruit
      // quotidien sur un outil ouvert huit heures par jour ; une notification
      // manquée se rattrape au passage suivant.
      this.logger.warn('Engagement alerts: anti-doublon illisible, annonce reportée', { error })
      return true
    }
  }
}
