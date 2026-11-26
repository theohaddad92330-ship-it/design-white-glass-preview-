import { renderChangelogNewsletterEmail, type ChangelogNewsletterEmailInput } from './mailer.service'

function input(overrides: Partial<ChangelogNewsletterEmailInput> = {}): ChangelogNewsletterEmailInput {
  return {
    to: 'rep@esn.fr',
    language: 'fr',
    firstName: 'Alice',
    entries: [
      { date: '22 juillet 2026', title: 'Une nouveauté', items: ['Premier point', 'Second point'] },
      { date: '21 juillet 2026', title: 'Une autre', items: ['Un point'] },
    ],
    extraCount: 0,
    appUrl: 'https://app.bellum-ai.com/dashboard',
    settingsUrl: 'https://app.bellum-ai.com/settings/notifications',
    ...overrides,
  }
}

describe('renderChangelogNewsletterEmail', () => {
  it('writes the whole chrome in FR when the reader reads FR', () => {
    const { subject, html, text } = renderChangelogNewsletterEmail(input())

    expect(subject).toBe('Bellum — 2 nouveautés depuis ton dernier e-mail')
    expect(html).toContain('Bonjour Alice,')
    expect(html).toContain('Ouvrir Bellum')
    expect(text).toContain('Gérer mes notifications')
  })

  it('writes the whole chrome in EN when the reader reads EN', () => {
    const { subject, html } = renderChangelogNewsletterEmail(input({ language: 'en' }))

    expect(subject).toBe('Bellum — 2 new things since your last email')
    expect(html).toContain('Hi Alice,')
    expect(html).toContain('Open Bellum')
    expect(html).not.toContain('Bonjour')
  })

  it('singularises a one-entry digest', () => {
    const entries = [{ date: '22 juillet 2026', title: 'Une nouveauté', items: ['Point'] }]
    expect(renderChangelogNewsletterEmail(input({ entries })).subject).toBe(
      'Bellum — 1 nouveauté depuis ton dernier e-mail',
    )
    expect(renderChangelogNewsletterEmail(input({ entries, language: 'en' })).subject).toBe(
      'Bellum — 1 new thing since your last email',
    )
  })

  it('greets without a name when the profile has none', () => {
    expect(renderChangelogNewsletterEmail(input({ firstName: null })).html).toContain('Bonjour,')
  })

  it('renders every entry with its date, title and bullets — and nothing else', () => {
    const { html, text } = renderChangelogNewsletterEmail(input())

    expect(html).toContain('22 juillet 2026')
    expect(html).toContain('Une nouveauté')
    expect(html).toContain('Premier point')
    expect(text).toContain('22 juillet 2026 — Une nouveauté')
    expect(text).toContain('  - Premier point')
  })

  it('counts the overflow in the subject and says so, instead of dropping it silently', () => {
    const { subject, html } = renderChangelogNewsletterEmail(input({ extraCount: 4 }))

    expect(subject).toBe('Bellum — 6 nouveautés depuis ton dernier e-mail')
    expect(html).toContain('+ 4 autres nouveautés à retrouver dans l&#39;app.')
  })

  it('HTML-escapes catalogue content (a title is data, never markup)', () => {
    const entries = [{ date: 'd', title: '<script>alert(1)</script>', items: ['a & b'] }]
    const { html } = renderChangelogNewsletterEmail(input({ entries }))

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
  })

  it('carries the opt-out link when one is available, and omits it otherwise', () => {
    const withLink = renderChangelogNewsletterEmail(
      input({ unsubscribeUrl: 'https://api.bellum-ai.com/emails/unsubscribe?token=abc' }),
    )
    expect(withLink.html).toContain('emails/unsubscribe?token=abc')
    expect(withLink.text).toContain('Se désabonner: https://api.bellum-ai.com/emails/unsubscribe?token=abc')

    const without = renderChangelogNewsletterEmail(input())
    expect(without.html).not.toContain('Se désabonner')
  })

  it('always says why the reader is getting this and where to turn it off', () => {
    const fr = renderChangelogNewsletterEmail(input())
    expect(fr.html).toContain('Newsletter Changelog est activée')
    expect(fr.html).toContain('settings/notifications')

    const en = renderChangelogNewsletterEmail(input({ language: 'en' }))
    expect(en.html).toContain('Changelog newsletter is on')
  })
})
