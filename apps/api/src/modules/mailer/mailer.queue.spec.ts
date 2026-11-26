import { buildEmailJobId, EMAIL_EVENT_TYPES, MailerQueue } from './mailer.queue'

describe('buildEmailJobId', () => {
  it('builds a deterministic BullMQ-safe id without exposing payload data', () => {
    const event = otpEvent()
    const jobId = buildEmailJobId(event)

    expect(jobId).toBe(buildEmailJobId(event))
    expect(jobId).toMatch(/^otp-[a-f0-9]{32}$/)
    expect(jobId).not.toContain(':')
    expect(jobId).not.toContain(event.to)
  })

  it('changes the id when the unique nonce changes', () => {
    expect(buildEmailJobId(otpEvent('123456'))).not.toBe(buildEmailJobId(otpEvent('654321')))
  })
})

describe('MailerQueue', () => {
  it('sets the deterministic jobId so a double-enqueue de-dupes', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' })
    const queue = new MailerQueue({ add } as never)

    const event = otpEvent()
    await queue.add(event)

    expect(add).toHaveBeenCalledWith(
      EMAIL_EVENT_TYPES.SEND_OTP,
      expect.anything(),
      expect.objectContaining({ jobId: buildEmailJobId(event) }),
    )
  })

  it('adds jobs with retry/backoff defaults', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' })
    const queue = new MailerQueue({ add } as never)

    await queue.add({
      type: EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD,
      emailType: 'reset-password',
      to: 'u@b.ai',
      firstName: 'U',
      resetUrl: 'https://x',
    })

    expect(add).toHaveBeenCalledWith(
      EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD,
      {
        type: EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD,
        emailType: 'reset-password',
        to: 'u@b.ai',
        firstName: 'U',
        resetUrl: 'https://x',
      },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    )
  })
})

function otpEvent(otpCode = '123456') {
  return {
    type: EMAIL_EVENT_TYPES.SEND_OTP,
    emailType: 'otp' as const,
    to: 'u@b.ai',
    firstName: 'U',
    otpCode,
    expirationMinutes: 10,
  }
}
