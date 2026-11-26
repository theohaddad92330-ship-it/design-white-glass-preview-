import { BadRequestException } from '@nestjs/common'
import { MailerController } from './mailer.controller'
import type { MailerService } from './mailer.service'

describe('MailerController', () => {
  let service: { sendTestMail: jest.Mock }
  let controller: MailerController

  beforeEach(() => {
    service = { sendTestMail: jest.fn() }
    controller = new MailerController(service as unknown as MailerService)
  })

  it('throws BadRequest when `to` is missing', async () => {
    await expect(controller.sendTestEmail({})).rejects.toBeInstanceOf(BadRequestException)
    expect(service.sendTestMail).not.toHaveBeenCalled()
  })

  it('throws BadRequest when `to` has no @', async () => {
    await expect(controller.sendTestEmail({ to: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException)
    expect(service.sendTestMail).not.toHaveBeenCalled()
  })

  it('forwards `to` and `subject` to the service when valid', async () => {
    service.sendTestMail.mockResolvedValue({ messageId: 'abc-123' })

    const result = await controller.sendTestEmail({ to: 'user@bellum.test', subject: 'Hello' })

    expect(service.sendTestMail).toHaveBeenCalledWith({ to: 'user@bellum.test', subject: 'Hello' })
    expect(result).toEqual({ status: 'queued', messageId: 'abc-123' })
  })

  it('passes `subject: undefined` when not provided (service applies its own default)', async () => {
    service.sendTestMail.mockResolvedValue({ messageId: 'def-456' })

    const result = await controller.sendTestEmail({ to: 'user@bellum.test' })

    expect(service.sendTestMail).toHaveBeenCalledWith({ to: 'user@bellum.test', subject: undefined })
    expect(result).toEqual({ status: 'queued', messageId: 'def-456' })
  })

  it('propagates service errors instead of swallowing them', async () => {
    service.sendTestMail.mockRejectedValue(new Error('Mailpit API error (502)'))

    await expect(controller.sendTestEmail({ to: 'user@bellum.test' })).rejects.toThrow('Mailpit API error (502)')
  })
})
