import { MailTransportRejectedError } from './mail-transport-rejected.error'
import {
  renderOtpEmail,
  renderResetPasswordEmail,
  renderWeeklyDigestEmail,
  renderWelcomeEmail,
  type WeeklyDigestEmailProps,
} from '@bellum/email'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

type SendTestMailInput = {
  to: string
  subject?: string
}

type MailPayload = {
  to: string
  subject: string
  text: string
  html: string
  // Reply-To so a prospect's answer to an outreach email lands in the rep's
  // own inbox rather than the no-reply sending address. Optional — transactional
  // mail (OTP/welcome/reset) omits it.
  replyTo?: string
  // Extra SMTP headers (e.g. List-Unsubscribe / List-Unsubscribe-Post for
  // one-click opt-out on outreach). Optional.
  headers?: Record<string, string>
  // #3699.6 — les pièces jointes RÉELLES d'un envoi individuel (octets en
  // base64). Absentes = le chemin d'avant, byte-identique.
  attachments?: readonly OutgoingMailAttachment[]
}

/**
 * #3699.6 — une pièce jointe sortante : nom, type RANGÉ (jamais celui que le
 * client affirme), octets en base64. Les octets ne sont jamais journalisés.
 */
type OutgoingMailAttachment = { fileName: string; contentType: string; contentBase64: string }

type TransportMode = 'mailpit' | 'resend'

/**
 * Pick the mail transport from config. Pure so it can be unit-tested.
 *
 * An explicit `EMAIL_PROVIDER` always wins. When it is unset, production sends
 * for real through Resend and every other env (dev / test / preview) captures
 * mail in Mailpit. `EMAIL_PROVIDER` deliberately has NO schema default — a
 * default of `'mailpit'` would make this production auto-switch unreachable and
 * silently route prod OTP/welcome/reset mail to `localhost:8025`.
 */
export function resolveEmailTransportMode(
  emailProvider: string | undefined,
  nodeEnv: string | undefined,
): TransportMode {
  if (emailProvider === 'mailpit' || emailProvider === 'resend') {
    return emailProvider
  }
  return nodeEnv === 'production' ? 'resend' : 'mailpit'
}

/**
 * L'EXPÉDITEUR PAR ESPACE — marque blanche, 01/09/2026.
 *
 * `RESEND_FROM` était une valeur UNIQUE d'environnement : tout ce que le
 * produit envoyait partait de notre adresse, y compris l'invitation qu'un
 * client adresse à SON partenaire. `brand_email_from` (colonne posée le
 * 01/09) est ce que l'espace a déclaré ; il voyage jusqu'ici par cette clé.
 *
 * ⚠️ **Le repli reste l'adresse d'environnement, et c'est un choix de
 * DÉLIVRABILITÉ, pas une commodité.** Un espace peut écrire une adresse dont
 * le domaine n'est pas authentifié chez lui (SPF, DKIM) : le message partirait
 * en indésirable. La nôtre l'est. Un `brand_email_from` vide vaut donc mieux
 * qu'un message qui n'arrive pas — et l'écran de réglage le dit.
 */
type MailTransport = {
  name: TransportMode
  /** L'identifiant rendu par le fournisseur, quand il en donne un — c'est ce
   *  qui permet de retrouver le message chez lui et de lire son sort. */
  send: (payload: MailPayload, from: string) => Promise<string | undefined>
}

