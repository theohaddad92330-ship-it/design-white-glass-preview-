import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { BellumEvent } from '@bellum/events'
import { type Job, type JobsOptions, type Queue } from 'bullmq'
import { createHash } from 'node:crypto'

export const EMAIL_EVENT_TYPES = {
  SEND_RESET_PASSWORD: 'send_email_reset_password',
  SEND_WELCOME: 'send_email_welcome',
  SEND_OTP: 'send_email_otp',
} as const

export type Email =
  | BellumEvent<
      typeof EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD,
      { emailType: 'reset-password'; to: string; firstName: string; resetUrl: string }
    >
  | BellumEvent<
      typeof EMAIL_EVENT_TYPES.SEND_WELCOME,
      { emailType: 'welcome'; to: string; firstName: string; dashboardUrl: string }
    >
  | BellumEvent<
      typeof EMAIL_EVENT_TYPES.SEND_OTP,
      { emailType: 'otp'; to: string; firstName: string; otpCode: string; expirationMinutes: number }
    >

/**
 * Deterministic job id per email so an accidental double-enqueue (double-clicked
 * "resend", an at-least-once caller) is de-duplicated by BullMQ instead of
 * sending twice. Keyed by the payload's unique nonce: the OTP code and the reset
 * URL (which carries a one-time token) are unique per request, so distinct
 * requests still get distinct jobs; the welcome mail is once-per-address.
 */
export function buildEmailJobId(event: Email): string {
  const digest = createHash('sha256').update(emailJobKey(event)).digest('hex').slice(0, 32)
  return `${emailJobPrefix(event)}-${digest}`
}

function emailJobKey(event: Email): string {
  switch (event.type) {
    case EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD:
      return `${event.type}|${event.to}|${event.resetUrl}`
    case EMAIL_EVENT_TYPES.SEND_OTP:
      return `${event.type}|${event.to}|${event.otpCode}`
    case EMAIL_EVENT_TYPES.SEND_WELCOME:
      return `${event.type}|${event.to}`
  }
}

function emailJobPrefix(event: Email): string {
  switch (event.type) {
    case EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD:
      return 'reset'
    case EMAIL_EVENT_TYPES.SEND_OTP:
      return 'otp'
    case EMAIL_EVENT_TYPES.SEND_WELCOME:
      return 'welcome'
  }
}

@Injectable()
export class MailerQueue {
  constructor(@InjectQueue('mailer') private readonly queue: Queue) {}

  add(event: Email): Promise<Job<Email>> {
    const options: JobsOptions = {
      jobId: buildEmailJobId(event),
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    }

    return this.queue.add(event.type, event, options)
  }
}
