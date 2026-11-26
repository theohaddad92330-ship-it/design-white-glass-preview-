import type { ConfigService } from '@nestjs/config'

// Stub the React Email renderers — we don't want to run a full React SSR
// inside a unit test, and the renderer uses dynamic `import()` which Jest
// in CJS mode rejects without `--experimental-vm-modules`. The shape
// returned here mirrors what the real `renderX*` produces (subject + html
// + text), with the input URL/OTP embedded so existing assertions on
// `body.HTML.contains(url)` etc. still hold.
jest.mock('@bellum/email', () => ({
  renderWelcomeEmail: jest.fn(async (props: { firstName: string; dashboardUrl: string }) => ({
    subject: `Bienvenue sur Bellum, ${props.firstName}`,
    html: `<html><body><a href="${props.dashboardUrl}">Open dashboard</a></body></html>`,
    text: `Bienvenue ${props.firstName}. Dashboard: ${props.dashboardUrl}`,
  })),
  renderOtpEmail: jest.fn(async (props: { firstName: string; otpCode: string }) => ({
    subject: 'Votre code de connexion Bellum',
    html: `<html><body><code>${props.otpCode}</code></body></html>`,
    text: `Code: ${props.otpCode}`,
  })),
  renderResetPasswordEmail: jest.fn(async (props: { firstName: string; resetUrl: string }) => ({
    subject: 'Réinitialisation de mot de passe Bellum',
    html: `<html><body><a href="${props.resetUrl}">Reset</a></body></html>`,
    text: `Reset: ${props.resetUrl}`,
  })),
  renderWeeklyDigestEmail: jest.fn(
    async (props: { totalSignals: number; totalAccounts: number; unsubscribeUrl?: string }) => ({
      subject: `Votre veille de la semaine : ${props.totalSignals} signaux sur ${props.totalAccounts} comptes`,
      html: `<html><body>digest${props.unsubscribeUrl ? ` <a href="${props.unsubscribeUrl}">unsub</a>` : ''}</body></html>`,
      text: 'digest',
    }),
  ),
}))

import { MailerService, resolveEmailTransportMode } from './mailer.service'
import { MailerController } from './mailer.controller'
import { InternalSecretGuard } from '../../common/internal-secret.guard'

const resendSendMock = jest.fn()

// NOTE: `resend` is a real dependency (mailer.service imports it statically),
// so this is a normal module mock — NOT `{ virtual: true }`. The virtual flag
// is for non-existent modules; with a real package it intercepts
// inconsistently (passed locally on a warm jest cache, but the real SDK loaded
// in CI → live network calls + flaky "API key is invalid" failures).
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: resendSendMock,
    },
  })),
}))

type ConfigOverrides = {
  smtpFrom?: string
  nodeEnv?: string
  mailpitHttpBaseUrl?: string
  emailProvider?: 'mailpit' | 'resend'
  resendApiKey?: string
  resendFrom?: string
}

function makeConfig(overrides: ConfigOverrides = {}): ConfigService {
  const values: ConfigOverrides = {
    smtpFrom: 'noreply@bellum.test',
    resendFrom: 'onboarding@bellum.test',
    nodeEnv: 'development',
    emailProvider: 'mailpit',
    resendApiKey: 're_test_123',
    ...overrides,
  }
  return {
    get: <T>(key: keyof ConfigOverrides) => values[key] as T | undefined,
    getOrThrow: <T>(key: keyof ConfigOverrides) => {
      const v = values[key]
      if (v === undefined) throw new Error(`Missing config: ${String(key)}`)
      return v as T
    },
  } as unknown as ConfigService
}

function makeOkFetch() {
  return jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
}

