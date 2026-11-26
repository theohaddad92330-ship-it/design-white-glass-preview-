import type { Account, Contact } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { distinctWatchEvents } from '@/features/accounts/model/watchEvents'
import { buildAccountWatchData } from '@/features/accounts/model/watchData'
import { useCrmPresence } from '@/features/crm/hooks/useCrmPresence'
import { buildKnownAccountValue } from './knownAccountValue'

/**
 * #2556 — le bloc « Ce que BellumAI ajoute à ce que tu sais » sur un compte
 * que le CRM branché connaît déjà. Voir `knownAccountValue.ts` pour ce qui est
 * lu et pourquoi une absence ne fait aucune ligne. Rien à ajouter ⇒ rien.
 * En démonstration, le CRM fictif répond pour les dossiers semés
 * (`demoCrmPresence`, apps/api).
 */
export function KnownAccountValueCard({
  account,
  contacts,
  signalsListedBelow = false,
}: {
  account: Account
  contacts: readonly Contact[]
  /** #4022.1 — les cartes de signaux sont sur le même écran : la synthèse COMPTE et y renvoie, sans répéter l'intitulé. */
  signalsListedBelow?: boolean
}) {
  const { t, i18n } = useTranslation('accountDetail')
  const { data: presence } = useCrmPresence({
    companyName: account.company_name,
    website: account.website,
    siren: account.siren,
  })
  // Les signaux ne se lisent que sur un compte que le CRM CONNAÎT : sans lui, rien à comparer.
  const known = Boolean(presence?.provider && presence.matched)
  const signals = useMemo(
    () => (known ? distinctWatchEvents(buildAccountWatchData(account).signals) : []),
    [account, known],
  )
  // Recette 21/10 K3 — les offres déjà listées dans « Signaux de recrutement » ne se répètent pas ici.
  const listedOfferTitles = useMemo(
    () =>
      (
        ((account.raw_analysis as Record<string, unknown> | null)?.['it_job_signals'] as
          | Array<{ title?: string | null }>
          | undefined) ?? []
      ).flatMap(job => (job?.title ? [job.title] : [])),
    [account],
  )
  const value = useMemo(
    () => buildKnownAccountValue({ presence, contacts, signals, listedOfferTitles }),
    [presence, contacts, signals, listedOfferTitles],
  )
  if (!value) return null

  const since = value.lastActivityAt ? new Date(value.lastActivityAt).toLocaleDateString(i18n.language) : null

  return (
    <section
      data-testid="known-account-value"
      aria-labelledby="known-account-value-title"
      className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
    >
      <Text
        element="h3"
        size="sm"
        weight="semibold"
        id="known-account-value-title"
        className="text-[var(--bellum-text-primary)]"
      >
        {t('knownAccountValue.title')}
      </Text>
      <ul className="space-y-1 text-sm text-[var(--bellum-text-secondary)]">
        {value.newSignals.length > 0 && since ? (
          <li>
            {signalsListedBelow
              ? t('knownAccountValue.newSignalsCounted', { count: value.newSignals.length, date: since })
              : t('knownAccountValue.newSignals', {
                  count: value.newSignals.length,
                  date: since,
                  signals: value.newSignals.slice(0, 3).join(' · '),
                })}
            {/* #3925 — l'offre / l'article cité porte son lien, même composant que la veille.
                #4022.1 — sur la veille c'est la carte qui le porte : une offre = une occurrence. */}
            {!signalsListedBelow && value.newSignalSources.length > 0 ? (
              <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {value.newSignalSources.map(source => (
                  <SignalSourceLink key={source.url} url={source.url} sourceKind={source.sourceKind} />
                ))}
              </span>
            ) : null}
          </li>
        ) : null}
        {value.contactsNotInCrm ? (
          <li>
            {t('knownAccountValue.contactsNotInCrm', {
              count: value.contactsNotInCrm.count,
              names: value.contactsNotInCrm.names.join(', '),
            })}
          </li>
        ) : null}
      </ul>
    </section>
  )
}
