import { render } from '@react-email/render'
import * as React from 'react'

import { OtpEmail, type OtpEmailProps } from './templates/otp-email.js'
import { ResetPasswordEmail, type ResetPasswordEmailProps } from './templates/reset-password-email.js'
import {
  buildWeeklyDigestSubject,
  WeeklyDigestEmail,
  type WeeklyDigestEmailProps,
} from './templates/weekly-digest-email.js'
import { WelcomeEmail, type WelcomeEmailProps } from './templates/welcome-email.js'

export async function renderWelcomeEmail(props: WelcomeEmailProps) {
  const html = await render(React.createElement(WelcomeEmail, props))
  const text = await render(React.createElement(WelcomeEmail, props), { plainText: true })

  return {
    subject: `Bienvenue sur Bellum, ${props.firstName}`,
    html,
    text,
  }
}

export async function renderOtpEmail(props: OtpEmailProps) {
  const html = await render(React.createElement(OtpEmail, props))
  const text = await render(React.createElement(OtpEmail, props), { plainText: true })

  return {
    subject: 'Votre code de connexion Bellum',
    html,
    text,
  }
}

export async function renderResetPasswordEmail(props: ResetPasswordEmailProps) {
  const html = await render(React.createElement(ResetPasswordEmail, props))
  const text = await render(React.createElement(ResetPasswordEmail, props), { plainText: true })

  return {
    subject: 'Réinitialisation de mot de passe Bellum',
    html,
    text,
  }
}

/** Email digest hebdo de veille — « Votre veille de la semaine : N signaux sur
 *  M comptes ». Subject counts come from the SAME props as the body. */
export async function renderWeeklyDigestEmail(props: WeeklyDigestEmailProps) {
  const html = await render(React.createElement(WeeklyDigestEmail, props))
  const text = await render(React.createElement(WeeklyDigestEmail, props), { plainText: true })

  return {
    subject: buildWeeklyDigestSubject(props.totalSignals, props.totalAccounts, props.cadence),
    html,
    text,
  }
}