describe('MailerService', () => {
  let originalFetch: typeof globalThis.fetch

  beforeAll(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resendSendMock.mockReset()
    jest.restoreAllMocks()
  })

  describe('sendTestMail', () => {
    it('posts to Mailpit with the default subject when none is provided', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      const result = await service.sendTestMail({ to: 'user@bellum.test' })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:8025/api/v1/send')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body).toMatchObject({
        From: { Email: 'noreply@bellum.test' },
        To: [{ Email: 'user@bellum.test' }],
        Subject: 'Bellum test email (local)',
      })
      expect(body.HTML).toContain('Mailpit')
      expect(result.messageId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('uses the provided subject when one is given', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendTestMail({ to: 'user@bellum.test', subject: 'Custom subject' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.Subject).toBe('Custom subject')
    })

    it('honours mailpitHttpBaseUrl from config over the default', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig({ mailpitHttpBaseUrl: 'http://mailpit.internal:9025' }))

      await service.sendTestMail({ to: 'user@bellum.test' })

      expect(fetchMock.mock.calls[0][0]).toBe('http://mailpit.internal:9025/api/v1/send')
    })
  })

  describe('sendWelcomeEmail', () => {
    it('sends the welcome content built from the input', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendWelcomeEmail({
        to: 'alex@bellum.test',
        firstName: 'Alex',
        dashboardUrl: 'https://app.bellum.ai/dashboard',
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.To).toEqual([{ Email: 'alex@bellum.test' }])
      expect(body.Subject).toBe('Bienvenue sur Bellum, Alex')
      expect(body.HTML).toContain('https://app.bellum.ai/dashboard')
      expect(body.Text).toContain('https://app.bellum.ai/dashboard')
    })
  })

  describe('sendOtpEmail', () => {
    it('embeds the OTP code in both text and html parts', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOtpEmail({
        to: 'alex@bellum.test',
        firstName: 'Alex',
        otpCode: '271904',
        expirationMinutes: 10,
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.Subject).toBe('Votre code de connexion Bellum')
      expect(body.Text).toContain('271904')
      expect(body.HTML).toContain('271904')
    })
  })

  describe('sendResetPasswordEmail', () => {
    it('forwards the reset URL into the rendered content', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendResetPasswordEmail({
        to: 'alex@bellum.test',
        firstName: 'Alex',
        resetUrl: 'https://app.bellum.ai/auth/reset-password?token=abc',
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.Subject).toBe('Réinitialisation de mot de passe Bellum')
      expect(body.Text).toContain('https://app.bellum.ai/auth/reset-password?token=abc')
      expect(body.HTML).toContain('https://app.bellum.ai/auth/reset-password?token=abc')
    })
  })

  describe('error handling', () => {
    it('throws when Mailpit responds with a non-OK status', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('upstream unavailable'),
      } as unknown as Response)
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await expect(service.sendTestMail({ to: 'user@bellum.test' })).rejects.toThrow(
        /^Mailpit API error \(502\): upstream unavailable$/,
      )
    })

    it('throws when smtpFrom is missing in config', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig({ smtpFrom: undefined }))

      await expect(service.sendTestMail({ to: 'user@bellum.test' })).rejects.toThrow('Missing config: smtpFrom')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('production transport', () => {
    it('uses resend sdk when provider is resend', async () => {
      resendSendMock.mockResolvedValue({ error: null })
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))

      await service.sendTestMail({ to: 'user@bellum.test' })

      expect(resendSendMock).toHaveBeenCalledTimes(1)
      expect(resendSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'onboarding@bellum.test',
          to: ['user@bellum.test'],
          subject: 'Bellum test email (local)',
        }),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('throws when resend returns an error', async () => {
      resendSendMock.mockResolvedValue({ error: { message: 'invalid sender domain' } })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))

      await expect(service.sendTestMail({ to: 'user@bellum.test' })).rejects.toThrow(
        'Resend API error: invalid sender domain',
      )
    })

    it('throws when resend api key is missing in resend mode', async () => {
      const service = new MailerService(
        makeConfig({ nodeEnv: 'production', emailProvider: 'resend', resendApiKey: '' }),
      )

      await expect(service.sendTestMail({ to: 'user@bellum.test' })).rejects.toThrow(/Resend API key is missing/)
    })

    it('defaults to resend in production when no provider is set', async () => {
      const service = new MailerService(
        makeConfig({ nodeEnv: 'production', emailProvider: undefined, resendApiKey: '' }),
      )

      await expect(service.sendTestMail({ to: 'user@bellum.test' })).rejects.toThrow(/Resend API key is missing/)
    })

    it('defaults to mailpit in development when no provider is set', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig({ nodeEnv: 'development', emailProvider: undefined }))

      await service.sendTestMail({ to: 'user@bellum.test' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('sendOutreachEmail — pièces jointes (#3699.6)', () => {
    const pdf = { fileName: 'plaquette.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0xLjQ=' }

    it('joint la pièce RÉELLE en multipart sur le transport de dev', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x', attachments: [pdf] })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.Attachments).toEqual([
        { Filename: 'plaquette.pdf', ContentType: 'application/pdf', Content: 'JVBERi0xLjQ=' },
      ])
    })

    it('joint la pièce sur le transport de production, octets décodés', async () => {
      resendSendMock.mockResolvedValue({ data: { id: 're_1' }, error: null })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x', attachments: [pdf] })

      const payload = resendSendMock.mock.calls.at(-1)[0]
      expect(payload.attachments).toHaveLength(1)
      expect(payload.attachments[0].filename).toBe('plaquette.pdf')
      expect(payload.attachments[0].contentType).toBe('application/pdf')
      expect(Buffer.isBuffer(payload.attachments[0].content)).toBe(true)
      expect(payload.attachments[0].content.toString('base64')).toBe('JVBERi0xLjQ=')
    })

    it('sans pièce, aucune clé de pièce jointe ne part (chemin inchangé)', async () => {
      resendSendMock.mockResolvedValue({ data: { id: 're_2' }, error: null })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))
      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x' })
      expect(resendSendMock.mock.calls.at(-1)[0]).not.toHaveProperty('attachments')
    })

    it('un refus du transport REMONTE — jamais un envoi silencieux sans la pièce', async () => {
      resendSendMock.mockResolvedValue({ data: null, error: { message: 'attachment too large' } })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))
      await expect(
        service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x', attachments: [pdf] }),
      ).rejects.toThrow('attachment too large')
    })
  })

  describe('sendOutreachEmail', () => {
    it('builds paragraphs from the draft body and sets Reply-To (mailpit)', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOutreachEmail({
        to: 'prospect@corp.fr',
        subject: 'Bonjour',
        body: 'Premier paragraphe.\n\nSecond paragraphe.',
        replyTo: 'rep@esn.fr',
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.To).toEqual([{ Email: 'prospect@corp.fr' }])
      expect(body.ReplyTo).toEqual([{ Email: 'rep@esn.fr' }])
      expect(body.Subject).toBe('Bonjour')
      expect(body.Text).toBe('Premier paragraphe.\n\nSecond paragraphe.')
      expect(body.HTML).toContain('<p style="margin:0 0 16px">Premier paragraphe.</p>')
      expect(body.HTML).toContain('Second paragraphe.')
    })

    it('omits Reply-To when the rep email is not provided', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOutreachEmail({ to: 'prospect@corp.fr', subject: 'Hi', body: 'x' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.ReplyTo).toBeUndefined()
    })

    it('HTML-escapes the body (no injection from a drafted message)', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: '<script>alert(1)</script>' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.HTML).toContain('&lt;script&gt;')
      expect(body.HTML).not.toContain('<script>')
    })

    it('threads reply_to through the Resend transport', async () => {
      resendSendMock.mockResolvedValue({ error: null })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x', replyTo: 'rep@esn.fr' })

      expect(resendSendMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['p@corp.fr'], reply_to: 'rep@esn.fr' }),
      )
    })

    // #2733 — sans cet identifiant, un rebond Resend (`email.bounced`) ne
    // peut être relié à aucun contact précis : c'est la seule clé partagée
    // entre notre envoi et l'événement webhook qui revient.
    it('rend le providerId Resend — la clé qui reliera un rebond au bon contact (#2733)', async () => {
      resendSendMock.mockResolvedValue({ error: null, data: { id: 're_bounce_test_123' } })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))

      const result = await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x' })

      expect(result).toEqual({ providerId: 're_bounce_test_123' })
    })

    it('rend `undefined` sur Mailpit — rien à suivre côté fournisseur de dev', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      const result = await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x' })

      expect(result).toEqual({ providerId: undefined })
    })

    it('appends an unsubscribe footer + List-Unsubscribe headers (mailpit)', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())
      const url = 'https://api.bellum-ai.com/emails/unsubscribe?token=abc.def'

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'Corps.', unsubscribeUrl: url })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.HTML).toContain('Se désabonner')
      expect(body.HTML).toContain(url)
      expect(body.Text).toContain(`Se désabonner : ${url}`)
      expect(body.Headers['List-Unsubscribe']).toBe(`<${url}>`)
      expect(body.Headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    })

    it('omits the footer + List-Unsubscribe headers when no unsubscribe URL is given', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'Corps.' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.HTML).not.toContain('Se désabonner')
      expect(body.Headers).toBeUndefined()
    })

    it('threads List-Unsubscribe headers through the Resend transport', async () => {
      resendSendMock.mockResolvedValue({ error: null })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))
      const url = 'https://api.bellum-ai.com/emails/unsubscribe?token=abc.def'

      await service.sendOutreachEmail({ to: 'p@corp.fr', subject: 'Hi', body: 'x', unsubscribeUrl: url })

      expect(resendSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      )
    })
  })

  /**
   * #2643.1 — le branchement : `OwnerActivationService.send` appelle CETTE
   * méthode UNIQUEMENT sur un clic opérateur. Ici on ne teste que le rendu et
   * l'envoi ; la porte elle-même est prouvée côté `owner-activation.service
   * .spec.ts` et `manual-provisioning.service.spec.ts` (aucun appel pendant le
   * provisionnement).
   */
  describe('sendOwnerInvitationEmail', () => {
    it('envoie le texte préparé tel quel, en plain text ET en HTML échappé', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendOwnerInvitationEmail({
        to: 'theo@skaizen.fr',
        subject: 'Votre espace Skaizen est prêt',
        body: 'Bonjour Théo,\n\nDéfinissez votre mot de passe :\nhttps://app.bellum.ai/auth/reset-password?t=abc',
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.To).toEqual([{ Email: 'theo@skaizen.fr' }])
      expect(body.Subject).toBe('Votre espace Skaizen est prêt')
      expect(body.Text).toContain('https://app.bellum.ai/auth/reset-password?t=abc')
      expect(body.HTML).toContain('https://app.bellum.ai/auth/reset-password?t=abc')
    })

    it('threade par Resend en production', async () => {
      resendSendMock.mockResolvedValue({ error: null })
      const service = new MailerService(makeConfig({ nodeEnv: 'production', emailProvider: 'resend' }))

      await service.sendOwnerInvitationEmail({ to: 'theo@skaizen.fr', subject: 'Prêt', body: 'Bonjour.' })

      expect(resendSendMock).toHaveBeenCalledWith(expect.objectContaining({ to: ['theo@skaizen.fr'] }))
    })
  })

  describe('sendWeeklyDigestEmail', () => {
    const digestProps = {
      to: 'rep@esn.fr',
      firstName: 'Alex',
      totalSignals: 3,
      totalAccounts: 2,
      accounts: [],
      dashboardUrl: 'https://app.bellum.test/dashboard',
      settingsUrl: 'https://app.bellum.test/settings/notifications',
    }

    it('renders through the template and sets one-click List-Unsubscribe headers for the signed route', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())
      const url = 'https://api.bellum-ai.com/emails/unsubscribe?token=abc.def'

      await service.sendWeeklyDigestEmail({ ...digestProps, unsubscribeUrl: url, oneClickUnsubscribe: true })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.To).toEqual([{ Email: 'rep@esn.fr' }])
      expect(body.Subject).toBe('Votre veille de la semaine : 3 signaux sur 2 comptes')
      expect(body.Headers['List-Unsubscribe']).toBe(`<${url}>`)
      expect(body.Headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    })

    it('never sets List-Unsubscribe headers for the settings-page fallback (not one-click capable)', async () => {
      const fetchMock = makeOkFetch()
      globalThis.fetch = fetchMock as never
      const service = new MailerService(makeConfig())

      await service.sendWeeklyDigestEmail({
        ...digestProps,
        unsubscribeUrl: 'https://app.bellum.test/settings/notifications',
        oneClickUnsubscribe: false,
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.Headers).toBeUndefined()
    })
  })
})

