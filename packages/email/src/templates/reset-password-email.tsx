import { Heading, Hr, Section, Text } from '@react-email/components'
import * as React from 'react'

import { EmailButton } from '../components/email-button.js'
import { BaseLayout } from '../layouts/base-layout.js'

export type ResetPasswordEmailProps = {
  firstName: string
  resetUrl: string
  unsubscribeUrl?: string
}

const COPY = {
  previewText: 'Réinitialisation de mot de passe Bellum',
  heading: 'Réinitialisation de mot de passe Bellum',
  intro: (firstName: string): string =>
    `Bonjour ${firstName}, nous avons reçu une demande de réinitialisation de mot de passe. Si c'est bien vous, cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.`,
  cta: 'Réinitialiser mon mot de passe',
  footnote:
    "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email. Votre mot de passe restera inchangé tant que vous n'aurez pas ouvert ce lien.",
} as const

export function ResetPasswordEmail({ firstName, resetUrl, unsubscribeUrl }: ResetPasswordEmailProps) {
  return (
    <BaseLayout previewText={COPY.previewText} unsubscribeUrl={unsubscribeUrl}>
      <Heading as="h1" className="m-0 text-[28px] leading-9 font-bold text-zinc-900">
        {COPY.heading}
      </Heading>

      <Section className="pt-4">
        <Text className="m-0 text-[15px] leading-6 text-zinc-700">{COPY.intro(firstName)}</Text>
      </Section>

      <Hr className="border-0 border-t border-solid border-zinc-200 my-6" />

      <Section>
        <EmailButton href={resetUrl}>{COPY.cta}</EmailButton>
      </Section>

      <Section className="pt-6">
        <Text className="m-0 text-[14px] leading-snug text-zinc-700">{COPY.footnote}</Text>
      </Section>
    </BaseLayout>
  )
}

ResetPasswordEmail.PreviewProps = {
  firstName: 'Alex',
  resetUrl: 'https://example.com/auth/reset-password',
  unsubscribeUrl: 'https://example.com/unsubscribe',
} satisfies ResetPasswordEmailProps

export default ResetPasswordEmail
