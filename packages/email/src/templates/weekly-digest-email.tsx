import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import * as React from 'react'

import { EmailButton } from '../components/email-button.js'
import { BaseLayout } from '../layouts/base-layout.js'

/** One real, dated signal from the veille of a followed account. Every field
 *  comes straight from the persisted analysis data — nothing is invented. */
export type WeeklyDigestSignal = {
  label: string
  /** Date-ish string as persisted ("2026-07-14", "2026-07"…). Shown as-is. */
  date?: string | null
  /** Source as persisted ("Les Échos", "BODACC"…). Omitted when unknown. */
  source?: string | null
}

export type WeeklyDigestAccount = {
  companyName: string
  /** Deep link to the dossier (`/accounts/:id`). */
  accountUrl: string
  signals: WeeklyDigestSignal[]
  /** Count of additional weekly signals beyond the displayed cap. */
  extraSignals?: number
}

/** Cadence du digest de veille. `weekly` = comportement historique (byte-identique
 *  quand le champ est absent) ; `daily` adapte les libellés « de la semaine » →
 *  « du jour ». */
export type DigestCadence = 'weekly' | 'daily'

export type WeeklyDigestEmailProps = {
  firstName?: string | null
  /** Total weekly signals across all accounts (incl. beyond display caps). */
  totalSignals: number
  /** Total accounts with at least one weekly signal. */
  totalAccounts: number
  accounts: WeeklyDigestAccount[]
  dashboardUrl: string
  /** `/settings/notifications` — where the `weekly_digest` toggle lives. */
  settingsUrl: string
  unsubscribeUrl?: string
  /** Absent = `weekly` (rétro-compat) ; `daily` bascule les libellés de période. */
  cadence?: DigestCadence
}

const plural = (n: number, singular: string, pluralForm: string): string => (n > 1 ? pluralForm : singular)

/** Libellés de période par cadence — le SEUL point qui diffère entre le digest
 *  hebdo et quotidien (mêmes signaux, même mise en page, même règle « rien
 *  d'inventé »). */
const PERIOD: Record<DigestCadence, { titleSuffix: string; window: string; rhythm: string }> = {
  weekly: { titleSuffix: 'de la semaine', window: 'cette semaine', rhythm: 'chaque lundi' },
  daily: { titleSuffix: 'du jour', window: "aujourd'hui", rhythm: 'chaque matin' },
}

/**
 * All user-facing strings live here (FR today), keyed and parameterised so a
 * future i18n pass only swaps this object for a locale lookup.
 */
const copyFor = (cadence: DigestCadence) => {
  const period = PERIOD[cadence]
  return {
    subject: (totalSignals: number, totalAccounts: number): string =>
      `Votre veille ${period.titleSuffix} : ${totalSignals} ${plural(totalSignals, 'signal', 'signaux')} sur ${totalAccounts} ${plural(totalAccounts, 'compte', 'comptes')}`,
    previewText: (totalSignals: number): string =>
      `${totalSignals} ${plural(totalSignals, 'nouveau signal', 'nouveaux signaux')} sur vos comptes suivis ${period.window}.`,
    heading: `Votre veille ${period.titleSuffix}`,
    intro: (firstName: string | null | undefined, totalSignals: number, totalAccounts: number): string => {
      const hello = firstName ? `Bonjour ${firstName}, ` : ''
      return `${hello}${totalSignals} ${plural(totalSignals, 'signal a été détecté', 'signaux ont été détectés')} ${period.window} sur ${totalAccounts} de vos ${plural(totalAccounts, 'compte suivi', 'comptes suivis')}.`
    },
    openAccount: 'Ouvrir le dossier →',
    extraSignals: (n: number): string => `+ ${n} ${plural(n, 'autre signal', 'autres signaux')} ${period.window}`,
    cta: 'Voir tous mes signaux',
    footnote: `Vous recevez cette veille ${period.rhythm} pour vos comptes suivis.`,
    manageSettings: 'Gérer mes notifications',
  } as const
}

