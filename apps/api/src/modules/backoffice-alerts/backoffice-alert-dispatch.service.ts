import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import IORedis from 'ioredis'
import { Resend } from 'resend'
import { killSwitchCut } from '../../common/kill-switches'
import { parseRedisUrl } from '../../config/redis-connection'
import {
  antiRepeatMsFor,
  decideAlertAction,
  mergeEmailRecipients,
  ownerEmailsFromDmAllowedEmails,
  renderAlert,
  resolveChannel,
  type AlertChannel,
  type AlertKind,
  type AlertPersistedState,
} from './backoffice-alert-dispatch'

const STATE_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 jours — largement au-delà de la fenêtre d'1 h, sans être éternel.
const REDIS_KEY_PREFIX = 'bellum:backoffice-alert:'

type DispatchResult = {
  action: 'send' | 'resolve' | 'skip'
  reason: string
  channel: AlertChannel | null
}

/**
 * #1676.1 — le CÔTÉ IO du dispatcheur : Redis pour la dé-duplication et le
 * suivi « qui est en défaut en ce moment » (pas un entier neuf en base — voir
 * le docblock du module), Resend pour l'e-mail (même transport que
 * `MailerService`, réimplémenté en direct : GA-07 est AU PLAFOND, cf.
 * `apps/api/src/architecture/module-boundaries.spec.ts` — 124/124 fichiers,
 * un import cross-module de plus dans un fichier neuf FAIT ÉCHOUER LA CI), et
 * un `fetch` brut pour Slack (un webhook entrant n'a pas besoin de SDK).
 *
 * ⚠️⚠️ LA RÈGLE LA PLUS FACILE À RATER DE L'ISSUE #1676 : « aucune alerte n'est
 * envoyée depuis un environnement non-production ». La coupure est ICI, à
 * l'ENVOI — jamais au calcul. `CostAlertService` filtre déjà `environment:
 * 'production'` sur les LIGNES DE COÛT qu'il agrège (Défaut B, n6) ; ça ne dit
 * rien de l'environnement du PROCESSUS qui tourne. Un run de staging peut
 * parfaitement produire un coût marqué `production` s'il tape une base
 * partagée — la question posée ici n'est pas « ce fait concerne-t-il la
 * prod ? » mais « CE PROCESSUS a-t-il le droit de déranger quelqu'un ? ».
 * `dispatch()` calcule et journalise TOUJOURS (donc reste testable en CI et en
 * staging), et n'envoie RÉELLEMENT rien tant que `NODE_ENV !== 'production'`.
 */
@Injectable()
export class BackofficeAlertDispatchService implements OnModuleDestroy {
  private readonly logger = new Logger(BackofficeAlertDispatchService.name)
  private readonly redis?: IORedis
  private resendClient: Resend | null = null

