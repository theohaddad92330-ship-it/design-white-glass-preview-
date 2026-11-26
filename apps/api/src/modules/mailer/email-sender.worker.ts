import { EMAIL_EVENT_TYPES, type MailerQueue } from './mailer.queue'

export type EmailSenderWorker = {
  sendResetPasswordEmail: (input: { to: string; firstName: string; resetUrl: string }) => Promise<void>
  sendWelcomeEmail: (input: { to: string; firstName: string; dashboardUrl: string }) => Promise<void>
  sendOtpEmail: (input: { to: string; firstName: string; otpCode: string; expirationMinutes: number }) => Promise<void>
}

export function newEmailSenderWorker(mailerQueue: MailerQueue): EmailSenderWorker {
  return {
    sendResetPasswordEmail: async input => {
      await mailerQueue.add({ type: EMAIL_EVENT_TYPES.SEND_RESET_PASSWORD, emailType: 'reset-password', ...input })
    },
    sendWelcomeEmail: async input => {
      await mailerQueue.add({ type: EMAIL_EVENT_TYPES.SEND_WELCOME, emailType: 'welcome', ...input })
    },
    sendOtpEmail: async input => {
      await mailerQueue.add({ type: EMAIL_EVENT_TYPES.SEND_OTP, emailType: 'otp', ...input })
    },
  }
}
