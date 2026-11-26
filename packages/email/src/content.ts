export type WelcomeContentInput = {
  firstName: string
  dashboardUrl: string
}

export type OtpContentInput = {
  firstName: string
  otpCode: string
  expirationMinutes: number
}

export type ResetPasswordContentInput = {
  firstName: string
  resetUrl: string
}

export function buildWelcomeContent(input: WelcomeContentInput) {
  return {
    subject: `Bienvenue sur Bellum, ${input.firstName}`,
    text: `Votre compte est prêt. Accédez à votre dashboard : ${input.dashboardUrl}`,
    html: `<p>Votre compte est prêt.</p><p><a href="${input.dashboardUrl}">Accéder au dashboard</a></p>`,
  }
}

export function buildOtpContent(input: OtpContentInput) {
  return {
    subject: 'Votre code de connexion Bellum',
    text: `Bonjour ${input.firstName}, votre code OTP est ${input.otpCode}. Il expire dans ${input.expirationMinutes} minutes.`,
    html: `<p>Bonjour ${input.firstName},</p><p>Votre code OTP : <strong>${input.otpCode}</strong> (expire dans ${input.expirationMinutes} minutes)</p>`,
  }
}

export function buildResetPasswordContent(input: ResetPasswordContentInput) {
  return {
    subject: 'Réinitialisation de mot de passe Bellum',
    text: `Bonjour ${input.firstName}, réinitialisez votre mot de passe ici : ${input.resetUrl}`,
    html: `<p>Bonjour ${input.firstName},</p><p><a href="${input.resetUrl}">Réinitialiser mon mot de passe</a></p>`,
  }
}
