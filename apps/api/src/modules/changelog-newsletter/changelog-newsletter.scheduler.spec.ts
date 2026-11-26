import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants'
import { ChangelogNewsletterScheduler, changelogNewsletterDisabled } from './changelog-newsletter.scheduler'
import type { ChangelogNewsletterService, NewsletterOutcome } from './changelog-newsletter.service'

/** Every outcome the batch can report — mirrors the service's own union. */
const EMPTY_TALLY: Record<NewsletterOutcome, number> = {
  sent: 0,
  seeded: 0,
  up_to_date: 0,
  opted_out: 0,
  suppressed: 0,
  no_email: 0,
}

function build() {
  const run = jest.fn(async () => EMPTY_TALLY)
  const scheduler = new ChangelogNewsletterScheduler({ run } as unknown as ChangelogNewsletterService)
  return { scheduler, run }
}

describe('ChangelogNewsletterScheduler', () => {
  afterEach(() => {
    delete process.env['CHANGELOG_NEWSLETTER_DISABLED']
  })

  it('runs twice a month — the 1st and the 15th at 09:00 Europe/Paris (« bimensuel »)', () => {
    const options = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      ChangelogNewsletterScheduler.prototype.runChangelogNewsletter,
    ) as { name?: string; timeZone?: string; cronTime?: string } & Record<string, unknown>

    expect(options).toBeDefined()
    expect(options.name).toBe('changelog-newsletter')
    expect(options.timeZone).toBe('Europe/Paris')
    // The expression is stored as the decorator's first argument.
    expect(JSON.stringify(options)).toContain('0 9 1,15 * *')
  })

  it('sends when nothing disables it', async () => {
    const { scheduler, run } = build()
    await scheduler.runChangelogNewsletter()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('honours the break-glass kill switch', async () => {
    process.env['CHANGELOG_NEWSLETTER_DISABLED'] = 'true'
    const { scheduler, run } = build()
    await scheduler.runChangelogNewsletter()
    expect(run).not.toHaveBeenCalled()
  })

  it('only "true" disables it — an accidental value never silences the newsletter', async () => {
    process.env['CHANGELOG_NEWSLETTER_DISABLED'] = 'false'
    expect(changelogNewsletterDisabled()).toBe(false)
    process.env['CHANGELOG_NEWSLETTER_DISABLED'] = '1'
    expect(changelogNewsletterDisabled()).toBe(false)
    process.env['CHANGELOG_NEWSLETTER_DISABLED'] = 'true'
    expect(changelogNewsletterDisabled()).toBe(true)
  })
})
