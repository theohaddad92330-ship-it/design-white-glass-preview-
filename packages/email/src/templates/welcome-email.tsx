import { Heading, Hr, Section, Text } from '@react-email/components'
import * as React from 'react'

import { EmailButton } from '../components/email-button.js'
import { BaseLayout } from '../layouts/base-layout.js'

export type WelcomeEmailProps = {
  firstName: string
  dashboardUrl: string
  unsubscribeUrl?: string
}

const COPY = {
  previewText: 'Bienvenue sur Bellum',
  heading: (firstName: string): string => `Bienvenue sur Bellum, ${firstName}.`,
  body: 'Votre compte est prêt. Vous pouvez dès maintenant analyser un compte cible et générer votre premier dossier de conquête.',
  cta: 'Accéder au dashboard',
} as const

export function WelcomeEmail({ firstName, dashboardUrl, unsubscribeUrl }: WelcomeEmailProps) {
  return (
    <BaseLayout previewText={COPY.previewText} unsubscribeUrl={unsubscribeUrl}>
      <Heading as="h1" className="m-0 text-[28px] leading-9 font-bold text-zinc-900">
        {COPY.heading(firstName)}
      </Heading>

      <Hr className="border-0 border-t border-solid border-zinc-200 my-6" />

      <Section>
        <Text className="m-0 text-[15px] leading-6 text-zinc-700">{COPY.body}</Text>
      </Section>

      <Section className="pt-6">
        <EmailButton href={dashboardUrl}>{COPY.cta}</EmailButton>
      </Section>
    </BaseLayout>
  )
}

WelcomeEmail.PreviewProps = {
  firstName: 'Alex',
  dashboardUrl: 'https://example.com/dashboard',
  unsubscribeUrl: 'https://example.com/unsubscribe',
} satisfies WelcomeEmailProps

export default WelcomeEmail