  constructor(private readonly config: ConfigService) {
    if (process.env['REDIS_URL']) {
      this.redis = new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: 3 })
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.redis?.quit()])
  }

  /** « Aucune alerte n'est envoyée depuis un environnement non-production. » */
  private isProduction(): boolean {
    return process.env['NODE_ENV'] === 'production'
  }

  private slackWebhookUrl(): string | undefined {
    return process.env['BACKOFFICE_ALERTS_SLACK_WEBHOOK_URL']?.trim() || undefined
  }

  /** `BACKOFFICE_ALERT_EMAILS` — voir `agent_docs/env-reference.md`. Sans elle :
   *  no-op strict sur le canal e-mail (le calcul et la dé-duplication tournent
   *  quand même, ce qui reste vérifiable en recette). */
  private emailRecipients(kind: AlertKind): string[] {
    const base = (process.env['BACKOFFICE_ALERT_EMAILS'] ?? '')
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'))
    // #2528.3 — décision Louis 17/09 : SEULE `provider_credits_exhausted`
    // ajoute les porteurs du rôle `owner` (lus dans `DM_ALLOWED_EMAILS`) — les
    // sept autres alertes restent byte-identiques, cette liste n'a jamais été
    // leur destinataire et ne le devient pas par accident.
    if (kind !== 'provider_credits_exhausted') return base
    return mergeEmailRecipients(base, ownerEmailsFromDmAllowedEmails(process.env['DM_ALLOWED_EMAILS']))
  }

  private stateKey(kind: AlertKind, subject: string): string {
    return `${REDIS_KEY_PREFIX}state:${kind}:${subject}`
  }

  private firingSetKey(kind: AlertKind): string {
    return `${REDIS_KEY_PREFIX}firing:${kind}`
  }

  private async readState(kind: AlertKind, subject: string): Promise<AlertPersistedState | null> {
    if (!this.redis) return null
    const raw = await this.redis.get(this.stateKey(kind, subject))
    if (!raw) return null
    try {
      return JSON.parse(raw) as AlertPersistedState
    } catch {
      return null
    }
  }

  private async writeState(kind: AlertKind, subject: string, state: AlertPersistedState): Promise<void> {
    if (!this.redis) return
    await this.redis.set(this.stateKey(kind, subject), JSON.stringify(state), 'EX', STATE_TTL_SECONDS)
    if (state.state === 'firing') {
      await this.redis.sadd(this.firingSetKey(kind), subject)
    } else {
      await this.redis.srem(this.firingSetKey(kind), subject)
    }
  }

  /**
   * Les sujets actuellement EN DÉFAUT pour ce type d'alerte — ce dont un
   * appelant a besoin pour détecter une RÉSOLUTION sur un sujet qui a
   * disparu de la mesure courante (ex. l'anomalie de connexion d'un acteur
   * qui n'apparaît plus dans la fenêtre observée).
   */
  async listFiringSubjects(kind: AlertKind): Promise<string[]> {
    if (!this.redis) return []
    return this.redis.smembers(this.firingSetKey(kind))
  }

  /**
   * Le point d'entrée unique. Calcule TOUJOURS (dé-duplication comprise, donc
   * observable en recette même hors production) ; n'envoie RÉELLEMENT que
   * lorsque TOUTES ces conditions tiennent : l'interrupteur n'est pas coupé,
   * le processus tourne en production, et la décision est `send` ou
   * `resolve` (pas `skip`).
   */
  async dispatch(input: {
    kind: AlertKind
    subject: string
    title: string
    detail: string
    resolved: boolean
  }): Promise<DispatchResult> {
    const now = new Date()
    const existing = await this.readState(input.kind, input.subject)
    // #1946.22 — la fenêtre de l'alerte : l'heure commune, ou la semaine d'« espace à risque ».
    const decision = decideAlertAction({
      existing,
      resolved: input.resolved,
      now,
      antiRepeatMs: antiRepeatMsFor(input.kind),
    })

    if (decision.action === 'skip') {
      return { action: 'skip', reason: decision.reason, channel: null }
    }

    const nextState: AlertPersistedState = {
      state: decision.action === 'resolve' ? 'resolved' : 'firing',
      lastSentAt: now.toISOString(),
    }

    // #1676 — « aucune alerte n'est envoyée depuis un environnement
    // non-production ». La coupure est ICI : l'état se met bien à jour (un
    // redéploiement ultérieur en production ne redécouvre pas une alerte
    // périmée comme "neuve"), mais rien ne PART.
    if (killSwitchCut('backoffice.alerts_dispatch')) {
      this.logger.log(`Alerte back-office ${input.kind}/${input.subject} calculée mais coupée (interrupteur)`)
      await this.writeState(input.kind, input.subject, nextState)
      return { action: decision.action, reason: 'kill_switch_cut', channel: null }
    }
    if (!this.isProduction()) {
      this.logger.log(
        `Alerte back-office ${input.kind}/${input.subject} calculée mais NON envoyée — environnement non-production (NODE_ENV=${process.env['NODE_ENV'] ?? 'absent'})`,
      )
      await this.writeState(input.kind, input.subject, nextState)
      return { action: decision.action, reason: 'non_production', channel: null }
    }

    const slackConfigured = Boolean(this.slackWebhookUrl())
    const channel = resolveChannel(input.kind, slackConfigured)
    const rendered = renderAlert({
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      resolved: decision.action === 'resolve',
    })

    if (channel === 'slack') {
      await this.sendSlack(input.kind, rendered.text)
    } else {
      await this.sendEmail(input.kind, rendered.subject, rendered.text, rendered.html)
    }

    await this.writeState(input.kind, input.subject, nextState)
    return { action: decision.action, reason: decision.reason, channel }
  }

  private async sendSlack(kind: AlertKind, text: string): Promise<void> {
    const webhook = this.slackWebhookUrl()
    if (!webhook) {
      // Filet de sécurité : `resolveChannel` ne rend jamais 'slack' sans
      // webhook configuré, mais un appel direct à cette méthode ne doit
      // jamais perdre l'alerte pour autant.
      await this.sendEmail(kind, 'BellumAI — alerte (Slack non configuré)', text, `<pre>${text}</pre>`)
      return
    }
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`Slack webhook a répondu ${res.status}`)
      this.logger.log('Alerte back-office envoyée sur Slack')
    } catch (error) {
      // « Jamais de perte » : un webhook qui échoue retombe sur l'e-mail.
      this.logger.error('Envoi Slack en échec — repli sur e-mail', { error })
      await this.sendEmail(kind, 'BellumAI — alerte (Slack indisponible)', text, `<pre>${text}</pre>`)
    }
  }

  private async sendEmail(kind: AlertKind, subject: string, text: string, html: string): Promise<void> {
    const recipients = this.emailRecipients(kind)
    if (recipients.length === 0) {
      this.logger.warn('BACKOFFICE_ALERT_EMAILS absente — alerte calculée, aucun destinataire (no-op strict)')
      return
    }
    const apiKey = this.config.get<string>('resendApiKey')
    const from = this.config.get<string>('resendFrom')
    if (!apiKey || !from) {
      this.logger.warn('RESEND_API_KEY/RESEND_FROM absents — alerte calculée, aucun e-mail envoyé (no-op strict)')
      return
    }
    const resend = this.getResendClient(apiKey)
    for (const to of recipients) {
      try {
        const { error } = await resend.emails.send({ from, to: [to], subject, text, html })
        if (error) throw new Error(error.message)
        this.logger.log(`Alerte back-office envoyée par e-mail à ${to}`)
      } catch (error) {
        this.logger.error(`Envoi d'alerte par e-mail en échec vers ${to}`, { error })
      }
    }
  }

  private getResendClient(apiKey: string): Resend {
    if (!this.resendClient) this.resendClient = new Resend(apiKey)
    return this.resendClient
  }
}