describe('resolveEmailTransportMode', () => {
  it('honours an explicit provider regardless of NODE_ENV', () => {
    expect(resolveEmailTransportMode('resend', 'development')).toBe('resend')
    expect(resolveEmailTransportMode('mailpit', 'production')).toBe('mailpit')
  })

  it('defaults to Resend in production when the provider is unset', () => {
    // Regression guard: EMAIL_PROVIDER must have NO schema default. A 'mailpit'
    // default makes this branch unreachable, silently routing prod OTP/welcome/
    // reset mail to localhost:8025 so it is never delivered.
    expect(resolveEmailTransportMode(undefined, 'production')).toBe('resend')
  })

  it('defaults to Mailpit outside production when the provider is unset', () => {
    expect(resolveEmailTransportMode(undefined, 'development')).toBe('mailpit')
    expect(resolveEmailTransportMode(undefined, 'test')).toBe('mailpit')
    expect(resolveEmailTransportMode(undefined, undefined)).toBe('mailpit')
  })
})

describe('MailerController security', () => {
  it('guards /emails/test with the InternalSecretGuard (not publicly callable)', () => {
    // Regression guard: an unguarded /emails/test lets anyone send mail from our
    // verified domain (spam / reputation / cost abuse). The class-level guard
    // must stay applied.
    const guards: unknown[] = Reflect.getMetadata('__guards__', MailerController) ?? []
    expect(guards).toContain(InternalSecretGuard)
  })
})