type ResendEmailClient = {
  emails: {
    send: (payload: {
      from: string
      to: string[]
      subject: string
      text: string
      html: string
      reply_to?: string
      headers?: Record<string, string>
      attachments?: { filename: string; content: Buffer; contentType: string }[]
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>
  }
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name)
  private resendClient: ResendEmailClient | null = null

  constructor(private readonly configService: ConfigService) {}

  async sendTestMail(input: SendTestMailInput) {
    await this.sendMail({
      to: input.to,
      subject: input.subject ?? 'Bellum test email (local)',
      text: 'Email de test local envoyé via Mailpit.',
      html: '<p>Email de test local envoyé via <strong>Mailpit</strong>.</p>',
    })

    return { messageId: crypto.randomUUID() }
  }

  async sendWelcomeEmail(input: { to: string; firstName: string; dashboardUrl: string }) {
    const content = await renderWelcomeEmail(input)
    await this.sendMail({ to: input.to, ...content })
  }

  async sendOtpEmail(input: { to: string; firstName: string; otpCode: string; expirationMinutes: number }) {
    const content = await renderOtpEmail(input)
    await this.sendMail({ to: input.to, ...content })
  }

  async sendResetPasswordEmail(input: { to: string; firstName: string; resetUrl: string }) {
    const content = await renderResetPasswordEmail(input)
    await this.sendMail({ to: input.to, ...content })
  }

  /**
   * Email digest hebdo de veille (D3) — the week's signals of the rep's
   * followed accounts, grouped by account. Rendered through the shared
   * `@bellum/email` template; the subject carries the real counts. When
   * `unsubscribeUrl` is the signed one-click route, `oneClickUnsubscribe`
   * also sets the RFC 8058 `List-Unsubscribe` headers (never set for the
   * plain settings-page fallback, which cannot honour a one-click POST).
   */
  async sendWeeklyDigestEmail(
    input: { to: string; oneClickUnsubscribe?: boolean; from?: string | null } & WeeklyDigestEmailProps,
  ) {
    const { to, oneClickUnsubscribe, from, ...props } = input
    const content = await renderWeeklyDigestEmail(props)
    const headers =
      props.unsubscribeUrl && oneClickUnsubscribe
        ? {
            'List-Unsubscribe': `<${props.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined
    await this.sendMail({ to, ...content, headers }, from)
  }

  /**
   * Generic transactional notification email (used by the weekly-summary
   * scheduler). Kept as a lightweight inline template — no React Email render —
   * so the mailer has no dependency on a per-notification template. `bodyLines`
   * are HTML-escaped before interpolation.
   */
  async sendNotificationEmail(input: {
    to: string
    subject: string
    heading: string
    bodyLines: string[]
    ctaUrl?: string
    ctaLabel?: string
    /** L'expéditeur de l'espace (`brand_email_from`), quand l'appelant le connaît. */
    from?: string | null
  }) {
    const { text, html } = renderNotificationEmail(input)
    await this.sendMail({ to: input.to, subject: input.subject, text, html }, input.from)
  }

  /**
   * Newsletter Changelog — the twice-a-month recap of what shipped, in the
   * reader's own language. `entries` are already the DELTA the reader has not
   * been told about (the service computes it); this method only renders and
   * sends. Like the veille digest, `unsubscribeUrl` + `oneClickUnsubscribe` set
   * the RFC 8058 one-click headers when the signed route is available.
   */
  async sendChangelogNewsletterEmail(input: ChangelogNewsletterEmailInput) {
    const { subject, text, html } = renderChangelogNewsletterEmail(input)
    const headers =
      input.unsubscribeUrl && input.oneClickUnsubscribe
        ? {
            'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined
    await this.sendMail({ to: input.to, subject, text, html, headers })
  }

  /**
   * Outreach email — sends a rep's drafted message (`contact.email_message`) to
   * a prospect (Palier 1 « Envoie l'email »). `body` is the plain-text draft;
   * the HTML part is a minimal escaped/`nl2br` wrapper. `replyTo` routes answers
   * to the rep. Sent inline (not queued) so the HTTP caller sees success/failure.
   *
   * `unsubscribeUrl` (when provided) appends an opt-out footer and sets the
   * `List-Unsubscribe` + `List-Unsubscribe-Post` headers (RFC 8058 one-click) —
   * the RGPD/deliverability guardrail. The caller checks the suppression list
   * BEFORE calling this.
   */
  /**
   * #2733 — rend l'identifiant fournisseur (`providerId`, ex. `re_…` sur
   * Resend) plutôt que de le jeter après l'avoir loggé. C'est la SEULE clé
   * qui relie un événement `email.bounced` du webhook à l'envoi précis : sans
   * elle, un rebond arrive sans savoir à quel contact/quel envoi il répond.
   * `undefined` sur Mailpit (transport de dev, rien à suivre côté
   * fournisseur) — l'appelant décide quoi en faire.
   */
  async sendOutreachEmail(input: {
    to: string
    subject: string
    body: string
    replyTo?: string
    unsubscribeUrl?: string
    /** L'expéditeur de l'espace (`brand_email_from`), quand l'appelant le connaît. */
    from?: string | null
    /** #3699.6 — les pièces que le commercial a choisies, déjà validées par l'appelant. */
    attachments?: readonly OutgoingMailAttachment[]
  }): Promise<{ providerId: string | undefined }> {
    const { html, text } = renderOutreachEmail(input.body, input.unsubscribeUrl)
    const headers = input.unsubscribeUrl
      ? {
          'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : undefined
    const providerId = await this.sendMail(
      {
        to: input.to,
        subject: input.subject,
        text,
        html,
        replyTo: input.replyTo,
        headers,
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      },
      input.from,
    )
    return { providerId }
  }

  /**
   * L'e-mail d'activation du propriétaire, ou sa relance J+2/J+5 — #2643.1.
   *
   * ⚠️ LE BRANCHEMENT, PAS LA PORTE. Cette méthode envoie DÈS QU'ON L'APPELLE :
   * la porte (« pas d'envoi silencieux », #1665 règle 2, décision Louis
   * 20/09/2026) vit dans `OwnerActivationService.send`, seul appelant de cette
   * méthode dans tout le dépôt, lui-même déclenché uniquement par un clic
   * opérateur. `manual-provisioning.service.spec.ts` prouve qu'aucun autre
   * chemin n'y mène.
   */
  async sendOwnerInvitationEmail(input: { to: string; subject: string; body: string }) {
    const { html, text } = plainTextToHtml(input.body)
    await this.sendMail({ to: input.to, subject: input.subject, text, html })
  }

  /**
   * L'adresse d'expédition RÉELLEMENT utilisée : celle de l'espace quand il en
   * a déclaré une, sinon celle de l'environnement du transport actif. Source
   * unique de `sendMail` ET de ce que l'écran affiche avant l'envoi (#3699.1) —
   * « expéditeur affiché = expéditeur utilisé ».
   */
  resolveSenderAddress(workspaceFrom?: string | null): string {
    const transport = this.resolveTransportMode()
    const configured =
      transport === 'resend'
        ? this.configService.getOrThrow<string>('resendFrom')
        : this.configService.getOrThrow<string>('smtpFrom')
    return workspaceFrom?.trim() || configured
  }

  private async sendMail(payload: MailPayload, workspaceFrom?: string | null): Promise<string | undefined> {
    const transport = this.resolveTransport()
    const from = this.resolveSenderAddress(workspaceFrom)

    const providerId = await transport.send(payload, from)
    // L'IDENTIFIANT rendu par le fournisseur, journalisé avec l'envoi ET
    // RENDU À L'APPELANT (#2733) — avant ce lot il était jeté ici même.
    //
    // Sans lui, « Email sent to … through resend » ne prouve qu'une chose :
    // que Resend a ACCEPTÉ le message. Il ne dit pas s'il a été remis, rejeté
    // ou mis en quarantaine — et il n'y a aucun moyen de retrouver ce message
    // précis dans le tableau de bord du fournisseur. C'est exactement le mur
    // rencontré le 20/08 sur un lien de réinitialisation qui n'arrivait jamais :
    // tous les journaux disaient « envoyé », et la suite était invisible.
    this.logger.log(`Email sent to ${payload.to} through ${transport.name}${providerId ? ` (id ${providerId})` : ''}`)
    return providerId
  }

  private resolveTransport(): MailTransport {
    const mode = this.resolveTransportMode()

    if (mode === 'resend') {
      const resend = this.getResendClient()

      return {
        name: 'resend',
        send: async (payload, from) => {
          const { data, error } = await resend.emails.send({
            /*
             * ⚠️ `from` — l'ARGUMENT, pas la configuration.
             *
             * Cette ligne relisait `resendFrom` et jetait le paramètre qu'elle
             * recevait déjà : un « paramètre déclaré jamais passé », le défaut
             * qui rend une fonctionnalité invisible parce que le code a l'air
             * juste. Brancher l'expéditeur par espace sans corriger ça aurait
             * donné un réglage qui s'enregistre, s'affiche, et ne fait rien.
             */
            from,
            to: [payload.to],
            subject: payload.subject,
            text: payload.text,
            html: payload.html,
            ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
            ...(payload.headers ? { headers: payload.headers } : {}),
            // #3699.6 — les octets réels, décodés : le fournisseur les ré-encode.
            ...(payload.attachments?.length
              ? {
                  attachments: payload.attachments.map(attachment => ({
                    filename: attachment.fileName,
                    content: Buffer.from(attachment.contentBase64, 'base64'),
                    contentType: attachment.contentType,
                  })),
                }
              : {}),
          })
          if (error) {
            throw new MailTransportRejectedError(`Resend API error: ${error.message}`)
          }
          return data?.id
        },
      }
    }

    return {
      name: 'mailpit',
      send: async (payload, from) => {
        const httpBase = this.configService.get<string>('mailpitHttpBaseUrl') ?? 'http://localhost:8025'

        // Mailpit's /api/v1/send expects PascalCase keys with `From`/`To`
        // as `{Email, Name}` objects — not lowercase string shorthand.
        const response = await fetch(`${httpBase}/api/v1/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: { Email: from },
            To: [{ Email: payload.to }],
            ...(payload.replyTo ? { ReplyTo: [{ Email: payload.replyTo }] } : {}),
            ...(payload.headers ? { Headers: payload.headers } : {}),
            Subject: payload.subject,
            Text: payload.text,
            HTML: payload.html,
            ...(payload.attachments?.length
              ? {
                  Attachments: payload.attachments.map(attachment => ({
                    Filename: attachment.fileName,
                    ContentType: attachment.contentType,
                    Content: attachment.contentBase64,
                  })),
                }
              : {}),
          }),
        })

        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(`Mailpit API error (${response.status})${detail ? `: ${detail}` : ''}`)
        }
        // Mailpit est le transport de développement : pas d'identifiant à
        // suivre, et rien à retrouver ailleurs qu'à l'écran.
        return undefined
      },
    }
  }

  private resolveTransportMode(): TransportMode {
    return resolveEmailTransportMode(
      this.configService.get<string>('emailProvider'),
      this.configService.get<string>('nodeEnv'),
    )
  }

  private getResendClient(): ResendEmailClient {
    if (this.resendClient) {
      return this.resendClient
    }

    const resendApiKey = this.configService.get<string>('resendApiKey')
    if (!resendApiKey) {
      throw new Error('Resend API key is missing. Set RESEND_API_KEY in environment variables.')
    }

    this.resendClient = new Resend(resendApiKey)
    return this.resendClient as ResendEmailClient
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Plain text → paragraphes HTML échappés. Partagée par `renderOutreachEmail`
 * (message d'un commercial à un prospect) et `sendOwnerInvitationEmail`
 * (#2643.1) : les deux partent d'un texte simple, sans CTA ni branding — ça
 * doit se lire comme un e-mail humain.
 */
function plainTextToHtml(body: string): { html: string; text: string } {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map(block => escapeHtml(block).replaceAll('\n', '<br>'))
  const inner =
    paragraphs.length > 0
      ? paragraphs.map(p => `<p style="margin:0 0 16px">${p}</p>`).join('')
      : `<p style="margin:0"></p>`
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;font-size:15px;line-height:1.6;max-width:600px">${inner}</div>`
  return { html, text: body }
}

/**
 * Minimal HTML/text for an outreach email built from a plain-text draft.
 * Splits on blank lines into paragraphs and turns single newlines into `<br>`,
 * HTML-escaping every segment. No CTA/branding — it must read like a human email.
 */
function renderOutreachEmail(body: string, unsubscribeUrl?: string): { html: string; text: string } {
  const { html: innerHtml } = plainTextToHtml(body)
  const footerHtml = unsubscribeUrl
    ? `<p style="margin:28px 0 0;color:#9ca3af;font-size:12px">Tu ne souhaites plus recevoir ces emails ? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af">Se désabonner</a>.</p>`
    : ''
  const html = footerHtml ? innerHtml.replace('</div>', `${footerHtml}</div>`) : innerHtml
  const text = unsubscribeUrl ? `${body}\n\n—\nSe désabonner : ${unsubscribeUrl}` : body
  return { html, text }
}

/** One changelog entry as it appears in the newsletter — already localised. */
type ChangelogNewsletterEntry = { date: string; title: string; items: string[] }

export type ChangelogNewsletterEmailInput = {
  to: string
  /** Reader's UI language. Drives EVERY chrome string below. */
  language: 'fr' | 'en'
  firstName: string | null
  /** The delta, newest first. Never empty — an empty delta means "no email". */
  entries: ChangelogNewsletterEntry[]
  /** Entries beyond the display cap, summarised as a single line + link. */
  extraCount: number
  appUrl: string
  settingsUrl: string
  unsubscribeUrl?: string
  oneClickUnsubscribe?: boolean
}

/** FR/EN chrome of the newsletter. The entries themselves are already in the
 *  reader's language — they come from the shared changelog catalogue. */
const NEWSLETTER_COPY = {
  fr: {
    subject: (n: number) => `Bellum — ${n} nouveauté${n > 1 ? 's' : ''} depuis ton dernier e-mail`,
    greeting: (name: string | null) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    lead: (n: number) =>
      n > 1
        ? `Voici les ${n} nouveautés arrivées dans Bellum depuis ton dernier e-mail.`
        : 'Voici la nouveauté arrivée dans Bellum depuis ton dernier e-mail.',
    extra: (n: number) => `+ ${n} autre${n > 1 ? 's' : ''} nouveauté${n > 1 ? 's' : ''} à retrouver dans l'app.`,
    cta: 'Ouvrir Bellum',
    why: 'Tu reçois cet e-mail parce que la Newsletter Changelog est activée sur ton compte.',
    manage: 'Gérer mes notifications',
    unsubscribe: 'Se désabonner',
  },
  en: {
    subject: (n: number) => `Bellum — ${n} new thing${n > 1 ? 's' : ''} since your last email`,
    greeting: (name: string | null) => (name ? `Hi ${name},` : 'Hi,'),
    lead: (n: number) =>
      n > 1
        ? `Here are the ${n} things that shipped in Bellum since your last email.`
        : 'Here is what shipped in Bellum since your last email.',
    extra: (n: number) => `+ ${n} more update${n > 1 ? 's' : ''} waiting for you in the app.`,
    cta: 'Open Bellum',
    why: 'You are getting this email because the Changelog newsletter is on for your account.',
    manage: 'Manage my notifications',
    unsubscribe: 'Unsubscribe',
  },
} as const

/**
 * Inline HTML/text for the Newsletter Changelog. Same lightweight approach as
 * the other inline templates here (no React Email dependency), with every
 * interpolated value HTML-escaped. Nothing is invented: the entries are
 * rendered exactly as the catalogue wrote them.
 */
export function renderChangelogNewsletterEmail(input: ChangelogNewsletterEmailInput): {
  subject: string
  text: string
  html: string
} {
  const copy = NEWSLETTER_COPY[input.language]
  const count = input.entries.length + input.extraCount
  const subject = copy.subject(count)

  const entriesHtml = input.entries
    .map(entry => {
      const items = entry.items.map(item => `<li style="margin:6px 0">${escapeHtml(item)}</li>`).join('')
      return `<div style="margin:0 0 28px">
      <p style="margin:0 0 2px;color:#8b8b8b;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(entry.date)}</p>
      <h3 style="margin:0 0 8px;font-size:16px;line-height:1.35">${escapeHtml(entry.title)}</h3>
      <ul style="padding-left:18px;margin:0;color:#333;font-size:14px;line-height:1.55">${items}</ul>
    </div>`
    })
    .join('')

  const extraHtml =
    input.extraCount > 0
      ? `<p style="margin:0 0 24px;color:#666;font-size:14px">${escapeHtml(copy.extra(input.extraCount))}</p>`
      : ''

  const unsubscribeHtml = input.unsubscribeUrl
    ? ` · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#9ca3af">${escapeHtml(copy.unsubscribe)}</a>`
    : ''

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:600px;margin:0 auto">
    <p style="margin:0 0 4px;font-size:15px">${escapeHtml(copy.greeting(input.firstName))}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444">${escapeHtml(copy.lead(count))}</p>
    ${entriesHtml}
    ${extraHtml}
    <p style="margin:0 0 28px"><a href="${escapeHtml(input.appUrl)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(copy.cta)}</a></p>
    <p style="margin:0;color:#9ca3af;font-size:12px">${escapeHtml(copy.why)} <a href="${escapeHtml(input.settingsUrl)}" style="color:#9ca3af">${escapeHtml(copy.manage)}</a>${unsubscribeHtml}.</p>
  </div>`

  const textLines: string[] = [copy.greeting(input.firstName), '', copy.lead(count), '']
  for (const entry of input.entries) {
    textLines.push(`${entry.date} — ${entry.title}`)
    textLines.push(...entry.items.map(item => `  - ${item}`))
    textLines.push('')
  }
  if (input.extraCount > 0) {
    textLines.push(copy.extra(input.extraCount), '')
  }
  textLines.push(`${copy.cta}: ${input.appUrl}`, '', `${copy.why} ${copy.manage}: ${input.settingsUrl}`)
  if (input.unsubscribeUrl) {
    textLines.push(`${copy.unsubscribe}: ${input.unsubscribeUrl}`)
  }

  return { subject, text: textLines.join('\n').trim(), html }
}

/** Minimal inline HTML/text for a transactional notification email. */
function renderNotificationEmail(input: {
  subject: string
  heading: string
  bodyLines: string[]
  ctaUrl?: string
  ctaLabel?: string
}): { text: string; html: string } {
  const cta =
    input.ctaUrl && input.ctaLabel
      ? `<p style="margin:24px 0 0"><a href="${escapeHtml(input.ctaUrl)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(input.ctaLabel)}</a></p>`
      : ''
  const listHtml = input.bodyLines.map(line => `<li style="margin:4px 0">${escapeHtml(line)}</li>`).join('')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(input.heading)}</h2>
    <ul style="padding-left:18px;margin:0;color:#333;font-size:14px;line-height:1.5">${listHtml}</ul>
    ${cta}
    <p style="margin:28px 0 0;color:#888;font-size:12px">Tu reçois cet email car tu as activé les notifications BellumAI. Gère-les dans Paramètres › Notifications.</p>
  </div>`
  const text = [
    input.heading,
    '',
    ...input.bodyLines.map(l => `- ${l}`),
    input.ctaUrl ? `\n${input.ctaLabel}: ${input.ctaUrl}` : '',
  ]
    .join('\n')
    .trim()
  return { text, html }
}
