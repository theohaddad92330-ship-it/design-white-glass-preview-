import { newEmailSenderWorker } from './email-sender.worker'

describe('newEmailSenderWorker', () => {
  it('enqueues reset-password event through queue', async () => {
    const add = jest.fn().mockResolvedValue(undefined)
    const worker = newEmailSenderWorker({ add } as never)

    await worker.sendResetPasswordEmail({ to: 'u@b.ai', firstName: 'U', resetUrl: 'https://x' })

    expect(add).toHaveBeenCalledWith({
      type: 'send_email_reset_password',
      emailType: 'reset-password',
      to: 'u@b.ai',
      firstName: 'U',
      resetUrl: 'https://x',
    })
  })
})
