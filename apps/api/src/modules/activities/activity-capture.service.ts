import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  isConfirmedAgendaEvent,
  type ActivitySyncResult,
  type ActivitySyncSource,
  type IngestActivityInput,
} from '@bellum/contracts'
import { ActivitySyncStateEntity } from '../../database/entities/activity-sync-state.entity'
import { AgendaService } from '../agenda/agenda.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { TelephonyService } from '../telephony/telephony.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActivitiesService } from './activities.service'
import {
  bareEmail,
  buildLinkIndex,
  displayNameOf,
  emailDomain,
  resolveActivityLink,
  resolveDirection,
  type LinkableAccount,
  type LinkableContact,
  type LinkIndex,
} from './activity-linking'
import { normalizeMailBody } from './mail-body'

/** Fenêtre par défaut d'une capture. Un mois de recul commercial. */
const DEFAULT_WINDOW_DAYS = 30
/** Borne par source. Au-delà, une capture devient un import et se planifie. */
const MAX_PER_SOURCE = 100
/** Combien de corps on va chercher au plus. Chaque corps est un appel réseau. */
const MAX_BODY_FETCHES = 60

/**
 * La CAPTURE — ce qui fait entrer le monde extérieur dans la timeline.
 *
 * Le principe qui gouverne tout le fichier : **une source qui tombe n'emporte
 * pas les autres**. Chaque source est lue dans son propre `try`, rend son
 * compte-rendu (`ingested` / `duplicates` / `skipped` / `unavailable`), et une
 * messagerie en panne ne doit jamais faire échouer la capture des appels.
 *
 * Le second principe est la sobriété du refus : une ligne qu'on n'a pas su
 * dater ou rattacher est ÉCARTÉE AVEC SA RAISON, jamais devinée. Une timeline
 * dans laquelle on a mis du « à peu près » ne se relit pas avant un rendez-vous.
 */
@Injectable()
export class ActivityCaptureService {
  private readonly logger = new Logger(ActivityCaptureService.name)

  constructor(
    private readonly activities: ActivitiesService,
    private readonly mailbox: MailboxService,
    private readonly agenda: AgendaService,
    private readonly telephony: TelephonyService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(ActivitySyncStateEntity)
    private readonly syncState: Repository<ActivitySyncStateEntity>,
  ) {}

