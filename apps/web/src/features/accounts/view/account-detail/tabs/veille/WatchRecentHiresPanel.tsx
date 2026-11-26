import type { AccountRecentHires, RecentHire } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatSignalDate } from '@/lib/signal-date'

type WatchRecentHiresPanelProps = {
  data: AccountRecentHires | null
  isError: boolean
}

/**
 * #3970 (lot P07) — « qui a rejoint l'entreprise récemment, à quel rôle,
 * depuis quand — et pourquoi ça colle (ou non) à ton contexte ».
 *
 * Trois états qui ne se confondent pas : la lecture a échoué ; aucun contact
 * du compte n'a de parcours connu (« non mesuré », jamais « personne ») ; des
 * parcours examinés sans arrivée datée récente. La raison de pertinence n'est
 * écrite que si elle tranche : « non évaluable » ne fait aucune ligne.
 */
export function WatchRecentHiresPanel({ data, isError }: WatchRecentHiresPanelProps) {
  const { t } = useTranslation('accountWatch')
  return (
    <Card className="gap-0 p-5">
      <Text element="h2" size="sm" weight="semibold">
        {t('recentHires.title')}
      </Text>
      {isError || !data ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
          {isError ? t('recentHires.error') : t('recentHires.loading')}
        </Text>
      ) : data.examinedContacts === 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
          {t('recentHires.notMeasured')}
        </Text>
      ) : data.hires.length === 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
          {t('recentHires.none', { count: data.examinedContacts })}
        </Text>
      ) : (
        <>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('recentHires.scope', { count: data.examinedContacts })}
          </Text>
          <ul className="mt-3 divide-y divide-[var(--bellum-border)]">
            {data.hires.map(hire => (
              <RecentHireRow key={hire.contactId} hire={hire} />
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function RecentHireRow({ hire }: { hire: RecentHire }) {
  const { t, i18n } = useTranslation('accountWatch')
  const reason =
    hire.relevance.status === 'non_evaluable'
      ? null
      : i18n.language === 'en'
        ? hire.relevance.reasonEn
        : hire.relevance.reasonFr
  return (
    <li className="min-w-0 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <Text size="sm" weight="medium" className="break-words">
          {hire.name}
        </Text>
        <Text size="xs" className="break-words text-[var(--bellum-text-secondary)]">
          {hire.role}
        </Text>
      </div>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('recentHires.since', { date: formatSignalDate(hire.startedOn) })} · {t('recentHires.source')}
      </Text>
      {reason ? (
        <Text size="xs" className="mt-1 break-words">
          {reason}
        </Text>
      ) : null}
      {hire.email || hire.linkedinUrl ? (
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-4">
          {hire.email ? (
            <a
              href={`mailto:${hire.email}`}
              className="inline-flex min-h-11 items-center break-all text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
            >
              {hire.email}
            </a>
          ) : null}
          {hire.linkedinUrl ? (
            <a
              href={hire.linkedinUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
            >
              {t('recentHires.profile')}
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
