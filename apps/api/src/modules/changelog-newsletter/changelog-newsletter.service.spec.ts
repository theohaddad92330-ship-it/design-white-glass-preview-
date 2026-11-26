import { CHANGELOG_IDS, LATEST_CHANGELOG_ID, changelogEn, changelogFr } from '@bellum/contracts'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { MailerService } from '../mailer/mailer.service'
import type { SuppressionService } from '../mailer/suppression.service'
import { ChangelogNewsletterService } from './changelog-newsletter.service'

type Candidate = Parameters<ChangelogNewsletterService['deliverTo']>[0]

const IDS = CHANGELOG_IDS.map(entry => entry.id)

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    user_id: 'user-1',
    email: 'rep@esn.fr',
    first_name: 'Alice',
    newsletter_changelog: true,
    newsletter_last_entry_id: IDS[3] ?? null,
    email_language: 'fr',
    ...overrides,
  }
}

function build(options: { suppressed?: boolean; prefsRow?: { id: string } | null; workspaces?: string[] } = {}) {
  const sendChangelogNewsletterEmail = jest.fn<
    Promise<void>,
    [Parameters<MailerService['sendChangelogNewsletterEmail']>[0]]
  >(async () => undefined)
  const prefsUpdate = jest.fn(async () => undefined)
  const prefsInsert = jest.fn(async () => undefined)

  const prefs = {
    findOne: jest.fn(async () => (options.prefsRow === undefined ? { id: 'pref-1' } : options.prefsRow)),
    update: prefsUpdate,
    insert: prefsInsert,
  } as unknown as Repository<NotificationPreferenceEntity>

  const members = {
    find: jest.fn(async () => (options.workspaces ?? ['ws-1']).map(id => ({ workspace_id: id }))),
  } as unknown as Repository<WorkspaceMemberEntity>

  const suppression = {
    isSuppressed: jest.fn(async () => options.suppressed === true),
  } as unknown as SuppressionService

  const config = {
    get: jest.fn((key: string) => (key === 'frontendUrl' ? 'https://app.bellum-ai.com' : undefined)),
  } as unknown as ConfigService

  const service = new ChangelogNewsletterService(
    {} as unknown as Repository<ProfileEntity>,
    prefs,
    members,
    { sendChangelogNewsletterEmail } as unknown as MailerService,
    suppression,
    config,
  )

  return { service, sendChangelogNewsletterEmail, prefsUpdate, prefsInsert, suppression }
}