  /**
   * Capture les trois sources connectées.
   *
   * En espace de démonstration : aucune capture. Le jeu de démonstration est
   * seedé, et une capture y écrirait par-dessus des lignes fictives soignées
   * avec la boîte vide d'un compte de démonstration.
   */
  async sync(userId: string, options: { windowDays?: number } = {}): Promise<ActivitySyncResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return {
        sources: [demoSkip('mailbox'), demoSkip('agenda'), demoSkip('telephony')],
        ingested: 0,
      }
    }

    const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS
    const index = await this.loadLinkIndex(workspaceId)
    const selfHandles = await this.selfHandles(userId, workspaceId)

    const sources = await Promise.all([
      this.captureMailbox(workspaceId, userId, windowDays, index, selfHandles),
      this.captureAgenda(workspaceId, userId, windowDays, index, selfHandles),
      this.captureTelephony(workspaceId, userId, windowDays, index),
    ])

    for (const source of sources) await this.recordState(workspaceId, userId, source)
    return { sources, ingested: sources.reduce((sum, source) => sum + source.ingested, 0) }
  }

  // ───────────────────────────────── messagerie ────────────────────────────

  private async captureMailbox(
    workspaceId: string,
    userId: string,
    windowDays: number,
    index: LinkIndex,
    selfHandles: Set<string>,
  ): Promise<ActivitySyncSource> {
    const skipped: ActivitySyncSource['skipped'] = []
    try {
      const window = await this.mailbox.listRecentMessages(userId, {
        windowDays,
        limit: MAX_PER_SOURCE,
      })
      // `null` et « zéro message » ne sont pas la même chose : sans cette
      // distinction, « aucune messagerie connectée » s'afficherait « ta boîte
      // est vide ».
      if (!window) {
        return unavailable('mailbox', 'Aucune messagerie connectée, ou lecture non autorisée', 'not_connected')
      }

      if (window.ownAddress) {
        const own = bareEmail(window.ownAddress)
        if (own) selfHandles.add(own)
      }

      const inputs: IngestActivityInput[] = []
      let bodiesFetched = 0

      for (const message of window.messages) {
        if (!message.date || Number.isNaN(Date.parse(message.date))) {
          skipped.push({ ref: message.id, reason: 'Message sans date exploitable' })
          continue
        }
        const handles = [message.from, ...message.to, ...message.cc]
        const link = resolveActivityLink(handles, index, selfHandles)
        if (!link.accountId && !link.contactId) {
          // Rattacher au flair produirait un historique que personne ne croit.
          skipped.push({ ref: message.id, reason: 'Aucun compte ni contact reconnu' })
          continue
        }

        let body: string | null = null
        let truncated = false
        if (bodiesFetched < MAX_BODY_FETCHES) {
          bodiesFetched += 1
          const fetched = await this.safeBody(userId, message.id)
          const normalized = normalizeMailBody({ plain: fetched?.plain, html: fetched?.html })
          body = normalized.text ?? message.snippet
          truncated = normalized.truncated
        } else {
          // Au-delà de la borne on garde l'extrait plutôt que rien : un objet et
          // trois lignes situent l'échange, et la ligne reste datée et rattachée.
          body = message.snippet
        }

        inputs.push({
          kind: 'email',
          source: 'mailbox',
          direction: resolveDirection(message.from, [...message.to, ...message.cc], selfHandles),
          subject: message.subject,
          body: truncated && body ? `${body}\n\n[…]` : body,
          occurredAt: new Date(message.date).toISOString(),
          durationSeconds: null,
          accountId: link.accountId,
          contactId: link.contactId,
          projectId: null,
          linkReason: link.reason,
          externalId: message.id,
          externalUrl: null,
          participants: handles.flatMap(handle => {
            const email = bareEmail(handle)
            if (!email) return []
            return [
              {
                handle: email,
                displayName: displayNameOf(handle),
                contactId: index.byEmail.get(email)?.id ?? null,
                isSelf: selfHandles.has(email),
              },
            ]
          }),
        })
      }

      const written = await this.activities.ingest(workspaceId, userId, inputs)
      return { source: 'mailbox', ...written, skipped, unavailable: null, reason: null }
    } catch (error) {
      return unavailable('mailbox', (error as Error).message)
    }
  }

  private async safeBody(userId: string, messageId: string) {
    try {
      return await this.mailbox.fetchBody(userId, messageId)
    } catch (error) {
      // Un corps illisible ne fait pas disparaître l'échange : la ligne part
      // avec son extrait, et c'est déjà l'essentiel de ce que la timeline sert.
      this.logger.warn(`Activity capture: body unavailable for ${messageId}: ${(error as Error).message}`)
      return null
    }
  }

  // ─────────────────────────────────── agenda ──────────────────────────────

  private async captureAgenda(
    workspaceId: string,
    userId: string,
    windowDays: number,
    index: LinkIndex,
    selfHandles: Set<string>,
  ): Promise<ActivitySyncSource> {
    const skipped: ActivitySyncSource['skipped'] = []
    try {
      const status = await this.agenda.status(userId)
      if (!status.connected || !status.capabilities.read) {
        return unavailable('agenda', 'Aucun agenda connecté, ou lecture non autorisée', 'not_connected')
      }

      const now = Date.now()
      const events = await this.agenda.listEvents(userId, {
        from: new Date(now - windowDays * 86_400_000).toISOString(),
        to: new Date(now).toISOString(),
        limit: MAX_PER_SOURCE,
      })

      const inputs: IngestActivityInput[] = []
      for (const event of events) {
        if (event.cancelled) {
          // Un rendez-vous annulé n'a pas eu lieu. L'écrire dans la timeline
          // ferait croire à une rencontre.
          skipped.push({ ref: event.id, reason: 'Rendez-vous annulé' })
          continue
        }
        if (!isConfirmedAgendaEvent(event.status)) {
          // Un rendez-vous PROPOSÉ (`tentative`) — ou un statut qu'on ne sait
          // pas lire — n'est pas un rendez-vous FIXÉ. Avant cette vérification,
          // n'importe quel évènement non annulé entrait dans la timeline comme
          // `meeting`, confondant une proposition avec un engagement pris —
          // exactement le compteur que la doctrine interdit de fausser
          // (« non mesuré n'est jamais confirmé »).
          skipped.push({ ref: event.id, reason: 'Rendez-vous proposé, pas encore confirmé' })
          continue
        }
        if (!event.start || Number.isNaN(Date.parse(event.start))) {
          skipped.push({ ref: event.id, reason: 'Rendez-vous sans date exploitable' })
          continue
        }
        const handles = [event.organizer, ...event.attendees.map(attendee => attendee.email)]
        const link = resolveActivityLink(handles, index, selfHandles)
        if (!link.accountId && !link.contactId) {
          skipped.push({ ref: event.id, reason: 'Aucun compte ni contact reconnu parmi les participants' })
          continue
        }

        const end = event.end ? Date.parse(event.end) : Number.NaN
        const start = Date.parse(event.start)
        inputs.push({
          kind: 'meeting',
          source: 'agenda',
          // Une réunion où personne n'est externe est INTERNE : la compter comme
          // une touche client ferait passer une équipe qui se réunit pour une
          // équipe qui prospecte.
          direction: event.isExternal ? 'outbound' : 'internal',
          subject: event.summary,
          body: event.description,
          occurredAt: new Date(start).toISOString(),
          durationSeconds: Number.isNaN(end) ? null : Math.max(0, Math.round((end - start) / 1000)),
          accountId: link.accountId,
          contactId: link.contactId,
          projectId: null,
          linkReason: link.reason,
          externalId: event.id,
          externalUrl: event.webUrl,
          participants: event.attendees.flatMap(attendee => {
            const email = bareEmail(attendee.email)
            if (!email) return []
            return [
              {
                handle: email,
                displayName: attendee.displayName,
                contactId: index.byEmail.get(email)?.id ?? null,
                isSelf: selfHandles.has(email),
              },
            ]
          }),
        })
      }

      const written = await this.activities.ingest(workspaceId, userId, inputs)
      return { source: 'agenda', ...written, skipped, unavailable: null, reason: null }
    } catch (error) {
      return unavailable('agenda', (error as Error).message)
    }
  }

  // ───────────────────────────────── téléphonie ────────────────────────────

  private async captureTelephony(
    workspaceId: string,
    userId: string,
    windowDays: number,
    index: LinkIndex,
  ): Promise<ActivitySyncSource> {
    const skipped: ActivitySyncSource['skipped'] = []
    try {
      const status = await this.telephony.status(userId)
      if (!status.connected) return unavailable('telephony', 'Aucun standard téléphonique connecté', 'not_connected')

      const calls = await this.telephony.listRecentCalls(userId, { days: windowDays, limit: MAX_PER_SOURCE })

      const inputs: IngestActivityInput[] = []
      for (const call of calls) {
        if (!call.startedAt || Number.isNaN(Date.parse(call.startedAt))) {
          skipped.push({ ref: call.id, reason: 'Appel sans date exploitable' })
          continue
        }
        const link = resolveActivityLink([call.counterpartEmail, call.counterpartNumber], index)
        if (!link.accountId && !link.contactId) {
          skipped.push({ ref: call.id, reason: 'Numéro inconnu du carnet' })
          continue
        }
        inputs.push({
          kind: 'call',
          source: 'telephony',
          // `unknown` chez le fournisseur devient `inbound` : le cas le plus
          // fréquent d'un journal d'appels, et le seul qui ne surestime pas
          // l'activité de prospection de l'équipe.
          direction: call.direction === 'outbound' ? 'outbound' : 'inbound',
          subject: call.counterpartName ?? call.counterpartNumber,
          // La transcription n'arrive que si l'espace l'a explicitement
          // autorisée — le service de téléphonie applique déjà cette règle.
          body: call.transcript,
          occurredAt: new Date(call.startedAt).toISOString(),
          durationSeconds: call.durationSeconds === null ? null : Math.max(0, Math.round(call.durationSeconds)),
          accountId: link.accountId,
          contactId: link.contactId,
          projectId: null,
          linkReason: link.reason,
          externalId: call.id,
          externalUrl: null,
          participants: call.counterpartNumber
            ? [
                {
                  handle: call.counterpartNumber,
                  displayName: call.counterpartName,
                  contactId: link.contactId,
                  isSelf: false,
                },
              ]
            : [],
        })
      }

      const written = await this.activities.ingest(workspaceId, userId, inputs)
      return { source: 'telephony', ...written, skipped, unavailable: null, reason: null }
    } catch (error) {
      return unavailable('telephony', (error as Error).message)
    }
  }

  // ─────────────────────────────────── socle ───────────────────────────────

  /**
   * Charge une fois l'index de rattachement de tout l'espace.
   *
   * Le reconstruire par message rendrait une capture de cent e-mails
   * quadratique ; le charger une fois le rend linéaire.
   */
  private async loadLinkIndex(workspaceId: string): Promise<LinkIndex> {
    const contacts = await this.syncState.manager.query<LinkableContact[]>(
      // #1473 — en INNER, les e-mails et appels d'un contact à qualifier ne se
      // rattachaient à RIEN : son historique restait vide alors que la trace
      // existait. Un contact sans compte a un fil d'activité comme les autres.
      `SELECT c.id, c.account_id AS "accountId", c.email, c.phone
         FROM contacts c
         LEFT JOIN accounts a ON a.id = c.account_id
        WHERE (a.workspace_id = $1 OR (c.account_id IS NULL AND c.workspace_id = $1))
          AND c.deleted_at IS NULL`,
      [workspaceId],
    )
    const accounts = await this.syncState.manager.query<{ id: string; website: string | null }[]>(
      `SELECT id, website FROM accounts WHERE workspace_id = $1`,
      [workspaceId],
    )
    const linkable: LinkableAccount[] = accounts.map(account => ({
      id: account.id,
      domain: hostOf(account.website),
    }))
    return buildLinkIndex(contacts, linkable)
  }

  /**
   * Les adresses de la maison : l'utilisateur, et le domaine de l'espace.
   *
   * Sans elles, un échange entre collègues se rattacherait au compte de sa
   * propre ESN — qui est parfois dans la base comme n'importe quel autre — et
   * la direction serait lue « sortant » à chaque message interne.
   */
  private async selfHandles(userId: string, workspaceId: string): Promise<Set<string>> {
    const handles = new Set<string>()
    try {
      const rows = await this.syncState.manager.query<{ email: string | null }[]>(
        `SELECT p.email
           FROM profiles p
           JOIN workspace_members m ON m.user_id = p.user_id
          WHERE m.workspace_id = $1`,
        [workspaceId],
      )
      for (const row of rows) {
        const email = bareEmail(row.email)
        if (email) handles.add(email)
      }
    } catch (error) {
      this.logger.warn(`Activity capture: workspace addresses unavailable: ${(error as Error).message}`)
    }
    try {
      const [own] = await this.syncState.manager.query<{ email: string | null }[]>(
        `SELECT email FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      )
      const email = bareEmail(own?.email)
      if (email) handles.add(email)
    } catch {
      // Le repli est la liste de l'espace ci-dessus ; elle contient déjà
      // l'utilisateur dans le cas normal.
    }
    return handles
  }

  /** Trace de la dernière capture, pour que l'écran sache quoi afficher. */
  private async recordState(workspaceId: string, userId: string, source: ActivitySyncSource): Promise<void> {
    const outcome = source.unavailable
      ? `Indisponible : ${source.unavailable}`
      : `${source.ingested} activité(s), ${source.duplicates} déjà connue(s), ${source.skipped.length} écartée(s)`
    try {
      await this.syncState.manager.query(
        `INSERT INTO activity_sync_state (workspace_id, user_id, source, last_synced_at, last_outcome, updated_at)
         VALUES ($1, $2, $3, now(), $4, now())
         ON CONFLICT (workspace_id, user_id, source)
         DO UPDATE SET last_synced_at = now(), last_outcome = EXCLUDED.last_outcome, updated_at = now()`,
        [workspaceId, userId, source.source, outcome],
      )
    } catch (error) {
      // Une trace ratée ne doit pas annuler une capture réussie : la métrique
      // vient APRÈS le geste, et n'a jamais le droit de le casser.
      this.logger.warn(`Activity sync state not recorded: ${(error as Error).message}`)
    }
  }
}

/**
 * #2126.6 — `reasonCode` par défaut à `'error'` : les trois appels non
 * annotés de ce fichier sont tous des blocs `catch`, donc une vraie panne. Les
 * trois branches « rien de branché » (mailbox/agenda/telephony ci-dessus)
 * passent `'not_connected'` explicitement.
 */
function unavailable(
  source: ActivitySyncSource['source'],
  reason: string,
  reasonCode: 'not_connected' | 'error' = 'error',
): ActivitySyncSource {
  return { source, ingested: 0, duplicates: 0, skipped: [], unavailable: reason, reason: reasonCode }
}

function demoSkip(source: ActivitySyncSource['source']): ActivitySyncSource {
  return {
    source,
    ingested: 0,
    duplicates: 0,
    skipped: [],
    // Ni `not_connected` (l'espace démo n'a rien à connecter) ni `error` (rien
    // n'a échoué) : `null` évite qu'un empty state démo propose « Connecter un
    // outil » à un espace qui n'en a pas besoin — de toute façon toujours
    // seedé (craft rule 9), `days.length` n'y est jamais nul.
    reason: null,
    unavailable: 'Espace de démonstration : les activités sont déjà en place',
  }
}

/**
 * L'hôte d'un site, sans `www.`. Rend `null` sur ce qui n'est pas une URL —
 * une valeur de champ libre (« nous n'avons pas de site ») ne doit pas devenir
 * un domaine de rattachement.
 */
function hostOf(website: string | null): string | null {
  if (!website) return null
  const trimmed = website.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return emailDomain(`x@${trimmed}`)
  }
}