/** Subject line shared by the renderer and the API (in-app mirror + tests).
 *  `cadence` absent = hebdo (rétro-compat). */
export function buildWeeklyDigestSubject(
  totalSignals: number,
  totalAccounts: number,
  cadence: DigestCadence = 'weekly',
): string {
  return copyFor(cadence).subject(totalSignals, totalAccounts)
}

/** " — date · source" metadata suffix; only what is actually known. */
function signalMeta(signal: WeeklyDigestSignal): string {
  const parts = [signal.date, signal.source].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  )
  return parts.join(' · ')
}

export function WeeklyDigestEmail({
  firstName,
  totalSignals,
  totalAccounts,
  accounts,
  dashboardUrl,
  settingsUrl,
  unsubscribeUrl,
  cadence = 'weekly',
}: WeeklyDigestEmailProps) {
  const COPY = copyFor(cadence)
  return (
    <BaseLayout previewText={COPY.previewText(totalSignals)} unsubscribeUrl={unsubscribeUrl}>
      <Heading as="h1" className="m-0 text-[28px] leading-9 font-bold text-zinc-900">
        {COPY.heading}
      </Heading>

      <Section className="pt-4">
        <Text className="m-0 text-[15px] leading-6 text-zinc-700">
          {COPY.intro(firstName, totalSignals, totalAccounts)}
        </Text>
      </Section>

      <Hr className="border-0 border-t border-solid border-zinc-200 my-6" />

      {accounts.map(account => (
        <Section key={account.accountUrl} className="pb-5">
          <Text className="m-0 text-[16px] leading-6 font-semibold text-zinc-900">{account.companyName}</Text>

          {account.signals.map((signal, index) => {
            const meta = signalMeta(signal)
            return (
              <Text key={index} className="m-0 pt-2 text-[14px] leading-5 text-zinc-700">
                {signal.label}
                {meta ? <span className="text-[12px] text-zinc-500">{` — ${meta}`}</span> : null}
              </Text>
            )
          })}

          {account.extraSignals && account.extraSignals > 0 ? (
            <Text className="m-0 pt-2 text-[13px] leading-5 text-zinc-500">
              {COPY.extraSignals(account.extraSignals)}
            </Text>
          ) : null}

          <Text className="m-0 pt-2 text-[13px] leading-5">
            <Link href={account.accountUrl} className="text-violet-500 no-underline">
              {COPY.openAccount}
            </Link>
          </Text>
        </Section>
      ))}

      <Section className="pt-2">
        <EmailButton href={dashboardUrl}>{COPY.cta}</EmailButton>
      </Section>

      <Section className="pt-6">
        <Text className="m-0 text-[13px] leading-5 text-zinc-500">
          {COPY.footnote}{' '}
          <Link href={settingsUrl} className="text-zinc-500 underline">
            {COPY.manageSettings}
          </Link>
        </Text>
      </Section>
    </BaseLayout>
  )
}

WeeklyDigestEmail.PreviewProps = {
  firstName: 'Alex',
  totalSignals: 4,
  totalAccounts: 2,
  accounts: [
    {
      companyName: 'Doctolib',
      accountUrl: 'https://example.com/accounts/1',
      signals: [
        { label: 'Levée de fonds de 500 M€ pour accélérer sur l’IA santé', date: '2026-07-13', source: 'Les Échos' },
        { label: 'Recrutement d’un Head of Data Platform', date: '2026-07-12', source: 'France Travail' },
      ],
      extraSignals: 1,
    },
    {
      companyName: 'Veolia',
      accountUrl: 'https://example.com/accounts/2',
      signals: [{ label: 'Appel d’offres — refonte du SI RH (CPV 72xx)', date: '2026-07-10', source: 'BOAMP' }],
    },
  ],
  dashboardUrl: 'https://example.com/dashboard',
  settingsUrl: 'https://example.com/settings/notifications',
  unsubscribeUrl: 'https://example.com/unsubscribe',
} satisfies WeeklyDigestEmailProps

export default WeeklyDigestEmail