describe('ChangelogNewsletterService.deliverTo', () => {
  it('sends ONLY the entries published since the reader’s marker, newest first', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_last_entry_id: IDS[3] as string }))).resolves.toBe('sent')

    const payload = sendChangelogNewsletterEmail.mock.calls[0]?.[0] as unknown as {
      entries: { title: string }[]
      extraCount: number
    }
    expect(payload.entries).toHaveLength(3)
    expect(payload.extraCount).toBe(0)
    const expected = (IDS.slice(0, 3) as string[]).map(id => changelogFr.entries[id]?.['title'])
    expect(payload.entries.map(entry => entry.title)).toEqual(expected)
  })

  it('sends NOTHING to a reader already on the newest entry (no hollow "nothing new" email)', async () => {
    const { service, sendChangelogNewsletterEmail, prefsUpdate } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }))).resolves.toBe(
      'up_to_date',
    )

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
    expect(prefsUpdate).not.toHaveBeenCalled()
  })

  it('seeds a never-served reader instead of mailing them the whole history', async () => {
    const { service, sendChangelogNewsletterEmail, prefsUpdate } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_last_entry_id: null }))).resolves.toBe('seeded')

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
    expect(prefsUpdate).toHaveBeenCalledWith({ id: 'pref-1' }, { newsletter_last_entry_id: LATEST_CHANGELOG_ID })
  })

  it('creates the preferences row when seeding a reader who never opened the settings screen', async () => {
    const { service, prefsInsert } = build({ prefsRow: null })

    await expect(service.deliverTo(makeCandidate({ newsletter_last_entry_id: null }))).resolves.toBe('seeded')

    expect(prefsInsert).toHaveBeenCalledWith({ user_id: 'user-1', newsletter_last_entry_id: LATEST_CHANGELOG_ID })
  })

  it('re-seeds (and stays silent) when the stored marker left the catalogue', async () => {
    const { service, sendChangelogNewsletterEmail, prefsUpdate } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_last_entry_id: 'retired-entry' }))).resolves.toBe(
      'seeded',
    )

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
    expect(prefsUpdate).toHaveBeenCalled()
  })

  it('advances the marker to the newest entry BEFORE sending, so a replay cannot re-announce', async () => {
    const { service, prefsUpdate, sendChangelogNewsletterEmail } = build()
    const order: string[] = []
    prefsUpdate.mockImplementation(async () => {
      order.push('stamp')
    })
    sendChangelogNewsletterEmail.mockImplementation(async () => {
      order.push('send')
    })

    await service.deliverTo(makeCandidate())

    expect(order).toEqual(['stamp', 'send'])
    expect(prefsUpdate).toHaveBeenCalledWith({ id: 'pref-1' }, { newsletter_last_entry_id: LATEST_CHANGELOG_ID })
  })

  it('a second pass right after a send delivers nothing (the same news never goes out twice)', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await service.deliverTo(makeCandidate())
    // The marker the first pass persisted is what the second pass reads back.
    await service.deliverTo(makeCandidate({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }))

    expect(sendChangelogNewsletterEmail).toHaveBeenCalledTimes(1)
  })

  it('respects an explicit opt-out — nothing sent, marker untouched', async () => {
    const { service, sendChangelogNewsletterEmail, prefsUpdate } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_changelog: false }))).resolves.toBe('opted_out')

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
    expect(prefsUpdate).not.toHaveBeenCalled()
  })

  // #2082.16 — REVIREMENT. Ce test disait « treats a missing preferences row as
  // subscribed (default ON) » : la newsletter partait à qui n'avait jamais
  // ouvert l'écran de réglages. Une ligne absente est une absence de
  // consentement.
  it('n’envoie RIEN sans ligne de préférences (#2082.16 — pas d’abonnement présumé)', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_changelog: null }))).resolves.toBe('opted_out')

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
  })

  it('envoie au lecteur qui a EXPLICITEMENT coché la newsletter', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await expect(service.deliverTo(makeCandidate({ newsletter_changelog: true }))).resolves.toBe('sent')

    expect(sendChangelogNewsletterEmail).toHaveBeenCalledTimes(1)
  })

  it('respects the suppression list — nothing sent, and the marker does NOT advance', async () => {
    const { service, sendChangelogNewsletterEmail, prefsUpdate } = build({ suppressed: true })

    await expect(service.deliverTo(makeCandidate())).resolves.toBe('suppressed')

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
    expect(prefsUpdate).not.toHaveBeenCalled()
  })

  it('checks the suppression list in EVERY workspace the reader belongs to', async () => {
    const { service, suppression } = build({ workspaces: ['ws-1', 'ws-2'] })

    await service.deliverTo(makeCandidate())

    expect(suppression.isSuppressed).toHaveBeenCalledWith('ws-1', 'rep@esn.fr')
    expect(suppression.isSuppressed).toHaveBeenCalledWith('ws-2', 'rep@esn.fr')
  })

  it('skips a reader with no address at all', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await expect(service.deliverTo(makeCandidate({ email: null }))).resolves.toBe('no_email')
    await expect(service.deliverTo(makeCandidate({ email: '   ' }))).resolves.toBe('no_email')

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
  })

  it('writes in the reader’s language', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await service.deliverTo(makeCandidate({ email_language: 'en' }))

    const payload = sendChangelogNewsletterEmail.mock.calls[0]?.[0] as unknown as {
      language: string
      entries: { title: string }[]
    }
    expect(payload.language).toBe('en')
    expect(payload.entries[0]?.title).toBe(changelogEn.entries[IDS[0] as string]?.['title'])
  })

  it('falls back to the product default (FR) when the language was never reported', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await service.deliverTo(makeCandidate({ email_language: null }))

    const payload = sendChangelogNewsletterEmail.mock.calls[0]?.[0] as unknown as { language: string }
    expect(payload.language).toBe('fr')
  })

  it('caps a long backlog at 10 entries and counts the rest instead of inventing a summary', async () => {
    const { service, sendChangelogNewsletterEmail } = build()
    const oldMarker = IDS[20] as string

    await service.deliverTo(makeCandidate({ newsletter_last_entry_id: oldMarker }))

    const payload = sendChangelogNewsletterEmail.mock.calls[0]?.[0] as unknown as {
      entries: unknown[]
      extraCount: number
    }
    expect(payload.entries).toHaveLength(10)
    expect(payload.extraCount).toBe(10)
  })

  it('only ever ships entries that exist in the catalogue (no invented content)', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await service.deliverTo(makeCandidate({ newsletter_last_entry_id: IDS[5] as string }))

    const payload = sendChangelogNewsletterEmail.mock.calls[0]?.[0] as unknown as {
      entries: { date: string; title: string; items: string[] }[]
    }
    const catalogTitles = Object.values(changelogFr.entries).map(entry => entry['title'])
    for (const entry of payload.entries) {
      expect(catalogTitles).toContain(entry.title)
      expect(entry.items.length).toBeGreaterThan(0)
    }
  })

  it('points the reader at the app and at their notification settings', async () => {
    const { service, sendChangelogNewsletterEmail } = build()

    await service.deliverTo(makeCandidate())

    const payload = sendChangelogNewsletterEmail.mock.calls[0]?.[0] as unknown as {
      appUrl: string
      settingsUrl: string
      unsubscribeUrl: string
      oneClickUnsubscribe: boolean
    }
    expect(payload.appUrl).toBe('https://app.bellum-ai.com/dashboard')
    expect(payload.settingsUrl).toBe('https://app.bellum-ai.com/settings/notifications')
    // No INTERNAL_API_SECRET / API_PUBLIC_URL in this test config → the footer
    // falls back to the settings screen and claims no RFC 8058 one-click.
    expect(payload.unsubscribeUrl).toBe('https://app.bellum-ai.com/settings/notifications')
    expect(payload.oneClickUnsubscribe).toBe(false)
  })
})
