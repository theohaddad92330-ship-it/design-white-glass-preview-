import { Heading, Hr, Section, Text } from '@react-email/components'
import * as React from 'react'

import { BaseLayout } from '../layouts/base-layout.js'

export type OtpEmailProps = {
  firstName: string
  otpCode: string
  expirationMinutes: number
  unsubscribeUrl?: string
}

const COPY = {
  previewText: 'Votre code de connexion Bellum',
  heading: 'Code de connexion à Bellum',
  intro: (firstName: string): string => `Bonjour ${firstName}, voici votre code à usage unique pour vous connecter.`,
  expiration: (minutes: number): string =>
    `Ce code expire dans ${minutes} minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email - aucune connexion n'a été faite.`,
} as const

export function OtpEmail({ firstName, otpCode, expirationMinutes, unsubscribeUrl }: OtpEmailProps) {
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
        <Text className="m-0 text-[32px] leading-10 font-semibold tracking-[8px] text-zinc-900 font-mono">
          {otpCode}
        </Text>
      </Section>

      <Hr className="border-0 border-t border-solid border-zinc-200 my-6" />

      <Section>
        <Text className="m-0 text-[14px] leading-snug text-zinc-700">{COPY.expiration(expirationMinutes)}</Text>
      </Section>
    </BaseLayout>
  )
}

OtpEmail.PreviewProps = {
  firstName: 'Alex',
  otpCode: '271904',
  expirationMinutes: 10,
  unsubscribeUrl: 'https://example.com/unsubscribe',
} satisfies OtpEmailProps

export default OtpEmail
